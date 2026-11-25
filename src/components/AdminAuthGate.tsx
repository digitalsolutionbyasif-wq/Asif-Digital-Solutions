import { ArrowLeft, Fingerprint, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import type { AuthSessionState, StaffAccount } from '../types';

interface AdminAuthGateProps {
  authState: AuthSessionState;
  onAuthenticated: (token: string, user: StaffAccount, alertPreview?: string) => void;
  onInitialized: () => void;
  onBackPublic: () => void;
}

const DEMO_STAFF_ACCOUNTS = [
  { email: 'asifriaz1297@gmail.com', label: 'Asif Riaz · Super Admin' },
  { email: 'hamza@asifdigital.pk', label: 'Hamza Tariq · Agency Manager (2FA)' },
  { email: 'academy@asifdigital.pk', label: 'Sana Mahmood · Course Instructor (SMS 2FA)' },
  { email: 'analytics@asifdigital.pk', label: 'Bilal Qureshi · Growth Analyst (2FA)' },
];

function base64UrlToUint8Array(base64url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function AdminAuthGate({
  authState,
  onAuthenticated,
  onInitialized,
  onBackPublic,
}: AdminAuthGateProps) {
  const [selectedEmail, setSelectedEmail] = useState('asifriaz1297@gmail.com');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [twoFactorPendingToken, setTwoFactorPendingToken] = useState<string | null>(null);
  const [twoFactorMethod, setTwoFactorMethod] = useState<'totp' | 'sms'>('totp');
  const [smsHint, setSmsHint] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFirstRunSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Passcode must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passcodes do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Setup failed.');
        return;
      }
      onInitialized();
      onAuthenticated(data.token, data.user);
    } catch {
      setError('Unable to reach server. Please verify connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: selectedEmail, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Authentication failed.');
        return;
      }
      if (data.requiresTwoFactor) {
        setTwoFactorPendingToken(data.pendingToken);
        setTwoFactorMethod(data.method === 'sms' ? 'sms' : 'totp');
        setSmsHint(data.smsPreviewHint || null);
        setOtpCode('');
        return;
      }
      onAuthenticated(data.token, data.user, data.loginAlert?.subject);
    } catch {
      setError('Network error while authenticating.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorPendingToken) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingToken: twoFactorPendingToken, code: otpCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Invalid 2FA verification code.');
        return;
      }
      onAuthenticated(data.token, data.user, data.loginAlert?.subject);
    } catch {
      setError('Network error verifying two-factor code.');
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    setError(null);
    if (!window.PublicKeyCredential || !navigator.credentials) {
      setError('WebAuthn biometric authentication is not supported in this browser context.');
      return;
    }
    setLoading(true);
    try {
      const optRes = await fetch('/api/auth/webauthn/login-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: selectedEmail }),
      });
      const optData = await optRes.json();
      if (!optRes.ok) {
        setError(optData.error || 'No biometric passkey registered for this account yet.');
        setLoading(false);
        return;
      }

      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: base64UrlToUint8Array(optData.challenge) as BufferSource,
          allowCredentials: (optData.allowCredentials as string[]).map((id) => ({
            id: base64UrlToUint8Array(id) as BufferSource,
            type: 'public-key',
          })),
          userVerification: 'preferred',
          timeout: 60000,
        },
      })) as PublicKeyCredential | null;

      if (!assertion) {
        setError('Biometric prompt was cancelled.');
        setLoading(false);
        return;
      }

      const loginRes = await fetch('/api/auth/webauthn/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: optData.challengeId,
          credentialId: assertion.id,
        }),
      });
      const loginData = await loginRes.json();
      if (!loginRes.ok) {
        setError(loginData.error || 'Biometric sign-in failed.');
        return;
      }
      onAuthenticated(loginData.token, loginData.user, loginData.loginAlert?.subject);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.toLowerCase().includes('feature') || message.toLowerCase().includes('notallowed')) {
        setError(
          'Biometric prompt was blocked by browser/iframe security policy or cancelled. Use passcode + 2FA, or open in a top-level tab.'
        );
      } else {
        setError('Could not complete biometric passkey verification.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-112px)] bg-theme-canvas px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-md">
        <button
          type="button"
          onClick={onBackPublic}
          className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Public Website</span>
        </button>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-2xl border border-slate-200 bg-theme-surface p-6 shadow-sm dark:border-slate-800 sm:p-8"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-theme-accent text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-slate-950 dark:text-white">
                {!authState.initialized
                  ? 'Initialize Admin Console'
                  : twoFactorPendingToken
                  ? 'Two-Factor Verification'
                  : 'Admin & Analytics Sign-In'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Scrypt Hashing · RBAC · TOTP/SMS 2FA · WebAuthn
              </p>
            </div>
          </div>

          {!authState.initialized ? (
            <form onSubmit={handleFirstRunSetup} className="mt-6 space-y-4">
              <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-200">
                First-run setup: claim Super Admin console ownership by setting a secure passcode (8+ characters). It is salted and hashed on the server with scrypt.
              </p>

              <div>
                <label htmlFor="setup-pass" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Create Admin Passcode
                </label>
                <input
                  id="setup-pass"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label htmlFor="setup-confirm" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Confirm Admin Passcode
                </label>
                <input
                  id="setup-confirm"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter passcode"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-theme-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60 cursor-pointer"
              >
                <Lock className="h-4 w-4" />
                <span>{loading ? 'Securing Console...' : 'Claim Admin Access & Enter'}</span>
              </button>
            </form>
          ) : twoFactorPendingToken ? (
            <form onSubmit={handleVerifyTwoFactor} className="mt-6 space-y-4">
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {twoFactorMethod === 'sms'
                  ? 'Enter the 6-digit SMS verification code dispatched to your registered contact.'
                  : 'Enter the current 6-digit code from your authenticator app (Google Authenticator / Authy).'}
              </p>

              {smsHint && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                  {smsHint}
                </div>
              )}

              <div>
                <label htmlFor="otp-code" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  6-Digit Verification Code
                </label>
                <input
                  id="otp-code"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-center font-mono-tabular text-lg tracking-[0.35em] text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                  {error}
                </div>
              )}

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setTwoFactorPendingToken(null);
                    setError(null);
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading || otpCode.length !== 6}
                  className="flex-1 rounded-lg bg-theme-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {loading ? 'Verifying...' : 'Verify & Open Console'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              <div>
                <label htmlFor="staff-account" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Staff Role Profile
                </label>
                <select
                  id="staff-account"
                  value={selectedEmail}
                  onChange={(e) => setSelectedEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  {DEMO_STAFF_ACCOUNTS.map((acc) => (
                    <option key={acc.email} value={acc.email}>
                      {acc.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="login-passcode" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Admin Passcode
                </label>
                <input
                  id="login-passcode"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter configured passcode"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-theme-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60 cursor-pointer"
              >
                <KeyRound className="h-4 w-4" />
                <span>{loading ? 'Authenticating...' : 'Sign In with Passcode'}</span>
              </button>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-200 dark:border-slate-800" />
                </div>
                <div className="relative flex justify-center text-[11px] uppercase">
                  <span className="bg-theme-surface px-2 text-slate-400">or passwordless</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleBiometricLogin}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-theme-subtle px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Fingerprint className="h-4 w-4 text-theme-accent" />
                <span>Sign In with Biometric Passkey (WebAuthn)</span>
              </button>
            </form>
          )}
        </motion.div>
      </div>
    </main>
  );
}
