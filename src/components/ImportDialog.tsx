import { useEffect, useMemo, useRef, useState } from "react";
import {
  Upload, FileSpreadsheet, X, CheckCircle2, AlertCircle, Download,
  ArrowLeft, ArrowRight, Plus, RefreshCw, FileX2, Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { parseSpreadsheet, exportCSV } from "@/lib/exportUtils";
import { toast } from "sonner";
import { recordImportRun, type ImportEntity } from "@/lib/importHistory";
import { useAuth } from "@/lib/auth";

const SKIP = "__skip__";

/** Strip all non-digits, drop leading 0/33 country prefix for FR-style numbers. */
export function normalizePhone(v: unknown): string {
  if (v == null) return "";
  let s = String(v).replace(/\D+/g, "");
  if (!s) return "";
  if (s.startsWith("0033")) s = s.slice(4);
  else if (s.startsWith("33") && s.length === 11) s = s.slice(2);
  else if (s.startsWith("0")) s = s.slice(1);
  return s;
}
export function normalizeEmail(v: unknown): string {
  if (v == null) return "";
  return String(v).trim().toLowerCase();
}

export type DuplicateRecord = {
  id: string;
  label: string;
  phone?: string;
  email?: string;
  values?: Record<string, unknown>;
};

export type ImportField = {
  key: string;
  label: string;
  required?: boolean;
  sample?: string;
  /** Optional value validator. Return error message string when invalid. */
  validate?: (value: unknown) => string | null;
};

export type ImportResult = { added: number; updated: number; skipped: number };

export type Props = {
  title: string;
  description: string;
  fields: ImportField[];
  /** Optional custom-field definitions; user can map columns to these and
   *  values will be sent as `customValues: { key: value }` per row. */
  extraFields?: ImportField[];
  /** Returns add/update counts so the consumer can show real impact. */
  onImport: (rows: Record<string, unknown>[]) => ImportResult | Promise<ImportResult>;
  /** Existing IDs in the dataset — used to forecast add vs. update. */
  existingIds?: string[];
  /** Field key used for matching existing records (default "id"). */
  idField?: string;
  /** Existing records used for duplicate detection by phone/email. */
  existingRecords?: DuplicateRecord[];
  templateFileName?: string;
  trigger?: React.ReactNode;
  /** When set, every successful import is logged for the /reconciliation page. */
  entity?: ImportEntity;
  /** Disable the trigger entirely (e.g. user has no import permission). */
  disabled?: boolean;
  /** Optional render-prop for extra buttons in the review-step toolbar.
   *  Receives the current validated rows so consumers can implement features
   *  like "Download an auto-fixed CSV". */
  reviewToolbar?: (ctx: {
    validated: ValidatedRow[];
    mapping: Record<string, string>;
    fields: ImportField[];
    headers: string[];
    rawRows: Record<string, unknown>[];
  }) => React.ReactNode;
};

type Step = "upload" | "map" | "review";

type DupResolution = "merge" | "add" | "skip";

export type ValidatedRow = {
  index: number;
  values: Record<string, unknown>;
  errors: { field: string; message: string }[];
  matchKey: string | null;
  isUpdate: boolean;
  duplicate: DuplicateRecord | null;
  duplicateReason: "phone" | "email" | null;
};

export function ImportDialog({
  title, description, fields, extraFields = [], onImport, existingIds = [], idField = "id",
  existingRecords = [], templateFileName, trigger, entity, disabled = false, reviewToolbar,
}: Props) {
  const auth = (() => { try { return useAuth(); } catch { return null; } })();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [parsing, setParsing] = useState(false);
  const [resolutions, setResolutions] = useState<Record<number, DupResolution>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null); setRawRows([]); setHeaders([]); setMapping({}); setStep("upload");
    setResolutions({});
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (f: File) => {
    setParsing(true);
    try {
      const rows = await parseSpreadsheet(f);
      if (rows.length === 0) { toast.error("Fichier vide ou illisible"); return; }
      const cols = Object.keys(rows[0]);
      setRawRows(rows);
      setHeaders(cols);
      const auto: Record<string, string> = {};
      const allFields = [...fields, ...extraFields];
      for (const fld of allFields) {
        const found = cols.find(
          (c) => c.toLowerCase().trim() === fld.key.toLowerCase()
            || c.toLowerCase().trim() === fld.label.toLowerCase(),
        );
        auto[fld.key] = found ?? SKIP;
      }
      setMapping(auto);
      setFile(f);
      setStep("map");
      toast.success(`${rows.length} ligne(s) détectée(s)`);
    } catch (e) {
      console.error(e);
      toast.error("Impossible de lire le fichier");
    } finally {
      setParsing(false);
    }
  };

  const allFields = useMemo(() => [...fields, ...extraFields], [fields, extraFields]);
  const extraKeys = useMemo(() => new Set(extraFields.map((f) => f.key)), [extraFields]);
  const missingRequired = allFields.filter((f) => f.required && (!mapping[f.key] || mapping[f.key] === SKIP));
  const mappedCount = allFields.filter((f) => mapping[f.key] && mapping[f.key] !== SKIP).length;

  // Build duplicate lookup indexes from existing records
  const dupIndex = useMemo(() => {
    const byPhone = new Map<string, DuplicateRecord>();
    const byEmail = new Map<string, DuplicateRecord>();
    for (const r of existingRecords) {
      const p = normalizePhone(r.phone);
      if (p) byPhone.set(p, r);
      const e = normalizeEmail(r.email);
      if (e) byEmail.set(e, r);
    }
    return { byPhone, byEmail };
  }, [existingRecords]);

  const validated: ValidatedRow[] = useMemo(() => {
    if (step !== "review") return [];
    const existingSet = new Set(existingIds);
    return rawRows.map((r, i) => {
      const values: Record<string, unknown> = {};
      const errors: { field: string; message: string }[] = [];
      for (const fld of allFields) {
        const src = mapping[fld.key];
        if (!src || src === SKIP) {
          if (fld.required) errors.push({ field: fld.label, message: "champ requis non mappé" });
          continue;
        }
        const raw = r[src];
        const v = typeof raw === "string" ? raw.trim() : raw;
        values[fld.key] = v;
        if (fld.required && (v === undefined || v === null || v === "")) {
          errors.push({ field: fld.label, message: "valeur vide" });
        }
        if (fld.validate) {
          const msg = fld.validate(v);
          if (msg) errors.push({ field: fld.label, message: msg });
        }
      }
      const matchKey = values[idField] != null && String(values[idField]).trim() !== ""
        ? String(values[idField]).trim() : null;
      const isUpdate = matchKey ? existingSet.has(matchKey) : false;

      // Duplicate detection — only when not already an explicit update by id
      let duplicate: DuplicateRecord | null = null;
      let duplicateReason: "phone" | "email" | null = null;
      if (!isUpdate) {
        const np = normalizePhone(values["phone"]);
        const ne = normalizeEmail(values["email"]);
        if (np && dupIndex.byPhone.has(np)) {
          duplicate = dupIndex.byPhone.get(np)!;
          duplicateReason = "phone";
        } else if (ne && dupIndex.byEmail.has(ne)) {
          duplicate = dupIndex.byEmail.get(ne)!;
          duplicateReason = "email";
        }
      }

      return { index: i + 1, values, errors, matchKey, isUpdate, duplicate, duplicateReason };
    });
  }, [step, rawRows, mapping, allFields, existingIds, idField, dupIndex]);

  // Split standard values from custom-field values for backend submission.
  const splitRowValues = (values: Record<string, unknown>) => {
    const standard: Record<string, unknown> = {};
    const customValues: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      if (extraKeys.has(k)) customValues[k] = v;
      else standard[k] = v;
    }
    return Object.keys(customValues).length > 0 ? { ...standard, customValues } : standard;
  };

  // Initialise default resolution = "merge" the first time we enter review
  useEffect(() => {
    if (step !== "review") return;
    setResolutions((prev) => {
      const next = { ...prev };
      for (const v of validated) {
        if (v.duplicate && next[v.index] === undefined) next[v.index] = "merge";
      }
      return next;
    });
  }, [step, validated]);

  const summary = useMemo(() => {
    const valid = validated.filter((v) => v.errors.length === 0);
    const invalid = validated.length - valid.length;
    let willUpdate = 0, willAdd = 0, willSkip = 0, dupCount = 0;
    for (const v of valid) {
      if (v.duplicate) {
        dupCount++;
        const r = resolutions[v.index] ?? "merge";
        if (r === "merge") willUpdate++;
        else if (r === "add") willAdd++;
        else willSkip++;
      } else if (v.isUpdate) willUpdate++;
      else willAdd++;
    }
    return { total: validated.length, valid: valid.length, invalid, willAdd, willUpdate, willSkip, dupCount };
  }, [validated, resolutions]);

  const handleConfirm = async () => {
    const okRows: Record<string, unknown>[] = [];
    for (const v of validated) {
      if (v.errors.length > 0) continue;
      let row: Record<string, unknown>;
      if (v.duplicate) {
        const r = resolutions[v.index] ?? "merge";
        if (r === "skip") continue;
        if (r === "merge") {
          row = { ...v.values, [idField]: v.duplicate.id };
        } else {
          const cloned = { ...v.values };
          if (String(cloned[idField] ?? "") === v.duplicate.id) delete cloned[idField];
          row = cloned;
        }
      } else {
        row = v.values;
      }
      okRows.push(splitRowValues(row));
    }
    if (okRows.length === 0) { toast.error("Aucune ligne valide à importer"); return; }
    try {
      const result = await onImport(okRows);
      if (entity) {
        recordImportRun({
          entity,
          title,
          fileName: file?.name ?? null,
          user: auth?.user?.username ?? null,
          totals: { added: result.added, updated: result.updated, skipped: result.skipped },
          rowsRead: validated.length,
          rowsValid: summary.valid,
          rowsInvalid: summary.invalid,
          duplicates: summary.dupCount,
          mapping: allFields.map((f) => ({
            fieldKey: f.key,
            fieldLabel: f.label,
            sourceColumn: mapping[f.key] && mapping[f.key] !== SKIP ? mapping[f.key] : null,
            required: !!f.required,
          })),
        });
      }
      toast.success(
        `${result.added} ajoutée(s) • ${result.updated} mise(s) à jour`,
        { description: result.skipped ? `${result.skipped} ignorée(s)` : file?.name },
      );
      setOpen(false);
      reset();
    } catch (e) {
      toast.error("Échec de l'import", { description: e instanceof Error ? e.message : "Erreur inconnue" });
    }
  };

  const downloadTemplate = () => {
    // Headers use UI labels (not technical keys) so the file is readable.
    // ImportDialog re-maps labels → keys automatically on re-import, and the
    // PHP backend normalises FR aliases via crm_normalize_row().
    const exampleRow: Record<string, string> = {};
    const blankRow: Record<string, string> = {};
    for (const f of allFields) {
      exampleRow[f.label] = f.sample ?? "";
      blankRow[f.label] = "";
    }
    const baseName = (templateFileName ?? "modele-import.xlsx").replace(/\.csv$/i, ".xlsx");
    exportCSV(baseName, [exampleRow, blankRow]);
    toast.success("Modèle Excel téléchargé", {
      description: "1 ligne exemple + 1 ligne vide à compléter",
    });
  };

  const downloadInvalid = () => {
    const bad = validated.filter((v) => v.errors.length > 0);
    if (bad.length === 0) return;
    const out = bad.map((v) => ({
      ligne: v.index,
      erreurs: v.errors.map((e) => `${e.field}: ${e.message}`).join(" | "),
      ...v.values,
    }));
    exportCSV("lignes-invalides.csv", out);
    toast.success(`${bad.length} ligne(s) invalide(s) exportée(s)`);
  };

  const Steps = (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      {(["upload", "map", "review"] as const).map((s, i) => {
        const active = step === s;
        const done = (["upload", "map", "review"] as const).indexOf(step) > i;
        const labels = { upload: "1. Fichier", map: "2. Mappage", review: "3. Aperçu" } as const;
        return (
          <div key={s} className="flex items-center gap-1.5">
            <span className={`px-2 py-0.5 rounded-full border ${
              active ? "bg-primary text-primary-foreground border-primary"
                : done ? "bg-success/15 text-success border-success/20"
                  : "bg-muted text-muted-foreground border-border"
            }`}>{labels[s]}</span>
            {i < 2 && <ArrowRight className="h-3 w-3" />}
          </div>
        );
      })}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" disabled={disabled}>
            <Upload className="h-4 w-4 mr-1.5" />Importer
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
          <div className="pt-2">{Steps}</div>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <Card
              className="border-dashed border-2 p-8 text-center cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            >
              <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <div className="font-medium">Glissez un fichier ou cliquez pour parcourir</div>
              <div className="text-xs text-muted-foreground mt-1">Formats acceptés : .xlsx, .xls (CSV legacy)</div>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </Card>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Besoin d'un modèle ?</span>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-3.5 w-3.5 mr-1.5" />Télécharger le modèle Excel
              </Button>
            </div>
          </div>
        )}

        {step === "map" && file && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-md border border-border bg-muted/30">
              <div className="flex items-center gap-2 min-w-0">
                <FileSpreadsheet className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{file.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {rawRows.length} ligne(s) • {headers.length} colonne(s) • {mappedCount}/{allFields.length} champ(s) mappé(s)
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={reset} aria-label="Retirer">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Mappage des colonnes
              </Label>
              <div className="mt-2 border border-border rounded-md divide-y divide-border max-h-72 overflow-y-auto">
                {allFields.map((f) => {
                  const v = mapping[f.key] ?? SKIP;
                  const isMapped = v !== SKIP;
                  const isCustom = extraKeys.has(f.key);
                  return (
                    <div key={f.key} className="grid grid-cols-2 gap-3 p-2.5 items-center">
                      <div className="flex items-center gap-2 text-sm min-w-0">
                        <span className="font-medium truncate">{f.label}</span>
                        {f.required && <Badge variant="outline" className="text-[10px] py-0 bg-destructive/10 text-destructive border-destructive/20">requis</Badge>}
                        {isCustom && <Badge variant="outline" className="text-[10px] py-0 bg-info/10 text-info border-info/20">perso</Badge>}
                        {isMapped && <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />}
                      </div>
                      <Select value={v} onValueChange={(nv) => setMapping((m) => ({ ...m, [f.key]: nv }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SKIP}>— Ignorer —</SelectItem>
                          {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </div>

            {missingRequired.length > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">Champs requis manquants</div>
                  <div className="text-xs mt-0.5">{missingRequired.map((f) => f.label).join(", ")}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4">
            {/* Impact summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <SummaryCard label="Lignes lues" value={summary.total} />
              <SummaryCard
                label="À ajouter"
                value={summary.willAdd}
                tone="info"
                icon={<Plus className="h-3.5 w-3.5" />}
              />
              <SummaryCard
                label="À mettre à jour"
                value={summary.willUpdate}
                tone="success"
                icon={<RefreshCw className="h-3.5 w-3.5" />}
              />
              <SummaryCard
                label="Doublons détectés"
                value={summary.dupCount}
                tone={summary.dupCount > 0 ? "warning" : "muted"}
                icon={<Copy className="h-3.5 w-3.5" />}
              />
              <SummaryCard
                label="Invalides"
                value={summary.invalid}
                tone={summary.invalid > 0 ? "destructive" : "muted"}
                icon={<FileX2 className="h-3.5 w-3.5" />}
              />
            </div>

            {summary.dupCount > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-warning/10 border border-warning/20 text-sm">
                <Copy className="h-4 w-4 mt-0.5 shrink-0 text-warning-foreground" />
                <div className="flex-1">
                  <div className="font-medium">Fusion assistée</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {summary.dupCount} ligne(s) correspondent à un enregistrement existant (téléphone ou email normalisé).
                    Choisissez l'action par ligne ci-dessous.
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => {
                    setResolutions((prev) => {
                      const n = { ...prev };
                      for (const v of validated) if (v.duplicate) n[v.index] = "merge";
                      return n;
                    });
                  }}>Tout fusionner</Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    setResolutions((prev) => {
                      const n = { ...prev };
                      for (const v of validated) if (v.duplicate) n[v.index] = "skip";
                      return n;
                    });
                  }}>Tout ignorer</Button>
                </div>
              </div>
            )}

            {/* Mapping recap */}
            <div className="border border-border rounded-md p-3 bg-muted/20">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Mappage appliqué</div>
              <div className="flex flex-wrap gap-1.5">
                {allFields.filter((f) => mapping[f.key] && mapping[f.key] !== SKIP).map((f) => (
                  <Badge key={f.key} variant="outline" className="font-normal">
                    <span className="text-muted-foreground">{mapping[f.key]}</span>
                    <ArrowRight className="h-3 w-3 mx-1 text-muted-foreground" />
                    <span className="font-medium">{f.label}</span>
                  </Badge>
                ))}
              </div>
            </div>

            {/* Rows table */}
            <div>
              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Aperçu détaillé ({Math.min(validated.length, 50)} sur {validated.length})
                </Label>
                <div className="flex items-center gap-2">
                  {reviewToolbar?.({ validated, mapping, fields: allFields, headers, rawRows })}
                  {summary.invalid > 0 && (
                    <Button variant="outline" size="sm" onClick={downloadInvalid}>
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      Télécharger les lignes invalides
                    </Button>
                  )}
                </div>
              </div>
              <div className="border border-border rounded-md overflow-x-auto max-h-80">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium w-12">Ligne</th>
                      <th className="px-2 py-1.5 text-left font-medium w-24">Action</th>
                      {allFields.filter((f) => mapping[f.key] && mapping[f.key] !== SKIP).map((f) => (
                        <th key={f.key} className="px-2 py-1.5 text-left font-medium">{f.label}</th>
                      ))}
                      <th className="px-2 py-1.5 text-left font-medium">Erreurs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validated.slice(0, 50).map((v) => {
                      const bad = v.errors.length > 0;
                      return (
                        <tr key={v.index} className={`border-t border-border ${bad ? "bg-destructive/5" : v.duplicate ? "bg-warning/5" : ""}`}>
                          <td className="px-2 py-1.5 text-muted-foreground align-top">{v.index}</td>
                          <td className="px-2 py-1.5 align-top">
                            {bad ? (
                              <Badge variant="outline" className="text-[10px] py-0 bg-destructive/10 text-destructive border-destructive/20">
                                Ignorée
                              </Badge>
                            ) : v.duplicate ? (
                              <div className="space-y-1">
                                <Badge variant="outline" className="text-[10px] py-0 bg-warning/15 text-warning-foreground border-warning/30">
                                  <Copy className="h-2.5 w-2.5 mr-1" />Doublon ({v.duplicateReason === "phone" ? "tél" : "email"})
                                </Badge>
                                <Select
                                  value={resolutions[v.index] ?? "merge"}
                                  onValueChange={(nv) => setResolutions((p) => ({ ...p, [v.index]: nv as DupResolution }))}
                                >
                                  <SelectTrigger className="h-7 text-[11px] w-[120px]"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="merge">Fusionner</SelectItem>
                                    <SelectItem value="add">Ajouter quand même</SelectItem>
                                    <SelectItem value="skip">Ignorer</SelectItem>
                                  </SelectContent>
                                </Select>
                                <div className="text-[10px] text-muted-foreground truncate max-w-[140px]" title={v.duplicate.label}>
                                  ↳ {v.duplicate.label}
                                </div>
                              </div>
                            ) : v.isUpdate ? (
                              <Badge variant="outline" className="text-[10px] py-0 bg-success/10 text-success border-success/20">
                                <RefreshCw className="h-2.5 w-2.5 mr-1" />Maj
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] py-0 bg-info/10 text-info border-info/20">
                                <Plus className="h-2.5 w-2.5 mr-1" />Ajout
                              </Badge>
                            )}
                          </td>
                          {allFields.filter((f) => mapping[f.key] && mapping[f.key] !== SKIP).map((f) => (
                            <td key={f.key} className="px-2 py-1.5 truncate max-w-[160px] align-top">
                              {String(v.values[f.key] ?? "")}
                            </td>
                          ))}
                          <td className="px-2 py-1.5 text-destructive align-top">
                            {v.errors.length > 0 ? (
                              <span title={v.errors.map((e) => `${e.field}: ${e.message}`).join("\n")}>
                                {v.errors.map((e) => e.field).join(", ")}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {summary.valid === 0 ? (
              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Aucune ligne valide. Corrigez le fichier ou le mappage avant de poursuivre.</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-md bg-success/10 text-success text-sm">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  Prêt à importer : <strong>{summary.willAdd}</strong> ajout(s) et{" "}
                  <strong>{summary.willUpdate}</strong> mise(s) à jour
                  {summary.invalid > 0 && <> — {summary.invalid} ligne(s) seront ignorée(s)</>}
                </span>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "map" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")}>
                <ArrowLeft className="h-4 w-4 mr-1.5" />Retour
              </Button>
              <Button
                disabled={missingRequired.length > 0}
                onClick={() => setStep("review")}
              >
                Aperçu<ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </>
          )}
          {step === "review" && (
            <>
              <Button variant="outline" onClick={() => setStep("map")}>
                <ArrowLeft className="h-4 w-4 mr-1.5" />Modifier le mappage
              </Button>
              <Button onClick={handleConfirm} disabled={summary.valid === 0}>
                <Upload className="h-4 w-4 mr-1.5" />
                Confirmer l'import ({summary.valid})
              </Button>
            </>
          )}
          {step === "upload" && (
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          )}
          {parsing && <span className="text-xs text-muted-foreground self-center">Lecture en cours…</span>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({
  label, value, tone = "muted", icon,
}: {
  label: string; value: number;
  tone?: "muted" | "info" | "success" | "destructive" | "warning";
  icon?: React.ReactNode;
}) {
  const toneClass = {
    muted: "border-border bg-muted/30 text-foreground",
    info: "border-info/20 bg-info/10 text-info",
    success: "border-success/20 bg-success/10 text-success",
    destructive: "border-destructive/20 bg-destructive/10 text-destructive",
    warning: "border-warning/20 bg-warning/10 text-warning-foreground",
  }[tone];
  return (
    <div className={`rounded-md border p-3 ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80 flex items-center gap-1">
        {icon}{label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
