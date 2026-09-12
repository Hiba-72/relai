import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { apiError } from "@/lib/errors";
import { ChevronLeft, Pencil, Trash2 } from "lucide-react";
import {
  createPoste,
  deletePoste,
  getPostes,
  updatePoste,
} from "@/api/postes";
import { getServices } from "@/api/services";
import { CRITICITE_LABEL, ETAGE_LABEL } from "@/lib/format";
import type { PosteCreate, PosteRead, PosteUpdate } from "@/types";
import { AdminTabs } from "@/components/AdminTabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const emptyDraft = (serviceId: string): PosteCreate => ({
  nom: "",
  salle: "",
  utilisateur: "",
  service_id: serviceId,
  notes: "",
});

export function ServiceDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // We fetch the whole services list (already cached from ServicesPage) and
  // pick this one, rather than adding a getService(id) endpoint we don't need.
  const { data: services } = useQuery({
    queryKey: ["services"],
    queryFn: getServices,
  });
  const service = services?.find((s) => s.id === id);

  const { data: postes, isLoading } = useQuery({
    queryKey: ["postes", { service_id: id }],
    queryFn: () => getPostes({ service_id: id }),
    enabled: !!id,
  });

  const [draft, setDraft] = useState<PosteCreate>(emptyDraft(id));

  const createMutation = useMutation({
    mutationFn: createPoste,
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["postes"] });
      toast.success(`Poste « ${p.nom} » créé.`);
      setDraft(emptyDraft(id));
    },
    onError: (e) => toast.error(apiError(e, "Erreur de création.")),
  });

  if (!service && services) {
    // Services loaded but no match → bad id
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/services")}>
          <ChevronLeft className="h-4 w-4" />
          Retour aux services
        </Button>
        <p className="text-sm text-destructive">Service introuvable.</p>
      </div>
    );
  }

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

      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/admin/services")}
      >
        <ChevronLeft className="h-4 w-4" />
        Retour aux services
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-2xl">
                {service?.nom ?? "Chargement…"}
              </CardTitle>
              {service && (
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <Badge variant="muted">{ETAGE_LABEL[service.etage]}</Badge>
                  <Badge variant="outline" className="tabular-nums">
                    {service.sous_reseau}
                  </Badge>
                  <Badge variant="secondary">
                    Criticité {service.niveau_criticite} —{" "}
                    {CRITICITE_LABEL[service.niveau_criticite] ?? ""}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nouveau poste</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate({
                ...draft,
                utilisateur: draft.utilisateur || null,
                notes: draft.notes || null,
              });
            }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-nom">Nom du poste</Label>
              <Input
                id="new-nom"
                required
                placeholder="ex. Accueil"
                value={draft.nom}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, nom: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-salle">Salle</Label>
              <Input
                id="new-salle"
                required
                placeholder="ex. Bât. A - 2e - 207"
                value={draft.salle}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, salle: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-user">Utilisateur (optionnel)</Label>
              <Input
                id="new-user"
                placeholder="ex. Dr. Saidi"
                value={draft.utilisateur ?? ""}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, utilisateur: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-notes">Notes (optionnel)</Label>
              <Textarea
                id="new-notes"
                rows={1}
                value={draft.notes ?? ""}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, notes: e.target.value }))
                }
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Création…" : "Créer le poste"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-3 py-4">
          <CardTitle className="text-base">
            Postes ({postes?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-full">Nom</TableHead>
                  <TableHead className="whitespace-nowrap">Salle</TableHead>
                  <TableHead className="whitespace-nowrap">Utilisateur</TableHead>
                  <TableHead className="whitespace-nowrap">Notes</TableHead>
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
                {!isLoading && postes?.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-muted-foreground py-6 text-center"
                    >
                      Aucun poste dans ce service.
                    </TableCell>
                  </TableRow>
                )}
                {postes?.map((p) => (
                  <PosteRow key={p.id} poste={p} />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PosteRow({ poste }: { poste: PosteRead }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{poste.nom}</TableCell>
      <TableCell>{poste.salle}</TableCell>
      <TableCell className="text-muted-foreground">
        {poste.utilisateur ?? "—"}
      </TableCell>
      <TableCell className="text-muted-foreground max-w-[15.625rem] truncate">
        {poste.notes ?? "—"}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-center gap-2">
          <EditPosteDialog poste={poste} />
          <DeletePosteDialog poste={poste} />
        </div>
      </TableCell>
    </TableRow>
  );
}

function EditPosteDialog({ poste }: { poste: PosteRead }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PosteUpdate>({
    nom: poste.nom,
    salle: poste.salle,
    utilisateur: poste.utilisateur ?? "",
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
            <Label htmlFor="edit-salle">Salle</Label>
            <Input
              id="edit-salle"
              required
              value={draft.salle ?? ""}
              onChange={(e) =>
                setDraft((p) => ({ ...p, salle: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-user">Utilisateur (optionnel)</Label>
            <Input
              id="edit-user"
              value={draft.utilisateur ?? ""}
              onChange={(e) =>
                setDraft((p) => ({ ...p, utilisateur: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-notes">Notes (optionnel)</Label>
            <Textarea
              id="edit-notes"
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
          <AlertDialogTitle>
            Supprimer le poste « {poste.nom} » ?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Cette action est définitive. Si des équipements ou des tickets
            sont encore rattachés à ce poste, la suppression sera refusée par
            le serveur — réaffectez-les d'abord.
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
