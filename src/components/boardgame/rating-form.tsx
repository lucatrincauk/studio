
// src/components/boardgame/rating-form.tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFormContext } from 'react-hook-form';
import { useEffect, useTransition, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { StarRating } from './star-rating';
import type { RatingCategory, Review, Rating } from '@/lib/types';
import { RATING_CATEGORIES } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2, LogIn } from 'lucide-react';
import { reviewFormSchema, type RatingFormValues } from '@/lib/validators';
import type { User as FirebaseUser } from 'firebase/auth';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// Firestore imports for client-side write
import { db } from '@/lib/firebase';
import { collection, addDoc, query, where, getDocs, limit, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

interface RatingFormProps {
  gameId: string;
  onReviewSubmitted?: () => void;
  currentUser: FirebaseUser | null;
  existingReview?: Review | null;
}

export function RatingForm({ gameId, onReviewSubmitted, currentUser, existingReview }: RatingFormProps) {
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const { toast } = useToast();

  const form = useForm<RatingFormValues>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: {
      author: existingReview?.author || currentUser?.displayName || '',
      feeling: existingReview?.rating.feeling || 1,
      gameDesign: existingReview?.rating.gameDesign || 1,
      presentation: existingReview?.rating.presentation || 1,
      management: existingReview?.rating.management || 1,
      comment: existingReview?.comment || '',
    },
  });

  useEffect(() => {
    if (existingReview) {
      form.reset({
        author: existingReview.author,
        feeling: existingReview.rating.feeling,
        gameDesign: existingReview.rating.gameDesign,
        presentation: existingReview.rating.presentation,
        management: existingReview.rating.management,
        comment: existingReview.comment,
      });
    } else if (currentUser) { // Only reset to defaults if no existing review but user is present
        form.reset({
            author: currentUser.displayName || '',
            feeling: 1,
            gameDesign: 1,
            presentation: 1,
            management: 1,
            comment: '',
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingReview, currentUser, form.reset]);


  const ratingCategories: RatingCategory[] = ['feeling', 'gameDesign', 'presentation', 'management'];

  const handleFormSubmit = async (data: RatingFormValues) => {
    if (!currentUser) {
      toast({ title: "Authentication Required", description: "Please log in to submit or update a review.", variant: "destructive" });
      setFormError("Please log in to submit or update a review.");
      return;
    }
    
    setFormError(null);
    setFormSuccess(null);

    startSubmitTransition(async () => {
      try {
        const gameDocRef = doc(db, "boardgames_collection", gameId);
        const gameDocSnap = await getDoc(gameDocRef);
        if (!gameDocSnap.exists()) {
          toast({ title: "Error", description: "Game not found. Cannot submit review.", variant: "destructive" });
          setFormError("Game not found. Cannot submit review.");
          return;
        }

        const reviewsCollectionRef = collection(db, "boardgames_collection", gameId, 'reviews');
        
        const rating: Rating = { 
          feeling: data.feeling, 
          gameDesign: data.gameDesign, 
          presentation: data.presentation, 
          management: data.management 
        };

        if (existingReview?.id) {
          // Update existing review
          const reviewDocRef = doc(reviewsCollectionRef, existingReview.id);
          const reviewSnapshot = await getDoc(reviewDocRef);
          if (!reviewSnapshot.exists() || reviewSnapshot.data()?.userId !== currentUser.uid) {
            toast({ title: "Error", description: "Review not found or you do not have permission to edit it.", variant: "destructive" });
            setFormError("Review not found or you do not have permission to edit it.");
            return;
          }

          await updateDoc(reviewDocRef, {
            author: data.author,
            rating,
            comment: data.comment,
            date: new Date().toISOString(), // Update the date to reflect last modification
          });
          toast({ title: "Success!", description: "Review updated successfully!" });
          setFormSuccess("Review updated successfully!");

        } else {
          // Create new review - check if user already reviewed (unless editing)
          const existingReviewQuery = query(reviewsCollectionRef, where("userId", "==", currentUser.uid), limit(1));
          const existingReviewSnapshot = await getDocs(existingReviewQuery);

          if (!existingReviewSnapshot.empty) {
            toast({ title: "Already Reviewed", description: "You have already submitted a review for this game. Edit your existing review.", variant: "default" });
            setFormError("You have already submitted a review for this game.");
            // Optionally, find and pass this review to onReviewSubmitted to trigger edit mode
            if (onReviewSubmitted) onReviewSubmitted();
            return;
          }
          
          const newReviewData = {
            author: data.author,
            userId: currentUser.uid,
            rating,
            comment: data.comment,
            date: new Date().toISOString(),
          };
          await addDoc(reviewsCollectionRef, newReviewData);
          toast({ title: "Success!", description: "Review submitted successfully!" });
          setFormSuccess("Review submitted successfully!");
          form.reset({ // Reset to blank form for new review (or user defaults)
            author: currentUser.displayName || '',
            feeling: 1,
            gameDesign: 1,
            presentation: 1,
            management: 1,
            comment: '',
          });
        }
        
        onReviewSubmitted?.();

      } catch (error) {
        console.error("Error submitting/updating review from client:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        const actionType = existingReview?.id ? "update" : "submit";
        toast({ title: "Error", description: `Failed to ${actionType} review: ${errorMessage}`, variant: "destructive" });
        setFormError(`Failed to ${actionType} review: ${errorMessage}`);
      }
    });
  };

  if (!currentUser && !existingReview) { // If there's an existing review, still show form (e.g. for public viewing)
    return (
      <Alert className="bg-card border border-border p-6 rounded-lg shadow-md">
        <LogIn className="h-5 w-5 text-primary" />
        <AlertTitle className="text-lg font-semibold text-foreground mt-2">Log In to Review</AlertTitle>
        <AlertDescription className="text-muted-foreground mt-1">
          You need to be logged in to submit or edit a review.
        </AlertDescription>
        <Button asChild className="mt-4 w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90">
          <Link href="/signin">Sign In</Link>
        </Button>
      </Alert>
    );
  }


  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleFormSubmit)}
        className="space-y-6 p-6 border border-border rounded-lg shadow-md bg-card"
      >
        <h3 className="text-xl font-semibold text-foreground">
          {existingReview?.id ? "Edit Your Review" : "Rate this Game"}
        </h3>
         {!currentUser && existingReview?.id && (
            <Alert variant="default" className="bg-secondary/30 border-secondary">
                <LogIn className="h-4 w-4 text-secondary-foreground" />
                <AlertDescription className="text-secondary-foreground">
                  <Link href="/signin" className="font-semibold underline">Sign in</Link> to edit this review.
                </AlertDescription>
            </Alert>
        )}

        <FormField
          control={form.control}
          name="author"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-base font-medium">Your Name (Display)</FormLabel>
              <FormControl>
                <Input
                  placeholder="Enter your display name"
                  {...field}
                  className="bg-background focus:ring-primary"
                  disabled={!currentUser} // Disable if not logged in, even if existingReview
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {ratingCategories.map((category) => (
          <FormField
            key={category}
            control={form.control}
            name={category}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base font-medium">{RATING_CATEGORIES[category]}</FormLabel>
                <FormControl>
                  <StarRating
                    rating={field.value}
                    setRating={(value) => field.onChange(value)}
                    size={28}
                    className="py-1"
                    readOnly={!currentUser} // ReadOnly if not logged in
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
        <FormField
          control={form.control}
          name="comment"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-base font-medium">Your Review</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Share your thoughts on the game..."
                  className="resize-y min-h-[100px] bg-background focus:ring-primary"
                  {...field}
                  disabled={!currentUser} // Disable if not logged in
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <SubmitButton 
          isActionPending={isSubmitting} 
          buttonText={existingReview?.id ? "Update Review" : "Submit Review"} 
          disabled={!currentUser} // Disable submit button if not logged in
        />
         {formError && (
          <p className="text-sm font-medium text-destructive">{formError}</p>
        )}
        {formSuccess && !formError && (
            <p className="text-sm font-medium text-green-600">{formSuccess}</p>
        )}
      </form>
    </Form>
  );
}

function SubmitButton({ isActionPending, buttonText, disabled }: { isActionPending: boolean, buttonText: string, disabled?: boolean }) {
  const { formState } = useFormContext<RatingFormValues>();
  const rhfIsSubmitting = formState.isSubmitting;

  const trulySubmitting = rhfIsSubmitting || isActionPending;

  return (
    <Button
      type="submit"
      className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90 focus:ring-accent/50 transition-colors"
      disabled={trulySubmitting || disabled}
    >
      {trulySubmitting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Submitting...
        </>
      ) : (
        buttonText
      )}
    </Button>
  );
}

