import type { User } from 'firebase/auth';
import {
  ArrowRight,
  BookOpen,
  Calculator,
  Calendar,
  Check,
  GraduationCap,
  Layers,
  Mail,
  MapPin,
  MessageSquare,
  Mic,
  Phone,
  Quote,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ACADEMY_COURSES,
  AGENCY_SERVICES,
  ESTIMATOR_TRACKS,
  FYP_TRACKS,
  IMPACT_METRICS,
} from '../data/catalog';
import { queueLeadOffline } from '../lib/offlineQueue';
import type {
  ABVariantStats,
  CaseStudyItem,
  ConsentPreferences,
  CourseItem,
  HeatmapPoint,
  LeadRecord,
} from '../types';
import { AICommandStudio } from './AICommandStudio';

interface PublicLandingProps {
  consent: ConsentPreferences;
  isOnline: boolean;
  firebaseUser: User | null;
  onRequireGoogleSignIn: () => Promise<User | null>;
  onQueuedOffline: () => void;
  onOpenPrivacy: () => void;
  onOpenConsole: () => void;
  onOpenTracker: () => void;
}

const DEFAULT_VARIANT: ABVariantStats = {
  variant: 'A',
  name: 'Variant A · Brand Narrative',
  headline: 'Dream it. Build it. Grow it.',
  subheadline:
    'Asif Digital Solutions helps Pakistani businesses, founders, and university builders launch high-converting websites, stores, campaigns, and technical skills under one dedicated partner.',
  ctaLabel: 'Book a Free Consultation',
  impressions: 0,
  conversions: 0,
  weight: 50,
};

interface SlotAvailability {
  time: string;
  key: string;
  available: boolean;
}

