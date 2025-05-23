
import { GameRatingSelector } from '@/components/rating/game-rating-selector';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { getFeaturedGamesAction } from '@/lib/actions';
import { GameCard } from '@/components/boardgame/game-card';
import { Separator } from '@/components/ui/separator';

export default async function SelectGameToRatePage() {
  const featuredGames = await getFeaturedGamesAction();

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
       <Button variant="outline" size="sm" className="mb-6" asChild>
        <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" /> Torna Indietro
        </Link>
      </Button>
      <Card className="shadow-xl border border-border rounded-lg">
        <CardHeader>
          <CardTitle className="text-2xl md:text-3xl">Scegli il Gioco da Valutare</CardTitle>
          <CardDescription>
            Seleziona tra i giochi in evidenza oppure cerca un gioco nella collezione per valutarlo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <GameRatingSelector />

          {featuredGames && featuredGames.length > 0 && (
            <>
              <Separator className="my-6" />
              <div className="mb-8">
                <h3 className="text-xl font-semibold text-foreground mb-4">In Evidenza</h3>
                <div className="flex space-x-4 overflow-x-auto pb-4 md:grid md:grid-cols-3 md:gap-4 md:space-x-0 md:pb-0 md:overflow-x-visible">
                  {featuredGames.map((game, index) => (
                    <div key={game.id} className="w-40 flex-shrink-0 md:w-auto">
                      <GameCard
                        game={game}
                        variant="featured"
                        priority={index < 3}
                        linkTarget="rate" // Link to rate page
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Revalidate data for this page as needed, e.g., every hour or on demand
export const revalidate = 3600;

