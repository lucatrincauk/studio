import type { Review, RatingCategory } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StarRating } from './star-rating';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { RATING_CATEGORIES } from '@/lib/types';
import { formatReviewDate, calculateOverallCategoryAverage } from '@/lib/utils';
import { UserCircle2 } from 'lucide-react';

interface ReviewItemProps {
  review: Review;
}

export function ReviewItem({ review }: ReviewItemProps) {
  const overallReviewRating = calculateOverallCategoryAverage(review.rating);

  return (
    <Card className="shadow-md bg-card border border-border rounded-lg">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border">
              {/* Using a generic user icon as placeholder for avatar image */}
              <AvatarFallback className="bg-muted">
                <UserCircle2 className="h-6 w-6 text-muted-foreground" />
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-base font-semibold text-foreground">{review.author}</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">{formatReviewDate(review.date)}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1 text-sm text-foreground">
             <StarRating rating={overallReviewRating} readOnly size={16} />
             <span className="font-semibold">({overallReviewRating.toFixed(1)})</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-foreground/90 mb-4 leading-relaxed">{review.comment}</p>
        <div className="space-y-1.5 border-t border-border pt-3 mt-3">
          {Object.entries(review.rating).map(([category, score]) => (
            <div key={category} className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground">{RATING_CATEGORIES[category as RatingCategory]}:</span>
              <StarRating rating={score} readOnly size={14} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
