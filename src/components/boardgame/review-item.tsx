
'use client';

import type { Review, RatingCategory, Rating } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { RATING_CATEGORIES } from '@/lib/types';
import { formatReviewDate, calculateOverallCategoryAverage } from '@/lib/utils';
import { UserCircle2, Trash2, Edit3, Loader2 } from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState, useTransition } from 'react';
import { deleteReviewAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

interface ReviewItemProps {
  review: Review;
  currentUser: FirebaseUser | null;
  gameId: string;
  onReviewDeleted?: () => void;
}

export function ReviewItem({ review, currentUser, gameId, onReviewDeleted }: ReviewItemProps) {
  const overallReviewRating = calculateOverallCategoryAverage(review.rating);
  const isOwnReview = currentUser && review.userId === currentUser.uid;

  const [isDeleting, startDeleteTransition] = useTransition();
  const { toast } = useToast();

  const handleDeleteReview = async () => {
    if (!currentUser || !review.id) return; // Added null check for review.id
    startDeleteTransition(async () => {
      const result = await deleteReviewAction(gameId, review.id, currentUser.uid);
      if (result.success) {
        toast({ title: "Review Deleted", description: result.message });
        onReviewDeleted?.();
      } else {
        toast({ title: "Error", description: result.message, variant: "destructive" });
      }
    });
  };

  return (
    <Card className="shadow-md bg-card border border-border rounded-lg">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border">
              <AvatarFallback className="bg-muted">
                <UserCircle2 className="h-6 w-6 text-muted-foreground" />
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-base font-semibold text-foreground">{review.author}</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">{formatReviewDate(review.date)}</CardDescription>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1 text-sm text-foreground mb-1">
              <span className="font-semibold">Overall: {overallReviewRating.toFixed(1)} / 5</span>
            </div>
            {isOwnReview && (
              <div className="flex gap-2 mt-1">
                <Button variant="outline" size="sm" asChild className="h-7 px-2 py-1 text-xs">
                  <Link href={`/games/${gameId}/rate`}>
                    <Edit3 size={14} className="mr-1" /> Edit
                  </Link>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={isDeleting} className="h-7 px-2 py-1 text-xs">
                      {isDeleting ? <Loader2 size={14} className="mr-1 animate-spin"/> : <Trash2 size={14} className="mr-1" />}
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete your review.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteReview} className="bg-destructive hover:bg-destructive/90">
                        Confirm Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {review.comment && review.comment.trim() !== "" && (
         <p className="text-sm text-foreground/90 mb-4 leading-relaxed">{review.comment}</p>
        )}
        <div className="space-y-1.5 border-t border-border pt-3 mt-3">
          {(Object.keys(review.rating) as Array<keyof Rating>).map((categoryKey) => (
            <div key={categoryKey} className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground">{RATING_CATEGORIES[categoryKey as RatingCategory]}:</span>
              <span className="text-foreground font-medium">{review.rating[categoryKey]} / 5</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
