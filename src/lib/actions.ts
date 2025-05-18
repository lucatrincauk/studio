
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
function parsePrimaryName(nameElements: Element[]): string {
    let primaryName = '';
    for (const nameEl of nameElements) {
        if (nameEl.getAttribute('type') === 'primary') {
            primaryName = decodeHtmlEntities(nameEl.getAttribute('value') || '');
            if (primaryName) break;
        }
    }
    if (!primaryName && nameElements.length > 0) {
        // Fallback to the first name if no primary is explicitly marked or found
        primaryName = decodeHtmlEntities(nameElements[0].getAttribute('value') || '');
    }
    return primaryName || 'Name Not Found in Details';
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

async function parseRankFromThingXml(xmlText: string): Promise<number> {
    // Regex to find rank type="subtype" name="boardgame" value="<rank>"
    // Made friendlyname optional and more flexible about other attributes.
    const rankMatch = /<rank\s+type="subtype"\s+name="boardgame"\s+(?:bayesaverage="[^"]*"\s+)?value="(\d+)"(?:\s+friendlyname="[^"]*")?\s*\/?>/i.exec(xmlText);
    if (rankMatch && rankMatch[1]) {
        const rankValue = parseInt(rankMatch[1], 10);
        return isNaN(rankValue) ? Number.MAX_SAFE_INTEGER : rankValue; // Ensure valid number
    }
    // Check for "Not Ranked" specifically
    const notRankedMatch = /<rank\s+type="subtype"\s+name="boardgame"\s+value="Not Ranked"/i.exec(xmlText);
    if (notRankedMatch) {
        return Number.MAX_SAFE_INTEGER; // Consistent value for "Not Ranked"
    }
    return Number.MAX_SAFE_INTEGER; // Default if no rank found
}

async function parseBggThingXmlToBoardGame(xmlText: string, bggIdInput: number): Promise<Partial<BoardGame>> {
    const gameData: Partial<BoardGame> = { bggId: bggIdInput };
    
    // Enhanced name parsing: Collect all <name> elements and pass to parsePrimaryName
    const nameElementsXml = Array.from(xmlText.matchAll(/<name\s+type="(primary|alternate)"[^>]*value="([^"]+?)"[^>]*\/>/g));
    const nameElementsForParsing = nameElementsXml.map(match => ({ 
        getAttribute: (attr: string) => {
            if (attr === 'type') return match[1];
            if (attr === 'value') return match[2];
            return null; // Should align with Element.getAttribute behavior
    }})) as unknown as Element[]; // Cast for compatibility with parsePrimaryName
    gameData.name = parsePrimaryName(nameElementsForParsing);


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
    if (coverArt && coverArt.startsWith('//')) { // Ensure HTTPS for schemaless URLs
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

    // Playing time can be in <playingtime value="X"/> or <minplaytime value="Y"/> / <maxplaytime value="Z"/>
    const playingTimeMatch = /<playingtime value="(\d+)"\/>/.exec(xmlText);
    if (playingTimeMatch && playingTimeMatch[1]) {
        gameData.playingTime = parseInt(playingTimeMatch[1], 10);
    } else {
        // Fallback to minplaytime if playingtime is not available
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
        // Initial search to get IDs
        const searchResponseFetch = await fetch(`${BGG_API_BASE_URL}/search?query=${encodeURIComponent(searchTerm)}&type=boardgame`);
        if (!searchResponseFetch.ok) throw new Error(`BGG API Error (Search): ${searchResponseFetch.status} ${searchResponseFetch.statusText}`);
        const searchXml = await searchResponseFetch.text();
        const basicResults = await parseBggSearchXml(searchXml);

        if (basicResults.length === 0) return [];

        // Limit results to avoid too many subsequent API calls
        const limitedResults = basicResults.slice(0, 10); 

        // Fetch details (including rank) for each game
        const enrichedResultsPromises = limitedResults.map(async (item) => {
            try {
                const thingResponseFetch = await fetch(`${BGG_API_BASE_URL}/thing?id=${item.bggId}&stats=1`);
                if (!thingResponseFetch.ok) {
                    console.warn(`Failed to fetch details for BGG ID ${item.bggId}, status: ${thingResponseFetch.status}`);
                    return { ...item, name: item.name || "Unknown Name", rank: Number.MAX_SAFE_INTEGER }; // Keep basic info
                }
                const thingXml = await thingResponseFetch.text();
                const rank = await parseRankFromThingXml(thingXml);
                // Re-parse name from /thing response as it's more reliable
                const detailedGameData = await parseBggThingXmlToBoardGame(thingXml, parseInt(item.bggId));
                const name = (detailedGameData.name && detailedGameData.name !== "Name Not Found in Details") ? detailedGameData.name : item.name;
                
                return { bggId: item.bggId, name: name || "Unknown Name", yearPublished: detailedGameData.yearPublished || item.yearPublished, rank };
            } catch (e) {
                console.warn(`Error processing details for BGG ID ${item.bggId}:`, e);
                return { ...item, name: item.name || "Unknown Name", rank: Number.MAX_SAFE_INTEGER }; // Fallback
            }
        });

        const enrichedResults = await Promise.all(enrichedResultsPromises);
        // Sort by rank, putting unranked items last
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

    // Check if game already exists in mock data (simulating DB check for this part)
    const existingGameId = `bgg-${bggId}`;
    const existingGame = mockGames.find(game => game.id === existingGameId);
    if (existingGame) {
        return { gameId: existingGame.id }; // Game already "imported"
    }

    try {
        // Fetch full game details from BGG /thing API
        const thingResponseFetch = await fetch(`${BGG_API_BASE_URL}/thing?id=${numericBggId}&stats=1`);
        if (!thingResponseFetch.ok) {
            throw new Error(`BGG API Error (Thing): ${thingResponseFetch.status} ${thingResponseFetch.statusText}`);
        }
        const thingXml = await thingResponseFetch.text();
        const parsedGameData = await parseBggThingXmlToBoardGame(thingXml, numericBggId);

        if (!parsedGameData.name || parsedGameData.name === "Name Not Found in Details") {
            return { error: 'Essential game details (name) missing from BGG response.' };
        }

        const newGame: BoardGame = {
            id: existingGameId, // Create an internal ID
            name: parsedGameData.name,
            coverArtUrl: parsedGameData.coverArtUrl || `https://placehold.co/400x600.png?text=${encodeURIComponent(parsedGameData.name)}`,
            description: parsedGameData.description || 'No description available.',
            reviews: [], // New games start with no reviews
            yearPublished: parsedGameData.yearPublished,
            minPlayers: parsedGameData.minPlayers,
            maxPlayers: parsedGameData.maxPlayers,
            playingTime: parsedGameData.playingTime,
            bggId: numericBggId,
        };

        mockGames.push(newGame); // Add to in-memory store
        if (!allMockReviews[existingGameId]) { // Ensure review array exists for new game
            allMockReviews[existingGameId] = [];
        }
        
        revalidatePath('/'); // Revalidate home page list
        revalidatePath(`/games/${newGame.id}`); // Revalidate the new game's detail page
        return { gameId: newGame.id };

    } catch (error) {
        console.error('BGG Import Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during BGG import.';
        return { error: `BGG API Error: ${errorMessage}` };
    }
}


// --- Mock Data Interaction ---
async function findGameById(gameId: string): Promise<BoardGame | undefined> {
  // Ensure reviews are correctly associated from the central allMockReviews object
  const game = mockGames.find(g => g.id === gameId);
  if (game) {
    // Return a copy with the most up-to-date reviews
    return { ...game, reviews: allMockReviews[gameId] || game.reviews || [] };
  }
  return undefined;
}

export async function getGameDetails(gameId: string): Promise<BoardGame | null> {
  const game = await findGameById(gameId);
  if (!game) {
    return null;
  }
  return game;
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
    return { message: 'Review submitted successfully!', success: true };
  } else {
    // This case implies gameId wasn't found in addReviewToMockGame, which shouldn't happen if the page loaded.
    return { message: 'Failed to submit review: Game not found.', success: false };
  }
}

export async function generateAiSummaryAction(gameId: string): Promise<AiSummary | { error: string }> {
  const game = await findGameById(gameId);
  if (!game) {
    return { error: 'Game not found.' };
  }
  const currentReviews = game.reviews || []; 
  if (currentReviews.length === 0) {
    return { error: 'No reviews available to summarize for this game.' };
  }

  // Filter out reviews with empty comments
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
  // Ensure all games returned have their reviews correctly mapped from allMockReviews
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
    const itemMatches = xmlText.matchAll(/<item objecttype="thing" subtype="boardgame" collid="\d+" objectid="(\d+)">([\s\S]*?)<\/item>/g);

    for (const itemMatch of itemMatches) {
        const bggId = parseInt(itemMatch[1], 10);
        const itemContent = itemMatch[2];

        let name = 'Unknown Game';
        const nameMatch = /<name sortindex="1">([\s\S]*?)<\/name>/.exec(itemContent);
        if (nameMatch && nameMatch[1]) {
            name = decodeHtmlEntities(nameMatch[1].trim()) || 'Unknown Game (Parsed Empty)';
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
        const statsMatch = /<stats minplayers="(\d+)" maxplayers="(\d+)" minplaytime="\d+" maxplaytime="\d+" playingtime="(\d+)"/.exec(itemContent);
        if (statsMatch) {
            minPlayers = parseInt(statsMatch[1], 10);
            maxPlayers = parseInt(statsMatch[2], 10);
            playingTime = parseInt(statsMatch[3], 10); // playingtime is the 3rd capture group here
        }
        
        games.push({
            id: `bgg-${bggId}`, // Create consistent ID
            bggId,
            name,
            yearPublished,
            coverArtUrl,
            minPlayers,
            maxPlayers,
            playingTime,
            reviews: [], // Reviews are not part of BGG collection data
            description: 'Description not available from BGG collection sync.', // BGG collection doesn't provide full descriptions
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
            const response = await fetch(url, { cache: 'no-store' }); // no-store to avoid cached 202s

            if (response.status === 200) {
                const text = await response.text();
                if (text.includes("<items")) { // Successfully fetched collection data (could be empty if items totalitems="0")
                    return text;
                }
                // If 200 OK but no <items> tag, treat as potentially transient issue or malformed
                console.warn(`BGG Collection for ${username} (Attempt ${i+1}/${retries}): 200 OK but no <items> tag. XML: ${text.substring(0,200)}...`);
                if (i === retries - 1) throw new Error(`BGG Collection for ${username} returned 200 OK but content was malformed after ${retries} retries (no "<items>" tag found).`);
            } else if (response.status === 202) {
                // Request accepted, processing. Wait and retry if not last attempt.
                if (i === retries - 1) throw new Error(`BGG Collection for ${username} still processing (202) after ${retries} attempts.`);
                console.log(`BGG Collection for ${username} (Attempt ${i+1}/${retries}): Not ready (202). Retrying in ${delay / 1000}s...`);
            } else {
                // Other error (4xx, 5xx)
                const errorText = await response.text().catch(() => "Could not read error response body.");
                console.error(`BGG API Error (Collection) for ${username}: ${response.status} ${response.statusText}. Body: ${errorText.substring(0, 500)}`);
                throw new Error(`BGG API Error (Collection): ${response.status} ${response.statusText}. User: ${username}.`);
            }

            // Wait before retrying for 202 or malformed 200
            await new Promise(resolve => setTimeout(resolve, delay));
            delay = Math.min(delay * 2, 30000); // Exponential backoff, up to 30s
        }
        // Fallback, should ideally be caught by specific errors above
        throw new Error(`BGG Collection for ${username} could not be retrieved after ${retries} attempts (exhausted retries).`);
    };

    try {
        const collectionUrl = `${BGG_API_BASE_URL}/collection?username=${encodeURIComponent(username)}&own=1&excludesubtype=boardgameexpansion&stats=1`;
        const collectionXml = await fetchWithRetry(collectionUrl);
        
        if (collectionXml.includes("<error>")) { 
             const messageMatch = /<message>([\s\S]*?)<\/message>/.exec(collectionXml);
             const errorMessage = messageMatch ? decodeHtmlEntities(messageMatch[1]) : "Unknown BGG error message.";
             if (errorMessage.toLowerCase().includes("invalid username") || errorMessage.toLowerCase().includes("user not found")) {
                return { error: `BGG User "${username}" not found or collection is private.`};
             }
             return { error: `BGG API Error: ${errorMessage}` };
        }
        // If fetchWithRetry succeeded, collectionXml should include "<items"
        // An empty collection (e.g. <items totalitems="0">...</items>) is valid and parseBggCollectionXml will return [].

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
        querySnapshot.forEach((docSnap) => { // Renamed to avoid conflict with outer 'doc'
            games.push({ id: docSnap.id, ...docSnap.data() } as BoardGame);
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
            if (!game.id) { // Should not happen if IDs are generated correctly
                console.error(`Game "${game.name}" is missing an ID and cannot be added.`);
                throw new Error(`Game "${game.name}" is missing an ID.`);
            }
            const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
            // Ensure all fields are defined or Firestore will complain.
            // Use null for undefined optional fields if Firestore expects explicit nulls.
            const gameDataForFirestore = {
                bggId: game.bggId, // This is a number
                name: game.name || "Unknown Name",
                coverArtUrl: game.coverArtUrl || `https://placehold.co/100x150.png?text=No+Image`,
                yearPublished: game.yearPublished ?? null, // Use null if undefined
                minPlayers: game.minPlayers ?? null,
                maxPlayers: game.maxPlayers ?? null,
                playingTime: game.playingTime ?? null,
                description: game.description ?? "No description available.",
                reviews: game.reviews || [], // Ensure reviews is an array, even if empty
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
        
        revalidatePath('/collection'); // Revalidate the collection page to show updated DB state
        revalidatePath('/'); // Revalidate home page if it might use collection data
        return { success: true, message: `Sync complete. ${gamesToAdd.length} games added/updated, ${gamesToRemove.length} games removed.` };

    } catch (error) {
        console.error('Error syncing games to Firestore:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during database sync.';
        return { success: false, message: 'Database sync failed.', error: errorMessage };
    }
}


    