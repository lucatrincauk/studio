
'use server';

import { revalidatePath } from 'next/cache';
import type { BoardGame, Review, Rating as RatingType, BggSearchResult, AugmentedReview, UserProfile, AugmentedReviewWithGame, BggPlayDetail } from './types';
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
  Query,
  QueryDocumentSnapshot,
  DocumentData,
  getCountFromServer,
  startAfter,
  endBefore,
  limitToLast,
  collectionGroup,
  Timestamp,
  or,
  and,
  arrayUnion,
  arrayRemove,
  increment,
} from 'firebase/firestore';
import { calculateCategoryAverages, calculateOverallCategoryAverage } from './utils';


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

function parseNumericValueHelper(regex: RegExp, textToSearch: string, isFloat = false): number | null {
    const match = regex.exec(textToSearch);
    if (match && match[1]) {
        const numStr = match[1];
        const num = isFloat ? parseFloat(numStr) : parseInt(numStr, 10);
        return isNaN(num) ? null : num;
    }
    return null;
}

function parseBggThingXmlToBoardGame(xmlText: string, bggIdInput: number): Partial<BoardGame> {
  const gameData: Partial<BoardGame> = { bggId: bggIdInput };

  gameData.name = decodeHtmlEntities((/<name\s+type="primary"(?:[^>]*)value="([^"]+)"(?:[^>]*)?\/>/i.exec(xmlText) || /<name(?:[^>]*)value="([^"]+)"(?:[^>]*)?\/>/i.exec(xmlText) || [])[1]?.trim() || `BGG ID ${bggIdInput}`);
  if (gameData.name === `BGG ID ${bggIdInput}` || gameData.name.trim() === "") {
    gameData.name = `BGG ID ${bggIdInput}`;
  }

  let coverArt = '';
  const imageMatch = /<image>([\s\S]*?)<\/image>/i.exec(xmlText);
  if (imageMatch && imageMatch[1]) {
      coverArt = decodeHtmlEntities(imageMatch[1].trim());
  } else {
      const thumbnailMatch = /<thumbnail>([\s\S]*?)<\/thumbnail>/i.exec(xmlText);
      if (thumbnailMatch && thumbnailMatch[1]) {
          thumbnail = decodeHtmlEntities(thumbnailMatch[1].trim());
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
       if (!name || name.trim() === "") { 
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
      const statsMatch = /<stats minplayers="(\d+)" maxplayers="(\d+)"(?:[^>]*)playingtime="(\d+)"/.exec(itemContent);
      if (statsMatch) {
          minPlayers = parseInt(statsMatch[1], 10);
          maxPlayers = parseInt(statsMatch[2], 10);
          playingTime = parseInt(statsMatch[3], 10);
      } else { 
          const minPRegex = /<stats[^>]*minplayers="(\d+)"/;
          const minPMatch = minPRegex.exec(itemContent);
          if (minPMatch && minPMatch[1]) minPlayers = parseInt(minPMatch[1], 10);

          const maxPRegex = /<stats[^>]*maxplayers="(\d+)"/;
          const maxPMatch = maxPRegex.exec(itemContent);
          if (maxPMatch && maxPMatch[1]) maxPlayers = parseInt(maxPMatch[1], 10);

          const playTRegex = /<stats[^>]*playingtime="(\d+)"/;
          const playTMatch = playTRegex.exec(itemContent);
          if (playTMatch && playTMatch[1]) playingTime = parseInt(playTMatch[1], 10);
      }
      
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
          reviewCount: 0,
          favoritedByUserIds: [],
          favoriteCount: 0,
          playlistedByUserIds: [],
          lctr01Plays: lctr01Plays,
      });
  }
  return games;
}

