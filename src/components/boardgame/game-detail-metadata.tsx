
'use client';

import type { BoardGame } from '@/lib/types';
import { PenTool, CalendarDays, Users, Clock, Weight, Dices, Trophy, Medal } from 'lucide-react';
import { formatRatingNumber } from '@/lib/utils';

interface GameDetailMetadataProps {
  game: BoardGame;
  topWinnerStats: { name: string; wins: number } | null;
  highestScoreAchieved: { score: number; players: string[] } | null;
}

export function GameDetailMetadata({
  game,
  topWinnerStats,
  highestScoreAchieved,
}: GameDetailMetadataProps) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-muted-foreground pt-1">
      {game.designers && game.designers.length > 0 && (
        <div className="flex items-baseline gap-2">
          <PenTool size={14} className="text-primary/80 flex-shrink-0 relative top-px" />
          <span className="font-medium hidden sm:inline">Autori:</span>
          <span>{game.designers.join(', ')}</span>
        </div>
      )}
      {game.yearPublished !== null && (
        <div className="flex items-baseline gap-2 justify-start sm:justify-end">
          <CalendarDays size={14} className="text-primary/80 flex-shrink-0 relative top-px" />
          <span className="font-medium hidden sm:inline">Anno:</span>
          <span>{game.yearPublished}</span>
        </div>
      )}
      {(game.minPlayers !== null || game.maxPlayers !== null) && (
        <div className="flex items-baseline gap-2">
          <Users size={14} className="text-primary/80 flex-shrink-0 relative top-px" />
          <span className="font-medium hidden sm:inline">Giocatori:</span>
          <span>{game.minPlayers}{game.maxPlayers && game.minPlayers !== game.maxPlayers ? `-${game.maxPlayers}` : ''}</span>
        </div>
      )}
      {(game.minPlaytime != null || game.maxPlaytime != null || game.playingTime != null) && (
        <div className="flex items-baseline gap-2 justify-start sm:justify-end">
          <Clock size={14} className="text-primary/80 flex-shrink-0 relative top-px" />
          <span className="font-medium hidden sm:inline">Durata:</span>
          <span>
            {game.minPlaytime != null && game.maxPlaytime != null ?
              (game.minPlaytime === game.maxPlaytime ? `${game.minPlaytime} min` : `${game.minPlaytime} - ${game.maxPlaytime} min`)
              : (game.playingTime != null ? `${game.playingTime} min` : '-')
            }
          </span>
        </div>
      )}
      {game.averageWeight !== null && typeof game.averageWeight === 'number' && (
        <div className="flex items-baseline gap-2">
          <Weight size={14} className="text-primary/80 flex-shrink-0 relative top-px" />
          <span className="font-medium hidden sm:inline">Complessità:</span>
          <span>{formatRatingNumber(game.averageWeight)} / 5</span>
        </div>
      )}
      <div className="flex items-baseline gap-2 justify-start sm:justify-end">
        <Dices size={14} className="text-primary/80 flex-shrink-0 relative top-px" />
        <span className="font-medium hidden sm:inline">Partite:</span>
        <span>{game.lctr01Plays ?? 0}</span>
      </div>
      {topWinnerStats && (
        <div className="flex items-baseline gap-2">
          <Trophy size={14} className="text-amber-500 flex-shrink-0 relative top-px" />
          <span className="font-medium hidden sm:inline">Campione:</span>
          <span>{topWinnerStats.name} ({topWinnerStats.wins} {topWinnerStats.wins === 1 ? 'vittoria' : 'vittorie'})</span>
        </div>
      )}
      {highestScoreAchieved && (
        <div className="flex items-baseline gap-2 justify-start sm:justify-end">
          <Medal size={14} className="text-amber-500 flex-shrink-0 relative top-px" />
          <span className="font-medium hidden sm:inline">Miglior Punteggio:</span>
          <span>{highestScoreAchieved.score} punti ({highestScoreAchieved.players.join(', ')})</span>
        </div>
      )}
    </div>
  );
}
