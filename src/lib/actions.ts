
'use server';

import { revalidatePath } from 'next/cache';
import { summarizeReviews } from '@/ai/flows/summarize-reviews';
import { mockGames } from '@/data/mock-games'; // mockGames is still used for initial data / caching
import type { BoardGame, Review, Rating, AiSummary, SummarizeReviewsInput, BggSearchResult } from './types';
import { z } from 'zod';
import { db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  addDoc, // For adding new reviews
  query, // For querying reviews
  orderBy // For ordering reviews
} from 'firebase/firestore';

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
        
        let yearPublished: number | undefined;
        const yearMatch = /<yearpublished value="(\d+)"\/>/.exec(itemContent);
        if (yearMatch && yearMatch[1]) {
            yearPublished = parseInt(yearMatch[1], 10);
        }

        results.push({ bggId: id, name, yearPublished });
    }
    return results;
}

function getPrimaryNameValue(nameElements: { type?: string | null; value?: string | null }[]): string {
    if (!nameElements || nameElements.length === 0) {
        return "Name Not Found in Details";
    }
    let primaryName = '';
    const primary = nameElements.find(n => n.type === 'primary');
    if (primary && primary.value && primary.value.trim()) {
        primaryName = decodeHtmlEntities(primary.value.trim());
    }
    
    if (!primaryName) {
        const alternate = nameElements.find(n => n.type === 'alternate');
        if (alternate && alternate.value && alternate.value.trim()) {
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

async function parseBggCollectionXml(xmlText: string): Promise<BoardGame[]> {
    const games: BoardGame[] = [];
    const processedBggIds = new Set<number>(); 
    const itemMatches = xmlText.matchAll(/<item[^>]*objectid="(\d+)"(?:[^>]*subtype="boardgame")?[^>]*>([\s\S]*?)<\/item>/gi);

    for (const itemMatch of itemMatches) {
        const bggId = parseInt(itemMatch[1], 10);
        if (processedBggIds.has(bggId)) { 
            continue;
        }
        processedBggIds.add(bggId); 

        const itemContent = itemMatch[2];

        const subtypeMatch = /subtype="([^"]+)"/.exec(itemMatch[0]); 
        if (subtypeMatch && subtypeMatch[1] !== "boardgame") {
            continue; 
        }
        
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
            reviews: [], 
            description: 'Description not available from BGG collection sync.', 
        });
    }
    return games;
}


// --- Server Actions ---

export async function searchBggGamesAction(searchTerm: string): Promise<BggSearchResult[] | { error: string }> {
    if (!searchTerm.trim()) {
        return { error: 'Search term cannot be empty.' };
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
                    console.warn(`Failed to fetch details for BGG ID ${item.bggId}, status: ${thingResponseFetch.status}`);
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
                console.warn(`Error processing details for BGG ID ${item.bggId}:`, e);
                return { ...item, name: item.name || "Unknown Name", rank: Number.MAX_SAFE_INTEGER };
            }
        });

        const enrichedResults = await Promise.all(enrichedResultsPromises);
        enrichedResults.sort((a, b) => a.rank - b.rank);
        return enrichedResults;

    } catch (error) {
        console.error('BGG Search Action Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during BGG search.';
        return { error: `BGG API Error: ${errorMessage}` };
    }
}

export async function importAndRateBggGameAction(bggId: string): Promise<{ gameId: string } | { error: string }> {
    const numericBggId = parseInt(bggId, 10);
    if (isNaN(numericBggId)) return { error: 'Invalid BGG ID format.' };

    const existingGameId = `bgg-${bggId}`;
    try {
        const gameDocRef = doc(db, FIRESTORE_COLLECTION_NAME, existingGameId);
        const docSnap = await getDoc(gameDocRef);
        if (docSnap.exists()) {
             // Game already in Firestore, no need to update mockGames or allMockReviews here
            return { gameId: existingGameId };
        }
    } catch (dbError) {
        console.warn(`Error checking Firestore for existing game ${existingGameId}:`, dbError);
    }


    try {
        const thingResponseFetch = await fetch(`${BGG_API_BASE_URL}/thing?id=${numericBggId}&stats=1`);
        if (!thingResponseFetch.ok) {
            throw new Error(`BGG API Error (Thing): ${thingResponseFetch.status} ${thingResponseFetch.statusText}`);
        }
        const thingXml = await thingResponseFetch.text();
        const parsedGameData = await parseBggThingXmlToBoardGame(thingXml, numericBggId);

        if (!parsedGameData.name || parsedGameData.name === "Name Not Found in Details" || parsedGameData.name.startsWith("BGG ID")) {
            return { error: 'Essential game details (name) missing from BGG response.' };
        }

        const newGameForFirestore = {
            bggId: numericBggId,
            name: parsedGameData.name,
            coverArtUrl: parsedGameData.coverArtUrl || `https://placehold.co/400x600.png?text=${encodeURIComponent(parsedGameData.name)}`,
            description: parsedGameData.description || 'No description available.',
            yearPublished: parsedGameData.yearPublished ?? null,
            minPlayers: parsedGameData.minPlayers ?? null,
            maxPlayers: parsedGameData.maxPlayers ?? null,
            playingTime: parsedGameData.playingTime ?? null,
        };

        try {
            const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, existingGameId);
            await setDoc(gameRef, newGameForFirestore);
        } catch (dbError) {
            console.error(`Failed to add game ${existingGameId} to Firestore during import:`, dbError);
            return { error: `Failed to save game to database: ${dbError instanceof Error ? dbError.message : String(dbError)}` };
        }
        
        revalidatePath('/'); 
        revalidatePath(`/games/${existingGameId}`); 
        revalidatePath('/collection');
        return { gameId: existingGameId };

    } catch (error) {
        console.error('BGG Import Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during BGG import.';
        return { error: `BGG API Error: ${errorMessage}` };
    }
}

