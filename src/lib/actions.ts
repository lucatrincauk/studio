
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

      let lctr01Plays: number | null = null;
      const numPlaysMatch = /<numplays>(\d+)<\/numplays>/i.exec(itemContent);
      if (numPlaysMatch && numPlaysMatch[1]) {
          lctr01Plays = parseInt(numPlaysMatch[1], 10);
          if (isNaN(lctr01Plays)) lctr01Plays = null;
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
          lctr01Plays: lctr01Plays,
      });
  }
  return games;
}

function parseBggThingXmlToBoardGame(xmlText: string, bggIdInput: number): Partial<BoardGame> {
    const gameData: Partial<BoardGame> = { bggId: bggIdInput };

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
    gameData.averageWeight = parseNumericValueHelper(/<averageweight\s+value="([\d\.]+)"\s*\/?>/i, xmlText, true);

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
    
    return gameData;
}

async function fetchWithRetry(url: string, retries = 3, delay = 1500, attempt = 1): Promise<string> {
  try {
      const response = await fetch(url, { cache: 'no-store' });
      const responseText = await response.text();

      if (response.status === 200) {
          const isLikelyValidResponse = responseText.includes('<items') || responseText.includes("<item ") || responseText.includes("<plays") || responseText.includes("<play ");
          const isThingResponse = url.includes("/thing?");
          const isAcceptedMessage = responseText.includes("<message>Your request for task processing has been accepted</message>");

          if (isAcceptedMessage && attempt < retries) {
              await new Promise(resolve => setTimeout(resolve, Math.min(delay * attempt, 6000)));
              return fetchWithRetry(url, retries, delay, attempt + 1);
          }
          if(!isThingResponse && !isLikelyValidResponse && !responseText.includes("<error>") && attempt < retries && !isAcceptedMessage) {
              await new Promise(resolve => setTimeout(resolve, Math.min(delay * attempt, 6000)));
              return fetchWithRetry(url, retries, delay, attempt + 1);
          }
          if(responseText.includes("<error>")){
              throw new Error(`BGG API returned an error: ${responseText.substring(0, 200)}`);
          }
          return responseText;
      } else if (response.status === 202 && attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, Math.min(delay * attempt, 6000)));
          return fetchWithRetry(url, retries, delay, attempt + 1);
      } else if (response.status !== 200 && response.status !== 202) {
          throw new Error(`BGG API Error: Status ${response.status} for URL ${url}. Response: ${responseText.substring(0,500)}`);
      } else {
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

    if (isBggApiError) {
        throw error; 
    } else {
      throw new Error(`Network or unexpected error fetching BGG data for ${url}: ${errorMessage}`);
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
            excitedToReplay: reviewData.rating?.excitedToReplay || 0,
            mentallyStimulating: reviewData.rating?.mentallyStimulating || 0,
            fun: reviewData.rating?.fun || 0,
            decisionDepth: reviewData.rating?.decisionDepth || 0,
            replayability: reviewData.rating?.replayability || 0,
            luck: reviewData.rating?.luck || 0,
            lengthDowntime: reviewData.rating?.lengthDowntime || 0,
            graphicDesign: reviewData.rating?.graphicDesign || 0,
            componentsThemeLore: reviewData.rating?.componentsThemeLore || 0,
            effortToLearn: reviewData.rating?.effortToLearn || 0,
            setupTeardown: reviewData.rating?.setupTeardown || 0,
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
          console.warn(`Warning: Could not fetch reviews for game ${gameId}:`, reviewError);
      }

      let lctr01PlayDetails: BggPlayDetail[] = [];
      try {
        const playsCollectionRef = collection(db, FIRESTORE_COLLECTION_NAME, gameId, 'plays_lctr01');
        const playsQuery = query(playsCollectionRef, orderBy("date", "desc"));
        const playsSnapshot = await getDocs(playsQuery);
        lctr01PlayDetails = playsSnapshot.docs.map(playDoc => playDoc.data() as BggPlayDetail);
      } catch (playError) {
         console.warn(`Warning: Could not fetch plays for game ${gameId}:`, playError);
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
    console.error(`Error fetching game details for ${gameId}:`, error);
    return null;
  }
}

