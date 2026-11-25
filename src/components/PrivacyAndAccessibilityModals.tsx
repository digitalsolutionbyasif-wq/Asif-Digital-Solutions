import { Accessibility, CheckCircle2, Shield, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { generateQrMatrix } from '../lib/qrSvg';
import type { ConsentPreferences } from '../types';

interface ConsentBannerProps {
  visible: boolean;
  onAcceptAll: () => void;
  onEssentialOnly: () => void;
  onCustomize: () => void;
}

export function ConsentBanner({
  visible,
  onAcceptAll,
  onEssentialOnly,
  onCustomize,
}: ConsentBannerProps) {
  if (!visible) return null;

  return (
    <aside
      aria-label="Privacy and Analytics Consent"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-theme-surface-glass shadow-lg backdrop-blur-md dark:border-slate-800"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-slate-900 dark:text-white">GDPR &amp; CCPA Privacy Control: </span>
          Essential storage enables offline queue sync and security sessions. Optional analytics powers real-time UX heatmaps and A/B tests.
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onCustomize}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            Preferences
          </button>
          <button
            type="button"
            onClick={onEssentialOnly}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            Essential Only
          </button>
          <button
            type="button"
            onClick={onAcceptAll}
            className="rounded-md bg-theme-accent px-3.5 py-1.5 text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            Accept All
          </button>
        </div>
      </div>
    </aside>
  );
}

interface PrivacyModalProps {
  open: boolean;
  onClose: () => void;
  consent: ConsentPreferences;
  onSaveConsent: (next: ConsentPreferences) => void;
}

