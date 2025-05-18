
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
  excitedToReplay: 'Excited to Replay',
  mentallyStimulating: 'Mentally Stimulating',
  fun: 'Fun Factor',
  decisionDepth: 'Decision Depth',
  replayability: 'Replayability',
  luck: 'Luck Factor',
  lengthDowntime: 'Game Length & Downtime',
  graphicDesign: 'Graphic Design',            
  componentsThemeLore: 'Components, Theme & Lore', 
  effortToLearn: 'Effort to Learn',           
  setupTeardown: 'Setup & Teardown',         
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

