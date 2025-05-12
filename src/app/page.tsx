import { getAllGamesAction } from '@/lib/actions';
import { GameSearchList } from '@/components/boardgame/game-search-list';

export default async function HomePage() {
  const games = await getAllGamesAction();

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-2">
            Explore Your Favorite Board Games
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Discover, rate, and review a world of tabletop adventures. Use the search below to find a specific game.
          </p>
        </div>
        
        <GameSearchList initialGames={games} /> 
        
      </section>
      {/* 
        Future enhancements:
        - "Add New Game" button/modal which could use a simplified version of BGG fetch
        - Pagination if the list of games becomes very long
      */}
    </div>
  );
}

// Revalidate this page periodically or on demand when new games are added
export const revalidate = 3600; // Revalidate every hour
