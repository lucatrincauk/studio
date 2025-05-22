
import type { BadgeDefinition } from '@/lib/types';

export const ALL_BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    badgeId: "first_reviewer",
    name: "Primo Voto!",
    description: "Invia il tuo primo voto per un gioco.",
    iconName: "Award",
  },
  {
    badgeId: "rating_connoisseur_min",
    name: "Pignolo del Punteggio",
    description: "Assegna un '1' in una qualsiasi categoria di valutazione.",
    iconName: "MinusCircle",
  },
  {
    badgeId: "rating_enthusiast_max",
    name: "Fan Incondizionato",
    description: "Assegna un '5' in una qualsiasi categoria di valutazione.",
    iconName: "PlusCircle",
  },
  {
    badgeId: "prolific_reviewer_bronze",
    name: "Recensore Prolifico (Bronzo)",
    description: "Invia 5 voti.",
    iconName: "Edit3",
  },
  {
    badgeId: "prolific_reviewer_silver",
    name: "Recensore Prolifico (Argento)",
    description: "Invia 15 voti.",
    iconName: "FileText",
  },
  {
    badgeId: "prolific_reviewer_gold",
    name: "Recensore Prolifico (Oro)",
    description: "Invia 30 voti.",
    iconName: "BookOpenText",
  },
  {
    badgeId: "morchia_hunter_5",
    name: "Cacciatore di Morchie",
    description: "Contrassegna 5 giochi come 'morchia'.",
    iconName: "Trash2",
  },
  // Add other future badge definitions here
];
