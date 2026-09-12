import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { Archive, ChevronLeft, History, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiError } from "@/lib/errors";
import {
  archiveEquipement,
  deleteEquipementPermanently,
  getEquipement,
  getEquipementHistory,
  updateEquipement,
} from "@/api/equipements";
import { getPostes } from "@/api/postes";
import { getServices } from "@/api/services";
import { getTickets } from "@/api/tickets";
import { useAuthStore } from "@/store/authStore";
import {
  ETAT_LABEL,
  FIELD_LABEL,
  NATURE_LABEL,
  STATUT_LABEL,
  TYPE_LABEL,
  etatBadgeVariant,
  formatDateTime,
  statutBadgeVariant,
} from "@/lib/format";
import type {
  EquipementEtat,
  EquipementType,
  EquipementUpdate,
  PosteRead,
  ServiceRead,
} from "@/types";
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
import { PostePicker } from "@/components/PostePicker";

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

export function EquipementDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";

  const { data: equipement, isLoading } = useQuery({
    queryKey: ["equipement", id],
    queryFn: () => getEquipement(id),
    enabled: !!id,
  });

  const { data: services } = useQuery({
    queryKey: ["services"],
    queryFn: getServices,
  });

  // Loaded so the history view can resolve poste_id UUIDs to a "nom (salle)"
  // label. The list is small (a few hundred at most) so fetching once is fine.
  const { data: allPostes } = useQuery({
    queryKey: ["postes", "all"],
    queryFn: () => getPostes(),
  });

  const { data: history } = useQuery({
    queryKey: ["equipement", id, "history"],
    queryFn: () => getEquipementHistory(id),
    enabled: !!id,
  });

  const { data: linkedTickets } = useQuery({
    queryKey: ["tickets", { equipement_id: id }],
    queryFn: async () => (await getTickets({ equipement_id: id })).items,
    enabled: !!id,
  });

  const [form, setForm] = useState<EquipementUpdate>({});

  // Hydrates the edit form once the query resolves. This is the sanctioned
  // "sync with an external system" case: the form is a draft buffer seeded
  // from server data, not state derived from it — the user edits it freely
  // afterwards, so it can't be computed during render.
  useEffect(() => {
    if (equipement) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({
        reference: equipement.reference,
        n_serie: equipement.n_serie ?? "",
        code_barre: equipement.code_barre ?? "",
        inventaire: equipement.inventaire ?? "",
        type: equipement.type,
        marque: equipement.marque,
        modele: equipement.modele,
        service_id: equipement.service_id,
        poste_id: equipement.poste_id,
        etat: equipement.etat,
        processeur: equipement.processeur ?? "",
        ram_go: equipement.ram_go,
        disque_go: equipement.disque_go,
        systeme_exploitation: equipement.systeme_exploitation ?? "",
        ecran_pouces: equipement.ecran_pouces,
        notes: equipement.notes ?? "",
      });
    }
  }, [equipement]);

  const updateMutation = useMutation({
    mutationFn: (data: EquipementUpdate) => updateEquipement(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipement", id] });
      qc.invalidateQueries({ queryKey: ["equipement", id, "history"] });
      qc.invalidateQueries({ queryKey: ["equipements"] });
      toast.success("Équipement mis à jour.");
    },
    onError: (e) => toast.error(apiError(e, "Erreur d'enregistrement.")),
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveEquipement(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipements"] });
      toast.success("Équipement archivé (réformé).");
      navigate("/equipements");
    },
    onError: (e) => toast.error(apiError(e, "Erreur d'archivage.")),
  });

  const hardDeleteMutation = useMutation({
    mutationFn: () => deleteEquipementPermanently(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipements"] });
      toast.success("Équipement supprimé définitivement.");
      navigate("/equipements");
    },
    onError: (e) => toast.error(apiError(e, "Erreur de suppression.")),
  });

  if (isLoading)
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (!equipement)
    return <p className="text-sm text-destructive">Équipement introuvable.</p>;

  const upd = <K extends keyof EquipementUpdate>(k: K, v: EquipementUpdate[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  // History stores raw FK ids and raw enum values. Resolve them to the same
  // labels the rest of the UI uses so the audit log is actually readable.
  const formatHistoryValue = (field: string, raw: string | null): string => {
    if (raw === null || raw === "") return "—";
    switch (field) {
      case "type":
        return TYPE_LABEL[raw as EquipementType] ?? raw;
      case "etat":
        return ETAT_LABEL[raw as EquipementEtat] ?? raw;
      case "service_id":
        return services?.find((s: ServiceRead) => s.id === raw)?.nom ?? raw;
      case "poste_id": {
        const p = allPostes?.find((p: PosteRead) => p.id === raw);
        return p ? `${p.nom} (${p.salle})` : raw;
      }
      default:
        return raw;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Empty strings become null for nullable identifier fields.
    updateMutation.mutate({
      ...form,
      n_serie: form.n_serie || null,
      code_barre: form.code_barre || null,
      inventaire: form.inventaire || null,
      notes: form.notes || null,
    });
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <Button variant="ghost" size="sm" onClick={() => navigate("/equipements")}>
        <ChevronLeft className="h-4 w-4" />
        Retour aux équipements
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-2xl">{equipement.reference}</CardTitle>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant={etatBadgeVariant(equipement.etat)}>
                  {ETAT_LABEL[equipement.etat]}
                </Badge>
                <Badge variant="outline">{TYPE_LABEL[equipement.type]}</Badge>
                {equipement.poste && (
                  <Badge variant="muted">
                    {equipement.poste.salle}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Inscrit le {formatDateTime(equipement.created_at)} ·{" "}
                Sous-réseau {equipement.service.sous_reseau}
              </p>
            </div>
            {isAdmin && (
              <div className="flex flex-wrap items-center gap-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                    >
                      <Archive className="h-4 w-4" />
                      Archiver
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Archiver cet équipement ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        L'équipement sera marqué « réformé ». Il ne sera pas
                        supprimé et reste visible dans l'historique.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => archiveMutation.mutate()}
                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                      >
                        Archiver
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                    >
                      <Trash2 className="h-4 w-4" />
                      Supprimer
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Supprimer définitivement ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Cette action est <strong>irréversible</strong>. L'équipement
                        et son historique seront supprimés de la base de données.
                        Les tickets qui y étaient liés seront conservés mais
                        perdront la référence à cet équipement.
                        {(linkedTickets?.length ?? 0) > 0 && (
                          <>
                            {" "}Il y a actuellement <strong>{linkedTickets?.length}</strong>
                            {" "}ticket(s) lié(s) — préférez « Archiver » si vous
                            n'êtes pas sûr.
                          </>
                        )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => hardDeleteMutation.mutate()}
                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                      >
                        Supprimer définitivement
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="reference">Référence</Label>
                <Input
                  id="reference"
                  value={form.reference ?? ""}
                  onChange={(e) => upd("reference", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="n_serie">N° de série</Label>
                <Input
                  id="n_serie"
                  value={form.n_serie ?? ""}
                  onChange={(e) => upd("n_serie", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inventaire">Inventaire</Label>
                <Input
                  id="inventaire"
                  value={form.inventaire ?? ""}
                  onChange={(e) => upd("inventaire", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="code_barre">Code-barres</Label>
                <Input
                  id="code_barre"
                  value={form.code_barre ?? ""}
                  onChange={(e) => upd("code_barre", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={form.type ?? equipement.type}
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
              </div>
              <div className="space-y-1.5">
                <Label>État</Label>
                <Select
                  value={form.etat ?? equipement.etat}
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="marque">Marque</Label>
                <Input
                  id="marque"
                  value={form.marque ?? ""}
                  onChange={(e) => upd("marque", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="modele">Modèle</Label>
                <Input
                  id="modele"
                  value={form.modele ?? ""}
                  onChange={(e) => upd("modele", e.target.value)}
                />
              </div>
            </div>

            {/* Tech specs — sourced from CSV for PCs/serveurs (CPU/RAM/disk/OS)
                and screens (size). Editable for any equipement; leave blank
                for types that don't apply. */}
            <div className="space-y-3 rounded-md border border-border bg-muted/20 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Spécifications techniques
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="processeur">Processeur</Label>
                  <Input
                    id="processeur"
                    placeholder="ex. i5, Xeon E-2224"
                    value={form.processeur ?? ""}
                    onChange={(e) => upd("processeur", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="systeme_exploitation">Système d'exploitation</Label>
                  <Input
                    id="systeme_exploitation"
                    placeholder="ex. Windows 10, Ubuntu 22.04"
                    value={form.systeme_exploitation ?? ""}
                    onChange={(e) => upd("systeme_exploitation", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ram_go">RAM (Go)</Label>
                  <Input
                    id="ram_go"
                    type="number"
                    min={0}
                    value={form.ram_go ?? ""}
                    onChange={(e) =>
                      upd("ram_go", e.target.value === "" ? null : Number(e.target.value))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="disque_go">Disque (Go)</Label>
                  <Input
                    id="disque_go"
                    type="number"
                    min={0}
                    value={form.disque_go ?? ""}
                    onChange={(e) =>
                      upd("disque_go", e.target.value === "" ? null : Number(e.target.value))
                    }
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ecran_pouces">Taille écran (pouces)</Label>
                  <Input
                    id="ecran_pouces"
                    type="number"
                    min={0}
                    className="max-w-[15.625rem]"
                    value={form.ecran_pouces ?? ""}
                    onChange={(e) =>
                      upd("ecran_pouces", e.target.value === "" ? null : Number(e.target.value))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Service</Label>
              <Select
                value={form.service_id ?? equipement.service_id}
                onValueChange={(v) => {
                  upd("service_id", v);
                  // Service changed → drop any incompatible poste selection.
                  if (v !== (form.service_id ?? equipement.service_id)) {
                    upd("poste_id", null);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
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

            <div className="space-y-1.5">
              <Label>Poste (optionnel)</Label>
              <PostePicker
                value={form.poste_id ?? null}
                serviceId={form.service_id ?? equipement.service_id}
                services={services ?? []}
                onChange={(pid) => upd("poste_id", pid)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={3}
                value={(form.notes ?? "") as string}
                onChange={(e) => upd("notes", e.target.value)}
              />
            </div>

            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" />
            Historique des modifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(history?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune modification enregistrée.
            </p>
          ) : (
            <ol className="space-y-3">
              {history?.map((h) => (
                <li
                  key={h.id}
                  className="text-sm border-l-2 border-primary/40 pl-4"
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="font-medium">
                      {FIELD_LABEL[h.field] ?? h.field}
                    </span>
                    <span className="text-muted-foreground line-through">
                      {formatHistoryValue(h.field, h.old_value)}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-medium">
                      {formatHistoryValue(h.field, h.new_value)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {h.changed_by_user.full_name} · {formatDateTime(h.changed_at)}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-3 py-4">
          <CardTitle className="text-base">Tickets liés</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(linkedTickets?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground px-6 pb-6">
              Aucun ticket lié à cet équipement.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-full">Titre</TableHead>
                  <TableHead className="whitespace-nowrap">Nature</TableHead>
                  <TableHead className="whitespace-nowrap">Statut</TableHead>
                  <TableHead className="whitespace-nowrap">Assigné à</TableHead>
                  <TableHead className="whitespace-nowrap">Créé le</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linkedTickets?.map((t) => (
                  <TableRow
                    key={t.id}
                    onClick={() => navigate(`/tickets/${t.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-medium">{t.titre}</TableCell>
                    <TableCell>{NATURE_LABEL[t.nature]}</TableCell>
                    <TableCell>
                      <Badge variant={statutBadgeVariant(t.statut)}>
                        {STATUT_LABEL[t.statut]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {t.assigned_to_user?.full_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(t.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
