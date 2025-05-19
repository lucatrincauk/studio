
'use server';

import { revalidatePath } from 'next/cache';
import type { BoardGame, Review, Rating, AiSummary, SummarizeReviewsInput, BggSearchResult, AugmentedReview, UserProfile } from './types';
import { reviewFormSchema, type RatingFormValues } from '@/lib/validators';
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
} from 'firebase/firestore';
import { calculateCategoryAverages, calculateOverallCategoryAverage } from './utils';


const BGG_API_BASE_URL = 'https://boardgamegeek.com/xmlapi2';
const FIRESTORE_COLLECTION_NAME = 'boardgames_collection';

// --- Top-level Helper Functions for BGG XML Parsing ---
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

async function parseBggSearchXml(xmlText: string): Promise<Omit<BggSearchResult, 'rank'>[]> {
    const results: Omit<BggSearchResult, 'rank'>[] = [];
    const itemMatches = xmlText.matchAll(/<item type="boardgame" id="(\d+?)">([\s\S]*?)<\/item>/g);

    for (const itemMatch of itemMatches) {
        const id = itemMatch[1];
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
        if (!name || name === "Unknown Name") {
            name = `BGG ID ${id}`;
        }


        let yearPublished: number | undefined;
        const yearMatch = /<yearpublished value="(\d+)"\/>/.exec(itemContent);
        if (yearMatch && yearMatch[1]) {
            yearPublished = parseInt(yearMatch[1], 10);
        }

        results.push({ bggId: id, name, yearPublished });
    }
    return results;
}

function getPrimaryNameValueFromDetails(nameElements: { type?: string | null; value?: string | null }[]): string {
    if (!nameElements || nameElements.length === 0) {
        return "Name Not Found in Details";
    }
    let primaryName = '';
    const primary = nameElements.find(n => n.type === 'primary' && n.value && n.value.trim());
    if (primary) {
        primaryName = decodeHtmlEntities(primary.value.trim());
    }

    if (!primaryName) {
        const alternate = nameElements.find(n => n.type === 'alternate' && n.value && n.value.trim());
        if (alternate) {
            primaryName = decodeHtmlEntities(alternate.value.trim());
        }
    }

    if (!primaryName && nameElements[0] && nameElements[0].value && nameElements[0].value.trim()) {
         primaryName = decodeHtmlEntities(nameElements[0].value.trim());
    }


    if (!primaryName || primaryName.trim() === "" || primaryName === "Name Not Found in Details") {
        return "Name Not Found in Details";
    }
    return primaryName;
}


async function parseRankFromThingXml(xmlText: string): Promise<number> {
    const rankMatch = /<rank\s+type="subtype"\s+name="boardgame"\s+(?:bayesaverage="[^"]*"\s+)?value="(\d+)"(?:\s+friendlyname="[^"]*")?\s*\/?>/i.exec(xmlText);
    if (rankMatch && rankMatch[1]) {
        const rankValue = parseInt(rankMatch[1], 10);
        return isNaN(rankValue) ? Number.MAX_SAFE_INTEGER : rankValue;
    }
    const notRankedMatch = /<rank\s+type="subtype"\s+name="boardgame"\s+value="Not Ranked"/i.exec(xmlText);
    if (notRankedMatch) {
        return Number.MAX_SAFE_INTEGER;
    }
    return Number.MAX_SAFE_INTEGER;
}

