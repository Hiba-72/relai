import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { apiError } from "@/lib/errors";
import { getServices } from "@/api/services";
import { createEquipement } from "@/api/equipements";
import { ETAT_LABEL, TYPE_LABEL } from "@/lib/format";
import type {
  EquipementCreate,
  EquipementEtat,
  EquipementType,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export function NewEquipementPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState<EquipementCreate>({
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

  const { data: services } = useQuery({
    queryKey: ["services"],
    queryFn: getServices,
  });

  const mutation = useMutation({
    mutationFn: createEquipement,
    onSuccess: (eq) => {
      qc.invalidateQueries({ queryKey: ["equipements"] });
      toast.success(`Équipement « ${eq.reference} » créé.`);
      navigate(`/equipements/${eq.id}`);
    },
    onError: (e) => toast.error(apiError(e, "Erreur lors de la création.")),
  });

  const update = <K extends keyof EquipementCreate>(
    k: K,
    v: EquipementCreate[K],
  ) => setForm((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      ...form,
      n_serie: form.n_serie || null,
      code_barre: form.code_barre || null,
      inventaire: form.inventaire || null,
      notes: form.notes || null,
    });
  };

  return (
    <div className="max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/equipements")}>
        <ChevronLeft className="h-4 w-4" />
        Retour aux équipements
      </Button>

      <div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          Nouvel équipement
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Inscrire un nouvel actif à l'inventaire de l'unité informatique.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="reference">Référence</Label>
                <Input
                  id="reference"
                  required
                  value={form.reference}
                  onChange={(e) => update("reference", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="n_serie">N° de série</Label>
                <Input
                  id="n_serie"
                  value={form.n_serie ?? ""}
                  onChange={(e) => update("n_serie", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inventaire">Inventaire</Label>
                <Input
                  id="inventaire"
                  value={form.inventaire ?? ""}
                  onChange={(e) => update("inventaire", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="code_barre">Code-barres</Label>
                <Input
                  id="code_barre"
                  value={form.code_barre ?? ""}
                  onChange={(e) => update("code_barre", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => update("type", v as EquipementType)}
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
                  value={form.etat ?? "operationnel"}
                  onValueChange={(v) => update("etat", v as EquipementEtat)}
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
                  required
                  value={form.marque}
                  onChange={(e) => update("marque", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="modele">Modèle</Label>
                <Input
                  id="modele"
                  required
                  value={form.modele}
                  onChange={(e) => update("modele", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Service</Label>
              <Select
                value={form.service_id || ""}
                onValueChange={(v) => {
                  update("service_id", v);
                  // Service changed → drop any incompatible poste selection.
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

            <div className="space-y-1.5">
              <Label>Poste (optionnel)</Label>
              <PostePicker
                value={form.poste_id ?? null}
                serviceId={form.service_id || null}
                services={services ?? []}
                onChange={(pid) => update("poste_id", pid)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={3}
                value={form.notes ?? ""}
                onChange={(e) => update("notes", e.target.value)}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Création…" : "Créer l'équipement"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/equipements")}
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
