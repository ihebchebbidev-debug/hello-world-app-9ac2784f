import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Users as UsersIcon, ArrowLeft, Mail, Shield, Activity } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useErp } from "@/lib/erpStore";
import { CustomFieldsCard } from "@/components/CustomFieldsCard";
import { EditUserDialog } from "@/components/EditUserDialog";
import { UserGrantsCard } from "@/components/UserGrantsCard";
import { useMemo } from "react";

export const Route = createFileRoute("/users/$username")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.username} — CRM` },
      { name: "description", content: "Fiche utilisateur: rôle, équipe, performance et champs personnalisés." },
    ],
  }),
  component: UserDetailPage,
});

const roleColor: Record<string, string> = {
  Administrateur: "bg-primary/10 text-primary border-primary/20",
  Manager: "bg-info/15 text-info border-info/20",
  Agent: "bg-success/15 text-success border-success/20",
  Backoffice: "bg-warning/15 text-warning-foreground border-warning/20",
};

function UserDetailPage() {
  const { username } = Route.useParams();
  const navigate = useNavigate();
  const { users, prospects, contracts } = useErp();
  const u = useMemo(() => users.find((x) => x.username === username), [users, username]);
  const myProspects = useMemo(() => prospects.filter((p) => p.assignedTo === username), [prospects, username]);
  const myContracts = useMemo(() => contracts.filter((c) => c.assignedTo === username), [contracts, username]);

  if (!u) {
    return (
      <AppLayout skeleton="detail">
        <div className="p-10 text-center">
          <h2 className="text-xl font-semibold">Utilisateur introuvable</h2>
          <Button className="mt-4" onClick={() => navigate({ to: "/users" })}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Retour
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout skeleton="detail">
      <PageHeader
        title={u.fullName}
        description={`@${u.username} — ${u.role} · ${u.team}`}
        icon={<UsersIcon className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <EditUserDialog user={u} />
            <Button variant="outline" size="sm" onClick={() => navigate({ to: "/users" })}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />Retour
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <div className="lg:col-span-2 space-y-4">
          <Card className="shadow-elegant">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Informations</CardTitle>
              <CardDescription>Identité et permissions</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <Info icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={u.email || "—"} />
              <Info icon={<Shield className="h-3.5 w-3.5" />} label="Rôle" value={u.role} />
              <Info icon={<UsersIcon className="h-3.5 w-3.5" />} label="Équipe" value={u.team} />
              <Info icon={<Activity className="h-3.5 w-3.5" />} label="Statut" value={u.active ? "Actif" : "Inactif"} />
            </CardContent>
          </Card>

          <Card className="shadow-elegant">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Performance</CardTitle>
              <CardDescription>Activité commerciale</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-3 text-sm">
              <Stat label="Leads" value={u.leadsHandled} />
              <Stat label="Contrats" value={u.contractsWon} />
              <Stat label="Conversion" value={`${u.conversionRate.toFixed(1)}%`} />
            </CardContent>
          </Card>

          <Card className="shadow-elegant">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Portefeuille</CardTitle>
              <CardDescription>{myProspects.length} prospect(s) · {myContracts.length} contrat(s)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {myProspects.slice(0, 8).map((p) => (
                <Link
                  key={p.id}
                  to="/prospects/$prospectId"
                  params={{ prospectId: p.id }}
                  className="flex items-center justify-between py-1 hover:text-primary"
                >
                  <span>{p.firstName} {p.lastName}</span>
                  <Badge variant="outline">{p.status}</Badge>
                </Link>
              ))}
              {myProspects.length === 0 && (
                <div className="text-muted-foreground italic">Aucun prospect attribué.</div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="shadow-elegant">
            <CardHeader className="pb-3"><CardTitle className="text-base">Statut</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Rôle</span>
                <Badge variant="outline" className={roleColor[u.role]}>{u.role}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Compte</span>
                <Badge variant="outline">{u.active ? "Actif" : "Inactif"}</Badge>
              </div>
            </CardContent>
          </Card>

          <CustomFieldsCard entity="user" entityId={u.username} />
          <UserGrantsCard username={u.username} />
        </div>
      </div>
    </AppLayout>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className="mt-0.5 font-medium truncate">{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-0.5">{value}</div>
    </div>
  );
}
