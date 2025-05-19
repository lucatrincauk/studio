
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
  limit,
  addDoc,
  updateDoc,
  Query,
  QueryDocumentSnapshot,
  DocumentData,
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

    gameData.name = getPrimaryNameValue(nameElementsForParsing);
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

function getPrimaryNameValue(nameElements: { type?: string | null; value?: string | null }[]): string {
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

        results.push({ bggId: id, name, yearPublished, rank: Number.MAX_SAFE_INTEGER }); // Added default rank
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
            reviews: [], 
            description: 'Descrizione non disponibile dalla sincronizzazione della collezione BGG.', 
            isPinned: false, // Default for new games from BGG
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
        if (!searchResponseFetch.ok) throw new Error(`Errore API BGG (Search): ${searchResponseFetch.status} ${searchResponseFetch.statusText}`);
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
                return { ...item, name: item.name || "Unknown Name", rank: Number.MAX_SAFE_INTEGER }; 
            }
        });

        const enrichedResults = await Promise.all(enrichedResultsPromises);
        enrichedResults.sort((a, b) => a.rank - b.rank);
        return enrichedResults;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Si è verificato un errore sconosciuto durante la ricerca BGG.';
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
        console.error("Errore durante il controllo del gioco esistente nel DB:", dbError);
    }

    try {
        const thingResponseFetch = await fetch(`${BGG_API_BASE_URL}/thing?id=${numericBggId}&stats=1`);
        if (!thingResponseFetch.ok) {
            throw new Error(`Errore API BGG (Thing): ${thingResponseFetch.status} ${thingResponseFetch.statusText}`);
        }
        const thingXml = await thingResponseFetch.text();
        const parsedGameData = await parseBggThingXmlToBoardGame(thingXml, numericBggId);


        if (parsedGameData.name === "Name Not Found in Details" || !parsedGameData.name) {
            console.error('Dettagli essenziali del gioco (nome) mancanti dalla risposta BGG per ID:', numericBggId);
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
            isPinned: false, // Default for new games
        };

        try {
            const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, existingGameId);
            await setDoc(gameRef, newGameForFirestore);
        } catch (dbError) {
            const errorMessage = dbError instanceof Error ? dbError.message : String(dbError);
            console.error("Errore nel salvataggio del gioco in Firestore:", errorMessage);
            return { error: `Impossibile salvare il gioco nel database: ${errorMessage}` };
        }

        revalidatePath('/');
        revalidatePath(`/games/${existingGameId}`);
        revalidatePath('/admin/collection');
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
          console.error(`[GETGAMEDETAILS] Dati del documento non definiti per gameId: "${gameId}" nonostante esista.`);
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
        console.error(`[GETGAMEDETAILS] Errore nel recupero delle recensioni per gameId: "${gameId}"`, reviewError);
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
        isPinned: data.isPinned || false,
      };
      return game;
    } else {
      console.warn(`[GETGAMEDETAILS] Nessun documento trovato per gameId: "${gameId}"`);
      return null;
    }
  } catch (error) {
    console.error(`[GETGAMEDETAILS] Errore nel recupero dei dettagli del gioco per gameId: "${gameId}"`, error);
    return null;
  }
}


export async function getAllGamesAction(): Promise<BoardGame[]> {
  const result = await getBoardGamesFromFirestoreAction();
  if ('error' in result) {
    console.error("Errore in getAllGamesAction -> getBoardGamesFromFirestoreAction:", result.error);
    return [];
  }
  return result;
}

