
import { z } from 'zod';

export const reviewFormSchema = z.object({
  excitedToReplay: z.coerce.number().min(1, "Rating is required").max(5),
  mentallyStimulating: z.coerce.number().min(1, "Rating is required").max(5),
  fun: z.coerce.number().min(1, "Rating is required").max(5),
  decisionDepth: z.coerce.number().min(1, "Rating is required").max(5),
  replayability: z.coerce.number().min(1, "Rating is required").max(5),
  luck: z.coerce.number().min(1, "Rating is required").max(5),
  lengthDowntime: z.coerce.number().min(1, "Rating is required").max(5),
  graphicDesign: z.coerce.number().min(1, "Rating is required").max(5),
  componentsThemeLore: z.coerce.number().min(1, "Rating is required").max(5),
  effortToLearn: z.coerce.number().min(1, "Rating is required").max(5),
  setupTeardown: z.coerce.number().min(1, "Rating is required").max(5),
});

export type RatingFormValues = z.infer<typeof reviewFormSchema>;

export const profileFormSchema = z.object({
  displayName: z.string().min(1, { message: "Il nome visualizzato non può essere vuoto." }).max(50, { message: "Il nome visualizzato non può superare i 50 caratteri." }),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;
