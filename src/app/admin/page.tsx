
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ListChecks, Users } from 'lucide-react';

export default function AdminDashboardPage() {
  return (
    <div className="space-y-8">
      <Card className="shadow-lg border border-border rounded-lg">
        <CardHeader>
          <CardTitle className="text-2xl sm:text-3xl">Pannello di Controllo Admin</CardTitle>
          <CardDescription>
            Benvenuto nella sezione amministrativa. Da qui puoi gestire diverse parti dell&apos;applicazione.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
            <Card className="hover:shadow-md transition-shadow">
                <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2">
                        <ListChecks className="h-5 w-5 text-primary" />
                        Gestione Collezione Giochi
                    </CardTitle>
                    <CardDescription>
                        Sincronizza la collezione di giochi con BoardGameGeek e il database locale.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button asChild>
                        <Link href="/admin/collection">Vai alla Gestione Collezione</Link>
                    </Button>
                </CardContent>
            </Card>
             {/* Placeholder for future admin features */}
            <Card className="hover:shadow-md transition-shadow">
                <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2">
                         <Users className="h-5 w-5 text-primary" />
                        Gestione Utenti (Futuro)
                    </CardTitle>
                    <CardDescription>
                        Visualizza e gestisci gli utenti registrati. (Non ancora implementato)
                    </CardDescription>
                </CardHeader>
                 <CardContent>
                    <Button disabled variant="outline">
                        Vai alla Gestione Utenti
                    </Button>
                </CardContent>
            </Card>
        </CardContent>
      </Card>
    </div>
  );
}
