
'use client';

import { useState, useEffect, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { BoardGame, BggSearchResult } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2, AlertCircle, Info, ExternalLink, PlusCircle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
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

type SortableKeys = 'name' | 'overallAverageRating';
interface SortConfig {
  key: SortableKeys;
  direction: 'ascending' | 'descending';
}

export function GameSearchList({ initialGames }: GameSearchListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [localFilteredGames, setLocalFilteredGames] = useState<BoardGame[]>(initialGames);
  
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'overallAverageRating', direction: 'descending' });
  
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const trimmedSearchTerm = searchTerm.toLowerCase().trim();

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


  const SortIcon = ({ columnKey }: { columnKey: SortableKeys }) => {
    if (sortConfig.key !== columnKey) {
      return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground/50" />;
    }
    return sortConfig.direction === 'ascending' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />;
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
                  {game.overallAverageRating !== null && typeof game.overallAverageRating === 'number' ? (
                    <Link href={`/games/${game.id}`} className="hover:text-primary hover:underline">
                      <span className="font-semibold text-primary">{formatRatingNumber(game.overallAverageRating * 2)}</span>
                    </Link>
                  ) : (
                    <Link href={`/games/${game.id}`} className="hover:text-primary hover:underline">
                      <span className="text-muted-foreground">-</span>
                    </Link>
                  )}
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
          placeholder="Cerca tra i tuoi giochi..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-lg bg-background py-3 pl-11 pr-4 text-base shadow-sm border border-input focus:ring-2 focus:ring-primary/50 focus:border-primary"
          aria-label="Cerca un gioco da tavolo per nome nella collezione locale"
        />
      </div>

      {searchTerm.trim().length > 0 ? (
        <>
          {sortedLocalFilteredGames.length > 0 ? (
            <LocalGamesTable games={sortedLocalFilteredGames} title="Giochi Corrispondenti nella Tua Collezione" />
          ) : (
            <Alert variant="default" className="max-w-lg mx-auto bg-secondary/30 border-secondary text-center">
              <Info className="h-4 w-4 mx-auto mb-2 text-muted-foreground" />
              <AlertTitle className="mb-1 text-foreground">Nessun Gioco Trovato</AlertTitle>
              <AlertDescription className="mb-3 text-muted-foreground">
                Nessun gioco corrispondente a "{searchTerm}" è stato trovato nella tua collezione.
              </AlertDescription>
            </Alert>
          )}
        </>
      ) : (
        <>
          {sortedInitialGames.length > 0 ? (
             <LocalGamesTable games={sortedInitialGames} title="I Tuoi Giochi" />
          ) : (
            <Alert variant="default" className="max-w-lg mx-auto bg-secondary/30 border-secondary">
              <Info className="h-4 w-4" />
              <AlertTitle>Nessun Gioco in Collezione</AlertTitle>
              <AlertDescription>La tua collezione è vuota. Puoi aggiungerne tramite la sezione Admin.</AlertDescription>
            </Alert>
          )}
        </>
      )}
    </div>
  );
}
