import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth, type AuthUser } from "@/lib/auth";
import { toast } from "sonner";
import {
  Eye, EyeOff, Lock, Mail, Shield, User as UserIcon, Users, Loader2,
  Pencil, X, Save,
} from "lucide-react";

type IdForm = { fullName: string; email: string };
const emptyForm = (u: AuthUser | null): IdForm => ({
  fullName: u?.fullName ?? "",
  email: u?.email ?? "",
});

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Mon profil — CRM" },
      { name: "description", content: "Consultez vos informations et changez votre mot de passe." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, changePassword, updateProfile } = useAuth();

  const [edit, setEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<IdForm>(() => emptyForm(user));
  useEffect(() => { if (!edit) setForm(emptyForm(user)); }, [user, edit]);

  const setF = (k: keyof IdForm) => (v: string) => setForm((s) => ({ ...s, [k]: v }));

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!form.fullName.trim()) { toast.error("Validation", { description: "Nom complet requis" }); return; }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error("Validation", { description: "Email invalide" }); return;
    }
    setSaving(true);
    try {
      await updateProfile({
        fullName: form.fullName.trim(),
        email: form.email.trim() || undefined,
      });
      toast.success("Profil mis à jour");
      setEdit(false);
    } catch (err: any) {
      toast.error("Échec", { description: err?.message ?? "Impossible de sauvegarder." });
    } finally {
      setSaving(false);
    }
  };

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const username = user?.username ?? "—";
  const fullName = user?.fullName || username;
  const initials = username
    .split(/[.\s_-]+/)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!currentPassword || !newPassword) {
      toast.error("Champs requis", { description: "Renseignez les deux mots de passe." });
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Mot de passe trop court", { description: "8 caractères minimum." });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Confirmation invalide", { description: "Les deux mots de passe ne correspondent pas." });
      return;
    }
    if (newPassword === currentPassword) {
      toast.error("Mot de passe identique", { description: "Choisissez un mot de passe différent de l'actuel." });
      return;
    }
    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      toast.success("Mot de passe mis à jour");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error("Échec", { description: err?.message ?? "Impossible de modifier le mot de passe." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader
          title="Mon profil"
          description="Vos informations personnelles et la sécurité de votre compte."
        />

        <Card className="shadow-elegant">
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="text-base">Informations</CardTitle>
              <CardDescription>Vos informations de compte.</CardDescription>
            </div>
            {!edit ? (
              <Button variant="outline" size="sm" onClick={() => setEdit(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Modifier
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => { setEdit(false); setForm(emptyForm(user)); }}>
                <X className="h-3.5 w-3.5 mr-1.5" /> Annuler
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 pb-5 border-b border-border">
              <div className="h-14 w-14 rounded-full bg-gradient-to-br from-[oklch(0.72_0.18_55)] to-[oklch(0.82_0.15_65)] flex items-center justify-center text-base font-semibold text-white">
                {initials || "?"}
              </div>
              <div className="min-w-0">
                <div className="text-base font-semibold truncate">@{username}</div>
                <div className="text-xs text-muted-foreground truncate">{fullName}</div>
              </div>
              {user?.active === false && (
                <Badge variant="destructive" className="ml-auto">Désactivé</Badge>
              )}
            </div>

            {!edit ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-5">
                <Field icon={<UserIcon className="h-4 w-4" />} label="Nom complet" value={user?.fullName || "—"} />
                <Field icon={<Mail className="h-4 w-4" />} label="Email" value={user?.email || "—"} />
                <Field icon={<UserIcon className="h-4 w-4" />} label="Username" value={username} />
                <Field icon={<Shield className="h-4 w-4" />} label="Rôle" value={user?.role || "—"} />
                <Field icon={<Users className="h-4 w-4" />} label="Équipe" value={user?.team || "—"} />
              </div>
            ) : (
              <form onSubmit={onSave} className="space-y-4 pt-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="fullName">Nom complet *</Label>
                    <Input id="fullName" value={form.fullName} onChange={(e) => setF("fullName")(e.target.value)} required maxLength={120} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={form.email} onChange={(e) => setF("email")(e.target.value)} maxLength={255} />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => { setEdit(false); setForm(emptyForm(user)); }} disabled={saving}>Annuler</Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enregistrement…</> : <><Save className="h-4 w-4 mr-2" /> Enregistrer</>}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-elegant">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" /> Changer le mot de passe
            </CardTitle>
            <CardDescription>8 caractères minimum. Vous resterez connecté après modification.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4 max-w-md">
              <div className="space-y-1.5">
                <Label htmlFor="current">Mot de passe actuel</Label>
                <div className="relative">
                  <Input
                    id="current"
                    type={showCurrent ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showCurrent ? "Masquer" : "Afficher"}
                  >
                    {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new">Nouveau mot de passe</Label>
                <div className="relative">
                  <Input
                    id="new"
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showNew ? "Masquer" : "Afficher"}
                  >
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirmer le nouveau mot de passe</Label>
                <Input
                  id="confirm"
                  type={showNew ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-destructive">Les mots de passe ne correspondent pas.</p>
                )}
              </div>

              <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
                {submitting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Mise à jour…</>
                ) : (
                  <>Mettre à jour</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-0.5 text-sm font-medium truncate">{value}</div>
    </div>
  );
}