export async function fetchBggUserCollectionAction(username: string): Promise<BoardGame[] | { error: string }> {
    try {
        const url = `${BGG_API_BASE_URL}/collection?username=${username}&own=1&excludesubtype=boardgameexpansion`;
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
        let voteCount = data.voteCount === undefined ? 0 : data.voteCount;

        if (!skipRatingCalculation && (data.overallAverageRating === undefined || data.voteCount === undefined)) { 
            try {
              const reviewsCollectionRef = collection(db, FIRESTORE_COLLECTION_NAME, docSnap.id, 'reviews');
              const reviewsSnapshot = await getDocs(reviewsCollectionRef);
              const allReviewsForGame: Review[] = reviewsSnapshot.docs.map(reviewDoc => {
                  const reviewData = reviewDoc.data();
                  const rating: RatingType = {
                      excitedToReplay: reviewData.rating?.excitedToReplay || 0,
                      mentallyStimulating: reviewData.rating?.mentallyStimulating || 0,
                      fun: reviewData.rating?.fun || 0,
                      decisionDepth: reviewData.rating?.decisionDepth || 0,
                      replayability: reviewData.rating?.replayability || 0,
                      luck: reviewData.rating?.luck || 0,
                      lengthDowntime: reviewData.rating?.lengthDowntime || 0,
                      graphicDesign: reviewData.rating?.graphicDesign || 0,
                      componentsThemeLore: reviewData.rating?.componentsThemeLore || 0,
                      effortToLearn: reviewData.rating?.effortToLearn || 0,
                      setupTeardown: reviewData.rating?.setupTeardown || 0,
                  };
                  return { id: reviewDoc.id, ...reviewData, rating } as Review;
              });

              const categoryAvgs = calculateCatAvgsFromUtils(allReviewsForGame);
              overallAverageRating = categoryAvgs ? calculateGlobalOverallAverage(categoryAvgs) : null;
              voteCount = allReviewsForGame.length;
            } catch (e) {
              // Default to null/0 if review fetching fails for a specific game
              overallAverageRating = null;
              voteCount = 0;
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
            categories: data.categories ?? [],
            mechanics: data.mechanics ?? [],
            designers: data.designers ?? [],
            reviews: [], 
            overallAverageRating: overallAverageRating,
            voteCount: voteCount,
            isPinned: data.isPinned || false,
            favoritedByUserIds: data.favoritedByUserIds ?? [],
            favoriteCount: data.favoriteCount ?? 0,
            playlistedByUserIds: data.playlistedByUserIds ?? [],
            morchiaByUserIds: data.morchiaByUserIds ?? [],
            morchiaCount: data.morchiaCount ?? 0,
            lctr01Plays: data.lctr01Plays === undefined ? null : data.lctr01Plays,
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
              console.error(`Error fetching details for BGG ID ${item.bggId}:`, e);
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
     console.warn("Error checking for existing game during import:", dbError)
  }

  try {
      const thingUrl = `${BGG_API_BASE_URL}/thing?id=${numericBggId}&stats=1`;
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

      await revalidateGameDataAction(existingGameId);
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
            excitedToReplay: reviewData.rating?.excitedToReplay || 0,
            mentallyStimulating: reviewData.rating?.mentallyStimulating || 0,
            fun: reviewData.rating?.fun || 0,
            decisionDepth: reviewData.rating?.decisionDepth || 0,
            replayability: reviewData.rating?.replayability || 0,
            luck: reviewData.rating?.luck || 0,
            lengthDowntime: reviewData.rating?.lengthDowntime || 0,
            graphicDesign: reviewData.rating?.graphicDesign || 0,
            componentsThemeLore: reviewData.rating?.componentsThemeLore || 0,
            effortToLearn: reviewData.rating?.effortToLearn || 0,
            setupTeardown: reviewData.rating?.setupTeardown || 0,
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
    console.error("Error fetching all reviews:", error);
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
      };
    });
    return users;
  } catch (error) {
    console.error("Error fetching all users:", error);
    return [];
  }
}

