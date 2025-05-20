
import { SignupForm } from '@/components/auth/signup-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';

export default function SignupPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-20rem)] py-12">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Crea un Account</CardTitle>
          <CardDescription>Inserisci i tuoi dati per iniziare.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="flex justify-center items-center h-32"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <SignupForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
