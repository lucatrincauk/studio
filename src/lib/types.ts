import type { LucideIcon } from 'lucide-react';

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

// Labels for UI display
export const RATING_CATEGORIES: Record<RatingCategory, string> = {
  excitedToReplay: "Entusiasmo nel Rigiocare",
  mentallyStimulating: "Stimolazione Mentale",
  fun: "Fattore Divertimento",
  decisionDepth: "Profondità Decisionale",
  replayability: "Varietà e Rigiocabilità", // Changed
  luck: "Assenza di Fortuna", // Changed
  lengthDowntime: "Durata", // Changed
  graphicDesign: "Grafica e Componenti", // Changed
  componentsThemeLore: "Tema e Ambientazione", // Changed
  effortToLearn: "Facilità di Apprendimento",
  setupTeardown: "Preparazione e Ripristino", // Changed
};

// New weights for 1-10 scale
export const RATING_WEIGHTS: Record<RatingCategory, number> = {
  excitedToReplay: 2,    // Was 4 on 1-5 scale
  mentallyStimulating: 1,// Was 2 on 1-5 scale
  fun: 1,                // Was 2 on 1-5 scale
  decisionDepth: 1,      // Was 2 on 1-5 scale
  replayability: 1,      // Was 2 on 1-5 scale
  luck: 1,               // Was 2 on 1-5 scale
  lengthDowntime: 1,     // Was 2 on 1-5 scale
  graphicDesign: 0.5,    // Was 1 on 1-5 scale
  componentsThemeLore: 0.5,// Was 1 on 1-5 scale
  effortToLearn: 0.5,    // Was 1 on 1-5 scale
  setupTeardown: 0.5,    // Was 1 on 1-5 scale
};


// Values will now be 1-10
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
  reviews: Review[]; // Typically not populated for list views, only for detail page
  yearPublished?: number | null;
  minPlayers?: number | null;
  maxPlayers?: number | null;
  playingTime?: number | null; // BGG's general playing time
  minPlaytime?: number | null; // BGG's min playtime
  maxPlaytime?: number | null; // BGG's max playtime
  averageWeight?: number | null; // BGG's complexity rating
  overallAverageRating?: number | null; // Now calculated as 1-10
  voteCount?: number;
  isPinned?: boolean;
  mechanics?: string[];
  categories?: string[];
  designers?: string[];
  // publishers removed
  featuredReason?: 'pinned' | 'recent';
  favoritedByUserIds?: string[];
  favoriteCount?: number;
  playlistedByUserIds?: string[];
  morchiaByUserIds?: string[];
  morchiaCount?: number;
  lctr01Plays?: number | null;
  lctr01PlayDetails?: BggPlayDetail[];
}

export interface SectionAverage {
  sectionTitle: string;
  iconName?: LucideIconName;
  sectionAverage: number; // Will now be 1-10
  subRatings: SubRatingAverage[];
}
export type GroupedCategoryAverages = SectionAverage[];

export interface SubRatingAverage {
  name: string;
  average: number; // Will now be 1-10
}

export interface BggSearchResult {
  bggId: string;
  name: string;
  yearPublished?: number;
  rank: number;
}

export interface UserProfile {
  id: string;
  name: string;
  photoURL?: string | null;
  email?: string | null;
  bggUsername?: string | null;
  hasSubmittedReview?: boolean;
  hasGivenFirstOne?: boolean;
  hasGivenFirstFive?: boolean; // This flag will now represent if user has given a "10"
  hasEarnedComprehensiveCritic?: boolean;
  hasEarnedNightOwlReviewer?: boolean;
  hasReceivedWelcomeBadge?: boolean;
  hasEarnedFavoriteFanaticBadge?: boolean;
  hasEarnedPlaylistProBadge?: boolean;
}

export interface BggPlayerInPlay {
  username?: string | null;
  name?: string | null;
  userIdBgg?: string | null;
  score?: string | null;
  isNew?: boolean;
  didWin?: boolean;
  color?: string | null;
  startPosition?: string | null;
}

export interface BggPlayDetail {
  playId: string;
  date: string; // ISO date string
  quantity: number;
  comments: string | null;
  location?: string | null;
  players?: BggPlayerInPlay[];
  userId?: string; // User who logged this play (e.g., 'lctr01')
  gameBggId: number; // BGG ID of the game played
}

export interface AugmentedBggPlayDetail extends BggPlayDetail {
  gameId: string; // Firestore ID of the game
  gameName: string;
  gameCoverArtUrl?: string | null;
}

// For AI Flow: recommend-games.ts
export type CatalogGame = { id: string, name: string };
export type RecommendGamesInput = {
  referenceGameName: string;
  catalogGames: CatalogGame[];
};
export type RecommendedGame = {
  id: string;
  name: string;
  reason: string;
};
export type RecommendGamesOutput = {
  recommendations: RecommendedGame[];
};

// Valid Lucide icon names used for badges
export type LucideIconName =
  | 'Award'
  | 'Edit3'
  | 'FileText'
  | 'BookOpenText'
  | 'Trash2'
  | 'Medal'
  | 'MinusCircle'
  | 'PlusCircle'
  | 'Sparkles'
  | 'ClipboardCheck'
  | 'Moon'
  | 'Compass'
  | 'HeartPulse'
  | 'ListMusic';

export interface EarnedBadge {
  badgeId: string;
  name: string;
  description: string;
  iconName?: LucideIconName;
  earnedAt: any; // Firestore Timestamp or string
}

export interface BadgeDefinition {
  badgeId: string;
  name: string;
  description: string; // How to earn it
  iconName: LucideIconName;
}