'use client';

import type { ChangeEvent } from 'react';
import { useEffect, useState, useTransition, useCallback, use, useMemo } from 'react';
import Link from 'next/link';
import { getGameDetails, revalidateGameDataAction, fetchUserPlaysForGameFromBggAction, fetchAndUpdateBggGameDetailsAction, getAllGamesAction } from '@/lib/actions';
import { recommendGames } from '@/ai/flows/recommend-games';
import type { BoardGame, Review, Rating as RatingType, GroupedCategoryAverages, BggPlayDetail, BggPlayerInPlay, RecommendedGame as AIRecommendedGame, UserProfile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  AlertCircle, Loader2, Info, Edit, Trash2, Users, Clock, CalendarDays as CalendarIcon, ExternalLink, Weight, PenTool, Dices, MessageSquare, Heart, Settings, Trophy, Medal, UserCircle2, Star, Palette, ClipboardList, Repeat, Sparkles, Pin, PinOff, Wand2, DownloadCloud, Bookmark, BookMarked, Frown
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/auth-context';
import { calculateGroupedCategoryAverages, calculateOverallCategoryAverage, formatRatingNumber, formatPlayDate, formatReviewDate, calculateCategoryAverages as calculateCatAvgsFromUtils } from '@/lib/utils';
import { GroupedRatingsDisplay } from '@/components/boardgame/grouped-ratings-display';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, deleteDoc, updateDoc, getDocs, collection, getDoc, arrayUnion, arrayRemove, increment, writeBatch, serverTimestamp, setDoc, query, where, getCountFromServer } from 'firebase/firestore'; // Added query, where, getCountFromServer
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
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SafeImage } from '@/components/common/SafeImage';
import { ReviewItem } from '@/components/boardgame/review-item';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';


const FIRESTORE_COLLECTION_NAME = 'boardgames_collection';
const USER_PROFILES_COLLECTION = 'user_profiles';

interface GameDetailPageProps {
  params: Promise<{
    gameId: string;
  }>;
}

interface EnrichedAIRecommendedGame extends AIRecommendedGame {
  coverArtUrl?: string | null;
  favoritedByUserIds?: string[];
  playlistedByUserIds?: string[];
  favoriteCount?: number;
}


