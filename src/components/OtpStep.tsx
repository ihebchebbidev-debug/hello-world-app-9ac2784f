import { useEffect, useRef, useState } from "react";
import { useAuth, type OtpChallenge } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, ShieldCheck, AlertCircle, ArrowLeft, RotateCw } from "lucide-react";

const CODE_LENGTH = 4;

export function OtpStep({
  challenge,
  onSuccess,
  onBack,
}: {
  challenge: OtpChallenge;
  onSuccess: () => void;
  onBack: () => void;
}) {
  const { verifyOtp, resendOtp } = useAuth();
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState(challenge.expiresAt);
  const [now, setNow] = useState(Date.now());
  const [resendCooldownUntil, setResendCooldownUntil] = useState(Date.now() + 30000);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const resendCooldown = Math.max(0, Math.ceil((resendCooldownUntil - now) / 1000));

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remaining = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  const setDigit = (i: number, v: string) => {
    const clean = v.replace(/\D/g, "").slice(0, 1);
    setDigits((prev) => {
      const next = [...prev];
      next[i] = clean;
      return next;
    });
    if (clean && i < CODE_LENGTH - 1) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < CODE_LENGTH - 1) refs.current[i + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    const arr = Array(CODE_LENGTH).fill("");
    for (let i = 0; i < pasted.length; i++) arr[i] = pasted[i];
    setDigits(arr);
    refs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    setInfo(null);
    const code = digits.join("");
    if (code.length !== CODE_LENGTH) {
      setError("Veuillez saisir les 4 chiffres du code.");
      return;
    }
    setSubmitting(true);
    try {
      await verifyOtp(challenge.challenge, code);
      onSuccess();
    } catch (err: any) {
      setError(err?.message ?? "Code incorrect.");
      setDigits(Array(CODE_LENGTH).fill(""));
      refs.current[0]?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  // Auto-submit when 4 digits entered
  useEffect(() => {
    if (digits.every((d) => d.length === 1) && !submitting) {
      void submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits.join("")]);

  const onResend = async () => {
    if (resendCooldown > 0) return;
    setError(null);
    setInfo(null);
    setResending(true);
    try {
      const r = await resendOtp(challenge.challenge);
      setExpiresAt(r.expiresAt);
      setDigits(Array(CODE_LENGTH).fill(""));
      setInfo("Un nouveau code vous a été envoyé par email. Patientez quelques instants…");
      setResendCooldownUntil(Date.now() + 60000);
      refs.current[0]?.focus();
    } catch (err: any) {
      setError(err?.message ?? "Impossible de renvoyer le code.");
    } finally {
      setResending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex flex-col items-center text-center space-y-3">
        <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Vérification en deux étapes</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Nous avons envoyé un code à 4 chiffres à
          </p>
          <p className="mt-1 text-sm font-medium flex items-center justify-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            {challenge.maskedEmail}
          </p>
        </div>
      </div>

      <div className="flex justify-center gap-2 sm:gap-3" onPaste={handlePaste}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={1}
            value={d}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={handleKeyDown(i)}
            disabled={submitting}
            className="h-14 w-12 sm:h-16 sm:w-14 rounded-lg border border-input bg-background text-center text-2xl font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary transition-all"
            aria-label={`Chiffre ${i + 1}`}
          />
        ))}
      </div>

      <div className="text-center text-xs text-muted-foreground">
        {remaining > 0 ? (
          <>Le code expire dans <span className="font-medium text-foreground">{mm}:{ss}</span></>
        ) : (
          <span className="text-destructive">Le code a expiré, demandez-en un nouveau.</span>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm text-primary flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
          {info}
        </div>
      )}

      <Button type="submit" size="lg" className="w-full h-11 bg-gradient-primary text-primary-foreground hover:opacity-95 shadow-sm font-medium" disabled={submitting}>
        {submitting ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Vérification…</>
        ) : (
          <>Vérifier le code</>
        )}
      </Button>

      {/* Renvoyer le code — bouton proéminent avec compteur */}
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={onResend}
        disabled={resending || submitting || resendCooldown > 0}
        className="w-full h-11 font-medium"
      >
        {resending ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Envoi en cours…</>
        ) : resendCooldown > 0 ? (
          <>
            <RotateCw className="h-4 w-4 mr-2 opacity-60" />
            Renvoyer dans{" "}
            <span className="ml-1 font-mono tabular-nums">
              {String(Math.floor(resendCooldown / 60)).padStart(2, "0")}:
              {String(resendCooldown % 60).padStart(2, "0")}
            </span>
          </>
        ) : (
          <><RotateCw className="h-4 w-4 mr-2" /> Renvoyer le code</>
        )}
      </Button>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          disabled={submitting}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Retour à la connexion
        </button>
      </div>
    </form>
  );
}
