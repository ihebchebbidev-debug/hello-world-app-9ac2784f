import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useErp } from "@/lib/erpStore";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import type { Currency } from "@/lib/currency";
import { normalizeLocalisationXy, normalizeCodePostal, isValidLocalisationXy } from "@/lib/geo";
import { CustomFieldsInline, validateRequiredCustomValues } from "./CustomFieldsInline";

const PARTNERS = ["NEOLIANE", "APRIL", "ALPTIS", "MIEL MUTUELLE"];
const BILLING = ["Pré-validé", "Validé Confirmation", "Annulé"];

export function NewContractDialog({ currency }: { currency: Currency }) {
  const { importContracts, users } = useErp();
  const { user } = useAuth();
  const isAdmin = user?.role === "Administrateur";
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [localisationXy, setLocalisationXy] = useState("");
  const [codePostal, setCodePostal] = useState("");
  const [partner, setPartner] = useState(PARTNERS[0]);
  const [cabinet, setCabinet] = useState("Cabinet Paris 1");
  const [premium, setPremium] = useState("950");
  const [billing, setBilling] = useState(BILLING[0]);
  const [signatureDate, setSignatureDate] = useState(today);
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [source, setSource] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("__none__");
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  const agents = users.filter((u) => u.role === "Agent" || u.role === "Manager" || u.role === "AgentSuivi" || u.role === "AgentActivation" || u.role === "AgentVente");

  const submit = async () => {
    if (!lastName.trim() || !firstName.trim()) { toast.error("Nom et prénom obligatoires"); return; }
    const p = Number(premium);
    if (!p || p <= 0) { toast.error("Cotisation invalide"); return; }
    const missing = await validateRequiredCustomValues("contract", customValues);
    if (missing) { toast.error(`${missing} est requis`); return; }
    if (!isValidLocalisationXy(localisationXy)) {
      toast.error("Localisation XY invalide", { description: "Format attendu : lat,lng (ex: 36.123456,10.123698)" });
      return;
    }
    setSaving(true);
    try {
      const r = await importContracts([{
        lastName: lastName.trim(), firstName: firstName.trim(),
        city: city.trim().toUpperCase(), partner, cabinet,
        address: address.trim(),
        localisationXy: normalizeLocalisationXy(localisationXy) || null,
        codePostal: normalizeCodePostal(codePostal) || null,
        premium: p,
        billingStatus: billing as any,
        signatureDate, effectiveDate,
        source,
        assignedTo: assignedTo === "__none__" ? "—" : assignedTo,
        customValues,
      } as any]);
      if (r.added + r.updated > 0) {
        toast.success("Contrat créé");
        setOpen(false);
      } else {
        toast.error("Création impossible");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur lors de la création");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1.5" />Nouveau contrat</Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>Nouveau contrat</DialogTitle>
          <DialogDescription>Saisissez les informations du contrat.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-6 py-2 overflow-y-auto flex-1">
          <div className="space-y-1.5"><Label>Nom *</Label><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Prénom *</Label><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Ville</Label><Input value={city} onChange={(e) => setCity(e.target.value)} /></div>
          <div className="space-y-1.5 col-span-2"><Label>Adresse</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="12 rue …" /></div>
          <div className="space-y-1.5"><Label>Localisation XY <span className="text-[10px] text-muted-foreground">(lat,lng)</span></Label>
            <Input value={localisationXy}
              onChange={(e) => setLocalisationXy(e.target.value)}
              onBlur={(e) => setLocalisationXy(normalizeLocalisationXy(e.target.value))}
              placeholder="36.123456,10.123698" /></div>
          <div className="space-y-1.5"><Label>Code postal</Label>
            <Input value={codePostal}
              onChange={(e) => setCodePostal(e.target.value)}
              onBlur={(e) => setCodePostal(normalizeCodePostal(e.target.value))}
              placeholder="75001" maxLength={20} /></div>
          <div className="space-y-1.5"><Label>Cotisation ({currency.symbol}) *</Label><Input type="number" value={premium} onChange={(e) => setPremium(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Partenaire</Label>
            <Select value={partner} onValueChange={setPartner}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PARTNERS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="space-y-1.5"><Label>Cabinet</Label><Input value={cabinet} onChange={(e) => setCabinet(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Date signature</Label><DatePicker value={signatureDate} onChange={setSignatureDate} /></div>
          <div className="space-y-1.5"><Label>Date d'effet</Label><DatePicker value={effectiveDate} onChange={setEffectiveDate} /></div>
          <div className="space-y-1.5"><Label>Statut facturation</Label>
            <Select value={billing} onValueChange={setBilling}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{BILLING.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
            </Select></div>
          {/* Source retirée de l'UI — déduite du type de prospect. */}
          {isAdmin && (
            <div className="space-y-1.5 col-span-2"><Label>Assigné à</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {agents.map((a) => <SelectItem key={a.username} value={a.username}>{a.fullName} ({a.username})</SelectItem>)}
                </SelectContent>
              </Select></div>
          )}
          <CustomFieldsInline entity="contract" values={customValues} onChange={setCustomValues} />
        </div>
        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Annuler</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Création…" : "Créer le contrat"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
