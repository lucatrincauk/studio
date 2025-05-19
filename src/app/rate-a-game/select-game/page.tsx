
'use client';

import { GameRatingSelector } from '@/components/rating/game-rating-selector';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export default function SelectGameToRatePage() {
  const router = useRouter();

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
       <Button variant="outline" size="sm" className="mb-6" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Torna Indietro
      </Button>
      <Card className="shadow-xl border border-border rounded-lg">
        <CardHeader>
          <CardTitle className="text-2xl md:text-3xl">Scegli il Gioco da Valutare</CardTitle>
          <CardDescription>
            Cerca un gioco nella nostra collezione per valutarlo. Se non lo trovi, un admin può aggiungerlo dalla sezione di gestione collezione.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GameRatingSelector />
        </CardContent>
      </Card>
    </div>
  );
}

