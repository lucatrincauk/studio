
'use client';

import { useEffect, useState, useTransition, useCallback, use } from 'react';
import Link from 'next/link';
import { getGameDetails } from '@/lib/actions'; 
import type { BoardGame, AiSummary, Review, Rating as RatingType, GroupedCategoryAverages } from '@/lib/types';
import { ReviewList } from '@/components/boardgame/review-list';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Loader2, Wand2, Info, Edit, Trash2, Pin, PinOff, Users, Clock, CalendarDays, ExternalLink, Weight, Tag, Heart, ListPlus, ListChecks } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/auth-context';
import { summarizeReviews } from '@/ai/flows/summarize-reviews';
import { calculateGroupedCategoryAverages, calculateCategoryAverages, calculateOverallCategoryAverage, formatRatingNumber } from '@/lib/utils';
import { GroupedRatingsDisplay } from '@/components/boardgame/grouped-ratings-display';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, deleteDoc, updateDoc, getDocs, collection, getDoc, arrayUnion, arrayRemove, increment } from 'firebase/firestore'; 
import { revalidateGameDataAction } from '@/lib/actions';
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
import { SafeImage } from '@/components/common/SafeImage';
import { ReviewItem } from '@/components/boardgame/review-item';
import { Badge } from "@/components/ui/badge";

