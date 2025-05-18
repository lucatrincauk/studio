
export type RatingCategory = 
  | 'excitedToReplay' 
  | 'mentallyStimulating' 
  | 'fun' 
  | 'gameDesign' 
  | 'presentation' 
  | 'management';

export const RATING_CATEGORIES: Record<RatingCategory, string> = {
  excitedToReplay: 'Excited to Replay',
  mentallyStimulating: 'Mentally Stimulating',
  fun: 'Fun Factor',
  gameDesign: 'Game Design',
  presentation: 'Presentation & Components',
  management: 'Setup & Game Management',
};

export interface Rating {
  excitedToReplay: number; // 1-5 stars
  mentallyStimulating: number; // 1-5 stars
  fun: number; // 1-5 stars
  gameDesign: number; // 1-5 stars
  presentation: number; // 1-5 stars
  management: number; // 1-5 stars
}

export interface Review {
  id: string;
  author: string; // Display name chosen by the user
  userId: string; // Firebase Auth UID of the user who wrote the review
  rating: Rating;
  comment: string;
  date: string; // ISO date string
}

export interface BoardGame {
  id: string; // For BGG games, this will be `bgg-${bggId}`
  name: string;
  coverArtUrl: string;
  description?: string; // Description might not be available from BGG collection API
  reviews: Review[];
  yearPublished?: number;
  minPlayers?: number;
  maxPlayers?: number;
  playingTime?: number; // in minutes
  bggId: number; // BoardGameGeek ID, ensure this is always present for BGG games
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
