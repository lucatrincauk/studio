
'use server';

import { revalidatePath } from 'next/cache';
import { summarizeReviews } from '@/ai/flows/summarize-reviews';
import { mockGames, addReviewToMockGame, mockReviews as allMockReviews } from '@/data/mock-games';
import type { BoardGame, Review, Rating, AiSummary, SummarizeReviewsInput, BggSearchResult } from './types';
import { z } from 'zod';
import { bgg } from 'bgg-sdk'; // Import the 'bgg' object as suggested by previous errors
import type { Thing } from 'bgg-sdk/dist/types'; // Adjusted import path based on typical SDK structure

// Assume 'bgg' is the instantiated client or provides access to it
const bggClient = bgg; // If 'bgg' is the client instance itself

// Helper to extract the primary name from BGG SDK's name array
function getPrimaryName(names: Thing['names']): string {
  if (!names) return 'Unknown Game';
  // The 'names' property can be a single object or an array of objects.
  // If it's an array, find the one with type 'primary'.
  if (Array.isArray(names)) {
    const primaryNameObj = names.find(n => n.type === 'primary');
    return primaryNameObj ? primaryNameObj.value : (names[0]?.value || 'Unknown Game');
  } else if (typeof names === 'object' && 'value' in names) {
    // If it's a single name object (not an array)
    return (names as { value: string; type?: string }).value;
  } else if (typeof names === 'string') { // Should not happen based on Thing['names'] type but good to check
    return names;
  }
  return 'Unknown Game';
}


