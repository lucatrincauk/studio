
import type { Review } from '@/lib/types';
import { ReviewItem } from './review-item';
import type { User as FirebaseUser } from 'firebase/auth';

interface ReviewListProps {
  reviews: Review[];
  currentUser: FirebaseUser | null;
  gameId: string;
  onReviewDeleted?: () => void; // Callback to refresh list
}

export function ReviewList({ reviews, currentUser, gameId, onReviewDeleted }: ReviewListProps) {
  if (!reviews || reviews.length === 0) {
    return <p className="text-center py-8 text-muted-foreground italic">Nessuna recensione per questo gioco. Sii il primo ad aggiungerne una!</p>;
  }

  return (
    <div className="space-y-4">
      {reviews.slice().sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((review) => (
        <ReviewItem 
          key={review.id} 
          review={review}
        />
      ))}
    </div>
  );
}
