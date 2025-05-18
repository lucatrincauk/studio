
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
  excitedToReplay: 'Voglia di Rigiocarci',
  mentallyStimulating: 'Stimolazione Mentale',
  fun: 'Fattore Divertimento',
  decisionDepth: 'Profondità Decisionale',
  replayability: 'Rigiocabilità',
  luck: 'Fattore Fortuna',
  lengthDowntime: 'Durata e Tempi Morti',
  graphicDesign: 'Design Grafico',
  componentsThemeLore: 'Componenti, Tema e Ambientazione',
  effortToLearn: 'Impegno per Imparare',
  setupTeardown: 'Preparazione e Riordino',
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
  description?: string;
  reviews: Review[];
  yearPublished?: number | null; // Allow null
  minPlayers?: number | null; // Allow null
  maxPlayers?: number | null; // Allow null
  playingTime?: number | null; // Allow null
  bggId: number;
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
  sectionAverage: number;
  subRatings: SubRatingAverage[];
}
export type GroupedCategoryAverages = SectionAverage[];

export interface UserProfile {
  id: string; // This will be the userId
  name: string;
  photoURL?: string | null;
}
