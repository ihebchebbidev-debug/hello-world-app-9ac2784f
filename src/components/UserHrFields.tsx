import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGuichetEntities } from "@/hooks/use-guichet-entities";
import { useTeams } from "@/hooks/use-teams";

/**
 * Editable HR / personnel fields shared by NewUserDialog & EditUserDialog.
 */
export type UserHrValues = {
  jobTitle: string;
  birthDate: string;
  cin: string;
  company: string;
  contractType: string;
  salary: string;
  salaryIncrease: string;
  contractStart: string;
  contractEnd: string;
  renewalStart: string;
  renewalEnd: string;
  phone: string;
  rib: string;
  hireDate: string;
  observations: string;
  guichetEntityId: string;
  teamId: string;
};

export const EMPTY_HR: UserHrValues = {
  jobTitle: "", birthDate: "", cin: "", company: "", contractType: "",
  salary: "", salaryIncrease: "", contractStart: "", contractEnd: "",
  renewalStart: "", renewalEnd: "", phone: "", rib: "", hireDate: "", observations: "",
  guichetEntityId: "", teamId: "",
};

const CONTRACT_TYPES = ["CDI", "CDD", "CIVP", "SIVP", "Karama", "Stage", "Freelance"];

const NONE = "__none__";

export function UserHrFields({
  values,
  onChange,
}: {
  values: UserHrValues;
  onChange: (next: UserHrValues) => void;
}) {
  const set = <K extends keyof UserHrValues>(k: K, v: UserHrValues[K]) =>
    onChange({ ...values, [k]: v });

  return (
    <>
      <div className="col-span-2 -mb-1 mt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Informations RH / personnel
      </div>

      <div className="space-y-1.5"><Label>Poste</Label>
        <Input value={values.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} placeholder="agent activation" />
      </div>
      <div className="space-y-1.5"><Label>Société (Sté)</Label>
        <Input value={values.company} onChange={(e) => set("company", e.target.value)} placeholder="height" />
      </div>

      <div className="space-y-1.5"><Label>CIN</Label>
        <Input value={values.cin} onChange={(e) => set("cin", e.target.value)} placeholder="12345678" />
      </div>
      <div className="space-y-1.5"><Label>N° contact</Label>
        <Input value={values.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+216 94 431 140" />
      </div>

      <div className="space-y-1.5"><Label>Date de naissance</Label>
        <Input type="date" value={values.birthDate} onChange={(e) => set("birthDate", e.target.value)} />
      </div>
      <div className="space-y-1.5"><Label>Date début avec nous</Label>
        <Input type="date" value={values.hireDate} onChange={(e) => set("hireDate", e.target.value)} />
      </div>

      <div className="space-y-1.5"><Label>Type de contrat</Label>
        <Select value={values.contractType || NONE} onValueChange={(v) => set("contractType", v === NONE ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            {CONTRACT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><Label>RIB</Label>
        <Input value={values.rib} onChange={(e) => set("rib", e.target.value)} placeholder="11060002351100878837" />
      </div>

      <div className="space-y-1.5"><Label>Salaire</Label>
        <Input type="number" inputMode="decimal" step="0.001" value={values.salary} onChange={(e) => set("salary", e.target.value)} placeholder="850" />
      </div>
      <div className="space-y-1.5"><Label>Augmentation</Label>
        <Input type="number" inputMode="decimal" step="0.001" value={values.salaryIncrease} onChange={(e) => set("salaryIncrease", e.target.value)} placeholder="900" />
      </div>

      <div className="space-y-1.5"><Label>Début de contrat</Label>
        <Input type="date" value={values.contractStart} onChange={(e) => set("contractStart", e.target.value)} />
      </div>
      <div className="space-y-1.5"><Label>Fin de contrat</Label>
        <Input type="date" value={values.contractEnd} onChange={(e) => set("contractEnd", e.target.value)} />
      </div>

      <div className="space-y-1.5"><Label>Renouvellement</Label>
        <Input type="date" value={values.renewalStart} onChange={(e) => set("renewalStart", e.target.value)} />
      </div>
      <div className="space-y-1.5"><Label>Fin renouvellement</Label>
        <Input type="date" value={values.renewalEnd} onChange={(e) => set("renewalEnd", e.target.value)} />
      </div>

      <div className="space-y-1.5 col-span-2"><Label>Observations</Label>
        <Textarea value={values.observations} onChange={(e) => set("observations", e.target.value)} rows={2} />
      </div>

      <TeamField value={values.teamId} onChange={(v) => set("teamId", v)} />
      <GuichetEntityField value={values.guichetEntityId} onChange={(v) => set("guichetEntityId", v)} />
    </>
  );
}

function TeamField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { teams } = useTeams();
  return (
    <div className="space-y-1.5 col-span-2">
      <Label>Équipe (regroupement de rôles)</Label>
      <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— Aucune (utilise le rôle individuel) —</SelectItem>
          {teams.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}{t.roles.length ? ` — ${t.roles.length} rôle${t.roles.length > 1 ? "s" : ""}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground">
        Si renseigné, les permissions sont l'union de celles des rôles composant l'équipe (le rôle individuel est ignoré).
      </p>
    </div>
  );
}

function GuichetEntityField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const entities = useGuichetEntities();
  return (
    <div className="space-y-1.5 col-span-2">
      <Label>Affectation Guichet (franchise / point de vente)</Label>
      <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— Aucune (accès non restreint) —</SelectItem>
          {entities.map((e) => (
            <SelectItem key={e.id} value={e.id}>{e.name}{e.city ? ` — ${e.city}` : ""}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground">
        Si renseigné, l'utilisateur ne verra et ne pourra créer que des dossiers guichet de cette entité.
      </p>
    </div>
  );
}

/** Convert dialog string values into the shape `saveUser` expects. */
export function hrValuesToPayload(v: UserHrValues): Partial<import("@/lib/types").AppUser> {
  const num = (s: string) => (s === "" ? null : Number(s));
  const str = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    jobTitle: str(v.jobTitle),
    birthDate: str(v.birthDate),
    cin: str(v.cin),
    company: str(v.company),
    contractType: str(v.contractType),
    salary: num(v.salary),
    salaryIncrease: num(v.salaryIncrease),
    contractStart: str(v.contractStart),
    contractEnd: str(v.contractEnd),
    renewalStart: str(v.renewalStart),
    renewalEnd: str(v.renewalEnd),
    phone: str(v.phone),
    rib: str(v.rib),
    hireDate: str(v.hireDate),
    observations: str(v.observations),
    guichetEntityId: str(v.guichetEntityId),
    teamId: str(v.teamId),
  };
}

/** Hydrate dialog state from an existing AppUser. */
export function hrValuesFromUser(u: Partial<import("@/lib/types").AppUser>): UserHrValues {
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return {
    jobTitle: s(u.jobTitle),
    birthDate: s(u.birthDate),
    cin: s(u.cin),
    company: s(u.company),
    contractType: s(u.contractType),
    salary: s(u.salary),
    salaryIncrease: s(u.salaryIncrease),
    contractStart: s(u.contractStart),
    contractEnd: s(u.contractEnd),
    renewalStart: s(u.renewalStart),
    renewalEnd: s(u.renewalEnd),
    phone: s(u.phone),
    rib: s(u.rib),
    hireDate: s(u.hireDate),
    observations: s(u.observations),
    guichetEntityId: s(u.guichetEntityId),
    teamId: s(u.teamId),
  };
}