async function parseBggThingXmlToBoardGame(xmlText: string, bggIdInput: number): Promise<Partial<BoardGame>> {
    const gameData: Partial<BoardGame> = { bggId: bggIdInput };

    const nameMatches = Array.from(xmlText.matchAll(/<name\s+type="(primary|alternate)"(?:[^>]*)value="([^"]+)"(?:[^>]*)?\/>/g));
    const nameElementsForParsing = nameMatches.map(match => ({
        type: match[1],
        value: match[2],
    }));

    gameData.name = getPrimaryNameValueFromDetails(nameElementsForParsing);
    if (gameData.name === "Name Not Found in Details") gameData.name = `BGG ID ${bggIdInput}`;


    const descriptionMatch = /<description>([\s\S]*?)<\/description>/.exec(xmlText);
    if (descriptionMatch && descriptionMatch[1]) {
        gameData.description = decodeHtmlEntities(descriptionMatch[1].trim());
    }

    let coverArt = '';
    const imageMatch = /<image>([\s\S]*?)<\/image>/.exec(xmlText);
    if (imageMatch && imageMatch[1]) {
        coverArt = decodeHtmlEntities(imageMatch[1].trim());
    } else {
        const thumbnailMatch = /<thumbnail>([\s\S]*?)<\/thumbnail>/.exec(xmlText);
        if (thumbnailMatch && thumbnailMatch[1]) {
            coverArt = decodeHtmlEntities(thumbnailMatch[1].trim());
        }
    }
    if (coverArt && coverArt.startsWith('//')) {
        coverArt = `https:${coverArt}`;
    }
    gameData.coverArtUrl = coverArt || `https://placehold.co/400x600.png?text=${encodeURIComponent(gameData.name || 'Game')}`;

    const yearPublishedMatch = /<yearpublished value="(\d+)"\/>/.exec(xmlText);
    if (yearPublishedMatch && yearPublishedMatch[1]) {
        gameData.yearPublished = parseInt(yearPublishedMatch[1], 10);
    }

    const minPlayersMatch = /<minplayers value="(\d+)"\/>/.exec(xmlText);
    if (minPlayersMatch && minPlayersMatch[1]) {
        gameData.minPlayers = parseInt(minPlayersMatch[1], 10);
    }

    const maxPlayersMatch = /<maxplayers value="(\d+)"\/>/.exec(xmlText);
    if (maxPlayersMatch && maxPlayersMatch[1]) {
        gameData.maxPlayers = parseInt(maxPlayersMatch[1], 10);
    }

    const playingTimeMatch = /<playingtime value="(\d+)"\/>/.exec(xmlText);
    if (playingTimeMatch && playingTimeMatch[1]) {
        gameData.playingTime = parseInt(playingTimeMatch[1], 10);
    } else {
        const minPlaytimeMatch = /<minplaytime value="(\d+)"\/>/.exec(xmlText);
         if (minPlaytimeMatch && minPlaytimeMatch[1]) {
            gameData.playingTime = parseInt(minPlaytimeMatch[1], 10);
        }
    }

    return gameData;
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
        const subtypeMatch = /<subtype\s+value="boardgame"\s*\/>/i.exec(itemContent) || /subtype="boardgame"/i.exec(itemMatch[0]);
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
        if (!name) {
            name = `BGG Game ID ${bggId}`;
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
            const minP = /<stats[^>]*minplayers="(\d+)"/.exec(itemContent);
            if(minP) minPlayers = parseInt(minP[1], 10);
            const maxP = /<stats[^>]*maxplayers="(\d+)"/.exec(itemContent);
            if(maxP) maxPlayers = parseInt(maxP[1], 10);
            const playT = /<stats[^>]*playingtime="(\d+)"/.exec(itemContent);
            if(playT) playingTime = parseInt(playT[1], 10);
        }

        games.push({
            id: `bgg-${bggId}`,
            bggId,
            name,
            yearPublished,
            coverArtUrl,
            minPlayers,
            maxPlayers,
            playingTime,
            reviews: [], // Initialize with empty reviews
            description: 'Description not available from BGG collection sync.',
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
        const searchResponseFetch = await fetch(`${BGG_API_BASE_URL}/search?query=${encodeURIComponent(searchTerm)}&type=boardgame`);
        if (!searchResponseFetch.ok) throw new Error(`BGG API Error (Search): ${searchResponseFetch.status} ${searchResponseFetch.statusText}`);
        const searchXml = await searchResponseFetch.text();
        const basicResults = await parseBggSearchXml(searchXml);

        if (basicResults.length === 0) return [];
        const limitedResults = basicResults.slice(0, 10);

        const enrichedResultsPromises = limitedResults.map(async (item) => {
            try {
                const thingResponseFetch = await fetch(`${BGG_API_BASE_URL}/thing?id=${item.bggId}&stats=1`);
                if (!thingResponseFetch.ok) {
                    return { ...item, name: item.name || "Name Not Found in Details", rank: Number.MAX_SAFE_INTEGER };
                }
                const thingXml = await thingResponseFetch.text();
                const rank = await parseRankFromThingXml(thingXml);
                const detailedGameData = await parseBggThingXmlToBoardGame(thingXml, parseInt(item.bggId));

                let finalName = detailedGameData.name;
                if (!finalName || finalName === "Name Not Found in Details" || finalName.startsWith("BGG ID")) {
                    finalName = item.name;
                }
                 if (!finalName || finalName === "Name Not Found in Details" ) {
                    finalName = "Unknown Name";
                }

                return { bggId: item.bggId, name: finalName, yearPublished: detailedGameData.yearPublished || item.yearPublished, rank };
            } catch (e) {
                console.error(`Error fetching details for BGG ID ${item.bggId}:`, e);
                return { ...item, name: item.name || "Unknown Name", rank: Number.MAX_SAFE_INTEGER };
            }
        });

        const enrichedResults = await Promise.all(enrichedResultsPromises);
        enrichedResults.sort((a, b) => a.rank - b.rank);
        return enrichedResults;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during BGG search.';
        console.error('BGG Search Action Error:', errorMessage);
        return { error: `Errore API BGG: ${errorMessage}` };
    }
}

export async function importAndRateBggGameAction(bggId: string): Promise<{ gameId: string } | { error: string }> {
    const numericBggId = parseInt(bggId, 10);
    if (isNaN(numericBggId)) return { error: 'Formato ID BGG non valido.' };

    const existingGameId = `bgg-${bggId}`;
    try {
        const gameDocRef = doc(db, FIRESTORE_COLLECTION_NAME, existingGameId);
        const docSnap = await getDoc(gameDocRef);
        if (docSnap.exists()) {
            return { gameId: existingGameId };
        }
    } catch (dbError) {
        console.error("Error checking for existing game in DB:", dbError);
        // Proceed to import if DB check fails, might overwrite if there was an issue
    }

    try {
        const thingResponseFetch = await fetch(`${BGG_API_BASE_URL}/thing?id=${numericBggId}&stats=1`);
        if (!thingResponseFetch.ok) {
            throw new Error(`Errore API BGG (Thing): ${thingResponseFetch.status} ${thingResponseFetch.statusText}`);
        }
        const thingXml = await thingResponseFetch.text();
        const parsedGameData = await parseBggThingXmlToBoardGame(thingXml, numericBggId);

        if (parsedGameData.name === "Name Not Found in Details" || !parsedGameData.name) {
            return { error: 'Dettagli essenziali del gioco (nome) mancanti dalla risposta BGG.' };
        }

        const newGameForFirestore = {
            bggId: numericBggId,
            name: parsedGameData.name,
            coverArtUrl: parsedGameData.coverArtUrl || `https://placehold.co/400x600.png?text=${encodeURIComponent(parsedGameData.name)}`,
            description: parsedGameData.description || 'Nessuna descrizione disponibile.',
            yearPublished: parsedGameData.yearPublished ?? null,
            minPlayers: parsedGameData.minPlayers ?? null,
            maxPlayers: parsedGameData.maxPlayers ?? null,
            playingTime: parsedGameData.playingTime ?? null,
        };

        try {
            const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, existingGameId);
            await setDoc(gameRef, newGameForFirestore);
        } catch (dbError) {
            const errorMessage = dbError instanceof Error ? dbError.message : String(dbError);
            return { error: `Impossibile salvare il gioco nel database: ${errorMessage}` };
        }

        revalidatePath('/');
        revalidatePath(`/games/${existingGameId}`);
        revalidatePath('/collection');
        return { gameId: existingGameId };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Si è verificato un errore sconosciuto durante l\'importazione BGG.';
        console.error('BGG Import Action Error:', errorMessage);
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
          console.error(`[GETGAMEDETAILS] Document data is undefined for gameId: "${gameId}"`);
          return null;
      }

      let reviews: Review[] = [];
      try {
        const reviewsCollectionRef = collection(db, FIRESTORE_COLLECTION_NAME, gameId, 'reviews');
        const reviewsQuery = query(reviewsCollectionRef, orderBy("date", "desc"));
        const reviewsSnapshot = await getDocs(reviewsQuery);
        reviews = reviewsSnapshot.docs.map(reviewDoc => {
          const reviewData = reviewDoc.data();
          return {
            id: reviewDoc.id,
            author: reviewData.author || 'Autore Sconosciuto',
            userId: reviewData.userId || 'unknown_user_id',
            authorPhotoURL: reviewData.authorPhotoURL || null,
            rating: reviewData.rating as Rating || { // Default rating structure
                excitedToReplay: 0, mentallyStimulating: 0, fun: 0,
                decisionDepth: 0, replayability: 0, luck: 0, lengthDowntime: 0,
                graphicDesign: 0, componentsThemeLore: 0,
                effortToLearn: 0, setupTeardown: 0
            },
            comment: reviewData.comment || '',
            date: reviewData.date || new Date().toISOString(),
          };
        });
      } catch (reviewError) {
        console.error(`[GETGAMEDETAILS] Error fetching reviews for gameId: "${gameId}"`, reviewError);
        // Continue with game data even if reviews fail
      }

      const game: BoardGame = {
        id: gameId,
        name: data.name || "Gioco Senza Nome (DB)",
        coverArtUrl: data.coverArtUrl || `https://placehold.co/400x600.png?text=${encodeURIComponent(data.name || 'N/A')}`,
        bggId: typeof data.bggId === 'number' ? data.bggId : 0,
        description: data.description || "Nessuna descrizione disponibile.",
        yearPublished: data.yearPublished === undefined ? null : data.yearPublished,
        minPlayers: data.minPlayers === undefined ? null : data.minPlayers,
        maxPlayers: data.maxPlayers === undefined ? null : data.maxPlayers,
        playingTime: data.playingTime === undefined ? null : data.playingTime,
        reviews: reviews,
      };
      return game;
    } else {
      console.warn(`[GETGAMEDETAILS] No document found for gameId: "${gameId}"`);
      return null;
    }
  } catch (error) {
    console.error(`[GETGAMEDETAILS] Error fetching game details for gameId: "${gameId}"`, error);
    return null;
  }
}


