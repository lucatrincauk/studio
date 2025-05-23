
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Review, Rating, RatingCategory, GroupedCategoryAverages, SectionAverage, SubRatingAverage, LucideIconName } from "./types";
import { RATING_CATEGORIES, RATING_WEIGHTS } from "./types";
import { formatDistanceToNow, format as formatDateFns, differenceInYears } from 'date-fns';
import { it } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRatingNumber(num: number): string {
  return num.toFixed(1);
}

// Calculates the overall average on a 1-10 scale using the new weights
export function calculateOverallCategoryAverage(rating: Rating | null): number {
  if (!rating) return 0;

  let weightedSum = 0;
  let sumOfAllWeights = 0;

  (Object.keys(rating) as Array<keyof Rating>).forEach(key => {
    const weight = RATING_WEIGHTS[key];
    const score = rating[key] || 0; // Score is 1-10
    weightedSum += (score * weight);
    sumOfAllWeights += weight;
  });

  if (sumOfAllWeights === 0) return 0; // Avoid division by zero

  // The average is now a direct weighted average
  const average = weightedSum / sumOfAllWeights;
  return Math.round(average * 10) / 10; // Round to one decimal place, result is 1-10
}


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
      const ratingValue = typeof rating[key] === 'number' ? rating[key] : 0; // Default to 0 if not a number
      sumOfRatings[key] += ratingValue;
    });
  });

  const averageRatings: Rating = {} as Rating;
  (Object.keys(sumOfRatings) as Array<keyof Rating>).forEach(key => {
    const avg = sumOfRatings[key] / numItems;
    averageRatings[key] = Math.max(1, Math.min(10, Math.round(avg * 10) / 10));
  });

  return averageRatings;
}

export function calculateGroupedCategoryAverages(reviews: Review[]): GroupedCategoryAverages | null {
  if (!reviews || reviews.length === 0) {
    return null;
  }
  const allRatings = reviews.map(r => r.rating);
  const individualSubCategoryAverages = calculateCategoryAverages(allRatings);

  if (!individualSubCategoryAverages) {
    return null;
  }

  const sectionsMeta: Array<{ title: string; keys: RatingCategory[], iconName?: LucideIconName }> = [
    { title: "Sentimento", keys: ['excitedToReplay', 'mentallyStimulating', 'fun'], iconName: "Smile" },
    { title: "Design del Gioco", keys: ['decisionDepth', 'replayability', 'luck', 'lengthDowntime'], iconName: "Puzzle" },
    { title: "Estetica e Immersione", keys: ['graphicDesign', 'componentsThemeLore'], iconName: "Palette" },
    { title: "Apprendimento e Logistica", keys: ['effortToLearn', 'setupTeardown'], iconName: "ClipboardList" },
  ];

  const groupedAverages: SectionAverage[] = sectionsMeta.map(section => {
    let sectionWeightedSum = 0;
    let sumOfSectionWeights = 0;

    const subRatings: SubRatingAverage[] = section.keys.map(key => {
      const subCategoryAverage = individualSubCategoryAverages[key];
      const weight = RATING_WEIGHTS[key];

      sectionWeightedSum += (subCategoryAverage * weight);
      sumOfSectionWeights += weight;

      return { name: RATING_CATEGORIES[key], average: subCategoryAverage };
    });

    const sectionAverageValue = sumOfSectionWeights > 0
      ? sectionWeightedSum / sumOfSectionWeights
      : 0;

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

