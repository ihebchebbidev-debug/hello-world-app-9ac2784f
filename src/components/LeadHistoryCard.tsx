import { DatePicker } from "@/components/ui/date-picker";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, RefreshCw, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, API_ENABLED } from "@/lib/api";
import { LeadActionsTimeline } from "@/components/LeadActionsTimeline";

type ChangeRow = {
  id: string;
  entityType: string;
  entityId: string;
  field: string;
  previousValue: string;
  newValue: string;
  user: string;
  timestamp: string;
};

const FIELD_LABELS: Record<string, string> = {
  civility: "Civilité",
  last_name: "Nom",
  first_name: "Prénom",
  phone: "Tél 1",
  phone2: "Tél 2",
  cin: "CIN",
  birth_date: "Date naissance",
  email: "Email",
  source: "Source",
  status: "Statut",
  assigned_to: "Assigné à",
  city: "Ville",
  address: "Adresse",
  zone: "Zone",
  outcome: "Résultat",
  lost_reason: "Raison perte",
  comment: "Commentaire 1",
  comment2: "Commentaire 2",
  check_valeur: "Vérif. valeur",
};

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

/**
 * Affiche l'historique complet des modifications d'un lead :
 * chaque champ modifié, ancienne valeur → nouvelle valeur, auteur, horodatage.
 * Réservé Admin/Superviseur (le contrôle se fait au niveau du parent).
 */
export function LeadHistoryCard({ prospectId }: { prospectId: string }) {
  const [rows, setRows] = useState<ChangeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [keyword, setKeyword] = useState<string>("");

  const load = async () => {
    if (!API_ENABLED) return;
    setLoading(true);
    try {
      const r: any = await api(`/activity.php?entity=prospect&entity_id=${encodeURIComponent(prospectId)}&limit=500`);
      setRows(Array.isArray(r?.activity) ? r.activity : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [prospectId]);

  const fromTs = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : null;
  const toTs = dateTo ? new Date(dateTo + "T23:59:59").getTime() : null;
  const kw = keyword.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    const t = new Date(r.timestamp).getTime();
    if (fromTs !== null && t < fromTs) return false;
    if (toTs !== null && t > toTs) return false;
    if (kw) {
      const label = (FIELD_LABELS[r.field] ?? r.field).toLowerCase();
      const hay = `${label} ${r.field} ${r.previousValue ?? ""} ${r.newValue ?? ""} ${r.user ?? ""}`.toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });

  const clearFilters = () => { setDateFrom(""); setDateTo(""); setKeyword(""); };
  const hasFilter = !!(dateFrom || dateTo || keyword);

  return (
    <div className="space-y-4">
      <Card className="shadow-elegant">
        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" />Historique des modifications
            </CardTitle>
            <CardDescription>
              Toutes les modifications de ce lead (champ, ancienne/nouvelle valeur, auteur, date)
            </CardDescription>
          </div>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3 mb-4 p-3 rounded-md border bg-muted/30">
            <div className="flex flex-col gap-1">
              <Label htmlFor="hist-from" className="text-xs">Du</Label>
              <DatePicker id="hist-from" value={dateFrom} onChange={setDateFrom} size="sm" className="w-[160px]" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="hist-to" className="text-xs">Au</Label>
              <DatePicker id="hist-to" value={dateTo} onChange={setDateTo} size="sm" className="w-[160px]" />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
              <Label htmlFor="hist-kw" className="text-xs">Recherche</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  id="hist-kw"
                  type="search"
                  placeholder="Champ, valeur, utilisateur…"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="h-8 pl-7"
                />
              </div>
            </div>
            {hasFilter && (
              <Button size="sm" variant="ghost" onClick={clearFilters} className="h-8">
                <X className="h-3.5 w-3.5 mr-1" />Effacer
              </Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {filtered.length} / {rows.length} modification(s)
            </span>
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              {loading ? "Chargement…" : hasFilter ? "Aucune modification sur cette période." : "Aucune modification enregistrée."}
            </p>
          ) : (
            <ol className="relative border-l border-border ml-2 space-y-3">
              {filtered.map((r) => (
                <li key={r.id} className="ml-4">
                  <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary/70 border-2 border-background" />
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {FIELD_LABELS[r.field] ?? r.field}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{fmtDate(r.timestamp)}</span>
                    <span className="text-xs text-muted-foreground">par <span className="font-medium text-foreground">@{r.user}</span></span>
                  </div>
                  <div className="mt-1 text-sm flex flex-wrap items-center gap-1">
                    <span className="line-through text-muted-foreground break-all">
                      {r.previousValue || <em>vide</em>}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-medium break-all">
                      {r.newValue || <em>vide</em>}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Actions commerciales horodatées (déjà existantes) */}
      <LeadActionsTimeline prospectId={prospectId} />
    </div>
  );
}
