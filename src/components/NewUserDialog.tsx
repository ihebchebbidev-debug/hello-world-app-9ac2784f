import { useState } from "react";
import { Plus } from "lucide-react";
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
import { toast } from "sonner";
import { CustomFieldsInline, validateRequiredCustomValues } from "./CustomFieldsInline";
import { api, API_ENABLED } from "@/lib/api";
import { UserHrFields, EMPTY_HR, hrValuesToPayload, type UserHrValues } from "./UserHrFields";
import { MVP_ROLE_OPTIONS, roleLabel } from "@/lib/roleLabels";

export function NewUserDialog() {
  const { saveUser, roles } = useErp();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("Agent");
  const [team, setTeam] = useState("Lead-Actifs");
  const [active, setActive] = useState(true);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [hr, setHr] = useState<UserHrValues>(EMPTY_HR);

  const submit = async () => {
    if (!username.trim() || !fullName.trim()) { toast.error("Nom d'utilisateur et nom complet requis"); return; }
    if (!password || password.length < 6) { toast.error("Mot de passe ≥ 6 caractères"); return; }
    const missing = await validateRequiredCustomValues("user", customValues);
    if (missing) { toast.error(`${missing} est requis`); return; }
    setSaving(true);
    try {
      await saveUser({
        username: username.trim(), fullName: fullName.trim(),
        email: email.trim(), role, team, active, password,
        ...hrValuesToPayload(hr),
      });
      // Persist custom field values for the new user (keyed by username).
      if (API_ENABLED && Object.keys(customValues).length > 0) {
        try {
          await api("/custom_field_values.php", {
            method: "POST",
            body: { entity: "user", entity_id: username.trim(), values: customValues },
          });
        } catch { /* non-blocking */ }
      }
      toast.success("Utilisateur créé");
      setOpen(false);
      setUsername(""); setFullName(""); setEmail(""); setPassword(""); setCustomValues({}); setHr(EMPTY_HR);
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur lors de la création");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1.5" />Nouvel utilisateur</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouvel utilisateur</DialogTitle>
          <DialogDescription>Créez un compte pour un agent ou administrateur.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5"><Label>Nom d'utilisateur *</Label><Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="marie.dupont" /></div>
          <div className="space-y-1.5"><Label>Nom complet *</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Marie Dupont" /></div>
          <div className="space-y-1.5 col-span-2"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="marie@example.com" /></div>
          <div className="space-y-1.5 col-span-2"><Label>Mot de passe *</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Au moins 6 caractères" /></div>
          <div className="space-y-1.5"><Label>Rôle</Label>
            <Select value={role} onValueChange={(v) => setRole(v)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(() => {
                  const seen = new Set<string>();
                  const merged: { name: string; label: string }[] = [];
                  for (const r of roles) {
                    if (r.name === "Backoffice") continue;
                    if (seen.has(r.name)) continue;
                    seen.add(r.name);
                    merged.push({ name: r.name, label: roleLabel(r.name) });
                  }
                  for (const opt of MVP_ROLE_OPTIONS) {
                    if (opt.value === "Backoffice") continue;
                    if (seen.has(opt.value)) continue;
                    seen.add(opt.value);
                    merged.push({ name: opt.value, label: opt.label });
                  }
                  return merged.map((r) => (
                    <SelectItem key={r.name} value={r.name}>{r.label}</SelectItem>
                  ));
                })()}
              </SelectContent>
            </Select></div>
          <div className="space-y-1.5"><Label>Équipe</Label><Input value={team} onChange={(e) => setTeam(e.target.value)} /></div>
          <div className="col-span-2 flex items-center gap-3 pt-1">
            <Switch checked={active} onCheckedChange={setActive} id="user-active" />
            <Label htmlFor="user-active">Compte actif</Label>
          </div>
          <UserHrFields values={hr} onChange={setHr} />
          <CustomFieldsInline entity="user" values={customValues} onChange={setCustomValues} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Annuler</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Création…" : "Créer l'utilisateur"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
