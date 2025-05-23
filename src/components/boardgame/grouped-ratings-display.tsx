
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

  const getResponsiveSectionTitle = (title: string) => {
    switch (title) {
      case "Design del Gioco":
        return <><span className="md:hidden">Design</span><span className="hidden md:inline">Design del Gioco</span></>;
      case "Estetica e Immersione":
        return <><span className="md:hidden">Estetica</span><span className="hidden md:inline">Estetica e Immersione</span></>;
      case "Apprendimento e Logistica":
        return <><span className="md:hidden">Logistica</span><span className="hidden md:inline">Apprendimento e Logistica</span></>;
      default:
        return title;
    }
  };

  return (
    <Accordion type="multiple" defaultValue={defaultOpenSections} className="w-full">
      {groupedAverages.map((section, index) => {
        const IconComponent = section.iconName ? iconMap[section.iconName] : null;
        return (
          <AccordionItem
            value={`section-${index}`}
            key={section.sectionTitle}
            className={cn(index === groupedAverages.length - 1 ? "border-b-0" : "border-b")}
          >
            <AccordionTrigger className="hover:no-underline text-left py-3">
              <div className="flex justify-between w-full items-center pr-2 gap-2">
                <div className="flex items-center flex-grow min-w-0">
                    {IconComponent && <IconComponent className="h-5 w-5 text-primary mr-2 flex-shrink-0" />}
                    <span className="font-medium text-sm md:text-md text-foreground truncate">
                      {getResponsiveSectionTitle(section.sectionTitle)}
                    </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 w-24">
                  <Progress value={(section.sectionAverage / 10) * 100} className="w-full h-2.5" />
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-2 pt-1">
              <ul className="space-y-1 pl-2 pt-2">
                {section.subRatings.map((sub, subIndex) => (
                  <li
                    key={sub.name}
                    className={cn(
                      "flex justify-between items-center text-sm py-1.5",
                      subIndex < section.subRatings.length - 1 ? "border-b border-border last:border-b-0" : ""
                    )}
                  >
                    <span className="text-muted-foreground">{sub.name}:</span>
                    <span className="font-medium text-foreground">{formatRatingNumber(sub.average)} / 10</span>
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
