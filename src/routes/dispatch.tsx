import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Shuffle, Inbox, Hand, CheckCircle2, XCircle, Phone, Mail, Clock, Users, Loader2, Search, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useErp } from "@/lib/erpStore";
import { api, API_ENABLED } from "@/lib/api";
import { formatAmount, useCurrency } from "@/lib/currency";
import { useAuth } from "@/lib/auth";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { LostDialog as SharedLostDialog } from "@/components/LostDialog";

export const Route = createFileRoute("/dispatch")({
  head: () => ({
    meta: [
      { title: "Dispatch — CRM" },
      { name: "description", content: "Affectation des leads aux agents avec quotas et files d'attente." },
    ],
  }),
  component: DispatchPage,
});

function DispatchPage() {
  const { prospects, users, claimLead, markWon, markLost, getAgentStats, refresh } = useErp();
  const currency = useCurrency();
  const auth = useAuth();
  const me = auth.user?.username ?? "";
  const role = auth.user?.role;
  const isDispatcher = role === "Administrateur" || role === "Manager" || role === "Backoffice";

  const queue = useMemo(
    () => prospects.filter((p) => p.assignedTo === null || p.assignedTo === ""),
    [prospects],
  );
  const myLeads = useMemo(
    () => prospects.filter((p) => p.assignedTo === me && p.outcome === "pending"),
    [prospects, me],
  );
  const agents = useMemo(
    () => users.filter((u) => (u.role === "Agent" || u.role === "Manager" || u.role === "AgentSuivi" || u.role === "AgentActivation" || u.role === "AgentVente") && u.active),
    [users],
  );

  // Search + pagination + bulk selection
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAgent, setBulkAgent] = useState<string>("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const filteredQueue = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return queue;
    return queue.filter((p) => {
      const hay = `${p.firstName} ${p.lastName} ${p.phone} ${p.email} ${p.city} ${p.source}`.toLowerCase();
      return hay.includes(q);
    });
  }, [queue, search]);

  const totalPages = Math.max(1, Math.ceil(filteredQueue.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pagedQueue = useMemo(
    () => filteredQueue.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [filteredQueue, safePage],
  );

  const toggleOne = (id: string, v: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (v) next.add(id); else next.delete(id);
      return next;
    });
  // Select all = all leads on the current filtered page
  const allOnPageSelected = pagedQueue.length > 0 && pagedQueue.every((p) => selected.has(p.id));
  const toggleAllOnPage = (v: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      pagedQueue.forEach((p) => { if (v) next.add(p.id); else next.delete(p.id); });
      return next;
    });
  };

  const bulkAgentLabel = useMemo(() => {
    const a = agents.find((x) => x.username === bulkAgent);
    return a ? `@${a.username}${a.fullName ? ` — ${a.fullName}` : ""}` : `@${bulkAgent}`;
  }, [agents, bulkAgent]);

  const requestBulkAssign = () => {
    if (!bulkAgent) { toast.error("Choisissez un agent"); return; }
    if (selected.size === 0) { toast.error("Aucun lead sélectionné"); return; }
    setConfirmOpen(true);
  };

  const bulkAssign = async () => {
    const target = bulkAgent;
    const ids = Array.from(selected);
    if (!target || ids.length === 0) { setConfirmOpen(false); return; }
    setBulkBusy(true);
    try {
      if (API_ENABLED) {
        await api("/prospects.php", {
          method: "POST",
          body: { action: "bulk", op: "assign", ids, assignedTo: target },
        });
        await refresh();
      } else {
        for (const id of ids) claimLead(id, target);
      }
      toast.success("Leads attribués", { description: `${ids.length} lead(s) → @${target}` });
      setSelected(new Set());
      setConfirmOpen(false);
    } catch (e: any) {
      toast.error("Échec de l'attribution", { description: e?.message ?? "Erreur serveur" });
    } finally {
      setBulkBusy(false);
    }
  };

  const productQuotas = useMemo(() => {
    const colors = [
      "var(--primary)", "var(--chart-3)", "var(--chart-5)",
      "var(--chart-3)", "var(--chart-4)", "var(--primary-glow)",
    ];
    const counts = new Map<string, number>();
    prospects.forEach((p) => {
      const k = p.source || "Autre";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    });
    const sources = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([s]) => s);
    return sources.map((source, i) => {
      const all = prospects.filter((p) => p.source === source);
      const dispatched = all.filter((p) => p.assignedTo !== null && p.assignedTo !== "").length;
      const waiting = all.filter((p) => p.assignedTo === null || p.assignedTo === "").length;
      const quota = Math.max(10, Math.ceil(all.length / 10) * 10);
      return { product: source, quota, dispatched, waiting, color: colors[i % colors.length] };
    });
  }, [prospects]);

  const handleClaim = (prospectId: string) => {
    claimLead(prospectId, me);
    toast.success("Lead attribué", { description: `Affecté à @${me}` });
  };

  return (
    <AppLayout skeleton="table">
      <PageHeader
        title="Dispatch"
        description="File d'attente, attribution et suivi des résultats par agent"
        icon={<Shuffle className="h-5 w-5" />}
        actions={
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
            Connecté: @{me}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {productQuotas.map((p) => {
          const pct = Math.min(100, (p.dispatched / p.quota) * 100);
          return (
            <Card key={p.product} className="p-4 shadow-elegant">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Produit</div>
                  <div className="font-semibold mt-0.5">{p.product}</div>
                </div>
                <div className="h-8 w-8 rounded-lg" style={{ background: p.color }} />
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-semibold">{p.dispatched}</span>
                <span className="text-sm text-muted-foreground">/ {p.quota}</span>
              </div>
              <Progress value={pct} className="mt-2 h-1.5" />
              <div className="mt-2 text-xs text-muted-foreground">
                <span className="text-warning-foreground font-medium">{p.waiting}</span> en file d'attente
              </div>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="queue" className="mt-6">
        <TabsList>
          <TabsTrigger value="queue" className="gap-2">
            <Inbox className="h-4 w-4" /> File d'attente
            <Badge variant="secondary" className="ml-1">{queue.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="mine" className="gap-2">
            <Hand className="h-4 w-4" /> Mes leads
            <Badge variant="secondary" className="ml-1">{myLeads.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="agents" className="gap-2">
            <Shuffle className="h-4 w-4" /> Performance agents
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-4">
          <Card className="shadow-elegant overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between gap-3 flex-wrap">
              <h3 className="font-semibold text-sm">
                Leads non attribués
                <span className="ml-2 text-xs text-muted-foreground font-normal">
                  ({filteredQueue.length}{search ? ` / ${queue.length}` : ""})
                </span>
              </h3>
              <span className="text-xs text-muted-foreground">
                {isDispatcher
                  ? "Sélectionnez plusieurs leads pour les attribuer en lot."
                  : "Cliquez sur \"Prendre\" pour vous assigner un lead"}
              </span>
            </div>

            {/* Search bar */}
            {queue.length > 0 && (
              <div className="px-4 py-2 border-b border-border bg-background">
                <div className="relative max-w-md">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                    placeholder="Rechercher par nom, téléphone, email, ville, source…"
                    className="h-8 pl-8 text-xs"
                  />
                </div>
              </div>
            )}

            {isDispatcher && filteredQueue.length > 0 && (
              <div className="px-4 py-2 border-b border-border bg-background flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="select-all-queue"
                    checked={allOnPageSelected}
                    onCheckedChange={(v) => toggleAllOnPage(!!v)}
                  />
                  <Label htmlFor="select-all-queue" className="text-xs cursor-pointer">
                    Tout sélectionner sur cette page ({selected.size} sélectionné{selected.size > 1 ? "s" : ""})
                  </Label>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <Select value={bulkAgent} onValueChange={setBulkAgent}>
                    <SelectTrigger className="h-8 w-[200px] text-xs">
                      <SelectValue placeholder="Choisir un agent…" />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">Aucun agent actif</div>
                      ) : (
                        agents.map((a) => (
                          <SelectItem key={a.id} value={a.username}>
                            @{a.username} {a.fullName ? `— ${a.fullName}` : ""}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={requestBulkAssign}
                    disabled={bulkBusy || selected.size === 0 || !bulkAgent}
                  >
                    {bulkBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Hand className="h-4 w-4 mr-1.5" />}
                    Attribuer ({selected.size})
                  </Button>
                </div>
              </div>
            )}

            {filteredQueue.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                <Inbox className="h-8 w-8 mx-auto mb-2 opacity-40" />
                {queue.length === 0
                  ? "File vide — tous les leads ont été attribués"
                  : "Aucun résultat pour votre recherche"}
              </div>
            ) : (
              <>
                <div className="divide-y divide-border">
                  {pagedQueue.map((p) => (
                    <div key={p.id} className="p-4 flex flex-wrap items-center gap-3 hover:bg-muted/20 transition-base">
                      {isDispatcher && (
                        <Checkbox
                          checked={selected.has(p.id)}
                          onCheckedChange={(v) => toggleOne(p.id, !!v)}
                          aria-label={`Sélectionner ${p.firstName} ${p.lastName}`}
                        />
                      )}
                      <div className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold shrink-0">
                        {p.firstName[0]}{p.lastName[0]}
                      </div>
                      <div className="flex-1 min-w-[160px]">
                        <div className="font-medium text-sm">{p.civility} {p.lastName} {p.firstName}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                          <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{p.phone}</span>
                          <span className="hidden sm:flex items-center gap-1"><Mail className="h-3 w-3" />{p.email}</span>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-info/10 text-info border-info/20">{p.source}</Badge>
                      <span className="text-xs text-muted-foreground hidden md:flex items-center gap-1">
                        <Clock className="h-3 w-3" />{p.createdAt}
                      </span>
                      <Button size="sm" onClick={() => handleClaim(p.id)} className="bg-primary text-primary-foreground hover:bg-primary/90">
                        <Hand className="h-4 w-4 mr-1.5" />Prendre
                      </Button>
                    </div>
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="px-4 py-2 border-t border-border bg-muted/20 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Page {safePage + 1} / {totalPages} — {filteredQueue.length} lead{filteredQueue.length > 1 ? "s" : ""}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        disabled={safePage === 0}
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        disabled={safePage >= totalPages - 1}
                        onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>

          {/* Bulk-assign confirmation */}
          <Dialog open={confirmOpen} onOpenChange={(o) => !bulkBusy && setConfirmOpen(o)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-warning-foreground" />
                  Confirmer l'attribution
                </DialogTitle>
                <DialogDescription>
                  Vous êtes sur le point d'attribuer{" "}
                  <span className="font-semibold text-foreground">{selected.size} lead{selected.size > 1 ? "s" : ""}</span>{" "}
                  à <span className="font-semibold text-foreground">{bulkAgentLabel}</span>.
                  Cette action est immédiate et l'agent verra les leads dans son portefeuille.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={bulkBusy}>
                  Annuler
                </Button>
                <Button onClick={bulkAssign} disabled={bulkBusy}>
                  {bulkBusy ? (
                    <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Attribution…</>
                  ) : (
                    <>Confirmer l'attribution</>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="mine" className="mt-4">
          <Card className="shadow-elegant overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <h3 className="font-semibold text-sm">Leads à traiter — @{me}</h3>
            </div>
            {myLeads.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Aucun lead en cours. Allez dans la file d'attente pour en prendre.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {myLeads.map((p) => (
                  <div key={p.id} className="p-4 flex flex-wrap items-center gap-3 hover:bg-muted/20 transition-base">
                    <div className="h-9 w-9 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xs font-semibold shrink-0">
                      {p.firstName[0]}{p.lastName[0]}
                    </div>
                    <div className="flex-1 min-w-[160px]">
                      <div className="font-medium text-sm">{p.civility} {p.lastName} {p.firstName}</div>
                      <div className="text-xs text-muted-foreground">{p.phone} • {p.source}</div>
                    </div>
                    <WonDialog currency={currency} onConfirm={(premium, partner) => { markWon(p.id, premium, partner); toast.success("Contrat enregistré", { description: `${p.firstName} ${p.lastName} • ${formatAmount(premium, currency)}` }); }} />
                    <SharedLostDialog onConfirm={(payload) => { markLost(p.id, payload.formatted); toast("Lead marqué perdu", { description: payload.formatted }); }} />
                    {/* legacy local dialog removed */}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="agents" className="mt-4">
          <Card className="shadow-elegant overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <h3 className="font-semibold text-sm">Performance par agent</h3>
            </div>
            <div className="divide-y divide-border">
              {agents.map((a) => {
                const s = getAgentStats(a.username);
                const quota = 8;
                const pct = Math.min(100, (s.handled / quota) * 100);
                return (
                  <div key={a.id} className="p-4 flex flex-wrap items-center gap-4 hover:bg-muted/20">
                    <div className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
                      {a.fullName.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div className="flex-1 min-w-[140px]">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{a.fullName}</span>
                        <span className="text-xs text-muted-foreground">@{a.username}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{a.team}</div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="outline" className="bg-success/15 text-success border-success/20">{s.won} gagnés</Badge>
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">{s.lost} perdus</Badge>
                      <Badge variant="outline" className="bg-warning/15 text-warning-foreground border-warning/20">{s.pending} en cours</Badge>
                    </div>
                    <div className="hidden md:flex flex-col items-end min-w-[180px]">
                      <div className="text-xs text-muted-foreground mb-1">{s.handled} / {quota} leads · conv. {s.conversion.toFixed(1)}%</div>
                      <Progress value={pct} className="h-1.5 w-40" />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}

function WonDialog({ onConfirm, currency }: { onConfirm: (premium: number, partner: string) => void; currency: import("@/lib/currency").Currency }) {
  const [open, setOpen] = useState(false);
  const [premium, setPremium] = useState("950");
  const [partner, setPartner] = useState("NEOLIANE");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-success/30 text-success hover:bg-success/10">
          <CheckCircle2 className="h-4 w-4 mr-1.5" />Gagné
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marquer comme contrat gagné</DialogTitle>
          <DialogDescription>Un nouveau contrat sera créé et les statistiques de l'agent mises à jour.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="partner">Partenaire</Label>
            <Select value={partner} onValueChange={setPartner}>
              <SelectTrigger id="partner"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["NEOLIANE", "SPVIE", "APRIL", "APIVIA", "MALAKOFF"].map((x) => (
                  <SelectItem key={x} value={x}>{x}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="premium">Cotisation annuelle ({currency.symbol})</Label>
            <Input id="premium" type="number" value={premium} onChange={(e) => setPremium(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => { onConfirm(Number(premium) || 0, partner); setOpen(false); }}
          >
            Confirmer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LostDialog({ onConfirm }: { onConfirm: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("Pas intéressé");
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10">
          <XCircle className="h-4 w-4 mr-1.5" />Perdu
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marquer le lead comme perdu</DialogTitle>
          <DialogDescription>Précisez la raison pour analyser les pertes.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="reason">Raison</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="reason"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Pas intéressé", "Trop cher", "Concurrent", "Injoignable", "Autre"].map((x) => (
                  <SelectItem key={x} value={x}>{x}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">Note (optionnel)</Label>
            <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button
            variant="destructive"
            onClick={() => { onConfirm(note ? `${reason} — ${note}` : reason); setOpen(false); }}
          >
            Confirmer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
