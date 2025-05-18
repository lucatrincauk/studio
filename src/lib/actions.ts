
'use server';

import { revalidatePath } from 'next/cache';
import { summarizeReviews } from '@/ai/flows/summarize-reviews';
import { mockGames, addReviewToMockGame, mockReviews as allMockReviews } from '@/data/mock-games';
import type { BoardGame, Review, Rating, AiSummary, SummarizeReviewsInput, BggSearchResult } from './types';
import { z } from 'zod';

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


// Helper to parse the main name from <name> tags
function parsePrimaryName(nameElements: Element[]): string {
    let primaryName = '';
    // Try to find the primary name
    for (const nameEl of nameElements) {
        if (nameEl.getAttribute('type') === 'primary') {
            primaryName = decodeHtmlEntities(nameEl.getAttribute('value') || '');
            if (primaryName) break;
        }
    }
    // If no primary name, take the first name found
    if (!primaryName && nameElements.length > 0) {
        primaryName = decodeHtmlEntities(nameElements[0].getAttribute('value') || '');
    }
    return primaryName || 'Unknown Name';
}


async function parseBggSearchXml(xmlText: string): Promise<Omit<BggSearchResult, 'rank'>[]> {
    const results: Omit<BggSearchResult, 'rank'>[] = [];
    const itemMatches = xmlText.matchAll(/<item type="boardgame" id="(\d+?)">([\s\S]*?)<\/item>/g);

    for (const itemMatch of itemMatches) {
        const id = itemMatch[1];
        const itemContent = itemMatch[2];

        let name = 'Unknown Name';
        const nameMatch = /<name type="primary" sortindex="\d+" value="(.*?)"\/>/.exec(itemContent) || /<name value="(.*?)"\/>/.exec(itemContent);
        if (nameMatch && nameMatch[1]) {
            name = decodeHtmlEntities(nameMatch[1]);
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
    // Regex to find <rank type="subtype" name="boardgame" value="[RANK]" ...>
    // Making friendlyname optional and more flexible for other attributes
    const rankMatch = /<rank\s+type="subtype"\s+name="boardgame"\s+(?:bayesaverage="[^"]*"\s+)?value="(\d+)"(?:\s+friendlyname="[^"]*")?\s*\/?>/i.exec(xmlText);
    if (rankMatch && rankMatch[1]) {
        const rankValue = parseInt(rankMatch[1], 10);
        return isNaN(rankValue) ? Number.MAX_SAFE_INTEGER : rankValue;
    }
    // Fallback for "Not Ranked" or if rank is missing
    const notRankedMatch = /<rank\s+type="subtype"\s+name="boardgame"\s+value="Not Ranked"/i.exec(xmlText);
    if (notRankedMatch) {
        return Number.MAX_SAFE_INTEGER;
    }
    return Number.MAX_SAFE_INTEGER; // Default for unranked or error
}

async function parseBggThingXml(xmlText: string, bggIdInput: number | string): Promise<Partial<BoardGame>> {
    const gameData: Partial<BoardGame> = { bggId: typeof bggIdInput === 'string' ? parseInt(bggIdInput) : bggIdInput };
    
    const nameMatches = Array.from(xmlText.matchAll(/<name\s+type="(primary|alternate)"\s+sortindex="\d+"\s+value="([^"]+?)"\s*\/>/g));
    const nameElementsForParsing = nameMatches.map(match => ({ getAttribute: (attr: string) => {
        if (attr === 'type') return match[1];
        if (attr === 'value') return match[2];
        return null;
    }})) as unknown as Element[]; // Type assertion for simplicity
    gameData.name = parsePrimaryName(nameElementsForParsing);

    const descriptionMatch = /<description>([\s\S]*?)<\/description>/.exec(xmlText);
    if (descriptionMatch && descriptionMatch[1]) {
        gameData.description = decodeHtmlEntities(descriptionMatch[1]);
    }

    const imageMatch = /<image>([\s\S]*?)<\/image>/.exec(xmlText);
    if (imageMatch && imageMatch[1]) {
        gameData.coverArtUrl = decodeHtmlEntities(imageMatch[1]);
    } else {
        const thumbnailMatch = /<thumbnail>([\s\S]*?)<\/thumbnail>/.exec(xmlText);
        if (thumbnailMatch && thumbnailMatch[1]) {
            gameData.coverArtUrl = decodeHtmlEntities(thumbnailMatch[1]);
        }
    }
    
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
        const searchResponse = await fetch(`${BGG_API_BASE_URL}/search?query=${encodeURIComponent(searchTerm)}&type=boardgame`);
        if (!searchResponse.ok) {
            throw new Error(`BGG API Error: ${searchResponse.status} ${searchResponse.statusText}`);
        }
        const searchXml = await searchResponse.text();
        const basicResults = await parseBggSearchXml(searchXml);

        if (basicResults.length === 0) {
            return [];
        }

        const limitedResults = basicResults.slice(0, 10); // Limit to 10 results to avoid too many API calls

        const enrichedResultsPromises = limitedResults.map(async (item) => {
            try {
                const thingResponse = await fetch(`${BGG_API_BASE_URL}/thing?id=${item.bggId}&stats=1`);
                if (!thingResponse.ok) {
                    console.warn(`Failed to fetch details for BGG ID ${item.bggId}`);
                    return { ...item, rank: Number.MAX_SAFE_INTEGER }; // Default rank if thing fetch fails
                }
                const thingXml = await thingResponse.text();
                const rank = await parseRankFromThingXml(thingXml);
                
                // Optionally, update name and year from thingXml if more accurate
                const detailedGameData = await parseBggThingXml(thingXml, item.bggId);
                const name = detailedGameData.name && detailedGameData.name !== "Unknown Name" ? detailedGameData.name : item.name;
                const yearPublished = detailedGameData.yearPublished || item.yearPublished;

                return { bggId: item.bggId, name, yearPublished, rank };
            } catch (e) {
                console.warn(`Error processing details for BGG ID ${item.bggId}:`, e);
                return { ...item, rank: Number.MAX_SAFE_INTEGER }; // Default rank on error
            }
        });

        const enrichedResults = await Promise.all(enrichedResultsPromises);
        enrichedResults.sort((a, b) => a.rank - b.rank);
        
        return enrichedResults;

    } catch (error) {
        console.error('BGG Search Action Error:', error);
        let errorMessage = 'An unknown error occurred during BGG search.';
        if (error instanceof Error) {
            errorMessage = error.message;
        } else if (typeof error === 'string') {
            errorMessage = error;
        }
        return { error: `BGG API Error: ${errorMessage}` };
    }
}

export async function importAndRateBggGameAction(bggId: string): Promise<{ gameId: string } | { error: string }> {
    const numericBggId = parseInt(bggId, 10);
    if (isNaN(numericBggId)) {
        return { error: 'Invalid BGG ID format.' };
    }

    const existingGameId = `bgg-${bggId}`;
    const existingGame = mockGames.find(game => game.id === existingGameId);
    if (existingGame) {
        return { gameId: existingGame.id };
    }

    try {
        const thingResponse = await fetch(`${BGG_API_BASE_URL}/thing?id=${numericBggId}&stats=1`);
        if (!thingResponse.ok) {
            throw new Error(`BGG API Error: ${thingResponse.status} ${thingResponse.statusText}`);
        }
        const thingXml = await thingResponse.text();
        const parsedGameData = await parseBggThingXml(thingXml, numericBggId);

        if (!parsedGameData.name || parsedGameData.name === "Unknown Name") {
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

        revalidatePath('/');
        revalidatePath(`/games/${existingGameId}`);
        
        return { gameId: newGame.id };

    } catch (error) {
        console.error('BGG Import Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during BGG import.';
        return { error: `BGG API Error: ${errorMessage}` };
    }
}


async function findGameById(gameId: string): Promise<BoardGame | undefined> {
  const game = mockGames.find(g => g.id === gameId);
  if (game) {
    return { ...game, reviews: allMockReviews[gameId] || game.reviews || [] };
  }
  return undefined;
}

export async function getGameDetails(gameId: string): Promise<BoardGame | null> {
  const game = await findGameById(gameId);
  if (!game) return null;
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

export async function submitNewReviewAction(
  gameId: string,
  prevState: any, 
  formData: FormData
): Promise<{ message: string; errors?: Record<string, string[]>; success: boolean }> {
  
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
    return {
      message: "Failed to submit review. Please check the errors.",
      errors: validatedFields.error.flatten().fieldErrors,
      success: false,
    };
  }

  const { author, feeling, gameDesign, presentation, management, comment } = validatedFields.data;

  const rating: Rating = { feeling, gameDesign, presentation, management };
  
  const newReviewData = { rating, comment, author }; 
  const addedReview = addReviewToMockGame(gameId, newReviewData);

  if (addedReview) {
    revalidatePath(`/games/${gameId}`); 
    revalidatePath('/'); 
    return { message: 'Review submitted successfully!', success: true, errors: undefined };
  } else {
    return { message: 'Failed to submit review: Game not found.', success: false, errors: undefined };
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

  const reviewComments = currentReviews.map(review => review.comment).filter(comment => comment.trim() !== '');

  if (reviewComments.length === 0) {
    return { error: 'No review comments available to summarize.' };
  }

  try {
    const input: SummarizeReviewsInput = {
      gameName: game.name,
      reviews: reviewComments,
    };
    const summaryOutput = await summarizeReviews(input); 
    return { summary: summaryOutput.summary };
  } catch (error)
   {
    console.error('AI Summary Generation Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return { error: `Failed to generate AI summary: ${errorMessage}. Please try again later.` };
  }
}

export async function getAllGamesAction(): Promise<BoardGame[]> {
  return Promise.resolve(mockGames.map(game => ({
    ...game,
    reviews: allMockReviews[game.id] || game.reviews || [] 
  })));
}
