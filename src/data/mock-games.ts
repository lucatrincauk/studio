
import type { BoardGame, Review, Rating } from '@/lib/types';

const today = new Date().toISOString();

export const mockReviews: Record<string, Review[]> = {
  'wingspan': [
    { id: 'review1-wingspan', author: 'Alice', rating: { feeling: 5, gameDesign: 4, presentation: 5, management: 4 }, comment: 'Beautiful game with engaging mechanics. A bit complex to teach new players.', date: today },
    { id: 'review2-wingspan', author: 'Bob', rating: { feeling: 4, gameDesign: 5, presentation: 5, management: 3 }, comment: 'Love the engine building. Components are top-notch!', date: today },
  ],
  'catan': [
    { id: 'review1-catan', author: 'Charlie', rating: { feeling: 4, gameDesign: 4, presentation: 3, management: 5 }, comment: 'Classic game, always fun. Luck can be a factor.', date: today },
  ],
  'gloomhaven': [
    { id: 'review1-gloomhaven', author: 'Diana', rating: { feeling: 5, gameDesign: 5, presentation: 4, management: 2 }, comment: 'Epic campaign, tons of content. Setup is a beast.', date: today },
    { id: 'review2-gloomhaven', author: 'Eve', rating: { feeling: 4, gameDesign: 4, presentation: 3, management: 1 }, comment: 'Amazing but very time-consuming. Organizing components is a challenge.', date: today },
  ],
};

export let mockGames: BoardGame[] = [
  {
    id: 'wingspan',
    name: 'Wingspan',
    coverArtUrl: 'https://picsum.photos/seed/wingspan/400/600', 
    description: 'Wingspan is a competitive, medium-weight, card-driven, engine-building board game from Stonemaier Games. You are bird enthusiasts—researchers, bird watchers, ornithologists, and collectors—seeking to discover and attract the best birds to your network of wildlife preserves.',
    reviews: mockReviews['wingspan'] || [],
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
    reviews: mockReviews['catan'] || [],
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
    reviews: mockReviews['gloomhaven'] || [],
    yearPublished: 2017,
    minPlayers: 1,
    maxPlayers: 4,
    playingTime: 120,
    bggId: 174430,
  },
];

// Function to add a review (simulates DB update)
export const addReviewToMockGame = (gameId: string, reviewData: { rating: Rating; comment: string; author: string }): Review | null => {
  const gameIndex = mockGames.findIndex(g => g.id === gameId);

  if (gameIndex === -1) {
    // This is unexpected if importAndRateBggGameAction worked and state is persistent.
    console.error(`ERROR in addReviewToMockGame: Game with id "${gameId}" not found in mockGames. Cannot add review.`);
    return null; 
  }

  const targetGame = mockGames[gameIndex];
  const newReview: Review = {
    ...reviewData,
    id: `review${Date.now()}-${gameId}`, // Use gameId for clarity in review ID
    date: new Date().toISOString(),
  };

  // Ensure reviews array exists on the game object in mockGames
  // This also updates the specific game object within the mockGames array by reference.
  if (!targetGame.reviews) {
    targetGame.reviews = [];
  }
  targetGame.reviews.push(newReview);

  // Ensure reviews array exists in mockReviews (which is aliased as allMockReviews in actions.ts)
  // This is treated as the more canonical source for reviews by getGameDetails.
  if (!mockReviews[gameId]) {
    mockReviews[gameId] = [];
  }
  mockReviews[gameId].push(newReview);

  return newReview;
};

