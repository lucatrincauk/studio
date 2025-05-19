
export type RatingCategory =
  | 'excitedToReplay'
  | 'mentallyStimulating'
  | 'fun'
  | 'decisionDepth'
  | 'replayability'
  | 'luck'
  | 'lengthDowntime'
  | 'graphicDesign'
  | 'componentsThemeLore'
  | 'effortToLearn'
  | 'setupTeardown';

export const RATING_CATEGORIES: Record<RatingCategory, string> = {
  excitedToReplay: 'Entusiasmo nel Rigiocare',
  mentallyStimulating: 'Stimolazione Mentale',
  fun: 'Fattore Divertimento',
  decisionDepth: 'Profondità Decisionale',
  replayability: 'Varietà e Rigiocabilità',
  luck: 'Assenza di Fortuna',
  lengthDowntime: 'Durata',
  graphicDesign: 'Grafica e Componenti',
  componentsThemeLore: 'Tema e Ambientazione',
  effortToLearn: 'Facilità di Apprendimento',
  setupTeardown: 'Preparazione e Ripristino', // Changed here
};

export interface Rating {
  excitedToReplay: number;
  mentallyStimulating: number;
  fun: number;
  decisionDepth: number;
  replayability: number;
  luck: number;
  lengthDowntime: number;
  graphicDesign: number;
  componentsThemeLore: number;
  effortToLearn: number;
  setupTeardown: number;
}

export interface Review {
  id: string;
  author: string;
  userId: string;
  authorPhotoURL?: string | null;
  rating: Rating;
  comment: string;
  date: string; // ISO date string
}

export interface AugmentedReview extends Review {
  gameId: string;
  gameName: string;
  gameCoverArtUrl?: string;
}

export interface BoardGame {
  id: string;
  name: string;
  coverArtUrl: string;
  reviews: Review[]; // Typically empty for list views, populated for detail views
  yearPublished?: number | null;
  minPlayers?: number | null;
  maxPlayers?: number | null;
  playingTime?: number | null; // Typical or stated playing time
  minPlaytime?: number | null; // Minimum playing time from BGG
  maxPlaytime?: number | null; // Maximum playing time from BGG
  averageWeight?: number | null; // Complexity/weight rating from BGG
  bggId: number;
  overallAverageRating?: number | null;
  isPinned?: boolean;
}

export interface AiSummary {
  summary: string;
}

export interface BggSearchResult {
  bggId: string;
  name: string;
  yearPublished?: number;
  rank: number;
}

// Types for grouped ratings display
export interface SubRatingAverage {
  name: string;
  average: number;
}
export interface SectionAverage {
  sectionTitle: string;
  iconName?: string;
  sectionAverage: number;
  subRatings: SubRatingAverage[];
}
export type GroupedCategoryAverages = SectionAverage[];

export interface UserProfile {
  id: string; // This will be the userId
  name: string;
  photoURL?: string | null;
}
