
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
  reason: z.string().describe('The AI\'s reason for recommending this game, in Italian.'),
});
export type RecommendedGame = z.infer<typeof RecommendedGameSchema>;

const RecommendGamesOutputSchema = z.object({
  recommendations: z.array(RecommendedGameSchema).describe('An array of recommended games, each with an ID, name, and reason, in Italian.'),
});
export type RecommendGamesOutput = z.infer<typeof RecommendGamesOutputSchema>;

export async function recommendGames(input: RecommendGamesInput): Promise<RecommendGamesOutput> {
  return recommendGamesFlow(input);
}

// Define a schema for the LLM's direct output (before we map names to IDs)
const LLMRecommendationOutputSchema = z.object({
    llmRecommendations: z.array(z.object({
        name: z.string().describe("The name of the recommended board game from the provided catalog."),
        reason: z.string().describe("A brief 1-2 sentence explanation **in Italian** for why this game is recommended, based on potential similarities to the reference game (theme, mechanics, complexity, feel).")
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
  prompt: `Sei un esperto appassionato di giochi da tavolo che funge da motore di raccomandazione.
Dato un gioco da tavolo di riferimento che piace a un utente ("{{{referenceGameName}}}") e un elenco di altri giochi disponibili nel nostro catalogo, il tuo compito è consigliare da 3 a 4 giochi diversi dal catalogo che potrebbero piacere anche all'utente.

Gioco di Riferimento: {{{referenceGameName}}}

Giochi Disponibili nel Catalogo (consiglia solo da questo elenco e non consigliare il gioco di riferimento stesso):
{{#each candidateGameNames}}
- {{{this}}}
{{/each}}

Per ogni gioco che consigli, fornisci per favore:
1. Il nome esatto del gioco come appare nell'elenco "Giochi Disponibili nel Catalogo".
2. Una breve spiegazione (1-2 frasi) **in italiano** del motivo della tua raccomandazione, evidenziando potenziali somiglianze di tema, meccaniche, complessità o sensazione generale rispetto al gioco di riferimento.

Struttura il tuo output come un elenco di raccomandazioni.
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
