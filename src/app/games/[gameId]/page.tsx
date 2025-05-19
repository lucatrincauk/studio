
'use client';

import { useEffect, useState, useTransition, useCallback, use } from 'react'; // Added 'use'
import Link from 'next/link';
import { getGameDetails } from '@/lib/actions';
import type { BoardGame, AiSummary, Review, Rating, GroupedCategoryAverages } from '@/lib/types';
import { ReviewList } from '@/components/boardgame/review-list';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Loader2, Wand2, Info, Edit, Trash2, Pin, PinOff } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/auth-context';
import { summarizeReviews } from '@/ai/flows/summarize-reviews';
import { calculateGroupedCategoryAverages, calculateCategoryAverages, calculateOverallCategoryAverage, formatRatingNumber } from '@/lib/utils';
import { GroupedRatingsDisplay } from '@/components/boardgame/grouped-ratings-display';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, deleteDoc, updateDoc } from 'firebase/firestore';
// import { revalidatePath } from 'next/cache'; // Removed as it's not for client components
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
import { Progress } from '@/components/ui/progress';


interface GameDetailPageProps {
  params: Promise<{ // Updated params to be a Promise
    gameId: string;
  }>;
}

export default function GameDetailPage({ params }: GameDetailPageProps) {
  const resolvedParams = use(params); // Use React.use to unwrap the promise
  const { gameId } = resolvedParams;

  const { user: currentUser, loading: authLoading, isAdmin } = useAuth();
  const { toast } = useToast();

  const [game, setGame] = useState<BoardGame | null>(null);
  const [aiSummary, setAiSummary] = useState<AiSummary | null>(null);
  const [isLoadingGame, setIsLoadingGame] = useState(true);
  const [isSummarizing, startSummaryTransition] = useTransition();
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [userReview, setUserReview] = useState<Review | undefined>(undefined);
  const [groupedCategoryAverages, setGroupedCategoryAverages] = useState<GroupedCategoryAverages | null>(null);
  const [globalGameAverage, setGlobalGameAverage] = useState<number | null>(null);
  const [userOverallScore, setUserOverallScore] = useState<number | null>(null);

  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [isDeletingReview, startDeleteReviewTransition] = useTransition();
  const [isPinToggling, startPinToggleTransition] = useTransition();
  const [currentIsPinned, setCurrentIsPinned] = useState(false);


  const fetchGameData = useCallback(async () => {
    setIsLoadingGame(true);
    setSummaryError(null);
    const gameData = await getGameDetails(gameId);
    setGame(gameData);
    if (gameData) {
      setCurrentIsPinned(gameData.isPinned || false);
      let foundUserReview: Review | undefined = undefined;
      if (currentUser && !authLoading) {
        foundUserReview = gameData.reviews.find(r => r.userId === currentUser.uid);
        setUserReview(foundUserReview);
        if (foundUserReview) {
          setUserOverallScore(calculateOverallCategoryAverage(foundUserReview.rating));
        } else {
          setUserOverallScore(null);
        }
      } else if (!currentUser && !authLoading) {
        setUserReview(undefined);
        setUserOverallScore(null);
      }
      setGroupedCategoryAverages(calculateGroupedCategoryAverages(gameData.reviews));
      
      const flatCategoryAverages = calculateCategoryAverages(gameData.reviews);
      setGlobalGameAverage(flatCategoryAverages ? calculateOverallCategoryAverage(flatCategoryAverages) : null);

    } else {
      setCurrentIsPinned(false);
      setUserReview(undefined);
      setGroupedCategoryAverages(null);
      setGlobalGameAverage(null);
      setUserOverallScore(null);
    }
    setIsLoadingGame(false);
  }, [gameId, currentUser, authLoading]);

  useEffect(() => {
    fetchGameData();
  }, [fetchGameData]);

  useEffect(() => {
    if (game && currentUser && !authLoading && !userReview) {
        const foundReview = game.reviews.find(r => r.userId === currentUser.uid);
        if (foundReview) {
          setUserReview(foundReview);
          setUserOverallScore(calculateOverallCategoryAverage(foundReview.rating));
        } else {
           setUserOverallScore(null);
        }
    }
    if (game && !currentUser && !authLoading && userReview) {
        setUserReview(undefined); 
        setUserOverallScore(null);
    }
     if (!currentUser && !authLoading) { 
      setUserReview(undefined);
      setUserOverallScore(null);
    }
  }, [currentUser, authLoading, game, userReview]);

  useEffect(() => {
    if (game) {
      setCurrentIsPinned(game.isPinned || false);
    }
  }, [game?.isPinned]);


  const handleGenerateSummary = async () => {
    if (!game || !game.reviews) return;
    setSummaryError(null);
    setAiSummary(null);
    startSummaryTransition(async () => {
       const gameRatings = game.reviews.map(r => r.rating).filter(Boolean) as Rating[];
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

  const confirmDeleteUserReview = async () => {
    setShowDeleteConfirmDialog(false);
    if (!currentUser || !userReview?.id) {
      toast({ title: "Errore", description: "Impossibile eliminare la recensione. Utente o recensione non trovati.", variant: "destructive" });
      return;
    }

    startDeleteReviewTransition(async () => {
      try {
        const reviewDocRef = doc(db, "boardgames_collection", gameId, 'reviews', userReview.id);
        await deleteDoc(reviewDocRef);
        toast({ title: "Recensione Eliminata", description: "La tua recensione è stata eliminata con successo." });
        setUserReview(undefined); 
        setUserOverallScore(null);
        await fetchGameData(); 
      } catch (error) {
        console.error("Errore durante l'eliminazione della recensione da Firestore:", error);
        const errorMessage = error instanceof Error ? error.message : "Si è verificato un errore sconosciuto.";
        toast({ title: "Errore", description: `Impossibile eliminare la recensione: ${errorMessage}`, variant: "destructive" });
      }
    });
  };

  const handleTogglePinGame = async () => {
    if (!game) return;
    startPinToggleTransition(async () => {
      try {
        const gameRef = doc(db, "boardgames_collection", game.id);
        await updateDoc(gameRef, {
          isPinned: !currentIsPinned
        });
        setCurrentIsPinned(!currentIsPinned); // Optimistic update for immediate UI feedback
        toast({
          title: "Stato Vetrina Aggiornato",
          description: `Il gioco è stato ${!currentIsPinned ? 'aggiunto alla' : 'rimosso dalla'} vetrina.`,
        });
        await fetchGameData(); // Re-fetch to ensure full consistency
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Si è verificato un errore sconosciuto.";
        toast({
          title: "Errore Aggiornamento Vetrina",
          description: `Impossibile aggiornare lo stato vetrina: ${errorMessage}`,
          variant: "destructive",
        });
        console.error("Errore durante l'aggiornamento dello stato pin del gioco:", error);
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

  return (
    <div className="space-y-10">
      <Card className="overflow-hidden shadow-xl border border-border rounded-lg">
        <div className="flex flex-col md:flex-row">
          {/* Text content - takes full width on mobile, or remaining width on desktop */}
          <div className="flex-1 p-6 space-y-4 order-1 md:order-1">
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2 flex-1 mr-4">
                  <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-foreground">{game.name}</h1>
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
                </div>
              {globalGameAverage !== null && (
              <span className="text-3xl sm:text-4xl font-bold text-primary whitespace-nowrap">
                  {formatRatingNumber(globalGameAverage * 2)}
              </span>
              )}
            </div>
            
            {/* Image for mobile - shown below title/score */}
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
            
            <div className="mt-4 space-y-1 md:border-t-0 border-t border-border pt-4 md:pt-0">
              <h3 className="text-lg font-semibold text-foreground mb-3">Valutazioni Medie dei Giocatori:</h3>
              <GroupedRatingsDisplay 
                groupedAverages={groupedCategoryAverages} 
                isLoading={isLoadingGame}
                noRatingsMessage="Nessuna valutazione per calcolare le medie."
                defaultOpenSections={['Sentimento']}
              />
            </div>
          </div>

          {/* Image for desktop - shown on the right */}
          <div className="hidden md:block md:w-1/4 p-6 flex-shrink-0 self-start order-2">
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
          <div className="p-6 border border-border rounded-lg shadow-md bg-card">
            <div className="flex justify-between items-center mb-1">
                <h3 className="text-xl font-semibold text-foreground">
                {userReview ? "Gestisci la Tua Recensione" : "Condividi la Tua Opinione"}
                </h3>
                {userReview && userOverallScore !== null && (
                    <span className="text-2xl font-bold text-primary">
                        {formatRatingNumber(userOverallScore * 2)}
                    </span>
                )}
            </div>
            <p className="text-muted-foreground mb-4">
              {userReview
                ? "Hai già valutato questo gioco. Puoi modificare o eliminare le tue valutazioni qui sotto."
                : "Aiuta gli altri condividendo la tua esperienza con questo gioco."}
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button asChild className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90">
                <Link href={`/games/${gameId}/rate`}>
                  <Edit className="mr-2 h-4 w-4" />
                  {userReview ? "Modifica la Tua Recensione" : "Valuta questo Gioco"}
                </Link>
              </Button>
              {userReview && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full sm:w-auto" disabled={isDeletingReview}>
                      {isDeletingReview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                      Elimina la Mia Recensione
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
              )}
            </div>
             {!currentUser && !authLoading && (
                 <Alert variant="default" className="mt-4 bg-secondary/30 border-secondary">
                    <Info className="h-4 w-4 text-secondary-foreground" />
                    <AlertDescription className="text-secondary-foreground">
                      <Link href={`/signin?redirect=/games/${gameId}/rate`} className="font-semibold underline">Accedi</Link> per aggiungere o modificare una recensione.
                    </AlertDescription>
                  </Alert>
            )}
          </div>

          <Separator className="my-4" />

          <div>
            <h2 className="text-2xl font-semibold text-foreground mb-6">Recensioni dei Giocatori ({game.reviews.length})</h2>
            <ReviewList reviews={game.reviews} currentUser={currentUser} gameId={game.id} onReviewDeleted={fetchGameData}/>
          </div>
        </div>

        <div className="lg:col-span-1 space-y-8 sticky top-24 self-start">
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
        </div>
      </section>
    </div>
  );
}

