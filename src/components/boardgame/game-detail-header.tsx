
'use client';

import type { BoardGame, Review } from '@/lib/types';
import type { User as FirebaseUser } from 'firebase/auth';
import { SafeImage } from '@/components/common/SafeImage';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card'; // Added import
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Star, ExternalLink, Heart, Bookmark, BookMarked, Frown, Settings, Pin, PinOff, Loader2, DownloadCloud, Dices } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRatingNumber } from '@/lib/utils';

interface GameDetailHeaderProps {
  game: BoardGame;
  currentUser: FirebaseUser | null;
  isAdmin: boolean;
  globalGameAverage: number | null;
  fallbackSrc: string;
  currentIsPinned: boolean;
  isPinToggling: boolean;
  onTogglePin: () => void;
  isFavoritedByCurrentUser: boolean;
  currentFavoriteCount: number;
  isFavoriting: boolean;
  onToggleFavorite: () => void;
  isPlaylistedByCurrentUser: boolean;
  isPlaylisting: boolean;
  onTogglePlaylist: () => void;
  isMorchiaByCurrentUser: boolean;
  currentMorchiaCount: number;
  isTogglingMorchia: boolean;
  onToggleMorchia: () => void;
  userOverallScore: number | null;
  isPendingBggDetailsFetch: boolean;
  isFetchingDetailsFor: string | null;
  onRefreshBggData: () => void;
  onFetchBggPlays: () => void;
  isFetchingPlays: boolean;
  userReview: Review | undefined;
}

