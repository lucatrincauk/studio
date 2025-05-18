
'use client';

import { useState, useEffect, useMemo } from 'react';
import { getAllReviewsAction } from '@/lib/actions';
import type { AugmentedReview } from '@/lib/types';
import { ReviewItem } from '@/components/boardgame/review-item';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Link from 'next/link';
import { MessageSquareText, Loader2, Info, UserCircle2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculateOverallCategoryAverage } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { SafeImage } from '@/components/common/SafeImage';

type SortOrder = 'mostRecent' | 'leastRecent' | 'highestRated' | 'lowestRated';

interface UserFilterOption {
  author: string;
  authorPhotoURL?: string | null;
}

interface GameFilterOption {
  id: string;
  name: string;
  coverArtUrl?: string | null;
}

export default function AllReviewsPage() {
  const [allReviews, setAllReviews] = useState<AugmentedReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [selectedGame, setSelectedGame] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('mostRecent');

  useEffect(() => {
    async function fetchReviews() {
      setIsLoading(true);
      setError(null);
      try {
        const reviewsData = await getAllReviewsAction();
        setAllReviews(reviewsData);
      } catch (e) {
        setError('Impossibile caricare le recensioni.');
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    fetchReviews();
  }, []);

  const uniqueUsers: UserFilterOption[] = useMemo(() => {
    const usersMap = new Map<string, UserFilterOption>();
    allReviews.forEach(review => {
      if (!usersMap.has(review.author)) {
        usersMap.set(review.author, { author: review.author, authorPhotoURL: review.authorPhotoURL });
      }
    });
    const sortedUsers = Array.from(usersMap.values()).sort((a, b) => a.author.localeCompare(b.author));
    return [{ author: 'all', authorPhotoURL: null }, ...sortedUsers];
  }, [allReviews]);

  const uniqueGames: GameFilterOption[] = useMemo(() => {
    const gamesMap = new Map<string, GameFilterOption>();
    allReviews.forEach(review => {
      if (review.gameName && !gamesMap.has(review.gameId)) {
        gamesMap.set(review.gameId, { id: review.gameId, name: review.gameName, coverArtUrl: review.gameCoverArtUrl });
      }
    });
    const sortedGames = Array.from(gamesMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    return [{ id: 'all', name: 'all', coverArtUrl: null }, ...sortedGames];
  }, [allReviews]);

  const filteredAndSortedReviews = useMemo(() => {
    let reviewsToDisplay = [...allReviews];

    if (selectedUser !== 'all') {
      reviewsToDisplay = reviewsToDisplay.filter(review => review.author === selectedUser);
    }

    if (selectedGame !== 'all') {
      reviewsToDisplay = reviewsToDisplay.filter(review => review.gameId === selectedGame);
    }

    switch (sortOrder) {
      case 'mostRecent':
        reviewsToDisplay.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        break;
      case 'leastRecent':
        reviewsToDisplay.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        break;
      case 'highestRated':
        reviewsToDisplay.sort((a, b) => {
          const ratingA = calculateOverallCategoryAverage(a.rating);
          const ratingB = calculateOverallCategoryAverage(b.rating);
          return ratingB - ratingA;
        });
        break;
      case 'lowestRated':
        reviewsToDisplay.sort((a, b) => {
          const ratingA = calculateOverallCategoryAverage(a.rating);
          const ratingB = calculateOverallCategoryAverage(b.rating);
          return ratingA - ratingB;
        });
        break;
    }
    return reviewsToDisplay;
  }, [allReviews, selectedUser, selectedGame, sortOrder]);

  const reviewsByGame = useMemo(() => {
    const grouped: Record<string, AugmentedReview[]> = {};
    filteredAndSortedReviews.forEach(review => {
      if (!grouped[review.gameId]) {
        grouped[review.gameId] = [];
      }
      grouped[review.gameId].push(review);
    });
    return grouped;
  }, [filteredAndSortedReviews]);

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">Caricamento di tutte le recensioni...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-md mx-auto my-10">
        <Info className="h-4 w-4" />
        <AlertTitle>Errore nel Caricamento delle Recensioni</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const clearFilters = () => {
    setSelectedUser('all');
    setSelectedGame('all');
    setSortOrder('mostRecent');
  };
  
  const hasActiveFilters = selectedUser !== 'all' || selectedGame !== 'all' || sortOrder !== 'mostRecent';

  return (
    <div className="space-y-8">
      <Card className="shadow-lg border border-border rounded-lg">
        <CardHeader>
          <CardTitle className="text-2xl sm:text-3xl flex items-center gap-3">
            <MessageSquareText className="h-7 w-7 text-primary" />
            Sfoglia Tutte le Recensioni
          </CardTitle>
          <CardDescription>
            Esplora tutte le recensioni inviate dagli utenti per l'intera collezione di giochi. Usa i filtri sottostanti per affinare la ricerca.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label htmlFor="game-filter" className="block text-sm font-medium text-muted-foreground mb-1">Filtra per Gioco</label>
              <Select value={selectedGame} onValueChange={setSelectedGame}>
                <SelectTrigger id="game-filter" className="w-full">
                  <SelectValue placeholder="Seleziona un gioco" />
                </SelectTrigger>
                <SelectContent>
                  {uniqueGames.map(game => (
                    <SelectItem key={game.id} value={game.id}>
                      <div className="flex items-center gap-2">
                        {game.name === 'all' ? (
                          <span>Tutti i Giochi</span>
                        ) : (
                          <>
                            <div className="relative h-6 w-6 flex-shrink-0">
                              <SafeImage
                                src={game.coverArtUrl}
                                fallbackSrc={`https://placehold.co/40x40.png?text=${encodeURIComponent(game.name?.substring(0,2) || 'N/A')}`}
                                alt={`${game.name} copertina`}
                                fill
                                sizes="24px"
                                className="object-cover rounded-sm"
                                data-ai-hint="game cover"
                              />
                            </div>
                            <span>{game.name}</span>
                          </>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor="user-filter" className="block text-sm font-medium text-muted-foreground mb-1">Filtra per Utente</label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger id="user-filter" className="w-full">
                  <SelectValue placeholder="Seleziona un utente" />
                </SelectTrigger>
                <SelectContent>
                  {uniqueUsers.map(user => (
                    <SelectItem key={user.author} value={user.author}>
                      <div className="flex items-center gap-2">
                        {user.author === 'all' ? (
                          <span>Tutti gli Utenti</span>
                        ) : (
                          <>
                            <Avatar className="h-5 w-5 border">
                              {user.authorPhotoURL && <AvatarImage src={user.authorPhotoURL} alt={user.author} />}
                              <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                                {user.author.substring(0, 1).toUpperCase() || <UserCircle2 className="h-3 w-3" />}
                              </AvatarFallback>
                            </Avatar>
                            <span>{user.author}</span>
                          </>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor="sort-order" className="block text-sm font-medium text-muted-foreground mb-1">Ordina per</label>
              <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as SortOrder)}>
                <SelectTrigger id="sort-order" className="w-full">
                  <SelectValue placeholder="Ordina recensioni" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mostRecent">Più Recenti</SelectItem>
                  <SelectItem value="leastRecent">Meno Recenti</SelectItem>
                  <SelectItem value="highestRated">Voto Più Alto</SelectItem>
                  <SelectItem value="lowestRated">Voto Più Basso</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
           {hasActiveFilters && (
            <Button onClick={clearFilters} variant="outline" size="sm" className="mt-4">
              Azzera Filtri e Ordinamento
            </Button>
          )}
        </CardContent>
      </Card>

      <Separator />

      <div className="mb-4 text-lg font-semibold">
        Mostrando {filteredAndSortedReviews.length} di {allReviews.length} recensioni
      </div>

      {Object.keys(reviewsByGame).length === 0 ? (
         <Alert variant="default" className="bg-secondary/30 border-secondary">
            <Info className="h-4 w-4" />
            <AlertTitle>Nessuna Recensione Trovata</AlertTitle>
            <AlertDescription>
              Nessuna recensione corrisponde ai tuoi criteri di filtro. Prova a modificare i filtri o{' '}
              { hasActiveFilters && 
                <Button variant="link" className="p-0 h-auto inline" onClick={clearFilters}>azzera tutti i filtri</Button>
              }.
            </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-8">
          {Object.entries(reviewsByGame).map(([gameId, gameReviews]) => {
            if (!gameReviews || gameReviews.length === 0) return null;
            const firstReviewForGame = gameReviews[0]; 
            const fallbackGameHeaderSrc = `https://placehold.co/80x120.png?text=${encodeURIComponent(firstReviewForGame.gameName?.substring(0,10) || 'N/A')}`;
            return (
              <Card key={gameId} className="overflow-hidden shadow-lg border border-border rounded-lg">
                <CardHeader className="bg-muted/30 p-3 flex flex-row items-center gap-3">
                  <Link href={`/games/${firstReviewForGame.gameId}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity w-full">
                    <div className="relative h-16 w-12 flex-shrink-0 rounded-sm overflow-hidden shadow-sm">
                      <SafeImage
                        src={firstReviewForGame.gameCoverArtUrl}
                        fallbackSrc={fallbackGameHeaderSrc}
                        alt={`${firstReviewForGame.gameName || 'Gioco'} copertina`}
                        fill
                        sizes="48px"
                        className="object-cover"
                        data-ai-hint={`board game ${firstReviewForGame.gameName?.split(' ')[0]?.toLowerCase() || 'mini'}`}
                      />
                    </div>
                    <div className="flex-grow">
                      <h3 className="text-md font-semibold text-primary leading-tight">
                        {firstReviewForGame.gameName}
                      </h3>
                      <p className="text-xs text-muted-foreground">Vedi Dettagli Gioco</p>
                    </div>
                  </Link>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  {gameReviews.map((review) => (
                    <ReviewItem key={review.id} review={review} /> 
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
