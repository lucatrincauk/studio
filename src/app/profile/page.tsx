
'use client';

import type { BoardGame, UserProfile } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';
import { UpdateProfileForm } from '@/components/profile/update-profile-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle, UserCircle2, ListChecks, Heart, Frown } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ThemeSwitcher } from '@/components/profile/theme-switcher'; 
import { Separator } from '@/components/ui/separator';
import { useState, useEffect, useCallback } from 'react';
import { getFavoritedGamesForUserAction, getPlaylistedGamesForUserAction, getMorchiaGamesForUserAction } from '@/lib/actions';
import { GameCard } from '@/components/boardgame/game-card';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const USER_PROFILES_COLLECTION = 'user_profiles';

export default function ProfilePage() {
  const { user: firebaseUser, loading: authLoading } = useAuth();
  const [userProfileData, setUserProfileData] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  const [favoritedGames, setFavoritedGames] = useState<BoardGame[]>([]);
  const [playlistedGames, setPlaylistedGames] = useState<BoardGame[]>([]);
  const [morchiaGames, setMorchiaGames] = useState<BoardGame[]>([]);
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(false);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(false);
  const [isLoadingMorchia, setIsLoadingMorchia] = useState(false);

  const fetchUserProfileAndLists = useCallback(async () => {
    if (firebaseUser) {
      setIsLoadingProfile(true);
      setIsLoadingFavorites(true);
      setIsLoadingPlaylist(true);
      setIsLoadingMorchia(true);

      const profileRef = doc(db, USER_PROFILES_COLLECTION, firebaseUser.uid);
      try {
        const docSnap = await getDoc(profileRef);
        if (docSnap.exists()) {
          setUserProfileData({ id: docSnap.id, ...docSnap.data() } as UserProfile);
        } else {
          setUserProfileData({
            id: firebaseUser.uid,
            name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Utente Anonimo',
            email: firebaseUser.email,
            photoURL: firebaseUser.photoURL,
            bggUsername: null,
          });
        }
      } catch (error) {
        console.error("Error fetching user profile from Firestore:", error);
        setUserProfileData(null);
      }
      setIsLoadingProfile(false);

      try {
        const favResult = await getFavoritedGamesForUserAction(firebaseUser.uid);
        setFavoritedGames(favResult);
      } catch (e) {
        setFavoritedGames([]);
      } finally {
        setIsLoadingFavorites(false);
      }

      try {
        const playlistResult = await getPlaylistedGamesForUserAction(firebaseUser.uid);
        setPlaylistedGames(playlistResult);
      } catch (e) {
        setPlaylistedGames([]);
      } finally {
        setIsLoadingPlaylist(false);
      }

      try {
        const morchiaResult = await getMorchiaGamesForUserAction(firebaseUser.uid);
        setMorchiaGames(morchiaResult);
      } catch (e) {
        setMorchiaGames([]);
      } finally {
        setIsLoadingMorchia(false);
      }

    } else {
      setUserProfileData(null);
      setFavoritedGames([]);
      setPlaylistedGames([]);
      setMorchiaGames([]);
      setIsLoadingProfile(false);
      setIsLoadingFavorites(false);
      setIsLoadingPlaylist(false);
      setIsLoadingMorchia(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    if (!authLoading) {
      fetchUserProfileAndLists();
    }
  }, [firebaseUser, authLoading, fetchUserProfileAndLists]);


  if (authLoading || isLoadingProfile) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">Caricamento profilo...</p>
      </div>
    );
  }

  if (!firebaseUser || !userProfileData) {
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
          <UserCircle2 className="h-16 w-16 text-primary mx-auto mb-3" />
          <CardTitle className="text-2xl font-bold">Il Tuo Profilo</CardTitle>
          <CardDescription>Gestisci le informazioni del tuo account e le preferenze dell'applicazione.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Email</h3>
            <p className="text-foreground">{firebaseUser.email}</p>
          </div>
           {userProfileData && (
             <UpdateProfileForm 
                initialValues={{
                    displayName: userProfileData.name || firebaseUser.displayName || '',
                    bggUsername: userProfileData.bggUsername || null,
                }}
                onProfileUpdate={fetchUserProfileAndLists} 
            />
           )}
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
          La Tua Playlist
        </h2>
        {isLoadingPlaylist ? (
          <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : playlistedGames.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {playlistedGames.map((game, index) => (
              <GameCard key={game.id} game={game} variant="featured" priority={index < 5} showOverlayText={true} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">La tua playlist è vuota.</p>
        )}
      </section>

      <Separator />

      <section>
        <h2 className="text-2xl font-semibold mb-6 text-foreground flex items-center gap-2">
          <Frown className="h-6 w-6 text-orange-600" />
          La Tua Morchia
        </h2>
        {isLoadingMorchia ? (
          <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : morchiaGames.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {morchiaGames.map((game, index) => (
              <GameCard key={game.id} game={game} variant="featured" priority={index < 5} showOverlayText={true} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">La tua Morchia List è vuota. Ottimo!</p>
        )}
      </section>
    </div>
  );
}

