
'use server';

import { revalidatePath } from 'next/cache';
import { summarizeReviews } from '@/ai/flows/summarize-reviews';
import { mockGames, addReviewToMockGame, mockReviews as allMockReviews } from '@/data/mock-games';
import type { BoardGame, Review, Rating, AiSummary, SummarizeReviewsInput, BggSearchResult } from './types';
import { z } from 'zod';

// Helper to decode HTML entities commonly found in BGG data
function decodeHtmlEntities(text: string): string {
  if (!text) return "";
  // First, replace common named entities
  let decoded = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // Then, replace numerical entities (decimal and hex)
  decoded = decoded.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
  decoded = decoded.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
  
  // Remove any remaining <br /> tags or similar, then trim
  decoded = decoded.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim();
  return decoded;
}

// Updated helper to parse BGG search XML and attempt to extract rank
function parseBggSearchXmlWithRank(xml: string): BggSearchResult[] {
  const results: BggSearchResult[] = [];
  const itemRegex = /<item type="boardgame" id="(\d+)">([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const bggId = match[1];
    const itemContent = match[2];

    const nameRegex = /<name type="primary" value="([^"]+)"\s*\/>/;
    const nameMatch = itemContent.match(nameRegex);
    const name = nameMatch ? decodeHtmlEntities(nameMatch[1]) : 'Unknown Game';

    const yearRegex = /<yearpublished value="(\d+)"\s*\/>/;
    const yearMatch = itemContent.match(yearRegex);
    const yearPublished = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

    // Attempt to parse rank if present in the item's XML structure.
    // This is speculative for the /search endpoint.
    // A more robust way is to get rank from /thing?id=<ID>&stats=1,
    // but per user request, we are simplifying to one call.
    let rank = Number.MAX_SAFE_INTEGER; // Default to high number (last in sort)
    const rankRegex = /<rank type="subtype" name="boardgame" friendlyname="Board Game Rank" value="(\d+|Not Ranked)"/;
    const statsBlockRegex = /<statistics>([\s\S]*?)<\/statistics>/; // Check if there's a stats block
    const statsMatch = itemContent.match(statsBlockRegex);

    if (statsMatch) { // If a stats block exists for the item
        const rankMatch = statsMatch[0].match(rankRegex); // Search for rank within the stats block
         if (rankMatch) {
            if (rankMatch[1] === 'Not Ranked') {
                rank = Number.MAX_SAFE_INTEGER;
            } else {
                const parsedRank = parseInt(rankMatch[1], 10);
                if (!isNaN(parsedRank)) {
                    rank = parsedRank;
                }
            }
        }
    }
    // Fallback if no rank found in a per-item stats block (which is unlikely for /search)
    // The user might be thinking of a global stats block in the response, but that wouldn't be per-item.
    // For now, if not found within an item's own potential stats, it remains MAX_SAFE_INTEGER.

    results.push({ bggId, name, yearPublished, rank });
  }
  return results;
}


// Helper to parse BGG thing XML (very basic) for full import
function parseBggThingXml(xml: string): Partial<BoardGame> {
  const result: Partial<BoardGame> = {};
  
  const nameRegex = /<name type="primary" value="([^"]+)"\s*\/>/;
  const nameMatch = xml.match(nameRegex);
  if (nameMatch) result.name = decodeHtmlEntities(nameMatch[1]);

  const descriptionRegex = /<description>([\s\S]*?)<\/description>/;
  const descriptionMatch = xml.match(descriptionRegex);
  if (descriptionMatch) result.description = decodeHtmlEntities(descriptionMatch[1]);
  
  const imageRegex = /<image>([\s\S]*?)<\/image>/;
  const imageMatch = xml.match(imageRegex);
  if (imageMatch) result.coverArtUrl = imageMatch[1];
  else {
    const thumbnailRegex = /<thumbnail>([\s\S]*?)<\/thumbnail>/;
    const thumbnailMatch = xml.match(thumbnailRegex);
    if (thumbnailMatch) result.coverArtUrl = thumbnailMatch[1];
  }

  const yearRegex = /<yearpublished value="(\d+)"\s*\/>/;
  const yearMatch = xml.match(yearRegex);
  if (yearMatch) result.yearPublished = parseInt(yearMatch[1], 10);

  const minPlayersRegex = /<minplayers value="(\d+)"\s*\/>/;
  const minPlayersMatch = xml.match(minPlayersRegex);
  if (minPlayersMatch) result.minPlayers = parseInt(minPlayersMatch[1], 10);
  
  const maxPlayersRegex = /<maxplayers value="(\d+)"\s*\/>/;
  const maxPlayersMatch = xml.match(maxPlayersRegex);
  if (maxPlayersMatch) result.maxPlayers = parseInt(maxPlayersMatch[1], 10);

  const playingTimeRegex = /<playingtime value="(\d+)"\s*\/>/;
  const playingTimeMatch = xml.match(playingTimeRegex);
  if (playingTimeMatch) result.playingTime = parseInt(playingTimeMatch[1], 10);
  
  return result;
}


