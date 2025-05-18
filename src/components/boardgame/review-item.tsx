
'use client';

import type { Review, RatingCategory } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StarRating } from './star-rating';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { RATING_CATEGORIES } from '@/lib/types';
import { formatReviewDate, calculateOverallCategoryAverage } from '@/lib/utils';
import { UserCircle2, Trash2, Edit3, Loader2 } from 'lucide-react'; // Added Edit3, Loader2
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
    if (!currentUser) return;
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

  const handleEditReview = () => {
    // TODO: Implement edit functionality. 
    // This could involve scrolling to the RatingForm (if on the same page and it supports edit mode)
    // or navigating to an edit page.
    toast({ title: "Edit Clicked", description: "Edit functionality is not yet implemented."});
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
              <StarRating rating={overallReviewRating} readOnly size={16} />
              <span className="font-semibold">({overallReviewRating.toFixed(1)})</span>
            </div>
            {isOwnReview && (
              <div className="flex gap-2 mt-1">
                {/* <Button variant="outline" size="sm" onClick={handleEditReview} disabled={isDeleting} className="h-7 px-2 py-1 text-xs">
                  <Edit3 size={14} className="mr-1" /> Edit
                </Button> */}
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
