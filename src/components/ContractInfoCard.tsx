import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Pencil, Save, X, Network } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { entityEditPerm } from "@/lib/entityPerms";

export type ContractInfoEntity = "prospect" | "opportunity" | "contract";

export type ContractInfo = {
  entity: ContractInfoEntity;
  entityId: string;
  typeConn: string[];
  referenceTt: string;
  telLigne: string;
  dateActivation: string | null;
  etape: string[];
  interfaceType: string[];
  fsi: string;
  motifRetourTt: string[];
  etat: "" | "En cours" | "Basculement" | "Rejete" | "Valide";
  remarque: string;
  createdAt: string | null;
  createdBy: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  inheritedFrom: string | null;
  exists: boolean;
};

export const TYPE_OPTIONS = ["ADSL", "VdsL", "GPON", "Box"];
export const ETAPE_OPTIONS = ["2", "3", "4"];
export const INTERFACE_OPTIONS = ["Animacom", "AHLANET", "AYNET", "Franchise AK", "autre"];
export const MOTIF_OPTIONS = ["Instance com", "Instance Tech"];
export const FSI_OPTIONS = ["Topnet"];
export const ETAT_OPTIONS: ContractInfo["etat"][] = ["En cours", "Basculement", "Rejete", "Valide"];

export async function fetchContractInfo(entity: ContractInfoEntity, id: string): Promise<ContractInfo> {
  const r = await api<{ info: ContractInfo }>("/contract_info.php", { query: { entity, id } });
  return r.info;
}

export async function saveContractInfo(entity: ContractInfoEntity, id: string, data: Partial<ContractInfo>) {
  const r = await api<{ info: ContractInfo }>("/contract_info.php", {
    method: "PUT",
    query: { entity, id },
    body: data,
  });
  return r.info;
}

function emptyDraft(entity: ContractInfoEntity, id: string): ContractInfo {
  return {
    entity, entityId: id,
    typeConn: [], referenceTt: "", telLigne: "", dateActivation: null,
    etape: [], interfaceType: [], fsi: "", motifRetourTt: [], etat: "", remarque: "",
    createdAt: null, createdBy: null, updatedAt: null, updatedBy: null,
    inheritedFrom: null, exists: false,
  };
}

