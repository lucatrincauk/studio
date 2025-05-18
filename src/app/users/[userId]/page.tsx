
import { getUserDetailsAndReviewsAction } from '@/lib/actions';
import type { AugmentedReview } from '@/lib/types';
import { ReviewItem } from '@/components/boardgame/review-item';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageSquareText, AlertCircle, Gamepad2, UserCircle2 } from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { SafeImage } from '@/components/common/SafeImage';

interface UserDetailPageProps {
  params: {
    userId: string;
  };
}

export default async function UserDetailPage({ params }: UserDetailPageProps) {
  const { userId } = params;
  const { user, reviews } = await getUserDetailsAndReviewsAction(userId);

  if (!user) {
    return (
      <Alert variant="destructive" className="max-w-md mx-auto my-10">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Utente Non Trovato</AlertTitle>
        <AlertDescription>L'utente che cerchi non è stato trovato.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      <Card className="shadow-lg border border-border rounded-lg">
        <CardHeader className="flex flex-col items-center text-center space-y-4">
          <Avatar className="h-28 w-28 border-4 border-primary/50">
            {user.photoURL && <AvatarImage src={user.photoURL} alt={user.name} />}
            <AvatarFallback className="text-4xl bg-muted text-muted-foreground">
              {user.name ? user.name.substring(0, 1).toUpperCase() : <UserCircle2 className="h-16 w-16"/>}
            </AvatarFallback>
          </Avatar>
          <CardTitle className="text-3xl sm:text-4xl font-bold text-foreground">
            {user.name}
          </CardTitle>
          <CardDescription className="text-lg text-muted-foreground">
            {reviews.length} {reviews.length === 1 ? 'Recensione Inviata' : 'Recensioni Inviate'}
          </CardDescription>
        </CardHeader>
      </Card>

      <Separator />

      <div>
        <h2 className="text-2xl font-semibold mb-6 text-foreground flex items-center gap-3">
          <MessageSquareText className="h-6 w-6 text-primary" />
          Recensioni di {user.name}
        </h2>
        {reviews.length === 0 ? (
          <Alert variant="default" className="bg-secondary/30 border-secondary">
            <Gamepad2 className="h-4 w-4" />
            <AlertTitle>Nessuna Recensione Ancora</AlertTitle>
            <AlertDescription>
              {user.name} non ha ancora inviato recensioni.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            {reviews.map((review) => {
              const fallbackGameHeaderSrc = `https://placehold.co/80x120.png?text=${encodeURIComponent(review.gameName?.substring(0,10) || 'N/A')}`;
              return (
                <Card key={review.id} className="overflow-hidden shadow-md border border-border rounded-lg">
                  <CardHeader className="bg-muted/30 p-3 flex flex-row items-center gap-3">
                    <Link href={`/games/${review.gameId}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity w-full">
                      <div className="relative h-16 w-12 flex-shrink-0 rounded-sm overflow-hidden shadow-sm">
                         <SafeImage
                          src={review.gameCoverArtUrl}
                          fallbackSrc={fallbackGameHeaderSrc}
                          alt={`${review.gameName || 'Gioco'} copertina`}
                          fill
                          sizes="48px"
                          className="object-cover"
                          data-ai-hint={`board game ${review.gameName?.split(' ')[0]?.toLowerCase() || 'mini'}`}
                        />
                      </div>
                      <div className="flex-grow">
                        <h3 className="text-md font-semibold text-primary leading-tight">
                          {review.gameName}
                        </h3>
                         <p className="text-xs text-muted-foreground">Vedi Gioco e Recensione Completa</p>
                      </div>
                    </Link>
                  </CardHeader>
                  <CardContent className="p-4">
                    <ReviewItem review={review} />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export const revalidate = 3600; // Revalidate every hour or on demand