async function fetchWithRetry(url: string, retries = 5, delay = 3000, attempt = 1): Promise<string> {
    try {
        const response = await fetch(url, { cache: 'no-store' }); 
        // console.log(`[BGG FETCH ATTEMPT ${attempt}] URL: ${url}, Status: ${response.status}`);

        if (response.status === 200) {
            const xmlText = await response.text();
            // console.log(`[BGG FETCH ATTEMPT ${attempt}] Received 200 OK. XML (first 2000 chars): `, xmlText.substring(0, 2000));
            if (!xmlText.includes('<items') && !xmlText.includes("<item ") && !xmlText.includes("<error>") && attempt < retries) { 
                 console.warn(`[BGG FETCH ATTEMPT ${attempt}] Ricevuto 200 ma XML sembra incompleto/non valido. Riprovo...`);
                 await new Promise(resolve => setTimeout(resolve, Math.min(delay * attempt, 10000))); 
                 return fetchWithRetry(url, retries, delay, attempt + 1);
            }
            if(xmlText.includes("<error>")){
                console.error(`[BGG FETCH ATTEMPT ${attempt}] L'API BGG ha restituito un errore in XML: ${xmlText.substring(0, 500)}`);
                throw new Error(`L'API BGG ha restituito un errore: ${xmlText.substring(0, 200)}`);
            }
            return xmlText;
        } else if (response.status === 202 && attempt < retries) {
            console.log(`[BGG FETCH ATTEMPT ${attempt}] Ricevuto 202 Accepted. Attendo e riprovo...`);
            await new Promise(resolve => setTimeout(resolve, Math.min(delay * attempt, 10000))); 
            return fetchWithRetry(url, retries, delay, attempt + 1);
        } else if (response.status !== 200 && response.status !== 202) {
             const errorText = await response.text().catch(() => "Impossibile leggere il corpo della risposta d'errore");
             console.error(`[BGG FETCH ATTEMPT ${attempt}] Errore API BGG: Status ${response.status}. Response: ${errorText.substring(0,200)}`);
             throw new Error(`Errore API BGG: Status ${response.status}.`);
        } else { 
            console.error(`[BGG FETCH ATTEMPT ${attempt}] Fallito dopo ${retries} tentativi (ultimo status: ${response.status}).`);
            throw new Error(`L'API BGG non ha restituito uno stato di successo dopo ${retries} tentativi.`);
        }
    } catch (error) {
        console.error(`[BGG FETCH ATTEMPT ${attempt}] Errore nel blocco catch:`, error);
        if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, Math.min(delay * attempt, 10000)));
            return fetchWithRetry(url, retries, delay, attempt + 1);
        }
        throw error; 
    }
}


export async function fetchBggUserCollectionAction(username: string): Promise<BoardGame[] | { error: string }> {
    // console.log(`[SERVER ACTION ENTRY] fetchBggUserCollectionAction called for username: ${username}`);
    try {
        const url = `${BGG_API_BASE_URL}/collection?username=${username}&own=1&excludesubtype=boardgameexpansion`;
        // console.log(`[SERVER ACTION] Fetching BGG collection from URL: ${url}`);
        const collectionXml = await fetchWithRetry(url);
        // console.log(`[SERVER ACTION] Received XML for ${username}, length: ${collectionXml.length}. Parsing...`);
        const games = await parseBggCollectionXml(collectionXml);
        // console.log(`[SERVER ACTION] Parsed ${games.length} games for ${username}.`);
        return games;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Si è verificato un errore sconosciuto durante il recupero della collezione BGG.';
        console.error(`Errore in fetchBggUserCollectionAction per ${username}:`, errorMessage);
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
                const reviewsQuery = query(reviewsCollectionRef); 
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
                reviews: [], 
                overallAverageRating,
                isPinned: data.isPinned || false,
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
        // Fetch existing games to preserve their 'isPinned' status
        const existingGamesMap = new Map<string, boolean>();
        if (gamesToAdd.length > 0) {
            // Firestore 'in' query limit is 30 items. If gamesToAdd is larger, batch the queries.
            const gameIdsToAdd = gamesToAdd.map(g => g.id);
            for (let i = 0; i < gameIdsToAdd.length; i += 30) {
                const batchOfIds = gameIdsToAdd.slice(i, i + 30);
                if (batchOfIds.length > 0) {
                    const existingGamesQuery = query(collection(db, FIRESTORE_COLLECTION_NAME), where('__name__', 'in', batchOfIds));
                    const existingGamesSnapshot = await getDocs(existingGamesQuery);
                    existingGamesSnapshot.forEach(doc => {
                        existingGamesMap.set(doc.id, doc.data().isPinned || false);
                    });
                }
            }
        }


        gamesToAdd.forEach(game => {
            if (!game.id) { 
                console.error(`Gioco da aggiungere mancante di ID:`, game);
                throw new Error(`Il gioco "${game.name || 'Senza Nome'}" non ha un ID.`);
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
                isPinned: existingGamesMap.get(game.id) || game.isPinned || false, // Preserve existing or default to false
            };
            batch.set(gameRef, gameDataForFirestore, { merge: true }); 
            operationsCount++;
        });

        gamesToRemove.forEach(game => {
             if (!game.id) {
                console.error(`Gioco da rimuovere mancante di ID:`, game);
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
        return { success: true, message: `Sincronizzazione completata. ${gamesToAdd.length} giochi aggiunti/aggiornati, ${gamesToRemove.length} giochi rimossi.` };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Si è verificato un errore sconosciuto durante la sincronizzazione del database.';
        console.error("Errore in syncBoardGamesToFirestoreAction:", errorMessage);
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
          rating: rating,
        });
      });
    }
    allAugmentedReviews.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return allAugmentedReviews;
  } catch (error) {
    console.error("Errore nel recupero di tutte le recensioni:", error);
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
  }
  return { user, reviews: userReviews };
}

