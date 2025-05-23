
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { getPlaylistedGamesForUserAction } from '@/lib/actions';
import type { BoardGame } from '@/lib/types';
import { GameCard } from '@/components/boardgame/game-card';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, AlertCircle, ListPlus, Info } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function PlaylistPage() {
  const { user: currentUser, loading: authLoading } = useAuth();
  const [playlistedGames, setPlaylistedGames] = useState<BoardGame[]>([]);
  const [isLoadingGames, setIsLoadingGames] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser && !authLoading) {
      const fetchPlaylist = async () => {
        setIsLoadingGames(true);
        setError(null);
        try {
          const result = await getPlaylistedGamesForUserAction(currentUser.uid);
          if ('error' in result) {
            setError(result.error);
            setPlaylistedGames([]);
          } else {
            setPlaylistedGames(result);
          }
        } catch (e) {
          setError("Impossibile caricare la playlist.");
          setPlaylistedGames([]);
        } finally {
          setIsLoadingGames(false);
        }
      };
      fetchPlaylist();
    } else if (!authLoading) {
      // User not logged in or auth still loading
      setIsLoadingGames(false);
      setPlaylistedGames([]);
    }
  }, [currentUser, authLoading]);

  if (authLoading || isLoadingGames) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">Caricamento playlist...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-10">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Accesso Richiesto</h2>
        <p className="text-muted-foreground mb-6">
          Devi essere loggato per visualizzare la tua playlist.
        </p>
        <Button asChild>
          <Link href="/signin?redirect=/playlist">
             Accedi per Visualizzare
          </Link>
        </Button>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-md mx-auto my-10">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Errore nel Caricamento</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      <Card className="shadow-lg border border-border rounded-lg">
        <CardHeader>
          <CardTitle className="text-2xl sm:text-3xl flex items-center gap-3">
            <ListPlus className="h-7 w-7 text-primary" />
            La Mia Playlist
          </CardTitle>
          <CardDescription>
            Giochi che hai aggiunto alla tua playlist per giocarci in futuro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {playlistedGames.length === 0 ? (
            <Alert variant="default" className="bg-secondary/30 border-secondary">
              <Info className="h-4 w-4" />
              <AlertTitle>Playlist Vuota</AlertTitle>
              <AlertDescription>
                Non hai ancora aggiunto giochi alla tua playlist. Esplora il <Link href="/all-games" className="font-semibold underline hover:text-primary">catalogo</Link> e aggiungi quelli che ti incuriosiscono!
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {playlistedGames.map((game, index) => (
                <GameCard
                  game={game}
                  key={game.id}
                  variant="featured"
                  priority={index < 10} // Prioritize loading images for the first few games
                  linkTarget="detail"
                  showOverlayText={true}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
