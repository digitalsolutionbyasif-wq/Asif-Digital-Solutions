import type { User } from 'firebase/auth';
import {
  Accessibility,
  Check,
  Cloud,
  Download,
  Palette,
  RefreshCw,
  Search,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import type { ThemeId } from '../types';

interface UtilityBarProps {
  themeId: ThemeId;
  onSelectTheme: (id: ThemeId) => void;
  isOnline: boolean;
  pendingSyncCount: number;
  isSyncing: boolean;
  onManualSync: () => void;
  onOpenA11y: () => void;
  onOpenPrivacy: () => void;
  onOpenTracker: () => void;
  firebaseUser: User | null;
  onOpenWorkspace: () => void;
}

const THEMES: Array<{ id: ThemeId; label: string; swatch: string }> = [
  { id: 'sapphire-light', label: 'Sapphire', swatch: '#0d3b66' },
  { id: 'ivory-editorial', label: 'Ivory', swatch: '#7c2d12' },
  { id: 'obsidian-dark', label: 'Obsidian', swatch: '#2563eb' },
  { id: 'emerald-dark', label: 'Emerald', swatch: '#059669' },
];

export function UtilityBar({
  themeId,
  onSelectTheme,
  isOnline,
  pendingSyncCount,
  isSyncing,
  onManualSync,
  onOpenA11y,
  onOpenPrivacy,
  onOpenTracker,
  firebaseUser,
  onOpenWorkspace,
}: UtilityBarProps) {
  const { canPrompt, isInstalled, isIOS, install } = usePWAInstall();
  const [showIosGuide, setShowIosGuide] = useState(false);

  const handleInstallClick = async () => {
    if (canPrompt) {
      await install();
    } else {
      setShowIosGuide((prev) => !prev);
    }
  };

  return (
    <div className="border-b border-slate-200/80 bg-theme-subtle dark:border-slate-800/80">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-300">
          <span className="font-medium text-slate-800 dark:text-slate-100">
            Bahawalpur &amp; Lahore · +92 300-6316551
          </span>

          {!isOnline && (
            <span className="inline-flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
              <WifiOff className="h-3.5 w-3.5" />
              Offline Mode · Form submissions will queue &amp; auto-sync
            </span>
          )}

          {pendingSyncCount > 0 && (
            <button
              type="button"
              onClick={onManualSync}
              disabled={!isOnline || isSyncing}
              className="inline-flex items-center gap-1.5 font-medium text-theme-accent hover:underline disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {pendingSyncCount} offline inquiry pending sync{isOnline ? ' · Sync now' : ''}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Multi-Theme Switcher */}
          <div
            role="group"
            aria-label="Color Theme Selector"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-theme-surface p-0.5 dark:border-slate-700"
          >
            <Palette className="ml-1.5 mr-0.5 hidden h-3.5 w-3.5 text-slate-500 dark:text-slate-400 sm:inline" />
            {THEMES.map((t) => {
              const active = themeId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelectTheme(t.id)}
                  className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'bg-theme-accent text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full border border-white/60"
                    style={{ backgroundColor: t.swatch }}
                  />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onOpenWorkspace}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-200/70 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <Cloud className="h-3.5 w-3.5 text-theme-accent" />
            <span>
              {firebaseUser
                ? (firebaseUser.displayName?.split(' ')[0] || 'My') + ' Workspace'
                : 'Cloud Workspace'}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenTracker}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-200/70 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Track Inquiry</span>
          </button>

          <button
            type="button"
            onClick={onOpenPrivacy}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 font-medium text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Privacy</span>
          </button>

          <button
            type="button"
            onClick={onOpenA11y}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 font-medium text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <Accessibility className="h-3.5 w-3.5" />
            <span>A11y</span>
          </button>

          {!isInstalled ? (
            <button
              type="button"
              onClick={handleInstallClick}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-theme-accent-soft bg-theme-accent-soft px-2.5 py-1.5 font-semibold text-theme-accent cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Install App</span>
            </button>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap px-2 py-1 font-medium text-emerald-700 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" />
              App Installed
            </span>
          )}
        </div>
      </div>

      {showIosGuide && !isInstalled && (
        <div className="border-t border-slate-200 bg-theme-surface px-4 py-2.5 text-xs text-slate-700 dark:border-slate-800 dark:text-slate-300 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <span>
              {isIOS
                ? 'On iPhone/iPad Safari: tap the Share button, then select "Add to Home Screen" for offline access.'
                : 'Install from your browser address bar ("Install Asif Digital") or browser menu for offline access and instant launch.'}
            </span>
            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="shrink-0 font-semibold text-theme-accent cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