async function findGameById(gameId: string): Promise<BoardGame | undefined> {
  console.log(`[findGameById] Looking for gameId: "${gameId}" in mockGames (count: ${mockGames.length}).`);
  // Prefer direct DB lookup for consistency, mockGames can be stale or incomplete for reviews
  // const gameFromMocks = mockGames.find(g => g.id === gameId);
  // if (gameFromMocks) {
  //     console.log(`[findGameById] Found gameId: "${gameId}" in mockGames (reviews might be stale).`);
  //     return gameFromMocks; // This will have reviews: [] as per getBoardGamesFromFirestoreAction
  // }
  
  console.log(`[findGameById] Attempting to fetch gameId: "${gameId}" from Firestore, including reviews.`);
  try {
      const gameDocRef = doc(db, FIRESTORE_COLLECTION_NAME, gameId);
      const docSnap = await getDoc(gameDocRef);
      console.log(`[findGameById] Firestore docSnap.exists for "${gameId}": ${docSnap.exists()}`);
      if (docSnap.exists()) {
          const data = docSnap.data() as Omit<BoardGame, 'id' | 'reviews'>;
          
          const reviewsCollectionRef = collection(db, FIRESTORE_COLLECTION_NAME, gameId, 'reviews');
          const reviewsQuery = query(reviewsCollectionRef, orderBy("date", "desc"));
          const reviewsSnapshot = await getDocs(reviewsQuery);
          const reviews: Review[] = reviewsSnapshot.docs.map(reviewDoc => {
            const reviewData = reviewDoc.data();
            return {
              id: reviewDoc.id,
              author: reviewData.author,
              rating: reviewData.rating as Rating,
              comment: reviewData.comment,
              date: reviewData.date,
            };
          });

          const game: BoardGame = {
              id: gameId,
              ...data,
              reviews: reviews
          };
          
          console.log(`[findGameById] Successfully fetched gameId: "${gameId}" from Firestore with ${reviews.length} reviews.`);
          return game;
      } else {
        console.warn(`[findGameById] Game with ID "${gameId}" not found in Firestore after explicit fetch.`);
      }
  } catch (error) {
      console.error(`[findGameById] Error fetching game ${gameId} from Firestore:`, error);
  }
  console.warn(`[findGameById] GameId: "${gameId}" ultimately not found.`);
  return undefined;
}


export async function getGameDetails(gameId: string): Promise<BoardGame | null> {
  try {
    console.log(`[getGameDetails] Attempting to fetch gameId: "${gameId}" directly from Firestore.`);
    const gameDocRef = doc(db, FIRESTORE_COLLECTION_NAME, gameId);
    const docSnap = await getDoc(gameDocRef);
    console.log(`[getGameDetails] Firestore docSnap.exists for "${gameId}": ${docSnap.exists()}`);

    if (docSnap.exists()) {
      const data = docSnap.data();
      
      const reviewsCollectionRef = collection(db, FIRESTORE_COLLECTION_NAME, gameId, 'reviews');
      const reviewsQuery = query(reviewsCollectionRef, orderBy("date", "desc"));
      const reviewsSnapshot = await getDocs(reviewsQuery);
      
      const reviews: Review[] = reviewsSnapshot.docs.map(reviewDoc => {
        const reviewData = reviewDoc.data();
        return {
          id: reviewDoc.id,
          author: reviewData.author,
          rating: reviewData.rating as Rating, // Add type assertion
          comment: reviewData.comment,
          date: reviewData.date, // Assuming date is stored as ISO string
        };
      });

      const game: BoardGame = {
        id: gameId,
        bggId: data.bggId,
        name: data.name,
        coverArtUrl: data.coverArtUrl,
        description: data.description,
        yearPublished: data.yearPublished,
        minPlayers: data.minPlayers,
        maxPlayers: data.maxPlayers,
        playingTime: data.playingTime,
        reviews: reviews, 
      };
      console.log(`[getGameDetails] Successfully fetched gameId: "${gameId}" and ${reviews.length} reviews from Firestore.`);
      return game;
    } else {
      console.warn(`[getGameDetails] Game with ID "${gameId}" not found in Firestore collection "${FIRESTORE_COLLECTION_NAME}".`);
      return null;
    }
  } catch (error) {
    console.error(`[getGameDetails] Error fetching game details for ID "${gameId}" from Firestore:`, error);
    return null;
  }
}

