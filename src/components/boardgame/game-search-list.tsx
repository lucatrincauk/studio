'use client';

import { useState, useMemo } from 'react';
import type { BoardGame } from '@/lib/types';
import { GameCard } from '@/components/boardgame/game-card';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface GameSearchListProps {
  initialGames: BoardGame[];
}

export function GameSearchList({ initialGames }: GameSearchListProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredGames = useMemo(() => {
    if (!searchTerm.trim()) {
      return initialGames;
    }
    return initialGames.filter(game =>
      game.name.toLowerCase().includes(searchTerm.toLowerCase().trim())
    );
  }, [initialGames, searchTerm]);

  return (
    <div className="space-y-8">
      <div className="relative max-w-xl mx-auto">
        <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="Search games by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-lg bg-background py-3 pl-11 pr-4 text-base shadow-sm border border-input focus:ring-2 focus:ring-primary/50 focus:border-primary"
          aria-label="Search for a board game by name"
        />
      </div>

      {filteredGames.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
          {filteredGames.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-xl text-muted-foreground">
            {searchTerm ? 'No games found matching your search.' : (initialGames.length > 0 ? 'Clear search to see all games.' : 'No games available.')}
          </p>
          {searchTerm && <p className="text-muted-foreground mt-1">Try a different search term or clear the search.</p>}
          {!searchTerm && initialGames.length === 0 && <p className="text-muted-foreground mt-1">Please check back soon or consider adding a new game!</p>}
        </div>
      )}
    </div>
  );
}
