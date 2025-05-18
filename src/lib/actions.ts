
'use server';

import { revalidatePath } from 'next/cache';
import { summarizeReviews } from '@/ai/flows/summarize-reviews';
import { mockGames, addReviewToMockGame, mockReviews as allMockReviews } from '@/data/mock-games';
import type { BoardGame, Review, Rating, AiSummary, SummarizeReviewsInput, BggSearchResult } from './types';
import { z } from 'zod';
import bggSdkModule from 'bgg-sdk'; // Changed to default import
import type { Thing } from 'bgg-sdk/dist/types';

// Assuming the 'bgg' instance is a property on the default export
// based on common CJS/ESM interop patterns and SDK's structure.
const bggClient = bggSdkModule.bgg;

// Helper to extract the primary name from BGG SDK's name array
function getPrimaryName(names: Thing['names']): string {
  if (!names) return 'Unknown Game';
  if (Array.isArray(names)) {
    const primaryNameObj = names.find(n => n.type === 'primary');
    return primaryNameObj ? primaryNameObj.value : (names[0]?.value || 'Unknown Game');
  } else if (typeof names === 'object' && 'value' in names) {
    return (names as { value: string; type?: string }).value;
  } else if (typeof names === 'string') {
    return names;
  }
  return 'Unknown Game';
}


export async function searchBggGamesAction(searchTerm: string): Promise<BggSearchResult[] | { error: string }> {
  if (!searchTerm.trim()) {
    return { error: 'Search term cannot be empty.' };
  }
  try {
    // Use the bggClient instance obtained via default import
    const searchResponse = await bggClient.search.query({ query: searchTerm, type: ['boardgame'] });

    if (!searchResponse || searchResponse.length === 0) {
      return [];
    }
    
    const limitedResults = searchResponse.slice(0, 10); 

    const enrichedResultsPromises = limitedResults.map(async (item) => {
      try {
        const thingDetailsArr = await bggClient.thing.query({ id: [item.id], stats: 1 });
        let rank = Number.MAX_SAFE_INTEGER; 
        let actualName = item.name; 
        let yearPublished = item.yearpublished; // Corrected from yearPublished to item.yearpublished based on SDK type for SearchResponseItem


        if (thingDetailsArr && thingDetailsArr.length > 0) {
          const thing = thingDetailsArr[0];
          actualName = getPrimaryName(thing.names) || item.name;
          yearPublished = thing.yearpublished || item.yearpublished;

          if (thing.statistics && thing.statistics.ratings && thing.statistics.ratings.ranks) {
            const ranksArray = Array.isArray(thing.statistics.ratings.ranks) ? thing.statistics.ratings.ranks : [thing.statistics.ratings.ranks];
            const boardgameRankObj = ranksArray.find(r => r.name === 'boardgame' && r.type === 'subtype');
            if (boardgameRankObj && typeof boardgameRankObj.value === 'string' && boardgameRankObj.value !== 'Not Ranked') {
              const parsedRank = parseInt(boardgameRankObj.value, 10);
              if (!isNaN(parsedRank)) {
                rank = parsedRank;
              }
            }
          }
        }
        return {
          bggId: item.id.toString(),
          name: actualName,
          yearPublished: yearPublished || undefined,
          rank: rank,
        };
      } catch (e) {
        console.warn(`Error fetching details for BGG ID ${item.id}:`, e);
        return {
          bggId: item.id.toString(),
          name: item.name, 
          yearPublished: item.yearpublished || undefined, // Corrected from yearPublished
          rank: Number.MAX_SAFE_INTEGER, 
        };
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
    return { error: `BGG SDK Error: ${errorMessage}` };
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
    const thingDetailsArr = await bggClient.thing.query({ id: [numericBggId], stats: 1 });

    if (!thingDetailsArr || thingDetailsArr.length === 0) {
      return { error: 'Could not retrieve game details from BGG.' };
    }
    
    const thing = thingDetailsArr[0]; 
    
    const gameName = getPrimaryName(thing.names);
    if (gameName === 'Unknown Game') { 
         return { error: 'Essential game details (name) missing from BGG response.' };
    }
    
    const description = thing.description ? thing.description.replace(/&rsquo;/g, "'").replace(/&ndash;/g, "-").replace(/&mdash;/g, "—").replace(/&quot;/g, "\"").replace(/&amp;/g, "&") : 'No description available.';

    const newGame: BoardGame = {
      id: existingGameId, 
      name: gameName,
      coverArtUrl: thing.image || thing.thumbnail || `https://placehold.co/400x600.png?text=${encodeURIComponent(gameName)}`, 
      description: description,
      reviews: [], 
      yearPublished: thing.yearpublished || undefined, // Corrected based on SDK Thing type
      minPlayers: thing.minplayers?.value || undefined, // Corrected based on SDK Thing type
      maxPlayers: thing.maxplayers?.value || undefined, // Corrected based on SDK Thing type
      playingTime: thing.playingtime?.value || thing.minplaytime?.value || undefined, // Corrected based on SDK Thing type
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
    return { error: errorMessage };
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