async function fetchWithRetry(url: string, retries = 3, delay = 1500, attempt = 1): Promise<string> {
  try {
      const response = await fetch(url, { cache: 'no-store' });
      const responseText = await response.text();
      
      if (response.status === 200) {
          const isLikelyValidCollectionOrPlays = responseText.includes('<items') || responseText.includes("<item ") || responseText.includes("<plays") || responseText.includes("<play ");
          const isThingResponse = url.includes("/thing?");
          const isLikelyValidThing = isThingResponse && (responseText.includes("<boardgames") || responseText.includes("<boardgame "));
          const isAcceptedMessage = responseText.includes("<message>Your request for task processing has been accepted</message>");

          if (isAcceptedMessage && attempt < retries) {
              await new Promise(resolve => setTimeout(resolve, Math.min(delay * attempt, 6000)));
              return fetchWithRetry(url, retries, delay, attempt + 1);
          }
          if (!isThingResponse && !isLikelyValidCollectionOrPlays && !responseText.includes("<error>") && attempt < retries && !isAcceptedMessage) {
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
          throw new Error(`BGG API Error: Status ${response.status} for URL ${url}.`);
      } else { 
          throw new Error(`BGG API did not return success status after ${retries} retries for URL ${url}. Final status: ${response.status}`);
      }
  } catch (error) {
      let isBggApiError = false;
      if (error instanceof Error) {
          const message = error.message;
          if (message.startsWith("BGG API Error:") || message.startsWith("BGG API returned an error:")) {
              isBggApiError = true;
          }
      }

      if (isBggApiError) {
          throw error; 
      } else {
          const originalErrorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`Network or unexpected error fetching BGG data for ${url}: ${originalErrorMessage}`);
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
      }
        
      const game: BoardGame = {
        id: gameId,
        name: data.name || `Gioco ${gameId} (DB)`, 
        coverArtUrl: data.coverArtUrl || `https://placehold.co/400x600.png?text=${encodeURIComponent(data.name || gameId || 'N/A')}`, 
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
        overallAverageRating: data.overallAverageRating ?? null, 
        reviewCount: data.reviewCount ?? reviews.length,
        favoritedByUserIds: data.favoritedByUserIds ?? [],
        favoriteCount: data.favoriteCount ?? 0,
        playlistedByUserIds: data.playlistedByUserIds ?? [],
        lctr01Plays: data.lctr01Plays ?? null,
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
        const url = `${BGG_API_BASE_URL}/collection?username=${username}&own=1&excludesubtype=boardgameexpansion`;
        const collectionXml = await fetchWithRetry(url);
        const games = parseBggCollectionXml(collectionXml);
        return games;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Si è verificato un errore sconosciuto durante il recupero della collezione BGG.';
        return { error: errorMessage };
    }
}

export async function getBoardGamesFromFirestoreAction(): Promise<BoardGame[] | { error: string }> {
    try {
        const querySnapshot = await getDocs(collection(db, FIRESTORE_COLLECTION_NAME));
        const games = querySnapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            return {
                id: docSnap.id,
                bggId: data.bggId || 0,
                name: data.name || "Gioco Senza Nome",
                coverArtUrl: data.coverArtUrl || `https://placehold.co/100x150.png?text=No+Image`,
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
                overallAverageRating: data.overallAverageRating ?? null, 
                reviewCount: data.reviewCount ?? 0,
                isPinned: data.isPinned || false,
                favoritedByUserIds: data.favoritedByUserIds ?? [],
                favoriteCount: data.favoriteCount ?? 0,
                playlistedByUserIds: data.playlistedByUserIds ?? [],
                lctr01Plays: data.lctr01Plays ?? null,
            } as BoardGame;
        });
        return games;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Si è verificato un errore sconosciuto.';
        return { error: `Impossibile recuperare i giochi dal database: ${errorMessage}` };
    }
}

