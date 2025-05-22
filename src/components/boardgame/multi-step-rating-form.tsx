
'use client';

import React, { useState, useEffect, useTransition, useMemo, useCallback } from 'react';
import { useForm, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import type { Review, Rating as RatingType, RatingCategory, UserProfile, EarnedBadge, LucideIconName } from '@/lib/types';
import { RATING_CATEGORIES } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, AlertCircle, CheckCircle, Smile, Puzzle, Palette, ClipboardList, ArrowLeft,
  Award, Edit3, FileText, BookOpenText, MinusCircle, PlusCircle, Sparkles, ClipboardCheck as ClipboardCheckIcon, Moon, Trash2, Compass, HeartPulse, ListMusic, type LucideIcon
} from 'lucide-react';
import { reviewFormSchema, type RatingFormValues } from '@/lib/validators';
import type { User as FirebaseUser } from 'firebase/auth';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Slider } from '@/components/ui/slider';
import {
  calculateOverallCategoryAverage as calculateGlobalOverallAverage,
  calculateGroupedCategoryAverages,
  formatRatingNumber,
  calculateCategoryAverages as calculateCatAvgsFromUtils,
} from '@/lib/utils';
import { db } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, query, where, getDocs, limit, writeBatch, getDoc, serverTimestamp, setDoc, type DocumentReference, collectionGroup, getCountFromServer } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { revalidateGameDataAction } from '@/lib/actions';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { GroupedRatingsDisplay, type GroupedCategoryAverages as GroupedCategoryAveragesType } from './grouped-ratings-display';
import { Separator } from '../ui/separator';
import { cn } from '@/lib/utils';
import { SafeImage } from '../common/SafeImage';


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

const BadgeIconMap: Record<LucideIconName, LucideIcon> = {
  Award, Edit3, FileText, BookOpenText, MinusCircle, PlusCircle, Sparkles,
  ClipboardCheck: ClipboardCheckIcon, Moon, Trash2, Compass, HeartPulse, ListMusic
};


interface RatingSliderInputProps {
  fieldName: RatingCategory;
  control: Control<RatingFormValues>;
  label: string;
  description: string;
  minLabel: string;
  maxLabel: string;
}

