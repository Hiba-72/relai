import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Download, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { apiError } from "@/lib/errors";
import { exportEquipementsXlsx, getEquipements } from "@/api/equipements";
import { getServices } from "@/api/services";
import {
  ETAT_LABEL,
  TYPE_LABEL,
  etatBadgeVariant,
} from "@/lib/format";
import type {
  EquipementEtat,
  EquipementFilters,
  EquipementType,
} from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

const ALL = "__all__";

export function EquipementsPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<EquipementFilters>({});

  const { data: equipements, isLoading } = useQuery({
    queryKey: ["equipements", filters],
    queryFn: () => getEquipements(filters),
  });

  const { data: services } = useQuery({
    queryKey: ["services"],
    queryFn: getServices,
  });

  const setFilter = <K extends keyof EquipementFilters>(
    key: K,
    value: EquipementFilters[K] | typeof ALL,
  ) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (value === ALL || value === undefined || value === "") delete next[key];
      else next[key] = value as EquipementFilters[K];
      return next;
    });
  };

  const exportMutation = useMutation({
    mutationFn: exportEquipementsXlsx,
    onSuccess: () => toast.success("Export téléchargé."),
    onError: (e) => toast.error(apiError(e, "Erreur d'export.")),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">
            Équipements
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Inventaire des actifs informatiques de l'hôpital.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
          >
            <Download className="h-4 w-4" />
            {exportMutation.isPending ? "Export…" : "Exporter"}
          </Button>
          <Button onClick={() => navigate("/equipements/new")}>
            <Plus className="h-4 w-4" />
            Nouvel équipement
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Recherche
            </Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Référence, n° série, code-barres, inventaire, marque, modèle…"
                value={filters.q ?? ""}
                onChange={(e) =>
                  setFilters((prev) => {
                    const next = { ...prev };
                    if (e.target.value) next.q = e.target.value;
                    else delete next.q;
                    return next;
                  })
                }
                className="pl-8"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <FilterSelect
              label="Type"
              value={filters.type ?? ALL}
              onValueChange={(v) => setFilter("type", v as EquipementType)}
              options={TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
            />
            <FilterSelect
              label="État"
              value={filters.etat ?? ALL}
              onValueChange={(v) => setFilter("etat", v as EquipementEtat)}
              options={ETATS.map((e) => ({ value: e, label: ETAT_LABEL[e] }))}
            />
            <FilterSelect
              label="Service"
              value={filters.service_id ?? ALL}
              onValueChange={(v) => setFilter("service_id", v)}
              options={(services ?? []).map((s) => ({ value: s.id, label: s.nom }))}
            />
            
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Référence</TableHead>
                <TableHead>N° de série</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Marque / Modèle</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>État</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground py-6">
                    Chargement…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (equipements?.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground py-6">
                    Aucun équipement.
                  </TableCell>
                </TableRow>
              )}
              {equipements?.map((e) => (
                <TableRow
                  key={e.id}
                  onClick={() => navigate(`/equipements/${e.id}`)}
                  className="cursor-pointer"
                >
                  <TableCell className="font-medium">{e.reference}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {e.n_serie ?? "—"}
                  </TableCell>
                  <TableCell>{TYPE_LABEL[e.type]}</TableCell>
                  <TableCell>
                    {[e.marque, e.modele].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell>{e.service.nom}</TableCell>
                  <TableCell>
                    <Badge variant={etatBadgeVariant(e.etat)}>
                      {ETAT_LABEL[e.etat]}
                    </Badge>
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
