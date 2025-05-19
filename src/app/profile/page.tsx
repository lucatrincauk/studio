
'use client';

import { useAuth } from '@/contexts/auth-context';
import { UpdateProfileForm } from '@/components/profile/update-profile-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ThemeSwitcher } from '@/components/profile/theme-switcher'; // Import ThemeSwitcher
import { Separator } from '@/components/ui/separator';

export default function ProfilePage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">Caricamento profilo...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-10">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Accesso Richiesto</h2>
        <p className="text-muted-foreground mb-6">
          Devi essere loggato per visualizzare questa pagina.
        </p>
        <Button asChild>
          <Link href="/signin?redirect=/profile">
             Accedi
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-20rem)] py-12">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Il Tuo Profilo</CardTitle>
          <CardDescription>Gestisci le informazioni del tuo account e le preferenze dell'applicazione.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Email</h3>
            <p className="text-foreground">{user.email}</p>
          </div>
          <UpdateProfileForm initialDisplayName={user.displayName} />
        </CardContent>
      </Card>
      <div className="w-full max-w-md mt-0"> {/* Adjusted margin top */}
        <ThemeSwitcher />
      </div>
    </div>
  );
}