export async function getFeaturedGamesAction(): Promise<BoardGame[]> {
  try {
    const gamesCollectionRef = collection(db, FIRESTORE_COLLECTION_NAME);

    // 1. Fetch pinned games
    const pinnedGamesQuery = query(gamesCollectionRef, where("isPinned", "==", true));
    const pinnedGamesSnapshot = await getDocs(pinnedGamesQuery);
    const pinnedGamesPromises = pinnedGamesSnapshot.docs.map(async (docSnap) => {
        const data = docSnap.data();
        const reviewsSnapshot = await getDocs(collection(db, FIRESTORE_COLLECTION_NAME, docSnap.id, 'reviews'));
        const reviews: Review[] = reviewsSnapshot.docs.map(reviewDoc => reviewDoc.data() as Review); 
        const categoryAvgs = calculateCategoryAverages(reviews);
        const overallAverageRating = categoryAvgs ? calculateOverallCategoryAverage(categoryAvgs) : null;
        return {
            id: docSnap.id,
            ...data,
            reviews: [], 
            overallAverageRating,
            isPinned: data.isPinned || false,
        } as BoardGame;
    });
    let pinnedGames = await Promise.all(pinnedGamesPromises);
    // Sort pinned games by name
    pinnedGames.sort((a,b) => (a.name || "").localeCompare(b.name || ""));


    const pinnedGameIds = new Set(pinnedGames.map(g => g.id));

    // 2. Fetch recently reviewed games (excluding pinned ones)
    const allGamesSnapshot = await getDocs(gamesCollectionRef);
    const gamesWithLatestReviewDate: Array<{
      gameData: BoardGame; 
      latestReviewDate: string | null;
    }> = [];

    for (const gameDoc of allGamesSnapshot.docs) {
      if (pinnedGameIds.has(gameDoc.id)) {
        continue; 
      }
      const gameData = gameDoc.data();
      const reviewsQuery = query(
        collection(db, FIRESTORE_COLLECTION_NAME, gameDoc.id, 'reviews'),
        orderBy('date', 'desc'),
        limit(1)
      );
      const latestReviewSnapshot = await getDocs(reviewsQuery);
      let latestReviewDate: string | null = null;
      if (!latestReviewSnapshot.empty) {
        latestReviewDate = latestReviewSnapshot.docs[0].data().date as string;
      }

      if (latestReviewDate) { 
        const reviewsSnapshot = await getDocs(collection(db, FIRESTORE_COLLECTION_NAME, gameDoc.id, 'reviews'));
        const reviews: Review[] = reviewsSnapshot.docs.map(reviewDoc => reviewDoc.data() as Review);
        const categoryAvgs = calculateCategoryAverages(reviews);
        const overallAverageRating = categoryAvgs ? calculateOverallCategoryAverage(categoryAvgs) : null;
        
        gamesWithLatestReviewDate.push({
          gameData: {
            id: gameDoc.id,
            name: gameData.name || "Gioco Senza Nome",
            coverArtUrl: gameData.coverArtUrl || `https://placehold.co/200x300.png?text=N/A`,
            bggId: gameData.bggId || 0,
            yearPublished: gameData.yearPublished,
            minPlayers: gameData.minPlayers,
            maxPlayers: gameData.maxPlayers,
            playingTime: gameData.playingTime,
            description: gameData.description,
            reviews: [],
            overallAverageRating,
            isPinned: gameData.isPinned || false,
          },
          latestReviewDate
        });
      }
    }

    const sortedRecentGames = gamesWithLatestReviewDate
      .sort((a, b) => new Date(b.latestReviewDate!).getTime() - new Date(a.latestReviewDate!).getTime());

    const recentGamesLimit = Math.max(0, 5 - pinnedGames.length); // Ensure we get up to 5 total games
    const recentGames = sortedRecentGames.slice(0, recentGamesLimit).map(item => item.gameData);
    
    return [...pinnedGames, ...recentGames];

  } catch (error) {
    console.error("Errore nel recupero dei giochi in vetrina:", error);
    return [];
  }
}
