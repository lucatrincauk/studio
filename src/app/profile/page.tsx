
'use client';

import type { BoardGame } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';
import { UpdateProfileForm } from '@/components/profile/update-profile-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle, Heart, ListChecks } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ThemeSwitcher } from '@/components/profile/theme-switcher'; 
import { Separator } from '@/components/ui/separator';
import { useState, useEffect } from 'react';
import { getFavoritedGamesForUserAction, getWishlistedGamesForUserAction } from '@/lib/actions';
import { GameCard } from '@/components/boardgame/game-card';

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const [favoritedGames, setFavoritedGames] = useState<BoardGame[]>([]);
  const [wishlistedGames, setWishlistedGames] = useState<BoardGame[]>([]);
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(false);
  const [isLoadingWishlist, setIsLoadingWishlist] = useState(false);

  useEffect(() => {
    if (user && !authLoading) {
      const fetchUserLists = async () => {
        setIsLoadingFavorites(true);
        setIsLoadingWishlist(true);
        try {
          const favResult = await getFavoritedGamesForUserAction(user.uid);
          setFavoritedGames(favResult);
        } catch (e) {
          console.error("Failed to fetch favorited games:", e);
          setFavoritedGames([]);
        } finally {
          setIsLoadingFavorites(false);
        }

        try {
          const wishResult = await getWishlistedGamesForUserAction(user.uid);
          setWishlistedGames(wishResult);
        } catch (e) {
          console.error("Failed to fetch wishlisted games:", e);
          setWishlistedGames([]);
        } finally {
          setIsLoadingWishlist(false);
        }
      };
      fetchUserLists();
    } else {
      setFavoritedGames([]);
      setWishlistedGames([]);
    }
  }, [user, authLoading]);


  if (authLoading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">Caricamento profilo...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-10">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Accesso Richiesto</h2>
        <p className="text-muted-foreground mb-6">
          Devi essere loggato per visualizzare questa pagina.
        </p>
        <Button asChild>
          <Link href="/signin?redirect=/profile">
             Accedi
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-12">
      <Card className="shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Il Tuo Profilo</CardTitle>
          <CardDescription>Gestisci le informazioni del tuo account e le preferenze dell'applicazione.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Email</h3>
            <p className="text-foreground">{user.email}</p>
          </div>
          <UpdateProfileForm initialDisplayName={user.displayName} />
        </CardContent>
      </Card>
      
      <ThemeSwitcher />

      <Separator />

      <section>
        <h2 className="text-2xl font-semibold mb-6 text-foreground flex items-center gap-2">
          <Heart className="h-6 w-6 text-destructive" />
          I Tuoi Giochi Preferiti
        </h2>
        {isLoadingFavorites ? (
          <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : favoritedGames.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {favoritedGames.map((game, index) => (
              <GameCard key={game.id} game={game} variant="featured" priority={index < 5} showOverlayText={true} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">Non hai ancora aggiunto giochi ai preferiti.</p>
        )}
      </section>

      <Separator />

      <section>
        <h2 className="text-2xl font-semibold mb-6 text-foreground flex items-center gap-2">
          <ListChecks className="h-6 w-6 text-sky-500" />
          La Tua Wishlist
        </h2>
        {isLoadingWishlist ? (
          <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : wishlistedGames.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {wishlistedGames.map((game, index) => (
              <GameCard key={game.id} game={game} variant="featured" priority={index < 5} showOverlayText={true} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">La tua wishlist è vuota.</p>
        )}
      </section>
    </div>
  );
}
