
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import type { BoardGame } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Info, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
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

interface GameSearchListProps {
  initialGames: BoardGame[];
}

type SortableKeys = 'name' | 'overallAverageRating';
interface SortConfig {
  key: SortableKeys;
  direction: 'ascending' | 'descending';
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
  handleNextPage
}: {
  games: BoardGame[],
  sortConfig: SortConfig,
  handleSort: (key: SortableKeys) => void,
  currentPage: number,
  totalPages: number,
  handlePrevPage: () => void,
  handleNextPage: () => void
}) => {

  const SortIcon = ({ columnKey }: { columnKey: SortableKeys }) => {
    if (sortConfig.key !== columnKey) {
      return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground/50" />;
    }
    return sortConfig.direction === 'ascending' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />;
  };

  // No title or section wrapper here anymore, handled by parent
  return (
    <>
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
    </>
  );
}


export function GameSearchList({ initialGames }: GameSearchListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [localFilteredGames, setLocalFilteredGames] = useState<BoardGame[]>(initialGames);

  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'overallAverageRating', direction: 'descending' });
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
    const trimmedSearchTerm = debouncedSearchTerm.toLowerCase().trim();

    if (!trimmedSearchTerm) {
      setLocalFilteredGames([...initialGames]);
      return;
    }

    const filtered = initialGames.filter(game =>
      (game.name || '').toLowerCase().includes(trimmedSearchTerm)
    );
    setLocalFilteredGames(filtered);
  }, [debouncedSearchTerm, initialGames]);

  const handleSort = (key: SortableKeys) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };

  const sortedAndFilteredGames = useMemo(() => {
    let itemsToDisplay = debouncedSearchTerm.trim().length > 0 ? [...localFilteredGames] : [...initialGames];
    itemsToDisplay.sort((a, b) => {
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
    return itemsToDisplay;
  }, [initialGames, localFilteredGames, sortConfig, debouncedSearchTerm]);

  const paginatedGames = useMemo(() => {
    const startIndex = (currentPage - 1) * GAMES_PER_PAGE;
    return sortedAndFilteredGames.slice(startIndex, startIndex + GAMES_PER_PAGE);
  }, [currentPage, sortedAndFilteredGames]);

  const totalPages = Math.ceil(sortedAndFilteredGames.length / GAMES_PER_PAGE);

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const handleSearchInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  }, []);

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold text-foreground">
        Tutti i Giochi ({sortedAndFilteredGames.length})
      </h3>
      <div className="relative max-w-xl mb-4">
        <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="Cerca nei tuoi giochi per nome..."
          value={searchTerm}
          onChange={handleSearchInputChange}
          className="w-full rounded-lg bg-background py-3 pl-11 pr-4 text-base shadow-sm border border-input focus:ring-2 focus:ring-primary/50 focus:border-primary"
          aria-label="Cerca un gioco per nome nella collezione locale"
        />
      </div>

      {initialGames.length === 0 && !searchTerm.trim() ? (
        <Alert variant="default" className="max-w-lg mx-auto bg-secondary/30 border-secondary text-center">
          <Info className="h-4 w-4 mx-auto mb-2 text-muted-foreground" />
          <AlertTitle className="mb-1 text-foreground">Collezione Vuota</AlertTitle>
          <AlertDescription className="mb-3 text-muted-foreground">
              La tua collezione locale è vuota. Puoi aggiungere giochi tramite la sezione Admin.
          </AlertDescription>
        </Alert>
      ) : sortedAndFilteredGames.length === 0 && searchTerm.trim() ? (
        <Alert variant="default" className="max-w-lg mx-auto bg-secondary/30 border-secondary text-center">
            <Info className="h-4 w-4 mx-auto mb-2 text-muted-foreground" />
            <AlertTitle className="mb-1 text-foreground">Nessun Gioco Trovato</AlertTitle>
            <AlertDescription className="mb-3 text-muted-foreground">
             Nessun gioco corrispondente al termine di ricerca "{searchTerm}" è stato trovato nella collezione locale.
            </AlertDescription>
        </Alert>
      ) : (
        <LocalGamesTable
          games={paginatedGames}
          sortConfig={sortConfig}
          handleSort={handleSort}
          currentPage={currentPage}
          totalPages={totalPages}
          handlePrevPage={handlePrevPage}
          handleNextPage={handleNextPage}
        />
      )}
    </div>
  );
}
