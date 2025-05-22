
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getUserDetailsAndReviewsAction } from '@/lib/actions';
import type { AugmentedReview, UserProfile } from '@/lib/types';
import { ReviewItem } from '@/components/boardgame/review-item';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageSquareText, AlertCircle, Gamepad2, UserCircle2, ArrowLeft, Loader2, Star } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { SafeImage } from '@/components/common/SafeImage';
import { formatRatingNumber } from '@/lib/utils';

interface UserReviewsPageParams {
  userId: string;
}

export default function UserReviewsPage() {
  const params = useParams() as UserReviewsPageParams;
  const router = useRouter();
  const { userId } = params;

  const [viewedUser, setViewedUser] = useState<UserProfile | null>(null);
  const [userReviews, setUserReviews] = useState<AugmentedReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserDataAndReviews = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getUserDetailsAndReviewsAction(userId);
      if (data.user) {
        setViewedUser(data.user);
        setUserReviews(data.reviews);
      } else {
        setError('Utente non trovato.');
      }
    } catch (e) {
      console.error("Failed to fetch user data and reviews:", e);
      setError('Impossibile caricare i dati dell\'utente e le recensioni.');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchUserDataAndReviews();
  }, [fetchUserDataAndReviews]);

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">Caricamento recensioni utente...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-md mx-auto my-10">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Errore</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
         <Button onClick={() => router.back()} variant="outline" className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Torna Indietro
          </Button>
      </Alert>
    );
  }

  if (!viewedUser) {
    return (
      <Alert variant="destructive" className="max-w-md mx-auto my-10">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Utente Non Trovato</AlertTitle>
        <AlertDescription>L'utente che cerchi non è stato trovato.</AlertDescription>
         <Button onClick={() => router.back()} variant="outline" className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Torna Indietro
          </Button>
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      <Button onClick={() => router.push(`/users/${userId}`)} variant="outline" size="sm" className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> Torna al Profilo di {viewedUser.name}
      </Button>

      <Card className="shadow-lg border border-border rounded-lg">
        <CardHeader className="flex flex-row items-center gap-4">
          <Avatar className="h-16 w-16 border-2 border-primary/50">
            {viewedUser.photoURL && <AvatarImage src={viewedUser.photoURL} alt={viewedUser.name} />}
            <AvatarFallback className="text-2xl bg-muted text-muted-foreground">
              {viewedUser.name ? viewedUser.name.substring(0, 1).toUpperCase() : <UserCircle2 className="h-8 w-8"/>}
            </AvatarFallback>
          </Avatar>
          <div>
            <CardTitle className="text-2xl font-bold text-foreground">
              Voti di {viewedUser.name}
            </CardTitle>
            <CardDescription>
              Sfoglia tutti i voti inviati da {viewedUser.name}.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {userReviews.length === 0 ? (
            <Alert variant="default" className="bg-secondary/30 border-secondary">
              <Gamepad2 className="h-4 w-4" />
              <AlertTitle>Nessun Voto</AlertTitle>
              <AlertDescription>
                {viewedUser.name} non ha ancora inviato voti.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-6">
              {userReviews.map((review) => {
                const fallbackGameHeaderSrc = `https://placehold.co/48x64.png?text=${encodeURIComponent(review.gameName?.substring(0,3) || 'N/A')}`;
                return (
                  <Card key={review.id} className="overflow-hidden shadow-md border border-border rounded-lg">
                    <CardHeader className="bg-muted/30 p-3">
                       <Link href={`/games/${review.gameId}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity w-full">
                        <div className="relative h-16 w-12 flex-shrink-0 rounded-sm overflow-hidden shadow-sm">
                           <SafeImage
                            src={review.gameCoverArtUrl}
                            fallbackSrc={fallbackGameHeaderSrc}
                            alt={`${review.gameName || 'Gioco'} copertina`}
                            fill
                            sizes="48px"
                            className="object-cover"
                            data-ai-hint={`board game ${review.gameName?.split(' ')[0]?.toLowerCase() || 'mini'}`}
                          />
                        </div>
                        <div className="flex-grow">
                          <h3 className="text-md font-semibold text-primary leading-tight hover:underline">
                            {review.gameName}
                          </h3>
                           <p className="text-xs text-muted-foreground">Vedi Dettagli Gioco</p>
                        </div>
                      </Link>
                    </CardHeader>
                    <CardContent className="p-4">
                      <ReviewItem review={review} />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