export async function getAllGamesAction(): Promise<BoardGame[]> {
  const result = await getBoardGamesFromFirestoreAction();
  if ('error' in result) {
    console.error("Error in getAllGamesAction -> getBoardGamesFromFirestoreAction:", result.error);
    return [];
  }
  return result;
}

// BGG Collection Fetching
async function fetchWithRetry(url: string, retries = 3, delay = 2000, attempt = 1): Promise<string> {
    // console.log(`[BGG FETCH ATTEMPT ${attempt}] URL: ${url}`);
    try {
        const response = await fetch(url, { cache: 'no-store' });
        // console.log(`[BGG FETCH ATTEMPT ${attempt}] Status: ${response.status}`);

        if (response.status === 200) {
            const xmlText = await response.text();
            // console.log(`[BGG FETCH ATTEMPT ${attempt}] XML (first 500 chars): ${xmlText.substring(0, 500)}`);
            if (!xmlText.includes('<items') && !xmlText.includes("<item ") && attempt < retries) {
                 console.warn(`[BGG FETCH ATTEMPT ${attempt}] Received 200 but XML seems incomplete/invalid. Retrying...`);
                 await new Promise(resolve => setTimeout(resolve, Math.min(delay * attempt, 10000))); // Exponential backoff
                 return fetchWithRetry(url, retries, delay, attempt + 1);
            }
            return xmlText;
        } else if (response.status === 202 && attempt < retries) {
            // console.log(`[BGG FETCH ATTEMPT ${attempt}] Received 202 Accepted. Waiting and retrying...`);
            await new Promise(resolve => setTimeout(resolve, Math.min(delay * attempt, 10000))); // Exponential backoff
            return fetchWithRetry(url, retries, delay, attempt + 1);
        } else if (response.status !== 200 && response.status !== 202) {
             const errorText = await response.text().catch(() => "Could not read error response body");
             console.error(`[BGG FETCH ATTEMPT ${attempt}] BGG API Error: Status ${response.status}. Response: ${errorText.substring(0,200)}`);
             throw new Error(`Errore API BGG: Status ${response.status}.`);
        } else { // Retries exhausted for 202 or malformed 200
            console.error(`[BGG FETCH ATTEMPT ${attempt}] Failed after ${retries} attempts (last status: ${response.status}).`);
            throw new Error(`L'API BGG non ha restituito uno stato di successo dopo ${retries} tentativi.`);
        }
    } catch (error) {
        console.error(`[BGG FETCH ATTEMPT ${attempt}] Catch block error:`, error);
        if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, Math.min(delay * attempt, 10000)));
            return fetchWithRetry(url, retries, delay, attempt + 1);
        }
        throw error;
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
        const gamesPromises = querySnapshot.docs.map(async (docSnap) => {
            const data = docSnap.data();
            const gameId = docSnap.id;

            let reviews: Review[] = [];
            try {
                const reviewsCollectionRef = collection(db, FIRESTORE_COLLECTION_NAME, gameId, 'reviews');
                const reviewsQuery = query(reviewsCollectionRef); // No specific order needed here for average calc
                const reviewsSnapshot = await getDocs(reviewsQuery);
                reviews = reviewsSnapshot.docs.map(reviewDoc => {
                    const reviewData = reviewDoc.data();
                    return {
                        id: reviewDoc.id,
                        author: reviewData.author || 'Autore Sconosciuto',
                        userId: reviewData.userId || 'unknown_user_id',
                        authorPhotoURL: reviewData.authorPhotoURL || null,
                        rating: reviewData.rating as Rating, // Assume rating exists and is correct
                        comment: reviewData.comment || '',
                        date: reviewData.date || new Date().toISOString(),
                    };
                });
            } catch (reviewError) {
                // console.warn(`Could not fetch reviews for game ${gameId} while building game list:`, reviewError);
            }

            let overallAverageRating: number | null = null;
            if (reviews.length > 0) {
                const categoryAvgs = calculateCategoryAverages(reviews);
                if (categoryAvgs) {
                    overallAverageRating = calculateOverallCategoryAverage(categoryAvgs);
                }
            }

            return {
                id: gameId,
                bggId: data.bggId || 0,
                name: data.name || "Gioco Senza Nome",
                coverArtUrl: data.coverArtUrl || `https://placehold.co/100x150.png?text=No+Image`,
                yearPublished: data.yearPublished === undefined ? null : data.yearPublished,
                minPlayers: data.minPlayers === undefined ? null : data.minPlayers,
                maxPlayers: data.maxPlayers === undefined ? null : data.maxPlayers,
                playingTime: data.playingTime === undefined ? null : data.playingTime,
                description: data.description || "Nessuna descrizione.",
                reviews: [], // Keep actual reviews array empty for list views for performance
                overallAverageRating,
            };
        });
        const games = await Promise.all(gamesPromises);
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
        gamesToAdd.forEach(game => {
            if (!game.id) {
                throw new Error(`Il gioco "${game.name}" non ha un ID.`);
            }
            const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
            const gameDataForFirestore = {
                bggId: game.bggId,
                name: game.name || "Unknown Name",
                coverArtUrl: game.coverArtUrl || `https://placehold.co/100x150.png?text=No+Image`,
                yearPublished: game.yearPublished ?? null,
                minPlayers: game.minPlayers ?? null,
                maxPlayers: game.maxPlayers ?? null,
                playingTime: game.playingTime ?? null,
                description: game.description ?? "Nessuna descrizione disponibile.",
            };
            batch.set(gameRef, gameDataForFirestore, { merge: true }); // Use merge to update if exists
            operationsCount++;
        });

        gamesToRemove.forEach(game => {
             if (!game.id) {
                throw new Error(`Il gioco "${game.name}" non ha un ID per la rimozione.`);
            }
            const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
            batch.delete(gameRef);
            operationsCount++;
        });

        if (operationsCount > 0) {
            await batch.commit();
        }

        revalidatePath('/collection');
        revalidatePath('/');
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
        allAugmentedReviews.push({
          id: reviewDoc.id,
          gameId: gameId,
          gameName: gameData.name || "Gioco Sconosciuto",
          gameCoverArtUrl: gameData.coverArtUrl,
          ...reviewData,
          rating: reviewData.rating as Rating || {
            excitedToReplay: 0, mentallyStimulating: 0, fun: 0,
            decisionDepth: 0, replayability: 0, luck: 0, lengthDowntime: 0,
            graphicDesign: 0, componentsThemeLore: 0,
            effortToLearn: 0, setupTeardown: 0
          },
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
  const allReviews = await getAllReviewsAction();
  const usersMap = new Map<string, UserProfile>();

  allReviews.forEach(review => {
    if (review.userId && !usersMap.has(review.userId)) {
      usersMap.set(review.userId, {
        id: review.userId,
        name: review.author || 'Utente Sconosciuto',
        photoURL: review.authorPhotoURL,
      });
    }
  });
  const users = Array.from(usersMap.values());
  users.sort((a,b) => a.name.localeCompare(b.name));
  return users;
}

export async function getUserDetailsAndReviewsAction(
  userId: string
): Promise<{ user: UserProfile | null; reviews: AugmentedReview[] }> {
  const allReviews = await getAllReviewsAction();
  const userReviews = allReviews.filter(review => review.userId === userId);

  let user: UserProfile | null = null;
  if (userReviews.length > 0) {
    user = {
      id: userId,
      name: userReviews[0].author || 'Utente Sconosciuto',
      photoURL: userReviews[0].authorPhotoURL,
    };
  } else {
    // Attempt to find user info even if they have no reviews (e.g. from a users collection if you had one)
    // For now, if no reviews, we can't derive user info this way.
    // You might want to fetch user profile from a dedicated 'users' collection in Firebase Auth if needed.
  }

  return { user, reviews: userReviews };
}
