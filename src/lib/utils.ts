import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Review, Rating, RatingCategory, GroupedCategoryAverages, SectionAverage, SubRatingAverage } from "./types";
import { RATING_CATEGORIES, RATING_WEIGHTS } from "./types"; // Import new RATING_WEIGHTS
import { formatDistanceToNow, format as formatDateFns, differenceInYears } from 'date-fns';
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

// Calculates the overall average on a 1-10 scale using the new weights
export function calculateOverallCategoryAverage(rating: Rating | null): number {
  if (!rating) return 0;

  let weightedSum = 0;
  let totalMaxPossibleScore = 0;

  (Object.keys(rating) as Array<keyof Rating>).forEach(key => {
    const weight = RATING_WEIGHTS[key];
    const score = rating[key] || 0; // Default to 0 if a category is missing
    weightedSum += (score * weight);
    totalMaxPossibleScore += (10 * weight); // Max score for a category is now 10
  });

  if (totalMaxPossibleScore === 0) return 0;

  const normalizedScore = weightedSum / totalMaxPossibleScore; // Score between 0 and 1
  const average = 1 + (normalizedScore * 9); // Scale to 1-10 range
  return Math.round(average * 10) / 10; // Round to one decimal place
}

// Calculates simple averages for each category, now resulting in 1-10 range
export function calculateCategoryAverages(reviewsOrRatings: Review[] | Rating[]): Rating | null {
  if (!reviewsOrRatings || reviewsOrRatings.length === 0) {
    return null;
  }

  const numItems = reviewsOrRatings.length;
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

  reviewsOrRatings.forEach(item => {
    const rating = 'rating' in item ? item.rating : item;
    (Object.keys(sumOfRatings) as Array<keyof Rating>).forEach(key => {
      const ratingValue = typeof rating[key] === 'number' ? rating[key] : 0;
      sumOfRatings[key] += ratingValue;
    });
  });

  const averageRatings: Rating = {} as Rating;
  (Object.keys(sumOfRatings) as Array<keyof Rating>).forEach(key => {
    // Average will be 1-10
    averageRatings[key] = Math.round((sumOfRatings[key] / numItems) * 10) / 10;
  });

  return averageRatings;
}

// Calculates grouped averages, now using 1-10 scale and new weights
export function calculateGroupedCategoryAverages(reviews: Review[]): GroupedCategoryAverages | null {
  if (!reviews || reviews.length === 0) {
    return null;
  }
  const allRatings = reviews.map(r => r.rating);
  const individualSubCategoryAverages = calculateCategoryAverages(allRatings);

  if (!individualSubCategoryAverages) {
    return null;
  }

  const sectionsMeta: Array<{ title: string; keys: RatingCategory[], iconName?: string }> = [
    { title: "Sentimento", keys: ['excitedToReplay', 'mentallyStimulating', 'fun'], iconName: "Smile" },
    { title: "Design del Gioco", keys: ['decisionDepth', 'replayability', 'luck', 'lengthDowntime'], iconName: "Puzzle" },
    { title: "Estetica e Immersione", keys: ['graphicDesign', 'componentsThemeLore'], iconName: "Palette" },
    { title: "Apprendimento e Logistica", keys: ['effortToLearn', 'setupTeardown'], iconName: "ClipboardList" },
  ];

  const groupedAverages: SectionAverage[] = sectionsMeta.map(section => {
    let sectionWeightedSum = 0;
    let sectionTotalMaxPossibleScore = 0;

    const subRatings: SubRatingAverage[] = section.keys.map(key => {
      const subCategoryAverage = individualSubCategoryAverages[key]; // This is 1-10
      const weight = RATING_WEIGHTS[key]; // New weights

      sectionWeightedSum += (subCategoryAverage * weight);
      sectionTotalMaxPossibleScore += (10 * weight); // Max possible for category * weight

      return { name: RATING_CATEGORIES[key], average: subCategoryAverage }; // average is 1-10
    });

    const normalizedSectionScore = sectionTotalMaxPossibleScore > 0
      ? sectionWeightedSum / sectionTotalMaxPossibleScore
      : 0;

    const sectionAverageValue = 1 + (normalizedSectionScore * 9); // Scale to 1-10

    return {
      sectionTitle: section.title,
      iconName: section.iconName as LucideIconName,
      sectionAverage: Math.round(sectionAverageValue * 10) / 10, // Section average is 1-10
      subRatings,
    };
  });

  return groupedAverages;
}

export function formatReviewDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return "Data non valida";
    }

    const yearsDifference = differenceInYears(new Date(), date);

    if (yearsDifference >= 1) {
      return formatDateFns(date, 'dd/MM/yyyy', { locale: it });
    } else {
      return formatDistanceToNow(date, { addSuffix: true, locale: it });
    }
  } catch (error) {
    console.error("Error formatting review date:", error);
    return "Data non valida";
  }
}

export function formatPlayDate(dateString: string): string {
  try {
    const date = new Date(dateString);
     if (isNaN(date.getTime())) {
      return "Data non valida";
    }
    return formatDateFns(date, 'dd/MM/yyyy', { locale: it });
  } catch (error) {
    console.error("Error formatting play date:", error);
    return "Data non valida";
  }
}