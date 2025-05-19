
'use client';

import { useState, useEffect, useMemo, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BoardGame, BggSearchResult } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Info, Loader2, PlusCircle, ExternalLink, Edit } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SafeImage } from '@/components/common/SafeImage';
import { formatRatingNumber } from '@/lib/utils';
import { searchLocalGamesByNameAction, searchBggGamesAction, getOrCreateGameForRatingAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';

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

  const [bggResults, setBggResults] = useState<BggSearchResult[]>([]);
  const [isLoadingBgg, startBggSearchTransition] = useTransition();
  const [bggSearchError, setBggSearchError] = useState<string | null>(null);
  const [showBggSearchButton, setShowBggSearchButton] = useState(false);

  const [isProcessingGame, setIsProcessingGame] = useState<string | null>(null); // Store BGG ID being processed

  useEffect(() => {
    if (debouncedSearchTerm.length < 2) {
      setLocalResults([]);
      setBggResults([]);
      setShowBggSearchButton(false);
      setLocalSearchError(null);
      setBggSearchError(null);
      return;
    }

    setLocalSearchError(null);
    setBggResults([]); // Clear BGG results when local search term changes
    setShowBggSearchButton(false);

    startLocalSearchTransition(async () => {
      const result = await searchLocalGamesByNameAction(debouncedSearchTerm);
      if ('error' in result) {
        setLocalSearchError(result.error);
        setLocalResults([]);
        setShowBggSearchButton(true); // Offer BGG search even if local search errors out
      } else {
        setLocalResults(result);
        if (result.length === 0) {
          setShowBggSearchButton(true);
        }
      }
    });
  }, [debouncedSearchTerm]);

  const handleSearchBgg = () => {
    if (debouncedSearchTerm.length < 2) {
      setBggSearchError("Inserisci almeno 2 caratteri per cercare su BGG.");
      return;
    }
    setBggSearchError(null);
    setShowBggSearchButton(false); // Hide button once search is initiated

    startBggSearchTransition(async () => {
      const result = await searchBggGamesAction(debouncedSearchTerm);
      if ('error'in result) {
        setBggSearchError(result.error);
        setBggResults([]);
      } else {
        setBggResults(result);
        if (result.length === 0) {
          toast({ title: "Nessun Risultato BGG", description: `Nessun gioco trovato su BGG per "${debouncedSearchTerm}".` });
        }
      }
    });
  };

  const handleRateGame = async (bggId: string) => {
    setIsProcessingGame(bggId);
    const result = await getOrCreateGameForRatingAction(bggId);
    if ('error' in result) {
      toast({ title: "Errore", description: result.error, variant: "destructive" });
      setIsProcessingGame(null);
    } else {
      router.push(`/games/${result.gameId}/rate`);
      // setIsProcessingGame(null); // Navigation will unmount or re-render
    }
  };

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
          <h3 className="text-lg font-semibold">Giochi Trovati nella Collezione:</h3>
          <div className="overflow-x-auto bg-card p-4 rounded-lg shadow-sm border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px] sm:w-[80px]">Copertina</TableHead>
                  <TableHead>Nome Gioco</TableHead>
                  <TableHead className="text-right">Azione</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {localResults.map(game => (
                  <TableRow key={game.id}>
                    <TableCell>
                      <div className="relative w-10 h-14 sm:w-12 sm:h-16 rounded overflow-hidden shadow-sm">
                        <SafeImage
                          src={game.coverArtUrl}
                          fallbackSrc={`https://placehold.co/48x64.png?text=${encodeURIComponent(game.name?.substring(0,3) || 'N/A')}`}
                          alt={`${game.name || 'Gioco'} copertina`}
                          fill
                          sizes="(max-width: 640px) 40px, 48px"
                          className="object-cover"
                          data-ai-hint="board game mini"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {game.name || "Gioco Senza Nome"}
                      {game.yearPublished && ` (${game.yearPublished})`}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button onClick={() => router.push(`/games/${game.id}/rate`)} size="sm">
                        <Edit className="mr-2 h-4 w-4" /> Valuta
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {showBggSearchButton && !isLoadingLocal && debouncedSearchTerm.length >= 2 && (
        <div className="text-center py-4">
          <p className="text-muted-foreground mb-3">
            Nessun gioco trovato nella collezione locale per "{debouncedSearchTerm}".
          </p>
          <Button onClick={handleSearchBgg} disabled={isLoadingBgg} className="bg-secondary hover:bg-secondary/90 text-secondary-foreground">
            {isLoadingBgg ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" /> }
            Cerca su BoardGameGeek
          </Button>
        </div>
      )}

      {isLoadingBgg && (
        <div className="flex justify-center items-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Ricerca su BoardGameGeek...</span>
        </div>
      )}

      {bggSearchError && !isLoadingBgg && (
         <Alert variant="destructive">
          <Info className="h-4 w-4" />
          <AlertTitle>Errore Ricerca BGG</AlertTitle>
          <AlertDescription>{bggSearchError}</AlertDescription>
        </Alert>
      )}

      {!isLoadingBgg && bggResults.length > 0 && (
         <div className="space-y-3 mt-6">
          <h3 className="text-lg font-semibold">Risultati da BoardGameGeek:</h3>
           <div className="overflow-x-auto bg-card p-4 rounded-lg shadow-sm border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome Gioco (BGG)</TableHead>
                  <TableHead className="text-right">Azione</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bggResults.map(game => (
                  <TableRow key={game.bggId}>
                    <TableCell>
                      {game.name}
                      {game.yearPublished && ` (${game.yearPublished})`}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                       <Button
                          onClick={() => handleRateGame(game.bggId)}
                          disabled={isProcessingGame === game.bggId}
                          size="sm"
                        >
                          {(isProcessingGame === game.bggId) ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Edit className="mr-2 h-4 w-4" />
                          )}
                          Valuta Questo
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <a href={`https://boardgamegeek.com/boardgame/${game.bggId}`} target="_blank" rel="noopener noreferrer">
                              Vedi su BGG <ExternalLink className="ml-2 h-3 w-3" />
                          </a>
                        </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
