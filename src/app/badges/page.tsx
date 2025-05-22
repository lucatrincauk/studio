
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import type { EarnedBadge, LucideIconName } from '@/lib/types';
import { ALL_BADGE_DEFINITIONS } from '@/data/badge-definitions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Award, Edit3, FileText, BookOpenText, Trash2, Medal, MinusCircle, PlusCircle, Sparkles, ClipboardCheck, Moon, Compass, HeartPulse, ListMusic, CheckCircle2, Loader2, type LucideIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';

const iconMap: Record<LucideIconName, LucideIcon> = {
  Award,
  Edit3,
  FileText,
  BookOpenText,
  Trash2,
  Medal,
  MinusCircle,
  PlusCircle,
  Sparkles,
  ClipboardCheck,
  Moon,
  Compass,
  HeartPulse,
  ListMusic,
};

export default function AllBadgesPage() {
  const { user: currentUser, loading: authLoading } = useAuth();
  const [earnedBadgeIds, setEarnedBadgeIds] = useState<Set<string>>(new Set());
  const [isLoadingEarnedBadges, setIsLoadingEarnedBadges] = useState(true);

  useEffect(() => {
    if (currentUser && !authLoading) {
      const fetchEarnedBadges = async () => {
        setIsLoadingEarnedBadges(true);
        try {
          const badgesCollectionRef = collection(db, 'user_profiles', currentUser.uid, 'earned_badges');
          const q = query(badgesCollectionRef);
          const badgesSnapshot = await getDocs(q);
          const ids = new Set<string>();
          badgesSnapshot.forEach(doc => ids.add(doc.id));
          setEarnedBadgeIds(ids);
        } catch (error) {
          console.error("Error fetching earned badges:", error);
        } finally {
          setIsLoadingEarnedBadges(false);
        }
      };
      fetchEarnedBadges();
    } else if (!authLoading) {
      // User is not logged in, or auth is still loading
      setIsLoadingEarnedBadges(false);
      setEarnedBadgeIds(new Set());
    }
  }, [currentUser, authLoading]);

  if (authLoading || isLoadingEarnedBadges) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">Caricamento distintivi...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Card className="shadow-lg border border-border rounded-lg">
        <CardHeader>
          <CardTitle className="text-2xl sm:text-3xl flex items-center gap-3">
            <Award className="h-7 w-7 text-primary" />
            Elenco Distintivi
          </CardTitle>
          <CardDescription>
            Scopri tutti i distintivi che puoi guadagnare su Morchiometro e come ottenerli. I distintivi che hai già ottenuto sono evidenziati.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {ALL_BADGE_DEFINITIONS.length === 0 ? (
            <p className="text-muted-foreground">Nessun distintivo definito al momento.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {ALL_BADGE_DEFINITIONS.map((badgeDef) => {
                const IconComponent = iconMap[badgeDef.iconName] || Award;
                const isEarned = earnedBadgeIds.has(badgeDef.badgeId);
                return (
                  <Card
                    key={badgeDef.badgeId}
                    className={cn(
                      "flex flex-col overflow-hidden shadow-md hover:shadow-lg transition-shadow rounded-lg border",
                      isEarned ? "border-primary/70 bg-primary/5" : "border-border"
                    )}
                  >
                    <CardHeader className={cn(
                      "flex flex-row items-center gap-4 p-4",
                      isEarned ? "bg-primary/10" : "bg-muted/30"
                    )}>
                      <IconComponent className={cn("h-10 w-10 flex-shrink-0", isEarned ? "text-primary" : "text-primary/80")} />
                      <div className="flex-1">
                        <CardTitle className="text-lg font-semibold leading-tight">{badgeDef.name}</CardTitle>
                        {isEarned && (
                           <span className="text-xs font-medium text-primary flex items-center mt-1">
                             <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Ottenuto!
                           </span>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 flex-grow">
                      <p className="text-sm text-muted-foreground">{badgeDef.description}</p>
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
