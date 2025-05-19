
import { getFeaturedGamesAction, getAllGamesAction } from '@/lib/actions'; 
import { GameCard } from '@/components/boardgame/game-card';
import { Separator } from '@/components/ui/separator';
import type { BoardGame } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SafeImage } from '@/components/common/SafeImage';
import Link from 'next/link';
import { formatRatingNumber } from '@/lib/utils';
import { Star, Edit } from 'lucide-react';
// Removed GameSearchList import as it's no longer used here
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

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
            <div className="overflow-x-auto bg-card p-4 rounded-lg shadow-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px] text-center">#</TableHead>
                    <TableHead className="w-[80px]">Copertina</TableHead>
                    <TableHead>Nome Gioco</TableHead>
                    <TableHead className="text-right">Punteggio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topRatedGames.map((game, index) => (
                    <TableRow key={game.id}>
                      <TableCell className="font-medium text-center">{index + 1}</TableCell>
                      <TableCell>
                        <Link href={`/games/${game.id}`} className="block">
                          <div className="relative w-12 h-16 sm:w-16 sm:h-20 rounded overflow-hidden shadow-sm hover:opacity-80 transition-opacity">
                            <SafeImage
                              src={game.coverArtUrl}
                              fallbackSrc={`https://placehold.co/64x80.png?text=${encodeURIComponent(game.name?.substring(0,3) || 'N/A')}`}
                              alt={`${game.name || 'Gioco'} copertina`}
                              fill
                              sizes="(max-width: 640px) 48px, 64px"
                              className="object-cover"
                              data-ai-hint={`board game ${game.name?.split(' ')[0]?.toLowerCase() || 'mini'}`}
                            />
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/games/${game.id}`} className="font-medium hover:text-primary hover:underline">
                          {game.name || "Gioco Senza Nome"}
                          {game.yearPublished && ` (${game.yearPublished})`}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/games/${game.id}`} className="font-semibold text-primary hover:underline flex items-center justify-end gap-1">
                           <Star className="h-4 w-4 text-accent fill-accent" />
                          {formatRatingNumber((game.overallAverageRating ?? 0) * 2)}
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
             <Separator className="my-10" />
          </section>
        )}

        {/* Removed GameSearchList component from here */}
      </section>
    </div>
  );
}

export const revalidate = 3600;