export async function syncBoardGamesToFirestoreAction(
    gamesToAdd: BoardGame[],
    gamesToRemove: BoardGame[]
): Promise<{ success: boolean; message: string; error?: string }> {
    const batch = writeBatch(db);
    let operationsCount = 0;

    try {
        const existingGamesMap = new Map<string, Partial<BoardGame>>();
        if (gamesToAdd.length > 0) {
            const gameIdsToAdd = gamesToAdd.map(g => g.id);
            for (let i = 0; i < gameIdsToAdd.length; i += 30) { 
                const batchOfIds = gameIdsToAdd.slice(i, i + 30);
                if (batchOfIds.length > 0) {
                    const existingGamesQuery = query(collection(db, FIRESTORE_COLLECTION_NAME), where('__name__', 'in', batchOfIds));
                    const existingGamesSnapshot = await getDocs(existingGamesQuery);
                    existingGamesSnapshot.forEach(doc => {
                        const data = doc.data();
                        existingGamesMap.set(doc.id, { 
                            isPinned: data.isPinned || false,
                            minPlaytime: data.minPlaytime ?? null, 
                            maxPlaytime: data.maxPlaytime ?? null, 
                            averageWeight: data.averageWeight ?? null, 
                            categories: data.categories ?? [],
                            mechanics: data.mechanics ?? [],
                            designers: data.designers ?? [],
                            overallAverageRating: data.overallAverageRating ?? null,
                            reviewCount: data.reviewCount ?? 0,
                            favoritedByUserIds: data.favoritedByUserIds ?? [],
                            favoriteCount: data.favoriteCount ?? 0,
                            playlistedByUserIds: data.playlistedByUserIds ?? [],
                            lctr01Plays: data.lctr01Plays ?? null,
                         });
                    });
                }
            }
        }

        gamesToAdd.forEach(game => {
            if (!game.id) {
                throw new Error(`Il gioco "${game.name || 'Senza Nome'}" non ha un ID.`);
            }
            const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
            const existingData = existingGamesMap.get(game.id);

            const gameDataForFirestore: Partial<BoardGame> = { 
                bggId: game.bggId,
                name: game.name || "Unknown Name", 
                coverArtUrl: game.coverArtUrl || `https://placehold.co/100x150.png?text=No+Image`,
                yearPublished: game.yearPublished ?? null,
                minPlayers: game.minPlayers ?? null,
                maxPlayers: game.maxPlayers ?? null,
                playingTime: game.playingTime ?? null,
                minPlaytime: game.minPlaytime ?? existingData?.minPlaytime ?? game.playingTime ?? null, 
                maxPlaytime: game.maxPlaytime ?? existingData?.maxPlaytime ?? game.playingTime ?? null, 
                averageWeight: game.averageWeight ?? existingData?.averageWeight ?? null,
                categories: game.categories && game.categories.length > 0 ? game.categories : existingData?.categories ?? [],
                mechanics: game.mechanics && game.mechanics.length > 0 ? game.mechanics : existingData?.mechanics ?? [],
                designers: game.designers && game.designers.length > 0 ? game.designers : existingData?.designers ?? [],
                isPinned: existingData?.isPinned || game.isPinned || false,
                overallAverageRating: existingData?.overallAverageRating ?? null, 
                reviewCount: existingData?.reviewCount ?? 0,
                favoritedByUserIds: existingData?.favoritedByUserIds ?? [],
                favoriteCount: existingData?.favoriteCount ?? 0,
                playlistedByUserIds: existingData?.playlistedByUserIds ?? [],
                lctr01Plays: game.lctr01Plays ?? existingData?.lctr01Plays ?? null,
            };
            batch.set(gameRef, gameDataForFirestore, { merge: true }); 
            operationsCount++;
        });

        gamesToRemove.forEach(game => {
             if (!game.id) {
                throw new Error(`Il gioco "${game.name || 'Senza Nome'}" non ha un ID per la rimozione.`);
            }
            const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
            batch.delete(gameRef);
            operationsCount++;
        });

        if (operationsCount > 0) {
            await batch.commit();
        }
        
        await revalidateGameDataAction();
        return { success: true, message: `Sincronizzazione completata. ${gamesToAdd.length} giochi aggiunti/aggiornati, ${gamesToRemove.length} giochi rimossi.` };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Si è verificato un errore sconosciuto durante la sincronizzazione del database.';
        return { success: false, message: 'Sincronizzazione database fallita.', error: errorMessage };
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
                  if (isNaN(rank)) rank = Number.MAX_SAFE_INTEGER;
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
  }

  try {
      const thingUrl = `${BGG_API_BASE_URL}/thing?id=${numericBggId}&stats=1`;
      const thingXml = await fetchWithRetry(thingUrl);
      const parsedBggData = parseBggThingXmlToBoardGame(thingXml, numericBggId);
      
      if (parsedBggData.name === "Name Not Found in Details" || !parsedBggData.name || parsedBggData.name.startsWith("BGG ID")) {
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
          reviewCount: 0,
          reviews: [],
          favoritedByUserIds: [],
          favoriteCount: 0,
          playlistedByUserIds: [],
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
      const gameData = gameDoc.data() as Omit<BoardGame, 'id' | 'reviews' | 'overallAverageRating'>;
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
      };
    });
    return users;
  } catch (error) {
    return [];
  }
}

