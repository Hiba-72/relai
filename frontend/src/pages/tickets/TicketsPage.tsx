import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Archive, CheckCircle2, MapPin, Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { apiError } from "@/lib/errors";
import { getTickets, updateStatus } from "@/api/tickets";
import { getServices } from "@/api/services";
import { useAuthStore } from "@/store/authStore";
import {
  NATURE_LABEL,
  PRIORITE_LABEL,
  STATUT_LABEL,
  formatDateTime,
  formatTicketRef,
  prioriteRail,
  statutBadgeVariant,
  timeAgo,
} from "@/lib/format";
import type {
  TicketFilters,
  TicketNature,
  TicketPriorite,
  TicketRead,
  TicketStatut,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const STATUTS: TicketStatut[] = ["nouveau", "en_cours", "resolu", "cloture", "annule"];
const NATURES: TicketNature[] = ["technique", "metier", "assistance", "maintenance"];
const PRIORITES: TicketPriorite[] = ["urgent", "normal", "faible"];

const PRIORITE_ORDER: Record<TicketPriorite, number> = {
  urgent: 0,
  normal: 1,
  faible: 2,
};

const STATUT_ORDER: Record<TicketStatut, number> = {
  nouveau: 1,
  en_cours: 2,
  resolu: 3,
  cloture: 4,
  annule: 5,
};

const ALL = "__all__";

// One screen's worth of triage. The list endpoint caps at 500 per request;
// "Afficher plus" widens the window rather than paging, so the mine/queue/all
// grouping keeps seeing every loaded ticket at once.
const PAGE_SIZE = 100;

export function TicketsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [filters, setFilters] = useState<TicketFilters>({});
  const [onlyMine, setOnlyMine] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const isInformaticien = user?.role === "informaticien";
  const isAdmin = user?.role === "admin";
  const isStaff = isInformaticien || isAdmin;

  const effectiveFilters: TicketFilters = {
    ...filters,
    limit,
    ...(isAdmin && showArchived ? { archived: true } : {}),
  };

  const { data: page, isLoading } = useQuery({
    queryKey: ["tickets", effectiveFilters],
    queryFn: () => getTickets(effectiveFilters),
  });

  const tickets = page?.items;
  const total = page?.total ?? 0;
  const loaded = tickets?.length ?? 0;
  const hasMore = loaded < total;

  const { data: services } = useQuery({
    queryKey: ["services"],
    queryFn: getServices,
  });

  const setFilter = <K extends keyof TicketFilters>(
    key: K,
    value: TicketFilters[K] | typeof ALL,
  ) => {
    // Narrowing the filters should start from the first page again —
    // otherwise a widened window from a previous filter carries over.
    setLimit(PAGE_SIZE);
    setFilters((prev) => {
      const next = { ...prev };
      if (value === ALL || value === undefined || value === "") delete next[key];
      else next[key] = value as TicketFilters[K];
      return next;
    });
  };

  const takeMutation = useMutation({
    mutationFn: (ticketId: string) => updateStatus(ticketId, "en_cours"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      toast.success("Ticket pris en charge.");
    },
    onError: (e) => toast.error(apiError(e, "Erreur.")),
  });

  const isMineActive = (t: TicketRead) =>
    !!user &&
    t.assigned_to_user?.id === user.id &&
    (t.statut === "nouveau" || t.statut === "en_cours");
  const isPool = (t: TicketRead) =>
    !t.assigned_to_user && t.statut === "nouveau";

  const { mineList, poolList, othersList } = useMemo(() => {
    if (!tickets) return { mineList: [], poolList: [], othersList: [] };
    const byPrio = (a: TicketRead, b: TicketRead) =>
      PRIORITE_ORDER[a.priorite] - PRIORITE_ORDER[b.priorite];
    const byStatutThenRecency = (a: TicketRead, b: TicketRead) => {
      const sd = STATUT_ORDER[a.statut] - STATUT_ORDER[b.statut];
      if (sd !== 0) return sd;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    };
    const mine = tickets.filter(isMineActive).slice().sort(byPrio);
    const pool = tickets
      .filter((t) => isPool(t) && !isMineActive(t))
      .slice()
      .sort(byPrio);
    const others = tickets
      .filter((t) => !isMineActive(t) && !isPool(t))
      .slice()
      .sort(byStatutThenRecency);
    return { mineList: mine, poolList: pool, othersList: others };
  }, [tickets, user]);

  // Demandeurs only see their own tickets (backend-enforced visibility);
  // the three-zone split doesn't apply to them — render a simple table.
  if (user?.role === "demandeur") {
    return (
      <DemandeurView
        navigate={navigate}
        tickets={tickets ?? []}
        isLoading={isLoading}
        services={services ?? []}
        filters={filters}
        setFilter={setFilter}
      />
    );
  }

  const showMine = !showArchived;
  const showPool = isStaff && !onlyMine && !showArchived;
  const showOthers = !onlyMine || showArchived;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight">
            Tickets
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vos interventions, la file d'attente et l'historique.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {isInformaticien && (
            <SegmentedToggle
              value={onlyMine ? "mine" : "all"}
              onChange={(v) => setOnlyMine(v === "mine")}
            />
          )}
          {isAdmin && (
            <Button
              variant={showArchived ? "default" : "outline"}
              onClick={() => setShowArchived((v) => !v)}
            >
              <Archive className="h-4 w-4" />
              {showArchived ? "Actifs" : "Archives"}
            </Button>
          )}
          <Button onClick={() => navigate("/tickets/new")}>
            <Plus className="h-4 w-4" />
            Nouveau ticket
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <FilterSelect
            label="Statut"
            value={filters.statut ?? ALL}
            onValueChange={(v) => setFilter("statut", v as TicketStatut)}
            options={STATUTS.map((s) => ({ value: s, label: STATUT_LABEL[s] }))}
          />
          <FilterSelect
            label="Nature"
            value={filters.nature ?? ALL}
            onValueChange={(v) => setFilter("nature", v as TicketNature)}
            options={NATURES.map((n) => ({ value: n, label: NATURE_LABEL[n] }))}
          />
          <FilterSelect
            label="Priorité"
            value={filters.priorite ?? ALL}
            onValueChange={(v) => setFilter("priorite", v as TicketPriorite)}
            options={PRIORITES.map((p) => ({ value: p, label: PRIORITE_LABEL[p] }))}
          />
          <FilterSelect
            label="Service"
            value={filters.service_id ?? ALL}
            onValueChange={(v) => setFilter("service_id", v)}
            options={(services ?? []).map((s) => ({ value: s.id, label: s.nom }))}
          />
        </CardContent>
      </Card>

      {/* Zone 1: Mes interventions */}
      {showMine && (
        <section>
          <SectionHeader
            label="Mes interventions"
            count={mineList.length}
            helper="assignées à vous · nouveau & en cours"
            tone="primary"
          />
          {mineList.length === 0 ? (
            <EmptyMineCard />
          ) : (
            <TicketRowList>
              {mineList.map((t) => (
                <TicketRow
                  key={t.id}
                  ticket={t}
                  onClick={() => navigate(`/tickets/${t.id}`)}
                />
              ))}
            </TicketRowList>
          )}
        </section>
      )}

      {/* Zone 2: File d'attente */}
      {showPool && (
        <section>
          <SectionHeader
            label="File d'attente"
            count={poolList.length}
            helper="non assignés · à prendre en charge"
            tone="neutral"
          />
          {poolList.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Rien dans la file d'attente.
            </p>
          ) : (
            <TicketRowList>
              {poolList.map((t) => (
                <TicketRow
                  key={t.id}
                  ticket={t}
                  onClick={() => navigate(`/tickets/${t.id}`)}
                  trailing={
                    <Button
                      type="button"
                      size="sm"
                      disabled={takeMutation.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        takeMutation.mutate(t.id);
                      }}
                      className="h-7 px-3 text-xs"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Prendre
                    </Button>
                  }
                />
              ))}
            </TicketRowList>
          )}
        </section>
      )}

      {/* Zone 3: Tous les tickets */}
      {showOthers && (
        <section>
          <SectionHeader
            label={showArchived ? "Tickets archivés" : "Tous les tickets"}
            count={othersList.length}
            tone="neutral"
          />
          <TicketRowList>
            <TicketRowHeader />
            {isLoading && (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                Chargement…
              </div>
            )}
            {!isLoading && othersList.length === 0 && (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                Aucun ticket.
              </div>
            )}
            {othersList.map((t) => (
              <TicketRow
                key={t.id}
                ticket={t}
                onClick={() => navigate(`/tickets/${t.id}`)}
              />
            ))}
          </TicketRowList>
        </section>
      )}

      {hasMore && (
        <div className="flex flex-col items-center gap-2 py-2">
          <p className="text-sm text-muted-foreground tabular-nums">
            {loaded} ticket{loaded > 1 ? "s" : ""} affiché
            {loaded > 1 ? "s" : ""} sur {total}
          </p>
          <Button
            variant="outline"
            onClick={() => setLimit((n) => n + PAGE_SIZE)}
            disabled={isLoading}
          >
            {isLoading ? "Chargement…" : "Afficher plus"}
          </Button>
        </div>
      )}
    </div>
  );
}

