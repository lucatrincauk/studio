
import { getFeaturedGamesAction } from '@/lib/actions'; 
import { GameCard } from '@/components/boardgame/game-card';
import { Separator } from '@/components/ui/separator';
import type { BoardGame } from '@/lib/types';

export default async function HomePage() {
  const featuredGames = await getFeaturedGamesAction();

  return (
    <div className="space-y-12">
      <section>
        <div className="mb-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-2">
            Esplora i Tuoi Giochi da Tavolo Preferiti
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Scopri, valuta e recensisci un mondo di avventure da tavolo.
          </p>
        </div>

        {featuredGames && featuredGames.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-6 text-left">
              In Evidenza
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
        
        {/* GameSearchList removed from here */}
        
      </section>
      <section className="text-center">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-4">
          Pronto a Tuffarti?
        </h2>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
          Inizia esplorando il nostro <a href="/all-games" className="text-primary hover:underline">catalogo completo</a> o dai un'occhiata ai giochi <a href="/top-10" className="text-primary hover:underline">Top 10</a>!
        </p>
      </section>
    </div>
  );
}

export const revalidate = 3600;

