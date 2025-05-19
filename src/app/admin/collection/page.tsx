
'use client';

import type { BoardGame } from '@/lib/types';
import { useState, useEffect, useTransition, useMemo } from 'react';
import { fetchBggUserCollectionAction, getBoardGamesFromFirestoreAction, syncBoardGamesToFirestoreAction } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle, Info, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { CollectionConfirmationDialog } from '@/components/collection/confirmation-dialog';
import { SafeImage } from '@/components/common/SafeImage';
import { formatRatingNumber } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const BGG_USERNAME = 'lctr01'; // Hardcoded for now

type SortableKeys = 'name' | 'overallAverageRating';
interface SortConfig {
  key: SortableKeys;
  direction: 'ascending' | 'descending';
}

// Helper function to compare game arrays based on their IDs
function areGameArraysEqual(arr1: BoardGame[], arr2: BoardGame[]): boolean {
  if (arr1.length !== arr2.length) return false;
  const ids1 = arr1.map(g => g.id).sort();
  const ids2 = arr2.map(g => g.id).sort();
  return ids1.every((id, index) => id === ids2[index]);
}

export default function AdminCollectionPage() {
  const [dbCollection, setDbCollection] = useState<BoardGame[]>([]);
  const [bggFetchedCollection, setBggFetchedCollection] = useState<BoardGame[] | null>(null);
  
  const [gamesToAdd, setGamesToAdd] = useState<BoardGame[]>([]);
  const [gamesToRemove, setGamesToRemove] = useState<BoardGame[]>([]);
  
  const [isLoadingDb, setIsLoadingDb] = useState(true);
  const [isLoadingBgg, startBggFetchTransition] = useTransition();
  const [isSyncingDb, startDbSyncTransition] = useTransition();
  
  const [error, setError] = useState<string | null>(null);
  const [showConfirmationDialog, setShowConfirmationDialog] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'name', direction: 'ascending' });

  const { toast } = useToast();

  const loadDbCollection = async () => {
    setIsLoadingDb(true);
    setError(null);
    const result = await getBoardGamesFromFirestoreAction();
    if ('error' in result) {
      setError(result.error);
      setDbCollection([]);
      toast({ title: 'Errore Caricamento DB', description: result.error, variant: 'destructive'});
    } else {
      setDbCollection(result); // Initial sort will be applied by useMemo
    }
    setIsLoadingDb(false);
  };

  useEffect(() => {
    loadDbCollection();
  }, []);

  useEffect(() => {
    let newGamesToAdd: BoardGame[] = [];
    let newGamesToRemove: BoardGame[] = [];

    if (bggFetchedCollection) {
      const bggGameIds = new Set(bggFetchedCollection.map(g => g.id));
      const dbGameIds = new Set(dbCollection.map(g => g.id));

      newGamesToAdd = bggFetchedCollection.filter(g => !dbGameIds.has(g.id));
      newGamesToRemove = dbCollection.filter(g => !bggGameIds.has(g.id));
    }

    if (!areGameArraysEqual(newGamesToAdd, gamesToAdd)) {
      setGamesToAdd(newGamesToAdd);
    }
    if (!areGameArraysEqual(newGamesToRemove, gamesToRemove)) {
      setGamesToRemove(newGamesToRemove);
    }
  }, [bggFetchedCollection, dbCollection, gamesToAdd, gamesToRemove]);


  const handleFetchBggCollection = () => {
    setError(null);
    setBggFetchedCollection(null); 
    startBggFetchTransition(async () => {
      const result = await fetchBggUserCollectionAction(BGG_USERNAME);
      if ('error' in result) {
        setError(result.error);
        toast({ title: 'Errore Sincronizzazione BGG', description: result.error, variant: 'destructive' });
        setBggFetchedCollection([]); 
      } else {
        setBggFetchedCollection(result); // Initial sort will be applied by useMemo
        toast({ title: 'Collezione BGG Caricata', description: `Trovati ${result.length} giochi posseduti per ${BGG_USERNAME}. Controlla le modifiche in sospeso qui sotto.` });
      }
    });
  };

  const handleSyncToDb = () => {
    if (gamesToAdd.length === 0 && gamesToRemove.length === 0) {
      toast({ title: 'Nessuna Modifica', description: 'La tua collezione locale è già sincronizzata con i dati BGG.' });
      return;
    }
    setShowConfirmationDialog(true);
  };

  const confirmSyncToDb = () => {
    setShowConfirmationDialog(false);
    setError(null);
    startDbSyncTransition(async () => {
      const result = await syncBoardGamesToFirestoreAction(gamesToAdd, gamesToRemove);
      if (result.success) {
        toast({ title: 'Sincronizzazione Riuscita', description: result.message });
        await loadDbCollection(); 
        setBggFetchedCollection(null); 
      } else {
        setError(result.error || 'Sincronizzazione database fallita.');
        toast({ title: 'Errore Sincronizzazione', description: result.error || 'Si è verificato un errore sconosciuto.', variant: 'destructive' });
      }
    });
  };

  const handleSort = (key: SortableKeys) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  const sortedDisplayedCollection = useMemo(() => {
    let itemsToDisplay = [...(bggFetchedCollection || dbCollection)];
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
  }, [bggFetchedCollection, dbCollection, sortConfig]);
  
  const displaySource = bggFetchedCollection ? "Collezione BGG Caricata" : "Collezione DB Corrente";

  const SortIcon = ({ columnKey }: { columnKey: SortableKeys }) => {
    if (sortConfig.key !== columnKey) {
      return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground/50" />;
    }
    return sortConfig.direction === 'ascending' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />;
  };


  return (
    <div className="space-y-8">
      <Card className="shadow-lg border border-border rounded-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Gestione Collezione Giochi (Admin)</CardTitle>
          <CardDescription>Gestisci la collezione di giochi da tavolo sincronizzandola con BoardGameGeek e Firebase.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <Button onClick={handleFetchBggCollection} disabled={isLoadingBgg} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground">
              {isLoadingBgg ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sincronizza con BGG (Utente: {BGG_USERNAME})
            </Button>
            <Button 
              onClick={handleSyncToDb} 
              disabled={isSyncingDb || isLoadingBgg || (gamesToAdd.length === 0 && gamesToRemove.length === 0 && bggFetchedCollection !== null) }
              className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              {isSyncingDb ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salva Modifiche nel DB
            </Button>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Errore</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {(gamesToAdd.length > 0 || gamesToRemove.length > 0) && bggFetchedCollection !== null && (
        <Card className="border-blue-500 bg-blue-500/10 shadow-md">
          <CardHeader>
            <CardTitle className="text-xl text-blue-700">Modifiche in Sospeso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {gamesToAdd.length > 0 && (
              <div>
                <h4 className="font-semibold text-green-700">Giochi da Aggiungere/Aggiornare ({gamesToAdd.length}):</h4>
                <ul className="list-disc list-inside pl-2 max-h-32 overflow-y-auto">
                  {gamesToAdd.map(g => <li key={g.id}>{g.name}</li>)}
                </ul>
              </div>
            )}
            {gamesToRemove.length > 0 && (
              <div>
                <h4 className="font-semibold text-red-700">Giochi da Rimuovere ({gamesToRemove.length}):</h4>
                <ul className="list-disc list-inside pl-2 max-h-32 overflow-y-auto">
                  {gamesToRemove.map(g => <li key={g.id}>{g.name}</li>)}
                </ul>
              </div>
            )}
            <Alert variant="default" className="bg-secondary/30 border-secondary">
                <Info className="h-4 w-4 text-secondary-foreground" />
                <AlertDescription className="text-secondary-foreground">
                  Premi "Salva Modifiche nel DB" per applicare queste modifiche.
                </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}
      
      <Card className="shadow-lg border border-border rounded-lg">
        <CardHeader>
            <CardTitle className="text-2xl">
            {displaySource} ({sortedDisplayedCollection.length} giochi)
            </CardTitle>
        </CardHeader>
        <CardContent>
        {isLoadingDb && !bggFetchedCollection && <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <span className="ml-2">Caricamento collezione DB...</span></div>}
        
        {!isLoadingDb && sortedDisplayedCollection.length === 0 && !bggFetchedCollection && (
            <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Collezione Vuota</AlertTitle>
            <AlertDescription>La tua collezione nel database è vuota. Prova a sincronizzare con BGG per aggiungere giochi.</AlertDescription>
            </Alert>
        )}
        
        {!isLoadingDb && sortedDisplayedCollection.length === 0 && bggFetchedCollection && !isLoadingBgg && (
            <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Collezione BGG Vuota o Non Trovata</AlertTitle>
            <AlertDescription>Nessun gioco posseduto trovato per l'utente BGG "{BGG_USERNAME}" o si è verificato un problema durante il caricamento.</AlertDescription>
            </Alert>
        )}

        {sortedDisplayedCollection.length > 0 && (
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead className="w-[80px]">Copertina</TableHead>
                        <TableHead>
                          <Button variant="ghost" onClick={() => handleSort('name')} className="px-1">
                            Nome
                            <SortIcon columnKey="name" />
                          </Button>
                        </TableHead>
                        <TableHead className="hidden md:table-cell text-center">Giocatori</TableHead>
                        <TableHead className="hidden md:table-cell text-center">Durata</TableHead>
                        <TableHead className="text-center">
                           <Button variant="ghost" onClick={() => handleSort('overallAverageRating')} className="px-1">
                            Voto
                            <SortIcon columnKey="overallAverageRating" />
                          </Button>
                        </TableHead>
                        <TableHead className="text-right">BGG</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {sortedDisplayedCollection.map(game => (
                        <TableRow key={game.id}>
                        <TableCell>
                            <div className="relative w-12 h-16 sm:w-16 sm:h-20 rounded overflow-hidden">
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
                            {game.name || "Gioco Senza Nome"}
                            {game.yearPublished && ` (${game.yearPublished})`}
                        </TableCell>
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
                            <Button variant="outline" size="icon" asChild className="h-8 w-8">
                                <a href={`https://boardgamegeek.com/boardgame/${game.bggId}`} target="_blank" rel="noopener noreferrer" title="Vedi su BGG">
                                    <ExternalLink className="h-4 w-4" />
                                </a>
                            </Button>
                        </TableCell>
                        </TableRow>
                    ))}
                    </TableBody>
                </Table>
            </div>
        )}
        </CardContent>
      </Card>

      <CollectionConfirmationDialog
        isOpen={showConfirmationDialog}
        onClose={() => setShowConfirmationDialog(false)}
        onConfirm={confirmSyncToDb}
        gamesToAdd={gamesToAdd}
        gamesToRemove={gamesToRemove}
        isSyncing={isSyncingDb}
      />
    </div>
  );
}
