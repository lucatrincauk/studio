
'use client';

import { useState, useEffect, useMemo, useTransition } from 'react'; // Added useTransition here
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { BoardGame, BggSearchResult } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2, AlertCircle, Info, ExternalLink, PlusCircle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { searchBggGamesAction, importAndRateBggGameAction } from '@/lib/actions';
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

type SortableKeys = 'name' | 'overallAverageRating';
interface SortConfig {
  key: SortableKeys;
  direction: 'ascending' | 'descending';
}

const GAMES_PER_PAGE = 10;

export function GameSearchList({ initialGames }: GameSearchListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [localFilteredGames, setLocalFilteredGames] = useState<BoardGame[]>(initialGames);
  const [bggResults, setBggResults] = useState<BggSearchResult[]>([]);
  const [isBggSearching, startBggSearchTransition] = useTransition();
  const [isImportingGameId, setIsImportingGameId] = useState<string | null>(null);
  const [isPendingImport, startImportTransition] = useTransition();
  const [bggSearchError, setBggSearchError] = useState<string | null>(null);
  const [bggSearchAttempted, setBggSearchAttempted] = useState(false);
  
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'overallAverageRating', direction: 'descending' });
  const [currentPage, setCurrentPage] = useState(1);
  
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    setCurrentPage(1); // Reset to first page on new search
    const trimmedSearchTerm = searchTerm.toLowerCase().trim();
    setBggSearchAttempted(false); // Reset BGG search attempt flag
    setBggResults([]); // Clear previous BGG results

    if (!trimmedSearchTerm) {
      setLocalFilteredGames(initialGames); 
      return;
    }

    const filtered = initialGames.filter(game =>
      (game.name || '').toLowerCase().includes(trimmedSearchTerm)
    );
    setLocalFilteredGames(filtered);
  }, [searchTerm, initialGames]);

  const handleSort = (key: SortableKeys) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1); // Reset to first page on sort change
  };

  const sortedInitialGames = useMemo(() => {
    let items = [...initialGames];
    items.sort((a, b) => {
      if (sortConfig.key === 'name') {
        const nameA = a.name || '';
        const nameB = b.name || '';
        return sortConfig.direction === 'ascending' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      } else if (sortConfig.key === 'overallAverageRating') {
        const ratingA = a.overallAverageRating === null || a.overallAverageRating === undefined ? (sortConfig.direction === 'ascending' ? Infinity : -Infinity) : a.overallAverageRating;
        const ratingB = b.overallAverageRating === null || b.overallAverageRating === undefined ? (sortConfig.direction === 'ascending' ? Infinity : -Infinity) : b.overallAverageRating;
        return sortConfig.direction === 'ascending' ? ratingA - ratingB : ratingB - ratingA;
      }
      return 0;
    });
    return items;
  }, [initialGames, sortConfig]);

  const sortedLocalFilteredGames = useMemo(() => {
    let items = [...localFilteredGames];
    items.sort((a, b) => {
      if (sortConfig.key === 'name') {
        const nameA = a.name || '';
        const nameB = b.name || '';
        return sortConfig.direction === 'ascending' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      } else if (sortConfig.key === 'overallAverageRating') {
        const ratingA = a.overallAverageRating === null || a.overallAverageRating === undefined ? (sortConfig.direction === 'ascending' ? Infinity : -Infinity) : a.overallAverageRating;
        const ratingB = b.overallAverageRating === null || b.overallAverageRating === undefined ? (sortConfig.direction === 'ascending' ? Infinity : -Infinity) : b.overallAverageRating;
        return sortConfig.direction === 'ascending' ? ratingA - ratingB : ratingB - ratingA;
      }
      return 0;
    });
    return items;
  }, [localFilteredGames, sortConfig]);

  const gamesToDisplayInTable = searchTerm.trim().length > 0 ? sortedLocalFilteredGames : sortedInitialGames;
  
  const totalPages = Math.ceil(gamesToDisplayInTable.length / GAMES_PER_PAGE);
  const paginatedGames = useMemo(() => {
    const startIndex = (currentPage - 1) * GAMES_PER_PAGE;
    return gamesToDisplayInTable.slice(startIndex, startIndex + GAMES_PER_PAGE);
  }, [currentPage, gamesToDisplayInTable]);

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const handleManualBggSearch = () => {
    if (!searchTerm.trim()) {
      setBggSearchError("Inserisci un termine di ricerca.");
      return;
    }
    setBggSearchError(null);
    setBggResults([]);
    setBggSearchAttempted(true);
    startBggSearchTransition(async () => {
      const result = await searchBggGamesAction(searchTerm);
      if ('error'in result) {
        setBggSearchError(result.error);
        toast({ title: 'Errore Ricerca BGG', description: result.error, variant: 'destructive' });
      } else {
        setBggResults(result);
        if (result.length === 0) {
          toast({ title: 'Nessun Risultato su BGG', description: `Nessun gioco trovato su BGG per "${searchTerm}".` });
        }
      }
    });
  };

  const handleImportGame = async (bggId: string) => {
    setIsImportingGameId(bggId);
    startImportTransition(async () => {
      const result = await importAndRateBggGameAction(bggId);
      setIsImportingGameId(null);
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
        router.push(`/games/${result.gameId}/rate`);
      }
    });
  };

  const SortIcon = ({ columnKey }: { columnKey: SortableKeys }) => {
    if (sortConfig.key !== columnKey) {
      return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground/50" />;
    }
    return sortConfig.direction === 'ascending' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />;
  };

  const LocalGamesTable = ({ games, totalGamesCount, title }: { games: BoardGame[], totalGamesCount: number, title: string }) => (
    <section>
      <h3 className="text-xl font-semibold mb-4 text-foreground">
        {title} ({totalGamesCount})
      </h3>
      {games.length === 0 && searchTerm.trim().length > 0 && !bggSearchAttempted && (
         <Alert variant="default" className="max-w-lg mx-auto bg-secondary/30 border-secondary text-center">
            <Info className="h-4 w-4 mx-auto mb-2 text-muted-foreground" />
            <AlertTitle className="mb-1 text-foreground">Nessun Gioco Trovato Localmente</AlertTitle>
            <AlertDescription className="mb-3 text-muted-foreground">
            Nessun gioco corrispondente a "{searchTerm}" è stato trovato nella tua collezione.
            </AlertDescription>
            <Button onClick={handleManualBggSearch} disabled={isBggSearching}>
                {isBggSearching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                Cerca su BoardGameGeek
            </Button>
        </Alert>
      )}
      {games.length > 0 && (
        <div className="overflow-x-auto bg-card p-4 rounded-lg shadow-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px] sm:w-[80px]">Copertina</TableHead>
                <TableHead>
                  <Button variant="ghost" onClick={() => handleSort('name')} className="px-1">
                    Nome
                    <SortIcon columnKey="name" />
                  </Button>
                </TableHead>
                <TableHead className="text-center">
                  <Button variant="ghost" onClick={() => handleSort('overallAverageRating')} className="px-1">
                    Voto Medio
                    <SortIcon columnKey="overallAverageRating" />
                  </Button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {games.map(game => (
                <TableRow key={game.id}>
                  <TableCell>
                    <Link href={`/games/${game.id}`} className="block">
                      <div className="relative w-12 h-16 sm:w-16 sm:h-20 rounded overflow-hidden shadow-sm hover:opacity-80 transition-opacity">
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
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/games/${game.id}`} className="hover:text-primary hover:underline">
                      {game.name || "Gioco Senza Nome"}
                      {game.yearPublished && ` (${game.yearPublished})`}
                    </Link>
                  </TableCell>
                  <TableCell className="text-center">
                    <Link href={`/games/${game.id}`} className="hover:text-primary hover:underline">
                    {game.overallAverageRating !== null && typeof game.overallAverageRating === 'number' ? (
                        <span className="font-semibold text-primary">{formatRatingNumber(game.overallAverageRating * 2)}</span>
                    ) : (
                        <span className="text-muted-foreground">-</span>
                    )}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <Button onClick={handlePrevPage} disabled={currentPage === 1}>
                Precedente
              </Button>
              <span className="text-sm text-muted-foreground">
                Pagina {currentPage} di {totalPages}
              </span>
              <Button onClick={handleNextPage} disabled={currentPage === totalPages}>
                Successiva
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-8">
      <div className="relative max-w-xl mx-auto">
        <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="Cerca tra i tuoi giochi..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-lg bg-background py-3 pl-11 pr-4 text-base shadow-sm border border-input focus:ring-2 focus:ring-primary/50 focus:border-primary"
          aria-label="Cerca un gioco da tavolo per nome nella collezione locale"
        />
      </div>

      {(!searchTerm.trim() || localFilteredGames.length > 0) && (
        <LocalGamesTable games={paginatedGames} totalGamesCount={gamesToDisplayInTable.length} title="I Tuoi Giochi" />
      )}

      {searchTerm.trim().length > 0 && localFilteredGames.length === 0 && !bggSearchAttempted && (
         <Alert variant="default" className="max-w-lg mx-auto bg-secondary/30 border-secondary text-center">
            <Info className="h-4 w-4 mx-auto mb-2 text-muted-foreground" />
            <AlertTitle className="mb-1 text-foreground">Nessun Gioco Trovato Localmente</AlertTitle>
            <AlertDescription className="mb-3 text-muted-foreground">
                Nessun gioco corrispondente a "{searchTerm}" è stato trovato nella tua collezione.
            </AlertDescription>
            <Button onClick={handleManualBggSearch} disabled={isBggSearching}>
                {isBggSearching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                Cerca su BoardGameGeek
            </Button>
        </Alert>
      )}

      {bggSearchAttempted && bggSearchError && (
        <Alert variant="destructive" className="max-w-lg mx-auto">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Errore Ricerca BGG</AlertTitle>
          <AlertDescription>{bggSearchError}</AlertDescription>
        </Alert>
      )}

      {bggSearchAttempted && !bggSearchError && bggResults.length > 0 && (
        <section>
          <h3 className="text-xl font-semibold mb-4 text-foreground">Risultati da BoardGameGeek ({bggResults.length})</h3>
          <div className="overflow-x-auto bg-card p-4 rounded-lg shadow-md border border-border">
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
                        onClick={() => handleImportGame(game.bggId)}
                        disabled={isPendingImport && isImportingGameId === game.bggId}
                        size="sm"
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        {(isPendingImport && isImportingGameId === game.bggId) ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <PlusCircle className="mr-2 h-4 w-4" />
                        )}
                        Aggiungi e Valuta
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
        </section>
      )}
      {bggSearchAttempted && !bggSearchError && bggResults.length === 0 && !isBggSearching && (
        <Alert variant="default" className="max-w-lg mx-auto bg-secondary/30 border-secondary">
          <Info className="h-4 w-4" />
          <AlertTitle>Nessun Risultato su BGG</AlertTitle>
          <AlertDescription>Nessun gioco trovato su BoardGameGeek per "{searchTerm}".</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

