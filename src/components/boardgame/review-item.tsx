
'use client';

import type { Review } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatReviewDate, calculateOverallCategoryAverage, formatRatingNumber, calculateGroupedCategoryAverages } from '@/lib/utils';
import { UserCircle2 } from 'lucide-react';
import { GroupedRatingsDisplay } from '@/components/boardgame/grouped-ratings-display';
import { useMemo } from 'react';

interface ReviewItemProps {
  review: Review;
  // currentUser prop is no longer needed here as edit/delete are removed
  // gameId prop is no longer needed here
  // onReviewDeleted prop is no longer needed here
}

export function ReviewItem({ review }: ReviewItemProps) {
  const overallReviewRating = calculateOverallCategoryAverage(review.rating);

  const groupedAveragesForReview = useMemo(() => {
    return calculateGroupedCategoryAverages([review]);
  }, [review]);

  const getAuthorInitial = () => {
    if (review.author && review.author.trim().length > 0) {
      return review.author.substring(0, 1).toUpperCase();
    }
    return ''; 
  };

  return (
    <Card className="shadow-md bg-card border border-border rounded-lg">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border">
              {review.authorPhotoURL && <AvatarImage src={review.authorPhotoURL} alt={review.author} />}
              <AvatarFallback className="bg-muted text-muted-foreground">
                {getAuthorInitial() ? getAuthorInitial() : <UserCircle2 className="h-6 w-6" />}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-base font-semibold text-foreground">{review.author}</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">{formatReviewDate(review.date)}</CardDescription>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1 text-lg font-semibold text-primary mb-1">
              {formatRatingNumber(overallReviewRating * 2)}
            </div>
            {/* Edit and Delete buttons are removed from here */}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {review.comment && review.comment.trim() !== "" && (
         <p className="text-sm text-foreground/90 mb-4 leading-relaxed">{review.comment}</p>
        )}
        <GroupedRatingsDisplay 
            groupedAverages={groupedAveragesForReview}
            noRatingsMessage="No detailed ratings provided for this review."
            defaultOpenSections={[]} 
        />
      </CardContent>
    </Card>
  );
}
