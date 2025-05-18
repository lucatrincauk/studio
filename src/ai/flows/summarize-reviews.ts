
'use server';

/**
 * @fileOverview A flow to summarize review ratings for a board game.
 *
 * - summarizeReviews - A function that summarizes review ratings for a board game.
 * - SummarizeReviewsInput - The input type for the summarizeReviews function.
 * - SummarizeReviewsOutput - The return type for the summarizeReviews function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { reviewFormSchema } from '@/lib/validators'; // Import the schema for individual ratings

const SummarizeReviewsInputSchema = z.object({
  gameName: z.string().describe('The name of the board game.'),
  ratings: z.array(reviewFormSchema).describe('An array of player rating objects for the board game.'),
});

export type SummarizeReviewsInput = z.infer<typeof SummarizeReviewsInputSchema>;

const SummarizeReviewsOutputSchema = z.object({
  summary: z.string().describe('A summary of the review ratings for the board game.'),
});

export type SummarizeReviewsOutput = z.infer<typeof SummarizeReviewsOutputSchema>;

export async function summarizeReviews(input: SummarizeReviewsInput): Promise<SummarizeReviewsOutput> {
  return summarizeReviewsFlow(input);
}

const summarizeReviewsPrompt = ai.definePrompt({
  name: 'summarizeReviewsRatingsPrompt', // Renamed for clarity
  input: {schema: SummarizeReviewsInputSchema},
  output: {schema: SummarizeReviewsOutputSchema},
  prompt: `Summarize the following player ratings for the board game "{{{gameName}}}".
Each player provides ratings on a 1-5 scale for several aspects of the game.
Identify common strengths, weaknesses, and overall sentiment based on these numerical ratings.

Player Ratings (1-5 scale for each category):
{{#each ratings}}
  - Excited to Replay: {{this.excitedToReplay}}
  - Mentally Stimulating: {{this.mentallyStimulating}}
  - Fun Factor: {{this.fun}}
  - Decision Depth: {{this.decisionDepth}}
  - Replayability: {{this.replayability}}
  - Luck Factor: {{this.luck}}
  - Game Length & Downtime: {{this.lengthDowntime}}
  - Graphic Design: {{this.graphicDesign}}
  - Components, Theme & Lore: {{this.componentsThemeLore}}
  - Effort to Learn: {{this.effortToLearn}}
  - Setup & Teardown: {{this.setupTeardown}}
---
{{/each}}

Provide a narrative summary based on these ratings. Highlight aspects that are consistently rated high or low, and any notable patterns.
`,
});

const summarizeReviewsFlow = ai.defineFlow(
  {
    name: 'summarizeReviewsRatingsFlow', // Renamed for clarity
    inputSchema: SummarizeReviewsInputSchema,
    outputSchema: SummarizeReviewsOutputSchema,
  },
  async input => {
    if (!input.ratings || input.ratings.length === 0) {
      return { summary: "Not enough rating data to generate a summary." };
    }
    const {output} = await summarizeReviewsPrompt(input);
    return output!;
  }
);
