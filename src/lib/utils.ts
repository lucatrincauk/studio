import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { BoardGame, Review, Rating, RatingCategory } from "./types";
import { RATING_CATEGORIES } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function calculateAverageRating(game: BoardGame): number {
  if (!game.reviews || game.reviews.length === 0) {
    return 0;
  }

  let totalStars = 0;
  let numberOfRatings = 0;

  game.reviews.forEach(review => {
    totalStars += review.rating.feeling + review.rating.gameDesign + review.rating.presentation + review.rating.management;
    numberOfRatings += 4; // Each review has 4 rating categories
  });

  if (numberOfRatings === 0) return 0;
  
  const average = totalStars / numberOfRatings;
  return Math.round(average * 10) / 10; // Round to one decimal place
}

export function calculateOverallCategoryAverage(rating: Rating): number {
  const { feeling, gameDesign, presentation, management } = rating;
  const average = (feeling + gameDesign + presentation + management) / 4;
  return Math.round(average * 10) / 10;
}

export function calculateCategoryAverages(reviews: Review[]): Rating | null {
  if (!reviews || reviews.length === 0) {
    return null;
  }

  const numReviews = reviews.length;
  const sumOfRatings: Rating = {
    feeling: 0,
    gameDesign: 0,
    presentation: 0,
    management: 0,
  };

  reviews.forEach(review => {
    sumOfRatings.feeling += review.rating.feeling;
    sumOfRatings.gameDesign += review.rating.gameDesign;
    sumOfRatings.presentation += review.rating.presentation;
    sumOfRatings.management += review.rating.management;
  });

  const averageRatings: Rating = {
    feeling: Math.round((sumOfRatings.feeling / numReviews) * 10) / 10,
    gameDesign: Math.round((sumOfRatings.gameDesign / numReviews) * 10) / 10,
    presentation: Math.round((sumOfRatings.presentation / numReviews) * 10) / 10,
    management: Math.round((sumOfRatings.management / numReviews) * 10) / 10,
  };

  return averageRatings;
}


export function formatReviewDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