export async function getUserDetailsAndReviewsAction(
  userId: string
): Promise<{ user: UserProfile | null; reviews: AugmentedReview[]; badges: EarnedBadge[] }> {
  let user: UserProfile | null = null;
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
      };

      // Fetch earned badges for this user
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
  } catch (error) {
    console.error("Error fetching user profile for user:", userId, error);
  }

  const allReviews = await getAllReviewsAction();
  const userReviews = allReviews.filter(review => review.userId === userId);

  return { user, reviews: userReviews, badges };
}

export async function getFeaturedGamesAction(): Promise<BoardGame[]> {
  try {
    const allGamesResult = await getBoardGamesFromFirestoreAction({ skipRatingCalculation: false });
    if ('error' in allGamesResult) {
      console.error("Error fetching all games for featured:", allGamesResult.error);
      return [];
    }

    const gamesWithDetailsAndLatestReview: Array<BoardGame & { _latestReviewDate?: Date | null; featuredReason?: 'pinned' | 'recent' }> = [];

    for (const game of allGamesResult) {
      let latestReviewDate: Date | null = null;
      if (game.voteCount && game.voteCount > 0) {
        // This query is per game, could be slow if many games have reviews.
        // Consider denormalizing latestReviewDate onto the game document if performance is an issue.
        try {
          const reviewsCollectionRef = collection(db, FIRESTORE_COLLECTION_NAME, game.id, 'reviews');
          const q = query(reviewsCollectionRef, orderBy("date", "desc"), limit(1));
          const reviewsSnapshot = await getDocs(q);
          if (!reviewsSnapshot.empty) {
            const latestReviewData = reviewsSnapshot.docs[0].data();
            if (latestReviewData.date) {
              latestReviewDate = new Date(latestReviewData.date);
            }
          }
        } catch (reviewFetchError) {
          console.warn(`Could not fetch reviews for game ${game.id} while determining featured games:`, reviewFetchError);
        }
      }
      gamesWithDetailsAndLatestReview.push({ ...game, _latestReviewDate: latestReviewDate });
    }

    const pinnedGames = gamesWithDetailsAndLatestReview
      .filter(game => game.isPinned)
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .map(game => ({ ...game, featuredReason: 'pinned' as const }));

    const recentlyReviewedGames = gamesWithDetailsAndLatestReview
      .filter(game => !game.isPinned && game._latestReviewDate)
      .sort((a, b) => b._latestReviewDate!.getTime() - a._latestReviewDate!.getTime())
      .map(game => ({ ...game, featuredReason: 'recent' as const }));

    const finalFeaturedGames: Array<BoardGame> = [];
    const featuredGameIds = new Set<string>();

    // Add pinned games first
    for (const game of pinnedGames) {
      if (game.id && !featuredGameIds.has(game.id) && finalFeaturedGames.length < 3) {
        const { _latestReviewDate, ...gameToAdd } = game;
        finalFeaturedGames.push(gameToAdd);
        featuredGameIds.add(game.id);
      }
    }

    // Fill remaining spots with recently reviewed (non-pinned) games
    if (finalFeaturedGames.length < 3) {
      for (const game of recentlyReviewedGames) {
        if (finalFeaturedGames.length >= 3) break;
        if (game.id && !featuredGameIds.has(game.id)) {
          const { _latestReviewDate, ...gameToAdd } = game;
          finalFeaturedGames.push(gameToAdd);
          featuredGameIds.add(game.id);
        }
      }
    }
    return finalFeaturedGames;
  } catch (error) {
    console.error("Error in getFeaturedGamesAction:", error);
    return [];
  }
}

export async function getAllGamesAction(options: { skipRatingCalculation?: boolean } = {}): Promise<BoardGame[]> {
  const result = await getBoardGamesFromFirestoreAction(options);
  if ('error' in result) {
    console.error("Error fetching games for getAllGamesAction:", result.error);
    return [];
  }
  return result;
}

