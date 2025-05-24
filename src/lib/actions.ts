
'use server';

import { revalidatePath } from 'next/cache';
import type { BoardGame, Review, Rating as RatingType, BggSearchResult, AugmentedReview, UserProfile, BggPlayDetail, BggPlayerInPlay, AugmentedReviewWithGame, AugmentedBggPlayDetail, EarnedBadge } from './types';
import { db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
  where,
  limit,
  addDoc,
  updateDoc,
  type QueryDocumentSnapshot,
  type DocumentData,
  getCountFromServer,
  startAfter,
  endBefore,
  limitToLast,
  collectionGroup,
  type Timestamp,
  or,
  and,
  arrayUnion,
  arrayRemove,
  increment,
  type DocumentReference,
  serverTimestamp,
} from 'firebase/firestore';
import { calculateCategoryAverages as calculateCatAvgsFromUtils, calculateOverallCategoryAverage as calculateGlobalOverallAverage, formatPlayDate } from './utils';


const BGG_API_BASE_URL = 'https://boardgamegeek.com/xmlapi2';
const FIRESTORE_COLLECTION_NAME = 'boardgames_collection';
const USER_PROFILES_COLLECTION = 'user_profiles';

function decodeHtmlEntities(text: string): string {
    if (typeof text !== 'string') return '';
    return text.replace(/&quot;/g, '"')
               .replace(/&apos;/g, "'")
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&amp;/g, '&')
               .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
               .replace(/&ndash;/g, "–")
               .replace(/&mdash;/g, "—")
               .replace(/&rsquo;/g, "’");
}

function parseBggCollectionXml(xmlText: string): BoardGame[] {
  const games: BoardGame[] = [];
  const processedBggIds = new Set<number>();
  const itemMatches = xmlText.matchAll(/<item[^>]*objectid="(\d+)"(?:[^>]*)?>([\s\S]*?)<\/item>/gi);

  for (const itemMatch of itemMatches) {
      const bggId = parseInt(itemMatch[1], 10);
      if (isNaN(bggId) || processedBggIds.has(bggId)) {
          continue;
      }

      const itemContent = itemMatch[2];
      const subtypeMatch = /<subtype\s+value="boardgame"\s*\/?>/i.exec(itemContent) || /subtype="boardgame"/i.exec(itemMatch[0]);
      if (!subtypeMatch) {
          continue;
      }
      processedBggIds.add(bggId);

      let name = '';
      const primaryNameMatch = /<name sortindex="1"[^>]*>([\s\S]*?)<\/name>/.exec(itemContent);
      if (primaryNameMatch && primaryNameMatch[1] && primaryNameMatch[1].trim()) {
          name = decodeHtmlEntities(primaryNameMatch[1].trim());
      } else {
          const anyNameMatch = /<name[^>]*>([\s\S]*?)<\/name>/.exec(itemContent);
          if (anyNameMatch && anyNameMatch[1] && anyNameMatch[1].trim()) {
              name = decodeHtmlEntities(anyNameMatch[1].trim());
          }
      }
       if (!name || name.trim() === "" || name.startsWith("BGG Gioco ID")) {
          name = `BGG Gioco ID ${bggId}`;
      }


      let yearPublished: number | undefined;
      const yearMatch = /<yearpublished>(\d+)<\/yearpublished>/.exec(itemContent);
      if (yearMatch && yearMatch[1]) {
          yearPublished = parseInt(yearMatch[1], 10);
      }

      let thumbnail = '';
      const thumbnailMatch = /<thumbnail>([\s\S]*?)<\/thumbnail>/.exec(itemContent);
      if (thumbnailMatch && thumbnailMatch[1]) {
          thumbnail = decodeHtmlEntities(thumbnailMatch[1].trim());
          if (thumbnail.startsWith('//')) {
              thumbnail = `https:${thumbnail}`;
          }
      }
      const coverArtUrl = thumbnail || `https://placehold.co/100x150.png?text=${encodeURIComponent(name.substring(0,10))}`;

      let minPlayers: number | undefined, maxPlayers: number | undefined, playingTime: number | undefined;
      const minPRegex = /<stats[^>]*minplayers="(\d+)"/;
      const minPMatch = minPRegex.exec(itemContent);
      if (minPMatch && minPMatch[1]) minPlayers = parseInt(minPMatch[1], 10);

      const maxPRegex = /<stats[^>]*maxplayers="(\d+)"/;
      const maxPMatch = maxPRegex.exec(itemContent);
      if (maxPMatch && maxPMatch[1]) maxPlayers = parseInt(maxPMatch[1], 10);

      const playTRegex = /<stats[^>]*playingtime="(\d+)"/;
      const playTMatch = playTRegex.exec(itemContent);
      if (playTMatch && playTMatch[1]) playingTime = parseInt(playTMatch[1], 10);

      let lctr01PlaysCount: number | null = null;
      const numPlaysMatch = /<numplays>(\d+)<\/numplays>/i.exec(itemContent);
      if (numPlaysMatch && numPlaysMatch[1]) {
          lctr01PlaysCount = parseInt(numPlaysMatch[1], 10);
          if (isNaN(lctr01PlaysCount)) lctr01PlaysCount = null;
      }

      games.push({
          id: `bgg-${bggId}`,
          bggId,
          name,
          yearPublished: yearPublished === undefined ? null : yearPublished,
          coverArtUrl,
          minPlayers: minPlayers ?? null,
          maxPlayers: maxPlayers ?? null,
          playingTime: playingTime ?? null,
          minPlaytime: null,
          maxPlaytime: null,
          averageWeight: null,
          bggAverageRating: null,
          categories: [],
          mechanics: [],
          designers: [],
          reviews: [],
          isPinned: false,
          overallAverageRating: null,
          voteCount: 0,
          favoritedByUserIds: [],
          favoriteCount: 0,
          playlistedByUserIds: [],
          morchiaByUserIds: [],
          morchiaCount: 0,
          lctr01Plays: lctr01PlaysCount,
      });
  }
  return games;
}

function parseBggThingXmlToBoardGame(xmlText: string, bggIdInput: number): Partial<BoardGame> {
    const gameData: Partial<BoardGame> = { bggId: bggIdInput };

    // Helper function to parse numeric values robustly
    const parseNumericValueHelper = (regex: RegExp, textToSearch: string, isFloat = false): number | null => {
        const match = regex.exec(textToSearch);
        if (match && match[1]) {
            const numStr = match[1];
            const num = isFloat ? parseFloat(numStr) : parseInt(numStr, 10);
            return isNaN(num) ? null : num;
        }
        return null;
    };

    gameData.name = decodeHtmlEntities((/<name\s+type="primary"(?:[^>]*?\s)?value="([^"]+)"(?:[^>]*)?\/>/i.exec(xmlText) || /<name(?:[^>]*)value="([^"]+)"(?:[^>]*)?\/>/i.exec(xmlText) || [])[1]?.trim() || `Name Not Found in Details`);
    if (gameData.name === `Name Not Found in Details` || gameData.name.trim() === "") {
        gameData.name = `BGG ID ${bggIdInput}`;
    }

    let coverArt = '';
    const imageMatch = /<image>([\s\S]*?)<\/image>/i.exec(xmlText);
    if (imageMatch && imageMatch[1]) {
        coverArt = decodeHtmlEntities(imageMatch[1].trim());
    } else {
        const thumbnailMatch = /<thumbnail>([\s\S]*?)<\/thumbnail>/i.exec(xmlText);
        if (thumbnailMatch && thumbnailMatch[1]) {
            coverArt = decodeHtmlEntities(thumbnailMatch[1].trim());
        }
    }
    if (coverArt && coverArt.startsWith('//')) {
        coverArt = `https:${coverArt}`;
    }
    gameData.coverArtUrl = coverArt || `https://placehold.co/400x600.png?text=${encodeURIComponent(gameData.name || 'Game')}`;

    gameData.yearPublished = parseNumericValueHelper(/<yearpublished(?:[^>]*?\s)?value="(\d+)"[^>]*\/?>/i, xmlText);
    gameData.minPlayers = parseNumericValueHelper(/<minplayers(?:[^>]*?\s)?value="(\d+)"[^>]*\/?>/i, xmlText);
    gameData.maxPlayers = parseNumericValueHelper(/<maxplayers(?:[^>]*?\s)?value="(\d+)"[^>]*\/?>/i, xmlText);
    gameData.playingTime = parseNumericValueHelper(/<playingtime(?:[^>]*?\s)?value="(\d+)"[^>]*\/?>/i, xmlText);
    gameData.minPlaytime = parseNumericValueHelper(/<minplaytime(?:[^>]*?\s)?value="(\d+)"[^>]*\/?>/i, xmlText);
    gameData.maxPlaytime = parseNumericValueHelper(/<maxplaytime(?:[^>]*?\s)?value="(\d+)"[^>]*\/?>/i, xmlText);
    
    const averageWeightMatch = /<averageweight\s+value="([\d\.]+)"\s*\/?>/i.exec(xmlText);
    if (averageWeightMatch && averageWeightMatch[1]) {
        const parsedWeight = parseFloat(averageWeightMatch[1]);
        gameData.averageWeight = isNaN(parsedWeight) ? null : parsedWeight;
    } else {
        gameData.averageWeight = null;
    }
    // console.log(`[BGG PARSE - Game ${bggIdInput}] Raw averageweight match:`, averageWeightMatch ? averageWeightMatch[1] : 'No match', 'Parsed:', gameData.averageWeight);


    const bggAverageRatingRegex = /<ratings>[\s\S]*?<average\s+value="([\d\.]+)"[^>]*\/?>[\s\S]*?<\/ratings>/i;
    const bggAverageRatingRawMatch = bggAverageRatingRegex.exec(xmlText);
    if (bggAverageRatingRawMatch && bggAverageRatingRawMatch[1]) {
        const parsedValue = parseFloat(bggAverageRatingRawMatch[1]);
        gameData.bggAverageRating = isNaN(parsedValue) ? null : parsedValue;
        // console.log(`[BGG PARSE - Game ${bggIdInput}] Matched <average value="${bggAverageRatingRawMatch[1]}" />. Parsed bggAverageRating: ${gameData.bggAverageRating}`);
    } else {
        // console.log(`[BGG PARSE - Game ${bggIdInput}] No match found for <average value="X.X"> within <ratings>. bggAverageRating set to null.`);
        gameData.bggAverageRating = null;
    }
    
    const parseLinks = (type: string): string[] => {
      const values: string[] = [];
      const linkRegex = new RegExp(`<link\\s+type="${type}"(?:[^>]*?)value="([^"]+)"(?:[^>]*)?\\/>`, "gi");
      let match;
      while ((match = linkRegex.exec(xmlText)) !== null) {
        if (match[1]) {
          values.push(decodeHtmlEntities(match[1].trim()));
        }
      }
      return values;
    };
    gameData.categories = parseLinks("boardgamecategory");
    gameData.mechanics = parseLinks("boardgamemechanic");
    gameData.designers = parseLinks("boardgamedesigner");

    // console.log(`[BGG PARSE - Game ${bggIdInput}] Parsed Game Data:`, gameData);
    return gameData;
}

