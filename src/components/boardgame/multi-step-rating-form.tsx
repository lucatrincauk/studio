
'use client';

import React, { useState, useEffect, useTransition, useMemo, useCallback } from 'react';
import { useForm, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import type { Review, Rating as RatingType, RatingCategory, GroupedCategoryAverages, EarnedBadge, UserProfile, LucideIconName } from '@/lib/types';
import { RATING_CATEGORIES, RATING_WEIGHTS } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, AlertCircle, Smile, Puzzle, Palette, ClipboardList, ArrowLeft, Star,
  Award, Edit3, FileText, BookOpenText, MinusCircle, PlusCircle, Sparkles, ClipboardCheck as ClipboardCheckIcon, Moon, Trash2, Compass, HeartPulse, ListMusic,
  Medal
} from 'lucide-react';
import { reviewFormSchema, type RatingFormValues } from '@/lib/validators';
import type { User as FirebaseUser } from 'firebase/auth';
import { Form, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Slider } from '@/components/ui/slider';
import {
  calculateOverallCategoryAverage as calculateOverallCatAvgFromUtils,
  calculateGroupedCategoryAverages,
  formatRatingNumber,
  calculateCategoryAverages as calculateCatAvgsFromUtils,
} from '@/lib/utils';
import { db } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, query, where, getDocs, limit, writeBatch, getDoc, serverTimestamp, setDoc, collectionGroup, getCountFromServer, type Timestamp } from 'firebase/firestore';
import { revalidateGameDataAction } from '@/lib/actions';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { GroupedRatingsDisplay } from './grouped-ratings-display';
import { Separator } from '../ui/separator';
import { cn } from '@/lib/utils';
import { SafeImage } from '../common/SafeImage';
import { useRouter } from 'next/navigation';

const USER_PROFILES_COLLECTION = 'user_profiles';

const SLIDER_LEGENDS: Record<RatingCategory, { minLabel: string; maxLabel: string }> = {
  excitedToReplay: { minLabel: "Neanche morto", maxLabel: "Quando rigiochiamo?" },
  mentallyStimulating: { minLabel: "Cervello in standby", maxLabel: "Che mal di testa" },
  fun: { minLabel: "💩 Morchia dell'anno", maxLabel: "Troppo togo." },
  decisionDepth: { minLabel: "Pilota automatico", maxLabel: "E se poi te ne penti?" },
  replayability: { minLabel: "Sempre uguale", maxLabel: "Ogni volta diverso!" },
  luck: { minLabel: "Regno della Dea Bendata", maxLabel: "Tutto in mano mia!" },
  lengthDowntime: { minLabel: "Pessima", maxLabel: "Perfetta" },
  graphicDesign: { minLabel: "Meglio essere ciechi", maxLabel: "Ganzissimo!" },
  componentsThemeLore: { minLabel: "Tema? Quale tema?", maxLabel: "Immersione totale!" },
  effortToLearn: { minLabel: "Manuale da incubo", maxLabel: "Si impara in un attimo!" },
  setupTeardown: { minLabel: "Un'impresa titanica", maxLabel: "Pronti, via!" },
};

const RATING_CATEGORY_DESCRIPTIONS: Record<RatingCategory, string> = {
  excitedToReplay: "Quanto ti entusiasma l’idea di rigiocare questo gioco?",
  mentallyStimulating: "Quanto questo gioco ti fa pensare, risolvere problemi o elaborare strategie?",
  fun: "Quanto ti sei divertito complessivamente giocando?",
  decisionDepth: "Quanto sono state significative e incisive le scelte che hai fatto durante il gioco?",
  replayability: "Quanto diversa ed entusiasmante potrebbe essere la prossima partita?",
  luck: "Quanto poco il caso o la casualità influenzano l'esito del gioco? (1=Molto aleatorio, 10=Poco aleatorio)",
  lengthDowntime: "Come valuti la durata totale e i tempi morti tra un turno e l'altro?",
  graphicDesign: "Come giudichi la qualità artistica, il design grafico e l'usabilità dei componenti?",
  componentsThemeLore: "Come valuti l'ambientazione e l'applicazione del tema al gioco?",
  effortToLearn: "Quanto è stato facile o difficile imparare le regole e iniziare a giocare?",
  setupTeardown: "Quanto tempo ed energia sono necessari per preparare il gioco e poi rimetterlo via?",
};