// --- subcomponents ---------------------------------------------------------

function SectionHeader({
  label,
  count,
  helper,
  tone,
}: {
  label: string;
  count: number;
  helper?: string;
  tone: "primary" | "neutral";
}) {
  return (
    <div className="mb-3 flex items-baseline gap-2.5">
      <h2
        className={cn(
          "font-serif text-[0.938rem] font-bold tracking-tight",
          tone === "primary" ? "text-primary" : "text-foreground",
        )}
      >
        {label}
      </h2>
      <span className="text-xs text-muted-foreground">
        {count}
        {helper ? ` · ${helper}` : ""}
      </span>
      {/* Rule runs to the edge so the eye reads the sections as bands. */}
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function ShortRef({ numero }: { numero: number }) {
  return (
    <span className="text-[0.75rem] text-muted-foreground tabular-nums">
      {formatTicketRef(numero)}
    </span>
  );
}

// One row shape for every zone.
//
// The three zones previously used three different treatments for the same
// object — cards, dashed cards, and a table — so a ticket looked like a
// different kind of thing depending on where you met it. These columns line
// up across all three.
// Every column is a fixed track. The last one was `auto`, which CSS grid
// resolves per container — the header ("Date") and the rows ("il y a 25 min",
// or the queue's button) each computed a different width, the 1fr title column
// absorbed the slack differently, and the header stopped lining up with its
// own rows. Fixed tracks make every grid in the list resolve identically.
const ROW_GRID =
  "grid grid-cols-[3px_4.5rem_1fr_8rem_6.5rem_7rem] items-center gap-x-4";

function TicketRowList({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {children}
    </div>
  );
}

function HeaderCell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-[0.656rem] font-semibold uppercase tracking-[0.07em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

function TicketRowHeader() {
  return (
    <div className={cn(ROW_GRID, "border-b border-border bg-accent py-2 pr-4")}>
      <div />
      <HeaderCell>Nº</HeaderCell>
      <HeaderCell>Titre</HeaderCell>
      <HeaderCell>Priorité</HeaderCell>
      <HeaderCell>Statut</HeaderCell>
      <HeaderCell className="justify-self-end">Date</HeaderCell>
    </div>
  );
}

/**
 * Priority as a dot and a word, not a second badge.
 *
 * Status already owns the badge shape; two badges side by side compete for the
 * same attention and neither wins. The colour is carried by the rail, the dot
 * and the label together, so priority reads from across the room.
 */
function PrioriteCell({ priorite }: { priorite: TicketPriorite }) {
  const colour = prioriteRail(priorite);
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: colour }}
      />
      <span className="text-xs font-semibold" style={{ color: colour }}>
        {PRIORITE_LABEL[priorite]}
      </span>
    </div>
  );
}

