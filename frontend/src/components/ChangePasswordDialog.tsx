import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiError } from "@/lib/errors";
import { changeOwnPassword } from "@/api/users";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  trigger: React.ReactNode;
}

export function ChangePasswordDialog({ trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
  };

  const mutation = useMutation({
    mutationFn: () => changeOwnPassword(current, next),
    onSuccess: () => {
      toast.success("Mot de passe modifié.");
      reset();
      setOpen(false);
    },
    onError: (e) => toast.error(apiError(e, "Erreur lors du changement.")),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      toast.error("La confirmation ne correspond pas.");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Changer le mot de passe</DialogTitle>
          <DialogDescription>
            Confirmez votre mot de passe actuel, puis saisissez un nouveau mot
            de passe d'au moins 8 caractères.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="current">Mot de passe actuel</Label>
            <Input
              id="current"
              type="password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="next">Nouveau mot de passe</Label>
            <Input
              id="next"
              type="password"
              required
              minLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirmer le nouveau mot de passe</Label>
            <Input
              id="confirm"
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
              {mutation.isPending ? "Enregistrement…" : "Modifier"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
