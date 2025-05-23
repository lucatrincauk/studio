
'use client';

import type { BoardGame, BggSearchResult, BggPlayDetail } from '@/lib/types';
import { useState, useEffect, useTransition, useMemo, useCallback } from 'react';
import {
  fetchBggUserCollectionAction,
  getBoardGamesFromFirestoreAction,
  searchBggGamesAction,
  importAndRateBggGameAction,
  fetchAndUpdateBggGameDetailsAction,
  batchUpdateMissingBggDetailsAction,
  revalidateGameDataAction,
  fetchAllUserPlaysFromBggAction,
  fetchUserPlaysForGameFromBggAction
} from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle, Info, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, Pin, PinOff, Search as SearchIcon, PlusCircle, DownloadCloud, DatabaseZap, Filter, Dices } from 'lucide-react';
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
import { db } from '@/lib/firebase';
import { doc, updateDoc, getDoc, writeBatch, collection, type DocumentData } from 'firebase/firestore'; 
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';


const BGG_USERNAME = 'lctr01'; 
const FIRESTORE_COLLECTION_NAME = 'boardgames_collection'; 

type SortableKeys = 'name' | 'overallAverageRating' | 'isPinned';
interface SortConfig {
  key: SortableKeys;
  direction: 'ascending' | 'descending';
}

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
  const [isBggFetching, startBggFetchTransition] = useTransition();
  const [isDbSyncing, startDbSyncTransition] = useTransition();
  const [isPinToggling, startPinToggleTransition] = useTransition();
  
  const [error, setError] = useState<string | null>(null);
  const [showConfirmationDialog, setShowConfirmationDialog] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'isPinned', direction: 'descending' });

  const [bggSearchTerm, setBggSearchTerm] = useState('');
  const [bggSearchResults, setBggSearchResults] = useState<BggSearchResult[]>([]);
  const [isBggSearching, startBggSearchTransition] = useTransition();
  const [bggSearchError, setBggSearchError] = useState<string | null>(null);
  const [isImportingGameId, setIsImportingGameId] = useState<string | null>(null);
  const [isPendingImport, startImportTransition] = useTransition();

  const [isFetchingDetailsFor, setIsFetchingDetailsFor] = useState<string | null>(null);
  const [isPendingBggDetailsFetch, startBggDetailsFetchTransition] = useTransition();

  const [isBatchUpdating, startBatchUpdateTransition] = useTransition();
  const [showOnlyMissingDetails, setShowOnlyMissingDetails] = useState(false);

  const [isSyncingAllPlays, startSyncAllPlaysTransition] = useTransition();
  const [playsPageToFetch, setPlaysPageToFetch] = useState(1);


  const { toast } = useToast();

  const loadDbCollection = useCallback(async () => {
    setIsLoadingDb(true);
    setError(null);
    const result = await getBoardGamesFromFirestoreAction();
    if ('error' in result) {
      setError(result.error);
      setDbCollection([]);
      toast({ title: 'Errore Caricamento DB', description: result.error, variant: 'destructive'});
    } else {
      setDbCollection(result);
    }
    setIsLoadingDb(false);
  }, [toast]);

  useEffect(() => {
    loadDbCollection();
  }, [loadDbCollection]);

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
        setBggFetchedCollection(result); 
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
      const batch = writeBatch(db);
      let operationsCount = 0;

      try {
        // Prepare games to add/update
        for (const game of gamesToAdd) {
          if (!game.id) {
            console.error("Gioco da aggiungere senza ID:", game);
            continue;
          }
          const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
          let existingData: Partial<BoardGame> = {};
          try {
            const docSnap = await getDoc(gameRef);
            if (docSnap.exists()) {
              const data = docSnap.data() as DocumentData;
              existingData = {
                isPinned: data.isPinned || false,
                minPlaytime: data.minPlaytime ?? null,
                maxPlaytime: data.maxPlaytime ?? null,
                averageWeight: data.averageWeight ?? null,
                categories: data.categories ?? [],
                mechanics: data.mechanics ?? [],
                designers: data.designers ?? [],
                overallAverageRating: data.overallAverageRating ?? null,
                voteCount: data.voteCount ?? 0,
                favoritedByUserIds: data.favoritedByUserIds ?? [],
                favoriteCount: data.favoriteCount ?? 0,
                playlistedByUserIds: data.playlistedByUserIds ?? [],
                morchiaByUserIds: data.morchiaByUserIds ?? [],
                morchiaCount: data.morchiaCount ?? 0,
                lctr01Plays: data.lctr01Plays === undefined ? null : data.lctr01Plays,
              };
            }
          } catch (getDocError) {
            // It's fine if the doc doesn't exist, existingData remains empty
            console.warn(`Could not fetch existing data for ${game.id} during sync, proceeding with defaults:`, getDocError);
          }

          const gameDataForFirestore: Partial<BoardGame> = {
            bggId: game.bggId,
            name: game.name || "Unknown Name",
            coverArtUrl: game.coverArtUrl || `https://placehold.co/100x150.png?text=N/A`,
            yearPublished: game.yearPublished ?? null,
            minPlayers: game.minPlayers ?? null,
            maxPlayers: game.maxPlayers ?? null,
            playingTime: game.playingTime ?? null,
            minPlaytime: game.minPlaytime ?? existingData?.minPlaytime ?? game.playingTime ?? null,
            maxPlaytime: game.maxPlaytime ?? existingData?.maxPlaytime ?? game.playingTime ?? null,
            averageWeight: game.averageWeight ?? existingData?.averageWeight ?? null,
            categories: game.categories && game.categories.length > 0 ? game.categories : existingData?.categories ?? [],
            mechanics: game.mechanics && game.mechanics.length > 0 ? game.mechanics : existingData?.mechanics ?? [],
            designers: game.designers && game.designers.length > 0 ? game.designers : existingData?.designers ?? [],
            isPinned: existingData?.isPinned || game.isPinned || false,
            overallAverageRating: existingData?.overallAverageRating === undefined ? null : existingData.overallAverageRating,
            voteCount: existingData?.voteCount === undefined ? 0 : existingData.voteCount,
            favoritedByUserIds: existingData?.favoritedByUserIds ?? [],
            favoriteCount: existingData?.favoriteCount ?? 0,
            playlistedByUserIds: existingData?.playlistedByUserIds ?? [],
            morchiaByUserIds: existingData?.morchiaByUserIds ?? [],
            morchiaCount: existingData?.morchiaCount ?? 0,
            lctr01Plays: game.lctr01Plays === undefined ? (existingData?.lctr01Plays === undefined ? null : existingData.lctr01Plays) : game.lctr01Plays,
          };
          batch.set(gameRef, gameDataForFirestore, { merge: true });
          operationsCount++;
        }

        // Prepare games to remove
        gamesToRemove.forEach(game => {
          if (!game.id) {
            console.error("Gioco da rimuovere senza ID:", game);
            return;
          }
          const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
          batch.delete(gameRef);
          operationsCount++;
        });

        if (operationsCount > 0) {
          await batch.commit();
        }

        toast({ title: 'Sincronizzazione Riuscita', description: `Sincronizzazione completata. ${gamesToAdd.length} giochi aggiunti/aggiornati, ${gamesToRemove.length} giochi rimossi.` });
        await loadDbCollection();
        await revalidateGameDataAction();
        setBggFetchedCollection(null); // Reset BGG fetched data
        setGamesToAdd([]);
        setGamesToRemove([]);

      } catch (batchError) {
        const errorMessage = batchError instanceof Error ? batchError.message : 'Errore sconosciuto durante il batch write.';
        setError(`Sincronizzazione database fallita: ${errorMessage}`);
        toast({ title: 'Errore Sincronizzazione DB', description: errorMessage, variant: 'destructive' });
      }
    });
  };

  const handleTogglePin = async (gameId: string, currentPinStatus: boolean) => {
    startPinToggleTransition(async () => {
      try {
        const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, gameId);
        await updateDoc(gameRef, {
          isPinned: !currentPinStatus
        });
        toast({ title: 'Stato Pin Aggiornato', description: `Lo stato pin per il gioco è stato ${currentPinStatus ? 'rimosso' : 'aggiunto'}.`});
        await revalidateGameDataAction(gameId); 
        await loadDbCollection();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Errore sconosciuto";
        toast({ title: 'Errore Aggiornamento Pin', description: `Impossibile aggiornare lo stato pin: ${errorMessage}`, variant: 'destructive'});
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
    let itemsToDisplay = bggFetchedCollection ? [...bggFetchedCollection] : [...dbCollection];

    if (showOnlyMissingDetails && !bggFetchedCollection) {
      itemsToDisplay = itemsToDisplay.filter(game => 
        game.minPlaytime == null || 
        game.maxPlaytime == null || 
        game.averageWeight == null ||
        game.yearPublished == null ||
        game.minPlayers == null ||
        game.maxPlayers == null ||
        game.playingTime == null ||
        (game.categories == null || game.categories.length === 0) ||
        (game.mechanics == null || game.mechanics.length === 0) ||
        (game.designers == null || game.designers.length === 0) ||
        (game.name?.startsWith("BGG Gioco ID") || game.name?.startsWith("BGG ID") || game.name === "Name Not Found in Details") ||
        (game.coverArtUrl?.includes("placehold.co")) ||
        (game.coverArtUrl?.includes("_thumb") && game.coverArtUrl?.includes("cf.geekdo-images.com"))
      );
    }

    itemsToDisplay.sort((a, b) => {
      if (sortConfig.key === 'name') {
        const nameA = a.name || '';
        const nameB = b.name || '';
        return sortConfig.direction === 'ascending' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      } else if (sortConfig.key === 'overallAverageRating') {
        const ratingA = a.overallAverageRating === null || a.overallAverageRating === undefined ? (sortConfig.direction === 'ascending' ? Infinity : -Infinity) : a.overallAverageRating;
        const ratingB = b.overallAverageRating === null || b.overallAverageRating === undefined ? (sortConfig.direction === 'ascending' ? Infinity : -Infinity) : b.overallAverageRating;
        return sortConfig.direction === 'ascending' ? ratingA - ratingB : ratingB - ratingA;
      } else if (sortConfig.key === 'isPinned') {
        const pinnedA = a.isPinned ? 1 : 0;
        const pinnedB = b.isPinned ? 1 : 0;
        return sortConfig.direction === 'descending' ? pinnedB - pinnedA : pinnedA - pinnedB;
      }
      return 0;
    });
    return itemsToDisplay;
  }, [bggFetchedCollection, dbCollection, sortConfig, showOnlyMissingDetails]);
  
  const displaySource = bggFetchedCollection ? "Collezione BGG Caricata" : "Collezione DB Corrente";

  const SortIcon = ({ columnKey }: { columnKey: SortableKeys }) => {
    if (sortConfig.key !== columnKey) {
      return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground/50" />;
    }
    return sortConfig.direction === 'ascending' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />;
  };

  const handleBggGameSearch = () => {
    if (!bggSearchTerm.trim()) {
      setBggSearchError("Inserisci un termine di ricerca.");
      return;
    }
    setBggSearchError(null);
    setBggSearchResults([]);
    startBggSearchTransition(async () => {
      const result = await searchBggGamesAction(bggSearchTerm);
      if ('error' in result) {
        setBggSearchError(result.error);
        toast({ title: 'Errore Ricerca BGG', description: result.error, variant: 'destructive' });
      } else {
        setBggSearchResults(result);
        if (result.length === 0) {
          toast({ title: 'Nessun Risultato', description: `Nessun gioco trovato su BGG per "${bggSearchTerm}".` });
        }
      }
    });
  };

  const handleImportGameFromBgg = (bggId: string) => {
    setIsImportingGameId(bggId);
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
        await loadDbCollection(); 
      }
      setIsImportingGameId(null);
    });
  };

  const handleFetchGameDetailsAndPlaysFromBgg = async (firestoreGameId: string, bggId: number, gameName: string) => {
    setIsFetchingDetailsFor(firestoreGameId);
    startBggDetailsFetchTransition(async () => {
      let detailsUpdated = false;
      let playsUpdated = false;
      let gameDetailsError: string | null = null;
      let playsError: string | null = null;

      const bggFetchResult = await fetchAndUpdateBggGameDetailsAction(bggId);
      if (bggFetchResult.success && bggFetchResult.updateData && Object.keys(bggFetchResult.updateData).length > 0) {
        try {
          const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, firestoreGameId);
          await updateDoc(gameRef, bggFetchResult.updateData);
          detailsUpdated = true;
        } catch (dbError) {
          gameDetailsError = dbError instanceof Error ? dbError.message : "Errore DB aggiornando dettagli gioco.";
        }
      } else if (!bggFetchResult.success) {
        gameDetailsError = bggFetchResult.error || 'Impossibile recuperare dettagli da BGG.';
      }

      const playsFetchResult = await fetchUserPlaysForGameFromBggAction(bggId, BGG_USERNAME);
      if (playsFetchResult.success && playsFetchResult.plays && playsFetchResult.plays.length > 0) {
          const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, firestoreGameId);
          const batch = writeBatch(db);
          const playsSubcollectionRef = collection(db, FIRESTORE_COLLECTION_NAME, firestoreGameId, `plays_${BGG_USERNAME.toLowerCase()}`);
          
          playsFetchResult.plays.forEach(play => {
              const playDocRef = doc(playsSubcollectionRef, play.playId);
              const playDataForFirestore: BggPlayDetail = {
                  ...play,
                  userId: BGG_USERNAME, 
                  gameBggId: bggId,
              };
              batch.set(playDocRef, playDataForFirestore, { merge: true });
          });
          
          batch.update(gameRef, { lctr01Plays: playsFetchResult.plays.length });

          try {
              await batch.commit();
              playsUpdated = true;
          } catch (dbError) {
              playsError = dbError instanceof Error ? dbError.message : "Errore DB salvando partite.";
          }
      } else if (!playsFetchResult.success) {
          playsError = playsFetchResult.error || 'Impossibile recuperare partite da BGG.';
      } else if (playsFetchResult.plays && playsFetchResult.plays.length === 0) {
          try {
            const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, firestoreGameId);
            await updateDoc(gameRef, { lctr01Plays: 0 });
          } catch (dbError) {
             // silent error if updating to 0 fails
          }
      }


      if (detailsUpdated && playsUpdated) {
        toast({ title: 'Dati Aggiornati!', description: `Dettagli e ${playsFetchResult.plays?.length || 0} partite per ${gameName} aggiornati/sincronizzati.` });
      } else if (detailsUpdated) {
        toast({ title: 'Dettagli Aggiornati', description: `Dettagli per ${gameName} aggiornati. ${playsError ? `Errore partite: ${playsError}` : 'Nessuna nuova partita trovata per lctr01.'}` });
      } else if (playsUpdated) {
        toast({ title: 'Partite Sincronizzate', description: `${playsFetchResult.plays?.length || 0} partite per ${gameName} sincronizzate per lctr01. ${gameDetailsError ? `Errore dettagli: ${gameDetailsError}` : 'Nessun nuovo dettaglio gioco da BGG.'}` });
      } else {
        let combinedError = '';
        if (gameDetailsError) combinedError += `Errore dettagli: ${gameDetailsError}. `;
        if (playsError) combinedError += `Errore partite: ${playsError}.`;
        if (!combinedError && !gameDetailsError && !playsError) {
          toast({ title: 'Nessun Aggiornamento', description: `Nessun nuovo dettaglio o partita da BGG per ${gameName}.` });
        } else {
          toast({ title: 'Operazione Fallita', description: combinedError || 'Si è verificato un errore sconosciuto.', variant: 'destructive' });
        }
      }

      if (detailsUpdated || playsUpdated) {
        await revalidateGameDataAction(firestoreGameId);
        await loadDbCollection();
      }
      setIsFetchingDetailsFor(null);
    });
  };

  const handleBatchUpdateMissingDetails = () => {
    startBatchUpdateTransition(async () => {
      const result = await batchUpdateMissingBggDetailsAction();
      if (result.success && result.gamesToUpdateClientSide) {
        if (result.gamesToUpdateClientSide.length > 0) {
          const batch = writeBatch(db);
          result.gamesToUpdateClientSide.forEach(item => {
            const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, item.gameId);
            batch.update(gameRef, item.updateData);
          });
          try {
            await batch.commit();
            toast({ title: 'Aggiornamento Batch Completato', description: `${result.gamesToUpdateClientSide.length} giochi aggiornati con successo. ${result.message.replace(`${result.gamesToUpdateClientSide.length} giochi pronti per l'aggiornamento client-side.`, '')}` });
            
            for (const item of result.gamesToUpdateClientSide) {
                await revalidateGameDataAction(item.gameId);
            }
            await loadDbCollection();
          } catch (dbError) {
            const errorMessage = dbError instanceof Error ? dbError.message : "Errore sconosciuto durante l'aggiornamento batch del DB.";
            toast({ title: 'Errore Aggiornamento Batch DB', description: errorMessage, variant: 'destructive' });
          }
        } else {
           toast({ title: 'Aggiornamento Batch', description: result.message });
        }
      } else if (!result.success) {
        toast({ title: 'Errore Aggiornamento Batch', description: result.error || result.message || 'Si è verificato un errore sconosciuto.', variant: 'destructive' });
      } else {
         toast({ title: 'Aggiornamento Batch', description: result.message || 'Nessun gioco da aggiornare o operazione completata.' });
      }
    });
  };

  const handleSyncAllLctr01Plays = () => {
    if (playsPageToFetch < 1) {
      toast({ title: "Pagina Non Valida", description: "Il numero di pagina deve essere almeno 1.", variant: "destructive" });
      return;
    }
    startSyncAllPlaysTransition(async () => {
        const serverActionResult = await fetchAllUserPlaysFromBggAction(BGG_USERNAME, playsPageToFetch);

        if (!serverActionResult.success || !serverActionResult.plays) {
            toast({ title: 'Errore Sincronizzazione Partite', description: serverActionResult.error || serverActionResult.message || 'Impossibile caricare le partite da BGG.', variant: 'destructive' });
            return;
        }

        if (serverActionResult.plays.length === 0) {
            toast({ title: 'Nessuna Nuova Partita', description: serverActionResult.message || `Nessuna partita trovata da sincronizzare per ${BGG_USERNAME} (pagina ${playsPageToFetch}).` });
            return;
        }

        const batch = writeBatch(db);
        let playsToSyncCount = 0;
        const gameIdsToUpdatePlayCount = new Map<string, number>();

        for (const play of serverActionResult.plays) {
            const gameInDb = dbCollection.find(g => g.bggId === play.gameBggId);
            if (gameInDb) {
                const playDocRef = doc(db, FIRESTORE_COLLECTION_NAME, gameInDb.id, `plays_${BGG_USERNAME.toLowerCase()}`, play.playId);
                const playDataForFirestore: BggPlayDetail = {
                    ...play,
                    userId: BGG_USERNAME, 
                };
                batch.set(playDocRef, playDataForFirestore, { merge: true });
                playsToSyncCount++;
                gameIdsToUpdatePlayCount.set(gameInDb.id, (gameIdsToUpdatePlayCount.get(gameInDb.id) || 0) + play.quantity);
            }
        }
        
        if (playsToSyncCount > 0) {
            try {
                await batch.commit();
                toast({ title: 'Sincronizzazione Partite Completata', description: `${playsToSyncCount} partite sincronizzate per ${BGG_USERNAME} (da pagina ${playsPageToFetch}). ${serverActionResult.message || ''}` });
                
                await revalidateGameDataAction(); 
                await loadDbCollection(); 
            } catch (dbError) {
                const errorMessage = dbError instanceof Error ? dbError.message : "Errore sconosciuto durante il salvataggio batch delle partite nel DB.";
                toast({ title: 'Errore Salvataggio Batch Partite DB', description: errorMessage, variant: 'destructive' });
            }
        } else {
            toast({ title: 'Nessuna Partita da Salvare', description: `Nessuna delle ${serverActionResult.plays.length} partite caricate da BGG (pagina ${playsPageToFetch}) corrisponde a giochi nella collezione locale, o si è verificato un errore.` });
        }
    });
  };


  return (
    <div className="space-y-8">
      <Card className="shadow-lg border border-border rounded-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Gestione Collezione Giochi (Admin)</CardTitle>
          <CardDescription>Gestisci la collezione di giochi da tavolo sincronizzandola con BoardGameGeek e Firebase. Puoi anche fissare i giochi per la sezione "Vetrina" della homepage e aggiornare i dettagli dei giochi da BGG.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Button onClick={handleFetchBggCollection} disabled={isBggFetching} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              {isBggFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sincronizza con BGG ({BGG_USERNAME})
            </Button>
            <Button 
              onClick={handleSyncToDb} 
              disabled={isDbSyncing || isBggFetching || (gamesToAdd.length === 0 && gamesToRemove.length === 0 && bggFetchedCollection !== null) }
              className="bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              {isDbSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salva Modifiche nel DB (da BGG)
            </Button>
             <Button 
              onClick={handleBatchUpdateMissingDetails} 
              disabled={isBatchUpdating}
              className="bg-secondary hover:bg-secondary/90 text-secondary-foreground"
            >
              {isBatchUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DatabaseZap className="mr-2 h-4 w-4" />}
              Arricchisci Dati Mancanti
            </Button>
          </div>
          <div className="flex items-center gap-2 pt-4 border-t">
            <Input 
                type="number"
                value={playsPageToFetch}
                onChange={(e) => setPlaysPageToFetch(Math.max(1, parseInt(e.target.value,10) || 1))}
                min="1"
                className="w-20 h-9 text-sm"
                aria-label="Numero pagina per sincronizzazione partite"
            />
            <Button 
              onClick={handleSyncAllLctr01Plays} 
              disabled={isSyncingAllPlays}
              className="bg-blue-600 hover:bg-blue-700 text-white h-9 text-sm"
            >
              {isSyncingAllPlays ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Dices className="mr-2 h-4 w-4" />}
              Sinc. Partite Pag. {playsPageToFetch}
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
            <CardTitle className="text-xl text-blue-700">Modifiche in Sospeso (da {BGG_USERNAME})</CardTitle>
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

      <Separator />

      <Card className="shadow-lg border border-border rounded-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Aggiungi Gioco da BoardGameGeek</CardTitle>
          <CardDescription>Cerca un gioco su BGG e aggiungilo alla collezione locale.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input 
              type="search"
              placeholder="Cerca nome gioco su BGG..."
              value={bggSearchTerm}
              onChange={(e) => setBggSearchTerm(e.target.value)}
              className="flex-grow"
            />
            <Button onClick={handleBggGameSearch} disabled={isBggSearching}>
              {isBggSearching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SearchIcon className="mr-2 h-4 w-4" />}
              Cerca BGG
            </Button>
          </div>
          {bggSearchError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Errore Ricerca BGG</AlertTitle>
              <AlertDescription>{bggSearchError}</AlertDescription>
            </Alert>
          )}
          {bggSearchResults.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome Gioco (BGG)</TableHead>
                    <TableHead className="text-right">Azione</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bggSearchResults.map(game => (
                    <TableRow key={game.bggId}>
                      <TableCell>
                        {game.name}
                        {game.yearPublished && ` (${game.yearPublished})`}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                         <Button
                            onClick={() => handleImportGameFromBgg(game.bggId)}
                            disabled={isPendingImport && isImportingGameId === game.bggId}
                            size="sm"
                            className="bg-primary text-primary-foreground hover:bg-primary/90"
                          >
                            {(isPendingImport && isImportingGameId === game.bggId) ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <PlusCircle className="mr-2 h-4 w-4" />
                            )}
                            Aggiungi alla Collezione
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
          )}
           {bggSearchResults.length === 0 && bggSearchTerm && !isBggSearching && !bggSearchError && (
             <Alert variant="default" className="bg-secondary/30 border-secondary">
                <Info className="h-4 w-4" />
                <AlertTitle>Nessun Risultato</AlertTitle>
                <AlertDescription>Nessun gioco trovato su BGG per "{bggSearchTerm}". Prova con un termine diverso.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
      
      <Separator />

      <Card className="shadow-lg border border-border rounded-lg">
        <CardHeader>
            <div className="flex justify-between items-center">
                <CardTitle className="text-2xl">
                {displaySource} ({sortedDisplayedCollection.length} giochi)
                </CardTitle>
                {!bggFetchedCollection && (
                <div className="flex items-center space-x-2">
                    <Checkbox
                    id="missing-details-filter"
                    checked={showOnlyMissingDetails}
                    onCheckedChange={(checked) => setShowOnlyMissingDetails(checked as boolean)}
                    />
                    <Label htmlFor="missing-details-filter" className="text-sm font-medium">
                    Mostra solo con dettagli mancanti
                    </Label>
                </div>
                )}
            </div>
        </CardHeader>
        <CardContent>
        {isLoadingDb && !bggFetchedCollection && <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <span className="ml-2">Caricamento collezione DB...</span></div>}
        
        {!isLoadingDb && sortedDisplayedCollection.length === 0 && !bggFetchedCollection && (
             <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Collezione Vuota o Filtri Attivi</AlertTitle>
                <AlertDescription>
                {showOnlyMissingDetails
                    ? "Nessun gioco con dettagli mancanti trovato."
                    : "La tua collezione nel database è vuota. Prova a sincronizzare con BGG per aggiungere giochi, o aggiungi giochi individualmente dalla ricerca BGG qui sopra."}
                </AlertDescription>
            </Alert>
        )}
        
        {!isLoadingDb && sortedDisplayedCollection.length === 0 && bggFetchedCollection && !isBggFetching && (
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
                        <TableHead className="text-center">
                           <Button variant="ghost" onClick={() => handleSort('isPinned')} className="px-1">
                            Vetrina
                            <SortIcon columnKey="isPinned" />
                          </Button>
                        </TableHead>
                        <TableHead className="text-right">Azioni</TableHead>
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
                            <Link href={`/games/${game.id}`} className="hover:text-primary hover:underline">
                                {game.name || "Gioco Senza Nome"}
                                {game.yearPublished && ` (${game.yearPublished})`}
                            </Link>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-center">
                            {game.minPlayers}{game.maxPlayers && game.minPlayers !== game.maxPlayers ? `-${game.maxPlayers}` : ''}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-center">{game.playingTime ? `${game.playingTime} min` : '-'}</TableCell>
                        <TableCell className="text-center">
                            {game.overallAverageRating !== null && typeof game.overallAverageRating === 'number' ? (
                            <span className="font-semibold text-primary">{formatRatingNumber(game.overallAverageRating)}</span>
                            ) : (
                            '-'
                            )}
                        </TableCell>
                        <TableCell className="text-center">
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => game.id && handleTogglePin(game.id, game.isPinned || false)}
                                disabled={isPinToggling || !game.id}
                                title={game.isPinned ? "Rimuovi da Vetrina" : "Aggiungi a Vetrina"}
                                className={`h-8 w-8 hover:bg-accent/20 ${game.isPinned ? 'text-accent' : 'text-muted-foreground/60 hover:text-accent'}`}
                            >
                                {isPinToggling && isFetchingDetailsFor !== game.id && <Loader2 className="h-4 w-4 animate-spin" />}
                                {!isPinToggling && (game.isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />)}
                            </Button>
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                            <Button 
                                variant="outline" 
                                size="icon" 
                                onClick={() => game.id && game.bggId && handleFetchGameDetailsAndPlaysFromBgg(game.id, game.bggId, game.name || 'questo gioco')}
                                disabled={(isPendingBggDetailsFetch && isFetchingDetailsFor === game.id) || !game.id || !game.bggId}
                                title="Aggiorna Dettagli e Partite da BGG"
                                className="h-8 w-8"
                            >
                                {(isPendingBggDetailsFetch && isFetchingDetailsFor === game.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
                            </Button>
                            <Button variant="outline" size="icon" asChild className="h-8 w-8" disabled={!game.bggId}>
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
        isSyncing={isDbSyncing}
      />
    </div>
  );
}

    