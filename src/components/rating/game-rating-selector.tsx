
'use client';

import { useState, useEffect, useMemo, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BoardGame } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Info, Loader2, Edit, Star } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { GameCard } from '@/components/boardgame/game-card'; // Import GameCard
import { searchLocalGamesByNameAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { formatRatingNumber } from '@/lib/utils';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

export function GameRatingSelector() {
  const router = useRouter();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const [localResults, setLocalResults] = useState<BoardGame[]>([]);
  const [isLoadingLocal, startLocalSearchTransition] = useTransition();
  const [localSearchError, setLocalSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (debouncedSearchTerm.length < 2) {
      setLocalResults([]);
      setLocalSearchError(null);
      return;
    }

    setLocalSearchError(null);
    startLocalSearchTransition(async () => {
      const result = await searchLocalGamesByNameAction(debouncedSearchTerm);
      if ('error' in result) {
        setLocalSearchError(result.error);
        toast({ title: "Errore Ricerca Locale", description: result.error, variant: "destructive" });
        setLocalResults([]);
      } else {
        setLocalResults(result);
        if (result.length === 0) {
          // Toast for no results can be annoying if user is still typing, consider removing or making less intrusive
          // toast({ title: "Nessun Gioco Trovato", description: `Nessun gioco trovato nella collezione per "${debouncedSearchTerm}".` });
        }
      }
    });
  }, [debouncedSearchTerm, toast]);


  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="Cerca un gioco per nome..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-lg bg-background py-3 pl-11 pr-4 text-base shadow-sm border border-input focus:ring-2 focus:ring-primary/50 focus:border-primary"
          aria-label="Cerca un gioco da valutare"
        />
      </div>

      {isLoadingLocal && (
        <div className="flex justify-center items-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Ricerca nella collezione locale...</span>
        </div>
      )}

      {localSearchError && !isLoadingLocal && (
        <Alert variant="destructive">
          <Info className="h-4 w-4" />
          <AlertTitle>Errore Ricerca Locale</AlertTitle>
          <AlertDescription>{localSearchError}</AlertDescription>
        </Alert>
      )}

      {!isLoadingLocal && localResults.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-foreground">Giochi Trovati nella Collezione ({localResults.length}):</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {localResults.map((game, index) => (
              <GameCard
                game={game}
                key={game.id}
                variant="featured"
                linkTarget="rate"
                priority={index < 3} // Prioritize loading images for the first few cards
              />
            ))}
          </div>
        </div>
      )}
      
      {!isLoadingLocal && localResults.length === 0 && debouncedSearchTerm.length >= 2 && !localSearchError && (
        <Alert variant="default" className="bg-secondary/30 border-secondary">
            <Info className="h-4 w-4" />
            <AlertTitle>Nessun Gioco Trovato</AlertTitle>
            <AlertDescription>
              Nessun gioco trovato nella collezione locale per "{debouncedSearchTerm}". Un admin può aggiungerlo tramite la sezione Admin.
            </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

