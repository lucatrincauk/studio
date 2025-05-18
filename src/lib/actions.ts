
'use server';

import { revalidatePath } from 'next/cache';
import { summarizeReviews } from '@/ai/flows/summarize-reviews';
import { mockGames, addReviewToMockGame, mockReviews as allMockReviews } from '@/data/mock-games';
import type { BoardGame, Review, Rating, AiSummary, SummarizeReviewsInput, BggSearchResult } from './types';
import { z } from 'zod';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';

const BGG_API_BASE_URL = 'https://boardgamegeek.com/xmlapi2';

// Helper to decode HTML entities commonly found in BGG XML
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

// Helper to parse the main name from <name> tags (used for /thing responses)
function getPrimaryNameValue(nameElements: { type?: string | null; value?: string | null }[]): string {
    if (!nameElements || nameElements.length === 0) {
        return "Name Not Found in Details";
    }
    let primaryName = '';
    // Find primary name
    const primary = nameElements.find(n => n.type === 'primary');
    if (primary && primary.value) {
        primaryName = decodeHtmlEntities(primary.value.trim());
    }
    // Fallback to first alternate name if primary is not found or empty
    if (!primaryName) {
        const alternate = nameElements.find(n => n.type === 'alternate');
        if (alternate && alternate.value) {
            primaryName = decodeHtmlEntities(alternate.value.trim());
        }
    }
    // Fallback to the first name value if still no specific primary/alternate
    if (!primaryName && nameElements[0] && nameElements[0].value) {
        primaryName = decodeHtmlEntities(nameElements[0].value.trim());
    }
    return primaryName || "Name Not Found in Details";
}


async function parseBggSearchXml(xmlText: string): Promise<Omit<BggSearchResult, 'rank'>[]> {
    const results: Omit<BggSearchResult, 'rank'>[] = [];
    const itemMatches = xmlText.matchAll(/<item type="boardgame" id="(\d+?)">([\s\S]*?)<\/item>/g);

    for (const itemMatch of itemMatches) {
        const id = itemMatch[1];
        const itemContent = itemMatch[2];

        let name = 'Unknown Name';
        // Try to get primary name first
        const primaryNameMatch = /<name type="primary" sortindex="\d+" value="([^"]+?)"\s*\/>/.exec(itemContent);
        if (primaryNameMatch && primaryNameMatch[1]) {
            name = decodeHtmlEntities(primaryNameMatch[1]);
        } else {
            // Fallback to any name if primary is not found
            const anyNameMatch = /<name value="([^"]+?)"\s*\/>/.exec(itemContent); // More general name match
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
                    return { ...item, name: item.name || "Unknown Name", rank: Number.MAX_SAFE_INTEGER };
                }
                const thingXml = await thingResponseFetch.text();
                const rank = await parseRankFromThingXml(thingXml);
                const detailedGameData = await parseBggThingXmlToBoardGame(thingXml, parseInt(item.bggId));
                
                let finalName = detailedGameData.name;
                if (!finalName || finalName === "Name Not Found in Details" || finalName.startsWith("BGG ID")) {
                    finalName = item.name; // Fallback to name from search result
                }
                if (!finalName) {
                    finalName = "Unknown Name"; // Final fallback
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
    // Check Firestore first if this game already exists from a previous collection sync
    const firestoreGameRef = doc(db, FIRESTORE_COLLECTION_NAME, existingGameId);
    // This part of the logic might need to be revisited if mockGames is not the source of truth
    // For now, keeping mockGames check for direct "Add and Rate" from search
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

        // Add to mockGames for local state / immediate UI update if still used
        mockGames.push(newGame); 
        if (!allMockReviews[existingGameId]) { 
            allMockReviews[existingGameId] = [];
        }
        
        // Also add/update in Firestore (optional here, or handled by collection sync)
        // For "Add and Rate", we might want to add it to DB immediately
        // This mimics a lightweight version of syncBoardGamesToFirestoreAction for a single game
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
                // reviews are managed separately, not written directly from here
            });
        } catch (dbError) {
            console.warn(`Failed to add game ${newGame.id} to Firestore during import:`, dbError);
            // Non-fatal, game is in mock data, but won't persist without sync
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


// --- Mock Data Interaction ---
async function findGameById(gameId: string): Promise<BoardGame | undefined> {
  // Try Firestore first
  const docRef = doc(db, FIRESTORE_COLLECTION_NAME, gameId);
  // const docSnap = await getDoc(docRef); // This would be the ideal way
  // For now, rely on mockGames as the primary source for getGameDetails
  // and collection page shows Firestore, home page shows mockGames. This is inconsistent.
  // Let's make getGameDetails also try mockGames if Firestore fails or for non-bgg IDs
  
  const gameFromMocks = mockGames.find(g => g.id === gameId);
  if (gameFromMocks) {
    // For mock games, reviews come from allMockReviews
    return { ...gameFromMocks, reviews: allMockReviews[gameId] || gameFromMocks.reviews || [] };
  }
  // If not in mocks (e.g., only in Firestore via collection sync but not yet in mockGames)
  // This part needs a consistent strategy for where game details are sourced.
  // For now, if it's from BGG collection sync, it's in Firestore.
  // If it's added via "Add and Rate", it's in mockGames and hopefully Firestore.
  return undefined;
}

export async function getGameDetails(gameId: string): Promise<BoardGame | null> {
    // For now, simplified to use mock data as actions.ts is getting complex.
    // A proper solution would involve consistently fetching from Firestore,
    // and ensuring reviews are also in Firestore or a separate subcollection.
  const game = mockGames.find(g => g.id === gameId);
  if (!game) {
    return null;
  }
   // Ensure reviews are attached from the central mockReviews object
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
    // This 'else' might be hit if gameId is not found in mockGames.
    // We should check if the game exists in Firestore perhaps.
    // For now, if addReviewToMockGame (which modifies mockGames & allMockReviews) returns null, we error.
    return { message: 'Failed to submit review: Game not found in local data store.', success: false };
  }
}

