
'use client';

import { useEffect, useState, useTransition, useCallback, use } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { getGameDetails } from '@/lib/actions';
import type { BoardGame, AiSummary, Review, Rating, RatingCategory } from '@/lib/types';
import { ReviewList } from '@/components/boardgame/review-list';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Loader2, Wand2, Info, Star, Edit } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/auth-context';
import { summarizeReviews } from '@/ai/flows/summarize-reviews';
import { calculateCategoryAverages } from '@/lib/utils';
import { RATING_CATEGORIES } from '@/lib/types';
// StarRating import removed

interface GameDetailPageProps {
  params: Promise<{
    gameId: string;
  }>;
}

export default function GameDetailPage({ params: paramsPromise }: GameDetailPageProps) {
  const params = use(paramsPromise);
  const { gameId } = params;

  const { user: currentUser, loading: authLoading } = useAuth();

  const [game, setGame] = useState<BoardGame | null>(null);
  const [aiSummary, setAiSummary] = useState<AiSummary | null>(null);
  const [isLoadingGame, setIsLoadingGame] = useState(true);
  const [isSummarizing, startSummaryTransition] = useTransition();
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [userReview, setUserReview] = useState<Review | undefined>(undefined);
  const [categoryAverages, setCategoryAverages] = useState<Rating | null>(null);

  const fetchGameData = useCallback(async () => {
    setIsLoadingGame(true);
    setSummaryError(null);
    const gameData = await getGameDetails(gameId);
    setGame(gameData);
    if (gameData) {
      if (currentUser && !authLoading) {
        const foundReview = gameData.reviews.find(r => r.userId === currentUser.uid);
        setUserReview(foundReview);
      } else if (!currentUser && !authLoading) {
        setUserReview(undefined);
      }
      setCategoryAverages(calculateCategoryAverages(gameData.reviews));
    } else {
      setUserReview(undefined);
      setCategoryAverages(null);
    }
    setIsLoadingGame(false);
  }, [gameId, currentUser, authLoading]);

  useEffect(() => {
    fetchGameData();
  }, [fetchGameData]);

  useEffect(() => {
    if (game && currentUser && !authLoading && !userReview) {
        const foundReview = game.reviews.find(r => r.userId === currentUser.uid);
        if (foundReview) setUserReview(foundReview);
    }
    if (game && !currentUser && !authLoading && userReview) {
        setUserReview(undefined);
    }
  }, [currentUser, authLoading, game, userReview]);


  const handleGenerateSummary = async () => {
    if (!game) return;
    setSummaryError(null);
    setAiSummary(null);
    startSummaryTransition(async () => {
       const reviewComments = game.reviews?.map(r => r.comment).filter(Boolean) as string[] || [];
      if (reviewComments.length === 0) {
        setSummaryError("No review comments available to summarize.");
        return;
      }
      try {
        const result = await summarizeReviews({ gameName: game.name, reviews: reviewComments });
        setAiSummary(result);
      } catch (error) {
         const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during summary generation.';
         setSummaryError(errorMessage);
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
        <div className="flex flex-row">
          <div className="flex-1 p-6 space-y-4">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-foreground">{game.name}</h1>

            {categoryAverages && (
              <div className="mt-4 space-y-3 border-t border-border pt-4">
                <h3 className="text-lg font-semibold text-foreground">Average Player Ratings:</h3>
                {(Object.keys(categoryAverages) as Array<keyof Rating>).map((categoryKey) => (
                  <div key={categoryKey} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{RATING_CATEGORIES[categoryKey as RatingCategory]}:</span>
                    <div className="flex items-center gap-2">
                       <span className="font-medium text-foreground">{categoryAverages[categoryKey].toFixed(1)} / 5</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!categoryAverages && game.reviews.length > 0 && (
                 <p className="text-sm text-muted-foreground italic">Calculating average ratings...</p>
            )}
            {!categoryAverages && game.reviews.length === 0 && (
                <p className="text-sm text-muted-foreground italic">No ratings yet to calculate averages.</p>
            )}
          </div>

          <div className="w-1/3 p-2 flex-shrink-0 self-center">
            <div className="relative aspect-[3/4] w-full rounded-md overflow-hidden shadow-md">
              <Image
                src={game.coverArtUrl || `https://placehold.co/400x600.png?text=${encodeURIComponent(game.name?.substring(0,15) || 'N/A')}`}
                alt={`${game.name} cover art`}
                fill
                priority
                className="object-cover"
                data-ai-hint={`board game ${game.name.split(' ')[0]?.toLowerCase() || 'detailed'}`}
                sizes="(max-width: 767px) 33vw, (min-width: 768px) 33vw, (min-width: 1024px) 40vw, (min-width: 1280px) 33vw"
                onError={(e) => { e.currentTarget.src = `https://placehold.co/400x600.png?text=${encodeURIComponent(game.name?.substring(0,15) || 'N/A')}`; }}
              />
            </div>
          </div>
        </div>
      </Card>

      <Separator />

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
        <div className="lg:col-span-2 space-y-8">
          <div className="p-6 border border-border rounded-lg shadow-md bg-card">
            <h3 className="text-xl font-semibold text-foreground mb-3">
              {userReview ? "Manage Your Review" : "Share Your Thoughts"}
            </h3>
            <p className="text-muted-foreground mb-4">
              {userReview
                ? "You've already rated this game. You can edit your ratings and comments."
                : "Help others by sharing your experience with this game."}
            </p>
            <Button asChild className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90">
              <Link href={`/games/${gameId}/rate`}>
                <Edit className="mr-2 h-4 w-4" />
                {userReview ? "Edit Your Review" : "Rate this Game"}
              </Link>
            </Button>
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
