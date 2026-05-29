import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth, type OtpChallenge } from "@/lib/auth";
import { OtpStep } from "@/components/OtpStep";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  AlertCircle,
  LogIn,
  User,
  Lock,
  Eye,
  EyeOff,
  Check,
} from "lucide-react";
import captchaRobot from "@/assets/captcha-robot.png";
import callcenterBg from "@/assets/login-callcenter-bg.jpg";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Connexion — CRM Internet" },
      { name: "description", content: "Accédez à votre espace agent." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LoginPage,
});

function getNextPath(): string {
  if (typeof window === "undefined") return "/";
  try {
    const sp = new URLSearchParams(window.location.search);
    const n = sp.get("next");
    if (!n) return "/";
    // Only allow internal absolute paths to prevent open-redirect attacks.
    if (n.startsWith("/") && !n.startsWith("//")) return n;
  } catch {}
  return "/";
}

/**
 * Role-aware post-login destination.
 * Agent Guichet has a single working surface (/guichet) — send them there
 * directly so they never flash through a forbidden page (which would trigger
 * background 401s and look like a "rejection").
 */
function destinationForRole(role: string | undefined, fallback: string): string {
  if (role === "AgentGuichet") return "/guichet";
  return fallback;
}

function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const nextPathRef = useRef<string>(getNextPath());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [honeypot, setHoneypot] = useState(""); // bot trap; humans never see/fill
  const [failCount, setFailCount] = useState(0);
  const [lockUntil, setLockUntil] = useState<number>(0);
  const [now, setNow] = useState(() => Date.now());
  const [otpChallenge, setOtpChallenge] = useState<OtpChallenge | null>(null);

  // Persist failure state across reloads
  useEffect(() => {
    try {
      const raw = localStorage.getItem("login_throttle");
      if (raw) {
        const { failCount: fc, lockUntil: lu } = JSON.parse(raw);
        if (typeof fc === "number") setFailCount(fc);
        if (typeof lu === "number" && lu > Date.now()) setLockUntil(lu);
      }
    } catch {}
  }, []);

  // Tick while locked
  useEffect(() => {
    if (lockUntil <= now) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [lockUntil, now]);

  const remainingLock = Math.max(0, Math.ceil((lockUntil - now) / 1000));
  const isLocked = remainingLock > 0;

  // Throttle: track form mount time; reject submissions <1.2s (likely bot)
  const mountedAtRef = useRef<number | null>(null);
  useEffect(() => {
    mountedAtRef.current = Date.now();
  }, []);

  const handleVerify = () => {
    if (verified || verifying) return;
    setVerifying(true);
    window.setTimeout(() => {
      setVerifying(false);
      setVerified(true);
    }, 600);
  };

  // Progressive delay: 0, 1s, 3s, 5s, 10s, 20s, 30s
  const delayForFailures = (n: number) => {
    const ladder = [0, 1, 3, 5, 10, 20, 30];
    return (ladder[Math.min(n, ladder.length - 1)] ?? 30) * 1000;
  };

  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && user) {
      const dest = destinationForRole(user.role, nextPathRef.current);
      navigate({ to: dest as any, replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    const sync = () => {
      const u = usernameRef.current?.value ?? "";
      const p = passwordRef.current?.value ?? "";
      if (u && u !== username) setUsername(u);
      if (p && p !== password) setPassword(p);
    };
    sync();
    const t = window.setTimeout(sync, 100);
    const t2 = window.setTimeout(sync, 500);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistThrottle = (fc: number, lu: number) => {
    try {
      localStorage.setItem("login_throttle", JSON.stringify({ failCount: fc, lockUntil: lu }));
    } catch {}
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Progressive lockout
    if (Date.now() < lockUntil) {
      const s = Math.ceil((lockUntil - Date.now()) / 1000);
      setError(`Trop de tentatives. Réessayez dans ${s}s.`);
      return;
    }

    // Bot trap
    if (honeypot.trim().length > 0) {
      setError("Vérification échouée.");
      return;
    }
    // Too fast = likely bot
    if (mountedAtRef.current && Date.now() - mountedAtRef.current < 1200) {
      setError("Veuillez patienter une seconde…");
      return;
    }
    // Captcha
    if (!verified) {
      setError("Veuillez confirmer que vous n'êtes pas un robot.");
      return;
    }

    const u = (usernameRef.current?.value ?? username).trim();
    const p = passwordRef.current?.value ?? password;
    if (u !== username) setUsername(u);
    if (p !== password) setPassword(p);
    if (!u || !p) {
      setError("Veuillez renseigner vos identifiants.");
      return;
    }

    setSubmitting(true);
    try {
      const challenge = await login(u, p);
      setFailCount(0);
      setLockUntil(0);
      persistThrottle(0, 0);
      if (challenge) {
        setOtpChallenge(challenge);
      }
      // Otherwise, the useEffect above redirects via destinationForRole
      // once `user` is populated — guichet → /guichet, others → next.
    } catch (err: any) {
      const next = failCount + 1;
      const delay = delayForFailures(next);
      const lu = delay > 0 ? Date.now() + delay : 0;
      setFailCount(next);
      setLockUntil(lu);
      setNow(Date.now());
      persistThrottle(next, lu);
      const base = err?.message ?? "Connexion impossible.";
      setError(
        delay > 0
          ? `${base} Nouvelle tentative dans ${Math.ceil(delay / 1000)}s.`
          : base
      );
      setVerified(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 bg-background overflow-hidden">
      {/* Subtle, ghosted call-center background — sets atmosphere without distracting */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-no-repeat bg-cover bg-center opacity-[0.07] dark:opacity-[0.05] [filter:grayscale(100%)]"
        style={{ backgroundImage: `url(${callcenterBg})` }}
      />
      {/* Soft radial fade to keep the form area cleanly readable */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at center, hsl(var(--background) / 0.85) 0%, hsl(var(--background) / 0.4) 60%, transparent 100%)" }}
      />
      <div className="relative w-full max-w-[400px]">
        {otpChallenge ? (
          <OtpStep
            challenge={otpChallenge}
            onSuccess={() => { /* redirect handled by role-aware effect once user is set */ }}
            onBack={() => { setOtpChallenge(null); setVerified(false); }}
          />
        ) : (
        <>
          <div className="space-y-1.5 text-center mb-7">
            <h1 className="text-[26px] font-semibold tracking-tight">Connexion</h1>
            <p className="text-sm text-muted-foreground">Connectez-vous à votre espace.</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4" autoComplete="on">
            <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "-9999px", height: 0, width: 0, overflow: "hidden" }}>
              <label>Ne pas remplir
                <input type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
              </label>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-xs font-medium text-muted-foreground">Identifiant</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input id="username" ref={usernameRef} value={username} onChange={(e) => setUsername(e.target.value)} onBlur={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus disabled={submitting} maxLength={80} className="pl-9 h-11" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">Mot de passe</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input id="password" ref={passwordRef} type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} onBlur={(e) => setPassword(e.target.value)} autoComplete="current-password" disabled={submitting} maxLength={200} className="pl-9 pr-10 h-11" />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors" aria-label={showPassword ? "Masquer" : "Afficher"}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleVerify}
              disabled={verified || verifying || submitting}
              aria-pressed={verified}
              className={`w-full flex items-center gap-3 px-4 h-16 rounded-md border transition-base text-left ${verified ? "border-primary/40 bg-primary/5" : "border-input bg-card hover:bg-muted/40"} disabled:cursor-default`}
            >
              <span className={`relative h-6 w-6 shrink-0 rounded-[5px] border flex items-center justify-center ${verified ? "bg-primary border-primary" : "bg-background border-muted-foreground/40"}`}>
                {verifying ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : verified ? <Check className="h-4 w-4 text-primary-foreground" strokeWidth={3} /> : null}
              </span>
              <span className="flex-1 text-sm font-medium text-foreground">
                {verified ? "Vérifié" : verifying ? "Vérification…" : "Je ne suis pas un robot"}
              </span>
              <img
                src={captchaRobot}
                alt=""
                aria-hidden="true"
                width={40}
                height={40}
                loading="lazy"
                className="h-10 w-10 shrink-0 object-contain opacity-90"
              />
            </button>

            <label className="flex items-center gap-2 text-sm text-muted-foreground select-none cursor-pointer">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 rounded border-border accent-primary" />
              Se souvenir de moi
            </label>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <Button type="submit" size="lg" className="w-full h-11 font-medium" disabled={submitting || loading || isLocked}>
              {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Connexion…</> : isLocked ? <>Réessayer dans {remainingLock}s</> : <><LogIn className="h-4 w-4 mr-2" /> Se connecter</>}
            </Button>
          </form>
        </>
        )}
      </div>
    </div>
  );
}