const reviewSchema = z.object({
  author: z.string().min(2, "Name must be at least 2 characters.").max(50, "Name cannot exceed 50 characters."),
  feeling: z.coerce.number().min(1, "Rating is required").max(5),
  gameDesign: z.coerce.number().min(1, "Rating is required").max(5),
  presentation: z.coerce.number().min(1, "Rating is required").max(5),
  management: z.coerce.number().min(1, "Rating is required").max(5),
  comment: z.string().min(5, "Comment must be at least 5 characters long.").max(500, "Comment must be at most 500 characters long."),
});

export async function submitNewReviewAction(gameId: string, prevState: any, formData: FormData): Promise<{ message: string; errors?: Record<string, string[]>; success: boolean }> {
  const rawData = {
    author: formData.get('author'),
    feeling: formData.get('feeling'),
    gameDesign: formData.get('gameDesign'),
    presentation: formData.get('presentation'),
    management: formData.get('management'),
    comment: formData.get('comment'),
  };
  const validatedFields = reviewSchema.safeParse(rawData);

  if (!validatedFields.success) {
    return { message: "Failed to submit review due to validation errors.", errors: validatedFields.error.flatten().fieldErrors, success: false };
  }
  
  const { author, feeling, gameDesign, presentation, management, comment } = validatedFields.data;
  const rating: Rating = { feeling, gameDesign, presentation, management };
  
  try {
    const gameDocRef = doc(db, FIRESTORE_COLLECTION_NAME, gameId);
    const gameDocSnap = await getDoc(gameDocRef);
    if (!gameDocSnap.exists()) {
      return { message: 'Failed to submit review: Game not found.', success: false };
    }

    const reviewsCollectionRef = collection(db, FIRESTORE_COLLECTION_NAME, gameId, 'reviews');
    const newReviewData = {
      author,
      rating,
      comment,
      date: new Date().toISOString(),
    };

    await addDoc(reviewsCollectionRef, newReviewData);

    revalidatePath(`/games/${gameId}`); 
    revalidatePath('/'); 
    revalidatePath('/collection');
    return { message: 'Review submitted successfully to database!', success: true };

  } catch (error) {
    console.error("Error submitting review to Firestore:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return { message: `Failed to submit review to database: ${errorMessage}`, success: false };
  }
}

export async function generateAiSummaryAction(gameId: string): Promise<AiSummary | { error: string }> {
  const game = await getGameDetails(gameId); // This will now fetch reviews from Firestore
  if (!game) {
    return { error: 'Game not found.' };
  }
  const currentReviews = game.reviews || []; 
  if (currentReviews.length === 0) {
    return { error: 'No reviews available to summarize for this game.' };
  }

  const reviewComments = currentReviews.map(r => r.comment).filter(c => c && c.trim() !== '');
  if (reviewComments.length === 0) {
    return { error: 'No review comments available to summarize.' };
  }

  try {
    const input: SummarizeReviewsInput = { gameName: game.name, reviews: reviewComments };
    const summaryOutput = await summarizeReviews(input); 
    return { summary: summaryOutput.summary };
  } catch (error) {
    console.error('AI Summary Generation Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return { error: `Failed to generate AI summary: ${errorMessage}. Please try again later.` };
  }
}

export async function getAllGamesAction(): Promise<BoardGame[]> {
  const result = await getBoardGamesFromFirestoreAction();
  if ('error' in result) {
    console.error("getAllGamesAction: Failed to fetch games from Firestore -", result.error);
    return []; 
  }
  return result;
}


async function fetchWithRetry(url: string, retries = 5, delay = 1000, attempt = 1): Promise<string> {
    try {
        const response = await fetch(url, { cache: 'no-store' }); 
        // Minimal log for every attempt
        console.log(`[BGG Fetch Attempt ${attempt}/${retries}] URL: ${url.substring(0,100)}..., Status: ${response.status}`);

        if (response.status === 200) {
            const xmlText = await response.text();
            if (!xmlText.includes('<items')) { 
                 if (attempt < retries) {
                    console.warn(`BGG API (200 OK) but no <items> tag. Retrying in ${delay / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return fetchWithRetry(url, retries, Math.min(delay * 2, 30000), attempt + 1); 
                }
            }
            // console.log(`[BGG Fetch Success] XML received (first 500 chars): ${xmlText.substring(0,500)}`);
            return xmlText;
        } else if (response.status === 202 && attempt < retries) {
            console.warn(`BGG API (202 Accepted). Retrying in ${delay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchWithRetry(url, retries, Math.min(delay * 2, 30000), attempt + 1); 
        } else if (response.status !== 200 && response.status !== 202) {
             const errorText = await response.text().catch(() => "Could not read error response body");
             throw new Error(`BGG API Error: Status ${response.status}. Response: ${errorText.substring(0,500)}`);
        } else { 
            throw new Error(`BGG API still processing after ${retries} attempts (last status: ${response.status}).`);
        }
    } catch (error) {
        if (attempt < retries) {
            console.warn(`Error on BGG fetch attempt ${attempt}: ${error instanceof Error ? error.message : String(error)}. Retrying in ${delay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchWithRetry(url, retries, Math.min(delay * 2, 30000), attempt + 1);
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
        console.error(`Error fetching or parsing BGG collection for ${username}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred while fetching BGG collection.';
        return { error: errorMessage };
    }
}


export async function getBoardGamesFromFirestoreAction(): Promise<BoardGame[] | { error: string }> {
    try {
        const querySnapshot = await getDocs(collection(db, FIRESTORE_COLLECTION_NAME));
        const games: BoardGame[] = [];
        querySnapshot.forEach((docSnap) => { 
            const data = docSnap.data();
            games.push({ 
                id: docSnap.id, 
                bggId: data.bggId || 0, 
                name: data.name || "Unnamed Game",
                coverArtUrl: data.coverArtUrl || `https://placehold.co/100x150.png?text=No+Image`,
                yearPublished: data.yearPublished, 
                minPlayers: data.minPlayers,
                maxPlayers: data.maxPlayers,
                playingTime: data.playingTime,
                description: data.description || "No description.",
                reviews: [], // Initialize with empty reviews for list views
            });
        });
        
        mockGames.length = 0; 
        mockGames.push(...games.map(g => ({ ...g, reviews: [] }))); // Update mockGames cache, also with empty reviews
        
        return games;
    } catch (error) {
        console.error('Error fetching games from Firestore:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        return { error: `Failed to fetch games from database: ${errorMessage}` };
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
                console.error(`Game "${game.name}" is missing an ID and cannot be added.`);
                throw new Error(`Game "${game.name}" is missing an ID.`);
            }
            const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
            const gameDataForFirestore = { // Reviews are not stored in the main game doc
                bggId: game.bggId, 
                name: game.name || "Unknown Name",
                coverArtUrl: game.coverArtUrl || `https://placehold.co/100x150.png?text=No+Image`,
                yearPublished: game.yearPublished ?? null, 
                minPlayers: game.minPlayers ?? null,
                maxPlayers: game.maxPlayers ?? null,
                playingTime: game.playingTime ?? null,
                description: game.description ?? "No description available.",
            };
            batch.set(gameRef, gameDataForFirestore);
            operationsCount++;
        });

        gamesToRemove.forEach(game => {
            if (!game.id) {
                console.error(`Game "${game.name}" is missing an ID and cannot be removed.`);
                throw new Error(`Game "${game.name}" is missing an ID for removal.`);
            }
            const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
            batch.delete(gameRef);
            // Note: This does not automatically delete subcollections (like reviews).
            // If you need to delete reviews for removed games, that requires separate logic.
            operationsCount++;
        });

        if (operationsCount > 0) {
            await batch.commit();
        }
        
        await getBoardGamesFromFirestoreAction(); // Refresh in-memory cache

        revalidatePath('/collection'); 
        revalidatePath('/'); 
        return { success: true, message: `Sync complete. ${gamesToAdd.length} games added/updated, ${gamesToRemove.length} games removed.` };

    } catch (error)
     {
        console.error('Error syncing games to Firestore:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during database sync.';
        return { success: false, message: 'Database sync failed.', error: errorMessage };
    }
}
    

    

    

    


