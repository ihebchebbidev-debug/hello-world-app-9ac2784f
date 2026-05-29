import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useErp } from "@/lib/erpStore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, ShieldOff, Clock } from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ConfirmDialogProvider";

export type Grant = {
  id: string;
  user: string;
  type: "role" | "permission";
  value: string;
  reason?: string | null;
  grantedBy: string;
  startsAt: string;
  expiresAt: string;
  revoked: boolean;
  active: boolean;
};

const QUICK_PERMS = [
  "prospect", "contract", "calendar", "dashboard", "users", "role", "backoffice", "dispatch",
  "leads.prospection", "leads.opportunite", "leads.contrat",
  "lead.history",
  "prospect.edit", "prospect.add", "prospect.delete", "prospect.assign",
  "contract.edit", "contract.validate", "contract.cancel", "contract.export",
];

function fmt(iso: string) {
  try { return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }); }
  catch { return iso; }
}

function defaultExpiry(): string {
  // +24h, formatted for <input type="datetime-local">
  const d = new Date(Date.now() + 24 * 3600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function UserGrantsCard({ username }: { username: string }) {
  const { user } = useAuth();
  const { roles } = useErp();
  const isAdmin = user?.role === "Administrateur";
  const isSelf = user?.username === username;

  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [type, setType] = useState<"role" | "permission">("role");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState(defaultExpiry());

  const load = async () => {
    if (!isAdmin && !isSelf) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = await api<{ grants: Grant[] }>(`/user_grants.php?user=${encodeURIComponent(username)}`);
      setGrants(r.grants ?? []);
    } catch (e: any) {
      // silent
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [username]);

  const submit = async () => {
    if (!value.trim()) { toast.error("Sélectionnez un rôle ou une permission"); return; }
    if (!expiresAt) { toast.error("Date d'expiration requise"); return; }
    setBusy(true);
    try {
      await api("/user_grants.php", {
        method: "POST",
        body: { user: username, type, value: value.trim(), expiresAt: new Date(expiresAt).toISOString(), reason: reason || undefined },
      });
      toast.success("Accès temporaire accordé");
      setValue(""); setReason(""); setExpiresAt(defaultExpiry());
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
    } finally { setBusy(false); }
  };

  const revoke = async (id: string) => {
    if (!(await confirmDialog({ title: "Suppression", description: "Révoquer cet accès ?", tone: "destructive", confirmText: "Supprimer" }))) return;
    setBusy(true);
    try {
      await api(`/user_grants.php?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      toast.success("Accès révoqué");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
    } finally { setBusy(false); }
  };

  if (!isAdmin && !isSelf) return null;

  return (
    <Card className="shadow-elegant">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" /> Accès temporaires
        </CardTitle>
        <CardDescription>Rôles ou permissions accordés jusqu'à une date</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAdmin && (
          <div className="space-y-3 rounded-lg border border-border p-3 bg-muted/20">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Select value={type} onValueChange={(v) => { setType(v as any); setValue(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="role">Rôle additionnel</SelectItem>
                    <SelectItem value="permission">Permission ponctuelle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{type === "role" ? "Rôle" : "Permission"}</Label>
                <Select value={value} onValueChange={setValue}>
                  <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {type === "role"
                      ? roles.map((r) => (
                          <SelectItem key={r.name} value={r.name}>{r.label}</SelectItem>
                        ))
                      : QUICK_PERMS.map((p) => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Expire le</Label>
                <Input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Motif (optionnel)</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Couverture congé, mission ponctuelle…" />
              </div>
            </div>
            <Button onClick={submit} disabled={busy} size="sm" className="w-full sm:w-auto">
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Accorder l'accès
            </Button>
          </div>
        )}

        <div className="space-y-2">
          {loading ? (
            <div className="text-sm text-muted-foreground italic">Chargement…</div>
          ) : grants.length === 0 ? (
            <div className="text-sm text-muted-foreground italic">Aucun accès temporaire.</div>
          ) : (
            grants.map((g) => (
              <div key={g.id} className="flex items-start justify-between gap-3 rounded-md border border-border bg-card p-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={g.type === "role" ? "default" : "outline"}>{g.type === "role" ? "Rôle" : "Perm."}</Badge>
                    <span className="font-medium truncate">{g.value}</span>
                    {g.active ? (
                      <Badge variant="outline" className="bg-success/10 text-success border-success/30">Actif</Badge>
                    ) : g.revoked ? (
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">Révoqué</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-muted text-muted-foreground">Expiré</Badge>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Jusqu'au {fmt(g.expiresAt)} · accordé par @{g.grantedBy}
                    {g.reason ? ` · ${g.reason}` : ""}
                  </div>
                </div>
                {isAdmin && g.active && (
                  <Button size="sm" variant="ghost" onClick={() => revoke(g.id)} disabled={busy} title="Révoquer">
                    <ShieldOff className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
