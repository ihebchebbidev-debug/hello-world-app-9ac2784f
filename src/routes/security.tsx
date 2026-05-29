// Admin-only: configure IP allowlist (skip OTP) + admin copy emails for OTPs.
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Plus, Trash2, Save, RefreshCw, Mail, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { api, API_ENABLED } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/security")({
  head: () => ({ meta: [{ title: "Sécurité d'accès — CRM" }] }),
  component: SecurityPage,
});

function isValidIpRule(s: string): boolean {
  const v4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const cidr = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
  const range = /^(\d{1,3}\.){3}\d{1,3}\s*-\s*(\d{1,3}\.){3}\d{1,3}$/;
  return v4.test(s) || cidr.test(s) || range.test(s);
}

function SecurityPage() {
  const { user } = useAuth();
  if (user && user.role !== "Administrateur") return <Navigate to="/" />;

  const [ips, setIps] = useState<string[]>([]);
  const [emails, setEmails] = useState<string[]>([]);
  const [newIp, setNewIp] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [myIp, setMyIp] = useState<string>("");

  const load = async () => {
    if (!API_ENABLED) return;
    setLoading(true);
    try {
      const [a, b] = await Promise.all([
        api<{ value: unknown }>("/settings.php", { query: { scope: "global", key: "otp_ip_allowlist" } }),
        api<{ value: unknown }>("/settings.php", { query: { scope: "global", key: "otp_admin_copy_emails" } }),
      ]);
      setIps(Array.isArray(a.value) ? (a.value as string[]) : []);
      setEmails(Array.isArray(b.value) ? (b.value as string[]) : []);
    } catch (e: any) {
      toast.error("Erreur de chargement", { description: e?.message });
    } finally { setLoading(false); }
    // Best-effort: detect public IP via free service
    try {
      const r = await fetch("https://api.ipify.org?format=json");
      const j = await r.json();
      if (j.ip) setMyIp(j.ip);
    } catch { /* ignore */ }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const addIp = () => {
    const v = newIp.trim();
    if (!v) return;
    if (!isValidIpRule(v)) { toast.error("Format invalide", { description: "Ex: 192.168.1.10, 192.168.1.0/24, 192.168.1.10-192.168.1.50" }); return; }
    if (ips.includes(v)) { toast.info("Déjà dans la liste"); return; }
    setIps([...ips, v]); setNewIp("");
  };
  const removeIp = (v: string) => setIps(ips.filter((x) => x !== v));

  const addEmail = () => {
    const v = newEmail.trim();
    if (!v) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { toast.error("E-mail invalide"); return; }
    if (emails.includes(v)) { toast.info("Déjà dans la liste"); return; }
    setEmails([...emails, v]); setNewEmail("");
  };
  const removeEmail = (v: string) => setEmails(emails.filter((x) => x !== v));

  const save = async () => {
    setSaving(true);
    try {
      await Promise.all([
        api("/settings.php", { method: "PUT", body: { scope: "global", key: "otp_ip_allowlist", value: ips } }),
        api("/settings.php", { method: "PUT", body: { scope: "global", key: "otp_admin_copy_emails", value: emails } }),
      ]);
      toast.success("Paramètres enregistrés");
    } catch (e: any) { toast.error("Erreur", { description: e?.message }); }
    finally { setSaving(false); }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Sécurité d'accès"
        description="Plages IP de confiance (sans OTP) + adresses de copie administrateur."
        icon={<ShieldCheck className="h-5 w-5" />}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Plages IP autorisées (sans OTP)</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Les utilisateurs se connectant depuis l'une de ces adresses ne recevront pas de code de vérification.
            Formats acceptés : <code>192.168.1.10</code>, <code>192.168.1.0/24</code>, <code>10.0.0.1-10.0.0.50</code>.
          </p>
          {myIp && (
            <div className="text-xs bg-muted/40 rounded px-2 py-1 flex items-center justify-between">
              <span>Votre IP publique actuelle : <strong className="font-mono">{myIp}</strong></span>
              <Button size="sm" variant="ghost" onClick={() => setNewIp(myIp)}>Pré-remplir</Button>
            </div>
          )}
          <div className="flex gap-2">
            <Input placeholder="192.168.1.0/24" value={newIp} onChange={(e) => setNewIp(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addIp()} />
            <Button size="sm" onClick={addIp}><Plus className="h-3.5 w-3.5 mr-1" />Ajouter</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {ips.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Aucune plage configurée — tous les utilisateurs reçoivent un OTP.</p>
            ) : ips.map((ip) => (
              <Badge key={ip} variant="secondary" className="gap-1 font-mono text-xs">
                {ip}
                <button onClick={() => removeIp(ip)} className="ml-1 hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
              </Badge>
            ))}
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Copie administrateur des codes OTP</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Une copie de chaque code OTP envoyé sera également transmise à ces adresses.
          </p>
          <div className="flex gap-2">
            <Input type="email" placeholder="admin@exemple.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addEmail()} />
            <Button size="sm" onClick={addEmail}><Plus className="h-3.5 w-3.5 mr-1" />Ajouter</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {emails.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Aucune copie administrateur configurée.</p>
            ) : emails.map((em) => (
              <Badge key={em} variant="secondary" className="gap-1 text-xs">
                {em}
                <button onClick={() => removeEmail(em)} className="ml-1 hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
              </Badge>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex gap-2 mt-4">
        <Button onClick={save} disabled={saving || loading}>
          <Save className="h-4 w-4 mr-1" />{saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />Recharger
        </Button>
      </div>
    </AppLayout>
  );
}
