
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
  setupTeardown: 'Preparazione e Ripristino',
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
  reviews: Review[]; // Populated for detail views or when calculating averages server-side
  yearPublished?: number | null;
  minPlayers?: number | null;
  maxPlayers?: number | null;
  playingTime?: number | null;
  minPlaytime?: number | null;
  maxPlaytime?: number | null;
  averageWeight?: number | null;
  bggId: number;
  overallAverageRating?: number | null;
  reviewCount?: number;
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

export interface SectionAverage {
  sectionTitle: string;
  iconName?: string;
  sectionAverage: number;
  subRatings: SubRatingAverage[];
}
export interface SubRatingAverage {
  name: string;
  average: number;
}
export type GroupedCategoryAverages = SectionAverage[];

export interface UserProfile {
  id: string;
  name: string;
  photoURL?: string | null;
}
