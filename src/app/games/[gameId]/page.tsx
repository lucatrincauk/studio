
'use client';

import { useEffect, useState, useTransition, useCallback, use, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  getGameDetails,
  revalidateGameDataAction,
  fetchUserPlaysForGameFromBggAction,
  getAllGamesAction,
  fetchAndUpdateBggGameDetailsAction, // Added this import
} from '@/lib/actions';
import { recommendGames } from '@/ai/flows/recommend-games';
import type { BoardGame, Review, Rating as RatingType, BggPlayDetail, BggPlayerInPlay, UserProfile, EnrichedAIRecommendedGame } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  AlertCircle, Loader2, Info, Edit, Trash2, Users, Clock, CalendarDays as CalendarIcon, ExternalLink, Weight, PenTool, Dices, MessageSquare, Settings, Trophy, Medal, UserCircle2, Star, Palette, ClipboardList, Repeat, Sparkles, Pin, PinOff, Wand2, DownloadCloud, Heart, Bookmark, BookMarked, Frown, UserCheck,
  ListMusic,
  HeartPulse
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/auth-context';
import {
  formatRatingNumber,
  formatPlayDate,
  formatReviewDate,
  calculateOverallCategoryAverage,
  calculateCategoryAverages as calculateCatAvgsFromUtils
} from '@/lib/utils';
import { GameDetailHeader } from '@/components/boardgame/game-detail-header';
import { ReviewList } from '@/components/boardgame/review-list';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, deleteDoc, updateDoc, getDocs, collection, getDoc, arrayUnion, arrayRemove, increment, writeBatch, serverTimestamp, setDoc, query, where, getCountFromServer, type Timestamp } from 'firebase/firestore';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';
import { SafeImage } from '@/components/common/SafeImage';
import { cn } from '@/lib/utils';


const FIRESTORE_COLLECTION_NAME = 'boardgames_collection';
const USER_PROFILES_COLLECTION = 'user_profiles';
const BGG_USERNAME = 'lctr01';

interface GameDetailPageProps {
  params: Promise<{
    gameId: string;
  }>;
}


