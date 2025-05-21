
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { profileFormSchema, type ProfileFormValues } from '@/lib/validators';
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
import { useAuth } from '@/contexts/auth-context';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { useState, useEffect } from 'react';

interface UpdateProfileFormProps {
  initialValues: {
    displayName: string | null;
    bggUsername: string | null;
  };
  onProfileUpdate: () => void;
}

export function UpdateProfileForm({ initialValues, onProfileUpdate }: UpdateProfileFormProps) {
  const { updateUserProfile, error: authError, clearError } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      displayName: initialValues.displayName || '',
      bggUsername: initialValues.bggUsername || '',
    },
  });

  useEffect(() => {
    form.reset({
        displayName: initialValues.displayName || '',
        bggUsername: initialValues.bggUsername || '',
    });
  }, [initialValues, form]);


  async function onSubmit(values: ProfileFormValues) {
    setIsSubmitting(true);
    setSubmissionError(null);
    clearError(); 

    const success = await updateUserProfile({ 
      displayName: values.displayName, 
      bggUsername: values.bggUsername === "" ? null : values.bggUsername 
    });

    if (success) {
      onProfileUpdate(); // Re-fetch profile data in parent
    } else if (authError) {
      setSubmissionError(authError.message);
    } else {
      setSubmissionError("Si è verificato un errore sconosciuto durante l'aggiornamento del profilo.");
    }
    setIsSubmitting(false);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {submissionError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Aggiornamento Fallito</AlertTitle>
            <AlertDescription>{submissionError}</AlertDescription>
          </Alert>
        )}
        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome Visualizzato</FormLabel>
              <FormControl>
                <Input placeholder="Il tuo nome" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="bggUsername"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome Utente BoardGameGeek (Opzionale)</FormLabel>
              <FormControl>
                <Input placeholder="Il tuo username BGG" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Aggiorna Profilo
        </Button>
      </form>
    </Form>
  );
}
