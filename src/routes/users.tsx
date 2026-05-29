import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Users as UsersIcon, Mail, Search, Download, FileSpreadsheet, FileText as FileCsv } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useErp } from "@/lib/erpStore";
import { ImportDialog, type ImportField } from "@/components/ImportDialog";
import { NewUserDialog } from "@/components/NewUserDialog";
import { EditUserDialog } from "@/components/EditUserDialog";
import { ResetPasswordDialog } from "@/components/ResetPasswordDialog";
import { useAuth } from "@/lib/auth";
import { Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { exportCSV, exportXLSX } from "@/lib/exportUtils";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useMemo, useState } from "react";
import { Can, useCan } from "@/components/Can";

// Order, keys & labels mirror the client's `personel.xlsx` template (Nom, poste,
// Date de naissance, CIN, Sté, CONTRAT, Salaire, Debit de contrat, Fin de
// contrat, renouvellement, fin renouvellement, observ, N°contact, RIB, date
// debit avec nous, Mail, augmentation). Labels are matched case-insensitively
// against the file headers by ImportDialog, so this template auto-maps without
// any manual remapping.
const USER_IMPORT_FIELDS: ImportField[] = [
  { key: "fullName", label: "Nom", required: true, sample: "Nada Souguir" },
  { key: "jobTitle", label: "poste", sample: "agent activation" },
  { key: "birthDate", label: "Date de naissance", sample: "1994-10-30" },
  { key: "cin", label: "CIN", sample: "12345678" },
  { key: "company", label: "Sté", sample: "height" },
  { key: "contractType", label: "CONTRAT", sample: "CDI" },
  { key: "salary", label: "Salaire", sample: "850" },
  { key: "contractStart", label: "Debit de contrat", sample: "2025-05-11" },
  { key: "contractEnd", label: "Fin de contrat", sample: "" },
  { key: "renewalStart", label: "renouvellement", sample: "" },
  { key: "renewalEnd", label: "fin renouvellement", sample: "" },
  { key: "observations", label: "observ", sample: "" },
  { key: "phone", label: "N°contact", sample: "94431140" },
  { key: "rib", label: "RIB", sample: "11060002351100878837" },
  { key: "hireDate", label: "date debit avec nous", sample: "2022-02-14" },
  { key: "email", label: "Mail", sample: "nadasouguir2@gmail.com" },
  { key: "salaryIncrease", label: "augmentation", sample: "900" },
  // Optional system columns kept for round-trip with our own export.
  { key: "username", label: "Nom d'utilisateur", sample: "nada.souguir" },
  { key: "role", label: "Rôle", sample: "Agent" },
  { key: "team", label: "Équipe", sample: "Lead-Actifs" },
  { key: "active", label: "Actif", sample: "true" },
];

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "Utilisateurs — CRM" },
      { name: "description", content: "Gestion des utilisateurs, équipes et performances individuelles." },
    ],
  }),
  component: UsersPage,
});

const roleColorMap: Record<string, string> = {
  primary: "bg-primary/10 text-primary border-primary/20",
  info: "bg-info/15 text-info border-info/20",
  success: "bg-success/15 text-success border-success/20",
  warning: "bg-warning/15 text-warning-foreground border-warning/20",
  destructive: "bg-destructive/15 text-destructive border-destructive/20",
  accent: "bg-accent/15 text-accent-foreground border-accent/20",
  muted: "bg-muted text-muted-foreground border-border",
};

const ALL = "__all__";

