
// src/components/boardgame/rating-form.tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFormContext } from 'react-hook-form';
import { useActionState, useEffect, useTransition } from 'react';
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
import type { RatingCategory, Review } from '@/lib/types';
import { RATING_CATEGORIES } from '@/lib/types';
import { submitNewReviewAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2, LogIn } from 'lucide-react';
import { reviewFormSchema, type RatingFormValues } from '@/lib/validators';
import type { User as FirebaseUser } from 'firebase/auth';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface RatingFormProps {
  gameId: string;
  onReviewSubmitted?: () => void;
  currentUser: FirebaseUser | null;
  existingReview?: Review | null;
}

type ReviewActionPayload = RatingFormValues & { userId?: string };

const initialState = {
  message: "",
  errors: undefined as Record<string, string[]> | undefined,
  success: false,
};

export function RatingForm({ gameId, onReviewSubmitted, currentUser, existingReview }: RatingFormProps) {
  const [isActionPending, startTransition] = useTransition();

  const [serverActionState, formActionDispatcher] = useActionState(
    (prevState: typeof initialState, payload: ReviewActionPayload) => submitNewReviewAction(gameId, prevState, payload),
    initialState
  );
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
            ...form.getValues(),
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


  useEffect(() => {
    if(serverActionState.message) {
      if (serverActionState.success) {
        toast({
          title: "Success!",
          description: serverActionState.message,
        });
        form.reset({
          author: currentUser?.displayName || '',
          feeling: 1,
          gameDesign: 1,
          presentation: 1,
          management: 1,
          comment: '',
        });
        onReviewSubmitted?.();
      } else {
        if (serverActionState.errors) {
          Object.entries(serverActionState.errors).forEach(([fieldName, errors]) => {
            form.setError(fieldName as keyof RatingFormValues, {
              type: 'server',
              message: errors[0],
            });
          });
        }
        toast({
          title: "Error",
          description: serverActionState.message || "Failed to submit review.",
          variant: "destructive",
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverActionState, toast, onReviewSubmitted, currentUser]);


  const ratingCategories: RatingCategory[] = ['feeling', 'gameDesign', 'presentation', 'management'];

  const handleFormSubmit = (data: RatingFormValues) => {
    if (!currentUser) {
      toast({ title: "Authentication Required", description: "Please log in to submit a review.", variant: "destructive" });
      return;
    }
    console.log('[CLIENT RATING FORM] Attempting to submit review. Data:', data, 'UserID:', currentUser.uid); // Added log
    startTransition(() => {
      formActionDispatcher({ ...data, userId: currentUser.uid });
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

        <SubmitButton isActionPending={isActionPending} buttonText={existingReview ? "Update Review" : "Submit Review"} />
         {serverActionState.message && !serverActionState.success && !serverActionState.errors && (
          <p className="text-sm font-medium text-destructive">{serverActionState.message}</p>
        )}
      </form>
    </Form>
  );
}

function SubmitButton({ isActionPending, buttonText }: { isActionPending: boolean, buttonText: string }) {
  const { formState } = useFormContext<RatingFormValues>();
  const rhfIsSubmitting = formState.isSubmitting;

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
