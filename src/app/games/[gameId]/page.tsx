
'use client';

import { useEffect, useState, useTransition, useCallback, use, useMemo } from 'react';
import Link from 'next/link';
import { getGameDetails, revalidateGameDataAction, fetchUserPlaysForGameFromBggAction, fetchAndUpdateBggGameDetailsAction } from '@/lib/actions';
import type { BoardGame, Review, Rating as RatingType, GroupedCategoryAverages, BggPlayDetail, BggPlayerInPlay } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Loader2, Info, Edit, Trash2, Users, Clock, CalendarDays, ExternalLink, Weight, PenTool, Dices, MessageSquare, Heart, ListPlus, ListChecks, Settings, Trophy, Medal, UserCircle2, Brain, Star, Palette, ClipboardList, Repeat, Sparkles, DownloadCloud, Pin, PinOff } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/auth-context';
import { calculateGroupedCategoryAverages, calculateOverallCategoryAverage as calculateGlobalOverallAverage, formatRatingNumber, formatPlayDate, formatReviewDate, calculateCategoryAverages as calculateCatAvgsFromUtils } from '@/lib/utils';
import { GroupedRatingsDisplay } from '@/components/boardgame/grouped-ratings-display';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, deleteDoc, updateDoc, getDocs, collection, getDoc, arrayUnion, arrayRemove, increment, writeBatch } from 'firebase/firestore';
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
import { ReviewList } from '@/components/boardgame/review-list';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';


