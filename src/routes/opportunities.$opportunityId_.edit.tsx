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
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useErp } from "@/lib/erpStore";
import { api } from "@/lib/api";
import type { Opportunity, PipelineStage, ProspectType } from "@/lib/types";
import { ensureDefaultProspectTypes } from "@/lib/prospectTypes";
import { toast } from "sonner";
import {
  normalizeLocalisationXy, normalizeCodePostal, isValidLocalisationXy,
} from "@/lib/geo";

import { RequirePerm } from "@/components/RequirePerm";

export const Route = createFileRoute("/opportunities/$opportunityId_/edit")({
  head: ({ params }) => ({
    meta: [
      { title: `Modifier opportunité ${params.opportunityId} — CRM` },
      { name: "description", content: "Modifier toutes les informations de l'opportunité." },
    ],
  }),
  component: GuardedEditOpportunityPage,
});

function GuardedEditOpportunityPage() {
  return (
    <RequirePerm perm="opportunity.edit" backTo="/opportunities" backLabel="Retour aux opportunités">
      <EditOpportunityPage />
    </RequirePerm>
  );
}


const SOURCES = ["Terrain", "Facebook", "Base de donné", "Technicien", "Autre"];

function EditOpportunityPage() {
  const { opportunityId } = Route.useParams();
  const navigate = useNavigate();
  const { users } = useErp();

  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [types, setTypes] = useState<ProspectType[]>([]);

  // Form state
  const [civility, setCivility] = useState<"M" | "Mme">("M");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState("");
  const [phone2, setPhone2] = useState("");
  const [cin, setCin] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [email, setEmail] = useState("");
  const [gouvernorat, setGouvernorat] = useState("");
  const [delegation, setDelegation] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [localisationXy, setLocalisationXy] = useState("");
  const [codePostal, setCodePostal] = useState("");
  const [source, setSource] = useState(SOURCES[0]);
  const [typeId, setTypeId] = useState<string>("");
  const [comment1, setComment1] = useState("");
  const [comment2, setComment2] = useState("");
  // Opportunity-specific
  const [title, setTitle] = useState("");
  const [stage, setStage] = useState("");
  const [amount, setAmount] = useState("0");
  const [probability, setProbability] = useState("50");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("__none__");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const r = await api<{ opportunity: Opportunity }>(`/opportunities.php?id=${encodeURIComponent(opportunityId)}`);
        if (cancel) return;
        const o = r.opportunity;
        setOpp(o);
        if (o) {
          setCivility(o.civility || "M");
          setLastName(o.lastName ?? "");
          setFirstName(o.firstName ?? "");
          setPhone(o.phone ?? "");
          setPhone2(o.phone2 ?? "");
          setCin(o.cin ?? "");
          setBirthDate(o.birthDate ?? "");
          setEmail(o.email ?? "");
          setGouvernorat(o.gouvernorat ?? "");
          setDelegation(o.delegation ?? "");
          setCity(o.city ?? "");
          setAddress(o.address ?? "");
          setLocalisationXy(o.localisationXy ?? "");
          setCodePostal(o.codePostal ?? "");
          setSource(o.source || SOURCES[0]);
          setTypeId(o.typeId ?? "");
          setComment1(o.comment1 ?? "");
          setComment2(o.comment2 ?? "");
          setTitle(o.title ?? "");
          setStage(o.stage ?? "");
          setAmount(String(o.amount ?? 0));
          setProbability(String(o.probability ?? 50));
          setExpectedCloseDate(o.expectedCloseDate ?? "");
          setAssignedTo(o.assignedTo ?? "__none__");
          setNotes(o.notes ?? "");
        }
      } catch { if (!cancel) setOpp(null); }
      finally { if (!cancel) setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [opportunityId]);

  useEffect(() => {
    api<{ stages: PipelineStage[] }>("/opportunity_stages.php")
      .then((r) => setStages([...(r.stages ?? [])].sort((a, b) => a.position - b.position)))
      .catch(() => {});
    ensureDefaultProspectTypes().then(setTypes).catch(() => {});
  }, []);

  const agents = useMemo(
    () => users.filter((u) => ["Agent","Manager","AgentSuivi","AgentActivation","AgentVente","Administrateur"].includes(u.role)),
    [users],
  );

  if (loading) {
    return <AppLayout skeleton="form"><div className="p-10 text-center text-muted-foreground">Chargement…</div></AppLayout>;
  }
  if (!opp) {
    return (
      <AppLayout>
        <PageHeader title="Opportunité introuvable" icon={<Pencil className="h-5 w-5" />} />
        <div className="mt-6">
          <Button asChild variant="outline"><Link to="/opportunities"><ArrowLeft className="h-4 w-4 mr-1.5" />Retour</Link></Button>
        </div>
      </AppLayout>
    );
  }

  const submit = async () => {
    if (!lastName.trim()) { toast.error("Nom obligatoire"); return; }
    if (localisationXy && !isValidLocalisationXy(localisationXy)) {
      toast.error("Localisation XY invalide", { description: "Format attendu : lat,lng" });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, any> = {
        id: opp.id,
        civility, lastName: lastName.trim(), firstName: firstName.trim(),
        phone: phone.trim(), phone2: phone2.trim(),
        cin: cin.trim(), birthDate: birthDate || null,
        email: email.trim(),
        gouvernorat: gouvernorat.trim().toUpperCase(),
        delegation: delegation.trim(),
        city: city.trim(),
        address: address.trim(),
        localisationXy: normalizeLocalisationXy(localisationXy) || null,
        codePostal: normalizeCodePostal(codePostal) || null,
        source,
        typeId: typeId || null,
        comment1: comment1.trim() || null,
        comment2: comment2.trim() || null,
        title: title.trim(),
        stage,
        amount: Number(amount) || 0,
        probability: Number(probability) || 0,
        expectedCloseDate: expectedCloseDate || null,
        assignedTo: assignedTo === "__none__" ? null : assignedTo,
        notes,
      };
      await api("/opportunities.php", { method: "PATCH", body });
      toast.success("Opportunité mise à jour");
      navigate({ to: "/opportunities/$opportunityId", params: { opportunityId: opp.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Échec de la mise à jour");
    } finally { setSaving(false); }
  };

  return (
    <AppLayout skeleton="form">
      <PageHeader
        title={`Modifier ${opp.title || `${opp.firstName} ${opp.lastName}`}`}
        description="Toutes les informations de l'opportunité — identité, contact, qualification et détails."
        icon={<Pencil className="h-5 w-5" />}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/opportunities/$opportunityId" params={{ opportunityId: opp.id }}>
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
                  <Label>Type</Label>
                  <Select value={typeId || "__none__"} onValueChange={(v) => setTypeId(v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Aucun —</SelectItem>
                      {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Civilité</Label>
                <Select value={civility} onValueChange={(v) => setCivility(v as any)}>
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
              <div className="space-y-1.5"><Label>CIN</Label><Input value={cin} onChange={(e) => setCin(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            </div>
          </section>

          {/* Contact & adresse */}
          <section className="border-t border-border pt-6">
            <h2 className="text-sm font-semibold mb-3 text-foreground">Contact & adresse</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Gsm 1</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Gsm 2</Label><Input value={phone2} onChange={(e) => setPhone2(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Gouvernorat</Label><Input value={gouvernorat} onChange={(e) => setGouvernorat(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Délégation</Label><Input value={delegation} onChange={(e) => setDelegation(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Ville</Label><Input value={city} onChange={(e) => setCity(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Code postal</Label>
                <Input value={codePostal} onChange={(e) => setCodePostal(e.target.value)} onBlur={(e) => setCodePostal(normalizeCodePostal(e.target.value))} maxLength={20} />
              </div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Adresse</Label><Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Localisation XY <span className="text-[10px] text-muted-foreground">(lat,lng)</span></Label>
                <Input value={localisationXy} onChange={(e) => setLocalisationXy(e.target.value)} onBlur={(e) => setLocalisationXy(normalizeLocalisationXy(e.target.value))} placeholder="36.123456,10.123698" />
              </div>
            </div>
          </section>

          {/* Détails opportunité */}
          <section className="border-t border-border pt-6">
            <h2 className="text-sm font-semibold mb-3 text-foreground">Détails de l'opportunité</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2"><Label>Titre</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Statut</Label>
                <Select value={stage || "__keep__"} onValueChange={(v) => v !== "__keep__" && setStage(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {stages.length > 0
                      ? stages.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)
                      : <SelectItem value={stage || "Qualification"}>{stage || "Qualification"}</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              {/* Source retirée de l'UI — déduite du type de prospect. Valeur existante préservée au save. */}
              <div className="space-y-1.5"><Label>Montant (TND)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Probabilité (%)</Label><Input type="number" min={0} max={100} value={probability} onChange={(e) => setProbability(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Clôture prévue</Label><DatePicker value={expectedCloseDate} onChange={setExpectedCloseDate} /></div>
              <div className="space-y-1.5">
                <Label>Assigné à</Label>
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Non attribué —</SelectItem>
                    {agents.map((u) => <SelectItem key={u.username} value={u.username}>{u.fullName} (@{u.username})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Observation 1</Label><Textarea rows={2} value={comment1} onChange={(e) => setComment1(e.target.value)} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Observation 2</Label><Textarea rows={2} value={comment2} onChange={(e) => setComment2(e.target.value)} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Notes</Label><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            </div>
          </section>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" asChild disabled={saving}>
              <Link to="/opportunities/$opportunityId" params={{ opportunityId: opp.id }}>Annuler</Link>
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