export function ContractInfoCard({
  entity,
  entityId,
}: {
  entity: ContractInfoEntity;
  entityId: string;
}) {
  const qc = useQueryClient();
  const { user, hasPermission } = useAuth();
  const canEdit = user?.role === "Administrateur" || hasPermission(entityEditPerm(entity));
  const queryKey = ["contract-info", entity, entityId];
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchContractInfo(entity, entityId),
    enabled: !!entityId,
  });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ContractInfo>(() => emptyDraft(entity, entityId));

  // Sync draft from server data only when NOT editing (don't clobber user input).
  useEffect(() => {
    if (data && !editing) setDraft(data);
  }, [data, editing]);

  const startEdit = () => {
    const base = data ?? emptyDraft(entity, entityId);
    setDraft({ ...base, entity, entityId });
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setDraft(data ?? emptyDraft(entity, entityId));
  };

  const mut = useMutation({
    mutationFn: (d: ContractInfo) => saveContractInfo(entity, entityId, d),
    onSuccess: (info) => {
      qc.setQueryData(queryKey, info);
      qc.invalidateQueries({ queryKey: ["contract-info"] });
      setEditing(false);
      setDraft(info);
      toast.success("Informations contrat enregistrées");
    },
    onError: (e: unknown) => {
      const msg = e instanceof ApiError ? e.message : "Erreur lors de l'enregistrement";
      toast.error(msg);
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Information contrat</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Chargement…</CardContent>
      </Card>
    );
  }
  if (error) {
    return (
      <Card>
        <CardHeader><CardTitle>Information contrat</CardTitle></CardHeader>
        <CardContent className="text-sm text-destructive">
          {(error as Error).message}
        </CardContent>
      </Card>
    );
  }

  const info = data ?? emptyDraft(entity, entityId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Network className="h-4 w-4" /> Information contrat
          </CardTitle>
          <p className="text-xs text-muted-foreground">Détails techniques</p>
          {info.inheritedFrom && !info.exists && !editing && (
            <Badge variant="secondary" className="font-normal text-xs">
              Hérité de {info.inheritedFrom}
            </Badge>
          )}
        </div>
        {!editing ? (
          canEdit ? (
            <Button type="button" size="sm" variant="outline" onClick={startEdit}>
              <Pencil className="h-4 w-4 mr-1" /> Modifier
            </Button>
          ) : null
        ) : (
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={cancelEdit} disabled={mut.isPending}>
              <X className="h-4 w-4 mr-1" /> Annuler
            </Button>
            <Button type="button" size="sm" onClick={() => mut.mutate(draft)} disabled={mut.isPending || !canEdit}>
              <Save className="h-4 w-4 mr-1" /> {mut.isPending ? "…" : "Enregistrer"}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {!editing ? (
          <ReadView info={info} />
        ) : (
          <EditView draft={draft} onChange={setDraft} />
        )}
        {!editing && (
          <div className="mt-4 pt-3 border-t grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <MetaLine label="Créé le"     value={formatDt(info.createdAt)} />
            <MetaLine label="Créer par"   value={info.createdBy || "—"} />
            <MetaLine label="Modifié le"  value={formatDt(info.updatedAt)} />
            <MetaLine label="Modifier par" value={info.updatedBy || "—"} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium uppercase text-muted-foreground tracking-wide">{label}</Label>
      <div>{children}</div>
    </div>
  );
}

function ListBadges({ values, empty = "—" }: { values: string[]; empty?: string }) {
  if (!values || values.length === 0) return <span className="text-muted-foreground text-sm">{empty}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((v) => (<Badge key={v} variant="secondary" className="font-normal">{v}</Badge>))}
    </div>
  );
}

function ReadView({ info }: { info: ContractInfo }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Type"><ListBadges values={info.typeConn} /></Field>
      <Field label="Référence TT"><span className="text-sm">{info.referenceTt || "—"}</span></Field>
      <Field label="Tél de la ligne"><span className="text-sm">{info.telLigne || "—"}</span></Field>
      <Field label="Date d'activation TT"><span className="text-sm">{info.dateActivation || "—"}</span></Field>
      <Field label="Étape"><ListBadges values={info.etape} /></Field>
      <Field label="Interface"><ListBadges values={info.interfaceType} /></Field>
      <Field label="FSI"><span className="text-sm">{info.fsi || "—"}</span></Field>
      <Field label="État"><span className="text-sm">{info.etat || "—"}</span></Field>
      <Field label="Motif retour TT"><ListBadges values={info.motifRetourTt} /></Field>
      <div className="md:col-span-2">
        <Field label="Remarque">
          <p className="text-sm whitespace-pre-wrap">{info.remarque || "—"}</p>
        </Field>
      </div>
    </div>
  );
}

function EditView({ draft, onChange }: { draft: ContractInfo; onChange: (d: ContractInfo) => void }) {
  const set = <K extends keyof ContractInfo>(k: K, v: ContractInfo[K]) => onChange({ ...draft, [k]: v });
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Type">
        <Select
          value={(draft.typeConn[0] as string) || "__none"}
          onValueChange={(v) => set("typeConn", v === "__none" ? [] : [v])}
        >
          <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">—</SelectItem>
            {TYPE_OPTIONS.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Référence TT">
        <Input value={draft.referenceTt} onChange={(e) => set("referenceTt", e.target.value)} />
      </Field>
      <Field label="Tél de la ligne">
        <Input value={draft.telLigne} onChange={(e) => set("telLigne", e.target.value)} />
      </Field>
      <Field label="Date d'activation TT">
        <Input type="date" value={draft.dateActivation ?? ""} onChange={(e) => set("dateActivation", e.target.value || null)} />
      </Field>
      <Field label="Étape">
        <Select
          value={(draft.etape[0] as string) || "__none"}
          onValueChange={(v) => set("etape", v === "__none" ? [] : [v])}
        >
          <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">—</SelectItem>
            {ETAPE_OPTIONS.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Interface">
        <Select
          value={(draft.interfaceType[0] as string) || "__none"}
          onValueChange={(v) => set("interfaceType", v === "__none" ? [] : [v])}
        >
          <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">—</SelectItem>
            {INTERFACE_OPTIONS.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="FSI">
        <Select value={draft.fsi || "__none"} onValueChange={(v) => set("fsi", v === "__none" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">—</SelectItem>
            {FSI_OPTIONS.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="État">
        <Select value={draft.etat || "__none"} onValueChange={(v) => set("etat", (v === "__none" ? "" : v) as ContractInfo["etat"])}>
          <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">—</SelectItem>
            {ETAT_OPTIONS.map((o) => (<SelectItem key={o} value={o!}>{o}</SelectItem>))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Motif retour TT">
        <Select
          value={(draft.motifRetourTt[0] as string) || "__none"}
          onValueChange={(v) => set("motifRetourTt", v === "__none" ? [] : [v])}
        >
          <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">—</SelectItem>
            {MOTIF_OPTIONS.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
          </SelectContent>
        </Select>
      </Field>
      <div className="md:col-span-2">
        <Field label="Remarque">
          <Textarea rows={3} value={draft.remarque} onChange={(e) => set("remarque", e.target.value)} />
        </Field>
      </div>
    </div>
  );
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</span>
      <span className="text-xs text-foreground tabular-nums">{value}</span>
    </div>
  );
}

function formatDt(v: string | null): string {
  if (!v) return "—";
  const s = String(v).replace("T", " ");
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T]?(\d{2}:\d{2})?/);
  if (!m) return s;
  return m[2] ? `${m[1]} ${m[2]}` : m[1];
}

