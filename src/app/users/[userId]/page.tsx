
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getUserDetailsAndReviewsAction, getFavoritedGamesForUserAction, getWishlistedGamesForUserAction } from '@/lib/actions';
import type { AugmentedReview, UserProfile, BoardGame } from '@/lib/types';
import { ReviewItem } from '@/components/boardgame/review-item';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageSquareText, AlertCircle, Gamepad2, UserCircle2, Star, Heart, ListChecks, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { SafeImage } from '@/components/common/SafeImage';
import { calculateOverallCategoryAverage, formatRatingNumber } from '@/lib/utils';
import { GameCard } from '@/components/boardgame/game-card';

interface UserDetailPageParams {
  userId: string;
}

export default function UserDetailPage() {
  const params = useParams() as UserDetailPageParams;
  const { userId } = params;

  const [viewedUser, setViewedUser] = useState<UserProfile | null>(null);
  const [userReviews, setUserReviews] = useState<AugmentedReview[]>([]);
  const [favoritedGames, setFavoritedGames] = useState<BoardGame[]>([]);
  const [wishlistedGames, setWishlistedGames] = useState<BoardGame[]>([]);
  
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(true);
  const [isLoadingWishlist, setIsLoadingWishlist] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserData = useCallback(async () => {
    if (!userId) return;

    setIsLoadingProfile(true);
    setIsLoadingFavorites(true);
    setIsLoadingWishlist(true);
    setError(null);

    try {
      const [profileData, favData, wishData] = await Promise.all([
        getUserDetailsAndReviewsAction(userId),
        getFavoritedGamesForUserAction(userId),
        getWishlistedGamesForUserAction(userId)
      ]);

      if (profileData.user) {
        setViewedUser(profileData.user);
        setUserReviews(profileData.reviews);
      } else {
        setError('Utente non trovato.');
      }
      setIsLoadingProfile(false);

      setFavoritedGames(favData);
      setIsLoadingFavorites(false);
      
      setWishlistedGames(wishData);
      setIsLoadingWishlist(false);

    } catch (e) {
      console.error("Failed to fetch user data:", e);
      setError('Impossibile caricare i dati dell\'utente.');
      setIsLoadingProfile(false);
      setIsLoadingFavorites(false);
      setIsLoadingWishlist(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  if (isLoadingProfile) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">Caricamento profilo utente...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-md mx-auto my-10">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Errore</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!viewedUser) {
     return (
      <Alert variant="destructive" className="max-w-md mx-auto my-10">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Utente Non Trovato</AlertTitle>
        <AlertDescription>L'utente che cerchi non è stato trovato.</AlertDescription>
      </Alert>
    );
  }

  let averageScoreGiven: number | null = null;
  if (userReviews && userReviews.length > 0) {
    const totalScoreSum = userReviews.reduce((sum, review) => {
      const overallReviewAvg = calculateOverallCategoryAverage(review.rating);
      return sum + (overallReviewAvg * 2); // Summing scores on 2-10 scale
    }, 0);
    averageScoreGiven = totalScoreSum / userReviews.length;
  }

  return (
    <div className="space-y-10">
      <Card className="shadow-lg border border-border rounded-lg">
        <CardHeader className="flex flex-col sm:flex-row items-center text-center sm:text-left space-y-4 sm:space-y-0 sm:space-x-6 p-6">
          <Avatar className="h-24 w-24 sm:h-28 sm:w-28 border-4 border-primary/50">
            {viewedUser.photoURL && <AvatarImage src={viewedUser.photoURL} alt={viewedUser.name} />}
            <AvatarFallback className="text-4xl bg-muted text-muted-foreground">
              {viewedUser.name ? viewedUser.name.substring(0, 1).toUpperCase() : <UserCircle2 className="h-12 w-12 sm:h-14 sm:w-14"/>}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <CardTitle className="text-2xl sm:text-3xl font-bold text-foreground">
              {viewedUser.name}
            </CardTitle>
            <div className="text-sm text-muted-foreground mt-1.5 space-y-0.5">
                <p>{userReviews.length} {userReviews.length === 1 ? 'Recensione Inviata' : 'Recensioni Inviate'}</p>
                {averageScoreGiven !== null && (
                    <p className="flex items-center justify-center sm:justify-start gap-1">
                        <Star className="h-4 w-4 text-accent fill-accent" />
                        Voto Medio Dato: <span className="font-semibold text-foreground">{formatRatingNumber(averageScoreGiven)}</span>
                    </p>
                )}
            </div>
          </div>
        </CardHeader>
      </Card>

      <Separator />

      <section>
        <h2 className="text-2xl font-semibold mb-6 text-foreground flex items-center gap-3">
          <MessageSquareText className="h-6 w-6 text-primary" />
          Recensioni di {viewedUser.name}
        </h2>
        {userReviews.length === 0 ? (
          <Alert variant="default" className="bg-secondary/30 border-secondary">
            <Gamepad2 className="h-4 w-4" />
            <AlertTitle>Nessuna Recensione Ancora</AlertTitle>
            <AlertDescription>
              {viewedUser.name} non ha ancora inviato recensioni.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            {userReviews.map((review) => {
              const fallbackGameHeaderSrc = `https://placehold.co/48x64.png?text=${encodeURIComponent(review.gameName?.substring(0,3) || 'N/A')}`;
              return (
                <Card key={review.id} className="overflow-hidden shadow-md border border-border rounded-lg">
                  <CardHeader className="bg-muted/30 p-3">
                     <div className="flex items-center gap-3 hover:opacity-80 transition-opacity w-full"> {/* Removed Link to avoid nested links */}
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
                        <CardTitle className="text-md font-semibold text-primary leading-tight">
                          {review.gameName}
                        </CardTitle>
                         <CardDescription className="text-xs text-muted-foreground">Vedi Dettagli Recensione</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    <ReviewItem review={review} />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
      
      <Separator />

      <section>
        <h2 className="text-2xl font-semibold mb-6 text-foreground flex items-center gap-2">
          <Heart className="h-6 w-6 text-destructive" />
          Giochi Preferiti di {viewedUser.name}
        </h2>
        {isLoadingFavorites ? (
          <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : favoritedGames.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {favoritedGames.map((game, index) => (
              <GameCard key={game.id} game={game} variant="featured" priority={index < 5} showOverlayText={true} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">{viewedUser.name} non ha ancora aggiunto giochi ai preferiti.</p>
        )}
      </section>

      <Separator />

      <section>
        <h2 className="text-2xl font-semibold mb-6 text-foreground flex items-center gap-2">
          <ListChecks className="h-6 w-6 text-sky-500" />
          Wishlist di {viewedUser.name}
        </h2>
        {isLoadingWishlist ? (
          <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : wishlistedGames.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {wishlistedGames.map((game, index) => (
              <GameCard key={game.id} game={game} variant="featured" priority={index < 5} showOverlayText={true} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">La wishlist di {viewedUser.name} è vuota.</p>
        )}
      </section>
    </div>
  );
}
