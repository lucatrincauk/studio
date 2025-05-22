
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

export const RATING_CATEGORIES: Record<RatingCategory, string> = {
  excitedToReplay: "Entusiasmo nel Rigiocare",
  mentallyStimulating: "Stimolazione Mentale",
  fun: "Fattore Divertimento",
  decisionDepth: "Profondità Decisionale",
  replayability: "Varietà e Rigiocabilità",
  luck: "Assenza di Fortuna",
  lengthDowntime: "Durata",
  graphicDesign: "Grafica e Componenti",
  componentsThemeLore: "Tema e Ambientazione",
  effortToLearn: "Facilità di Apprendimento",
  setupTeardown: "Preparazione e Ripristino",
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
  voteCount?: number;
  isPinned?: boolean;
  mechanics?: string[];
  categories?: string[];
  designers?: string[];
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
  sectionAverage: number;
  subRatings: SubRatingAverage[];
}
export type GroupedCategoryAverages = SectionAverage[];

export interface SubRatingAverage {
  name: string;
  average: number;
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
  hasGivenFirstFive?: boolean;
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
  date: string;
  quantity: number;
  comments: string | null;
  location?: string | null;
  players?: BggPlayerInPlay[];
  userId?: string;
  gameBggId: number;
}

export interface AugmentedBggPlayDetail extends BggPlayDetail {
  gameId: string;
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
