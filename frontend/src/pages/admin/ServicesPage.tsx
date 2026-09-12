import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { apiError } from "@/lib/errors";
import { ChevronRight, Pencil, Trash2 } from "lucide-react";
import {
  createService,
  deleteService,
  getServiceUsage,
  getServices,
  updateService,
} from "@/api/services";
import { CRITICITE_LABEL, ETAGE_LABEL } from "@/lib/format";
import type {
  Etage,
  ServiceCreate,
  ServiceRead,
  ServiceUpdate,
} from "@/types";
import { AdminTabs } from "@/components/AdminTabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const ETAGES: Etage[] = ["sous_sol", "rdc", "etage_1", "etage_2"];
const CRITICITE_LEVELS = [0, 1, 2, 3] as const;
const EMPTY_FORM: ServiceCreate = {
  nom: "",
  sous_reseau: "",
  etage: "rdc",
  niveau_criticite: 1,
};

export function ServicesPage() {
  const qc = useQueryClient();
  const { data: services, isLoading } = useQuery({
    queryKey: ["services"],
    queryFn: getServices,
  });

  const [form, setForm] = useState<ServiceCreate>(EMPTY_FORM);

  const createMutation = useMutation({
    mutationFn: createService,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["services"] });
      toast.success("Service créé.");
      setForm(EMPTY_FORM);
    },
    onError: (e) => toast.error(apiError(e, "Erreur de création.")),
  });

  return (
    <div className="space-y-6 max-w-5xl">
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
          <CardTitle className="text-base">Nouveau service</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate(form);
            }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="nom">Nom</Label>
              <Input
                id="nom"
                required
                placeholder="ex. Radiologie"
                value={form.nom}
                onChange={(e) =>
                  setForm((p) => ({ ...p, nom: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sous_reseau">Sous-réseau</Label>
              <Input
                id="sous_reseau"
                required
                placeholder="ex. 192.168.10.0/24"
                value={form.sous_reseau}
                onChange={(e) =>
                  setForm((p) => ({ ...p, sous_reseau: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Étage</Label>
              <Select
                value={form.etage}
                onValueChange={(v) =>
                  setForm((p) => ({ ...p, etage: v as Etage }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ETAGES.map((e) => (
                    <SelectItem key={e} value={e}>
                      {ETAGE_LABEL[e]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label>Niveau de criticité</Label>
              <Select
                value={String(form.niveau_criticite ?? 1)}
                onValueChange={(v) =>
                  setForm((p) => ({ ...p, niveau_criticite: Number(v) }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRITICITE_LEVELS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} — {CRITICITE_LABEL[n]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Plus le service est critique, plus la priorité des tickets
                ouverts par ses demandeurs sera élevée.
              </p>
            </div>
            <div className="sm:col-span-3">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Création…" : "Créer le service"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-full">Nom</TableHead>
                <TableHead className="whitespace-nowrap">Sous-réseau</TableHead>
                <TableHead className="whitespace-nowrap">Étage</TableHead>
                <TableHead className="whitespace-nowrap">Criticité</TableHead>
                <TableHead className="whitespace-nowrap text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-muted-foreground py-6 text-center"
                  >
                    Chargement…
                  </TableCell>
                </TableRow>
              )}
              {services?.length === 0 && !isLoading && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-muted-foreground py-6 text-center"
                  >
                    Aucun service.
                  </TableCell>
                </TableRow>
              )}
              {services?.map((s) => (
                <ServiceRow key={s.id} service={s} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ServiceRow({ service }: { service: ServiceRead }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Inline criticité change — mirror the pattern used for user role in the
  // Users page (no dialog for such a common tweak).
  const criticiteMutation = useMutation({
    mutationFn: (n: number) =>
      updateService(service.id, { niveau_criticite: n }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
      toast.success(`Criticité de « ${service.nom} » mise à jour.`);
    },
    onError: (e) => toast.error(apiError(e, "Erreur.")),
  });

  return (
    <TableRow
      onClick={() => navigate(`/admin/services/${service.id}`)}
      className="cursor-pointer"
    >
      <TableCell className="font-medium">
        <div className="flex items-center gap-1.5">
          {service.nom}
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground tabular-nums">
        {service.sous_reseau}
      </TableCell>
      <TableCell>{ETAGE_LABEL[service.etage]}</TableCell>
      <TableCell
        className="whitespace-nowrap"
        onClick={(e) => e.stopPropagation()}
      >
        <Select
          value={String(service.niveau_criticite)}
          onValueChange={(v) => criticiteMutation.mutate(Number(v))}
          disabled={criticiteMutation.isPending}
        >
          <SelectTrigger className="w-[16.25rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[0, 1, 2, 3].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} — {CRITICITE_LABEL[n]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        {/* Stop propagation so opening a dialog doesn't also fire the row navigation. */}
        <div
          className="flex items-center justify-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <EditServiceDialog service={service} />
          <DeleteServiceDialog service={service} />
        </div>
      </TableCell>
    </TableRow>
  );
}

function EditServiceDialog({ service }: { service: ServiceRead }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ServiceUpdate>({
    nom: service.nom,
    sous_reseau: service.sous_reseau,
    etage: service.etage,
    niveau_criticite: service.niveau_criticite,
  });

  const mutation = useMutation({
    mutationFn: (data: ServiceUpdate) => updateService(service.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["services"] });
      // Postes, equipements and tickets all embed the service object — bust
      // their caches so renames propagate immediately.
      qc.invalidateQueries({ queryKey: ["postes"] });
      qc.invalidateQueries({ queryKey: ["equipements"] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
      toast.success("Service mis à jour.");
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
            nom: service.nom,
            sous_reseau: service.sous_reseau,
            etage: service.etage,
            niveau_criticite: service.niveau_criticite,
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
          <DialogTitle>Modifier le service</DialogTitle>
          <DialogDescription>
            Les changements s'appliquent immédiatement à tous les postes,
            équipements et tickets liés.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(draft);
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="edit-nom">Nom</Label>
            <Input
              id="edit-nom"
              required
              value={draft.nom ?? ""}
              onChange={(e) =>
                setDraft((p) => ({ ...p, nom: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-reseau">Sous-réseau</Label>
            <Input
              id="edit-reseau"
              required
              value={draft.sous_reseau ?? ""}
              onChange={(e) =>
                setDraft((p) => ({ ...p, sous_reseau: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Étage</Label>
            <Select
              value={draft.etage ?? service.etage}
              onValueChange={(v) =>
                setDraft((p) => ({ ...p, etage: v as Etage }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ETAGES.map((e) => (
                  <SelectItem key={e} value={e}>
                    {ETAGE_LABEL[e]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Niveau de criticité</Label>
            <Select
              value={String(draft.niveau_criticite ?? service.niveau_criticite)}
              onValueChange={(v) =>
                setDraft((p) => ({ ...p, niveau_criticite: Number(v) }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CRITICITE_LEVELS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} — {CRITICITE_LABEL[n]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
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

function DeleteServiceDialog({ service }: { service: ServiceRead }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  // Only fetch usage when the dialog opens — avoids hammering the API for
  // every row on render.
  const { data: usage, isLoading } = useQuery({
    queryKey: ["service-usage", service.id],
    queryFn: () => getServiceUsage(service.id),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: () => deleteService(service.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["services"] });
      toast.success(`Service « ${service.nom} » supprimé.`);
      setOpen(false);
    },
    onError: (e) => toast.error(apiError(e, "Erreur de suppression.")),
  });

  const totalRefs =
    (usage?.postes ?? 0) + (usage?.equipements ?? 0) + (usage?.tickets ?? 0);
  const blocked = totalRefs > 0;

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
          <AlertDialogTitle>
            Supprimer le service « {service.nom} » ?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {isLoading && <p>Vérification des références…</p>}
              {!isLoading && usage && !blocked && (
                <p>
                  Aucun poste, équipement ou ticket n'est rattaché à ce
                  service. La suppression est définitive.
                </p>
              )}
              {!isLoading && usage && blocked && (
                <>
                  <p>
                    Ce service est référencé par :
                  </p>
                  <ul className="list-disc pl-5">
                    {usage.postes > 0 && (
                      <li>
                        {usage.postes} poste{usage.postes > 1 ? "s" : ""}
                      </li>
                    )}
                    {usage.equipements > 0 && (
                      <li>
                        {usage.equipements} équipement
                        {usage.equipements > 1 ? "s" : ""}
                      </li>
                    )}
                    {usage.tickets > 0 && (
                      <li>
                        {usage.tickets} ticket
                        {usage.tickets > 1 ? "s" : ""}
                      </li>
                    )}
                  </ul>
                  <p>
                    Réaffectez-les à un autre service avant de pouvoir
                    supprimer celui-ci.
                  </p>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
            disabled={blocked || isLoading || mutation.isPending}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            {mutation.isPending ? "Suppression…" : "Supprimer"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
