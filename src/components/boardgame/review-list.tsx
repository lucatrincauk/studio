
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
    return <p className="text-center py-8 text-muted-foreground italic">No reviews yet for this game. Be the first to add one!</p>;
  }

  return (
    <div className="space-y-4">
      {reviews.slice().sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((review) => (
        <ReviewItem 
          key={review.id} 
          review={review} 
          currentUser={currentUser} 
          gameId={gameId}
          onReviewDeleted={onReviewDeleted}
        />
      ))}
    </div>
  );
}
