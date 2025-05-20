
'use server';

import { revalidatePath } from 'next/cache';
import type { BoardGame, Review, Rating, BggSearchResult, AugmentedReview, UserProfile } from './types';
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
} from 'firebase/firestore';
import { calculateCategoryAverages, calculateOverallCategoryAverage } from './utils';


const BGG_API_BASE_URL = 'https://boardgamegeek.com/xmlapi2';
const FIRESTORE_COLLECTION_NAME = 'boardgames_collection';
const USER_PROFILES_COLLECTION = 'user_profiles';

// --- Helper Functions for BGG XML Parsing ---
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

async function parseBggThingXmlToBoardGame(xmlText: string, bggIdInput: number): Promise<Partial<BoardGame>> {
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
  
  const nameMatches = Array.from(xmlText.matchAll(/<name\s+type="(primary|alternate)"(?:[^>]*)value="([^"]+)"(?:[^>]*)?\/>/gi));
  const nameElementsForParsing = nameMatches.map(match => ({
      type: match[1],
      value: match[2],
  }));

  let primaryName = "Name Not Found in Details";
  const primary = nameElementsForParsing.find(n => n.type?.toLowerCase() === 'primary' && n.value && n.value.trim());
  if (primary && primary.value) {
      primaryName = decodeHtmlEntities(primary.value.trim());
  } else {
      const alternate = nameElementsForParsing.find(n => n.type?.toLowerCase() === 'alternate' && n.value && n.value.trim());
      if (alternate && alternate.value) {
          primaryName = decodeHtmlEntities(alternate.value.trim());
      } else if (nameElementsForParsing[0] && nameElementsForParsing[0].value && nameElementsForParsing[0].value.trim()) {
          primaryName = decodeHtmlEntities(nameElementsForParsing[0].value.trim());
      }
  }
  gameData.name = (!primaryName || primaryName.trim() === "" || primaryName === "Name Not Found in Details") ? `BGG ID ${bggIdInput}` : primaryName;

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
      
  if (gameData.playingTime != null && gameData.minPlaytime == null) { 
      gameData.minPlaytime = gameData.playingTime;
  }
  if (gameData.playingTime != null && gameData.maxPlaytime == null) {
      gameData.maxPlaytime = gameData.playingTime;
  }
  
  return gameData;
}

async function parseBggSearchXml(xmlText: string): Promise<BggSearchResult[]> {
  const results: BggSearchResult[] = [];
  const processedBggIds = new Set<number>();
  const itemMatches = xmlText.matchAll(/<item type="boardgame" id="(\d+?)">([\s\S]*?)<\/item>/g);

  for (const itemMatch of itemMatches) {
      const idStr = itemMatch[1];
      const bggIdNum = parseInt(idStr, 10);
      if (isNaN(bggIdNum) || processedBggIds.has(bggIdNum)) {
          continue;
      }
      processedBggIds.add(bggIdNum);
      const itemContent = itemMatch[2];

      let name = 'Unknown Name';
      const primaryNameMatch = /<name type="primary" sortindex="\d+" value="([^"]+?)"\s*\/>/.exec(itemContent);
      if (primaryNameMatch && primaryNameMatch[1]) {
          name = decodeHtmlEntities(primaryNameMatch[1]);
      } else {
          const anyNameMatch = /<name value="([^"]+?)"\s*\/>/.exec(itemContent); 
          if (anyNameMatch && anyNameMatch[1]) {
              name = decodeHtmlEntities(anyNameMatch[1]);
          }
      }
      if (!name || name === "Unknown Name" || name === "Name Not Found in Details") {
          name = `BGG ID ${idStr}`;
      }

      let yearPublished: number | undefined;
      const yearMatch = /<yearpublished\s+value="(\d+)"(?:[^>]*)\/?>/i.exec(itemContent);
      if (yearMatch && yearMatch[1]) {
          yearPublished = parseInt(yearMatch[1], 10);
      }
      results.push({ bggId: idStr, name, yearPublished, rank: Number.MAX_SAFE_INTEGER });
  }
  return results;
}

async function parseBggCollectionXml(xmlText: string): Promise<BoardGame[]> {
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
          reviews: [],
          isPinned: false,
          overallAverageRating: null,
      });
  }
  return games;
}


// --- Server Actions ---