export async function generateAiSummaryAction(gameId: string): Promise<AiSummary | { error: string }> {
  const game = await getGameDetails(gameId); // Uses the updated getGameDetails
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
  // This currently returns from mockGames. For consistency with collection,
  // it should ideally fetch from Firestore if that's the source of truth.
  // For now, keeping as is.
  return Promise.resolve(
    mockGames.map(game => ({
      ...game,
      reviews: allMockReviews[game.id] || game.reviews || [],
    }))
  );
}


// --- Collection Actions ---

async function parseBggCollectionXml(xmlText: string): Promise<BoardGame[]> {
    const games: BoardGame[] = [];
    // Regex updated to be more lenient: removed objecttype="thing" requirement
    const itemMatches = xmlText.matchAll(/<item[^>]*subtype="boardgame"[^>]*objectid="(\d+)"[^>]*>([\s\S]*?)<\/item>/gi);


    for (const itemMatch of itemMatches) {
        const bggId = parseInt(itemMatch[1], 10);
        const itemContent = itemMatch[2];

        let name = 'Unknown Game';
        const primaryNameMatch = /<name sortindex="1"[^>]*>([\s\S]*?)<\/name>/.exec(itemContent);
        if (primaryNameMatch && primaryNameMatch[1] && primaryNameMatch[1].trim()) {
            name = decodeHtmlEntities(primaryNameMatch[1].trim());
        } else {
            const anyNameMatch = /<name[^>]*>([\s\S]*?)<\/name>/.exec(itemContent);
            if (anyNameMatch && anyNameMatch[1] && anyNameMatch[1].trim()) {
                name = decodeHtmlEntities(anyNameMatch[1].trim());
            }
        }
        if (name === 'Unknown Game' || name.trim() === '') {
             name = `BGG ID ${bggId}`; 
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

export async function fetchBggUserCollectionAction(username: string): Promise<BoardGame[] | { error: string }> {
    if (!username.trim()) {
        return { error: 'BGG Username cannot be empty.' };
    }

    const fetchWithRetry = async (url: string, retries = 5, initialDelay = 2000): Promise<string> => {
        let delay = initialDelay;
        for (let i = 0; i < retries; i++) {
            const response = await fetch(url, { cache: 'no-store' }); 

            if (response.status === 200) {
                const text = await response.text();
                // Log the raw XML here
                console.log("BGG Collection XML Response (Attempt " + (i+1) + "):", text.substring(0, 2000) + (text.length > 2000 ? "..." : ""));

                if (text.includes("<items")) { 
                    return text;
                }
                console.warn(`BGG Collection for ${username} (Attempt ${i+1}/${retries}): 200 OK but no <items> tag. XML: ${text.substring(0,200)}...`);
                if (i === retries - 1) throw new Error(`BGG Collection for ${username} returned 200 OK but content was malformed after ${retries} retries (no "<items>" tag found).`);
            } else if (response.status === 202) {
                if (i === retries - 1) throw new Error(`BGG Collection for ${username} still processing (202) after ${retries} attempts.`);
                console.log(`BGG Collection for ${username} (Attempt ${i+1}/${retries}): Not ready (202). Retrying in ${delay / 1000}s...`);
            } else {
                const errorText = await response.text().catch(() => "Could not read error response body.");
                console.error(`BGG API Error (Collection) for ${username}: ${response.status} ${response.statusText}. Body: ${errorText.substring(0, 500)}`);
                throw new Error(`BGG API Error (Collection): ${response.status} ${response.statusText}. User: ${username}.`);
            }

            await new Promise(resolve => setTimeout(resolve, delay));
            delay = Math.min(delay * 2, 30000); 
        }
        throw new Error(`BGG Collection for ${username} could not be retrieved after ${retries} attempts (exhausted retries).`);
    };

    try {
        const collectionUrl = `${BGG_API_BASE_URL}/collection?username=${encodeURIComponent(username)}&own=1&excludesubtype=boardgameexpansion`;
        const collectionXml = await fetchWithRetry(collectionUrl);
        
        if (collectionXml.includes("<error>")) { 
             const messageMatch = /<message>([\s\S]*?)<\/message>/.exec(collectionXml);
             const errorMessage = messageMatch ? decodeHtmlEntities(messageMatch[1]) : "Unknown BGG error message.";
             if (errorMessage.toLowerCase().includes("invalid username") || errorMessage.toLowerCase().includes("user not found")) {
                return { error: `BGG User "${username}" not found or collection is private.`};
             }
             return { error: `BGG API Error: ${errorMessage}` };
        }

        const games = await parseBggCollectionXml(collectionXml);
        return games;

    } catch (error) {
        console.error(`BGG Collection Fetch Error for ${username}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during BGG collection fetch.';
        return { error: errorMessage };
    }
}

const FIRESTORE_COLLECTION_NAME = 'boardgames_collection';

export async function getBoardGamesFromFirestoreAction(): Promise<BoardGame[] | { error: string }> {
    try {
        const querySnapshot = await getDocs(collection(db, FIRESTORE_COLLECTION_NAME));
        const games: BoardGame[] = [];
        querySnapshot.forEach((docSnap) => { 
            // Ensure all fields from BoardGame are mapped, providing defaults if necessary
            const data = docSnap.data();
            games.push({ 
                id: docSnap.id, 
                bggId: data.bggId || 0, // Default or error if bggId is critical and missing
                name: data.name || "Unnamed Game",
                coverArtUrl: data.coverArtUrl || `https://placehold.co/100x150.png?text=No+Image`,
                yearPublished: data.yearPublished, // undefined is fine
                minPlayers: data.minPlayers,
                maxPlayers: data.maxPlayers,
                playingTime: data.playingTime,
                description: data.description || "No description.",
                reviews: data.reviews || [], // Assuming reviews might be stored directly, though subcollection is better
            });
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
            // Ensure all necessary fields for BoardGame are present, even if null/undefined
            const gameDataForFirestore = {
                bggId: game.bggId, 
                name: game.name || "Unknown Name",
                coverArtUrl: game.coverArtUrl || `https://placehold.co/100x150.png?text=No+Image`,
                yearPublished: game.yearPublished ?? null, 
                minPlayers: game.minPlayers ?? null,
                maxPlayers: game.maxPlayers ?? null,
                playingTime: game.playingTime ?? null,
                description: game.description ?? "No description available.",
                // Reviews are typically not synced this way; they are user-generated content
                // and should be in a subcollection or managed separately.
                // For now, ensuring the field exists if the type expects it.
                // reviews: game.reviews || [], 
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

    } catch (error) {
        console.error('Error syncing games to Firestore:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during database sync.';
        return { success: false, message: 'Database sync failed.', error: errorMessage };
    }
}