async function fetchWithRetry(url: string, retries = 3, delay = 1500, attempt = 1): Promise<string> {
  // console.log(`[FetchWithRetry Attempt ${attempt}] Fetching URL: ${url}`);
  try {
      const response = await fetch(url, { cache: 'no-store' });
      const responseText = await response.text();
      // console.log(`[FetchWithRetry Attempt ${attempt}] Status: ${response.status} for URL: ${url}`);

      if (response.status === 200) {
          const isLikelyValidResponse = responseText.includes('<items') || responseText.includes("<item ") || responseText.includes("<plays") || responseText.includes("<play ");
          const isThingResponse = url.includes("/thing?");
          const isAcceptedMessage = responseText.includes("<message>Your request for task processing has been accepted</message>");

          if (isAcceptedMessage && attempt < retries) {
              // console.log(`[FetchWithRetry Attempt ${attempt}] BGG accepted request, retrying in ${Math.min(delay * attempt, 6000)}ms...`);
              await new Promise(resolve => setTimeout(resolve, Math.min(delay * attempt, 6000)));
              return fetchWithRetry(url, retries, delay, attempt + 1);
          }
          if(!isThingResponse && !isLikelyValidResponse && !responseText.includes("<error>") && attempt < retries && !isAcceptedMessage) {
              // console.warn(`[FetchWithRetry Attempt ${attempt}] Response for non-thing URL doesn't look valid, retrying...`);
              await new Promise(resolve => setTimeout(resolve, Math.min(delay * attempt, 6000)));
              return fetchWithRetry(url, retries, delay, attempt + 1);
          }
          if(responseText.includes("<error>")){
              // console.error(`[FetchWithRetry Attempt ${attempt}] BGG API returned an error: ${responseText.substring(0, 200)}`);
              throw new Error(`BGG API returned an error: ${responseText.substring(0, 200)}`);
          }
          return responseText;
      } else if (response.status === 202 && attempt < retries) {
          // console.log(`[FetchWithRetry Attempt ${attempt}] BGG status 202, retrying in ${Math.min(delay * attempt, 6000)}ms...`);
          await new Promise(resolve => setTimeout(resolve, Math.min(delay * attempt, 6000)));
          return fetchWithRetry(url, retries, delay, attempt + 1);
      } else if (response.status !== 200 && response.status !== 202) {
          // console.error(`[FetchWithRetry Attempt ${attempt}] BGG API Error: Status ${response.status} for URL ${url}. Response: ${responseText.substring(0,500)}`);
          throw new Error(`BGG API Error: Status ${response.status} for URL ${url}. Response: ${responseText.substring(0,500)}`);
      } else {
          // console.error(`[FetchWithRetry Attempt ${attempt}] BGG API did not return success status after ${retries} retries for URL ${url}. Final status: ${response.status}`);
          throw new Error(`BGG API did not return success status after ${retries} retries for URL ${url}. Final status: ${response.status}`);
      }
  } catch (error) {
    let isBggApiError = false;
    let errorMessage = String(error);
    if (error instanceof Error) {
        errorMessage = error.message;
        if (errorMessage.startsWith("BGG API Error:") || errorMessage.startsWith("BGG API returned an error:")) {
            isBggApiError = true;
        }
    }
    // console.error(`[FetchWithRetry Attempt ${attempt}] Error fetching BGG data for ${url}:`, errorMessage);

    if (isBggApiError) {
        throw error; // Re-throw BGG specific errors directly
    } else if (attempt < retries) {
        // console.log(`[FetchWithRetry Attempt ${attempt}] Network/unexpected error, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay)); // General retry for network issues
        return fetchWithRetry(url, retries, delay, attempt + 1);
    } else {
        // console.error(`[FetchWithRetry Attempt ${attempt}] Final attempt failed for ${url}. Error:`, errorMessage);
        throw new Error(`Network or unexpected error fetching BGG data for ${url} after ${retries} attempts: ${errorMessage}`);
    }
  }
}

export async function getGameDetails(gameId: string): Promise<BoardGame | null> {
  try {
    const gameDocRef = doc(db, FIRESTORE_COLLECTION_NAME, gameId);
    const docSnap = await getDoc(gameDocRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      if (!data) {
          return null;
      }

      let reviews: Review[] = [];
      try {
        const reviewsCollectionRef = collection(db, FIRESTORE_COLLECTION_NAME, gameId, 'reviews');
        const reviewsQuery = query(reviewsCollectionRef, orderBy("date", "desc"));
        const reviewsSnapshot = await getDocs(reviewsQuery);
        reviews = reviewsSnapshot.docs.map(reviewDoc => {
          const reviewData = reviewDoc.data();
          const rating: RatingType = {
            excitedToReplay: reviewData.rating?.excitedToReplay ?? 5,
            mentallyStimulating: reviewData.rating?.mentallyStimulating ?? 5,
            fun: reviewData.rating?.fun ?? 5,
            decisionDepth: reviewData.rating?.decisionDepth ?? 5,
            replayability: reviewData.rating?.replayability ?? 5,
            luck: reviewData.rating?.luck ?? 5,
            lengthDowntime: reviewData.rating?.lengthDowntime ?? 5,
            graphicDesign: reviewData.rating?.graphicDesign ?? 5,
            componentsThemeLore: reviewData.rating?.componentsThemeLore ?? 5,
            effortToLearn: reviewData.rating?.effortToLearn ?? 5,
            setupTeardown: reviewData.rating?.setupTeardown ?? 5,
          };
          return {
            id: reviewDoc.id,
            author: reviewData.author || 'Autore Sconosciuto',
            userId: reviewData.userId || 'unknown_user_id',
            authorPhotoURL: reviewData.authorPhotoURL || null,
            rating: rating,
            comment: reviewData.comment || '',
            date: reviewData.date || new Date().toISOString(),
          };
        });
      } catch (reviewError) {
          // console.warn(`Warning: Could not fetch reviews for game ${gameId}:`, reviewError);
      }

      let lctr01PlayDetails: BggPlayDetail[] = [];
      try {
        const playsCollectionRef = collection(db, FIRESTORE_COLLECTION_NAME, gameId, 'plays_lctr01');
        const playsQuery = query(playsCollectionRef, orderBy("date", "desc"));
        const playsSnapshot = await getDocs(playsQuery);
        lctr01PlayDetails = playsSnapshot.docs.map(playDoc => playDoc.data() as BggPlayDetail);
      } catch (playError) {
         // console.warn(`Warning: Could not fetch plays for game ${gameId}:`, playError);
      }

      const game: BoardGame = {
        id: gameId,
        name: data.name || `Gioco ${gameId} (DB)`,
        coverArtUrl: data.coverArtUrl || `https://placehold.co/240x360.png?text=${encodeURIComponent(data.name || gameId || 'N/A')}`,
        bggId: typeof data.bggId === 'number' ? data.bggId : 0,
        yearPublished: data.yearPublished ?? null,
        minPlayers: data.minPlayers ?? null,
        maxPlayers: data.maxPlayers ?? null,
        playingTime: data.playingTime ?? null,
        minPlaytime: data.minPlaytime ?? null,
        maxPlaytime: data.maxPlaytime ?? null,
        averageWeight: data.averageWeight ?? null,
        bggAverageRating: data.bggAverageRating === undefined ? null : data.bggAverageRating,
        categories: data.categories ?? [],
        mechanics: data.mechanics ?? [],
        designers: data.designers ?? [],
        reviews: reviews,
        isPinned: data.isPinned || false,
        overallAverageRating: data.overallAverageRating === undefined ? null : data.overallAverageRating,
        voteCount: data.voteCount === undefined ? reviews.length : data.voteCount,
        favoritedByUserIds: data.favoritedByUserIds ?? [],
        favoriteCount: data.favoriteCount ?? 0,
        playlistedByUserIds: data.playlistedByUserIds ?? [],
        morchiaByUserIds: data.morchiaByUserIds ?? [],
        morchiaCount: data.morchiaCount ?? 0,
        lctr01Plays: lctr01PlayDetails.length > 0 ? lctr01PlayDetails.length : (data.lctr01Plays ?? 0),
        lctr01PlayDetails: lctr01PlayDetails,
      };
      return game;
    } else {
      return null;
    }
  } catch (error) {
    return null;
  }
}

