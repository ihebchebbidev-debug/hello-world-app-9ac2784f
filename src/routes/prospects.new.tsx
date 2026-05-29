import { DatePicker } from "@/components/ui/date-picker";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Upload, X, FileText, Image as ImageIcon, Loader2, AlertTriangle, UserPlus } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useErp } from "@/lib/erpStore";
import { api, apiUpload, API_ENABLED } from "@/lib/api";
import type { ProspectType } from "@/lib/types";
import { ensureDefaultProspectTypes } from "@/lib/prospectTypes";
import { toast } from "sonner";
import { CustomFieldsInline, validateRequiredCustomValues } from "@/components/CustomFieldsInline";
import { compressImageToBudget, isCompressibleImage, MAX_ATTACHMENT_BYTES } from "@/lib/compressImage";
import { normalizeLocalisationXy, normalizeCodePostal, isValidLocalisationXy } from "@/lib/geo";
import {
  CategorizedAttachmentSlots,
  type AttachmentCategoryKey,
  type CategorizedSlotState,
  withCategoryPrefix,
  categoryLabelOf,
} from "@/components/CategorizedAttachmentSlots";

import { RequirePerm } from "@/components/RequirePerm";

export const Route = createFileRoute("/prospects/new")({
  head: () => ({
    meta: [
      { title: "Nouveau prospect — CRM" },
      { name: "description", content: "Créer un nouveau lead avec ses coordonnées, source et pièces jointes." },
      { property: "og:title", content: "Nouveau prospect — CRM" },
      { property: "og:description", content: "Création d'un lead dans le CRM." },
    ],
  }),
  component: GuardedNewProspectPage,
});

function GuardedNewProspectPage() {
  return (
    <RequirePerm perm="prospect.add" backTo="/prospects" backLabel="Retour aux prospects">
      <NewProspectPage />
    </RequirePerm>
  );
}


const SOURCES = ["Terrain", "Facebook", "Base de donné", "Technicien"];
const STATUSES = [
  "Ok","Att cin","Att confirmation","Rappel","refuse","migration","Basculement",
  "Ing","Nrp","Pas de rep","Pas intersse","Déjà connecté","Autr dde encor","Autre",
];

type DupMatch = {
  id: string; lastName: string; firstName: string;
  phone: string; phone2: string; cin: string;
  status: string; assignedTo: string | null; createdAt: string;
};

type StagedFile = { original: File; toUpload: File; status: "ready" | "too_big" | "rejected"; reason?: string };

async function stageFile(f: File): Promise<StagedFile> {
  const mime = (f.type || "").toLowerCase();
  const isPdf = mime === "application/pdf";
  const isImg = mime.startsWith("image/");
  if (!isPdf && !isImg) return { original: f, toUpload: f, status: "rejected", reason: "Format refusé (PDF ou image uniquement)" };
  let toUpload = f;
  if (isImg && f.size > MAX_ATTACHMENT_BYTES && isCompressibleImage(f)) {
    try { toUpload = await compressImageToBudget(f); } catch { /* fall back */ }
  }
  if (toUpload.size > MAX_ATTACHMENT_BYTES) {
    return { original: f, toUpload, status: "too_big", reason: `Trop volumineux (${Math.round(toUpload.size / 1024)} Ko > 100 Ko)` };
  }
  return { original: f, toUpload, status: "ready" };
}

