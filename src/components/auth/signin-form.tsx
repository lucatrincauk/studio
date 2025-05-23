
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
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import { useState } from 'react';

const formSchema = z.object({
  email: z.string().email({ message: "Indirizzo email non valido." }),
  password: z.string().min(1, { message: "Password richiesta." }),
});

type SigninFormValues = z.infer<typeof formSchema>;

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


export function SigninForm() {
  const { signIn, signInWithGoogle, loading, error, clearError } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const form = useForm<SigninFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  async function onSubmit(values: SigninFormValues) {
    clearError();
    const redirectPath = searchParams.get('redirect');
    await signIn(values.email, values.password, redirectPath);
  }

  async function handleGoogleSignIn() {
    clearError();
    setIsGoogleLoading(true);
    const redirectPath = searchParams.get('redirect');
    await signInWithGoogle(redirectPath);
    setIsGoogleLoading(false);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-md mx-auto">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Accesso Fallito</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={handleGoogleSignIn}
          disabled={loading || isGoogleLoading}
          className="w-full flex items-center justify-center"
        >
          {isGoogleLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GoogleIcon />}
          Accedi con Google
        </Button>

        <div className="relative my-4">
          <Separator />
          <div className="absolute inset-0 flex items-center">
            <span className="mx-auto bg-card px-2 text-xs text-muted-foreground">O</span>
          </div>
        </div>
        
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
        <Button type="submit" disabled={loading || isGoogleLoading} className="w-full">
          {(loading && !isGoogleLoading) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Accedi con Email
        </Button>

        <div className="text-sm text-center space-y-2 mt-6">
            <p className="text-muted-foreground">
            Non hai un account?{' '}
            <Link href="/signup" className="font-medium text-primary hover:underline">
                Registrati
            </Link>
            </p>
        </div>
      </form>
    </Form>
  );
}
