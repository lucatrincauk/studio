
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
    graphicDesign,
    componentsThemeLore,
    effortToLearn,
    setupTeardown
  } = rating;
  const sum = excitedToReplay +
              mentallyStimulating +
              fun +
              decisionDepth +
              replayability +
              luck +
              lengthDowntime +
              graphicDesign +
              componentsThemeLore +
              effortToLearn +
              setupTeardown;
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
    graphicDesign: 0,
    componentsThemeLore: 0,
    effortToLearn: 0,
    setupTeardown: 0,
  };

  reviews.forEach(review => {
    (Object.keys(sumOfRatings) as Array<keyof Rating>).forEach(key => {
      sumOfRatings[key] += review.rating[key] || 0;
    });
  });

  const averageRatings: Rating = {
    excitedToReplay: Math.round((sumOfRatings.excitedToReplay / numReviews) * 10) / 10,
    mentallyStimulating: Math.round((sumOfRatings.mentallyStimulating / numReviews) * 10) / 10,
    fun: Math.round((sumOfRatings.fun / numReviews) * 10) / 10,
    decisionDepth: Math.round((sumOfRatings.decisionDepth / numReviews) * 10) / 10,
    replayability: Math.round((sumOfRatings.replayability / numReviews) * 10) / 10,
    luck: Math.round((sumOfRatings.luck / numReviews) * 10) / 10,
    lengthDowntime: Math.round((sumOfRatings.lengthDowntime / numReviews) * 10) / 10,
    graphicDesign: Math.round((sumOfRatings.graphicDesign / numReviews) * 10) / 10,
    componentsThemeLore: Math.round((sumOfRatings.componentsThemeLore / numReviews) * 10) / 10,
    effortToLearn: Math.round((sumOfRatings.effortToLearn / numReviews) * 10) / 10,
    setupTeardown: Math.round((sumOfRatings.setupTeardown / numReviews) * 10) / 10,
  };

  return averageRatings;
}

export interface SubRatingAverage {
  name: string;
  average: number;
}
export interface SectionAverage {
  sectionTitle: string;
  sectionAverage: number;
  subRatings: SubRatingAverage[];
}
export type GroupedCategoryAverages = SectionAverage[];


export function calculateGroupedCategoryAverages(reviews: Review[]): GroupedCategoryAverages | null {
  const individualAverages = calculateCategoryAverages(reviews);

  if (!individualAverages) {
    return null;
  }

  const sectionsMeta: Array<{ title: string; keys: RatingCategory[] }> = [
    { title: "Sentiments", keys: ['excitedToReplay', 'mentallyStimulating', 'fun'] },
    { title: "Game Design", keys: ['decisionDepth', 'replayability', 'luck', 'lengthDowntime'] },
    { title: "Aesthetics & Immersion", keys: ['graphicDesign', 'componentsThemeLore'] },
    { title: "Learning & Logistics", keys: ['effortToLearn', 'setupTeardown'] },
  ];

  const groupedAverages: GroupedCategoryAverages = sectionsMeta.map(section => {
    let sectionSum = 0;
    let sectionCount = 0;
    const subRatings: SubRatingAverage[] = section.keys.map(key => {
      const average = individualAverages[key];
      sectionSum += average;
      sectionCount++;
      return { name: RATING_CATEGORIES[key], average };
    });

    return {
      sectionTitle: section.title,
      sectionAverage: sectionCount > 0 ? Math.round((sectionSum / sectionCount) * 10) / 10 : 0,
      subRatings,
    };
  });

  return groupedAverages;
}


export function formatReviewDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
