import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save, Timer, RotateCcw, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_IDLE_TIMEOUTS,
  KNOWN_ROLES,
  fetchIdleTimeouts,
  saveIdleTimeouts,
  upsertIdleTimeout,
  deleteIdleTimeout,
  type IdleTimeoutMap,
} from "@/lib/idleTimeouts";
import { confirmDialog } from "@/components/ConfirmDialogProvider";

/**
 * Admin UI: edit per-role idle-timeout (minutes). 0 = disabled.
 * Supports adding custom roles + deleting role overrides.
 */
export function IdleTimeoutsPanel() {
  const [map, setMap] = useState<IdleTimeoutMap>({ ...DEFAULT_IDLE_TIMEOUTS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newRole, setNewRole] = useState("");
  const [newMinutes, setNewMinutes] = useState<number>(30);

  useEffect(() => {
    let cancelled = false;
    void fetchIdleTimeouts().then((m) => {
      if (!cancelled) {
        setMap({ ...DEFAULT_IDLE_TIMEOUTS, ...m });
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const orderedRoles = useMemo(() => {
    const known = new Set<string>(KNOWN_ROLES);
    const all = Object.keys(map);
    const customs = all.filter((r) => !known.has(r)).sort();
    return [...KNOWN_ROLES.filter((r) => r in map || true), ...customs];
  }, [map]);

  const set = (role: string, value: string) => {
    const n = Math.max(0, Math.min(720, Number(value) || 0));
    setMap((m) => ({ ...m, [role]: n }));
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const r = await saveIdleTimeouts(map);
      setMap({ ...DEFAULT_IDLE_TIMEOUTS, ...r });
      toast.success("Délais d'inactivité enregistrés");
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur d'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const onReset = () => {
    setMap({ ...DEFAULT_IDLE_TIMEOUTS });
    toast.message("Valeurs par défaut restaurées (cliquer sur Enregistrer pour appliquer)");
  };

  const onAddRole = async () => {
    const role = newRole.trim();
    if (!role) { toast.error("Nom de rôle requis"); return; }
    if (!/^[A-Za-z0-9 _-]+$/.test(role)) {
      toast.error("Caractères autorisés: lettres, chiffres, espace, _ et -");
      return;
    }
    if (role in map) { toast.error("Ce rôle existe déjà"); return; }
    const minutes = Math.max(0, Math.min(720, Number(newMinutes) || 0));
    try {
      const r = await upsertIdleTimeout(role, minutes);
      setMap({ ...DEFAULT_IDLE_TIMEOUTS, ...r });
      setNewRole("");
      setNewMinutes(30);
      toast.success(`Rôle "${role}" ajouté`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
    }
  };

  const onDeleteRole = async (role: string) => {
    if (!(await confirmDialog({ title: "Suppression", description: `Supprimer la configuration pour "${role}" ?`, tone: "destructive", confirmText: "Supprimer" }))) return;
    try {
      const r = await deleteIdleTimeout(role);
      // Re-merge defaults so built-in roles fall back to defaults instead of disappearing.
      setMap({ ...DEFAULT_IDLE_TIMEOUTS, ...r });
      toast.success(`"${role}" supprimé`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
    }
  };

  const isCustom = (role: string) => !(KNOWN_ROLES as readonly string[]).includes(role);

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-1">
        <Timer className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Déconnexion automatique par rôle</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Définit la durée d'inactivité (en minutes) avant déconnexion. <strong>0</strong> = désactivée pour ce rôle.
        L'utilisateur est averti 2 min avant. Le logout déclenche un <code>clock_out</code> dans Pointage.
        Les rôles personnalisés peuvent être ajoutés ci-dessous.
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        {orderedRoles.map((role) => {
          const value = map[role] ?? 0;
          return (
            <div key={role} className="flex items-center justify-between gap-3 border border-border/60 rounded-md px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate flex items-center gap-1.5">
                  {role}
                  {isCustom(role) && <Badge variant="secondary" className="text-[10px]">custom</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {value === 0 ? <Badge variant="outline">Désactivée</Badge> : <span>{value} min</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor={`to-${role}`} className="sr-only">Délai pour {role}</Label>
                <Input
                  id={`to-${role}`}
                  type="number"
                  min={0}
                  max={720}
                  step={1}
                  disabled={loading}
                  value={value}
                  onChange={(e) => set(role, e.target.value)}
                  className="w-24"
                />
                <span className="text-xs text-muted-foreground">min</span>
                {isCustom(role) && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => void onDeleteRole(role)}
                    aria-label={`Supprimer ${role}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 border-t border-border/60 pt-4">
        <div className="text-sm font-medium mb-2">Ajouter un rôle personnalisé</div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="new-role" className="text-xs">Nom du rôle</Label>
            <Input
              id="new-role"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              placeholder="Ex: AgentSupervision"
              className="w-56"
            />
          </div>
          <div>
            <Label htmlFor="new-min" className="text-xs">Délai (min)</Label>
            <Input
              id="new-min"
              type="number"
              min={0}
              max={720}
              value={newMinutes}
              onChange={(e) => setNewMinutes(Number(e.target.value) || 0)}
              className="w-24"
            />
          </div>
          <Button size="sm" onClick={() => void onAddRole()}>
            <Plus className="h-4 w-4 mr-1.5" /> Ajouter
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4">
        <Button size="sm" onClick={onSave} disabled={saving || loading}>
          <Save className="h-4 w-4 mr-1.5" /> {saving ? "Enregistrement…" : "Enregistrer les délais"}
        </Button>
        <Button size="sm" variant="outline" onClick={onReset} disabled={saving || loading}>
          <RotateCcw className="h-4 w-4 mr-1.5" /> Réinitialiser
        </Button>
      </div>
    </Card>
  );
}