export async function fetchBggUserCollectionAction(username: string): Promise<BoardGame[] | { error: string }> {
    try {
        const url = `${BGG_API_BASE_URL}/collection?username=${username}&own=1&excludesubtype=boardgameexpansion&stats=1`;
        const collectionXml = await fetchWithRetry(url);
        const games = parseBggCollectionXml(collectionXml);
        return games;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Si è verificato un errore sconosciuto durante il recupero della collezione BGG.';
        return { error: errorMessage };
    }
}

export async function getBoardGamesFromFirestoreAction(
  options: { skipRatingCalculation?: boolean } = {}
): Promise<BoardGame[] | { error: string }> {
  const { skipRatingCalculation = false } = options;
  try {
    const gamesCollectionRef = collection(db, FIRESTORE_COLLECTION_NAME);
    const querySnapshot = await getDocs(gamesCollectionRef);
    const games: BoardGame[] = [];

    for (const docSnap of querySnapshot.docs) {
        const data = docSnap.data();
        let overallAverageRating = data.overallAverageRating === undefined ? null : data.overallAverageRating;
        let currentVoteCount = data.voteCount === undefined ? 0 : data.voteCount;
        let currentLctr01Plays = data.lctr01Plays === undefined ? null : data.lctr01Plays;
        let currentBggAverageRating = data.bggAverageRating === undefined ? null : data.bggAverageRating;


        if (!skipRatingCalculation) {
            let reviewsForCalc: Review[] = [];
            try {
                const reviewsCollRef = collection(db, FIRESTORE_COLLECTION_NAME, docSnap.id, 'reviews');
                const reviewsSnap = await getDocs(reviewsCollRef);
                reviewsForCalc = reviewsSnap.docs.map(revDoc => revDoc.data() as Review);
                currentVoteCount = reviewsForCalc.length;
            } catch (e) { /* ignore */ }

            if (reviewsForCalc.length > 0) {
                const categoryAvgs = calculateCatAvgsFromUtils(reviewsForCalc);
                overallAverageRating = categoryAvgs ? calculateGlobalOverallAverage(categoryAvgs) : null;
            } else {
                overallAverageRating = null;
                if(data.voteCount === undefined) currentVoteCount = 0;
            }
        }

        games.push({
            id: docSnap.id,
            bggId: data.bggId ?? 0,
            name: data.name || "Gioco Senza Nome",
            coverArtUrl: data.coverArtUrl || `https://placehold.co/100x150.png?text=N/A`,
            yearPublished: data.yearPublished ?? null,
            minPlayers: data.minPlayers ?? null,
            maxPlayers: data.maxPlayers ?? null,
            playingTime: data.playingTime ?? null,
            minPlaytime: data.minPlaytime ?? null,
            maxPlaytime: data.maxPlaytime ?? null,
            averageWeight: data.averageWeight ?? null,
            bggAverageRating: currentBggAverageRating,
            categories: data.categories ?? [],
            mechanics: data.mechanics ?? [],
            designers: data.designers ?? [],
            reviews: [], // Reviews are not typically returned in list views
            overallAverageRating: overallAverageRating,
            voteCount: currentVoteCount,
            isPinned: data.isPinned || false,
            favoritedByUserIds: data.favoritedByUserIds ?? [],
            favoriteCount: data.favoriteCount ?? 0,
            playlistedByUserIds: data.playlistedByUserIds ?? [],
            morchiaByUserIds: data.morchiaByUserIds ?? [],
            morchiaCount: data.morchiaCount ?? 0,
            lctr01Plays: currentLctr01Plays,
        });
    }
    return games;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Si è verificato un errore sconosciuto.';
    return { error: `Impossibile recuperare i giochi dal database: ${errorMessage}` };
  }
}

export async function searchBggGamesAction(searchTerm: string): Promise<BggSearchResult[] | { error: string }> {
  if (!searchTerm.trim()) {
      return { error: 'Il termine di ricerca non può essere vuoto.' };
  }
  try {
      const searchUrl = `${BGG_API_BASE_URL}/search?query=${encodeURIComponent(searchTerm)}&type=boardgame`;
      const searchXml = await fetchWithRetry(searchUrl);

      const itemRegex = /<item type="boardgame" id="(\d+)">[\s\S]*?<name type="primary"(?:[^>]*)value="([^"]+)"(?:[^>]*)?\/>(?:[\s\S]*?<yearpublished(?:[^>]*)value="(\d+)"(?:[^>]*)?\/>)?[\s\S]*?<\/item>/gi;
      const results: BggSearchResult[] = [];
      let match;
      while ((match = itemRegex.exec(searchXml)) !== null) {
          results.push({
              bggId: match[1],
              name: decodeHtmlEntities(match[2]),
              yearPublished: match[3] ? parseInt(match[3], 10) : undefined,
              rank: Number.MAX_SAFE_INTEGER
          });
      }

      const limitedResults = results.slice(0, 10);

      const enrichedResultsPromises = limitedResults.map(async (item) => {
          try {
              const thingUrl = `${BGG_API_BASE_URL}/thing?id=${item.bggId}&stats=1`;
              const thingXml = await fetchWithRetry(thingUrl);

              const rankRegex = /<rank\s+type="subtype"\s+name="boardgame"(?:[^>]*?\s)?(?:friendlyname="[^"]*"\s+)?(?:bayesaverage="[^"]*"\s+)?value="(\d+)"\s*\/?>/i;
              const rankMatch = rankRegex.exec(thingXml);

              let rank = Number.MAX_SAFE_INTEGER;
              if (rankMatch && rankMatch[1]) {
                  rank = parseInt(rankMatch[1], 10);
                  if(isNaN(rank)) rank = Number.MAX_SAFE_INTEGER;
              } else {
                 const notRankedMatch = /<rank\s+type="subtype"\s+name="boardgame"\s+value="Not Ranked"/i.exec(thingXml);
                 if (notRankedMatch) rank = Number.MAX_SAFE_INTEGER;
              }

              return { ...item, rank };
          } catch (e) {
              return { ...item, rank: Number.MAX_SAFE_INTEGER };
          }
      });

      const enrichedResults = await Promise.all(enrichedResultsPromises);
      enrichedResults.sort((a, b) => a.rank - b.rank);
      return enrichedResults;

  } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Si è verificato un errore sconosciuto durante la ricerca BGG.';
      return { error: `Errore API BGG: ${errorMessage}` };
  }
}

export async function importAndRateBggGameAction(bggId: string): Promise<{ gameId: string } | { error: string }> {
  const numericBggId = parseInt(bggId, 10);
  if (isNaN(numericBggId)) {
      return { error: 'Formato ID BGG non valido.' };
  }

  const existingGameId = `bgg-${bggId}`;
  try {
      const gameDocRef = doc(db, FIRESTORE_COLLECTION_NAME, existingGameId);
      const docSnap = await getDoc(gameDocRef);
      if (docSnap.exists()) {
          return { gameId: existingGameId };
      }
  } catch (dbError) {
    //
  }

  try {
      const thingUrl = `${BGG_API_BASE_URL}/thing?id=${numericBggId}&stats=1`; // Ensure stats=1
      const thingXml = await fetchWithRetry(thingUrl);
      const parsedBggData = parseBggThingXmlToBoardGame(thingXml, numericBggId);

      if (parsedBggData.name === "Name Not Found in Details" || !parsedBggData.name || parsedBggData.name.startsWith("BGG ID") || parsedBggData.name.startsWith("BGG Gioco ID")) {
          return { error: 'Dettagli essenziali del gioco (nome) mancanti dalla risposta BGG.' };
      }

      const newGameForFirestore: BoardGame = {
          id: existingGameId,
          bggId: numericBggId,
          name: parsedBggData.name,
          coverArtUrl: parsedBggData.coverArtUrl || `https://placehold.co/400x600.png?text=${encodeURIComponent(parsedBggData.name)}`,
          yearPublished: parsedBggData.yearPublished ?? null,
          minPlayers: parsedBggData.minPlayers ?? null,
          maxPlayers: parsedBggData.maxPlayers ?? null,
          playingTime: parsedBggData.playingTime ?? null,
          minPlaytime: parsedBggData.minPlaytime ?? null,
          maxPlaytime: parsedBggData.maxPlaytime ?? null,
          averageWeight: parsedBggData.averageWeight ?? null,
          bggAverageRating: parsedBggData.bggAverageRating === undefined ? null : parsedBggData.bggAverageRating,
          categories: parsedBggData.categories ?? [],
          mechanics: parsedBggData.mechanics ?? [],
          designers: parsedBggData.designers ?? [],
          isPinned: false,
          overallAverageRating: null,
          voteCount: 0,
          reviews: [],
          favoritedByUserIds: [],
          favoriteCount: 0,
          playlistedByUserIds: [],
          morchiaByUserIds: [],
          morchiaCount: 0,
          lctr01Plays: null,
      };

      try {
          const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, existingGameId);
          await setDoc(gameRef, newGameForFirestore);
      } catch (dbError) {
          const errorMessage = dbError instanceof Error ? dbError.message : String(dbError);
          return { error: `Impossibile salvare il gioco nel database: ${errorMessage}` };
      }

      revalidateGameDataAction(existingGameId);
      return { gameId: existingGameId };

  } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Si è verificato un errore sconosciuto durante l\'importazione BGG.';
      return { error: `Errore API BGG: ${errorMessage}` };
  }
}

