import {
  Activity,
  ArrowLeft,
  Bell,
  CheckCircle2,
  Download,
  FileSearch,
  Fingerprint,
  Flame,
  FlaskConical,
  KeyRound,
  LogOut,
  Mail,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  Users,
  Workflow,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ABExperiment,
  ActiveSessionInfo,
  AuditLogEntry,
  CaseStudyItem,
  CRMConfig,
  EmailTemplate,
  GDPRRequest,
  HeatmapPoint,
  LeadRecord,
  NotificationLogEntry,
  NurturingSequenceStep,
  PermissionKey,
  RoleName,
  StaffAccount,
  VulnerabilityCheck,
} from '../types';
import { QrCodeSvg } from './PrivacyAndAccessibilityModals';

interface AdminOverviewPayload {
  user: StaffAccount;
  kpis: {
    totalLeads: number;
    qualifiedOrEnrolled: number;
    conversionRatePct: number;
    heatmapClicks: number;
    activeSequences: number;
  };
  leads: LeadRecord[];
  abExperiment: ABExperiment;
  heatmapPoints: HeatmapPoint[];
  sequences: NurturingSequenceStep[];
  crmConfig: CRMConfig;
  staff: StaffAccount[];
  gdprRequests: GDPRRequest[];
  auditLogs: AuditLogEntry[];
  emailTemplates: EmailTemplate[];
  notificationLogs: NotificationLogEntry[];
  caseStudies: CaseStudyItem[];
  activeSessionsCount: number;
  securityPosture: VulnerabilityCheck[];
}

interface AdminConsoleProps {
  token: string;
  currentUser: StaffAccount;
  onUserUpdated: (user: StaffAccount) => void;
  onLogout: () => void;
  onBackPublic: () => void;
}

type ConsoleTab = 'overview' | 'ab' | 'heatmap' | 'crm' | 'rbac' | 'security' | 'compliance' | 'templates';

const ALL_PERMISSIONS: Array<{ key: PermissionKey; label: string }> = [
  { key: 'analytics:read', label: 'Analytics & Reports' },
  { key: 'leads:read', label: 'View Leads' },
  { key: 'leads:write', label: 'Edit Leads & Sequences' },
  { key: 'ab:manage', label: 'Manage A/B Tests' },
  { key: 'crm:sync', label: 'Sync CRM & Webhooks' },
  { key: 'gdpr:manage', label: 'Fulfill GDPR / CCPA' },
  { key: 'security:manage', label: 'Run Security Scans' },
  { key: 'rbac:manage', label: 'Manage Staff RBAC' },
  { key: 'templates:manage', label: 'Edit Templates & Showcase' },
];

const ROLES: RoleName[] = ['Super Admin', 'Agency Manager', 'Course Instructor', 'Growth Analyst', 'Client Viewer'];

function base64UrlToUint8Array(base64url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function computeZConfidence(nA: number, cA: number, nB: number, cB: number): string {
  if (nA < 10 || nB < 10) return 'Collecting sample';
  const pA = cA / nA;
  const pB = cB / nB;
  const pooled = (cA + cB) / (nA + nB);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / nA + 1 / nB));
  if (se === 0) return '0.0%';
  const z = Math.abs(pA - pB) / se;
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  const conf = (1 - 2 * prob) * 100;
  return `${Math.max(0, Math.min(99.9, conf)).toFixed(1)}% confidence`;
}

