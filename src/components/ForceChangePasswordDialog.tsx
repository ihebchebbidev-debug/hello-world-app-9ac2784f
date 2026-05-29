import { useState } from "react";
import { ShieldAlert, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export function ForceChangePasswordDialog() {
  const { user, changePassword } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const open = !!user?.mustChangePassword;

  const submit = async () => {
    if (next.length < 8) { toast.error("Au moins 8 caractères"); return; }
    if (next !== confirm) { toast.error("La confirmation ne correspond pas"); return; }
    if (current === next) { toast.error("Le nouveau mot de passe doit être différent"); return; }
    setBusy(true);
    try {
      await changePassword(current, next);
      toast.success("Mot de passe mis à jour");
      setCurrent(""); setNext(""); setConfirm("");
    } catch (e: any) {
      toast.error(e?.message ?? "Échec");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-[440px]"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-2 text-warning">
            <ShieldAlert className="h-5 w-5" />
            <DialogTitle>Changement de mot de passe requis</DialogTitle>
          </div>
          <DialogDescription>
            Pour des raisons de sécurité, vous devez définir un nouveau mot de passe avant de continuer.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Mot de passe actuel</Label>
            <div className="relative">
              <Input type={show ? "text" : "password"} value={current} onChange={(e) => setCurrent(e.target.value)} className="pr-9" autoFocus />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label="Afficher/Cacher">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Nouveau mot de passe</Label>
            <Input type={show ? "text" : "password"} value={next} onChange={(e) => setNext(e.target.value)} placeholder="Au moins 8 caractères" />
          </div>
          <div className="space-y-1.5">
            <Label>Confirmer le mot de passe</Label>
            <Input type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={submit} disabled={busy || !current || next.length < 8 || next !== confirm}>
            {busy ? "Enregistrement…" : "Mettre à jour"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
