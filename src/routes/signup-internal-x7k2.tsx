import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ShieldHalf, Loader2, AlertCircle, UserPlus } from "lucide-react";

// Hidden signup — URL is intentionally obscure. Not linked from anywhere.
export const Route = createFileRoute("/signup-internal-x7k2")({
  head: () => ({
    meta: [
      { title: "Création de compte interne" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SignupPage,
});

const signupSchema = z.object({
  username: z.string().trim().min(3, "Min. 3 caractères").max(80),
  fullName: z.string().trim().min(2, "Nom requis").max(120),
  email: z.string().trim().email("Email invalide").max(160),
  password: z.string().min(8, "Min. 8 caractères").max(200),
  team: z.string().trim().max(80),
});

const TEAMS = ["Direction", "Lead-Actifs", "Lead-Premium", "Backoffice", "Pôle 1", "Pôle 2"];

function SignupPage() {
  const { user, loading, signup, apiEnabled } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: "", fullName: "", email: "", password: "", team: "Lead-Actifs",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [user, loading, navigate]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = signupSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Champs invalides");
      return;
    }
    setSubmitting(true);
    try {
      await signup(parsed.data);
      navigate({ to: "/" });
    } catch (err: any) {
      setError(err?.message ?? "Création impossible.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-[oklch(0.72_0.18_55)] to-[oklch(0.82_0.15_65)] text-white flex items-center justify-center shadow-md">
            <ShieldHalf className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Création interne</div>
            <div className="font-semibold">CRM</div>
          </div>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">Nouveau compte agent</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Compte créé avec le rôle <strong>Agent</strong>. Un administrateur pourra
          ajuster les permissions ensuite.
        </p>

        {!apiEnabled && (
          <div className="mt-6 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs text-warning-foreground flex gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span><strong>Mode démo</strong> — aucun compte n'est réellement enregistré.</span>
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="username">Identifiant</Label>
              <Input id="username" autoComplete="username" value={form.username} onChange={set("username")} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Nom complet</Label>
              <Input id="fullName" value={form.fullName} onChange={set("fullName")} required />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email professionnel</Label>
            <Input id="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} required />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Mot de passe</Label>
            <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} required />
            <p className="text-[11px] text-muted-foreground">8 caractères minimum.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="team">Équipe</Label>
            <Select value={form.team} onValueChange={(v) => setForm((f) => ({ ...f, team: v }))}>
              <SelectTrigger id="team"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TEAMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive flex gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserPlus className="h-4 w-4 mr-2" />Créer le compte</>}
          </Button>
        </form>

        <p className="mt-6 text-[11px] text-center text-muted-foreground">
          Déjà inscrit ? <Link to="/login" className="underline hover:text-foreground">Se connecter</Link>
        </p>
      </div>
    </div>
  );
}
