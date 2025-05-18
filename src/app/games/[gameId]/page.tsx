
'use client';

import { useEffect, useState, useTransition, useCallback, use } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { getGameDetails } from '@/lib/actions';
import type { BoardGame, AiSummary, Review, Rating, GroupedCategoryAverages } from '@/lib/types';
import { ReviewList } from '@/components/boardgame/review-list';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Loader2, Wand2, Info, Edit, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/auth-context';
import { summarizeReviews } from '@/ai/flows/summarize-reviews';
import { calculateGroupedCategoryAverages, calculateCategoryAverages, calculateOverallCategoryAverage, formatRatingNumber } from '@/lib/utils';
import { GroupedRatingsDisplay } from '@/components/boardgame/grouped-ratings-display';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, deleteDoc } from 'firebase/firestore';
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


interface GameDetailPageProps {
  params: Promise<{
    gameId: string;
  }>;
}

export default function GameDetailPage({ params: paramsPromise }: GameDetailPageProps) {
  const params = use(paramsPromise);
  const { gameId } = params;

  const { user: currentUser, loading: authLoading } = useAuth();
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


  const fetchGameData = useCallback(async () => {
    setIsLoadingGame(true);
    setSummaryError(null);
    const gameData = await getGameDetails(gameId);
    setGame(gameData);
    if (gameData) {
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
        setUserReview(undefined); // Clear userReview if user logs out
        setUserOverallScore(null);
    }
     if (!currentUser && !authLoading) { // Ensure userReview is cleared if no user
      setUserReview(undefined);
      setUserOverallScore(null);
    }
  }, [currentUser, authLoading, game, userReview]);


  const handleGenerateSummary = async () => {
    if (!game || !game.reviews) return;
    setSummaryError(null);
    setAiSummary(null);
    startSummaryTransition(async () => {
       const gameRatings = game.reviews.map(r => r.rating).filter(Boolean) as Rating[];
      if (gameRatings.length === 0) {
        setSummaryError("No ratings available to summarize.");
        return;
      }
      try {
        const result = await summarizeReviews({ gameName: game.name, ratings: gameRatings });
        setAiSummary(result);
      } catch (error) {
         const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during summary generation.';
         setSummaryError(errorMessage);
      }
    });
  };

  const handleDeleteUserReview = async () => {
    setShowDeleteConfirmDialog(true);
  };

  const confirmDeleteUserReview = async () => {
    setShowDeleteConfirmDialog(false);
    if (!currentUser || !userReview?.id) {
      toast({ title: "Error", description: "Could not delete review. User or review not found.", variant: "destructive" });
      return;
    }

    startDeleteReviewTransition(async () => {
      try {
        const reviewDocRef = doc(db, "boardgames_collection", gameId, 'reviews', userReview.id);
        await deleteDoc(reviewDocRef);
        toast({ title: "Review Deleted", description: "Your review has been successfully deleted." });
        setUserReview(undefined); // Clear local userReview state
        setUserOverallScore(null);
        await fetchGameData(); // Refresh all game data
      } catch (error) {
        console.error("Error deleting review from Firestore:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        toast({ title: "Error", description: `Failed to delete review: ${errorMessage}`, variant: "destructive" });
      }
    });
  };


  if (isLoadingGame || authLoading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">Loading game details...</p>
      </div>
    );
  }

  if (!game) {
    return (
      <Alert variant="destructive" className="max-w-md mx-auto my-10">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error: Game Not Found</AlertTitle>
        <AlertDescription>
          The game you are looking for could not be found. It might have been removed or the ID is incorrect.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-10">
      <Card className="overflow-hidden shadow-xl border border-border rounded-lg">
        <div className="flex flex-col md:flex-row">
          <div className="flex-1 p-6 space-y-4 order-1">
            <div className="flex justify-between items-start mb-4">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-foreground">{game.name}</h1>
              {globalGameAverage !== null && (
                <span className="text-3xl sm:text-4xl font-bold text-primary whitespace-nowrap">
                  {formatRatingNumber(globalGameAverage * 2)}
                </span>
              )}
            </div>
            
            <div className="md:hidden my-4 max-w-[240px] mx-auto">
              <div className="relative aspect-[2/3] w-full rounded-md overflow-hidden shadow-md">
                <Image
                  src={game.coverArtUrl || `https://placehold.co/400x600.png`}
                  alt={`${game.name} cover art`}
                  fill
                  priority
                  className="object-cover"
                  data-ai-hint={`board game ${game.name.split(' ')[0]?.toLowerCase() || 'detailed'}`}
                  sizes="(max-width: 767px) 240px"
                  onError={(e) => { e.currentTarget.src = `https://placehold.co/400x600.png`; }}
                />
              </div>
            </div>
            
            <div className="mt-4 space-y-1 md:border-t-0 border-t border-border pt-4 md:pt-0">
              <h3 className="text-lg font-semibold text-foreground mb-3">Average Player Ratings:</h3>
              <GroupedRatingsDisplay 
                groupedAverages={groupedCategoryAverages} 
                noRatingsMessage="No ratings yet to calculate averages."
              />
            </div>
          </div>

          <div className="hidden md:block md:w-1/4 p-6 flex-shrink-0 self-start order-2">
            <div className="relative aspect-[2/3] w-full rounded-md overflow-hidden shadow-md">
              <Image
                src={game.coverArtUrl || `https://placehold.co/400x600.png`}
                alt={`${game.name} cover art`}
                fill
                priority
                className="object-cover"
                data-ai-hint={`board game ${game.name.split(' ')[0]?.toLowerCase() || 'detailed'}`}
                sizes="25vw"
                onError={(e) => { e.currentTarget.src = `https://placehold.co/400x600.png`; }}
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
                {userReview ? "Manage Your Review" : "Share Your Thoughts"}
                </h3>
                {userReview && userOverallScore !== null && (
                    <span className="text-2xl font-bold text-primary">
                        {formatRatingNumber(userOverallScore * 2)}
                    </span>
                )}
            </div>
            <p className="text-muted-foreground mb-4">
              {userReview
                ? "You've already rated this game. You can edit or delete your ratings below."
                : "Help others by sharing your experience with this game."}
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button asChild className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90">
                <Link href={`/games/${gameId}/rate`}>
                  <Edit className="mr-2 h-4 w-4" />
                  {userReview ? "Edit Your Review" : "Rate this Game"}
                </Link>
              </Button>
              {userReview && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full sm:w-auto" disabled={isDeletingReview}>
                      {isDeletingReview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                      Delete My Review
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete your review for {game.name}.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={confirmDeleteUserReview} className="bg-destructive hover:bg-destructive/90">
                        Confirm Delete
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
                      <Link href={`/signin?redirect=/games/${gameId}/rate`} className="font-semibold underline">Sign in</Link> to add or edit a review.
                    </AlertDescription>
                  </Alert>
            )}
          </div>

          <Separator className="my-4" />

          <div>
            <h2 className="text-2xl font-semibold text-foreground mb-6">Player Reviews ({game.reviews.length})</h2>
            <ReviewList reviews={game.reviews} currentUser={currentUser} gameId={game.id} onReviewDeleted={fetchGameData}/>
          </div>
        </div>

        <div className="lg:col-span-1 space-y-8 sticky top-24 self-start">
          <Card className="shadow-md border border-border rounded-lg">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <Wand2 className="h-5 w-5 text-primary"/>
                AI Review Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleGenerateSummary}
                disabled={isSummarizing || !game.reviews || game.reviews.length === 0}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground mb-3 transition-colors"
              >
                {isSummarizing ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</>
                ) : (
                  'Generate Summary'
                )}
              </Button>
              {(!game.reviews || game.reviews.length === 0) && !isSummarizing && (
                   <Alert variant="default" className="bg-secondary/30 border-secondary">
                    <Info className="h-4 w-4 text-secondary-foreground" />
                    <AlertDescription className="text-secondary-foreground">
                      Add some reviews first to generate an AI summary.
                    </AlertDescription>
                  </Alert>
              )}
              {summaryError && (
                <Alert variant="destructive" className="mt-3">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Summary Error</AlertTitle>
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

export const dynamic = 'force-dynamic';

    