export async function getUserDetailsAndReviewsAction(
  userId: string
): Promise<{ user: UserProfile | null; reviews: AugmentedReview[] }> {
  let user: UserProfile | null = null;
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
      };
    }
  } catch (error) {
  }

  const allReviews = await getAllReviewsAction(); 
  const userReviews = allReviews.filter(review => review.userId === userId);
  
  return { user, reviews: userReviews };
}

export async function getFeaturedGamesAction(): Promise<BoardGame[]> {
  const MAX_FEATURED_GAMES = 3;
  try {
    const allGamesResult = await getBoardGamesFromFirestoreAction();
    if ('error' in allGamesResult) {
      return [];
    }

    const allGamesWithDetails: Array<BoardGame & { _latestReviewDate: Date | null }> = 
      allGamesResult.map(game => {
        return {
          ...game,
          _latestReviewDate: null, 
        };
      });
      
    const allReviews = await getAllReviewsAction();
    const gameReviewDates: Record<string, Date> = {};
    allReviews.forEach(review => {
        const existingDate = gameReviewDates[review.gameId];
        const reviewDate = new Date(review.date);
        if (!existingDate || reviewDate > existingDate) {
            gameReviewDates[review.gameId] = reviewDate;
        }
    });

    const enrichedGames = allGamesWithDetails.map(game => ({
        ...game,
        _latestReviewDate: gameReviewDates[game.id] || null,
    }));


    const pinnedGamesList = enrichedGames
      .filter(game => game.isPinned)
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .map(game => ({ ...game, featuredReason: 'pinned' as const }));

    const recentlyReviewedList = enrichedGames
      .filter(game => !game.isPinned && game._latestReviewDate !== null)
      .sort((a, b) => b._latestReviewDate!.getTime() - a._latestReviewDate!.getTime())
      .map(game => ({ ...game, featuredReason: 'recent' as const }));

    let finalFeaturedGames: BoardGame[] = [];
    const featuredGameIds = new Set<string>();

    for (const game of pinnedGamesList) {
      if (finalFeaturedGames.length < MAX_FEATURED_GAMES) {
        const { _latestReviewDate, ...gameToAdd } = game; // Destructure to remove temporary field
        finalFeaturedGames.push(gameToAdd);
        featuredGameIds.add(game.id);
      } else {
        break;
      }
    }

    if (finalFeaturedGames.length < MAX_FEATURED_GAMES) {
      for (const game of recentlyReviewedList) {
        if (finalFeaturedGames.length >= MAX_FEATURED_GAMES) {
          break;
        }
        if (!featuredGameIds.has(game.id)) {
          const { _latestReviewDate, ...gameToAdd } = game; // Destructure to remove temporary field
          finalFeaturedGames.push(gameToAdd);
          featuredGameIds.add(game.id);
        }
      }
    }
    
    return finalFeaturedGames;

  } catch (error) {
    return [];
  }
}