export async function getAllReviewsAction(): Promise<AugmentedReview[]> {
  const allAugmentedReviews: AugmentedReview[] = [];
  try {
    const gamesSnapshot = await getDocs(collection(db, FIRESTORE_COLLECTION_NAME));

    for (const gameDoc of gamesSnapshot.docs) {
      const gameData = gameDoc.data() as Omit<BoardGame, 'id' | 'reviews' | 'overallAverageRating' | 'voteCount' | 'lctr01PlayDetails'>;
      const gameId = gameDoc.id;

      const reviewsCollectionRef = collection(db, FIRESTORE_COLLECTION_NAME, gameId, 'reviews');
      const reviewsQuery = query(reviewsCollectionRef, orderBy("date", "desc"));
      const reviewsSnapshot = await getDocs(reviewsQuery);

      reviewsSnapshot.docs.forEach(reviewDoc => {
        const reviewData = reviewDoc.data() as Omit<Review, 'id'>;
        const rating: RatingType = {
            excitedToReplay: reviewData.rating?.excitedToReplay ?? 5,
            mentallyStimulating: reviewData.rating?.mentallyStimulating ?? 5,
            fun: reviewData.rating?.fun ?? 5,
            decisionDepth: reviewData.rating?.decisionDepth ?? 5,
            replayability: reviewData.rating?.replayability ?? 5,
            luck: reviewData.rating?.luck ?? 5,
            lengthDowntime: reviewData.rating?.lengthDowntime ?? 5,
            graphicDesign: reviewData.rating?.graphicDesign ?? 5,
            componentsThemeLore: reviewData.rating?.componentsThemeLore ?? 5,
            effortToLearn: reviewData.rating?.effortToLearn ?? 5,
            setupTeardown: reviewData.rating?.setupTeardown ?? 5,
          };
        allAugmentedReviews.push({
          id: reviewDoc.id,
          gameId: gameId,
          gameName: gameData.name || "Gioco Sconosciuto",
          gameCoverArtUrl: gameData.coverArtUrl,
          ...reviewData,
          authorPhotoURL: reviewData.authorPhotoURL || null,
          rating: rating,
        });
      });
    }
    allAugmentedReviews.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return allAugmentedReviews;
  } catch (error) {
    return [];
  }
}

export async function getAllUsersAction(): Promise<UserProfile[]> {
  try {
    const usersSnapshot = await getDocs(query(collection(db, USER_PROFILES_COLLECTION), orderBy("name", "asc")));
    const users: UserProfile[] = usersSnapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        name: data.name || 'Utente Sconosciuto',
        photoURL: data.photoURL || null,
        email: data.email || null,
        bggUsername: data.bggUsername || null,
        hasSubmittedReview: data.hasSubmittedReview || false,
        hasGivenFirstOne: data.hasGivenFirstOne || false,
        hasGivenFirstFive: data.hasGivenFirstFive || false,
        hasEarnedComprehensiveCritic: data.hasEarnedComprehensiveCritic || false,
        hasEarnedNightOwlReviewer: data.hasEarnedNightOwlReviewer || false,
        hasReceivedWelcomeBadge: data.hasReceivedWelcomeBadge || false,
        hasEarnedFavoriteFanaticBadge: data.hasEarnedFavoriteFanaticBadge || false,
        hasEarnedPlaylistProBadge: data.hasEarnedPlaylistProBadge || false,
        hasEarnedProlificBronze: data.hasEarnedProlificBronze || false,
        hasEarnedProlificSilver: data.hasEarnedProlificSilver || false,
        hasEarnedProlificGold: data.hasEarnedProlificGold || false,
        hasEarnedMorchiaHunter: data.hasEarnedMorchiaHunter || false,
      };
    });
    return users;
  } catch (error) {
    return [];
  }
}

export async function getUserDetailsAndReviewsAction(
  userId: string
): Promise<{ user: UserProfile | null; reviews: AugmentedReview[]; badges: EarnedBadge[] }> {
  let user: UserProfile | null = null;
  const reviews: AugmentedReview[] = [];
  const badges: EarnedBadge[] = [];

  try {
    const userProfileRef = doc(db, USER_PROFILES_COLLECTION, userId);
    const userProfileSnap = await getDoc(userProfileRef);
    if (userProfileSnap.exists()) {
      const data = userProfileSnap.data();
      user = {
        id: userId,
        name: data.name || 'Utente Sconosciuto',
        photoURL: data.photoURL || null,
        email: data.email || null,
        bggUsername: data.bggUsername || null,
        hasSubmittedReview: data.hasSubmittedReview || false,
        hasGivenFirstOne: data.hasGivenFirstOne || false,
        hasGivenFirstFive: data.hasGivenFirstFive || false,
        hasEarnedComprehensiveCritic: data.hasEarnedComprehensiveCritic || false,
        hasEarnedNightOwlReviewer: data.hasEarnedNightOwlReviewer || false,
        hasReceivedWelcomeBadge: data.hasReceivedWelcomeBadge || false,
        hasEarnedFavoriteFanaticBadge: data.hasEarnedFavoriteFanaticBadge || false,
        hasEarnedPlaylistProBadge: data.hasEarnedPlaylistProBadge || false,
        hasEarnedProlificBronze: data.hasEarnedProlificBronze || false,
        hasEarnedProlificSilver: data.hasEarnedProlificSilver || false,
        hasEarnedProlificGold: data.hasEarnedProlificGold || false,
        hasEarnedMorchiaHunter: data.hasEarnedMorchiaHunter || false,
      };

      const badgesCollectionRef = collection(db, USER_PROFILES_COLLECTION, userId, 'earned_badges');
      const badgesQuery = query(badgesCollectionRef, orderBy('earnedAt', 'desc'));
      const badgesSnapshot = await getDocs(badgesQuery);
      badgesSnapshot.docs.forEach(badgeDoc => {
        const badgeData = badgeDoc.data() as Omit<EarnedBadge, 'earnedAt'> & { earnedAt: Timestamp };
        badges.push({
          ...badgeData,
          earnedAt: badgeData.earnedAt ? badgeData.earnedAt.toDate().toISOString() : new Date().toISOString(),
        } as EarnedBadge);
      });
    }

    const reviewsQuery = query(collectionGroup(db, 'reviews'), where('userId', '==', userId), orderBy('date', 'desc'));
    const reviewsSnapshot = await getDocs(reviewsQuery);

    for (const reviewDoc of reviewsSnapshot.docs) {
        const reviewData = reviewDoc.data() as Omit<Review, 'id'>;
        const gameRef = reviewDoc.ref.parent.parent;
        if (gameRef) {
            const gameSnap = await getDoc(gameRef);
            if (gameSnap.exists()) {
                const gameData = gameSnap.data() as Omit<BoardGame, 'id' | 'reviews' | 'overallAverageRating' | 'voteCount' | 'lctr01PlayDetails'>;
                const rating: RatingType = {
                    excitedToReplay: reviewData.rating?.excitedToReplay ?? 5,
                    mentallyStimulating: reviewData.rating?.mentallyStimulating ?? 5,
                    fun: reviewData.rating?.fun ?? 5,
                    decisionDepth: reviewData.rating?.decisionDepth ?? 5,
                    replayability: reviewData.rating?.replayability ?? 5,
                    luck: reviewData.rating?.luck ?? 5,
                    lengthDowntime: reviewData.rating?.lengthDowntime ?? 5,
                    graphicDesign: reviewData.rating?.graphicDesign ?? 5,
                    componentsThemeLore: reviewData.rating?.componentsThemeLore ?? 5,
                    effortToLearn: reviewData.rating?.effortToLearn ?? 5,
                    setupTeardown: reviewData.rating?.setupTeardown ?? 5,
                  };
                reviews.push({
                    id: reviewDoc.id,
                    gameId: gameRef.id,
                    gameName: gameData.name || "Gioco Sconosciuto",
                    gameCoverArtUrl: gameData.coverArtUrl,
                    ...reviewData,
                    rating: rating,
                    authorPhotoURL: reviewData.authorPhotoURL || null,
                });
            }
        }
    }
  } catch (error) {
    //
  }
  return { user, reviews, badges };
}