interface RatingSliderInputProps {
  fieldName: RatingCategory;
  control: Control<RatingFormValues>;
}

const RatingSliderInput: React.FC<RatingSliderInputProps> = React.memo(({ fieldName, control }) => {
  const label = RATING_CATEGORIES[fieldName];
  const description = RATING_CATEGORY_DESCRIPTIONS[fieldName];
  const minLabel = SLIDER_LEGENDS[fieldName].minLabel;
  const maxLabel = SLIDER_LEGENDS[fieldName].maxLabel;

  return (
    <FormField
      control={control}
      name={fieldName}
      render={({ field }) => {
        const currentFieldValue = Number(field.value); 
        const sliderValue = useMemo(() => [currentFieldValue], [currentFieldValue]);

        return (
          <FormItem className="pb-4 border-b border-border last:border-b-0">
            <div className="flex justify-between items-baseline mb-1">
              <FormLabel>{label}</FormLabel>
              <span className="text-lg font-semibold text-primary">{currentFieldValue}</span>
            </div>
            {description && <p className="text-xs text-muted-foreground mb-2">{description}</p>}
            <Slider
              value={sliderValue}
              onValueChange={(value: number[]) => {
                const numericValue = value[0];
                if (numericValue !== currentFieldValue) { 
                  field.onChange(numericValue);
                }
              }}
              min={1} max={10} step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1 px-1">
              <span>{minLabel}</span>
              <span>{maxLabel}</span>
            </div>
          </FormItem>
        );
      }}
    />
  );
});
RatingSliderInput.displayName = 'RatingSliderInput';


interface MultiStepRatingFormProps {
  gameId: string;
  gameName: string;
  gameCoverArtUrl?: string | null;
  currentUser: FirebaseUser;
  existingReview?: Review | null;
  currentStep: number;
  onStepChange: (step: number) => void;
  onReviewSubmitted: () => void;
}

const totalInputSteps = 4;
const totalDisplaySteps = 5;

const stepCategories: RatingCategory[][] = [
  ['excitedToReplay', 'mentallyStimulating', 'fun'],
  ['decisionDepth', 'replayability', 'luck', 'lengthDowntime'],
  ['graphicDesign', 'componentsThemeLore'],
  ['effortToLearn', 'setupTeardown'],
];

const stepUITitles: Record<number, string> = {
  1: "Sentimento",
  2: "Design del Gioco",
  3: "Estetica e Immersione",
  4: "Apprendimento e Logistica",
};

const stepUIDescriptions: Record<number, string> = {
  1: "Valuta il tuo sentimento generale riguardo al gioco.",
  2: "Come giudichi gli aspetti legati al design del gioco?",
  3: "Valuta l'impatto visivo e l'immersione tematica.",
  4: "Quanto è stato facile apprendere e gestire il gioco?",
  5: "La tua recensione è stata salvata. Ecco il riepilogo dei tuoi voti:",
};


