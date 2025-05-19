
'use client';

import { useState, useEffect, useMemo, useCallback, useTransition } from 'react';
import Link from 'next/link';
import type { BoardGame } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Info, ArrowUpDown, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
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
import { fetchPaginatedGamesAction, type FetchPaginatedGamesParams } from '@/lib/actions';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';

type SortableKeys = 'name' | 'overallAverageRating';
interface SortConfig {
  key: SortableKeys;
  direction: 'asc' | 'desc';
}

const GAMES_PER_PAGE = 10;

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

const LocalGamesTable = ({
  games,
  sortConfig,
  handleSort,
  currentPage,
  totalPages,
  handlePrevPage,
  handleNextPage,
  isLoading,
  totalGamesCount,
  currentSearchTerm
}: {
  games: BoardGame[],
  sortConfig: SortConfig,
  handleSort: (key: SortableKeys) => void,
  currentPage: number,
  totalPages: number,
  handlePrevPage: () => void,
  handleNextPage: () => void,
  isLoading: boolean;
  totalGamesCount: number;
  currentSearchTerm: string;
}) => {

  const SortIcon = ({ columnKey }: { columnKey: SortableKeys }) => {
    if (sortConfig.key !== columnKey) {
      return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground/50" />;
    }
    return sortConfig.direction === 'asc' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />;
  };
  
  if (isLoading && games.length === 0) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Caricamento giochi...</span>
      </div>
    );
  }

  if (games.length === 0 && !isLoading) {
     return (
        <Alert variant="default" className="max-w-lg mx-auto bg-secondary/30 border-secondary text-center">
            <Info className="h-4 w-4 mx-auto mb-2 text-muted-foreground" />
            <AlertTitle className="mb-1 text-foreground">
              {currentSearchTerm ? "Nessun Gioco Trovato" : "Collezione Vuota"}
            </AlertTitle>
            <AlertDescription className="mb-3 text-muted-foreground">
              {currentSearchTerm 
                ? `Nessun gioco corrispondente alla ricerca "${currentSearchTerm}" è stato trovato nella collezione locale.`
                : "La tua collezione locale è vuota. Gli admin possono aggiungere giochi tramite la sezione Admin."
              }
            </AlertDescription>
        </Alert>
      );
  }

  return (
    <>
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
              <Button onClick={handlePrevPage} disabled={currentPage === 1 || isLoading}>
                Precedente
              </Button>
              <span className="text-sm text-muted-foreground">
                Pagina {currentPage} di {totalPages}
              </span>
              <Button onClick={handleNextPage} disabled={currentPage === totalPages || isLoading}>
                Successiva
              </Button>
            </div>
          )}
        </div>
    </>
  );
}


export function GameSearchList() {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300); 

  const [games, setGames] = useState<BoardGame[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalGames, setTotalGames] = useState(0);
  const [isLoading, startDataFetchTransition] = useTransition();
  
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'name', direction: 'asc' });
  
  const [pageCursors, setPageCursors] = useState<(QueryDocumentSnapshot<DocumentData> | null)[]>([null]);

  // Effect to reset pagination state when search term or sort config changes
  useEffect(() => {
    setCurrentPage(1);
    setPageCursors([null]); 
  }, [debouncedSearchTerm, sortConfig]);

  // Effect to fetch data
  useEffect(() => {
    startDataFetchTransition(async () => {
      const cursorForPageFetch = pageCursors[currentPage - 1] || null;
      
      const params: FetchPaginatedGamesParams = {
        pageParam: cursorForPageFetch,
        limitNum: GAMES_PER_PAGE,
        sortKey: sortConfig.key,
        sortDirection: sortConfig.direction,
        searchTerm: debouncedSearchTerm,
        direction: 'next', 
      };

      const result = await fetchPaginatedGamesAction(params);
      setGames(result.games);
      setTotalGames(result.totalGames);

      if (result.nextPageParam) {
        setPageCursors(prev => {
          const newCursors = [...prev];
          while (newCursors.length <= currentPage) {
            newCursors.push(null);
          }
          if (!newCursors[currentPage] || newCursors[currentPage]?.id !== result.nextPageParam?.id) {
             newCursors[currentPage] = result.nextPageParam;
             return newCursors;
          }
          return prev;
        });
      } else {
         setPageCursors(prev => {
            if (prev.length > currentPage && prev[currentPage] !== null) {
               const newCursors = [...prev];
               newCursors[currentPage] = null;
               return newCursors;
            }
            return prev;
         });
      }
    });
  // Removed pageCursors from dependency array to simplify and potentially avoid loops.
  // The effect will read the latest pageCursors via closure when triggered by other dependencies.
  }, [currentPage, debouncedSearchTerm, sortConfig, startDataFetchTransition]); 


  const handleSort = useCallback((key: SortableKeys) => {
    setSortConfig(prevSortConfig => {
      let direction: 'asc' | 'desc' = 'asc';
      if (prevSortConfig.key === key && prevSortConfig.direction === 'asc') {
        direction = 'desc';
      }
      return { key, direction }; 
    });
  }, []);
  
  const totalPages = totalGames > 0 ? Math.ceil(totalGames / GAMES_PER_PAGE) : 1;

  const handleNextPage = useCallback(() => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  }, [currentPage, totalPages]);

  const handlePrevPage = useCallback(() => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  }, [currentPage]);

  const handleSearchInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  }, []);
  
  const clientSortedGames = useMemo(() => {
    if (sortConfig.key === 'overallAverageRating' && games.length > 0) {
      return [...games].sort((a, b) => {
        const valA = a.overallAverageRating ?? (sortConfig.direction === 'asc' ? Infinity : -Infinity);
        const valB = b.overallAverageRating ?? (sortConfig.direction === 'asc' ? Infinity : -Infinity);
        return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
      });
    }
    return games;
  }, [games, sortConfig]);


  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold text-foreground">
        Tutti i Giochi ({totalGames})
      </h3>
      <div className="relative max-w-xl mb-4">
        <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="Cerca nei giochi per nome..."
          value={searchTerm}
          onChange={handleSearchInputChange}
          className="w-full rounded-lg bg-background py-3 pl-11 pr-4 text-base shadow-sm border border-input focus:ring-2 focus:ring-primary/50 focus:border-primary"
          aria-label="Cerca un gioco per nome nella collezione locale"
        />
      </div>
      <LocalGamesTable
        games={clientSortedGames}
        sortConfig={sortConfig}
        handleSort={handleSort}
        currentPage={currentPage}
        totalPages={totalPages}
        handlePrevPage={handlePrevPage}
        handleNextPage={handleNextPage}
        isLoading={isLoading}
        totalGamesCount={totalGames}
        currentSearchTerm={debouncedSearchTerm}
      />
    </div>
  );
}

