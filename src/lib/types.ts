
export type RatingCategory = 'feeling' | 'gameDesign' | 'presentation' | 'management';

export const RATING_CATEGORIES: Record<RatingCategory, string> = {
  feeling: 'Overall Feeling',
  gameDesign: 'Game Design',
  presentation: 'Presentation & Components',
  management: 'Setup & Game Management',
};

export interface Rating {
  feeling: number; // 1-5 stars
  gameDesign: number; // 1-5 stars
  presentation: number; // 1-5 stars
  management: number; // 1-5 stars
}

export interface Review {
  id: string;
  author: string; // For simplicity, can be a fixed string or user input later
  rating: Rating;
  comment: string;
  date: string; // ISO date string
}

export interface BoardGame {
  id: string;
  name: string;
  coverArtUrl: string;
  description: string;
  reviews: Review[];
  yearPublished?: number;
  minPlayers?: number;
  maxPlayers?: number;
  playingTime?: number; // in minutes
  bggId?: number; // BoardGameGeek ID
}

export interface AiSummary {
  summary: string;
}
