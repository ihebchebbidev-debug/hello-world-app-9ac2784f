---
name: Login OTP par email (OVH SMTP)
description: 2FA email OTP 4 chiffres après login — SMTP OVH via backend/php/mailer.php
type: feature
---
Flow:
1. POST /auth_login.php → si identifiants OK, génère un code 4 chiffres, l'envoie par email via SMTP OVH, retourne `{otpRequired:true, challenge, maskedEmail, expiresAt, codeLength:4}`. Aucun token JWT à ce stade.
2. POST /auth_otp_verify.php avec `{challenge, code}` → JWT + user.
3. POST /auth_otp_resend.php avec `{challenge}` → renvoie un nouveau code (anti-spam 30s).

Table auto-créée: `crminternet_login_otp` (challenge PK, user_id, code_hash bcrypt, expires_at, attempts, used).
- Code valide 10 minutes.
- Max 5 tentatives par challenge, max 5 codes générés par utilisateur en 10 minutes.

SMTP OVH config (backend/php/mailer.php constantes ou env vars):
SMTP_HOST=ssl0.ovh.net, SMTP_PORT=465, SMTP_SECURE=ssl, SMTP_USER=<email>, SMTP_PASS=<mdp>, SMTP_FROM, SMTP_FROM_NAME.
**À éditer dans backend/php/mailer.php avant déploiement** (pas de .env côté hébergeur PHP par défaut).

Frontend: `src/components/OtpStep.tsx` (4 cases auto-focus, paste support, auto-submit, countdown, resend).
`src/lib/auth.tsx` expose `login()` qui retourne `OtpChallenge | null`, plus `verifyOtp` et `resendOtp`.
`src/routes/login.tsx` bascule sur `<OtpStep>` quand un challenge est retourné.