export async function searchBggGamesAction(searchTerm: string): Promise<BggSearchResult[] | { error: string }> {
  if (!searchTerm.trim()) {
      return { error: 'Il termine di ricerca non può essere vuoto.' };
  }
  try {
      const searchUrl = `${BGG_API_BASE_URL}/search?query=${encodeURIComponent(searchTerm)}&type=boardgame`;
      const searchXml = await fetchWithRetry(searchUrl);
      const basicResults = await parseBggSearchXml(searchXml);

      if (!Array.isArray(basicResults) || basicResults.length === 0) {
          return [];
      }
      const limitedResults = basicResults.slice(0, 10); 

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

              const detailedGameData = await parseBggThingXmlToBoardGame(thingXml, parseInt(item.bggId));

              let finalName = detailedGameData.name;
              if (!finalName || finalName === "Name Not Found in Details" || finalName.startsWith("BGG ID")) {
                  finalName = item.name; 
              }
               if (!finalName || finalName === "Name Not Found in Details" ) { 
                  finalName = `BGG ID ${item.bggId}`;
              }
              return { bggId: item.bggId, name: finalName, yearPublished: detailedGameData.yearPublished || item.yearPublished, rank };
          } catch (e) {
              return { ...item, name: item.name || `BGG ID ${item.bggId}`, rank: Number.MAX_SAFE_INTEGER }; 
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
    // console.error("Errore durante il controllo del gioco esistente nel DB:", dbError);
  }

  try {
      const thingUrl = `${BGG_API_BASE_URL}/thing?id=${numericBggId}&stats=1`;
      const thingXml = await fetchWithRetry(thingUrl);
      const parsedBggData = await parseBggThingXmlToBoardGame(thingXml, numericBggId);
      
      if (parsedBggData.name === "Name Not Found in Details" || !parsedBggData.name || parsedBggData.name.startsWith("BGG ID")) {
          return { error: 'Dettagli essenziali del gioco (nome) mancanti dalla risposta BGG.' };
      }

      const newGameForFirestore: Partial<BoardGame> & { bggId: number; name: string; isPinned: boolean, overallAverageRating: null } = {
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
          isPinned: false, 
          overallAverageRating: null,
      };

      try {
          const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, existingGameId);
          await setDoc(gameRef, newGameForFirestore);
      } catch (dbError) {
          const errorMessage = dbError instanceof Error ? dbError.message : String(dbError);
          return { error: `Impossibile salvare il gioco nel database: ${errorMessage}` };
      }

      revalidatePath('/admin/collection');
      revalidatePath('/all-games');
      revalidatePath(`/games/${existingGameId}/rate`);
      return { gameId: existingGameId };

  } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Si è verificato un errore sconosciuto durante l\'importazione BGG.';
      return { error: `Errore API BGG: ${errorMessage}` };
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
          const rating: Rating = {
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
        // console.error(`[GETGAMEDETAILS] Error fetching reviews for gameId: "${gameId}":`, reviewError);
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
        reviews: reviews,
        isPinned: data.isPinned || false,
        overallAverageRating: data.overallAverageRating ?? null, 
      };
      return game;
    } else {
      return null;
    }
  } catch (error) {
    return null;
  }
}

