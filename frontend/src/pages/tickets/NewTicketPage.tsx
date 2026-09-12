import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AppWindow,
  Building2,
  ChevronLeft,
  HelpCircle,
  MapPin,
  Monitor,
  PackagePlus,
  Plus,
  Printer,
  Search,
  Sparkles,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { apiError } from "@/lib/errors";
import { getServices } from "@/api/services";
import { createEquipement, getEquipements } from "@/api/equipements";
import { getUsers } from "@/api/users";
import {
  createTicket,
  createTicketAsDemandeur,
  getDemandeurEquipements,
  getTickets,
} from "@/api/tickets";
import { useAuthStore } from "@/store/authStore";
import {
  ETAT_LABEL,
  NATURE_LABEL,
  PRIORITE_LABEL,
  PROBLEME_LABEL,
  STATUT_LABEL,
  TYPE_LABEL,
  statutDot,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  EquipementCreate,
  EquipementEtat,
  EquipementFilters,
  EquipementRead,
  EquipementType,
  ServiceRead,
  TicketCreate,
  TicketDemandeurCreate,
  TicketNature,
  TicketPriorite,
  TicketProbleme,
} from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PostePicker } from "@/components/PostePicker";

const NATURES: TicketNature[] = ["technique", "metier", "assistance", "maintenance"];
const PRIORITES: TicketPriorite[] = ["urgent", "normal", "faible"];
const TYPES: EquipementType[] = [
  "pc",
  "ecran",
  "imprimante",
  "scanner",
  "switch",
  "routeur",
  "onduleur",
  "telephone",
  "serveur",
  "autre",
];
const ETATS: EquipementEtat[] = [
  "operationnel",
  "en_panne",
  "en_maintenance",
  "reforme",
];

const NONE = "__none__";

export function NewTicketPage() {
  const { user } = useAuthStore();
  if (user?.role === "demandeur") {
    return <DemandeurNewTicket />;
  }
  return <StaffNewTicket />;
}

