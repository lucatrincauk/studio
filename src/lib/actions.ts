
'use server';

import { revalidatePath } from 'next/cache';
import { summarizeReviews } from '@/ai/flows/summarize-reviews';
import { mockGames, addReviewToMockGame, mockReviews as allMockReviews } from '@/data/mock-games';
import type { BoardGame, Review, Rating, AiSummary, SummarizeReviewsInput, BggSearchResult } from './types';
import { z } from 'zod';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';

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
    return primaryName || "Name Not Found in Details";
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
    const processedBggIds = new Set<number>(); // Track processed BGG IDs
    // Relaxed regex: made subtype optional in main item match
    const itemMatches = xmlText.matchAll(/<item[^>]*objectid="(\d+)"(?:[^>]*subtype="boardgame")?[^>]*>([\s\S]*?)<\/item>/gi);

    for (const itemMatch of itemMatches) {
        const bggId = parseInt(itemMatch[1], 10);
        if (processedBggIds.has(bggId)) { // Skip if this BGG ID has already been processed
            console.warn(`[parseBggCollectionXml] Duplicate BGG ID ${bggId} found in XML. Skipping.`);
            continue;
        }
        processedBggIds.add(bggId); // Add BGG ID to set of processed IDs


        const itemContent = itemMatch[2];

        // Additional check: ensure subtype is boardgame if present
        const subtypeMatch = /subtype="([^"]+)"/.exec(itemMatch[0]); // Check subtype on the full item tag
        if (subtypeMatch && subtypeMatch[1] !== "boardgame") {
            continue; // Skip if subtype is present and not boardgame
        }
        
        let name = '';
        // Prioritize primary name with sortindex="1"
        const primaryNameMatch = /<name sortindex="1"[^>]*>([\s\S]*?)<\/name>/.exec(itemContent);
        if (primaryNameMatch && primaryNameMatch[1] && primaryNameMatch[1].trim()) {
            name = decodeHtmlEntities(primaryNameMatch[1].trim());
        } else {
            // Fallback to any name tag if primary is not found or empty
            const anyNameMatch = /<name[^>]*>([\s\S]*?)<\/name>/.exec(itemContent);
            if (anyNameMatch && anyNameMatch[1] && anyNameMatch[1].trim()) {
                name = decodeHtmlEntities(anyNameMatch[1].trim());
            }
        }
        // Final fallback if no name is found
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
            // Try to get individual stats if the combined one isn't found
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

export async function testServerAction(message: string): Promise<{ data: string }> {
  console.log('[SERVER ACTION TEST] Received message:', message);
  return { data: `Server received: ${message}` };
}

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
    const existingMockGame = mockGames.find(game => game.id === existingGameId);
    if (existingMockGame) { 
        return { gameId: existingMockGame.id };
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

        const newGame: BoardGame = {
            id: existingGameId,
            name: parsedGameData.name,
            coverArtUrl: parsedGameData.coverArtUrl || `https://placehold.co/400x600.png?text=${encodeURIComponent(parsedGameData.name)}`,
            description: parsedGameData.description || 'No description available.',
            reviews: [], 
            yearPublished: parsedGameData.yearPublished,
            minPlayers: parsedGameData.minPlayers,
            maxPlayers: parsedGameData.maxPlayers,
            playingTime: parsedGameData.playingTime,
            bggId: numericBggId,
        };

        mockGames.push(newGame); 
        if (!allMockReviews[existingGameId]) { 
            allMockReviews[existingGameId] = [];
        }
        
        try {
            const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, newGame.id);
            await setDoc(gameRef, {
                bggId: newGame.bggId,
                name: newGame.name,
                coverArtUrl: newGame.coverArtUrl,
                yearPublished: newGame.yearPublished ?? null,
                minPlayers: newGame.minPlayers ?? null,
                maxPlayers: newGame.maxPlayers ?? null,
                playingTime: newGame.playingTime ?? null,
                description: newGame.description ?? "No description available.",
            });
        } catch (dbError) {
            console.warn(`Failed to add game ${newGame.id} to Firestore during import:`, dbError);
        }
        
        revalidatePath('/'); 
        revalidatePath(`/games/${newGame.id}`); 
        revalidatePath('/collection');
        return { gameId: newGame.id };

    } catch (error) {
        console.error('BGG Import Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during BGG import.';
        return { error: `BGG API Error: ${errorMessage}` };
    }
}

async function findGameById(gameId: string): Promise<BoardGame | undefined> {
  const gameFromMocks = mockGames.find(g => g.id === gameId);
  if (gameFromMocks) {
    return { ...gameFromMocks, reviews: allMockReviews[gameId] || gameFromMocks.reviews || [] };
  }
  return undefined;
}

