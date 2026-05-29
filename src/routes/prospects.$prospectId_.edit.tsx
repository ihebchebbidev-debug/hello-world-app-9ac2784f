import { DatePicker } from "@/components/ui/date-picker";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useErp } from "@/lib/erpStore";
import { api } from "@/lib/api";
import type { ProspectType } from "@/lib/types";
import { ensureDefaultProspectTypes } from "@/lib/prospectTypes";
import { toast } from "sonner";
import { CustomFieldsInline, validateRequiredCustomValues } from "@/components/CustomFieldsInline";
import { normalizeLocalisationXy, normalizeCodePostal, isValidLocalisationXy } from "@/lib/geo";

import { RequirePerm } from "@/components/RequirePerm";

export const Route = createFileRoute("/prospects/$prospectId_/edit")({
  head: ({ params }) => ({
    meta: [
      { title: `Modifier le lead ${params.prospectId} — CRM` },
      { name: "description", content: "Modifier toutes les informations du prospect." },
    ],
  }),
  component: GuardedEditProspectPage,
});

function GuardedEditProspectPage() {
  return (
    <RequirePerm perm="prospect.edit" backTo="/prospects" backLabel="Retour aux prospects">
      <EditProspectPage />
    </RequirePerm>
  );
}


const SOURCES = ["Terrain", "Facebook", "Base de donné", "Technicien", "Autre"];
const STATUSES = [
  "Ok","Att cin","Att confirmation","Rappel","refuse","migration","Basculement",
  "Ing","Nrp","Pas de rep","Pas intersse","Déjà connecté","Autr dde encor","Autre",
];