export default function GameDetailPage({ params }: GameDetailPageProps) {
  const resolvedParams = use(params);
  const { gameId } = resolvedParams;

  const { user: currentUser, loading: authLoading, isAdmin } = useAuth();
  const { toast } = useToast();

  const [game, setGame] = useState<BoardGame | null>(null);
  const [isLoadingGame, setIsLoadingGame] = useState(true);

  const [userReview, setUserReview] = useState<Review | undefined>(undefined);
  const [remainingReviews, setRemainingReviews] = useState<Review[]>([]);
  const [groupedCategoryAverages, setGroupedCategoryAveragesState] = useState<GroupedCategoryAverages | null>(null);
  const [globalGameAverage, setGlobalGameAverage] = useState<number | null>(null);

  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [isDeletingReview, startDeleteReviewTransition] = useTransition();

  const [currentIsPinned, setCurrentIsPinned] = useState(false);
  const [isPinToggling, startPinToggleTransition] = useTransition();


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

  const [isFetchingPlays, startFetchPlaysTransition] = useTransition();

  const [aiRecommendations, setAiRecommendations] = useState<AIRecommendedGame[]>([]);
  const [enrichedAiRecommendations, setEnrichedAiRecommendations] = useState<EnrichedAIRecommendedGame[]>([]);
  const [allGamesForAICatalog, setAllGamesForAICatalog] = useState<BoardGame[]>([]);
  const [isFetchingRecommendations, startFetchingRecommendationsTransition] = useTransition();
  const [recommendationError, setRecommendationError] = useState<string | null>(null);


  const fetchGameData = useCallback(async () => {
    setIsLoadingGame(true);
    const gameData = await getGameDetails(gameId);
    setGame(gameData);

    if (gameData) {
      setCurrentIsPinned(gameData.isPinned || false);
      setCurrentFavoriteCount(gameData.favoriteCount || 0);
      setCurrentMorchiaCount(gameData.morchiaCount || 0);

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


      if (gameData.reviews && gameData.reviews.length > 0) {
        const categoryAvgs = calculateCatAvgsFromUtils(gameData.reviews);
        if (categoryAvgs) {
          setGlobalGameAverage(calculateOverallCategoryAverage(categoryAvgs));
        } else {
          setGlobalGameAverage(null);
        }
        setGroupedCategoryAveragesState(calculateGroupedCategoryAverages(gameData.reviews));
      } else {
        setGlobalGameAverage(null);
        setGroupedCategoryAveragesState(null);
      }

    } else {
      setCurrentIsPinned(false);
      setIsFavoritedByCurrentUser(false);
      setCurrentFavoriteCount(0);
      setIsPlaylistedByCurrentUser(false);
      setIsMorchiaByCurrentUser(false);
      setCurrentMorchiaCount(0);
      setUserReview(undefined);
      setRemainingReviews([]);
      setGroupedCategoryAveragesState(null);
      setGlobalGameAverage(null);
    }
    setIsLoadingGame(false);
  }, [gameId, currentUser, authLoading]);

  useEffect(() => {
    fetchGameData();
  }, [fetchGameData]);


  useEffect(() => {
    if (game) {
      setCurrentIsPinned(game.isPinned || false);
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
        const rating: RatingType = {
            excitedToReplay: reviewDocData.rating?.excitedToReplay || 0,
            mentallyStimulating: reviewDocData.rating?.mentallyStimulating || 0,
            fun: reviewDocData.rating?.fun || 0,
            decisionDepth: reviewDocData.rating?.decisionDepth || 0,
            replayability: reviewDocData.rating?.replayability || 0,
            luck: reviewDocData.rating?.luck || 0,
            lengthDowntime: reviewDocData.rating?.lengthDowntime || 0,
            graphicDesign: reviewDocData.rating?.graphicDesign || 0,
            componentsThemeLore: reviewDocData.rating?.componentsThemeLore || 0,
            effortToLearn: reviewDocData.rating?.effortToLearn || 0,
            setupTeardown: reviewDocData.rating?.setupTeardown || 0,
        };
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

      revalidateGameDataAction(game.id);
      fetchGameData();
    } catch (error) {
      console.error("Errore durante l'aggiornamento del punteggio medio del gioco:", error);
      toast({ title: "Errore", description: "Impossibile aggiornare il punteggio medio del gioco.", variant: "destructive" });
    }
  }, [game, toast, fetchGameData]);


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
        await updateGameOverallRatingAfterDelete();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Si è verificato un errore sconosciuto.";
        toast({ title: "Errore", description: `Impossibile eliminare il voto: ${errorMessage}`, variant: "destructive" });
      }
    });
  };

  const handleTogglePinGame = async () => {
    if (!game || authLoading || !isAdmin) return;
    startPinToggleTransition(async () => {
      const newPinStatus = !currentIsPinned;
      const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
      try {
        await updateDoc(gameRef, {
          isPinned: newPinStatus
        });
        setCurrentIsPinned(newPinStatus);
        setGame(prevGame => prevGame ? { ...prevGame, isPinned: newPinStatus } : null);
        toast({
          title: "Stato Vetrina Aggiornato",
          description: `Il gioco è stato ${newPinStatus ? 'aggiunto alla' : 'rimosso dalla'} vetrina.`,
        });
        revalidateGameDataAction(game.id);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Si è verificato un errore sconosciuto.";
        toast({
          title: "Errore Aggiornamento Vetrina",
          description: `Impossibile aggiornare lo stato vetrina: ${errorMessage}`,
          variant: "destructive",
        });
        setCurrentIsPinned(!newPinStatus); 
      }
    });
  };

  const handleToggleFavorite = async (targetGameId: string, targetGameName?: string) => {
    if (!currentUser || !targetGameId || authLoading) {
      toast({ title: "Azione non permessa", description: "Devi essere loggato per aggiungere ai preferiti.", variant: "destructive" });
      return;
    }
    const currentTargetGame = targetGameId === game?.id ? game : allGamesForAICatalog.find(g => g.id === targetGameId);
    if (!currentTargetGame) {
      toast({ title: "Errore", description: "Gioco non trovato.", variant: "destructive" });
      return;
    }

    const isCurrentlyFavorited = currentTargetGame.favoritedByUserIds?.includes(currentUser.uid) || false;
    const nameToDisplay = targetGameName || currentTargetGame.name;


    if (targetGameId === game?.id) {
      setIsFavoritedByCurrentUser(!isCurrentlyFavorited);
      setCurrentFavoriteCount(prev => isCurrentlyFavorited ? Math.max(0, prev -1) : prev + 1);
    }
    setEnrichedAiRecommendations(prevRecs =>
      prevRecs.map(rec => {
        if (rec.id === targetGameId) {
          const newFavIds = isCurrentlyFavorited
            ? (rec.favoritedByUserIds || []).filter(uid => uid !== currentUser.uid)
            : [...(rec.favoritedByUserIds || []), currentUser.uid];
          return {
            ...rec,
            favoritedByUserIds: newFavIds,
            favoriteCount: newFavIds.length,
          };
        }
        return rec;
      })
    );


    startFavoriteTransition(async () => {
      const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, targetGameId);
      try {
        const gameSnap = await getDoc(gameRef);
        if (!gameSnap.exists()) throw new Error("Gioco non trovato nel DB.");
        
        const gameDataFromSnap = gameSnap.data() as BoardGame;
        const currentFavoritedByUserIdsOnDb = gameDataFromSnap.favoritedByUserIds || [];
        let newFavoriteCountOnDb = gameDataFromSnap.favoriteCount || 0;
        let finalFavoritedStatus = false;

        if (currentFavoritedByUserIdsOnDb.includes(currentUser.uid)) {
          await updateDoc(gameRef, {
            favoritedByUserIds: arrayRemove(currentUser.uid),
            favoriteCount: increment(-1)
          });
          newFavoriteCountOnDb = Math.max(0, newFavoriteCountOnDb - 1);
          finalFavoritedStatus = false;
        } else {
          await updateDoc(gameRef, {
            favoritedByUserIds: arrayUnion(currentUser.uid),
            favoriteCount: increment(1)
          });
          newFavoriteCountOnDb = newFavoriteCountOnDb + 1;
          finalFavoritedStatus = true;
        }

        toast({
          title: finalFavoritedStatus ? "Aggiunto ai Preferiti!" : "Rimosso dai Preferiti",
          description: `${nameToDisplay} è stato ${finalFavoritedStatus ? 'aggiunto ai' : 'rimosso dai'} tuoi preferiti.`,
        });
        
        revalidateGameDataAction(targetGameId);
        if (targetGameId === game?.id) {
          fetchGameData();
        } else {
           setEnrichedAiRecommendations(prevRecs =>
            prevRecs.map(rec => rec.id === targetGameId ? {
                ...rec,
                favoritedByUserIds: finalFavoritedStatus ? [...(rec.favoritedByUserIds || []), currentUser.uid] : (rec.favoritedByUserIds || []).filter(uid => uid !== currentUser.uid),
                favoriteCount: newFavoriteCountOnDb
            } : rec)
          );
        }
        
        
        if (finalFavoritedStatus) {
            const userProfileRef = doc(db, USER_PROFILES_COLLECTION, currentUser.uid);
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
                            title: "Distintivo Guadagnato!",
                            description: "Complimenti! Hai ricevuto: Collezionista di Cuori!",
                            icon: <HeartPulse className="h-5 w-5 text-pink-500" />,
                        });
                    }
                }
            }
        }


      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Impossibile aggiornare i preferiti.";
        toast({ title: "Errore", description: errorMessage, variant: "destructive" });
        if (targetGameId === game?.id) {
          setIsFavoritedByCurrentUser(isCurrentlyFavorited);
          setCurrentFavoriteCount(prev => isCurrentlyFavorited ? prev + 1 : Math.max(0, prev -1 ));
        }
         setEnrichedAiRecommendations(prevRecs =>
            prevRecs.map(rec => {
                if (rec.id === targetGameId) {
                    return {
                        ...rec,
                        favoritedByUserIds: currentTargetGame.favoritedByUserIds,
                        favoriteCount: currentTargetGame.favoriteCount,
                    };
                }
                return rec;
            })
        );
      }
    });
  };

  const handleTogglePlaylist = async (targetGameId: string, targetGameName?: string) => {
    if (!currentUser || !targetGameId || authLoading) {
      toast({ title: "Azione non permessa", description: "Devi essere loggato per aggiungere alla playlist.", variant: "destructive" });
      return;
    }

    const currentTargetGame = targetGameId === game?.id ? game : allGamesForAICatalog.find(g => g.id === targetGameId);
    if (!currentTargetGame) {
        toast({ title: "Errore", description: "Gioco non trovato.", variant: "destructive" });
        return;
    }
    const isCurrentlyPlaylisted = currentTargetGame.playlistedByUserIds?.includes(currentUser.uid) || false;
    const nameToDisplay = targetGameName || currentTargetGame.name;

    if (targetGameId === game?.id) {
        setIsPlaylistedByCurrentUser(!isCurrentlyPlaylisted);
    }
    setEnrichedAiRecommendations(prevRecs =>
        prevRecs.map(rec =>
            rec.id === targetGameId ? {
                ...rec,
                playlistedByUserIds: isCurrentlyPlaylisted
                    ? (rec.playlistedByUserIds || []).filter(uid => uid !== currentUser.uid)
                    : [...(rec.playlistedByUserIds || []), currentUser.uid],
            } : rec
        )
    );


    startPlaylistTransition(async () => {
      const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, targetGameId);
      try {
        const gameSnap = await getDoc(gameRef);
        if (!gameSnap.exists()) throw new Error("Gioco non trovato nel DB.");

        const gameDataFromSnap = gameSnap.data() as BoardGame;
        const currentPlaylistedByUserIdsOnDb = gameDataFromSnap.playlistedByUserIds || [];
        let finalPlaylistedStatus = false;

        if (currentPlaylistedByUserIdsOnDb.includes(currentUser.uid)) {
          await updateDoc(gameRef, {
            playlistedByUserIds: arrayRemove(currentUser.uid)
          });
          finalPlaylistedStatus = false;
        } else {
          await updateDoc(gameRef, {
            playlistedByUserIds: arrayUnion(currentUser.uid)
          });
          finalPlaylistedStatus = true;
        }

        toast({
          title: finalPlaylistedStatus ? "Aggiunto alla Playlist!" : "Rimosso dalla Playlist",
          description: `${nameToDisplay} è stato ${finalPlaylistedStatus ? 'aggiunto alla' : 'rimosso dalla'} tua playlist.`,
        });

        revalidateGameDataAction(targetGameId);
         if (targetGameId === game?.id) {
          fetchGameData();
        } else {
           setEnrichedAiRecommendations(prevRecs =>
            prevRecs.map(rec => rec.id === targetGameId ? {
                ...rec,
                playlistedByUserIds: finalPlaylistedStatus ? [...(rec.playlistedByUserIds || []), currentUser.uid] : (rec.playlistedByUserIds || []).filter(uid => uid !== currentUser.uid)
            } : rec)
          );
        }
        
        
        if (finalPlaylistedStatus) {
            const userProfileRef = doc(db, USER_PROFILES_COLLECTION, currentUser.uid);
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
                            title: "Distintivo Guadagnato!",
                            description: "Complimenti! Hai ricevuto: Maestro di Playlist!",
                            icon: <ListMusic className="h-5 w-5 text-purple-500" />,
                        });
                    }
                }
            }
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Impossibile aggiornare la playlist.";
        toast({ title: "Errore", description: errorMessage, variant: "destructive" });
        if (targetGameId === game?.id) {
            setIsPlaylistedByCurrentUser(isCurrentlyPlaylisted);
        }
        setEnrichedAiRecommendations(prevRecs =>
            prevRecs.map(rec => {
                if (rec.id === targetGameId) {
                    return { ...rec, playlistedByUserIds: currentTargetGame.playlistedByUserIds };
                }
                return rec;
            })
        );
      }
    });
  };


  const handleToggleMorchia = async () => {
    if (!currentUser || !game || authLoading) {
      toast({ title: "Azione non permessa", description: "Devi essere loggato per aggiungere alle Morchie.", variant: "destructive" });
      return;
    }
    startMorchiaTransition(async () => {
      const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
      let originalMorchiaStatus = isMorchiaByCurrentUser;
      let originalMorchiaCount = currentMorchiaCount;
      try {
        const gameSnap = await getDoc(gameRef);
        if (!gameSnap.exists()) {
          toast({ title: "Errore", description: "Gioco non trovato.", variant: "destructive" });
          return;
        }

        const gameDataFromSnap = gameSnap.data() as BoardGame;
        const currentMorchiaByUserIds = gameDataFromSnap.morchiaByUserIds || [];
        let newMorchiaCount = gameDataFromSnap.morchiaCount || 0;
        let newMorchiaStatus = false;
        

        if (currentMorchiaByUserIds.includes(currentUser.uid)) {
          await updateDoc(gameRef, {
            morchiaByUserIds: arrayRemove(currentUser.uid),
            morchiaCount: increment(-1)
          });
          newMorchiaCount = Math.max(0, newMorchiaCount - 1);
          newMorchiaStatus = false;
          toast({
            title: "Rimosso dalle Morchie",
            description: `${game.name} è stato rimosso dalle morchie.`,
          });
        } else {
          await updateDoc(gameRef, {
            morchiaByUserIds: arrayUnion(currentUser.uid),
            morchiaCount: increment(1)
          });
          newMorchiaCount = newMorchiaCount + 1;
          newMorchiaStatus = true;
          toast({
            title: "Aggiunto alle Morchie!",
            description: `${game.name} è stato aggiunto alla lista morchia.`,
          });
          
          
          const userProfileRef = doc(db, USER_PROFILES_COLLECTION, currentUser.uid);
          const userProfileSnap = await getDoc(userProfileRef);
          if (userProfileSnap.exists()){
              const userProfileData = userProfileSnap.data() as UserProfile;
              const morchiaBadgeRef = doc(userProfileRef, 'earned_badges', 'morchia_hunter_5');
              const morchiaBadgeSnap = await getDoc(morchiaBadgeRef);

              if (!morchiaBadgeSnap.exists()) {
                  const morchiaQuery = query(collection(db, FIRESTORE_COLLECTION_NAME), where('morchiaByUserIds', 'array-contains', currentUser.uid));
                  const morchiaSnapshot = await getCountFromServer(morchiaQuery);
                  const totalMorchiaMarked = morchiaSnapshot.data().count;

                  if (totalMorchiaMarked >= 5) {
                      const badgeData = {
                          badgeId: 'morchia_hunter_5',
                          name: 'Cacciatore di Morchie',
                          description: 'Hai contrassegnato 5 giochi come "morchia"!',
                          iconName: 'Trash2' as const,
                          earnedAt: serverTimestamp(),
                      };
                      await setDoc(morchiaBadgeRef, badgeData);
                      toast({
                          title: "Distintivo Guadagnato!",
                          description: "Complimenti! Hai ricevuto il distintivo: Cacciatore di Morchie!",
                          icon: <Trash2 className="h-5 w-5 text-orange-500" />,
                      });
                  }
              }
          }
        }

        setIsMorchiaByCurrentUser(newMorchiaStatus);
        setCurrentMorchiaCount(newMorchiaCount);
        setGame(prevGame => prevGame ? {
          ...prevGame,
          morchiaCount: newMorchiaCount,
          morchiaByUserIds: newMorchiaStatus
            ? [...(prevGame.morchiaByUserIds || []), currentUser.uid]
            : (prevGame.morchiaByUserIds || []).filter(uid => uid !== currentUser.uid)
        } : null);
        
        revalidateGameDataAction(game.id);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Impossibile aggiornare la Morchia List.";
        toast({ title: "Errore", description: errorMessage, variant: "destructive" });
         setIsMorchiaByCurrentUser(originalMorchiaStatus);
         setCurrentMorchiaCount(originalMorchiaCount);
         setGame(prevGame => prevGame ? {
          ...prevGame,
          morchiaCount: originalMorchiaCount,
          morchiaByUserIds: originalMorchiaStatus
            ? [...(prevGame.morchiaByUserIds || []), currentUser.uid]
            : (prevGame.morchiaByUserIds || []).filter(uid => uid !== currentUser.uid)
        } : null);
      }
    });
  };


  const handleRefreshBggData = async () => {
    if (!game || !game.id || !game.bggId) return;

    setIsFetchingDetailsFor(game.id);
    startBggDetailsFetchTransition(async () => {
      const serverActionResult = await fetchAndUpdateBggGameDetailsAction(game.bggId);

      if (!serverActionResult.success || !serverActionResult.updateData) {
        toast({ title: 'Errore Recupero Dati BGG', description: serverActionResult.error || 'Impossibile recuperare dati da BGG.', variant: 'destructive' });
        setIsFetchingDetailsFor(null);
        return;
      }

      if (Object.keys(serverActionResult.updateData).length === 0) {
        toast({ title: 'Nessun Aggiornamento', description: `Nessun nuovo dettaglio da aggiornare per ${game.name} da BGG.` });
        setIsFetchingDetailsFor(null);
        return;
      }

      try {
        const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
        await updateDoc(gameRef, serverActionResult.updateData);
        toast({ title: 'Dettagli Aggiornati', description: `Dettagli per ${game.name} aggiornati con successo.` });
        revalidateGameDataAction(game.id);
        fetchGameData();
      } catch (dbError) {
        const errorMessage = dbError instanceof Error ? dbError.message : "Errore sconosciuto durante l'aggiornamento del DB.";
        toast({ title: 'Errore Aggiornamento Database', description: errorMessage, variant: 'destructive' });
      } finally {
        setIsFetchingDetailsFor(null);
      }
    });
  };

 const handleFetchBggPlays = async () => {
    if (!game || !game.id || !game.bggId || authLoading || !currentUser ) return;

    const usernameToFetch = "lctr01";

    startFetchPlaysTransition(async () => {
        const bggFetchResult = await fetchUserPlaysForGameFromBggAction(game.bggId, usernameToFetch);

        if (!bggFetchResult.success || !bggFetchResult.plays) {
            toast({ title: 'Errore Caricamento Partite BGG', description: bggFetchResult.error || bggFetchResult.message || 'Impossibile caricare le partite da BGG.', variant: 'destructive' });
            return;
        }

        const playsToSave = bggFetchResult.plays;
        const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);

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
            
            batch.update(gameRef, { lctr01Plays: playsToSave.length });

            try {
                await batch.commit();
                toast({
                    title: "Partite Caricate e Salvate!",
                    description: bggFetchResult.message || `Caricate e salvate ${playsToSave.length} partite per ${game.name}. Conteggio aggiornato.`,
                });
                revalidateGameDataAction(game.id);
                fetchGameData();
            } catch (dbError) {
                const errorMessage = dbError instanceof Error ? dbError.message : "Impossibile salvare le partite nel database.";
                toast({ title: 'Errore Salvataggio Partite DB', description: errorMessage, variant: 'destructive' });
            }
        } else {
             try {
                await updateDoc(gameRef, { lctr01Plays: 0 });
                toast({
                    title: "Nessuna Partita Trovata",
                    description: bggFetchResult.message || `Nessuna partita trovata su BGG per ${usernameToFetch} per questo gioco. Conteggio azzerato.`,
                });
                revalidateGameDataAction(game.id);
                fetchGameData();
            } catch (dbError) {
                 // Silently ignore error if updating play count to 0 fails
            }
        }
    });
};


