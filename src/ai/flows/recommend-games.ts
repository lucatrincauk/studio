
'use server';
/**
 * @fileOverview An AI flow to recommend board games.
 *
 * - recommendGames - A function that recommends games based on a reference game and a catalog.
 * - RecommendGamesInput - The input type for the recommendGames function.
 * - RecommendGamesOutput - The return type for the recommendGames function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const CatalogGameSchema = z.object({
  id: z.string().describe('The Firestore ID of the game.'),
  name: z.string().describe('The name of the game.'),
});
export type CatalogGame = z.infer<typeof CatalogGameSchema>;

const RecommendGamesInputSchema = z.object({
  referenceGameName: z.string().describe('The name of the game the user likes or is viewing.'),
  catalogGames: z.array(CatalogGameSchema).describe('A list of all available games in the catalog with their IDs and names.'),
});
export type RecommendGamesInput = z.infer<typeof RecommendGamesInputSchema>;

const RecommendedGameSchema = z.object({
  id: z.string().describe('The Firestore ID of the recommended game.'),
  name: z.string().describe('The name of the recommended game.'),
  reason: z.string().describe('The AI\'s reason for recommending this game.'),
});
export type RecommendedGame = z.infer<typeof RecommendedGameSchema>;

const RecommendGamesOutputSchema = z.object({
  recommendations: z.array(RecommendedGameSchema).describe('An array of recommended games, each with an ID, name, and reason.'),
});
export type RecommendGamesOutput = z.infer<typeof RecommendGamesOutputSchema>;

export async function recommendGames(input: RecommendGamesInput): Promise<RecommendGamesOutput> {
  return recommendGamesFlow(input);
}

// Define a schema for the LLM's direct output (before we map names to IDs)
const LLMRecommendationOutputSchema = z.object({
    llmRecommendations: z.array(z.object({
        name: z.string().describe("The name of the recommended board game from the provided catalog."),
        reason: z.string().describe("A brief 1-2 sentence explanation for why this game is recommended, based on potential similarities to the reference game (theme, mechanics, complexity, feel).")
    })).describe("A list of 3-4 recommended board games. Ensure recommendations are diverse if possible.")
});


const recommendGamesPrompt = ai.definePrompt({
  name: 'recommendGamesPrompt',
  input: { schema: z.object({
      referenceGameName: RecommendGamesInputSchema.shape.referenceGameName,
      candidateGameNames: z.array(z.string()).describe("A list of candidate game names from the catalog, excluding the reference game.")
    })
  },
  output: { schema: LLMRecommendationOutputSchema },
  prompt: `You are a knowledgeable board game enthusiast acting as a recommendation engine.
Given a reference board game that a user likes ("{{{referenceGameName}}}") and a list of other available games in our catalog, your task is to recommend 3 to 4 different games from the catalog that the user might also enjoy.

Reference Game: {{{referenceGameName}}}

Available Games in Catalog (only recommend from this list, and do not recommend the reference game itself):
{{#each candidateGameNames}}
- {{{this}}}
{{/each}}

For each game you recommend, please provide:
1. The exact name of the game as it appears in the "Available Games in Catalog" list.
2. A brief (1-2 sentence) reason for your recommendation, highlighting potential similarities in theme, mechanics, complexity, or overall feel to the reference game.

Structure your output as a list of recommendations.
`,
});

const recommendGamesFlow = ai.defineFlow(
  {
    name: 'recommendGamesFlow',
    inputSchema: RecommendGamesInputSchema,
    outputSchema: RecommendGamesOutputSchema,
  },
  async (input) => {
    const { referenceGameName, catalogGames } = input;

    // Filter out the reference game from the catalog to create candidate games
    const candidateGames = catalogGames.filter(game => game.name.toLowerCase() !== referenceGameName.toLowerCase());
    const candidateGameNames = candidateGames.map(game => game.name);

    if (candidateGameNames.length === 0) {
      return { recommendations: [] }; // Not enough other games to make a recommendation
    }

    const llmInput = {
        referenceGameName,
        candidateGameNames
    };

    const { output } = await recommendGamesPrompt(llmInput);
    const llmRecommendations = output?.llmRecommendations || [];

    // Map LLM recommended names back to game IDs from the catalog
    const finalRecommendations: RecommendedGame[] = [];
    for (const rec of llmRecommendations) {
      const foundGame = catalogGames.find(game => game.name.toLowerCase() === rec.name.toLowerCase());
      if (foundGame) {
        finalRecommendations.push({
          id: foundGame.id,
          name: foundGame.name, // Use the exact name from catalog for consistency
          reason: rec.reason,
        });
      }
    }

    return { recommendations: finalRecommendations.slice(0, 4) }; // Limit to max 4 recommendations
  }
);
