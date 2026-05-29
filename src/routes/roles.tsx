import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { ShieldCheck, Search, Plus, Pencil, Trash2, Users as UsersIcon, Lock, UserCog, Check, Ban, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, API_ENABLED } from "@/lib/api";
import { useErp } from "@/lib/erpStore";
import { PERMISSION_SECTIONS, ALL_PERMISSION_KEYS } from "@/lib/permissions";
import { confirmDialog } from "@/components/ConfirmDialogProvider";
import { RequirePerm } from "@/components/RequirePerm";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/roles")({
  head: () => ({
    meta: [
      { title: "Rôles — CRM Internet" },
      { name: "description", content: "Gestion fine des permissions par rôle." },
    ],
  }),
  component: GuardedRolesPage,
});

function GuardedRolesPage() {
  const { user } = useAuth();
  // Only Administrateurs can view/modify the role + permission matrix.
  // RequirePerm with a never-granted key forces the Access Denied screen
  // for everyone else (Administrateur bypasses all permission checks).
  if (user?.role === "Administrateur") return <RolesPage />;
  return (
    <RequirePerm perm="__admin_only__" backTo="/" backLabel="Retour à l'accueil">
      <RolesPage />
    </RequirePerm>
  );
}

const sections = PERMISSION_SECTIONS;
const ALL_PERMS = ALL_PERMISSION_KEYS;

const COLOR_OPTIONS = [
  { key: "primary", label: "Ambre", className: "bg-primary" },
  { key: "info", label: "Bleu", className: "bg-info" },
  { key: "success", label: "Vert", className: "bg-success" },
  { key: "warning", label: "Orange", className: "bg-warning" },
  { key: "destructive", label: "Rouge", className: "bg-destructive" },
  { key: "accent", label: "Accent", className: "bg-accent" },
  { key: "muted", label: "Neutre", className: "bg-muted-foreground" },
];

function colorBg(color: string) {
  const c = COLOR_OPTIONS.find((o) => o.key === color);
  return c?.className ?? "bg-primary";
}

type UsersByRole = Record<string, Array<{ id: string; username: string; fullName: string; email: string; team: string; active: boolean }>>;