export async function searchBggGamesAction(searchTerm: string): Promise<BggSearchResult[] | { error: string }> {
  if (!searchTerm.trim()) {
    return { error: 'Search term cannot be empty.' };
  }
  try {
    const searchResponse = await bggClient.search.query({ query: searchTerm, type: ['boardgame'] });

    if (!searchResponse || searchResponse.length === 0) {
      return [];
    }
    
    const limitedResults = searchResponse.slice(0, 10); // Limit to 10 results to avoid too many API calls

    // Fetch details for each game to get the rank
    const enrichedResultsPromises = limitedResults.map(async (item) => {
      try {
        // The BGG SDK's thing.query expects an array of IDs.
        const thingDetailsArr = await bggClient.thing.query({ id: [item.id], stats: 1 });
        let rank = Number.MAX_SAFE_INTEGER; // Default for unranked or error
        let actualName = item.name; // Default to search result name
        let yearPublished = item.yearPublished;


        if (thingDetailsArr && thingDetailsArr.length > 0) {
          const thing = thingDetailsArr[0];
          actualName = getPrimaryName(thing.names) || item.name;
          yearPublished = thing.yearPublished || item.yearPublished;

          // Correctly access rank: statistics -> ratings -> ranks (array) -> find boardgame rank
          if (thing.statistics && thing.statistics.ratings && thing.statistics.ratings.ranks) {
            // Ranks can be an array or a single object, ensure it's an array
            const ranksArray = Array.isArray(thing.statistics.ratings.ranks) ? thing.statistics.ratings.ranks : [thing.statistics.ratings.ranks];
            const boardgameRank = ranksArray.find(r => r.name === 'boardgame' && r.type === 'subtype');
            if (boardgameRank && typeof boardgameRank.value === 'string' && boardgameRank.value !== 'Not Ranked') {
              const parsedRank = parseInt(boardgameRank.value, 10);
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
        // Return basic info if detail fetch fails
        return {
          bggId: item.id.toString(),
          name: item.name, // Use name from search result
          yearPublished: item.yearPublished || undefined,
          rank: Number.MAX_SAFE_INTEGER, // Default rank for error cases
        };
      }
    });

    const enrichedResults = await Promise.all(enrichedResultsPromises);
    
    // Sort by rank (ascending, Not Ranked items will be at the end due to MAX_SAFE_INTEGER)
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
    // It's better to return a structured error
    return { error: `BGG SDK Error: ${errorMessage}` };
  }
}

export async function importAndRateBggGameAction(bggId: string): Promise<{ gameId: string } | { error: string }> {
  const numericBggId = parseInt(bggId, 10);
  if (isNaN(numericBggId)) {
    return { error: 'Invalid BGG ID format.' };
  }

  // Check if game already exists in our mock DB
  const existingGameId = `bgg-${bggId}`; // Create a unique ID for our system
  const existingGame = mockGames.find(game => game.id === existingGameId);
  if (existingGame) {
    return { gameId: existingGame.id }; // Game already imported, redirect to its page
  }

  try {
    const thingDetailsArr = await bggClient.thing.query({ id: [numericBggId], stats: 1 });

    if (!thingDetailsArr || thingDetailsArr.length === 0) {
      return { error: 'Could not retrieve game details from BGG.' };
    }
    
    const thing = thingDetailsArr[0]; // Assuming BGG SDK returns an array even for single ID query
    
    const gameName = getPrimaryName(thing.names);
    if (gameName === 'Unknown Game') { // Or check if essential details are missing
         return { error: 'Essential game details (name) missing from BGG response.' };
    }
    
    // Sanitize description which might contain HTML entities
    const description = thing.description ? thing.description.replace(/&rsquo;/g, "'").replace(/&ndash;/g, "-").replace(/&mdash;/g, "—").replace(/&quot;/g, "\"").replace(/&amp;/g, "&") : 'No description available.';

    const newGame: BoardGame = {
      id: existingGameId, // Use our generated ID
      name: gameName,
      coverArtUrl: thing.image || thing.thumbnail || `https://placehold.co/400x600.png?text=${encodeURIComponent(gameName)}`, // Use placeholder if no image
      description: description,
      reviews: [], // Initialize with no reviews
      yearPublished: thing.yearPublished || undefined,
      minPlayers: thing.minPlayers || undefined,
      maxPlayers: thing.maxPlayers || undefined,
      playingTime: thing.playingTime || thing.minPlaytime || undefined, // Some BGG entries use minPlaytime
      bggId: numericBggId,
    };

    // Add to our mock "database"
    mockGames.push(newGame);
    // Ensure an entry for reviews exists in allMockReviews for the new game
    if (!allMockReviews[existingGameId]) {
        allMockReviews[existingGameId] = [];
    }

    revalidatePath('/'); // Revalidate home page (game list)
    revalidatePath(`/games/${existingGameId}`); // Revalidate the new game's page path
    
    return { gameId: newGame.id };

  } catch (error) {
    console.error('BGG Import Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during BGG import.';
    return { error: errorMessage };
  }
}


// Helper to find a game (simulates DB query)
async function findGameById(gameId: string): Promise<BoardGame | undefined> {
  const game = mockGames.find(g => g.id === gameId);
  if (game) {
    // Ensure reviews are fresh from the central mockReviews object
    return { ...game, reviews: allMockReviews[gameId] || game.reviews || [] };
  }
  return undefined;
}

export async function getGameDetails(gameId: string): Promise<BoardGame | null> {
  const game = await findGameById(gameId);
  if (!game) return null;
  return game;
}

// Schema for validating review form data
const reviewSchema = z.object({
  author: z.string().min(2, "Name must be at least 2 characters.").max(50, "Name cannot exceed 50 characters."),
  feeling: z.coerce.number().min(1, "Rating is required").max(5),
  gameDesign: z.coerce.number().min(1, "Rating is required").max(5),
  presentation: z.coerce.number().min(1, "Rating is required").max(5),
  management: z.coerce.number().min(1, "Rating is required").max(5),
  comment: z.string().min(5, "Comment must be at least 5 characters long.").max(500, "Comment must be at most 500 characters long."),
});

// Server action for submitting a new review
export async function submitNewReviewAction(
  gameId: string,
  prevState: any, // For useFormState: previous state
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
  
  // This structure matches what addReviewToMockGame expects
  const newReviewData = { rating, comment, author }; 
  const addedReview = addReviewToMockGame(gameId, newReviewData);

  if (addedReview) {
    revalidatePath(`/games/${gameId}`); // Revalidate the game detail page
    revalidatePath('/'); // Revalidate home page if it lists games or average ratings
    return { message: 'Review submitted successfully!', success: true, errors: undefined };
  } else {
    // This case should ideally not be hit if gameId is always valid from the form page
    return { message: 'Failed to submit review: Game not found.', success: false, errors: undefined };
  }
}


// Server action to generate AI summary for reviews
export async function generateAiSummaryAction(gameId: string): Promise<AiSummary | { error: string }> {
  const game = await findGameById(gameId);
  if (!game) {
    return { error: 'Game not found.' };
  }

  const currentReviews = game.reviews || []; // Use reviews from the enriched game object

  if (currentReviews.length === 0) {
    return { error: 'No reviews available to summarize for this game.' };
  }

  // Filter out reviews with empty comments, as they don't contribute to summary
  const reviewComments = currentReviews.map(review => review.comment).filter(comment => comment.trim() !== '');

  if (reviewComments.length === 0) {
    return { error: 'No review comments available to summarize.' };
  }

  try {
    const input: SummarizeReviewsInput = {
      gameName: game.name,
      reviews: reviewComments,
    };
    const summaryOutput = await summarizeReviews(input); // Call the Genkit flow
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
  // Simulate fetching all games. Ensure reviews are correctly associated if they are managed in allMockReviews
  return Promise.resolve(mockGames.map(game => ({
    ...game,
    reviews: allMockReviews[game.id] || game.reviews || [] // Ensure reviews are up-to-date
  })));
}

// Function to get the BGG client (not directly exported, used internally)
// const getBggClient = () => bggClient;

