
'use server';

import { revalidatePath } from 'next/cache';
import { summarizeReviews } from '@/ai/flows/summarize-reviews';
import { mockGames, addReviewToMockGame, mockReviews as allMockReviews } from '@/data/mock-games';
import type { BoardGame, Review, Rating, AiSummary, SummarizeReviewsInput, BggSearchResult } from './types';
import { z } from 'zod';

// Import 'bgg' (the pre-initialized client instance) and types from 'bgg-sdk'
import { bgg } from 'bgg-sdk';
import type { 
  SearchResponseItem as BggSdkSearchResponseItem, 
  Name, 
  YearPublished, 
  Thing, 
  Rank 
} from 'bgg-sdk';

const bggClient = bgg;

// Helper to extract the primary name value
function getPrimaryNameValue(nameInput: Name | Name[] | string | undefined): string {
  const fallbackName = "Name Not Found in Details"; // Specific fallback for this function
  if (!nameInput) return fallbackName;

  if (typeof nameInput === 'string') {
    const trimmedName = nameInput.trim();
    return trimmedName || fallbackName; // Return trimmed string or fallback if empty
  }

  const namesArray = Array.isArray(nameInput) ? nameInput : [nameInput];
  if (namesArray.length === 0) return fallbackName;

  // Find primary name first
  const primaryNameObj = namesArray.find(n => n.type === 'primary' && n.value && n.value.trim() !== '');
  if (primaryNameObj && primaryNameObj.value) {
    return primaryNameObj.value.trim();
  }
  
  // If no valid primary name, try the first name in the array, if it's valid and non-empty
  const firstNameObj = namesArray[0];
  if (firstNameObj && firstNameObj.value && firstNameObj.value.trim() !== '') {
    return firstNameObj.value.trim();
  }
  
  return fallbackName; // If no suitable name is found
}


export async function searchBggGamesAction(searchTerm: string): Promise<BggSearchResult[] | { error: string }> {
  if (!bggClient) {
    console.error('BGG SDK client not available or search function missing.');
    return { error: 'BGG SDK client not initialized.' };
  }
  if (!searchTerm.trim()) {
    return { error: 'Search term cannot be empty.' };
  }

  try {
    const responseFromSdk: any = await bggClient.search({ query: searchTerm, type: ['boardgame'] });

    let gamesList: BggSdkSearchResponseItem[] = [];

    if (responseFromSdk && typeof responseFromSdk === 'object' && responseFromSdk.items && Array.isArray(responseFromSdk.items)) {
      gamesList = responseFromSdk.items;
    } else if (Array.isArray(responseFromSdk)) {
      // Fallback if SDK structure is different, though user feedback suggests .items is correct
      gamesList = responseFromSdk;
    }


    if (!Array.isArray(gamesList) || gamesList.length === 0) {
      return [];
    }
    
    const limitedResults = gamesList.slice(0, 10); 

    const enrichedResultsPromises = limitedResults.map(async (item: BggSdkSearchResponseItem) => {
      try {
        const thingId = typeof item.id === 'string' ? parseInt(item.id, 10) : item.id;
        if (isNaN(thingId)) {
            console.warn(`Invalid BGG ID for item: ${item.name?.value}`);
            return {
              bggId: String(item.id),
              name: (item.name?.value && item.name.value.trim() !== '') ? item.name.value.trim() : 'Invalid BGG ID',
              yearPublished: item.yearpublished?.value,
              rank: Number.MAX_SAFE_INTEGER,
            };
        }

        // Initial values from search item
        let gameName = (item.name?.value && item.name.value.trim() !== '') ? item.name.value.trim() : 'Processing...';
        let yearPublishedValue = item.yearpublished?.value;
        let rankValue = Number.MAX_SAFE_INTEGER; 

        // Attempt to get more details from the 'thing' endpoint
        const thingDetailsArr: Thing[] = await bggClient.thing({ id: [thingId], stats: 1 });

        if (thingDetailsArr && thingDetailsArr.length > 0) {
          const thing = thingDetailsArr[0];
          const detailedName = getPrimaryNameValue(thing.name);

          if (detailedName !== "Name Not Found in Details") {
            gameName = detailedName; // Prioritize name from 'thing' details
          } else if (gameName === 'Processing...') { 
            // If 'thing' details didn't provide a name and initial search name was also placeholder
            gameName = 'Unknown Name'; 
          }
          // If 'thing' details name was fallback, but 'gameName' was already set from item.name.value, keep it.
          
          yearPublishedValue = thing.yearpublished?.value || yearPublishedValue;

          if (thing.statistics && thing.statistics.ratings && thing.statistics.ratings.ranks && thing.statistics.ratings.ranks.rank) {
            const ranksArray = Array.isArray(thing.statistics.ratings.ranks.rank) ? thing.statistics.ratings.ranks.rank : [thing.statistics.ratings.ranks.rank];
            const boardgameRankObj = ranksArray.find(r => r.name === 'boardgame' && r.type === 'subtype');
            if (boardgameRankObj && typeof boardgameRankObj.value === 'string' && boardgameRankObj.value !== 'Not Ranked') {
              const parsedRank = parseInt(boardgameRankObj.value, 10);
              if (!isNaN(parsedRank)) {
                rankValue = parsedRank;
              }
            }
          }
        } else {
          // If thing call failed or returned no data, and gameName is still 'Processing...'
          if (gameName === 'Processing...') {
            gameName = 'Unknown Name (details unavailable)';
          }
        }
        
        // Final check if gameName is still the processing placeholder after all attempts
        if (gameName === 'Processing...') {
            gameName = 'Unknown Name';
        }

        return {
          bggId: String(item.id),
          name: gameName,
          yearPublished: yearPublishedValue,
          rank: rankValue,
        };
      } catch (e) {
        console.warn(`Error fetching details for BGG ID ${item.id}:`, e);
        return {
          bggId: String(item.id),
          name: (item.name?.value && item.name.value.trim() !== '') ? item.name.value.trim() : 'Error fetching name', 
          yearPublished: item.yearpublished?.value,
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
  if (!bggClient) { 
    return { error: 'BGG SDK client not available.' };
  }
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
    const thingDetailsArr: Thing[] = await bggClient.thing({ id: [numericBggId], stats: 1 });

    if (!thingDetailsArr || thingDetailsArr.length === 0) {
      return { error: 'Could not retrieve game details from BGG.' };
    }
    
    const thing = thingDetailsArr[0]; 
    
    const gameName = getPrimaryNameValue(thing.name);
    if (gameName === "Name Not Found in Details") { 
         return { error: 'Essential game details (name) missing from BGG response.' };
    }
    
    const descriptionHtml = thing.description ? String(thing.description) : 'No description available.';
    // Basic HTML entity decoding
    const description = descriptionHtml
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        // BGG specific entities (often numerical) might need a more robust solution if they are common
        .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
        .replace(/&rsquo;/g, "’")
        .replace(/&ndash;/g, "–")
        .replace(/&mdash;/g, "—");


    const newGame: BoardGame = {
      id: existingGameId, 
      name: gameName,
      coverArtUrl: thing.image?.value || thing.thumbnail?.value || `https://placehold.co/400x600.png?text=${encodeURIComponent(gameName)}`, 
      description: description,
      reviews: [], 
      yearPublished: thing.yearpublished?.value,
      minPlayers: thing.minplayers?.value,
      maxPlayers: thing.maxplayers?.value,
      playingTime: thing.playingtime?.value || thing.minplaytime?.value, 
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
    return { error: `BGG SDK Error: ${errorMessage}` };
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


    