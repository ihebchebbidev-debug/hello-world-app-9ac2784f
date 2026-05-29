import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useTeams } from "@/hooks/use-teams";
import { useErp } from "@/lib/erpStore";
import { roleLabel } from "@/lib/roleLabels";
import type { AppTeam } from "@/lib/types";

export function TeamsPanel() {
  const { teams, loading, refresh } = useTeams();
  const { roles } = useErp();
  const allRoleNames = useMemo(
    () => roles.map((r) => r.name).filter((n) => n !== "Administrateur"),
    [roles],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Équipes</h3>
          <p className="text-sm text-muted-foreground">
            Une équipe regroupe plusieurs rôles. Les utilisateurs assignés à une équipe
            héritent de l'union des permissions de tous ses rôles (le rôle individuel est ignoré).
          </p>
        </div>
        <TeamDialog allRoles={allRoleNames} onSaved={refresh} />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : teams.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune équipe pour le moment.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {teams.map((t) => (
            <TeamCard key={t.id} team={t} allRoles={allRoleNames} onChanged={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}

function TeamCard({
  team, allRoles, onChanged,
}: { team: AppTeam; allRoles: string[]; onChanged: () => void }) {
  const remove = async () => {
    try {
      await api(`/teams.php?id=${encodeURIComponent(team.id)}`, { method: "DELETE" });
      toast.success("Équipe supprimée");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur de suppression");
    }
  };
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{team.name}</div>
          {team.description ? (
            <div className="text-xs text-muted-foreground">{team.description}</div>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <TeamDialog team={team} allRoles={allRoles} onSaved={onChanged} />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" aria-label="Supprimer">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer l'équipe « {team.name} » ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Les utilisateurs membres seront détachés de cette équipe (leur rôle
                  individuel reste inchangé). Cette action est irréversible.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={remove}>Supprimer</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {team.roles.length === 0 ? (
          <span className="text-xs text-muted-foreground italic">Aucun rôle</span>
        ) : (
          team.roles.map((r) => (
            <Badge key={r} variant="secondary" className="font-normal">{roleLabel(r)}</Badge>
          ))
        )}
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
        <Users className="h-3.5 w-3.5" />
        {team.memberCount ?? 0} membre{(team.memberCount ?? 0) > 1 ? "s" : ""}
      </div>
    </div>
  );
}

function TeamDialog({
  team, allRoles, onSaved,
}: { team?: AppTeam; allRoles: string[]; onSaved: () => void }) {
  const isEdit = !!team;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(team?.name ?? "");
  const [description, setDescription] = useState(team?.description ?? "");
  const [selected, setSelected] = useState<string[]>(team?.roles ?? []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(team?.name ?? "");
      setDescription(team?.description ?? "");
      setSelected(team?.roles ?? []);
    }
  }, [open, team]);

  const toggle = (r: string) =>
    setSelected((s) => (s.includes(r) ? s.filter((x) => x !== r) : [...s, r]));

  const submit = async () => {
    if (!name.trim()) { toast.error("Nom requis"); return; }
    setSaving(true);
    try {
      if (isEdit) {
        await api("/teams.php?action=update", {
          method: "PUT",
          body: JSON.stringify({ id: team!.id, name: name.trim(), description, roles: selected }),
        });
        toast.success("Équipe mise à jour");
      } else {
        await api("/teams.php?action=create", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), description, roles: selected }),
        });
        toast.success("Équipe créée");
      }
      setOpen(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur d'enregistrement");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button size="icon" variant="ghost" aria-label="Modifier"><Pencil className="h-4 w-4" /></Button>
        ) : (
          <Button><Plus className="h-4 w-4 mr-1" /> Nouvelle équipe</Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier l'équipe" : "Nouvelle équipe"}</DialogTitle>
          <DialogDescription>
            Sélectionnez les rôles dont les permissions seront cumulées pour les membres.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Nom *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Backoffice" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description ?? ""} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Rôles membres</Label>
            <div className="rounded-md border p-3 max-h-[260px] overflow-y-auto space-y-2">
              {allRoles.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucun rôle disponible.</p>
              ) : (
                allRoles.map((r) => (
                  <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={selected.includes(r)}
                      onCheckedChange={() => toggle(r)}
                    />
                    <span>{roleLabel(r)}</span>
                    <span className="text-[11px] text-muted-foreground">({r})</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Annuler</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
