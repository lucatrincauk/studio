
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Review, Rating, RatingCategory, GroupedCategoryAverages, SectionAverage, SubRatingAverage } from "./types";
import { RATING_CATEGORIES } from "./types";
import { formatDistanceToNow, format as formatDateFns } from 'date-fns';
import { it } from 'date-fns/locale';

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

export function calculateOverallCategoryAverage(rating: Rating | null): number {
  if (!rating) return 0;

  let weightedSum = 0;
  let totalMaxPossibleScore = 0;

  (Object.keys(rating) as Array<keyof Rating>).forEach(key => {
    const weight = RATING_WEIGHTS[key];
    const score = rating[key] || 0; // Default to 0 if a category is missing
    weightedSum += (score * weight);
    totalMaxPossibleScore += (5 * weight); // Max score for a category is 5
  });

  if (totalMaxPossibleScore === 0) return 0;

  const normalizedScore = weightedSum / totalMaxPossibleScore; // Score between 0 and 1
  const average = 1 + (normalizedScore * 4); // Scale to 1-5 range
  return Math.round(average * 10) / 10; // Round to one decimal place
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


export function calculateGroupedCategoryAverages(reviews: Review[]): GroupedCategoryAverages | null {
  const individualSubCategoryAverages = calculateCategoryAverages(reviews);

  if (!individualSubCategoryAverages) {
    return null;
  }

  const sectionsMeta: Array<{ title: string; keys: RatingCategory[], iconName: string }> = [
    { title: "Sentimento", keys: ['excitedToReplay', 'mentallyStimulating', 'fun'], iconName: "Smile" },
    { title: "Design del Gioco", keys: ['decisionDepth', 'replayability', 'luck', 'lengthDowntime'], iconName: "Puzzle" },
    { title: "Estetica e Immersione", keys: ['graphicDesign', 'componentsThemeLore'], iconName: "Palette" },
    { title: "Apprendimento e Logistica", keys: ['effortToLearn', 'setupTeardown'], iconName: "ClipboardList" },
  ];

  const groupedAverages: SectionAverage[] = sectionsMeta.map(section => {
    let sectionWeightedSum = 0;
    let sectionTotalMaxPossibleScore = 0;

    const subRatings: SubRatingAverage[] = section.keys.map(key => {
      const subCategoryAverage = individualSubCategoryAverages[key];
      const weight = RATING_WEIGHTS[key];

      sectionWeightedSum += (subCategoryAverage * weight);
      sectionTotalMaxPossibleScore += (5 * weight);

      return { name: RATING_CATEGORIES[key], average: subCategoryAverage };
    });

    const normalizedSectionScore = sectionTotalMaxPossibleScore > 0
      ? sectionWeightedSum / sectionTotalMaxPossibleScore
      : 0;

    const sectionAverageValue = 1 + (normalizedSectionScore * 4); // Scale to 1-5

    return {
      sectionTitle: section.title,
      iconName: section.iconName,
      sectionAverage: Math.round(sectionAverageValue * 10) / 10,
      subRatings,
    };
  });

  return groupedAverages;
}


export function formatReviewDate(dateString: string): string {
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: it });
  } catch (error) {
    console.error("Error formatting review date:", error);
    const d = new Date(dateString);
    if (isNaN(d.getTime())) {
      return "Data non valida";
    }
    return d.toLocaleDateString('it-IT');
  }
}

export function formatPlayDate(dateString: string): string {
  try {
    return formatDateFns(new Date(dateString), 'dd/MM/yyyy', { locale: it });
  } catch (error) {
    console.error("Error formatting play date:", error);
    return "Data non valida";
  }
}
