
export type RatingCategory =
  | 'excitedToReplay'
  | 'mentallyStimulating'
  | 'fun'
  | 'decisionDepth'
  | 'replayability'
  | 'luck'
  | 'lengthDowntime'
  | 'graphicDesign'         // New
  | 'componentsThemeLore'   // New
  | 'effortToLearn'         // New
  | 'setupTeardown';        // New

export const RATING_CATEGORIES: Record<RatingCategory, string> = {
  excitedToReplay: 'Excited to Replay',
  mentallyStimulating: 'Mentally Stimulating',
  fun: 'Fun Factor',
  decisionDepth: 'Decision Depth',
  replayability: 'Replayability',
  luck: 'Luck Factor',
  lengthDowntime: 'Game Length & Downtime',
  graphicDesign: 'Graphic Design',             // New
  componentsThemeLore: 'Components, Theme & Lore', // New
  effortToLearn: 'Effort to Learn',           // New
  setupTeardown: 'Setup & Teardown',         // New
};

export interface Rating {
  excitedToReplay: number; // 1-5
  mentallyStimulating: number; // 1-5
  fun: number; // 1-5
  decisionDepth: number; // 1-5
  replayability: number; // 1-5
  luck: number; // 1-5
  lengthDowntime: number; // 1-5
  graphicDesign: number; // 1-5  // New
  componentsThemeLore: number; // 1-5 // New
  effortToLearn: number; // 1-5 // New
  setupTeardown: number; // 1-5 // New
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

