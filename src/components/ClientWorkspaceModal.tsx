import type { User } from 'firebase/auth';
import { onSnapshot, orderBy, query } from 'firebase/firestore';
import {
  Archive,
  CheckCircle2,
  Cloud,
  FileText,
  Image as ImageIcon,
  LogOut,
  Mic,
  Trash2,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import {
  deleteBriefDoc,
  deleteCreativeAssetDoc,
  deleteVoiceSessionDoc,
  getUserAssetsCollection,
  getUserBriefsCollection,
  getUserVoiceCollection,
  handleFirestoreError,
  OperationType,
  updateBriefStatus,
} from '../lib/firebase';
import type {
  FirestoreAssetDoc,
  FirestoreBriefDoc,
  FirestoreVoiceSessionDoc,
} from '../types';

interface ClientWorkspaceModalProps {
  open: boolean;
  onClose: () => void;
  user: User | null;
  authReady: boolean;
  onSignInGoogle: () => Promise<User | null>;
  onSignOut: () => Promise<void>;
}

export function ClientWorkspaceModal({
  open,
  onClose,
  user,
  authReady,
  onSignInGoogle,
  onSignOut,
}: ClientWorkspaceModalProps) {
  const [briefs, setBriefs] = useState<FirestoreBriefDoc[]>([]);
  const [voiceLogs, setVoiceLogs] = useState<FirestoreVoiceSessionDoc[]>([]);
  const [assets, setAssets] = useState<FirestoreAssetDoc[]>([]);
  const [workspaceTab, setWorkspaceTab] = useState<'briefs' | 'voice' | 'assets'>('briefs');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !authReady || !user) {
      return;
    }

    const uid = user.uid;

    const unsubBriefs = onSnapshot(
      query(getUserBriefsCollection(uid), orderBy('createdAt', 'desc')),
      (snap) => {
        setBriefs(snap.docs.map((d) => d.data() as FirestoreBriefDoc));
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, `users/${uid}/briefs`);
        } catch (wrapped) {
          setErrorMsg(wrapped instanceof Error ? wrapped.message : 'Unable to sync project briefs.');
        }
      }
    );

    const unsubVoice = onSnapshot(
      query(getUserVoiceCollection(uid), orderBy('createdAt', 'desc')),
      (snap) => {
        setVoiceLogs(snap.docs.map((d) => d.data() as FirestoreVoiceSessionDoc));
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, `users/${uid}/voiceSessions`);
        } catch (wrapped) {
          setErrorMsg(wrapped instanceof Error ? wrapped.message : 'Unable to sync voice logs.');
        }
      }
    );

    const unsubAssets = onSnapshot(
      query(getUserAssetsCollection(uid), orderBy('createdAt', 'desc')),
      (snap) => {
        setAssets(snap.docs.map((d) => d.data() as FirestoreAssetDoc));
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, `users/${uid}/assets`);
        } catch (wrapped) {
          setErrorMsg(wrapped instanceof Error ? wrapped.message : 'Unable to sync creative asset logs.');
        }
      }
    );

    return () => {
      unsubBriefs();
      unsubVoice();
      unsubAssets();
    };
  }, [open, authReady, user]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-theme-surface p-6 shadow-2xl dark:border-slate-800"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-theme-accent text-white">
              <Cloud className="h-5 w-5" />
            </div>
            <div>
              <h2 id="workspace-modal-title" className="font-display text-lg font-bold text-slate-950 dark:text-white">
                Client Cloud Workspace
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {user
                  ? `Signed in as ${user.displayName || user.email} · Synced across devices`
                  : 'Sign in with Google to save AI briefs, voice transcripts, and studio history'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out</span>
              </button>
            )}
            <button
              type="button"
              aria-label="Close cloud workspace"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {!user ? (
          <div className="py-10 text-center">
            <p className="mx-auto max-w-md text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Connect your Google account to persist your AI execution roadmaps, live voice consultation notes, and brand studio prompts privately across sessions.
            </p>
            <button
              type="button"
              onClick={onSignInGoogle}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-theme-accent px-5 py-3 text-sm font-semibold text-white cursor-pointer"
            >
              <span>Continue with Google</span>
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            {errorMsg && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                {errorMsg}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'briefs', label: `AI Briefs (${briefs.length})`, icon: FileText },
                  { id: 'voice', label: `Voice Sessions (${voiceLogs.length})`, icon: Mic },
                  { id: 'assets', label: `Studio History (${assets.length})`, icon: ImageIcon },
                ] as const
              ).map((t) => {
                const Icon = t.icon;
                const active = workspaceTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setWorkspaceTab(t.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold cursor-pointer ${
                      active
                        ? 'bg-theme-accent text-white'
                        : 'border border-slate-200 bg-theme-subtle text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {workspaceTab === 'briefs' && (
              <div className="space-y-3">
                {briefs.length === 0 ? (
                  <p className="rounded-xl border border-slate-200 bg-theme-subtle p-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    No saved AI briefs yet. Use the AI Strategy Brief tab in the studio to generate and save one.
                  </p>
                ) : (
                  briefs.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-200 bg-theme-subtle p-4 dark:border-slate-800"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-theme-accent">
                            {item.serviceTrack} · {item.budgetEstimate}
                          </p>
                          <h3 className="mt-0.5 font-display text-sm font-bold text-slate-950 dark:text-white">
                            {item.title}
                          </h3>
                        </div>
                        <span className="font-mono-tabular text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                          {item.status}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        {item.aiSummary}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                        {item.status === 'Draft' && (
                          <button
                            type="button"
                            onClick={() => updateBriefStatus(user.uid, item.id, 'Submitted')}
                            className="inline-flex items-center gap-1 rounded-md bg-theme-accent px-2.5 py-1 text-[11px] font-semibold text-white cursor-pointer"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            <span>Mark Submitted</span>
                          </button>
                        )}
                        {item.status !== 'Archived' && (
                          <button
                            type="button"
                            onClick={() => updateBriefStatus(user.uid, item.id, 'Archived')}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Archive className="h-3 w-3" />
                            <span>Archive</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteBriefDoc(user.uid, item.id)}
                          aria-label={`Delete ${item.title}`}
                          className="ml-auto inline-flex items-center gap-1 rounded-md p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {workspaceTab === 'voice' && (
              <div className="space-y-3">
                {voiceLogs.length === 0 ? (
                  <p className="rounded-xl border border-slate-200 bg-theme-subtle p-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    No saved voice sessions yet. Start a Live Voice Call and click &ldquo;Save to My Workspace&rdquo;.
                  </p>
                ) : (
                  voiceLogs.map((v) => (
                    <div
                      key={v.id}
                      className="rounded-xl border border-slate-200 bg-theme-subtle p-4 dark:border-slate-800"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-theme-accent">
                          {v.mode} · Voice: {v.voiceName}
                        </span>
                        <button
                          type="button"
                          onClick={() => deleteVoiceSessionDoc(user.uid, v.id)}
                          aria-label="Delete voice transcript"
                          className="rounded p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-slate-700 dark:text-slate-200">
                        <strong>You:</strong> {v.userTranscript}
                      </p>
                      <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">
                        <strong>Advisor:</strong> {v.assistantTranscript}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}

            {workspaceTab === 'assets' && (
              <div className="space-y-3">
                {assets.length === 0 ? (
                  <p className="rounded-xl border border-slate-200 bg-theme-subtle p-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    No Brand &amp; Visual Studio prompts logged yet.
                  </p>
                ) : (
                  assets.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-theme-subtle p-4 dark:border-slate-800"
                    >
                      <div>
                        <p className="text-[11px] font-semibold uppercase text-theme-accent">
                          {a.operation} · {a.aspectRatio} · {a.imageSize}
                        </p>
                        <p className="mt-1 text-xs text-slate-800 dark:text-slate-200">{a.prompt}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteCreativeAssetDoc(user.uid, a.id)}
                        aria-label="Delete asset log"
                        className="rounded p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
