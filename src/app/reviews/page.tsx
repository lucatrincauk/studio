
'use client';

import { useState, useEffect, useMemo } from 'react';
import { getAllReviewsAction } from '@/lib/actions';
import type { AugmentedReview } from '@/lib/types';
import { ReviewItem } from '@/components/boardgame/review-item';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Link from 'next/link';
import { MessageSquareText, Loader2, Info } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculateOverallCategoryAverage } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

type SortOrder = 'mostRecent' | 'leastRecent' | 'highestRated' | 'lowestRated';

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

  const uniqueUsers = useMemo(() => {
    const users = new Set(allReviews.map(review => review.author));
    return ['all', ...Array.from(users).sort()];
  }, [allReviews]);

  const uniqueGames = useMemo(() => {
    const games = new Set(allReviews.map(review => review.gameName));
    return ['all', ...Array.from(games).sort()];
  }, [allReviews]);

  const filteredAndSortedReviews = useMemo(() => {
    let reviewsToDisplay = [...allReviews];

    // Filter by user
    if (selectedUser !== 'all') {
      reviewsToDisplay = reviewsToDisplay.filter(review => review.author === selectedUser);
    }

    // Filter by game
    if (selectedGame !== 'all') {
      reviewsToDisplay = reviewsToDisplay.filter(review => review.gameName === selectedGame);
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
                    <SelectItem key={game} value={game}>
                      {game === 'all' ? 'All Games' : game}
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
                    <SelectItem key={user} value={user}>
                      {user === 'all' ? 'All Users' : user}
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
              <CardHeader className="bg-muted/30 p-4">
                <Link href={`/games/${review.gameId}`} className="hover:underline">
                  <h3 className="text-lg font-semibold text-primary">
                    Review for: {review.gameName}
                  </h3>
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