export function GameDetailHeader({
  game,
  currentUser,
  isAdmin,
  globalGameAverage,
  fallbackSrc,
  currentIsPinned,
  isPinToggling,
  onTogglePin,
  isFavoritedByCurrentUser,
  currentFavoriteCount,
  isFavoriting,
  onToggleFavorite,
  isPlaylistedByCurrentUser,
  isPlaylisting,
  onTogglePlaylist,
  isMorchiaByCurrentUser,
  currentMorchiaCount,
  isTogglingMorchia,
  onToggleMorchia,
  userOverallScore,
  isPendingBggDetailsFetch,
  isFetchingDetailsFor,
  onRefreshBggData,
  onFetchBggPlays,
  isFetchingPlays,
  userReview,
}: GameDetailHeaderProps) {
  return (
    <Card className="overflow-hidden shadow-xl border border-border rounded-lg">
      <div className="flex flex-col md:flex-row">
        {/* Main Content Column (Title, Metadata, Button Bar, Average Ratings) */}
        <div className="flex-1 p-6 space-y-4 md:order-1">
          {/* Header: Title and Score */}
          <div className="flex justify-between items-start mb-2">
            <div className="flex-1 min-w-0 mr-2">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-foreground">
                {game.name}
              </h1>
            </div>
            <div className="flex-shrink-0">
              {globalGameAverage !== null && (
                <span className="text-3xl md:text-4xl font-bold text-primary flex items-center">
                    <Star className="mr-1 h-6 w-6 md:h-7 md:w-7 text-accent fill-accent" />
                    {formatRatingNumber(globalGameAverage)}
                </span>
              )}
            </div>
          </div>

          {/* Mobile Image - Placed below title/score block */}
          <div className="md:hidden my-4 max-w-[240px] mx-auto">
            <div className="relative aspect-[2/3] w-full rounded-md overflow-hidden shadow-md">
              <SafeImage
                src={game.coverArtUrl}
                alt={`${game.name} copertina`}
                fallbackSrc={fallbackSrc}
                fill
                priority
                className="object-cover"
                data-ai-hint={`board game ${game.name.split(' ')[0]?.toLowerCase() || 'detailed'}`}
                sizes="(max-width: 767px) 240px"
              />
            </div>
          </div>
          
          {/* Button Bar - Moved from below metadata */}
          {currentUser && (
            <div className="py-4 border-t border-b border-border">
                <div className="flex justify-evenly items-center gap-1 sm:gap-2">
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      title={userReview ? "Modifica il Tuo Voto" : "Valuta questo Gioco"}
                      className={cn(
                          'h-9 px-2 text-primary hover:text-primary/80 hover:bg-primary/10',
                           userReview && 'border border-primary/50'
                      )}
                    >
                      <Link href={`/games/${game.id}/rate`}>
                        <Star className="h-5 w-5" />
                        {userReview && userOverallScore !== null ? (
                            <span className="ml-1 text-xs font-semibold">
                            {formatRatingNumber(userOverallScore)}
                            </span>
                        ) : (
                            <span className="ml-1 text-xs hidden sm:inline">Valuta</span>
                        )}
                      </Link>
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onToggleFavorite}
                        disabled={isFavoriting || !currentUser}
                        title={isFavoritedByCurrentUser ? "Rimuovi dai Preferiti" : "Aggiungi ai Preferiti"}
                        className={cn(
                        `h-9 px-2`,
                        isFavoritedByCurrentUser ? 'text-destructive hover:bg-destructive/20' : 'text-destructive/60 hover:text-destructive hover:bg-destructive/10'
                        )}
                    >
                        <Heart className={cn(`h-5 w-5`, isFavoritedByCurrentUser ? 'fill-destructive' : '')} />
                        {currentFavoriteCount > 0 && (
                        <span className="ml-1 text-xs text-muted-foreground">
                            ({currentFavoriteCount})
                        </span>
                        )}
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onToggleMorchia}
                        disabled={isTogglingMorchia || !currentUser}
                        title={isMorchiaByCurrentUser ? "Rimuovi da Morchie" : "Aggiungi alle Morchie"}
                        className={cn(
                        `h-9 px-2`,
                        isMorchiaByCurrentUser ? 'text-orange-600 hover:bg-orange-600/20' : 'text-orange-600/60 hover:text-orange-600 hover:bg-orange-600/10'
                        )}
                    >
                        <Frown className={cn(`h-5 w-5`, isMorchiaByCurrentUser ? 'fill-orange-600/30' : '')} />
                        {currentMorchiaCount > 0 && (
                        <span className="ml-1 text-xs text-muted-foreground">
                            ({currentMorchiaCount})
                        </span>
                        )}
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onTogglePlaylist}
                        disabled={isPlaylisting || !currentUser}
                        title={isPlaylistedByCurrentUser ? "Rimuovi dalla Playlist" : "Aggiungi alla Playlist"}
                        className={cn(
                        `h-9 px-2`,
                        isPlaylistedByCurrentUser ? 'text-sky-500 hover:bg-sky-500/20' : 'text-sky-500/60 hover:text-sky-500 hover:bg-sky-500/10'
                        )}
                    >
                        {isPlaylistedByCurrentUser ? <BookMarked className="h-5 w-5" /> : <Bookmark className="h-5 w-5" />}
                        {game?.playlistedByUserIds && game.playlistedByUserIds.length > 0 && (
                        <span className="ml-1 text-xs text-muted-foreground">
                            ({game.playlistedByUserIds.length})
                        </span>
                        )}
                    </Button>

                    <Button variant="ghost" size="icon" asChild className="h-9 w-9 text-primary/80 hover:text-primary hover:bg-primary/10" disabled={!game.bggId}>
                        <a href={`https://boardgamegeek.com/boardgame/${game.bggId}`} target="_blank" rel="noopener noreferrer" title="Vedi su BGG">
                            <ExternalLink className="h-4 w-4" />
                        </a>
                    </Button>

                    {isAdmin && (
                        <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9 text-primary/80 hover:text-primary hover:bg-primary/10">
                            <Settings className="h-5 w-5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem
                            onSelect={onTogglePin}
                            disabled={isPinToggling || !currentUser}
                            className="cursor-pointer"
                            >
                            {isPinToggling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (currentIsPinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />)}
                            {currentIsPinned ? "Rimuovi da Vetrina" : "Aggiungi a Vetrina"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                            onSelect={onRefreshBggData}
                            disabled={(isPendingBggDetailsFetch && isFetchingDetailsFor === game.id) || !game || !game.bggId}
                            className="cursor-pointer"
                            >
                            {(isPendingBggDetailsFetch && isFetchingDetailsFor === game.id) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DownloadCloud className="mr-2 h-4 w-4" />}
                            Aggiorna Dati da BGG
                            </DropdownMenuItem>
                            <DropdownMenuItem
                            onSelect={onFetchBggPlays}
                            disabled={isFetchingPlays || !game || !game.id || !game.bggId || !currentUser}
                            className="cursor-pointer"
                            >
                            {isFetchingPlays ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Dices className="mr-2 h-4 w-4" />}
                            Carica Partite
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </div>
          )}
          
          {/* Placeholder for Metadata Grid - To be replaced by GameDetailMetadata component */}
          {/* Placeholder for Average Ratings - To be kept or extracted later */}
          
        </div>

        {/* Desktop Image Sidebar */}
        <div className="hidden md:block md:w-1/4 p-6 flex-shrink-0 self-start md:order-2 space-y-4">
          <div className="relative aspect-[2/3] w-full rounded-md overflow-hidden shadow-md">
            <SafeImage
              src={game.coverArtUrl}
              alt={`${game.name} copertina`}
              fallbackSrc={fallbackSrc}
              fill
              priority
              className="object-cover"
              data-ai-hint={`board game ${game.name.split(' ')[0]?.toLowerCase() || 'detailed'}`}
              sizes="25vw"
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
