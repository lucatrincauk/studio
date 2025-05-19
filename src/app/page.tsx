
import { getAllGamesAction, getFeaturedGamesAction } from '@/lib/actions';
import { GameSearchList } from '@/components/boardgame/game-search-list';
import { GameCard } from '@/components/boardgame/game-card';
import { Separator } from '@/components/ui/separator';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

export default async function HomePage() {
  const allGames = await getAllGamesAction();
  const featuredGames = await getFeaturedGamesAction();

  return (
    <div className="space-y-12">
      <section>
        <div className="mb-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-2">
            Esplora i Tuoi Giochi da Tavolo Preferiti
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Scopri, valuta e recensisci un mondo di avventure da tavolo. Usa la ricerca qui sotto per trovare un gioco specifico.
          </p>
        </div>

        {featuredGames && featuredGames.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-6 text-left">
              In Evidenza
            </h2>
            <Carousel
              opts={{
                align: "start",
                loop: featuredGames.length > 1, // Loop only if more than one item
              }}
              className="w-full max-w-xs sm:max-w-md md:max-w-lg lg:max-w-xl mx-auto"
            >
              <CarouselContent>
                {featuredGames.map((game, index) => (
                  <CarouselItem key={game.id} className="basis-full">
                    <div className="p-1"> {/* Padding for CarouselItem content */}
                      <GameCard game={game} variant="featured" priority={index < 3} />
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              {featuredGames.length > 1 && (
                <>
                  <CarouselPrevious className="hidden sm:flex" />
                  <CarouselNext className="hidden sm:flex" />
                </>
              )}
            </Carousel>
            <Separator className="my-8" />
          </div>
        )}
        
        <GameSearchList initialGames={allGames} /> 
        
      </section>
    </div>
  );
}

export const revalidate = 3600; 
