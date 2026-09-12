import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiError } from "@/lib/errors";
import { Pencil, Search, Trash2 } from "lucide-react";
import {
  createPoste,
  deletePoste,
  getPostes,
  updatePoste,
} from "@/api/postes";
import { getServices } from "@/api/services";
import type {
  PosteCreate,
  PosteFilters,
  PosteRead,
  PosteUpdate,
  ServiceRead,
} from "@/types";
import { AdminTabs } from "@/components/AdminTabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const ANY_SERVICE = "__any__";

/**
 * Cross-service postes admin. Complements the per-service view on
 * ServiceDetailPage: this page shows *every* poste with a service filter,
 * search, and the same edit / delete flow.
 */
export function PostesPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<PosteFilters>({});
  const [createOpen, setCreateOpen] = useState(false);

  const { data: services } = useQuery({
    queryKey: ["services"],
    queryFn: getServices,
  });

  const { data: postes, isLoading } = useQuery({
    queryKey: ["postes", filters],
    queryFn: () => getPostes(filters),
  });

  const serviceById = useMemo(() => {
    const map = new Map<string, ServiceRead>();
    for (const s of services ?? []) map.set(s.id, s);
    return map;
  }, [services]);

  const setFilter = <K extends keyof PosteFilters>(
    k: K,
    v: PosteFilters[K] | undefined,
  ) =>
    setFilters((prev) => {
      const next = { ...prev };
      if (v) next[k] = v;
      else delete next[k];
      return next;
    });

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          Administration
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Comptes et données de référence.
        </p>
      </div>

      <AdminTabs />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-base">Postes ({postes?.length ?? 0})</CardTitle>
            <CreatePosteDialog
              services={services ?? []}
              open={createOpen}
              onOpenChange={setCreateOpen}
              onCreated={() => {
                qc.invalidateQueries({ queryKey: ["postes"] });
                setCreateOpen(false);
              }}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative sm:col-span-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Chercher par nom, salle ou utilisateur…"
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
            <Select
              value={filters.service_id ?? ANY_SERVICE}
              onValueChange={(v) =>
                setFilter("service_id", v === ANY_SERVICE ? undefined : v)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Tous les services" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_SERVICE}>Tous les services</SelectItem>
                {(services ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead className="whitespace-nowrap">Salle</TableHead>
                  <TableHead className="whitespace-nowrap">Utilisateur</TableHead>
                  <TableHead className="whitespace-nowrap">Service</TableHead>
                  <TableHead className="w-full">Notes</TableHead>
                  <TableHead className="whitespace-nowrap text-center">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-muted-foreground py-6 text-center"
                    >
                      Chargement…
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && postes?.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-muted-foreground py-6 text-center"
                    >
                      Aucun poste ne correspond aux filtres.
                    </TableCell>
                  </TableRow>
                )}
                {postes?.map((p) => (
                  <PosteRow
                    key={p.id}
                    poste={p}
                    service={serviceById.get(p.service_id) ?? p.service}
                    services={services ?? []}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PosteRow({
  poste,
  service,
  services,
}: {
  poste: PosteRead;
  service: ServiceRead;
  services: ServiceRead[];
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">{poste.nom}</TableCell>
      <TableCell>{poste.salle}</TableCell>
      <TableCell className="text-muted-foreground">
        {poste.utilisateur ?? "—"}
      </TableCell>
      <TableCell>
        <Badge variant="muted" className="whitespace-nowrap">
          {service?.nom ?? "—"}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground max-w-[18.75rem] truncate">
        {poste.notes ?? "—"}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-center gap-2">
          <EditPosteDialog poste={poste} services={services} />
          <DeletePosteDialog poste={poste} />
        </div>
      </TableCell>
    </TableRow>
  );
}

function CreatePosteDialog({
  services,
  open,
  onOpenChange,
  onCreated,
}: {
  services: ServiceRead[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const emptyDraft = (): PosteCreate => ({
    nom: "",
    salle: "",
    utilisateur: "",
    service_id: services[0]?.id ?? "",
    notes: "",
  });
  const [draft, setDraft] = useState<PosteCreate>(emptyDraft());

  const mutation = useMutation({
    mutationFn: createPoste,
    onSuccess: (p) => {
      toast.success(`Poste « ${p.nom} » créé.`);
      setDraft(emptyDraft());
      onCreated();
    },
    onError: (e) => toast.error(apiError(e, "Erreur de création.")),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) setDraft(emptyDraft());
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">Nouveau poste</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau poste</DialogTitle>
          <DialogDescription>
            Rattachez le poste à un service. Le nom et la salle sont
            obligatoires.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate({
              ...draft,
              utilisateur: draft.utilisateur || null,
              notes: draft.notes || null,
            });
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-poste-nom">Nom</Label>
              <Input
                id="new-poste-nom"
                required
                value={draft.nom}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, nom: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-poste-salle">Salle</Label>
              <Input
                id="new-poste-salle"
                required
                value={draft.salle}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, salle: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-poste-user">Utilisateur (optionnel)</Label>
            <Input
              id="new-poste-user"
              value={draft.utilisateur ?? ""}
              onChange={(e) =>
                setDraft((p) => ({ ...p, utilisateur: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Service</Label>
            <Select
              value={draft.service_id || ""}
              onValueChange={(v) =>
                setDraft((p) => ({ ...p, service_id: v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="— sélectionner —" />
              </SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-poste-notes">Notes (optionnel)</Label>
            <Textarea
              id="new-poste-notes"
              rows={2}
              value={draft.notes ?? ""}
              onChange={(e) =>
                setDraft((p) => ({ ...p, notes: e.target.value }))
              }
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={
                mutation.isPending ||
                !draft.nom ||
                !draft.salle ||
                !draft.service_id
              }
            >
              {mutation.isPending ? "Création…" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditPosteDialog({
  poste,
  services,
}: {
  poste: PosteRead;
  services: ServiceRead[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PosteUpdate>({
    nom: poste.nom,
    salle: poste.salle,
    utilisateur: poste.utilisateur ?? "",
    service_id: poste.service_id,
    notes: poste.notes ?? "",
  });

  const mutation = useMutation({
    mutationFn: (data: PosteUpdate) => updatePoste(poste.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["postes"] });
      qc.invalidateQueries({ queryKey: ["equipements"] });
      toast.success("Poste mis à jour.");
      setOpen(false);
    },
    onError: (e) => toast.error(apiError(e, "Erreur.")),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setDraft({
            nom: poste.nom,
            salle: poste.salle,
            utilisateur: poste.utilisateur ?? "",
            service_id: poste.service_id,
            notes: poste.notes ?? "",
          });
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Modifier">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier le poste</DialogTitle>
          <DialogDescription>
            Les changements s'appliquent immédiatement à tous les équipements
            et tickets liés à ce poste.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate({
              ...draft,
              utilisateur: draft.utilisateur || null,
              notes: draft.notes || null,
            });
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`edit-nom-${poste.id}`}>Nom</Label>
              <Input
                id={`edit-nom-${poste.id}`}
                required
                value={draft.nom ?? ""}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, nom: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`edit-salle-${poste.id}`}>Salle</Label>
              <Input
                id={`edit-salle-${poste.id}`}
                required
                value={draft.salle ?? ""}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, salle: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit-user-${poste.id}`}>Utilisateur (optionnel)</Label>
            <Input
              id={`edit-user-${poste.id}`}
              value={draft.utilisateur ?? ""}
              onChange={(e) =>
                setDraft((p) => ({ ...p, utilisateur: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Service</Label>
            <Select
              value={draft.service_id || ""}
              onValueChange={(v) =>
                setDraft((p) => ({ ...p, service_id: v }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit-notes-${poste.id}`}>Notes (optionnel)</Label>
            <Textarea
              id={`edit-notes-${poste.id}`}
              rows={2}
              value={draft.notes ?? ""}
              onChange={(e) =>
                setDraft((p) => ({ ...p, notes: e.target.value }))
              }
            />
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

function DeletePosteDialog({ poste }: { poste: PosteRead }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () => deletePoste(poste.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["postes"] });
      qc.invalidateQueries({ queryKey: ["equipements"] });
      toast.success(`Poste « ${poste.nom} » supprimé.`);
      setOpen(false);
    },
    onError: (e) => toast.error(apiError(e, "Impossible de supprimer : des équipements ou tickets utilisent ce poste.")),
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          title="Supprimer"
          className="text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer le poste « {poste.nom} » ?</AlertDialogTitle>
          <AlertDialogDescription>
            Cette action est définitive. Si des équipements ou des tickets sont
            encore rattachés à ce poste, la suppression sera refusée par le
            serveur — réaffectez-les d'abord.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
            disabled={mutation.isPending}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            {mutation.isPending ? "Suppression…" : "Supprimer"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
