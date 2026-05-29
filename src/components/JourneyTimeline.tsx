import { DatePicker } from "@/components/ui/date-picker";
// Reusable journey timeline — full lifecycle of a prospect → opportunity → contract.
// Renders normalized events from src/lib/journey.ts with filters + export.
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  History, RefreshCw, Search, X, Download, UserPlus, FileSignature, Trophy, Ban,
  ArrowRight, RotateCcw, Pencil, Phone, MapPin, Bell, MessageSquare, LogIn, Trash2, Sparkles,
} from "lucide-react";
import { loadProspectJourney, type JourneyBundle, type JourneyEvent, type JourneyKind } from "@/lib/journey";
import { exportCSV } from "@/lib/exportUtils";

const KIND_LABEL: Record<JourneyKind, string> = {
  creation: "Création",
  assignment: "Assignation",
  stage_change: "Étape",
  field_change: "Modification",
  conversion: "Conversion",
  revert: "Retour",
  lost: "Perdu",
  won: "Gagné",
  action: "Action commerciale",
  attachment: "Pièce jointe",
  auth: "Auth",
  delete: "Suppression",
  other: "Autre",
};

const KIND_ICON: Record<JourneyKind, React.ComponentType<{ className?: string }>> = {
  creation: Sparkles,
  assignment: UserPlus,
  stage_change: ArrowRight,
  field_change: Pencil,
  conversion: FileSignature,
  revert: RotateCcw,
  lost: Ban,
  won: Trophy,
  action: Phone,
  attachment: MapPin,
  auth: LogIn,
  delete: Trash2,
  other: Bell,
};

const KIND_TONE: Record<JourneyKind, string> = {
  creation: "bg-primary/15 text-primary border-primary/30",
  assignment: "bg-info/15 text-info border-info/30",
  stage_change: "bg-warning/15 text-warning-foreground border-warning/30",
  field_change: "bg-muted text-muted-foreground border-border",
  conversion: "bg-success/15 text-success border-success/30",
  revert: "bg-warning/20 text-warning-foreground border-warning/40",
  lost: "bg-destructive/15 text-destructive border-destructive/30",
  won: "bg-success/20 text-success border-success/40",
  action: "bg-accent text-accent-foreground border-border",
  attachment: "bg-muted text-muted-foreground border-border",
  auth: "bg-muted text-muted-foreground border-border",
  delete: "bg-destructive/10 text-destructive border-destructive/20",
  other: "bg-muted text-muted-foreground border-border",
};

const ENTITY_LABEL = { prospect: "Lead", opportunity: "Opportunité", contract: "Contrat", system: "Système" } as const;

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }); }
  catch { return iso; }
}

export type JourneyTimelineProps = {
  prospectId: string;
  opportunityId?: string | null;
  contractId?: string | null;
  /** Hide the wrapping Card (when embedded in another Card). */
  bare?: boolean;
};

const QS_KEYS = ["from", "to", "kw", "entity", "kind", "user"] as const;

function readInitial() {
  if (typeof window === "undefined") {
    return { from: "", to: "", kw: "", entity: "all", kind: "all", user: "all" };
  }
  const sp = new URLSearchParams(window.location.search);
  return {
    from: sp.get("j_from") ?? "",
    to: sp.get("j_to") ?? "",
    kw: sp.get("j_kw") ?? "",
    entity: sp.get("j_entity") ?? "all",
    kind: sp.get("j_kind") ?? "all",
    user: sp.get("j_user") ?? "all",
  };
}

