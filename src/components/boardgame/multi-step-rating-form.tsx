
'use client';

import { useState, useEffect, useTransition, useMemo, useRef } from 'react';
import type { Control } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import type { Review, Rating as RatingType, RatingCategory, GroupedCategoryAverages } from '@/lib/types';
import { RATING_CATEGORIES } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertCircle, CheckCircle, Smile, Puzzle, Palette, ClipboardList } from 'lucide-react';
import { reviewFormSchema, type RatingFormValues } from '@/lib/validators';
import type { User as FirebaseUser } from 'firebase/auth';
import { CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Slider } from '@/components/ui/slider';
import { calculateOverallCategoryAverage, calculateGroupedCategoryAverages, formatRatingNumber, calculateCategoryAverages } from '@/lib/utils';
import { GroupedRatingsDisplay } from '@/components/boardgame/grouped-ratings-display';
import { db } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, query, where, getDocs, limit, writeBatch, getDoc } from 'firebase/firestore';
import { revalidateGameDataAction } from '@/lib/actions';
import { SafeImage } from '@/components/common/SafeImage';

interface MultiStepRatingFormProps {
  gameId: string;
  gameName: string;
  gameCoverArtUrl?: string;
  onReviewSubmitted: () => void;
  currentUser: FirebaseUser;
  existingReview?: Review | null;
  currentStep: number;
  onStepChange: (step: number) => void;
}

const totalInputSteps = 4;
const totalDisplaySteps = 5; // Includes summary step

const stepCategories: RatingCategory[][] = [
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
  replayability: "Quanto diversa ed entusiasmante potrebbe essere la prossima partita?",
  luck: "Quanto poco il caso o la casualità influenzano l'esito del gioco?",
  lengthDowntime: "Quanto è appropriata la durata del gioco per la sua profondità e quanto è coinvolgente quando non è il tuo turno?",
  graphicDesign: "Quanto è visivamente accattivante l'artwork, l'iconografia e il layout generale del gioco?",
  componentsThemeLore: "Come valuti l'ambientazione e l'applicazione del tema al gioco?",
  effortToLearn: "Quanto è facile o difficile capire le regole e iniziare a giocare?",
  setupTeardown: "Quanto è veloce e semplice preparare il gioco e rimetterlo a posto?",
};

const stepUIDescriptions: Record<number, string> = {
  1: "Valuta il tuo sentimento generale riguardo al gioco.",
  2: "Come giudichi gli aspetti legati al design del gioco?",
  3: "Valuta l'impatto visivo e l'immersione tematica.",
  4: "Quanto è stato facile apprendere e gestire il gioco?",
};


const StepIcon = ({ step }: { step: number }) => {
  if (step > totalInputSteps) return null;
  switch (step) {
    case 1: return <Smile className="mr-2 h-5 w-5 text-primary" />;
    case 2: return <Puzzle className="mr-2 h-5 w-5 text-primary" />;
    case 3: return <Palette className="mr-2 h-5 w-5 text-primary" />;
    case 4: return <ClipboardList className="mr-2 h-5 w-5 text-primary" />;
    default: return null;
  }
};

interface RatingSliderInputProps {
  fieldName: RatingCategory;
  control: Control<RatingFormValues>;
}

