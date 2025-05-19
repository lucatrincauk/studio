
'use client';

import { useState, useEffect, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import type { RatingCategory, Review, Rating as RatingType, GroupedCategoryAverages } from '@/lib/types';
import { RATING_CATEGORIES } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { reviewFormSchema, type RatingFormValues } from '@/lib/validators';
import type { User as FirebaseUser } from 'firebase/auth';
import { CardHeader, CardTitle, CardDescription } from '@/components/ui/card'; // Card related imports
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Slider } from '@/components/ui/slider';
import { calculateOverallCategoryAverage, formatRatingNumber, calculateGroupedCategoryAverages } from '@/lib/utils';
import { GroupedRatingsDisplay } from '@/components/boardgame/grouped-ratings-display';

import { db } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, query, where, getDocs, limit, getDoc } from 'firebase/firestore';

interface MultiStepRatingFormProps {
  gameId: string;
  onReviewSubmitted: () => void;
  currentUser: FirebaseUser;
  existingReview?: Review | null;
  currentStep: number;
  onStepChange: (step: number) => void;
}

const totalInputSteps = 4; // Number of steps where user inputs ratings
const stepCategories: (keyof RatingFormValues)[][] = [
  ['excitedToReplay', 'mentallyStimulating', 'fun'],
  ['decisionDepth', 'replayability', 'luck', 'lengthDowntime'],
  ['graphicDesign', 'componentsThemeLore'],
  ['effortToLearn', 'setupTeardown'],
];

