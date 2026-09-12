export type Role = "admin" | "informaticien" | "demandeur";

export type Etage = "sous_sol" | "rdc" | "etage_1" | "etage_2";

export type EquipementType =
  | "pc"
  | "ecran"
  | "imprimante"
  | "scanner"
  | "switch"
  | "routeur"
  | "onduleur"
  | "telephone"
  | "serveur"
  | "autre";

export type EquipementEtat =
  | "operationnel"
  | "en_panne"
  | "en_maintenance"
  | "reforme";

export type TicketNature =
  | "technique"
  | "metier"
  | "assistance"
  | "maintenance";

export type TicketPriorite = "urgent" | "normal" | "faible";

export type TicketProbleme =
  | "equipement_panne"
  | "reseau_absent"
  | "logiciel_bloque"
  | "impression"
  | "installation"
  | "autre";

export type TicketStatut =
  | "nouveau"
  | "en_cours"
  | "resolu"
  | "cloture"
  | "annule";

export interface UserRead {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  poste_id?: string | null;
}

export interface UserCreate {
  email: string;
  full_name: string;
  password: string;
  role?: Role;
  poste_id?: string | null;
}

export interface UserUpdate {
  email?: string | null;
  full_name?: string | null;
  role?: Role | null;
  is_active?: boolean | null;
  poste_id?: string | null;
}

export interface ServiceRead {
  id: string;
  nom: string;
  sous_reseau: string;
  etage: Etage;
  niveau_criticite: number;
}

export interface ServiceCreate {
  nom: string;
  sous_reseau: string;
  etage: Etage;
  niveau_criticite?: number;
}

export interface ServiceUpdate {
  nom?: string;
  sous_reseau?: string;
  etage?: Etage;
  niveau_criticite?: number;
}

export interface ServiceUsage {
  postes: number;
  equipements: number;
  tickets: number;
}

export interface PosteRead {
  id: string;
  nom: string;
  salle: string;
  utilisateur: string | null;
  service_id: string;
  notes: string | null;
  created_at: string;
  service: ServiceRead;
}

export interface PosteCreate {
  nom: string;
  salle: string;
  utilisateur?: string | null;
  service_id: string;
  notes?: string | null;
}

export interface PosteUpdate {
  nom?: string;
  salle?: string;
  utilisateur?: string | null;
  service_id?: string;
  notes?: string | null;
}

export interface PosteFilters {
  q?: string;
  service_id?: string;
  salle?: string;
}

export interface EquipementRead {
  id: string;
  reference: string;
  n_serie: string | null;
  code_barre: string | null;
  inventaire: string | null;
  type: EquipementType;
  marque: string;
  modele: string;
  service_id: string;
  poste_id: string | null;
  etat: EquipementEtat;
  processeur: string | null;
  ram_go: number | null;
  disque_go: number | null;
  systeme_exploitation: string | null;
  ecran_pouces: number | null;
  notes: string | null;
  created_at: string;
  service: ServiceRead;
  poste: PosteRead | null;
}

export interface EquipementCreate {
  reference: string;
  n_serie?: string | null;
  code_barre?: string | null;
  inventaire?: string | null;
  type: EquipementType;
  marque: string;
  modele: string;
  service_id: string;
  poste_id?: string | null;
  etat?: EquipementEtat;
  processeur?: string | null;
  ram_go?: number | null;
  disque_go?: number | null;
  systeme_exploitation?: string | null;
  ecran_pouces?: number | null;
  notes?: string | null;
}

export interface EquipementUpdate {
  reference?: string;
  n_serie?: string | null;
  code_barre?: string | null;
  inventaire?: string | null;
  type?: EquipementType;
  marque?: string;
  modele?: string;
  service_id?: string;
  poste_id?: string | null;
  etat?: EquipementEtat;
  processeur?: string | null;
  ram_go?: number | null;
  disque_go?: number | null;
  systeme_exploitation?: string | null;
  ecran_pouces?: number | null;
  notes?: string | null;
}

export interface EquipementFilters {
  type?: EquipementType;
  etat?: EquipementEtat;
  service_id?: string;
  poste_id?: string;
  salle?: string;
  sous_reseau?: string;
  q?: string;
}

export interface EquipementHistoryEntry {
  id: string;
  equipement_id: string;
  changed_at: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_by_user: UserRead;
}

/**
 * What produced a timeline entry. "commentaire" is typed by a person;
 * "statut" and "assignation" are written by the server and form the audit
 * trail, so the UI must not let them look like something a user wrote.
 */
export type TicketActionKind = "commentaire" | "statut" | "assignation";

export interface TicketActionRead {
  id: string;
  ticket_id: string;
  description: string;
  kind: TicketActionKind;
  created_by_user: UserRead;
  created_at: string;
}

export interface TicketRead {
  id: string;
  /** Human-facing sequential number. `id` remains the API identifier. */
  numero: number;
  titre: string;
  description: string;
  nature: TicketNature;
  priorite: TicketPriorite;
  statut: TicketStatut;
  probleme_type?: TicketProbleme | null;
  service_id: string;
  poste_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  archived_at: string | null;
  created_by_user: UserRead;
  assigned_to_user: UserRead | null;
  service: ServiceRead;
  poste: PosteRead | null;
  equipements: EquipementRead[];
  assigned_to?: string | null;
  created_by?: string;
}

export interface TicketDetail extends TicketRead {
  actions: TicketActionRead[];
}

export interface TicketCreate {
  titre: string;
  description: string;
  nature: TicketNature;
  priorite?: TicketPriorite;
  service_id: string;
  equipement_ids?: string[];
  poste_id?: string | null;
  assigned_to?: string | null;
}

export interface TicketDemandeurCreate {
  probleme: TicketProbleme;
  equipement_id?: string | null;
  commentaire?: string | null;
}

export interface TicketUpdate {
  titre?: string;
  description?: string;
  nature?: TicketNature;
  priorite?: TicketPriorite;
}

export interface TicketFilters {
  limit?: number;
  offset?: number;
  statut?: TicketStatut;
  nature?: TicketNature;
  priorite?: TicketPriorite;
  service_id?: string;
  assigned_to?: string;
  created_by?: string;
  equipement_id?: string;
  archived?: boolean;
}

/** A page of tickets plus the total matching the filters (not just this page). */
export interface TicketPage {
  items: TicketRead[];
  total: number;
}
