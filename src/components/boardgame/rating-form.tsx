
// src/components/boardgame/rating-form.tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFormContext } from 'react-hook-form';
import { useActionState } from 'react'; // Changed from react-dom
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
import { useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const formSchema = z.object({
  author: z.string().min(2, "Name must be at least 2 characters.").max(50, "Name cannot exceed 50 characters."),
  feeling: z.number().min(1, "Rating is required").max(5),
  gameDesign: z.number().min(1, "Rating is required").max(5),
  presentation: z.number().min(1, "Rating is required").max(5),
  management: z.number().min(1, "Rating is required").max(5),
  comment: z.string().min(5, "Comment must be at least 5 characters.").max(500, "Comment cannot exceed 500 characters."),
});

type RatingFormValues = z.infer<typeof formSchema>;

interface RatingFormProps {
  gameId: string;
}

const initialState = {
  message: "",
  errors: undefined as Record<string, string[]> | undefined,
  success: false,
};

export function RatingForm({ gameId }: RatingFormProps) {
  const [state, formAction] = useActionState(submitNewReviewAction.bind(null, gameId), initialState);
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  const form = useForm<RatingFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      author: '',
      feeling: 1, // Default to 1 star
      gameDesign: 1, // Default to 1 star
      presentation: 1, // Default to 1 star
      management: 1, // Default to 1 star
      comment: '',
    },
    // The 'errors' prop was removed here to prevent potential re-render loops.
    // Server errors are handled imperatively in the useEffect below using form.setError().
  });

  useEffect(() => {
    if(state.message) {
      if (state.success) {
        toast({
          title: "Success!",
          description: state.message,
        });
        form.reset({ 
          author: '',
          feeling: 1, // Reset to 1 star
          gameDesign: 1, // Reset to 1 star
          presentation: 1, // Reset to 1 star
          management: 1, // Reset to 1 star
          comment: '',
        });
      } else {
        if (state.errors) {
          Object.entries(state.errors).forEach(([fieldName, errors]) => {
            form.setError(fieldName as keyof RatingFormValues, {
              type: 'server',
              message: errors[0],
            });
          });
        }
        toast({
          title: "Error",
          description: state.message || "Failed to submit review.",
          variant: "destructive",
        });
      }
    }
  }, [state, toast, form]);


  const ratingCategories: RatingCategory[] = ['feeling', 'gameDesign', 'presentation', 'management'];

  return (
    <Form {...form}>
      <form
        ref={formRef}
        action={formAction}
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

        <SubmitButton />
         {state.message && !state.success && !state.errors && ( 
          <p className="text-sm font-medium text-destructive">{state.message}</p>
        )}
      </form>
    </Form>
  );
}

function SubmitButton() {
  const form = useFormContext(); 
  const isSubmitting = form.formState.isSubmitting; 

  return (
    <Button
      type="submit"
      className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90 focus:ring-accent/50 transition-colors"
      disabled={isSubmitting} 
    >
      {isSubmitting ? (
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