async function updateGameOverallRating(gameId: string, defaultRatingVals: RatingFormValues): Promise<{ success: boolean; initialVoteCount: number }> {
  let initialReviewCountOnGame = 0;
  try {
    const gameDocForCountRef = doc(db, "boardgames_collection", gameId);
    const gameDocForCountSnap = await getDoc(gameDocForCountRef);
    if (gameDocForCountSnap.exists()) {
      initialReviewCountOnGame = gameDocForCountSnap.data()?.voteCount ?? 0;
    }

    const reviewsCollectionRef = collection(db, "boardgames_collection", gameId, 'reviews');
    const reviewsSnapshot = await getDocs(reviewsCollectionRef);
    const allReviewsForGame: Review[] = reviewsSnapshot.docs.map(docSnap => {
      const data = docSnap.data();
      const rating: RatingType = { ...defaultRatingVals, ...data.rating };
      return { id: docSnap.id, ...data, rating } as Review;
    });

    const categoryAvgs = calculateCatAvgsFromUtils(allReviewsForGame);
    const newOverallAverage = categoryAvgs ? calculateOverallCatAvgFromUtils(categoryAvgs) : null;
    const newVoteCount = allReviewsForGame.length;

    const gameDocRef = doc(db, "boardgames_collection", gameId);
    await updateDoc(gameDocRef, {
      overallAverageRating: newOverallAverage,
      voteCount: newVoteCount,
    });
    return { success: true, initialVoteCount: initialReviewCountOnGame };
  } catch (error) {
    let detailedErrorMessage = "Impossibile aggiornare il punteggio medio del gioco.";
    if (error instanceof Error) {
      const firestoreError = error as any;
      if (firestoreError.code && firestoreError.code.includes('permission-denied')) {
        detailedErrorMessage = "Permessi insufficienti per aggiornare il punteggio del gioco. Controlla le regole di sicurezza. (ref: multi-step-rating-form/updateGameOverallRating)";
        console.error("[CLIENT RATING FORM] Firestore Permission Denied on game update:", firestoreError.code, firestoreError.message, firestoreError);
      } else {
        detailedErrorMessage += ` Dettagli: ${firestoreError.message} (Codice: ${firestoreError.code || 'N/A'})`;
        console.error("[CLIENT RATING FORM] ERRORE Aggiornamento Punteggio Medio Gioco:", firestoreError.code, firestoreError.message, firestoreError);
      }
    } else {
      console.error("[CLIENT RATING FORM] ERRORE SCONOSCIUTO Aggiornamento Punteggio Medio Gioco:", error);
    }
    throw new Error(detailedErrorMessage);
  }
}

const BadgeIconMap: Record<LucideIconName, React.ElementType> = {
  Award, Edit3, FileText, BookOpenText, MinusCircle, PlusCircle, Sparkles,
  ClipboardCheck: ClipboardCheckIcon, Moon, Trash2, Compass, HeartPulse, ListMusic,
  Medal,
};