const FIRESTORE_COLLECTION_NAME = 'boardgames_collection'; // Define the constant here

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
  const [aiSummary, setAiSummary] = useState<AiSummary | null>(null);
  const [isLoadingGame, setIsLoadingGame] = useState(true);
  const [isSummarizing, startSummaryTransition] = useTransition();
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [userReview, setUserReview] = useState<Review | undefined>(undefined);
  const [remainingReviews, setRemainingReviews] = useState<Review[]>([]);
  const [groupedCategoryAverages, setGroupedCategoryAverages] = useState<GroupedCategoryAverages | null>(null);
  const [globalGameAverage, setGlobalGameAverage] = useState<number | null>(null);
  
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [isDeletingReview, startDeleteReviewTransition] = useTransition();
  
  const [isPinToggling, startPinToggleTransition] = useTransition();
  const [currentIsPinned, setCurrentIsPinned] = useState(false);

  const [isFavoriting, startFavoriteTransition] = useTransition();
  const [isFavoritedByCurrentUser, setIsFavoritedByCurrentUser] = useState(false);
  const [currentFavoriteCount, setCurrentFavoriteCount] = useState(0);

  const [isWishlisting, startWishlistTransition] = useTransition();
  const [isWishlistedByCurrentUser, setIsWishlistedByCurrentUser] = useState(false);


  const fetchGameData = useCallback(async () => {
    setIsLoadingGame(true);
    setSummaryError(null);
    const gameData = await getGameDetails(gameId);
    setGame(gameData);

    if (gameData) {
      setCurrentIsPinned(gameData.isPinned || false);
      setCurrentFavoriteCount(gameData.favoriteCount || 0);
      
      let foundUserReview: Review | undefined = undefined;
      if (currentUser && !authLoading && gameData.reviews) {
        foundUserReview = gameData.reviews.find(r => r.userId === currentUser.uid);
        setIsFavoritedByCurrentUser(gameData.favoritedByUserIds?.includes(currentUser.uid) || false);
        setIsWishlistedByCurrentUser(gameData.wishlistedByUserIds?.includes(currentUser.uid) || false);
      } else {
        setIsFavoritedByCurrentUser(false);
        setIsWishlistedByCurrentUser(false);
      }
      setUserReview(foundUserReview);
      
      setRemainingReviews(gameData.reviews?.filter(r => r.id !== foundUserReview?.id) || []);
      
      if (gameData.overallAverageRating !== undefined && gameData.overallAverageRating !== null) {
        setGlobalGameAverage(gameData.overallAverageRating);
      } else {
        setGlobalGameAverage(null);
      }
      
      if (gameData.reviews && gameData.reviews.length > 0) {
        setGroupedCategoryAverages(calculateGroupedCategoryAverages(gameData.reviews));
      } else {
        setGroupedCategoryAverages(null);
      }

    } else {
      setCurrentIsPinned(false);
      setIsFavoritedByCurrentUser(false);
      setCurrentFavoriteCount(0);
      setIsWishlistedByCurrentUser(false);
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
        setIsWishlistedByCurrentUser(game.wishlistedByUserIds?.includes(currentUser.uid) || false);
      }
    }
  }, [game, currentUser]);

  const handleGenerateSummary = async () => {
    if (!game || !game.reviews) return;
    setSummaryError(null);
    setAiSummary(null);
    startSummaryTransition(async () => {
       const gameRatings = game.reviews.map(r => r.rating).filter(Boolean) as RatingType[];
      if (gameRatings.length === 0) {
        setSummaryError("Nessuna valutazione disponibile per generare un riepilogo.");
        return;
      }
      try {
        const result = await summarizeReviews({ gameName: game.name, ratings: gameRatings });
        setAiSummary(result);
      } catch (error) {
         const errorMessage = error instanceof Error ? error.message : 'Si è verificato un errore sconosciuto durante la generazione del riepilogo.';
         setSummaryError(errorMessage);
      }
    });
  };

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

      const categoryAvgs = calculateCategoryAverages(allReviewsForGame);
      const newOverallAverage = categoryAvgs ? calculateOverallCategoryAverage(categoryAvgs) : null;
      
      const gameDocRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
      await updateDoc(gameDocRef, {
        overallAverageRating: newOverallAverage,
        reviewCount: allReviewsForGame.length
      });
      await revalidateGameDataAction(game.id);
      await fetchGameData(); 
    } catch (error) {
      console.error("Error updating game's overall average rating:", error);
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
        toast({ title: "Recensione Eliminata", description: "La tua recensione è stata eliminata con successo." });
        await updateGameOverallRatingAfterReviewChange(); 
        await revalidateGameDataAction(gameId);
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
        await revalidateGameDataAction(game.id); 
        setGame(prevGame => prevGame ? { ...prevGame, isPinned: newPinStatus } : null);
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
          // Unfavorite
          await updateDoc(gameRef, {
            favoritedByUserIds: arrayRemove(currentUser.uid),
            favoriteCount: increment(-1)
          });
          newFavoriteCount = Math.max(0, newFavoriteCount - 1);
          newFavoritedStatus = false;
        } else {
          // Favorite
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

  const handleToggleWishlist = async () => {
    if (!currentUser || !game || authLoading) {
      toast({ title: "Azione non permessa", description: "Devi essere loggato per aggiungere alla wishlist.", variant: "destructive" });
      return;
    }
    startWishlistTransition(async () => {
      const gameRef = doc(db, FIRESTORE_COLLECTION_NAME, game.id);
      try {
        const gameSnap = await getDoc(gameRef);
        if (!gameSnap.exists()) {
          toast({ title: "Errore", description: "Gioco non trovato.", variant: "destructive" });
          return;
        }

        const gameData = gameSnap.data() as BoardGame;
        const currentWishlistedByUserIds = gameData.wishlistedByUserIds || [];
        let newWishlistedStatus = false;

        if (currentWishlistedByUserIds.includes(currentUser.uid)) {
          // Remove from wishlist
          await updateDoc(gameRef, {
            wishlistedByUserIds: arrayRemove(currentUser.uid)
          });
          newWishlistedStatus = false;
        } else {
          // Add to wishlist
          await updateDoc(gameRef, {
            wishlistedByUserIds: arrayUnion(currentUser.uid)
          });
          newWishlistedStatus = true;
        }

        setIsWishlistedByCurrentUser(newWishlistedStatus);
        setGame(prevGame => prevGame ? { 
          ...prevGame, 
          wishlistedByUserIds: newWishlistedStatus
            ? [...(prevGame.wishlistedByUserIds || []), currentUser.uid]
            : (prevGame.wishlistedByUserIds || []).filter(uid => uid !== currentUser.uid)
        } : null);

        toast({
          title: newWishlistedStatus ? "Aggiunto alla Wishlist!" : "Rimosso dalla Wishlist",
          description: `${game.name} è stato ${newWishlistedStatus ? 'aggiunto alla' : 'rimosso dalla'} tua wishlist.`,
        });
        
        await revalidateGameDataAction(game.id);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Impossibile aggiornare la wishlist.";
        toast({ title: "Errore", description: errorMessage, variant: "destructive" });
      }
    });
  };


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
  const hasDataForSection = (arr?: string[]) => arr && arr.length > 0;

  return (
    <div className="space-y-10">
      <Card className="overflow-hidden shadow-xl border border-border rounded-lg">
        <div className="flex flex-col md:flex-row">
          <div className="flex-1 p-6 space-y-4 md:order-1"> 
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2 flex-1 mr-4">
                  <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-foreground">{game.name}</h1>
                  {game.bggId > 0 && (
                    <a
                      href={`https://boardgamegeek.com/boardgame/${game.bggId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Vedi su BoardGameGeek"
                      className="inline-flex items-center text-primary hover:text-primary/80 focus:outline-none focus:ring-2 focus:ring-ring rounded-md p-0.5"
                    >
                      <ExternalLink size={16} className="h-4 w-4" />
                    </a>
                  )}
                  {isAdmin && !isLoadingGame && game && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleTogglePinGame}
                        disabled={isPinToggling}
                        title={currentIsPinned ? "Rimuovi da Vetrina" : "Aggiungi a Vetrina"}
                        className={`h-9 w-9 hover:bg-accent/20 ${currentIsPinned ? 'text-accent' : 'text-muted-foreground/60 hover:text-accent'}`}
                    >
                        {isPinToggling ? <Loader2 className="h-5 w-5 animate-spin" /> : (currentIsPinned ? <PinOff className="h-5 w-5" /> : <Pin className="h-5 w-5" />)}
                    </Button>
                  )}
                  {currentUser && (
                    <>
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
                        onClick={handleToggleWishlist}
                        disabled={isWishlisting || authLoading}
                        title={isWishlistedByCurrentUser ? "Rimuovi dalla Wishlist" : "Aggiungi alla Wishlist"}
                        className={`h-9 w-9 hover:bg-sky-500/20 ${isWishlistedByCurrentUser ? 'text-sky-500' : 'text-muted-foreground/60 hover:text-sky-500'}`}
                      >
                        {isWishlisting ? <Loader2 className="h-5 w-5 animate-spin" /> : (isWishlistedByCurrentUser ? <ListChecks className="h-5 w-5" /> : <ListPlus className="h-5 w-5" />)}
                      </Button>
                    </>
                  )}
                </div>
               <span className="text-primary text-3xl font-bold">
                  {globalGameAverage !== null ? formatRatingNumber(globalGameAverage * 2) : ""}
               </span>
            </div>
            
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
            
            <div className="text-sm text-muted-foreground space-y-1.5 pt-1 grid grid-cols-2 gap-x-4 gap-y-2">
              {game.yearPublished != null && (
                <div className="flex items-center gap-2">
                  <CalendarDays size={16} className="text-primary/80" />
                  <span className="hidden sm:inline">Anno:</span>
                  <span>{game.yearPublished}</span>
                </div>
              )}
              {(game.minPlayers != null || game.maxPlayers != null) && (
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-primary/80" />
                   <span className="hidden sm:inline">Giocatori:</span>
                  <span>{game.minPlayers}{game.maxPlayers && game.minPlayers !== game.maxPlayers ? `-${game.maxPlayers}` : ''}</span>
                </div>
              )}
              { (game.minPlaytime != null && game.maxPlaytime != null) || game.playingTime != null ? (
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-primary/80" />
                  <span className="hidden sm:inline">Durata:</span>
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
                 <div className="flex items-center gap-2">
                  <Weight size={16} className="text-primary/80" />
                  <span className="hidden sm:inline">Complessità:</span>
                  <span>{formatRatingNumber(game.averageWeight)} / 5</span>
                </div>
              )}
            </div>
            {(hasDataForSection(game.categories) || hasDataForSection(game.mechanics) || hasDataForSection(game.designers) ) && (
              <div className="mt-6 pt-4 border-t border-border space-y-3">
                <h3 className="text-lg font-semibold text-foreground">Dettagli Aggiuntivi</h3>
                {hasDataForSection(game.categories) && (
                  <div className="text-sm">
                    <strong className="text-muted-foreground">Categorie: </strong>
                    {game.categories!.map(cat => <Badge key={cat} variant="secondary" className="mr-1 mb-1">{cat}</Badge>)}
                  </div>
                )}
                {hasDataForSection(game.mechanics) && (
                  <div className="text-sm">
                    <strong className="text-muted-foreground">Meccaniche: </strong>
                    {game.mechanics!.map(mech => <Badge key={mech} variant="secondary" className="mr-1 mb-1">{mech}</Badge>)}
                  </div>
                )}
                {hasDataForSection(game.designers) && (
                  <div className="text-sm">
                    <strong className="text-muted-foreground">Autori: </strong>
                    {game.designers!.join(', ')}
                  </div>
                )}
              </div>
            )}
          </div>

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

      <Separator />

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
        <div className="lg:col-span-2 space-y-8">
           {currentUser && !authLoading && userReview && (
            <div className="mb-6">
              <div className="flex justify-between items-center mb-4 flex-wrap">
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
                 <Alert variant="default" className="mt-4 bg-secondary/30 border-secondary">
                    <Info className="h-4 w-4 text-secondary-foreground" />
                    <AlertDescription className="text-secondary-foreground">
                      <Link href={`/signin?redirect=/games/${gameId}/rate`} className="font-semibold underline">Accedi</Link> per aggiungere una recensione.
                    </AlertDescription>
                  </Alert>
            )}
          
           {game.reviews && game.reviews.length > 0 && (
            <div className="mt-4 space-y-1">
                <h3 className="text-lg font-semibold text-foreground mb-3">Valutazione Media:</h3>
                <GroupedRatingsDisplay
                    groupedAverages={groupedCategoryAverages}
                    noRatingsMessage="Nessuna valutazione per calcolare le medie."
                    isLoading={isLoadingGame}
                    defaultOpenSections={['Sentimento']}
                />
            </div>
            )}
          
           {remainingReviews.length > 0 ? (
             <div>
              <Separator className="my-6" />
              <h2 className="text-2xl font-semibold text-foreground mb-6">
                {userReview ? `Altre Recensioni (${remainingReviews.length})` : `Recensioni (${remainingReviews.length})`}
              </h2>
              <ReviewList reviews={remainingReviews} />
            </div>
          ) : (
            userReview && game.reviews && game.reviews.length === 1 ? (
              <Alert variant="default" className="mt-6 bg-secondary/30 border-secondary">
                <Info className="h-4 w-4 text-secondary-foreground" />
                <AlertDescription className="text-secondary-foreground">
                  Nessun altro ha ancora recensito questo gioco.
                </AlertDescription>
              </Alert>
            ) : (
              (!game.reviews || game.reviews.length === 0) && (
                <Alert variant="default" className="mt-6 bg-secondary/30 border-secondary">
                  <Info className="h-4 w-4 text-secondary-foreground" />
                  <AlertDescription className="text-secondary-foreground">
                    Nessuna recensione ancora per questo gioco.
                  </AlertDescription>
                </Alert>
              )
            )
          )}

        </div>

        <div className="lg:col-span-1 space-y-8 sticky top-24 self-start">
          {isAdmin && (
            <Card className="shadow-md border border-border rounded-lg">
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Wand2 className="h-5 w-5 text-primary"/>
                  Riepilogo IA delle Recensioni
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={handleGenerateSummary}
                  disabled={isSummarizing || !game.reviews || game.reviews.length === 0}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground mb-3 transition-colors"
                >
                  {isSummarizing ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generazione in corso...</>
                  ) : (
                    'Genera Riepilogo'
                  )}
                </Button>
                {(!game.reviews || game.reviews.length === 0) && !isSummarizing && (
                    <Alert variant="default" className="bg-secondary/30 border-secondary">
                      <Info className="h-4 w-4 text-secondary-foreground" />
                      <AlertDescription className="text-secondary-foreground">
                        Aggiungi prima qualche recensione per generare un riepilogo IA.
                      </AlertDescription>
                    </Alert>
                )}
                {summaryError && (
                  <Alert variant="destructive" className="mt-3">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Errore nel Riepilogo</AlertTitle>
                    <AlertDescription>{summaryError}</AlertDescription>
                  </Alert>
                )}
                {aiSummary && !summaryError && (
                  <div className="mt-3 p-4 bg-muted/50 rounded-md border text-sm text-foreground/90">
                    <p className="italic leading-relaxed">{aiSummary.summary}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}

