
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { useAuth } from '@/contexts/auth-context';
import { useRouter, useSearchParams } from 'next/navigation'; // Added useSearchParams
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import { useState } from 'react';

const formSchema = z.object({
  email: z.string().email({ message: "Indirizzo email non valido." }),
  password: z.string().min(6, { message: "La password deve contenere almeno 6 caratteri." }),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Le password non coincidono.",
  path: ["confirmPassword"], 
});

type SignupFormValues = z.infer<typeof formSchema>;

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 mr-2">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12.24 10.27v3.45h5.84c-.27 1.67-1.75 3.29-4.14 3.29-2.5 0-4.53-2.04-4.53-4.53s2.03-4.53 4.53-4.53c1.42 0 2.25.57 2.76 1.04l2.1-2.1c-1.26-1.16-2.92-1.88-4.86-1.88-4.09 0-7.44 3.35-7.44 7.44s3.35 7.44 7.44 7.44c4.25 0 7.06-2.89 7.06-7.22 0-.48-.04-.95-.12-1.41H12.24z"
      fill="currentColor"
    />
  </svg>
);

export function SignupForm() {
  const { signUp, signInWithGoogle, loading, error, clearError } = useAuth();
  const router = useRouter(); // Keep for potential other uses
  const searchParams = useSearchParams(); // Get search params
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  async function onSubmit(values: SignupFormValues) {
    clearError();
    const redirectPath = searchParams.get('redirect');
    await signUp(values.email, values.password, redirectPath);
    // Redirection is now handled by AuthContext
  }

  async function handleGoogleSignUp() {
    clearError();
    setIsGoogleLoading(true);
    const redirectPath = searchParams.get('redirect');
    await signInWithGoogle(redirectPath);
    setIsGoogleLoading(false);
    // Redirection is now handled by AuthContext
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-md mx-auto">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Registrazione Fallita</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="tua@email.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Conferma Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={loading || isGoogleLoading} className="w-full">
          {(loading && !isGoogleLoading) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Registrati con Email
        </Button>

        <div className="relative my-4">
          <Separator />
          <div className="absolute inset-0 flex items-center">
            <span className="mx-auto bg-card px-2 text-xs text-muted-foreground">O</span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleGoogleSignUp}
          disabled={loading || isGoogleLoading}
          className="w-full flex items-center justify-center"
        >
          {isGoogleLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GoogleIcon />}
          Registrati con Google
        </Button>

         <p className="text-sm text-center text-muted-foreground pt-2">
          Hai già un account?{' '}
          <Link href="/signin" className="font-medium text-primary hover:underline">
            Accedi
          </Link>
        </p>
      </form>
    </Form>
  );
}
