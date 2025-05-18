
export type RatingCategory =
  | 'excitedToReplay'
  | 'mentallyStimulating'
  | 'fun'
  | 'decisionDepth'
  | 'replayability'
  | 'luck'
  | 'lengthDowntime'
  | 'presentation'
  | 'management';

export const RATING_CATEGORIES: Record<RatingCategory, string> = {
  excitedToReplay: 'Excited to Replay',
  mentallyStimulating: 'Mentally Stimulating',
  fun: 'Fun Factor',
  decisionDepth: 'Decision Depth',
  replayability: 'Replayability',
  luck: 'Luck Factor',
  lengthDowntime: 'Game Length & Downtime',
  presentation: 'Presentation & Components',
  management: 'Setup & Game Management',
};

export interface Rating {
  excitedToReplay: number; // 1-5
  mentallyStimulating: number; // 1-5
  fun: number; // 1-5
  decisionDepth: number; // 1-5
  replayability: number; // 1-5
  luck: number; // 1-5
  lengthDowntime: number; // 1-5
  presentation: number; // 1-5
  management: number; // 1-5
}

export interface Review {
  id: string;
  author: string;
  userId: string;
  rating: Rating;
  comment: string;
  date: string; // ISO date string
}

export interface BoardGame {
  id: string;
  name: string;
  coverArtUrl: string;
  description?: string;
  reviews: Review[];
  yearPublished?: number;
  minPlayers?: number;
  maxPlayers?: number;
  playingTime?: number;
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