export function PrivacyModal({ open, onClose, consent, onSaveConsent }: PrivacyModalProps) {
  const [analytics, setAnalytics] = useState(consent.analytics);
  const [marketing, setMarketing] = useState(consent.marketing);
  const [email, setEmail] = useState('');
  const [requestType, setRequestType] = useState<'Export Data' | 'Delete Data' | 'Do Not Sell (CCPA)'>('Export Data');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!open) return null;

  const handleSavePrefs = () => {
    onSaveConsent({
      essential: true,
      analytics,
      marketing,
      savedAt: new Date().toISOString(),
    });
    setFeedback('Consent preferences saved.');
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setFeedback(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/public/gdpr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, type: requestType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not submit privacy request.');
      } else {
        setFeedback(`Request #${data.request.id} logged for ${data.request.email}. Fulfilled within statutory SLA.`);
        setEmail('');
      }
    } catch {
      setErrorMsg('Network unavailable. Please try again once connected.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-theme-surface p-6 shadow-2xl dark:border-slate-800"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <Shield className="h-5 w-5 text-theme-accent" />
            <h2 id="privacy-modal-title" className="font-display text-lg font-bold text-slate-900 dark:text-white">
              GDPR &amp; CCPA Privacy Center
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close privacy center"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-6">
          {/* Consent Controls */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Telemetry &amp; Storage Consent</h3>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Essential Security &amp; Offline Sync</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Always active for form queuing and authentication safety.</p>
                </div>
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Required</span>
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3.5 dark:border-slate-800 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">UX Heatmaps &amp; A/B Analytics</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Anonymized section click coordinates to improve conversion UX.</p>
              </div>
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
                className="h-4 w-4 accent-theme"
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3.5 dark:border-slate-800 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">Automated Lead Nurturing &amp; CRM Updates</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Allow tailored syllabus and project follow-up notifications.</p>
              </div>
              <input
                type="checkbox"
                checked={marketing}
                onChange={(e) => setMarketing(e.target.checked)}
                className="h-4 w-4 accent-theme"
              />
            </label>

            <button
              type="button"
              onClick={handleSavePrefs}
              className="rounded-lg bg-theme-accent px-4 py-2 text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              Save Consent Preferences
            </button>
          </div>

          {/* Data Subject Rights Request */}
          <form onSubmit={handleSubmitRequest} className="space-y-3 border-t border-slate-200 pt-5 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Exercise Data Rights (GDPR / CCPA)</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="gdpr-type" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Request Type
                </label>
                <select
                  id="gdpr-type"
                  value={requestType}
                  onChange={(e) => setRequestType(e.target.value as 'Export Data' | 'Delete Data' | 'Do Not Sell (CCPA)')}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="Export Data">Export My Data (GDPR Art. 15)</option>
                  <option value="Delete Data">Erase My Data (GDPR Art. 17)</option>
                  <option value="Do Not Sell (CCPA)">Do Not Sell or Share (CCPA)</option>
                </select>
              </div>
              <div>
                <label htmlFor="gdpr-email" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Verification Email
                </label>
                <input
                  id="gdpr-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@domain.com"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg border border-slate-300 bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white cursor-pointer"
            >
              {submitting ? 'Submitting...' : 'Submit Privacy Request'}
            </button>
          </form>

          {feedback && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{feedback}</span>
            </div>
          )}
          {errorMsg && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
              {errorMsg}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export interface A11ySettings {
  textScale: 'default' | 'large' | 'xlarge';
  highContrast: boolean;
  reducedMotion: boolean;
}

interface AccessibilityModalProps {
  open: boolean;
  onClose: () => void;
  settings: A11ySettings;
  onUpdate: (next: A11ySettings) => void;
}

export function AccessibilityModal({ open, onClose, settings, onUpdate }: AccessibilityModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="a11y-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-theme-surface p-6 shadow-2xl dark:border-slate-800"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <Accessibility className="h-5 w-5 text-theme-accent" />
            <h2 id="a11y-modal-title" className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Accessibility Controls
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close accessibility controls"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Text Size
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'default', label: 'Standard' },
                  { id: 'large', label: 'Large (112%)' },
                  { id: 'xlarge', label: 'XL (125%)' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onUpdate({ ...settings, textScale: opt.id })}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                    settings.textScale === opt.id
                      ? 'border-theme-accent bg-theme-accent text-white'
                      : 'border-slate-200 bg-theme-subtle text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center justify-between rounded-xl border border-slate-200 p-3.5 dark:border-slate-800 cursor-pointer">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">High Contrast Mode</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Increases foreground/background separation.</p>
            </div>
            <input
              type="checkbox"
              checked={settings.highContrast}
              onChange={(e) => onUpdate({ ...settings, highContrast: e.target.checked })}
              className="h-4 w-4 accent-theme"
            />
          </label>

          <label className="flex items-center justify-between rounded-xl border border-slate-200 p-3.5 dark:border-slate-800 cursor-pointer">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">Reduce Motion</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Disables smooth-scroll transitions and animations.</p>
            </div>
            <input
              type="checkbox"
              checked={settings.reducedMotion}
              onChange={(e) => onUpdate({ ...settings, reducedMotion: e.target.checked })}
              className="h-4 w-4 accent-theme"
            />
          </label>

          <button
            type="button"
            onClick={() => onUpdate({ textScale: 'default', highContrast: false, reducedMotion: false })}
            className="w-full rounded-lg border border-slate-200 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
          >
            Reset to Defaults
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export function QrCodeSvg({ value, size = 148 }: { value: string; size?: number }) {
  const matrix = useMemo(() => generateQrMatrix(value), [value]);
  const dim = matrix.length;
  const quiet = 2;
  const total = dim + quiet * 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${total} ${total}`}
      role="img"
      aria-label="Authenticator QR Code"
      className="rounded-lg border border-slate-200 bg-white p-1"
    >
      <rect x={0} y={0} width={total} height={total} fill="#ffffff" />
      {matrix.map((row, r) =>
        row.map((dark, c) =>
          dark ? <rect key={`${r}-${c}`} x={c + quiet} y={r + quiet} width={1} height={1} fill="#0f172a" /> : null
        )
      )}
    </svg>
  );
}
