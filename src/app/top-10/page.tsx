
import { getAllGamesAction } from '@/lib/actions';
import { GameCard } from '@/components/boardgame/game-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Star } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

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
            <Star className="h-7 w-7 text-primary" />
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
              {topRatedGames.map((game, index) => (
                <GameCard game={game} key={game.id} variant="featured" priority={index < 4} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export const revalidate = 3600; // Revalidate every hour