export async function searchBggGamesAction(searchTerm: string): Promise<BggSearchResult[] | { error: string }> {
  if (!searchTerm.trim()) {
    return { error: 'Search term cannot be empty.' };
  }
  try {
    // Single API call to BGG search with stats=1 parameter
    const searchResponse = await fetch(`https://boardgamegeek.com/xmlapi2/search?type=boardgame&stats=1&query=${encodeURIComponent(searchTerm)}`);
    if (!searchResponse.ok) {
      throw new Error(`BGG Search API request failed with status ${searchResponse.status}`);
    }
    const searchXmlData = await searchResponse.text();

    if (searchXmlData.includes("<error>")) {
        const messageMatch = searchXmlData.match(/<message>([^<]+)<\/message>/);
        const errorMessage = messageMatch ? messageMatch[1] : "Unknown BGG API error during search";
        return { error: `BoardGameGeek API Error: ${errorMessage}` };
    }

    const results = parseBggSearchXmlWithRank(searchXmlData);

    if (results.length === 0) {
        return [];
    }

    // Sort results by rank (ascending, unranked/error ones last)
    results.sort((a, b) => a.rank - b.rank);
    
    return results;

  } catch (error) {
    console.error('BGG Search Action Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during BGG search.';
    return { error: errorMessage };
  }
}

export async function importAndRateBggGameAction(bggId: string): Promise<{ gameId: string } | { error: string }> {
  const existingGameId = `bgg-${bggId}`;
  const existingGame = mockGames.find(game => game.id === existingGameId);
  if (existingGame) {
    return { gameId: existingGame.id }; // Game already exists, return its ID
  }

  try {
    // Fetching details for import, stats=1 ensures we get as much info as possible for the new game entry
    const response = await fetch(`https://boardgamegeek.com/xmlapi2/thing?id=${bggId}&stats=1`); 
    if (!response.ok) {
      throw new Error(`BGG Thing API request failed with status ${response.status}`);
    }
    const xmlData = await response.text();
    const gameDetails = parseBggThingXml(xmlData);

    if (!gameDetails.name) {
      return { error: 'Could not retrieve essential game details from BGG.' };
    }

    const newGame: BoardGame = {
      id: existingGameId,
      name: gameDetails.name,
      coverArtUrl: gameDetails.coverArtUrl || `https://placehold.co/400x600.png?text=${encodeURIComponent(gameDetails.name)}`, 
      description: gameDetails.description || 'No description available.',
      reviews: [],
      yearPublished: gameDetails.yearPublished,
      minPlayers: gameDetails.minPlayers,
      maxPlayers: gameDetails.maxPlayers,
      playingTime: gameDetails.playingTime,
      bggId: parseInt(bggId, 10),
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
    return { error: errorMessage };
  }
}


// Helper to find a game (simulates DB query)
async function findGameById(gameId: string): Promise<BoardGame | undefined> {
  const game = mockGames.find(game => game.id === gameId);
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

// Action to get all games for the home page
export async function getAllGamesAction(): Promise<BoardGame[]> {
  return Promise.resolve(mockGames.map(game => ({
    ...game,
    reviews: allMockReviews[game.id] || game.reviews || []
  })));
}

