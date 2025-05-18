
import { z } from 'zod';

export const reviewFormSchema = z.object({
  // author field removed
  feeling: z.coerce.number().min(1, "Rating is required").max(5),
  gameDesign: z.coerce.number().min(1, "Rating is required").max(5),
  presentation: z.coerce.number().min(1, "Rating is required").max(5),
  management: z.coerce.number().min(1, "Rating is required").max(5),
  // comment field removed
});

export type RatingFormValues = z.infer<typeof reviewFormSchema>;