export async function getFeaturedGamesAction(): Promise<BoardGame[]> {
  try {
    const allGamesResult = await getBoardGamesFromFirestoreAction({ skipRatingCalculation: false });
    if ('error' in allGamesResult) {
        console.error("Error fetching all games for featured section:", allGamesResult.error);
        return [];
    }

    const gamesWithDetails: Array<BoardGame & { _latestReviewDate?: Date | null }> = [];

    for (const game of allGamesResult) {
        let latestReviewDate: Date | null = null;
        if (game.voteCount && game.voteCount > 0) {
            // To get the latest review date, we'd ideally have this denormalized
            // or fetch reviews just for this game. For now, this might be slow.
            // A simplified approach is to assume 'voteCount' indicates recent activity.
            // For a true "latest review date", a subcollection query is needed here.
            // For this iteration, we'll just rely on existing voteCount
            // This part is a placeholder for a more efficient latest review date retrieval if needed.
            // For now, we just use game.voteCount to filter.
            if (game.voteCount > 0) {
                latestReviewDate = new Date(); // Placeholder - assumes any review makes it recent
            }
        }
        gamesWithDetails.push({ ...game, _latestReviewDate: latestReviewDate });
    }

    const pinnedGames = gamesWithDetails
        .filter(game => game.isPinned)
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
        .map(game => ({ ...game, featuredReason: 'pinned' as const }));

    const recentlyReviewedGames = gamesWithDetails
        .filter(game => !game.isPinned && game.voteCount && game.voteCount > 0) // Using voteCount as proxy for reviewed
        .sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0)) // Sort by vote count as proxy
        .slice(0, 5); // Take more than 3 initially to allow for deduplication

    const finalFeaturedGames: BoardGame[] = [];
    const featuredGameIds = new Set<string>();

    for (const game of pinnedGames) {
        if (finalFeaturedGames.length >= 3) break;
        if (game.id && !featuredGameIds.has(game.id)) {
            const { _latestReviewDate, ...gameToAdd } = game;
            finalFeaturedGames.push(gameToAdd as BoardGame);
            featuredGameIds.add(game.id);
        }
    }

    if (finalFeaturedGames.length < 3) {
        for (const game of recentlyReviewedGames) {
            if (finalFeaturedGames.length >= 3) break;
            if (game.id && !featuredGameIds.has(game.id)) {
                 const { _latestReviewDate, ...gameToAdd } = game;
                finalFeaturedGames.push({ ...gameToAdd, featuredReason: 'recent' } as BoardGame);
                featuredGameIds.add(game.id);
            }
        }
    }
    return finalFeaturedGames.slice(0, 3);
  } catch (error) {
      console.error("Error in getFeaturedGamesAction:", error);
      return [];
  }
}


export async function getAllGamesAction(options: { skipRatingCalculation?: boolean } = {}): Promise<BoardGame[]> {
  const result = await getBoardGamesFromFirestoreAction(options);
  if ('error' in result) {
    return [];
  }
  return result;
}

