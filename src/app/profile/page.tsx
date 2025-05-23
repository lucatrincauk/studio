
'use client';

import type { UserProfile, EarnedBadge, BoardGame } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';
import { UpdateProfileForm } from '@/components/profile/update-profile-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle, Settings2 as SettingsIcon, Frown, BookMarked, Heart } from 'lucide-react'; 
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ThemeSwitcher } from '@/components/profile/theme-switcher';
import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, collection, getDocs, orderBy, query, type Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getFavoritedGamesForUserAction, getPlaylistedGamesForUserAction, getMorchiaGamesForUserAction } from '@/lib/actions'; 
import { GameCard } from '@/components/boardgame/game-card';
import { Separator } from '@/components/ui/separator';


const USER_PROFILES_COLLECTION = 'user_profiles';

export default function ProfileSettingsPage() { 
  const { user: firebaseUser, loading: authLoading } = useAuth();
  const [userProfileData, setUserProfileData] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
 
  const fetchUserProfileData = useCallback(async () => {
    if (firebaseUser) {
      setIsLoadingProfile(true);
      const profileRef = doc(db, USER_PROFILES_COLLECTION, firebaseUser.uid);
      try {
        const docSnap = await getDoc(profileRef);
        if (docSnap.exists()) {
          setUserProfileData({ id: docSnap.id, ...docSnap.data() } as UserProfile);
        } else {
          setUserProfileData({
            id: firebaseUser.uid,
            name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Utente Anonimo',
            email: firebaseUser.email || null,
            photoURL: firebaseUser.photoURL || null,
            bggUsername: null,
            hasSubmittedReview: false,
            hasGivenFirstOne: false,
            hasGivenFirstFive: false,
            hasEarnedComprehensiveCritic: false,
            hasEarnedNightOwlReviewer: false,
            hasReceivedWelcomeBadge: false,
            hasEarnedFavoriteFanaticBadge: false,
            hasEarnedPlaylistProBadge: false,
          });
        }
      } catch (error) {
        console.error("Error fetching user profile from Firestore:", error);
        setUserProfileData(null);
      }
      setIsLoadingProfile(false);
    } else {
      setUserProfileData(null);
      setIsLoadingProfile(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    if (!authLoading) {
      fetchUserProfileData();
    }
  }, [firebaseUser, authLoading, fetchUserProfileData]);


  if (authLoading || isLoadingProfile) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">Caricamento impostazioni...</p>
      </div>
    );
  }

  if (!firebaseUser) { 
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
  
  if (!userProfileData) {
     return (
      <div className="flex flex-col items-center justify-center text-center py-10">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Errore Profilo</h2>
        <p className="text-muted-foreground mb-6">
          Impossibile caricare i dati del profilo. Riprova più tardi.
        </p>
        <Button asChild variant="outline">
          <Link href="/">
             Torna alla Homepage
          </Link>
        </Button>
      </div>
    );
  }


  return (
    <div className="max-w-2xl mx-auto py-8 space-y-12">
      <Card className="shadow-xl">
        <CardHeader className="text-center">
          <SettingsIcon className="h-16 w-16 text-primary mx-auto mb-3" />
          <CardTitle className="text-2xl font-bold">Impostazioni Account</CardTitle> 
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
                    bggUsername: userProfileData.bggUsername || '', 
                }}
                onProfileUpdate={fetchUserProfileData}
            />
           )}
        </CardContent>
      </Card>
      
      <ThemeSwitcher />

       <Card className="shadow-md">
        <CardHeader>
            <CardTitle className="text-xl">Il Tuo Profilo Pubblico</CardTitle>
            <CardDescription>
                Visualizza le tue liste pubbliche e i distintivi sul tuo profilo.
            </CardDescription>
        </CardHeader>
        <CardContent>
            <Button asChild variant="outline">
                <Link href={`/users/${firebaseUser.uid}`}>
                    Vai al Mio Profilo Pubblico
                </Link>
            </Button>
        </CardContent>
       </Card>
    </div>
  );
}

