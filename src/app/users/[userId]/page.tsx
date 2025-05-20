
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter }
from 'next/navigation';
import { getUserDetailsAndReviewsAction, getFavoritedGamesForUserAction, getPlaylistedGamesForUserAction } from '@/lib/actions'; // Renamed action
import type { AugmentedReview, UserProfile, BoardGame } from '@/lib/types';
import { ReviewItem } from '@/components/boardgame/review-item';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageSquareText, AlertCircle, Gamepad2, UserCircle2, Star, Heart, ListChecks, Loader2, ExternalLink } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { SafeImage } from '@/components/common/SafeImage';
import { calculateOverallCategoryAverage, formatRatingNumber } from '@/lib/utils';
import { GameCard } from '@/components/boardgame/game-card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface UserDetailPageParams {
  userId: string;
}

export default function UserDetailPage() {
  const params = useParams() as UserDetailPageParams;
  const { userId } = params;
  const router = useRouter();

  const [viewedUser, setViewedUser] = useState<UserProfile | null>(null);
  const [userReviews, setUserReviews] = useState<AugmentedReview[]>([]);
  const [favoritedGames, setFavoritedGames] = useState<BoardGame[]>([]);
  const [playlistedGames, setPlaylistedGames] = useState<BoardGame[]>([]); // Renamed from wishlistedGames
  
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isLoadingReviews, setIsLoadingReviews] = useState(true);
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(true);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(true); // Renamed from isLoadingWishlist
  const [error, setError] = useState<string | null>(null);

  const fetchUserData = useCallback(async () => {
    if (!userId) return;

    setIsLoadingProfile(true);
    setIsLoadingReviews(true);
    setIsLoadingFavorites(true);
    setIsLoadingPlaylist(true); // Renamed
    setError(null);

    try {
      const [profileAndReviewsData, favData, playlistData] = await Promise.all([ // Renamed from wishData
        getUserDetailsAndReviewsAction(userId),
        getFavoritedGamesForUserAction(userId),
        getPlaylistedGamesForUserAction(userId) // Renamed action
      ]);

      if (profileAndReviewsData.user) {
        setViewedUser(profileAndReviewsData.user);
        setUserReviews(profileAndReviewsData.reviews);
      } else {
        setError('Utente non trovato.');
      }
      setIsLoadingProfile(false);
      setIsLoadingReviews(false);

      setFavoritedGames(favData);
      setIsLoadingFavorites(false);
      
      setPlaylistedGames(playlistData); // Renamed
      setIsLoadingPlaylist(false); // Renamed

    } catch (e) {
      // console.error("Failed to fetch user data:", e);
      setError('Impossibile caricare i dati dell\'utente.');
      setIsLoadingProfile(false);
      setIsLoadingReviews(false);
      setIsLoadingFavorites(false);
      setIsLoadingPlaylist(false); // Renamed
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
      return sum + (overallReviewAvg * 2); 
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
         <h2 className="text-2xl font-semibold mb-4 text-foreground flex items-center gap-3">
            <MessageSquareText className="h-6 w-6 text-primary" />
            Tutte le Recensioni di {viewedUser.name} ({userReviews.length})
        </h2>
        {isLoadingReviews ? (
           <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : userReviews.length > 0 ? (
          <div className="flex space-x-4 overflow-x-auto pb-4">
            {userReviews.map((review, index) => {
              const gameForCard: BoardGame = {
                id: review.gameId,
                name: review.gameName || "Gioco Sconosciuto",
                coverArtUrl: review.gameCoverArtUrl || '',
                bggId: 0, 
                reviews: [],
                overallAverageRating: calculateOverallCategoryAverage(review.rating), 
              };
              const reviewDetailHref = `/games/${review.gameId}/reviews/${review.id}`;
              return (
                <div key={review.id} className="w-40 flex-shrink-0">
                    <GameCard 
                        game={gameForCard}
                        variant="featured" 
                        priority={index < 3} 
                        showOverlayText={true}
                        overrideHref={reviewDetailHref} 
                    />
                </div>
              );
            })}
          </div>
        ) : (
          <Alert variant="default" className="bg-secondary/30 border-secondary">
            <Gamepad2 className="h-4 w-4" />
            <AlertTitle>Nessuna Recensione</AlertTitle>
            <AlertDescription>
              {viewedUser.name} non ha ancora inviato recensioni.
            </AlertDescription>
          </Alert>
        )}
      </section>
      
      <Separator />

      <section>
        <h2 className="text-2xl font-semibold mb-6 text-foreground flex items-center gap-2">
          <Heart className="h-6 w-6 text-destructive" />
          Giochi Preferiti di {viewedUser.name} ({favoritedGames.length})
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
          Playlist di {viewedUser.name} ({playlistedGames.length}) {/* Renamed */}
        </h2>
        {isLoadingPlaylist ? ( // Renamed
          <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : playlistedGames.length > 0 ? ( // Renamed
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {playlistedGames.map((game, index) => ( // Renamed
              <GameCard key={game.id} game={game} variant="featured" priority={index < 5} showOverlayText={true} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">La playlist di {viewedUser.name} è vuota.</p> // Updated text
        )}
      </section>
    </div>
  );
}