function UsersPage() {
  const { users, importUsers, deleteUser, roles } = useErp();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "Administrateur";
  const can = useCan();
  const canEdit = isAdmin || can("user.edit");
  const canDelete = isAdmin || can("user.delete");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (q) {
        const hay = `${u.fullName} ${u.username} ${u.email} ${u.team}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (roleFilter !== ALL && u.role !== roleFilter) return false;
      if (statusFilter === "active" && !u.active) return false;
      if (statusFilter === "inactive" && u.active) return false;
      return true;
    });
  }, [users, search, roleFilter, statusFilter]);

  return (
    <AppLayout skeleton="table">
      <PageHeader
        title="Utilisateurs"
        description={`${users.length} utilisateurs — gérez les comptes, équipes et performance`}
        icon={<UsersIcon className="h-5 w-5" />}
        actions={
          <>
            <ExportUsersMenu rows={users} />
            <Can perm="user.add">
              <ImportDialog
                title="Importer des utilisateurs"
                description="Migrez vos comptes depuis un CSV ou Excel — mappez les colonnes puis validez."
                fields={USER_IMPORT_FIELDS}
                templateFileName="modele-utilisateurs.xlsx"
                existingIds={users.map((u) => u.username)}
                idField="username"
                entity="user"
                onImport={(rows) => importUsers(rows)}
              />
            </Can>
            <Can perm="user.add"><NewUserDialog /></Can>
          </>
        }
      />

      {/* Quick filter bar */}
      <Card className="mt-6 p-3 shadow-elegant flex flex-col md:flex-row gap-2 md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, email, équipe…"
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="md:w-44"><SelectValue placeholder="Rôle" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les rôles</SelectItem>
            {roles.map((r) => (
              <SelectItem key={r.name} value={r.name}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="md:w-36"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous</SelectItem>
            <SelectItem value="active">Actifs</SelectItem>
            <SelectItem value="inactive">Inactifs</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground md:ml-2 md:whitespace-nowrap">
          {filtered.length} / {users.length}
        </div>
      </Card>

      {selected.size > 0 && canDelete && (
        <Card className="mt-4 p-3 shadow-elegant bg-primary/5 border-primary/20 flex items-center justify-between gap-2 flex-wrap">
          <div className="text-sm font-medium">{selected.size} utilisateur(s) sélectionné(s)</div>
          <div className="flex gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={bulkBusy}>
                  <Trash2 className="h-4 w-4 mr-1" />Supprimer
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Supprimer {selected.size} utilisateur(s) ?</AlertDialogTitle>
                  <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction onClick={async () => {
                    const ids = Array.from(selected);
                    setBulkBusy(true);
                    let ok = 0;
                    try {
                      for (const id of ids) {
                        try { await deleteUser(id); ok++; } catch { /* ignore per-row */ }
                      }
                      toast.success(`${ok}/${ids.length} utilisateur(s) supprimé(s)`);
                      setSelected(new Set());
                    } finally { setBulkBusy(false); }
                  }}>Supprimer</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Désélectionner</Button>
          </div>
        </Card>
      )}

      <Card className="mt-4 shadow-elegant overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                {canDelete && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filtered.length > 0 && filtered.every((u) => selected.has(u.id))}
                      onCheckedChange={(v) => {
                        const next = new Set(selected);
                        if (v) filtered.forEach((u) => next.add(u.id));
                        else filtered.forEach((u) => next.delete(u.id));
                        setSelected(next);
                      }}
                      aria-label="Tout sélectionner"
                    />
                  </TableHead>
                )}
                <TableHead>Utilisateur</TableHead>
                <TableHead className="hidden md:table-cell">Rôle</TableHead>
                <TableHead className="hidden lg:table-cell">Équipe</TableHead>
                <TableHead className="hidden md:table-cell">Leads</TableHead>
                <TableHead>Contrats</TableHead>
                <TableHead className="hidden lg:table-cell">Conversion</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canDelete ? 9 : 8} className="text-center py-10 text-sm text-muted-foreground">
                    Aucun utilisateur ne correspond à votre recherche.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((u) => (
                <TableRow key={u.id} className="hover:bg-muted/30 transition-base" data-selected={selected.has(u.id) || undefined}>
                  {canDelete && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(u.id)}
                        onCheckedChange={(v) => {
                          const next = new Set(selected);
                          if (v) next.add(u.id); else next.delete(u.id);
                          setSelected(next);
                        }}
                        aria-label={`Sélectionner ${u.fullName}`}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <Link
                      to="/users/$username"
                      params={{ username: u.username }}
                      className="block hover:text-primary transition-base"
                    >
                      <div className="font-medium text-sm">{u.fullName}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" />{u.email}</div>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell"><Badge variant="outline" className={roleColorMap[roles.find((r) => r.name === u.role)?.color ?? "muted"] ?? roleColorMap.muted}>{roles.find((r) => r.name === u.role)?.label ?? u.role}</Badge></TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{u.team}</TableCell>
                  <TableCell className="hidden md:table-cell font-medium text-sm">{u.leadsHandled}</TableCell>
                  <TableCell className="font-semibold text-sm">{u.contractsWon}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-sm font-medium">{u.conversionRate.toFixed(1)}%</span>
                  </TableCell>
                  <TableCell>
                    {u.active ? (
                      <Badge variant="outline" className="bg-success/15 text-success border-success/20">Actif</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-muted text-muted-foreground">Inactif</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && <EditUserDialog user={u} />}
                      {isAdmin && (
                        <ResetPasswordDialog userId={u.id} username={u.username} fullName={u.fullName} />
                      )}
                      {canDelete && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" aria-label="Supprimer"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Supprimer l'utilisateur ?</AlertDialogTitle>
                              <AlertDialogDescription>{u.fullName} ({u.username}) sera supprimé.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annuler</AlertDialogCancel>
                              <AlertDialogAction onClick={async () => { try { await deleteUser(u.id); } catch (e: any) { /* noop */ } }}>Supprimer</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </AppLayout>
  );
}

/**
 * Export menu — produces a complete user dump (all HR + perf columns) as
 * CSV or XLSX. Columns mirror USER_IMPORT_FIELDS so an export can be
 * re-imported as-is.
 */
// Headers exactly mirror the client's `personel.xlsx` template so that an
// exported file can be re-imported (or sent to the client) without remapping.
const EXPORT_COLUMNS: { key: string; label: string }[] = [
  { key: "fullName", label: "Nom" },
  { key: "jobTitle", label: "poste" },
  { key: "birthDate", label: "Date de naissance" },
  { key: "cin", label: "CIN" },
  { key: "company", label: "Sté" },
  { key: "contractType", label: "CONTRAT" },
  { key: "salary", label: "Salaire" },
  { key: "contractStart", label: "Debit de contrat" },
  { key: "contractEnd", label: "Fin de contrat" },
  { key: "renewalStart", label: "renouvellement" },
  { key: "renewalEnd", label: "fin renouvellement" },
  { key: "observations", label: "observ" },
  { key: "phone", label: "N°contact" },
  { key: "rib", label: "RIB" },
  { key: "hireDate", label: "date debit avec nous" },
  { key: "email", label: "Mail" },
  { key: "salaryIncrease", label: "augmentation" },
  // System / perf columns appended at the end.
  { key: "username", label: "Nom d'utilisateur" },
  { key: "role", label: "Rôle" },
  { key: "team", label: "Équipe" },
  { key: "active", label: "Actif" },
  { key: "leadsHandled", label: "Leads traités" },
  { key: "contractsWon", label: "Contrats signés" },
  { key: "conversionRate", label: "Taux conversion (%)" },
];

function ExportUsersMenu({ rows }: { rows: ReadonlyArray<Record<string, unknown>> }) {
  const buildRows = () =>
    rows.map((u) => {
      const out: Record<string, unknown> = {};
      for (const c of EXPORT_COLUMNS) {
        const v = (u as Record<string, unknown>)[c.key];
        out[c.label] = v === null || v === undefined ? "" : v;
      }
      return out;
    });
  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={rows.length === 0}>
          <Download className="h-4 w-4 mr-1.5" /> Exporter
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          onClick={() => {
            try { exportCSV(`utilisateurs-${stamp}.csv`, buildRows()); toast.success(`${rows.length} utilisateur(s) exporté(s)`); }
            catch { toast.error("Échec de l'export Excel"); }
          }}
        >
          <FileCsv className="h-4 w-4 mr-2" /> Exporter en Excel
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            try { await exportXLSX(`utilisateurs-${stamp}.xlsx`, buildRows(), "Utilisateurs"); toast.success(`${rows.length} utilisateur(s) exporté(s)`); }
            catch { toast.error("Échec de l'export Excel"); }
          }}
        >
          <FileSpreadsheet className="h-4 w-4 mr-2" /> Exporter en Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