const FIRESTORE_COLLECTION_NAME = 'boardgames_collection';

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

  const [game, setGame] = useState<BoardGame | null>(null);
  const [isLoadingGame, setIsLoadingGame] = useState(true);

  const [userReview, setUserReview] = useState<Review | undefined>(undefined);
  const [remainingReviews, setRemainingReviews] = useState<Review[]>([]);
  const [groupedCategoryAverages, setGroupedCategoryAverages] = useState<GroupedCategoryAverages | null>(null);
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

  const [isFetchingDetailsFor, setIsFetchingDetailsFor] = useState<string | null>(null);
  const [isPendingBggDetailsFetch, startBggDetailsFetchTransition] = useTransition();

  const [isFetchingPlays, startFetchPlaysTransition] = useTransition();


  const fetchGameData = useCallback(async () => {
    setIsLoadingGame(true);
    const gameData = await getGameDetails(gameId);
    setGame(gameData);

    if (gameData) {
      setCurrentIsPinned(gameData.isPinned || false);
      setCurrentFavoriteCount(gameData.favoriteCount || 0);

      let foundUserReview: Review | undefined = undefined;
      if (currentUser && !authLoading && gameData.reviews) {
        foundUserReview = gameData.reviews.find(r => r.userId === currentUser.uid);
        setIsFavoritedByCurrentUser(gameData.favoritedByUserIds?.includes(currentUser.uid) || false);
        setIsPlaylistedByCurrentUser(gameData.playlistedByUserIds?.includes(currentUser.uid) || false);
      } else {
        setIsFavoritedByCurrentUser(false);
        setIsPlaylistedByCurrentUser(false);
      }
      setUserReview(foundUserReview);

      setRemainingReviews(gameData.reviews?.filter(r => r.id !== foundUserReview?.id) || []);

      if (gameData.reviews && gameData.reviews.length > 0) {
        const categoryAvgs = calculateCatAvgsFromUtils(gameData.reviews);
        if (categoryAvgs) {
          setGlobalGameAverage(calculateGlobalOverallAverage(categoryAvgs));
        } else {
          setGlobalGameAverage(null);
        }
        setGroupedCategoryAverages(calculateGroupedCategoryAverages(gameData.reviews));
      } else {
        setGlobalGameAverage(null);
        setGroupedCategoryAverages(null);
      }

    } else {
      setCurrentIsPinned(false);
      setIsFavoritedByCurrentUser(false);
      setCurrentFavoriteCount(0);
      setIsPlaylistedByCurrentUser(false);
      setUserReview(undefined);
      setRemainingReviews([]);
      setGroupedCategoryAverages(null);
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
      if (currentUser) {
        setIsFavoritedByCurrentUser(game.favoritedByUserIds?.includes(currentUser.uid) || false);
        setIsPlaylistedByCurrentUser(game.playlistedByUserIds?.includes(currentUser.uid) || false);
      }
    }
  }, [game, currentUser]);

  const updateGameOverallRatingAfterReviewChange = async () => {
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
      const newOverallAverage = categoryAvgs ? calculateGlobalOverallAverage(categoryAvgs) : null;
      
      const gameDocRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
      await updateDoc(gameDocRef, {
        overallAverageRating: newOverallAverage,
        reviewCount: allReviewsForGame.length
      });
      
      await revalidateGameDataAction(game.id);
      await fetchGameData(); 
    } catch (error) {
      console.error("Errore durante l'aggiornamento del punteggio medio del gioco:", error);
      toast({ title: "Errore", description: "Impossibile aggiornare il punteggio medio del gioco.", variant: "destructive" });
    }
  };

  const confirmDeleteUserReview = async () => {
    setShowDeleteConfirmDialog(false);
    if (!currentUser || !userReview?.id || !gameId) {
      toast({ title: "Errore", description: "Impossibile eliminare la recensione. Utente o recensione non trovati.", variant: "destructive" });
      return;
    }

    startDeleteReviewTransition(async () => {
      try {
        const reviewDocRef = doc(db, FIRESTORE_COLLECTION_NAME, gameId, 'reviews', userReview.id);
        await deleteDoc(reviewDocRef);
        await updateGameOverallRatingAfterReviewChange(); 
        await revalidateGameDataAction(gameId);
        await fetchGameData();
        toast({ title: "Recensione Eliminata", description: "La tua recensione è stata eliminata con successo." });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Si è verificato un errore sconosciuto.";
        toast({ title: "Errore", description: `Impossibile eliminare la recensione: ${errorMessage}`, variant: "destructive" });
      }
    });
  };

  const handleTogglePinGame = async () => {
    if (!game || authLoading || !isAdmin) return;
    startPinToggleTransition(async () => {
      const newPinStatus = !currentIsPinned;
      try {
        const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
        await updateDoc(gameRef, {
          isPinned: newPinStatus
        });
        setCurrentIsPinned(newPinStatus);
        toast({
          title: "Stato Vetrina Aggiornato",
          description: `Il gioco è stato ${newPinStatus ? 'aggiunto alla' : 'rimosso dalla'} vetrina.`,
        });
        setGame(prevGame => prevGame ? { ...prevGame, isPinned: newPinStatus } : null);
        await revalidateGameDataAction(game.id);
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

  const handleToggleFavorite = async () => {
    if (!currentUser || !game || authLoading) {
      toast({ title: "Azione non permessa", description: "Devi essere loggato per aggiungere ai preferiti.", variant: "destructive" });
      return;
    }
    startFavoriteTransition(async () => {
      const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
      try {
        const gameSnap = await getDoc(gameRef);
        if (!gameSnap.exists()) {
          toast({ title: "Errore", description: "Gioco non trovato.", variant: "destructive" });
          return;
        }

        const gameData = gameSnap.data() as BoardGame;
        const currentFavoritedByUserIds = gameData.favoritedByUserIds || [];
        let newFavoriteCount = gameData.favoriteCount || 0;
        let newFavoritedStatus = false;

        if (currentFavoritedByUserIds.includes(currentUser.uid)) {
          await updateDoc(gameRef, {
            favoritedByUserIds: arrayRemove(currentUser.uid),
            favoriteCount: increment(-1)
          });
          newFavoriteCount = Math.max(0, newFavoriteCount - 1);
          newFavoritedStatus = false;
        } else {
          await updateDoc(gameRef, {
            favoritedByUserIds: arrayUnion(currentUser.uid),
            favoriteCount: increment(1)
          });
          newFavoriteCount = newFavoriteCount + 1;
          newFavoritedStatus = true;
        }

        setIsFavoritedByCurrentUser(newFavoritedStatus);
        setCurrentFavoriteCount(newFavoriteCount);
        setGame(prevGame => prevGame ? {
          ...prevGame,
          favoriteCount: newFavoriteCount,
          favoritedByUserIds: newFavoritedStatus
            ? [...(prevGame.favoritedByUserIds || []), currentUser.uid]
            : (prevGame.favoritedByUserIds || []).filter(uid => uid !== currentUser.uid)
        } : null);

        toast({
          title: newFavoritedStatus ? "Aggiunto ai Preferiti!" : "Rimosso dai Preferiti",
          description: `${game.name} è stato ${newFavoritedStatus ? 'aggiunto ai' : 'rimosso dai'} tuoi preferiti.`,
        });

        await revalidateGameDataAction(game.id);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Impossibile aggiornare i preferiti.";
        toast({ title: "Errore", description: errorMessage, variant: "destructive" });
      }
    });
  };

  const handleTogglePlaylist = async () => {
    if (!currentUser || !game || authLoading) {
      toast({ title: "Azione non permessa", description: "Devi essere loggato per aggiungere alla playlist.", variant: "destructive" });
      return;
    }
    startPlaylistTransition(async () => {
      const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
      try {
        const gameSnap = await getDoc(gameRef);
        if (!gameSnap.exists()) {
          toast({ title: "Errore", description: "Gioco non trovato.", variant: "destructive" });
          return;
        }

        const gameData = gameSnap.data() as BoardGame;
        const currentPlaylistedByUserIds = gameData.playlistedByUserIds || [];
        let newPlaylistedStatus = false;

        if (currentPlaylistedByUserIds.includes(currentUser.uid)) {
          await updateDoc(gameRef, {
            playlistedByUserIds: arrayRemove(currentUser.uid)
          });
          newPlaylistedStatus = false;
        } else {
          await updateDoc(gameRef, {
            playlistedByUserIds: arrayUnion(currentUser.uid)
          });
          newPlaylistedStatus = true;
        }

        setIsPlaylistedByCurrentUser(newPlaylistedStatus);
        setGame(prevGame => prevGame ? {
          ...prevGame,
          playlistedByUserIds: newPlaylistedStatus
            ? [...(prevGame.playlistedByUserIds || []), currentUser.uid]
            : (prevGame.playlistedByUserIds || []).filter(uid => uid !== currentUser.uid)
        } : null);

        toast({
          title: newPlaylistedStatus ? "Aggiunto alla Playlist!" : "Rimosso dalla Playlist",
          description: `${game.name} è stato ${newPlaylistedStatus ? 'aggiunto alla' : 'rimosso dalla'} tua playlist.`,
        });

        await revalidateGameDataAction(game.id);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Impossibile aggiornare la playlist.";
        toast({ title: "Errore", description: errorMessage, variant: "destructive" });
      }
    });
  };

  const handleRefreshBggData = async () => {
    if (!game || !game.id || !game.bggId) return;

    setIsFetchingDetailsFor(game.id);
    let serverActionResult;
    try {
      serverActionResult = await fetchAndUpdateBggGameDetailsAction(game.bggId);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Errore sconosciuto durante il recupero dei dati BGG.";
      toast({ title: 'Errore Chiamata BGG', description: errorMsg, variant: 'destructive' });
      setIsFetchingDetailsFor(null);
      return;
    }

    startBggDetailsFetchTransition(async () => {
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
        await revalidateGameDataAction(game.id);
        await fetchGameData();
      } catch (dbError) {
        const errorMessage = dbError instanceof Error ? dbError.message : "Errore sconosciuto durante l'aggiornamento del DB.";
        toast({ title: 'Errore Aggiornamento Database', description: errorMessage, variant: 'destructive' });
      } finally {
        setIsFetchingDetailsFor(null);
      }
    });
  };

 const handleFetchBggPlays = async () => {
    if (!game || !game.id || !game.bggId || authLoading || (!currentUser && !isAdmin)) return;

    const usernameToFetch = "lctr01"; 

    startFetchPlaysTransition(async () => {
      const serverActionResult = await fetchUserPlaysForGameFromBggAction(game.id, game.bggId, usernameToFetch);

      if (!serverActionResult.success || !serverActionResult.plays) {
          toast({ title: 'Errore Caricamento Partite BGG', description: serverActionResult.error || serverActionResult.message || 'Impossibile caricare le partite da BGG.', variant: 'destructive' });
          return;
      }
      
      const playsToSave = serverActionResult.plays;

      if (playsToSave.length > 0) {
          const batch = writeBatch(db);
          const playsSubcollectionRef = collection(db, FIRESTORE_COLLECTION_NAME, game.id, `plays_${usernameToFetch.toLowerCase()}`);
          
          playsToSave.forEach(play => {
              const playDocRef = doc(playsSubcollectionRef, play.playId);
              const playDataForFirestore: BggPlayDetail = {
                  ...play,
                  userId: usernameToFetch, 
                  gameBggId: game.bggId,
              };
              batch.set(playDocRef, playDataForFirestore, { merge: true });
          });

          try {
              await batch.commit();
              const gameDocRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
              await updateDoc(gameDocRef, {
                  lctr01Plays: playsToSave.length 
              });
              toast({
                  title: "Partite Caricate e Salvate",
                  description: serverActionResult.message || `Caricate e salvate ${playsToSave.length} partite per ${game.name} da BGG per ${usernameToFetch}. Conteggio aggiornato.`,
              });
              await revalidateGameDataAction(game.id);
              await fetchGameData(); 
          } catch (dbError) {
              const errorMessage = dbError instanceof Error ? dbError.message : "Impossibile salvare le partite nel database.";
              toast({ title: 'Errore Salvataggio Partite DB', description: errorMessage, variant: 'destructive' });
          }
      } else {
          toast({
              title: "Nessuna Partita Trovata",
              description: serverActionResult.message || `Nessuna partita trovata su BGG per ${usernameToFetch} per questo gioco.`,
          });
          try {
              const gameDocRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
              await updateDoc(gameDocRef, { lctr01Plays: 0 });
              await revalidateGameDataAction(game.id);
              await fetchGameData();
          } catch (dbError) {
               // Silently ignore if update to 0 fails
          }
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
      if (!topPlayer) {
        topPlayer = stats;
      } else {
        if (stats.wins > topPlayer.wins) {
          topPlayer = stats;
        } else if (stats.wins === topPlayer.wins) {
          if (stats.totalScore > topPlayer.totalScore) {
            topPlayer = stats;
          }
        }
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
              if (score > maxScore) {
                maxScore = score;
              }
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

  const fallbackSrc = `https://placehold.co/400x600.png?text=${encodeURIComponent(game.name?.substring(0,10) || 'N/A')}`;

  return (
    <div className="space-y-8"> 
      <Card className="overflow-hidden shadow-xl border border-border rounded-lg">
        <div className="flex flex-col md:flex-row">
          {/* Main Content Column */}
          <div className="flex-1 p-6 space-y-4 md:order-1"> 
            {/* Main header: Title, Icons, Score */}
            <div className="flex justify-between items-start mb-2">
                <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:gap-1 min-w-0 mr-2">
                  <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-foreground flex items-center">
                    {game.name}
                    {game.bggId > 0 && (
                      <a
                        href={`https://boardgamegeek.com/boardgame/${game.bggId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Vedi su BoardGameGeek"
                        className="inline-flex items-center text-primary hover:text-primary/80 focus:outline-none focus:ring-2 focus:ring-ring rounded-md p-0.5 ml-1"
                      >
                        <ExternalLink size={16} className="h-4 w-4" />
                      </a>
                    )}
                  </h1>
                </div>
                <div className="flex-shrink-0 flex flex-col items-end">
                    {globalGameAverage !== null && (
                    <span className="text-primary text-3xl md:text-4xl font-bold whitespace-nowrap">
                        {formatRatingNumber(globalGameAverage * 2)}
                    </span>
                    )}
                    {currentUser && (
                    <div className="flex items-center gap-0.5 mt-1">
                        <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleToggleFavorite}
                        disabled={isFavoriting || authLoading}
                        title={isFavoritedByCurrentUser ? "Rimuovi dai Preferiti" : "Aggiungi ai Preferiti"}
                        className={`h-9 w-9 hover:bg-destructive/20 ${isFavoritedByCurrentUser ? 'text-destructive fill-destructive' : 'text-muted-foreground/60 hover:text-destructive'}`}
                        >
                        {isFavoriting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Heart className={`h-5 w-5 ${isFavoritedByCurrentUser ? 'fill-destructive' : ''}`} />}
                        </Button>
                        {currentFavoriteCount > 0 && (
                        <span className="text-sm text-muted-foreground -ml-2 mr-1">
                            ({currentFavoriteCount})
                        </span>
                        )}
                        <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleTogglePlaylist}
                        disabled={isPlaylisting || authLoading}
                        title={isPlaylistedByCurrentUser ? "Rimuovi dalla Playlist" : "Aggiungi alla Playlist"}
                        className={`h-9 w-9 hover:bg-sky-500/20 ${isPlaylistedByCurrentUser ? 'text-sky-500' : 'text-muted-foreground/60 hover:text-sky-500'}`}
                        >
                        {isPlaylisting ? <Loader2 className="h-5 w-5 animate-spin" /> : (isPlaylistedByCurrentUser ? <ListChecks className="h-5 w-5" /> : <ListPlus className="h-5 w-5" />)}
                        </Button>
                        {isAdmin && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-primary/20 text-muted-foreground/80 hover:text-primary">
                                <Settings className="h-5 w-5" />
                            </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                            <DropdownMenuItem
                                onSelect={handleTogglePinGame}
                                disabled={isPinToggling || authLoading}
                                className="cursor-pointer"
                            >
                                {currentIsPinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
                                {currentIsPinned ? "Rimuovi da Vetrina" : "Aggiungi a Vetrina"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onSelect={handleRefreshBggData}
                                disabled={(isPendingBggDetailsFetch && isFetchingDetailsFor === game.id) || !game.id || !game.bggId}
                                className="cursor-pointer"
                            >
                                {(isPendingBggDetailsFetch && isFetchingDetailsFor === game.id) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DownloadCloud className="mr-2 h-4 w-4" />}
                                Aggiorna Dati da BGG
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onSelect={handleFetchBggPlays}
                                disabled={isFetchingPlays || !game.bggId}
                                className="cursor-pointer"
                            >
                                {isFetchingPlays ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Dices className="mr-2 h-4 w-4" />}
                                Carica Partite
                            </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        )}
                    </div>
                    )}
                </div>
            </div>
            
            {/* Image for mobile, below title/icons */}
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

            {/* Metadata Grid */}
             <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-muted-foreground pt-1">
                {(game.designers && game.designers.length > 0) && (
                    <div className="flex items-baseline gap-2"> {/* Ensure NO col-span-2 here */}
                      <span className="inline-flex items-center relative top-px"><PenTool size={14} className="text-primary/80 flex-shrink-0 relative top-px" /></span>
                      <span className="font-medium hidden sm:inline">Autori:</span>
                      <span>{game.designers.join(', ')}</span>
                    </div>
                )}
                {game.yearPublished != null && (
                    <div className="flex items-baseline gap-2">
                      <span className="inline-flex items-center relative top-px"><CalendarDays size={14} className="text-primary/80 flex-shrink-0 relative top-px" /></span>
                      <span className="font-medium hidden sm:inline">Anno:</span>
                      <span>{game.yearPublished}</span>
                    </div>
                )}
                {(game.minPlayers != null || game.maxPlayers != null) && (
                    <div className="flex items-baseline gap-2">
                      <span className="inline-flex items-center relative top-px"><Users size={14} className="text-primary/80 flex-shrink-0 relative top-px" /></span>
                      <span className="font-medium hidden sm:inline">Giocatori:</span>
                      <span>{game.minPlayers}{game.maxPlayers && game.minPlayers !== game.maxPlayers ? `-${game.maxPlayers}` : ''}</span>
                    </div>
                )}
                { (game.minPlaytime != null && game.maxPlaytime != null) || game.playingTime != null ? (
                    <div className="flex items-baseline gap-2">
                      <span className="inline-flex items-center relative top-px"><Clock size={14} className="text-primary/80 flex-shrink-0 relative top-px" /></span>
                      <span className="font-medium hidden sm:inline">Durata:</span>
                      <span>
                          {game.minPlaytime != null && game.maxPlaytime != null ?
                          (game.minPlaytime === game.maxPlaytime ? `${game.minPlaytime} min` : `${game.minPlaytime} - ${game.maxPlaytime} min`)
                          : (game.playingTime != null ? `${game.playingTime} min` : 'N/D')
                          }
                          {game.minPlaytime != null && game.maxPlaytime != null && game.playingTime != null && game.playingTime !== game.minPlaytime && game.playingTime !== game.maxPlaytime && ` (Tipica: ${game.playingTime} min)`}
                      </span>
                    </div>
                ) : null}
                {game.averageWeight !== null && typeof game.averageWeight === 'number' && (
                    <div className="flex items-baseline gap-2">
                      <span className="inline-flex items-center relative top-px"><Weight size={14} className="text-primary/80 flex-shrink-0 relative top-px" /></span>
                      <span className="font-medium hidden sm:inline">Complessità:</span>
                      <span>{formatRatingNumber(game.averageWeight)} / 5</span>
                    </div>
                )}
                <div className="flex items-baseline gap-2">
                    <span className="inline-flex items-center relative top-px"><Dices size={14} className="text-primary/80 flex-shrink-0 relative top-px" /></span>
                    <span className="font-medium hidden sm:inline">Partite:</span>
                    <span>{game.lctr01Plays ?? 0}</span>
                </div>
                {topWinnerStats && (
                  <div className="flex items-baseline gap-2">
                    <span className="inline-flex items-center relative top-px"><Trophy size={14} className="text-amber-500 flex-shrink-0 relative top-px" /></span>
                    <span className="font-medium hidden sm:inline">Campione:</span>
                    <span>{topWinnerStats.name} ({topWinnerStats.wins} {topWinnerStats.wins === 1 ? 'vittoria' : 'vittorie'})</span>
                  </div>
                )}
                 {highestScoreAchieved !== null && (
                    <div className="flex items-baseline gap-2">
                        <span className="inline-flex items-center relative top-px"><Medal size={14} className="text-amber-500 flex-shrink-0 relative top-px" /></span>
                        <span className="font-medium hidden sm:inline">Miglior Punteggio:</span>
                        <span>{formatRatingNumber(highestScoreAchieved)} pt.</span>
                    </div>
                )}
            </div>
            
            {/* Average Ratings Section */}
            <div className={cn("w-full pt-4 border-t border-border", !(game.reviews && game.reviews.length > 0) && "border-none pt-0")}>
              {game.reviews && game.reviews.length > 0 && (
                <>
                    <h3 className="text-lg font-semibold text-foreground mb-3">Valutazione Media:</h3>
                    <GroupedRatingsDisplay
                        groupedAverages={groupedCategoryAverages}
                        noRatingsMessage="Nessuna valutazione per calcolare le medie."
                        isLoading={isLoadingGame}
                        defaultOpenSections={['Sentimento']}
                    />
                </>
              )}
            </div>
          </div>

          
          {/* Image Column for Desktop */}
          <div className="hidden md:block md:w-1/4 p-6 flex-shrink-0 self-start md:order-2"> 
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
      </Card>
      
      {/* Partite Registrate Section */}
      {game.lctr01PlayDetails && game.lctr01PlayDetails.length > 0 && (
          <Card className="shadow-md border border-border rounded-lg">
              <CardHeader className="flex flex-row justify-between items-center">
                  <CardTitle className="text-xl flex items-center gap-2">
                      <Dices className="h-5 w-5 text-primary"/>
                      Partite Registrate
                  </CardTitle>
                  {game.lctr01PlayDetails && game.lctr01PlayDetails.length > 0 && (
                      <Badge variant="secondary">{game.lctr01PlayDetails.length}</Badge>
                  )}
              </CardHeader>
              <CardContent className="pt-0">
                  <Accordion type="single" collapsible className="w-full">
                      {game.lctr01PlayDetails.map((play) => {
                          const winners = play.players?.filter(p => p.didWin) || [];
                          const winnerNames = winners.map(p => p.name || p.username || 'Sconosciuto').join(', ');
                          return (
                          <AccordionItem value={`play-${play.playId}`} key={play.playId}>
                              <AccordionTrigger className="hover:no-underline text-left py-3 text-sm">
                                <div className="flex justify-between w-full items-center pr-2 gap-2">
                                  <div className="flex items-center gap-2">
                                      <Dices size={16} className="text-muted-foreground/80 flex-shrink-0 relative top-px" />
                                      <span className="font-medium">{formatReviewDate(play.date)}</span>
                                      {play.quantity > 1 && (
                                          <>
                                              <span className="text-muted-foreground">-</span>
                                              <span>{play.quantity} partite</span>
                                          </>
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
                                  {play.comments && (
                                  <div className="grid grid-cols-[auto_1fr] gap-x-2 items-baseline pt-1">
                                      <strong className="text-muted-foreground text-xs">Commenti:</strong>
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
                                          <li key={pIndex} className={`flex items-center justify-between text-xs border-b border-border last:border-b-0 py-1.5 px-2 ${pIndex % 2 === 0 ? 'bg-muted/30' : ''}`}>
                                              <div className="flex items-center gap-1.5 flex-grow min-w-0">
                                                  <UserCircle2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 relative top-px" />
                                                  <span className={`truncate ${player.didWin ? 'font-semibold' : ''}`} title={player.name || player.username || 'Sconosciuto'}>
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
                                              <span className={`font-mono text-xs whitespace-nowrap ml-2 text-foreground ${player.didWin ? 'font-semibold' : ''}`}>
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

    {/* User Review Management and Other Reviews Section */}
      <div className="space-y-8"> 
          {currentUser && !authLoading && (
            userReview ? (
              <div> 
                <div className="flex justify-between items-center gap-2 mb-4">
                  <h3 className="text-xl font-semibold text-foreground mr-2 flex-grow">La Tua Recensione</h3>
                  <div className="flex items-center gap-2 flex-shrink-0">
                      <Button asChild size="sm">
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
                              Questa azione non può essere annullata. Eliminerà permanentemente la tua recensione per {game.name}.
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
            ) : (
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
            )
          )}

          {!currentUser && !authLoading && (
                  <Alert variant="default" className="bg-secondary/30 border-secondary">
                  <Info className="h-4 w-4 text-secondary-foreground" />
                  <AlertDescription className="text-secondary-foreground">
                      <Link href={`/signin?redirect=/games/${gameId}/rate`} className="font-semibold underline">Accedi</Link> per aggiungere una recensione.
                  </AlertDescription>
                  </Alert>
          )}
          
          {remainingReviews.length > 0 && (
          <>
              <Separator className="my-6" />
              <h2 className="text-2xl font-semibold text-foreground mb-6 flex items-center gap-2">
              <MessageSquare className="h-6 w-6 text-primary"/>
              {userReview ? `Altre Recensioni (${remainingReviews.length})` : `Recensioni (${remainingReviews.length})`}
              </h2>
              <ReviewList reviews={remainingReviews} />
          </>
          )}

          {remainingReviews.length === 0 && userReview && (
          <Alert variant="default" className="mt-6 bg-secondary/30 border-secondary">
              <Info className="h-4 w-4 text-secondary-foreground" />
              <AlertDescription className="text-secondary-foreground">
              Nessun altro ha ancora recensito questo gioco.
              </AlertDescription>
          </Alert>
          )}

          {remainingReviews.length === 0 && !userReview && (!game.reviews || game.reviews.length === 0) && (
          <Alert variant="default" className="mt-6 bg-secondary/30 border-secondary">
              <Info className="h-4 w-4 text-secondary-foreground" />
              <AlertDescription className="text-secondary-foreground">
              Nessuna recensione ancora per questo gioco.
              </AlertDescription>
          </Alert>
          )}
      </div>
    </div>
  );
}
      

    




    




    


