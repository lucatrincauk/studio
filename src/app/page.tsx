
import { getFeaturedGamesAction, getAllGamesAction } from '@/lib/actions'; 
import { GameCard } from '@/components/boardgame/game-card';
import { Separator } from '@/components/ui/separator';
import type { BoardGame } from '@/lib/types';
import { Star, Edit, TrendingUp, Library, AlertCircle, Info } from 'lucide-react'; 
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { formatRatingNumber } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';


export default async function HomePage() {
  const featuredGamesPromise = getFeaturedGamesAction();
  const allGamesPromise = getAllGamesAction(); 

  const [featuredGamesResult, allGamesResult] = await Promise.all([featuredGamesPromise, allGamesPromise]);

  const featuredGames = Array.isArray(featuredGamesResult) ? featuredGamesResult : [];
  const allGames = Array.isArray(allGamesResult) ? allGamesResult : [];

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
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-6 text-left flex items-center gap-2">
              <Star className="h-7 w-7 text-primary" /> 
              In Evidenza
            </h2>
            <div className="flex space-x-4 overflow-x-auto pb-4 md:grid md:grid-cols-3 md:gap-4 md:space-x-0 md:pb-0 md:overflow-x-visible">
              {featuredGames.map((game, index) => (
                <div key={game.id} className="w-40 flex-shrink-0 md:w-auto">
                  <GameCard game={game} variant="featured" priority={index < 3} showOverlayText={true} />
                </div>
              ))}
            </div>
            <Separator className="my-10" />
          </div>
        )}
        
        {topRatedGames.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-6 text-left flex items-center gap-2">
              <TrendingUp className="h-7 w-7 text-primary" />
              Top 10
            </h2>
            <div className="space-y-4">
              {topRatedGames.map((game, index) => (
                <div 
                  key={game.id} 
                  className="relative flex items-center gap-x-3 sm:gap-x-4 p-3 rounded-lg bg-[#f9fbf9] hover:bg-muted/50 transition-colors border border-border overflow-hidden"
                >
                  <span 
                    aria-hidden="true"
                    className="absolute -right-[14px] -bottom-[28px] text-[140px] sm:-right-[23px] sm:-bottom-[45px] sm:text-[220px] lg:-right-[36px] lg:-bottom-[70px] lg:text-[340px] font-bold text-muted-foreground/10 pointer-events-none select-none leading-none z-0"
                  >
                    {index + 1}
                  </span>
                  <div className="relative z-10 flex items-center gap-x-3 sm:gap-x-4 flex-grow mr-5 sm:mr-8 lg:mr-10">
                    <div className="w-24 sm:w-28 md:w-32 flex-shrink-0"> 
                      <GameCard game={game} variant="featured" priority={index < 5} showOverlayText={false} />
                    </div>
                    <div className="flex-grow min-w-0 flex justify-between items-center">
                      <Link href={`/games/${game.id}`} className="group flex-1">
                        <h3 className="text-md sm:text-lg font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-3 hover:underline">
                          {game.name}
                        </h3>
                        {game.yearPublished && (
                          <p className="text-xs sm:text-sm text-muted-foreground">
                            ({game.yearPublished})
                          </p>
                        )}
                      </Link>
                      {game.overallAverageRating !== null && typeof game.overallAverageRating === 'number' && (
                        <p className="text-xl sm:text-2xl font-bold text-primary ml-4 flex-shrink-0">
                          {formatRatingNumber(game.overallAverageRating * 2)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
             <Separator className="my-10" />
          </section>
        )}

        {(featuredGames.length === 0 && topRatedGames.length === 0) && (
           <Alert variant="default" className="mt-8 bg-secondary/30 border-secondary">
              <Info className="h-4 w-4" />
              <AlertTitle>Catalogo in Costruzione!</AlertTitle>
              <AlertDescription>
                Non ci sono ancora giochi in evidenza o nella top 10. Torna più tardi o inizia ad aggiungere giochi e valutazioni tramite la sezione Admin!
              </AlertDescription>
            </Alert>
        )}

      </section>
    </div>
  );
}

export const revalidate = 3600;

