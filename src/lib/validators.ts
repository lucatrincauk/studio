
import { z } from 'zod';

// Updated to 1-10 scale
export const reviewFormSchema = z.object({
  excitedToReplay: z.coerce.number().min(1, "Rating is required").max(10),
  mentallyStimulating: z.coerce.number().min(1, "Rating is required").max(10),
  fun: z.coerce.number().min(1, "Rating is required").max(10),
  decisionDepth: z.coerce.number().min(1, "Rating is required").max(10),
  replayability: z.coerce.number().min(1, "Rating is required").max(10),
  luck: z.coerce.number().min(1, "Rating is required").max(10),
  lengthDowntime: z.coerce.number().min(1, "Rating is required").max(10),
  graphicDesign: z.coerce.number().min(1, "Rating is required").max(10),
  componentsThemeLore: z.coerce.number().min(1, "Rating is required").max(10),
  effortToLearn: z.coerce.number().min(1, "Rating is required").max(10),
  setupTeardown: z.coerce.number().min(1, "Rating is required").max(10),
});

export type RatingFormValues = z.infer<typeof reviewFormSchema>;

export const profileFormSchema = z.object({
  displayName: z.string().min(1, { message: "Il nome visualizzato non può essere vuoto." }).max(50, { message: "Il nome visualizzato non può superare i 50 caratteri." }),
  bggUsername: z.string().max(75, { message: "Il nome utente BGG non può superare i 75 caratteri." }).optional().nullable(),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;