export function AdminConsole({
  token,
  currentUser,
  onUserUpdated,
  onLogout,
  onBackPublic,
}: AdminConsoleProps) {
  const [tab, setTab] = useState<ConsoleTab>('overview');
  const [data, setData] = useState<AdminOverviewPayload | null>(null);
  const [sessionsList, setSessionsList] = useState<ActiveSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [bannerMsg, setBannerMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // A/B state
  const [abWeightA, setAbWeightA] = useState<number>(50);
  const [headlineA, setHeadlineA] = useState('');
  const [ctaLabelA, setCtaLabelA] = useState('');
  const [headlineB, setHeadlineB] = useState('');
  const [ctaLabelB, setCtaLabelB] = useState('');

  // Heatmap filters
  const [heatmapSection, setHeatmapSection] = useState<HeatmapPoint['section']>('hero');
  const [heatmapDevice, setHeatmapDevice] = useState<'all' | 'desktop' | 'mobile'>('all');
  const [heatmapVariant, setHeatmapVariant] = useState<'all' | 'A' | 'B'>('all');

  // CRM & Lead states
  const [leadSearch, setLeadSearch] = useState('');
  const [leadStageFilter, setLeadStageFilter] = useState<string>('All');
  const [newLeadName, setNewLeadName] = useState('');
  const [newLeadPhone, setNewLeadPhone] = useState('');
  const [newLeadEmail, setNewLeadEmail] = useState('');
  const [newLeadService, setNewLeadService] = useState('High-Conversion Website Design');
  const [crmProvider, setCrmProvider] = useState<CRMConfig['provider']>('HubSpot');
  const [crmWebhook, setCrmWebhook] = useState('');
  const [crmAutoSync, setCrmAutoSync] = useState(true);
  const [crmLiveDispatch, setCrmLiveDispatch] = useState(false);

  // RBAC invite form
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<RoleName>('Agency Manager');

  // Case study publish form
  const [csClient, setCsClient] = useState('');
  const [csHeadline, setCsHeadline] = useState('');
  const [csMetric, setCsMetric] = useState('');
  const [csCity, setCsCity] = useState('Bahawalpur');
  const [csCategory, setCsCategory] = useState<'Agency' | 'FYP' | 'Academy'>('Agency');

  // Audit search
  const [auditSearch, setAuditSearch] = useState('');

  // 2FA setup states
  const [twoFaSetupMethod, setTwoFaSetupMethod] = useState<'totp' | 'sms' | null>(null);
  const [totpSetupSecret, setTotpSetupSecret] = useState('');
  const [totpSetupUri, setTotpSetupUri] = useState('');
  const [smsSetupHint, setSmsSetupHint] = useState('');
  const [twoFaVerifyCode, setTwoFaVerifyCode] = useState('');

  // Template editor state
  const [editingTemplateId, setEditingTemplateId] = useState<string>('tpl-1');
  const [tplSubject, setTplSubject] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [tplEnabled, setTplEnabled] = useState(true);

  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );

  const heatmapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const can = useCallback(
    (perm: PermissionKey) => currentUser.role === 'Super Admin' || currentUser.permissions.includes(perm),
    [currentUser]
  );

  const authedFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const res = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options.headers || {}),
        },
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || `Request failed (${res.status})`);
      }
      return json;
    },
    [token]
  );

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const [payload, sessRes] = await Promise.all([
        authedFetch('/api/admin/overview') as Promise<AdminOverviewPayload>,
        authedFetch('/api/admin/sessions') as Promise<{ sessions: ActiveSessionInfo[] }>,
      ]);
      setData(payload);
      setSessionsList(sessRes.sessions || []);
      setAbWeightA(payload.abExperiment.variants.A.weight);
      setHeadlineA(payload.abExperiment.variants.A.headline);
      setCtaLabelA(payload.abExperiment.variants.A.ctaLabel);
      setHeadlineB(payload.abExperiment.variants.B.headline);
      setCtaLabelB(payload.abExperiment.variants.B.ctaLabel);
      setCrmProvider(payload.crmConfig.provider);
      setCrmWebhook(payload.crmConfig.webhookUrl);
      setCrmAutoSync(payload.crmConfig.autoSync);
      onUserUpdated(payload.user);

      const activeTpl = payload.emailTemplates.find((t) => t.id === editingTemplateId) || payload.emailTemplates[0];
      if (activeTpl) {
        setEditingTemplateId(activeTpl.id);
        setTplSubject(activeTpl.subject);
        setTplBody(activeTpl.body);
        setTplEnabled(activeTpl.enabled);
      }
    } catch (err) {
      setBannerMsg({ type: 'err', text: err instanceof Error ? err.message : 'Failed loading dashboard data.' });
    } finally {
      setLoading(false);
    }
  }, [authedFetch, editingTemplateId, onUserUpdated]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const filteredHeatmapPoints = useMemo(() => {
    if (!data) return [];
    return data.heatmapPoints.filter((p) => {
      if (p.section !== heatmapSection) return false;
      if (heatmapDevice !== 'all' && p.device !== heatmapDevice) return false;
      if (heatmapVariant !== 'all' && p.variant !== heatmapVariant) return false;
      return true;
    });
  }, [data, heatmapSection, heatmapDevice, heatmapVariant]);

  useEffect(() => {
    if (tab !== 'heatmap') return;
    const canvas = heatmapCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= w; gx += 60) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }
    for (let gy = 0; gy <= h; gy += 45) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }

    for (const pt of filteredHeatmapPoints) {
      const cx = (pt.xPct / 100) * w;
      const cy = (pt.yPct / 100) * h;
      const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 46);
      grad.addColorStop(0, 'rgba(239, 68, 68, 0.72)');
      grad.addColorStop(0.45, 'rgba(245, 158, 11, 0.42)');
      grad.addColorStop(0.8, 'rgba(59, 130, 246, 0.16)');
      grad.addColorStop(1, 'rgba(59, 130, 246, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, 46, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [tab, filteredHeatmapPoints]);

  const showNotice = (type: 'ok' | 'err', text: string) => {
    setBannerMsg({ type, text });
  };

  const handleExportReport = (format: 'csv' | 'json') => {
    if (!data) return;
    let content = '';
    let mime = 'application/json';
    let ext = 'json';
    if (format === 'json') {
      content = JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          kpis: data.kpis,
          abExperiment: data.abExperiment,
          leads: data.leads,
        },
        null,
        2
      );
    } else {
      mime = 'text/csv;charset=utf-8;';
      ext = 'csv';
      const header = ['ID', 'Name', 'Phone', 'Email', 'Category', 'Service', 'Stage', 'Slot', 'Estimate', 'Variant', 'SequenceStep', 'CRMSynced', 'CreatedAt'];
      const rows = data.leads.map((l) =>
        [
          l.id,
          l.name,
          l.phone,
          l.email,
          l.category,
          l.service,
          l.stage,
          l.preferredSlot || '',
          l.estimatedBudget || '',
          l.sourceVariant,
          l.sequenceStep,
          l.crmSynced,
          l.createdAt,
        ]
          .map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`)
          .join(',')
      );
      content = [header.join(','), ...rows].join('\n');
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `asif-digital-report-${new Date().toISOString().slice(0, 10)}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showNotice('ok', `Exported ${format.toUpperCase()} performance report.`);
  };

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await authedFetch('/api/admin/leads', {
        method: 'POST',
        body: JSON.stringify({
          name: newLeadName,
          phone: newLeadPhone,
          email: newLeadEmail,
          service: newLeadService,
        }),
      });
      setNewLeadName('');
      setNewLeadPhone('');
      setNewLeadEmail('');
      await loadOverview();
      showNotice('ok', 'Added new lead to CRM.');
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Could not add lead.');
    }
  };

  const handleUpdateLead = async (leadId: string, patch: { stage?: string; advanceSequence?: boolean }) => {
    try {
      await authedFetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      await loadOverview();
      showNotice('ok', 'Lead pipeline updated.');
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Failed updating lead.');
    }
  };

  const handleDeleteLead = async (leadId: string) => {
    try {
      await authedFetch(`/api/admin/leads/${leadId}`, { method: 'DELETE' });
      await loadOverview();
      showNotice('ok', 'Lead removed from CRM.');
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Failed deleting lead.');
    }
  };

  const handleUpdateAB = async (payload: Record<string, unknown>) => {
    try {
      await authedFetch('/api/admin/ab-experiment', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      await loadOverview();
      showNotice('ok', 'A/B experiment updated.');
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Failed updating A/B test.');
    }
  };

  const handleCrmSync = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await authedFetch('/api/admin/crm/sync', {
        method: 'POST',
        body: JSON.stringify({
          provider: crmProvider,
          webhookUrl: crmWebhook,
          autoSync: crmAutoSync,
          liveDispatch: crmLiveDispatch,
        }),
      });
      await loadOverview();
      showNotice('ok', `CRM sync complete (${res.newlySynced} synced). ${res.webhookStatus || ''}`);
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'CRM sync failed.');
    }
  };

  const handleInviteStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await authedFetch('/api/admin/staff', {
        method: 'POST',
        body: JSON.stringify({ name: newStaffName, email: newStaffEmail, role: newStaffRole }),
      });
      setNewStaffName('');
      setNewStaffEmail('');
      await loadOverview();
      showNotice('ok', 'Added team member profile.');
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Could not add staff.');
    }
  };

  const handleStaffUpdate = async (staffId: string, patch: Partial<StaffAccount>) => {
    try {
      await authedFetch(`/api/admin/staff/${staffId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      await loadOverview();
      showNotice('ok', 'Role & permissions updated.');
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Failed updating permissions.');
    }
  };

  const handleDeleteStaff = async (staffId: string) => {
    try {
      await authedFetch(`/api/admin/staff/${staffId}`, { method: 'DELETE' });
      await loadOverview();
      showNotice('ok', 'Team profile removed.');
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Could not remove staff.');
    }
  };

  const handleRevokeSession = async (sidPrefix: string) => {
    try {
      await authedFetch(`/api/admin/sessions/${sidPrefix}`, { method: 'DELETE' });
      await loadOverview();
      showNotice('ok', 'Session revoked.');
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Failed revoking session.');
    }
  };

  const handleAddCaseStudy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await authedFetch('/api/admin/showcase', {
        method: 'POST',
        body: JSON.stringify({
          client: csClient,
          headline: csHeadline,
          metric: csMetric,
          city: csCity,
          category: csCategory,
        }),
      });
      setCsClient('');
      setCsHeadline('');
      setCsMetric('');
      await loadOverview();
      showNotice('ok', 'Published new case study to public landing.');
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Could not publish case study.');
    }
  };

  const handleDeleteCaseStudy = async (id: string) => {
    try {
      await authedFetch(`/api/admin/showcase/${id}`, { method: 'DELETE' });
      await loadOverview();
      showNotice('ok', 'Case study removed.');
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Could not delete case study.');
    }
  };

  const handleStart2FASetup = async (method: 'totp' | 'sms') => {
    try {
      const res = await authedFetch('/api/admin/security/2fa/init', {
        method: 'POST',
        body: JSON.stringify({ method }),
      });
      setTwoFaSetupMethod(method);
      setTwoFaVerifyCode('');
      if (method === 'totp') {
        setTotpSetupSecret(res.secret);
        setTotpSetupUri(res.otpauthUri);
        setSmsSetupHint('');
      } else {
        setSmsSetupHint(res.smsPreviewHint || 'SMS code dispatched.');
        setTotpSetupSecret('');
        setTotpSetupUri('');
      }
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Could not initiate 2FA.');
    }
  };

  const handleConfirm2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFaSetupMethod) return;
    try {
      await authedFetch('/api/admin/security/2fa/confirm', {
        method: 'POST',
        body: JSON.stringify({ method: twoFaSetupMethod, code: twoFaVerifyCode }),
      });
      setTwoFaSetupMethod(null);
      setTwoFaVerifyCode('');
      await loadOverview();
      showNotice('ok', `${twoFaSetupMethod.toUpperCase()} two-factor authentication is now active.`);
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Invalid verification code.');
    }
  };

  const handleDisable2FA = async () => {
    try {
      await authedFetch('/api/admin/security/2fa/disable', { method: 'POST' });
      setTwoFaSetupMethod(null);
      await loadOverview();
      showNotice('ok', 'Two-factor authentication disabled.');
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Could not disable 2FA.');
    }
  };

  const handleEnrollBiometric = async () => {
    if (!window.PublicKeyCredential || !navigator.credentials) {
      showNotice('err', 'WebAuthn passkeys are not supported in this browser environment.');
      return;
    }
    try {
      const opts = await authedFetch('/api/auth/webauthn/register-options', { method: 'POST' });
      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge: base64UrlToUint8Array(opts.challenge) as BufferSource,
          rp: { name: opts.rp.name },
          user: {
            id: base64UrlToUint8Array(opts.user.id) as BufferSource,
            name: opts.user.name,
            displayName: opts.user.displayName,
          },
          pubKeyCredParams: [
            { alg: -7, type: 'public-key' },
            { alg: -257, type: 'public-key' },
          ],
          authenticatorSelection: { userVerification: 'preferred' },
          timeout: 60000,
        },
      })) as PublicKeyCredential | null;

      if (!cred) {
        showNotice('err', 'Biometric enrollment cancelled.');
        return;
      }

      await authedFetch('/api/auth/webauthn/register', {
        method: 'POST',
        body: JSON.stringify({ credentialId: cred.id }),
      });
      await loadOverview();
      showNotice('ok', 'Biometric passkey enrolled successfully.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.toLowerCase().includes('feature') || msg.toLowerCase().includes('notallowed')) {
        showNotice(
          'err',
          'Browser or iframe sandbox policy blocked WebAuthn passkey creation. Open in a top-level HTTPS tab to enroll TouchID/FaceID.'
        );
      } else {
        showNotice('err', 'Biometric registration failed.');
      }
    }
  };

  const handleEnablePushNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      showNotice('err', 'Push notifications are unavailable in this browser.');
      return;
    }
    const perm = await Notification.requestPermission();
    setPushPermission(perm);
    if (perm === 'granted') {
      new Notification('Asif Digital Security Alerts Active', {
        body: `Real-time login & lead alerts enabled for ${currentUser.name}.`,
        icon: '/pwa-192x192.png',
      });
      showNotice('ok', 'Browser push notifications enabled.');
    } else {
      showNotice('err', 'Notification permission was denied by browser.');
    }
  };

  const handleFulfillGdpr = async (id: string) => {
    try {
      await authedFetch(`/api/admin/gdpr/${id}/fulfill`, { method: 'POST' });
      await loadOverview();
      showNotice('ok', 'Privacy request marked completed and audited.');
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Failed fulfilling request.');
    }
  };

  const handleSecurityScan = async () => {
    try {
      await authedFetch('/api/admin/security/scan', { method: 'POST' });
      await loadOverview();
      showNotice('ok', 'Vulnerability posture scan completed.');
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Scan failed.');
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await authedFetch(`/api/admin/templates/${editingTemplateId}`, {
        method: 'PATCH',
        body: JSON.stringify({ subject: tplSubject, body: tplBody, enabled: tplEnabled }),
      });
      await loadOverview();
      showNotice('ok', 'Notification template saved.');
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Failed saving template.');
    }
  };

  const handleTestTemplate = async () => {
    try {
      await authedFetch(`/api/admin/templates/${editingTemplateId}/test`, { method: 'POST' });
      await loadOverview();
      showNotice('ok', `Test email dispatched to ${currentUser.email}.`);
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Test send failed.');
    }
  };

  const navTabs: Array<{ id: ConsoleTab; label: string; icon: typeof Activity }> = [
    { id: 'overview', label: 'Overview & Showcase', icon: Activity },
    { id: 'ab', label: 'A/B Testing Lab', icon: FlaskConical },
    { id: 'heatmap', label: 'User Heatmaps', icon: Flame },
    { id: 'crm', label: 'CRM & Nurturing', icon: Workflow },
    { id: 'rbac', label: 'RBAC & Team', icon: Users },
    { id: 'security', label: '2FA, Passkeys & Sessions', icon: KeyRound },
    { id: 'compliance', label: 'GDPR & Audit Logs', icon: ShieldCheck },
    { id: 'templates', label: 'Email & Push Alerts', icon: Mail },
  ];

  const filteredLeads = useMemo(() => {
    if (!data) return [];
    const q = leadSearch.trim().toLowerCase();
    return data.leads.filter((l) => {
      if (leadStageFilter !== 'All' && l.stage !== leadStageFilter) return false;
      if (!q) return true;
      return (
        l.name.toLowerCase().includes(q) ||
        l.service.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        l.phone.toLowerCase().includes(q)
      );
    });
  }, [data, leadSearch, leadStageFilter]);

  const filteredAudits = useMemo(() => {
    if (!data) return [];
    const q = auditSearch.trim().toLowerCase();
    if (!q) return data.auditLogs;
    return data.auditLogs.filter(
      (a) =>
        a.actor.toLowerCase().includes(q) ||
        a.action.toLowerCase().includes(q) ||
        a.detail.toLowerCase().includes(q)
    );
  }, [data, auditSearch]);

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center text-sm text-slate-600 dark:text-slate-300">
        Loading secured console telemetry...
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-112px)] bg-theme-canvas">
      <div className="mx-auto flex max-w-7xl flex-col lg:flex-row">
        {/* Desktop Sidebar */}
        <aside className="w-full shrink-0 border-b border-slate-200 bg-theme-surface p-4 dark:border-slate-800 lg:min-h-[calc(100vh-112px)] lg:w-64 lg:border-b-0 lg:border-r lg:p-5">
          <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
            <div>
              <p className="font-display text-sm font-bold text-slate-950 dark:text-white">{currentUser.name}</p>
              <p className="text-xs text-theme-accent">{currentUser.role}</p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              title="Sign Out"
              aria-label="Sign Out"
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>

          <nav aria-label="Admin Console Sections" className="flex gap-1.5 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {navTabs.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'bg-theme-accent text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-6 hidden border-t border-slate-200 pt-4 dark:border-slate-800 lg:block">
            <button
              type="button"
              onClick={onBackPublic}
              className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Public Landing View</span>
            </button>
          </div>
        </aside>

        {/* Main Workspace */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Asif Digital Console / {navTabs.find((t) => t.id === tab)?.label}
              </p>
              <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
                {navTabs.find((t) => t.id === tab)?.label}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={loadOverview}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-theme-surface px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Refresh</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportReport('csv')}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-theme-surface px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {bannerMsg && (
            <div
              className={`mb-6 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-medium ${
                bannerMsg.type === 'ok'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200'
                  : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200'
              }`}
            >
              <span>{bannerMsg.text}</span>
              <button type="button" onClick={() => setBannerMsg(null)} className="underline cursor-pointer">
                Dismiss
              </button>
            </div>
          )}

          {data && tab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="space-y-6"
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: 'Total Inquiries & Enrollments', val: String(data.kpis.totalLeads), sub: `${data.kpis.activeSequences} active nurturing` },
                  { label: 'Qualified & Enrolled', val: String(data.kpis.qualifiedOrEnrolled), sub: 'Agency, Academy & FYP' },
                  { label: 'Blended A/B Conversion Rate', val: `${data.kpis.conversionRatePct}%`, sub: `${data.abExperiment.status}` },
                  { label: 'Heatmap Click Coordinates', val: String(data.kpis.heatmapClicks), sub: `${data.activeSessionsCount} active session(s)` },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="card-lift rounded-xl border border-slate-200 bg-theme-surface p-5 dark:border-slate-800"
                  >
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{kpi.label}</p>
                    <p className="mt-2 font-display text-3xl font-extrabold text-slate-950 font-mono-tabular dark:text-white">
                      {kpi.val}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{kpi.sub}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-theme-surface p-6 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-base font-bold text-slate-950 dark:text-white">
                      Pipeline Distribution by Stage
                    </h2>
                    <button
                      type="button"
                      onClick={() => handleExportReport('json')}
                      className="text-xs font-semibold text-theme-accent hover:underline cursor-pointer"
                    >
                      Download JSON
                    </button>
                  </div>
                  <div className="mt-5 space-y-3">
                    {(['New', 'Nurturing', 'Qualified', 'Enrolled', 'Closed'] as const).map((stage) => {
                      const count = data.leads.filter((l) => l.stage === stage).length;
                      const pct = data.leads.length ? Math.round((count / data.leads.length) * 100) : 0;
                      return (
                        <div key={stage} className="space-y-1">
                          <div className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                            <span>{stage}</span>
                            <span className="font-mono-tabular">
                              {count} ({pct}%)
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div
                              className="h-full rounded-full bg-theme-accent"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Publish New Case Study to Public Showcase */}
                <form
                  onSubmit={handleAddCaseStudy}
                  className="space-y-3 rounded-xl border border-slate-200 bg-theme-surface p-6 dark:border-slate-800"
                >
                  <h2 className="font-display text-base font-bold text-slate-950 dark:text-white">
                    Publish Case Study to Public Website
                  </h2>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <input
                      type="text"
                      required
                      value={csClient}
                      onChange={(e) => setCsClient(e.target.value)}
                      placeholder="Client name"
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <input
                      type="text"
                      value={csCity}
                      onChange={(e) => setCsCity(e.target.value)}
                      placeholder="City"
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <select
                      aria-label="Case study category"
                      value={csCategory}
                      onChange={(e) => setCsCategory(e.target.value as 'Agency' | 'FYP' | 'Academy')}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      <option value="Agency">Agency</option>
                      <option value="FYP">FYP</option>
                      <option value="Academy">Academy</option>
                    </select>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      type="text"
                      required
                      value={csHeadline}
                      onChange={(e) => setCsHeadline(e.target.value)}
                      placeholder="Project headline"
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <input
                      type="text"
                      required
                      value={csMetric}
                      onChange={(e) => setCsMetric(e.target.value)}
                      placeholder="Metric (e.g. +140% Leads)"
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!can('templates:manage')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-theme-accent px-3.5 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Publish Case Study</span>
                  </button>

                  <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
                    <p className="mb-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      Active Public Case Studies ({data.caseStudies.length})
                    </p>
                    <div className="space-y-1.5">
                      {data.caseStudies.map((cs) => (
                        <div key={cs.id} className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
                          <span className="truncate">
                            <strong>{cs.client}</strong> · {cs.metric}
                          </span>
                          <button
                            type="button"
                            disabled={!can('templates:manage')}
                            onClick={() => handleDeleteCaseStudy(cs.id)}
                            aria-label={`Remove ${cs.client}`}
                            className="p-1 text-rose-600 hover:text-rose-700 disabled:opacity-40 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </form>
              </div>
            </motion.div>
          )}

          {data && tab === 'ab' && (
            <motion.div
              key="ab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="space-y-6"
            >
              <div className="rounded-xl border border-slate-200 bg-theme-surface p-6 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-lg font-bold text-slate-950 dark:text-white">
                      {data.abExperiment.name}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Status: <span className="font-semibold">{data.abExperiment.status}</span> · Statistical Confidence:{' '}
                      <span className="font-semibold text-theme-accent">
                        {computeZConfidence(
                          data.abExperiment.variants.A.impressions,
                          data.abExperiment.variants.A.conversions,
                          data.abExperiment.variants.B.impressions,
                          data.abExperiment.variants.B.conversions
                        )}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!can('ab:manage')}
                      onClick={() => handleUpdateAB({ resetMetrics: true })}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      Reset Metrics
                    </button>
                    {data.abExperiment.winner && (
                      <button
                        type="button"
                        disabled={!can('ab:manage')}
                        onClick={() => handleUpdateAB({ winner: null, weightA: 50 })}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        Resume 50/50 Split
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-6 grid gap-5 lg:grid-cols-2">
                  {(['A', 'B'] as const).map((key) => {
                    const v = data.abExperiment.variants[key];
                    const cr = v.impressions > 0 ? ((v.conversions / v.impressions) * 100).toFixed(2) : '0.00';
                    const isWinner = data.abExperiment.winner === key;
                    return (
                      <div
                        key={key}
                        className={`rounded-xl border p-5 ${
                          isWinner
                            ? 'border-emerald-500 bg-emerald-50/40 dark:border-emerald-600 dark:bg-emerald-950/20'
                            : 'border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold tracking-wide text-theme-accent">
                            {v.name}
                          </span>
                          <span className="font-mono-tabular text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Weight: {v.weight}%
                          </span>
                        </div>

                        <div className="mt-3 space-y-2">
                          <input
                            type="text"
                            aria-label={`Headline ${key}`}
                            disabled={!can('ab:manage')}
                            value={key === 'A' ? headlineA : headlineB}
                            onChange={(e) => (key === 'A' ? setHeadlineA(e.target.value) : setHeadlineB(e.target.value))}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-display text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          />
                          <input
                            type="text"
                            aria-label={`CTA Label ${key}`}
                            disabled={!can('ab:manage')}
                            value={key === 'A' ? ctaLabelA : ctaLabelB}
                            onChange={(e) => (key === 'A' ? setCtaLabelA(e.target.value) : setCtaLabelB(e.target.value))}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                          />
                        </div>

                        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                          <div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">Impressions</p>
                            <p className="font-mono-tabular text-lg font-bold text-slate-950 dark:text-white">{v.impressions}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">Conversions</p>
                            <p className="font-mono-tabular text-lg font-bold text-slate-950 dark:text-white">{v.conversions}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">Conv. Rate</p>
                            <p className="font-mono-tabular text-lg font-bold text-emerald-700 dark:text-emerald-400">{cr}%</p>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={!can('ab:manage')}
                          onClick={() => handleUpdateAB({ winner: key })}
                          className="mt-4 w-full rounded-lg border border-slate-300 bg-white py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          {isWinner ? `Active Winner (100% Traffic)` : `Promote Variant ${key} to Winner`}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-5 dark:border-slate-800">
                  <div className="flex flex-1 flex-col gap-2">
                    <label htmlFor="ab-slider" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Traffic Split Allocation: Variant A ({abWeightA}%) / Variant B ({100 - abWeightA}%)
                    </label>
                    <input
                      id="ab-slider"
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      disabled={!can('ab:manage')}
                      value={abWeightA}
                      onChange={(e) => setAbWeightA(Number(e.target.value))}
                      className="w-full accent-theme"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!can('ab:manage')}
                    onClick={() =>
                      handleUpdateAB({
                        weightA: abWeightA,
                        winner: null,
                        headlineA,
                        ctaLabelA,
                        headlineB,
                        ctaLabelB,
                      })
                    }
                    className="rounded-lg bg-theme-accent px-4 py-2.5 text-xs font-semibold text-white transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Save Copy &amp; Traffic Split
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {data && tab === 'heatmap' && (
            <motion.div
              key="heatmap"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="space-y-6"
            >
              <div className="rounded-xl border border-slate-200 bg-theme-surface p-6 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap gap-2">
                    {(['hero', 'services', 'academy', 'fyp', 'contact'] as const).map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => setHeatmapSection(sec)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize cursor-pointer ${
                          heatmapSection === sec
                            ? 'bg-theme-accent text-white'
                            : 'border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                      >
                        {sec}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <select
                      aria-label="Filter heatmap device"
                      value={heatmapDevice}
                      onChange={(e) => setHeatmapDevice(e.target.value as 'all' | 'desktop' | 'mobile')}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      <option value="all">All Devices</option>
                      <option value="desktop">Desktop</option>
                      <option value="mobile">Mobile</option>
                    </select>
                    <select
                      aria-label="Filter heatmap variant"
                      value={heatmapVariant}
                      onChange={(e) => setHeatmapVariant(e.target.value as 'all' | 'A' | 'B')}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      <option value="all">Variants A &amp; B</option>
                      <option value="A">Variant A</option>
                      <option value="B">Variant B</option>
                    </select>
                  </div>
                </div>

                <div className="mt-5 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 p-3">
                  <canvas
                    ref={heatmapCanvasRef}
                    width={780}
                    height={360}
                    className="h-auto w-full rounded-lg"
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Showing <span className="font-mono-tabular font-semibold">{filteredHeatmapPoints.length}</span> captured click events on section &ldquo;{heatmapSection}&rdquo;.
                </p>

                <div className="mt-5 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <tr>
                        <th className="py-2 pr-4">Target Label</th>
                        <th className="py-2 pr-4">Coordinates</th>
                        <th className="py-2 pr-4">Device</th>
                        <th className="py-2 pr-4">Variant</th>
                        <th className="py-2">Captured</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredHeatmapPoints.slice(0, 12).map((pt) => (
                        <tr key={pt.id} className="text-slate-700 dark:text-slate-300">
                          <td className="py-2 pr-4 font-medium">{pt.label}</td>
                          <td className="py-2 pr-4 font-mono-tabular">
                            {pt.xPct}%, {pt.yPct}%
                          </td>
                          <td className="py-2 pr-4 capitalize">{pt.device}</td>
                          <td className="py-2 pr-4">Variant {pt.variant}</td>
                          <td className="py-2 text-slate-500">{new Date(pt.timestamp).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {data && tab === 'crm' && (
            <motion.div
              key="crm"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="space-y-6"
            >
              {/* CRM Webhook Config & Live Dispatch */}
              <form
                onSubmit={handleCrmSync}
                className="rounded-xl border border-slate-200 bg-theme-surface p-6 dark:border-slate-800"
              >
                <h2 className="font-display text-base font-bold text-slate-950 dark:text-white">
                  CRM Integration &amp; Webhook Pipeline
                </h2>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div>
                    <label htmlFor="crm-provider" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      CRM Provider
                    </label>
                    <select
                      id="crm-provider"
                      value={crmProvider}
                      onChange={(e) => setCrmProvider(e.target.value as CRMConfig['provider'])}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      <option value="HubSpot">HubSpot</option>
                      <option value="Zoho CRM">Zoho CRM</option>
                      <option value="Custom Webhook">Custom Webhook</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor="crm-webhook" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Public HTTPS Endpoint (SSRF Protected)
                    </label>
                    <input
                      id="crm-webhook"
                      type="url"
                      value={crmWebhook}
                      onChange={(e) => setCrmWebhook(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={crmAutoSync}
                        onChange={(e) => setCrmAutoSync(e.target.checked)}
                        className="h-4 w-4 accent-theme"
                      />
                      <span>Auto-sync new qualified leads</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={crmLiveDispatch}
                        onChange={(e) => setCrmLiveDispatch(e.target.checked)}
                        className="h-4 w-4 accent-theme"
                      />
                      <span>Send live HTTP POST to webhook</span>
                    </label>
                  </div>
                  <button
                    type="submit"
                    disabled={!can('crm:sync')}
                    className="rounded-lg bg-theme-accent px-4 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Save &amp; Sync Contacts
                  </button>
                </div>
              </form>

              {/* Manual Lead Creation */}
              <form
                onSubmit={handleAddLead}
                className="rounded-xl border border-slate-200 bg-theme-surface p-6 dark:border-slate-800"
              >
                <h2 className="font-display text-base font-bold text-slate-950 dark:text-white">
                  Add Walk-In or Phone Lead Manually
                </h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  <input
                    type="text"
                    required
                    value={newLeadName}
                    onChange={(e) => setNewLeadName(e.target.value)}
                    placeholder="Client name *"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <input
                    type="tel"
                    required
                    value={newLeadPhone}
                    onChange={(e) => setNewLeadPhone(e.target.value)}
                    placeholder="Phone / WhatsApp *"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <input
                    type="email"
                    value={newLeadEmail}
                    onChange={(e) => setNewLeadEmail(e.target.value)}
                    placeholder="Email (optional)"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    value={newLeadService}
                    onChange={(e) => setNewLeadService(e.target.value)}
                    placeholder="Service / Course"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!can('leads:write')}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Lead to Pipeline</span>
                </button>
              </form>

              {/* 3-Step Nurturing Sequence */}
              <div className="rounded-xl border border-slate-200 bg-theme-surface p-6 dark:border-slate-800">
                <h2 className="font-display text-base font-bold text-slate-950 dark:text-white">
                  Automated Lead Nurturing Sequence
                </h2>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  {data.sequences.map((seq) => (
                    <div key={seq.step} className="rounded-lg border border-slate-200 bg-theme-subtle p-4 dark:border-slate-800">
                      <p className="text-xs font-semibold text-theme-accent">
                        Step {seq.step} · {seq.delayLabel} · {seq.channel}
                      </p>
                      <p className="mt-1.5 text-sm font-bold text-slate-900 dark:text-white">{seq.subject}</p>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{seq.summary}</p>
                      <p className="mt-3 font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
                        {seq.sentCount} sent · {seq.openRatePct}% open rate
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Leads Table */}
              <div className="rounded-xl border border-slate-200 bg-theme-surface p-6 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-base font-bold text-slate-950 dark:text-white">
                    Captured Leads &amp; Enrollments ({filteredLeads.length})
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="search"
                      value={leadSearch}
                      onChange={(e) => setLeadSearch(e.target.value)}
                      placeholder="Search name, phone, service..."
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <select
                      aria-label="Filter leads by stage"
                      value={leadStageFilter}
                      onChange={(e) => setLeadStageFilter(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      <option value="All">All Stages</option>
                      <option value="New">New</option>
                      <option value="Nurturing">Nurturing</option>
                      <option value="Qualified">Qualified</option>
                      <option value="Enrolled">Enrolled</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <tr>
                        <th className="py-2.5 pr-4">Lead</th>
                        <th className="py-2.5 pr-4">Service &amp; Slot</th>
                        <th className="py-2.5 pr-4">Stage</th>
                        <th className="py-2.5 pr-4">Nurture Step</th>
                        <th className="py-2.5">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredLeads.map((lead) => (
                        <tr key={lead.id} className="text-slate-700 dark:text-slate-300">
                          <td className="py-3 pr-4">
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {lead.name} <span className="font-mono-tabular font-normal text-slate-400">({lead.id})</span>
                            </p>
                            <p className="text-[11px] text-slate-500">{lead.phone} · {lead.email || 'No email'}</p>
                          </td>
                          <td className="py-3 pr-4">
                            <p className="font-medium">{lead.service}</p>
                            <p className="text-[11px] text-slate-500">
                              Variant {lead.sourceVariant}
                              {lead.preferredSlot ? ` · Slot: ${lead.preferredSlot}` : ''}
                              {lead.estimatedBudget ? ` · ${lead.estimatedBudget}` : ''}
                            </p>
                          </td>
                          <td className="py-3 pr-4">
                            <select
                              aria-label={`Change stage for ${lead.name}`}
                              disabled={!can('leads:write')}
                              value={lead.stage}
                              onChange={(e) => handleUpdateLead(lead.id, { stage: e.target.value })}
                              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            >
                              {['New', 'Nurturing', 'Qualified', 'Enrolled', 'Closed'].map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 pr-4 font-mono-tabular">
                            Step {lead.sequenceStep}/3 · {lead.sequenceStatus}
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={!can('leads:write') || lead.sequenceStep >= 3}
                                onClick={() => handleUpdateLead(lead.id, { advanceSequence: true })}
                                className="rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                              >
                                Advance
                              </button>
                              <button
                                type="button"
                                disabled={!can('leads:write')}
                                onClick={() => handleDeleteLead(lead.id)}
                                aria-label={`Delete ${lead.name}`}
                                className="rounded-md p-1 text-rose-600 hover:bg-rose-50 disabled:opacity-40 dark:hover:bg-rose-950/40 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {data && tab === 'rbac' && (
            <motion.div
              key="rbac"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="space-y-4"
            >
              {/* Invite New Staff Form */}
              <form
                onSubmit={handleInviteStaff}
                className="rounded-xl border border-slate-200 bg-theme-surface p-5 dark:border-slate-800"
              >
                <h2 className="font-display text-base font-bold text-slate-950 dark:text-white">
                  Add Team Member &amp; Assign Role
                </h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  <input
                    type="text"
                    required
                    value={newStaffName}
                    onChange={(e) => setNewStaffName(e.target.value)}
                    placeholder="Full name"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <input
                    type="email"
                    required
                    value={newStaffEmail}
                    onChange={(e) => setNewStaffEmail(e.target.value)}
                    placeholder="team@asifdigital.pk"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <select
                    aria-label="New team member role"
                    value={newStaffRole}
                    onChange={(e) => setNewStaffRole(e.target.value as RoleName)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={!can('rbac:manage')}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-theme-accent px-3 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Staff</span>
                  </button>
                </div>
              </form>

              {data.staff.map((member) => (
                <div
                  key={member.id}
                  className="rounded-xl border border-slate-200 bg-theme-surface p-5 dark:border-slate-800"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
                    <div>
                      <p className="font-display text-base font-bold text-slate-950 dark:text-white">{member.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {member.email} · 2FA: {member.twoFactorEnabled ? member.twoFactorMethod.toUpperCase() : 'Off'} · Passkey:{' '}
                        {member.biometricEnabled ? 'Enrolled' : 'None'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        aria-label={`Role for ${member.name}`}
                        disabled={!can('rbac:manage')}
                        value={member.role}
                        onChange={(e) => handleStaffUpdate(member.id, { role: e.target.value as RoleName })}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      {member.id !== currentUser.id && (
                        <>
                          <button
                            type="button"
                            disabled={!can('rbac:manage')}
                            onClick={() => handleStaffUpdate(member.id, { active: !member.active })}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                              member.active
                                ? 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400'
                                : 'border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-400'
                            }`}
                          >
                            {member.active ? 'Active' : 'Suspended'}
                          </button>
                          <button
                            type="button"
                            disabled={!can('rbac:manage')}
                            onClick={() => handleDeleteStaff(member.id)}
                            aria-label={`Remove ${member.name}`}
                            className="rounded-lg border border-slate-200 p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-rose-950/40 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {ALL_PERMISSIONS.map((perm) => {
                      const has = member.role === 'Super Admin' || member.permissions.includes(perm.key);
                      return (
                        <label
                          key={perm.key}
                          className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            disabled={!can('rbac:manage') || member.role === 'Super Admin'}
                            checked={has}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...member.permissions, perm.key]
                                : member.permissions.filter((p) => p !== perm.key);
                              handleStaffUpdate(member.id, { permissions: next });
                            }}
                            className="h-4 w-4 accent-theme"
                          />
                          <span>{perm.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {data && tab === 'security' && (
            <motion.div
              key="security"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="space-y-6"
            >
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Two-Factor Authentication Card */}
                <div className="rounded-xl border border-slate-200 bg-theme-surface p-6 dark:border-slate-800">
                  <h2 className="font-display text-base font-bold text-slate-950 dark:text-white">
                    Two-Factor Authentication (TOTP &amp; SMS)
                  </h2>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    Current status:{' '}
                    <span className="font-semibold text-theme-accent">
                      {currentUser.twoFactorEnabled
                        ? `Protected via ${currentUser.twoFactorMethod.toUpperCase()}`
                        : 'Not configured'}
                    </span>
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleStart2FASetup('totp')}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-theme-accent px-3.5 py-2 text-xs font-semibold text-white transition-colors cursor-pointer"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      <span>Configure Authenticator App</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStart2FASetup('sms')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Smartphone className="h-3.5 w-3.5" />
                      <span>Configure SMS OTP</span>
                    </button>
                    {currentUser.twoFactorEnabled && (
                      <button
                        type="button"
                        onClick={handleDisable2FA}
                        className="rounded-lg border border-rose-300 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 cursor-pointer"
                      >
                        Disable 2FA
                      </button>
                    )}
                  </div>

                  {twoFaSetupMethod === 'totp' && totpSetupUri && (
                    <form onSubmit={handleConfirm2FA} className="mt-5 space-y-4 border-t border-slate-200 pt-4 dark:border-slate-800">
                      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                        <QrCodeSvg value={totpSetupUri} size={140} />
                        <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                          <p className="font-semibold text-slate-900 dark:text-white">
                            Scan with Google Authenticator or Authy
                          </p>
                          <p>
                            Manual Key:{' '}
                            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono-tabular text-slate-900 dark:bg-slate-800 dark:text-white">
                              {totpSetupSecret}
                            </code>
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          required
                          value={twoFaVerifyCode}
                          onChange={(e) => setTwoFaVerifyCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="Enter 6-digit code"
                          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                        <button
                          type="submit"
                          className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                        >
                          Activate
                        </button>
                      </div>
                    </form>
                  )}

                  {twoFaSetupMethod === 'sms' && (
                    <form onSubmit={handleConfirm2FA} className="mt-5 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                        {smsSetupHint}
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          required
                          value={twoFaVerifyCode}
                          onChange={(e) => setTwoFaVerifyCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="Enter SMS 6-digit code"
                          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                        <button
                          type="submit"
                          className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                        >
                          Verify SMS
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {/* Biometric Passkey + Real-Time Login Push Alerts */}
                <div className="space-y-6">
                  <div className="rounded-xl border border-slate-200 bg-theme-surface p-6 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <Fingerprint className="h-5 w-5 text-theme-accent" />
                      <h2 className="font-display text-base font-bold text-slate-950 dark:text-white">
                        Biometric Passkey (WebAuthn)
                      </h2>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      Bind Touch ID, Face ID, or Windows Hello hardware passkeys for passwordless sign-in. Status:{' '}
                      <span className="font-semibold">
                        {currentUser.biometricEnabled ? 'Passkey Enrolled' : 'Not enrolled'}
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={handleEnrollBiometric}
                      className="mt-4 rounded-lg border border-slate-300 bg-theme-subtle px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Enroll Device Biometric Passkey
                    </button>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-theme-surface p-6 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <Bell className="h-5 w-5 text-theme-accent" />
                      <h2 className="font-display text-base font-bold text-slate-950 dark:text-white">
                        Instant Login Push Notifications
                      </h2>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      Receive real-time desktop/mobile browser push alerts whenever an account sign-in or high-priority lead occurs. Permission:{' '}
                      <span className="font-semibold capitalize">{pushPermission}</span>
                    </p>
                    <button
                      type="button"
                      onClick={handleEnablePushNotifications}
                      className="mt-4 rounded-lg bg-theme-accent px-4 py-2 text-xs font-semibold text-white transition-colors cursor-pointer"
                    >
                      Enable &amp; Test Push Alert
                    </button>
                  </div>
                </div>
              </div>

              {/* Active Sessions List & Revocation */}
              <div className="rounded-xl border border-slate-200 bg-theme-surface p-6 dark:border-slate-800">
                <h2 className="font-display text-base font-bold text-slate-950 dark:text-white">
                  Active Console Sessions ({sessionsList.length})
                </h2>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <tr>
                        <th className="py-2 pr-4">Account</th>
                        <th className="py-2 pr-4">Device Agent</th>
                        <th className="py-2 pr-4">Signed In</th>
                        <th className="py-2">Control</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {sessionsList.map((sess) => (
                        <tr key={sess.sidPrefix} className="text-slate-700 dark:text-slate-300">
                          <td className="py-2.5 pr-4 font-medium">
                            {sess.email} ({sess.role})
                          </td>
                          <td className="py-2.5 pr-4 text-slate-500">{sess.device}</td>
                          <td className="py-2.5 pr-4 font-mono-tabular">
                            {new Date(sess.createdAt).toLocaleString()}
                          </td>
                          <td className="py-2.5">
                            {sess.isCurrent ? (
                              <span className="font-semibold text-emerald-700 dark:text-emerald-400">Current Session</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleRevokeSession(sess.sidPrefix)}
                                className="rounded border border-rose-300 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 cursor-pointer"
                              >
                                Revoke
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {data && tab === 'compliance' && (
            <motion.div
              key="compliance"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="space-y-6"
            >
              <div className="rounded-xl border border-slate-200 bg-theme-surface p-6 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-base font-bold text-slate-950 dark:text-white">
                      Security Vulnerability Assessment
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Live verification of hashing, session storage, SSRF protection, HTTP headers, and privacy SLAs.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!can('security:manage')}
                    onClick={handleSecurityScan}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-theme-accent px-4 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <ShieldAlert className="h-3.5 w-3.5" />
                    <span>Run Security Scan</span>
                  </button>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {data.securityPosture.map((chk) => (
                    <div
                      key={chk.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">{chk.control}</span>
                        <span
                          className={`text-xs font-semibold ${
                            chk.severity === 'Pass'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {chk.severity}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{chk.finding}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{chk.remediation}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-theme-surface p-6 dark:border-slate-800">
                <h2 className="font-display text-base font-bold text-slate-950 dark:text-white">
                  GDPR &amp; CCPA Data Subject Requests
                </h2>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <tr>
                        <th className="py-2 pr-4">Email</th>
                        <th className="py-2 pr-4">Request Type</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {data.gdprRequests.map((req) => (
                        <tr key={req.id} className="text-slate-700 dark:text-slate-300">
                          <td className="py-2.5 pr-4 font-medium">{req.email}</td>
                          <td className="py-2.5 pr-4">{req.type}</td>
                          <td className="py-2.5 pr-4">
                            <span
                              className={
                                req.status === 'Completed'
                                  ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                                  : 'font-semibold text-amber-700 dark:text-amber-400'
                              }
                            >
                              {req.status}
                            </span>
                          </td>
                          <td className="py-2.5">
                            {req.status === 'Pending' ? (
                              <button
                                type="button"
                                disabled={!can('gdpr:manage')}
                                onClick={() => handleFulfillGdpr(req.id)}
                                className="rounded-md bg-theme-accent px-2.5 py-1 text-[11px] font-semibold text-white transition-colors disabled:opacity-50 cursor-pointer"
                              >
                                Fulfill Request
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Fulfilled
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-theme-surface p-6 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <FileSearch className="h-4 w-4 text-theme-accent" />
                    <h2 className="font-display text-base font-bold text-slate-950 dark:text-white">
                      Immutable Security &amp; Operations Audit Log
                    </h2>
                  </div>
                  <input
                    type="search"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="Filter actor or event..."
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <tr>
                        <th className="py-2 pr-4">Timestamp</th>
                        <th className="py-2 pr-4">Actor</th>
                        <th className="py-2 pr-4">Action</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredAudits.slice(0, 20).map((log) => (
                        <tr key={log.id} className="text-slate-700 dark:text-slate-300">
                          <td className="py-2 pr-4 font-mono-tabular whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                          <td className="py-2 pr-4 font-medium">{log.actor}</td>
                          <td className="py-2 pr-4 font-mono-tabular">{log.action}</td>
                          <td className="py-2 pr-4">{log.status}</td>
                          <td className="py-2 text-slate-500 dark:text-slate-400">{log.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {data && tab === 'templates' && (
            <motion.div
              key="templates"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="grid gap-6 lg:grid-cols-12"
            >
              <form
                onSubmit={handleSaveTemplate}
                className="space-y-4 rounded-xl border border-slate-200 bg-theme-surface p-6 dark:border-slate-800 lg:col-span-7"
              >
                <h2 className="font-display text-base font-bold text-slate-950 dark:text-white">
                  Automated Email &amp; Alert Template Editor
                </h2>

                <div>
                  <label htmlFor="tpl-select" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Select Template
                  </label>
                  <select
                    id="tpl-select"
                    value={editingTemplateId}
                    onChange={(e) => {
                      const next = data.emailTemplates.find((t) => t.id === e.target.value);
                      setEditingTemplateId(e.target.value);
                      if (next) {
                        setTplSubject(next.subject);
                        setTplBody(next.body);
                        setTplEnabled(next.enabled);
                      }
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    {data.emailTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.key})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="tpl-subject" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Subject Line
                  </label>
                  <input
                    id="tpl-subject"
                    type="text"
                    value={tplSubject}
                    onChange={(e) => setTplSubject(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label htmlFor="tpl-body" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Message Body (supports {'{{name}}'}, {'{{service}}'}, {'{{timestamp}}'}, {'{{code}}'})
                  </label>
                  <textarea
                    id="tpl-body"
                    rows={6}
                    value={tplBody}
                    onChange={(e) => setTplBody(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tplEnabled}
                    onChange={(e) => setTplEnabled(e.target.checked)}
                    className="h-4 w-4 accent-theme"
                  />
                  <span>Template active for automated triggers</span>
                </label>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={!can('templates:manage')}
                    className="rounded-lg bg-theme-accent px-4 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Save Template
                  </button>
                  <button
                    type="button"
                    disabled={!can('templates:manage')}
                    onClick={handleTestTemplate}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Send Test Dispatch
                  </button>
                </div>
              </form>

              <div className="rounded-xl border border-slate-200 bg-theme-surface p-6 dark:border-slate-800 lg:col-span-5">
                <h2 className="font-display text-base font-bold text-slate-950 dark:text-white">
                  Real-Time Email, SMS &amp; Push Feed
                </h2>
                <div className="mt-4 space-y-3">
                  {data.notificationLogs.slice(0, 10).map((log) => (
                    <div
                      key={log.id}
                      className="rounded-lg border border-slate-200 bg-theme-subtle p-3 dark:border-slate-800"
                    >
                      <div className="flex items-center justify-between text-[11px] font-semibold text-theme-accent">
                        <span>{log.channel} · {log.status}</span>
                        <span className="font-normal text-slate-500">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-bold text-slate-900 dark:text-white">{log.subject}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">To: {log.recipient}</p>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{log.preview}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
}
