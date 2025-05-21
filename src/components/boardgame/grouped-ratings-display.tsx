
'use client';

import type { GroupedCategoryAverages } from '@/lib/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Progress } from '@/components/ui/progress';
import { formatRatingNumber } from '@/lib/utils';
import { Info, Smile, Puzzle, Palette, ClipboardList, type LucideIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import React from 'react';
import { cn } from '@/lib/utils';

interface GroupedRatingsDisplayProps {
  groupedAverages: GroupedCategoryAverages | null;
  isLoading?: boolean;
  noRatingsMessage?: string;
  defaultOpenSections?: string[];
}

const iconMap: Record<string, LucideIcon> = {
  Smile: Smile,
  Puzzle: Puzzle,
  Palette: Palette,
  ClipboardList: ClipboardList,
};

export function GroupedRatingsDisplay({
  groupedAverages,
  isLoading = false,
  noRatingsMessage = "Nessun dato di valutazione disponibile.",
  defaultOpenSections = [],
}: GroupedRatingsDisplayProps) {
  if (isLoading) {
    return <p className="text-muted-foreground">Caricamento valutazioni...</p>;
  }

  if (!groupedAverages || groupedAverages.length === 0) {
    return (
        <Alert variant="default" className="bg-secondary/30 border-secondary">
            <Info className="h-4 w-4" />
            <AlertDescription>
                {noRatingsMessage}
            </AlertDescription>
        </Alert>
    );
  }

  return (
    <Accordion type="multiple" defaultValue={defaultOpenSections} className="w-full">
      {groupedAverages.map((section, index) => {
        const IconComponent = section.iconName ? iconMap[section.iconName] : null;
        return (
          <AccordionItem 
            value={`section-${index}`} 
            key={section.sectionTitle}
            className={cn(index === groupedAverages.length - 1 ? "" : "border-b")}
          >
            <AccordionTrigger className="hover:no-underline text-left py-3">
              <div className="flex justify-between w-full items-center pr-2 gap-2">
                <div className="flex items-center flex-grow min-w-0">
                    {IconComponent && <IconComponent className="h-5 w-5 text-primary mr-2 flex-shrink-0" />}
                    <span className="font-medium text-md text-foreground truncate">{section.sectionTitle}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 w-24">
                  <Progress value={(section.sectionAverage / 5) * 100} className="w-full h-2.5" />
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-2 pt-1">
              <ul className="space-y-2 pl-2 pt-2">
                {section.subRatings.map(sub => (
                  <li key={sub.name} className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">{sub.name}:</span>
                    <span className="font-medium text-foreground">{formatRatingNumber(sub.average)} / 5</span>
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