const RatingSliderInput: React.FC<RatingSliderInputProps> = ({ fieldName, control }) => {
  return (
    <FormField
      control={control}
      name={fieldName}
      render={({ field }) => {
        const currentFieldValue = Number(field.value); 
        const sliderValue = useMemo(() => [currentFieldValue], [currentFieldValue]);

        return (
          <FormItem>
            <FormLabel>{RATING_CATEGORIES[fieldName]}</FormLabel>
            <p className="text-xs text-muted-foreground mt-1 mb-2">{categoryDescriptions[fieldName]}</p>
            <div className="flex items-center gap-4">
              <Slider
                value={sliderValue}
                onValueChange={(value: number[]) => {
                  const numericValue = value[0];
                  if (numericValue !== currentFieldValue) {
                    field.onChange(numericValue);
                  }
                }}
                min={1} max={5} step={1}
                className="w-full"
              />
              <span className="text-lg font-semibold w-8 text-center">{currentFieldValue}</span>
            </div>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
};

export function MultiStepRatingForm({
  gameId,
  gameName,
  gameCoverArtUrl,
  onReviewSubmitted,
  currentUser,
  existingReview,
  currentStep,
  onStepChange,
}: MultiStepRatingFormProps) {
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [groupedAveragesForSummary, setGroupedAveragesForSummary] = useState<GroupedCategoryAverages | null>(null);
  const { toast } = useToast();

  const defaultFormValues: RatingFormValues = useMemo(() => ({
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
  }), [existingReview]);

  const form = useForm<RatingFormValues>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: defaultFormValues,
    mode: 'onChange',
  });

  useEffect(() => {
    form.reset(defaultFormValues);
  }, [defaultFormValues, form, currentStep]); // Reset form if existingReview changes or step changes for initial load


  const updateGameOverallRating = async () => {
    try {
      const reviewsCollectionRef = collection(db, "boardgames_collection", gameId, 'reviews');
      const reviewsSnapshot = await getDocs(reviewsCollectionRef);
      const allReviewsForGame: Review[] = reviewsSnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        const rating: RatingType = {
            excitedToReplay: data.rating?.excitedToReplay || 0,
            mentallyStimulating: data.rating?.mentallyStimulating || 0,
            fun: data.rating?.fun || 0,
            decisionDepth: data.rating?.decisionDepth || 0,
            replayability: data.rating?.replayability || 0,
            luck: data.rating?.luck || 0,
            lengthDowntime: data.rating?.lengthDowntime || 0,
            graphicDesign: data.rating?.graphicDesign || 0,
            componentsThemeLore: data.rating?.componentsThemeLore || 0,
            effortToLearn: data.rating?.effortToLearn || 0,
            setupTeardown: data.rating?.setupTeardown || 0,
          };
        return { id: docSnap.id, ...data, rating } as Review;
      });

      const categoryAvgs = calculateCategoryAverages(allReviewsForGame);
      const newOverallAverage = categoryAvgs ? calculateOverallCategoryAverage(categoryAvgs) : null;
      
      const gameDocRef = doc(db, "boardgames_collection", gameId);
      await updateDoc(gameDocRef, {
        overallAverageRating: newOverallAverage,
        reviewCount: allReviewsForGame.length // Ensure reviewCount is also updated
      });
      
      await revalidateGameDataAction(gameId);
    } catch (error) {
      console.error("Errore Aggiornamento Punteggio Medio Gioco:", error);
      toast({ title: "Errore Aggiornamento Punteggio", description: "Impossibile aggiornare il punteggio medio del gioco.", variant: "destructive" });
    }
  };

  const processSubmitAndStay = async (data: RatingFormValues): Promise<boolean> => {
    setFormError(null);
    let submissionSuccess = false;

    if (!currentUser) {
      toast({ title: "Errore", description: "Devi essere loggato per inviare una recensione.", variant: "destructive" });
      setFormError("Autenticazione richiesta.");
      return false;
    }

    const ratingData: RatingType = { ...data };
    const reviewDataToSave: Omit<Review, 'id'> = {
      userId: currentUser.uid,
      author: currentUser.displayName || 'Anonimo',
      authorPhotoURL: currentUser.photoURL || null,
      rating: ratingData,
      comment: "", 
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
           const reviewToUpdateRef = existingReviewSnapshot.docs[0].ref;
           await updateDoc(reviewToUpdateRef, reviewDataToSave);
           toast({ title: "Aggiornato!", description: "La tua recensione esistente è stata aggiornata.", variant: "default", icon: <CheckCircle className="h-5 w-5 text-green-500" /> });
        } else {
          await addDoc(reviewsCollectionRef, reviewDataToSave);
          toast({ title: "Successo!", description: "Recensione inviata con successo!", icon: <CheckCircle className="h-5 w-5 text-green-500" /> });
        }
      }
      submissionSuccess = true;
      await updateGameOverallRating();
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
    if (currentStep >= 1 && currentStep < totalInputSteps) {
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
    if (currentStep > 1) {
        onStepChange(currentStep - 1);
        setFormError(null);
    }
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
            id: existingReview?.id || 'summary-review-id',
            author: currentUser.displayName || 'Anonimo',
            userId: currentUser.uid,
            authorPhotoURL: currentUser.photoURL || null,
            rating: currentRatings,
            comment: '', 
            date: existingReview?.date || new Date().toISOString(),
          };
          setGroupedAveragesForSummary(calculateGroupedCategoryAverages([tempReviewForSummary]));
          onStepChange(totalDisplaySteps); 
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

  const handleFinish = () => {
    form.reset(defaultFormValues);
    onReviewSubmitted();
  };

  const getCurrentStepTitle = () => {
    if (currentStep === 1) return "Sentimento";
    if (currentStep === 2) return "Design del Gioco";
    if (currentStep === 3) return "Estetica e Immersione";
    if (currentStep === 4) return "Apprendimento e Logistica";
    return "";
  };

  const yourOverallAverage = calculateOverallCategoryAverage(form.getValues());

  return (
    <Form {...form}>
      <form className="space-y-6">
        {currentStep <= totalInputSteps && (
          <div className="mb-4"> {/* Wrapper for step header area */}
            <div className="flex justify-between items-start"> {/* Top row for title and image block */}
              {/* Left part: Step title and step number */}
              <div>
                <h3 className="text-xl font-semibold flex items-center">
                  <StepIcon step={currentStep} />
                  {getCurrentStepTitle()} ({currentStep} di {totalInputSteps})
                </h3>
                 {/* Step Description below the title line */}
                {stepUIDescriptions[currentStep] && (
                  <p className="text-sm text-muted-foreground mt-1"> 
                    {stepUIDescriptions[currentStep]}
                  </p>
                )}
              </div>
              {/* Right part: Game Image and Name (top-right) */}
              {gameCoverArtUrl && (
                <div className="ml-4 flex-shrink-0 w-20 text-right">
                  <div className="relative aspect-[2/3] w-full rounded-sm overflow-hidden shadow-sm mb-1">
                    <SafeImage
                      src={gameCoverArtUrl}
                      alt={`${gameName} copertina`}
                      fallbackSrc={`https://placehold.co/60x90.png?text=${encodeURIComponent(gameName?.substring(0,3) || 'N/A')}`}
                      fill
                      className="object-cover"
                      sizes="80px"
                      data-ai-hint="game cover mini"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{gameName}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {currentStep === totalDisplaySteps && (
            <CardHeader className="px-0 pt-6 pb-4">
                <div className="flex justify-between items-center mb-1">
                    <CardTitle className="text-2xl md:text-3xl text-left">
                       Riepilogo Valutazione
                    </CardTitle>
                    {yourOverallAverage !== null && (
                        <span className="text-primary text-2xl md:text-3xl font-bold whitespace-nowrap">
                            {formatRatingNumber(yourOverallAverage * 2)}
                        </span>
                    )}
                </div>
                <CardDescription className="text-left text-sm text-muted-foreground">
                  La tua recensione è stata salvata. Ecco un riepilogo:
                </CardDescription>
            </CardHeader>
        )}

        <div className="min-h-[240px] sm:min-h-[280px]">
          {currentStep === 1 && (
            <div className="space-y-6 animate-fadeIn">
              {(stepCategories[0] as RatingCategory[]).map((fieldName) => (
                <RatingSliderInput key={fieldName} fieldName={fieldName} control={form.control} />
              ))}
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6 animate-fadeIn">
              {(stepCategories[1] as RatingCategory[]).map((fieldName) => (
                <RatingSliderInput key={fieldName} fieldName={fieldName} control={form.control} />
              ))}
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6 animate-fadeIn">
             {(stepCategories[2] as RatingCategory[]).map((fieldName) => (
                <RatingSliderInput key={fieldName} fieldName={fieldName} control={form.control} />
              ))}
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-6 animate-fadeIn">
             {(stepCategories[3] as RatingCategory[]).map((fieldName) => (
                <RatingSliderInput key={fieldName} fieldName={fieldName} control={form.control} />
              ))}
            </div>
          )}

          {currentStep === totalDisplaySteps && groupedAveragesForSummary && (
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

        <div className={`flex ${
           (currentStep > 1 && currentStep < totalDisplaySteps) // Previous button visible for steps 2, 3, 4
            ? 'justify-between'
            : 'justify-end' 
        } items-center pt-4 border-t mt-6`}>
          
          {(currentStep > 1 && currentStep < totalDisplaySteps) && ( // Show Previous button on steps 2, 3, 4
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
          ) : currentStep === totalInputSteps ? (
            <Button
              type="button"
              onClick={handleStep4Submit} 
              disabled={isSubmitting}
              className="bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {existingReview ? 'Aggiorna Recensione' : 'Invia Recensione'}
            </Button>
          ) : currentStep === totalDisplaySteps ? (
            <Button
                type="button"
                onClick={handleFinish}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
                Termina e Torna al Gioco
            </Button>
          ) : null }
        </div>
      </form>
    </Form>
  );
}