export function PublicLanding({
  consent,
  isOnline,
  firebaseUser,
  onRequireGoogleSignIn,
  onQueuedOffline,
  onOpenPrivacy,
  onOpenConsole,
  onOpenTracker,
}: PublicLandingProps) {
  const [assignedVariant, setAssignedVariant] = useState<'A' | 'B'>('A');
  const [heroVariant, setHeroVariant] = useState<ABVariantStats>(DEFAULT_VARIANT);
  const [serviceFilter, setServiceFilter] = useState<'All' | 'Core Foundations' | 'Growth & Automation'>('All');
  const [selectedCourse, setSelectedCourse] = useState<CourseItem | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  // Case Studies Showcase
  const [caseStudies, setCaseStudies] = useState<CaseStudyItem[]>([]);
  const [caseFilter, setCaseFilter] = useState<'All' | 'Agency' | 'FYP' | 'Academy'>('All');

  // Interactive Scope & ROI Estimator
  const [estTrackId, setEstTrackId] = useState<'website' | 'ecommerce' | 'growth' | 'fyp'>('website');
  const [estSelectedIds, setEstSelectedIds] = useState<string[]>(['seo', 'analytics']);

  // Live Consultation Slot Picker
  const [slotDate, setSlotDate] = useState<string>(() => {
    const tomorrow = new Date(Date.now() + 86400_000);
    return tomorrow.toISOString().slice(0, 10);
  });
  const [slots, setSlots] = useState<SlotAvailability[]>([]);
  const [selectedSlotKey, setSelectedSlotKey] = useState<string>('');

  // Lead / Enrollment Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState<'agency' | 'course' | 'fyp'>('agency');
  const [service, setService] = useState('High-Conversion Website Design');
  const [notes, setNotes] = useState('');
  const [estimatedBudget, setEstimatedBudget] = useState<string>('');
  const [consentMarketing, setConsentMarketing] = useState(consent.marketing);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submittedLead, setSubmittedLead] = useState<LeadRecord | null>(null);

  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    setConsentMarketing(consent.marketing);
  }, [consent.marketing]);

  useEffect(() => {
    let active = true;
    const loadInitialPublicData = async () => {
      try {
        const [expRes, caseRes] = await Promise.all([
          fetch(`/api/public/experiment?track=${consent.analytics ? '1' : '0'}`),
          fetch('/api/public/showcase'),
        ]);
        if (expRes.ok) {
          const data = await expRes.json();
          if (active && data.variant) {
            setAssignedVariant(data.assignedVariant);
            setHeroVariant(data.variant);
          }
        }
        if (caseRes.ok) {
          const data = await caseRes.json();
          if (active && Array.isArray(data.caseStudies)) {
            setCaseStudies(data.caseStudies);
          }
        }
      } catch {
        // Offline graceful fallback
      }
    };
    loadInitialPublicData();
    return () => {
      active = false;
    };
  }, [consent.analytics]);

  const loadSlots = useCallback(async (targetDate: string) => {
    try {
      const res = await fetch(`/api/public/slots?date=${encodeURIComponent(targetDate)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.slots)) {
        setSlots(data.slots);
        setSelectedSlotKey((prev) => {
          const stillValid = data.slots.some((s: SlotAvailability) => s.key === prev && s.available);
          if (stillValid) return prev;
          const firstOpen = data.slots.find((s: SlotAvailability) => s.available);
          return firstOpen ? firstOpen.key : '';
        });
      }
    } catch {
      const fallback = ['11:00 AM PKT', '02:00 PM PKT', '04:30 PM PKT', '07:00 PM PKT'].map((time) => ({
        time,
        key: `${targetDate} · ${time}`,
        available: true,
      }));
      setSlots(fallback);
    }
  }, []);

  useEffect(() => {
    loadSlots(slotDate);
  }, [slotDate, loadSlots]);

  const activeEstTrack = useMemo(
    () => ESTIMATOR_TRACKS.find((t) => t.id === estTrackId) || ESTIMATOR_TRACKS[0],
    [estTrackId]
  );

  const estimatorTotals = useMemo(() => {
    const picked = activeEstTrack.options.filter((o) => estSelectedIds.includes(o.id));
    const totalPkr = activeEstTrack.basePricePkr + picked.reduce((acc, o) => acc + o.pricePkr, 0);
    const totalWeeks = activeEstTrack.baseWeeks + picked.reduce((acc, o) => acc + o.weeks, 0);
    return { picked, totalPkr, totalWeeks };
  }, [activeEstTrack, estSelectedIds]);

  const recordHeatmapClick = (
    section: HeatmapPoint['section'],
    label: string,
    e: React.MouseEvent<HTMLElement>
  ) => {
    if (!consent.analytics || !isOnline) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const xPct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const yPct = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    const device = window.innerWidth < 768 ? 'mobile' : 'desktop';

    fetch('/api/public/heatmap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        section,
        xPct,
        yPct,
        device,
        variant: assignedVariant,
        label,
      }),
      keepalive: true,
    }).catch(() => {});
  };

  const prefillInquiry = (
    nextCategory: 'agency' | 'course' | 'fyp',
    nextService: string,
    defaultNotes = '',
    budgetLabel = ''
  ) => {
    setCategory(nextCategory);
    setService(nextService);
    if (defaultNotes) setNotes(defaultNotes);
    setEstimatedBudget(budgetLabel);
    setSubmittedLead(null);
    document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleAiPrefillConsult = (recommendedService: string, summary: string, budget?: string) => {
    const q = recommendedService.toLowerCase();
    const courseMatch = ACADEMY_COURSES.find(
      (c) => c.title.toLowerCase() === q || c.title.toLowerCase().includes(q) || q.includes(c.title.toLowerCase())
    );
    const fypMatch = FYP_TRACKS.find(
      (f) => f.title.toLowerCase() === q || f.title.toLowerCase().includes(q) || q.includes('fyp') || q.includes('semester')
    );
    const agencyMatch = AGENCY_SERVICES.find(
      (s) => s.title.toLowerCase() === q || s.title.toLowerCase().includes(q) || q.includes(s.title.toLowerCase())
    );

    if (courseMatch) {
      prefillInquiry('course', courseMatch.title, summary, budget || courseMatch.feePkr);
    } else if (fypMatch) {
      prefillInquiry('fyp', fypMatch.title, summary, budget || '');
    } else {
      prefillInquiry('agency', agencyMatch ? agencyMatch.title : AGENCY_SERVICES[0].title, summary, budget || '');
    }
  };

  const handleLockEstimate = () => {
    const addOnText =
      estimatorTotals.picked.length > 0
        ? estimatorTotals.picked.map((o) => o.label).join(', ')
        : 'Base Scope';
    const budgetStr = `PKR ${estimatorTotals.totalPkr.toLocaleString()} (~${estimatorTotals.totalWeeks} wks)`;
    prefillInquiry(
      activeEstTrack.category,
      activeEstTrack.serviceName,
      `Scope Estimate: ${activeEstTrack.label} + ${addOnText}. Target investment: ${budgetStr}.`,
      budgetStr
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    const cleanEmail = email.trim();

    if (cleanName.length < 2) {
      setFormError('Please enter your full name.');
      return;
    }
    if (cleanPhone.length < 7) {
      setFormError('Please enter a valid WhatsApp or phone number.');
      return;
    }
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setFormError('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    const payload = {
      name: cleanName,
      phone: cleanPhone,
      email: cleanEmail,
      service,
      category,
      notes: notes.trim(),
      preferredSlot: selectedSlotKey || undefined,
      estimatedBudget: estimatedBudget || undefined,
      sourceVariant: assignedVariant,
      consentMarketing,
    };

    try {
      if (!isOnline) throw new Error('offline');
      const res = await fetch('/api/public/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Could not submit inquiry. Please verify your details.');
        if (res.status === 409) loadSlots(slotDate);
        setSubmitting(false);
        return;
      }
      setSubmittedLead(data.lead);
      loadSlots(slotDate);
    } catch {
      const queued = await queueLeadOffline(payload);
      onQueuedOffline();
      setSubmittedLead({
        id: queued.id,
        name: queued.name,
        phone: queued.phone,
        email: queued.email,
        service: queued.service,
        category: queued.category,
        notes: queued.notes,
        stage: 'New',
        sourceVariant: queued.sourceVariant,
        consentMarketing: queued.consentMarketing,
        sequenceStep: 1,
        sequenceStatus: 'Active',
        crmSynced: false,
        preferredSlot: selectedSlotKey || undefined,
        estimatedBudget: estimatedBudget || undefined,
        createdAt: queued.queuedAt,
        updatedAt: queued.queuedAt,
        offlineQueued: true,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredServices =
    serviceFilter === 'All'
      ? AGENCY_SERVICES
      : AGENCY_SERVICES.filter((s) => s.tier === serviceFilter);

  const filteredCases =
    caseFilter === 'All'
      ? caseStudies
      : caseStudies.filter((c) => c.category === caseFilter);

  const whatsappUrl = `https://wa.me/923006316551?text=${encodeURIComponent(
    `Assalamualaikum Asif Digital Solutions, I am ${submittedLead?.name || name || 'a client'} inquiring about: ${
      submittedLead?.service || service
    }.${selectedSlotKey ? ` Preferred Slot: ${selectedSlotKey}.` : ''} Phone: ${submittedLead?.phone || phone}`
  )}`;

  const serviceOptionsForCategory =
    category === 'agency'
      ? AGENCY_SERVICES.map((s) => s.title)
      : category === 'course'
      ? ACADEMY_COURSES.map((c) => c.title)
      : FYP_TRACKS.map((f) => f.title);

  return (
    <main id="top" className="overflow-x-hidden">
      {/* HERO SECTION */}
      <section
        onClick={(e) => recordHeatmapClick('hero', 'Hero Interaction', e)}
        className="relative border-b border-slate-200/80 bg-theme-surface bg-architectural-grid dark:border-slate-800/80"
      >
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <div className="grid items-stretch gap-10 lg:grid-cols-12 lg:gap-12">
            {/* Editorial Value Proposition */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col justify-center lg:col-span-7"
            >
              <p className="text-xs font-semibold tracking-wide text-theme-accent">
                Asif Digital Solutions · Agency, Career Academy &amp; FYP Lab
              </p>

              <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:text-[3.5rem] lg:leading-[1.06]">
                {heroVariant.headline}
              </h1>

              <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-300 sm:text-lg">
                {heroVariant.subheadline}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                <a
                  href="#contact"
                  onClick={(e) => {
                    e.preventDefault();
                    recordHeatmapClick('hero', 'Hero Primary CTA', e);
                    document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-theme-accent px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors"
                >
                  <span>{heroVariant.ctaLabel}</span>
                  <ArrowRight className="h-4 w-4" />
                </a>

                <a
                  href="#estimator"
                  onClick={(e) => {
                    e.preventDefault();
                    recordHeatmapClick('hero', 'Estimate Scope CTA', e);
                    document.getElementById('estimator')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-300 bg-theme-surface px-5 py-3.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  <Calculator className="h-4 w-4 text-theme-highlight" />
                  <span>Estimate Project Scope</span>
                </a>

                <a
                  href="#ai-studio"
                  onClick={(e) => {
                    e.preventDefault();
                    recordHeatmapClick('hero', 'Try Live AI Voice CTA', e);
                    document.getElementById('ai-studio')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-theme-accent-soft bg-theme-accent-soft px-4 py-3.5 text-sm font-semibold text-theme-accent transition-colors"
                >
                  <Mic className="h-4 w-4" />
                  <span>Live AI Advisor</span>
                </a>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-200 pt-5 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <span>Bahawalpur &amp; Lahore Offices</span>
                <span aria-hidden="true">·</span>
                <span>Live Strategy Slot Booking</span>
                <span aria-hidden="true">·</span>
                <span>GDPR-Compliant Analytics</span>
              </div>
            </motion.div>

            {/* Founder Visual Showcase */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-5"
            >
              <figure className="relative h-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                {!brokenImages['founder'] ? (
                  <img
                    src="/asif-riaz.jpg"
                    alt="Asif Riaz, Founder of Asif Digital Solutions"
                    referrerPolicy="no-referrer"
                    onError={() => setBrokenImages((p) => ({ ...p, founder: true }))}
                    className="aspect-[4/5] h-full w-full object-cover object-top lg:aspect-auto"
                  />
                ) : (
                  <div className="flex aspect-[4/5] h-full w-full flex-col items-center justify-center bg-theme-accent p-8 text-center text-white">
                    <span className="font-display text-3xl font-bold">Asif Riaz</span>
                    <span className="mt-2 text-xs text-slate-200">Founder · Asif Digital Solutions</span>
                  </div>
                )}
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 via-slate-950/65 to-transparent p-5 text-white">
                  <p className="font-display text-lg font-bold tracking-tight">Asif Riaz</p>
                  <p className="mt-0.5 text-xs text-slate-200">
                    Founder &amp; Lead Architect · Web, Performance Marketing &amp; Career Mentoring
                  </p>
                </figcaption>
              </figure>
            </motion.div>
          </div>

          {/* Quantified Proof Strip */}
          <div className="mt-12 grid grid-cols-2 gap-6 border-t border-slate-200 pt-8 dark:border-slate-800 lg:grid-cols-4 lg:gap-8">
            {IMPACT_METRICS.map((metric) => (
              <div key={metric.label} className="space-y-1">
                <p className="font-display text-2xl font-extrabold tracking-tight text-slate-950 font-mono-tabular dark:text-white sm:text-3xl">
                  {metric.value}
                </p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{metric.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{metric.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SERVICES CATALOG (BENTO + NUMBERED DIRECTORY) */}
      <section
        id="services"
        onClick={(e) => recordHeatmapClick('services', 'Services Catalog', e)}
        className="border-b border-slate-200/80 bg-theme-subtle py-16 dark:border-slate-800/80 sm:py-20"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-semibold tracking-wide text-theme-accent">
                Full-Stack Agency Capabilities
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                12 Services Engineered for Measurable Conversion
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300 sm:text-base">
                Every website, storefront, ad campaign, and sourcing operation is built with clear KPIs, sub-second speed, and integrated CRM lead routing.
              </p>
            </div>

            <div role="tablist" aria-label="Filter Agency Services" className="flex flex-wrap gap-2">
              {(['All', 'Core Foundations', 'Growth & Automation'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={serviceFilter === tab}
                  onClick={() => setServiceFilter(tab)}
                  className={`shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                    serviceFilter === tab
                      ? 'bg-theme-accent text-white'
                      : 'border border-slate-200 bg-theme-surface text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  {tab === 'All' ? 'All Services (12)' : tab}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredServices.map((item, idx) => {
              const isMarquee = serviceFilter === 'All' && (idx === 0 || idx === 11);
              return (
                <article
                  key={item.index}
                  className={`card-lift group flex flex-col justify-between rounded-xl border border-slate-200 bg-theme-surface p-6 hover-border-theme-accent dark:border-slate-800 ${
                    isMarquee ? 'lg:col-span-2' : ''
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                      <span className="font-mono-tabular font-semibold text-theme-accent">
                        {item.index}
                      </span>
                      <span>{item.tier}</span>
                    </div>
                    <h3 className="mt-3 font-display text-lg font-bold text-slate-950 dark:text-white">
                      {item.title}
                    </h3>
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      {item.outcome}
                    </p>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800/80">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{item.deliverables}</p>
                    <button
                      type="button"
                      onClick={() => prefillInquiry('agency', item.title, `Interested in ${item.title}.`)}
                      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-theme-accent hover:underline cursor-pointer"
                    >
                      <span>Request Proposal</span>
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* INTERACTIVE PROJECT SCOPE & INVESTMENT ESTIMATOR */}
      <section
        id="estimator"
        className="border-b border-slate-200/80 bg-theme-surface py-16 dark:border-slate-800/80 sm:py-20"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-start gap-8 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <p className="text-xs font-semibold tracking-wide text-theme-accent">
                Transparent Scope Calculator
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                Estimate Timeline &amp; Investment in Seconds
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Select your primary build track and toggle the deliverables you need. Lock your estimate directly into a consultation slot below.
              </p>

              {/* Track Switcher */}
              <div className="mt-6 flex flex-wrap gap-2">
                {ESTIMATOR_TRACKS.map((tr) => (
                  <button
                    key={tr.id}
                    type="button"
                    onClick={() => {
                      setEstTrackId(tr.id);
                      setEstSelectedIds([]);
                    }}
                    className={`shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                      estTrackId === tr.id
                        ? 'bg-theme-accent text-white'
                        : 'border border-slate-200 bg-theme-subtle text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    {tr.label}
                  </button>
                ))}
              </div>

              <p className="mt-4 text-xs text-slate-600 dark:text-slate-300">{activeEstTrack.description}</p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {activeEstTrack.options.map((opt) => {
                  const checked = estSelectedIds.includes(opt.id);
                  return (
                    <label
                      key={opt.id}
                      className={`flex items-start justify-between gap-3 rounded-xl border p-4 transition-colors cursor-pointer ${
                        checked
                          ? 'border-theme-accent bg-theme-accent-soft'
                          : 'border-slate-200 bg-theme-subtle hover:bg-slate-100/70 dark:border-slate-800 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setEstSelectedIds((prev) =>
                              e.target.checked ? [...prev, opt.id] : prev.filter((id) => id !== opt.id)
                            );
                          }}
                          className="mt-0.5 h-4 w-4 accent-theme"
                        />
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">{opt.label}</span>
                      </div>
                      <span className="shrink-0 font-mono-tabular text-xs text-slate-600 dark:text-slate-300">
                        +PKR {(opt.pricePkr / 1000).toFixed(0)}k
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-slate-200 bg-theme-subtle p-6 dark:border-slate-800 sm:p-8">
                <p className="text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
                  Estimated Investment Summary
                </p>
                <p className="mt-3 font-display text-4xl font-extrabold tracking-tight text-slate-950 font-mono-tabular dark:text-white">
                  PKR {estimatorTotals.totalPkr.toLocaleString()}
                </p>
                <p className="mt-1 text-xs font-medium text-theme-accent">
                  Estimated Delivery: {estimatorTotals.totalWeeks} weeks · {activeEstTrack.serviceName}
                </p>

                <ul className="mt-6 space-y-2 border-t border-slate-200 pt-4 text-xs text-slate-700 dark:border-slate-800 dark:text-slate-300">
                  <li className="flex justify-between">
                    <span>Core {activeEstTrack.label} Foundation</span>
                    <span className="font-mono-tabular font-semibold">
                      PKR {activeEstTrack.basePricePkr.toLocaleString()}
                    </span>
                  </li>
                  {estimatorTotals.picked.map((opt) => (
                    <li key={opt.id} className="flex justify-between">
                      <span>{opt.label}</span>
                      <span className="font-mono-tabular font-semibold">
                        PKR {opt.pricePkr.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={handleLockEstimate}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-theme-accent px-5 py-3 text-xs font-semibold text-white cursor-pointer"
                >
                  <span>Lock Estimate &amp; Book Consultation</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* VERIFIED CASE STUDIES & OUTCOMES */}
      {caseStudies.length > 0 && (
        <section
          id="proof"
          className="border-b border-slate-200/80 bg-theme-subtle py-16 dark:border-slate-800/80 sm:py-20"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <p className="text-xs font-semibold tracking-wide text-theme-accent">
                  Verified Client Outcomes
                </p>
                <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                  Case Studies From Bahawalpur, Lahore &amp; Remote Partners
                </h2>
              </div>

              <div className="flex flex-wrap gap-2">
                {(['All', 'Agency', 'FYP'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCaseFilter(cat)}
                    className={`shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold cursor-pointer ${
                      caseFilter === cat
                        ? 'bg-theme-accent text-white'
                        : 'border border-slate-200 bg-theme-surface text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {filteredCases.map((cs) => (
                <article
                  key={cs.id}
                  className="card-lift flex flex-col justify-between rounded-2xl border border-slate-200 bg-theme-surface p-6 dark:border-slate-800"
                >
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {cs.client} · {cs.city} · {cs.category}
                    </p>
                    <p className="mt-3 font-display text-xl font-extrabold text-theme-accent">
                      {cs.metric}
                    </p>
                    <h3 className="mt-1.5 font-display text-base font-bold text-slate-950 dark:text-white">
                      {cs.headline}
                    </h3>
                    <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">Challenge: </span>
                      {cs.beforeState}
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">Solution: </span>
                      {cs.solution}
                    </p>
                  </div>

                  <blockquote className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <div className="flex items-start gap-2 text-xs italic text-slate-700 dark:text-slate-300">
                      <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span>{cs.testimonial}</span>
                    </div>
                    <footer className="mt-2 text-xs font-semibold text-slate-900 dark:text-white">
                      {cs.authorName} · <span className="font-normal text-slate-500">{cs.authorRole}</span>
                    </footer>
                  </blockquote>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* AI COMMAND STUDIO (VOICE + BRAND STUDIO + STRATEGY BRIEF) */}
      <AICommandStudio
        firebaseUser={firebaseUser}
        onRequireGoogleSignIn={onRequireGoogleSignIn}
        onPrefillConsult={handleAiPrefillConsult}
        onTrackClick={recordHeatmapClick}
      />

      {/* ACADEMY COURSES SECTION */}
      <section
        id="courses"
        onClick={(e) => recordHeatmapClick('academy', 'Academy Courses', e)}
        className="border-b border-slate-200/80 bg-theme-surface py-16 dark:border-slate-800/80 sm:py-20"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold tracking-wide text-theme-accent">
              Asif Digital Academy · Hands-On Cohorts
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              Practical Courses Built for Real Client &amp; Career Work
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300 sm:text-base">
              Learn directly from practitioners in Bahawalpur, Lahore, or live online labs. Every cohort centers on portfolio projects, code and design reviews, and freelance readiness.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {ACADEMY_COURSES.map((course) => (
              <article
                key={course.id}
                className="card-lift flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-theme-subtle hover-border-theme-accent dark:border-slate-800"
              >
                <div className="aspect-[4/3] w-full overflow-hidden bg-slate-200 dark:bg-slate-800">
                  {!brokenImages[course.id] ? (
                    <img
                      src={course.image}
                      alt={course.title}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={() => setBrokenImages((p) => ({ ...p, [course.id]: true }))}
                      className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center bg-theme-accent p-4 text-center text-white">
                      <GraduationCap className="h-8 w-8 text-amber-300" />
                      <span className="mt-2 font-display text-sm font-bold">{course.title}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col justify-between p-6">
                  <div>
                    <p className="text-xs font-medium text-theme-accent">
                      {course.track} · {course.duration} · {course.feePkr}
                    </p>
                    <h3 className="mt-2 font-display text-xl font-bold text-slate-950 dark:text-white">
                      {course.title}
                    </h3>
                    <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      {course.summary}
                    </p>

                    <ul className="mt-4 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                      {course.outcomes.slice(0, 2).map((outcome) => (
                        <li key={outcome} className="flex items-start gap-2">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                          <span>{outcome}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-6 flex items-center gap-2.5 border-t border-slate-200 pt-4 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() =>
                        prefillInquiry(
                          'course',
                          course.title,
                          `Enrolling for ${course.title} (${course.duration}).`,
                          course.feePkr
                        )
                      }
                      className="flex-1 whitespace-nowrap rounded-lg bg-theme-accent px-3.5 py-2 text-xs font-semibold text-white cursor-pointer"
                    >
                      Enroll Now
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedCourse(course)}
                      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-theme-surface px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>Syllabus</span>
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* FYP 7TH & 8TH SEMESTER MENTORING */}
      <section
        id="fyp"
        onClick={(e) => recordHeatmapClick('fyp', 'FYP Mentoring Track', e)}
        className="border-b border-slate-200/80 bg-theme-subtle py-16 dark:border-slate-800/80 sm:py-20"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold tracking-wide text-theme-accent">
                University Engineering Support
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                7th &amp; 8th Semester FYP Guidance &amp; Viva Readiness
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300 sm:text-base">
                No last-minute panic or black-box code. We mentor CS, SE, and IT students from proposal and IEEE SRS through full implementation and confident viva defense.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                prefillInquiry(
                  'fyp',
                  '7th Semester FYP Planning & SRS',
                  'University FYP inquiry — please share semester, domain, and submission deadline.'
                )
              }
              className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-theme-accent px-5 py-3 text-xs font-semibold text-white cursor-pointer"
            >
              <span>Book FYP Evaluation</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {FYP_TRACKS.map((track) => (
              <div
                key={track.semester}
                className="card-lift flex flex-col justify-between rounded-2xl border border-slate-200 bg-theme-surface p-6 dark:border-slate-800"
              >
                <div>
                  <p className="text-xs font-semibold tracking-wide text-theme-accent">
                    {track.semester}
                  </p>
                  <h3 className="mt-2 font-display text-xl font-bold text-slate-950 dark:text-white">
                    {track.title}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{track.hook}</p>

                  <ul className="mt-5 space-y-2.5 text-sm text-slate-700 dark:text-slate-300">
                    {track.deliverables.map((d) => (
                      <li key={d} className="flex items-start gap-2.5">
                        <Check className="mt-1 h-4 w-4 shrink-0 text-theme-accent" />
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => prefillInquiry('fyp', track.title, `Inquiry regarding ${track.semester}.`)}
                  className="mt-6 w-full whitespace-nowrap rounded-lg border border-slate-300 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Select {track.semester}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PROCESS & STUDIO OVERVIEW */}
      <section
        id="process"
        className="border-b border-slate-200/80 bg-theme-surface py-16 dark:border-slate-800/80 sm:py-20"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-10 lg:grid-cols-12">
            <div className="lg:col-span-6">
              <p className="text-xs font-semibold tracking-wide text-theme-accent">
                How We Deliver
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                Four Disciplined Steps From Brief to Revenue
              </h2>

              <div className="mt-8 grid gap-5 sm:grid-cols-2">
                {[
                  {
                    step: '01',
                    title: 'Consult',
                    text: 'Audit your offer, audience, or academic requirements in a focused discovery call.',
                  },
                  {
                    step: '02',
                    title: 'Plan',
                    text: 'Define deliverables, conversion architecture, A/B hypotheses, and milestone dates.',
                  },
                  {
                    step: '03',
                    title: 'Build',
                    text: 'Ship clean responsive code, storefronts, campaigns, or mentored student builds.',
                  },
                  {
                    step: '04',
                    title: 'Grow',
                    text: 'Monitor live heatmaps, nurture leads automatically, and optimize conversion ROI.',
                  },
                ].map((item) => (
                  <div
                    key={item.step}
                    className="rounded-xl border border-slate-200 bg-theme-subtle p-5 dark:border-slate-800"
                  >
                    <span className="font-mono-tabular text-xs font-bold text-theme-accent">
                      {item.step}
                    </span>
                    <h3 className="mt-1.5 font-display text-lg font-bold text-slate-950 dark:text-white">
                      {item.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-theme-subtle shadow-lg dark:border-slate-800">
                {!brokenImages['studio'] ? (
                  <img
                    src="/src/assets/images/agency_studio_showcase_1795586786666.jpg"
                    alt="Asif Digital Solutions studio workspace and analytics review"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() => setBrokenImages((p) => ({ ...p, studio: true }))}
                    className="aspect-[16/9] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[16/9] w-full items-center justify-center bg-theme-accent p-6 text-white">
                    <span className="font-display text-xl font-bold">Asif Digital Solutions Studio</span>
                  </div>
                )}
                <div className="grid gap-4 p-6 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
                      Bahawalpur Studio
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                      3 Marla Scheme, 100 Foota Road, near Family Park
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
                      Lahore Office
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                      Main Gulberg Road, Lahore
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HIGH-CONVERSION CONSULTATION & LIVE SLOT SCHEDULER */}
      <section
        id="contact"
        onClick={(e) => recordHeatmapClick('contact', 'Consultation Form', e)}
        className="bg-theme-subtle py-16 sm:py-20"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <p className="text-xs font-semibold tracking-wide text-theme-accent">
                Direct Consultation &amp; Admissions
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                Book a Strategy Slot or Course Seat
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300 sm:text-base">
                Every inquiry enters our encrypted CRM pipeline, reserves your selected call slot, and dispatches confirmation alerts. Works offline too — queued submissions auto-sync once back online.
              </p>

              <div className="mt-8 space-y-4 text-sm text-slate-700 dark:text-slate-300">
                <div className="flex items-start gap-3">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-theme-accent" />
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">Phone &amp; WhatsApp</p>
                    <a href="tel:+923006316551" className="hover:underline">
                      +92 300-6316551
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-theme-accent" />
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">Email</p>
                    <a href="mailto:asifriaz1297@gmail.com" className="hover:underline">
                      asifriaz1297@gmail.com
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-theme-accent" />
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">Locations</p>
                    <p>Bahawalpur (3 Marla Scheme, 100 Foota Rd) · Lahore (Main Gulberg Rd)</p>
                  </div>
                </div>
              </div>

              <div className="mt-8 border-t border-slate-200 pt-6 dark:border-slate-800">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Already submitted an inquiry or course application?
                </p>
                <button
                  type="button"
                  onClick={onOpenTracker}
                  className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-theme-surface px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Search className="h-3.5 w-3.5 text-theme-accent" />
                  <span>Check Live Inquiry Status</span>
                </button>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="rounded-2xl border border-slate-200 bg-theme-surface p-6 shadow-sm dark:border-slate-800 sm:p-8">
                {submittedLead ? (
                  <div className="space-y-5">
                    <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/40">
                      <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400" />
                      <div>
                        <h3 className="font-display text-lg font-bold text-emerald-950 dark:text-emerald-200">
                          {submittedLead.offlineQueued
                            ? 'Saved Offline — Will Auto-Sync When Online'
                            : 'Consultation Brief Confirmed'}
                        </h3>
                        <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">
                          Thank you, {submittedLead.name}. Reference ID:{' '}
                          <span className="font-mono-tabular font-bold">{submittedLead.id}</span> · Service:{' '}
                          <span className="font-semibold">{submittedLead.service}</span>
                        </p>
                        {submittedLead.preferredSlot && (
                          <p className="mt-1 text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                            Reserved Slot: {submittedLead.preferredSlot}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                      >
                        <MessageSquare className="h-4 w-4" />
                        <span>Continue on WhatsApp (+92 300-6316551)</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          setSubmittedLead(null);
                          setName('');
                          setPhone('');
                          setEmail('');
                          setNotes('');
                          setEstimatedBudget('');
                        }}
                        className="whitespace-nowrap rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        Submit Another Inquiry
                      </button>
                    </div>
                  </div>
                ) : (
                  <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
                    {estimatedBudget && (
                      <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                        <span>
                          Locked Scope Estimate: <strong className="font-mono-tabular">{estimatedBudget}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => setEstimatedBudget('')}
                          className="font-semibold underline cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="lead-name" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Full Name *
                        </label>
                        <input
                          id="lead-name"
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="e.g. Ayesha Khan"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                      </div>

                      <div>
                        <label htmlFor="lead-phone" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          WhatsApp / Phone *
                        </label>
                        <input
                          id="lead-phone"
                          type="tel"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="0300-1234567"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="lead-email" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Email Address (for syllabus &amp; confirmations)
                        </label>
                        <input
                          id="lead-email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@domain.com"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                      </div>

                      <div>
                        <label htmlFor="lead-category" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Track
                        </label>
                        <select
                          id="lead-category"
                          value={category}
                          onChange={(e) => {
                            const nextCat = e.target.value as 'agency' | 'course' | 'fyp';
                            setCategory(nextCat);
                            if (nextCat === 'agency') setService(AGENCY_SERVICES[0].title);
                            if (nextCat === 'course') setService(ACADEMY_COURSES[0].title);
                            if (nextCat === 'fyp') setService(FYP_TRACKS[0].title);
                          }}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        >
                          <option value="agency">Digital Agency Service</option>
                          <option value="course">Academy Course Admission</option>
                          <option value="fyp">7th / 8th Semester FYP Mentoring</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="lead-service" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Specific Service or Course
                      </label>
                      <select
                        id="lead-service"
                        value={service}
                        onChange={(e) => setService(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      >
                        {serviceOptionsForCategory.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Live Strategy Call Slot Picker */}
                    <div className="rounded-xl border border-slate-200 bg-theme-subtle p-4 dark:border-slate-800">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                          <Calendar className="h-3.5 w-3.5 text-theme-accent" />
                          <span>Reserve Discovery Call Slot</span>
                        </span>
                        <input
                          type="date"
                          aria-label="Consultation Date"
                          value={slotDate}
                          min={new Date().toISOString().slice(0, 10)}
                          onChange={(e) => setSlotDate(e.target.value)}
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {slots.map((slot) => (
                          <button
                            key={slot.key}
                            type="button"
                            disabled={!slot.available}
                            onClick={() => setSelectedSlotKey(slot.key)}
                            className={`whitespace-nowrap rounded-lg border px-2.5 py-2 text-[11px] font-semibold transition-colors ${
                              !slot.available
                                ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 line-through dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600'
                                : selectedSlotKey === slot.key
                                ? 'border-theme-accent bg-theme-accent text-white cursor-pointer'
                                : 'border-slate-300 bg-theme-surface text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer'
                            }`}
                          >
                            {slot.time}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label htmlFor="lead-notes" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Project Goals, Preferred Batch, or FYP Topic
                      </label>
                      <textarea
                        id="lead-notes"
                        rows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Share your timeline, campus/online preference, or business targets..."
                        className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>

                    <label className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={consentMarketing}
                        onChange={(e) => setConsentMarketing(e.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-theme"
                      />
                      <span>
                        I consent to automated email/WhatsApp follow-up sequences and CRM tracking in accordance with GDPR &amp; CCPA standards.
                      </span>
                    </label>

                    {formError && (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                        {formError}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <button
                        type="submit"
                        disabled={submitting}
                        className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-theme-accent px-6 py-3 text-sm font-semibold text-white disabled:opacity-60 cursor-pointer"
                      >
                        <span>{submitting ? 'Submitting...' : isOnline ? 'Submit Inquiry & Reserve' : 'Save Offline Inquiry'}</span>
                        <ArrowRight className="h-4 w-4" />
                      </button>

                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-300 px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <MessageSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <span>Direct WhatsApp</span>
                      </a>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-200 bg-theme-surface py-10 dark:border-slate-800">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 px-4 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div>
            <p className="font-display text-base font-bold text-slate-900 dark:text-white">
              Asif Digital Solutions
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Dream. Build. Grow. · Bahawalpur &amp; Lahore · +92 300-6316551 · asifriaz1297@gmail.com
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-5 text-xs font-medium text-slate-600 dark:text-slate-300">
            <a
              href="https://www.facebook.com/profile.php?id=61596604751947"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-theme-accent"
            >
              Facebook Page
            </a>
            <button type="button" onClick={onOpenTracker} className="hover:text-theme-accent cursor-pointer">
              Track Inquiry
            </button>
            <button type="button" onClick={onOpenPrivacy} className="hover:text-theme-accent cursor-pointer">
              GDPR / CCPA Portal
            </button>
            <button type="button" onClick={onOpenConsole} className="hover:text-theme-accent cursor-pointer">
              Admin Console
            </button>
          </div>
        </div>
      </footer>

      {/* COURSE SYLLABUS MODAL */}
      {selectedCourse && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="syllabus-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-theme-surface p-6 shadow-2xl dark:border-slate-800">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <p className="text-xs font-semibold text-theme-accent">
                  {selectedCourse.track} · {selectedCourse.duration} · {selectedCourse.feePkr}
                </p>
                <h3 id="syllabus-modal-title" className="mt-1 font-display text-xl font-bold text-slate-950 dark:text-white">
                  {selectedCourse.title}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close course syllabus"
                onClick={() => setSelectedCourse(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-5">
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {selectedCourse.summary}
              </p>

              <div>
                <h4 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
                  <Layers className="h-3.5 w-3.5" />
                  <span>Curriculum Modules</span>
                </h4>
                <ul className="mt-2.5 space-y-2 text-sm text-slate-800 dark:text-slate-200">
                  {selectedCourse.syllabus.map((mod) => (
                    <li
                      key={mod}
                      className="rounded-lg border border-slate-200 bg-theme-subtle px-3.5 py-2.5 dark:border-slate-800"
                    >
                      {mod}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
                  Delivery Format
                </h4>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{selectedCourse.format}</p>
              </div>

              <div className="flex items-center gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    const target = selectedCourse;
                    setSelectedCourse(null);
                    prefillInquiry(
                      'course',
                      target.title,
                      `Enrolling for ${target.title} (${target.duration}).`,
                      target.feePkr
                    );
                  }}
                  className="flex-1 rounded-lg bg-theme-accent px-4 py-2.5 text-xs font-semibold text-white cursor-pointer"
                >
                  Enroll in This Cohort
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCourse(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
