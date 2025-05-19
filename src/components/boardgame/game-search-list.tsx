
'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { BoardGame, BggSearchResult } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2, AlertCircle, Info, ExternalLink, PlusCircle } from 'lucide-react';
import { searchBggGamesAction, importAndRateBggGameAction } from '@/lib/actions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
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
         router.push(`/games/${result.gameId}/rate`); // Go to rate page after import
      }
      setIsImportingId(null);
    });
  };

  const LocalGamesTable = ({ games, title }: { games: BoardGame[], title: string }) => (
    <section>
      <h3 className="text-xl font-semibold mb-4 text-foreground">
        {title} ({games.length})
      </h3>
      <div className="overflow-x-auto bg-card p-4 rounded-lg shadow-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px] sm:w-[80px]">Copertina</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead className="hidden sm:table-cell text-center">Anno</TableHead>
              <TableHead className="hidden md:table-cell text-center">Giocatori</TableHead>
              <TableHead className="hidden md:table-cell text-center">Durata</TableHead>
              <TableHead className="text-center">Voto Medio</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {games.map(game => (
              <TableRow key={game.id}>
                <TableCell>
                  <div className="relative w-12 h-16 sm:w-16 sm:h-20 rounded overflow-hidden shadow-sm">
                    <SafeImage
                      src={game.coverArtUrl}
                      fallbackSrc={`https://placehold.co/64x80.png?text=${encodeURIComponent(game.name?.substring(0,3) || 'N/A')}`}
                      alt={`${game.name || 'Gioco'} copertina`}
                      fill
                      sizes="(max-width: 640px) 48px, 64px"
                      className="object-cover"
                      data-ai-hint={`board game ${game.name?.split(' ')[0]?.toLowerCase() || 'mini'}`}
                    />
                  </div>
                </TableCell>
                <TableCell className="font-medium">
                  <Link href={`/games/${game.id}`} className="hover:text-primary hover:underline">
                    {game.name || "Gioco Senza Nome"}
                  </Link>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-center">{game.yearPublished || '-'}</TableCell>
                <TableCell className="hidden md:table-cell text-center">
                  {game.minPlayers}{game.maxPlayers && game.minPlayers !== game.maxPlayers ? `-${game.maxPlayers}` : ''}
                </TableCell>
                <TableCell className="hidden md:table-cell text-center">{game.playingTime ? `${game.playingTime} min` : '-'}</TableCell>
                <TableCell className="text-center">
                  {game.overallAverageRating !== null && typeof game.overallAverageRating === 'number' ? (
                    <span className="font-semibold text-primary">{formatRatingNumber(game.overallAverageRating * 2)}</span>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/games/${game.id}`}>Vedi Dettagli</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );

  const BggResultsTable = ({ results }: { results: BggSearchResult[] }) => (
    <section>
      <h3 className="text-xl font-semibold mb-4 text-foreground">
        Risultati da BoardGameGeek ({results.length})
      </h3>
      <div className="overflow-x-auto bg-card p-4 rounded-lg shadow-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="text-center">Anno</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map(result => (
              <TableRow key={result.bggId}>
                <TableCell className="font-medium">{result.name}</TableCell>
                <TableCell className="text-center">{result.yearPublished || '-'}</TableCell>
                <TableCell className="text-right space-x-2">
                  <Button
                    onClick={() => handleImportGame(result.bggId)}
                    disabled={isPendingImport && isImportingId === result.bggId}
                    size="sm"
                    className="bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    {(isPendingImport && isImportingId === result.bggId) ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <PlusCircle className="mr-2 h-4 w-4" />
                    )}
                    Aggiungi e Valuta
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                  >
                    <a 
                        href={`https://boardgamegeek.com/boardgame/${result.bggId}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                    >
                        Vedi su BGG <ExternalLink className="ml-2 h-3 w-3" />
                    </a>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );


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
            <LocalGamesTable games={localFilteredGames} title="Giochi Corrispondenti nella Tua Collezione" />
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
                <BggResultsTable results={bggResults} />
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
             <LocalGamesTable games={initialGames} title="I Tuoi Giochi" />
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