async function fetchWithRetry(url: string, retries = 3, delay = 1500, attempt = 1): Promise<string> {
  try {
      const response = await fetch(url, { cache: 'no-store' });
      
      if (response.status === 200) {
          const xmlText = await response.text();
           if ((!xmlText.includes('<items') && !xmlText.includes("<item ") && !xmlText.includes("<error>") && attempt < retries && !xmlText.includes("<boardgames") && !xmlText.includes("<boardgame ") && !xmlText.includes("<message>Your request for task processing has been accepted")) && !url.includes("/thing?")) { 
              await new Promise(resolve => setTimeout(resolve, Math.min(delay * attempt, 6000))); 
              return fetchWithRetry(url, retries, delay, attempt + 1);
          }
          if(xmlText.includes("<error>")){
              throw new Error(`BGG API returned an error: ${xmlText.substring(0, 200)}`);
          }
          return xmlText;
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

export async function fetchBggUserCollectionAction(username: string): Promise<BoardGame[] | { error: string }> {
    try {
        const url = `${BGG_API_BASE_URL}/collection?username=${username}&own=1&excludesubtype=boardgameexpansion`;
        const collectionXml = await fetchWithRetry(url);
        const games = await parseBggCollectionXml(collectionXml);
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
                reviews: [],
                overallAverageRating: data.overallAverageRating ?? null, 
                isPinned: data.isPinned || false,
            };
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
        const existingGamesMap = new Map<string, Pick<BoardGame, 'isPinned' | 'minPlaytime' | 'maxPlaytime' | 'averageWeight' | 'overallAverageRating'>>();
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
                            overallAverageRating: data.overallAverageRating ?? null,
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
                isPinned: existingData?.isPinned || game.isPinned || false,
                overallAverageRating: existingData?.overallAverageRating ?? null, 
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
        
        revalidatePath('/admin/collection');
        revalidatePath('/');
        revalidatePath('/all-games');
        revalidatePath('/top-10');
        return { success: true, message: `Sincronizzazione completata. ${gamesToAdd.length} giochi aggiunti/aggiornati, ${gamesToRemove.length} giochi rimossi.` };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Si è verificato un errore sconosciuto durante la sincronizzazione del database.';
        return { success: false, message: 'Sincronizzazione database fallita.', error: errorMessage };
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
        const rating: Rating = {
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
      };
    }
  } catch (error) {
    // console.error(`Error fetching user profile for ${userId}:`, error);
  }

  const allReviews = await getAllReviewsAction(); 
  const userReviews = allReviews.filter(review => review.userId === userId);
  
  return { user, reviews: userReviews };
}

export async function getFeaturedGamesAction(): Promise<BoardGame[]> {
  try {
    const gamesCollectionRef = collection(db, FIRESTORE_COLLECTION_NAME);
    const allGamesSnapshot = await getDocs(gamesCollectionRef);

    type GameWithLatestReviewDate = BoardGame & { _latestReviewDate: Date | null };

    const allGamesWithDetailsPromises = allGamesSnapshot.docs.map(async (docSnap) => {
      const gameData = docSnap.data();
      const gameId = docSnap.id;

      const reviewsSnapshot = await getDocs(query(collection(db, FIRESTORE_COLLECTION_NAME, gameId, 'reviews'), orderBy("date", "desc"), limit(1)));
      let latestReviewDate: string | null = null;
      if (!reviewsSnapshot.empty) { 
        latestReviewDate = reviewsSnapshot.docs[0].data().date; 
      }

      return {
        id: gameId,
        name: gameData.name || "Gioco Senza Nome",
        coverArtUrl: gameData.coverArtUrl || `https://placehold.co/200x300.png?text=N/A`,
        bggId: gameData.bggId || 0,
        yearPublished: gameData.yearPublished ?? null,
        minPlayers: gameData.minPlayers ?? null,
        maxPlayers: gameData.maxPlayers ?? null,
        playingTime: gameData.playingTime ?? null,
        minPlaytime: gameData.minPlaytime ?? null,
        maxPlaytime: gameData.maxPlaytime ?? null,
        averageWeight: gameData.averageWeight ?? null,
        reviews: [],
        overallAverageRating: gameData.overallAverageRating ?? null, 
        isPinned: gameData.isPinned || false,
        _latestReviewDate: latestReviewDate ? new Date(latestReviewDate) : null,
      } as GameWithLatestReviewDate;
    });

    const allGamesWithDetails = await Promise.all(allGamesWithDetailsPromises);

    const pinnedGames = allGamesWithDetails
      .filter(game => game.isPinned)
      .sort((a, b) => (a.name || "").localeCompare(b.name || "")); 

    const recentlyReviewedGamesUnfiltered = allGamesWithDetails
      .filter(game => game._latestReviewDate !== null && !game.isPinned) 
      .sort((a, b) => b._latestReviewDate!.getTime() - a._latestReviewDate!.getTime());

    const finalFeaturedGames: BoardGame[] = [];
    const featuredGameIds = new Set<string>();

    for (const game of pinnedGames) {
      if (!featuredGameIds.has(game.id)) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _latestReviewDate, ...gameToAdd } = game; 
        finalFeaturedGames.push(gameToAdd);
        featuredGameIds.add(game.id);
      }
    }
    
    const MAX_RECENTLY_REVIEWED_TO_SHOW = 3;
    let addedRecentlyReviewedCount = 0;

    for (const game of recentlyReviewedGamesUnfiltered) {
        if (addedRecentlyReviewedCount >= MAX_RECENTLY_REVIEWED_TO_SHOW) {
            break; 
        }
        if (!featuredGameIds.has(game.id)) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { _latestReviewDate, ...gameToAdd } = game;
            finalFeaturedGames.push(gameToAdd);
            featuredGameIds.add(game.id);
            addedRecentlyReviewedCount++;
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

        const parsedBggData = await parseBggThingXmlToBoardGame(thingXml, bggId);
        
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
                const parsedData = await parseBggThingXmlToBoardGame(singleItemXml, bggId);
                parsedGamesMap.set(bggId, parsedData);
            } catch (e) {
                // console.error(`Error parsing individual item in multi-thing XML for BGG ID ${bggId}:`, e);
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
            (game.minPlaytime == null || game.maxPlaytime == null || game.averageWeight == null)
        );
        
        const gamesToProcessThisRun = gamesNeedingUpdate.slice(0, MAX_GAMES_TO_UPDATE_IN_BATCH);

        if (gamesToProcessThisRun.length === 0) {
            return { success: true, message: 'Nessun gioco necessita di aggiornamento dei dettagli (min/max playtime, peso) da BGG in questo momento.' };
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
        
        const totalGamesInDb = allGamesResult.length;
        const gamesStillNeedingUpdateAfterThisRun = allGamesResult.filter(game =>
            game.bggId > 0 &&
            (game.minPlaytime == null || game.maxPlaytime == null || game.averageWeight == null) &&
            !gamesToUpdateClientSide.some(updatedGame => updatedGame.gameId === game.id && 
                (updatedGame.updateData.minPlaytime != null || updatedGame.updateData.maxPlaytime != null || updatedGame.updateData.averageWeight != null)
            )
        ).length;

        if (fetchedCount > 0 && gamesStillNeedingUpdateAfterThisRun === 0) {
            message += ` Tutti i giochi con dettagli mancanti (min/max playtime, peso) sono stati arricchiti.`;
        } else if (gamesStillNeedingUpdateAfterThisRun > 0) {
             message += ` Ci sono ancora ${gamesStillNeedingUpdateAfterThisRun} giochi che potrebbero necessitare di arricchimento per min/max playtime o peso. Rilancia l'azione per processarli.`;
        } else if (fetchedCount === 0 && erroredFetchCount === 0 && gamesToProcessThisRun.length > 0) {
             message = `Nessun nuovo dettaglio (min/max playtime, peso) trovato o necessario per i ${gamesToProcessThisRun.length} giochi controllati che necessitavano di arricchimento.`;
        }
        
        return { success: true, message, gamesToUpdateClientSide };

    } catch (error) {
        const errorMessage = String(error instanceof Error ? error.message : error);
        return { success: false, message: 'Recupero dettagli BGG per aggiornamento batch fallito.', error: errorMessage };
    }
}

