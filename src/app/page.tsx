
import { getFeaturedGamesAction, getAllGamesAction } from '@/lib/actions'; 
import { GameCard } from '@/components/boardgame/game-card';
import { Separator } from '@/components/ui/separator';
import type { BoardGame } from '@/lib/types';
import { Star, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { formatRatingNumber } from '@/lib/utils';

export default async function HomePage() {
  const featuredGames = await getFeaturedGamesAction();
  const allGames = await getAllGamesAction(); 

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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {topRatedGames.map((game, index) => (
                <GameCard game={game} key={game.id} variant="featured" priority={index < 5} />
              ))}
            </div>
             <Separator className="my-10" />
          </section>
        )}
      </section>
    </div>
  );
}

export const revalidate = 3600;
