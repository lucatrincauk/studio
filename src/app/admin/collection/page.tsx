
'use client';

import type { BoardGame } from '@/lib/types';
import { useState, useEffect, useTransition } from 'react';
import { fetchBggUserCollectionAction, getBoardGamesFromFirestoreAction, syncBoardGamesToFirestoreAction } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle, Info, Star } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { CollectionConfirmationDialog } from '@/components/collection/confirmation-dialog';
import { SafeImage } from '@/components/common/SafeImage';
import { Users, Clock, CalendarDays } from 'lucide-react';
import { formatRatingNumber } from '@/lib/utils';


const BGG_USERNAME = 'lctr01'; // Hardcoded for now

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
      setDbCollection(result);
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
  
  const displayedCollection = bggFetchedCollection || dbCollection;
  const displaySource = bggFetchedCollection ? "Collezione BGG Caricata" : "Collezione DB Corrente";

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
      
      <h2 className="text-2xl font-semibold mt-8 mb-4">
        {displaySource} ({displayedCollection.length} giochi)
      </h2>
      {isLoadingDb && !bggFetchedCollection && <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <span className="ml-2">Caricamento collezione DB...</span></div>}
      
      {!isLoadingDb && displayedCollection.length === 0 && !bggFetchedCollection && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Collezione Vuota</AlertTitle>
          <AlertDescription>La tua collezione nel database è vuota. Prova a sincronizzare con BGG per aggiungere giochi.</AlertDescription>
        </Alert>
      )}
      
      {!isLoadingDb && displayedCollection.length === 0 && bggFetchedCollection && !isLoadingBgg && (
         <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Collezione BGG Vuota o Non Trovata</AlertTitle>
          <AlertDescription>Nessun gioco posseduto trovato per l'utente BGG "{BGG_USERNAME}" o si è verificato un problema durante il caricamento.</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {displayedCollection.map(game => (
          <Card key={game.id} className="flex flex-col overflow-hidden shadow-md transition-all duration-300 ease-in-out hover:shadow-lg h-full rounded-lg border border-border">
            <CardHeader className="p-0">
              <div className="relative w-full h-48">
                <SafeImage
                  src={game.coverArtUrl}
                  fallbackSrc={`https://placehold.co/200x300.png?text=${encodeURIComponent(game.name?.substring(0,10) || 'N/A')}`}
                  alt={`${game.name || 'Gioco'} copertina`}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="object-cover rounded-t-lg"
                  data-ai-hint={`board game ${game.name?.split(' ')[0]?.toLowerCase() || 'generic'}`}
                />
              </div>
            </CardHeader>
            <CardContent className="p-3 flex-grow">
              <CardTitle className="text-md font-semibold leading-tight mb-1">{game.name || "Gioco Senza Nome"}</CardTitle>
              <div className="text-xs text-muted-foreground space-y-0.5">
                {game.yearPublished && <div className="flex items-center gap-1"><CalendarDays size={12}/> {game.yearPublished}</div>}
                {(game.minPlayers || game.maxPlayers) && (
                  <div className="flex items-center gap-1"><Users size={12}/> 
                    {game.minPlayers}{game.maxPlayers && game.minPlayers !== game.maxPlayers ? `-${game.maxPlayers}` : ''} Giocatori
                  </div>
                )}
                {game.playingTime && <div className="flex items-center gap-1"><Clock size={12}/> {game.playingTime} min</div>}
              </div>
              {game.overallAverageRating !== null && typeof game.overallAverageRating === 'number' && (
                <div className="mt-2 text-sm font-semibold text-primary flex items-center gap-1">
                  <Star size={14} className="fill-primary text-primary" />
                  Voto Globale: {formatRatingNumber(game.overallAverageRating * 2)}
                </div>
              )}
            </CardContent>
             <CardFooter className="p-3 pt-1">
                <Button variant="link" size="sm" className="p-0 h-auto text-xs" asChild>
                    <a href={`https://boardgamegeek.com/boardgame/${game.bggId}`} target="_blank" rel="noopener noreferrer">Vedi su BGG</a>
                </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

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