export async function fetchAndUpdateBggGameDetailsAction(bggId: number): Promise<{ success: boolean; message: string; error?: string; updateData?: Partial<BoardGame> }> {
    if (!bggId || isNaN(bggId)) {
        return { success: false, message: "ID BGG non valido fornito.", error: "ID BGG non valido" };
    }

    try {
        const thingUrl = `${BGG_API_BASE_URL}/thing?id=${bggId}&stats=1`;
        const thingXml = await fetchWithRetry(thingUrl);

        if (!thingXml) {
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
        if (parsedBggData.categories && parsedBggData.categories.length > 0) updateData.categories = parsedBggData.categories;
        if (parsedBggData.mechanics && parsedBggData.mechanics.length > 0) updateData.mechanics = parsedBggData.mechanics;
        if (parsedBggData.designers && parsedBggData.designers.length > 0) updateData.designers = parsedBggData.designers;

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
            const gameDetails = parseBggThingXmlToBoardGame(itemContent, bggId); 
            itemsMap.set(bggId, gameDetails);
        }
    }
    return itemsMap;
}

export async function batchUpdateMissingBggDetailsAction(): Promise<{ success: boolean; message: string; error?: string; gamesToUpdateClientSide?: Array<{ gameId: string; updateData: Partial<BoardGame>}> }> {
    const MAX_GAMES_TO_UPDATE_IN_BATCH = 20;
    const BGG_API_BATCH_SIZE = 10; 
    const BGG_API_DELAY_MS = 2000;

    try {
        const allGamesResult = await getBoardGamesFromFirestoreAction({ skipRatingCalculation: true }); 
        if ('error' in allGamesResult) {
            return { success: false, message: allGamesResult.error, error: allGamesResult.error };
        }

        const gamesNeedingUpdate = allGamesResult.filter(game => {
            if (!game.bggId || game.bggId <= 0) return false;
            const isNamePlaceholder = game.name?.startsWith("BGG Gioco ID") || game.name?.startsWith("BGG ID") || game.name === "Name Not Found in Details";
            const isCoverPlaceholder = game.coverArtUrl?.includes("placehold.co");
            const isCoverThumbnail = game.coverArtUrl?.includes("_thumb") && game.coverArtUrl?.includes("cf.geekdo-images.com");

            return game.minPlaytime == null || 
                   game.maxPlaytime == null || 
                   game.averageWeight == null ||
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

        const gamesToProcessThisRun = gamesNeedingUpdate.slice(0, MAX_GAMES_TO_UPDATE_IN_BATCH);

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
                const thingUrl = `${BGG_API_BASE_URL}/thing?id=${bggIdsInChunk.join(',')}&stats=1`;
                const multiItemXml = await fetchWithRetry(thingUrl);
                const parsedItemsDataMap = await parseBggMultiThingXml(multiItemXml);

                for (const gameInChunk of gameChunk) {
                    if(!gameInChunk.bggId) continue; 
                    const parsedBggData = parsedItemsDataMap.get(gameInChunk.bggId);
                    if (parsedBggData) {
                        const updatePayload: Partial<BoardGame> = {};
                        const isCurrentNamePlaceholder = gameInChunk.name?.startsWith("BGG Gioco ID") || gameInChunk.name?.startsWith("BGG ID") || gameInChunk.name === "Name Not Found in Details";
                        const isCurrentCoverPlaceholder = gameInChunk.coverArtUrl?.includes("placehold.co");
                        const isCurrentCoverThumbnail = gameInChunk.coverArtUrl?.includes("_thumb") && gameInChunk.coverArtUrl?.includes("cf.geekdo-images.com");

                        if (parsedBggData.name != null && parsedBggData.name !== "Name Not Found in Details" && !parsedBggData.name.startsWith("BGG ID") && (gameInChunk.name == null || isCurrentNamePlaceholder)) {
                            updatePayload.name = parsedBggData.name;
                        }
                        if (parsedBggData.coverArtUrl != null && !parsedBggData.coverArtUrl.includes('placehold.co') && !parsedBggData.coverArtUrl.includes('_thumb') && (gameInChunk.coverArtUrl == null || isCurrentCoverPlaceholder || isCurrentCoverThumbnail)) {
                            updatePayload.coverArtUrl = parsedBggData.coverArtUrl;
                        }
                        if (parsedBggData.yearPublished != null && gameInChunk.yearPublished == null) updatePayload.yearPublished = parsedBggData.yearPublished;
                        if (parsedBggData.minPlayers != null && gameInChunk.minPlayers == null) updatePayload.minPlayers = parsedBggData.minPlayers;
                        if (parsedBggData.maxPlayers != null && gameInChunk.maxPlayers == null) updatePayload.maxPlayers = parsedBggData.maxPlayers;
                        if (parsedBggData.playingTime != null && gameInChunk.playingTime == null) updatePayload.playingTime = parsedBggData.playingTime;
                        if (parsedBggData.minPlaytime != null && gameInChunk.minPlaytime == null) updatePayload.minPlaytime = parsedBggData.minPlaytime;
                        if (parsedBggData.maxPlaytime != null && gameInChunk.maxPlaytime == null) updatePayload.maxPlaytime = parsedBggData.maxPlaytime;
                        if (parsedBggData.averageWeight != null && gameInChunk.averageWeight == null) updatePayload.averageWeight = parsedBggData.averageWeight;
                        if (parsedBggData.categories && parsedBggData.categories.length > 0 && (gameInChunk.categories == null || gameInChunk.categories.length === 0)) updatePayload.categories = parsedBggData.categories;
                        if (parsedBggData.mechanics && parsedBggData.mechanics.length > 0 && (gameInChunk.mechanics == null || gameInChunk.mechanics.length === 0)) updatePayload.mechanics = parsedBggData.mechanics;
                        if (parsedBggData.designers && parsedBggData.designers.length > 0 && (gameInChunk.designers == null || gameInChunk.designers.length === 0)) updatePayload.designers = parsedBggData.designers;

                        if (Object.keys(updatePayload).length > 0) {
                            gamesToUpdateClientSide.push({ gameId: gameInChunk.id, updateData: updatePayload });
                            fetchedCount++;
                        }
                    }
                }

                if (i + BGG_API_BATCH_SIZE < gamesToProcessThisRun.length) {
                    await new Promise(resolve => setTimeout(resolve, BGG_API_DELAY_MS));
                }

            } catch (batchFetchError) {
                console.error("Error fetching BGG data for batch:", batchFetchError);
                erroredFetchCount += gameChunk.length;
            }
        }

        let message = `${fetchedCount} giochi pronti per l'aggiornamento client-side.`;
        if (erroredFetchCount > 0) {
            message += ` ${erroredFetchCount} giochi non sono stati recuperati a causa di errori.`;
        }

        const totalGamesStillNeedingUpdateAfterThisRun = gamesNeedingUpdate.filter(game => {
            const processedThisRun = gamesToProcessThisRun.some(p => p.id === game.id);
            if (processedThisRun) {
                const updateForThisGame = gamesToUpdateClientSide.find(u => u.gameId === game.id);
                if (updateForThisGame) { 
                    const tempUpdatedGame = { ...game, ...updateForThisGame.updateData };
                    const isNamePlaceholder = tempUpdatedGame.name?.startsWith("BGG Gioco ID") || tempUpdatedGame.name?.startsWith("BGG ID") || tempUpdatedGame.name === "Name Not Found in Details";
                    const isCoverPlaceholder = tempUpdatedGame.coverArtUrl?.includes("placehold.co");
                    const isCoverThumbnail = tempUpdatedGame.coverArtUrl?.includes("_thumb") && tempUpdatedGame.coverArtUrl?.includes("cf.geekdo-images.com");
                    return tempUpdatedGame.minPlaytime == null || tempUpdatedGame.maxPlaytime == null || tempUpdatedGame.averageWeight == null || tempUpdatedGame.yearPublished == null || tempUpdatedGame.minPlayers == null || tempUpdatedGame.maxPlayers == null || tempUpdatedGame.playingTime == null || (tempUpdatedGame.categories == null || tempUpdatedGame.categories.length === 0) || (tempUpdatedGame.mechanics == null || tempUpdatedGame.mechanics.length === 0) || (tempUpdatedGame.designers == null || tempUpdatedGame.designers.length === 0) || isNamePlaceholder || isCoverPlaceholder || isCoverThumbnail;
                }
                return false; 
            }
            return true; 
        }).length;


        if (fetchedCount > 0 && totalGamesStillNeedingUpdateAfterThisRun <= 0 && erroredFetchCount === 0) {
            message += ` Tutti i giochi con dettagli mancanti dovrebbero essere stati arricchiti.`;
        } else if (totalGamesStillNeedingUpdateAfterThisRun > 0) {
             message += ` Ci sono ancora ${totalGamesStillNeedingUpdateAfterThisRun} giochi che potrebbero necessitare di arricchimento. Rilancia l'azione per processarli.`;
        } else if (fetchedCount === 0 && erroredFetchCount === 0 && gamesToProcessThisRun.length > 0) {
             message = `Nessun nuovo dettaglio trovato o necessario per i ${gamesToProcessThisRun.length} giochi controllati.`;
        }
        
        return { success: true, message, gamesToUpdateClientSide };

    } catch (error) {
        const errorMessage = String(error instanceof Error ? error.message : error);
        return { success: false, message: 'Arricchimento batch dei dettagli BGG fallito.', error: errorMessage };
    }
}

