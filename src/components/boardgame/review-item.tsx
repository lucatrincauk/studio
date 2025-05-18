
'use client';

import type { Review, RatingCategory, Rating } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { RATING_CATEGORIES } from '@/lib/types';
import { formatReviewDate, calculateOverallCategoryAverage, formatRatingNumber, calculateGroupedCategoryAverages, type GroupedCategoryAverages } from '@/lib/utils';
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Progress } from '@/components/ui/progress';
import { useState, useTransition, useMemo } from 'react';
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

  const groupedAveragesForReview = useMemo(() => {
    return calculateGroupedCategoryAverages([review]);
  }, [review]);

  const handleDeleteReview = async () => {
    if (!currentUser || !review.id) return;
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
            <div className="flex items-center gap-1 text-lg font-semibold text-primary mb-1">
              {formatRatingNumber(overallReviewRating * 2)}
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
        {groupedAveragesForReview && groupedAveragesForReview.length > 0 && (
            <Accordion type="multiple" className="w-full -mx-1">
                {groupedAveragesForReview.map((section, index) => (
                <AccordionItem value={`review-section-${review.id}-${index}`} key={section.sectionTitle} className="border-b-0">
                    <AccordionTrigger className="hover:no-underline text-left py-2.5 px-1 rounded hover:bg-muted/50">
                    <div className="flex justify-between w-full items-center pr-2 gap-4">
                        <span className="font-medium text-sm text-foreground flex-grow">{section.sectionTitle}</span>
                        <div className="flex items-center gap-2 flex-shrink-0 w-20">
                        <Progress value={(section.sectionAverage / 5) * 100} className="w-full h-2" />
                        </div>
                    </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-1">
                    <ul className="space-y-1.5 pl-3 pt-1.5">
                        {section.subRatings.map(sub => (
                        <li key={sub.name} className="flex justify-between items-center text-xs">
                            <span className="text-muted-foreground">{sub.name}:</span>
                            <span className="font-medium text-foreground">{formatRatingNumber(sub.average)} / 5</span>
                        </li>
                        ))}
                    </ul>
                    </AccordionContent>
                </AccordionItem>
                ))}
            </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
