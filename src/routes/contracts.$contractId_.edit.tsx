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
import type { Contract, PipelineStage, ProspectType } from "@/lib/types";
import { useContractStages } from "@/hooks/use-contract-stages";
import { ensureDefaultProspectTypes } from "@/lib/prospectTypes";
import { toast } from "sonner";
import {
  normalizeLocalisationXy, normalizeCodePostal, isValidLocalisationXy,
} from "@/lib/geo";

import { RequirePerm } from "@/components/RequirePerm";

export const Route = createFileRoute("/contracts/$contractId_/edit")({
  head: ({ params }) => ({
    meta: [
      { title: `Modifier contrat ${params.contractId} — CRM` },
      { name: "description", content: "Modifier toutes les informations du contrat." },
    ],
  }),
  component: GuardedEditContractPage,
});

function GuardedEditContractPage() {
  return (
    <RequirePerm perm="contract.edit" backTo="/contracts" backLabel="Retour aux contrats">
      <EditContractPage />
    </RequirePerm>
  );
}


const SOURCES = ["Terrain", "Facebook", "Base de donné", "Technicien", "Autre"];

function EditContractPage() {
  const { contractId } = Route.useParams();
  const navigate = useNavigate();
  const { contracts, updateContract, users } = useErp();
  const stages: PipelineStage[] = useContractStages();
  const [types, setTypes] = useState<ProspectType[]>([]);
  const contract = useMemo(() => contracts.find((c) => c.id === contractId), [contracts, contractId]);

  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

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
  const [comment1, setComment1] = useState("");
  const [comment2, setComment2] = useState("");
  const [source, setSource] = useState(SOURCES[0]);
  const [typeId, setTypeId] = useState<string>("");
  // Contract-specific
  const [partner, setPartner] = useState("");
  const [cabinet, setCabinet] = useState("");
  const [signatureDate, setSignatureDate] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [validationDate, setValidationDate] = useState("");
  const [premium, setPremium] = useState("0");
  const [billingStatus, setBillingStatus] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("__none__");

  useEffect(() => {
    if (!contract || hydrated) return;
    setCivility((contract.civility as any) || "M");
    setLastName(contract.lastName ?? "");
    setFirstName(contract.firstName ?? "");
    setPhone(contract.phone ?? "");
    setPhone2(contract.phone2 ?? "");
    setCin(contract.cin ?? "");
    setBirthDate(contract.birthDate ?? "");
    setEmail(contract.email ?? "");
    setGouvernorat(contract.gouvernorat ?? "");
    setDelegation(contract.delegation ?? "");
    setCity(contract.city ?? "");
    setAddress(contract.address ?? "");
    setLocalisationXy(contract.localisationXy ?? "");
    setCodePostal(contract.codePostal ?? "");
    setComment1(contract.comment1 ?? "");
    setComment2(contract.comment2 ?? "");
    setSource(contract.source || SOURCES[0]);
    setTypeId(contract.typeId ?? "");
    setPartner(contract.partner ?? "");
    setCabinet(contract.cabinet ?? "");
    setSignatureDate(contract.signatureDate ?? "");
    setEffectiveDate(contract.effectiveDate ?? "");
    setValidationDate(contract.validationDate ?? "");
    setPremium(String(contract.premium ?? 0));
    setBillingStatus(contract.billingStatus ?? "");
    setAssignedTo(contract.assignedTo && contract.assignedTo !== "—" ? contract.assignedTo : "__none__");
    setHydrated(true);
  }, [contract, hydrated]);

  useEffect(() => { ensureDefaultProspectTypes().then(setTypes).catch(() => {}); }, []);

  const agents = useMemo(
    () => users.filter((u) => ["Agent","Manager","AgentSuivi","AgentActivation","AgentVente","Administrateur"].includes(u.role)),
    [users],
  );

  if (!contract) {
    return (
      <AppLayout>
        <PageHeader title="Contrat introuvable" icon={<Pencil className="h-5 w-5" />} />
        <div className="mt-6">
          <Button asChild variant="outline"><Link to="/contracts"><ArrowLeft className="h-4 w-4 mr-1.5" />Retour</Link></Button>
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
      await updateContract(contract.id, {
        civility,
        lastName: lastName.trim(),
        firstName: firstName.trim(),
        phone: phone.trim(),
        phone2: phone2.trim(),
        cin: cin.trim(),
        birthDate: birthDate || null,
        email: email.trim(),
        gouvernorat: gouvernorat.trim().toUpperCase(),
        delegation: delegation.trim(),
        city: city.trim(),
        address: address.trim(),
        localisationXy: normalizeLocalisationXy(localisationXy) || null,
        codePostal: normalizeCodePostal(codePostal) || null,
        comment1: comment1.trim() || null,
        comment2: comment2.trim() || null,
        source,
        typeId: typeId || null,
        partner: partner.trim(),
        cabinet: cabinet.trim(),
        signatureDate: signatureDate || undefined,
        effectiveDate: effectiveDate || undefined,
        validationDate: validationDate || null,
        premium: Number(premium) || 0,
        billingStatus: billingStatus || contract.billingStatus,
        assignedTo: assignedTo === "__none__" ? "" : assignedTo,
      } as any);
      toast.success("Contrat mis à jour");
      navigate({ to: "/contracts/$contractId", params: { contractId: contract.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Échec de la mise à jour");
    } finally { setSaving(false); }
  };

  return (
    <AppLayout skeleton="form">
      <PageHeader
        title={`Modifier ${contract.firstName} ${contract.lastName}`}
        description="Toutes les informations du contrat — identité, contact, partenaire et facturation."
        icon={<Pencil className="h-5 w-5" />}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/contracts/$contractId" params={{ contractId: contract.id }}>
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
              <div className="space-y-1.5"><Label>Nom *</Label><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Prénom</Label><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
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

          {/* Contrat */}
          <section className="border-t border-border pt-6">
            <h2 className="text-sm font-semibold mb-3 text-foreground">Détails du contrat</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Partenaire et Cabinet retirés du formulaire — valeurs existantes préservées au save. */}
              <div className="space-y-1.5"><Label>Date signature</Label><DatePicker value={signatureDate} onChange={setSignatureDate} /></div>
              <div className="space-y-1.5"><Label>Date effet</Label><DatePicker value={effectiveDate} onChange={setEffectiveDate} /></div>
              <div className="space-y-1.5"><Label>Date validation</Label><DatePicker value={validationDate} onChange={setValidationDate} /></div>
              <div className="space-y-1.5"><Label>Cotisation (TND)</Label><Input type="number" value={premium} onChange={(e) => setPremium(e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Statut facturation</Label>
                <Select value={billingStatus || "__keep__"} onValueChange={(v) => v !== "__keep__" && setBillingStatus(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {stages.length > 0
                      ? stages.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)
                      : <SelectItem value={billingStatus || "Pré-validé"}>{billingStatus || "Pré-validé"}</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              {/* Source retirée de l'UI — déduite du type de prospect. Valeur existante préservée au save. */}
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
              <div className="space-y-1.5 sm:col-span-2"><Label>Observation 1</Label><Textarea rows={2} value={comment1} onChange={(e) => setComment1(e.target.value)} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Observation 2</Label><Textarea rows={2} value={comment2} onChange={(e) => setComment2(e.target.value)} /></div>
            </div>
          </section>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" asChild disabled={saving}>
              <Link to="/contracts/$contractId" params={{ contractId: contract.id }}>Annuler</Link>
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
