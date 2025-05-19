
import type { Review } from '@/lib/types';
import { ReviewItem } from './review-item';

interface ReviewListProps {
  reviews: Review[];
}

export function ReviewList({ reviews }: ReviewListProps) {
  if (!reviews || reviews.length === 0) {
    return <p className="text-center py-8 text-muted-foreground italic">Nessuna recensione per questo gioco. Sii il primo ad aggiungerne una!</p>;
  }

  // Sort reviews by date, newest first, before mapping
  const sortedReviews = [...reviews].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-4">
      {sortedReviews.map((review) => (
        <ReviewItem 
          key={review.id} 
          review={review}
        />
      ))}
    </div>
  );
}
