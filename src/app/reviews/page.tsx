
import { getAllReviewsAction } from '@/lib/actions';
import type { AugmentedReview } from '@/lib/types';
import { ReviewItem } from '@/components/boardgame/review-item';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import { MessageSquareText } from 'lucide-react';

export default async function AllReviewsPage() {
  const reviews: AugmentedReview[] = await getAllReviewsAction();

  return (
    <div className="space-y-8">
      <Card className="shadow-lg border border-border rounded-lg">
        <CardHeader>
          <CardTitle className="text-2xl sm:text-3xl flex items-center gap-3">
            <MessageSquareText className="h-7 w-7 text-primary" />
            All Player Reviews
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Browse all reviews submitted by users across the entire game collection.
          </p>
        </CardContent>
      </Card>

      {reviews.length === 0 ? (
        <p className="text-center text-muted-foreground py-10">No reviews found yet.</p>
      ) : (
        <div className="space-y-6">
          {reviews.map((review) => (
            <Card key={review.id} className="overflow-hidden shadow-md border border-border rounded-lg">
              <CardHeader className="bg-muted/30 p-4">
                <h3 className="text-lg font-semibold text-primary hover:underline">
                  <Link href={`/games/${review.gameId}`}>
                    Review for: {review.gameName}
                  </Link>
                </h3>
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

export const revalidate = 3600; // Revalidate this page every hour
export const dynamic = 'force-dynamic';
