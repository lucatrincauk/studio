
import { getAllGamesAction, getFeaturedGamesAction } from '@/lib/actions';
import { GameSearchList } from '@/components/boardgame/game-search-list';
import { GameCard } from '@/components/boardgame/game-card';
import { Separator } from '@/components/ui/separator';

export default async function HomePage() {
  const allGames = await getAllGamesAction();
  const featuredGames = await getFeaturedGamesAction();

  return (
    <div className="space-y-12">
      {featuredGames && featuredGames.length > 0 && (
        <section>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-6 text-center sm:text-left">
            Ultimi Giochi Valutati
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {featuredGames.map((game, index) => (
              <GameCard key={game.id} game={game} variant="featured" priority={index < 3} />
            ))}
          </div>
        </section>
      )}
      
      {featuredGames && featuredGames.length > 0 && <Separator className="my-8" />}

      <section>
        <div className="mb-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-2">
            Esplora i Tuoi Giochi da Tavolo Preferiti
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Scopri, valuta e recensisci un mondo di avventure da tavolo. Usa la ricerca qui sotto per trovare un gioco specifico.
          </p>
        </div>
        
        <GameSearchList initialGames={allGames} /> 
        
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
