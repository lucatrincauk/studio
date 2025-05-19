
import { getAllGamesAction, getFeaturedGamesAction } from '@/lib/actions';
import { GameSearchList } from '@/components/boardgame/game-search-list';
import { GameCard } from '@/components/boardgame/game-card';
import { Separator } from '@/components/ui/separator';

export default async function HomePage() {
  const allGames = await getAllGamesAction();
  const featuredGames = await getFeaturedGamesAction();

  return (
    <div className="space-y-12">
      <section>
        <div className="mb-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-2">
            Esplora i Tuoi Giochi da Tavolo Preferiti
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Scopri, valuta e recensisci un mondo di avventure da tavolo. Usa la ricerca qui sotto per trovare un gioco specifico.
          </p>
        </div>

        {featuredGames && featuredGames.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-6 text-center sm:text-left">
              Ultimi Giochi Valutati
            </h2>
            <div className="flex space-x-4 overflow-x-auto pb-4 md:grid md:grid-cols-3 md:gap-4 md:space-x-0 md:pb-0 md:overflow-x-visible">
              {featuredGames.map((game, index) => (
                <div key={game.id} className="w-40 flex-shrink-0 md:w-auto">
                  <GameCard game={game} variant="featured" priority={index < 3} />
                </div>
              ))}
            </div>
            <Separator className="my-8" />
          </div>
        )}
        
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

