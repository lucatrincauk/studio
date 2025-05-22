
'use client';

import { useParams, useRouter } from 'next/navigation';
import { getGameDetails } from '@/lib/actions';
import type { BoardGame, Review } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';
import { MultiStepRatingForm } from '@/components/boardgame/multi-step-rating-form';
import { Loader2, AlertCircle, Gamepad2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface GameRatePageParams {
  gameId: string;
}

export default function GameRatePage() {
  const params = useParams() as GameRatePageParams;
  const router = useRouter();
  const { gameId } = params;
  const { user: currentUser, loading: authLoading } = useAuth();

  const [game, setGame] = useState<BoardGame | null | undefined>(undefined);
  const [userReview, setUserReview] = useState<Review | undefined>(undefined);
  const [isLoadingGame, setIsLoadingGame] = useState(true);
  const [currentRatingFormStep, setCurrentRatingFormStep] = useState(1);
  

  useEffect(() => {
    async function fetchGameAndReviewData() {
      if (!gameId) {
        setIsLoadingGame(false);
        setGame(null); 
        return;
      }
      setIsLoadingGame(true);
      const gameData = await getGameDetails(gameId);
      setGame(gameData);
      
      if (gameData && currentUser) {
        const foundReview = gameData.reviews?.find(r => r.userId === currentUser.uid);
        setUserReview(foundReview);
      } else {
        setUserReview(undefined);
      }
      setIsLoadingGame(false);
    }
    if (currentUser !== undefined) { 
        fetchGameAndReviewData();
    }
  }, [gameId, currentUser]);


  useEffect(() => {
    if (typeof window !== "undefined") {
      // Scroll to the top of the page on every step change
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 50); 
    }
  }, [currentRatingFormStep]);


  if (authLoading || isLoadingGame || game === undefined || (currentUser === undefined && !authLoading) ) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">Caricamento modulo di valutazione...</p>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-10">
        <Gamepad2 className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Gioco Non Trovato</h2>
        <p className="text-muted-foreground mb-6">
          Il gioco che stai cercando di valutare non è stato trovato.
        </p>
        <Button asChild variant="outline">
          <Link href="/">
             Torna alla Homepage
          </Link>
        </Button>
      </div>
    );
  }

  if (!currentUser) {
    return (
       <div className="flex flex-col items-center justify-center text-center py-10">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Autenticazione Richiesta</h2>
        <p className="text-muted-foreground mb-6">
          Devi essere loggato per valutare questo gioco.
        </p>
        <Button asChild>
          <Link href={`/signin?redirect=/games/${gameId}/rate`}>
             Accedi per Valutare
          </Link>
        </Button>
      </div>
    )
  }

  const pageTitleText = userReview ? "Modifica la Tua Valutazione" : "Invia la Tua Valutazione";
  const pageDescriptionText = "Segui i passaggi sottostanti per inviare la tua valutazione.";

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <Card className="shadow-xl border border-border rounded-lg">
        {currentRatingFormStep === 1 && (
          <CardHeader>
              <CardTitle className="text-2xl md:text-3xl text-left">
                {pageTitleText}
              </CardTitle>
              <CardDescription className="text-left text-sm text-muted-foreground mt-1 whitespace-pre-line">
                {pageDescriptionText}
              </CardDescription>
          </CardHeader>
        )}
        <CardContent className={cn(
            currentRatingFormStep === 1 ? 'pt-0' : '',
            currentRatingFormStep > 1 && currentRatingFormStep < 5 ? 'pt-6' : '',
            currentRatingFormStep === 5 && 'pt-0'
        )}>
          <MultiStepRatingForm
            gameId={game.id}
            gameName={game.name} 
            gameCoverArtUrl={game.coverArtUrl}
            currentUser={currentUser}
            existingReview={userReview}
            onReviewSubmitted={() => {
              router.push(`/games/${gameId}`);
            }}
            currentStep={currentRatingFormStep}
            onStepChange={setCurrentRatingFormStep}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export const dynamic = 'force-dynamic';
