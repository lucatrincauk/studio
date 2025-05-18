
'use client';

import { useState, useEffect, useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
// Input and Textarea are no longer needed here
import { StarRating } from './star-rating';
import type { RatingCategory, Review, Rating } from '@/lib/types';
import { RATING_CATEGORIES } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { reviewFormSchema, type RatingFormValues } from '@/lib/validators';
import type { User as FirebaseUser } from 'firebase/auth';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Progress } from '@/components/ui/progress';

// Firestore imports for client-side write
import { db } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, query, where, getDocs, limit, getDoc } from 'firebase/firestore';

interface MultiStepRatingFormProps {
  gameId: string;
  onReviewSubmitted: () => void;
  currentUser: FirebaseUser; // Assume currentUser is always present as page level handles null
  existingReview?: Review | null;
}

const totalSteps = 4;
const stepCategories: RatingCategory[] = ['feeling', 'gameDesign', 'presentation', 'management'];

export function MultiStepRatingForm({
  gameId,
  onReviewSubmitted,
  currentUser,
  existingReview,
}: MultiStepRatingFormProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const { toast } = useToast();

  const form = useForm<RatingFormValues>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: {
      feeling: existingReview?.rating.feeling || 1,
      gameDesign: existingReview?.rating.gameDesign || 1,
      presentation: existingReview?.rating.presentation || 1,
      management: existingReview?.rating.management || 1,
    },
  });

  useEffect(() => {
    if (existingReview) {
      form.reset({
        feeling: existingReview.rating.feeling,
        gameDesign: existingReview.rating.gameDesign,
        presentation: existingReview.rating.presentation,
        management: existingReview.rating.management,
      });
    } else {
      form.reset({ // Reset to default values if no existing review or user changes
        feeling: 1,
        gameDesign: 1,
        presentation: 1,
        management: 1,
      });
    }
  }, [existingReview, form.reset, form]);


  const handleNext = async () => {
    let fieldsToValidate: (keyof RatingFormValues)[] = [];
    if (currentStep === 1) {
        fieldsToValidate = ['feeling']; // Only feeling in step 1 now
    } else if (currentStep > 1 && currentStep <= totalSteps) {
        const categoryIndex = currentStep -1;
        if (categoryIndex < stepCategories.length) {
            fieldsToValidate = [stepCategories[categoryIndex]];
        }
    }

    const isValid = await form.trigger(fieldsToValidate);
    if (isValid) {
      setCurrentStep((prev) => Math.min(prev + 1, totalSteps));
      setFormError(null);
    } else {
       setFormError(`Please correct errors in ${RATING_CATEGORIES[stepCategories[currentStep-1] as RatingCategory] || "the current step"} before proceeding.`);
       toast({
        title: "Validation Error",
        description: `Please ensure all fields in the current step are correctly filled.`,
        variant: "destructive",
      });
    }
  };

  const handlePrevious = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
    setFormError(null);
  };

  const processSubmit = async (data: RatingFormValues) => {
    setFormError(null);
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
          management: data.management,
        };

        const reviewAuthor = currentUser.displayName || 'Anonymous';
        const reviewComment = ""; // Comment is now empty

        if (existingReview?.id) {
          const reviewDocRef = doc(reviewsCollectionRef, existingReview.id);
          const reviewSnapshot = await getDoc(reviewDocRef);
          if (!reviewSnapshot.exists() || reviewSnapshot.data()?.userId !== currentUser.uid) {
             toast({ title: "Error", description: "Review not found or you do not have permission to edit it.", variant: "destructive" });
             setFormError("Review not found or you do not have permission to edit it.");
             return;
          }
          await updateDoc(reviewDocRef, {
            author: reviewAuthor,
            rating,
            comment: reviewComment,
            date: new Date().toISOString(),
          });
          toast({ title: "Success!", description: "Review updated successfully!", icon: <CheckCircle className="h-5 w-5 text-green-500" /> });
        } else {
          const existingReviewQuery = query(reviewsCollectionRef, where("userId", "==", currentUser.uid), limit(1));
          const existingReviewSnapshot = await getDocs(existingReviewQuery);

          if (!existingReviewSnapshot.empty) {
            toast({ title: "Already Reviewed", description: "You have already submitted a review for this game. Edit your existing review by re-opening this form.", variant: "default" });
            setFormError("You have already submitted a review for this game.");
            onReviewSubmitted(); 
            return;
          }

          const newReviewData = {
            author: reviewAuthor,
            userId: currentUser.uid,
            rating,
            comment: reviewComment,
            date: new Date().toISOString(),
          };
          await addDoc(reviewsCollectionRef, newReviewData);
          toast({ title: "Success!", description: "Review submitted successfully!", icon: <CheckCircle className="h-5 w-5 text-green-500" /> });
        }
        onReviewSubmitted();
      } catch (error) {
        console.error("Error submitting review:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        toast({ title: "Error", description: `Failed to submit review: ${errorMessage}`, variant: "destructive" });
        setFormError(`Failed to submit review: ${errorMessage}`);
      }
    });
  };
  
  const progressPercentage = (currentStep / totalSteps) * 100;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(processSubmit)} className="space-y-8">
        <Progress value={progressPercentage} className="w-full mb-6" />
        <div className="min-h-[250px]"> 
          {currentStep === 1 && (
            <div className="space-y-6 animate-fadeIn">
              <h3 className="text-lg font-semibold">{RATING_CATEGORIES.feeling}</h3>
              {/* Author field removed */}
              <FormField
                control={form.control}
                name="feeling"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{RATING_CATEGORIES.feeling}</FormLabel>
                    <FormControl>
                      <StarRating rating={field.value} setRating={field.onChange} size={28} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {/* Comment field removed */}
               <p className="text-sm text-muted-foreground">
                How enjoyable and engaging was the game overall?
              </p>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6 animate-fadeIn">
              <h3 className="text-lg font-semibold">{RATING_CATEGORIES.gameDesign}</h3>
              <FormField
                control={form.control}
                name="gameDesign"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{RATING_CATEGORIES.gameDesign}</FormLabel>
                    <FormControl>
                      <StarRating rating={field.value} setRating={field.onChange} size={28} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <p className="text-sm text-muted-foreground">
                How would you rate aspects like rules clarity, balance, replayability, and innovation?
              </p>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6 animate-fadeIn">
              <h3 className="text-lg font-semibold">{RATING_CATEGORIES.presentation}</h3>
              <FormField
                control={form.control}
                name="presentation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{RATING_CATEGORIES.presentation}</FormLabel>
                    <FormControl>
                      <StarRating rating={field.value} setRating={field.onChange} size={28} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <p className="text-sm text-muted-foreground">
                Consider the quality of artwork, components, board, and overall aesthetic appeal.
              </p>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-6 animate-fadeIn">
              <h3 className="text-lg font-semibold">{RATING_CATEGORIES.management}</h3>
              <FormField
                control={form.control}
                name="management"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{RATING_CATEGORIES.management}</FormLabel>
                    <FormControl>
                      <StarRating rating={field.value} setRating={field.onChange} size={28} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <p className="text-sm text-muted-foreground">
                How easy is the game to set up, tear down, and manage during play (e.g., upkeep, downtime)?
              </p>
            </div>
          )}
        </div>
        
        {formError && (
            <div className="p-3 bg-destructive/10 border border-destructive text-destructive text-sm rounded-md flex items-center gap-2">
                <AlertCircle size={16} /> {formError}
            </div>
        )}

        <div className="flex justify-between items-center pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 1 || isSubmitting}
          >
            Previous
          </Button>
          {currentStep < totalSteps ? (
            <Button type="button" onClick={handleNext} disabled={isSubmitting} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              Next
            </Button>
          ) : (
            <Button type="submit" disabled={isSubmitting || !form.formState.isValid} className="bg-accent hover:bg-accent/90 text-accent-foreground">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...
                </>
              ) : (
                existingReview ? 'Update Review' : 'Submit Review'
              )}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
