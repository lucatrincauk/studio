import type { Review } from '@/lib/types';
import { ReviewItem } from './review-item';

interface ReviewListProps {
  reviews: Review[];
}

export function ReviewList({ reviews }: ReviewListProps) {
  if (!reviews || reviews.length === 0) {
    return <p className="text-center py-8 text-muted-foreground italic">No reviews yet for this game. Be the first to add one!</p>;
  }

  return (
    <div className="space-y-4">
      {reviews.slice().sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((review) => (
        <ReviewItem key={review.id} review={review} />
      ))}
    </div>
  );
}