const categoryDescriptions: Record<RatingCategory, string> = {
  excitedToReplay: "Quanto ti entusiasma l’idea di rigiocare questo gioco?",
  mentallyStimulating: "Quanto ti ha fatto ragionare e elaborare strategie questo gioco?",
  fun: "In generale, quanto è stata piacevole e divertente l'esperienza di gioco?",
  decisionDepth: "Quanto sono state significative e incisive le scelte che hai fatto durante il gioco?",
  replayability: "Quanto il gioco offre esperienze variegate in più partite?",
  luck: "Quanto il caso o la casualità influenzano l'esito del gioco?",
  lengthDowntime: "Quanto è appropriata la durata del gioco per la sua profondità e quanto è coinvolgente quando non è il tuo turno?",
  graphicDesign: "Quanto è visivamente accattivante l'artwork, l'iconografia e il layout generale del gioco?",
  componentsThemeLore: "Quanto bene i componenti fisici, il tema e la storia migliorano l'esperienza?",
  effortToLearn: "Quanto è facile o difficile capire le regole e iniziare a giocare?",
  setupTeardown: "Quanto è veloce e semplice preparare il gioco e rimetterlo a posto?",
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

  const processSubmitAndStay = async (data: RatingFormValues): Promise<boolean> => {
    setFormError(null);
    let submissionSuccess = false;

    const rating: RatingType = { ...data };
    const reviewAuthor = currentUser.displayName || 'Anonimo';
    const reviewComment = "";
    const authorPhotoURL = currentUser.photoURL || null;

    const newReviewData: Omit<Review, 'id'> = {
      author: reviewAuthor,
      userId: currentUser.uid,
      authorPhotoURL: authorPhotoURL,
      rating,
      comment: reviewComment,
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
        await updateDoc(reviewDocRef, newReviewData);
        toast({ title: "Successo!", description: "Recensione aggiornata con successo!", icon: <CheckCircle className="h-5 w-5 text-green-500" /> });
      } else {
        const existingReviewQuery = query(reviewsCollectionRef, where("userId", "==", currentUser.uid), limit(1));
        const existingReviewSnapshot = await getDocs(existingReviewQuery);

        if (!existingReviewSnapshot.empty && !existingReview) {
          toast({ title: "Già Recensito", description: "Hai già inviato una recensione per questo gioco. Modifica invece la tua recensione esistente.", variant: "destructive" });
          setFormError("Hai già inviato una recensione per questo gioco. Per favore, modifica quella esistente.");
          return false;
        } else if (!existingReviewSnapshot.empty && existingReview?.id !== existingReviewSnapshot.docs[0].id){
           const reviewToUpdateRef = existingReviewSnapshot.docs[0].ref;
           await updateDoc(reviewToUpdateRef, newReviewData);
           toast({ title: "Recensione Aggiornata", description: "La tua recensione esistente per questo gioco è stata aggiornata.", icon: <CheckCircle className="h-5 w-5 text-green-500" /> });
        }
         else {
          await addDoc(reviewsCollectionRef, newReviewData);
          toast({ title: "Successo!", description: "Recensione inviata con successo!", icon: <CheckCircle className="h-5 w-5 text-green-500" /> });
        }
      }
      submissionSuccess = true;
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
            id: 'summary', // Temporary ID for calculation
            author: currentUser.displayName || 'Anonimo',
            userId: currentUser.uid,
            authorPhotoURL: currentUser.photoURL || null,
            rating: currentRatings,
            comment: '', 
            date: new Date().toISOString(),
          };
          setGroupedAveragesForSummary(calculateGroupedCategoryAverages([tempReviewForSummary]));
          onStepChange(totalInputSteps + 1); // Go to summary step
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
    // Step 5 doesn't need a generic step title in this specific header
    return "Passo della Recensione";
  };

  const getCurrentStepDescription = () => {
    if (currentStep === 1) return "Come ti ha fatto sentire il gioco?";
    if (currentStep === 2) return "Come valuteresti le meccaniche e la struttura di base?";
    if (currentStep === 3) return "Valuta l'aspetto visivo e gli elementi tematici del gioco.";
    if (currentStep === 4) return "Quanto è facile imparare, preparare e rimettere a posto il gioco?";
    if (currentStep === 5) return "La tua recensione è stata salvata. Ecco un riepilogo:"; // Updated description
    return "";
  }
  
  const yourOverallAverage = calculateOverallCategoryAverage(form.getValues());

  return (
    <Form {...form}>
      <form> {/* Removed onSubmit from here */}
        {currentStep <= totalInputSteps && (
          <div className="mb-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-semibold">{getCurrentStepTitle()} - Passo {currentStep} / {totalInputSteps}</h3>
            </div>
            {getCurrentStepDescription() && (
              <p className="text-sm text-muted-foreground mt-1">{getCurrentStepDescription()}</p>
            )}
          </div>
        )}

         {currentStep === 5 && (
            <CardHeader className="px-0 pt-0 pb-6">
                <div className="flex justify-between items-center mb-1">
                    <CardTitle className="text-2xl md:text-3xl text-left">
                        La Tua Recensione è Salvata
                    </CardTitle>
                    {yourOverallAverage !== null && (
                        <span className="text-2xl font-bold text-primary whitespace-nowrap">
                            {formatRatingNumber(yourOverallAverage * 2)}
                        </span>
                    )}
                </div>
                 <CardDescription className="text-left text-sm text-muted-foreground">
                    {getCurrentStepDescription()}
                </CardDescription>
            </CardHeader>
        )}


        <div className="min-h-[240px] sm:min-h-[280px]">
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

          {currentStep === 5 && (
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

        <div className={`flex ${currentStep > 1 && currentStep < (totalInputSteps + 1) ? 'justify-between' : 'justify-end'} items-center pt-4 border-t mt-6`}>
          {currentStep > 1 && currentStep < (totalInputSteps + 1) && currentStep !== 5 && (
            <Button
              type="button"
              variant="outline"
              onClick={handlePrevious}
              disabled={isSubmitting}
            >
              Indietro
            </Button>
          )}

          {currentStep < totalInputSteps ? (
            <Button type="button" onClick={handleNext} disabled={isSubmitting} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              Avanti
            </Button>
          ) : currentStep === totalInputSteps ? ( // This is Step 4
            <Button
              type="button" // Changed from submit
              onClick={form.handleSubmit(handleStep4Submit)} // Submit handled by button click
              disabled={isSubmitting}
              className="bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {existingReview ? 'Aggiornamento...' : 'Invio Recensione...'}
                </>
              ) : (
                existingReview ? 'Aggiorna Recensione' : 'Invia Recensione'
              )}
            </Button>
          ) : ( // currentStep === 5 (Summary Step)
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

    
