import Link from 'next/link';
import Image from 'next/image';
import type { BoardGame } from '@/lib/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { StarRating } from './star-rating';
import { calculateAverageRating } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface GameCardProps {
  game: BoardGame;
}

export function GameCard({ game }: GameCardProps) {
  const averageRating = calculateAverageRating(game);

  return (
    <Card className="flex flex-col overflow-hidden shadow-lg transition-all duration-300 ease-in-out hover:shadow-xl h-full rounded-lg border border-border hover:border-primary/50">
      <CardHeader className="p-0">
        <div className="relative w-full h-48 sm:h-56">
          <Image
            src={game.coverArtUrl}
            alt={`${game.name} cover art`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover rounded-t-lg"
            data-ai-hint={`board game ${game.name.split(' ')[0]?.toLowerCase() || 'generic'}`}
            priority={['wingspan', 'catan'].includes(game.id)} 
          />
        </div>
      </CardHeader>
      <CardContent className="p-4 flex-grow">
        <CardTitle className="text-xl mb-1 leading-tight font-semibold group-hover:text-primary transition-colors">
          <Link href={`/games/${game.id}`} className="hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded">
            {game.name}
          </Link>
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground mb-2">
          {game.yearPublished ? `${game.yearPublished} • ` : ''}
          {game.minPlayers && game.maxPlayers ? `${game.minPlayers}-${game.maxPlayers} Players • ` : ''}
          {game.playingTime ? `${game.playingTime} Min` : ''}
        </CardDescription>
        <p className="text-sm text-foreground/90 line-clamp-3 mb-3">{game.description}</p>
      </CardContent>
      <CardFooter className="p-4 pt-0 flex flex-col items-start sm:flex-row sm:justify-between sm:items-center">
        <div className="flex items-center gap-2 mb-3 sm:mb-0">
          <StarRating rating={averageRating} readOnly size={20} />
          <span className="text-sm font-semibold text-foreground">{averageRating > 0 ? averageRating.toFixed(1) : 'No ratings'}</span>
        </div>
        <Button asChild variant="default" size="sm" className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
          <Link href={`/games/${game.id}`}>View Details</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
