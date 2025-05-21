
import { getFeaturedGamesAction, getAllGamesAction, getLastPlayedGameAction } from '@/lib/actions'; 
import { GameCard } from '@/components/boardgame/game-card';
import { Separator } from '@/components/ui/separator';
import type { BoardGame, BggPlayDetail } from '@/lib/types';
import { Star, Edit, TrendingUp, Library, AlertCircle, Info, BarChart3, Clock, Pin, Dices, UserCircle2, Sparkles, Trophy } from 'lucide-react'; 
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { formatRatingNumber, formatReviewDate } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';


export default async function HomePage() {
  const featuredGamesPromise = getFeaturedGamesAction();
  const allGamesPromise = getAllGamesAction();
  
  let lastPlayedData: { game: BoardGame | null, lastPlayDetail: BggPlayDetail | null } = { game: null, lastPlayDetail: null };
  try {
    lastPlayedData = await getLastPlayedGameAction("lctr01");
  } catch (e) {
    // lastPlayedData remains null, and the UI will handle its absence
  }

  const [featuredGamesResult, allGamesResult] = await Promise.all([
    featuredGamesPromise, 
    allGamesPromise,
  ]);

  const featuredGames = Array.isArray(featuredGamesResult) ? featuredGamesResult : [];
  const allGames = Array.isArray(allGamesResult) ? allGamesResult : [];
  const lastPlayedGame = lastPlayedData.game;
  const lastPlayDetail = lastPlayedData.lastPlayDetail;

  const topRatedGames = allGames 
    .filter(game => game.overallAverageRating !== null && game.overallAverageRating !== undefined)
    .sort((a, b) => (b.overallAverageRating ?? 0) - (a.overallAverageRating ?? 0))
    .slice(0, 10);

  return (
    <div className="space-y-12">
      <section>
        <div className="mb-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-3">
            Benvenuto su Morchiometro!
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-6">
            Scopri, valuta e recensisci un mondo di avventure da tavolo.
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
                <div key={game.id} className="w-40 flex-shrink-0 md:w-auto">
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
              <Dices className="h-7 w-7 text-primary" />
              Ultima Partita Giocata
            </h2>
            <div className="flex flex-col md:flex-row gap-4 md:gap-6 items-start">
              <div className="w-full max-w-[160px] sm:max-w-none sm:w-1/3 md:w-1/4 flex-shrink-0">
                <GameCard
                  game={lastPlayedGame}
                  variant="featured"
                  priority={true}
                  showOverlayText={true} 
                />
              </div>
              <div className="flex-1 space-y-1.5 p-1 md:p-0 text-sm">
                <div className="flex justify-between items-baseline text-xs text-muted-foreground">
                   <span>{formatReviewDate(lastPlayDetail.date)}</span>
                   {lastPlayDetail.quantity > 1 && <span>{lastPlayDetail.quantity} partite</span>}
                </div>
                {lastPlayDetail.location && (
                   <p className="text-xs text-muted-foreground"><strong>Luogo:</strong> {lastPlayDetail.location}</p>
                )}
                {lastPlayDetail.comments && lastPlayDetail.comments.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-0.5">Commenti:</h4>
                    <p className="text-xs text-foreground/80 whitespace-pre-wrap">{lastPlayDetail.comments}</p>
                  </div>
                )}
                {lastPlayDetail.players && lastPlayDetail.players.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-1">Giocatori:</h4>
                    <ul className="space-y-0.5">
                      {lastPlayDetail.players
                        .slice()
                        .sort((a, b) => parseInt(b.score || "0", 10) - parseInt(a.score || "0", 10))
                        .map((player, pIndex) => (
                        <li key={pIndex} className={`flex items-center justify-between text-xs py-0.5 border-b border-border last:border-b-0 ${pIndex % 2 === 0 ? 'bg-muted/30' : ''} px-1 rounded-sm`}>
                          <div className="flex items-center gap-1.5 flex-grow min-w-0">
                            <UserCircle2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
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
                            <span className={`font-mono text-xs whitespace-nowrap ml-2 ${player.didWin ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                              {player.score} pt.
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
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
                  key={game.id} 
                  className="relative flex items-center gap-x-3 sm:gap-x-4 p-3 rounded-lg bg-[#f9fbf9] hover:bg-muted/50 transition-colors border border-border overflow-hidden"
                >
                  <span 
                    aria-hidden="true"
                    className="absolute pointer-events-none select-none leading-none z-0 font-bold text-muted-foreground/10
                               text-[255px] -bottom-[55px] -right-[30px] 
                               sm:text-[300px] sm:-bottom-[65px] sm:-right-[30px] 
                               lg:text-[340px] lg:-bottom-[75px] lg:-right-[36px]"
                  >
                    {index + 1}
                  </span>
                  <div className="relative z-10 flex items-center gap-x-3 sm:gap-x-4 flex-grow mr-5 sm:mr-8 lg:mr-10">
                    <div className="w-24 h-32 sm:w-28 sm:h-36 md:w-32 md:h-40 flex-shrink-0"> 
                      <GameCard game={game} variant="featured" priority={index < 5} showOverlayText={false} />
                    </div>
                    <div className="flex-grow min-w-0 flex justify-between items-center">
                      <Link href={`/games/${game.id}`} className="group flex-1">
                        <h3 className="text-md sm:text-lg font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-3 hover:underline">
                          {game.name}
                        </h3>
                        {game.yearPublished && (
                          <p className="text-xs sm:text-sm text-muted-foreground">
                            ({game.yearPublished})
                          </p>
                        )}
                      </Link>
                      <div className="text-right ml-2 flex-shrink-0">
                        {game.overallAverageRating !== null && typeof game.overallAverageRating === 'number' && (
                          <p className="text-xl sm:text-2xl font-bold text-primary">
                            {formatRatingNumber(game.overallAverageRating * 2)}
                          </p>
                        )}
                        {game.reviewCount !== null && typeof game.reviewCount === 'number' && (
                          <p className="text-xs text-muted-foreground">
                            {game.reviewCount} {game.reviewCount === 1 ? 'recensione' : 'recensioni'}
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
                Non ci sono ancora giochi in evidenza, nella top 10, o partite registrate. Torna più tardi o inizia ad aggiungere giochi e valutazioni tramite la sezione Admin!
              </AlertDescription>
            </Alert>
        )}

      </section>
    </div>
  );
}

export const revalidate = 3600;

