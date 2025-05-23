
import Link from 'next/link';
import type { BoardGame } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Clock, Star, CalendarDays, Pin, Clock10 } from 'lucide-react';
import { SafeImage } from '@/components/common/SafeImage';
import { formatRatingNumber } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface GameCardProps {
  game: BoardGame;
  variant?: 'default' | 'featured';
  priority?: boolean;
  linkTarget?: 'detail' | 'rate';
  showOverlayText?: boolean;
  overrideHref?: string;
  featuredReason?: 'pinned' | 'recent';
}

export function GameCard({
  game,
  variant = 'default',
  priority = false,
  linkTarget = 'detail',
  showOverlayText = true,
  overrideHref,
  featuredReason,
}: GameCardProps) {
  const fallbackSrc = `https://placehold.co/200x300.png?text=${encodeURIComponent(game.name?.substring(0,10) || 'N/A')}`;
  
  const baseHref = linkTarget === 'rate' ? `/games/${game.id}/rate` : `/games/${game.id}`;
  const finalHref = overrideHref || baseHref;

  if (variant === 'featured') {
    return (
      <Link href={finalHref} className="block group w-full h-full">
        <Card className={cn(
          "relative overflow-hidden transition-all duration-300 ease-in-out w-full aspect-[3/4]",
          "shadow-lg hover:shadow-xl rounded-lg border border-border group-hover:border-primary/50",
           (!showOverlayText && game.id) && "bg-card"
        )}>
          {featuredReason && (
            <div className="absolute top-1.5 left-1.5 z-20 rounded-full bg-black/60 p-1 shadow-md">
              {featuredReason === 'pinned' && <Pin className="h-3 w-3 text-accent" fill="currentColor" />}
              {featuredReason === 'recent' && <Clock className="h-3 w-3 text-white" />}
            </div>
          )}
          <SafeImage
            src={game.coverArtUrl}
            alt={`${game.name || 'Gioco'} copertina`}
            fallbackSrc={fallbackSrc}
            fill
            className={cn(
              "object-cover group-hover:scale-105 transition-transform duration-300",
              "rounded-lg" 
            )}
            data-ai-hint={game.name ? `board game ${game.name.split(' ')[0]?.toLowerCase()}` : 'board game thumbnail'}
            priority={priority}
            sizes={showOverlayText ? "(max-width: 767px) 160px, 33vw" : "(max-width: 640px) 96px, (max-width: 767px) 112px, 128px"}
          />
          {showOverlayText && (
            <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/60 via-black/25 to-transparent p-2 sm:p-3">
              <div className="flex justify-between items-end">
                <h3 className="text-primary-foreground font-semibold text-base sm:text-lg leading-tight drop-shadow-sm line-clamp-3 mr-1"> {/* Changed from line-clamp-2 */}
                  {game.name}
                </h3>
                {game.overallAverageRating !== null && typeof game.overallAverageRating === 'number' && (
                  <p className="text-sm sm:text-base font-bold text-accent drop-shadow-sm whitespace-nowrap flex items-center">
                    <Star className="h-4 w-4 text-accent fill-accent relative top-px mr-0.5" />
                    {formatRatingNumber(game.overallAverageRating)}
                  </p>
                )}
              </div>
            </div>
          )}
        </Card>
      </Link>
    );
  }

  // Default variant (image on side, text content beside it)
  return (
    <Card className="flex flex-row overflow-hidden shadow-lg transition-all duration-300 ease-in-out hover:shadow-xl rounded-lg border border-border hover:border-primary/50 h-40 md:h-44">
      <div className="relative w-1/3 md:w-2/5 h-full flex-shrink-0">
        <Link href={`/games/${game.id}`} className="block w-full h-full">
            <SafeImage
            src={game.coverArtUrl}
            alt={`${game.name || 'Gioco'} copertina`}
            fallbackSrc={fallbackSrc}
            fill
            sizes="(max-width: 767px) 33vw, 40vw"
            className="object-cover rounded-l-lg"
            data-ai-hint={`board game ${game.name?.split(' ')[0]?.toLowerCase() || 'generic'}`}
            priority={priority}
            />
        </Link>
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
                <Star className="h-4 w-4 text-accent fill-accent relative top-px" />
                {formatRatingNumber(game.overallAverageRating ?? 0)}
              </div>
            )}
          </div>
           <div className="text-xs text-muted-foreground space-y-0.5 mb-2">
                {game.yearPublished && <div className="flex items-center gap-1"><CalendarDays size={12} className="relative top-px"/> {game.yearPublished}</div>}
                {(game.minPlayers || game.maxPlayers) && (
                  <div className="flex items-center gap-1"><Users size={12} className="relative top-px"/>
                    {game.minPlayers}{game.maxPlayers && game.minPlayers !== game.maxPlayers ? `-${game.maxPlayers}` : ''} Giocatori
                  </div>
                )}
                {game.playingTime && <div className="flex items-center gap-1"><Clock10 size={12} className="relative top-px"/> {game.playingTime} min</div>}
            </div>
        </div>

        <div className="p-0 mt-auto flex justify-end">
          <Button asChild variant="default" size="sm" className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-xs sm:text-sm">
            <Link href={`/games/${game.id}`}>Vedi Dettagli</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}

