import { Menu, X } from 'lucide-react';
import { useState } from 'react';

interface TopBarProps {
  activeView: 'public' | 'console';
  onNavigateView: (view: 'public' | 'console', anchor?: string) => void;
}

export function TopBar({ activeView, onNavigateView }: TopBarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: Array<{ label: string; anchor?: string; view: 'public' | 'console' }> = [
    { label: 'Services', anchor: 'services', view: 'public' },
    { label: 'Courses', anchor: 'courses', view: 'public' },
    { label: 'FYP Track', anchor: 'fyp', view: 'public' },
    { label: 'Process', anchor: 'process', view: 'public' },
    { label: 'Console', view: 'console' },
  ];

  const handleLink = (item: { view: 'public' | 'console'; anchor?: string }) => {
    setMobileOpen(false);
    onNavigateView(item.view, item.anchor);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-theme-surface-glass backdrop-blur-md dark:border-slate-800">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            handleLink({ view: 'public', anchor: 'top' });
          }}
          className="flex shrink-0 items-center gap-2.5 whitespace-nowrap text-slate-900 dark:text-white"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-theme-accent font-display text-sm font-bold text-white">
            AD
          </span>
          <span className="font-display text-base font-bold tracking-tight sm:text-lg">
            Asif Digital Solutions
          </span>
        </a>

        {/* Zone 2: Concise Single-line Navigation */}
        <nav aria-label="Primary Navigation" className="hidden items-center gap-8 lg:flex">
          {navItems.map((item) => {
            const isConsoleActive = item.view === 'console' && activeView === 'console';
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => handleLink(item)}
                className={`shrink-0 whitespace-nowrap text-sm font-medium transition-colors cursor-pointer ${
                  isConsoleActive
                    ? 'text-theme-accent font-semibold'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single Primary Action + Mobile Menu Trigger */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => handleLink({ view: 'public', anchor: 'contact' })}
            className="hidden shrink-0 whitespace-nowrap rounded-lg bg-theme-accent px-4 py-2 text-sm font-semibold text-white transition-colors sm:inline-flex cursor-pointer"
          >
            Book Consultation
          </button>

          <button
            type="button"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((prev) => !prev)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 lg:hidden cursor-pointer"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="border-t border-slate-200 bg-theme-surface px-4 py-4 dark:border-slate-800 lg:hidden">
          <nav aria-label="Mobile Navigation" className="flex flex-col gap-1">
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => handleLink(item)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
              >
                <span>{item.label}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleLink({ view: 'public', anchor: 'contact' })}
              className="mt-2 w-full rounded-lg bg-theme-accent px-4 py-2.5 text-center text-sm font-semibold text-white cursor-pointer"
            >
              Book Consultation
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
