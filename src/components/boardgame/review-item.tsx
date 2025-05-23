
'use client';

import type { Review } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatReviewDate, calculateOverallCategoryAverage, formatRatingNumber } from '@/lib/utils';
import { UserCircle2, Star } from 'lucide-react';
import { GroupedRatingsDisplay } from '@/components/boardgame/grouped-ratings-display';
import Link from 'next/link';

interface ReviewItemProps {
  review: Review;
}

const ANONYMOUS_USER_ID_MARKER = "ANONYMOUS_REVIEWER";

export function ReviewItem({ review }: ReviewItemProps) {
  const overallReviewRating = calculateOverallCategoryAverage(review.rating);

  const getAuthorInitial = () => {
    if (review.author && review.author.trim().length > 0) {
      return review.author.substring(0, 1).toUpperCase();
    }
    return '';
  };

  const isGuestReview = review.userId === ANONYMOUS_USER_ID_MARKER || !review.userId;

  return (
    <Card className="shadow-md bg-card border border-border rounded-lg">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {isGuestReview ? (
              <>
                <Avatar className="h-10 w-10 border">
                  <AvatarFallback className="bg-muted text-muted-foreground">
                    {getAuthorInitial() ? getAuthorInitial() : <UserCircle2 className="h-6 w-6" />}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <CardTitle className="text-base font-semibold text-foreground">{review.author}</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">{formatReviewDate(review.date)}</CardDescription>
                </div>
              </>
            ) : (
              <Link href={`/users/${review.userId}`} className="flex items-center gap-3 group">
                <Avatar className="h-10 w-10 border group-hover:border-primary transition-colors">
                  {review.authorPhotoURL && <AvatarImage src={review.authorPhotoURL} alt={review.author} />}
                  <AvatarFallback className="bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                    {getAuthorInitial() ? getAuthorInitial() : <UserCircle2 className="h-6 w-6" />}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <CardTitle className="text-base font-semibold text-foreground group-hover:text-primary group-hover:underline transition-colors">{review.author}</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">{formatReviewDate(review.date)}</CardDescription>
                </div>
              </Link>
            )}
          </div>
          <div className="flex flex-col items-end">
            <div className="text-2xl font-bold text-primary flex items-center">
              <Star className="h-5 w-5 text-accent fill-accent relative top-px mr-1" />
              {formatRatingNumber(overallReviewRating)}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {review.comment && review.comment.trim() !== "" && (
         <p className="text-sm text-foreground/90 mb-4 leading-relaxed">{review.comment}</p>
        )}
        <GroupedRatingsDisplay
            reviews={[review]}
            noRatingsMessage="Nessuna valutazione dettagliata per questo voto."
            defaultOpenSections={[]}
        />
      </CardContent>
    </Card>
  );
}