const RatingSliderInput: React.FC<RatingSliderInputProps> = ({ fieldName, control, label, description, minLabel, maxLabel }) => {
  return (
    <FormField
      control={control}
      name={fieldName}
      render={({ field }) => {
        const currentFieldValue = Number(field.value);
        const sliderValue = useMemo(() => [currentFieldValue], [currentFieldValue]);

        return (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <p className="text-xs text-muted-foreground mt-1 mb-2">{description}</p>
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
            <div className="flex justify-between text-xs text-muted-foreground mt-1 px-1">
              <span>{minLabel}</span>
              <span>{maxLabel}</span>
            </div>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
};

interface MultiStepRatingFormProps {
  gameId: string;
  gameName?: string;
  gameCoverArtUrl?: string | null;
  currentUser: FirebaseUser;
  existingReview?: Review | null;
  currentStep: number;
  onStepChange: (step: number) => void;
  onReviewSubmitted: () => void;
}

const totalInputSteps = 4;
const totalDisplaySteps = 5; // Step 5 is summary

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
  5: "Riepilogo Valutazione",
};

const stepUIDescriptions: Record<number, string> = {
  1: "Valuta il tuo sentimento generale riguardo al gioco.",
  2: "Come giudichi gli aspetti legati al design del gioco?",
  3: "Valuta l'impatto visivo e l'immersione tematica.",
  4: "Quanto è stato facile apprendere e gestire il gioco?",
  5: "La tua recensione è stata salvata.\nEcco il riepilogo dei tuoi voti per {gameName}:",
};

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
  effortToLearn: "Quanto è stato facile apprendere e iniziare a giocare?",
  setupTeardown: "Quanto è veloce e semplice preparare il gioco e rimettere a posto?",
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
  const [isSubmitTransitionPending, startSubmitTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [groupedAveragesForSummary, setGroupedAveragesForSummary] = useState<GroupedCategoryAveragesType | null>(null);
  const [newlyEarnedBadges, setNewlyEarnedBadges] = useState<Array<Pick<EarnedBadge, 'name' | 'iconName' | 'description'>>>([]);
  const { toast } = useToast();
  const router = useRouter();

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
  
  const updateGameOverallRating = async (wasNewReviewAdded: boolean): Promise<{ success: boolean; initialReviewCount: number }> => {
    try {
      const gameDocForCountRef = doc(db, "boardgames_collection", gameId);
      const gameDocForCountSnap = await getDoc(gameDocForCountRef);
      const initialReviewCountOnGame = gameDocForCountSnap.exists() ? gameDocForCountSnap.data()?.voteCount ?? 0 : 0;

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

      const categoryAvgs = calculateCatAvgsFromUtils(allReviewsForGame);
      const newOverallAverage = categoryAvgs ? calculateGlobalOverallAverage(categoryAvgs) : null;
      const newVoteCount = allReviewsForGame.length;

      const gameDocRef = doc(db, "boardgames_collection", gameId);
      await updateDoc(gameDocRef, {
        overallAverageRating: newOverallAverage,
        voteCount: newVoteCount
      });

      return { success: true, initialReviewCount: initialReviewCountOnGame };

    } catch (error) {
      console.error("Errore Aggiornamento Punteggio Medio Gioco:", error);
      toast({ title: "Errore Aggiornamento Punteggio", description: "Impossibile aggiornare il punteggio medio del gioco.", variant: "destructive" });
      return { success: false, initialReviewCount: 0 };
    }
  };

  useEffect(() => {
    form.reset(defaultFormValues);
  }, [defaultFormValues, form.reset]);


  const processSubmitAndStay = async (data: RatingFormValues): Promise<boolean> => {
    setFormError(null);
    let submissionSuccess = false;
    let wasNewReviewAdded = false;
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
    const reviewDataForFirestore: Omit<Review, 'id'> = {
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
      const userProfileSnap = await getDoc(userProfileRef);
      const userProfileData = userProfileSnap.exists() ? userProfileSnap.data() as UserProfile : null;

      let gameUpdateResult = { success: false, initialReviewCount: 0 };

      if (existingReview?.id) {
        const reviewDocRef = doc(reviewsCollectionRef, existingReview.id);
        await updateDoc(reviewDocRef, reviewDataForFirestore);
        toast({ title: "Successo!", description: "Voto aggiornato con successo!", icon: <CheckCircle className="h-5 w-5 text-green-500" /> });
      } else {
        const existingReviewQuery = query(reviewsCollectionRef, where("userId", "==", currentUser.uid), limit(1));
        const existingReviewSnapshot = await getDocs(existingReviewQuery);

        if (!existingReviewSnapshot.empty) {
          const reviewToUpdateRef = existingReviewSnapshot.docs[0].ref;
          await updateDoc(reviewToUpdateRef, reviewDataForFirestore);
          toast({ title: "Aggiornato!", description: "Il tuo voto esistente è stato aggiornato.", variant: "default", icon: <CheckCircle className="h-5 w-5 text-green-500" /> });
        } else {
          await addDoc(reviewsCollectionRef, reviewDataForFirestore);
          toast({ title: "Successo!", description: "Voto inviato con successo!", icon: <CheckCircle className="h-5 w-5 text-green-500" /> });
          wasNewReviewAdded = true;
          if (userProfileData && !userProfileData.hasSubmittedReview) {
            const badgeRef = doc(userProfileRef, 'earned_badges', 'first_reviewer');
            const badgeData: EarnedBadge = { badgeId: "first_reviewer", name: "Primo Voto!", description: "Hai inviato il tuo primo voto per un gioco!", iconName: "Award", earnedAt: serverTimestamp() };
            await setDoc(badgeRef, badgeData, { merge: true });
            await updateDoc(userProfileRef, { hasSubmittedReview: true });
            toast({ title: "Distintivo Guadagnato!", description: "Complimenti! Hai ricevuto il distintivo: Primo Voto!", icon: <Award className="h-5 w-5 text-yellow-500" /> });
            awardedBadgesInThisSession.push({ name: badgeData.name, iconName: badgeData.iconName, description: badgeData.description });
          }
        }
      }
      
      submissionSuccess = true;
      gameUpdateResult = await updateGameOverallRating(wasNewReviewAdded);
      await revalidateGameDataAction(gameId);

      if (gameUpdateResult.success && wasNewReviewAdded && gameUpdateResult.initialReviewCount === 0) {
         if (userProfileData) { 
            const pioneerBadgeRef = doc(userProfileRef, 'earned_badges', 'rating_pioneer');
            const pioneerBadgeSnap = await getDoc(pioneerBadgeRef);
            if(!pioneerBadgeSnap.exists()){
                const badgeData: EarnedBadge = { badgeId: "rating_pioneer", name: "Pioniere dei Voti", description: "Sei stato il primo a inviare un voto per questo gioco!", iconName: "Sparkles", earnedAt: serverTimestamp() };
                await setDoc(pioneerBadgeRef, badgeData, { merge: true });
                toast({ title: "Distintivo Guadagnato!", description: "Pioniere dei Voti!", icon: <Sparkles className="h-5 w-5 text-yellow-500" /> });
                awardedBadgesInThisSession.push({ name: badgeData.name, iconName: badgeData.iconName, description: badgeData.description });
            }
         }
      }

      if (userProfileData) {
        const ratingsGiven = Object.values(ratingDataToSave);
        if (!userProfileData.hasGivenFirstOne && ratingsGiven.includes(1)) {
          const badgeRef = doc(userProfileRef, 'earned_badges', 'rating_connoisseur_min');
          const badgeData: EarnedBadge = { badgeId: "rating_connoisseur_min", name: "Pignolo del Punteggio", description: "Hai assegnato il tuo primo '1'. L'onestà prima di tutto!", iconName: "MinusCircle", earnedAt: serverTimestamp() };
          await setDoc(badgeRef, badgeData, { merge: true });
          await updateDoc(userProfileRef, { hasGivenFirstOne: true });
          toast({ title: "Distintivo Guadagnato!", description: "Pignolo del Punteggio!", icon: <MinusCircle className="h-5 w-5 text-orange-500" /> });
          awardedBadgesInThisSession.push({ name: badgeData.name, iconName: badgeData.iconName, description: badgeData.description });
        }
        if (!userProfileData.hasGivenFirstFive && ratingsGiven.includes(5)) {
          const badgeRef = doc(userProfileRef, 'earned_badges', 'rating_enthusiast_max');
          const badgeData: EarnedBadge = { badgeId: "rating_enthusiast_max", name: "Fan Incondizionato", description: "Hai assegnato il tuo primo '5'. Adorazione pura!", iconName: "PlusCircle", earnedAt: serverTimestamp() };
          await setDoc(badgeRef, badgeData, { merge: true });
          await updateDoc(userProfileRef, { hasGivenFirstFive: true });
          toast({ title: "Distintivo Guadagnato!", description: "Fan Incondizionato!", icon: <PlusCircle className="h-5 w-5 text-green-500" /> });
          awardedBadgesInThisSession.push({ name: badgeData.name, iconName: badgeData.iconName, description: badgeData.description });
        }
        if (!userProfileData.hasEarnedComprehensiveCritic) {
            const distinctScores = new Set(ratingsGiven);
            if (distinctScores.size >= 3) {
                const badgeRef = doc(userProfileRef, 'earned_badges', 'comprehensive_critic');
                const badgeData: EarnedBadge = { badgeId: "comprehensive_critic", name: "Critico Completo", description: "Hai inviato un voto utilizzando almeno tre valori diversi sulla scala!", iconName: "ClipboardCheck", earnedAt: serverTimestamp() };
                await setDoc(badgeRef, badgeData, { merge: true });
                await updateDoc(userProfileRef, { hasEarnedComprehensiveCritic: true });
                toast({ title: "Distintivo Guadagnato!", description: "Critico Completo!", icon: <ClipboardCheckIcon className="h-5 w-5 text-blue-500" /> });
                awardedBadgesInThisSession.push({ name: badgeData.name, iconName: badgeData.iconName, description: badgeData.description });
            }
        }
        if (!userProfileData.hasEarnedNightOwlReviewer) {
            const currentHour = new Date().getHours();
            if (currentHour >= 0 && currentHour <= 4) { 
                const badgeRef = doc(userProfileRef, 'earned_badges', 'night_owl_reviewer');
                const badgeData: EarnedBadge = { badgeId: "night_owl_reviewer", name: "Recensore Notturno", description: "Hai inviato un voto tra mezzanotte e le 5 del mattino!", iconName: "Moon", earnedAt: serverTimestamp() };
                await setDoc(badgeRef, badgeData, { merge: true });
                await updateDoc(userProfileRef, { hasEarnedNightOwlReviewer: true });
                toast({ title: "Distintivo Guadagnato!", description: "Recensore Notturno!", icon: <Moon className="h-5 w-5 text-indigo-500" /> });
                awardedBadgesInThisSession.push({ name: badgeData.name, iconName: badgeData.iconName, description: badgeData.description });
            }
        }
      }

      if (wasNewReviewAdded) {
        const allUserReviewsQuery = query(collectionGroup(db, 'reviews'), where('userId', '==', currentUser.uid));
        const userReviewsSnapshot = await getCountFromServer(allUserReviewsQuery);
        const totalUserReviews = userReviewsSnapshot.data().count;

        const prolificBadges = [
          { id: 'prolific_reviewer_bronze', threshold: 5, name: 'Recensore Prolifico (Bronzo)', description: 'Hai inviato 5 voti!', iconName: 'Edit3' as LucideIconName },
          { id: 'prolific_reviewer_silver', threshold: 15, name: 'Recensore Prolifico (Argento)', description: 'Hai inviato 15 voti!', iconName: 'FileText' as LucideIconName },
          { id: 'prolific_reviewer_gold', threshold: 30, name: 'Recensore Prolifico (Oro)', description: 'Hai inviato 30 voti!', iconName: 'BookOpenText' as LucideIconName },
        ];

        for (const badgeInfo of prolificBadges) {
          if (totalUserReviews >= badgeInfo.threshold) {
            const badgeRef = doc(userProfileRef, 'earned_badges', badgeInfo.id);
            const badgeSnap = await getDoc(badgeRef);
            if (!badgeSnap.exists()) {
              const newBadgeData: EarnedBadge = {
                badgeId: badgeInfo.id, name: badgeInfo.name,
                description: badgeInfo.description, iconName: badgeInfo.iconName,
                earnedAt: serverTimestamp(),
              };
              await setDoc(badgeRef, newBadgeData);
              toast({
                title: "Distintivo Guadagnato!",
                description: `Complimenti! Hai ricevuto il distintivo: ${badgeInfo.name}`,
                icon: React.createElement(BadgeIconMap[badgeInfo.iconName], { className: "h-5 w-5 text-yellow-500" }),
              });
              awardedBadgesInThisSession.push({ name: badgeInfo.name, iconName: badgeInfo.iconName, description: badgeInfo.description });
            }
          }
        }
      }
      setNewlyEarnedBadges(awardedBadgesInThisSession);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Si è verificato un errore sconosciuto.";
      toast({ title: "Errore", description: `Impossibile inviare il voto: ${errorMessage}`, variant: "destructive" });
      setFormError(`Impossibile inviare il voto: ${errorMessage}`);
      submissionSuccess = false;
    }
    return submissionSuccess;
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

  const yourOverallAverage = calculateGlobalOverallAverage(form.getValues());
  
  const currentStepDescriptionText = (currentStep === totalDisplaySteps && gameName)
    ? (stepUIDescriptions[currentStep] || "").replace('{gameName}', gameName)
    : stepUIDescriptions[currentStep] || "";


  return (
    <Form {...form}>
      <form>
        {currentStep <= totalInputSteps && (
          <div className="mb-4">
             <div className="flex justify-between items-start">
                <div className="flex-1">
                    <h3 className="text-xl font-semibold flex items-center">
                    <StepIcon step={currentStep} />
                    {stepUITitles[currentStep]} ({currentStep} di {totalInputSteps})
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                    {stepUIDescriptions[currentStep]}
                    </p>
                </div>
                 {/* Game image and name removed from steps 1-4 header, will be added to step 5 */}
            </div>
          </div>
        )}

        {currentStep === totalDisplaySteps && (
           <CardHeader className="px-0 pt-6 pb-4">
            <div className="flex justify-between items-baseline mb-2">
                <CardTitle className="text-2xl md:text-3xl text-left">
                    {stepUITitles[currentStep]}
                </CardTitle>
                {yourOverallAverage !== null && (
                    <div className="text-right">
                    <span className="text-primary text-3xl md:text-4xl font-bold whitespace-nowrap">
                        {formatRatingNumber(yourOverallAverage * 2)}
                    </span>
                    </div>
                )}
            </div>
            {gameCoverArtUrl && gameName && (
              <Card className="mb-4 shadow-sm border-border">
                <CardHeader className="p-3 flex flex-row items-center gap-3 bg-muted/30">
                  <div className="relative h-16 w-12 flex-shrink-0 rounded-sm overflow-hidden">
                    <SafeImage
                      src={gameCoverArtUrl}
                      fallbackSrc={`https://placehold.co/48x64.png?text=${encodeURIComponent(gameName.substring(0,3))}`}
                      alt={`${gameName} copertina`}
                      fill
                      sizes="48px"
                      className="object-cover"
                      data-ai-hint={`${gameName.split(' ')[0]?.toLowerCase() || 'game'} thumbnail`}
                    />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-md text-foreground">{gameName}</h4>
                  </div>
                </CardHeader>
              </Card>
            )}
            <CardDescription className="text-left text-sm text-muted-foreground mt-1 whitespace-pre-line">
                {currentStepDescriptionText}
            </CardDescription>
          </CardHeader>
        )}


        <div className="min-h-[240px] sm:min-h-[280px]">
          {currentStep === 1 && (
            <div className="space-y-6 animate-fadeIn">
              {(stepCategories[0] as RatingCategory[]).map((fieldName) => (
                <RatingSliderInput
                  key={fieldName}
                  fieldName={fieldName}
                  control={form.control}
                  label={RATING_CATEGORIES[fieldName]}
                  description={categoryDescriptions[fieldName]}
                  minLabel={SLIDER_LEGENDS[fieldName].minLabel}
                  maxLabel={SLIDER_LEGENDS[fieldName].maxLabel}
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
                  label={RATING_CATEGORIES[fieldName]}
                  description={categoryDescriptions[fieldName]}
                  minLabel={SLIDER_LEGENDS[fieldName].minLabel}
                  maxLabel={SLIDER_LEGENDS[fieldName].maxLabel}
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
                  label={RATING_CATEGORIES[fieldName]}
                  description={categoryDescriptions[fieldName]}
                  minLabel={SLIDER_LEGENDS[fieldName].minLabel}
                  maxLabel={SLIDER_LEGENDS[fieldName].maxLabel}
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
                  label={RATING_CATEGORIES[fieldName]}
                  description={categoryDescriptions[fieldName]}
                  minLabel={SLIDER_LEGENDS[fieldName].minLabel}
                  maxLabel={SLIDER_LEGENDS[fieldName].maxLabel}
                />
              ))}
            </div>
          )}

          {currentStep === totalDisplaySteps && (
            <div className="animate-fadeIn">
              <GroupedRatingsDisplay
                groupedAverages={groupedAveragesForSummary}
                noRatingsMessage="Impossibile caricare il riepilogo. Per favore, prova a inviare di nuovo."
                defaultOpenSections={['Sentimento', 'Design del Gioco', 'Estetica e Immersione', 'Apprendimento e Logistica']}
              />
              {newlyEarnedBadges.length > 0 && (
                <div className="mt-6">
                  <Separator />
                  <h4 className="text-lg font-semibold mt-4 mb-3">Distintivi Guadagnati con questo Voto!</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {newlyEarnedBadges.map((badge) => {
                      const IconComponent = badge.iconName ? BadgeIconMap[badge.iconName] || Award : Award;
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
          currentStep === totalDisplaySteps ? 'justify-end' : 'justify-between'
        )}>
            <div className="flex">
              {(currentStep === 1) && (
                  <Button type="button" variant="outline" onClick={() => router.push(`/games/${gameId}`)} disabled={isSubmitTransitionPending}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Torna al Gioco
                  </Button>
              )}
              {(currentStep > 1 && currentStep <= totalInputSteps) && (
                <Button type="button" variant="outline" onClick={handlePrevious} disabled={isSubmitTransitionPending}>
                  Indietro
                </Button>
              )}
            </div>

            <div className="flex">
              {currentStep < totalInputSteps ? (
                <Button type="button" onClick={handleNext} disabled={isSubmitTransitionPending} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  Avanti
                </Button>
              ) : currentStep === totalInputSteps ? (
                <Button type="button" onClick={handleStep4Submit} disabled={isSubmitTransitionPending} className="bg-accent hover:bg-accent/90 text-accent-foreground">
                  {isSubmitTransitionPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {existingReview ? 'Aggiorna Recensione' : 'Invia Recensione'}
                </Button>
              ) : currentStep === totalDisplaySteps ? (
                <Button type="button" onClick={handleFinish} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  Termina e Torna al Gioco
                </Button>
              ) : null}
            </div>
        </div>
      </form>
    </Form>
  );
}

