
import type { BadgeDefinition } from '@/lib/types';

export const ALL_BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    badgeId: "welcome_explorer",
    name: "Esploratore di Punteggi",
    description: "Benvenuto! Hai creato il tuo account e sei pronto a esplorare e valutare.",
    iconName: "Compass",
  },
  {
    badgeId: "first_reviewer",
    name: "Primo Voto!",
    description: "Hai inviato il tuo primo voto per un gioco!",
    iconName: "Award",
  },
  {
    badgeId: "rating_pioneer",
    name: "Pioniere dei Voti",
    description: "Sii il primo a inviare un voto per un gioco!",
    iconName: "Sparkles",
  },
  {
    badgeId: "rating_connoisseur_min",
    name: "Pignolo del Punteggio",
    description: "Hai assegnato il tuo primo '1'. L'onestà prima di tutto!",
    iconName: "MinusCircle",
  },
  {
    badgeId: "rating_enthusiast_max",
    name: "Fan Incondizionato",
    description: "Hai assegnato il tuo primo '10'. Adorazione pura!",
    iconName: "PlusCircle",
  },
  {
    badgeId: "comprehensive_critic",
    name: "Critico Completo",
    description: "Hai inviato un voto utilizzando almeno tre valori diversi sulla scala!",
    iconName: "ClipboardCheck",
  },
  {
    badgeId: "night_owl_reviewer",
    name: "Recensore Notturno",
    description: "Hai inviato un voto tra mezzanotte e le 5 del mattino!",
    iconName: "Moon",
  },
  {
    badgeId: "prolific_reviewer_bronze",
    name: "Recensore Prolifico (Bronzo)",
    description: "Hai inviato 5 voti.",
    iconName: "Edit3",
  },
  {
    badgeId: "prolific_reviewer_silver",
    name: "Recensore Prolifico (Argento)",
    description: "Hai inviato 15 voti.",
    iconName: "FileText",
  },
  {
    badgeId: "prolific_reviewer_gold",
    name: "Recensore Prolifico (Oro)",
    description: "Hai inviato 30 voti.",
    iconName: "BookOpenText",
  },
  {
    badgeId: "favorite_fanatic_5",
    name: "Collezionista di Cuori",
    description: "Hai aggiunto 5 giochi ai tuoi preferiti!",
    iconName: "HeartPulse",
  },
  {
    badgeId: "playlist_pro_5",
    name: "Maestro di Playlist",
    description: "Hai aggiunto 5 giochi alla tua playlist!",
    iconName: "ListMusic",
  },
  {
    badgeId: "morchia_hunter_5",
    name: "Cacciatore di Morchie",
    description: "Hai contrassegnato 5 giochi come \"morchia\"!",
    iconName: "Trash2",
  }
];
