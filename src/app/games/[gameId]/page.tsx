
'use client'; 

import { useEffect, useState, useTransition, useCallback, use } from 'react';
import Image from 'next/image';
import { getGameDetails, generateAiSummaryAction } from '@/lib/actions';
import type { BoardGame, AiSummary, Review } from '@/lib/types'; // Added Review
import { ReviewList } from '@/components/boardgame/review-list';
import { RatingForm } from '@/components/boardgame/rating-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Loader2, Wand2, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/auth-context'; // Added useAuth

interface GameDetailPageProps {
  params: Promise<{ 
    gameId: string;
  }>;
}

export default function GameDetailPage({ params: paramsPromise }: GameDetailPageProps) {
  const params = use(paramsPromise); 
  const { gameId } = params; 

  const { user: currentUser } = useAuth(); // Get current user

  const [game, setGame] = useState<BoardGame | null>(null);
  const [aiSummary, setAiSummary] = useState<AiSummary | null>(null);
  const [isLoadingGame, setIsLoadingGame] = useState(true);
  const [isSummarizing, startSummaryTransition] = useTransition();
  const [summaryError, setSummaryError] = useState<string | null>(null);
  
  // Find if current user has reviewed this game
  const [userReview, setUserReview] = useState<Review | undefined>(undefined);

  const fetchGameData = useCallback(async () => {
    setIsLoadingGame(true);
    const gameData = await getGameDetails(gameId);
    setGame(gameData);
    if (gameData && currentUser) {
      const foundReview = gameData.reviews.find(r => r.userId === currentUser.uid);
      setUserReview(foundReview);
    } else {
      setUserReview(undefined);
    }
    setIsLoadingGame(false);
  }, [gameId, currentUser]); // Added currentUser to dependencies

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


  return (
    <div className="space-y-10">
      <Card className="overflow-hidden shadow-xl border border-border rounded-lg">
        <div className="flex flex-row"> 
          
          <div className="flex-1 p-3 space-y-3"> 
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-foreground">{game.name}</h1> 
            
            
            
          </div>

          
          <div className="w-1/3 p-2 flex-shrink-0"> 
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
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-2xl font-semibold text-foreground">Player Reviews ({game.reviews.length})</h2>
          <ReviewList reviews={game.reviews} currentUser={currentUser} gameId={game.id} onReviewDeleted={fetchGameData}/>
        </div>
        <div className="lg:col-span-1 space-y-8 sticky top-24 self-start"> 
          <RatingForm 
            gameId={game.id} 
            onReviewSubmitted={fetchGameData}
            currentUser={currentUser}
            // Pass existing review if found for edit mode (future enhancement)
            // existingReview={userReview} 
          />
          
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

export const dynamic = 'force-dynamic';
