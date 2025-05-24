
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
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface GameRatePageParams {
  gameId: string;
}

const ANONYMOUS_USER_ID_MARKER = "ANONYMOUS_REVIEWER";

export default function GameRatePage() {
  const params = useParams() as GameRatePageParams;
  const router = useRouter();
  const { gameId } = params;
  const { user: currentUser, loading: authLoading } = useAuth();

  const [game, setGame] = useState<BoardGame | null | undefined>(undefined);
  const [userReview, setUserReview] = useState<Review | undefined>(undefined);
  const [isLoadingGame, setIsLoadingGame] = useState(true);
  const [currentRatingFormStep, setCurrentRatingFormStep] = useState(1);
  const [guestNameInput, setGuestNameInput] = useState('');
  const [guestNameError, setGuestNameError] = useState<string | null>(null);

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

    // Fetch data only if auth state is resolved or if we allow anonymous reviews
    // and gameId is present. For now, currentUser check is fine.
    if (currentUser !== undefined) { // if authLoading is also false, this implies auth state is resolved
        fetchGameAndReviewData();
    }

  }, [gameId, currentUser]);


  useEffect(() => {
    if (typeof window !== "undefined") {
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 0);
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
  
  const pageTitle = userReview ? "Modifica la Tua Valutazione" : "Invia la Tua Valutazione";
  const pageDescription = "Segui i passaggi sottostanti per inviare la tua valutazione.";


  const handleGuestNameSubmit = (formData: FormData) => {
      const name = formData.get('guestName') as string;
      if (!name || name.trim() === '') {
          setGuestNameError("Per favore, inserisci un nome per pubblicare il tuo voto.");
          return false;
      }
      setGuestNameError(null);
      setGuestNameInput(name.trim());
      return true;
  }


  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <Card className="shadow-xl border border-border rounded-lg">
        {currentRatingFormStep === 1 && (
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl text-left">
              {pageTitle}
            </CardTitle>
            <CardDescription className="text-left text-sm text-muted-foreground mt-1 whitespace-pre-line">
              {pageDescription}
            </CardDescription>
             {!currentUser && !authLoading && currentRatingFormStep === 1 && (
                <form 
                    action={async (formData) => {
                        if (handleGuestNameSubmit(formData)) {
                            // Proceed implicitly by allowing MultiStepForm to be enabled
                        }
                    }} 
                    className="mt-4 space-y-3 border-t pt-4"
                >
                    <Label htmlFor="guestName" className="text-sm font-medium text-foreground">
                        Il Tuo Nome (per Voto Ospite)
                    </Label>
                    <Input 
                        id="guestName"
                        name="guestName" 
                        type="text" 
                        placeholder="Es. Mario Rossi" 
                        defaultValue={guestNameInput}
                        className={guestNameError ? "border-destructive" : ""}
                        maxLength={50}
                    />
                    {guestNameError && <p className="text-xs text-destructive">{guestNameError}</p>}
                    <p className="text-xs text-muted-foreground">
                        Inserisci un nome da visualizzare con il tuo voto. Non è richiesta la registrazione.
                    </p>
                     {guestNameInput.trim() === '' && guestNameError === null && (
                        <Button type="submit" size="sm">Conferma Nome Ospite</Button>
                     )}
                     {guestNameInput.trim() !== '' && (
                         <p className="text-xs text-green-600">Nome ospite: {guestNameInput}</p>
                     )}
                </form>
            )}
          </CardHeader>
        )}

        <CardContent className={cn(
            (currentRatingFormStep === 1 && (currentUser || guestNameInput.trim() !== '')) ? 'pt-0' : 'pt-6', // Adjust padding based on header visibility and guest name status
            (currentRatingFormStep > 1 && currentRatingFormStep < 5) && 'pt-6',
            currentRatingFormStep === 5 && 'pt-0'
        )}>
          { (currentUser || guestNameInput.trim() !== '' || currentRatingFormStep > 1 ) ? (
            <MultiStepRatingForm
              gameId={game.id}
              gameName={game.name}
              gameCoverArtUrl={game.coverArtUrl}
              currentUser={currentUser}
              guestDisplayName={guestNameInput.trim()} // Pass trimmed name
              existingReview={userReview}
              onReviewSubmitted={() => {
                router.push(`/games/${gameId}?updated=${Date.now()}`);
              }}
              currentStep={currentRatingFormStep}
              onStepChange={setCurrentRatingFormStep}
            />
          ) : (
             currentRatingFormStep === 1 && !currentUser && !authLoading && guestNameInput.trim() === '' && (
                 <p className="text-sm text-muted-foreground text-center py-4">
                    Per favore, conferma un nome ospite per procedere con la valutazione.
                 </p>
             )
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export const dynamic = 'force-dynamic';