export async function searchLocalGamesByNameAction(term: string): Promise<Pick<BoardGame, 'id' | 'name' | 'yearPublished' | 'coverArtUrl' | 'overallAverageRating' | 'bggId'>[] | { error: string }> {
  if (!term || term.length < 2) {
    return [];
  }
  try {
    // Fetch all games but skip heavy calculations
    const allGamesResult = await getBoardGamesFromFirestoreAction({ skipRatingCalculation: true }); 
    if ('error' in allGamesResult) {
      return { error: allGamesResult.error };
    }

    const searchTermLower = term.toLowerCase();
    const matchedGames = allGamesResult
      .filter(game => game.name && game.name.toLowerCase().includes(searchTermLower))
      .map(game => ({
        id: game.id,
        name: game.name,
        yearPublished: game.yearPublished ?? undefined,
        coverArtUrl: game.coverArtUrl,
        overallAverageRating: game.overallAverageRating, 
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
        reviews: [],
        minPlayers: data.minPlayers ?? null,
        maxPlayers: data.maxPlayers ?? null,
        playingTime: data.playingTime ?? null,
        minPlaytime: data.minPlaytime ?? null,
        maxPlaytime: data.maxPlaytime ?? null,
        averageWeight: data.averageWeight ?? null,
        categories: data.categories ?? [],
        mechanics: data.mechanics ?? [],
        designers: data.designers ?? [],
        isPinned: data.isPinned ?? false,
        voteCount: data.voteCount === undefined ? 0 : data.voteCount,
        favoritedByUserIds: data.favoritedByUserIds ?? [],
        favoriteCount: data.favoriteCount ?? 0,
        playlistedByUserIds: data.playlistedByUserIds ?? [],
        morchiaByUserIds: data.morchiaByUserIds ?? [],
        morchiaCount: data.morchiaCount ?? 0,
        lctr01Plays: data.lctr01Plays === undefined ? null : data.lctr01Plays,
      };
    });
    return games.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } catch (error) {
    console.error("Error fetching favorited games:", error);
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
        reviews: [],
        minPlayers: data.minPlayers ?? null,
        maxPlayers: data.maxPlayers ?? null,
        playingTime: data.playingTime ?? null,
        minPlaytime: data.minPlaytime ?? null,
        maxPlaytime: data.maxPlaytime ?? null,
        averageWeight: data.averageWeight ?? null,
        categories: data.categories ?? [],
        mechanics: data.mechanics ?? [],
        designers: data.designers ?? [],
        isPinned: data.isPinned ?? false,
        voteCount: data.voteCount === undefined ? 0 : data.voteCount,
        favoritedByUserIds: data.favoritedByUserIds ?? [],
        favoriteCount: data.favoriteCount ?? 0,
        playlistedByUserIds: data.playlistedByUserIds ?? [],
        morchiaByUserIds: data.morchiaByUserIds ?? [],
        morchiaCount: data.morchiaCount ?? 0,
        lctr01Plays: data.lctr01Plays === undefined ? null : data.lctr01Plays,
      };
    });
    return games.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } catch (error) {
    console.error("Error fetching playlisted games:", error);
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
        reviews: [],
        minPlayers: data.minPlayers ?? null,
        maxPlayers: data.maxPlayers ?? null,
        playingTime: data.playingTime ?? null,
        minPlaytime: data.minPlaytime ?? null,
        maxPlaytime: data.maxPlaytime ?? null,
        averageWeight: data.averageWeight ?? null,
        categories: data.categories ?? [],
        mechanics: data.mechanics ?? [],
        designers: data.designers ?? [],
        isPinned: data.isPinned ?? false,
        voteCount: data.voteCount === undefined ? 0 : data.voteCount,
        favoritedByUserIds: data.favoritedByUserIds ?? [],
        favoriteCount: data.favoriteCount ?? 0,
        playlistedByUserIds: data.playlistedByUserIds ?? [],
        morchiaByUserIds: data.morchiaByUserIds ?? [],
        morchiaCount: data.morchiaCount ?? 0,
        lctr01Plays: data.lctr01Plays === undefined ? null : data.lctr01Plays,
      };
    });
    return games.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } catch (error) {
    console.error("Error fetching morchia games:", error);
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
      excitedToReplay: reviewData.rating?.excitedToReplay || 0,
      mentallyStimulating: reviewData.rating?.mentallyStimulating || 0,
      fun: reviewData.rating?.fun || 0,
      decisionDepth: reviewData.rating?.decisionDepth || 0,
      replayability: reviewData.rating?.replayability || 0,
      luck: reviewData.rating?.luck || 0,
      lengthDowntime: reviewData.rating?.lengthDowntime || 0,
      graphicDesign: reviewData.rating?.graphicDesign || 0,
      componentsThemeLore: reviewData.rating?.componentsThemeLore || 0,
      effortToLearn: reviewData.rating?.effortToLearn || 0,
      setupTeardown: reviewData.rating?.setupTeardown || 0,
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
    console.error("Error fetching single review details:", error);
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

export async function fetchUserPlaysForGameFromBggAction(
  gameBggId: number,
  username: string
): Promise<{ success: boolean; plays?: BggPlayDetail[]; message?: string; error?: string }> {
  
  if (typeof gameBggId !== 'number' || isNaN(gameBggId) || gameBggId <= 0 || !username || typeof username !== 'string' || username.trim() === '') {
    const errorMsg = `Parametri non validi per l'azione: gameBggId=${gameBggId} (type: ${typeof gameBggId}), username=${username}`;
    console.error("[SERVER ACTION ERROR] fetchUserPlaysForGameFromBggAction:", errorMsg);
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
        message: `Caricate ${parsedPlays.length} partite da BGG per ${username}.`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Si è verificato un errore sconosciuto durante il recupero delle partite da BGG.';
    return { success: false, message: 'Operazione fallita.', error: errorMessage };
  }
}

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
    console.error("Error fetching all user plays from Firestore:", error);
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
      const gameWithOnlyLastPlay = {
        ...gameDetails,
        lctr01PlayDetails: [enrichedPlayDetail] 
      };
      return { game: gameWithOnlyLastPlay, lastPlayDetail: enrichedPlayDetail };
    } else {
      return { game: null, lastPlayDetail: rawPlayData }; 
    }

  } catch (error) {
    console.error("Error in getLastPlayedGameAction:", error, error instanceof Error ? error.stack : '');
    return { game: null, lastPlayDetail: null };
  }
}
   
  