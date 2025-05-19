
'use client';

import { useState, useEffect, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import type { Review, Rating as RatingType } from '@/lib/types';
import { RATING_CATEGORIES, type RatingCategory } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertCircle, CheckCircle, Smile, Puzzle, Palette, ClipboardList } from 'lucide-react';
import { reviewFormSchema, type RatingFormValues } from '@/lib/validators';
import type { User as FirebaseUser } from 'firebase/auth';
import { CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Slider } from '@/components/ui/slider';
import { calculateOverallCategoryAverage, calculateGroupedCategoryAverages, calculateCategoryAverages, formatRatingNumber } from '@/lib/utils';
import { GroupedRatingsDisplay } from '@/components/boardgame/grouped-ratings-display';
import { db } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, query, where, getDocs, limit, getDoc, writeBatch } from 'firebase/firestore';
import { Separator } from '../ui/separator';

interface MultiStepRatingFormProps {
  gameId: string;
  onReviewSubmitted: () => void;
  currentUser: FirebaseUser;
  existingReview?: Review | null;
  currentStep: number;
  onStepChange: (step: number) => void;
}

const totalInputSteps = 4; // Total steps for actual input
const totalDisplaySteps = 5; // Including summary step

const stepCategories: (keyof RatingFormValues)[][] = [
  ['excitedToReplay', 'mentallyStimulating', 'fun'], // Step 1: Sentimento
  ['decisionDepth', 'replayability', 'luck', 'lengthDowntime'], // Step 2: Design del Gioco
  ['graphicDesign', 'componentsThemeLore'], // Step 3: Estetica e Immersione
  ['effortToLearn', 'setupTeardown'], // Step 4: Apprendimento e Logistica
];

const categoryDescriptions: Record<RatingCategory, string> = {
  excitedToReplay: "Quanto ti entusiasma l’idea di rigiocare questo gioco?",
  mentallyStimulating: "Quanto ti ha fatto ragionare e elaborare strategie questo gioco?",
  fun: "In generale, quanto è stata piacevole e divertente l'esperienza di gioco?",
  decisionDepth: "Quanto sono state significative e incisive le scelte che hai fatto durante il gioco?",
  replayability: "Quanto diversa ed entusiasmante potrebbe essere la prossima partita?",
  luck: "Quanto poco il caso o la casualità influenzano l'esito del gioco?",
  lengthDowntime: "Quanto è appropriata la durata del gioco per la sua profondità e quanto è coinvolgente quando non è il tuo turno?",
  graphicDesign: "Quanto è visivamente accattivante l'artwork, l'iconografia e il layout generale del gioco?",
  componentsThemeLore: "Come valuti l'ambientazione e l'applicazione del tema al gioco?",
  effortToLearn: "Quanto è facile o difficile capire le regole e iniziare a giocare?",
  setupTeardown: "Quanto è veloce e semplice preparare il gioco e rimetterlo a posto?",
};

const StepIcon = ({ step }: { step: number }) => {
  switch (step) {
    case 1: return <Smile className="mr-2 h-5 w-5 text-primary" />;
    case 2: return <Puzzle className="mr-2 h-5 w-5 text-primary" />;
    case 3: return <Palette className="mr-2 h-5 w-5 text-primary" />;
    case 4: return <ClipboardList className="mr-2 h-5 w-5 text-primary" />;
    default: return null;
  }
};

