
'use client';

import type { GroupedCategoryAverages, SectionAverage, SubRatingAverage } from '@/lib/types'; // Assuming GroupedCategoryAverages is in types
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Progress } from '@/components/ui/progress';
import { formatRatingNumber } from '@/lib/utils';
import { Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface GroupedRatingsDisplayProps {
  groupedAverages: GroupedCategoryAverages | null;
  isLoading?: boolean;
  noRatingsMessage?: string;
  defaultOpenSections?: string[]; // e.g., ["section-0", "section-1"] to open first two by default
}

export function GroupedRatingsDisplay({
  groupedAverages,
  isLoading = false,
  noRatingsMessage = "No ratings data available.",
  defaultOpenSections = [],
}: GroupedRatingsDisplayProps) {
  if (isLoading) {
    // Optional: Add a skeleton loader here if desired
    return <p className="text-muted-foreground">Loading ratings...</p>;
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
      {groupedAverages.map((section, index) => (
        <AccordionItem value={`section-${index}`} key={section.sectionTitle}>
          <AccordionTrigger className="hover:no-underline text-left py-3">
            <div className="flex justify-between w-full items-center pr-2 gap-4">
              <span className="font-medium text-md text-foreground flex-grow">{section.sectionTitle}</span>
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
      ))}
    </Accordion>
  );
}
