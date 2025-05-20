
import { getAllGamesAction } from '@/lib/actions';
import { GameCard } from '@/components/boardgame/game-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Star, TrendingUp } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';
import { formatRatingNumber } from '@/lib/utils';

export default async function Top10Page() {
  const allGames = await getAllGamesAction();

  const topRatedGames = allGames
    .filter(game => game.overallAverageRating !== null && game.overallAverageRating !== undefined)
    .sort((a, b) => (b.overallAverageRating ?? 0) - (a.overallAverageRating ?? 0))
    .slice(0, 10);

  return (
    <div className="space-y-8">
      <Card className="shadow-lg border border-border rounded-lg">
        <CardHeader>
          <CardTitle className="text-2xl sm:text-3xl flex items-center gap-3">
            <TrendingUp className="h-7 w-7 text-primary" />
            Top 10 Giochi Valutati
          </CardTitle>
          <CardDescription>
            Scopri i giochi da tavolo con le valutazioni medie più alte della community.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topRatedGames.length === 0 ? (
            <Alert variant="default" className="bg-secondary/30 border-secondary">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Nessun Gioco Valutato</AlertTitle>
              <AlertDescription>
                Non ci sono ancora abbastanza dati per mostrare una Top 10. Inizia a valutare qualche gioco!
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {topRatedGames.map((game, index) => (
                <div
                  key={game.id}
                  className="relative flex items-center gap-x-3 sm:gap-x-4 p-3 rounded-lg bg-[#f9fbf9] hover:bg-muted/50 transition-colors border border-border overflow-hidden"
                >
                  <span
                    aria-hidden="true"
                    className="absolute -right-[30px] -bottom-[55px] text-[255px] sm:-right-[30px] sm:-bottom-[65px] sm:text-[300px] lg:-right-[36px] lg:-bottom-[75px] lg:text-[340px] font-bold text-muted-foreground/10 pointer-events-none select-none leading-none z-0"
                  >
                    {index + 1}
                  </span>
                  <div className="relative z-10 flex items-center gap-x-3 sm:gap-x-4 flex-grow mr-6 sm:mr-8 lg:mr-10">
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export const revalidate = 3600; // Revalidate every hour
