
'use client';

import { useAuth } from '@/contexts/auth-context';
import { Loader2, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">Caricamento sezione admin...</p>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-20rem)] py-12">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <ShieldAlert className="h-16 w-16 text-destructive mx-auto mb-4" />
            <CardTitle className="text-2xl font-bold text-destructive">Accesso Negato</CardTitle>
            <CardDescription>
              Non hai i permessi necessari per accedere a questa sezione.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/">Torna alla Homepage</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Optional: Add admin-specific navigation here if needed in the future
  // For now, it's a simple wrapper.
  return (
    <div>
      {/* 
      <nav className="bg-muted p-4 mb-4 rounded-md">
        <ul className="flex gap-4">
          <li><Link href="/admin" className="hover:text-primary">Dashboard Admin</Link></li>
          <li><Link href="/admin/collection" className="hover:text-primary">Gestione Collezione</Link></li>
        </ul>
      </nav>
      */}
      {children}
    </div>
  );
}
