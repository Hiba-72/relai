import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { apiError } from "@/lib/errors";
import { createPoste, getPoste, getPostes } from "@/api/postes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import type { PosteCreate, ServiceRead } from "@/types";

interface Props {
  value: string | null;
  serviceId: string | null;
  services: ServiceRead[];
  onChange: (posteId: string | null) => void;
}

/**
 * Search-and-pick poste, scoped to a given service. Lets the informaticien
 * find an existing poste by name / salle / utilisateur, OR inline-create a
 * new one (which then auto-selects). Null means "no poste".
 */
export function PostePicker({ value, serviceId, services, onChange }: Props) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<PosteCreate>({
    nom: "",
    salle: "",
    utilisateur: "",
    service_id: serviceId ?? "",
    notes: "",
  });

  const { data: results } = useQuery({
    queryKey: ["postes", { q: query, service_id: serviceId }],
    queryFn: () =>
      getPostes({
        q: query || undefined,
        service_id: serviceId || undefined,
      }),
    enabled: !!serviceId,
  });

  const { data: current } = useQuery({
    queryKey: ["postes", { id: value }],
    queryFn: () => getPoste(value!),
    enabled: !!value,
  });

  const createMutation = useMutation({
    mutationFn: createPoste,
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["postes"] });
      onChange(p.id);
      setCreating(false);
      setQuery("");
      toast.success(`Poste « ${p.nom} » créé.`);
      setDraft({
        nom: "",
        salle: "",
        utilisateur: "",
        service_id: serviceId ?? "",
        notes: "",
      });
    },
    onError: (e) => toast.error(apiError(e, "Erreur création poste.")),
  });

  if (!serviceId) {
    return (
      <p className="text-xs text-muted-foreground">
        Sélectionnez d'abord un service pour pouvoir choisir un poste.
      </p>
    );
  }

  if (value && current) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
        <div className="flex-1">
          <div className="font-medium">{current.nom}</div>
          <div className="text-xs text-muted-foreground">
            {current.salle}
            {current.utilisateur ? ` · ${current.utilisateur}` : ""}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onChange(null)}
          aria-label="Retirer le poste"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Chercher par nom, salle ou utilisateur…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setCreating((v) => !v)}
        >
          {creating ? (
            "Annuler"
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Nouveau
            </>
          )}
        </Button>
      </div>

      {(query || (results && results.length > 0)) && !creating && (
        <div className="max-h-48 overflow-auto rounded-md border border-input">
          {results && results.length > 0 ? (
            <ul>
              {results.map((p) => (
                <li
                  key={p.id}
                  onClick={() => onChange(p.id)}
                  className="cursor-pointer px-3 py-2 text-sm hover:bg-muted"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{p.nom}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.salle}
                        {p.utilisateur ? ` · ${p.utilisateur}` : ""}
                      </div>
                    </div>
                    <Badge variant="muted" className="shrink-0">
                      {p.service.nom}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              Aucun poste trouvé.
            </p>
          )}
        </div>
      )}

      {creating && (
        <Card className="bg-muted/30">
          <CardContent className="pt-4 space-y-3">
            <div className="space-y-1.5">
              <Label>Nom du poste</Label>
              <Input
                placeholder="ex. Accueil radiologie"
                value={draft.nom}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, nom: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Salle</Label>
                <Input
                  placeholder="ex. Bât. A - 2e - 207"
                  value={draft.salle}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, salle: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Utilisateur (optionnel)</Label>
                <Input
                  placeholder="ex. Dr. Saidi"
                  value={draft.utilisateur ?? ""}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, utilisateur: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Service</Label>
              <Select
                value={draft.service_id || serviceId || ""}
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
              <Label>Notes (optionnel)</Label>
              <Textarea
                rows={2}
                value={draft.notes ?? ""}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, notes: e.target.value }))
                }
              />
            </div>
            <Button
              type="button"
              size="sm"
              disabled={
                createMutation.isPending ||
                !draft.nom ||
                !draft.salle ||
                !(draft.service_id || serviceId)
              }
              onClick={() =>
                createMutation.mutate({
                  ...draft,
                  service_id: draft.service_id || (serviceId as string),
                  utilisateur: draft.utilisateur || null,
                  notes: draft.notes || null,
                })
              }
            >
              {createMutation.isPending ? "Création…" : "Créer et sélectionner"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