export async function getAllGamesAction(): Promise<BoardGame[]> {
  const result = await getBoardGamesFromFirestoreAction();
  if ('error' in result) {
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
        if (parsedBggData.name != null && parsedBggData.name !== "Name Not Found in Details" && parsedBggData.name !== "Unknown Name" && !parsedBggData.name.startsWith("BGG ID")) {
            updateData.name = parsedBggData.name;
        }
        
        if (parsedBggData.coverArtUrl != null && !parsedBggData.coverArtUrl.includes('placehold.co')) { 
            updateData.coverArtUrl = parsedBggData.coverArtUrl;
        }
        if (parsedBggData.yearPublished != null) { 
            updateData.yearPublished = parsedBggData.yearPublished;
        }
        if (parsedBggData.minPlayers != null) {
            updateData.minPlayers = parsedBggData.minPlayers;
        }
        if (parsedBggData.maxPlayers != null) {
            updateData.maxPlayers = parsedBggData.maxPlayers;
        }
        if (parsedBggData.playingTime != null) { 
            updateData.playingTime = parsedBggData.playingTime;
        }
        if (parsedBggData.minPlaytime != null) {
            updateData.minPlaytime = parsedBggData.minPlaytime;
        }
        if (parsedBggData.maxPlaytime != null) {
            updateData.maxPlaytime = parsedBggData.maxPlaytime;
        }
        if (parsedBggData.averageWeight != null) {
            updateData.averageWeight = parsedBggData.averageWeight;
        }
        if (parsedBggData.categories && parsedBggData.categories.length > 0) {
            updateData.categories = parsedBggData.categories;
        }
        if (parsedBggData.mechanics && parsedBggData.mechanics.length > 0) {
            updateData.mechanics = parsedBggData.mechanics;
        }
        if (parsedBggData.designers && parsedBggData.designers.length > 0) {
            updateData.designers = parsedBggData.designers;
        }

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
    const parsedGamesMap = new Map<number, Partial<BoardGame>>();
    const itemMatches = xmlText.matchAll(/<item\s+type="boardgame"\s+id="(\d+)"[^>]*>([\s\S]*?)<\/item>/gi);

    for (const match of itemMatches) {
        const bggId = parseInt(match[1], 10);
        const singleItemXml = match[0]; 

        if (!isNaN(bggId) && singleItemXml) {
            try {
                const parsedData = parseBggThingXmlToBoardGame(singleItemXml, bggId);
                parsedGamesMap.set(bggId, parsedData);
            } catch (e) {
            }
        }
    }
    return parsedGamesMap;
}

export async function batchUpdateMissingBggDetailsAction(): Promise<{ success: boolean; message: string; error?: string; gamesToUpdateClientSide?: Array<{ gameId: string; updateData: Partial<BoardGame>}> }> {
    const MAX_GAMES_TO_UPDATE_IN_BATCH = 20;
    const BATCH_SIZE_BGG_API = 20; 
    const BATCH_DELAY_MS = 1000; 

    try {
        const allGamesResult = await getBoardGamesFromFirestoreAction();
        if ('error' in allGamesResult) {
            return { success: false, message: allGamesResult.error, error: allGamesResult.error };
        }

        let gamesNeedingUpdate = allGamesResult.filter(game =>
            game.bggId > 0 &&
            (game.minPlaytime == null || game.maxPlaytime == null || game.averageWeight == null ||
             (game.categories && game.categories.length === 0) || 
             (game.mechanics && game.mechanics.length === 0) ||
             (game.designers && game.designers.length === 0)
            )
        );
        
        const gamesToProcessThisRun = gamesNeedingUpdate.slice(0, MAX_GAMES_TO_UPDATE_IN_BATCH);

        if (gamesToProcessThisRun.length === 0) {
            return { success: true, message: 'Nessun gioco necessita di aggiornamento dei dettagli (min/max playtime, peso, categorie, meccaniche, designer) da BGG in questo momento.' };
        }

        const gamesToUpdateClientSide: Array<{ gameId: string; updateData: Partial<BoardGame>}> = [];
        let fetchedCount = 0;
        let erroredFetchCount = 0;

        for (let i = 0; i < gamesToProcessThisRun.length; i += BATCH_SIZE_BGG_API) {
            const gameChunk = gamesToProcessThisRun.slice(i, i + BATCH_SIZE_BGG_API);
            const bggIdsInChunk = gameChunk.map(g => g.bggId).filter(id => id > 0);

            if (bggIdsInChunk.length === 0) continue;

            try {
                const thingUrl = `${BGG_API_BASE_URL}/thing?id=${bggIdsInChunk.join(',')}&stats=1`;
                const multiItemXml = await fetchWithRetry(thingUrl);
                const parsedItemsDataMap = await parseBggMultiThingXml(multiItemXml);

                for (const gameInChunk of gameChunk) {
                    const parsedBggData = parsedItemsDataMap.get(gameInChunk.bggId);
                    if (parsedBggData) {
                        const updatePayload: Partial<BoardGame> = {};
                        
                        if (parsedBggData.name != null && parsedBggData.name !== "Name Not Found in Details" && parsedBggData.name !== "Unknown Name" && (!gameInChunk.name || gameInChunk.name.startsWith("BGG Gioco ID") || gameInChunk.name.startsWith("BGG ID"))) {
                            updatePayload.name = parsedBggData.name;
                        }
                        if (parsedBggData.coverArtUrl != null && !parsedBggData.coverArtUrl.includes('placehold.co') && (!gameInChunk.coverArtUrl || gameInChunk.coverArtUrl.includes('placehold.co'))) {
                            updatePayload.coverArtUrl = parsedBggData.coverArtUrl;
                        }
                        if (parsedBggData.yearPublished != null && gameInChunk.yearPublished == null) {
                            updatePayload.yearPublished = parsedBggData.yearPublished;
                        }
                        if (parsedBggData.minPlayers != null && gameInChunk.minPlayers == null) {
                            updatePayload.minPlayers = parsedBggData.minPlayers;
                        }
                        if (parsedBggData.maxPlayers != null && gameInChunk.maxPlayers == null) {
                            updatePayload.maxPlayers = parsedBggData.maxPlayers;
                        }
                        if (parsedBggData.playingTime != null && gameInChunk.playingTime == null) {
                            updatePayload.playingTime = parsedBggData.playingTime;
                        }
                        if (parsedBggData.minPlaytime != null && gameInChunk.minPlaytime == null) {
                            updatePayload.minPlaytime = parsedBggData.minPlaytime;
                        }
                        if (parsedBggData.maxPlaytime != null && gameInChunk.maxPlaytime == null) {
                            updatePayload.maxPlaytime = parsedBggData.maxPlaytime;
                        }
                        if (parsedBggData.averageWeight != null && gameInChunk.averageWeight == null) {
                            updatePayload.averageWeight = parsedBggData.averageWeight;
                        }
                        if (parsedBggData.categories && parsedBggData.categories.length > 0 && (!gameInChunk.categories || gameInChunk.categories.length === 0)) {
                            updatePayload.categories = parsedBggData.categories;
                        }
                        if (parsedBggData.mechanics && parsedBggData.mechanics.length > 0 && (!gameInChunk.mechanics || gameInChunk.mechanics.length === 0)) {
                            updatePayload.mechanics = parsedBggData.mechanics;
                        }
                        if (parsedBggData.designers && parsedBggData.designers.length > 0 && (!gameInChunk.designers || gameInChunk.designers.length === 0)) {
                            updatePayload.designers = parsedBggData.designers;
                        }

                        if (Object.keys(updatePayload).length > 0) {
                            gamesToUpdateClientSide.push({ gameId: gameInChunk.id, updateData: updatePayload });
                            fetchedCount++;
                        }
                    }
                }
                
                if (i + BATCH_SIZE_BGG_API < gamesToProcessThisRun.length) { 
                    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
                }

            } catch (batchFetchError) {
                const chunkErrorMsg = batchFetchError instanceof Error ? batchFetchError.message : String(batchFetchError);
                erroredFetchCount += gameChunk.length; 
            }
        }
        
        let message = `${fetchedCount} giochi pronti per l'aggiornamento client-side.`;
        if (erroredFetchCount > 0) {
            message += ` ${erroredFetchCount} giochi non sono stati recuperati a causa di errori.`;
        }
        
        const gamesStillNeedingUpdateAfterThisRun = allGamesResult.filter(game =>
            game.bggId > 0 &&
            (game.minPlaytime == null || game.maxPlaytime == null || game.averageWeight == null || 
             (game.categories && game.categories.length === 0) || 
             (game.mechanics && game.mechanics.length === 0) ||
             (game.designers && game.designers.length === 0)
            ) &&
            !gamesToUpdateClientSide.some(updatedGame => updatedGame.gameId === game.id && 
                (updatedGame.updateData.minPlaytime != null || updatedGame.updateData.maxPlaytime != null || updatedGame.updateData.averageWeight != null ||
                 (updatedGame.updateData.categories && updatedGame.updateData.categories.length > 0) ||
                 (updatedGame.updateData.mechanics && updatedGame.updateData.mechanics.length > 0) ||
                 (updatedGame.updateData.designers && updatedGame.updateData.designers.length > 0)
                )
            )
        ).length;

        if (fetchedCount > 0 && gamesStillNeedingUpdateAfterThisRun === 0) {
            message += ` Tutti i giochi con dettagli mancanti sono stati arricchiti.`;
        } else if (gamesStillNeedingUpdateAfterThisRun > 0) {
             message += ` Ci sono ancora ${gamesStillNeedingUpdateAfterThisRun} giochi che potrebbero necessitare di arricchimento. Rilancia l'azione per processarli.`;
        } else if (fetchedCount === 0 && erroredFetchCount === 0 && gamesToProcessThisRun.length > 0) {
             message = `Nessun nuovo dettaglio trovato o necessario per i ${gamesToProcessThisRun.length} giochi controllati che necessitavano di arricchimento.`;
        }
        
        return { success: true, message, gamesToUpdateClientSide };

    } catch (error) {
        const errorMessage = String(error instanceof Error ? error.message : error);
        return { success: false, message: 'Recupero dettagli BGG per aggiornamento batch fallito.', error: errorMessage };
    }
}

export async function searchLocalGamesByNameAction(term: string): Promise<BoardGame[]> {
    if (!term || term.trim().length < 1) {
        return [];
    }
    try {
        const allGamesResult = await getBoardGamesFromFirestoreAction();
        if ('error' in allGamesResult) {
            return [];
        }

        const searchTermLower = term.toLowerCase();
        const matchedGames = allGamesResult
            .filter(game => game.name.toLowerCase().includes(searchTermLower))
            .map(game => ({ // Map to ensure all fields are present, even if some are null/default
                id: game.id,
                bggId: game.bggId,
                name: game.name,
                coverArtUrl: game.coverArtUrl,
                yearPublished: game.yearPublished,
                overallAverageRating: game.overallAverageRating,
                reviews: [], 
                minPlayers: game.minPlayers,
                maxPlayers: game.maxPlayers,
                playingTime: game.playingTime,
                minPlaytime: game.minPlaytime,
                maxPlaytime: game.maxPlaytime,
                averageWeight: game.averageWeight,
                reviewCount: game.reviewCount,
                isPinned: game.isPinned,
                categories: game.categories,
                mechanics: game.mechanics,
                designers: game.designers,
                favoritedByUserIds: game.favoritedByUserIds,
                favoriteCount: game.favoriteCount,
                playlistedByUserIds: game.playlistedByUserIds,
                lctr01Plays: game.lctr01Plays,
            }));
        
        matchedGames.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        return matchedGames.slice(0, 10); 

    } catch (error) {
        return [];
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
    
    if (gameId) {
        revalidatePath(`/games/${gameId}`);
        revalidatePath(`/games/${gameId}/rate`);
    }
    return { success: true, message: `Cache revalidated for relevant paths.` };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: 'Failed to revalidate cache.', error: errorMessage };
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
        bggId: data.bggId || 0,
        yearPublished: data.yearPublished ?? null,
        overallAverageRating: data.overallAverageRating ?? null,
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
        reviewCount: data.reviewCount ?? 0,
        favoritedByUserIds: data.favoritedByUserIds ?? [],
        favoriteCount: data.favoriteCount ?? 0,
        playlistedByUserIds: data.playlistedByUserIds ?? [],
        lctr01Plays: data.lctr01Plays ?? null,
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
        bggId: data.bggId || 0,
        yearPublished: data.yearPublished ?? null,
        overallAverageRating: data.overallAverageRating ?? null,
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
        reviewCount: data.reviewCount ?? 0,
        favoritedByUserIds: data.favoritedByUserIds ?? [],
        favoriteCount: data.favoriteCount ?? 0,
        playlistedByUserIds: data.playlistedByUserIds ?? [],
        lctr01Plays: data.lctr01Plays ?? null,
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
      return { error: "Recensione non trovata." };
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
      ...reviewData,
      rating: rating,
    };
    
    return augmentedReview;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Errore sconosciuto durante il recupero dei dettagli della recensione.";
    return { error: errorMessage };
  }
}

