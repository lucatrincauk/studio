'use server';

import { revalidatePath } from 'next/cache';
import { summarizeReviews } from '@/ai/flows/summarize-reviews';
import { mockGames, addReviewToMockGame, mockReviews as allMockReviews } from '@/data/mock-games';
import type { BoardGame, Review, Rating, AiSummary, SummarizeReviewsInput } from './types';
import { z } from 'zod';

// Helper to find a game (simulates DB query)
async function findGameById(gameId: string): Promise<BoardGame | undefined> {
  // Make sure to get the latest reviews from allMockReviews
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
  
  const newReviewData = { rating, comment, author }; // Add author here
  const addedReview = addReviewToMockGame(gameId, newReviewData);

  if (addedReview) {
    revalidatePath(`/games/${gameId}`);
    revalidatePath('/'); // Revalidate home page if average ratings are shown
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
  // Ensure each game has its latest reviews from allMockReviews
  return Promise.resolve(mockGames.map(game => ({
    ...game,
    reviews: allMockReviews[game.id] || game.reviews || []
  })));
}
