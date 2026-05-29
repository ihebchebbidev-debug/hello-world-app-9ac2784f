import { useState } from "react";
import { KeyRound, RefreshCcw, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { toast } from "sonner";

function generatePassword(len = 12): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
  let out = "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += charset[arr[i] % charset.length];
  return out;
}

export function ResetPasswordDialog({
  userId,
  username,
  fullName,
}: { userId: string; username: string; fullName: string }) {
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState("");
  const [show, setShow] = useState(false);
  const [mustChange, setMustChange] = useState(true);
  const [busy, setBusy] = useState(false);

  const reset = () => setPwd(generatePassword(12));

  const submit = async () => {
    if (pwd.length < 8) { toast.error("Le mot de passe doit contenir au moins 8 caractères"); return; }
    setBusy(true);
    try {
      await api("/auth_admin_reset_password.php", {
        method: "POST",
        body: { userId, username, newPassword: pwd, mustChange },
      });
      toast.success(`Mot de passe réinitialisé pour ${fullName}`, {
        description: mustChange
          ? "L'utilisateur devra le changer à sa prochaine connexion."
          : "Communiquez-le par un canal sécurisé.",
      });
      setOpen(false);
      setPwd("");
    } catch (e: any) {
      toast.error(e?.message ?? "Échec de la réinitialisation");
    } finally {
      setBusy(false);
    }
  };

  const copyPwd = async () => {
    if (!pwd) return;
    try { await navigator.clipboard.writeText(pwd); toast.success("Mot de passe copié"); }
    catch { /* ignore */ }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v && !pwd) setPwd(generatePassword(12));
        if (!v) { setPwd(""); setShow(false); setMustChange(true); }
      }}
    >
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="Réinitialiser le mot de passe" title="Réinitialiser le mot de passe">
          <KeyRound className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
          <DialogDescription>
            {fullName} <span className="text-muted-foreground">— @{username}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nouveau mot de passe</Label>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Input
                  type={show ? "text" : "password"}
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  placeholder="Au moins 8 caractères"
                  className="pr-9 font-mono"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={show ? "Cacher" : "Afficher"}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button type="button" variant="outline" size="icon" onClick={reset} title="Générer un mot de passe">
                <RefreshCcw className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{pwd.length} caractère{pwd.length > 1 ? "s" : ""}</span>
              {pwd && (
                <button type="button" onClick={copyPwd} className="underline hover:text-foreground">
                  Copier
                </button>
              )}
            </div>
          </div>

          <div className="flex items-start justify-between gap-3 rounded-md border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm">Forcer le changement à la prochaine connexion</Label>
              <p className="text-xs text-muted-foreground">
                L'utilisateur devra définir un nouveau mot de passe avant d'accéder à l'application.
              </p>
            </div>
            <Switch checked={mustChange} onCheckedChange={setMustChange} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Annuler</Button>
          <Button onClick={submit} disabled={busy || pwd.length < 8}>
            {busy ? "Enregistrement…" : "Réinitialiser"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