export default function GameDetailPage({ params }: GameDetailPageProps) {
  const resolvedParams = use(params);
  const { gameId } = resolvedParams;

  const { user: currentUser, loading: authLoading, isAdmin } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const updatedTimestamp = searchParams.get('updated');

  const [game, setGame] = useState<BoardGame | null>(null);
  const [isLoadingGame, setIsLoadingGame] = useState(true);
  const [globalGameAverage, setGlobalGameAverage] = useState<number | null>(null);

  const [userReview, setUserReview] = useState<Review | undefined>(undefined);
  const [remainingReviews, setRemainingReviews] = useState<Review[]>([]);

  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [isDeletingReview, startDeleteReviewTransition] = useTransition();

  const [isFavoriting, startFavoriteTransition] = useTransition();
  const [isFavoritedByCurrentUser, setIsFavoritedByCurrentUser] = useState(false);
  const [currentFavoriteCount, setCurrentFavoriteCount] = useState(0);

  const [isPlaylisting, startPlaylistTransition] = useTransition();
  const [isPlaylistedByCurrentUser, setIsPlaylistedByCurrentUser] = useState(false);

  const [isTogglingMorchia, startMorchiaTransition] = useTransition();
  const [isMorchiaByCurrentUser, setIsMorchiaByCurrentUser] = useState(false);
  const [currentMorchiaCount, setCurrentMorchiaCount] = useState(0);

  const [isFetchingDetailsFor, setIsFetchingDetailsFor] = useState<string | null>(null);
  const [isPendingBggDetailsFetch, startBggDetailsFetchTransition] = useTransition();
  const [currentIsPinned, setCurrentIsPinned] = useState(false);
  const [isPinToggling, startPinToggleTransition] = useTransition();


  const [isFetchingPlays, startFetchPlaysTransition] = useTransition();

  const [enrichedAiRecommendations, setEnrichedAiRecommendations] = useState<EnrichedAIRecommendedGame[]>([]);
  const [allGamesForAICatalog, setAllGamesForAICatalog] = useState<BoardGame[]>([]);
  const [isFetchingRecommendations, startFetchingRecommendationsTransition] = useTransition();
  const [recommendationError, setRecommendationError] = useState<string | null>(null);


  const fetchGameData = useCallback(async () => {
    setIsLoadingGame(true);
    const gameData = await getGameDetails(gameId);
    setGame(gameData);
    setCurrentIsPinned(gameData?.isPinned || false);

    if (gameData) {
      setCurrentFavoriteCount(gameData.favoriteCount || 0);
      setCurrentMorchiaCount(gameData.morchiaCount || 0);

      if (gameData.reviews && gameData.reviews.length > 0) {
        const categoryAvgs = calculateCatAvgsFromUtils(gameData.reviews);
        if (categoryAvgs) {
          setGlobalGameAverage(calculateOverallCategoryAverage(categoryAvgs));
        } else {
          setGlobalGameAverage(null);
        }
      } else {
        setGlobalGameAverage(null);
      }

      let foundUserReview: Review | undefined = undefined;
      if (currentUser && !authLoading && gameData.reviews) {
        foundUserReview = gameData.reviews.find(r => r.userId === currentUser.uid);
        setIsFavoritedByCurrentUser(gameData.favoritedByUserIds?.includes(currentUser.uid) || false);
        setIsPlaylistedByCurrentUser(gameData.playlistedByUserIds?.includes(currentUser.uid) || false);
        setIsMorchiaByCurrentUser(gameData.morchiaByUserIds?.includes(currentUser.uid) || false);
      } else {
        setIsFavoritedByCurrentUser(false);
        setIsPlaylistedByCurrentUser(false);
        setIsMorchiaByCurrentUser(false);
      }
      setUserReview(foundUserReview);

      const otherReviews = gameData.reviews?.filter(r => r.id !== foundUserReview?.id) || [];
      setRemainingReviews(otherReviews);

    } else {
      setIsFavoritedByCurrentUser(false);
      setCurrentFavoriteCount(0);
      setIsPlaylistedByCurrentUser(false);
      setIsMorchiaByCurrentUser(false);
      setCurrentMorchiaCount(0);
      setGlobalGameAverage(null);
      setUserReview(undefined);
      setRemainingReviews([]);
    }
    setIsLoadingGame(false);
  }, [gameId, currentUser, authLoading]);

  useEffect(() => {
    if (gameId) {
      fetchGameData();
    }
  }, [gameId, currentUser, authLoading, fetchGameData, updatedTimestamp]);


  useEffect(() => {
    if (game) {
      setCurrentFavoriteCount(game.favoriteCount || 0);
      setCurrentMorchiaCount(game.morchiaCount || 0);
      if (currentUser) {
        setIsFavoritedByCurrentUser(game.favoritedByUserIds?.includes(currentUser.uid) || false);
        setIsPlaylistedByCurrentUser(game.playlistedByUserIds?.includes(currentUser.uid) || false);
        setIsMorchiaByCurrentUser(game.morchiaByUserIds?.includes(currentUser.uid) || false);
      }
    }
  }, [game, currentUser]);

  const updateGameOverallRatingAfterDelete = useCallback(async () => {
    if (!game) return;
    try {
      const reviewsCollectionRef = collection(db, FIRESTORE_COLLECTION_NAME, game.id, 'reviews');
      const reviewsSnapshot = await getDocs(reviewsCollectionRef);
      const allReviewsForGame: Review[] = reviewsSnapshot.docs.map(docSnap => {
        const reviewDocData = docSnap.data();
         const defaultRatingValues: Partial<RatingType> = {
            excitedToReplay: 5, mentallyStimulating: 5, fun: 5,
            decisionDepth: 5, replayability: 5, luck: 5, lengthDowntime: 5,
            graphicDesign: 5, componentsThemeLore: 5, effortToLearn: 5, setupTeardown: 5,
        };
        const rating: RatingType = { ...defaultRatingValues, ...reviewDocData.rating } as RatingType;
        return { id: docSnap.id, ...reviewDocData, rating } as Review;
      });

      const categoryAvgs = calculateCatAvgsFromUtils(allReviewsForGame);
      const newOverallAverage = categoryAvgs ? calculateOverallCategoryAverage(categoryAvgs) : null;
      const newVoteCount = allReviewsForGame.length;

      const gameDocRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
      await updateDoc(gameDocRef, {
        overallAverageRating: newOverallAverage,
        voteCount: newVoteCount
      });

      setGame(prevGame => prevGame ? { ...prevGame, overallAverageRating: newOverallAverage, voteCount: newVoteCount } : null);
      setGlobalGameAverage(newOverallAverage);

      revalidateGameDataAction(game.id);
    } catch (error) {
      console.error("Errore durante l'aggiornamento del punteggio medio del gioco:", error);
      toast({ title: "Errore", description: "Impossibile aggiornare il punteggio medio del gioco.", variant: "destructive" });
    }
  }, [game, toast]);


  const confirmDeleteUserReview = async () => {
    setShowDeleteConfirmDialog(false);
    if (!currentUser || !userReview?.id || !gameId) {
      toast({ title: "Errore", description: "Impossibile eliminare il voto. Utente o voto non trovati.", variant: "destructive" });
      return;
    }

    startDeleteReviewTransition(async () => {
      try {
        const reviewDocRef = doc(db, FIRESTORE_COLLECTION_NAME, gameId, 'reviews', userReview.id);
        await deleteDoc(reviewDocRef);

        toast({ title: "Voto Eliminato", description: "Il tuo voto è stato eliminato con successo." });
        setUserReview(undefined);
        await updateGameOverallRatingAfterDelete();
        await fetchGameData();
        revalidateGameDataAction(gameId);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Si è verificato un errore sconosciuto.";
        toast({ title: "Errore", description: `Impossibile eliminare il voto: ${errorMessage}`, variant: "destructive" });
      }
    });
  };

  const handleTogglePinGame = async () => {
    if (!game || !game.id || !isAdmin) return;

    const originalPinnedStatus = currentIsPinned;
    const newPinnedStatus = !currentIsPinned;
    setCurrentIsPinned(newPinnedStatus);

    startPinToggleTransition(async () => {
      try {
        const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
        await updateDoc(gameRef, { isPinned: newPinnedStatus });
        toast({
          title: newPinnedStatus ? "Aggiunto alla Vetrina" : "Rimosso dalla Vetrina",
          description: `${game.name} è stato ${newPinnedStatus ? 'aggiunto alla' : 'rimosso dalla'} vetrina.`,
        });
        setGame(prevGame => prevGame ? { ...prevGame, isPinned: newPinnedStatus } : null);
        revalidateGameDataAction(game.id);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Errore sconosciuto durante l'aggiornamento del pin.";
        toast({ title: "Errore Pin", description: errorMessage, variant: "destructive" });
        setCurrentIsPinned(originalPinnedStatus);
      }
    });
  };


  const handleToggleFavorite = async () => {
    if (!currentUser || !game || authLoading) {
      toast({ title: "Azione non permessa", description: "Devi essere loggato per aggiungere ai preferiti.", variant: "destructive" });
      return;
    }

    const originalFavoritedStatus = isFavoritedByCurrentUser;
    const newFavoritedStatus = !originalFavoritedStatus;

    // Optimistic UI update
    setIsFavoritedByCurrentUser(newFavoritedStatus);
    setCurrentFavoriteCount(prev => newFavoritedStatus ? (prev + 1) : Math.max(0, prev -1));


    startFavoriteTransition(async () => {
      const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
      const userProfileRef = doc(db, USER_PROFILES_COLLECTION, currentUser.uid);
      try {
        await updateDoc(gameRef, {
          favoritedByUserIds: newFavoritedStatus ? arrayUnion(currentUser.uid) : arrayRemove(currentUser.uid),
          favoriteCount: increment(newFavoritedStatus ? 1 : -1)
        });

        // Fetch game again to get actual server counts (less optimistic, more robust)
        // This is now handled by revalidateGameDataAction triggering fetchGameData
        // setGame(prevGame => prevGame ? ({
        //     ...prevGame,
        //     favoritedByUserIds: newFavoritedStatus
        //       ? [...(prevGame.favoritedByUserIds || []), currentUser.uid]
        //       : (prevGame.favoritedByUserIds || []).filter(id => id !== currentUser.uid),
        //     favoriteCount: (prevGame.favoriteCount || 0) + (newFavoritedStatus ? 1 : -1),
        //   }) : null);
        // No need to call fetchGameData() if revalidateGameDataAction() + updatedTimestamp handles it

        revalidateGameDataAction(game.id);
        toast({
          title: newFavoritedStatus ? "Aggiunto ai Preferiti!" : "Rimosso dai Preferiti",
          description: `${game.name} è stato ${newFavoritedStatus ? 'aggiunto ai' : 'rimosso dai'} tuoi preferiti.`,
        });

        if (newFavoritedStatus) {
            const userProfileSnap = await getDoc(userProfileRef);
            if (userProfileSnap.exists()) {
                const userProfileData = userProfileSnap.data() as UserProfile;
                if (!userProfileData.hasEarnedFavoriteFanaticBadge) {
                    const favoritesQuery = query(collection(db, FIRESTORE_COLLECTION_NAME), where('favoritedByUserIds', 'array-contains', currentUser.uid));
                    const favoritesSnapshot = await getCountFromServer(favoritesQuery);
                    const totalFavorites = favoritesSnapshot.data().count;
                    if (totalFavorites >= 5) {
                        const badgeRef = doc(userProfileRef, 'earned_badges', 'favorite_fanatic_5');
                        const badgeData = {
                            badgeId: 'favorite_fanatic_5',
                            name: 'Collezionista di Cuori',
                            description: 'Hai aggiunto 5 giochi ai tuoi preferiti!',
                            iconName: 'HeartPulse' as const,
                            earnedAt: serverTimestamp(),
                        };
                        await setDoc(badgeRef, badgeData);
                        await updateDoc(userProfileRef, { hasEarnedFavoriteFanaticBadge: true });
                        toast({
                          title: (
                            <div className="flex items-center gap-2">
                              <HeartPulse className="h-5 w-5 text-pink-500" /> Distintivo Guadagnato!
                            </div>
                          ),
                          description: "Complimenti! Hai ricevuto: Collezionista di Cuori!",
                        });
                    }
                }
            }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Impossibile aggiornare i preferiti.";
        toast({ title: "Errore", description: errorMessage, variant: "destructive" });
        // Revert optimistic UI updates on error
        setIsFavoritedByCurrentUser(originalFavoritedStatus);
        setCurrentFavoriteCount(game.favoriteCount || 0);
      }
    });
  };

  const handleTogglePlaylist = async () => {
    if (!currentUser || !game || authLoading) {
      toast({ title: "Azione non permessa", description: "Devi essere loggato per aggiungere alla playlist.", variant: "destructive" });
      return;
    }

    const originalPlaylistedStatus = isPlaylistedByCurrentUser;
    const newPlaylistedStatus = !originalPlaylistedStatus;
    setIsPlaylistedByCurrentUser(newPlaylistedStatus);

    startPlaylistTransition(async () => {
      const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
      const userProfileRef = doc(db, USER_PROFILES_COLLECTION, currentUser.uid);
      try {
        await updateDoc(gameRef, {
          playlistedByUserIds: newPlaylistedStatus ? arrayUnion(currentUser.uid) : arrayRemove(currentUser.uid)
        });

        // No need to call fetchGameData() if revalidateGameDataAction() + updatedTimestamp handles it
        revalidateGameDataAction(game.id);
        toast({
          title: newPlaylistedStatus ? "Aggiunto alla Playlist!" : "Rimosso dalla Playlist",
          description: `${game.name} è stato ${newPlaylistedStatus ? 'aggiunto alla' : 'rimosso dalla'} tua playlist.`,
        });

        if (newPlaylistedStatus) {
            const userProfileSnap = await getDoc(userProfileRef);
            if (userProfileSnap.exists()) {
                const userProfileData = userProfileSnap.data() as UserProfile;
                if (!userProfileData.hasEarnedPlaylistProBadge) {
                    const playlistQuery = query(collection(db, FIRESTORE_COLLECTION_NAME), where('playlistedByUserIds', 'array-contains', currentUser.uid));
                    const playlistSnapshot = await getCountFromServer(playlistQuery);
                    const totalPlaylisted = playlistSnapshot.data().count;
                    if (totalPlaylisted >= 5) {
                        const badgeRef = doc(userProfileRef, 'earned_badges', 'playlist_pro_5');
                        const badgeData = {
                            badgeId: 'playlist_pro_5',
                            name: 'Maestro di Playlist',
                            description: 'Hai aggiunto 5 giochi alla tua playlist!',
                            iconName: 'ListMusic' as const,
                            earnedAt: serverTimestamp(),
                        };
                        await setDoc(badgeRef, badgeData);
                        await updateDoc(userProfileRef, { hasEarnedPlaylistProBadge: true });
                        toast({
                          title: (
                            <div className="flex items-center gap-2">
                              <ListMusic className="h-5 w-5 text-purple-500" /> Distintivo Guadagnato!
                            </div>
                          ),
                          description: "Complimenti! Hai ricevuto: Maestro di Playlist!",
                        });
                    }
                }
            }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Impossibile aggiornare la playlist.";
        toast({ title: "Errore", description: errorMessage, variant: "destructive" });
        setIsPlaylistedByCurrentUser(originalPlaylistedStatus);
      }
    });
  };

  const handleToggleMorchia = async () => {
    if (!currentUser || !game || authLoading) {
      toast({ title: "Azione non permessa", description: "Devi essere loggato per aggiungere alle Morchie.", variant: "destructive" });
      return;
    }

    const originalMorchiaStatus = isMorchiaByCurrentUser;
    const newMorchiaStatus = !originalMorchiaStatus;

    setIsMorchiaByCurrentUser(newMorchiaStatus);
    setCurrentMorchiaCount(prev => newMorchiaStatus ? (prev + 1) : Math.max(0, prev -1));


    startMorchiaTransition(async () => {
      const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
      const userProfileRef = doc(db, USER_PROFILES_COLLECTION, currentUser.uid);
      try {
        await updateDoc(gameRef, {
          morchiaByUserIds: newMorchiaStatus ? arrayUnion(currentUser.uid) : arrayRemove(currentUser.uid),
          morchiaCount: increment(newMorchiaStatus ? 1 : -1)
        });

        // No need to call fetchGameData() if revalidateGameDataAction() + updatedTimestamp handles it
        revalidateGameDataAction(game.id);
        toast({
          title: newMorchiaStatus ? "Aggiunto alle Morchie!" : "Rimosso dalle Morchie",
          description: `${game.name} è stato ${newMorchiaStatus ? 'aggiunto alla lista morchia.' : 'rimosso dalle morchie.'}`,
        });

        if (newMorchiaStatus) {
            const userProfileSnap = await getDoc(userProfileRef);
            if (userProfileSnap.exists()){
                const userProfileData = userProfileSnap.data() as UserProfile;
                if (!userProfileData.hasEarnedMorchiaHunter) {
                    const morchiaQuery = query(collection(db, FIRESTORE_COLLECTION_NAME), where('morchiaByUserIds', 'array-contains', currentUser.uid));
                    const morchiaSnapshot = await getCountFromServer(morchiaQuery);
                    const totalMorchiaMarked = morchiaSnapshot.data().count;

                    if (totalMorchiaMarked >= 5) {
                        const badgeRef = doc(userProfileRef, 'earned_badges', 'morchia_hunter_5');
                        const badgeData = {
                            badgeId: 'morchia_hunter_5',
                            name: 'Cacciatore di Morchie',
                            description: 'Hai contrassegnato 5 giochi come "morchia"!',
                            iconName: 'Trash2' as const,
                            earnedAt: serverTimestamp(),
                        };
                        await setDoc(badgeRef, badgeData);
                        await updateDoc(userProfileRef, { hasEarnedMorchiaHunter: true });
                        toast({
                          title: (
                            <div className="flex items-center gap-2">
                              <Trash2 className="h-5 w-5 text-orange-500" /> Distintivo Guadagnato!
                            </div>
                          ),
                          description: "Complimenti! Hai ricevuto il distintivo: Cacciatore di Morchie!",
                        });
                    }
                }
            }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Impossibile aggiornare la Morchia List.";
        toast({ title: "Errore", description: errorMessage, variant: "destructive" });
        setIsMorchiaByCurrentUser(originalMorchiaStatus);
        setCurrentMorchiaCount(game.morchiaCount || 0);
      }
    });
  };

  const handleRefreshBggData = async () => {
    if (!game || !game.id || !game.bggId) {
      toast({ title: 'Azione non possibile', description: 'ID gioco BGG mancante.', variant: 'destructive' });
      return;
    }
    setIsFetchingDetailsFor(game.id);
    startBggDetailsFetchTransition(async () => {
      const serverActionResult = await fetchAndUpdateBggGameDetailsAction(game.bggId);

      if (!serverActionResult.success || !serverActionResult.updateData) {
        toast({ title: 'Errore Recupero Dati BGG', description: serverActionResult.error || 'Impossibile recuperare dati da BGG.', variant: 'destructive' });
        setIsFetchingDetailsFor(null);
        return;
      }

      if (Object.keys(serverActionResult.updateData).length > 0) {
        const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
        try {
          await updateDoc(gameRef, serverActionResult.updateData);
          toast({ title: 'Dettagli Aggiornati', description: `Dettagli per ${game.name} aggiornati con successo.` });
          revalidateGameDataAction(game.id);
          fetchGameData();
        } catch (dbError) {
          const errorMessage = dbError instanceof Error ? dbError.message : "Errore sconosciuto durante l'aggiornamento del DB.";
          toast({ title: 'Errore Aggiornamento Database', description: errorMessage, variant: 'destructive' });
        }
      } else {
        toast({ title: 'Nessun Aggiornamento', description: `Nessun nuovo dettaglio da aggiornare per ${game.name} da BGG.` });
      }
      setIsFetchingDetailsFor(null);
    });
  };

 const handleFetchBggPlays = async () => {
    if (!game || !game.id || !game.bggId || authLoading || !currentUser ) {
        toast({ title: 'Azione non possibile', description: 'Dati gioco o utente mancanti.', variant: 'destructive' });
        return;
    }
    const usernameToFetch = BGG_USERNAME; // Assuming this is lctr01 for this specific button
    startFetchPlaysTransition(async () => {
      try {
        const bggFetchResult = await fetchUserPlaysForGameFromBggAction(game.bggId, usernameToFetch);

        if (!bggFetchResult.success || !bggFetchResult.plays) {
            toast({ title: 'Errore Caricamento Partite BGG', description: bggFetchResult.error || bggFetchResult.message || 'Impossibile caricare le partite da BGG.', variant: 'destructive' });
            return;
        }

        const playsToSave = bggFetchResult.plays;
        const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
        let playsSavedCount = 0;

        if (playsToSave.length > 0) {
            const batch = writeBatch(db);
            const playsSubcollectionRef = collection(db, FIRESTORE_COLLECTION_NAME, game.id, 'plays_' + usernameToFetch.toLowerCase());

            playsToSave.forEach(play => {
                const playDocRef = doc(playsSubcollectionRef, play.playId);
                const playDataForFirestore: BggPlayDetail = {
                    ...play,
                    userId: usernameToFetch,
                    gameBggId: game.bggId,
                };
                batch.set(playDocRef, playDataForFirestore, { merge: true });
            });

            const totalPlaysForThisGame = playsToSave.reduce((sum, play) => sum + play.quantity, 0);
            batch.update(gameRef, { lctr01Plays: totalPlaysForThisGame }); // Update specific user's play count

            await batch.commit();
            playsSavedCount = totalPlaysForThisGame;

            toast({
                title: "Partite Caricate e Salvate!",
                description: bggFetchResult.message || `Caricate e salvate ${playsSavedCount} partite per ${game.name}. Conteggio aggiornato.`,
            });
        } else {
            await updateDoc(gameRef, { lctr01Plays: 0 });
            toast({
                title: "Nessuna Partita Trovata",
                description: bggFetchResult.message || `Nessuna partita trovata su BGG per ${usernameToFetch} per questo gioco. Conteggio azzerato.`,
            });
             playsSavedCount = 0;
        }

        revalidateGameDataAction(game.id);
        fetchGameData();
      } catch (error) {
         const errorMessage = error instanceof Error ? error.message : "Impossibile salvare le partite nel database.";
         toast({ title: 'Errore Elaborazione Partite DB', description: errorMessage, variant: 'destructive' });
      }
    });
};

const handleGenerateRecommendations = async () => {
    if (!game) return;
    setEnrichedAiRecommendations([]);
    setRecommendationError(null);

    startFetchingRecommendationsTransition(async () => {
      try {
        const allGamesDataResult = await getAllGamesAction();
        if ('error' in allGamesDataResult) {
          throw new Error(allGamesDataResult.error);
        }
        setAllGamesForAICatalog(allGamesDataResult);

        const catalogGamesForAI = allGamesDataResult.map(g => ({ id: g.id, name: g.name }));

        const result = await recommendGames({
          referenceGameName: game.name,
          catalogGames: catalogGamesForAI,
        });

        if (result.recommendations.length === 0) {
          toast({ title: "Nessun Suggerimento", description: "L'AI non ha trovato suggerimenti specifici per questo gioco dal catalogo attuale.", variant: "default" });
          setEnrichedAiRecommendations([]);
        } else {
          const enriched = result.recommendations.map(rec => {
            const fullGameData = allGamesDataResult.find(g => g.id === rec.id);
            return {
              ...rec,
              coverArtUrl: fullGameData?.coverArtUrl || null,
              favoritedByUserIds: fullGameData?.favoritedByUserIds || [],
              playlistedByUserIds: fullGameData?.playlistedByUserIds || [],
              favoriteCount: fullGameData?.favoriteCount || 0,
            };
          });
          setEnrichedAiRecommendations(enriched);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Errore durante la generazione dei suggerimenti AI.";
        setRecommendationError(errorMessage);
        toast({ title: "Errore Suggerimenti AI", description: errorMessage, variant: "destructive" });
      }
    });
  };

  const fallbackSrc = `https://placehold.co/240x360.png?text=${encodeURIComponent(game?.name?.substring(0,10) || 'N/A')}`;

  const userOverallScore = userReview ? calculateOverallCategoryAverage(userReview.rating) : null;

  const topWinnerStats = useMemo(() => {
    if (!game || !game.lctr01PlayDetails || game.lctr01PlayDetails.length === 0) {
      return null;
    }
    const playerStats = new Map<string, { wins: number; totalScore: number; name: string }>();
    game.lctr01PlayDetails.forEach(play => {
      if (play.players && play.players.length > 0) {
        play.players.forEach(p => {
          if (p.didWin) {
            const playerIdentifier = p.username || p.name;
            const displayName = p.name || p.username || 'Sconosciuto';
            if (playerIdentifier && displayName) {
              const current = playerStats.get(playerIdentifier) || { wins: 0, totalScore: 0, name: displayName };
              current.wins += (play.quantity || 1);
              const score = parseInt(p.score || "0", 10);
              current.totalScore += isNaN(score) ? 0 : score;
              playerStats.set(playerIdentifier, current);
            }
          }
        });
      }
    });
    if (playerStats.size === 0) return null;
    let topPlayer: { name: string; wins: number; totalScore: number } | null = null;
    playerStats.forEach((stats) => {
      if (!topPlayer || stats.wins > topPlayer.wins || (stats.wins === topPlayer.wins && stats.totalScore > topPlayer.totalScore)) {
        topPlayer = stats;
      }
    });
    return topPlayer ? { name: topPlayer.name, wins: topPlayer.wins } : null;
  }, [game?.lctr01PlayDetails]);

  const highestScoreAchieved = useMemo(() => {
    if (!game || !game.lctr01PlayDetails || game.lctr01PlayDetails.length === 0) {
      return null;
    }
    let maxScore = -Infinity;
    let playersWithMaxScore: string[] = [];

    game.lctr01PlayDetails.forEach(play => {
      if (play.players && play.players.length > 0) {
        play.players.forEach(p => {
          const score = parseInt(p.score || "-Infinity", 10);
          if (!isNaN(score)) {
            const playerName = p.name || p.username || 'Sconosciuto';
            if (score > maxScore) {
              maxScore = score;
              playersWithMaxScore = [playerName];
            } else if (score === maxScore && !playersWithMaxScore.includes(playerName)) {
              playersWithMaxScore.push(playerName);
            }
          }
        });
      }
    });
    return maxScore > -Infinity ? { score: maxScore, players: playersWithMaxScore } : null;
  }, [game?.lctr01PlayDetails]);


  if (isLoadingGame || authLoading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">Caricamento dettagli gioco...</p>
      </div>
    );
  }

  if (!game) {
    return (
      <Alert variant="destructive" className="max-w-md mx-auto my-10">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Errore: Gioco Non Trovato</AlertTitle>
        <AlertDescription>
          Il gioco che cerchi non è stato trovato. Potrebbe essere stato rimosso o l'ID non è corretto.
        </AlertDescription>
      </Alert>
    );
  }


  return (
    <div className="space-y-8">
      <GameDetailHeader
        game={game}
        currentUser={currentUser}
        isAdmin={isAdmin}
        globalGameAverage={globalGameAverage}
        fallbackSrc={fallbackSrc}
        currentIsPinned={currentIsPinned}
        isPinToggling={isPinToggling}
        onTogglePin={handleTogglePinGame}
        isFavoritedByCurrentUser={isFavoritedByCurrentUser}
        currentFavoriteCount={currentFavoriteCount}
        isFavoriting={isFavoriting}
        onToggleFavorite={handleToggleFavorite}
        isPlaylistedByCurrentUser={isPlaylistedByCurrentUser}
        isPlaylisting={isPlaylisting}
        onTogglePlaylist={handleTogglePlaylist}
        isMorchiaByCurrentUser={isMorchiaByCurrentUser}
        currentMorchiaCount={currentMorchiaCount}
        isTogglingMorchia={isTogglingMorchia}
        onToggleMorchia={handleToggleMorchia}
        userReview={userReview}
        userOverallScore={userOverallScore}
        onRefreshBggData={handleRefreshBggData}
        isFetchingDetailsFor={isFetchingDetailsFor}
        isPendingBggDetailsFetch={isPendingBggDetailsFetch}
        onFetchBggPlays={handleFetchBggPlays}
        isFetchingPlays={isFetchingPlays}
        topWinnerStats={topWinnerStats}
        highestScoreAchieved={highestScoreAchieved}
      />

      {game.lctr01PlayDetails && game.lctr01PlayDetails.length > 0 && (
        <Card className="shadow-md border border-border rounded-lg">
          <CardHeader className="flex flex-row justify-between items-center">
            <CardTitle className="text-xl flex items-center gap-2">
              <Dices className="h-5 w-5 text-primary"/>
              Partite Registrate
            </CardTitle>
              {game.lctr01PlayDetails.length > 0 && <Badge variant="secondary">{game.lctr01PlayDetails.length}</Badge>}
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {game.lctr01PlayDetails.map((play) => {
                  const winners = play.players?.filter(p => p.didWin) || [];
                  const winnerNames = winners.map(p => p.name || p.username || 'Sconosciuto').join(', ');
                  return (
                  <AccordionItem value={`play-${play.playId}`} key={play.playId}>
                      <AccordionTrigger className="hover:no-underline text-left py-3 text-sm">
                        <div className="flex justify-between w-full items-center pr-2 gap-2">
                          <div className="flex items-center gap-2">
                              <CalendarIcon size={16} className="text-muted-foreground/80 flex-shrink-0 relative top-px" />
                              <span className="font-medium">{formatReviewDate(play.date)}</span>
                              {play.quantity > 1 && (
                                  <>
                                      <span className="text-muted-foreground mx-1">-</span>
                                      <span>{play.quantity} partite</span>
                                  </>
                              )}
                              {play.players && play.players.length > 0 && (
                                <span className="flex items-center gap-1 text-muted-foreground ml-2">
                                  <Users size={14} className="flex-shrink-0 relative top-px" />
                                  {play.players.length}
                                </span>
                              )}
                          </div>
                          {winners.length > 0 && (
                                <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300 whitespace-nowrap">
                                  <Trophy className="mr-1 h-3.5 w-3.5"/> {winnerNames}
                                </Badge>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-4 text-sm">
                        <div className="space-y-3">
                           {play.comments && play.comments.trim() !== '' && (
                            <div className="grid grid-cols-[auto_1fr] gap-x-2 items-baseline pt-2 border-t border-dashed">
                                <strong className="text-muted-foreground text-xs">Commenti:</strong>
                                <p className="text-xs whitespace-pre-wrap">{play.comments}</p>
                            </div>
                          )}
                          {play.players && play.players.length > 0 && (
                            <div className="pt-2 border-t border-dashed">
                                <ul className="space-y-0.5">
                                {play.players
                                    .slice()
                                    .sort((a, b) => {
                                        const scoreA = parseInt(a.score || "0", 10);
                                        const scoreB = parseInt(b.score || "0", 10);
                                        return scoreB - scoreA;
                                    })
                                    .map((player, pIndex) => (
                                    <li key={pIndex} className={cn(
                                        `flex items-center justify-between text-xs border-b border-border last:border-b-0 py-1.5 px-2`,
                                        pIndex % 2 === 0 ? 'bg-muted/30' : ''
                                    )}>
                                        <div className="flex items-center gap-1.5 flex-grow min-w-0">
                                            <UserCircle2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 relative top-px" />
                                            <span className={cn("truncate", player.didWin ? 'font-semibold' : '')} title={player.name || player.username || 'Sconosciuto'}>
                                                {player.name || player.username || 'Sconosciuto'}
                                            </span>
                                            {player.didWin && (
                                                <Trophy className="ml-1 h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                                            )}
                                            {player.isNew && (
                                                <Sparkles className="ml-1 h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                                            )}
                                        </div>
                                        {player.score && (
                                        <span className={cn("font-mono text-xs whitespace-nowrap ml-2", player.didWin ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                                            {player.score} punti
                                        </span>
                                        )}
                                    </li>
                                ))}
                                </ul>
                            </div>
                          )}
                           {(play.location && play.location.trim() !== '') && (
                              <div className="grid grid-cols-[auto_1fr] gap-x-2 items-baseline pt-2 border-t border-dashed mt-3">
                                <strong className="text-muted-foreground text-xs">Luogo:</strong>
                                <p className="text-xs whitespace-pre-wrap">{play.location}</p>
                              </div>
                            )}
                        </div>
                      </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </CardContent>
        </Card>
      )}

      {/* User's Review Section */}
      <div className="space-y-4">
        {currentUser && userReview && (
            <div className="flex flex-row items-center justify-between gap-2">
                <h3 className="text-xl font-semibold text-foreground mr-2 flex-grow">La Tua Valutazione</h3>
                <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                <Button asChild size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                    <Link href={`/games/${gameId}/rate`}>
                    <span className="flex items-center">
                        <Edit className="mr-0 sm:mr-2 h-4 w-4" />
                        <span className="hidden sm:inline">Modifica</span>
                    </span>
                    </Link>
                </Button>
                <AlertDialog open={showDeleteConfirmDialog} onOpenChange={setShowDeleteConfirmDialog}>
                   <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={isDeletingReview}>
                        <span className="flex items-center">
                        {isDeletingReview ? <Loader2 className="mr-0 sm:mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-0 sm:mr-2 h-4 w-4" />}
                        <span className="hidden sm:inline">Elimina</span>
                        </span>
                    </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
                    <AlertDescription>
                        Questa azione non può essere annullata. Eliminerà permanentemente il tuo voto per {game.name}.
                    </AlertDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmDeleteUserReview} className="bg-destructive hover:bg-destructive/90">
                        {isDeletingReview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Conferma Eliminazione" }
                    </AlertDialogAction>
                    </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
                </div>
            </div>
        )}
        {userReview && <ReviewList reviews={[userReview]} />}
      </div>

      {/* Other Reviews Section */}
      {remainingReviews.length > 0 && (
        <>
          <Separator className="my-6" />
          <h2 className="text-2xl font-semibold text-foreground mb-6 flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-primary"/>
            {userReview ? `Altri Voti (${remainingReviews.length})` : `Voti (${remainingReviews.length})`}
          </h2>
          <ReviewList reviews={remainingReviews} />
        </>
      )}
      {/* Empty States for Other Reviews */}
      {remainingReviews.length === 0 && !isLoadingGame && game.reviews && game.reviews.length > 0 && userReview && (
          <Alert variant="default" className="bg-secondary/30 border-secondary mt-6">
            <UserCheck className="h-4 w-4" />
            <AlertTitle>Sei l'Unico!</AlertTitle>
             <AlertDescription>
              Per ora, la tua è l'unica valutazione per questo gioco.
            </AlertDescription>
          </Alert>
        )}
      {remainingReviews.length === 0 && !isLoadingGame && (!game.reviews || game.reviews.length === 0) && !userReview && (
          <Alert variant="default" className="bg-secondary/30 border-secondary mt-6">
            <UserCheck className="h-4 w-4" />
            <AlertTitle>Nessuna valutazione ancora per questo gioco.</AlertTitle>
            <AlertDescription>
              Sii il primo a condividere la tua opinione!
            </AlertDescription>
          </Alert>
        )}

      {/* AI Recommendations Section */}
      {currentUser && (
        <div className="pt-8">
          <Card className="shadow-md border border-border rounded-lg">
          <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                  <Wand2 className="h-5 w-5 text-primary" />
                  Potrebbe Piacerti Anche
              </CardTitle>
              <CardDescription>
                  Suggerimenti AI basati su questo gioco dal nostro catalogo.
              </CardDescription>
          </CardHeader>
          <CardContent>
              <Button onClick={handleGenerateRecommendations} disabled={isFetchingRecommendations} className="w-full sm:w-auto mb-4">
                  {isFetchingRecommendations ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                  <Wand2 className="mr-2 h-4 w-4" />
                  )}
                  {enrichedAiRecommendations.length > 0 ? "Ottieni Nuovi Suggerimenti" : "Ottieni Suggerimenti AI"}
              </Button>

              {recommendationError && (
                  <Alert variant="destructive" className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Errore Suggerimenti AI</AlertTitle>
                  <AlertDescription>{recommendationError}</AlertDescription>
                  </Alert>
              )}
              {enrichedAiRecommendations.length > 0 && (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {enrichedAiRecommendations.map((rec) => {
                    const isRecFavorited = currentUser ? rec.favoritedByUserIds?.includes(currentUser.uid) : false;
                    const isRecPlaylisted = currentUser ? rec.playlistedByUserIds?.includes(currentUser.uid) : false;
                    const recFallbackSrc = `https://placehold.co/64x96.png?text=${encodeURIComponent(rec.name?.substring(0,3) || 'N/A')}`;
                    return (
                      <Card key={rec.id} className="p-3 border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors flex flex-col justify-between">
                        <div className="flex flex-row items-start gap-3">
                          <div className="relative w-16 h-24 flex-shrink-0 rounded-md overflow-hidden shadow-sm">
                            <SafeImage
                              src={rec.coverArtUrl}
                              fallbackSrc={recFallbackSrc}
                              alt={`${rec.name} copertina`}
                              fill
                              className="object-cover"
                              data-ai-hint={`board game ${rec.name.split(' ')[0]?.toLowerCase() || 'mini'}`}
                              sizes="64px"
                            />
                          </div>
                          <div className="flex-1 flex flex-col">
                            <div className="flex justify-between items-center mb-1">
                              <Link href={`/games/${rec.id}`} className="group">
                                <h5 className="font-semibold text-primary group-hover:underline line-clamp-2">{rec.name}</h5>
                              </Link>
                              {currentUser && (
                                <div className="flex items-center gap-0.5">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={async () => {
                                      const targetGame = allGamesForAICatalog.find(g => g.id === rec.id);
                                      if (targetGame && currentUser) {
                                          const originalGameContext = game;
                                          setGame(targetGame);
                                          await handleToggleFavorite();
                                          setGame(originalGameContext);

                                          const updatedRecs = enrichedAiRecommendations.map(r =>
                                              r.id === rec.id ? { ...r,
                                                  favoritedByUserIds: isRecFavorited
                                                      ? (r.favoritedByUserIds || []).filter(id => id !== currentUser.uid)
                                                      : [...(r.favoritedByUserIds || []), currentUser.uid],
                                                  favoriteCount: (r.favoriteCount || 0) + (isRecFavorited ? -1 : 1)
                                              } : r
                                          );
                                          setEnrichedAiRecommendations(updatedRecs);
                                      }
                                    }}
                                    disabled={isFavoriting || authLoading}
                                    title={isRecFavorited ? "Rimuovi dai Preferiti" : "Aggiungi ai Preferiti"}
                                    className={`h-7 w-7 p-1 ${isRecFavorited ? 'text-destructive hover:bg-destructive/20' : 'text-destructive/60 hover:text-destructive hover:bg-destructive/10'}`}
                                  >
                                    <Heart className={`h-4 w-4 ${isRecFavorited ? 'fill-destructive' : ''}`} />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                     onClick={async () => {
                                      const targetGame = allGamesForAICatalog.find(g => g.id === rec.id);
                                      if(targetGame && currentUser) {
                                        const originalGameContext = game;
                                        setGame(targetGame);
                                        await handleTogglePlaylist();
                                        setGame(originalGameContext);
                                        const updatedRecs = enrichedAiRecommendations.map(r =>
                                          r.id === rec.id ? { ...r,
                                              playlistedByUserIds: isRecPlaylisted
                                                  ? (r.playlistedByUserIds || []).filter(id => id !== currentUser.uid)
                                                  : [...(r.playlistedByUserIds || []), currentUser.uid]
                                          } : r
                                        );
                                        setEnrichedAiRecommendations(updatedRecs);
                                      }
                                    }}
                                    disabled={isPlaylisting || authLoading}
                                    title={isRecPlaylisted ? "Rimuovi dalla Playlist" : "Aggiungi alla Playlist"}
                                    className={`h-7 w-7 p-1 ${isRecPlaylisted ? 'text-sky-500 hover:bg-sky-500/20' : 'text-sky-500/60 hover:text-sky-500 hover:bg-sky-500/10'}`}
                                  >
                                    {isRecPlaylisted ? <BookMarked className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                                  </Button>
                                </div>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 mb-1">{rec.reason}</p>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
          </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

    