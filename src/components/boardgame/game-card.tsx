
import Link from 'next/link';
import type { BoardGame } from '@/lib/types';
import { Card, CardContent, CardFooter, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Clock, CalendarDays } from 'lucide-react';
import { SafeImage } from '@/components/common/SafeImage';
import { formatRatingNumber } from '@/lib/utils';

interface GameCardProps {
  game: BoardGame;
  variant?: 'default' | 'featured';
  priority?: boolean;
}

export function GameCard({ game, variant = 'default', priority = false }: GameCardProps) {
  const fallbackSrc = `https://placehold.co/200x300.png?text=${encodeURIComponent(game.name?.substring(0,10) || 'N/A')}`;

  if (variant === 'featured') {
    return (
      <Link href={`/games/${game.id}`} className="block group">
        <Card className="relative overflow-hidden shadow-lg transition-all duration-300 ease-in-out hover:shadow-xl rounded-lg border border-border group-hover:border-primary/50 aspect-[3/4] h-full">
          <SafeImage
            src={game.coverArtUrl}
            alt={`${game.name || 'Gioco'} copertina`}
            fallbackSrc={fallbackSrc}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            data-ai-hint="board game cover"
            priority={priority}
            sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, 33vw"
          />
          <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 via-black/40 to-transparent p-3">
            <h3 className="text-primary-foreground font-semibold text-base leading-tight drop-shadow-sm line-clamp-2">
              {game.name} {game.yearPublished && <span className="text-xs opacity-80">({game.yearPublished})</span>}
            </h3>
            {game.overallAverageRating !== null && typeof game.overallAverageRating === 'number' && (
              <p className="text-sm font-bold text-accent drop-shadow-sm">
                {formatRatingNumber(game.overallAverageRating * 2)}
              </p>
            )}
          </div>
        </Card>
      </Link>
    );
  }

  // Default variant
  return (
    <Card className="flex flex-row overflow-hidden shadow-lg transition-all duration-300 ease-in-out hover:shadow-xl rounded-lg border border-border hover:border-primary/50 h-40 md:h-44">
      <div className="relative w-1/3 md:w-2/5 h-full flex-shrink-0">
        <SafeImage
          src={game.coverArtUrl}
          alt={`${game.name || 'Gioco'} copertina`}
          fallbackSrc={fallbackSrc}
          fill
          sizes="(max-width: 767px) 33vw, 40vw" // Adjusted sizes for default card
          className="object-cover rounded-l-lg"
          data-ai-hint={`board game ${game.name?.split(' ')[0]?.toLowerCase() || 'generic'}`}
          priority={priority}
        />
      </div>

      <div className="flex flex-col flex-grow p-3 sm:p-4 justify-between overflow-y-auto">
        <div>
          <div className="flex justify-between items-start mb-1.5">
            <CardTitle className="text-base sm:text-lg leading-tight font-semibold group-hover:text-primary transition-colors flex-1 mr-2">
              <Link href={`/games/${game.id}`} className="hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded">
                {game.name}
              </Link>
            </CardTitle>
            {game.overallAverageRating !== null && typeof game.overallAverageRating === 'number' && (
              <div className="text-lg sm:text-xl font-bold text-primary flex items-center gap-1 flex-shrink-0">
                {formatRatingNumber(game.overallAverageRating * 2)}
              </div>
            )}
          </div>
           <div className="text-xs text-muted-foreground space-y-0.5 mb-2">
                {game.yearPublished && <div className="flex items-center gap-1"><CalendarDays size={12}/> {game.yearPublished}</div>}
                {(game.minPlayers || game.maxPlayers) && (
                  <div className="flex items-center gap-1"><Users size={12}/>
                    {game.minPlayers}{game.maxPlayers && game.minPlayers !== game.maxPlayers ? `-${game.maxPlayers}` : ''} Giocatori
                  </div>
                )}
                {game.playingTime && <div className="flex items-center gap-1"><Clock size={12}/> {game.playingTime} min</div>}
            </div>
        </div>

        <CardFooter className="p-0 mt-auto flex justify-end">
          <Button asChild variant="default" size="sm" className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-xs sm:text-sm">
            <Link href={`/games/${game.id}`}>Vedi Dettagli</Link>
          </Button>
        </CardFooter>
      </div>
    </Card>
  );
}