export function JourneyTimeline({ prospectId, opportunityId, contractId, bare = false }: JourneyTimelineProps) {
  const [bundle, setBundle] = useState<JourneyBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const initial = useMemo(() => readInitial(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [kw, setKw] = useState(initial.kw);
  const [fEntity, setFEntity] = useState<string>(initial.entity);
  const [fKind, setFKind] = useState<string>(initial.kind);
  const [fUser, setFUser] = useState<string>(initial.user);

  // Sync filters → URL (replaceState, doesn't push history)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const set = (k: string, v: string, def: string) => {
      if (v && v !== def) sp.set(k, v); else sp.delete(k);
    };
    set("j_from", from, "");
    set("j_to", to, "");
    set("j_kw", kw, "");
    set("j_entity", fEntity, "all");
    set("j_kind", fKind, "all");
    set("j_user", fUser, "all");
    const qs = sp.toString();
    const url = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
    window.history.replaceState(window.history.state, "", url);
  }, [from, to, kw, fEntity, fKind, fUser]);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const b = await loadProspectJourney({ prospectId, opportunityId, contractId });
      setBundle(b);
    } catch (e: any) { setErr(e?.message ?? "Erreur de chargement"); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [prospectId, opportunityId, contractId]);

  const events = bundle?.events ?? [];

  const userOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) {
      if (e.user) set.add(e.user);
      const meta: any = e.meta;
      if (meta && typeof meta === "object") {
        for (const k of ["assignedTo", "assigned_to", "newValue", "previousValue", "actor", "by"]) {
          const v = meta[k];
          if (typeof v === "string" && v.trim()) set.add(v.trim());
        }
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [events]);

  const filtered = useMemo(() => {
    const fromTs = from ? new Date(from + "T00:00:00").getTime() : null;
    const toTs = to ? new Date(to + "T23:59:59").getTime() : null;
    const k = kw.trim().toLowerCase();
    const u = fUser.toLowerCase();
    return events.filter((e) => {
      const t = new Date(e.timestamp).getTime();
      if (fromTs !== null && t < fromTs) return false;
      if (toTs !== null && t > toTs) return false;
      if (fEntity !== "all" && e.entity !== fEntity) return false;
      if (fKind !== "all" && e.kind !== fKind) return false;
      if (fUser !== "all") {
        const meta: any = e.meta ?? {};
        const candidates = [
          e.user,
          meta.assignedTo, meta.assigned_to,
          meta.actor, meta.by,
          meta.field === "assignedTo" || meta.field === "assigned_to" ? meta.newValue : null,
          meta.field === "assignedTo" || meta.field === "assigned_to" ? meta.previousValue : null,
        ].filter(Boolean).map((s: any) => String(s).toLowerCase());
        if (!candidates.includes(u)) return false;
      }
      if (k) {
        const hay = `${e.title} ${e.description ?? ""} ${e.user ?? ""} ${e.entity}`.toLowerCase();
        if (!hay.includes(k)) return false;
      }
      return true;
    });
  }, [events, from, to, kw, fEntity, fKind, fUser]);

  const clear = () => { setFrom(""); setTo(""); setKw(""); setFEntity("all"); setFKind("all"); setFUser("all"); };
  const hasFilter = !!(from || to || kw || fEntity !== "all" || fKind !== "all" || fUser !== "all");

  const onExport = () => {
    exportCSV(`parcours_${prospectId}_${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((e) => ({
        date: e.timestamp,
        entite: ENTITY_LABEL[e.entity],
        entite_id: e.entityId ?? "",
        type: KIND_LABEL[e.kind],
        titre: e.title,
        description: e.description ?? "",
        utilisateur: e.user ?? "",
        role: e.userRole ?? "",
        ip: e.ip ?? "",
      })),
    );
  };

  const body = (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 p-3 rounded-md border bg-muted/30">
        <div className="flex flex-col gap-1"><Label className="text-xs">Du</Label>
          <DatePicker value={from} onChange={setFrom} size="sm" className="w-[150px]" /></div>
        <div className="flex flex-col gap-1"><Label className="text-xs">Au</Label>
          <DatePicker value={to} onChange={setTo} size="sm" className="w-[150px]" /></div>
        <div className="flex flex-col gap-1 min-w-[140px]">
          <Label className="text-xs">Entité</Label>
          <Select value={fEntity} onValueChange={setFEntity}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              <SelectItem value="prospect">Lead</SelectItem>
              <SelectItem value="opportunity">Opportunité</SelectItem>
              <SelectItem value="contract">Contrat</SelectItem>
              <SelectItem value="system">Système</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 min-w-[160px]">
          <Label className="text-xs">Type d'événement</Label>
          <Select value={fKind} onValueChange={setFKind}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              {(Object.keys(KIND_LABEL) as JourneyKind[]).map((k) => (
                <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 min-w-[160px]">
          <Label className="text-xs">Utilisateur</Label>
          <Select value={fUser} onValueChange={setFUser}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              {userOptions.map((u) => (
                <SelectItem key={u} value={u}>@{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <Label className="text-xs">Recherche</Label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input type="search" value={kw} onChange={(e) => setKw(e.target.value)}
              placeholder="Titre, valeur, utilisateur…" className="h-8 pl-7" />
          </div>
        </div>
        {hasFilter && (
          <Button size="sm" variant="ghost" onClick={clear} className="h-8">
            <X className="h-3.5 w-3.5 mr-1" />Effacer
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onExport} className="h-8" disabled={!filtered.length}>
          <Download className="h-3.5 w-3.5 mr-1" />Excel
        </Button>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="h-8">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} / {events.length} événement(s)
        </span>
      </div>

      {err && (
        <p className="text-sm text-destructive">Erreur: {err}</p>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          {loading ? "Chargement…" : hasFilter ? "Aucun événement ne correspond aux filtres." : "Aucun événement enregistré."}
        </p>
      ) : (
        <ol className="relative border-l border-border ml-3 space-y-4">
          {filtered.map((e) => {
            const Icon = KIND_ICON[e.kind] ?? Bell;
            return (
              <li key={e.id} className="ml-6">
                <span className={`absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-background border ${KIND_TONE[e.kind]}`}>
                  <Icon className="h-3 w-3" />
                </span>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <Badge variant="outline" className={`text-[10px] uppercase ${KIND_TONE[e.kind]}`}>
                    {KIND_LABEL[e.kind]}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">{ENTITY_LABEL[e.entity]}</Badge>
                  <span className="text-sm font-semibold">{e.title}</span>
                  <span className="text-xs text-muted-foreground">{fmtDate(e.timestamp)}</span>
                  {e.user && (
                    <span className="text-xs text-muted-foreground">
                      par <span className="font-medium text-foreground">@{e.user}</span>
                      {e.userRole ? ` · ${e.userRole}` : ""}
                    </span>
                  )}
                  {e.ip && <span className="text-[10px] text-muted-foreground">IP {e.ip}</span>}
                </div>
                {e.description && (
                  <p className="mt-1 text-sm text-muted-foreground break-words whitespace-pre-wrap">
                    {e.description}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );

  if (bare) return body;

  return (
    <Card className="shadow-elegant">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" />Parcours complet du client
        </CardTitle>
        <CardDescription>
          Toutes les étapes — création, prises en charge, changements de statut,
          conversions, modifications de contrat, perte — avec auteur et horodatage.
        </CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