export async function fetchAndUpdateBggGameDetailsAction(bggId: number): Promise<{ success: boolean; message: string; error?: string; updateData?: Partial<BoardGame> }> {
    // console.log(`[SERVER ACTION fetchAndUpdateBggGameDetailsAction] Received bggId: ${bggId} (type: ${typeof bggId})`);
    if (!bggId || typeof bggId !== 'number' || isNaN(bggId) || bggId <= 0) {
        const errorMsg = `ID BGG non valido fornito: ${bggId} (tipo: ${typeof bggId})`;
        // console.error(`[SERVER ACTION fetchAndUpdateBggGameDetailsAction] Validation Error: ${errorMsg}`);
        return { success: false, message: "ID BGG non valido fornito.", error: errorMsg };
    }

    try {
        const thingUrl = `${BGG_API_BASE_URL}/thing?id=${bggId}&stats=1`; // Ensure stats=1
        // console.log(`[SERVER ACTION fetchAndUpdateBggGameDetailsAction] Fetching from BGG URL: ${thingUrl}`);
        const thingXml = await fetchWithRetry(thingUrl);

        if (!thingXml) {
            // console.error(`[SERVER ACTION fetchAndUpdateBggGameDetailsAction] Empty response from BGG for ID ${bggId}.`);
            return { success: false, message: "Impossibile recuperare i dettagli del gioco da BGG.", error: "Risposta BGG vuota" };
        }

        const parsedBggData = parseBggThingXmlToBoardGame(thingXml, bggId);
        const updateData: Partial<BoardGame> = {};

        if (parsedBggData.name != null && parsedBggData.name !== "Name Not Found in Details" && parsedBggData.name !== "Unknown Name" && !parsedBggData.name.startsWith("BGG ID") && !parsedBggData.name.startsWith("BGG Gioco ID")) {
            updateData.name = parsedBggData.name;
        }
        if (parsedBggData.coverArtUrl != null && !parsedBggData.coverArtUrl.includes('placehold.co') && !parsedBggData.coverArtUrl.includes('_thumb')) {
            updateData.coverArtUrl = parsedBggData.coverArtUrl;
        }
        if (parsedBggData.yearPublished != null) updateData.yearPublished = parsedBggData.yearPublished;
        if (parsedBggData.minPlayers != null) updateData.minPlayers = parsedBggData.minPlayers;
        if (parsedBggData.maxPlayers != null) updateData.maxPlayers = parsedBggData.maxPlayers;
        if (parsedBggData.playingTime != null) updateData.playingTime = parsedBggData.playingTime;
        if (parsedBggData.minPlaytime != null) updateData.minPlaytime = parsedBggData.minPlaytime;
        if (parsedBggData.maxPlaytime != null) updateData.maxPlaytime = parsedBggData.maxPlaytime;
        if (parsedBggData.averageWeight != null) updateData.averageWeight = parsedBggData.averageWeight;
        if (parsedBggData.bggAverageRating != null) updateData.bggAverageRating = parsedBggData.bggAverageRating;
        if (parsedBggData.categories && parsedBggData.categories.length > 0) updateData.categories = parsedBggData.categories;
        if (parsedBggData.mechanics && parsedBggData.mechanics.length > 0) updateData.mechanics = parsedBggData.mechanics;
        if (parsedBggData.designers && parsedBggData.designers.length > 0) updateData.designers = parsedBggData.designers;

        // console.log("[SERVER ACTION fetchAndUpdateBggGameDetailsAction] Update data prepared:", JSON.stringify(updateData, null, 2));


        if (Object.keys(updateData).length === 0) {
             return { success: true, message: `Nessun nuovo dettaglio da aggiornare per ${parsedBggData.name || `BGG ID ${bggId}`} da BGG.`, updateData: {} };
        }

        return {
            success: true,
            message: `Dati per ${parsedBggData.name || `BGG ID ${bggId}`} recuperati con successo da BGG.`,
            updateData: updateData
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Si è verificato un errore sconosciuto durante l\'aggiornamento dei dettagli del gioco.';
        // console.error(`[SERVER ACTION fetchAndUpdateBggGameDetailsAction] Error for BGG ID ${bggId}:`, errorMessage);
        return { success: false, message: 'Recupero dettagli BGG fallito.', error: errorMessage };
    }
}

async function parseBggMultiThingXml(xmlText: string): Promise<Map<number, Partial<BoardGame>>> {
    const itemsMap = new Map<number, Partial<BoardGame>>();
    const itemMatches = xmlText.matchAll(/<item[^>]*type="boardgame"[^>]*id="(\d+)"[^>]*>([\s\S]*?)<\/item>/gi);

    for (const itemMatch of itemMatches) {
        const bggId = parseInt(itemMatch[1], 10);
        const itemContent = itemMatch[2];
        if (!isNaN(bggId) && itemContent) {
            const parsedDetails = parseBggThingXmlToBoardGame(itemContent, bggId);
            const updateForThisGame: Partial<BoardGame> = {};

            if (parsedDetails.coverArtUrl && !parsedDetails.coverArtUrl.includes('_thumb') && !parsedDetails.coverArtUrl.includes('placehold.co')) {
                updateForThisGame.coverArtUrl = parsedDetails.coverArtUrl;
            }
            if (parsedDetails.name && !parsedDetails.name.startsWith("BGG ID") && !parsedDetails.name.startsWith("BGG Gioco ID") && parsedDetails.name !== "Name Not Found in Details") updateForThisGame.name = parsedDetails.name;
            if (parsedDetails.yearPublished != null) updateForThisGame.yearPublished = parsedDetails.yearPublished;
            if (parsedDetails.minPlayers != null) updateForThisGame.minPlayers = parsedDetails.minPlayers;
            if (parsedDetails.maxPlayers != null) updateForThisGame.maxPlayers = parsedDetails.maxPlayers;
            if (parsedDetails.playingTime != null) updateForThisGame.playingTime = parsedDetails.playingTime;
            if (parsedDetails.minPlaytime != null) updateForThisGame.minPlaytime = parsedDetails.minPlaytime;
            if (parsedDetails.maxPlaytime != null) updateForThisGame.maxPlaytime = parsedDetails.maxPlaytime;
            if (parsedDetails.averageWeight != null) updateForThisGame.averageWeight = parsedDetails.averageWeight;
            if (parsedDetails.bggAverageRating != null) updateForThisGame.bggAverageRating = parsedDetails.bggAverageRating;
            if (parsedDetails.categories && parsedDetails.categories.length > 0) updateForThisGame.categories = parsedDetails.categories;
            if (parsedDetails.mechanics && parsedDetails.mechanics.length > 0) updateForThisGame.mechanics = parsedDetails.mechanics;
            if (parsedDetails.designers && parsedDetails.designers.length > 0) updateForThisGame.designers = parsedDetails.designers;

            if(Object.keys(updateForThisGame).length > 0) {
                itemsMap.set(bggId, updateForThisGame);
            }
        }
    }
    return itemsMap;
}

export async function batchUpdateMissingBggDetailsAction(): Promise<{ success: boolean; message: string; error?: string; gamesToUpdateClientSide?: Array<{ gameId: string; updateData: Partial<BoardGame>}> }> {
    const MAX_GAMES_TO_PROCESS_IN_BATCH = 20;
    const BGG_API_BATCH_SIZE = 10; // BGG recommends not hitting too hard, this batches /thing calls
    const BGG_API_DELAY_MS = 2000; // Delay between batched /thing API calls

    try {
        const allGamesResult = await getBoardGamesFromFirestoreAction({ skipRatingCalculation: true });
        if ('error' in allGamesResult) {
            return { success: false, message: allGamesResult.error, error: allGamesResult.error };
        }

        const gamesNeedingUpdate = allGamesResult.filter(game => {
            if (!game.bggId || game.bggId <= 0) return false; // Skip if no valid BGG ID
            const isNamePlaceholder = game.name?.startsWith("BGG Gioco ID") || game.name?.startsWith("BGG ID") || game.name === "Name Not Found in Details";
            const isCoverPlaceholder = game.coverArtUrl?.includes("placehold.co");
            const isCoverThumbnail = game.coverArtUrl?.includes("_thumb") && game.coverArtUrl?.includes("cf.geekdo-images.com");

            return game.minPlaytime == null ||
                   game.maxPlaytime == null ||
                   game.averageWeight == null ||
                   game.bggAverageRating == null ||
                   game.yearPublished == null ||
                   game.minPlayers == null ||
                   game.maxPlayers == null ||
                   game.playingTime == null ||
                   (game.categories == null || game.categories.length === 0) ||
                   (game.mechanics == null || game.mechanics.length === 0) ||
                   (game.designers == null || game.designers.length === 0) ||
                   isNamePlaceholder ||
                   isCoverPlaceholder ||
                   isCoverThumbnail;
        });

        const gamesToProcessThisRun = gamesNeedingUpdate.slice(0, MAX_GAMES_TO_PROCESS_IN_BATCH);

        if (gamesToProcessThisRun.length === 0) {
            return { success: true, message: 'Nessun gioco necessita di arricchimento dati da BGG in questo momento.' };
        }

        const gamesToUpdateClientSide: Array<{ gameId: string; updateData: Partial<BoardGame>}> = [];
        let fetchedCount = 0;
        let erroredFetchCount = 0;

        for (let i = 0; i < gamesToProcessThisRun.length; i += BGG_API_BATCH_SIZE) {
            const gameChunk = gamesToProcessThisRun.slice(i, i + BGG_API_BATCH_SIZE);
            const bggIdsInChunk = gameChunk.map(g => g.bggId).filter(id => id != null && id > 0) as number[];

            if (bggIdsInChunk.length === 0) continue;

            try {
                const thingUrl = `${BGG_API_BASE_URL}/thing?id=${bggIdsInChunk.join(',')}&stats=1`; // Ensure stats=1
                const multiItemXml = await fetchWithRetry(thingUrl);
                const parsedItemsMap = await parseBggMultiThingXml(multiItemXml);

                for (const originalGameFromDb of gameChunk) {
                    const parsedBggData = parsedItemsMap.get(originalGameFromDb.bggId);
                    if (parsedBggData && originalGameFromDb.bggId) {
                        const updatePayload: Partial<BoardGame> = {};
                        const isCurrentNamePlaceholder = originalGameFromDb.name?.startsWith("BGG Gioco ID") || originalGameFromDb.name?.startsWith("BGG ID") || originalGameFromDb.name === "Name Not Found in Details";
                        const isCurrentCoverPlaceholder = originalGameFromDb.coverArtUrl?.includes("placehold.co");
                        const isCurrentCoverThumbnail = originalGameFromDb.coverArtUrl?.includes("_thumb") && originalGameFromDb.coverArtUrl?.includes("cf.geekdo-images.com");

                        if (parsedBggData.name != null && (originalGameFromDb.name == null || isCurrentNamePlaceholder)) updatePayload.name = parsedBggData.name;
                        if (parsedBggData.coverArtUrl != null && (originalGameFromDb.coverArtUrl == null || isCurrentCoverPlaceholder || isCurrentCoverThumbnail)) updatePayload.coverArtUrl = parsedBggData.coverArtUrl;
                        if (parsedBggData.yearPublished != null && originalGameFromDb.yearPublished == null) updatePayload.yearPublished = parsedBggData.yearPublished;
                        if (parsedBggData.minPlayers != null && originalGameFromDb.minPlayers == null) updatePayload.minPlayers = parsedBggData.minPlayers;
                        if (parsedBggData.maxPlayers != null && originalGameFromDb.maxPlayers == null) updatePayload.maxPlayers = parsedBggData.maxPlayers;
                        if (parsedBggData.playingTime != null && originalGameFromDb.playingTime == null) updatePayload.playingTime = parsedBggData.playingTime;
                        if (parsedBggData.minPlaytime != null && originalGameFromDb.minPlaytime == null) updatePayload.minPlaytime = parsedBggData.minPlaytime;
                        if (parsedBggData.maxPlaytime != null && originalGameFromDb.maxPlaytime == null) updatePayload.maxPlaytime = parsedBggData.maxPlaytime;
                        if (parsedBggData.averageWeight != null && originalGameFromDb.averageWeight == null) updatePayload.averageWeight = parsedBggData.averageWeight;
                        if (parsedBggData.bggAverageRating != null && originalGameFromDb.bggAverageRating == null) updatePayload.bggAverageRating = parsedBggData.bggAverageRating;

                        if (parsedBggData.categories && parsedBggData.categories.length > 0 && (originalGameFromDb.categories == null || originalGameFromDb.categories.length === 0)) updatePayload.categories = parsedBggData.categories;
                        if (parsedBggData.mechanics && parsedBggData.mechanics.length > 0 && (originalGameFromDb.mechanics == null || originalGameFromDb.mechanics.length === 0)) updatePayload.mechanics = parsedBggData.mechanics;
                        if (parsedBggData.designers && parsedBggData.designers.length > 0 && (originalGameFromDb.designers == null || originalGameFromDb.designers.length === 0)) updatePayload.designers = parsedBggData.designers;

                        if (Object.keys(updatePayload).length > 0) {
                            gamesToUpdateClientSide.push({ gameId: originalGameFromDb.id, updateData: updatePayload });
                            fetchedCount++;
                        }
                    }
                }
                if (i + BGG_API_BATCH_SIZE < gamesToProcessThisRun.length) {
                    await new Promise(resolve => setTimeout(resolve, BGG_API_DELAY_MS));
                }
            } catch (batchFetchError) {
                // console.error(`[SERVER ACTION batchUpdateMissingBggDetailsAction] Error fetching BGG batch for IDs ${bggIdsInChunk.join(',')}:`, batchFetchError);
                erroredFetchCount += gameChunk.length;
            }
        }

        let message = `${fetchedCount} giochi pronti per l'aggiornamento client-side.`;
        if (erroredFetchCount > 0) {
            message += ` ${erroredFetchCount} giochi non sono stati recuperati a causa di errori.`;
        }

        const totalGamesStillNeedingUpdateAfterThisRun = gamesNeedingUpdate.length - fetchedCount;

        if (fetchedCount > 0 && totalGamesStillNeedingUpdateAfterThisRun <= 0 && erroredFetchCount === 0) {
            message += ` Tutti i giochi con dettagli mancanti dovrebbero essere stati arricchiti.`;
        } else if (totalGamesStillNeedingUpdateAfterThisRun > 0) {
             message += ` Ci sono ancora circa ${totalGamesStillNeedingUpdateAfterThisRun} giochi che potrebbero necessitare di arricchimento. Rilancia l'azione per processarli.`;
        } else if (fetchedCount === 0 && erroredFetchCount === 0 && gamesToProcessThisRun.length > 0) {
             message = `Nessun nuovo dettaglio trovato o necessario per i ${gamesToProcessThisRun.length} giochi controllati.`;
        }
         if(gamesToUpdateClientSide.length > 0) {
            revalidateGameDataAction();
        }

        return { success: true, message, gamesToUpdateClientSide };

    } catch (error) {
        const errorMessage = String(error instanceof Error ? error.message : error);
        // console.error(`[SERVER ACTION batchUpdateMissingBggDetailsAction] General Error:`, errorMessage);
        return { success: false, message: 'Arricchimento batch dei dettagli BGG fallito.', error: errorMessage };
    }
}

export async function searchLocalGamesByNameAction(term: string): Promise<Pick<BoardGame, 'id' | 'name' | 'yearPublished' | 'coverArtUrl' | 'overallAverageRating' | 'bggId' | 'voteCount'>[] | { error: string }> {
  if (!term || term.length < 2) {
    return [];
  }
  try {
    // Fetch only essential data for the search list, skip rating calculation here
    const allGamesResult = await getBoardGamesFromFirestoreAction({ skipRatingCalculation: true });
    if ('error' in allGamesResult) {
      return { error: allGamesResult.error };
    }

    const searchTermLower = term.toLowerCase();
    const matchedGames = allGamesResult
      .filter(game => game.name && game.name.toLowerCase().includes(searchTermLower))
      .map(game => ({ // Map to a lighter object for the header search
        id: game.id,
        name: game.name,
        yearPublished: game.yearPublished ?? undefined,
        // These fields are not strictly needed for header search results display but are good for consistency
        coverArtUrl: game.coverArtUrl,
        overallAverageRating: game.overallAverageRating === undefined ? null : game.overallAverageRating,
        voteCount: game.voteCount === undefined ? 0 : game.voteCount,
        bggId: game.bggId
      }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    const finalResults = matchedGames.slice(0, 10);
    return finalResults;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Errore sconosciuto durante la ricerca locale.";
    return { error: errorMessage };
  }
}


export async function revalidateGameDataAction(gameId?: string) {
  try {
    revalidatePath('/');
    revalidatePath('/all-games');
    revalidatePath('/top-10');
    revalidatePath('/reviews');
    revalidatePath('/rate-a-game/select-game');
    revalidatePath('/admin/collection');
    revalidatePath('/users');
    revalidatePath('/plays');
    if (gameId) {
        revalidatePath(`/games/${gameId}`);
        revalidatePath(`/games/${gameId}/rate`);
    }
    return { success: true, message: `Percorsi rilevanti della cache revalidati.` };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: 'Impossibile revalidare la cache.', error: errorMessage };
  }
}

export async function getFavoritedGamesForUserAction(userId: string): Promise<BoardGame[]> {
  if (!userId) {
    return [];
  }
  try {
    const q = query(collection(db, FIRESTORE_COLLECTION_NAME), where('favoritedByUserIds', 'array-contains', userId));
    const querySnapshot = await getDocs(q);
    const games: BoardGame[] = querySnapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        name: data.name || "Gioco Senza Nome",
        coverArtUrl: data.coverArtUrl || `https://placehold.co/200x300.png?text=N/A`,
        bggId: data.bggId ?? 0,
        yearPublished: data.yearPublished ?? null,
        overallAverageRating: data.overallAverageRating === undefined ? null : data.overallAverageRating,
        voteCount: data.voteCount === undefined ? 0 : data.voteCount,
        lctr01Plays: data.lctr01Plays === undefined ? null : data.lctr01Plays,
        favoritedByUserIds: data.favoritedByUserIds ?? [],
        favoriteCount: data.favoriteCount ?? 0,
        playlistedByUserIds: data.playlistedByUserIds ?? [],
        morchiaByUserIds: data.morchiaByUserIds ?? [],
        morchiaCount: data.morchiaCount ?? 0,
        reviews: [],
        minPlayers: data.minPlayers ?? null,
        maxPlayers: data.maxPlayers ?? null,
        playingTime: data.playingTime ?? null,
        minPlaytime: data.minPlaytime ?? null,
        maxPlaytime: data.maxPlaytime ?? null,
        averageWeight: data.averageWeight ?? null,
        bggAverageRating: data.bggAverageRating === undefined ? null : data.bggAverageRating,
        categories: data.categories ?? [],
        mechanics: data.mechanics ?? [],
        designers: data.designers ?? [],
        isPinned: data.isPinned ?? false,
      };
    });
    return games.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } catch (error) {
    return [];
  }
}

