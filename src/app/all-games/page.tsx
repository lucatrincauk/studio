
import { getAllGamesAction } from '@/lib/actions'; 
import { GameSearchList } from '@/components/boardgame/game-search-list';
import type { BoardGame } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Library } from 'lucide-react';

export default async function AllGamesPage() {
  const allGames = await getAllGamesAction();

  return (
    <div className="space-y-8">
      <Card className="shadow-lg border border-border rounded-lg">
        <CardHeader>
          <CardTitle className="text-2xl sm:text-3xl flex items-center gap-3">
            <Library className="h-7 w-7 text-primary" />
            Catalogo Completo dei Giochi
          </CardTitle>
          <CardDescription>
            Sfoglia, cerca e ordina tutti i giochi da tavolo presenti nella collezione.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GameSearchList initialGames={allGames} title="Tutti i Giochi nel Catalogo" />
        </CardContent>
      </Card>
    </div>
  );
}

export const revalidate = 3600; // Revalidate every hour
