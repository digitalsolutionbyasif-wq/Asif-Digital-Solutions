import { Calendar, CheckCircle2, Search, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';

interface InquiryTrackerModalProps {
  open: boolean;
  onClose: () => void;
}

interface TrackedInquiry {
  id: string;
  firstName: string;
  service: string;
  category: string;
  stage: string;
  sequenceStep: number;
  sequenceStatus: string;
  preferredSlot: string | null;
  estimatedBudget: string | null;
  updatedAt: string;
}

export function InquiryTrackerModal({ open, onClose }: InquiryTrackerModalProps) {
  const [refId, setRefId] = useState('');
  const [contact, setContact] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrackedInquiry | null>(null);

  if (!open) return null;

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({
        id: refId.trim(),
        contact: contact.trim(),
      });
      const res = await fetch(`/api/public/track?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Could not find matching inquiry.');
      } else {
        setResult(json.inquiry);
      }
    } catch {
      setError('Network unavailable. Check connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tracker-modal-title"
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
            <Search className="h-5 w-5 text-theme-accent" />
            <h2 id="tracker-modal-title" className="font-display text-lg font-bold text-slate-950 dark:text-white">
              Track Consultation or Enrollment
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close inquiry tracker"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleLookup} className="mt-5 space-y-4">
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            Enter the Reference ID shown after submitting your inquiry (for example <code className="font-mono-tabular">ld-1001</code>) and your registered email or phone number.
          </p>

          <div>
            <label htmlFor="track-id" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Reference ID
            </label>
            <input
              id="track-id"
              type="text"
              required
              value={refId}
              onChange={(e) => setRefId(e.target.value)}
              placeholder="e.g. ld-1001"
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label htmlFor="track-contact" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Registered Email or Phone
            </label>
            <input
              id="track-contact"
              type="text"
              required
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="you@domain.com or 0300-1234567"
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-theme-accent px-4 py-2.5 text-xs font-semibold text-white transition-colors disabled:opacity-60 cursor-pointer"
          >
            {loading ? 'Checking CRM...' : 'Check Live Status'}
          </button>
        </form>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-5 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                <span>Status: {result.stage}</span>
              </span>
              <span className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">{result.id}</span>
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {result.firstName} · {result.service}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Follow-Up Sequence: Step {result.sequenceStep} of 3 ({result.sequenceStatus})
            </p>
            {result.preferredSlot && (
              <p className="inline-flex items-center gap-1.5 text-xs font-medium text-theme-accent">
                <Calendar className="h-3.5 w-3.5" />
                <span>Booked Strategy Slot: {result.preferredSlot}</span>
              </p>
            )}
            {result.estimatedBudget && (
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Locked Scope Estimate: <span className="font-mono-tabular font-semibold">{result.estimatedBudget}</span>
              </p>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
