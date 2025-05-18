
'use client';

import { useState, useEffect, useTransition } from 'react';
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

export function GameSearchList({ initialGames }: GameSearchListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [localFilteredGames, setLocalFilteredGames] = useState<BoardGame[]>(initialGames);
  
  const [bggResults, setBggResults] = useState<BggSearchResult[]>([]);
  const [isLoadingBgg, setIsLoadingBgg] = useState(false);
  const [bggError, setBggError] = useState<string | null>(null);
  const [isImportingId, setIsImportingId] = useState<string | null>(null); 
  const [bggSearchAttempted, setBggSearchAttempted] = useState(false);
  
  const [isPendingImport, startImportTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const trimmedSearchTerm = searchTerm.toLowerCase().trim();
    setBggSearchAttempted(false); 

    if (!trimmedSearchTerm) {
      setLocalFilteredGames(initialGames); 
      setBggResults([]); 
      setBggError(null);
      setIsLoadingBgg(false); 
      return;
    }

    const filtered = initialGames.filter(game =>
      game.name.toLowerCase().includes(trimmedSearchTerm)
    );
    setLocalFilteredGames(filtered);

    setBggResults([]);
    setBggError(null);
    setIsLoadingBgg(false);
  }, [searchTerm, initialGames]);


  const handleManualBggSearch = async () => {
    if (!searchTerm.trim()) {
      return; 
    }
    setBggSearchAttempted(true);
    setIsLoadingBgg(true);
    setBggResults([]); 
    setBggError(null);
    const result = await searchBggGamesAction(searchTerm);
    if ('error' in result) {
      setBggError(result.error);
      setBggResults([]);
    } else {
      setBggResults(result);
    }
    setIsLoadingBgg(false);
  };

  const handleImportGame = async (bggId: string) => {
    setIsImportingId(bggId);
    startImportTransition(async () => {
      const result = await importAndRateBggGameAction(bggId);
      if ('error' in result) {
        toast({
          title: 'Errore Importazione Gioco',
          description: result.error,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Gioco Aggiunto!',
          description: 'Il gioco è stato aggiunto alla tua collezione.',
        });
         router.push(`/games/${result.gameId}?imported=true`);
      }
      setIsImportingId(null);
    });
  };

  return (
    <div className="space-y-8">
      <div className="relative max-w-xl mx-auto">
        <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="Cerca tra i tuoi giochi o trovanne di nuovi su BoardGameGeek..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-lg bg-background py-3 pl-11 pr-4 text-base shadow-sm border border-input focus:ring-2 focus:ring-primary/50 focus:border-primary"
          aria-label="Cerca un gioco da tavolo per nome localmente o su BoardGameGeek"
        />
      </div>

      {searchTerm.trim().length > 0 ? (
        <>
          {localFilteredGames.length > 0 ? (
            <section>
              <h3 className="text-xl font-semibold mb-4 text-foreground">
                Giochi Corrispondenti ({localFilteredGames.length})
              </h3>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
                {localFilteredGames.map((game) => (
                  <GameCard key={game.id} game={game} />
                ))}
              </div>
            </section>
          ) : (
            <>
              {isLoadingBgg ? (
                <div className="flex flex-col justify-center items-center py-10">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="mt-3 text-muted-foreground">Ricerca su BoardGameGeek per "{searchTerm}"...</p>
                </div>
              ) : bggError ? (
                <Alert variant="destructive" className="max-w-lg mx-auto">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Errore Ricerca BGG</AlertTitle>
                  <AlertDescription>{bggError}</AlertDescription>
                </Alert>
              ) : bggResults.length > 0 ? (
                <section>
                  <h3 className="text-xl font-semibold mb-4 text-foreground">
                    Risultati da BoardGameGeek ({bggResults.length})
                  </h3>
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
              ) : bggSearchAttempted ? (
                <Alert variant="default" className="max-w-lg mx-auto bg-secondary/30 border-secondary">
                  <Info className="h-4 w-4" />
                  <AlertTitle>Nessun Risultato su BoardGameGeek</AlertTitle>
                  <AlertDescription>Nessun gioco trovato su BoardGameGeek per "{searchTerm}".</AlertDescription>
                </Alert>
              ) : (
                <Alert variant="default" className="max-w-lg mx-auto bg-secondary/30 border-secondary text-center">
                  <Info className="h-4 w-4 mx-auto mb-2 text-muted-foreground" />
                  <AlertTitle className="mb-1 text-foreground">Nessun Gioco Trovato Localmente</AlertTitle>
                  <AlertDescription className="mb-3 text-muted-foreground">
                    Nessun gioco corrispondente a "{searchTerm}" è stato trovato nella tua collezione.
                  </AlertDescription>
                  <Button onClick={handleManualBggSearch} className="bg-primary text-primary-foreground hover:bg-primary/90">
                    <Search className="mr-2 h-4 w-4" /> Cerca su BoardGameGeek
                  </Button>
                </Alert>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {initialGames.length > 0 ? (
            <section>
              <h3 className="text-xl font-semibold mb-4 text-foreground">
                I Tuoi Giochi ({initialGames.length})
              </h3>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
                {initialGames.map((game) => (
                  <GameCard key={game.id} game={game} />
                ))}
              </div>
            </section>
          ) : (
            <Alert variant="default" className="max-w-lg mx-auto bg-secondary/30 border-secondary">
              <Info className="h-4 w-4" />
              <AlertTitle>Nessun Gioco in Collezione</AlertTitle>
              <AlertDescription>La tua collezione è vuota. Prova a cercare su BoardGameGeek per aggiungere nuovi giochi!</AlertDescription>
            </Alert>
          )}
        </>
      )}
    </div>
  );
}
