
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
  gameCoverArtUrl?: string | null;
}

export interface AugmentedReviewWithGame extends Review {
  gameId: string;
  gameName: string;
  gameCoverArtUrl?: string | null;
}


export interface BoardGame {
  id: string;
  name: string;
  coverArtUrl: string;
  bggId: number;
  reviews: Review[];
  yearPublished?: number | null;
  minPlayers?: number | null;
  maxPlayers?: number | null;
  playingTime?: number | null;
  minPlaytime?: number | null;
  maxPlaytime?: number | null;
  averageWeight?: number | null;
  overallAverageRating?: number | null;
  reviewCount?: number;
  isPinned?: boolean;
  mechanics?: string[];
  categories?: string[];
  designers?: string[];
  favoritedByUserIds?: string[];
  favoriteCount?: number;
  playlistedByUserIds?: string[];
  featuredReason?: 'pinned' | 'recent';
  lctr01Plays?: number | null;
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
  id: string;
  name: string;
  photoURL?: string | null;
  email?: string | null;
  bggUsername?: string | null;
}

export interface BggPlayDetail {
  playId: string; // BGG's ID for the play
  date: string; // Date of the play
  quantity: number; // Number of times played on that date
  comments: string | null; // User's comments for that play
  // Fields for Firestore storage
  userId?: string; // Firebase UID of the user who logged the play (e.g., 'lctr01' equivalent)
  gameBggId?: number; // BGG ID of the game played
}

