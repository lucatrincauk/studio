
'use client';

import { use } from 'react';
import { useParams, useRouter } from 'next/navigation'; // useParams for client component
import { getGameDetails } from '@/lib/actions';
import type { BoardGame, Review } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';
import { MultiStepRatingForm } from '@/components/boardgame/multi-step-rating-form';
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface GameRatePageParams {
  gameId: string;
}

export default function GameRatePage() {
  const params = useParams() as GameRatePageParams; // Use useParams for client component
  const router = useRouter();
  const { gameId } = params;
  const { user: currentUser, loading: authLoading } = useAuth();

  // Fetch game data (including existing review if any)
  // This is a simplified version. In a real app, you might want to use SWR or React Query
  // For now, we'll use a promise directly like in GameDetailPage
  const gameDataPromise = getGameDetails(gameId);
  const game = use(gameDataPromise); // Use React.use to unwrap the promise

  const [userReview, setUserReview] = useState<Review | undefined>(undefined);
  const [isLoadingGame, setIsLoadingGame] = useState(true); // Separate loading for game data

  useEffect(() => {
    if (game) {
      if (currentUser && game.reviews) {
        const foundReview = game.reviews.find(r => r.userId === currentUser.uid);
        setUserReview(foundReview);
      } else {
        setUserReview(undefined);
      }
      setIsLoadingGame(false);
    } else if (game === null) { // Explicitly null means not found
        setIsLoadingGame(false);
    }
    // Effect depends on game data being resolved and currentUser
  }, [game, currentUser]);


  if (authLoading || isLoadingGame) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">Loading rating form...</p>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-10">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Game Not Found</h2>
        <p className="text-muted-foreground mb-6">
          The game you are trying to rate could not be found.
        </p>
        <Button asChild variant="outline">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" /> Go back to Homepage
          </Link>
        </Button>
      </div>
    );
  }

  if (!currentUser) {
    return (
       <div className="flex flex-col items-center justify-center text-center py-10">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Authentication Required</h2>
        <p className="text-muted-foreground mb-6">
          You need to be logged in to rate this game.
        </p>
        <Button asChild>
          <Link href={`/signin?redirect=/games/${gameId}/rate`}>
             Sign In to Rate
          </Link>
        </Button>
      </div>
    )
  }


  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <Button variant="outline" size="sm" className="mb-6" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Game
      </Button>
      <Card className="shadow-xl border border-border rounded-lg">
        <CardHeader>
          <CardTitle className="text-2xl md:text-3xl">
            {userReview ? 'Edit Your Review for:' : 'Rate:'} <span className="text-primary">{game.name}</span>
          </CardTitle>
          <CardDescription>
            Follow the steps below to submit your rating.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MultiStepRatingForm
            gameId={game.id}
            currentUser={currentUser}
            existingReview={userReview}
            onReviewSubmitted={() => router.push(`/games/${gameId}`)} // Redirect after submit
          />
        </CardContent>
      </Card>
    </div>
  );
}

// Need to import useState and useEffect
import { useState, useEffect } from 'react';
export const dynamic = 'force-dynamic';
