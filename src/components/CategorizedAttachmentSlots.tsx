import { useRef } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Upload, X, FileText, Image as ImageIcon, Loader2, Check } from "lucide-react";

export const ATTACHMENT_CATEGORIES = [
  { key: "cin_recto", label: "CIN Recto" },
  { key: "cin_verso", label: "CIN Verso" },
  { key: "contrat_tt", label: "Contrat TT" },
  { key: "contrat_topnet", label: "Contrat TOPNET" },
  { key: "cgv", label: "CGV" },
] as const;

export type AttachmentCategoryKey = typeof ATTACHMENT_CATEGORIES[number]["key"];

export type CategorizedSlotState = {
  file: File | null;
  status: "idle" | "uploading" | "done" | "error";
  message?: string;
};

export function CategorizedAttachmentSlots({
  slots,
  onPick,
  onClear,
  disabled,
  hint,
}: {
  slots: Record<string, CategorizedSlotState | undefined>;
  onPick: (categoryKey: AttachmentCategoryKey, file: File) => void | Promise<void>;
  onClear?: (categoryKey: AttachmentCategoryKey) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Pièces jointes — par catégorie</Label>
        <span className="text-[10px] text-muted-foreground">Aucun champ obligatoire</span>
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {ATTACHMENT_CATEGORIES.map((cat) => (
          <SlotCard
            key={cat.key}
            label={cat.label}
            state={slots[cat.key]}
            disabled={disabled}
            onPick={(f) => onPick(cat.key, f)}
            onClear={onClear ? () => onClear(cat.key) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function SlotCard({
  label,
  state,
  disabled,
  onPick,
  onClear,
}: {
  label: string;
  state?: CategorizedSlotState;
  disabled?: boolean;
  onPick: (file: File) => void;
  onClear?: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const file = state?.file;
  const status = state?.status ?? "idle";
  const isImg = file?.type.startsWith("image/");

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{label}</Label>
        {status === "done" && <Check className="h-3.5 w-3.5 text-success" />}
        {status === "uploading" && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
      </div>
      <input
        ref={ref}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        disabled={disabled || status === "uploading"}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          if (ref.current) ref.current.value = "";
        }}
      />
      {!file ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-start text-xs h-8"
          disabled={disabled}
          onClick={() => ref.current?.click()}
        >
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          Choisir un fichier
        </Button>
      ) : (
        <div
          className={`flex items-center gap-1.5 text-[11px] rounded-md border px-2 py-1.5 ${
            status === "error"
              ? "bg-destructive/5 border-destructive/30 text-destructive"
              : "bg-muted/30"
          }`}
        >
          {isImg ? <ImageIcon className="h-3 w-3 shrink-0" /> : <FileText className="h-3 w-3 shrink-0" />}
          <span className="truncate flex-1" title={file.name}>{file.name}</span>
          <span className="text-[10px] opacity-70">{Math.round(file.size / 1024)} Ko</span>
          {onClear && status !== "uploading" && (
            <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={onClear}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
      {state?.message && (
        <p className={`text-[10px] ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {state.message}
        </p>
      )}
    </div>
  );
}

/**
 * Helper: prefix a file's name with its category label so the backend stores
 * the category without requiring schema changes.
 */
export function withCategoryPrefix(file: File, categoryLabel: string): File {
  const prefixed = `[${categoryLabel}] ${file.name}`;
  try {
    return new File([file], prefixed, { type: file.type, lastModified: file.lastModified });
  } catch {
    // Some environments (older Safari) may not support File constructor — fallback.
    return file;
  }
}

export function categoryLabelOf(key: AttachmentCategoryKey): string {
  return ATTACHMENT_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

/**
 * Detect a category from a stored filename (matches "[Label] …" prefix).
 */
export function detectCategoryFromFilename(filename: string): AttachmentCategoryKey | null {
  const m = filename.match(/^\[([^\]]+)\]\s*/);
  if (!m) return null;
  const label = m[1].trim().toLowerCase();
  const found = ATTACHMENT_CATEGORIES.find((c) => c.label.toLowerCase() === label);
  return found?.key ?? null;
}