function NewProspectPage() {
  const navigate = useNavigate();
  const { importProspects, users, prospects } = useErp();
  const [saving, setSaving] = useState(false);
  const [civility, setCivility] = useState<"M" | "Mme">("M");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState("");
  const [phone2, setPhone2] = useState("");
  const [ancienLigne, setAncienLigne] = useState("");
  const [cin, setCin] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [email, setEmail] = useState("");
  const [gouvernorat, setGouvernorat] = useState("");
  const [delegation, setDelegation] = useState("");
  const [address, setAddress] = useState("");
  const [localisationXy, setLocalisationXy] = useState("");
  const [codePostal, setCodePostal] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("__none__");
  const [observ1, setObserv1] = useState("");
  const [observ2, setObserv2] = useState("");
  const [animateur, setAnimateur] = useState("");
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [types, setTypes] = useState<ProspectType[]>([]);
  const [typeId, setTypeId] = useState<string>("");
  const [duplicates, setDuplicates] = useState<DupMatch[]>([]);
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [staging, setStaging] = useState(false);
  const [slots, setSlots] = useState<Record<string, CategorizedSlotState>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Vérification anciens clients (CIN / téléphone)
  useEffect(() => {
    const cinV = cin.trim();
    const phV = phone.trim();
    const ph2V = phone2.trim();
    if (cinV.length < 4 && phV.length < 6 && ph2V.length < 6) { setDuplicates([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await api<{ matches: DupMatch[] }>("/prospects.php", {
          query: { check_duplicate: "1", cin: cinV, phone: phV, phone2: ph2V },
        });
        setDuplicates(r.matches ?? []);
      } catch { /* silent */ }
    }, 350);
    return () => clearTimeout(t);
  }, [cin, phone, phone2]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const active = await ensureDefaultProspectTypes();
        if (cancel) return;
        setTypes(active);
        setTypeId((prev) => prev || active[0]?.id || "");
      } catch { /* optional */ }
    })();
    return () => { cancel = true; };
  }, []);

  const agents = users.filter((u) => ["Agent", "Manager", "AgentSuivi", "AgentActivation", "AgentVente"].includes(u.role));
  const currentTypeName = (types.find((t) => t.id === typeId)?.name ?? "").trim().toLowerCase();
  const isStreetType = currentTypeName === "street";
  const showAncienLigne = currentTypeName === "résiliation" || currentTypeName === "resiliation" || currentTypeName === "migration";

  const addFiles = async (list: FileList | File[] | null) => {
    if (!list) return;
    const arr = Array.from(list);
    if (!arr.length) return;
    setStaging(true);
    try {
      const staged = await Promise.all(arr.map(stageFile));
      setFiles((prev) => [...prev, ...staged]);
      const rejected = staged.filter((s) => s.status !== "ready");
      if (rejected.length) toast.warning(`${rejected.length} fichier(s) non utilisable(s)`);
    } finally { setStaging(false); }
  };

  const stageSlot = async (key: AttachmentCategoryKey, file: File) => {
    setSlots((s) => ({ ...s, [key]: { file, status: "uploading", message: "Préparation…" } }));
    const staged = await stageFile(file);
    setSlots((s) => ({
      ...s,
      [key]: {
        file: staged.toUpload,
        status: staged.status === "ready" ? "done" : "error",
        message: staged.status === "ready" ? "Prêt à envoyer" : staged.reason,
      },
    }));
  };

  const submit = async () => {
    if (!lastName.trim()) { toast.error("Nom obligatoire"); return; }
    if (!isValidLocalisationXy(localisationXy)) {
      toast.error("Localisation XY invalide", { description: "Format attendu : lat,lng (ex: 36.123456,10.123698)" });
      return;
    }
    const missing = await validateRequiredCustomValues("prospect", customValues, typeId || null);
    if (missing) { toast.error(`${missing} est requis`); return; }
    setSaving(true);
    try {
      const r = await importProspects([{
        civility,
        lastName: lastName.trim(),
        firstName: firstName.trim(),
        phone: phone.trim(),
        phone2: phone2.trim(),
        ancienLigne: showAncienLigne ? (ancienLigne.trim() || null) : null,
        cin: cin.trim() || undefined,
        birthDate: birthDate || null,
        email: email.trim(),
        gouvernorat: gouvernorat.trim().toUpperCase(),
        delegation: delegation.trim(),
        address: address.trim(),
        localisationXy: normalizeLocalisationXy(localisationXy) || null,
        codePostal: normalizeCodePostal(codePostal) || null,
        source, status,
        assignedTo: assignedTo === "__none__" ? null : assignedTo,
        createdAt: new Date().toISOString().slice(0, 10),
        comment: observ1.trim() || undefined,
        comment2: observ2.trim() || undefined,
        animateur: isStreetType ? (animateur.trim() || null) : null,
        customValues,
        typeId: typeId || null,
      } as any]);
      const newId = r.ids?.[0];
      if (r.added + r.updated > 0 && newId) {
        const ready = files.filter((f) => f.status === "ready");
        const slotEntries = (Object.entries(slots) as [AttachmentCategoryKey, CategorizedSlotState][])
          .filter(([, st]) => st?.file && st.status === "done");
        if ((ready.length || slotEntries.length) && API_ENABLED) {
          for (const sf of ready) {
            try {
              await apiUpload("/attachments.php", { entity: "prospect", entity_id: newId, file: sf.toUpload });
            } catch (e: any) {
              toast.error(`Échec envoi ${sf.original.name}`, { description: e?.message });
            }
          }
          for (const [key, st] of slotEntries) {
            try {
              const labelled = withCategoryPrefix(st.file!, categoryLabelOf(key));
              await apiUpload("/attachments.php", { entity: "prospect", entity_id: newId, file: labelled });
            } catch (e: any) {
              toast.error(`Échec envoi ${categoryLabelOf(key)}`, { description: e?.message });
            }
          }
        }
        const total = ready.length + slotEntries.length;
        toast.success("Prospect créé", { description: total ? `${total} pièce(s) jointe(s)` : undefined });
        navigate({ to: "/prospects/$prospectId", params: { prospectId: newId } });
      } else {
        toast.error("Création impossible");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur lors de la création");
    } finally {
      setSaving(false);
    }
  };

  void prospects;

  return (
    <AppLayout skeleton="form">
      <PageHeader
        title="Nouveau prospect"
        description="Renseignez la fiche du lead — tous les champs sauf Nom sont optionnels."
        icon={<UserPlus className="h-5 w-5" />}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/prospects"><ArrowLeft className="h-4 w-4 mr-1.5" />Retour</Link>
          </Button>
        }
      />

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6 shadow-elegant lg:col-span-2 space-y-6">
          {/* Identité */}
          <section>
            <h2 className="text-sm font-semibold mb-3 text-foreground">Identité</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {types.length > 0 && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Type de prospect</Label>
                  <Select value={typeId} onValueChange={setTypeId}>
                    <SelectTrigger><SelectValue placeholder="Choisir un type…" /></SelectTrigger>
                    <SelectContent>
                      {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Civilité</Label>
                <Select value={civility} onValueChange={(v) => setCivility(v as "M" | "Mme")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">M</SelectItem>
                    <SelectItem value="Mme">Mme</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Date de naissance</Label>
                <DatePicker value={birthDate} onChange={setBirthDate} max={new Date().toISOString().slice(0,10)} />
              </div>
              <div className="space-y-1.5">
                <Label>Nom *</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="BEN ALI" />
              </div>
              <div className="space-y-1.5">
                <Label>Prénom</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Mohamed" />
              </div>
              <div className="space-y-1.5">
                <Label>CIN <span className="text-[10px] text-muted-foreground">(unique si renseigné)</span></Label>
                <Input value={cin} onChange={(e) => setCin(e.target.value)} placeholder="12345678" />
              </div>
              <div className="space-y-1.5">
                <Label>Mail</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ex@mail.com" />
              </div>
            </div>
          </section>

          {/* Contact */}
          <section className="border-t border-border pt-6">
            <h2 className="text-sm font-semibold mb-3 text-foreground">Contact & adresse</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Gsm 1</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="20123456" />
              </div>
              <div className="space-y-1.5">
                <Label>Gsm 2</Label>
                <Input value={phone2} onChange={(e) => setPhone2(e.target.value)} placeholder="20123457" />
              </div>
              {showAncienLigne && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Ancien Ligne <span className="text-[10px] text-muted-foreground">(résiliation / migration)</span></Label>
                  <Input value={ancienLigne} onChange={(e) => setAncienLigne(e.target.value)} placeholder="Ancien numéro" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Gouvernorat</Label>
                <Input value={gouvernorat} onChange={(e) => setGouvernorat(e.target.value)} placeholder="TUNIS" />
              </div>
              <div className="space-y-1.5">
                <Label>Délégation</Label>
                <Input value={delegation} onChange={(e) => setDelegation(e.target.value)} placeholder="La Marsa" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Adresse</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="12 rue …" />
              </div>
              <div className="space-y-1.5">
                <Label>Localisation XY <span className="text-[10px] text-muted-foreground">(lat,lng Google Maps)</span></Label>
                <Input
                  value={localisationXy}
                  onChange={(e) => setLocalisationXy(e.target.value)}
                  onBlur={(e) => setLocalisationXy(normalizeLocalisationXy(e.target.value))}
                  placeholder="36.123456,10.123698"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Code postal</Label>
                <Input
                  value={codePostal}
                  onChange={(e) => setCodePostal(e.target.value)}
                  onBlur={(e) => setCodePostal(normalizeCodePostal(e.target.value))}
                  placeholder="2078"
                  maxLength={20}
                />
              </div>
            </div>
          </section>

          {/* Qualification */}
          <section className="border-t border-border pt-6">
            <h2 className="text-sm font-semibold mb-3 text-foreground">Qualification</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Source retirée de l'UI — déduite désormais du type de prospect. */}
              <div className="space-y-1.5">
                <Label>Statut</Label>
                <Select value={status || "__blank__"} onValueChange={(v) => setStatus(v === "__blank__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__blank__">—</SelectItem>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Assigné à</Label>
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Non attribué —</SelectItem>
                    {agents.map((u) => <SelectItem key={u.username} value={u.username}>{u.fullName} (@{u.username})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Observation 1</Label>
                <Input value={observ1} onChange={(e) => setObserv1(e.target.value)} placeholder="Notes…" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Observation 2</Label>
                <Input value={observ2} onChange={(e) => setObserv2(e.target.value)} placeholder="Notes complémentaires…" />
              </div>
              {isStreetType && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Animateur <span className="text-[10px] text-muted-foreground">(prospects Street)</span></Label>
                  <Input value={animateur} onChange={(e) => setAnimateur(e.target.value)} placeholder="Nom de l'animateur" />
                </div>
              )}
              <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <CustomFieldsInline entity="prospect" values={customValues} onChange={setCustomValues} typeId={typeId || null} />
              </div>
            </div>
          </section>

          {/* Pièces jointes */}
          <section className="border-t border-border pt-6 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">
              Pièces jointes <span className="text-[10px] font-normal text-muted-foreground">(PDF ou images, max 100 Ko après compression — aucun champ obligatoire)</span>
            </h2>

            <CategorizedAttachmentSlots
              slots={slots}
              onPick={(key, file) => void stageSlot(key, file)}
              onClear={(key) => setSlots((s) => { const c = { ...s }; delete c[key]; return c; })}
            />

            <div>
              <Label className="text-xs text-muted-foreground">Autres pièces jointes (libres)</Label>
            <div
              className="mt-1.5 rounded-lg border-2 border-dashed border-border hover:bg-muted/30 p-4 text-center cursor-pointer transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); void addFiles(e.dataTransfer.files); }}
            >
              <input ref={fileInputRef} type="file" accept="application/pdf,image/*" multiple className="hidden"
                onChange={(e) => void addFiles(e.target.files)} />
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                {staging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {staging ? "Préparation…" : "Glissez vos fichiers ou cliquez"}
              </div>
            </div>
            {files.length > 0 && (
              <div className="mt-2 space-y-1">
                {files.map((sf, i) => (
                  <div key={i} className={`flex items-center gap-2 text-xs rounded-md border px-2 py-1.5 ${
                    sf.status === "ready" ? "bg-success/5 border-success/20"
                      : "bg-destructive/5 border-destructive/20 text-destructive"
                  }`}>
                    {sf.original.type.startsWith("image/") ? <ImageIcon className="h-3.5 w-3.5 shrink-0" /> : <FileText className="h-3.5 w-3.5 shrink-0" />}
                    <span className="truncate flex-1">{sf.original.name}</span>
                    <span className="text-[10px] opacity-70">
                      {Math.round(sf.original.size / 1024)} Ko
                      {sf.toUpload.size !== sf.original.size && ` → ${Math.round(sf.toUpload.size / 1024)} Ko`}
                    </span>
                    {sf.reason && <span className="text-[10px] italic">{sf.reason}</span>}
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5"
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            </div>
          </section>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" asChild disabled={saving}>
              <Link to="/prospects">Annuler</Link>
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "Création…" : "Créer le prospect"}
            </Button>
          </div>
        </Card>

        {/* Side panel — duplicates / hints */}
        <aside className="space-y-4">
          {duplicates.length > 0 ? (
            <Card className="p-4 border-warning/40 bg-warning/5">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <AlertTriangle className="h-4 w-4 text-warning" />
                {duplicates.length} doublon{duplicates.length > 1 ? "s" : ""} détecté{duplicates.length > 1 ? "s" : ""}
              </div>
              <p className="text-xs text-muted-foreground mt-1">CIN ou téléphone déjà présent dans le CRM.</p>
              <ul className="mt-3 space-y-1.5 text-xs">
                {duplicates.slice(0, 8).map((d) => (
                  <li key={d.id}>
                    <Link to="/prospects/$prospectId" params={{ prospectId: d.id }} className="text-primary hover:underline font-medium">
                      {d.lastName} {d.firstName}
                    </Link>
                    <span className="text-muted-foreground"> — {d.phone || d.phone2 || d.cin} • {d.status}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-1">Conseils</h3>
              <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                <li>Renseignez le CIN pour éviter les doublons.</li>
                <li>Les pièces jointes sont compressées automatiquement.</li>
                <li>Vous pourrez modifier la fiche après création.</li>
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </AppLayout>
  );
}
