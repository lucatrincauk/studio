
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
import { SafeImage } from '@/components/common/SafeImage'; // Import SafeImage

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
    // Scroll to top of page or specific element on step change
    if (typeof window !== "undefined" && cardRef.current) {
      if (currentRatingFormStep === 5) { // Final summary step
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (currentRatingFormStep >= 1 && currentRatingFormStep <= 4) {
        // Scroll to top of card for input steps
        const cardTopOffset = cardRef.current.getBoundingClientRect().top + window.scrollY;
        setTimeout(() => {
          window.scrollTo({ top: cardTopOffset - 30, behavior: 'smooth' });
        }, 50); // Small delay for DOM updates
      }
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

  const fallbackSrc = `https://placehold.co/64x96.png?text=${encodeURIComponent(game.name?.substring(0,3) || 'N/A')}`;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <Button variant="outline" size="sm" className="mb-6" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Torna al Gioco
      </Button>
      <Card ref={cardRef} className="shadow-xl border border-border rounded-lg">
        {currentRatingFormStep !== 5 && (
            <CardHeader>
                <CardTitle className="text-2xl md:text-3xl">
                  <div className="flex items-center gap-3">
                    <div className="relative w-12 h-16 sm:w-16 sm:h-20 rounded-md overflow-hidden shadow-sm flex-shrink-0">
                      <SafeImage
                        src={game.coverArtUrl}
                        alt={`${game.name} copertina`}
                        fallbackSrc={fallbackSrc}
                        fill
                        className="object-cover"
                        data-ai-hint={`board game ${game.name?.split(' ')[0]?.toLowerCase() || 'mini'}`}
                        sizes="(max-width: 640px) 48px, 64px"
                      />
                    </div>
                    <span className="flex-grow">
                      {userReview ? 'Modifica la Tua Recensione per:' : 'Valuta:'} <span className="text-primary">{game.name}</span>
                    </span>
                  </div>
                </CardTitle>
                <CardDescription className="mt-2"> {/* Added margin-top for spacing */}
                    Segui i passaggi sottostanti per inviare la tua valutazione.
                </CardDescription>
            </CardHeader>
        )}
        <CardContent className={currentRatingFormStep === 5 ? 'pt-0' : ''}> {/* pt-0 for step 5 for tighter fit with form's own header */}
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
