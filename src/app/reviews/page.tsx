
'use client';

import { useState, useEffect, useMemo } from 'react';
import { getAllReviewsAction } from '@/lib/actions';
import type { AugmentedReview } from '@/lib/types';
import { ReviewItem } from '@/components/boardgame/review-item';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Link from 'next/link';
import Image from 'next/image'; // Import Next Image
import { MessageSquareText, Loader2, Info, UserCircle2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculateOverallCategoryAverage } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

type SortOrder = 'mostRecent' | 'leastRecent' | 'highestRated' | 'lowestRated';

interface UserFilterOption {
  author: string;
  authorPhotoURL?: string | null;
}

interface GameFilterOption {
  id: string; // Add gameId for unique key
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
        setError('Failed to load reviews.');
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
      if (review.gameName && !gamesMap.has(review.gameId)) { // Use gameId as key
        gamesMap.set(review.gameId, { id: review.gameId, name: review.gameName, coverArtUrl: review.gameCoverArtUrl });
      }
    });
    const sortedGames = Array.from(gamesMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    return [{ id: 'all', name: 'all', coverArtUrl: null }, ...sortedGames];
  }, [allReviews]);

  const filteredAndSortedReviews = useMemo(() => {
    let reviewsToDisplay = [...allReviews];

    // Filter by user
    if (selectedUser !== 'all') {
      reviewsToDisplay = reviewsToDisplay.filter(review => review.author === selectedUser);
    }

    // Filter by game
    if (selectedGame !== 'all') {
      reviewsToDisplay = reviewsToDisplay.filter(review => review.gameId === selectedGame); // Filter by gameId
    }

    // Sort
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
          return ratingB - ratingA; // Descending for highest
        });
        break;
      case 'lowestRated':
        reviewsToDisplay.sort((a, b) => {
          const ratingA = calculateOverallCategoryAverage(a.rating);
          const ratingB = calculateOverallCategoryAverage(b.rating);
          return ratingA - ratingB; // Ascending for lowest
        });
        break;
    }
    return reviewsToDisplay;
  }, [allReviews, selectedUser, selectedGame, sortOrder]);

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">Loading all reviews...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-md mx-auto my-10">
        <Info className="h-4 w-4" />
        <AlertTitle>Error Loading Reviews</AlertTitle>
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
            Browse All Player Reviews
          </CardTitle>
          <CardDescription>
            Explore all reviews submitted by users across the entire game collection. Use the filters below to narrow your search.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label htmlFor="game-filter" className="block text-sm font-medium text-muted-foreground mb-1">Filter by Game</label>
              <Select value={selectedGame} onValueChange={setSelectedGame}>
                <SelectTrigger id="game-filter" className="w-full">
                  <SelectValue placeholder="Select a game" />
                </SelectTrigger>
                <SelectContent>
                  {uniqueGames.map(game => (
                    <SelectItem key={game.id} value={game.id}> {/* Use game.id as value */}
                      <div className="flex items-center gap-2">
                        {game.name === 'all' ? (
                          <span>All Games</span>
                        ) : (
                          <>
                            <div className="relative h-6 w-6 flex-shrink-0">
                              <Image
                                src={game.coverArtUrl || `https://placehold.co/40x40.png?text=${game.name.substring(0,1)}`}
                                alt={`${game.name} cover`}
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
              <label htmlFor="user-filter" className="block text-sm font-medium text-muted-foreground mb-1">Filter by User</label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger id="user-filter" className="w-full">
                  <SelectValue placeholder="Select a user" />
                </SelectTrigger>
                <SelectContent>
                  {uniqueUsers.map(user => (
                    <SelectItem key={user.author} value={user.author}>
                      <div className="flex items-center gap-2">
                        {user.author === 'all' ? (
                          <span>All Users</span>
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
              <label htmlFor="sort-order" className="block text-sm font-medium text-muted-foreground mb-1">Sort by</label>
              <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as SortOrder)}>
                <SelectTrigger id="sort-order" className="w-full">
                  <SelectValue placeholder="Sort reviews" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mostRecent">Most Recent</SelectItem>
                  <SelectItem value="leastRecent">Least Recent</SelectItem>
                  <SelectItem value="highestRated">Highest Rated</SelectItem>
                  <SelectItem value="lowestRated">Lowest Rated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
           {hasActiveFilters && (
            <Button onClick={clearFilters} variant="outline" size="sm" className="mt-4">
              Clear Filters & Sort
            </Button>
          )}
        </CardContent>
      </Card>

      <Separator />

      <div className="mb-4 text-lg font-semibold">
        Displaying {filteredAndSortedReviews.length} of {allReviews.length} reviews
      </div>

      {filteredAndSortedReviews.length === 0 ? (
         <Alert variant="default" className="bg-secondary/30 border-secondary">
            <Info className="h-4 w-4" />
            <AlertTitle>No Reviews Found</AlertTitle>
            <AlertDescription>
              No reviews match your current filter criteria. Try adjusting your filters or{' '}
              { hasActiveFilters && 
                <Button variant="link" className="p-0 h-auto inline" onClick={clearFilters}>clear all filters</Button>
              }.
            </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-6">
          {filteredAndSortedReviews.map((review) => (
            <Card key={`${review.gameId}-${review.id}`} className="overflow-hidden shadow-md border border-border rounded-lg">
              <CardHeader className="bg-muted/30 p-3 flex flex-row items-center gap-3">
                <Link href={`/games/${review.gameId}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity w-full">
                  <div className="relative h-16 w-12 flex-shrink-0 rounded-sm overflow-hidden shadow-sm">
                    <Image
                      src={review.gameCoverArtUrl || `https://placehold.co/80x120.png?text=${review.gameName?.substring(0,3) || 'N/A'}`}
                      alt={`${review.gameName || 'Game'} cover art`}
                      fill
                      sizes="48px"
                      className="object-cover"
                      data-ai-hint={`board game ${review.gameName?.split(' ')[0]?.toLowerCase() || 'mini'}`}
                      onError={(e) => { e.currentTarget.src = `https://placehold.co/80x120.png?text=${review.gameName?.substring(0,3) || 'N/A'}`; }}
                    />
                  </div>
                  <div className="flex-grow">
                    <h3 className="text-md font-semibold text-primary leading-tight">
                      {review.gameName}
                    </h3>
                    <p className="text-xs text-muted-foreground">View Game Details</p>
                  </div>
                </Link>
              </CardHeader>
              <CardContent className="p-4">
                <ReviewItem review={review} /> 
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