export function MultiStepRatingForm({
  gameId,
  gameName,
  gameCoverArtUrl,
  currentUser,
  existingReview,
  currentStep,
  onStepChange,
  onReviewSubmitted,
}: MultiStepRatingFormProps) {
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [groupedAveragesForSummary, setGroupedAveragesForSummary] = useState<GroupedCategoryAverages | null>(null);
  const [newlyEarnedBadges, setNewlyEarnedBadges] = useState<Array<Pick<EarnedBadge, 'name' | 'iconName' | 'description'>>>([]);


  const { toast } = useToast();
  const router = useRouter();

  const defaultFormValues: RatingFormValues = useMemo(() => ({
    excitedToReplay: existingReview?.rating.excitedToReplay || 5,
    mentallyStimulating: existingReview?.rating.mentallyStimulating || 5,
    fun: existingReview?.rating.fun || 5,
    decisionDepth: existingReview?.rating.decisionDepth || 5,
    replayability: existingReview?.rating.replayability || 5,
    luck: existingReview?.rating.luck || 5,
    lengthDowntime: existingReview?.rating.lengthDowntime || 5,
    graphicDesign: existingReview?.rating.graphicDesign || 5,
    componentsThemeLore: existingReview?.rating.componentsThemeLore || 5,
    effortToLearn: existingReview?.rating.effortToLearn || 5,
    setupTeardown: existingReview?.rating.setupTeardown || 5,
  }), [existingReview]);

  const form = useForm<RatingFormValues>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: defaultFormValues,
    mode: 'onChange',
  });

  useEffect(() => {
    form.reset(defaultFormValues);
  }, [defaultFormValues, form.reset]);


  const processSubmitAndStay = useCallback(async (data: RatingFormValues): Promise<boolean> => {
    setFormError(null);
    setNewlyEarnedBadges([]);
    let submissionSuccess = false;
    let wasNewReviewAdded = false;
    let initialReviewCountOnGame = 0;
    const awardedBadgesInThisSession: Array<Pick<EarnedBadge, 'name' | 'iconName' | 'description'>> = [];


    if (!currentUser) {
      toast({ title: "Errore", description: "Devi essere loggato per inviare un voto.", variant: "destructive" });
      setFormError("Autenticazione richiesta.");
      return false;
    }

    const validatedFields = reviewFormSchema.safeParse(data);
    if (!validatedFields.success) {
      toast({ title: "Errore di Validazione", description: "Per favore, correggi gli errori nel modulo.", variant: "destructive" });
      setFormError("Errore di validazione.");
      Object.entries(validatedFields.error.flatten().fieldErrors).forEach(([fieldName, messages]) => {
        if (messages) {
          form.setError(fieldName as keyof RatingFormValues, { type: 'server', message: messages[0] });
        }
      });
      return false;
    }

    const ratingDataToSave: RatingType = { ...validatedFields.data };
    const reviewDataForFirestore = {
      userId: currentUser.uid,
      author: currentUser.displayName || 'Anonimo',
      authorPhotoURL: currentUser.photoURL || null,
      rating: ratingDataToSave,
      comment: "", 
      date: new Date().toISOString(),
    };

    try {
      const reviewsCollectionRef = collection(db, "boardgames_collection", gameId, 'reviews');
      const userProfileRef = doc(db, USER_PROFILES_COLLECTION, currentUser.uid);
      let userProfileSnap = await getDoc(userProfileRef);
      let userProfileData = userProfileSnap.exists() ? userProfileSnap.data() as UserProfile : null;

      if (existingReview?.id) {
        const reviewDocRef = doc(reviewsCollectionRef, existingReview.id);
        await updateDoc(reviewDocRef, reviewDataForFirestore);
      } else {
        const existingReviewQuery = query(reviewsCollectionRef, where("userId", "==", currentUser.uid), limit(1));
        const existingReviewSnapshot = await getDocs(existingReviewQuery);

        if (!existingReviewSnapshot.empty) {
          const reviewToUpdateRef = existingReviewSnapshot.docs[0].ref;
          await updateDoc(reviewToUpdateRef, reviewDataForFirestore);
        } else {
          await addDoc(reviewsCollectionRef, reviewDataForFirestore);
          wasNewReviewAdded = true;
        }
      }

      const gameUpdateResult = await updateGameOverallRating(gameId, defaultFormValues);
      initialReviewCountOnGame = gameUpdateResult.initialVoteCount;

      if (!gameUpdateResult.success) {
          throw new Error("Fallimento nell'aggiornamento del punteggio generale del gioco.");
      }
      submissionSuccess = true;

      userProfileSnap = await getDoc(userProfileRef);
      userProfileData = userProfileSnap.exists() ? userProfileSnap.data() as UserProfile : null;


      if (userProfileData) {
        // First Reviewer Badge
        if (wasNewReviewAdded && !userProfileData.hasSubmittedReview) {
            const badgeRef = doc(userProfileRef, 'earned_badges', 'first_reviewer');
            const badgeData: EarnedBadge = { badgeId: "first_reviewer", name: "Primo Voto!", description: "Hai inviato il tuo primo voto per un gioco!", iconName: "Award", earnedAt: serverTimestamp() };
            await setDoc(badgeRef, badgeData, { merge: true });
            await updateDoc(userProfileRef, { hasSubmittedReview: true });
            awardedBadgesInThisSession.push({ name: badgeData.name, iconName: badgeData.iconName, description: badgeData.description });
        }
        // Rating Pioneer Badge
        if (wasNewReviewAdded && initialReviewCountOnGame === 0) {
          const pioneerBadgeRef = doc(userProfileRef, 'earned_badges', 'rating_pioneer');
          const pioneerBadgeSnap = await getDoc(pioneerBadgeRef); 
          if(!pioneerBadgeSnap.exists()){
              const badgeData: EarnedBadge = { badgeId: "rating_pioneer", name: "Pioniere dei Voti", description: "Sei stato il primo a inviare un voto per questo gioco!", iconName: "Sparkles", earnedAt: serverTimestamp() };
              await setDoc(pioneerBadgeRef, badgeData, { merge: true });
              awardedBadgesInThisSession.push({ name: badgeData.name, iconName: badgeData.iconName, description: badgeData.description });
          }
        }

        const ratingsGiven = Object.values(ratingDataToSave);
        // First '1' Badge
        if (!userProfileData.hasGivenFirstOne && ratingsGiven.includes(1)) {
          const badgeRef = doc(userProfileRef, 'earned_badges', 'rating_connoisseur_min');
          const badgeData: EarnedBadge = { badgeId: "rating_connoisseur_min", name: "Pignolo del Punteggio", description: "Hai assegnato il tuo primo '1'. L'onestà prima di tutto!", iconName: "MinusCircle", earnedAt: serverTimestamp() };
          await setDoc(badgeRef, badgeData, { merge: true });
          await updateDoc(userProfileRef, { hasGivenFirstOne: true });
          awardedBadgesInThisSession.push({ name: badgeData.name, iconName: badgeData.iconName, description: badgeData.description });
        }
        // First '10' Badge
        if (!userProfileData.hasGivenFirstFive && ratingsGiven.includes(10)) { 
          const badgeRef = doc(userProfileRef, 'earned_badges', 'rating_enthusiast_max');
          const badgeData: EarnedBadge = { badgeId: "rating_enthusiast_max", name: "Fan Incondizionato", description: "Hai assegnato il tuo primo '10'. Adorazione pura!", iconName: "PlusCircle", earnedAt: serverTimestamp() };
          await setDoc(badgeRef, badgeData, { merge: true });
          await updateDoc(userProfileRef, { hasGivenFirstFive: true });
          awardedBadgesInThisSession.push({ name: badgeData.name, iconName: badgeData.iconName, description: badgeData.description });
        }
        // Comprehensive Critic Badge
        if (!userProfileData.hasEarnedComprehensiveCritic && ratingsGiven.length > 0) {
            const distinctScores = new Set(ratingsGiven);
            if (distinctScores.size >= 3) {
                const badgeRef = doc(userProfileRef, 'earned_badges', 'comprehensive_critic');
                const badgeData: EarnedBadge = { badgeId: "comprehensive_critic", name: "Critico Completo", description: "Hai inviato un voto utilizzando almeno tre valori diversi sulla scala!", iconName: "ClipboardCheck", earnedAt: serverTimestamp() };
                await setDoc(badgeRef, badgeData, { merge: true });
                await updateDoc(userProfileRef, { hasEarnedComprehensiveCritic: true });
                awardedBadgesInThisSession.push({ name: badgeData.name, iconName: badgeData.iconName, description: badgeData.description });
            }
        }
        // Night Owl Reviewer Badge
        if (!userProfileData.hasEarnedNightOwlReviewer) {
            const currentHour = new Date().getHours();
            if (currentHour >= 0 && currentHour <= 4) { 
                const badgeRef = doc(userProfileRef, 'earned_badges', 'night_owl_reviewer');
                const badgeData: EarnedBadge = { badgeId: "night_owl_reviewer", name: "Recensore Notturno", description: "Hai inviato un voto tra mezzanotte e le 5 del mattino!", iconName: "Moon", earnedAt: serverTimestamp() };
                await setDoc(badgeRef, badgeData, { merge: true });
                await updateDoc(userProfileRef, { hasEarnedNightOwlReviewer: true });
                awardedBadgesInThisSession.push({ name: badgeData.name, iconName: badgeData.iconName, description: badgeData.description });
            }
        }
         if (wasNewReviewAdded) { 
            const allUserReviewsQuery = query(collectionGroup(db, 'reviews'), where('userId', '==', currentUser.uid));
            const userReviewsSnapshot = await getCountFromServer(allUserReviewsQuery);
            const totalUserReviews = userReviewsSnapshot.data().count;

            const prolificBadgesData = [
              { id: 'prolific_reviewer_bronze', threshold: 5, name: 'Recensore Prolifico (Bronzo)', description: 'Hai inviato 5 voti.', iconName: 'Edit3' as LucideIconName, flag: 'hasEarnedProlificBronze' },
              { id: 'prolific_reviewer_silver', threshold: 15, name: 'Recensore Prolifico (Argento)', description: 'Hai inviato 15 voti.', iconName: 'FileText' as LucideIconName, flag: 'hasEarnedProlificSilver' },
              { id: 'prolific_reviewer_gold', threshold: 30, name: 'Recensore Prolifico (Oro)', description: 'Hai inviato 30 voti.', iconName: 'BookOpenText' as LucideIconName, flag: 'hasEarnedProlificGold' },
            ];

            for (const badgeInfo of prolificBadgesData) {
              // @ts-ignore 
              if (totalUserReviews >= badgeInfo.threshold && (!userProfileData[badgeInfo.flag] || userProfileData[badgeInfo.flag] === undefined) ) {
                const badgeRef = doc(userProfileRef, 'earned_badges', badgeInfo.id);
                const badgeSnap = await getDoc(badgeRef);
                if (!badgeSnap.exists()) {
                  const newBadgeData: EarnedBadge = {
                    badgeId: badgeInfo.id, name: badgeInfo.name,
                    description: badgeInfo.description, iconName: badgeInfo.iconName,
                    earnedAt: serverTimestamp(),
                  };
                  await setDoc(badgeRef, newBadgeData);
                  // @ts-ignore
                  await updateDoc(userProfileRef, { [badgeInfo.flag]: true });
                  awardedBadgesInThisSession.push({ name: badgeInfo.name, iconName: badgeInfo.iconName, description: badgeInfo.description });
                }
              }
            }
        }
      }

      setNewlyEarnedBadges(awardedBadgesInThisSession);
      revalidateGameDataAction(gameId);
    } catch (error) {
      let toastErrorMessage = "Impossibile inviare il voto.";
      if (error instanceof Error) {
        const firestoreError = error as any; 
        if (firestoreError.code && firestoreError.code.includes('permission-denied')) {
            toastErrorMessage = "Permessi insufficienti per aggiornare il gioco. Contatta un admin.";
            console.error("[CLIENT RATING FORM] Firestore Permission Denied on game update (in updateGameOverallRating or badge logic):", firestoreError.code, firestoreError.message, firestoreError);
        } else {
            toastErrorMessage += ` Dettagli: ${firestoreError.message}`;
            console.error("[CLIENT RATING FORM] Submission Error:", firestoreError.message, firestoreError);
        }
      } else {
        console.error("[CLIENT RATING FORM] Submission Error (Unknown Type):", error);
      }
      toast({
        title: "Errore",
        description: toastErrorMessage,
        variant: "destructive",
      });
      setFormError(`Impossibile inviare il voto: ${error instanceof Error ? error.message : String(error)}`);
      submissionSuccess = false;
    }
    return submissionSuccess;
  }, [gameId, currentUser, existingReview, toast, defaultFormValues, form, setNewlyEarnedBadges]);


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
            comment: "", 
            date: existingReview?.date || new Date().toISOString(),
          };
          setGroupedAveragesForSummary(calculateGroupedCategoryAverages([tempReviewForSummary]));
          onStepChange(totalDisplaySteps);
        }
      });
    } else {
      const stepTitle = stepUITitles[totalInputSteps] || `Passo ${totalInputSteps}`;
      setFormError(`Per favore correggi gli errori in ${stepTitle} prima di procedere.`);
      toast({
        title: "Errore di Validazione",
        description: `Assicurati che tutti i campi in ${stepTitle} siano compilati correttamente.`,
        variant: "destructive",
      });
    }
  };

  const handleFinish = () => {
    setNewlyEarnedBadges([]);
    form.reset(defaultFormValues);
    onReviewSubmitted();
  };

  const handleNext = async () => {
    let fieldsToValidate: (keyof RatingFormValues)[] = [];
    if (currentStep >= 1 && currentStep < totalInputSteps) {
      fieldsToValidate = stepCategories[currentStep - 1];
    }

    const isValid = await form.trigger(fieldsToValidate);
    if (isValid) {
      onStepChange(currentStep + 1);
      setFormError(null);
    } else {
      const stepTitle = stepUITitles[currentStep] || `Passo ${currentStep}`;
      setFormError(`Per favore correggi gli errori in ${stepTitle} prima di procedere.`);
      toast({
        title: "Errore di Validazione",
        description: `Assicurati che tutti i campi in ${stepTitle} siano compilati correttamente.`,
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


  const yourOverallAverage = calculateOverallCatAvgFromUtils(form.getValues());

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


  return (
    <Form {...form}>
      <form>
        {/* Step 1 Only: Game Info Card */}
        {currentStep === 1 && gameName && (
            <>
                <Card className="mb-6 shadow-sm border-border bg-muted/30">
                    <CardHeader className="p-3 flex flex-row items-center gap-3">
                        {gameCoverArtUrl && (
                        <div className="relative h-16 w-12 sm:h-20 sm:w-16 flex-shrink-0 rounded-sm overflow-hidden">
                            <SafeImage
                            src={gameCoverArtUrl}
                            fallbackSrc={`https://placehold.co/48x64.png?text=${encodeURIComponent(gameName).substring(0,3)}`}
                            alt={`${gameName} copertina`}
                            fill
                            sizes="(max-width: 640px) 48px, 64px"
                            className="object-cover"
                            data-ai-hint={`${gameName.split(' ')[0]?.toLowerCase() || 'game'} thumbnail`}
                            />
                        </div>
                        )}
                        <h4 className="text-md font-semibold">{gameName}</h4>
                    </CardHeader>
                </Card>
                <Separator className="mb-6" />
            </>
        )}

        {/* Input Steps (1-4) Headers */}
        {(currentStep > 0 && currentStep <= totalInputSteps) && (
          <div className="mb-4">
             <div className="flex justify-between items-start">
                <div className="flex-1">
                    <h3 className="text-xl font-semibold flex items-center">
                      <StepIcon step={currentStep} />
                      {stepUITitles[currentStep]}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {stepUIDescriptions[currentStep]}
                    </p>
                </div>
            </div>
          </div>
        )}

         {/* Summary Step (Step 5) Header & Game Info Card */}
         {currentStep === totalDisplaySteps && (
            <>
               <CardHeader className="px-0 pt-6 pb-4">
                    <CardTitle className="text-xl font-semibold">
                      Riepilogo Valutazione
                    </CardTitle>
                    <CardDescription className="text-sm text-muted-foreground mt-1 whitespace-pre-line">
                      {stepUIDescriptions[currentStep]}
                    </CardDescription>
                </CardHeader>
                {gameName && (
                    <Card className="mb-6 shadow-sm border-border bg-muted/30">
                        <CardHeader className="p-3 flex flex-row items-center gap-3">
                            {gameCoverArtUrl && (
                                <div className="relative h-16 w-12 sm:h-20 sm:w-16 flex-shrink-0 rounded-sm overflow-hidden">
                                <SafeImage
                                    src={gameCoverArtUrl}
                                    fallbackSrc={`https://placehold.co/48x64.png?text=${encodeURIComponent(gameName).substring(0,3)}`}
                                    alt={`${gameName} copertina`}
                                    fill
                                    sizes="(max-width: 640px) 48px, 64px"
                                    className="object-cover"
                                    data-ai-hint={`${gameName.split(' ')[0]?.toLowerCase() || 'game'} summary thumbnail`}
                                />
                                </div>
                            )}
                            <div className="flex-1 flex justify-between items-center">
                                <h4 className="text-md font-semibold">{gameName}</h4>
                                {yourOverallAverage !== null && (
                                    <div className="text-right">
                                        <span className="text-primary text-md font-semibold whitespace-nowrap">
                                            {formatRatingNumber(yourOverallAverage)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </CardHeader>
                    </Card>
                )}
            </>
         )}

        <div className="min-h-[240px] sm:min-h-[280px]">
          {currentStep === 1 && (
            <div className="space-y-6 animate-fadeIn">
              {(stepCategories[0] as RatingCategory[]).map((fieldName) => (
                <RatingSliderInput
                  key={fieldName}
                  fieldName={fieldName}
                  control={form.control}
                />
              ))}
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6 animate-fadeIn">
              {(stepCategories[1] as RatingCategory[]).map((fieldName) => (
                <RatingSliderInput
                  key={fieldName}
                  fieldName={fieldName}
                  control={form.control}
                />
              ))}
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6 animate-fadeIn">
              {(stepCategories[2] as RatingCategory[]).map((fieldName) => (
                <RatingSliderInput
                  key={fieldName}
                  fieldName={fieldName}
                  control={form.control}
                />
              ))}
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-6 animate-fadeIn">
              {(stepCategories[3] as RatingCategory[]).map((fieldName) => (
                <RatingSliderInput
                  key={fieldName}
                  fieldName={fieldName}
                  control={form.control}
                />
              ))}
            </div>
          )}

          {currentStep === totalDisplaySteps && (
            <div className="animate-fadeIn">
              <GroupedRatingsDisplay
                reviews={[{
                    id: existingReview?.id || 'summary-review-id',
                    author: currentUser.displayName || 'Anonimo',
                    userId: currentUser.uid,
                    authorPhotoURL: currentUser.photoURL || null,
                    rating: form.getValues(),
                    comment: "", 
                    date: existingReview?.date || new Date().toISOString(),
                }]}
                noRatingsMessage="Impossibile caricare il riepilogo. Per favore, prova a inviare di nuovo."
                defaultOpenSections={['Sentimento', 'Design del Gioco', 'Estetica e Immersione', 'Apprendimento e Logistica']}
              />
              {newlyEarnedBadges.length > 0 && (
                <div className="mt-6">
                  <Separator />
                  <h4 className="text-lg font-semibold mt-4 mb-3">Distintivi Guadagnati con questo Voto!</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {newlyEarnedBadges.map((badge) => {
                      const IconComponent = badge.iconName ? BadgeIconMap[badge.iconName] : Award;
                      return (
                        <Card key={badge.name} className="p-3 flex items-start gap-3 bg-muted/50 border-accent">
                          <IconComponent className="h-8 w-8 text-accent flex-shrink-0 mt-1" />
                          <div>
                            <p className="font-semibold text-sm text-foreground">{badge.name}</p>
                            <p className="text-xs text-muted-foreground">{badge.description}</p>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {formError && (
          <div className="p-3 bg-destructive/10 border border-destructive text-destructive text-sm rounded-md flex items-center gap-2 mt-4">
            <AlertCircle size={16} /> {formError}
          </div>
        )}

      <div className={cn(
            "flex items-center pt-4 border-t mt-6",
            (currentStep === 1 || (currentStep > 1 && currentStep <= totalInputSteps)) ? 'justify-between' : 'justify-end'
        )}>
          {/* Left Button (Back to Game on Step 1, Previous on Steps 2-4) */}
          <div>
            {currentStep === 1 && (
              <Button type="button" variant="outline" onClick={() => router.push(`/games/${gameId}`)} disabled={isSubmitting}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Torna al Gioco
              </Button>
            )}
            {(currentStep > 1 && currentStep <= totalInputSteps) && (
              <Button type="button" variant="outline" onClick={handlePrevious} disabled={isSubmitting}>
                Indietro
              </Button>
            )}
          </div>

          {/* Right Button (Next on Steps 1-3, Submit on Step 4, Finish on Step 5) */}
          <div>
            {currentStep < totalInputSteps && (
              <Button type="button" onClick={handleNext} disabled={isSubmitting} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                Avanti
              </Button>
            )}
            {currentStep === totalInputSteps && (
              <Button type="button" onClick={handleStep4Submit} disabled={isSubmitting} className="bg-accent hover:bg-accent/90 text-accent-foreground">
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {existingReview ? 'Aggiorna Voto' : 'Invia Voto'}
              </Button>
            )}
            {currentStep === totalDisplaySteps && (
               <Button type="button" onClick={handleFinish} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                Termina e Torna al Gioco
              </Button>
            )}
          </div>
        </div>
      </form>
    </Form>
  );
}

