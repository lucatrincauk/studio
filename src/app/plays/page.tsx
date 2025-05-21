
'use client';

import { useState, useEffect, useMemo } from 'react';
import type { AugmentedBggPlayDetail, BggPlayerInPlay } from '@/lib/types'; // Ensure BggPlayerInPlay is imported
import { getAllUserPlaysAction } from '@/lib/actions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';
import { SafeImage } from '@/components/common/SafeImage';
import { Dices, Trophy, UserCircle2, Sparkles, Loader2, Info, LayoutList } from 'lucide-react';
import { formatReviewDate, formatPlayDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export default function AllPlaysPage() {
  const [allUserPlays, setAllUserPlays] = useState<AugmentedBggPlayDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const usernameToFetch = 'lctr01'; // This remains for the action, but will be removed from UI

  useEffect(() => {
    async function fetchPlays() {
      setIsLoading(true);
      setError(null);
      try {
        const playsData = await getAllUserPlaysAction(usernameToFetch);
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

  const playsByGame = useMemo(() => {
    const grouped: { [gameId: string]: { gameName: string, gameCoverArtUrl?: string | null, gameBggId: number, plays: AugmentedBggPlayDetail[] } } = {};
    allUserPlays.forEach(play => {
      if (!grouped[play.gameId]) {
        grouped[play.gameId] = {
          gameName: play.gameName,
          gameCoverArtUrl: play.gameCoverArtUrl,
          gameBggId: play.gameBggId,
          plays: []
        };
      }
      grouped[play.gameId].plays.push(play);
    });
    // Sort games by name, then sort plays within each game by date (latest first)
    return Object.entries(grouped)
      .sort(([_, gameAData], [__, gameBData]) => gameAData.gameName.localeCompare(gameBData.gameName))
      .map(([gameId, gameData]) => ({
        ...gameData,
        gameId,
        plays: gameData.plays.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
      }));
  }, [allUserPlays]);

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
            <Dices className="h-7 w-7 text-primary" /> {/* Changed icon */}
            Tutte le Partite Registrate
          </CardTitle>
          <CardDescription>
            Esplora tutte le partite registrate, raggruppate per gioco e ordinate per data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {playsByGame.length === 0 ? (
            <Alert variant="default" className="bg-secondary/30 border-secondary">
              <Info className="h-4 w-4" />
              <AlertTitle>Nessuna Partita Trovata</AlertTitle>
              <AlertDescription>
                Nessuna partita registrata trovata nel sistema.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-6">
              {playsByGame.map((gameGroup) => {
                const fallbackGameHeaderSrc = `https://placehold.co/80x120.png?text=${encodeURIComponent(gameGroup.gameName?.substring(0,10) || 'N/A')}`;
                return (
                  <Card key={gameGroup.gameId} className="overflow-hidden shadow-md border border-border rounded-lg">
                    <CardHeader className="bg-muted/30 p-3 flex flex-row items-center gap-3">
                      <Link href={`/games/${gameGroup.gameId}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity w-full">
                        <div className="relative h-16 w-12 flex-shrink-0 rounded-sm overflow-hidden shadow-sm">
                          <SafeImage
                            src={gameGroup.gameCoverArtUrl}
                            fallbackSrc={fallbackGameHeaderSrc}
                            alt={`${gameGroup.gameName || 'Gioco'} copertina`}
                            fill
                            sizes="48px"
                            className="object-cover"
                            data-ai-hint={`board game ${gameGroup.gameName?.split(' ')[0]?.toLowerCase() || 'mini'}`}
                          />
                        </div>
                        <div className="flex-grow">
                          <h3 className="text-md font-semibold text-primary leading-tight hover:underline">
                            {gameGroup.gameName}
                          </h3>
                          <p className="text-xs text-muted-foreground">Vedi Dettagli Gioco</p>
                        </div>
                      </Link>
                      <Badge variant="secondary">{gameGroup.plays.length}</Badge>
                    </CardHeader>
                    <CardContent className="p-4">
                      <Accordion type="single" collapsible className="w-full">
                        {gameGroup.plays.map((play) => {
                          const winners = play.players?.filter(p => p.didWin) || [];
                          const winnerNames = winners.map(p => p.name || p.username || 'Sconosciuto').join(', ');
                          return (
                            <AccordionItem value={`play-${play.playId}`} key={play.playId}>
                              <AccordionTrigger className="hover:no-underline text-left py-3 text-sm">
                                <div className="flex justify-between w-full items-center pr-2 gap-2">
                                  <div className="flex items-center gap-2">
                                    <Dices size={16} className="text-muted-foreground/80 flex-shrink-0" />
                                    <span className="font-medium">{formatReviewDate(play.date)}</span>
                                    {play.quantity > 1 && (
                                      <>
                                        <span className="text-muted-foreground">-</span>
                                        <span>{play.quantity} partite</span>
                                      </>
                                    )}
                                  </div>
                                  {winners.length > 0 && (
                                    <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-300 whitespace-nowrap">
                                      <Trophy className="mr-1 h-3.5 w-3.5"/> {winnerNames}
                                    </Badge>
                                  )}
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="pb-4 text-sm">
                                <div className="space-y-3">
                                   {play.location && play.location.trim() !== '' && ( // Refined condition
                                    <div className="grid grid-cols-[auto_1fr] gap-x-2 items-baseline pt-1">
                                      <strong className="text-muted-foreground text-xs">Luogo:</strong>
                                      <p className="text-xs whitespace-pre-wrap">{play.location}</p>
                                    </div>
                                  )}
                                  {play.comments && play.comments.trim() !== '' && ( // Refined condition
                                    <div className="grid grid-cols-[auto_1fr] gap-x-2 items-baseline pt-1">
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
                                          <li key={pIndex} className={`flex items-center justify-between text-xs border-b border-border last:border-b-0 py-1.5 ${pIndex % 2 === 0 ? 'bg-muted/30' : ''}`}>
                                            <div className="flex items-center gap-1.5 flex-grow min-w-0">
                                              <UserCircle2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 relative top-px" />
                                              <span className={`truncate ${player.didWin ? 'font-semibold' : ''}`} title={player.name || player.username || 'Sconosciuto'}>
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
                                              <span className={`font-mono text-xs whitespace-nowrap ml-2 text-foreground ${player.didWin ? 'font-semibold' : ''}`}>
                                                {player.score} pt.
                                              </span>
                                            )}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                      </Accordion>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

