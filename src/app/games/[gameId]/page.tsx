
'use client'; 

import { useEffect, useState, useTransition, useCallback, use } from 'react';
import Image from 'next/image';
import { getGameDetails, generateAiSummaryAction } from '@/lib/actions';
import type { BoardGame, AiSummary } from '@/lib/types';
import { StarRating } from '@/components/boardgame/star-rating';
import { ReviewList } from '@/components/boardgame/review-list';
import { RatingForm } from '@/components/boardgame/rating-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { calculateAverageRating } from '@/lib/utils';
import { AlertCircle, Loader2, Wand2, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface GameDetailPageProps {
  params: Promise<{ // Updated: params is a Promise
    gameId: string;
  }>;
}

export default function GameDetailPage({ params: paramsPromise }: GameDetailPageProps) {
  const params = use(paramsPromise); // Unwrap the Promise
  const { gameId } = params; // Access gameId from resolved params

  const [game, setGame] = useState<BoardGame | null>(null);
  const [aiSummary, setAiSummary] = useState<AiSummary | null>(null);
  const [isLoadingGame, setIsLoadingGame] = useState(true);
  const [isSummarizing, startSummaryTransition] = useTransition();
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const fetchGameData = useCallback(async () => {
    setIsLoadingGame(true);
    const gameData = await getGameDetails(gameId);
    setGame(gameData);
    setIsLoadingGame(false);
  }, [gameId]);

  useEffect(() => {
    fetchGameData();
  }, [fetchGameData]);


  const handleGenerateSummary = async () => {
    if (!game) return;
    setSummaryError(null);
    setAiSummary(null); 
    startSummaryTransition(async () => {
      const result = await generateAiSummaryAction(game.id);
      if ('error' in result) {
        setSummaryError(result.error);
      } else {
        setAiSummary(result);
      }
    });
  };

  if (isLoadingGame) {
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

  const averageRating = calculateAverageRating(game);

  return (
    <div className="space-y-10">
      <Card className="overflow-hidden shadow-xl border border-border rounded-lg">
        <CardHeader className="p-0 relative">
          <div className="relative w-full h-64 md:h-80 lg:h-96">
            <Image
              src={game.coverArtUrl}
              alt={`${game.name} cover art`}
              fill
              priority
              className="object-cover"
              data-ai-hint={`board game ${game.name.split(' ')[0]?.toLowerCase() || 'detailed'}`}
              sizes="100vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          </div>
          <div className="absolute bottom-0 left-0 p-6 md:p-8 text-white">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight drop-shadow-lg">{game.name}</h1>
            <div className="mt-2 flex items-center gap-2">
              <StarRating rating={averageRating} readOnly size={24} iconClassName="drop-shadow-sm" />
              {averageRating > 0 && <span className="text-lg font-semibold drop-shadow-sm">{averageRating.toFixed(1)} ({game.reviews.length} ratings)</span>}
              {averageRating === 0 && <span className="text-lg font-semibold drop-shadow-sm">Not yet rated</span>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 md:p-8 space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-foreground mb-3">Game Overview</h2>
            <CardDescription className="text-base leading-relaxed text-foreground/90">{game.description}</CardDescription>
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm bg-muted/50 p-4 rounded-md border">
              {game.yearPublished && <div><strong>Year:</strong> <span className="text-foreground">{game.yearPublished}</span></div>}
              {game.minPlayers && game.maxPlayers && <div><strong>Players:</strong> <span className="text-foreground">{game.minPlayers}-{game.maxPlayers}</span></div>}
              {game.playingTime && <div><strong>Time:</strong> <span className="text-foreground">{game.playingTime} min</span></div>}
              {game.bggId && <div><strong>BGG ID:</strong> <span className="text-foreground">{game.bggId}</span></div>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-2xl font-semibold text-foreground">Player Reviews ({game.reviews.length})</h2>
          <ReviewList reviews={game.reviews} />
        </div>
        <div className="lg:col-span-1 space-y-8 sticky top-24 self-start"> {/* Sticky sidebar for form and summary */}
          <RatingForm gameId={game.id} />
          
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
                disabled={isSummarizing || game.reviews.length === 0} 
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground mb-3 transition-colors"
              >
                {isSummarizing ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</>
                ) : (
                  'Generate Summary'
                )}
              </Button>
              {game.reviews.length === 0 && !isSummarizing && (
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

// Force dynamic rendering to ensure data is fresh, especially after review submissions
export const dynamic = 'force-dynamic';

