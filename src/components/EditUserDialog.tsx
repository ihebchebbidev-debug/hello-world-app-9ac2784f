import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useErp } from "@/lib/erpStore";
import type { AppUser } from "@/lib/types";
import { toast } from "sonner";
import { UserHrFields, hrValuesFromUser, hrValuesToPayload, type UserHrValues } from "./UserHrFields";



export function EditUserDialog({ user }: { user: AppUser }) {
  const { saveUser, roles } = useErp();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState(user.username);
  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<string>(user.role);
  const [team, setTeam] = useState(user.team);
  const [active, setActive] = useState(user.active);
  const [hr, setHr] = useState<UserHrValues>(() => hrValuesFromUser(user));
  const submit = async () => {
    if (!fullName.trim()) { toast.error("Nom complet requis"); return; }
    const newUsername = username.trim();
    if (!newUsername) { toast.error("Nom d'utilisateur requis"); return; }
    if (!/^[A-Za-z0-9._-]{2,64}$/.test(newUsername)) {
      toast.error("Nom d'utilisateur invalide (lettres, chiffres, . _ - ; 2 à 64 caractères)");
      return;
    }
    setSaving(true);
    try {
      await saveUser({
        id: user.id,
        username: newUsername,
        // previousUsername : indique au backend de renommer l'utilisateur (cascade
        // sur assigned_to dans prospects / opportunités / contrats).
        ...(newUsername !== user.username ? { previousUsername: user.username } : {}),
        fullName: fullName.trim(), email: email.trim(),
        role, team, active,
        ...hrValuesToPayload(hr),
      } as any);
      toast.success("Utilisateur mis à jour");
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur lors de la mise à jour");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="Modifier"><Pencil className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier l'utilisateur</DialogTitle>
          <DialogDescription>{user.username}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5 col-span-2">
            <Label>Nom d'utilisateur *</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="marie.dupont" />
            <p className="text-xs text-muted-foreground">Lettres, chiffres et . _ - autorisés (2 à 64 caractères).</p>
          </div>
          <div className="space-y-1.5 col-span-2"><Label>Nom complet *</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div className="space-y-1.5 col-span-2"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Rôle</Label>
            <Select value={role} onValueChange={(v) => setRole(v)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {roles
                  .filter((r) => r.name !== "Backoffice" || user.role === "Backoffice")
                  .map((r) => <SelectItem key={r.name} value={r.name}>{r.name === "Manager" ? "Superviseur" : r.name === "Agent" ? "Commercial" : r.label}</SelectItem>)}
              </SelectContent>
            </Select></div>
          <div className="space-y-1.5"><Label>Équipe</Label><Input value={team} onChange={(e) => setTeam(e.target.value)} /></div>
          <div className="col-span-2 flex items-center gap-3 pt-1">
            <Switch checked={active} onCheckedChange={setActive} id={`u-active-${user.id}`} />
            <Label htmlFor={`u-active-${user.id}`}>Compte actif</Label>
          </div>
          <UserHrFields values={hr} onChange={setHr} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Annuler</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
