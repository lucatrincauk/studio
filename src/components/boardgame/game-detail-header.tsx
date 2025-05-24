
'use client';

import type { BoardGame, Review, GroupedCategoryAverages } from '@/lib/types';
import type { User as FirebaseUser } from 'firebase/auth';
import { SafeImage } from '@/components/common/SafeImage';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Star, ExternalLink, Heart, Settings, Pin, PinOff, Loader2, DownloadCloud, Dices, UserCircle2, Edit, Trash2, CalendarDays, Weight, PenTool, Clock, Medal, Sparkles, Trophy, Users, ListPlus, ListChecks, Wand2,
  MessageSquare, Bookmark, BookMarked,
  Frown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRatingNumber } from '@/lib/utils';
import { GameDetailMetadata } from './game-detail-metadata';
import { GroupedRatingsDisplay } from './grouped-ratings-display';
import { Separator } from '@/components/ui/separator';

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
  userReview: Review | undefined;
  userOverallScore: number | null;
  isPendingBggDetailsFetch: boolean;
  isFetchingDetailsFor: string | null;
  onRefreshBggData: () => void;
  onFetchBggPlays: () => void;
  isFetchingPlays: boolean;
  topWinnerStats: { name: string; wins: number } | null;
  highestScoreAchieved: { score: number; players: string[] } | null;
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
  userReview,
  userOverallScore,
  isPendingBggDetailsFetch,
  isFetchingDetailsFor,
  onRefreshBggData,
  onFetchBggPlays,
  isFetchingPlays,
  topWinnerStats,
  highestScoreAchieved,
}: GameDetailHeaderProps) {
  return (
    <Card className="overflow-hidden shadow-xl border border-border rounded-lg">
      <div className="flex flex-col md:flex-row">
        {/* Main Content Column (Title, Metadata, Button Bar, Average Ratings) */}
        <div className="flex-1 p-6 space-y-4 md:order-1">
          {/* Header: Title and Score */}
          <div className="flex justify-between items-start mb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-1 flex-shrink min-w-0 mr-2">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-foreground">
                {game.name}
              </h1>
            </div>
            <div className="flex-shrink-0 flex flex-col items-end">
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
          
          {currentUser && (
            <div className="flex justify-evenly items-center gap-1 sm:gap-2 py-4 border-t border-b border-border">
              {/* Rate button */}
              <Button
                asChild
                variant="ghost"
                size="sm"
                title={userReview ? "Modifica il Tuo Voto" : "Valuta questo Gioco"}
                className="h-9 px-2 text-primary hover:text-primary/80 hover:bg-primary/10"
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

              {/* Favorite button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleFavorite}
                disabled={isFavoriting}
                title={isFavoritedByCurrentUser ? "Rimuovi dai Preferiti" : "Aggiungi ai Preferiti"}
                className={cn(
                  `h-9 px-2 flex items-center`,
                  isFavoritedByCurrentUser ? 'text-destructive fill-destructive hover:bg-destructive/20' : 'text-destructive/60 hover:text-destructive hover:bg-destructive/10'
                )}
              >
                <Heart className={cn(`h-5 w-5`, isFavoritedByCurrentUser ? 'fill-destructive' : '')} />
                {currentFavoriteCount > 0 && (
                  <span className="ml-1 text-xs text-muted-foreground">
                      ({currentFavoriteCount})
                  </span>
                )}
              </Button>

              {/* Morchia button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleMorchia}
                disabled={isTogglingMorchia}
                title={isMorchiaByCurrentUser ? "Rimuovi da Morchie" : "Aggiungi alle Morchie"}
                className={cn(
                `h-9 px-2 flex items-center`,
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

              {/* Playlist button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={onTogglePlaylist}
                disabled={isPlaylisting}
                title={isPlaylistedByCurrentUser ? "Rimuovi dalla Playlist" : "Aggiungi alla Playlist"}
                className={cn(
                `h-9 px-2 flex items-center`,
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

              {/* BGG Link button */}
              <Button variant="ghost" size="icon" asChild className="h-9 w-9" disabled={!game.bggId}>
                <a href={`https://boardgamegeek.com/boardgame/${game.bggId}`} target="_blank" rel="noopener noreferrer" title="Vedi su BGG">
                  <ExternalLink className="h-4 w-4 text-primary/80" />
                </a>
              </Button>

              {/* Admin Actions Dropdown */}
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
                      disabled={isPinToggling}
                      className="cursor-pointer"
                    >
                      {isPinToggling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (currentIsPinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />)}
                      {currentIsPinned ? "Rimuovi da Vetrina" : "Aggiungi a Vetrina"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={onRefreshBggData}
                      disabled={(isPendingBggDetailsFetch && isFetchingDetailsFor === game.id)}
                      className="cursor-pointer"
                    >
                      {(isPendingBggDetailsFetch && isFetchingDetailsFor === game.id) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DownloadCloud className="mr-2 h-4 w-4" />}
                      Aggiorna Dati da BGG
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={onFetchBggPlays}
                      disabled={isFetchingPlays}
                      className="cursor-pointer"
                    >
                      {isFetchingPlays ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Dices className="mr-2 h-4 w-4" />}
                      Carica Partite (lctr01)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
          
          <GameDetailMetadata game={game} topWinnerStats={topWinnerStats} highestScoreAchieved={highestScoreAchieved} />
          
          {game.reviews && game.reviews.length > 0 && (
            <div className="w-full pt-4 border-t border-border">
              <h3 className="text-sm md:text-lg font-semibold text-foreground mb-3">
                Valutazione Media:
              </h3>
              <GroupedRatingsDisplay
                reviews={game.reviews}
                noRatingsMessage="Nessuna valutazione per calcolare le medie."
                defaultOpenSections={[]}
              />
            </div>
          )}
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
