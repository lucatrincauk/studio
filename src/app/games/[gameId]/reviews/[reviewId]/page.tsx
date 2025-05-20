
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSingleReviewDetailsAction } from '@/lib/actions';
import type { AugmentedReviewWithGame } from '@/lib/types';
import { ReviewItem } from '@/components/boardgame/review-item';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { SafeImage } from '@/components/common/SafeImage';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function SingleReviewDetailPage() {
  const params = useParams() as { gameId: string; reviewId: string };
  const router = useRouter();
  const { gameId, reviewId } = params;

  const [augmentedReview, setAugmentedReview] = useState<AugmentedReviewWithGame | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gameId || !reviewId) {
      setError("ID del gioco o della recensione mancante.");
      setIsLoading(false);
      return;
    }
    async function fetchReview() {
      setIsLoading(true);
      setError(null);
      const result = await getSingleReviewDetailsAction(gameId, reviewId);
      if ('error' in result) {
        setError(result.error);
        setAugmentedReview(null);
      } else if (result) { // Ensure result is not null
        setAugmentedReview(result as AugmentedReviewWithGame);
      } else {
        setError("Recensione non trovata.");
        setAugmentedReview(null);
      }
      setIsLoading(false);
    }
    fetchReview();
  }, [gameId, reviewId]);

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">Caricamento dettaglio recensione...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-md mx-auto my-10">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Errore nel Caricamento</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
        <Button onClick={() => router.back()} variant="outline" className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Torna Indietro
        </Button>
      </Alert>
    );
  }

  if (!augmentedReview) {
    return (
      <Alert variant="destructive" className="max-w-md mx-auto my-10">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Recensione Non Trovata</AlertTitle>
        <AlertDescription>La recensione che cerchi non è stata trovata.</AlertDescription>
        <Button onClick={() => router.back()} variant="outline" className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Torna Indietro
        </Button>
      </Alert>
    );
  }

  const fallbackGameHeaderSrc = `https://placehold.co/80x120.png?text=${encodeURIComponent(augmentedReview.gameName?.substring(0,10) || 'N/A')}`;

  return (
    <div className="space-y-6">
      <Button onClick={() => router.back()} variant="outline" size="sm">
        <ArrowLeft className="mr-2 h-4 w-4" /> Torna Indietro
      </Button>

      <Card className="shadow-lg border border-border rounded-lg">
        <CardHeader className="bg-muted/30 p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Link href={`/games/${augmentedReview.gameId}`} className="flex items-center gap-4 group w-full">
            <div className="relative h-20 w-16 sm:h-24 sm:w-20 flex-shrink-0 rounded-md overflow-hidden shadow-sm">
              <SafeImage
                src={augmentedReview.gameCoverArtUrl}
                fallbackSrc={fallbackGameHeaderSrc}
                alt={`${augmentedReview.gameName} copertina`}
                fill
                sizes="(max-width: 640px) 64px, 80px"
                className="object-cover group-hover:opacity-80 transition-opacity"
                data-ai-hint={`board game ${augmentedReview.gameName?.split(' ')[0]?.toLowerCase() || 'mini'}`}
              />
            </div>
            <div className="flex-grow">
              <CardTitle className="text-xl sm:text-2xl font-semibold text-primary group-hover:underline leading-tight">
                {augmentedReview.gameName}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Recensione di {augmentedReview.author}</p>
            </div>
          </Link>
        </CardHeader>
        <CardContent className="p-4">
          <ReviewItem review={augmentedReview} />
        </CardContent>
      </Card>
    </div>
  );
}