export function MultiStepRatingForm({
  gameId,
  onReviewSubmitted,
  currentUser,
  existingReview,
  currentStep,
  onStepChange,
}: MultiStepRatingFormProps) {
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [groupedAveragesForSummary, setGroupedAveragesForSummary] = useState<ReturnType<typeof calculateGroupedCategoryAverages>>(null);
  const { toast } = useToast();

  const defaultFormValues: RatingFormValues = {
    excitedToReplay: existingReview?.rating.excitedToReplay || 3,
    mentallyStimulating: existingReview?.rating.mentallyStimulating || 3,
    fun: existingReview?.rating.fun || 3,
    decisionDepth: existingReview?.rating.decisionDepth || 3,
    replayability: existingReview?.rating.replayability || 3,
    luck: existingReview?.rating.luck || 3,
    lengthDowntime: existingReview?.rating.lengthDowntime || 3,
    graphicDesign: existingReview?.rating.graphicDesign || 3,
    componentsThemeLore: existingReview?.rating.componentsThemeLore || 3,
    effortToLearn: existingReview?.rating.effortToLearn || 3,
    setupTeardown: existingReview?.rating.setupTeardown || 3,
  };

  const form = useForm<RatingFormValues>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: defaultFormValues,
    mode: 'onChange',
  });

  useEffect(() => {
    if (existingReview) {
      form.reset(existingReview.rating);
    } else {
      form.reset(defaultFormValues);
    }
  }, [existingReview, form]); // Removed defaultFormValues from deps as it's constant

  const updateGameOverallRating = async () => {
    try {
      const reviewsCollectionRef = collection(db, "boardgames_collection", gameId, 'reviews');
      const reviewsSnapshot = await getDocs(reviewsCollectionRef);
      const allReviewsForGame: Review[] = reviewsSnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return { id: docSnap.id, ...data } as Review;
      });

      const categoryAvgs = calculateCategoryAverages(allReviewsForGame);
      const newOverallAverage = categoryAvgs ? calculateOverallCategoryAverage(categoryAvgs) : null;
      
      const gameDocRef = doc(db, "boardgames_collection", gameId);
      await updateDoc(gameDocRef, {
        overallAverageRating: newOverallAverage
      });
    } catch (error) {
      console.error("Error updating game's overall average rating:", error);
      // Non-critical error, so we don't block the UI
    }
  };

  const processSubmitAndStay = async (data: RatingFormValues): Promise<boolean> => {
    setFormError(null);
    let submissionSuccess = false;

    const rating: RatingType = { ...data };
    const reviewAuthor = currentUser.displayName || 'Anonimo';
    const authorPhotoURL = currentUser.photoURL || null;

    const reviewDataToSave: Omit<Review, 'id'> = {
      author: reviewAuthor,
      userId: currentUser.uid,
      authorPhotoURL: authorPhotoURL,
      rating,
      comment: "", // Comments removed from form
      date: new Date().toISOString(),
    };

    try {
      const gameDocRef = doc(db, "boardgames_collection", gameId);
      const gameDocSnap = await getDoc(gameDocRef);

      if (!gameDocSnap.exists()) {
        toast({ title: "Errore", description: "Gioco non trovato. Impossibile inviare la recensione.", variant: "destructive" });
        setFormError("Gioco non trovato. Impossibile inviare la recensione.");
        return false;
      }

      const reviewsCollectionRef = collection(db, "boardgames_collection", gameId, 'reviews');

      if (existingReview?.id) {
        const reviewDocRef = doc(reviewsCollectionRef, existingReview.id);
        const reviewSnapshot = await getDoc(reviewDocRef);
        if (!reviewSnapshot.exists() || reviewSnapshot.data()?.userId !== currentUser.uid) {
           toast({ title: "Errore", description: "Recensione non trovata o non hai i permessi per modificarla.", variant: "destructive" });
           setFormError("Recensione non trovata o non hai i permessi per modificarla.");
           return false;
        }
        await updateDoc(reviewDocRef, reviewDataToSave);
        toast({ title: "Successo!", description: "Recensione aggiornata con successo!", icon: <CheckCircle className="h-5 w-5 text-green-500" /> });
      } else {
        const existingReviewQuery = query(reviewsCollectionRef, where("userId", "==", currentUser.uid), limit(1));
        const existingReviewSnapshot = await getDocs(existingReviewQuery);

        if (!existingReviewSnapshot.empty) {
           toast({ title: "Già Recensito", description: "Hai già inviato una recensione. Questa è stata aggiornata.", variant: "default" });
           const reviewToUpdateRef = existingReviewSnapshot.docs[0].ref;
           await updateDoc(reviewToUpdateRef, reviewDataToSave);
        } else {
          await addDoc(reviewsCollectionRef, reviewDataToSave);
          toast({ title: "Successo!", description: "Recensione inviata con successo!", icon: <CheckCircle className="h-5 w-5 text-green-500" /> });
        }
      }
      submissionSuccess = true;
      await updateGameOverallRating(); // Update game's overall rating
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Si è verificato un errore sconosciuto.";
      toast({ title: "Errore", description: `Impossibile inviare la recensione: ${errorMessage}`, variant: "destructive" });
      setFormError(`Impossibile inviare la recensione: ${errorMessage}`);
      submissionSuccess = false;
    }
    return submissionSuccess;
  };


  const handleNext = async () => {
    let fieldsToValidate: (keyof RatingFormValues)[] = [];
    if (currentStep >= 1 && currentStep <= totalInputSteps) {
        fieldsToValidate = stepCategories[currentStep-1];
    }

    const isValid = await form.trigger(fieldsToValidate);
    if (isValid) {
      onStepChange(currentStep + 1);
      setFormError(null);
    } else {
       let stepName = getCurrentStepTitle();
       setFormError(`Per favore correggi gli errori in ${stepName} prima di procedere.`);
       toast({
        title: "Errore di Validazione",
        description: `Assicurati che tutti i campi in ${stepName} siano compilati correttamente.`,
        variant: "destructive",
      });
    }
  };

  const handlePrevious = () => {
    onStepChange(currentStep - 1);
    setFormError(null);
  };

  const handleStep4Submit = async () => {
    const fieldsToValidate = stepCategories[totalInputSteps - 1] as (keyof RatingFormValues)[];
    const isValid = await form.trigger(fieldsToValidate);

    if (isValid) {
      setFormError(null);
      const data = form.getValues();

      startSubmitTransition(async () => {
        const submissionSuccessful = await processSubmitAndStay(data);
        if (submissionSuccessful) {
          const currentRatings = form.getValues();
          const tempReviewForSummary: Review = {
            id: 'summary', // Temporary ID for local calculation
            author: currentUser.displayName || 'Anonimo',
            userId: currentUser.uid,
            authorPhotoURL: currentUser.photoURL || null,
            rating: currentRatings,
            comment: '',
            date: new Date().toISOString(),
          };
          setGroupedAveragesForSummary(calculateGroupedCategoryAverages([tempReviewForSummary]));
          onStepChange(totalDisplaySteps); // Go to summary step
        }
      });
    } else {
      setFormError(`Per favore correggi gli errori in ${getCurrentStepTitle()} prima di procedere.`);
      toast({
        title: "Errore di Validazione",
        description: `Assicurati che tutti i campi in ${getCurrentStepTitle()} siano compilati correttamente.`,
        variant: "destructive",
      });
    }
  };


  const getCurrentStepTitle = () => {
    if (currentStep === 1) return "Sentimento";
    if (currentStep === 2) return "Design del Gioco";
    if (currentStep === 3) return "Estetica e Immersione";
    if (currentStep === 4) return "Apprendimento e Logistica";
    return "Riepilogo Valutazione"; // For Step 5
  };

  const getCurrentStepDescription = () => {
    if (currentStep === 1) return "Come ti ha fatto sentire il gioco?";
    if (currentStep === 2) return "Come valuteresti le meccaniche e la struttura di base?";
    if (currentStep === 3) return "Valuta l'aspetto visivo e gli elementi tematici del gioco.";
    if (currentStep === 4) return "Quanto è facile imparare, preparare e rimettere a posto il gioco?";
    if (currentStep === 5) return "La tua recensione è stata salvata. Ecco un riepilogo:";
    return "";
  }
  
  const yourOverallAverage = calculateOverallCategoryAverage(form.getValues());

  return (
    <Form {...form}>
      <form className="space-y-6"> {/* Reduced space-y-8 to space-y-6 */}
        {currentStep !== totalDisplaySteps && (
          <div className="mb-4"> {/* Reduced mb-6 to mb-4 */}
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-semibold flex items-center">
                <StepIcon step={currentStep} />
                {getCurrentStepTitle()} ({currentStep} di {totalInputSteps})
              </h3>
            </div>
            {getCurrentStepDescription() && (
              <p className="text-sm text-muted-foreground mt-1">{getCurrentStepDescription()}</p>
            )}
          </div>
        )}
        
        {currentStep === totalDisplaySteps && (
             <CardHeader className="px-0 pt-0 pb-6">
                <div className="flex justify-between items-center mb-1">
                    <CardTitle className="text-2xl md:text-3xl text-left">
                       Riepilogo Valutazione
                    </CardTitle>
                    {yourOverallAverage !== null && (
                        <span className="text-primary text-3xl font-bold whitespace-nowrap"> {/* Made score more prominent */}
                            {formatRatingNumber(yourOverallAverage * 2)}
                        </span>
                    )}
                </div>
                <CardDescription className="text-left text-sm text-muted-foreground">
                   La tua recensione è stata salvata. Ecco un riepilogo:
                </CardDescription>
            </CardHeader>
        )}

        <div className="min-h-[240px] sm:min-h-[280px]"> {/* Reduced min-h */}
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
                      <p className="text-xs text-muted-foreground mt-1 mb-2">{categoryDescriptions[fieldName]}</p>
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
                      <p className="text-xs text-muted-foreground mt-1 mb-2">{categoryDescriptions[fieldName]}</p>
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
                      <p className="text-xs text-muted-foreground mt-1 mb-2">{categoryDescriptions[fieldName]}</p>
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
                      <p className="text-xs text-muted-foreground mt-1 mb-2">{categoryDescriptions[fieldName]}</p>
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

          {currentStep === totalDisplaySteps && ( // Step 5: Summary
            <div className="animate-fadeIn">
                <GroupedRatingsDisplay
                    groupedAverages={groupedAveragesForSummary}
                    noRatingsMessage="Impossibile caricare il riepilogo. Per favore, prova a inviare di nuovo."
                    defaultOpenSections={['Sentimento','Design del Gioco','Estetica e Immersione','Apprendimento e Logistica']}
                 />
            </div>
          )}
        </div>

        {formError && (
            <div className="p-3 bg-destructive/10 border border-destructive text-destructive text-sm rounded-md flex items-center gap-2 mt-4">
                <AlertCircle size={16} /> {formError}
            </div>
        )}

        <div className={`flex ${currentStep > 1 && currentStep < totalDisplaySteps ? 'justify-between' : 'justify-end'} items-center pt-4 border-t mt-6`}>
          {currentStep > 1 && currentStep < totalDisplaySteps && ( // Show "Previous" for steps 2, 3, 4
            <Button
              type="button"
              variant="outline"
              onClick={handlePrevious}
              disabled={isSubmitting}
            >
              Indietro
            </Button>
          )}

          {currentStep < totalInputSteps ? ( // "Next" for steps 1, 2, 3
            <Button type="button" onClick={handleNext} disabled={isSubmitting} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              Avanti
            </Button>
          ) : currentStep === totalInputSteps ? ( // "Submit" for step 4
            <Button
              type="button"
              onClick={handleStep4Submit}
              disabled={isSubmitting}
              className="bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {existingReview ? 'Aggiornamento...' : 'Invia Recensione...'}
                </>
              ) : (
                existingReview ? 'Aggiorna Recensione' : 'Invia Recensione'
              )}
            </Button>
          ) : ( // "Finish" for step 5 (summary)
             <Button
                type="button"
                onClick={() => {
                  form.reset(defaultFormValues);
                  onReviewSubmitted();
                }}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Termina e Torna al Gioco
              </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
