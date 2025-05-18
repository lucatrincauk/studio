
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { BoardGame, Review, Rating, RatingCategory } from "./types";
import { RATING_CATEGORIES } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRatingNumber(num: number): string {
  if (num % 1 === 0) {
    return num.toFixed(0);
  }
  return num.toFixed(1);
}

const RATING_WEIGHTS: Record<RatingCategory, number> = {
  excitedToReplay: 4,
  mentallyStimulating: 2,
  fun: 2,
  decisionDepth: 2,
  replayability: 2,
  luck: 2,
  lengthDowntime: 2,
  graphicDesign: 1,
  componentsThemeLore: 1,
  effortToLearn: 1,
  setupTeardown: 1,
};

export function calculateOverallCategoryAverage(rating: Rating): number {
  let weightedSum = 0;
  let totalWeightFactor = 0; // Sum of all weights

  (Object.keys(rating) as Array<keyof Rating>).forEach(key => {
    const weight = RATING_WEIGHTS[key];
    weightedSum += (rating[key] * weight);
    totalWeightFactor += weight;
  });

  if (totalWeightFactor === 0) return 0;

  // The average is now on a 1-5 scale, reflecting the weighted influence
  const average = weightedSum / totalWeightFactor;
  return Math.round(average * 10) / 10; // Keep it on 1-5 scale, rounded
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
      // Ensure review.rating[key] exists and is a number, default to 0 if not
      const ratingValue = typeof review.rating[key] === 'number' ? review.rating[key] : 0;
      sumOfRatings[key] += ratingValue;
    });
  });

  const averageRatings: Rating = {} as Rating;
  (Object.keys(sumOfRatings) as Array<keyof Rating>).forEach(key => {
    averageRatings[key] = Math.round((sumOfRatings[key] / numReviews) * 10) / 10;
  });

  return averageRatings;
}

export interface SubRatingAverage {
  name: string;
  average: number; // This will be the unweighted average for display
}
export interface SectionAverage {
  sectionTitle: string;
  sectionAverage: number; // This will be the weighted average for the section trigger
  subRatings: SubRatingAverage[];
}
export type GroupedCategoryAverages = SectionAverage[];


export function calculateGroupedCategoryAverages(reviews: Review[]): GroupedCategoryAverages | null {
  const individualSubCategoryAverages = calculateCategoryAverages(reviews);

  if (!individualSubCategoryAverages) {
    return null;
  }

  const sectionsMeta: Array<{ title: string; keys: RatingCategory[] }> = [
    { title: "Sentiments", keys: ['excitedToReplay', 'mentallyStimulating', 'fun'] },
    { title: "Game Design", keys: ['decisionDepth', 'replayability', 'luck', 'lengthDowntime'] },
    { title: "Aesthetics & Immersion", keys: ['graphicDesign', 'componentsThemeLore'] },
    { title: "Learning & Logistics", keys: ['effortToLearn', 'setupTeardown'] },
  ];

  const groupedAverages: GroupedCategoryAverages = sectionsMeta.map(section => {
    let sectionWeightedSum = 0;
    let sectionTotalWeightFactor = 0; // Sum of weights for this section
    
    const subRatings: SubRatingAverage[] = section.keys.map(key => {
      const subCategoryAverage = individualSubCategoryAverages[key]; // Raw average (1-5)
      const weight = RATING_WEIGHTS[key];
      
      sectionWeightedSum += (subCategoryAverage * weight);
      sectionTotalWeightFactor += weight;
      
      return { name: RATING_CATEGORIES[key], average: subCategoryAverage }; // Store raw average for detail display
    });

    // Calculate the weighted average for the section, on a 1-5 scale
    const sectionAverageValue = sectionTotalWeightFactor > 0 
      ? Math.round((sectionWeightedSum / sectionTotalWeightFactor) * 10) / 10 
      : 0;

    return {
      sectionTitle: section.title,
      sectionAverage: sectionAverageValue,
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
