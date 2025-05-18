
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
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import { useState } from 'react'; // Added

const formSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match.",
  path: ["confirmPassword"], 
});

type SignupFormValues = z.infer<typeof formSchema>;

// Simple SVG for Google icon
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
  const router = useRouter();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false); // Added

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
    const user = await signUp(values.email, values.password);
    if (user) {
      router.push('/'); 
    }
  }

  async function handleGoogleSignUp() {
    clearError();
    setIsGoogleLoading(true);
    const user = await signInWithGoogle();
    if (user) {
      router.push('/');
    }
    setIsGoogleLoading(false);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-md mx-auto">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Sign-up Failed</AlertTitle>
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
                <Input type="email" placeholder="your@email.com" {...field} />
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
              <FormLabel>Confirm Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={loading || isGoogleLoading} className="w-full">
          {(loading && !isGoogleLoading) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Sign Up with Email
        </Button>

        <div className="relative my-4">
          <Separator />
          <div className="absolute inset-0 flex items-center">
            <span className="mx-auto bg-card px-2 text-xs text-muted-foreground">OR</span>
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
          Sign Up with Google
        </Button>

         <p className="text-sm text-center text-muted-foreground pt-2">
          Already have an account?{' '}
          <Link href="/signin" className="font-medium text-primary hover:underline">
            Sign In
          </Link>
        </p>
      </form>
    </Form>
  );
}
