
'use client';

import { useState, useEffect, useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import type { RatingCategory, Review, Rating } from '@/lib/types';
import { RATING_CATEGORIES } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { reviewFormSchema, type RatingFormValues } from '@/lib/validators';
import type { User as FirebaseUser } from 'firebase/auth';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider'; // Import Slider

// Firestore imports for client-side write
import { db } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, query, where, getDocs, limit, getDoc } from 'firebase/firestore';

interface MultiStepRatingFormProps {
  gameId: string;
  onReviewSubmitted: () => void;
  currentUser: FirebaseUser;
  existingReview?: Review | null;
}

const totalSteps = 4;
const stepCategories: RatingCategory[] = ['gameDesign', 'presentation', 'management']; // 'feeling' is handled by the three new categories

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
      excitedToReplay: existingReview?.rating.excitedToReplay || 1,
      mentallyStimulating: existingReview?.rating.mentallyStimulating || 1,
      fun: existingReview?.rating.fun || 1,
      gameDesign: existingReview?.rating.gameDesign || 1,
      presentation: existingReview?.rating.presentation || 1,
      management: existingReview?.rating.management || 1,
    },
  });

  useEffect(() => {
    if (existingReview) {
      form.reset({
        excitedToReplay: existingReview.rating.excitedToReplay,
        mentallyStimulating: existingReview.rating.mentallyStimulating,
        fun: existingReview.rating.fun,
        gameDesign: existingReview.rating.gameDesign,
        presentation: existingReview.rating.presentation,
        management: existingReview.rating.management,
      });
    } else {
      form.reset({
        excitedToReplay: 1,
        mentallyStimulating: 1,
        fun: 1,
        gameDesign: 1,
        presentation: 1,
        management: 1,
      });
    }
  }, [existingReview, form]);


  const handleNext = async () => {
    let fieldsToValidate: (keyof RatingFormValues)[] = [];
    if (currentStep === 1) {
        fieldsToValidate = ['excitedToReplay', 'mentallyStimulating', 'fun'];
    } else if (currentStep > 1 && currentStep <= totalSteps) {
        const categoryIndex = currentStep - 2;
        if (categoryIndex < stepCategories.length) {
            fieldsToValidate = [stepCategories[categoryIndex]];
        }
    }

    const isValid = await form.trigger(fieldsToValidate);
    if (isValid) {
      setCurrentStep((prev) => Math.min(prev + 1, totalSteps));
      setFormError(null);
    } else {
       let stepName = "current step";
       if (currentStep === 1) stepName = "Sentiments";
       else if (currentStep > 1 && currentStep -2 < stepCategories.length) {
           stepName = RATING_CATEGORIES[stepCategories[currentStep-2]];
       }
       setFormError(`Please correct errors in ${stepName} before proceeding.`);
       toast({
        title: "Validation Error",
        description: `Please ensure all fields in ${stepName} are correctly filled.`,
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
          excitedToReplay: data.excitedToReplay,
          mentallyStimulating: data.mentallyStimulating,
          fun: data.fun,
          gameDesign: data.gameDesign,
          presentation: data.presentation,
          management: data.management,
        };

        const reviewAuthor = currentUser.displayName || 'Anonymous';
        const reviewComment = "";

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
            comment: reviewComment, // still saving empty comment
            date: new Date().toISOString(),
          });
          toast({ title: "Success!", description: "Review updated successfully!", icon: <CheckCircle className="h-5 w-5 text-green-500" /> });
        } else {
          const existingReviewQuery = query(reviewsCollectionRef, where("userId", "==", currentUser.uid), limit(1));
          const existingReviewSnapshot = await getDocs(existingReviewQuery);

          if (!existingReviewSnapshot.empty) {
            toast({ title: "Already Reviewed", description: "You have already submitted a review for this game. Your existing review has been loaded.", variant: "default" });
            setFormError("You have already submitted a review for this game.");
            // Potentially update the loaded review rather than just showing a message
             const existingReviewDoc = existingReviewSnapshot.docs[0];
             await updateDoc(existingReviewDoc.ref, {
                author: reviewAuthor,
                rating,
                comment: reviewComment,
                date: new Date().toISOString(),
             });
            toast({ title: "Review Updated", description: "Your existing review for this game has been updated.", icon: <CheckCircle className="h-5 w-5 text-green-500" /> });
            onReviewSubmitted();
            return;
          }

          const newReviewData = {
            author: reviewAuthor,
            userId: currentUser.uid,
            rating,
            comment: reviewComment, // still saving empty comment
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

  const getCurrentStepTitle = () => {
    if (currentStep === 1) return "Sentiments";
    if (currentStep > 1 && currentStep - 2 < stepCategories.length) {
      return RATING_CATEGORIES[stepCategories[currentStep - 2] as RatingCategory];
    }
    return "Review Step";
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(processSubmit)} className="space-y-8">
        <Progress value={progressPercentage} className="w-full mb-6" />
        <div className="min-h-[300px]">
          <h3 className="text-xl font-semibold mb-6">{getCurrentStepTitle()}</h3>
          {currentStep === 1 && (
            <div className="space-y-6 animate-fadeIn">
              <FormField
                control={form.control}
                name="excitedToReplay"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{RATING_CATEGORIES.excitedToReplay}</FormLabel>
                    <div className="flex items-center gap-4">
                      <Slider
                        value={[field.value]}
                        onValueChange={(value) => field.onChange(value[0])}
                        min={1}
                        max={5}
                        step={1}
                        className="w-full"
                      />
                      <span className="text-lg font-semibold w-8 text-center">{field.value}</span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="mentallyStimulating"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{RATING_CATEGORIES.mentallyStimulating}</FormLabel>
                     <div className="flex items-center gap-4">
                      <Slider
                        value={[field.value]}
                        onValueChange={(value) => field.onChange(value[0])}
                        min={1}
                        max={5}
                        step={1}
                        className="w-full"
                      />
                      <span className="text-lg font-semibold w-8 text-center">{field.value}</span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fun"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{RATING_CATEGORIES.fun}</FormLabel>
                     <div className="flex items-center gap-4">
                      <Slider
                        value={[field.value]}
                        onValueChange={(value) => field.onChange(value[0])}
                        min={1}
                        max={5}
                        step={1}
                        className="w-full"
                      />
                      <span className="text-lg font-semibold w-8 text-center">{field.value}</span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6 animate-fadeIn">
              <FormField
                control={form.control}
                name="gameDesign"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{RATING_CATEGORIES.gameDesign}</FormLabel>
                     <div className="flex items-center gap-4">
                      <Slider
                        value={[field.value]}
                        onValueChange={(value) => field.onChange(value[0])}
                        min={1}
                        max={5}
                        step={1}
                        className="w-full"
                      />
                      <span className="text-lg font-semibold w-8 text-center">{field.value}</span>
                    </div>
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
              <FormField
                control={form.control}
                name="presentation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{RATING_CATEGORIES.presentation}</FormLabel
                    >
                     <div className="flex items-center gap-4">
                      <Slider
                        value={[field.value]}
                        onValueChange={(value) => field.onChange(value[0])}
                        min={1}
                        max={5}
                        step={1}
                        className="w-full"
                      />
                      <span className="text-lg font-semibold w-8 text-center">{field.value}</span>
                    </div>
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
              <FormField
                control={form.control}
                name="management"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{RATING_CATEGORIES.management}</FormLabel>
                     <div className="flex items-center gap-4">
                      <Slider
                        value={[field.value]}
                        onValueChange={(value) => field.onChange(value[0])}
                        min={1}
                        max={5}
                        step={1}
                        className="w-full"
                      />
                      <span className="text-lg font-semibold w-8 text-center">{field.value}</span>
                    </div>
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