export async function searchLocalGamesByNameAction(term: string): Promise<BoardGame[]> {
    if (!term || term.trim().length < 2) {
      return [];
    }
    try {
      const gamesCollectionRef = collection(db, FIRESTORE_COLLECTION_NAME);
      const querySnapshot = await getDocs(gamesCollectionRef);
  
      const searchTermLower = term.toLowerCase();
      const matchedGames: BoardGame[] = [];
  
      for (const docSnap of querySnapshot.docs) {
        const data = docSnap.data();
        const gameName = data.name || "";
        if (gameName.toLowerCase().includes(searchTermLower)) {
            matchedGames.push({
              id: docSnap.id,
              name: data.name,
              coverArtUrl: data.coverArtUrl || `https://placehold.co/48x64.png?text=${encodeURIComponent(data.name?.substring(0,3) || 'N/A')}`,
              yearPublished: data.yearPublished ?? null,
              bggId: data.bggId || 0,
              reviews: [],
              overallAverageRating: data.overallAverageRating ?? null,
              minPlayers: data.minPlayers ?? null,
              maxPlayers: data.maxPlayers ?? null,
              playingTime: data.playingTime ?? null,
              minPlaytime: data.minPlaytime ?? null,
              maxPlaytime: data.maxPlaytime ?? null,
              averageWeight: data.averageWeight ?? null,
              isPinned: data.isPinned || false,
            });
        }
      }
      
      matchedGames.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      return matchedGames.slice(0, 10); 
  
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto.';
      return [];
    }
}

export async function revalidateGameDataAction(gameId: string) {
  try {
    revalidatePath('/');
    revalidatePath('/all-games');
    revalidatePath('/top-10');
    revalidatePath(`/games/${gameId}`);
    revalidatePath(`/games/${gameId}/rate`);
    revalidatePath('/reviews');
    revalidatePath('/users');
    // revalidatePath('/users/[userId]', 'layout'); // Still under observation
    revalidatePath('/rate-a-game/select-game');
    revalidatePath('/admin/collection');
    return { success: true, message: `Cache revalidated for game ${gameId} and related paths.` };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: 'Failed to revalidate cache.', error: errorMessage };
  }
}
