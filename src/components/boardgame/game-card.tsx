
import Link from 'next/link';
import Image from 'next/image';
import type { BoardGame } from '@/lib/types';
import { Card, CardContent, CardDescription, CardFooter, CardTitle } from '@/components/ui/card';
import { StarRating } from './star-rating';
import { calculateAverageRating } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface GameCardProps {
  game: BoardGame;
}

export function GameCard({ game }: GameCardProps) {
  const averageRating = calculateAverageRating(game);

  return (
    <Card className="flex flex-row overflow-hidden shadow-lg transition-all duration-300 ease-in-out hover:shadow-xl rounded-lg border border-border hover:border-primary/50 h-48 md:h-52"> {/* Fixed height for consistency */}
      {/* Image container on the left */}
      <div className="relative w-1/3 md:w-2/5 h-full flex-shrink-0">
        <Image
          src={game.coverArtUrl}
          alt={`${game.name} cover art`}
          fill
          sizes="(max-width: 767px) 33vw, (min-width: 768px) 20vw" // Approximate sizes: 1/3 of card width on small, 2/5 on medium+
          className="object-cover rounded-l-lg"
          data-ai-hint={`board game ${game.name.split(' ')[0]?.toLowerCase() || 'generic'}`}
          priority={['wingspan', 'catan'].includes(game.id)}
        />
      </div>

      {/* Content container on the right */}
      <div className="flex flex-col flex-grow p-3 sm:p-4 justify-between overflow-y-auto">
        <div> {/* Top group: Title, meta, description */}
          <CardTitle className="text-base sm:text-lg mb-1 leading-tight font-semibold group-hover:text-primary transition-colors">
            <Link href={`/games/${game.id}`} className="hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded">
              {game.name}
            </Link>
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground mb-1 sm:mb-2">
            {game.yearPublished ? `${game.yearPublished} • ` : ''}
            {game.minPlayers && game.maxPlayers ? `${game.minPlayers}-${game.maxPlayers}P • ` : ''}
            {game.playingTime ? `${game.playingTime}m` : ''}
          </CardDescription>
          <CardContent className="p-0 mb-2 sm:mb-3">
            <p className="text-xs sm:text-sm text-foreground/90 line-clamp-2 sm:line-clamp-3">{game.description}</p>
          </CardContent>
        </div>

        <CardFooter className="p-0 mt-auto flex flex-col items-start sm:flex-row sm:justify-between sm:items-center gap-2">
          <div className="flex items-center gap-1 sm:gap-2">
            <StarRating rating={averageRating} readOnly size={16} />
            <span className="text-xs sm:text-sm font-semibold text-foreground">{averageRating > 0 ? averageRating.toFixed(1) : 'No ratings'}</span>
          </div>
          <Button asChild variant="default" size="sm" className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-xs sm:text-sm">
            <Link href={`/games/${game.id}`}>View Details</Link>
          </Button>
        </CardFooter>
      </div>
    </Card>
  );
}
