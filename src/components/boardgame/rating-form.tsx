
// src/components/boardgame/rating-form.tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFormContext } from 'react-hook-form';
import { useActionState, useEffect, useTransition } from 'react'; // Added useTransition
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { StarRating } from './star-rating';
import type { RatingCategory } from '@/lib/types';
import { RATING_CATEGORIES } from '@/lib/types';
import { submitNewReviewAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

// Export schema and type for use in actions.ts
export const formSchema = z.object({
  author: z.string().min(2, "Name must be at least 2 characters.").max(50, "Name cannot exceed 50 characters."),
  feeling: z.coerce.number().min(1, "Rating is required").max(5),
  gameDesign: z.coerce.number().min(1, "Rating is required").max(5),
  presentation: z.coerce.number().min(1, "Rating is required").max(5),
  management: z.coerce.number().min(1, "Rating is required").max(5),
  comment: z.string().min(5, "Comment must be at least 5 characters.").max(500, "Comment cannot exceed 500 characters."),
});

export type RatingFormValues = z.infer<typeof formSchema>;

interface RatingFormProps {
  gameId: string;
}

const initialState = {
  message: "",
  errors: undefined as Record<string, string[]> | undefined,
  success: false,
};

export function RatingForm({ gameId }: RatingFormProps) {
  const [isActionPending, startTransition] = useTransition();

  const [serverActionState, formActionDispatcher] = useActionState(
    (prevState: typeof initialState, payload: RatingFormValues) => submitNewReviewAction(gameId, prevState, payload),
    initialState
  );
  const { toast } = useToast();

  const form = useForm<RatingFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      author: '',
      feeling: 1,
      gameDesign: 1,
      presentation: 1,
      management: 1,
      comment: '',
    },
  });

  useEffect(() => {
    if(serverActionState.message) {
      if (serverActionState.success) {
        toast({
          title: "Success!",
          description: serverActionState.message,
        });
        form.reset({
          author: '',
          feeling: 1,
          gameDesign: 1,
          presentation: 1,
          management: 1,
          comment: '',
        });
      } else {
        if (serverActionState.errors) {
          Object.entries(serverActionState.errors).forEach(([fieldName, errors]) => {
            form.setError(fieldName as keyof RatingFormValues, {
              type: 'server',
              message: errors[0],
            });
          });
        }
        toast({
          title: "Error",
          description: serverActionState.message || "Failed to submit review.",
          variant: "destructive",
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverActionState, toast]);


  const ratingCategories: RatingCategory[] = ['feeling', 'gameDesign', 'presentation', 'management'];

  const handleFormSubmit = (data: RatingFormValues) => {
    startTransition(() => {
      formActionDispatcher(data);
    });
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleFormSubmit)} 
        className="space-y-6 p-6 border border-border rounded-lg shadow-md bg-card"
      >
        <h3 className="text-xl font-semibold text-foreground">Rate this Game</h3>

        <FormField
          control={form.control}
          name="author"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-base font-medium">Your Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="Enter your name"
                  {...field}
                  className="bg-background focus:ring-primary"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {ratingCategories.map((category) => (
          <FormField
            key={category}
            control={form.control}
            name={category}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base font-medium">{RATING_CATEGORIES[category]}</FormLabel>
                <FormControl>
                  <StarRating
                    rating={field.value}
                    setRating={(value) => field.onChange(value)}
                    size={28}
                    className="py-1"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
        <FormField
          control={form.control}
          name="comment"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-base font-medium">Your Review</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Share your thoughts on the game..."
                  className="resize-y min-h-[100px] bg-background focus:ring-primary"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <SubmitButton isActionPending={isActionPending} />
         {serverActionState.message && !serverActionState.success && !serverActionState.errors && (
          <p className="text-sm font-medium text-destructive">{serverActionState.message}</p>
        )}
      </form>
    </Form>
  );
}

function SubmitButton({ isActionPending }: { isActionPending: boolean }) {
  const { formState } = useFormContext<RatingFormValues>();
  const rhfIsSubmitting = formState.isSubmitting;

  const trulySubmitting = rhfIsSubmitting || isActionPending;

  return (
    <Button
      type="submit"
      className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90 focus:ring-accent/50 transition-colors"
      disabled={trulySubmitting}
    >
      {trulySubmitting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Submitting...
        </>
      ) : (
        'Submit Review'
      )}
    </Button>
  );
}
