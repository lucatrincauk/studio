
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { BoardGame, Review, Rating, RatingCategory } from "./types";
import { RATING_CATEGORIES } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function calculateOverallCategoryAverage(rating: Rating): number {
  const {
    excitedToReplay,
    mentallyStimulating,
    fun,
    decisionDepth,
    replayability,
    luck,
    lengthDowntime,
    presentation,
    management
  } = rating;
  const sum = excitedToReplay +
              mentallyStimulating +
              fun +
              decisionDepth +
              replayability +
              luck +
              lengthDowntime +
              presentation +
              management;
  const count = Object.keys(rating).length;
  if (count === 0) return 0;
  const average = sum / count;
  return Math.round(average * 10) / 10;
}

export function calculateCategoryAverages(reviews: Review[]): Rating | null {
  if (!reviews || reviews.length === 0) {
    return null;
  }

  const numReviews = reviews.length;
  const sumOfRatings: Rating = {
    excitedToReplay: 0,
    mentallyStimulating: 0,
    fun: 0,
    decisionDepth: 0,
    replayability: 0,
    luck: 0,
    lengthDowntime: 0,
    presentation: 0,
    management: 0,
  };

  reviews.forEach(review => {
    sumOfRatings.excitedToReplay += review.rating.excitedToReplay;
    sumOfRatings.mentallyStimulating += review.rating.mentallyStimulating;
    sumOfRatings.fun += review.rating.fun;
    sumOfRatings.decisionDepth += review.rating.decisionDepth;
    sumOfRatings.replayability += review.rating.replayability;
    sumOfRatings.luck += review.rating.luck;
    sumOfRatings.lengthDowntime += review.rating.lengthDowntime;
    sumOfRatings.presentation += review.rating.presentation;
    sumOfRatings.management += review.rating.management;
  });

  const averageRatings: Rating = {
    excitedToReplay: Math.round((sumOfRatings.excitedToReplay / numReviews) * 10) / 10,
    mentallyStimulating: Math.round((sumOfRatings.mentallyStimulating / numReviews) * 10) / 10,
    fun: Math.round((sumOfRatings.fun / numReviews) * 10) / 10,
    decisionDepth: Math.round((sumOfRatings.decisionDepth / numReviews) * 10) / 10,
    replayability: Math.round((sumOfRatings.replayability / numReviews) * 10) / 10,
    luck: Math.round((sumOfRatings.luck / numReviews) * 10) / 10,
    lengthDowntime: Math.round((sumOfRatings.lengthDowntime / numReviews) * 10) / 10,
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
