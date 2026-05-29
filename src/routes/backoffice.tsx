import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Wrench, Users, ShieldCheck, UsersRound, Building2, Briefcase, Heart, Package, Tag, ListChecks, Receipt, CheckCircle2, Stethoscope } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useErp } from "@/lib/erpStore";
import { useMemo } from "react";

export const Route = createFileRoute("/backoffice")({
  head: () => ({
    meta: [
      { title: "Backoffice — CRM" },
      { name: "description", content: "Configuration des données de référence: produits, partenaires, statuts." },
    ],
  }),
  component: BackofficePage,
});

function BackofficePage() {
  const { users, contracts, prospects } = useErp();

  const items = useMemo(() => {
    const teams = new Set(users.map((u) => u.team).filter(Boolean));
    const partners = new Set(contracts.map((c) => c.partner).filter(Boolean));
    const cabinets = new Set(contracts.map((c) => c.cabinet).filter(Boolean));
    const sources = new Set(prospects.map((p) => p.source).filter(Boolean));
    const statuses = new Set(prospects.map((p) => p.status).filter(Boolean));
    const billingStatuses = new Set(contracts.map((c) => c.billingStatus).filter(Boolean));
    return [
      { label: "Utilisateur", icon: Users, count: users.length, link: "/users" },
      { label: "Rôle", icon: ShieldCheck, count: 4, link: "/roles" },
      { label: "Équipe", icon: UsersRound, count: teams.size },
      { label: "Partenaire Santé", icon: Heart, count: partners.size },
      { label: "Cabinet", icon: Building2, count: cabinets.size },
      { label: "Fournisseur / Produit", icon: Package, count: partners.size },
      { label: "Produit Complémentaire Santé", icon: Briefcase, count: 0 },
      { label: "Produit Santé", icon: Stethoscope, count: 0 },
      { label: "Garantie", icon: CheckCircle2, count: 0 },
      { label: "Source Prospect", icon: Tag, count: sources.size },
      { label: "Statut Appel", icon: ListChecks, count: statuses.size },
      { label: "Statut Facturation", icon: Receipt, count: billingStatuses.size },
    ];
  }, [users, contracts, prospects]);

  return (
    <AppLayout skeleton="form">
      <PageHeader
        title="Backoffice"
        description="Configurez les données de référence de votre ERP"
        icon={<Wrench className="h-5 w-5" />}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {items.map((it) => {
          const inner = (
            <Card className="p-5 shadow-elegant hover:shadow-elevated transition-base cursor-pointer group h-full">
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center group-hover:scale-105 transition-base">
                  <it.icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{it.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{it.count} entrée{it.count > 1 ? "s" : ""}</div>
                </div>
                <span className="text-muted-foreground group-hover:text-primary transition-base">→</span>
              </div>
            </Card>
          );
          return it.link ? (
            <Link key={it.label} to={it.link}>{inner}</Link>
          ) : (
            <div key={it.label}>{inner}</div>
          );
        })}
      </div>
    </AppLayout>
  );
}