const handleGenerateRecommendations = async () => {
    if (!game) return;
    setAiRecommendations([]);
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

  const topWinnerStats = useMemo(() => {
    if (!game || !game.lctr01PlayDetails || game.lctr01PlayDetails.length === 0) {
      return null;
    }
    const playerStats: Map<string, { wins: number; totalScore: number; name: string }> = new Map();
    game.lctr01PlayDetails.forEach(play => {
      if (play.players && play.players.length > 0) {
        play.players.forEach(p => {
          if (p.didWin) {
            const playerIdentifier = p.username || p.name;
            const displayName = p.name || p.username;
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
    let topPlayer: { wins: number; totalScore: number; name: string } | null = null;
    for (const stats of playerStats.values()) {
      if (!topPlayer || stats.wins > topPlayer.wins || (stats.wins === topPlayer.wins && stats.totalScore > topPlayer.totalScore)) {
        topPlayer = stats;
      }
    }
    return topPlayer ? { name: topPlayer.name, wins: topPlayer.wins } : null;
  }, [game]);

  const highestScoreAchieved = useMemo(() => {
    if (!game || !game.lctr01PlayDetails || game.lctr01PlayDetails.length === 0) {
      return null;
    }
    let maxScore = -Infinity;
    let scoreFound = false;
    game.lctr01PlayDetails.forEach(play => {
      if (play.players && play.players.length > 0) {
        play.players.forEach(p => {
          if (p.score) {
            const score = parseInt(p.score, 10);
            if (!isNaN(score)) {
              if (score > maxScore) maxScore = score;
              scoreFound = true;
            }
          }
        });
      }
    });
    return scoreFound ? maxScore : null;
  }, [game]);


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

  const fallbackSrc = `https://placehold.co/240x360.png?text=${encodeURIComponent(game.name?.substring(0,10) || 'N/A')}`;
  
  return (
    <div className="space-y-8">
      <Card className="overflow-hidden shadow-xl border border-border rounded-lg">
        <div className="flex flex-col">
           <div className="flex justify-between items-start p-6 pb-2 mb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-1 flex-shrink min-w-0 mr-2">
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-foreground">
                    {game.name}
                </h1>
            </div>
            <div className="flex-shrink-0 flex flex-col items-end">
                {globalGameAverage !== null && (
                  <span className="text-3xl md:text-4xl font-bold text-primary whitespace-nowrap flex items-center">
                    <Star className="h-6 w-6 md:h-7 md:w-7 text-accent fill-accent relative top-px mr-1" />
                    {formatRatingNumber(globalGameAverage * 2)}
                  </span>
                )}
            </div>
          </div>

          <div className="flex flex-col md:flex-row">
            <div className="flex-1 p-6 pt-0 space-y-4 md:order-1">
              <div className="md:hidden my-4 max-w-[240px] mx-auto">
                <div className="relative aspect-[2/3] w-full rounded-md overflow-hidden shadow-md">
                  <SafeImage
                    src={game.coverArtUrl}
                    alt={`${game.name} copertina`}
                    fallbackSrc={fallbackSrc}
                    fill
                    priority
                    className="object-cover"
                    data-ai-hint={`board game ${game.name.split(' ')[0]?.toLowerCase() || 'detailed'}`}
                    sizes="(max-width: 767px) 240px"
                  />
                </div>
              </div>
              
              <div className="flex justify-evenly items-center gap-1 sm:gap-2 py-4 border-t border-b border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggleFavorite(game.id, game.name)}
                  disabled={isFavoriting || authLoading || !currentUser}
                  title={isFavoritedByCurrentUser ? "Rimuovi dai Preferiti" : "Aggiungi ai Preferiti"}
                  className={cn(
                      `h-9 px-2`,
                      isFavoritedByCurrentUser ? 'text-destructive hover:bg-destructive/20' : 'text-destructive/60 hover:text-destructive hover:bg-destructive/10'
                  )}
                >
                  <Heart className={cn(`h-5 w-5`, isFavoritedByCurrentUser ? 'fill-destructive' : '')} />
                  {currentFavoriteCount > 0 && (
                  <span className="ml-1 text-xs">({currentFavoriteCount})</span>
                  )}
                </Button>
                
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleToggleMorchia}
                    disabled={isTogglingMorchia || authLoading || !currentUser}
                    title={isMorchiaByCurrentUser ? "Rimuovi da Morchie" : "Aggiungi alle Morchie"}
                    className={cn(
                        `h-9 px-2`,
                        isMorchiaByCurrentUser ? 'text-orange-600 hover:bg-orange-600/20' : 'text-orange-600/60 hover:text-orange-600 hover:bg-orange-600/10'
                    )}
                >
                    <Frown className={cn(`h-5 w-5`, isMorchiaByCurrentUser ? 'fill-orange-600/30' : '')} />
                    {currentMorchiaCount > 0 && (
                        <span className="ml-1 text-xs">({currentMorchiaCount})</span>
                    )}
                </Button>

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleTogglePlaylist(game.id, game.name)}
                    disabled={isPlaylisting || authLoading || !currentUser}
                    title={isPlaylistedByCurrentUser ? "Rimuovi dalla Playlist" : "Aggiungi alla Playlist"}
                    className={cn(
                        `h-9 px-2`,
                        isPlaylistedByCurrentUser ? 'text-sky-500 hover:bg-sky-500/20' : 'text-sky-500/60 hover:text-sky-500 hover:bg-sky-500/10'
                    )}
                >
                    {isPlaylistedByCurrentUser ? <BookMarked className="h-5 w-5" /> : <Bookmark className="h-5 w-5" />}
                    {game?.playlistedByUserIds && game.playlistedByUserIds.length > 0 && (
                        <span className="ml-1 text-xs">({game.playlistedByUserIds.length})</span>
                    )}
                </Button>

                <Button variant="ghost" size="icon" asChild className="h-9 w-9 text-primary/80 hover:text-primary hover:bg-primary/10" disabled={!game.bggId}>
                    <a href={`https://boardgamegeek.com/boardgame/${game.bggId}`} target="_blank" rel="noopener noreferrer" title="Vedi su BGG">
                        <ExternalLink className="h-5 w-5" />
                    </a>
                </Button>
                
                {isAdmin && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-primary/80 hover:text-primary hover:bg-primary/10">
                        <Settings className="h-5 w-5" />
                    </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                    <DropdownMenuItem
                        onSelect={handleTogglePinGame}
                        disabled={isPinToggling || authLoading}
                        className="cursor-pointer"
                    >
                        {isPinToggling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (currentIsPinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />)}
                        {currentIsPinned ? "Rimuovi da Vetrina" : "Aggiungi a Vetrina"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={handleRefreshBggData}
                        disabled={(isPendingBggDetailsFetch && isFetchingDetailsFor === game.id) || !game || !game.bggId}
                        className="cursor-pointer"
                    >
                        {(isPendingBggDetailsFetch && isFetchingDetailsFor === game.id) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DownloadCloud className="mr-2 h-4 w-4" />}
                        Aggiorna Dati da BGG
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={handleFetchBggPlays}
                        disabled={isFetchingPlays || !game || !game.id || !game.bggId || !currentUser}
                        className="cursor-pointer"
                    >
                        {isFetchingPlays ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Dices className="mr-2 h-4 w-4" />}
                        Carica Partite
                    </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-muted-foreground pt-1">
                 {game.designers && game.designers.length > 0 && (
                  <div className="flex items-baseline gap-2">
                    <PenTool size={14} className="text-primary/80 flex-shrink-0 relative top-px" />
                    <span className="font-medium hidden sm:inline">Autori:</span>
                    <span>{game.designers.join(', ')}</span>
                  </div>
                )}
                {game.yearPublished !== null && (
                  <div className="flex items-baseline gap-2"> {/* Removed justify-end */}
                    <CalendarIcon size={14} className="text-primary/80 flex-shrink-0 relative top-px" />
                    <span className="font-medium hidden sm:inline">Anno:</span>
                    <span>{game.yearPublished}</span>
                  </div>
                )}
                {(game.minPlayers !== null || game.maxPlayers !== null) && (
                  <div className="flex items-baseline gap-2">
                    <Users size={14} className="text-primary/80 flex-shrink-0 relative top-px" />
                    <span className="font-medium hidden sm:inline">Giocatori:</span>
                    <span>{game.minPlayers}{game.maxPlayers && game.minPlayers !== game.maxPlayers ? `-${game.maxPlayers}` : ''}</span>
                  </div>
                )}
                {(game.minPlaytime != null || game.maxPlaytime != null || game.playingTime != null) && (
                  <div className="flex items-baseline gap-2"> {/* Removed justify-end */}
                     <Clock size={14} className="text-primary/80 flex-shrink-0 relative top-px" />
                    <span className="font-medium hidden sm:inline">Durata:</span>
                    <span>
                      {game.minPlaytime != null && game.maxPlaytime != null ?
                        (game.minPlaytime === game.maxPlaytime ? `${game.minPlaytime} min` : `${game.minPlaytime} - ${game.maxPlaytime} min`)
                        : (game.playingTime != null ? `${game.playingTime} min` : '-')
                      }
                    </span>
                  </div>
                )}
                 {game.averageWeight !== null && typeof game.averageWeight === 'number' && (
                  <div className="flex items-baseline gap-2">
                    <Weight size={14} className="text-primary/80 flex-shrink-0 relative top-px" />
                    <span className="font-medium hidden sm:inline">Complessità:</span>
                    <span>{formatRatingNumber(game.averageWeight)} / 5</span>
                  </div>
                )}
                 {game.lctr01Plays !== null && (
                    <div className="flex items-baseline gap-2"> 
                        <Dices size={14} className="text-primary/80 flex-shrink-0 relative top-px" />
                        <span className="font-medium hidden sm:inline">Partite:</span>
                        <span>{game.lctr01Plays ?? 0}</span>
                    </div>
                )}
                {topWinnerStats && (
                  <div className="flex items-baseline gap-2">
                    <Trophy size={14} className="text-amber-500 flex-shrink-0 relative top-px" />
                    <span className="font-medium hidden sm:inline">Campione:</span>
                    <span>{topWinnerStats.name} ({topWinnerStats.wins} {topWinnerStats.wins === 1 ? 'vittoria' : 'vittorie'})</span>
                  </div>
                )}
                {highestScoreAchieved !== null && (
                  <div className="flex items-baseline gap-2"> 
                      <Medal size={14} className="text-amber-500 flex-shrink-0 relative top-px" />
                      <span className="font-medium hidden sm:inline">Miglior Punteggio:</span>
                      <span>{formatRatingNumber(highestScoreAchieved)} pt.</span>
                  </div>
                )}
              </div>
              
              {game.reviews && game.reviews.length > 0 && (
                  <div className="w-full pt-4 border-t border-border">
                    <h3 className="text-sm md:text-lg font-semibold text-foreground mb-3">Valutazione Media:</h3>
                    <GroupedRatingsDisplay
                        groupedAverages={groupedCategoryAverages}
                        noRatingsMessage="Nessuna valutazione per calcolare le medie."
                        isLoading={isLoadingGame}
                        defaultOpenSections={[]}
                    />
                  </div>
              )}
            </div>

            <div className="hidden md:block md:w-1/4 p-6 flex-shrink-0 self-start md:order-2 space-y-4">
              <div className="relative aspect-[2/3] w-full rounded-md overflow-hidden shadow-md">
                <SafeImage
                  src={game.coverArtUrl}
                  alt={`${game.name} copertina`}
                  fallbackSrc={fallbackSrc}
                  fill
                  priority
                  className="object-cover"
                  data-ai-hint={`board game ${game.name.split(' ')[0]?.toLowerCase() || 'detailed'}`}
                  sizes="25vw"
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {game.lctr01PlayDetails && game.lctr01PlayDetails.length > 0 && (
        <Card className="shadow-md border border-border rounded-lg">
          <CardHeader className="flex flex-row justify-between items-center">
            <CardTitle className="text-xl flex items-center gap-2">
              <Dices className="h-5 w-5 text-primary"/>
              Partite Registrate
            </CardTitle>
             <Badge variant="secondary">{game.lctr01PlayDetails.length}</Badge>
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
                              <CalendarIcon size={16} className="text-muted-foreground/80 flex-shrink-0" />
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
                           {play.location && play.location.trim() !== '' && (
                              <div className="grid grid-cols-[auto_1fr] gap-x-2 items-baseline">
                                <strong className="text-muted-foreground text-xs">Luogo:</strong>
                                <p className="text-xs whitespace-pre-wrap">{play.location}</p>
                              </div>
                            )}
                          {play.comments && play.comments.trim() !== '' && (
                            <div className="mt-1">
                                <strong className="text-xs text-muted-foreground">Commenti:</strong>
                                <p className="text-xs whitespace-pre-wrap">{play.comments}</p>
                            </div>
                          )}
                          {play.players && play.players.length > 0 && (
                            <div>
                                <ul className="pl-1">
                                {play.players
                                    .slice()
                                    .sort((a, b) => {
                                        const scoreA = parseInt(a.score || "0", 10);
                                        const scoreB = parseInt(b.score || "0", 10);
                                        return scoreB - scoreA;
                                    })
                                    .map((player, pIndex) => (
                                    <li key={pIndex} className={cn(
                                      "flex items-center justify-between text-xs border-b border-border last:border-b-0 py-1.5",
                                      pIndex % 2 === 0 ? 'bg-muted/30' : '', 
                                      "px-2"
                                    )}>
                                        <div className="flex items-center gap-1.5 flex-grow min-w-0">
                                            <UserCircle2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 relative top-px" />
                                            <span className={cn("truncate", player.didWin ? 'font-semibold' : '')} title={player.name || player.username || 'Sconosciuto'}>
                                                {player.name || player.username || 'Sconosciuto'}
                                            </span>
                                            {player.didWin && (
                                                <Trophy className="h-3.5 w-3.5 text-green-600 ml-1 flex-shrink-0" />
                                            )}
                                            {player.isNew && (
                                                <Sparkles className="h-3.5 w-3.5 text-blue-600 ml-1 flex-shrink-0" />
                                            )}
                                        </div>
                                        {player.score && (
                                        <span className={cn("font-mono text-xs whitespace-nowrap ml-2", player.didWin ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                                            {player.score} pt.
                                        </span>
                                        )}
                                    </li>
                                ))}
                                </ul>
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
      
       {userReview && (
        <div className="space-y-4">
          <div className="flex flex-row items-center justify-between gap-2">
            <h3 className="text-xl font-semibold text-foreground mr-2 flex-grow">La Tua Recensione</h3>
            <div className="flex items-center gap-2 flex-shrink-0">
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
                  <AlertDialogDescription>
                      Questa azione non può essere annullata. Eliminerà permanentemente il tuo voto per {game.name}.
                  </AlertDialogDescription>
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
          <ReviewItem review={userReview} />
        </div>
      )}

      {currentUser && !authLoading && !userReview && (
        <Card className="p-6 border border-border rounded-lg shadow-md bg-card">
          <CardTitle className="text-xl font-semibold text-foreground mb-1">Condividi la Tua Opinione</CardTitle>
          <CardDescription className="mb-4">
            Aiuta gli altri condividendo la tua esperienza con questo gioco.
          </CardDescription>
          <Button asChild className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90">
          <Link href={`/games/${gameId}/rate`}>
              <Edit className="mr-2 h-4 w-4" />
              Valuta questo Gioco
          </Link>
          </Button>
        </Card>
      )}

      {!currentUser && !authLoading && (
        <Alert variant="default" className="bg-secondary/30 border-secondary">
          <Info className="h-4 w-4 text-secondary-foreground" />
          <AlertDescription className="text-secondary-foreground">
            <Link href={`/signin?redirect=/games/${gameId}/rate`} className="font-semibold underline">Accedi</Link> per dare un voto.
          </AlertDescription>
        </Alert>
      )}
        
      {remainingReviews.length > 0 ? (
      <>
          <Separator className="my-6" />
          <h2 className="text-2xl font-semibold text-foreground mb-6 flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary"/>
          {userReview ? `Altri Voti (${remainingReviews.length})` : `Recensioni (${remainingReviews.length})`}
          </h2>
          <div className="space-y-4">
            {remainingReviews.map(review => <ReviewItem key={review.id} review={review} />)}
          </div>
      </>
      ) : userReview ? (
      <Alert variant="default" className="mt-6 bg-secondary/30 border-secondary">
          <Info className="h-4 w-4 text-secondary-foreground" />
          <AlertDescription className="text-secondary-foreground">
            Nessun altro ha ancora inviato un voto per questo gioco.
          </AlertDescription>
      </Alert>
      ) : (!game.reviews || game.reviews.length === 0) && (
      <Alert variant="default" className="mt-6 bg-secondary/30 border-secondary">
          <Info className="h-4 w-4 text-secondary-foreground" />
          <AlertDescription className="text-secondary-foreground">
            Nessuna recensione ancora per questo gioco.
          </AlertDescription>
      </Alert>
      )}

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
                            alt={`${rec.name} cover art`}
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
                                  size="icon"
                                  onClick={() => handleToggleFavorite(rec.id, rec.name)}
                                  disabled={isFavoriting || authLoading}
                                  title={isRecFavorited ? "Rimuovi dai Preferiti" : "Aggiungi ai Preferiti"}
                                  className={cn('h-7 w-7', isRecFavorited ? 'text-destructive hover:bg-destructive/20' : 'text-destructive/60 hover:text-destructive hover:bg-destructive/10')}
                                >
                                  <Heart className={cn("h-4 w-4", isRecFavorited ? 'fill-destructive' : '')} />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleTogglePlaylist(rec.id, rec.name)}
                                  disabled={isPlaylisting || authLoading}
                                  title={isRecPlaylisted ? "Rimuovi dalla Playlist" : "Aggiungi alla Playlist"}
                                  className={cn('h-7 w-7', isRecPlaylisted ? 'text-sky-500 hover:bg-sky-500/20' : 'text-sky-500/60 hover:text-sky-500 hover:bg-sky-500/10')}
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
            {!isFetchingRecommendations && enrichedAiRecommendations.length === 0 && !recommendationError && (
                <Alert variant="default" className="mt-4 bg-secondary/30 border-secondary text-left">
                    <Info className="h-4 w-4 text-secondary-foreground" />
                    <AlertDescription className="text-secondary-foreground">
                        Clicca il pulsante per vedere cosa suggerisce l&apos;AI!
                    </AlertDescription>
                </Alert>
            )}
        </CardContent>
        </Card>
      </div>
    </div>
  );
}


