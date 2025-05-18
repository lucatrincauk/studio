
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
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { calculateOverallCategoryAverage, formatRatingNumber, calculateGroupedCategoryAverages, type GroupedCategoryAverages } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import { db } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, query, where, getDocs, limit, getDoc } from 'firebase/firestore';

interface MultiStepRatingFormProps {
  gameId: string;
  onReviewSubmitted: () => void;
  currentUser: FirebaseUser;
  existingReview?: Review | null;
}

const totalSteps = 5;
const stepCategories: (keyof RatingFormValues)[][] = [
  ['excitedToReplay', 'mentallyStimulating', 'fun'],
  ['decisionDepth', 'replayability', 'luck', 'lengthDowntime'],
  ['graphicDesign', 'componentsThemeLore'],
  ['effortToLearn', 'setupTeardown'],
  [], // Step 5: Summary (no new inputs, displays saved data)
];

const sectionTitles: string[] = [
  "Sentiments",
  "Game Design",
  "Aesthetics & Immersion",
  "Learning & Logistics",
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
  const [groupedAveragesForSummary, setGroupedAveragesForSummary] = useState<GroupedCategoryAverages | null>(null);
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
    mode: 'onChange',
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
    if (currentStep >= 1 && currentStep <= 4) {
        fieldsToValidate = stepCategories[currentStep-1];
    }

    const isValid = await form.trigger(fieldsToValidate);
    if (isValid) {
      if (currentStep === 4) { // Moving from step 4 to step 5 (summary)
        const currentRatings = form.getValues();
        const tempReviewForSummary: Review = {
          id: 'summary',
          author: '', // Not needed for this calculation
          userId: '', // Not needed for this calculation
          rating: currentRatings,
          comment: '', // Not needed for this calculation
          date: new Date().toISOString(),
        };
        setGroupedAveragesForSummary(calculateGroupedCategoryAverages([tempReviewForSummary]));
      }
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

  const processSubmitFirestore = async (data: RatingFormValues): Promise<boolean> => {
    setFormError(null);
    let submissionSuccess = false;

    // Construct the rating object from the form data
    const rating: Rating = { ...data };

    const reviewAuthor = currentUser.displayName || 'Anonymous';
    const reviewComment = ""; // No comment field anymore

    const newReviewData = {
      author: reviewAuthor,
      userId: currentUser.uid,
      rating,
      comment: reviewComment,
      date: new Date().toISOString(),
    };

    try {
      const gameDocRef = doc(db, "boardgames_collection", gameId);
      const gameDocSnap = await getDoc(gameDocRef);

      if (!gameDocSnap.exists()) {
        toast({ title: "Error", description: "Game not found. Cannot submit review.", variant: "destructive" });
        setFormError("Game not found. Cannot submit review.");
        return false;
      }

      const reviewsCollectionRef = collection(db, "boardgames_collection", gameId, 'reviews');

      if (existingReview?.id) {
        // Update existing review
        const reviewDocRef = doc(reviewsCollectionRef, existingReview.id);
        const reviewSnapshot = await getDoc(reviewDocRef);
        if (!reviewSnapshot.exists() || reviewSnapshot.data()?.userId !== currentUser.uid) {
           toast({ title: "Error", description: "Review not found or you do not have permission to edit it.", variant: "destructive" });
           setFormError("Review not found or you do not have permission to edit it.");
           return false;
        }
        await updateDoc(reviewDocRef, newReviewData);
        toast({ title: "Success!", description: "Review updated successfully!", icon: <CheckCircle className="h-5 w-5 text-green-500" /> });
      } else {
        // Check if user already submitted a review for this game
        const existingReviewQuery = query(reviewsCollectionRef, where("userId", "==", currentUser.uid), limit(1));
        const existingReviewSnapshot = await getDocs(existingReviewQuery);

        if (!existingReviewSnapshot.empty) {
          // User already reviewed, update it (this logic path might be redundant if existingReview prop is always correctly set)
          const existingReviewDoc = existingReviewSnapshot.docs[0];
          await updateDoc(existingReviewDoc.ref, newReviewData);
          toast({ title: "Review Updated", description: "Your existing review for this game has been updated.", icon: <CheckCircle className="h-5 w-5 text-green-500" /> });
        } else {
          // Add new review
          await addDoc(reviewsCollectionRef, newReviewData);
          toast({ title: "Success!", description: "Review submitted successfully!", icon: <CheckCircle className="h-5 w-5 text-green-500" /> });
        }
      }
      submissionSuccess = true;
    } catch (error) {
      console.error("Error submitting review:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      toast({ title: "Error", description: `Failed to submit review: ${errorMessage}`, variant: "destructive" });
      setFormError(`Failed to submit review: ${errorMessage}`);
      submissionSuccess = false;
    }
    return submissionSuccess;
  };

  const handleStep4Submit = async () => {
    const fieldsToValidate = stepCategories[3] as (keyof RatingFormValues)[];
    const isValid = await form.trigger(fieldsToValidate);

    if (isValid) {
      setFormError(null);
      const data = form.getValues();
      
      startSubmitTransition(async () => {
        const submissionSuccessful = await processSubmitFirestore(data);
        if (submissionSuccessful) {
          // Prepare data for summary step
          const currentRatings = form.getValues();
          const tempReviewForSummary: Review = {
            id: 'summary', author: '', userId: '', rating: currentRatings, comment: '', date: new Date().toISOString(),
          };
          setGroupedAveragesForSummary(calculateGroupedCategoryAverages([tempReviewForSummary]));
          setCurrentStep(5); // Move to summary step
        }
      });
    } else {
      setFormError(`Please correct errors in ${getCurrentStepTitle()} before proceeding.`);
      toast({
        title: "Validation Error",
        description: `Please ensure all fields in ${getCurrentStepTitle()} are correctly filled.`,
        variant: "destructive",
      });
    }
  };


  const getCurrentStepTitle = () => {
    if (currentStep === 1) return "Sentiments";
    if (currentStep === 2) return "Game Design";
    if (currentStep === 3) return "Aesthetics & Immersion";
    if (currentStep === 4) return "Learning & Logistics";
    if (currentStep === 5) return "Your Ratings Summary";
    return "Review Step";
  };
  
  const getCurrentStepDescription = () => {
    if (currentStep === 1) return "How did the game make you feel?";
    if (currentStep === 2) return "How would you rate the core mechanics and structure?";
    if (currentStep === 3) return "Rate the game's visual appeal and thematic elements.";
    if (currentStep === 4) return "How easy is the game to learn, set up, and tear down?";
    if (currentStep === 5) return "Your review has been saved. Here's a summary:";
    return "";
  }

  const calculateYourOverallAverage = () => {
    const currentValues = form.getValues();
    return calculateOverallCategoryAverage(currentValues);
  };
  
  const yourOverallAverage = calculateYourOverallAverage();


  return (
    <Form {...form}>
      <form className="space-y-8">
        <div className="mb-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold">{getCurrentStepTitle()} - Step {currentStep} / {totalSteps}</h3>
          </div>
          {getCurrentStepDescription() && (
            <p className="text-sm text-muted-foreground mt-1">{getCurrentStepDescription()}</p>
          )}
        </div>

        <div className="min-h-[350px]">
          {currentStep === 1 && (
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

          {currentStep === 2 && (
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

          {currentStep === 3 && (
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

          {currentStep === 4 && (
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

          {currentStep === 5 && groupedAveragesForSummary && (
            <Card className="animate-fadeIn border-border shadow-md">
              <CardHeader>
                 <div className="flex justify-between items-center">
                    <CardTitle className="text-lg">Your Ratings Summary</CardTitle>
                    {yourOverallAverage > 0 && (
                        <span className="text-2xl font-bold text-primary">{formatRatingNumber(yourOverallAverage * 2)}</span>
                    )}
                 </div>
              </CardHeader>
              <CardContent>
                <Accordion type="multiple" className="w-full">
                  {groupedAveragesForSummary.map((section, index) => (
                    <AccordionItem value={`section-summary-${index}`} key={section.sectionTitle}>
                      <AccordionTrigger className="hover:no-underline text-left">
                        <div className="flex justify-between w-full items-center pr-2 gap-4">
                           <span className="font-medium text-md text-foreground flex-grow">{section.sectionTitle}</span>
                           <div className="flex items-center gap-2 flex-shrink-0 w-24">
                             <Progress value={(section.sectionAverage / 5) * 100} className="w-full h-2.5" />
                           </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <ul className="space-y-2.5 pl-2 pt-2">
                          {section.subRatings.map(sub => (
                            <li key={sub.name} className="flex justify-between items-center text-sm">
                              <span className="text-muted-foreground">{sub.name}:</span>
                              <span className="font-medium text-foreground">{formatRatingNumber(sub.average)} / 5</span>
                            </li>
                          ))}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          )}
          {currentStep === 5 && !groupedAveragesForSummary && (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Loading summary...</span>
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
          
          {currentStep < 4 ? (
            <Button type="button" onClick={handleNext} disabled={isSubmitting} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              Next
            </Button>
          ) : currentStep === 4 ? (
            <Button
              type="button"
              onClick={handleStep4Submit}
              disabled={isSubmitting}
              className="bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {existingReview ? 'Updating...' : 'Submitting...'}
                </>
              ) : (
                existingReview ? 'Update Review' : 'Submit Review'
              )}
            </Button>
          ) : ( // Step 5 (Summary of saved data) shows "Finish & Back to Game"
             <Button
                type="button"
                onClick={() => {
                  form.reset(defaultFormValues);
                  onReviewSubmitted();
                }}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Finish & Back to Game
              </Button>
          )}
        </div>
      </form>
    </Form>
  );
}

