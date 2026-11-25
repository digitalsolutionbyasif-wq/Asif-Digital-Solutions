import { onAuthStateChanged, type User } from 'firebase/auth';
import { MotionConfig } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { AdminAuthGate } from './components/AdminAuthGate';
import { AdminConsole } from './components/AdminConsole';
import { ClientWorkspaceModal } from './components/ClientWorkspaceModal';
import { InquiryTrackerModal } from './components/InquiryTrackerModal';
import {
  AccessibilityModal,
  ConsentBanner,
  PrivacyModal,
  type A11ySettings,
} from './components/PrivacyAndAccessibilityModals';
import { PublicLanding } from './components/PublicLanding';
import { TopBar } from './components/TopBar';
import { UtilityBar } from './components/UtilityBar';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  auth,
  ensureUserProfile,
  signInWithGoogle,
  signOutFirebase,
  testFirestoreConnection,
} from './lib/firebase';
import { flushLeadQueue, getQueuedLeads } from './lib/offlineQueue';
import type { AuthSessionState, ConsentPreferences, StaffAccount, ThemeId } from './types';

const DEFAULT_CONSENT: ConsentPreferences = {
  essential: true,
  analytics: false,
  marketing: false,
  savedAt: '',
};

const DEFAULT_A11Y: A11ySettings = {
  textScale: 'default',
  highContrast: false,
  reducedMotion: false,
};

const VALID_THEMES: ThemeId[] = ['sapphire-light', 'ivory-editorial', 'obsidian-dark', 'emerald-dark'];