function TicketRow({
  ticket,
  onClick,
  trailing,
}: {
  ticket: TicketRead;
  onClick: () => void;
  /** Replaces the age column — the queue puts its "Prendre" button here. */
  trailing?: React.ReactNode;
}) {
  const assignee = ticket.assigned_to_user?.full_name;

  return (
    <div
      onClick={onClick}
      className={cn(
        ROW_GRID,
        "cursor-pointer border-b border-border/60 py-3 pr-4 transition-colors last:border-b-0 hover:bg-accent",
      )}
    >
      <div
        className="h-8 w-[3px] rounded-r-sm"
        style={{ background: prioriteRail(ticket.priorite) }}
      />
      <ShortRef numero={ticket.numero} />

      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{ticket.titre}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {ticket.service.nom}
            {assignee ? ` · ${assignee}` : ""}
          </span>
        </div>
      </div>

      <PrioriteCell priorite={ticket.priorite} />

      <Badge
        variant={statutBadgeVariant(ticket.statut)}
        className="justify-self-start"
      >
        {STATUT_LABEL[ticket.statut]}
      </Badge>

      <div className="justify-self-end">
        {trailing ?? (
          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {timeAgo(ticket.created_at)}
          </span>
        )}
      </div>
    </div>
  );
}

function EmptyMineCard() {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-border bg-card px-5 py-5">
      <div className="grid place-items-center h-10 w-10 rounded-[0.625rem] bg-[hsl(var(--success-muted))] text-[hsl(var(--success-strong))] shrink-0">
        <CheckCircle2 className="h-5 w-5" />
      </div>
      <div>
        <div className="font-serif text-[1rem] font-semibold">
          Tout est à jour
        </div>
        <div className="text-[0.813rem] text-muted-foreground mt-0.5">
          Aucune intervention active ne vous est assignée pour l'instant.
        </div>
      </div>
    </div>
  );
}

