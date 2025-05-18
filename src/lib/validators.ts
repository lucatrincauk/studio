
import { z } from 'zod';

export const reviewFormSchema = z.object({
  author: z.string().min(2, "Name must be at least 2 characters.").max(50, "Name cannot exceed 50 characters."),
  feeling: z.coerce.number().min(1, "Rating is required").max(5),
  gameDesign: z.coerce.number().min(1, "Rating is required").max(5),
  presentation: z.coerce.number().min(1, "Rating is required").max(5),
  management: z.coerce.number().min(1, "Rating is required").max(5),
  comment: z.string().min(5, "Comment must be at least 5 characters.").max(500, "Comment cannot exceed 500 characters."),
  // userId: z.string().optional(), // userId will be handled by the server/client logic, not direct form input
});

export type RatingFormValues = z.infer<typeof reviewFormSchema>;