export default function App() {
  const isOnline = useOnlineStatus();

  const [activeView, setActiveView] = useState<'public' | 'console'>('public');
  const [themeId, setThemeId] = useState<ThemeId>(() => {
    try {
      const saved = localStorage.getItem('asif_theme_id') as ThemeId | null;
      if (saved && VALID_THEMES.includes(saved)) return saved;
      const legacy = localStorage.getItem('asif_theme');
      if (legacy === 'dark') return 'obsidian-dark';
      if (legacy === 'light') return 'sapphire-light';
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'obsidian-dark' : 'sapphire-light';
    } catch {
      return 'sapphire-light';
    }
  });

  const [a11y, setA11y] = useState<A11ySettings>(() => {
    try {
      const raw = localStorage.getItem('asif_a11y');
      return raw ? (JSON.parse(raw) as A11ySettings) : DEFAULT_A11Y;
    } catch {
      return DEFAULT_A11Y;
    }
  });

  const [consent, setConsent] = useState<ConsentPreferences>(() => {
    try {
      const raw = localStorage.getItem('asif_consent');
      return raw ? (JSON.parse(raw) as ConsentPreferences) : DEFAULT_CONSENT;
    } catch {
      return DEFAULT_CONSENT;
    }
  });

  const [consentDismissed, setConsentDismissed] = useState<boolean>(() => {
    try {
      return Boolean(localStorage.getItem('asif_consent'));
    } catch {
      return false;
    }
  });

  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [a11yOpen, setA11yOpen] = useState(false);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [firebaseAuthReady, setFirebaseAuthReady] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Auth session kept strictly in React memory (never persisted to localStorage)
  const [authState, setAuthState] = useState<AuthSessionState>({
    initialized: true,
    envPasscodeActive: false,
    authenticated: false,
    requiresTwoFactor: false,
    pendingToken: null,
    token: null,
    user: null,
  });

  useEffect(() => {
    const root = document.documentElement;
    const isDark = themeId === 'obsidian-dark' || themeId === 'emerald-dark';
    root.classList.toggle('dark', isDark);
    root.setAttribute('data-theme', themeId);
    try {
      localStorage.setItem('asif_theme_id', themeId);
    } catch {
      // Ignore storage failures
    }
  }, [themeId]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('a11y-large-text', a11y.textScale === 'large');
    root.classList.toggle('a11y-xlarge-text', a11y.textScale === 'xlarge');
    root.classList.toggle('a11y-high-contrast', a11y.highContrast);
    root.classList.toggle('a11y-reduced-motion', a11y.reducedMotion);
    try {
      localStorage.setItem('asif_a11y', JSON.stringify(a11y));
    } catch {
      // Ignore storage failures
    }
  }, [a11y]);

  const refreshQueueCount = useCallback(async () => {
    const items = await getQueuedLeads();
    setPendingSyncCount(items.length);
  }, []);

  const handleManualSync = useCallback(async () => {
    if (!isOnline) return;
    setIsSyncing(true);
    try {
      await flushLeadQueue();
      await refreshQueueCount();
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, refreshQueueCount]);

  useEffect(() => {
    refreshQueueCount();
  }, [refreshQueueCount]);

  useEffect(() => {
    if (isOnline) {
      handleManualSync();
    }
  }, [isOnline, handleManualSync]);

  const fetchAuthStatus = useCallback(async (currentToken: string | null) => {
    try {
      const res = await fetch('/api/auth/status', {
        headers: currentToken ? { Authorization: `Bearer ${currentToken}` } : {},
      });
      if (!res.ok) return;
      const status = await res.json();
      setAuthState((prev) => ({
        ...prev,
        initialized: Boolean(status.initialized),
        envPasscodeActive: Boolean(status.envPasscodeActive),
        authenticated: Boolean(status.authenticated),
        user: status.user || null,
        token: status.authenticated ? prev.token : null,
      }));
    } catch {
      // Offline mode: keep current memory state
    }
  }, []);

  useEffect(() => {
    fetchAuthStatus(null);
  }, [fetchAuthStatus]);

  useEffect(() => {
    testFirestoreConnection();
    const unsub = onAuthStateChanged(auth, async (u) => {
      setFirebaseUser(u);
      setFirebaseAuthReady(true);
      if (u) {
        try {
          await ensureUserProfile(u);
        } catch (err) {
          console.error('Failed to ensure user profile:', err);
        }
      }
    });
    return () => unsub();
  }, []);

  const handleRequireGoogleSignIn = useCallback(async (): Promise<User | null> => {
    if (firebaseUser) return firebaseUser;
    try {
      const signedInUser = await signInWithGoogle();
      setFirebaseUser(signedInUser);
      return signedInUser;
    } catch (err) {
      console.error('Google Sign-In failed or cancelled:', err);
      return null;
    }
  }, [firebaseUser]);

  const handleSaveConsent = (next: ConsentPreferences) => {
    setConsent(next);
    setConsentDismissed(true);
    try {
      localStorage.setItem('asif_consent', JSON.stringify(next));
    } catch {
      // Ignore storage errors
    }
  };

  const handleNavigateView = (view: 'public' | 'console', anchor?: string) => {
    setActiveView(view);
    if (view === 'console') {
      fetchAuthStatus(authState.token);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (anchor) {
      setTimeout(() => {
        if (anchor === 'top') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' });
        }
      }, 40);
    }
  };

  const handleAuthenticated = (token: string, user: StaffAccount, alertPreview?: string) => {
    setAuthState((prev) => ({
      ...prev,
      initialized: true,
      authenticated: true,
      token,
      user,
    }));

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('Asif Digital Security Alert', {
        body: alertPreview || `Signed in as ${user.name} (${user.role})`,
        icon: '/pwa-192x192.png',
      });
    }
  };

  const handleLogout = async () => {
    if (authState.token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authState.token}` },
      }).catch(() => {});
    }
    setAuthState((prev) => ({
      ...prev,
      authenticated: false,
      token: null,
      user: null,
    }));
  };

  return (
    <MotionConfig reducedMotion={a11y.reducedMotion ? 'always' : 'user'}>
      <div className="min-h-screen bg-theme-canvas text-slate-900 dark:text-slate-100">
        <TopBar activeView={activeView} onNavigateView={handleNavigateView} />

        <UtilityBar
          themeId={themeId}
          onSelectTheme={setThemeId}
          isOnline={isOnline}
          pendingSyncCount={pendingSyncCount}
          isSyncing={isSyncing}
          onManualSync={handleManualSync}
          onOpenA11y={() => setA11yOpen(true)}
          onOpenPrivacy={() => setPrivacyOpen(true)}
          onOpenTracker={() => setTrackerOpen(true)}
          firebaseUser={firebaseUser}
          onOpenWorkspace={() => setWorkspaceOpen(true)}
        />

        {activeView === 'public' ? (
          <PublicLanding
            consent={consent}
            isOnline={isOnline}
            firebaseUser={firebaseUser}
            onRequireGoogleSignIn={handleRequireGoogleSignIn}
            onQueuedOffline={refreshQueueCount}
            onOpenPrivacy={() => setPrivacyOpen(true)}
            onOpenConsole={() => handleNavigateView('console')}
            onOpenTracker={() => setTrackerOpen(true)}
          />
        ) : authState.authenticated && authState.token && authState.user ? (
          <AdminConsole
            token={authState.token}
            currentUser={authState.user}
            onUserUpdated={(user) => setAuthState((prev) => ({ ...prev, user }))}
            onLogout={handleLogout}
            onBackPublic={() => handleNavigateView('public', 'top')}
          />
        ) : (
          <AdminAuthGate
            authState={authState}
            onAuthenticated={handleAuthenticated}
            onInitialized={() => setAuthState((prev) => ({ ...prev, initialized: true }))}
            onBackPublic={() => handleNavigateView('public', 'top')}
          />
        )}

        <ConsentBanner
          visible={!consentDismissed && activeView === 'public'}
          onAcceptAll={() =>
            handleSaveConsent({
              essential: true,
              analytics: true,
              marketing: true,
              savedAt: new Date().toISOString(),
            })
          }
          onEssentialOnly={() =>
            handleSaveConsent({
              essential: true,
              analytics: false,
              marketing: false,
              savedAt: new Date().toISOString(),
            })
          }
          onCustomize={() => setPrivacyOpen(true)}
        />

        <PrivacyModal
          open={privacyOpen}
          onClose={() => setPrivacyOpen(false)}
          consent={consent}
          onSaveConsent={handleSaveConsent}
        />

        <AccessibilityModal
          open={a11yOpen}
          onClose={() => setA11yOpen(false)}
          settings={a11y}
          onUpdate={setA11y}
        />

        <InquiryTrackerModal
          open={trackerOpen}
          onClose={() => setTrackerOpen(false)}
        />

        <ClientWorkspaceModal
          open={workspaceOpen}
          onClose={() => setWorkspaceOpen(false)}
          user={firebaseUser}
          authReady={firebaseAuthReady}
          onSignInGoogle={handleRequireGoogleSignIn}
          onSignOut={signOutFirebase}
        />
      </div>
    </MotionConfig>
  );
}