function StaffNewTicket() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isDemandeur = user?.role === "demandeur";
  const isAdmin = user?.role === "admin";

  const [form, setForm] = useState<TicketCreate>({
    titre: "",
    description: "",
    nature: "technique",
    priorite: "normal",
    service_id: "",
    equipement_ids: [],
    poste_id: null,
    assigned_to: null,
  });

  const { data: services } = useQuery({
    queryKey: ["services"],
    queryFn: getServices,
  });
  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: getUsers,
    enabled: isAdmin,
  });

  const mutation = useMutation({
    mutationFn: createTicket,
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      toast.success("Ticket créé.");
      navigate(`/tickets/${t.id}`);
    },
    onError: (e) => toast.error(apiError(e, "Erreur lors de la création.")),
  });

  const update = <K extends keyof TicketCreate>(k: K, v: TicketCreate[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      ...form,
      equipement_ids: form.equipement_ids ?? [],
      poste_id: form.poste_id || null,
      assigned_to: form.assigned_to || null,
    });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/tickets")}>
        <ChevronLeft className="h-4 w-4" />
        Retour aux tickets
      </Button>

      <div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          Nouveau ticket
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Décrivez le problème ou la demande pour qu'un informaticien puisse intervenir.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="titre">Titre</Label>
              <Input
                id="titre"
                required
                value={form.titre}
                onChange={(e) => update("titre", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                required
                rows={5}
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nature</Label>
                <Select
                  value={form.nature}
                  onValueChange={(v) => update("nature", v as TicketNature)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NATURES.map((n) => (
                      <SelectItem key={n} value={n}>
                        {NATURE_LABEL[n]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priorité</Label>
                <Select
                  value={form.priorite}
                  onValueChange={(v) => update("priorite", v as TicketPriorite)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PRIORITE_LABEL[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Service</Label>
              <Select
                value={form.service_id || ""}
                onValueChange={(v) => {
                  update("service_id", v);
                  // Changing service invalidates any prior poste selection.
                  update("poste_id", null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="— sélectionner —" />
                </SelectTrigger>
                <SelectContent>
                  {(services ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!isDemandeur && (
              <div className="space-y-1.5">
                <Label>Poste concerné (optionnel)</Label>
                <PostePicker
                  value={form.poste_id ?? null}
                  serviceId={form.service_id || null}
                  services={services ?? []}
                  onChange={(pid) => update("poste_id", pid)}
                />
              </div>
            )}

            {!isDemandeur && (
              <EquipementMultiPicker
                selectedIds={form.equipement_ids ?? []}
                onChange={(ids) => update("equipement_ids", ids)}
                services={services ?? []}
                posteId={form.poste_id ?? null}
              />
            )}

            {isAdmin && (
              <div className="space-y-1.5">
                <Label>Assigner à (optionnel)</Label>
                <Select
                  value={form.assigned_to ?? NONE}
                  onValueChange={(v) =>
                    update("assigned_to", v === NONE ? null : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— aucun —</SelectItem>
                    {(users ?? [])
                      .filter((u) => u.role !== "demandeur" && u.is_active)
                      .map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.full_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Création…" : "Créer le ticket"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/tickets")}
              >
                Annuler
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Multi-select equipement picker. The selected set is a list of UUIDs; we
 * fetch their full records to render chips. A search bar adds matches to the
 * list; selecting a poste in the parent enables a "Add all of poste's
 * equipements" shortcut. An inline create form adds a brand-new asset.
 */
function EquipementMultiPicker({
  selectedIds,
  onChange,
  services,
  posteId,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  services: ServiceRead[];
  posteId: string | null;
}) {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<EquipementFilters>({});
  const [creating, setCreating] = useState(false);

  const hasAnyFilter = !!filters.q || !!filters.salle || !!filters.sous_reseau;

  const { data: searchResults } = useQuery({
    queryKey: ["equipements", filters],
    queryFn: () => getEquipements(filters),
    enabled: hasAnyFilter,
  });

  // Fetch the full record of every selected equipement so we can render chips.
  // We grab all once and filter, simpler than N targeted requests.
  const { data: allEquipements } = useQuery({
    queryKey: ["equipements", "all"],
    queryFn: () => getEquipements(),
    enabled: selectedIds.length > 0,
  });
  const selectedRecords: EquipementRead[] =
    (allEquipements ?? []).filter((e) => selectedIds.includes(e.id));

  // Equipements of the currently-selected poste (for the bulk-add shortcut).
  const { data: posteEquipements } = useQuery({
    queryKey: ["equipements", { poste_id: posteId }],
    queryFn: () => getEquipements({ poste_id: posteId ?? undefined }),
    enabled: !!posteId,
  });

  // Generic in the key so `next[k] = v` type-checks without a cast.
  const setFilter = <K extends keyof EquipementFilters>(
    k: K,
    v: EquipementFilters[K] | undefined,
  ) =>
    setFilters((prev) => {
      const next = { ...prev };
      if (v) next[k] = v;
      else delete next[k];
      return next;
    });

  const addId = (id: string) => {
    if (!selectedIds.includes(id)) onChange([...selectedIds, id]);
  };

  const removeId = (id: string) => {
    onChange(selectedIds.filter((x) => x !== id));
  };

  const addPosteEquipements = () => {
    if (!posteEquipements?.length) {
      toast.info("Ce poste n'a aucun équipement enregistré.");
      return;
    }
    const merged = Array.from(
      new Set([...selectedIds, ...posteEquipements.map((e) => e.id)]),
    );
    onChange(merged);
    toast.success(
      `${posteEquipements.length} équipement(s) du poste ajouté(s).`,
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Équipements concernés (optionnel)</Label>
        {posteId && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addPosteEquipements}
          >
            <MapPin className="h-4 w-4" />
            Ajouter tous ceux du poste
          </Button>
        )}
      </div>

      {selectedRecords.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-md border border-input bg-muted/30 p-2">
          {selectedRecords.map((eq) => (
            <Badge
              key={eq.id}
              variant="secondary"
              className="gap-1 px-2 py-1 text-xs"
            >
              {eq.reference}
              <span className="text-muted-foreground">
                · {TYPE_LABEL[eq.type]}
              </span>
              <button
                type="button"
                aria-label={`Retirer ${eq.reference}`}
                onClick={() => removeId(eq.id)}
                className="ml-1 rounded hover:bg-background/60"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="N° série, code-barres, inventaire, référence, marque, modèle…"
            value={filters.q ?? ""}
            onChange={(e) => setFilter("q", e.target.value)}
            className="pl-8"
          />
        </div>
        <Input
          placeholder="Salle"
          value={filters.salle ?? ""}
          onChange={(e) => setFilter("salle", e.target.value)}
        />
        <Input
          placeholder="Sous-réseau (ex. 10.20.4)"
          value={filters.sous_reseau ?? ""}
          onChange={(e) => setFilter("sous_reseau", e.target.value)}
        />
      </div>

      {hasAnyFilter && (
        <div className="max-h-56 overflow-auto rounded-md border border-input">
          {searchResults && searchResults.length > 0 ? (
            <ul>
              {searchResults.map((e) => {
                const already = selectedIds.includes(e.id);
                return (
                  <li
                    key={e.id}
                    onClick={() => !already && addId(e.id)}
                    className={
                      "px-3 py-2 text-sm border-b last:border-0 " +
                      (already
                        ? "opacity-50 cursor-default"
                        : "cursor-pointer hover:bg-muted")
                    }
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="font-medium">
                        {e.reference}
                        {already && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (déjà ajouté)
                          </span>
                        )}
                      </div>
                      <Badge variant="muted" className="shrink-0">
                        {TYPE_LABEL[e.type]}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {[e.marque, e.modele, e.service.nom].filter(Boolean).join(" · ")}
                      {e.poste ? ` · ${e.poste.salle}` : ""}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              Aucun équipement trouvé.
            </p>
          )}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setCreating((v) => !v)}
      >
        {creating ? (
          "Annuler la création"
        ) : (
          <>
            <Plus className="h-4 w-4" />
            Créer un nouvel équipement
          </>
        )}
      </Button>

      {creating && (
        <InlineEquipementForm
          services={services}
          onCreated={(id) => {
            qc.invalidateQueries({ queryKey: ["equipements"] });
            addId(id);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function InlineEquipementForm({
  services,
  onCreated,
}: {
  services: ServiceRead[];
  onCreated: (id: string) => void;
}) {
  const [draft, setDraft] = useState<EquipementCreate>({
    reference: "",
    n_serie: "",
    code_barre: "",
    inventaire: "",
    type: "pc",
    marque: "",
    modele: "",
    service_id: "",
    poste_id: null,
    etat: "operationnel",
    notes: "",
  });

  const createMutation = useMutation({
    mutationFn: createEquipement,
    onSuccess: (eq) => {
      toast.success(`Équipement « ${eq.reference} » créé.`);
      onCreated(eq.id);
    },
    onError: (e) => toast.error(apiError(e, "Erreur création.")),
  });

  const upd = <K extends keyof EquipementCreate>(k: K, v: EquipementCreate[K]) =>
    setDraft((prev) => ({ ...prev, [k]: v }));

  const canSubmit = draft.reference && draft.service_id;

  return (
    <Card className="bg-muted/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Créer un nouvel équipement</CardTitle>
        <CardDescription>
          Il sera disponible immédiatement et ajouté au ticket.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            placeholder="Référence"
            value={draft.reference}
            onChange={(e) => upd("reference", e.target.value)}
          />
          <Input
            placeholder="N° de série"
            value={draft.n_serie ?? ""}
            onChange={(e) => upd("n_serie", e.target.value)}
          />
          <Input
            placeholder="Inventaire"
            value={draft.inventaire ?? ""}
            onChange={(e) => upd("inventaire", e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            placeholder="Code-barres"
            value={draft.code_barre ?? ""}
            onChange={(e) => upd("code_barre", e.target.value)}
          />
          <Select
            value={draft.type}
            onValueChange={(v) => upd("type", v as EquipementType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={draft.etat ?? "operationnel"}
            onValueChange={(v) => upd("etat", v as EquipementEtat)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ETATS.map((s) => (
                <SelectItem key={s} value={s}>
                  {ETAT_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            placeholder="Marque (optionnel)"
            value={draft.marque}
            onChange={(e) => upd("marque", e.target.value)}
          />
          <Input
            placeholder="Modèle (optionnel)"
            value={draft.modele}
            onChange={(e) => upd("modele", e.target.value)}
          />
        </div>
        <Select
          value={draft.service_id || ""}
          onValueChange={(v) => {
            upd("service_id", v);
            upd("poste_id", null);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="— service —" />
          </SelectTrigger>
          <SelectContent>
            {services.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.nom}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Poste (optionnel)
          </Label>
          <PostePicker
            value={draft.poste_id ?? null}
            serviceId={draft.service_id || null}
            services={services}
            onChange={(pid) => upd("poste_id", pid)}
          />
        </div>
        <Textarea
          placeholder="Notes (optionnel)"
          rows={2}
          value={draft.notes ?? ""}
          onChange={(e) => upd("notes", e.target.value)}
        />
        <Button
          type="button"
          size="sm"
          disabled={!canSubmit || createMutation.isPending}
          onClick={() =>
            createMutation.mutate({
              ...draft,
              n_serie: draft.n_serie || null,
              code_barre: draft.code_barre || null,
              inventaire: draft.inventaire || null,
              notes: draft.notes || null,
            })
          }
        >
          {createMutation.isPending ? "Création…" : "Créer et ajouter au ticket"}
        </Button>
      </CardContent>
    </Card>
  );
}

const PROBLEMES: TicketProbleme[] = [
  "equipement_panne",
  "reseau_absent",
  "logiciel_bloque",
  "impression",
  "installation",
  "autre",
];

/** One icon per problem category, so the grid can be read without reading. */
const PROBLEME_ICON: Record<TicketProbleme, LucideIcon> = {
  equipement_panne: Monitor,
  reseau_absent: WifiOff,
  logiciel_bloque: AppWindow,
  impression: Printer,
  installation: PackagePlus,
  autre: HelpCircle,
};

/** Wording the ward uses, rather than the enum's own vocabulary. */
const PROBLEME_PLAIN: Record<TicketProbleme, string> = {
  equipement_panne: "Un appareil ne marche plus",
  reseau_absent: "Pas de réseau ou internet",
  logiciel_bloque: "Une application est bloquée",
  impression: "Problème d'impression",
  installation: "Demande d'installation",
  autre: "Autre chose",
};

function Step({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-[0.688rem] font-bold text-primary-foreground">
        {n}
      </span>
      <span className="text-sm font-semibold">{title}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

/**
 * Simplified ticket form for medical staff (role=demandeur).
 *
 * The demandeur only picks a problem category (radio cards), optionally names
 * an affected equipement (their poste's assets first, then the rest of the
 * service), and can add a free-text comment. Service, poste, title, and
 * priority are derived server-side.
 */
function DemandeurNewTicket() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuthStore();

  const [probleme, setProbleme] = useState<TicketProbleme | null>(null);
  const [equipementId, setEquipementId] = useState<string>("");
  const [commentaire, setCommentaire] = useState("");

  const { data: equipements, isLoading: loadingEqs } = useQuery({
    queryKey: ["equipements", "demandeur"],
    queryFn: getDemandeurEquipements,
  });

  const posteId = user?.poste_id ?? null;
  const posteEqs = (equipements ?? []).filter((e) => e.poste_id === posteId);
  const otherEqs = (equipements ?? []).filter((e) => e.poste_id !== posteId);

  const mutation = useMutation({
    mutationFn: (payload: TicketDemandeurCreate) =>
      createTicketAsDemandeur(payload),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      toast.success("Ticket transmis au service informatique.");
      navigate(`/tickets/${t.id}`);
    },
    onError: (e) => toast.error(apiError(e, "Erreur lors de l'envoi.")),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!probleme) {
      toast.error("Sélectionnez le type de problème.");
      return;
    }
    mutation.mutate({
      probleme,
      equipement_id: equipementId || null,
      commentaire: commentaire.trim() || null,
    });
  };

  // The demandeur's own poste isn't on UserRead, but the equipements endpoint
  // returns their service and poste nested on each asset — so the context
  // panel reads it from there rather than costing a new endpoint.
  const ctxService =
    posteEqs[0]?.service?.nom ?? (equipements ?? [])[0]?.service?.nom ?? "—";
  const ctxSalle = posteEqs[0]?.poste?.salle ?? "—";
  const ctxPoste = posteEqs[0]?.poste?.nom ?? "—";

  const { data: myTickets } = useQuery({
    queryKey: ["tickets", "demandeur-ongoing"],
    queryFn: () => getTickets({ limit: 20 }),
  });
  const ongoing = (myTickets?.items ?? [])
    .filter((t) => t.statut === "nouveau" || t.statut === "en_cours")
    .slice(0, 4);

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate("/tickets")}>
        <ChevronLeft className="h-4 w-4" />
        Retour à mes tickets
      </Button>

      <div className="flex gap-7">
        <form onSubmit={handleSubmit} className="min-w-0 flex-1 space-y-6">
          <div>
            <h1 className="font-serif text-3xl font-bold tracking-tight">
              Signaler un problème
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Choisissez ce qui se passe. Nous savons déjà où vous êtes.
            </p>
          </div>

          <div className="space-y-3">
            <Step n={1} title="De quoi s'agit-il ?" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PROBLEMES.map((p) => {
                const active = probleme === p;
                const Icon = PROBLEME_ICON[p];
                return (
                  <button
                    type="button"
                    key={p}
                    onClick={() => setProbleme(p)}
                    aria-pressed={active}
                    title={PROBLEME_LABEL[p]}
                    className={cn(
                      "flex flex-col gap-3 rounded-xl border p-4 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/[0.05] shadow-sm"
                        : "border-border bg-card hover:border-primary/40",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-9 w-9 place-items-center rounded-lg transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "bg-accent text-muted-foreground",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span
                      className={cn(
                        "text-sm font-semibold leading-snug",
                        active && "text-primary",
                      )}
                    >
                      {PROBLEME_PLAIN[p]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <Step n={2} title="Quel appareil ?" hint="facultatif" />
            {loadingEqs ? (
              <p className="text-xs text-muted-foreground">
                Chargement des équipements…
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <EqChip
                  label="Aucun / je ne sais pas"
                  active={!equipementId}
                  onClick={() => setEquipementId("")}
                />
                {posteEqs.map((e) => (
                  <EqChip
                    key={e.id}
                    label={TYPE_LABEL[e.type]}
                    reference={e.reference}
                    active={equipementId === e.id}
                    onClick={() => setEquipementId(e.id)}
                  />
                ))}
              </div>
            )}

            {/* The rest of the service can run to hundreds of assets, so it
                stays a pick-from-list rather than more chips. */}
            {otherEqs.length > 0 && (
              <div className="pt-1">
                <Select
                  value={
                    equipementId && otherEqs.some((e) => e.id === equipementId)
                      ? equipementId
                      : "__none__"
                  }
                  onValueChange={(v) =>
                    setEquipementId(v === "__none__" ? "" : v)
                  }
                >
                  <SelectTrigger className="max-w-sm">
                    <SelectValue placeholder="Autre équipement du service…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      Autre équipement du service…
                    </SelectItem>
                    {otherEqs.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.reference} — {TYPE_LABEL[e.type]}
                        {e.poste ? ` · ${e.poste.salle}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <Step n={3} title="Autre chose à préciser ?" hint="facultatif" />
            <Textarea
              id="commentaire"
              rows={4}
              placeholder="Depuis quand ? Un message d'erreur à l'écran ?"
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-1">
            <Button type="submit" disabled={!probleme || mutation.isPending}>
              {mutation.isPending ? "Envoi…" : "Envoyer au service informatique"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Un technicien reçoit la demande immédiatement.
            </span>
          </div>
        </form>

        {/* Context panel: makes visible what the server fills in by itself,
            which is the whole reason this form is three fields long. */}
        <aside className="hidden w-72 shrink-0 flex-col gap-3.5 lg:flex">
          <Card>
            <CardContent className="pt-5">
              <div className="text-[0.656rem] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                Votre poste
              </div>
              <div className="mt-3 flex flex-col gap-3">
                <ContextRow icon={Building2} label="Service" value={ctxService} />
                <ContextRow icon={MapPin} label="Salle" value={ctxSalle} />
                <ContextRow icon={Monitor} label="Poste" value={ctxPoste} />
              </div>
              <p className="mt-4 border-t border-border pt-3.5 text-xs leading-relaxed text-muted-foreground">
                Rempli automatiquement depuis votre compte — vous n'avez rien à
                saisir.
              </p>
            </CardContent>
          </Card>

          <div className="rounded-xl border border-[hsl(var(--success))]/20 bg-[hsl(var(--success-muted))]/50 p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[hsl(var(--success-strong))]" />
              <span className="text-sm font-semibold text-[hsl(var(--success-strong))]">
                Urgence automatique
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[hsl(var(--success-strong))]/90">
              Le niveau d'urgence est calculé par le système à partir de votre
              service, du type de problème et de l'appareil concerné. Vous
              n'avez pas à le choisir.
            </p>
          </div>

          {ongoing.length > 0 && (
            <Card>
              <CardContent className="pt-5">
                <div className="text-[0.656rem] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                  Vos demandes en cours
                </div>
                <div className="mt-3 flex flex-col gap-2.5">
                  {ongoing.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => navigate(`/tickets/${t.id}`)}
                      className="flex items-center gap-2 text-left"
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: statutDot(t.statut) }}
                      />
                      <span className="truncate text-xs">{t.titre}</span>
                      <span className="ml-auto shrink-0 text-[0.625rem] uppercase tracking-wide text-muted-foreground">
                        {STATUT_LABEL[t.statut]}
                      </span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function EqChip({
  label,
  reference,
  active,
  onClick,
}: {
  label: string;
  reference?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3.5 py-2.5 transition-colors",
        active
          ? "border-primary bg-primary/[0.05]"
          : "border-border bg-card hover:border-primary/40",
      )}
    >
      <span className={cn("text-xs font-semibold", active && "text-primary")}>
        {label}
      </span>
      {reference && (
        <span className="text-xs tabular-nums text-muted-foreground">
          {reference}
        </span>
      )}
    </button>
  );
}

function ContextRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-[0.625rem] uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5 truncate text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}
