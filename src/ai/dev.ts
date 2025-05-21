import { config } from 'dotenv';
config();

import '@/ai/flows/summarize-reviews.ts';
import '@/ai/flows/recommend-games.ts'; // Added import for the new flow