function EditProspectPage() {
  const { prospectId } = Route.useParams();
  const navigate = useNavigate();
  const { prospects, users, updateProspect } = useErp();
  const prospect = useMemo(() => prospects.find((p) => p.id === prospectId), [prospects, prospectId]);

  const [saving, setSaving] = useState(false);
  const [types, setTypes] = useState<ProspectType[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [customLoaded, setCustomLoaded] = useState(false);

  // Form state — initialized once when prospect is loaded.
  const [civility, setCivility] = useState<"M" | "Mme">("M");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState("");
  const [phone2, setPhone2] = useState("");
  const [ancienLigne, setAncienLigne] = useState("");
  const [animateur, setAnimateur] = useState("");
  const [cin, setCin] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [email, setEmail] = useState("");
  const [gouvernorat, setGouvernorat] = useState("");
  const [delegation, setDelegation] = useState("");
  const [city, setCity] = useState("");
  const [zone, setZone] = useState("");
  const [address, setAddress] = useState("");
  const [localisationXy, setLocalisationXy] = useState("");
  const [codePostal, setCodePostal] = useState("");
  const [source, setSource] = useState(SOURCES[0]);
  const [status, setStatus] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("__none__");
  const [comment, setComment] = useState("");
  const [comment2, setComment2] = useState("");
  const [typeId, setTypeId] = useState<string>("");
  const [lostReason, setLostReason] = useState("");

  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!prospect || hydrated) return;
    setCivility((prospect.civility as any) || "M");
    setLastName(prospect.lastName ?? "");
    setFirstName(prospect.firstName ?? "");
    setPhone(prospect.phone ?? "");
    setPhone2(prospect.phone2 ?? "");
    setAncienLigne(prospect.ancienLigne ?? "");
    setAnimateur(prospect.animateur ?? "");
    setCin(prospect.cin ?? "");
    setBirthDate(prospect.birthDate ?? "");
    setEmail(prospect.email ?? "");
    setGouvernorat(prospect.gouvernorat ?? "");
    setDelegation(prospect.delegation ?? "");
    setCity(prospect.city ?? "");
    setZone(prospect.zone ?? "");
    setAddress(prospect.address ?? "");
    setLocalisationXy(prospect.localisationXy ?? "");
    setCodePostal(prospect.codePostal ?? "");
    setSource(prospect.source || SOURCES[0]);
    setStatus(prospect.status ?? "");
    setAssignedTo(prospect.assignedTo ?? "__none__");
    setComment(prospect.comment ?? "");
    setComment2(prospect.comment2 ?? "");
    setTypeId(prospect.typeId ?? "");
    setLostReason(prospect.lostReason ?? "");
    setHydrated(true);
  }, [prospect, hydrated]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const active = await ensureDefaultProspectTypes();
        if (cancel) return;
        setTypes(active);
      } catch { /* optional */ }
    })();
    return () => { cancel = true; };
  }, []);

  // Load existing custom field values.
  useEffect(() => {
    if (!prospect || customLoaded) return;
    let cancel = false;
    (async () => {
      try {
        const r = await api<{ values: Record<string, string> }>("/custom_field_values.php", {
          query: { entity: "prospect", entity_id: prospect.id },
        });
        if (cancel) return;
        setCustomValues(r.values ?? {});
      } catch { /* ignore */ }
      finally { if (!cancel) setCustomLoaded(true); }
    })();
    return () => { cancel = true; };
  }, [prospect, customLoaded]);

  const agents = users.filter((u) => ["Agent","Manager","AgentSuivi","AgentActivation","AgentVente"].includes(u.role));
  const currentTypeName = (types.find((t) => t.id === typeId)?.name ?? "").trim().toLowerCase();
  const isStreetType = currentTypeName === "street";
  const showAncienLigne = currentTypeName === "résiliation" || currentTypeName === "resiliation" || currentTypeName === "migration";

  if (!prospect) {
    return (
      <AppLayout>
        <PageHeader title="Prospect introuvable" icon={<Pencil className="h-5 w-5" />} />
        <div className="mt-6">
          <Button asChild variant="outline"><Link to="/prospects"><ArrowLeft className="h-4 w-4 mr-1.5" />Retour</Link></Button>
        </div>
      </AppLayout>
    );
  }

  const submit = async () => {
    if (!lastName.trim()) { toast.error("Nom obligatoire"); return; }
    if (localisationXy && !isValidLocalisationXy(localisationXy)) {
      toast.error("Localisation XY invalide", { description: "Format attendu : lat,lng (ex: 36.123456,10.123698)" });
      return;
    }
    const missing = await validateRequiredCustomValues("prospect", customValues, typeId || null);
    if (missing) { toast.error(`${missing} est requis`); return; }
    setSaving(true);
    try {
      await updateProspect(prospect.id, {
        civility,
        lastName: lastName.trim(),
        firstName: firstName.trim(),
        phone: phone.trim(),
        phone2: phone2.trim(),
        ancienLigne: showAncienLigne ? (ancienLigne.trim() || null) : null,
        animateur: isStreetType ? (animateur.trim() || null) : null,
        cin: cin.trim(),
        birthDate: birthDate || null,
        email: email.trim(),
        gouvernorat: gouvernorat.trim().toUpperCase(),
        delegation: delegation.trim(),
        city: city.trim(),
        zone: zone.trim(),
        address: address.trim(),
        localisationXy: normalizeLocalisationXy(localisationXy) || null,
        codePostal: normalizeCodePostal(codePostal) || null,
        source,
        status,
        assignedTo: assignedTo === "__none__" ? null : assignedTo,
        comment: comment.trim(),
        comment2: comment2.trim() || null,
        typeId: typeId || null,
        lostReason: lostReason.trim() || undefined,
      } as any);

      // Persist custom field values.
      try {
        await api("/custom_field_values.php", {
          method: "POST",
          body: { entity: "prospect", entity_id: prospect.id, values: customValues },
        });
      } catch (e: any) {
        toast.warning("Champs personnalisés non enregistrés", { description: e?.message });
      }

      toast.success("Prospect mis à jour");
      navigate({ to: "/prospects/$prospectId", params: { prospectId: prospect.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Échec de la mise à jour");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout skeleton="form">
      <PageHeader
        title={`Modifier ${prospect.lastName} ${prospect.firstName}`}
        description="Toutes les informations du prospect — identité, contact, qualification et champs personnalisés."
        icon={<Pencil className="h-5 w-5" />}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/prospects/$prospectId" params={{ prospectId: prospect.id }}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />Retour à la fiche
            </Link>
          </Button>
        }
      />

      <div className="mt-6">
        <Card className="p-6 shadow-elegant space-y-6">
          {/* Identité */}
          <section>
            <h2 className="text-sm font-semibold mb-3 text-foreground">Identité</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {types.length > 0 && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Type de prospect</Label>
                  <Select value={typeId || "__none__"} onValueChange={(v) => setTypeId(v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Choisir un type…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Aucun —</SelectItem>
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
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Prénom</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>CIN</Label>
                <Input value={cin} onChange={(e) => setCin(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Mail</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
          </section>

          {/* Contact & adresse */}
          <section className="border-t border-border pt-6">
            <h2 className="text-sm font-semibold mb-3 text-foreground">Contact & adresse</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Gsm 1</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Gsm 2</Label>
                <Input value={phone2} onChange={(e) => setPhone2(e.target.value)} />
              </div>
              {showAncienLigne && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Ancien Ligne</Label>
                  <Input value={ancienLigne} onChange={(e) => setAncienLigne(e.target.value)} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Gouvernorat</Label>
                <Input value={gouvernorat} onChange={(e) => setGouvernorat(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Délégation</Label>
                <Input value={delegation} onChange={(e) => setDelegation(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Ville</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Zone</Label>
                <Input value={zone} onChange={(e) => setZone(e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Adresse</Label>
                <Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Localisation XY <span className="text-[10px] text-muted-foreground">(lat,lng)</span></Label>
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
                  maxLength={20}
                />
              </div>
            </div>
          </section>

          {/* Qualification */}
          <section className="border-t border-border pt-6">
            <h2 className="text-sm font-semibold mb-3 text-foreground">Qualification</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Source retirée de l'UI — déduite désormais du type de prospect. Valeur existante préservée au save. */}
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
              {isStreetType && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Animateur</Label>
                  <Input value={animateur} onChange={(e) => setAnimateur(e.target.value)} />
                </div>
              )}
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Observation 1</Label>
                <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Observation 2</Label>
                <Textarea rows={2} value={comment2} onChange={(e) => setComment2(e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Motif de perte <span className="text-[10px] text-muted-foreground">(si applicable)</span></Label>
                <Input value={lostReason} onChange={(e) => setLostReason(e.target.value)} />
              </div>
            </div>
          </section>

          {/* Champs personnalisés */}
          <section className="border-t border-border pt-6">
            <h2 className="text-sm font-semibold mb-3 text-foreground">Champs personnalisés</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CustomFieldsInline entity="prospect" values={customValues} onChange={setCustomValues} typeId={typeId || null} />
            </div>
          </section>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" asChild disabled={saving}>
              <Link to="/prospects/$prospectId" params={{ prospectId: prospect.id }}>Annuler</Link>
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer les modifications"}
            </Button>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
