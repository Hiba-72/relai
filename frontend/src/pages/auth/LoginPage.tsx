import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeftRight, Check } from "lucide-react";
import { api } from "@/api/client";
import { apiError } from "@/lib/errors";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Why the tool exists, in the words a ward would use. Shown beside the form
// on wide screens; the sign-in itself never depends on it.
const POINTS: { titre: string; desc: string }[] = [
  {
    titre: "Trois clics depuis le service",
    desc: "Le poste et le service sont déjà connus — il ne reste que la nature du problème.",
  },
  {
    titre: "L'urgence est calculée",
    desc: "Réanimation et bloc passent devant, sans que personne ait à cocher « urgent ».",
  },
  {
    titre: "Chaque panne reste liée au matériel",
    desc: "L'historique d'un poste se lit d'un coup d'œil.",
  },
];

export function LoginPage() {
  const navigate = useNavigate();
  const { setTokens, setUser } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const loginMutation = useMutation({
    mutationFn: async (creds: { email: string; password: string }) => {
      const { data } = await api.post("/auth/login", creds);
      return data;
    },
    onSuccess: async (data) => {
      setTokens(data.access_token, data.refresh_token);
      const { data: me } = await api.get("/auth/me", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      setUser(me);
      navigate("/tickets");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ email, password });
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sign-in */}
      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <div className="grid place-items-center h-[3.25rem] w-[3.25rem] rounded-2xl bg-primary text-primary-foreground mb-4">
              <ArrowLeftRight className="h-7 w-7" />
            </div>
            <h1 className="font-serif text-4xl font-bold tracking-tight">
              Relai
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Unité informatique
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Connexion</CardTitle>
              <CardDescription>
                Entrez vos identifiants pour accéder à votre espace.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>

                {loginMutation.isError && (
                  <p className="text-sm text-destructive">
                    {apiError(loginMutation.error, "Identifiants invalides.")}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={loginMutation.isPending}
                  className="w-full"
                >
                  {loginMutation.isPending ? "Connexion…" : "Se connecter"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-xs text-muted-foreground leading-relaxed">
            Mot de passe oublié ? Contactez l'unité informatique.
          </p>
        </div>
      </div>

      {/* Context panel. Hidden below lg so the form stays centred on the
          smaller screens some of the wards actually use. */}
      <div className="hidden lg:flex w-[34rem] shrink-0 flex-col justify-center gap-8 border-l border-border bg-card px-14 py-16">
        <div>
          <h2 className="font-serif text-3xl font-bold tracking-tight leading-snug max-w-md">
            Le lien entre les services et l'unité informatique.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground max-w-md">
            Signalez une panne en trois clics. Suivez son avancement. L'unité
            informatique reçoit tout ce qu'il faut pour intervenir — sans coup
            de téléphone.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {POINTS.map((p) => (
            <div key={p.titre} className="flex items-start gap-3.5">
              <div className="grid place-items-center h-7 w-7 shrink-0 rounded-full bg-[hsl(var(--success-muted))] text-[hsl(var(--success-strong))] mt-0.5">
                <Check className="h-4 w-4" strokeWidth={2.5} />
              </div>
              <div>
                <div className="text-sm font-semibold">{p.titre}</div>
                <div className="mt-1 text-xs leading-relaxed text-muted-foreground max-w-sm">
                  {p.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
