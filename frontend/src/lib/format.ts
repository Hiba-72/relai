import type {
  EquipementEtat,
  EquipementType,
  Etage,
  Role,
  TicketNature,
  TicketPriorite,
  TicketProbleme,
  TicketStatut,
} from "@/types";

export const STATUT_LABEL: Record<TicketStatut, string> = {
  nouveau: "Nouveau",
  en_cours: "En cours",
  resolu: "Résolu",
  cloture: "Clôturé",
  annule: "Annulé",
};

export const NATURE_LABEL: Record<TicketNature, string> = {
  technique: "Technique",
  metier: "Métier",
  assistance: "Assistance",
  maintenance: "Maintenance",
};

export const PRIORITE_LABEL: Record<TicketPriorite, string> = {
  urgent: "Urgent",
  normal: "Normal",
  faible: "Faible",
};

export const PROBLEME_LABEL: Record<TicketProbleme, string> = {
  equipement_panne: "Un équipement est en panne",
  reseau_absent: "Pas de réseau / internet",
  logiciel_bloque: "Application bloquée ou lente",
  impression: "Problème d'impression",
  installation: "Demande d'installation / d'accès",
  autre: "Autre",
};

export const CRITICITE_LABEL: Record<number, string> = {
  0: "Non-clinique",
  1: "Standard",
  2: "Sensible",
  3: "Critique (Urgences / Réa)",
};

export const TYPE_LABEL: Record<EquipementType, string> = {
  pc: "PC",
  ecran: "Écran",
  imprimante: "Imprimante",
  scanner: "Scanner",
  switch: "Switch",
  routeur: "Routeur",
  onduleur: "Onduleur",
  telephone: "Téléphone",
  serveur: "Serveur",
  autre: "Autre",
};

// Human-friendly labels for the equipement_history `field` column.
export const FIELD_LABEL: Record<string, string> = {
  reference: "Référence",
  n_serie: "N° de série",
  code_barre: "Code-barres",
  inventaire: "Inventaire",
  type: "Type",
  marque: "Marque",
  modele: "Modèle",
  service_id: "Service",
  poste_id: "Poste",
  etat: "État",
  notes: "Notes",
};

export const ETAT_LABEL: Record<EquipementEtat, string> = {
  operationnel: "Opérationnel",
  en_panne: "En panne",
  en_maintenance: "En maintenance",
  reforme: "Réformé",
};

export const ETAGE_LABEL: Record<Etage, string> = {
  sous_sol: "Sous-sol",
  rdc: "RDC",
  etage_1: "1er étage",
  etage_2: "2e étage",
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  informaticien: "Informaticien",
  demandeur: "Demandeur",
};

export function statutBadgeVariant(
  s: TicketStatut,
): "default" | "secondary" | "destructive" | "outline" | "muted" | "success" {
  switch (s) {
    case "nouveau":
      return "success"; // green — fresh, demands attention
    case "en_cours":
      return "secondary"; // beige neutral
    case "resolu":
      return "outline";
    case "cloture":
      return "muted";
    case "annule":
      return "destructive";
  }
}

/**
 * Left rail colour carrying a ticket's priority.
 *
 * Reads the theme tokens rather than literal HSL so the rails move with the
 * palette — the previous hardcoded walnut/beige values silently survived a
 * palette change and clashed with everything around them.
 */
export function prioriteRail(p: TicketPriorite): string {
  switch (p) {
    case "urgent":
      return "hsl(var(--destructive))";
    case "normal":
      return "hsl(var(--primary))";
    case "faible":
      return "hsl(var(--muted-foreground) / 0.4)";
  }
}

/**
 * Status dot color for compact lists / timelines. Distinct from badge fill so
 * dots remain legible inside heavily-coloured contexts.
 */
export function statutDot(s: TicketStatut): string {
  switch (s) {
    case "nouveau":
      return "hsl(var(--success))";
    case "en_cours":
      return "hsl(var(--primary))";
    case "resolu":
      return "hsl(var(--success-strong))";
    case "cloture":
      return "hsl(var(--muted-foreground) / 0.55)";
    case "annule":
      return "hsl(var(--destructive))";
  }
}

export function prioriteBadgeVariant(
  p: TicketPriorite,
): "default" | "secondary" | "destructive" | "outline" | "muted" {
  switch (p) {
    case "urgent":
      return "destructive";
    case "normal":
      return "secondary";
    case "faible":
      return "muted";
  }
}

export function etatBadgeVariant(
  e: EquipementEtat,
): "default" | "secondary" | "destructive" | "outline" | "muted" {
  switch (e) {
    case "operationnel":
      return "secondary";
    case "en_panne":
      return "destructive";
    case "en_maintenance":
      return "outline";
    case "reforme":
      return "muted";
  }
}

/**
 * Compact French relative time for cards / lists ("il y a 2 h").
 * Falls back to a full datetime once older than a month.
 */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "à l'instant";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `il y a ${d} j`;
  if (d < 30) return `il y a ${Math.floor(d / 7)} sem`;
  return formatDateTime(iso);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The ticket number as people say it: "ticket 214".
 *
 * Replaces a truncated UUID prefix, which was not stable enough to quote over
 * the phone and could collide across tickets.
 */
export function formatTicketRef(numero: number): string {
  return `#${String(numero).padStart(4, "0")}`;
}
