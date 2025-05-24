
import { getAllGamesAction } from '@/lib/actions';
import { GameCard } from '@/components/boardgame/game-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Star, TrendingUp, MessageSquareText } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';
import { formatRatingNumber } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export default async function Top10Page() {
  const allGames = await getAllGamesAction();

  const topRatedGames = [...allGames] 
    .filter(game => game.overallAverageRating !== null && game.overallAverageRating !== undefined)
    .sort((a, b) => (b.overallAverageRating ?? 0) - (a.overallAverageRating ?? 0))
    .slice(0, 10);

  const mostReviewedGames = [...allGames] 
    .filter(game => typeof game.voteCount === 'number' && game.voteCount > 0)
    .sort((a, b) => (b.voteCount ?? 0) - (a.voteCount ?? 0))
    .slice(0, 10);

  return (
    <div className="space-y-12">
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
                  key={`top-rated-${game.id}`}
                  className={cn(
                      "relative bg-card p-3 rounded-lg border border-border flex items-center gap-x-3 sm:gap-x-4 overflow-hidden",
                      "hover:bg-muted/50 transition-colors"
                  )}
                >
                   <span
                    aria-hidden="true"
                    className={cn(
                        "absolute z-0 font-bold text-muted-foreground/10 pointer-events-none select-none leading-none",
                         "top-1/2 -translate-y-1/2", // Vertical centering
                        "-right-[30px] text-[255px]", // Default (mobile)
                        "sm:-right-[30px] sm:text-[300px]", // Small screens
                        "lg:-right-[36px] lg:text-[340px]" // Large screens
                    )}
                  >
                    {index + 1}
                  </span>
                  <div className={cn(
                      "relative z-10 flex items-center gap-x-3 sm:gap-x-4 flex-grow",
                       "mr-5 sm:mr-8 lg:mr-10" // Adjusted for larger numbers
                    )}>
                    <div className="w-24 sm:w-28 md:w-32 flex-shrink-0">
                      <GameCard game={game} variant="featured" priority={index < 5} showOverlayText={false} />
                    </div>
                    <div className="flex-grow min-w-0 flex justify-between items-center">
                      <div className="group flex-1">
                        <h3 className="text-md sm:text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                          <Link href={`/games/${game.id}`} className="hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded">
                            {game.name}
                          </Link>
                        </h3>
                        {game.yearPublished && (
                          <p className="text-xs sm:text-sm text-muted-foreground">
                            {game.yearPublished}
                          </p>
                        )}
                      </div>
                      <div className="text-center ml-2 flex-shrink-0 border-solid border border-accent rounded-md">
                        {game.overallAverageRating !== null && typeof game.overallAverageRating === 'number' && (
                          <p className="text-xl sm:text-2xl font-bold text-primary flex items-center bg-card rounded-t-md px-1.5">
                            <Star className="h-4 w-4 text-accent fill-accent relative top-px mr-1" />
                            {formatRatingNumber(game.overallAverageRating)}
                          </p>
                        )}
                        {game.voteCount !== null && typeof game.voteCount === 'number' && ( 
                          <p className="text-xs text-primary-foreground border-t bg-accent py-0.5 font-bold">
                            {game.voteCount} {game.voteCount === 1 ? 'voto' : 'voti'} 
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      <Card className="shadow-lg border border-border rounded-lg">
        <CardHeader>
          <CardTitle className="text-2xl sm:text-3xl flex items-center gap-3">
            <MessageSquareText className="h-7 w-7 text-primary" />
            Top 10 Giochi con Più Voti
          </CardTitle>
          <CardDescription>
            Scopri i giochi da tavolo che hanno generato più discussioni e voti.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mostReviewedGames.length === 0 ? (
            <Alert variant="default" className="bg-secondary/30 border-secondary">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Nessun Gioco con Voti</AlertTitle>
              <AlertDescription>
                Non ci sono ancora voti per mostrare questa classifica.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {mostReviewedGames.map((game, index) => (
                <div
                  key={`most-reviewed-${game.id}`}
                  className="relative flex items-center gap-x-3 sm:gap-x-4 p-3 rounded-lg bg-card hover:bg-muted/50 transition-colors border border-border overflow-hidden"
                >
                   <span 
                    aria-hidden="true"
                    className={cn(
                        "absolute z-0 font-bold text-muted-foreground/10 pointer-events-none select-none leading-none",
                        "top-1/2 -translate-y-1/2", // Vertical centering
                        "-right-[30px] text-[255px]", // Default (mobile)
                        "sm:-right-[30px] sm:text-[300px]", // Small screens
                        "lg:-right-[36px] lg:text-[340px]" // Large screens
                    )}
                  >
                    {index + 1}
                  </span>
                  <div className={cn(
                      "relative z-10 flex items-center gap-x-3 sm:gap-x-4 flex-grow",
                      "mr-5 sm:mr-8 lg:mr-10" // Adjusted for larger numbers
                    )}>
                    <div className="w-24 sm:w-28 md:w-32 flex-shrink-0">
                      <GameCard game={game} variant="featured" priority={index < 5} showOverlayText={false} />
                    </div>
                    <div className="flex-grow min-w-0 flex justify-between items-center">
                       <div className="group flex-1">
                        <h3 className="text-md sm:text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                          <Link href={`/games/${game.id}`} className="hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded">
                            {game.name}
                          </Link>
                        </h3>
                        {game.yearPublished && (
                          <p className="text-xs sm:text-sm text-muted-foreground">
                            {game.yearPublished}
                          </p>
                        )}
                        </div>
                        <div className="text-center ml-2 flex-shrink-0 border-solid border border-accent rounded-md">
                        {game.voteCount !== null && typeof game.voteCount === 'number' && ( 
                          <p className="text-xl sm:text-2xl font-bold text-primary flex items-center bg-card rounded-t-md px-1.5">
                             <MessageSquareText className="h-4 w-4 text-accent fill-accent relative top-px mr-1" />
                            {game.voteCount}
                          </p>
                        )}
                        <p className="text-xs text-primary-foreground border-t bg-accent py-0.5 font-bold">
                          {game.voteCount === 1 ? 'Voto' : 'Voti'} 
                        </p>
                      </div>
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

export const revalidate = 3600; 

