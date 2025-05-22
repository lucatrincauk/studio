
import { ALL_BADGE_DEFINITIONS } from '@/data/badge-definitions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Award, Edit3, FileText, BookOpenText, Trash2, Medal, MinusCircle, PlusCircle, Sparkles, ClipboardCheck, Moon, Compass, HeartPulse, ListMusic, type LucideIcon
} from 'lucide-react';
import type { LucideIconName } from '@/lib/types';
import { Separator } from '@/components/ui/separator';

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
  return (
    <div className="space-y-8">
      <Card className="shadow-lg border border-border rounded-lg">
        <CardHeader>
          <CardTitle className="text-2xl sm:text-3xl flex items-center gap-3">
            <Award className="h-7 w-7 text-primary" />
            Elenco Distintivi
          </CardTitle>
          <CardDescription>
            Scopri tutti i distintivi che puoi guadagnare su Morchiometro e come ottenerli.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {ALL_BADGE_DEFINITIONS.length === 0 ? (
            <p className="text-muted-foreground">Nessun distintivo definito al momento.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {ALL_BADGE_DEFINITIONS.map((badge) => {
                const IconComponent = iconMap[badge.iconName] || Award; // Default to Award icon if not found
                return (
                  <Card key={badge.badgeId} className="flex flex-col overflow-hidden shadow-md hover:shadow-lg transition-shadow rounded-lg border border-border">
                    <CardHeader className="flex flex-row items-center gap-4 p-4 bg-muted/30">
                      <IconComponent className="h-10 w-10 text-primary flex-shrink-0" />
                      <CardTitle className="text-lg font-semibold leading-tight">{badge.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 flex-grow">
                      <p className="text-sm text-muted-foreground">{badge.description}</p>
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

export const revalidate = 3600 * 24; // Revalidate once a day
