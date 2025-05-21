
import { getAllGamesAction, getFeaturedGamesAction, getLastPlayedGameAction } from '@/lib/actions';
import { GameCard } from '@/components/boardgame/game-card';
import { Separator } from '@/components/ui/separator';
import type { BoardGame, BggPlayDetail } from '@/lib/types';
import { Star, TrendingUp, Library, Info, Dices, UserCircle2, Sparkles, Trophy, Edit, Medal, Clock10 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { formatRatingNumber, formatReviewDate } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SafeImage } from '@/components/common/SafeImage';
import { cn } from '@/lib/utils';


export default async function HomePage() {
  const featuredGamesPromise = getFeaturedGamesAction();
  const allGamesPromise = getAllGamesAction();
  const lastPlayedPromise = getLastPlayedGameAction("lctr01");

  let featuredGames: BoardGame[] = [];
  let allGames: BoardGame[] = [];
  let lastPlayedGame: BoardGame | null = null;
  let lastPlayDetail: BggPlayDetail | null = null;

  try {
    const results = await Promise.allSettled([
      featuredGamesPromise,
      allGamesPromise,
      lastPlayedPromise
    ]);

    if (results[0].status === 'fulfilled' && results[0].value) {
      featuredGames = results[0].value;
    } else if (results[0].status === 'rejected') {
      console.error("Error fetching featured games:", results[0].reason);
    }

    if (results[1].status === 'fulfilled' && Array.isArray(results[1].value)) {
      allGames = results[1].value;
    } else if (results[1].status === 'rejected') {
      console.error("Error fetching all games:", results[1].reason);
    }
    
    if (results[2].status === 'fulfilled' && results[2].value && results[2].value.game && results[2].value.lastPlayDetail) {
      lastPlayedGame = results[2].value.game;
      lastPlayDetail = results[2].value.lastPlayDetail;
    } else if (results[2].status === 'rejected') {
       console.error("Error fetching last played game:", results[2].reason);
    }


  } catch (error) {
    console.error("Error fetching homepage data:", error);
  }
  
  const topRatedGames = allGames
    .filter(game => game.overallAverageRating !== null && game.overallAverageRating !== undefined && typeof game.overallAverageRating === 'number' && game.voteCount !== undefined && game.voteCount >= 0)
    .sort((a, b) => (b.overallAverageRating ?? -Infinity) - (a.overallAverageRating ?? -Infinity))
    .slice(0, 10);

  return (
    <div className="space-y-12">
      <section>
        <div className="mb-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-3">
            Benvenuto su Morchiometro!
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-6">
            Scopri, valuta e dai un voto ai tuoi giochi da tavolo preferiti.
          </p>
          <Button asChild size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground text-lg px-8 py-6 rounded-lg shadow-md hover:shadow-lg transition-all duration-300">
            <Link href="/rate-a-game/select-game">
              <Edit className="mr-2 h-5 w-5" />
              Valuta un Gioco
            </Link>
          </Button>
        </div>

        {featuredGames && featuredGames.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-6 text-left flex items-center gap-2">
              <Star className="h-7 w-7 text-primary" />
              In Evidenza
            </h2>
            <div className="flex space-x-4 overflow-x-auto pb-4 md:grid md:grid-cols-3 md:gap-4 md:space-x-0 md:pb-0 md:overflow-x-visible">
              {featuredGames.map((game, index) => (
                <div key={`featured-${game.id}`} className="w-40 flex-shrink-0 md:w-auto">
                  <GameCard
                    game={game}
                    variant="featured"
                    priority={index < 3}
                    showOverlayText={true}
                    featuredReason={game.featuredReason}
                  />
                </div>
              ))}
            </div>
            <Separator className="my-10" />
          </div>
        )}
        
        {lastPlayedGame && lastPlayDetail && (
          <div className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-6 text-left flex items-center gap-2">
              <Clock10 className="h-7 w-7 text-primary" />
              Ultima Partita Giocata
            </h2>
            <Card className="shadow-md border border-border rounded-lg overflow-hidden">
              <CardHeader className="bg-muted/30 p-3 flex flex-row items-start gap-3">
                <div className="relative h-16 w-12 sm:h-20 sm:w-16 flex-shrink-0 rounded-sm overflow-hidden shadow-sm">
                  <SafeImage
                    src={lastPlayedGame.coverArtUrl}
                    fallbackSrc={`https://placehold.co/64x80.png?text=${encodeURIComponent(lastPlayedGame.name?.substring(0,3) || 'N/A')}`}
                    alt={`${lastPlayedGame.name || 'Gioco'} copertina`}
                    fill
                    sizes="(max-width: 640px) 48px, 64px"
                    className="object-cover"
                    data-ai-hint={`board game ${lastPlayedGame.name?.split(' ')[0]?.toLowerCase() || 'mini'}`}
                  />
                </div>
                <div className="flex-1 flex justify-between items-start">
                  <div>
                      <CardTitle className="text-lg font-semibold text-foreground hover:text-primary hover:underline">
                      <Link href={`/games/${lastPlayedGame.id}`}>
                          {lastPlayedGame.name}
                      </Link>
                      </CardTitle>
                      <CardDescription className="text-xs text-muted-foreground mt-1">
                         {formatReviewDate(lastPlayDetail.date)}
                      </CardDescription>
                  </div>
                  {lastPlayedGame.overallAverageRating !== null && typeof lastPlayedGame.overallAverageRating === 'number' && (
                      <div className="text-right flex-shrink-0">
                      <span className="text-lg font-semibold text-primary">
                          {formatRatingNumber(lastPlayedGame.overallAverageRating * 2)}
                      </span>
                      </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0 text-sm space-y-1.5">
                  {lastPlayDetail.comments && lastPlayDetail.comments.trim() !== '' && (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-0.5">Commenti:</h4>
                      <p className="text-xs text-foreground/80 whitespace-pre-wrap">{lastPlayDetail.comments}</p>
                    </div>
                  )}
                  {lastPlayDetail.players && lastPlayDetail.players.length > 0 && (
                    <div>
                      <ul className="pl-1">
                        {lastPlayDetail.players
                          .slice()
                          .sort((a, b) => parseInt(b.score || "0", 10) - parseInt(a.score || "0", 10))
                          .map((player, pIndex) => (
                            <li key={pIndex} className={cn(`flex items-center justify-between text-xs border-b border-border last:border-b-0 py-0.5 px-2`, pIndex % 2 === 0 ? 'bg-muted/30' : '')}>
                              <div className="flex items-center gap-1.5 flex-grow min-w-0">
                                <UserCircle2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
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
                                <span className={cn("font-mono text-xs whitespace-nowrap ml-2", player.didWin ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
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
            <Separator className="my-10" />
          </div>
        )}

        {topRatedGames.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-6 text-left flex items-center gap-2">
              <TrendingUp className="h-7 w-7 text-primary" />
              Top 10
            </h2>
            <div className="space-y-4">
              {topRatedGames.map((game, index) => (
                <div
                  key={`top-rated-${game.id}`}
                  className="relative flex items-center gap-x-3 sm:gap-x-4 p-3 rounded-lg bg-card hover:bg-muted/50 transition-colors border border-border overflow-hidden"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute z-0 font-bold text-muted-foreground/10 pointer-events-none select-none leading-none top-1/2 -translate-y-1/2",
                      // Mobile
                      "text-[255px] -right-[30px]",
                      // Small screens
                      "sm:text-[300px] sm:-right-[30px]",
                      // Large screens
                      "lg:text-[340px] lg:-right-[36px]"
                    )}
                  >
                    {index + 1}
                  </span>
                  <div className={cn(
                      "relative z-10 flex items-center gap-x-3 sm:gap-x-4 flex-grow",
                      "mr-5 sm:mr-8 lg:mr-10" 
                    )}>
                    <div className="w-24 sm:w-28 md:w-32 flex-shrink-0">
                        <GameCard game={game} variant="featured" priority={index < 5} showOverlayText={false} />
                    </div>
                    <div className="flex-grow min-w-0 flex justify-between items-center">
                      <Link href={`/games/${game.id}`} className="group flex-1">
                        <h3 className="text-md sm:text-lg font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-3 hover:underline">
                          {game.name}
                          {game.yearPublished && (
                            <span className="ml-1 text-xs text-muted-foreground">({game.yearPublished})</span>
                          )}
                        </h3>
                      </Link>
                      <div className="text-right ml-2 flex-shrink-0">
                        {game.overallAverageRating !== null && typeof game.overallAverageRating === 'number' && (
                          <p className="text-xl sm:text-2xl font-bold text-primary">
                            {formatRatingNumber(game.overallAverageRating * 2)}
                          </p>
                        )}
                        {game.voteCount !== null && typeof game.voteCount === 'number' && (
                          <p className="text-xs text-muted-foreground">
                            {game.voteCount} {game.voteCount === 1 ? 'voto' : 'voti'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
             <Separator className="my-10" />
          </section>
        )}

        {(featuredGames.length === 0 && topRatedGames.length === 0 && !lastPlayedGame) && (
           <Alert variant="default" className="mt-8 bg-secondary/30 border-secondary">
              <Info className="h-4 w-4" />
              <AlertTitle>Catalogo in Costruzione!</AlertTitle>
              <AlertDescription>
                Non ci sono ancora giochi in evidenza, nella top 10, o partite registrate. Torna più tardi o inizia ad aggiungere giochi e voti tramite la sezione Admin!
              </AlertDescription>
            </Alert>
        )}
      </section>
    </div>
  );
}

export const revalidate = 3600;
    
