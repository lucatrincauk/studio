
import { z } from 'zod';

export const reviewFormSchema = z.object({
  excitedToReplay: z.coerce.number().min(1, "Rating is required").max(5),
  mentallyStimulating: z.coerce.number().min(1, "Rating is required").max(5),
  fun: z.coerce.number().min(1, "Rating is required").max(5),
  decisionDepth: z.coerce.number().min(1, "Rating is required").max(5),
  replayability: z.coerce.number().min(1, "Rating is required").max(5),
  luck: z.coerce.number().min(1, "Rating is required").max(5),
  lengthDowntime: z.coerce.number().min(1, "Rating is required").max(5),
  presentation: z.coerce.number().min(1, "Rating is required").max(5),
  management: z.coerce.number().min(1, "Rating is required").max(5),
});

export type RatingFormValues = z.infer<typeof reviewFormSchema>;
