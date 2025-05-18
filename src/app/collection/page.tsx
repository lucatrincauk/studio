
'use client';

import type { BoardGame } from '@/lib/types';
import { useState, useEffect, useTransition } from 'react';
import { fetchBggUserCollectionAction, getBoardGamesFromFirestoreAction, syncBoardGamesToFirestoreAction, testServerAction } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
// import { GameCard } from '@/components/boardgame/game-card'; // Re-using for display
import { Loader2, AlertCircle, CheckCircle, Users, Clock, CalendarDays, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { CollectionConfirmationDialog } from '@/components/collection/confirmation-dialog';
import Image from 'next/image';

const BGG_USERNAME = 'lctr01'; // Hardcoded for now

export default function CollectionPage() {
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
      toast({ title: 'DB Load Error', description: result.error, variant: 'destructive'});
    } else {
      setDbCollection(result);
    }
    setIsLoadingDb(false);
  };

  useEffect(() => {
    loadDbCollection();
  }, []);

  useEffect(() => {
    if (bggFetchedCollection) {
      const bggGameIds = new Set(bggFetchedCollection.map(g => g.id));
      const dbGameIds = new Set(dbCollection.map(g => g.id));

      const toAdd = bggFetchedCollection.filter(g => !dbGameIds.has(g.id));
      const toRemove = dbCollection.filter(g => !bggGameIds.has(g.id));
      
      setGamesToAdd(toAdd);
      setGamesToRemove(toRemove);
    } else {
      setGamesToAdd([]);
      setGamesToRemove([]);
    }
  }, [bggFetchedCollection, dbCollection]);

  const handleFetchBggCollection = () => {
    console.log('[CLIENT] handleFetchBggCollection called');
    setError(null);
    setBggFetchedCollection(null); // Clear previous BGG fetch
    startBggFetchTransition(async () => {
      console.log('[CLIENT] Attempting to call testServerAction...');
      try {
        const testResult = await testServerAction("Hello from CollectionPage!");
        console.log('[CLIENT] testServerAction result:', testResult);
      } catch (e) {
        console.error('[CLIENT] testServerAction error:', e);
      }

      console.log('[CLIENT] Attempting to call fetchBggUserCollectionAction with username:', BGG_USERNAME);
      const result = await fetchBggUserCollectionAction(BGG_USERNAME);
      if ('error' in result) {
        setError(result.error);
        toast({ title: 'BGG Fetch Error', description: result.error, variant: 'destructive' });
        setBggFetchedCollection([]); // Ensure it's an empty array on error to clear diff
      } else {
        setBggFetchedCollection(result);
        toast({ title: 'BGG Collection Fetched', description: `Found ${result.length} owned games for ${BGG_USERNAME}. Check pending changes below.` });
      }
    });
  };

  const handleSyncToDb = () => {
    if (gamesToAdd.length === 0 && gamesToRemove.length === 0) {
      toast({ title: 'No Changes', description: 'Your local collection is already in sync with the fetched BGG data.' });
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
        toast({ title: 'Sync Successful', description: result.message });
        await loadDbCollection(); // Refresh DB collection
        setBggFetchedCollection(null); // Clear BGG data and pending changes
      } else {
        setError(result.error || 'Database sync failed.');
        toast({ title: 'Sync Error', description: result.error || 'An unknown error occurred.', variant: 'destructive' });
      }
    });
  };
  
  const displayedCollection = bggFetchedCollection || dbCollection;
  const displaySource = bggFetchedCollection ? "Fetched BGG Collection" : "Current DB Collection";

  return (
    <div className="space-y-8">
      <Card className="shadow-lg border border-border rounded-lg">
        <CardHeader>
          <CardTitle className="text-2xl">My Game Collection</CardTitle>
          <CardDescription>Manage your board game collection by syncing with BoardGameGeek and Firebase.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <Button onClick={handleFetchBggCollection} disabled={isLoadingBgg} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground">
              {isLoadingBgg ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sync with BGG (User: {BGG_USERNAME})
            </Button>
            <Button 
              onClick={handleSyncToDb} 
              disabled={isSyncingDb || isLoadingBgg || (gamesToAdd.length === 0 && gamesToRemove.length === 0 && bggFetchedCollection !== null) }
              className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              {isSyncingDb ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sync Changes to DB
            </Button>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {(gamesToAdd.length > 0 || gamesToRemove.length > 0) && bggFetchedCollection !== null && (
        <Card className="border-blue-500 bg-blue-500/10 shadow-md">
          <CardHeader>
            <CardTitle className="text-xl text-blue-700">Pending Changes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {gamesToAdd.length > 0 && (
              <div>
                <h4 className="font-semibold text-green-700">Games to Add/Update ({gamesToAdd.length}):</h4>
                <ul className="list-disc list-inside pl-2 max-h-32 overflow-y-auto">
                  {gamesToAdd.map(g => <li key={g.id}>{g.name}</li>)}
                </ul>
              </div>
            )}
            {gamesToRemove.length > 0 && (
              <div>
                <h4 className="font-semibold text-red-700">Games to Remove ({gamesToRemove.length}):</h4>
                <ul className="list-disc list-inside pl-2 max-h-32 overflow-y-auto">
                  {gamesToRemove.map(g => <li key={g.id}>{g.name}</li>)}
                </ul>
              </div>
            )}
            <Alert variant="default" className="bg-secondary/30 border-secondary">
                <Info className="h-4 w-4 text-secondary-foreground" />
                <AlertDescription className="text-secondary-foreground">
                  Press "Sync Changes to DB" to apply these modifications.
                </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}
      
      <h2 className="text-2xl font-semibold mt-8 mb-4">
        {displaySource} ({displayedCollection.length} games)
      </h2>
      {isLoadingDb && !bggFetchedCollection && <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <span className="ml-2">Loading DB collection...</span></div>}
      
      {!isLoadingDb && displayedCollection.length === 0 && !bggFetchedCollection && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Empty Collection</AlertTitle>
          <AlertDescription>Your database collection is empty. Try syncing with BGG to add games.</AlertDescription>
        </Alert>
      )}
      
      {!isLoadingDb && displayedCollection.length === 0 && bggFetchedCollection && !isLoadingBgg && (
         <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>BGG Collection Empty or Not Found</AlertTitle>
          <AlertDescription>No owned games found for BGG user "{BGG_USERNAME}" or there was an issue fetching.</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {displayedCollection.map(game => (
          <Card key={game.id} className="flex flex-col overflow-hidden shadow-md transition-all duration-300 ease-in-out hover:shadow-lg h-full rounded-lg border border-border">
            <CardHeader className="p-0">
              <div className="relative w-full h-48">
                <Image
                  src={game.coverArtUrl || `https://placehold.co/200x300.png?text=${encodeURIComponent(game.name?.substring(0,10) || 'N/A')}`}
                  alt={`${game.name || 'Game'} cover art`}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="object-cover rounded-t-lg"
                  data-ai-hint={`board game ${game.name?.split(' ')[0]?.toLowerCase() || 'generic'}`}
                  onError={(e) => { e.currentTarget.src = `https://placehold.co/200x300.png?text=${encodeURIComponent(game.name?.substring(0,10) || 'N/A')}`; }}
                />
              </div>
            </CardHeader>
            <CardContent className="p-3 flex-grow">
              <CardTitle className="text-md font-semibold leading-tight mb-1">{game.name || "Unnamed Game"}</CardTitle>
              <div className="text-xs text-muted-foreground space-y-0.5">
                {game.yearPublished && <div className="flex items-center gap-1"><CalendarDays size={12}/> {game.yearPublished}</div>}
                {(game.minPlayers || game.maxPlayers) && (
                  <div className="flex items-center gap-1"><Users size={12}/> 
                    {game.minPlayers}{game.maxPlayers && game.minPlayers !== game.maxPlayers ? `-${game.maxPlayers}` : ''} Players
                  </div>
                )}
                {game.playingTime && <div className="flex items-center gap-1"><Clock size={12}/> {game.playingTime} min</div>}
              </div>
            </CardContent>
             <CardFooter className="p-3 pt-1">
                <Button variant="link" size="sm" className="p-0 h-auto text-xs" asChild>
                    <a href={`https://boardgamegeek.com/boardgame/${game.bggId}`} target="_blank" rel="noopener noreferrer">View on BGG</a>
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


    