import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Archive,
  ArchiveRestore,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ExternalLink,
  Lock,
  MapPin,
  Pencil,
  PlayCircle,
  RotateCcw,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { apiError } from "@/lib/errors";
import {
  addAction,
  archiveTicket,
  assignTicket,
  getTicket,
  unarchiveTicket,
  updateStatus,
  updateTicket,
} from "@/api/tickets";
import { getUsers } from "@/api/users";
import { useAuthStore } from "@/store/authStore";
import {
  NATURE_LABEL,
  PRIORITE_LABEL,
  ROLE_LABEL,
  STATUT_LABEL,
  TYPE_LABEL,
  formatDateTime,
  formatTicketRef,
  prioriteRail,
  statutBadgeVariant,
  timeAgo,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  TicketDetail as TicketDetailType,
  TicketNature,
  TicketPriorite,
  TicketStatut,
  TicketUpdate,
} from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NONE = "__none__";

export function TicketDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const { data: ticket, isLoading, isError } = useQuery({
    queryKey: ["ticket", id],
    queryFn: () => getTicket(id),
    enabled: !!id,
  });

  const isAdmin = user?.role === "admin";
  const isInformaticien = user?.role === "informaticien";
  const isDemandeur = user?.role === "demandeur";
  const isAssigned = !!ticket && ticket.assigned_to_user?.id === user?.id;

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: getUsers,
    enabled: isAdmin,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ticket", id] });
    qc.invalidateQueries({ queryKey: ["tickets"] });
  };

  const statusMutation = useMutation({
    mutationFn: (statut: TicketStatut) => updateStatus(id, statut),
    onSuccess: (t) => {
      invalidate();
      toast.success(`Statut mis à jour : ${STATUT_LABEL[t.statut]}.`);
    },
    onError: (e) => toast.error(apiError(e, "Action refusée.")),
  });

  const assignMutation = useMutation({
    mutationFn: (assigned_to: string) => assignTicket(id, assigned_to),
    onSuccess: () => {
      invalidate();
      toast.success("Assigné.");
    },
    onError: (e) => toast.error(apiError(e, "Action refusée.")),
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveTicket(id),
    onSuccess: () => {
      invalidate();
      toast.success("Ticket archivé.");
    },
    onError: (e) => toast.error(apiError(e, "Action refusée.")),
  });

  const unarchiveMutation = useMutation({
    mutationFn: () => unarchiveTicket(id),
    onSuccess: () => {
      invalidate();
      toast.success("Ticket restauré.");
    },
    onError: (e) => toast.error(apiError(e, "Action refusée.")),
  });

  const [actionText, setActionText] = useState("");
  const actionMutation = useMutation({
    mutationFn: (description: string) => addAction(id, description),
    onSuccess: () => {
      setActionText("");
      invalidate();
      toast.success("Action ajoutée.");
    },
    onError: (e) => toast.error(apiError(e, "Erreur d'ajout.")),
  });

  // The server value is the source of truth; the override holds only the
  // admin's in-progress pick, before they submit it. Deriving this avoids
  // mirroring server state into an effect, which re-rendered twice on every
  // refetch and briefly showed a stale assignee.
  const [assigneeOverride, setAssigneeOverride] = useState<string | null>(null);
  const selectedAssignee = assigneeOverride ?? ticket?.assigned_to_user?.id ?? "";

  if (isLoading)
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (isError || !ticket)
    return <p className="text-sm text-destructive">Ticket introuvable.</p>;

  const unassignedOrMine =
    !ticket.assigned_to_user || ticket.assigned_to_user.id === user?.id;
  const showPrendre =
    ticket.statut === "nouveau" &&
    (isAdmin || (isInformaticien && unassignedOrMine));
  const showResolu =
    ticket.statut === "en_cours" && (isAssigned || isAdmin);
  const showCloture = ticket.statut === "resolu" && isAdmin;
  const showAnnule =
    (ticket.statut === "nouveau" || ticket.statut === "en_cours") && isAdmin;
  const showAssign =
    isAdmin && (ticket.statut === "nouveau" || ticket.statut === "en_cours");
  const isArchived = !!ticket.archived_at;
  const showArchive =
    isAdmin &&
    !isArchived &&
    (ticket.statut === "resolu" ||
      ticket.statut === "cloture" ||
      ticket.statut === "annule");
  const showUnarchive = isAdmin && isArchived;
  // Reopen. From "résolu" the assigned tech can do it themselves (their fix
  // didn't hold); resurrecting a clôturé/annulé ticket is an admin call.
  const showRouvrir =
    !isArchived &&
    ((ticket.statut === "resolu" && (isAssigned || isAdmin)) ||
      ((ticket.statut === "cloture" || ticket.statut === "annule") && isAdmin));

  const hasActions =
    showPrendre ||
    showResolu ||
    showCloture ||
    showAnnule ||
    showAssign ||
    showArchive ||
    showUnarchive ||
    showRouvrir;
  // The person who reported the problem can add to their own ticket —
  // otherwise the tech's only way to ask a follow-up question is to walk to
  // the ward.
  const isReporter = ticket.created_by_user.id === user?.id;
  const canAddAction =
    (isAssigned || isAdmin || (isDemandeur && isReporter)) &&
    ticket.statut !== "cloture" &&
    ticket.statut !== "annule";

  // Tech-facing edit of the core fields (titre/description/nature/priorité).
  // Matches the backend rule: admin always, or assigned tech, or any tech if
  // the ticket is still unassigned.
  const canEdit =
    !isArchived &&
    ticket.statut !== "cloture" &&
    ticket.statut !== "annule" &&
    (isAdmin ||
      (isInformaticien &&
        (!ticket.assigned_to_user || ticket.assigned_to_user.id === user?.id)));

  return (
    <div className="space-y-5 max-w-5xl">
      <Button variant="ghost" size="sm" onClick={() => navigate("/tickets")}>
        <ChevronLeft className="h-4 w-4" />
        Retour aux tickets
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="tabular-nums">
                  {formatTicketRef(ticket.numero)}
                </span>
                <span className="h-[3px] w-[3px] rounded-full bg-muted-foreground/50" />
                <span>ouvert {timeAgo(ticket.created_at)}</span>
              </div>

              <CardTitle className="mt-1.5 text-2xl">{ticket.titre}</CardTitle>

              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <Badge variant={statutBadgeVariant(ticket.statut)}>
                  {STATUT_LABEL[ticket.statut]}
                </Badge>
                {/* Priority is a dot and a word, not a badge — the badge shape
                    belongs to status, and two of them compete. */}
                {!isDemandeur && (
                  <span
                    className="inline-flex items-center gap-1.5 text-xs font-semibold"
                    style={{ color: prioriteRail(ticket.priorite) }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: prioriteRail(ticket.priorite) }}
                    />
                    {PRIORITE_LABEL[ticket.priorite]}
                  </span>
                )}
                <Badge variant="outline">{NATURE_LABEL[ticket.nature]}</Badge>
                {/* Only demandeur-created tickets carry a problem type, and
                    those are exactly the ones whose priority the server
                    computed rather than a human choosing it. */}
                {ticket.probleme_type && (
                  <span className="rounded-md bg-accent px-2 py-0.5 text-xs text-muted-foreground">
                    priorité calculée
                  </span>
                )}
                {isArchived && <Badge variant="muted">Archivé</Badge>}
              </div>
            </div>
            {canEdit && (
              <EditTicketDialog
                ticket={ticket}
                onSaved={invalidate}
              />
            )}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">
            {ticket.description}
          </p>
          <Separator className="my-5" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm">
            <Info label="Service" value={ticket.service.nom} />
            <Info
              label="Sous-réseau"
              value={ticket.service.sous_reseau || "—"}
            />
            <Info label="Créé par" value={ticket.created_by_user.full_name} />
            <Info
              label="Assigné à"
              value={ticket.assigned_to_user?.full_name ?? "—"}
            />
            <Info label="Créé le" value={formatDateTime(ticket.created_at)} />
            <Info label="Mis à jour" value={formatDateTime(ticket.updated_at)} />
            <Info label="Résolu le" value={formatDateTime(ticket.resolved_at)} />
          </div>

          {ticket.poste && (
            <>
              <Separator className="my-5" />
              <div className="rounded-md border border-input bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  Poste concerné
                </div>
                <div className="mt-1 text-sm font-medium">
                  {ticket.poste.nom}
                </div>
                <div className="text-xs text-muted-foreground">
                  {ticket.poste.salle}
                  {ticket.poste.utilisateur
                    ? ` · ${ticket.poste.utilisateur}`
                    : ""}
                </div>
              </div>
            </>
          )}

          <Separator className="my-5" />
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Équipements concernés
            </div>
            {ticket.equipements.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun équipement spécifique lié.
              </p>
            ) : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ticket.equipements.map((eq) => (
                  <li key={eq.id}>
                    <Link
                      to={`/equipements/${eq.id}`}
                      className="block rounded-md border border-input p-3 text-sm transition-colors hover:bg-accent hover:border-primary/40"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium">{eq.reference}</span>
                        <Badge variant="muted" className="shrink-0">
                          {TYPE_LABEL[eq.type]}
                        </Badge>
                      </div>
                      {(eq.marque || eq.modele) && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {[eq.marque, eq.modele].filter(Boolean).join(" · ")}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                        {eq.poste?.salle && <span>{eq.poste.salle}</span>}
                        {eq.service.sous_reseau && (
                          <span className="tabular-nums">
                            {eq.service.sous_reseau}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-primary mt-1 inline-flex items-center gap-1">
                        Voir détails
                        <ExternalLink className="h-3 w-3" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {hasActions && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {showPrendre && (
                <Button
                  onClick={() => statusMutation.mutate("en_cours")}
                  disabled={statusMutation.isPending}
                >
                  <PlayCircle className="h-4 w-4" />
                  Prendre en charge
                </Button>
              )}
              {showResolu && (
                <Button
                  onClick={() => statusMutation.mutate("resolu")}
                  disabled={statusMutation.isPending}
                  className="bg-[hsl(var(--success))] hover:bg-[hsl(var(--success-strong))] text-[hsl(var(--success-foreground))]"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Marquer résolu
                </Button>
              )}
              {showCloture && (
                <Button
                  variant="secondary"
                  onClick={() => statusMutation.mutate("cloture")}
                  disabled={statusMutation.isPending}
                >
                  <Lock className="h-4 w-4" />
                  Clôturer
                </Button>
              )}
              {showAnnule && (
                <Button
                  variant="destructive"
                  onClick={() => statusMutation.mutate("annule")}
                  disabled={statusMutation.isPending}
                >
                  <Ban className="h-4 w-4" />
                  Annuler
                </Button>
              )}
              {showRouvrir && (
                <Button
                  variant="outline"
                  onClick={() => statusMutation.mutate("en_cours")}
                  disabled={statusMutation.isPending}
                >
                  <RotateCcw className="h-4 w-4" />
                  Rouvrir
                </Button>
              )}
              {showArchive && (
                <Button
                  variant="outline"
                  onClick={() => archiveMutation.mutate()}
                  disabled={archiveMutation.isPending}
                >
                  <Archive className="h-4 w-4" />
                  Archiver
                </Button>
              )}
              {showUnarchive && (
                <Button
                  variant="outline"
                  onClick={() => unarchiveMutation.mutate()}
                  disabled={unarchiveMutation.isPending}
                >
                  <ArchiveRestore className="h-4 w-4" />
                  Restaurer
                </Button>
              )}
            </div>

            {showAssign && (
              <>
                <Separator />
                <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                  <div className="flex-1 space-y-1.5">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      {ticket.assigned_to_user ? "Réassigner à" : "Assigner à"}
                    </Label>
                    <Select
                      value={selectedAssignee || NONE}
                      onValueChange={(v) =>
                        setAssigneeOverride(v === NONE ? "" : v)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="— sélectionner —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>— sélectionner —</SelectItem>
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
                  <Button
                    onClick={() =>
                      selectedAssignee && assignMutation.mutate(selectedAssignee)
                    }
                    disabled={
                      !selectedAssignee ||
                      selectedAssignee === (ticket.assigned_to_user?.id ?? "") ||
                      assignMutation.isPending
                    }
                  >
                    <UserPlus className="h-4 w-4" />
                    {ticket.assigned_to_user ? "Réassigner" : "Assigner"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-baseline gap-2.5">
            <CardTitle className="text-base">Journal</CardTitle>
            <span className="text-xs text-muted-foreground">
              échanges et historique
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {ticket.actions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune action.</p>
          ) : (
            /* Two tracks on one rail: server-written audit entries are thin
               italic lines, typed comments are cards. A status change can
               never be mistaken for something a person said — nor forged by
               typing it into the comment box. */
            <ol className="flex flex-col border-l border-border pl-3">
              {ticket.actions.map((a) => {
                const isSystem = a.kind !== "commentaire";
                const isWard = a.created_by_user.role === "demandeur";

                if (isSystem) {
                  return (
                    <li
                      key={a.id}
                      className="relative flex items-center gap-2.5 py-1.5 pl-3"
                    >
                      <span className="absolute -left-[1.063rem] h-[0.438rem] w-[0.438rem] rounded-full border-[1.5px] border-border bg-card" />
                      <span className="text-xs italic text-muted-foreground">
                        {a.description}
                      </span>
                      <span className="text-xs text-muted-foreground/70">
                        {a.created_by_user.full_name}
                      </span>
                      <div className="h-px flex-1 bg-border/60" />
                      <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground/70">
                        {formatDateTime(a.created_at)}
                      </span>
                    </li>
                  );
                }

                return (
                  <li key={a.id} className="relative py-2 pl-3">
                    <span
                      className="absolute -left-[1rem] top-[1.125rem] h-[0.438rem] w-[0.438rem] rounded-full"
                      style={{
                        background: isWard
                          ? "hsl(var(--success))"
                          : "hsl(var(--primary))",
                      }}
                    />
                    {/* The two sides of the conversation are tinted apart:
                        the ward in green, the IT unit in the action blue. */}
                    <div
                      className={cn(
                        "rounded-lg border p-3",
                        isWard
                          ? "border-[hsl(var(--success))]/20 bg-[hsl(var(--success-muted))]/40"
                          : "border-primary/15 bg-primary/[0.04]",
                      )}
                    >
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="text-sm font-semibold">
                          {a.created_by_user.full_name}
                        </span>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide",
                            isWard
                              ? "bg-[hsl(var(--success-muted))] text-[hsl(var(--success-strong))]"
                              : "bg-primary/10 text-primary",
                          )}
                        >
                          {ROLE_LABEL[a.created_by_user.role]}
                        </span>
                        <div className="flex-1" />
                        <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                          {formatDateTime(a.created_at)}
                        </span>
                      </div>
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">
                        {a.description}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {canAddAction && (
            <>
              <Separator />
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (actionText.trim()) actionMutation.mutate(actionText.trim());
                }}
                className="space-y-2"
              >
                <Textarea
                  rows={3}
                  required
                  value={actionText}
                  onChange={(e) => setActionText(e.target.value)}
                  placeholder={
                    isDemandeur
                      ? "Ajouter une précision pour le technicien…"
                      : "Ajouter une note d'avancement…"
                  }
                />
                <Button type="submit" size="sm" disabled={actionMutation.isPending}>
                  {actionMutation.isPending ? "Envoi…" : "Ajouter"}
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

const NATURES: TicketNature[] = ["technique", "metier", "assistance", "maintenance"];
const PRIORITES: TicketPriorite[] = ["urgent", "normal", "faible"];

/**
 * Tech-facing edit of a ticket's core fields. Status/assignment/actions have
 * their own flows — this dialog only handles titre, description, nature, and
 * priorité. Empty patches are a no-op on the server.
 */
function EditTicketDialog({
  ticket,
  onSaved,
}: {
  ticket: TicketDetailType;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [titre, setTitre] = useState(ticket.titre);
  const [description, setDescription] = useState(ticket.description);
  const [nature, setNature] = useState<TicketNature>(ticket.nature);
  const [priorite, setPriorite] = useState<TicketPriorite>(ticket.priorite);

  const mutation = useMutation({
    mutationFn: (payload: TicketUpdate) => updateTicket(ticket.id, payload),
    onSuccess: () => {
      onSaved();
      toast.success("Ticket mis à jour.");
      setOpen(false);
    },
    onError: (e) => toast.error(apiError(e, "Action refusée.")),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          // Re-hydrate from the latest ticket on every open so a background
          // refetch doesn't get overwritten by stale draft state.
          setTitre(ticket.titre);
          setDescription(ticket.description);
          setNature(ticket.nature);
          setPriorite(ticket.priorite);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Pencil className="h-4 w-4" />
          Modifier
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier le ticket</DialogTitle>
          <DialogDescription>
            Ajuster le titre, la description, la nature ou la priorité. Le statut
            et l'assignation ont leurs propres actions.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const patch: TicketUpdate = {};
            if (titre.trim() && titre.trim() !== ticket.titre) {
              patch.titre = titre.trim();
            }
            if (description.trim() && description !== ticket.description) {
              patch.description = description;
            }
            if (nature !== ticket.nature) patch.nature = nature;
            if (priorite !== ticket.priorite) patch.priorite = priorite;
            if (Object.keys(patch).length === 0) {
              setOpen(false);
              return;
            }
            mutation.mutate(patch);
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="edit-ticket-titre">Titre</Label>
            <Input
              id="edit-ticket-titre"
              required
              maxLength={200}
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-ticket-desc">Description</Label>
            <Textarea
              id="edit-ticket-desc"
              required
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Nature</Label>
              <Select
                value={nature}
                onValueChange={(v) => setNature(v as TicketNature)}
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
                value={priorite}
                onValueChange={(v) => setPriorite(v as TicketPriorite)}
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
