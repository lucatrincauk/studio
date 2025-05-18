
import Link from 'next/link';
// import Image from 'next/image'; // No longer directly used
import type { BoardGame } from '@/lib/types';
import { Card, CardContent, CardDescription, CardFooter, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Clock, CalendarDays } from 'lucide-react';
import { SafeImage } from '@/components/common/SafeImage'; // Import SafeImage

interface GameCardProps {
  game: BoardGame;
}

export function GameCard({ game }: GameCardProps) {
  const fallbackSrc = `https://placehold.co/200x300.png?text=${encodeURIComponent(game.name?.substring(0,10) || 'N/A')}`;

  return (
    <Card className="flex flex-row overflow-hidden shadow-lg transition-all duration-300 ease-in-out hover:shadow-xl rounded-lg border border-border hover:border-primary/50 h-40 md:h-44"> {/* Adjusted height */}
      {/* Image container on the left */}
      <div className="relative w-1/3 md:w-2/5 h-full flex-shrink-0">
        <SafeImage
          src={game.coverArtUrl}
          alt={`${game.name || 'Game'} cover art`}
          fallbackSrc={fallbackSrc}
          fill
          sizes="(max-width: 767px) 33vw, (min-width: 768px) 20vw"
          className="object-cover rounded-l-lg"
          data-ai-hint={`board game ${game.name?.split(' ')[0]?.toLowerCase() || 'generic'}`}
          priority={['wingspan', 'catan'].includes(game.id)}
        />
      </div>

      {/* Content container on the right */}
      <div className="flex flex-col flex-grow p-3 sm:p-4 justify-between overflow-y-auto">
        <div> {/* Top group: Title, meta */}
          <CardTitle className="text-base sm:text-lg mb-1.5 leading-tight font-semibold group-hover:text-primary transition-colors">
            <Link href={`/games/${game.id}`} className="hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded">
              {game.name}
            </Link>
          </CardTitle>
           <div className="text-xs text-muted-foreground space-y-0.5 mb-2">
                {game.yearPublished && <div className="flex items-center gap-1"><CalendarDays size={12}/> {game.yearPublished}</div>}
                {(game.minPlayers || game.maxPlayers) && (
                  <div className="flex items-center gap-1"><Users size={12}/>
                    {game.minPlayers}{game.maxPlayers && game.minPlayers !== game.maxPlayers ? `-${game.maxPlayers}` : ''} Players
                  </div>
                )}
                {game.playingTime && <div className="flex items-center gap-1"><Clock size={12}/> {game.playingTime} min</div>}
            </div>
        </div>

        <CardFooter className="p-0 mt-auto flex flex-col items-start sm:flex-row sm:justify-end sm:items-center gap-2"> {/* Adjusted to justify-end for button */}
          <Button asChild variant="default" size="sm" className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-xs sm:text-sm">
            <Link href={`/games/${game.id}`}>View Details</Link>
          </Button>
        </CardFooter>
      </div>
    </Card>
  );
}
