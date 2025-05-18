
'use client';

import { useState, useEffect, useTransition } from 'react';
import { useForm } from 'react-hook-form';
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
import { Slider } from '@/components/ui/slider';

import { db } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, query, where, getDocs, limit, getDoc } from 'firebase/firestore';

interface MultiStepRatingFormProps {
  gameId: string;
  onReviewSubmitted: () => void;
  currentUser: FirebaseUser;
  existingReview?: Review | null;
}

const totalSteps = 4;
const stepCategories: (keyof RatingFormValues)[][] = [
  ['excitedToReplay', 'mentallyStimulating', 'fun'], // Step 1: Sentiments
  ['decisionDepth', 'replayability', 'luck', 'lengthDowntime'], // Step 2: Game Design
  ['graphicDesign', 'componentsThemeLore'], // Step 3: Aesthetics & Immersion
  ['effortToLearn', 'setupTeardown'], // Step 4: Learning & Logistics
];

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

  const defaultFormValues: RatingFormValues = {
    excitedToReplay: existingReview?.rating.excitedToReplay || 1,
    mentallyStimulating: existingReview?.rating.mentallyStimulating || 1,
    fun: existingReview?.rating.fun || 1,
    decisionDepth: existingReview?.rating.decisionDepth || 1,
    replayability: existingReview?.rating.replayability || 1,
    luck: existingReview?.rating.luck || 1,
    lengthDowntime: existingReview?.rating.lengthDowntime || 1,
    graphicDesign: existingReview?.rating.graphicDesign || 1,
    componentsThemeLore: existingReview?.rating.componentsThemeLore || 1,
    effortToLearn: existingReview?.rating.effortToLearn || 1,
    setupTeardown: existingReview?.rating.setupTeardown || 1,
  };

  const form = useForm<RatingFormValues>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: defaultFormValues,
  });

  useEffect(() => {
    if (existingReview) {
      form.reset({
        excitedToReplay: existingReview.rating.excitedToReplay,
        mentallyStimulating: existingReview.rating.mentallyStimulating,
        fun: existingReview.rating.fun,
        decisionDepth: existingReview.rating.decisionDepth,
        replayability: existingReview.rating.replayability,
        luck: existingReview.rating.luck,
        lengthDowntime: existingReview.rating.lengthDowntime,
        graphicDesign: existingReview.rating.graphicDesign,
        componentsThemeLore: existingReview.rating.componentsThemeLore,
        effortToLearn: existingReview.rating.effortToLearn,
        setupTeardown: existingReview.rating.setupTeardown,
      });
    } else {
      form.reset(defaultFormValues);
    }
  }, [existingReview, form]);


  const handleNext = async () => {
    let fieldsToValidate: (keyof RatingFormValues)[] = [];
    if (currentStep >= 1 && currentStep <= totalSteps) {
        fieldsToValidate = stepCategories[currentStep-1];
    }

    const isValid = await form.trigger(fieldsToValidate);
    if (isValid) {
      setCurrentStep((prev) => Math.min(prev + 1, totalSteps));
      setFormError(null);
    } else {
       let stepName = getCurrentStepTitle();
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
          decisionDepth: data.decisionDepth,
          replayability: data.replayability,
          luck: data.luck,
          lengthDowntime: data.lengthDowntime,
          graphicDesign: data.graphicDesign,
          componentsThemeLore: data.componentsThemeLore,
          effortToLearn: data.effortToLearn,
          setupTeardown: data.setupTeardown,
        };

        const reviewAuthor = currentUser.displayName || 'Anonymous';
        const reviewComment = ""; // Comments are no longer part of the form

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
            userId: currentUser.uid,
          });
          toast({ title: "Success!", description: "Review updated successfully!", icon: <CheckCircle className="h-5 w-5 text-green-500" /> });
        } else {
          const existingReviewQuery = query(reviewsCollectionRef, where("userId", "==", currentUser.uid), limit(1));
          const existingReviewSnapshot = await getDocs(existingReviewQuery);

          if (!existingReviewSnapshot.empty) {
             const existingReviewDoc = existingReviewSnapshot.docs[0];
             await updateDoc(existingReviewDoc.ref, {
                author: reviewAuthor,
                rating,
                comment: reviewComment,
                date: new Date().toISOString(),
                userId: currentUser.uid,
             });
            toast({ title: "Review Updated", description: "Your existing review for this game has been updated.", icon: <CheckCircle className="h-5 w-5 text-green-500" /> });
          } else {
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
    if (currentStep === 2) return "Game Design";
    if (currentStep === 3) return "Aesthetics & Immersion";
    if (currentStep === 4) return "Learning & Logistics";
    return "Review Step";
  };
  
  const getCurrentStepDescription = () => {
    if (currentStep === 1) return "How did the game make you feel?";
    if (currentStep === 2) return "How would you rate the core mechanics and structure?";
    if (currentStep === 3) return "Rate the game's visual appeal and thematic elements.";
    if (currentStep === 4) return "How easy is the game to learn, set up, and tear down?";
    return "";
  }


  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(processSubmit)} className="space-y-8">
        <Progress value={progressPercentage} className="w-full mb-2" />
        <div className="min-h-[350px]">
          <h3 className="text-xl font-semibold mb-1">{getCurrentStepTitle()}</h3>
          <p className="text-sm text-muted-foreground mb-6">{getCurrentStepDescription()}</p>

          {currentStep === 1 && ( // Sentiments
            <div className="space-y-6 animate-fadeIn">
              {(stepCategories[0] as RatingCategory[]).map((fieldName) => (
                <FormField
                  key={fieldName}
                  control={form.control}
                  name={fieldName}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{RATING_CATEGORIES[fieldName]}</FormLabel>
                      <div className="flex items-center gap-4">
                        <Slider
                          value={[field.value]}
                          onValueChange={(value) => field.onChange(value[0])}
                          min={1} max={5} step={1}
                          className="w-full"
                        />
                        <span className="text-lg font-semibold w-8 text-center">{field.value}</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
          )}

          {currentStep === 2 && ( // Game Design
            <div className="space-y-6 animate-fadeIn">
              {(stepCategories[1] as RatingCategory[]).map((fieldName) => (
                 <FormField
                  key={fieldName}
                  control={form.control}
                  name={fieldName}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{RATING_CATEGORIES[fieldName]}</FormLabel>
                      <div className="flex items-center gap-4">
                        <Slider
                          value={[field.value]}
                          onValueChange={(value) => field.onChange(value[0])}
                          min={1} max={5} step={1}
                          className="w-full"
                        />
                        <span className="text-lg font-semibold w-8 text-center">{field.value}</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
          )}

          {currentStep === 3 && ( // Aesthetics & Immersion
            <div className="space-y-6 animate-fadeIn">
              {(stepCategories[2] as RatingCategory[]).map((fieldName) => (
                 <FormField
                  key={fieldName}
                  control={form.control}
                  name={fieldName}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{RATING_CATEGORIES[fieldName]}</FormLabel>
                      <div className="flex items-center gap-4">
                        <Slider
                          value={[field.value]}
                          onValueChange={(value) => field.onChange(value[0])}
                          min={1} max={5} step={1}
                          className="w-full"
                        />
                        <span className="text-lg font-semibold w-8 text-center">{field.value}</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
          )}

          {currentStep === 4 && ( // Learning & Logistics
            <div className="space-y-6 animate-fadeIn">
             {(stepCategories[3] as RatingCategory[]).map((fieldName) => (
                 <FormField
                  key={fieldName}
                  control={form.control}
                  name={fieldName}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{RATING_CATEGORIES[fieldName]}</FormLabel>
                      <div className="flex items-center gap-4">
                        <Slider
                          value={[field.value]}
                          onValueChange={(value) => field.onChange(value[0])}
                          min={1} max={5} step={1}
                          className="w-full"
                        />
                        <span className="text-lg font-semibold w-8 text-center">{field.value}</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
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

