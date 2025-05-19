
'use client';

import { useParams, useRouter } from 'next/navigation';
import { getGameDetails } from '@/lib/actions';
import type { BoardGame, Review } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';
import { MultiStepRatingForm } from '@/components/boardgame/multi-step-rating-form';
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useState, useEffect, useRef } from 'react';

interface GameRatePageParams {
  gameId: string;
}

export default function GameRatePage() {
  const params = useParams() as GameRatePageParams;
  const router = useRouter();
  const { gameId } = params;
  const { user: currentUser, loading: authLoading } = useAuth();

  const [game, setGame] = useState<BoardGame | null | undefined>(undefined); // undefined: not loaded, null: not found
  const [userReview, setUserReview] = useState<Review | undefined>(undefined);
  const [isLoadingGame, setIsLoadingGame] = useState(true);
  const [currentRatingFormStep, setCurrentRatingFormStep] = useState(1);
  const cardRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    async function fetchGameData() {
      if (!gameId) {
        setIsLoadingGame(false);
        setGame(null); 
        return;
      }
      setIsLoadingGame(true);
      const gameData = await getGameDetails(gameId);
      setGame(gameData);
      setIsLoadingGame(false);
    }
    fetchGameData();
  }, [gameId]);

  useEffect(() => {
    if (game === undefined) return; 

    if (game) { 
      if (currentUser && game.reviews) {
        const foundReview = game.reviews.find(r => r.userId === currentUser.uid);
        setUserReview(foundReview);
      } else {
        setUserReview(undefined);
      }
    } else { 
      setUserReview(undefined);
    }
  }, [game, currentUser]);

  useEffect(() => {
    // Scroll to top of page on step change
    if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentRatingFormStep]);


  if (authLoading || isLoadingGame || game === undefined) {
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
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Gioco Non Trovato</h2>
        <p className="text-muted-foreground mb-6">
          Il gioco che stai cercando di valutare non è stato trovato.
        </p>
        <Button asChild variant="outline">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" /> Torna alla Homepage
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


  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <Button variant="outline" size="sm" className="mb-6" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Torna al Gioco
      </Button>
      <Card ref={cardRef} className="shadow-xl border border-border rounded-lg">
        {currentRatingFormStep !== 5 && (
            <CardHeader>
                <CardTitle className="text-2xl md:text-3xl">
                    {userReview ? 'Modifica la Tua Recensione per:' : 'Valuta:'} <span className="text-primary">{game.name}</span>
                </CardTitle>
                <CardDescription>
                    Segui i passaggi sottostanti per inviare la tua valutazione.
                </CardDescription>
            </CardHeader>
        )}
        <CardContent className={currentRatingFormStep === 5 ? 'pt-6' : ''}>
          <MultiStepRatingForm
            gameId={game.id}
            currentUser={currentUser}
            existingReview={userReview}
            onReviewSubmitted={() => router.push(`/games/${gameId}`)}
            currentStep={currentRatingFormStep}
            onStepChange={setCurrentRatingFormStep}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export const dynamic = 'force-dynamic';

