
import type { BoardGame, Review, Rating } from '@/lib/types';

// const today = new Date().toISOString(); // No longer needed for mockReviews

// mockReviews object is removed as reviews are now stored in Firestore.
// export const mockReviews: Record<string, Review[]> = { ... };

export let mockGames: BoardGame[] = [
  {
    id: 'wingspan',
    name: 'Wingspan',
    coverArtUrl: 'https://picsum.photos/seed/wingspan/400/600', 
    description: 'Wingspan is a competitive, medium-weight, card-driven, engine-building board game from Stonemaier Games. You are bird enthusiasts—researchers, bird watchers, ornithologists, and collectors—seeking to discover and attract the best birds to your network of wildlife preserves.',
    reviews: [], // Initialize with empty reviews
    yearPublished: 2019,
    minPlayers: 1,
    maxPlayers: 5,
    playingTime: 70,
    bggId: 266192,
  },
  {
    id: 'catan',
    name: 'Catan',
    coverArtUrl: 'https://picsum.photos/seed/catan/400/600',
    description: 'In Catan, players try to be the dominant force on the island of Catan by building settlements, cities, and roads. On each turn dice are rolled to determine what resources the island produces. Players collect these resources (cards)—wood, grain, brick, sheep, or stone—to build up their civilizations to get to 10 victory points and win the game.',
    reviews: [], // Initialize with empty reviews
    yearPublished: 1995,
    minPlayers: 3,
    maxPlayers: 4,
    playingTime: 90,
    bggId: 13,
  },
  {
    id: 'gloomhaven',
    name: 'Gloomhaven',
    coverArtUrl: 'https://picsum.photos/seed/gloomhaven/400/600',
    description: 'Gloomhaven is a game of Euro-inspired tactical combat in a persistent world of shifting motives. Players will take on the role of a wandering adventurer with their own special set of skills and their own reasons for traveling to this dark corner of the world.',
    reviews: [], // Initialize with empty reviews
    yearPublished: 2017,
    minPlayers: 1,
    maxPlayers: 4,
    playingTime: 120,
    bggId: 174430,
  },
];

// Function addReviewToMockGame is removed as reviews are now managed in Firestore.
// export const addReviewToMockGame = ( ... ) => { ... };


