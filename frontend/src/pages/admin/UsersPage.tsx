import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiError } from "@/lib/errors";
import { KeyRound, Pencil } from "lucide-react";
import {
  createUser,
  getUsers,
  resetUserPassword,
  updateUser,
} from "@/api/users";
import { getServices } from "@/api/services";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PostePicker } from "@/components/PostePicker";
import { ROLE_LABEL } from "@/lib/format";
import type {
  Role,
  ServiceRead,
  UserCreate,
  UserRead,
  UserUpdate,
} from "@/types";
import { Badge } from "@/components/ui/badge";
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
import { AdminTabs } from "@/components/AdminTabs";

const ROLES: Role[] = ["admin", "informaticien", "demandeur"];

export function UsersPage() {
  const qc = useQueryClient();
  const { data: users, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: getUsers,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UserUpdate }) =>
      updateUser(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("Utilisateur mis à jour.");
    },
    onError: (e) => toast.error(apiError(e, "Erreur.")),
  });

  const { data: services } = useQuery({
    queryKey: ["services"],
    queryFn: getServices,
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("Utilisateur créé.");
      setForm({
        email: "",
        full_name: "",
        password: "",
        role: "informaticien",
        poste_id: null,
      });
      setServiceId("");
    },
    onError: (e) => toast.error(apiError(e, "Erreur de création.")),
  });

  const [form, setForm] = useState<UserCreate>({
    email: "",
    full_name: "",
    password: "",
    role: "informaticien",
    poste_id: null,
  });
  // Service acts as scope for the PostePicker; only used for demandeur creation.
  const [serviceId, setServiceId] = useState<string>("");

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
          <CardTitle className="text-base">Nouvel utilisateur</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate(form);
            }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Nom complet</Label>
              <Input
                id="full_name"
                required
                value={form.full_name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, full_name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Mot de passe (≥ 8 caractères)</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) =>
                  setForm((p) => ({ ...p, password: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rôle</Label>
              <Select
                value={form.role ?? "informaticien"}
                onValueChange={(v) => {
                  const newRole = v as Role;
                  setForm((p) => ({
                    ...p,
                    role: newRole,
                    // Switching away from demandeur clears the poste pin.
                    poste_id: newRole === "demandeur" ? p.poste_id : null,
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.role === "demandeur" && (
              <>
                <div className="space-y-1.5">
                  <Label>Service du poste</Label>
                  <Select
                    value={serviceId || ""}
                    onValueChange={(v) => {
                      setServiceId(v);
                      // Service changed → poste selection is no longer valid.
                      setForm((p) => ({ ...p, poste_id: null }));
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
                  <Label>Poste rattaché</Label>
                  <PostePicker
                    value={form.poste_id ?? null}
                    serviceId={serviceId || null}
                    services={services ?? []}
                    onChange={(pid) =>
                      setForm((p) => ({ ...p, poste_id: pid }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Le demandeur ne pourra ouvrir des tickets que depuis ce poste.
                  </p>
                </div>
              </>
            )}

            <div className="sm:col-span-2">
              <Button
                type="submit"
                disabled={
                  createMutation.isPending ||
                  (form.role === "demandeur" && !form.poste_id)
                }
              >
                {createMutation.isPending ? "Création…" : "Créer l'utilisateur"}
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
                <TableHead>Nom complet</TableHead>
                <TableHead className="w-full">Email</TableHead>
                <TableHead className="whitespace-nowrap">Rôle</TableHead>
                <TableHead className="whitespace-nowrap">Statut</TableHead>
                <TableHead className="whitespace-nowrap text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground py-6">
                    Chargement…
                  </TableCell>
                </TableRow>
              )}
              {users?.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  services={services ?? []}
                  onChange={(data) => updateMutation.mutate({ id: u.id, data })}
                  pending={updateMutation.isPending}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function UserRow({
  user,
  services,
  onChange,
  pending,
}: {
  user: UserRead;
  services: ServiceRead[];
  onChange: (data: UserUpdate) => void;
  pending: boolean;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">
        {user.full_name}
        {user.role === "demandeur" && user.poste_id === null && (
          <div className="text-xs text-destructive mt-0.5">
            Aucun poste rattaché
          </div>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">{user.email}</TableCell>
      <TableCell>
        <Select
          value={user.role}
          onValueChange={(v) => onChange({ role: v as Role })}
          disabled={pending}
        >
          <SelectTrigger className="w-[11.875rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Badge variant={user.is_active ? "secondary" : "muted"}>
          {user.is_active ? "Actif" : "Inactif"}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-center gap-2">
          <EditUserDialog
            user={user}
            services={services}
            onSave={onChange}
            pending={pending}
          />
          <ResetPasswordDialog userId={user.id} userName={user.full_name} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => onChange({ is_active: !user.is_active })}
            disabled={pending}
          >
            {user.is_active ? "Désactiver" : "Réactiver"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function EditUserDialog({
  user,
  services,
  onSave,
  pending,
}: {
  user: UserRead;
  services: ServiceRead[];
  onSave: (data: UserUpdate) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(user.email);
  const [fullName, setFullName] = useState(user.full_name);
  // Poste editing state — only meaningful when user.role === "demandeur".
  // We start with no service picked; PostePicker will show the current poste
  // once loaded via its own query.
  const [posteId, setPosteId] = useState<string | null>(user.poste_id ?? null);
  const [serviceId, setServiceId] = useState<string>("");

  const isDemandeur = user.role === "demandeur";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setEmail(user.email);
          setFullName(user.full_name);
          setPosteId(user.poste_id ?? null);
          setServiceId("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Modifier l'utilisateur">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier l'utilisateur</DialogTitle>
          <DialogDescription>
            Mettre à jour <strong>{user.full_name}</strong>.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const patch: UserUpdate = {};
            if (fullName.trim() && fullName.trim() !== user.full_name) {
              patch.full_name = fullName.trim();
            }
            if (email.trim() && email.trim() !== user.email) {
              patch.email = email.trim();
            }
            if (isDemandeur && posteId !== (user.poste_id ?? null)) {
              patch.poste_id = posteId;
            }
            if (Object.keys(patch).length === 0) {
              setOpen(false);
              return;
            }
            onSave(patch);
            setOpen(false);
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Nom complet</Label>
            <Input
              id="edit-name"
              required
              minLength={2}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {isDemandeur && (
            <>
              <div className="space-y-1.5">
                <Label>Service du poste</Label>
                <Select
                  value={serviceId || ""}
                  onValueChange={(v) => {
                    setServiceId(v);
                    setPosteId(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="— choisir pour changer le poste —" />
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
                <Label>Poste rattaché</Label>
                <PostePicker
                  value={posteId}
                  serviceId={serviceId || null}
                  services={services}
                  onChange={setPosteId}
                />
              </div>
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={pending || (isDemandeur && !posteId)}
            >
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");

  const mutation = useMutation({
    mutationFn: () => resetUserPassword(userId, pwd),
    onSuccess: () => {
      toast.success(`Mot de passe réinitialisé pour ${userName}.`);
      setPwd("");
      setConfirm("");
      setOpen(false);
    },
    onError: (e) => toast.error(apiError(e, "Erreur.")),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setPwd("");
          setConfirm("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Réinitialiser le mot de passe">
          <KeyRound className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
          <DialogDescription>
            Définir un nouveau mot de passe pour <strong>{userName}</strong>.
            Transmettez-le à l'utilisateur en personne ou via un canal sûr.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pwd !== confirm) {
              toast.error("La confirmation ne correspond pas.");
              return;
            }
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="new-pwd">Nouveau mot de passe</Label>
            <Input
              id="new-pwd"
              type="password"
              required
              minLength={8}
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-pwd">Confirmer</Label>
            <Input
              id="confirm-pwd"
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
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
              {mutation.isPending ? "Réinitialisation…" : "Réinitialiser"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
