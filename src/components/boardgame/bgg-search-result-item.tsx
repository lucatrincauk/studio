
'use client';

import type { BggSearchResult } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Loader2, ExternalLink } from 'lucide-react';
import { useState, useTransition } from 'react';

interface BggSearchResultItemProps {
  result: BggSearchResult;
  onAddGame: (bggId: string) => Promise<void>;
  isAdding: boolean;
}

export function BggSearchResultItem({ result, onAddGame, isAdding }: BggSearchResultItemProps) {
  const [isPending, startTransition] = useTransition();

  const handleAddClick = () => {
    startTransition(async () => {
      await onAddGame(result.bggId);
    });
  };

  return (
    <Card className="overflow-hidden shadow-md transition-all duration-300 ease-in-out hover:shadow-lg h-full rounded-lg border border-border hover:border-primary/50">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{result.name}</CardTitle>
        {result.yearPublished && (
          <CardDescription className="text-sm text-muted-foreground">
            Pubblicato: {result.yearPublished}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">BGG ID: {result.bggId}</p>
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-2 p-4 pt-0">
        <Button
          onClick={handleAddClick}
          disabled={isAdding || isPending}
          size="sm"
          className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {isAdding || isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Aggiungendo...
            </>
          ) : (
            <>
              <PlusCircle className="mr-2 h-4 w-4" /> Aggiungi e Valuta
            </>
          )}
        </Button>
        <Button
            variant="outline"
            size="sm"
            asChild
            className="w-full sm:w-auto"
        >
            <a 
                href={`https://boardgamegeek.com/boardgame/${result.bggId}`} 
                target="_blank" 
                rel="noopener noreferrer"
            >
                Vedi su BGG <ExternalLink className="ml-2 h-4 w-4" />
            </a>
        </Button>
      </CardFooter>
    </Card>
  );
}