function RolesPage() {
  const { roles, fetchRoles, createRole, updateRole, deleteRole, assignUserRole, refresh } = useErp();
  const [role, setRole] = useState("Administrateur");
  const [search, setSearch] = useState("");
  const [permsByRole, setPermsByRole] = useState<Record<string, Record<string, boolean>>>({});
  const [usersByRole, setUsersByRole] = useState<UsersByRole>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Dialog states
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newColor, setNewColor] = useState("primary");

  const [editOpen, setEditOpen] = useState(false);
  const [editLabel, setEditLabel] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editColor, setEditColor] = useState("primary");

  const loadAll = async () => {
    if (!API_ENABLED) return;
    setLoading(true);
    try {
      const res = await api<{
        roles: any[];
        permissions: Record<string, Record<string, boolean>>;
        usersByRole: UsersByRole;
      }>("/roles.php");
      const next: Record<string, Record<string, boolean>> = {};
      for (const r of res.roles ?? []) {
        const incoming = res.permissions?.[r.name] ?? {};
        next[r.name] = Object.fromEntries(
          ALL_PERMS.map((k) => [k, incoming[k] ?? (r.name === "Administrateur")]),
        );
      }
      setPermsByRole(next);
      setUsersByRole(res.usersByRole ?? {});
      setDirty({});
      await fetchRoles();
    } catch (e: any) {
      toast.error(e?.message ?? "Échec du chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadAll(); /* eslint-disable-next-line */ }, []);

  // Make sure selected role still exists
  useEffect(() => {
    if (roles.length && !roles.find((r) => r.name === role)) {
      setRole(roles[0].name);
    }
  }, [roles, role]);

  const perms = permsByRole[role] ?? Object.fromEntries(ALL_PERMS.map((k) => [k, false]));
  const markDirty = () => setDirty((d) => ({ ...d, [role]: true }));

  const toggle = (k: string) => {
    setPermsByRole((prev) => ({
      ...prev,
      [role]: { ...(prev[role] ?? {}), [k]: !(prev[role]?.[k]) },
    }));
    markDirty();
  };

  const setSection = (sectionPerms: string[], value: boolean) => {
    setPermsByRole((prev) => {
      const next = { ...(prev[role] ?? {}) };
      sectionPerms.forEach((k) => (next[k] = value));
      return { ...prev, [role]: next };
    });
    markDirty();
    toast.success(value ? "Section activée" : "Section désactivée");
  };

  const save = async () => {
    if (!API_ENABLED) { toast.error("API non configurée"); return; }
    setSaving(true);
    try {
      await api("/roles.php", { method: "PUT", body: { role, permissions: perms } });
      setDirty((d) => ({ ...d, [role]: false }));
      toast.success(`Permissions enregistrées pour ${role}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Échec de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const onCreate = async () => {
    const name = newName.trim();
    if (!name) { toast.error("Nom requis"); return; }
    try {
      await createRole({ name, label: newLabel.trim() || name, description: newDesc.trim(), color: newColor });
      toast.success("Rôle créé");
      setCreateOpen(false);
      setNewName(""); setNewLabel(""); setNewDesc(""); setNewColor("primary");
      await loadAll();
      setRole(name);
    } catch (e: any) {
      toast.error(e?.message ?? "Échec");
    }
  };

  const openEdit = () => {
    const r = roles.find((x) => x.name === role);
    if (!r) return;
    setEditLabel(r.label);
    setEditDesc(r.description);
    setEditColor(r.color);
    setEditOpen(true);
  };

  const onUpdate = async () => {
    try {
      await updateRole({ name: role, label: editLabel.trim() || role, description: editDesc.trim(), color: editColor });
      toast.success("Rôle mis à jour");
      setEditOpen(false);
      await loadAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Échec");
    }
  };

  const onDelete = async (fallback: string) => {
    try {
      await deleteRole(role, fallback);
      toast.success("Rôle supprimé");
      await loadAll();
      setRole(fallback);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Échec");
    }
  };

  const totalActive = useMemo(
    () => Object.values(perms).filter(Boolean).length,
    [perms],
  );

  const currentRole = roles.find((r) => r.name === role);
  const usersInRole = usersByRole[role] ?? [];

  return (
    <AppLayout skeleton="form">
      <PageHeader
        title="Rôles & Permissions"
        description={`${totalActive} / ${ALL_PERMS.length} permissions actives pour ${currentRole?.label ?? role}${loading ? " (chargement…)" : ""}`}
        icon={<ShieldCheck className="h-5 w-5" />}
        actions={
          <>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1.5" />Nouveau rôle</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Créer un rôle</DialogTitle>
                  <DialogDescription>Les rôles personnalisés sont gérés via la matrice de permissions.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="space-y-1.5">
                    <Label>Clé (identifiant) *</Label>
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ex: support_lvl1" />
                    <p className="text-[11px] text-muted-foreground">Lettres, chiffres, tirets — non modifiable après création.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Libellé affiché</Label>
                    <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Support N1" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Description</Label>
                    <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Rôle dédié à…" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Couleur</Label>
                    <div className="flex flex-wrap gap-2">
                      {COLOR_OPTIONS.map((c) => (
                        <button
                          key={c.key}
                          type="button"
                          onClick={() => setNewColor(c.key)}
                          className={`h-8 w-8 rounded-full ${c.className} ring-2 ring-offset-2 ring-offset-background transition-base ${newColor === c.key ? "ring-foreground" : "ring-transparent"}`}
                          aria-label={c.label}
                          title={c.label}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button>
                  <Button onClick={onCreate}>Créer</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button size="sm" onClick={save} disabled={saving || loading || !dirty[role]}>
              {saving ? "Enregistrement…" : dirty[role] ? "Enregistrer" : "Enregistré"}
            </Button>
          </>
        }
      />

      {/* Role picker */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
        {roles.map((r) => {
          const active = role === r.name;
          const count = Object.values(permsByRole[r.name] ?? {}).filter(Boolean).length;
          const userCount = (usersByRole[r.name] ?? []).length;
          return (
            <button
              key={r.name}
              onClick={() => setRole(r.name)}
              className={`text-left rounded-xl border p-4 transition-base ${
                active
                  ? "border-primary bg-primary/5 shadow-elegant ring-1 ring-primary/20"
                  : "border-border bg-card hover:border-primary/40 hover:shadow-sm"
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`h-10 w-10 rounded-lg ${colorBg(r.color)} text-white flex items-center justify-center shadow-sm`}>
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate flex items-center gap-1.5">
                    {r.label}
                    {r.isSystem && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">{r.description || "—"}</div>
                </div>
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span><span className="font-semibold text-foreground">{count}</span>/{ALL_PERMS.length} perms</span>
                <span><span className="font-semibold text-foreground">{userCount}</span> util.</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected role meta + actions */}
      {currentRole && (
        <Card className="mt-4 p-4 shadow-elegant flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`h-10 w-10 rounded-lg ${colorBg(currentRole.color)} text-white flex items-center justify-center`}>
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold flex items-center gap-2">
                {currentRole.label}
                {currentRole.isSystem && <Badge variant="outline" className="text-[10px]"><Lock className="h-3 w-3 mr-1" />Système</Badge>}
              </div>
              <div className="text-xs text-muted-foreground truncate">Clé: <code className="font-mono">{currentRole.name}</code></div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={openEdit}
              disabled={currentRole.isSystem}
              title={currentRole.isSystem ? "Rôle système — non modifiable" : undefined}
            >
              <Pencil className="h-4 w-4 mr-1.5" />Modifier
            </Button>
            {!currentRole.isSystem && (
              <DeleteRoleButton
                role={currentRole.name}
                fallbackOptions={roles.filter((r) => r.name !== currentRole.name && r.name !== "Administrateur").map((r) => ({ value: r.name, label: r.label }))}
                onConfirm={onDelete}
              />
            )}
          </div>
        </Card>
      )}

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le rôle</DialogTitle>
            <DialogDescription>{currentRole?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Libellé</Label>
              <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Description</Label>
              <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Couleur</Label>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setEditColor(c.key)}
                    className={`h-8 w-8 rounded-full ${c.className} ring-2 ring-offset-2 ring-offset-background transition-base ${editColor === c.key ? "ring-foreground" : "ring-transparent"}`}
                    aria-label={c.label}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Annuler</Button>
            <Button onClick={onUpdate}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assigned users */}
      <Card className="mt-4 shadow-elegant">
        <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Utilisateurs avec ce rôle</h3>
            <Badge variant="outline" className="text-[10px]">{usersInRole.length}</Badge>
          </div>
        </div>
        {usersInRole.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">Aucun utilisateur assigné à ce rôle.</div>
        ) : (
          <div className="divide-y divide-border">
            {usersInRole.map((u) => (
              <div key={u.id} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/20">
                <div className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold shrink-0">
                  {u.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{u.fullName}</div>
                  <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                </div>
                <Select
                  value={role}
                  onValueChange={async (v) => {
                    if (v === role) return;
                    try {
                      await assignUserRole(u.id, v);
                      toast.success(`${u.fullName} → ${roles.find((r) => r.name === v)?.label ?? v}`);
                      await loadAll();
                      await refresh();
                    } catch (e: any) {
                      toast.error(e?.message ?? "Échec");
                    }
                  }}
                >
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.name} value={r.name}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Search */}
      <Card className="mt-4 p-3 shadow-elegant flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une permission…"
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPermsByRole((prev) => ({ ...prev, [role]: Object.fromEntries(ALL_PERMS.map((k) => [k, true])) }));
              markDirty();
            }}
          >
            Tout activer
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPermsByRole((prev) => ({ ...prev, [role]: Object.fromEntries(ALL_PERMS.map((k) => [k, false])) }));
              markDirty();
            }}
          >
            Tout désactiver
          </Button>
        </div>
      </Card>

      {/* Permission sections */}
      <div className="space-y-4 mt-4">
        {sections.map((s) => {
          const visible = s.perms.filter((p) => p.label.toLowerCase().includes(search.toLowerCase()));
          if (visible.length === 0) return null;
          const sectionKeys = s.perms.map((p) => p.key);
          const allOn = sectionKeys.every((k) => perms[k]);
          const activeInSection = sectionKeys.filter((k) => perms[k]).length;
          return (
            <Card key={s.title} className="shadow-elegant overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="font-semibold text-sm">{s.title}</h3>
                  <p className="text-[11px] text-muted-foreground">
                    {activeInSection} / {sectionKeys.length} actives
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSection(sectionKeys, !allOn)}>
                  {allOn ? "Tout désactiver" : "Tout activer"}
                </Button>
              </div>
              <div className="divide-y divide-border">
                {visible.map((p) => (
                  <label
                    key={p.key}
                    className="px-4 py-3 flex items-center justify-between hover:bg-muted/20 cursor-pointer"
                  >
                    <span className="text-sm font-medium">{p.label}</span>
                    <Switch checked={perms[p.key] ?? false} onCheckedChange={() => toggle(p.key)} />
                  </label>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      {/* ============== Per-user permission overrides =============== */}
      <UserOverridesPanel />
    </AppLayout>
  );
}

function DeleteRoleButton({
  role, fallbackOptions, onConfirm,
}: {
  role: string;
  fallbackOptions: { value: string; label: string }[];
  onConfirm: (fallback: string) => Promise<void> | void;
}) {
  const [fallback, setFallback] = useState(fallbackOptions[0]?.value ?? "");
  const noOptions = fallbackOptions.length === 0;
  const invalid = !fallback || fallback === role;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4 mr-1.5" />Supprimer
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer le rôle « {role} » ?</AlertDialogTitle>
          <AlertDialogDescription>
            Les utilisateurs actuellement assignés à ce rôle seront déplacés vers le rôle de remplacement choisi.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5 py-2">
          <Label>Réassigner les utilisateurs vers</Label>
          {noOptions ? (
            <p className="text-xs text-destructive">
              Aucun rôle de remplacement disponible. Créez d'abord un autre rôle non-Administrateur.
            </p>
          ) : (
            <Select value={fallback} onValueChange={setFallback}>
              <SelectTrigger><SelectValue placeholder="Choisir un rôle…" /></SelectTrigger>
              <SelectContent>
                {fallbackOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {!noOptions && invalid && (
            <p className="text-xs text-destructive">Sélectionnez un rôle différent de « {role} ».</p>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              if (invalid || noOptions) { e.preventDefault(); return; }
              onConfirm(fallback);
            }}
            disabled={invalid || noOptions}
          >
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// =====================================================================
// Per-user permission overrides
// Admin selects a user and toggles each permission to: Hérité / Autoriser / Refuser.
// "Hérité" removes any override and falls back to role permissions + grants.
// =====================================================================
type OverridesMap = Record<string, "allow" | "deny">;
type UserListItem = { id: string; username: string; fullName: string; role: string };

function UserOverridesPanel() {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [target, setTarget] = useState<string>("");
  const [targetRole, setTargetRole] = useState<string>("");
  const [overrides, setOverrides] = useState<OverridesMap>({});
  const [effective, setEffective] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Load users list once.
  useEffect(() => {
    if (!API_ENABLED) return;
    api<{ users: UserListItem[] }>("/users.php")
      .then((r) => setUsers(r.users ?? []))
      .catch(() => {});
  }, []);

  const loadForUser = async (username: string) => {
    if (!API_ENABLED || !username) return;
    setLoading(true);
    try {
      const r = await api<{ overrides: OverridesMap; effective: Record<string, boolean>; role: string }>(
        `/user_permissions.php?user=${encodeURIComponent(username)}`,
      );
      setOverrides(r.overrides ?? {});
      setEffective(r.effective ?? {});
      setTargetRole(r.role ?? "");
      setDirty(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Échec du chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (target) void loadForUser(target);
  }, [target]);

  const setOverride = (perm: string, effect: "allow" | "deny" | "inherit") => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (effect === "inherit") delete next[perm];
      else next[perm] = effect;
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    if (!target) return;
    setSaving(true);
    try {
      // Send the full catalog: explicit allow/deny upserts, "inherit" deletes.
      const full: Record<string, string> = {};
      for (const k of ALL_PERMS) full[k] = (overrides[k] as string) ?? "inherit";
      const r = await api<{ effective: Record<string, boolean> }>("/user_permissions.php", {
        method: "PUT",
        body: { user: target, overrides: full },
      });
      setEffective(r.effective ?? {});
      setDirty(false);
      toast.success("Permissions individuelles enregistrées");
    } catch (e: any) {
      toast.error(e?.message ?? "Échec");
    } finally {
      setSaving(false);
    }
  };

  // ---- Bulk actions ---------------------------------------------------
  // Apply an effect to a set of permission keys at once.
  const bulkSet = (keys: string[], effect: "allow" | "deny" | "inherit") => {
    setOverrides((prev) => {
      const next = { ...prev };
      for (const k of keys) {
        if (effect === "inherit") delete next[k];
        else next[k] = effect;
      }
      return next;
    });
    setDirty(true);
  };

  // Reset all overrides for the user (full inherit) and persist immediately.
  const resetAllAndSave = async () => {
    if (!target) return;
    if (!(await confirmDialog({ title: "Confirmer l'action", description: "Réinitialiser tous les overrides ? L'utilisateur reprendra les permissions de son rôle.", tone: "warning", confirmText: "Continuer" }))) return;
    setOverrides({});
    setDirty(true);
    setSaving(true);
    try {
      const full: Record<string, string> = {};
      for (const k of ALL_PERMS) full[k] = "inherit";
      const r = await api<{ effective: Record<string, boolean> }>("/user_permissions.php", {
        method: "PUT",
        body: { user: target, overrides: full },
      });
      setEffective(r.effective ?? {});
      setDirty(false);
      toast.success("Overrides réinitialisés — rôle par défaut restauré");
    } catch (e: any) {
      toast.error(e?.message ?? "Échec");
    } finally {
      setSaving(false);
    }
  };

  const isAdminTarget = targetRole === "Administrateur";
  const filtered = useMemo(
    () =>
      sections
        .map((s) => ({
          ...s,
          perms: s.perms.filter(
            (p) =>
              p.label.toLowerCase().includes(search.toLowerCase()) ||
              p.key.toLowerCase().includes(search.toLowerCase()),
          ),
        }))
        .filter((s) => s.perms.length > 0),
    [search],
  );

  const totalAllow = Object.values(overrides).filter((v) => v === "allow").length;
  const totalDeny = Object.values(overrides).filter((v) => v === "deny").length;
  const visibleKeys = filtered.flatMap((s) => s.perms.map((p) => p.key));
  const hasAnyOverride = totalAllow + totalDeny > 0;

  return (
    <Card className="mt-8 shadow-elegant overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/30 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <UserCog className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Permissions par utilisateur</h3>
          <Badge variant="outline" className="text-[10px]">{totalAllow} autorisées · {totalDeny} refusées</Badge>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="Choisir un utilisateur…" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {users.map((u) => (
                <SelectItem key={u.id} value={u.username}>
                  {u.fullName} <span className="text-muted-foreground">@{u.username}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={save} disabled={!target || saving || loading || isAdminTarget || !dirty}>
            {saving ? "Enregistrement…" : dirty ? "Enregistrer" : "Enregistré"}
          </Button>
        </div>
      </div>

      {!target ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          Sélectionnez un utilisateur pour modifier ses overrides.
        </div>
      ) : isAdminTarget ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          <Lock className="h-5 w-5 mx-auto mb-2" />
          Le rôle Administrateur a tous les droits — les overrides ne s'appliquent pas.
        </div>
      ) : loading ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">Chargement…</div>
      ) : (
        <>
          <div className="px-4 py-2 border-b border-border flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une permission…"
              className="border-0 shadow-none focus-visible:ring-0 h-7 px-0"
            />
            <p className="text-[11px] text-muted-foreground whitespace-nowrap">
              Rôle : <span className="font-semibold">{targetRole}</span>
            </p>
          </div>
          {/* Bulk actions toolbar */}
          <div className="px-4 py-2 border-b border-border flex flex-wrap items-center gap-2 bg-muted/10">
            <span className="text-[11px] text-muted-foreground mr-1">Actions groupées :</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => bulkSet(visibleKeys, "inherit")}
              disabled={visibleKeys.length === 0}
              title="Hériter pour les permissions affichées (filtre actuel)"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Hériter ({visibleKeys.length})
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => bulkSet(visibleKeys, "allow")}
              disabled={visibleKeys.length === 0}
            >
              <Check className="h-3 w-3 mr-1" />
              Autoriser tout ({visibleKeys.length})
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => bulkSet(visibleKeys, "deny")}
              disabled={visibleKeys.length === 0}
            >
              <Ban className="h-3 w-3 mr-1" />
              Refuser tout ({visibleKeys.length})
            </Button>
            <span className="mx-1 h-4 w-px bg-border" />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={resetAllAndSave}
              disabled={saving || !hasAnyOverride}
              title="Supprimer TOUS les overrides et enregistrer"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Réinitialiser tout au rôle ({totalAllow + totalDeny})
            </Button>
          </div>
          <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
            {filtered.map((s) => (
              <div key={s.title}>
                <div className="px-4 py-2 bg-muted/30 sticky top-0 z-10">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {s.title}
                  </h4>
                </div>
                <div className="divide-y divide-border">
                  {s.perms.map((p) => {
                    const cur = overrides[p.key];
                    const eff = !!effective[p.key];
                    return (
                      <div key={p.key} className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-muted/20">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{p.label}</div>
                          <div className="text-[11px] text-muted-foreground font-mono truncate">{p.key}</div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${eff ? "bg-success/10 text-success border-success/30" : "bg-muted text-muted-foreground"}`}
                          >
                            {eff ? "Effectif: ON" : "Effectif: OFF"}
                          </Badge>
                          <Button
                            size="sm"
                            variant={cur === undefined ? "secondary" : "ghost"}
                            className="h-7 px-2 text-xs"
                            onClick={() => setOverride(p.key, "inherit")}
                            title="Hériter du rôle"
                          >
                            <RotateCcw className="h-3 w-3 mr-1" /> Hérité
                          </Button>
                          <Button
                            size="sm"
                            variant={cur === "allow" ? "default" : "ghost"}
                            className={`h-7 px-2 text-xs ${cur === "allow" ? "bg-success hover:bg-success/90 text-success-foreground" : ""}`}
                            onClick={() => setOverride(p.key, "allow")}
                            title="Forcer l'autorisation"
                          >
                            <Check className="h-3 w-3 mr-1" /> Autoriser
                          </Button>
                          <Button
                            size="sm"
                            variant={cur === "deny" ? "destructive" : "ghost"}
                            className="h-7 px-2 text-xs"
                            onClick={() => setOverride(p.key, "deny")}
                            title="Refuser explicitement"
                          >
                            <Ban className="h-3 w-3 mr-1" /> Refuser
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