function parseBggPlaysXml(xmlText: string): BggPlayDetail[] {
  const plays: BggPlayDetail[] = [];
  const playMatches = xmlText.matchAll(/<play\s+id="(\d+)"\s+date="([^"]+)"\s+quantity="(\d+)"[^>]*>([\s\S]*?)<\/play>/gi);

  for (const playMatch of playMatches) {
    const playId = playMatch[1];
    const date = playMatch[2];
    const quantity = parseInt(playMatch[3], 10);
    const playContent = playMatch[4];

    let comments: string | null = null;
    const commentsMatch = /<comments>([\s\S]*?)<\/comments>/i.exec(playContent);
    if (commentsMatch && commentsMatch[1]) {
      comments = decodeHtmlEntities(commentsMatch[1].trim());
    }

    plays.push({
      playId,
      date,
      quantity: isNaN(quantity) ? 1 : quantity,
      comments,
    });
  }
  return plays;
}

export async function fetchGamePlaysFromBggAction(
  gameFirestoreId: string, // Changed from bggId to game's Firestore ID
  gameBggId: number,
  username: string
): Promise<{ success: boolean; plays?: BggPlayDetail[]; message?: string; error?: string }> {
  if (!gameFirestoreId || !gameBggId || isNaN(gameBggId) || !username) {
    return { success: false, message: "ID gioco non validi o nome utente mancante.", error: "Parametri non validi" };
  }

  try {
    const playsUrl = `${BGG_API_BASE_URL}/plays?username=${encodeURIComponent(username)}&id=${gameBggId}&type=thing`;
    const playsXml = await fetchWithRetry(playsUrl);

    if (!playsXml) {
      return { success: false, message: "Impossibile recuperare i dati delle partite da BGG.", error: "Risposta BGG vuota" };
    }
    
    const parsedPlays = parseBggPlaysXml(playsXml);

    if (parsedPlays.length > 0) {
      const batch = writeBatch(db);
      const playsSubCollectionRef = collection(db, FIRESTORE_COLLECTION_NAME, gameFirestoreId, `plays_${username.toLowerCase()}`);
      
      parsedPlays.forEach(play => {
        const playDocRef = doc(playsSubCollectionRef, play.playId);
        const playDataForFirestore: BggPlayDetail = {
          ...play,
          userId: username, // Or a Firebase UID if 'username' is mapped to one
          gameBggId: gameBggId,
        };
        batch.set(playDocRef, playDataForFirestore, { merge: true });
      });
      await batch.commit();
    }

    await revalidatePath(`/games/${gameFirestoreId}`); // Revalidate the game detail page

    return {
      success: true,
      plays: parsedPlays,
      message: `Caricate e salvate ${parsedPlays.length} partite da BGG per ${username}.`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Si è verificato un errore sconosciuto durante il recupero o salvataggio delle partite da BGG.';
    return { success: false, message: 'Operazione fallita.', error: errorMessage };
  }
}

