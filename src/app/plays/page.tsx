
'use client';

import { useState, useEffect, useMemo } from 'react';
import type { AugmentedBggPlayDetail, BggPlayerInPlay } from '@/lib/types';
import { getAllUserPlaysAction } from '@/lib/actions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';
import { SafeImage } from '@/components/common/SafeImage';
import { Dices, Trophy, UserCircle2, Sparkles, Loader2, Info } from 'lucide-react'; // Removed LayoutList
import { formatReviewDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const PLAYS_PER_PAGE = 10;

export default function AllPlaysPage() {
  const [allUserPlays, setAllUserPlays] = useState<AugmentedBggPlayDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const usernameToFetch = 'lctr01';

  useEffect(() => {
    async function fetchPlays() {
      setIsLoading(true);
      setError(null);
      try {
        const playsData = await getAllUserPlaysAction(usernameToFetch);
        // Ensure plays are sorted by date, latest first (action should do this, but good to be sure)
        playsData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setAllUserPlays(playsData);
      } catch (e) {
        setError('Impossibile caricare le partite registrate.');
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    fetchPlays();
  }, [usernameToFetch]);

  const totalPages = Math.ceil(allUserPlays.length / PLAYS_PER_PAGE);

  const paginatedPlays = useMemo(() => {
    const startIndex = (currentPage - 1) * PLAYS_PER_PAGE;
    return allUserPlays.slice(startIndex, startIndex + PLAYS_PER_PAGE);
  }, [allUserPlays, currentPage]);

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };


  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">Caricamento di tutte le partite...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-md mx-auto my-10">
        <Info className="h-4 w-4" />
        <AlertTitle>Errore nel Caricamento delle Partite</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      <Card className="shadow-lg border border-border rounded-lg">
        <CardHeader>
          <CardTitle className="text-2xl sm:text-3xl flex items-center gap-3">
            <Dices className="h-7 w-7 text-primary" />
            Tutte le Partite Registrate
          </CardTitle>
          <CardDescription>
            Esplora tutte le partite registrate, ordinate per data (più recenti prima).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {allUserPlays.length === 0 ? (
            <Alert variant="default" className="bg-secondary/30 border-secondary">
              <Info className="h-4 w-4" />
              <AlertTitle>Nessuna Partita Trovata</AlertTitle>
              <AlertDescription>
                Nessuna partita registrata trovata nel sistema.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-6">
              {paginatedPlays.map((play) => {
                const fallbackGameHeaderSrc = `https://placehold.co/64x80.png?text=${encodeURIComponent(play.gameName?.substring(0,3) || 'N/A')}`;
                const winners = play.players?.filter(p => p.didWin) || [];
                const winnerNames = winners.map(p => p.name || p.username || 'Sconosciuto').join(', ');

                return (
                  <Card key={play.playId} className="overflow-hidden shadow-md border border-border rounded-lg">
                    <CardHeader className="bg-muted/30 p-3 flex flex-row items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-grow min-w-0">
                        <Link href={`/games/${play.gameId}`} className="flex-shrink-0">
                          <div className="relative h-16 w-12 rounded-sm overflow-hidden shadow-sm hover:opacity-80 transition-opacity">
                            <SafeImage
                              src={play.gameCoverArtUrl}
                              fallbackSrc={fallbackGameHeaderSrc}
                              alt={`${play.gameName || 'Gioco'} copertina`}
                              fill
                              sizes="48px"
                              className="object-cover"
                              data-ai-hint={`board game ${play.gameName?.split(' ')[0]?.toLowerCase() || 'mini'}`}
                            />
                          </div>
                        </Link>
                        <div className="flex-grow min-w-0">
                          <Link href={`/games/${play.gameId}`}>
                            <h3 className="text-md font-semibold text-primary leading-tight hover:underline truncate" title={play.gameName}>
                              {play.gameName}
                            </h3>
                          </Link>
                          <p className="text-xs text-muted-foreground">{formatReviewDate(play.date)}</p>
                        </div>
                      </div>
                      {winners.length > 0 && (
                        <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-300 whitespace-nowrap flex-shrink-0">
                          <Trophy className="mr-1 h-3.5 w-3.5"/> {winnerNames}
                        </Badge>
                      )}
                    </CardHeader>
                    <CardContent className="p-4 text-sm space-y-3">
                       {play.quantity > 1 && (
                         <p className="text-xs text-muted-foreground">Giocata {play.quantity} volte in questa sessione.</p>
                       )}
                       {play.location && play.location.trim() !== '' && (
                        <div className="grid grid-cols-[auto_1fr] gap-x-2 items-baseline">
                          <strong className="text-muted-foreground text-xs">Luogo:</strong>
                          <p className="text-xs whitespace-pre-wrap">{play.location}</p>
                        </div>
                      )}
                      {play.comments && play.comments.trim() !== '' && (
                        <div className="grid grid-cols-[auto_1fr] gap-x-2 items-baseline">
                          <strong className="text-muted-foreground text-xs">Commenti:</strong>
                          <p className="text-xs whitespace-pre-wrap">{play.comments}</p>
                        </div>
                      )}
                      {play.players && play.players.length > 0 && (
                        <div>
                          <ul className="pl-1">
                            {play.players
                              .slice()
                              .sort((a, b) => {
                                const scoreA = parseInt(a.score || "0", 10);
                                const scoreB = parseInt(b.score || "0", 10);
                                return scoreB - scoreA;
                              })
                              .map((player, pIndex) => (
                              <li key={pIndex} className={cn(
                                "flex items-center justify-between text-xs border-b border-border last:border-b-0 py-1.5",
                                pIndex % 2 !== 0 ? 'bg-muted/30' : '', // odd rows for 0-indexed
                                "px-2"
                              )}>
                                <div className="flex items-center gap-1.5 flex-grow min-w-0">
                                  <UserCircle2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 relative top-px" />
                                  <span className={cn("truncate", player.didWin ? 'font-semibold' : '')} title={player.name || player.username || 'Sconosciuto'}>
                                    {player.name || player.username || 'Sconosciuto'}
                                  </span>
                                  {player.didWin && (
                                    <Trophy className="h-3.5 w-3.5 text-green-600 ml-1 flex-shrink-0" />
                                  )}
                                  {player.isNew && (
                                    <Sparkles className="h-3.5 w-3.5 text-blue-600 ml-1 flex-shrink-0" />
                                  )}
                                </div>
                                {player.score && (
                                  <span className={cn("font-mono text-xs whitespace-nowrap ml-2 text-foreground", player.didWin ? 'font-semibold' : '')}>
                                    {player.score} pt.
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t">
                  <Button onClick={handlePrevPage} disabled={currentPage === 1} variant="outline">
                    Precedente
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Pagina {currentPage} di {totalPages}
                  </span>
                  <Button onClick={handleNextPage} disabled={currentPage === totalPages} variant="outline">
                    Successiva
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