export async function getPlaylistedGamesForUserAction(userId: string): Promise<BoardGame[]> {
  if (!userId) {
    return [];
  }
  try {
    const q = query(collection(db, FIRESTORE_COLLECTION_NAME), where('playlistedByUserIds', 'array-contains', userId));
    const querySnapshot = await getDocs(q);
    const games: BoardGame[] = querySnapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        name: data.name || "Gioco Senza Nome",
        coverArtUrl: data.coverArtUrl || `https://placehold.co/200x300.png?text=N/A`,
        bggId: data.bggId ?? 0,
        yearPublished: data.yearPublished ?? null,
        overallAverageRating: data.overallAverageRating === undefined ? null : data.overallAverageRating,
        voteCount: data.voteCount === undefined ? 0 : data.voteCount,
        lctr01Plays: data.lctr01Plays === undefined ? null : data.lctr01Plays,
        favoritedByUserIds: data.favoritedByUserIds ?? [],
        favoriteCount: data.favoriteCount ?? 0,
        playlistedByUserIds: data.playlistedByUserIds ?? [],
        morchiaByUserIds: data.morchiaByUserIds ?? [],
        morchiaCount: data.morchiaCount ?? 0,
        reviews: [],
        minPlayers: data.minPlayers ?? null,
        maxPlayers: data.maxPlayers ?? null,
        playingTime: data.playingTime ?? null,
        minPlaytime: data.minPlaytime ?? null,
        maxPlaytime: data.maxPlaytime ?? null,
        averageWeight: data.averageWeight ?? null,
        bggAverageRating: data.bggAverageRating === undefined ? null : data.bggAverageRating,
        categories: data.categories ?? [],
        mechanics: data.mechanics ?? [],
        designers: data.designers ?? [],
        isPinned: data.isPinned ?? false,
      };
    });
    return games.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } catch (error) {
    return [];
  }
}


export async function getMorchiaGamesForUserAction(userId: string): Promise<BoardGame[]> {
  if (!userId) {
    return [];
  }
  try {
    const q = query(collection(db, FIRESTORE_COLLECTION_NAME), where('morchiaByUserIds', 'array-contains', userId));
    const querySnapshot = await getDocs(q);
    const games: BoardGame[] = querySnapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        name: data.name || "Gioco Senza Nome",
        coverArtUrl: data.coverArtUrl || `https://placehold.co/200x300.png?text=N/A`,
        bggId: data.bggId ?? 0,
        yearPublished: data.yearPublished ?? null,
        overallAverageRating: data.overallAverageRating === undefined ? null : data.overallAverageRating,
        voteCount: data.voteCount === undefined ? 0 : data.voteCount,
        lctr01Plays: data.lctr01Plays === undefined ? null : data.lctr01Plays,
        favoritedByUserIds: data.favoritedByUserIds ?? [],
        favoriteCount: data.favoriteCount ?? 0,
        playlistedByUserIds: data.playlistedByUserIds ?? [],
        morchiaByUserIds: data.morchiaByUserIds ?? [],
        morchiaCount: data.morchiaCount ?? 0,
        reviews: [],
        minPlayers: data.minPlayers ?? null,
        maxPlayers: data.maxPlayers ?? null,
        playingTime: data.playingTime ?? null,
        minPlaytime: data.minPlaytime ?? null,
        maxPlaytime: data.maxPlaytime ?? null,
        averageWeight: data.averageWeight ?? null,
        bggAverageRating: data.bggAverageRating === undefined ? null : data.bggAverageRating,
        categories: data.categories ?? [],
        mechanics: data.mechanics ?? [],
        designers: data.designers ?? [],
        isPinned: data.isPinned ?? false,
      };
    });
    return games.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } catch (error) {
    return [];
  }
}


export async function getSingleReviewDetailsAction(gameId: string, reviewId: string): Promise<AugmentedReviewWithGame | { error: string }> {
  try {
    const gameDocRef = doc(db, FIRESTORE_COLLECTION_NAME, gameId);
    const reviewDocRef = doc(db, FIRESTORE_COLLECTION_NAME, gameId, 'reviews', reviewId);

    const [gameSnap, reviewSnap] = await Promise.all([getDoc(gameDocRef), getDoc(reviewDocRef)]);

    if (!reviewSnap.exists()) {
      return { error: "Voto non trovato." };
    }
    const reviewData = reviewSnap.data() as Omit<Review, 'id'>;

    let gameName = "Gioco Sconosciuto";
    let gameCoverArtUrl: string | null = null;
    if (gameSnap.exists()) {
      const gameData = gameSnap.data();
      gameName = gameData?.name || `Gioco ${gameId}`;
      gameCoverArtUrl = gameData?.coverArtUrl || null;
    }

    const rating: RatingType = {
        excitedToReplay: reviewData.rating?.excitedToReplay ?? 5,
        mentallyStimulating: reviewData.rating?.mentallyStimulating ?? 5,
        fun: reviewData.rating?.fun ?? 5,
        decisionDepth: reviewData.rating?.decisionDepth ?? 5,
        replayability: reviewData.rating?.replayability ?? 5,
        luck: reviewData.rating?.luck ?? 5,
        lengthDowntime: reviewData.rating?.lengthDowntime ?? 5,
        graphicDesign: reviewData.rating?.graphicDesign ?? 5,
        componentsThemeLore: reviewData.rating?.componentsThemeLore ?? 5,
        effortToLearn: reviewData.rating?.effortToLearn ?? 5,
        setupTeardown: reviewData.rating?.setupTeardown ?? 5,
      };

    const augmentedReview: AugmentedReviewWithGame = {
      id: reviewSnap.id,
      gameId: gameId,
      gameName: gameName,
      gameCoverArtUrl: gameCoverArtUrl,
      authorPhotoURL: reviewData.authorPhotoURL || null,
      ...reviewData,
      rating: rating,
    };

    return augmentedReview;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Errore sconosciuto durante il recupero dei dettagli del voto.";
    return { error: errorMessage };
  }
}