export async function getGameDetails(gameId: string): Promise<BoardGame | null> {
  const game = mockGames.find(g => g.id === gameId);
  if (!game) {
    return null;
  }
  return { ...game, reviews: allMockReviews[gameId] || [] };
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
  const addedReview = addReviewToMockGame(gameId, { rating, comment, author });

  if (addedReview) {
    revalidatePath(`/games/${gameId}`); 
    revalidatePath('/'); 
    revalidatePath('/collection');
    return { message: 'Review submitted successfully!', success: true };
  } else {
    return { message: 'Failed to submit review: Game not found in local data store.', success: false };
  }
}

export async function generateAiSummaryAction(gameId: string): Promise<AiSummary | { error: string }> {
  const game = await getGameDetails(gameId); 
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
  return Promise.resolve(
    mockGames.map(game => ({
      ...game,
      reviews: allMockReviews[game.id] || game.reviews || [], 
    }))
  );
}


async function fetchWithRetry(url: string, retries = 5, delay = 1000, attempt = 1): Promise<string> {
    console.log(`[SERVER ACTION BGG FETCH] Attempt ${attempt} to fetch: ${url}`);
    try {
        const response = await fetch(url, { cache: 'no-store' }); // Prevent caching of 202 responses
        console.log(`[SERVER ACTION BGG FETCH] Response status for attempt ${attempt}: ${response.status}`);

        if (response.status === 200) {
            const xmlText = await response.text();
            // Log first 2000 chars of XML to avoid flooding logs, or full if shorter
            console.log(`[SERVER ACTION BGG FETCH] Received 200 OK. XML (first 2k chars or less): ${xmlText.substring(0, 2000)}`); 
            if (!xmlText.includes('<items')) { // A 200 OK without <items> might be a malformed response
                 if (attempt < retries) {
                    console.log(`[SERVER ACTION BGG FETCH] 200 OK but no <items> tag found. Retrying in ${delay / 1000}s... (Attempt ${attempt + 1}/${retries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return fetchWithRetry(url, retries, Math.min(delay * 2, 30000), attempt + 1); // Exponential backoff, cap at 30s
                } else {
                    throw new Error(`BGG API returned 200 OK but no <items> tag found after ${retries} attempts. XML: ${xmlText.substring(0, 500)}`);
                }
            }
            return xmlText;
        } else if (response.status === 202 && attempt < retries) {
            console.log(`[SERVER ACTION BGG FETCH] Received 202 Accepted. Retrying in ${delay / 1000}s... (Attempt ${attempt + 1}/${retries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchWithRetry(url, retries, Math.min(delay * 2, 30000), attempt + 1); // Exponential backoff
        } else if (response.status !== 200 && response.status !== 202) {
             const errorText = await response.text().catch(() => "Could not read error response body");
             throw new Error(`BGG API Error: Status ${response.status}. Response: ${errorText.substring(0,500)}`);
        } else { // Retries exhausted for 202
            throw new Error(`BGG API still processing after ${retries} attempts (last status: ${response.status}). Please try again later.`);
        }
    } catch (error) {
        console.error(`[SERVER ACTION BGG FETCH] Error on attempt ${attempt} for ${url}:`, error);
        if (attempt < retries) {
            console.log(`[SERVER ACTION BGG FETCH] Retrying in ${delay / 1000}s... (Attempt ${attempt + 1}/${retries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchWithRetry(url, retries, Math.min(delay * 2, 30000), attempt + 1);
        }
        throw error; // Re-throw after exhausting retries
    }
}


// MINIMAL VERSION of fetchBggUserCollectionAction for testing
export async function fetchBggUserCollectionAction(username: string): Promise<BoardGame[] | { error: string }> {
    // console.log(`[SERVER ACTION EXECUTING - MINIMAL] fetchBggUserCollectionAction called for username: ${username}`);
    // return [];
    console.log(`[SERVER ACTION ENTRY - fetchBggUserCollectionAction] Called for username: ${username}`);
    try {
        const url = `${BGG_API_BASE_URL}/collection?username=${username}&own=1&excludesubtype=boardgameexpansion`;
        console.log(`[SERVER ACTION - fetchBggUserCollectionAction] Fetching URL: ${url}`);
        
        const collectionXml = await fetchWithRetry(url);
        // If fetchWithRetry was successful, collectionXml will be a string.
        // If it failed after retries, it would have thrown an error, caught below.

        const games = await parseBggCollectionXml(collectionXml);
        console.log(`[SERVER ACTION - fetchBggUserCollectionAction] Parsed ${games.length} games from BGG for ${username}.`);
        return games;

    } catch (error) {
        console.error(`[SERVER ACTION ERROR - fetchBggUserCollectionAction] Error fetching or parsing BGG collection for ${username}:`, error);
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
                reviews: data.reviews || [], 
            });
        });
        mockGames.length = 0; 
        mockGames.push(...games); 
        games.forEach(game => {
            if (!allMockReviews[game.id]) { 
                allMockReviews[game.id] = [];
            }
        });
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
            const gameDataForFirestore = {
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
            operationsCount++;
        });

        if (operationsCount > 0) {
            await batch.commit();
        }
        
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
    

    

    