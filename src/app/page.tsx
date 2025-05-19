
import { getFeaturedGamesAction, getAllGamesAction } from '@/lib/actions'; 
import { GameCard } from '@/components/boardgame/game-card';
import { Separator } from '@/components/ui/separator';
import type { BoardGame } from '@/lib/types';
import { Star, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { formatRatingNumber } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info } from 'lucide-react';


export default async function HomePage() {
  const featuredGamesPromise = getFeaturedGamesAction();
  const allGamesPromise = getAllGamesAction(); 

  const [featuredGames, allGames] = await Promise.all([featuredGamesPromise, allGamesPromise]);

  const topRatedGames = allGames 
    .filter(game => game.overallAverageRating !== null && game.overallAverageRating !== undefined)
    .sort((a, b) => (b.overallAverageRating ?? 0) - (a.overallAverageRating ?? 0))
    .slice(0, 10);

  return (
    <div className="space-y-12">
      <section>
        <div className="mb-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-3">
            Benvenuto su Morchiometro!
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-6">
            Scopri, valuta e recensisci un mondo di avventure da tavolo.
          </p>
          <Button asChild size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground text-lg px-8 py-6 rounded-lg shadow-md hover:shadow-lg transition-all duration-300">
            <Link href="/rate-a-game/select-game">
              <Edit className="mr-2 h-5 w-5" />
              Valuta un Gioco
            </Link>
          </Button>
        </div>

        {featuredGames && featuredGames.length > 0 && (
          <div className="mb-12">
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
            <Separator className="my-10" />
          </div>
        )}
        
        {topRatedGames.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-6 text-left">
              Top 10 Giochi Valutati
            </h2>
            <div className="space-y-4">
              {topRatedGames.map((game, index) => (
                <div key={game.id} className="flex items-center gap-x-3 sm:gap-x-4 p-3 rounded-lg hover:bg-muted/50 transition-colors border border-border">
                  <div className="flex-shrink-0">
                    <span className="text-xl sm:text-2xl font-bold text-primary w-8 sm:w-10 flex items-center justify-center">
                      {index + 1}.
                    </span>
                  </div>
                  <div className="w-24 h-32 sm:w-28 sm:h-36 md:w-32 md:h-40 flex-shrink-0"> 
                    <GameCard game={game} variant="featured" priority={index < 5} />
                  </div>
                  <div className="flex-grow min-w-0 ml-2 sm:ml-3">
                    <Link href={`/games/${game.id}`} className="group">
                      <h3 className="text-md sm:text-lg font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 hover:underline">
                        {game.name}
                      </h3>
                      {game.yearPublished && (
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          ({game.yearPublished})
                        </p>
                      )}
                      {/* Score is on the GameCard overlay, but if needed for text readers or alternative display: */}
                      {/* game.overallAverageRating !== null && (
                        <p className="text-sm text-primary font-semibold mt-1">
                          Voto: {formatRatingNumber(game.overallAverageRating * 2)}
                        </p>
                      )*/}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
             <Separator className="my-10" />
          </section>
        )}

        {topRatedGames.length === 0 && featuredGames.length === 0 && (
           <Alert variant="default" className="mt-8 bg-secondary/30 border-secondary">
              <Info className="h-4 w-4" />
              <AlertTitle>Catalogo in Costruzione!</AlertTitle>
              <AlertDescription>
                Non ci sono ancora giochi in evidenza o nella top 10. Inizia ad aggiungere giochi e valutazioni!
              </AlertDescription>
            </Alert>
        )}

      </section>
    </div>
  );
}

export const revalidate = 3600;
