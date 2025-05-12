
'use client';

import { useState, useMemo, useEffect, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BoardGame, BggSearchResult } from '@/lib/types';
import { GameCard } from '@/components/boardgame/game-card';
import { BggSearchResultItem } from './bgg-search-result-item';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2, AlertCircle, Info } from 'lucide-react';
import { searchBggGamesAction, importAndRateBggGameAction } from '@/lib/actions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';

interface GameSearchListProps {
  initialGames: BoardGame[];
}

// Debounce function
const debounce = <F extends (...args: any[]) => any>(func: F, waitFor: number) => {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: Parameters<F>) => {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
    timeout = setTimeout(() => func(...args), waitFor);
  };

  return debounced as (...args: Parameters<F>) => ReturnType<F>;
};


export function GameSearchList({ initialGames }: GameSearchListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [displayedGames, setDisplayedGames] = useState<BoardGame[]>(initialGames);
  
  const [bggResults, setBggResults] = useState<BggSearchResult[]>([]);
  const [isLoadingBgg, setIsLoadingBgg] = useState(false);
  const [bggError, setBggError] = useState<string | null>(null);
  const [isImportingId, setIsImportingId] = useState<string | null>(null); 
  
  const [isPendingImport, startImportTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  const handleSearchBgg = useCallback(async (query: string) => {
    if (!query.trim()) {
      setBggResults([]);
      setBggError(null);
      setIsLoadingBgg(false);
      return;
    }
    setIsLoadingBgg(true);
    setBggError(null);
    const result = await searchBggGamesAction(query);
    if ('error' in result) {
      setBggError(result.error);
      setBggResults([]);
    } else {
      setBggResults(result);
    }
    setIsLoadingBgg(false);
  }, []);

  const debouncedSearchBgg = useMemo(() => debounce(handleSearchBgg, 500), [handleSearchBgg]);

  useEffect(() => {
    if (searchTerm.trim()) {
      debouncedSearchBgg(searchTerm.trim());
    } else {
      // Clear BGG results and show local filtered games if search term is cleared
      setBggResults([]);
      setBggError(null);
      setIsLoadingBgg(false);
      // Filter initialGames based on cleared search (effectively showing all initialGames)
      setDisplayedGames(initialGames.filter(game =>
        game.name.toLowerCase().includes(searchTerm.toLowerCase().trim())
      ));
    }
  }, [searchTerm, initialGames, debouncedSearchBgg]);
  
  // Filter local games when search term is present but BGG search might not be active yet or no term
   useEffect(() => {
    if (!searchTerm.trim()) {
      setDisplayedGames(initialGames);
    } else {
      // This local filtering is mostly for when the search term is cleared
      // BGG results will typically override this display when searchTerm is active
      setDisplayedGames(
        initialGames.filter(game =>
          game.name.toLowerCase().includes(searchTerm.toLowerCase().trim())
        )
      );
    }
  }, [searchTerm, initialGames]);


  const handleImportGame = async (bggId: string) => {
    setIsImportingId(bggId);
    startImportTransition(async () => {
      const result = await importAndRateBggGameAction(bggId);
      if ('error' in result) {
        toast({
          title: 'Error Importing Game',
          description: result.error,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Game Added!',
          description: 'The game has been added to your collection.',
        });
        // router.push(`/games/${result.gameId}`);
        // Instead of direct navigation, let's revalidate and let user click if they want.
        // Or, we can update the initialGames list if possible.
        // For now, a simple refresh or re-fetch of initialGames would be needed to see it in the local list
        // A full page navigation will refresh the data due to server components.
         router.push(`/games/${result.gameId}?imported=true`);
      }
      setIsImportingId(null);
    });
  };

  const showBggResults = searchTerm.trim().length > 0;

  return (
    <div className="space-y-8">
      <div className="relative max-w-xl mx-auto">
        <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="Search local games or type to find on BoardGameGeek..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-lg bg-background py-3 pl-11 pr-4 text-base shadow-sm border border-input focus:ring-2 focus:ring-primary/50 focus:border-primary"
          aria-label="Search for a board game by name locally or on BoardGameGeek"
        />
      </div>

      {isLoadingBgg && (
        <div className="flex flex-col justify-center items-center py-10">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="mt-3 text-muted-foreground">Searching BoardGameGeek...</p>
        </div>
      )}

      {bggError && !isLoadingBgg && (
        <Alert variant="destructive" className="max-w-lg mx-auto">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>BGG Search Error</AlertTitle>
          <AlertDescription>{bggError}</AlertDescription>
        </Alert>
      )}

      {showBggResults && !isLoadingBgg && !bggError && bggResults.length > 0 && (
        <section>
          <h3 className="text-xl font-semibold mb-4 text-foreground">BoardGameGeek Results ({bggResults.length})</h3>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {bggResults.map((bggGame) => (
              <BggSearchResultItem 
                key={bggGame.bggId} 
                result={bggGame} 
                onAddGame={handleImportGame}
                isAdding={isPendingImport && isImportingId === bggGame.bggId}
              />
            ))}
          </div>
        </section>
      )}
      
      {showBggResults && !isLoadingBgg && !bggError && bggResults.length === 0 && searchTerm.trim().length > 0 && (
         <Alert variant="default" className="max-w-lg mx-auto bg-secondary/30 border-secondary">
          <Info className="h-4 w-4" />
          <AlertTitle>No BGG Results</AlertTitle>
          <AlertDescription>No games found on BoardGameGeek for "{searchTerm}". Try a different search term.</AlertDescription>
        </Alert>
      )}

      {!showBggResults && displayedGames.length > 0 && (
        <section>
           <h3 className="text-xl font-semibold mb-4 text-foreground">Your Games ({displayedGames.length})</h3>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
            {displayedGames.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        </section>
      )}
      
      {!showBggResults && displayedGames.length === 0 && (
         <Alert variant="default" className="max-w-lg mx-auto bg-secondary/30 border-secondary">
          <Info className="h-4 w-4" />
          <AlertTitle>No Local Games</AlertTitle>
          <AlertDescription>No games found in your collection. Try searching on BoardGameGeek to add some!</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
