import { GameCard } from '@/components/boardgame/game-card';
import type { BoardGame } from '@/lib/types';
import { getAllGamesAction } from '@/lib/actions'; // Using server action

export default async function HomePage() {
  const games = await getAllGamesAction();

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-2">
            Explore Your Favorite Board Games
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Discover, rate, and review a world of tabletop adventures.
          </p>
        </div>
        
        {games.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3"> {/* Adjusted to 3 for better spacing */}
            {games.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-xl text-muted-foreground">No games available at the moment.</p>
            <p className="text-muted-foreground">Please check back soon or add a new game!</p>
          </div>
        )}
      </section>
      {/* 
        Future enhancements:
        - Search/filter bar for games
        - "Add New Game" button/modal which could use a simplified version of BGG fetch
        - Pagination if the list of games becomes very long
      */}
    </div>
  );
}

// Revalidate this page periodically or on demand when new games are added
export const revalidate = 3600; // Revalidate every hour
