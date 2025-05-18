
import Link from 'next/link';
import { getAllUsersAction } from '@/lib/actions';
import type { UserProfile } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default async function UsersPage() {
  const users = await getAllUsersAction();

  return (
    <div className="space-y-8">
      <Card className="shadow-lg border border-border rounded-lg">
        <CardHeader>
          <CardTitle className="text-2xl sm:text-3xl flex items-center gap-3">
            <Users2 className="h-7 w-7 text-primary" />
            Sfoglia Utenti
          </CardTitle>
          <CardDescription>
            Esplora gli utenti e vedi i giochi che hanno recensito.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
             <Alert variant="default" className="bg-secondary/30 border-secondary">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Nessun Utente Trovato</AlertTitle>
              <AlertDescription>
                Non ci sono utenti che hanno ancora inviato recensioni.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {users.map((user) => (
                <Link key={user.id} href={`/users/${user.id}`} legacyBehavior>
                  <a className="block group">
                    <Card className="h-full overflow-hidden shadow-md transition-all duration-300 ease-in-out hover:shadow-lg hover:border-primary/50 rounded-lg border border-border">
                      <CardContent className="p-4 flex flex-col items-center text-center space-y-3">
                        <Avatar className="h-20 w-20 border-2 border-primary/50 group-hover:border-primary transition-colors">
                          {user.photoURL && <AvatarImage src={user.photoURL} alt={user.name} />}
                          <AvatarFallback className="text-2xl bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                            {user.name.substring(0, 1).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <p className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors truncate w-full">
                          {user.name}
                        </p>
                      </CardContent>
                    </Card>
                  </a>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export const revalidate = 3600; // Revalidate every hour or on demand
