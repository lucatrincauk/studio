
// src/components/boardgame/rating-form.tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFormContext } from 'react-hook-form';
import { useEffect, useTransition, useState } from 'react'; // Removed useActionState, Added useState
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
import { collection, addDoc, query, where, getDocs, limit, doc, getDoc } from 'firebase/firestore';

interface RatingFormProps {
  gameId: string;
  onReviewSubmitted?: () => void;
  currentUser: FirebaseUser | null;
  existingReview?: Review | null; // This prop is for potential future edit functionality
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
    } else if (currentUser && !existingReview) {
        form.reset({
            author: currentUser.displayName || '', // Pre-fill author name
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
      toast({ title: "Authentication Required", description: "Please log in to submit a review.", variant: "destructive" });
      setFormError("Please log in to submit a review.");
      return;
    }
    console.log('[CLIENT RATING FORM] Attempting to submit review. Data:', data, 'UserID:', currentUser.uid);
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
        const existingReviewQuery = query(reviewsCollectionRef, where("userId", "==", currentUser.uid), limit(1));
        const existingReviewSnapshot = await getDocs(existingReviewQuery);

        if (!existingReviewSnapshot.empty && !existingReview) { // !existingReview ensures this check is for new submissions
          toast({ title: "Already Reviewed", description: "You have already submitted a review for this game.", variant: "default" });
          setFormError("You have already submitted a review for this game.");
          return;
        }
        
        const rating: Rating = { 
          feeling: data.feeling, 
          gameDesign: data.gameDesign, 
          presentation: data.presentation, 
          management: data.management 
        };

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
        form.reset({
          author: currentUser.displayName || '',
          feeling: 1,
          gameDesign: 1,
          presentation: 1,
          management: 1,
          comment: '',
        });
        onReviewSubmitted?.();

      } catch (error) {
        console.error("Error submitting review from client:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        toast({ title: "Error", description: `Failed to submit review: ${errorMessage}`, variant: "destructive" });
        setFormError(`Failed to submit review: ${errorMessage}`);
      }
    });
  };

  if (!currentUser) {
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
          {existingReview ? "Edit Your Review" : "Rate this Game"}
        </h3>

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
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <SubmitButton isActionPending={isSubmitting} buttonText={existingReview ? "Update Review" : "Submit Review"} />
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

function SubmitButton({ isActionPending, buttonText }: { isActionPending: boolean, buttonText: string }) {
  const { formState } = useFormContext<RatingFormValues>();
  const rhfIsSubmitting = formState.isSubmitting; // RHF's own indicator for async validation etc.

  const trulySubmitting = rhfIsSubmitting || isActionPending;

  return (
    <Button
      type="submit"
      className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90 focus:ring-accent/50 transition-colors"
      disabled={trulySubmitting}
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