function parseBggPlaysXml(xmlText: string, specificGameBggId?: number, usernameForPlays?: string): BggPlayDetail[] {
  const plays: BggPlayDetail[] = [];
  const playMatches = xmlText.matchAll(/<play\s+id="(\d+)"\s+date="([^"]+)"\s+quantity="(\d+)"(?:[^>]*)location="([^"]*)"[^>]*>([\s\S]*?)<\/play>/gi);

  for (const playMatch of playMatches) {
    const playId = playMatch[1];
    const date = playMatch[2];
    const quantity = parseInt(playMatch[3], 10);
    const location = decodeHtmlEntities(playMatch[4].trim());
    const playContent = playMatch[5];

    let gameBggIdFromPlay: number | undefined = undefined;
    const itemMatch = /<item\s+name="[^"]*"\s+objecttype="thing"\s+objectid="(\d+)"/i.exec(playContent);
    if (itemMatch && itemMatch[1]) {
      gameBggIdFromPlay = parseInt(itemMatch[1], 10);
    }

    const finalGameBggId = specificGameBggId ?? gameBggIdFromPlay;

    if (finalGameBggId === undefined || isNaN(finalGameBggId)) {
        continue;
    }

    let comments: string | null = null;
    const commentsMatch = /<comments>([\s\S]*?)<\/comments>/i.exec(playContent);
    if (commentsMatch && commentsMatch[1]) {
      comments = decodeHtmlEntities(commentsMatch[1].trim());
    }

    const players: BggPlayerInPlay[] = [];
    const playersElementMatch = /<players>([\s\S]*?)<\/players>/i.exec(playContent);
    if (playersElementMatch && playersElementMatch[1]) {
        const playerMatches = playersElementMatch[1].matchAll(/<player\s*(?:username="([^"]*)")?\s*(?:userid="([^"]*)")?\s*(?:name="([^"]*)")?\s*(?:startposition="([^"]*)")?\s*(?:color="([^"]*)")?\s*(?:score="([^"]*)")?\s*(?:new="([01])")?\s*(?:rating="[^"]*")?\s*(?:win="([01])")?\s*\/?>/gi);
        for (const playerMatch of playerMatches) {
            players.push({
                username: playerMatch[1] ? decodeHtmlEntities(playerMatch[1]) : null,
                userIdBgg: playerMatch[2] ? decodeHtmlEntities(playerMatch[2]) : null,
                name: playerMatch[3] ? decodeHtmlEntities(playerMatch[3]) : null,
                startPosition: playerMatch[4] ? decodeHtmlEntities(playerMatch[4]) : null,
                color: playerMatch[5] ? decodeHtmlEntities(playerMatch[5]) : null,
                score: playerMatch[6] ? decodeHtmlEntities(playerMatch[6]) : null,
                isNew: playerMatch[7] === "1",
                didWin: playerMatch[8] === "1",
            });
        }
    }

    plays.push({
      playId,
      date,
      quantity: isNaN(quantity) ? 1 : quantity,
      comments,
      location: location || null,
      players: players.length > 0 ? players : undefined,
      gameBggId: finalGameBggId,
      userId: usernameForPlays,
    });
  }
  return plays;
}

// Fetches plays for a specific game by a specific user
export async function fetchUserPlaysForGameFromBggAction(
  gameBggId: number,
  username: string
): Promise<{ success: boolean; plays?: BggPlayDetail[]; message?: string; error?: string }> {

  if (typeof gameBggId !== 'number' || isNaN(gameBggId) || gameBggId <= 0 || !username || typeof username !== 'string' || username.trim() === '') {
    const errorMsg = `Parametri non validi per l'azione fetchUserPlaysForGameFromBggAction: gameBggId=${gameBggId} (tipo: ${typeof gameBggId}), username=${username}`;
    return { success: false, message: "ID gioco BGG o nome utente non validi.", error: errorMsg };
  }
  try {
    const playsUrl = `${BGG_API_BASE_URL}/plays?username=${encodeURIComponent(username)}&id=${gameBggId}&type=thing`;
    const playsXml = await fetchWithRetry(playsUrl);

    if (!playsXml) {
      return { success: false, message: "Impossibile recuperare i dati delle partite da BGG.", error: "Risposta BGG vuota" };
    }

    const parsedPlays = parseBggPlaysXml(playsXml, gameBggId, username);

    return {
        success: true,
        plays: parsedPlays,
        message: `Caricate ${parsedPlays.length} partite da BGG per ${username} per il gioco ID ${gameBggId}.`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Si è verificato un errore sconosciuto durante il recupero delle partite da BGG.';
    return { success: false, message: 'Operazione fallita.', error: errorMessage };
  }
}

// Fetches all plays (paginated) for a specific user
export async function fetchAllUserPlaysFromBggAction(
  username: string,
  page: number = 1
): Promise<{ success: boolean; plays?: BggPlayDetail[]; totalPlaysFromBgg?: number; message?: string; error?: string }> {
  if (!username || typeof username !== 'string' || username.trim() === '') {
    return { success: false, message: "Nome utente mancante o non valido.", error: "Parametri non validi" };
  }
  if (typeof page !== 'number' || isNaN(page) || page < 1) {
    return { success: false, message: "Numero di pagina non valido.", error: "Parametri non validi" };
  }

  try {
    const playsUrl = `${BGG_API_BASE_URL}/plays?username=${encodeURIComponent(username)}&type=thing&page=${page}`;
    const playsXml = await fetchWithRetry(playsUrl);

    if (!playsXml) {
      return { success: false, message: "Impossibile recuperare i dati delle partite da BGG.", error: "Risposta BGG vuota" };
    }

    let totalPlaysFromBgg = 0;
    const totalPlaysMatch = /<plays[^>]*total="(\d+)"/.exec(playsXml);
    if (totalPlaysMatch && totalPlaysMatch[1]) {
      totalPlaysFromBgg = parseInt(totalPlaysMatch[1], 10);
    }

    const parsedPlays = parseBggPlaysXml(playsXml, undefined, username);

    return {
        success: true,
        plays: parsedPlays,
        totalPlaysFromBgg: totalPlaysFromBgg,
        message: `Caricate ${parsedPlays.length} partite (da pagina ${page}) da BGG per ${username}. Totale BGG: ${totalPlaysFromBgg}.`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Si è verificato un errore sconosciuto durante il recupero di tutte le partite da BGG.';
    return { success: false, message: 'Operazione fallita.', error: errorMessage };
  }
}

export async function getAllUserPlaysAction(username: string): Promise<AugmentedBggPlayDetail[]> {
  if (!username) {
    return [];
  }
  const allPlays: AugmentedBggPlayDetail[] = [];
  try {
    const gamesSnapshot = await getDocs(collection(db, FIRESTORE_COLLECTION_NAME));
    for (const gameDoc of gamesSnapshot.docs) {
      const gameData = gameDoc.data() as BoardGame;
      const gameId = gameDoc.id;

      const playsSubcollectionRef = collection(db, FIRESTORE_COLLECTION_NAME, gameId, `plays_${username.toLowerCase()}`);
      const playsQuery = query(playsSubcollectionRef, orderBy("date", "desc"));
      const playsSnapshot = await getDocs(playsQuery);

      playsSnapshot.docs.forEach(playDoc => {
        const playData = playDoc.data() as BggPlayDetail;
        allPlays.push({
          ...playData,
          gameId: gameId,
          gameName: gameData.name || "Gioco Sconosciuto",
          gameCoverArtUrl: gameData.coverArtUrl,
        });
      });
    }
    allPlays.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return allPlays;
  } catch (error) {
    return [];
  }
}

export async function getLastPlayedGameAction(username: string): Promise<{ game: BoardGame | null, lastPlayDetail: BggPlayDetail | null }> {
  let gameDocRef: DocumentReference<DocumentData> | null = null;
  let rawPlayData: BggPlayDetail | null = null;

  try {
    const playsQuery = query(
      collectionGroup(db, `plays_${username.toLowerCase()}`),
      orderBy('date', 'desc'),
      limit(1)
    );
    const playsSnapshot = await getDocs(playsQuery);

    if (playsSnapshot.empty) {
      return { game: null, lastPlayDetail: null };
    }

    const lastPlayDocSnap = playsSnapshot.docs[0];
    rawPlayData = lastPlayDocSnap.data() as BggPlayDetail;

    const parentRef = lastPlayDocSnap.ref.parent.parent;
    if (!parentRef) {
        return { game: null, lastPlayDetail: null };
    }
    gameDocRef = parentRef;

    const gameDetails = await getGameDetails(gameDocRef.id);

    if (gameDetails && rawPlayData) {
      const enrichedPlayDetail: BggPlayDetail = {
        ...rawPlayData,
        playId: lastPlayDocSnap.id,
        userId: username,
        gameBggId: gameDetails.bggId,
      };
      return { game: gameDetails, lastPlayDetail: enrichedPlayDetail };
    } else {
      return { game: null, lastPlayDetail: rawPlayData };
    }

  } catch (error) {
    return { game: null, lastPlayDetail: null };
  }
}