function SegmentedToggle({
  value,
  onChange,
}: {
  value: "mine" | "all";
  onChange: (v: "mine" | "all") => void;
}) {
  const btnBase =
    "border-0 cursor-pointer px-3 py-1.5 rounded-md text-[0.813rem] font-semibold transition-all";
  const active = "bg-card text-primary shadow-sm";
  const idle = "bg-transparent text-muted-foreground";
  return (
    <div className="inline-flex p-[3px] bg-secondary rounded-lg">
      <button
        onClick={() => onChange("mine")}
        className={cn(btnBase, value === "mine" ? active : idle)}
      >
        Mes tickets
      </button>
      <button
        onClick={() => onChange("all")}
        className={cn(btnBase, value === "all" ? active : idle)}
      >
        Tous
      </button>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Tous" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tous</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// --- demandeur fallback ----------------------------------------------------

function DemandeurView({
  navigate,
  tickets,
  isLoading,
  services,
  filters,
  setFilter,
}: {
  navigate: ReturnType<typeof useNavigate>;
  tickets: TicketRead[];
  isLoading: boolean;
  services: { id: string; nom: string }[];
  filters: TicketFilters;
  setFilter: <K extends keyof TicketFilters>(
    k: K,
    v: TicketFilters[K] | typeof ALL,
  ) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight">
            Mes tickets
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Les demandes que vous avez créées.
          </p>
        </div>
        <Button onClick={() => navigate("/tickets/new")}>
          <Plus className="h-4 w-4" />
          Nouveau ticket
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FilterSelect
            label="Statut"
            value={filters.statut ?? ALL}
            onValueChange={(v) => setFilter("statut", v as TicketStatut)}
            options={STATUTS.map((s) => ({ value: s, label: STATUT_LABEL[s] }))}
          />
          <FilterSelect
            label="Nature"
            value={filters.nature ?? ALL}
            onValueChange={(v) => setFilter("nature", v as TicketNature)}
            options={NATURES.map((n) => ({ value: n, label: NATURE_LABEL[n] }))}
          />
          <FilterSelect
            label="Service"
            value={filters.service_id ?? ALL}
            onValueChange={(v) => setFilter("service_id", v)}
            options={services.map((s) => ({ value: s.id, label: s.nom }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-accent">
                <TableHead>Titre</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="whitespace-nowrap text-center">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground py-6">
                    Chargement…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && tickets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground py-6">
                    Aucun ticket.
                  </TableCell>
                </TableRow>
              )}
              {tickets.map((t) => (
                <TableRow
                  key={t.id}
                  onClick={() => navigate(`/tickets/${t.id}`)}
                  className="cursor-pointer"
                >
                  <TableCell className="font-semibold">{t.titre}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.service.nom}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statutBadgeVariant(t.statut)}>
                      {STATUT_LABEL[t.statut]}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-center text-muted-foreground tabular-nums">
                    {formatDateTime(t.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
