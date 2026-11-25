import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, LiveServerMessage, Modality, ThinkingLevel, Type } from '@google/genai';
import { WebSocket, WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes('429') || lower.includes('resource_exhausted') || lower.includes('quota')) {
    return {
      status: 429,
      message:
        'Quota exceeded or paid-tier API key required for this model. Select a billing-enabled key in Settings > Secrets and try again.',
    };
  }
  if (lower.includes('403') || lower.includes('permission_denied') || lower.includes('api_key_invalid')) {
    return {
      status: 403,
      message: 'API key permission error. Please check your GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  return { status: 500, message: msg || 'AI generation failed.' };
}

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(__dirname, '.data');
const STORE_PATH = path.resolve(DATA_DIR, 'store.json');

// Session secret kept strictly in server memory fallback if SESSION_SECRET env is absent
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

type RoleName = 'Super Admin' | 'Agency Manager' | 'Course Instructor' | 'Growth Analyst' | 'Client Viewer';

interface StaffRecord {
  id: string;
  name: string;
  email: string;
  role: RoleName;
  permissions: string[];
  twoFactorEnabled: boolean;
  twoFactorMethod: 'totp' | 'sms' | 'none';
  totpSecret: string;
  biometricEnabled: boolean;
  credentialIds: string[];
  lastLoginAt: string | null;
  active: boolean;
}

interface StoreShape {
  adminHash: string | null;
  adminSalt: string | null;
  staff: StaffRecord[];
  leads: any[];
  abExperiment: any;
  heatmapPoints: any[];
  sequences: any[];
  crmConfig: any;
  gdprRequests: any[];
  auditLogs: any[];
  emailTemplates: any[];
  notificationLogs: any[];
  caseStudies: any[];
}

function base32Encode(buf: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(str: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = alphabet.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function computeTOTP(secretBase32: string, stepOffset = 0): string {
  const key = base32Decode(secretBase32);
  const epoch = Math.floor(Date.now() / 1000 / 30) + stepOffset;
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(epoch / 0x100000000), 0);
  msg.writeUInt32BE(epoch >>> 0, 4);
  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    1000000;
  return String(code).padStart(6, '0');
}

function verifyTOTP(secretBase32: string, token: string): boolean {
  const clean = String(token || '').trim();
  if (!/^\d{6}$/.test(clean)) return false;
  for (let offset = -1; offset <= 1; offset++) {
    if (computeTOTP(secretBase32, offset) === clean) return true;
  }
  return false;
}

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, s, 64).toString('hex');
  return { hash: derived, salt: s };
}

function verifyPasswordHash(password: string, hash: string, salt: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const target = Buffer.from(hash, 'hex');
  if (derived.length !== target.length) return false;
  return crypto.timingSafeEqual(derived, target);
}

function isSafeWebhookUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      host.endsWith('.local') ||
      host === '169.254.169.254'
    ) {
      return false;
    }
    if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function createInitialStore(): StoreShape {
  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600 * 1000).toISOString();

  return {
    adminHash: null,
    adminSalt: null,
    staff: [
      {
        id: 'usr-asif',
        name: 'Asif Riaz',
        email: 'asifriaz1297@gmail.com',
        role: 'Super Admin',
        permissions: [
          'analytics:read',
          'leads:read',
          'leads:write',
          'ab:manage',
          'crm:sync',
          'gdpr:manage',
          'security:manage',
          'rbac:manage',
          'templates:manage',
        ],
        twoFactorEnabled: false,
        twoFactorMethod: 'none',
        totpSecret: base32Encode(crypto.randomBytes(20)),
        biometricEnabled: false,
        credentialIds: [],
        lastLoginAt: hoursAgo(2),
        active: true,
      },
      {
        id: 'usr-manager',
        name: 'Hamza Tariq',
        email: 'hamza@asifdigital.pk',
        role: 'Agency Manager',
        permissions: ['analytics:read', 'leads:read', 'leads:write', 'ab:manage', 'crm:sync', 'templates:manage'],
        twoFactorEnabled: true,
        twoFactorMethod: 'totp',
        totpSecret: base32Encode(crypto.randomBytes(20)),
        biometricEnabled: true,
        credentialIds: ['passkey-demo-manager'],
        lastLoginAt: hoursAgo(5),
        active: true,
      },
      {
        id: 'usr-instructor',
        name: 'Sana Mahmood',
        email: 'academy@asifdigital.pk',
        role: 'Course Instructor',
        permissions: ['analytics:read', 'leads:read', 'leads:write'],
        twoFactorEnabled: true,
        twoFactorMethod: 'sms',
        totpSecret: base32Encode(crypto.randomBytes(20)),
        biometricEnabled: false,
        credentialIds: [],
        lastLoginAt: hoursAgo(18),
        active: true,
      },
      {
        id: 'usr-analyst',
        name: 'Bilal Qureshi',
        email: 'analytics@asifdigital.pk',
        role: 'Growth Analyst',
        permissions: ['analytics:read', 'leads:read', 'ab:manage'],
        twoFactorEnabled: true,
        twoFactorMethod: 'totp',
        totpSecret: base32Encode(crypto.randomBytes(20)),
        biometricEnabled: false,
        credentialIds: [],
        lastLoginAt: hoursAgo(30),
        active: true,
      },
    ],
    leads: [
      {
        id: 'ld-1001',
        name: 'Zainab Fatima',
        phone: '0301-7429100',
        email: 'zainab.fatima@pkbrand.com',
        service: 'E-Commerce Brand Launch',
        category: 'agency',
        notes: 'Launching a modest apparel brand in Lahore with Shopify + Meta ads.',
        stage: 'Qualified',
        sourceVariant: 'B',
        consentMarketing: true,
        sequenceStep: 2,
        sequenceStatus: 'Active',
        crmSynced: true,
        createdAt: hoursAgo(42),
        updatedAt: hoursAgo(6),
      },
      {
        id: 'ld-1002',
        name: 'Usman Khalid',
        phone: '0321-8841209',
        email: 'usman.khalid@iub.edu.pk',
        service: '7th Semester FYP Planning & SRS',
        category: 'fyp',
        notes: 'Need IEEE SRS and system architecture for an AI Medical Triage project.',
        stage: 'Enrolled',
        sourceVariant: 'A',
        consentMarketing: true,
        sequenceStep: 3,
        sequenceStatus: 'Completed',
        crmSynced: true,
        createdAt: hoursAgo(70),
        updatedAt: hoursAgo(12),
      },
      {
        id: 'ld-1003',
        name: 'Ayesha Siddiqui',
        phone: '0333-4490122',
        email: 'ayesha.s@studio.pk',
        service: 'Python Master Class',
        category: 'course',
        notes: 'Interested in weekend Lahore cohort for FastAPI & automation.',
        stage: 'Nurturing',
        sourceVariant: 'B',
        consentMarketing: true,
        sequenceStep: 1,
        sequenceStatus: 'Active',
        crmSynced: true,
        createdAt: hoursAgo(14),
        updatedAt: hoursAgo(4),
      },
      {
        id: 'ld-1004',
        name: 'Muhammad Haris',
        phone: '0345-6120987',
        email: 'haris@bahawalpurtraders.pk',
        service: 'Website Design & Local SEO',
        category: 'agency',
        notes: 'Need corporate website and Google Business Profile optimization.',
        stage: 'New',
        sourceVariant: 'A',
        consentMarketing: true,
        sequenceStep: 1,
        sequenceStatus: 'Active',
        crmSynced: false,
        createdAt: hoursAgo(3),
        updatedAt: hoursAgo(3),
      },
      {
        id: 'ld-1005',
        name: 'Hira Nawaz',
        phone: '0312-9053341',
        email: 'hira.nawaz@ucp.edu.pk',
        service: 'AI Content Creation',
        category: 'course',
        notes: 'Want to learn structured prompting and video script workflows.',
        stage: 'Enrolled',
        sourceVariant: 'B',
        consentMarketing: true,
        sequenceStep: 3,
        sequenceStatus: 'Completed',
        crmSynced: true,
        createdAt: hoursAgo(96),
        updatedAt: hoursAgo(24),
      },
    ],
    abExperiment: {
      id: 'exp-hero-01',
      name: 'Hero Value Proposition & Conversion Split',
      status: 'Running',
      winner: null,
      variants: {
        A: {
          variant: 'A',
          name: 'Variant A · Brand Narrative',
          headline: 'Dream it. Build it. Grow it.',
          subheadline:
            'Asif Digital Solutions helps Pakistani businesses, founders, and university builders launch high-converting websites, stores, campaigns, and technical skills under one dedicated partner.',
          ctaLabel: 'Book a Free Consultation',
          impressions: 1240,
          conversions: 78,
          weight: 50,
        },
        B: {
          variant: 'B',
          name: 'Variant B · ROI & Lead Engine',
          headline: 'High-converting digital engines built to scale revenue.',
          subheadline:
            'From custom web platforms, Shopify launches, and Meta/Google ad funnels to Python, Graphic Design, and FYP mentoring — measurable outcomes backed by live analytics.',
          ctaLabel: 'Start Your Growth Audit',
          impressions: 1218,
          conversions: 104,
          weight: 50,
        },
      },
    },
    heatmapPoints: [
      { id: 'hm-1', section: 'hero', xPct: 24, yPct: 72, device: 'desktop', variant: 'B', label: 'Hero Primary CTA', timestamp: hoursAgo(2) },
      { id: 'hm-2', section: 'hero', xPct: 26, yPct: 70, device: 'desktop', variant: 'A', label: 'Hero Primary CTA', timestamp: hoursAgo(2) },
      { id: 'hm-3', section: 'hero', xPct: 44, yPct: 73, device: 'desktop', variant: 'B', label: 'Explore Courses CTA', timestamp: hoursAgo(3) },
      { id: 'hm-4', section: 'services', xPct: 32, yPct: 42, device: 'desktop', variant: 'B', label: 'E-Commerce Setup', timestamp: hoursAgo(4) },
      { id: 'hm-5', section: 'services', xPct: 68, yPct: 64, device: 'desktop', variant: 'A', label: 'Meta Ads Card', timestamp: hoursAgo(5) },
      { id: 'hm-6', section: 'academy', xPct: 50, yPct: 55, device: 'desktop', variant: 'B', label: 'Python Master Class', timestamp: hoursAgo(1) },
      { id: 'hm-7', section: 'academy', xPct: 22, yPct: 48, device: 'mobile', variant: 'A', label: 'Graphic Design Enroll', timestamp: hoursAgo(1) },
      { id: 'hm-8', section: 'fyp', xPct: 30, yPct: 60, device: 'desktop', variant: 'B', label: '7th Semester SRS', timestamp: hoursAgo(6) },
      { id: 'hm-9', section: 'contact', xPct: 72, yPct: 82, device: 'desktop', variant: 'B', label: 'Submit Consultation', timestamp: hoursAgo(1) },
      { id: 'hm-10', section: 'contact', xPct: 68, yPct: 80, device: 'mobile', variant: 'A', label: 'WhatsApp Direct', timestamp: hoursAgo(2) },
    ],
    sequences: [
      {
        step: 1,
        delayLabel: 'Instant (0 min)',
        channel: 'Email',
        subject: 'Welcome to Asif Digital Solutions — Next Steps & Consultation Brief',
        summary: 'Sends personalized acknowledgment, office locations, and discovery checklist.',
        sentCount: 312,
        openRatePct: 74.2,
      },
      {
        step: 2,
        delayLabel: 'Day 2 (+48 hrs)',
        channel: 'WhatsApp Brief',
        subject: 'Case Study & Custom Scope Estimate for {{service}}',
        summary: 'Delivers relevant Bahawalpur/Lahore portfolio case studies and timeline options.',
        sentCount: 248,
        openRatePct: 86.5,
      },
      {
        step: 3,
        delayLabel: 'Day 5 (+120 hrs)',
        channel: 'Email',
        subject: 'Reserved Slot: 20-Minute Strategy Call with Asif Riaz',
        summary: 'Automated booking nudge with syllabus/roadmap attachment and direct calendar link.',
        sentCount: 184,
        openRatePct: 61.8,
      },
    ],
    crmConfig: {
      provider: 'HubSpot',
      webhookUrl: 'https://api.hubapi.com/crm/v3/objects/contacts',
      autoSync: true,
      lastSyncAt: hoursAgo(1),
      syncedCount: 412,
    },
    gdprRequests: [
      {
        id: 'gdpr-01',
        email: 'tariq.mehmood@example.pk',
        type: 'Export Data',
        status: 'Completed',
        requestedAt: hoursAgo(48),
        completedAt: hoursAgo(44),
      },
      {
        id: 'gdpr-02',
        email: 'sadia.khan@example.pk',
        type: 'Do Not Sell (CCPA)',
        status: 'Pending',
        requestedAt: hoursAgo(4),
        completedAt: null,
      },
    ],
    auditLogs: [
      {
        id: 'aud-1',
        timestamp: hoursAgo(1),
        actor: 'Hamza Tariq',
        role: 'Agency Manager',
        action: 'CRM_BATCH_SYNC',
        target: 'HubSpot Pipeline',
        status: 'Success',
        detail: 'Synchronized 14 qualified leads with consent flag verified.',
      },
      {
        id: 'aud-2',
        timestamp: hoursAgo(3),
        actor: 'System Automation',
        role: 'Automated Engine',
        action: 'EMAIL_NURTURE_DISPATCH',
        target: 'Lead #ld-1004',
        status: 'Success',
        detail: 'Step 1 welcome template sent to haris@bahawalpurtraders.pk.',
      },
      {
        id: 'aud-3',
        timestamp: hoursAgo(6),
        actor: 'Bilal Qureshi',
        role: 'Growth Analyst',
        action: 'AB_TRAFFIC_SPLIT_CHECK',
        target: 'exp-hero-01',
        status: 'Success',
        detail: 'Reviewed 50/50 split confidence metrics (Variant B +34% conversion lift).',
      },
    ],
    emailTemplates: [
      {
        id: 'tpl-1',
        key: 'welcome_lead',
        name: 'Automated Lead Welcome',
        subject: 'Assalamualaikum {{name}} — Your {{service}} Inquiry at Asif Digital Solutions',
        body:
          'Hi {{name}},\n\nThank you for contacting Asif Digital Solutions regarding {{service}}. Our team in Bahawalpur & Lahore has received your project brief and enrolled your request for priority review.\n\nDirect WhatsApp: +92 300-6316551\nWarm regards,\nAsif Riaz & Team',
        enabled: true,
        updatedAt: hoursAgo(24),
      },
      {
        id: 'tpl-2',
        key: 'course_enrollment',
        name: 'Academy Course Enrollment',
        subject: 'Enrollment Received: {{service}} — Syllabus & Batch Details',
        body:
          'Welcome {{name}},\n\nYour seat inquiry for {{service}} has been registered. Our admissions coordinator will confirm your batch schedule and lab access shortly.\n\nAsif Digital Academy',
        enabled: true,
        updatedAt: hoursAgo(24),
      },
      {
        id: 'tpl-3',
        key: 'login_alert',
        name: 'Real-Time Login Security Alert',
        subject: 'Security Alert: New Sign-In to Asif Digital Console',
        body:
          'Hello {{name}},\n\nA new sign-in occurred at {{timestamp}} using {{method}}. If this was not you, revoke active sessions immediately inside the Security Dashboard.',
        enabled: true,
        updatedAt: hoursAgo(24),
      },
      {
        id: 'tpl-4',
        key: 'two_factor_code',
        name: 'Two-Factor Authentication Code',
        subject: 'Your Verification Code: {{code}}',
        body:
          'Hello {{name}},\n\nUse verification code {{code}} to complete your two-factor sign-in. This code expires in 5 minutes.',
        enabled: true,
        updatedAt: hoursAgo(24),
      },
    ],
    notificationLogs: [
      {
        id: 'not-1',
        channel: 'Email',
        recipient: 'haris@bahawalpurtraders.pk',
        subject: 'Assalamualaikum Muhammad Haris — Your Website Design & Local SEO Inquiry',
        preview: 'Automated Step 1 Welcome template delivered on lead submission.',
        status: 'Delivered',
        timestamp: hoursAgo(3),
      },
      {
        id: 'not-2',
        channel: 'Push',
        recipient: 'asifriaz1297@gmail.com',
        subject: 'New Qualified Lead Alert: Zainab Fatima',
        preview: 'E-Commerce Brand Launch inquiry captured via Hero Variant B.',
        status: 'Delivered',
        timestamp: hoursAgo(6),
      },
    ],
    caseStudies: [
      {
        id: 'cs-1',
        client: 'Noor Apparel Studio',
        city: 'Lahore',
        category: 'Agency',
        headline: 'Custom Shopify Storefront & Meta CAPI Funnel',
        metric: '+165% Online Orders in 90 Days',
        beforeState: 'Manual Instagram DM orders with high cart drop-off and zero pixel attribution.',
        solution: 'Built fast mobile checkout with JazzCash/COD flows, UGC video hooks, and automated WhatsApp follow-ups.',
        testimonial: 'Asif Digital transformed our weekend DMs into a predictable daily order pipeline.',
        authorName: 'Zainab Fatima',
        authorRole: 'Founder, Noor Apparel',
      },
      {
        id: 'cs-2',
        client: 'IUB Computer Science Cohort',
        city: 'Bahawalpur',
        category: 'FYP',
        headline: 'AI Triage & Medical Imaging Final Year Project',
        metric: 'A+ External Viva Distinction',
        beforeState: '7th semester group lacked IEEE SRS structure and struggled to connect Python models to a web UI.',
        solution: 'Guided system architecture, FastAPI inference endpoints, React dashboard, and 3 mock viva reviews.',
        testimonial: 'Every team member understood every line of code before our final external defense.',
        authorName: 'Usman Khalid',
        authorRole: 'BSCS Graduate, Bahawalpur',
      },
      {
        id: 'cs-3',
        client: 'Bahawalpur Agro Exports',
        city: 'Bahawalpur',
        category: 'Agency',
        headline: 'B2B Search Architecture & Local SEO Authority',
        metric: '3.4x Qualified Wholesale Inquiries',
        beforeState: 'Outdated static brochure site invisible on Google Search and Google Business Maps.',
        solution: 'Rebuilt responsive web portal with structured Schema.org SEO, CRM lead routing, and A/B tested inquiry copy.',
        testimonial: 'We now receive direct buyer inquiries every week without relying solely on cold calls.',
        authorName: 'Tariq Mehmood',
        authorRole: 'Managing Partner',
      },
    ],
  };
}

function loadStore(): StoreShape {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as StoreShape;
      if (!Array.isArray(parsed.caseStudies)) {
        parsed.caseStudies = createInitialStore().caseStudies;
        saveStore(parsed);
      }
      return parsed;
    }
  } catch (err) {
    console.error('Failed loading store, initializing fresh store:', err);
  }
  const fresh = createInitialStore();
  saveStore(fresh);
  return fresh;
}

function saveStore(store: StoreShape): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

const store = loadStore();

// In-memory active session registry, pending 2FA challenges, SMS OTPs, and WebAuthn challenges
interface SessionEntry {
  userId: string;
  email: string;
  role: RoleName;
  createdAt: number;
  expiresAt: number;
  device: string;
}

const sessions = new Map<string, SessionEntry>();
const pendingTwoFactor = new Map<string, { userId: string; smsCode: string | null; expiresAt: number }>();
const webauthnChallenges = new Map<string, { challenge: string; userId?: string; expiresAt: number }>();
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(bucketKey: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateBuckets.get(bucketKey);
  if (!entry || entry.resetAt < now) {
    rateBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count += 1;
  return true;
}

function signToken(payload: string): string {
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function createSessionToken(staff: StaffRecord, device: string): string {
  const sid = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  sessions.set(sid, {
    userId: staff.id,
    email: staff.email,
    role: staff.role,
    createdAt: now,
    expiresAt: now + 12 * 3600 * 1000,
    device,
  });
  return signToken(sid);
}

function verifyBearerToken(authHeader?: string): { session: SessionEntry; staff: StaffRecord } | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const raw = authHeader.slice(7).trim();
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const sid = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(sid).digest('hex');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const entry = sessions.get(sid);
  if (!entry || entry.expiresAt < Date.now()) {
    sessions.delete(sid);
    return null;
  }
  const staff = store.staff.find((s) => s.id === entry.userId && s.active);
  if (!staff) return null;
  return { session: entry, staff };
}

function sanitizeStaff(s: StaffRecord) {
  return {
    id: s.id,
    name: s.name,
    email: s.email,
    role: s.role,
    permissions: s.permissions,
    twoFactorEnabled: s.twoFactorEnabled,
    twoFactorMethod: s.twoFactorMethod,
    biometricEnabled: s.biometricEnabled,
    lastLoginAt: s.lastLoginAt,
    active: s.active,
  };
}

function appendAudit(actor: string, role: string, action: string, target: string, status: 'Success' | 'Warning' | 'Blocked', detail: string) {
  store.auditLogs.unshift({
    id: `aud-${crypto.randomBytes(4).toString('hex')}`,
    timestamp: new Date().toISOString(),
    actor,
    role,
    action,
    target,
    status,
    detail,
  });
  if (store.auditLogs.length > 150) store.auditLogs = store.auditLogs.slice(0, 150);
  saveStore(store);
}

function dispatchNotification(channel: 'Email' | 'SMS' | 'Push', recipient: string, templateKey: string, vars: Record<string, string>) {
  const tpl = store.emailTemplates.find((t) => t.key === templateKey);
  let subject = vars.subject || 'Account Notification';
  let body = vars.preview || '';
  if (tpl && tpl.enabled) {
    subject = tpl.subject;
    body = tpl.body;
    for (const [k, v] of Object.entries(vars)) {
      subject = subject.replaceAll(`{{${k}}}`, v);
      body = body.replaceAll(`{{${k}}}`, v);
    }
  }
  const entry = {
    id: `not-${crypto.randomBytes(4).toString('hex')}`,
    channel,
    recipient,
    subject,
    preview: body.slice(0, 140),
    status: 'Delivered',
    timestamp: new Date().toISOString(),
  };
  store.notificationLogs.unshift(entry);
  if (store.notificationLogs.length > 100) store.notificationLogs = store.notificationLogs.slice(0, 100);
  saveStore(store);
  return entry;
}

interface AuthedRequest extends Request {
  auth?: { session: SessionEntry; staff: StaffRecord };
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const verified = verifyBearerToken(req.headers.authorization);
  if (!verified) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  req.auth = verified;
  next();
}

function requirePerm(perm: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (req.auth.staff.role === 'Super Admin' || req.auth.staff.permissions.includes(perm)) {
      next();
      return;
    }
    appendAudit(req.auth.staff.name, req.auth.staff.role, 'PERMISSION_DENIED', perm, 'Blocked', `Attempted ${req.method} ${req.path}`);
    res.status(403).json({ error: `Missing permission: ${perm}` });
  };
}

async function startServer() {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '12mb' }));

  // Security headers (iframe-compatible: no X-Frame-Options)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(self), camera=()');
    next();
  });

  // Public health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // AI Strategy & Architecture Brief Planner (gemini-4-hydrogen)
  app.post('/api/ai/strategy-brief', async (req, res) => {
    const ip = String(req.ip || 'unknown');
    if (!checkRateLimit(`ai-brief:${ip}`, 15, 60_000)) {
      res.status(429).json({ error: 'Too many AI requests. Please wait a minute.' });
      return;
    }
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({ error: 'Gemini API key is not configured on the server (Settings > Secrets).' });
      return;
    }

    const goal = String(req.body?.goal || '').trim().slice(0, 600);
    const industry = String(req.body?.industry || 'E-Commerce & SME').trim().slice(0, 80);
    const track = String(req.body?.track || 'Agency Build').trim().slice(0, 60);
    const budgetRange = String(req.body?.budgetRange || 'PKR 100,000 - 250,000').trim().slice(0, 60);

    if (goal.length < 5) {
      res.status(400).json({ error: 'Please describe your project goal or learning objective (min 5 characters).' });
      return;
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Create a sharp, practical execution roadmap for a client or student of Asif Digital Solutions (Bahawalpur & Lahore, Pakistan).
Track: ${track}
Industry / Domain: ${industry}
Budget / Fee Tier: ${budgetRange}
Goal: ${goal}`,
        config: {
          systemInstruction:
            'You are a senior digital architect at Asif Digital Solutions. Be concise, realistic, and tailored to Pakistani startups, SMEs, and CS/SE FYP students.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING, description: 'Concise 6-10 word project title' },
              recommendedService: { type: Type.STRING, description: 'Best-fit Asif Digital service, course, or FYP track' },
              timeline: { type: Type.STRING, description: 'Realistic delivery or study timeline' },
              roadmapSteps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '4 concise actionable execution milestones',
              },
              techStack: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 to 5 recommended technologies or tools',
              },
              estimatedImpact: { type: Type.STRING, description: 'Expected measurable outcome in 1-2 sentences' },
            },
            required: ['headline', 'recommendedService', 'timeline', 'roadmapSteps', 'techStack', 'estimatedImpact'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({ brief: parsed });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Brand & Visual Asset Studio (gemini-nano-banana-2.1)
  app.post('/api/ai/image', async (req, res) => {
    const ip = String(req.ip || 'unknown');
    if (!checkRateLimit(`ai-img:${ip}`, 10, 60_000)) {
      res.status(429).json({ error: 'Rate limit reached for image generation. Please wait a minute.' });
      return;
    }
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({ error: 'Gemini API key is not configured on the server (Settings > Secrets).' });
      return;
    }

    const prompt = String(req.body?.prompt || '').trim().slice(0, 800);
    const aspectRatio = ['1:1', '4:3', '3:4', '16:9', '9:16'].includes(req.body?.aspectRatio)
      ? String(req.body.aspectRatio)
      : '1:1';
    const imageSize = ['1K', '2K', '4K'].includes(req.body?.imageSize) ? String(req.body.imageSize) : '1K';
    const sourceImageBase64 = typeof req.body?.sourceImageBase64 === 'string' ? req.body.sourceImageBase64 : '';
    const sourceMimeType = ['image/png', 'image/jpeg', 'image/webp'].includes(req.body?.sourceMimeType)
      ? String(req.body.sourceMimeType)
      : 'image/png';
    const useSearchGrounding = Boolean(req.body?.useSearchGrounding);

    if (prompt.length < 3) {
      res.status(400).json({ error: 'Please enter a descriptive prompt (at least 3 characters).' });
      return;
    }

    try {
      const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];
      if (sourceImageBase64) {
        parts.push({
          inlineData: {
            data: sourceImageBase64,
            mimeType: sourceMimeType,
          },
        });
      }
      parts.push({ text: prompt });

      const response = await ai.models.generateContent({
        model: 'gemini-nano-banana-2.1',
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio,
            imageSize,
          },
          ...(useSearchGrounding
            ? {
                tools: [
                  {
                    googleSearch: {
                      searchTypes: {
                        webSearch: {},
                        imageSearch: {},
                      },
                    },
                  },
                ],
              }
            : {}),
        },
      });

      let imageUrl: string | null = null;
      let commentary = '';
      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType ?? 'image/png';
          imageUrl = `data:${mime};base64,${part.inlineData.data}`;
        } else if (part.text) {
          commentary += (commentary ? '\n' : '') + part.text;
        }
      }

      if (!imageUrl) {
        res.status(502).json({ error: commentary || 'The model did not return an image. Refine your prompt and try again.' });
        return;
      }

      res.json({ imageUrl, commentary, model: 'gemini-nano-banana-2.1' });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Auth status (checks whether env ADMIN_PASSCODE or claimed hash exists)
  app.get('/api/auth/status', (req, res) => {
    const envActive = Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0);
    const initialized = envActive || Boolean(store.adminHash && store.adminSalt);
    const verified = verifyBearerToken(req.headers.authorization);
    res.json({
      initialized,
      envPasscodeActive: envActive,
      authenticated: Boolean(verified),
      user: verified ? sanitizeStaff(verified.staff) : null,
    });
  });

  // First-run atomic admin setup (only allowed when ADMIN_PASSCODE is unset and adminHash is null)
  app.post('/api/auth/setup', (req, res) => {
    const envActive = Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0);
    if (envActive || (store.adminHash && store.adminSalt)) {
      res.status(409).json({ error: 'Admin passcode is already configured.' });
      return;
    }
    const password = String(req.body?.password || '').trim();
    if (password.length < 8) {
      res.status(400).json({ error: 'Choose an admin passcode of at least 8 characters.' });
      return;
    }
    const { hash, salt } = hashPassword(password);
    store.adminHash = hash;
    store.adminSalt = salt;
    const admin = store.staff[0];
    admin.lastLoginAt = new Date().toISOString();
    saveStore(store);

    const token = createSessionToken(admin, String(req.headers['user-agent'] || 'Browser').slice(0, 60));
    appendAudit(admin.name, admin.role, 'ADMIN_CREDENTIAL_CLAIMED', 'Console Security', 'Success', 'Initial admin passcode hashed via scrypt.');
    dispatchNotification('Email', admin.email, 'login_alert', {
      name: admin.name,
      timestamp: new Date().toLocaleString(),
      method: 'First-Run Admin Setup',
    });

    res.json({ token, user: sanitizeStaff(admin), requiresTwoFactor: false });
  });

  // Login with email/role + passcode
  app.post('/api/auth/login', (req, res) => {
    const ip = String(req.ip || 'unknown');
    if (!checkRateLimit(`login:${ip}`, 15, 60_000)) {
      res.status(429).json({ error: 'Too many sign-in attempts. Please wait 60 seconds.' });
      return;
    }
    const password = String(req.body?.password || '');
    const email = String(req.body?.email || store.staff[0].email).trim().toLowerCase();
    const envPass = process.env.ADMIN_PASSCODE?.trim();

    let valid = false;
    if (envPass) {
      const a = Buffer.from(password);
      const b = Buffer.from(envPass);
      valid = a.length === b.length && crypto.timingSafeEqual(a, b);
    } else if (store.adminHash && store.adminSalt) {
      valid = verifyPasswordHash(password, store.adminHash, store.adminSalt);
    } else {
      res.status(400).json({ error: 'Admin passcode has not been claimed yet.' });
      return;
    }

    const staff = store.staff.find((s) => s.email.toLowerCase() === email && s.active) || store.staff[0];
    if (!valid) {
      appendAudit(staff.name, staff.role, 'LOGIN_FAILED', staff.email, 'Warning', 'Invalid passcode entered.');
      res.status(401).json({ error: 'Invalid passcode.' });
      return;
    }

    if (staff.twoFactorEnabled && staff.twoFactorMethod !== 'none') {
      const pendingId = crypto.randomBytes(20).toString('hex');
      let smsCode: string | null = null;
      if (staff.twoFactorMethod === 'sms') {
        smsCode = String(crypto.randomInt(100000, 999999));
        dispatchNotification('SMS', staff.email, 'two_factor_code', {
          name: staff.name,
          code: smsCode,
        });
      }
      pendingTwoFactor.set(pendingId, {
        userId: staff.id,
        smsCode,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
      res.json({
        requiresTwoFactor: true,
        method: staff.twoFactorMethod,
        pendingToken: signToken(pendingId),
        smsPreviewHint: smsCode ? `Verification code dispatched (preview: ${smsCode})` : undefined,
      });
      return;
    }

    staff.lastLoginAt = new Date().toISOString();
    saveStore(store);
    const token = createSessionToken(staff, String(req.headers['user-agent'] || 'Browser').slice(0, 60));
    appendAudit(staff.name, staff.role, 'LOGIN_SUCCESS', staff.email, 'Success', 'Authenticated with passcode.');
    const alert = dispatchNotification('Email', staff.email, 'login_alert', {
      name: staff.name,
      timestamp: new Date().toLocaleString(),
      method: 'Passcode',
    });
    res.json({ token, user: sanitizeStaff(staff), requiresTwoFactor: false, loginAlert: alert });
  });

  // Verify 2FA during login
  app.post('/api/auth/login-2fa', (req, res) => {
    const pendingRaw = String(req.body?.pendingToken || '');
    const code = String(req.body?.code || '').trim();
    const dot = pendingRaw.lastIndexOf('.');
    if (dot <= 0) {
      res.status(401).json({ error: 'Invalid challenge token.' });
      return;
    }
    const pendingId = pendingRaw.slice(0, dot);
    const sig = pendingRaw.slice(dot + 1);
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(pendingId).digest('hex');
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      res.status(401).json({ error: 'Invalid challenge signature.' });
      return;
    }

    const challenge = pendingTwoFactor.get(pendingId);
    if (!challenge || challenge.expiresAt < Date.now()) {
      pendingTwoFactor.delete(pendingId);
      res.status(401).json({ error: '2FA challenge expired. Sign in again.' });
      return;
    }

    const staff = store.staff.find((s) => s.id === challenge.userId);
    if (!staff) {
      res.status(401).json({ error: 'Account not found.' });
      return;
    }

    const ok =
      staff.twoFactorMethod === 'sms' ? challenge.smsCode === code : verifyTOTP(staff.totpSecret, code);
    if (!ok) {
      appendAudit(staff.name, staff.role, '2FA_FAILED', staff.email, 'Warning', `Invalid ${staff.twoFactorMethod.toUpperCase()} code.`);
      res.status(401).json({ error: 'Invalid 6-digit verification code.' });
      return;
    }

    pendingTwoFactor.delete(pendingId);
    staff.lastLoginAt = new Date().toISOString();
    saveStore(store);
    const token = createSessionToken(staff, String(req.headers['user-agent'] || 'Browser').slice(0, 60));
    appendAudit(staff.name, staff.role, 'LOGIN_2FA_VERIFIED', staff.email, 'Success', `Verified via ${staff.twoFactorMethod.toUpperCase()}.`);
    const alert = dispatchNotification('Email', staff.email, 'login_alert', {
      name: staff.name,
      timestamp: new Date().toLocaleString(),
      method: `Passcode + ${staff.twoFactorMethod.toUpperCase()} 2FA`,
    });
    res.json({ token, user: sanitizeStaff(staff), loginAlert: alert });
  });

  // WebAuthn / Biometric Passkey challenge & registration (authenticated user)
  app.post('/api/auth/webauthn/register-options', requireAuth, (req: AuthedRequest, res) => {
    const staff = req.auth!.staff;
    const challenge = crypto.randomBytes(32).toString('base64url');
    webauthnChallenges.set(staff.id, { challenge, userId: staff.id, expiresAt: Date.now() + 300000 });
    res.json({
      challenge,
      rp: { name: 'Asif Digital Solutions' },
      user: { id: Buffer.from(staff.id).toString('base64url'), name: staff.email, displayName: staff.name },
    });
  });

  app.post('/api/auth/webauthn/register', requireAuth, (req: AuthedRequest, res) => {
    const staff = req.auth!.staff;
    const credentialId = String(req.body?.credentialId || '').trim();
    const challengeEntry = webauthnChallenges.get(staff.id);
    if (!challengeEntry || challengeEntry.expiresAt < Date.now()) {
      res.status(400).json({ error: 'Biometric registration challenge expired.' });
      return;
    }
    if (!credentialId) {
      res.status(400).json({ error: 'Missing credential identifier.' });
      return;
    }
    webauthnChallenges.delete(staff.id);
    if (!staff.credentialIds.includes(credentialId)) {
      staff.credentialIds.push(credentialId);
    }
    staff.biometricEnabled = true;
    saveStore(store);
    appendAudit(staff.name, staff.role, 'BIOMETRIC_PASSKEY_ENROLLED', staff.email, 'Success', 'WebAuthn passkey bound to account.');
    res.json({ user: sanitizeStaff(staff) });
  });

  // WebAuthn / Biometric Login challenge & verification
  app.post('/api/auth/webauthn/login-options', (req, res) => {
    const email = String(req.body?.email || store.staff[0].email).trim().toLowerCase();
    const staff = store.staff.find((s) => s.email.toLowerCase() === email && s.active);
    if (!staff || !staff.biometricEnabled || staff.credentialIds.length === 0) {
      res.status(404).json({ error: 'No biometric passkey registered for this account yet.' });
      return;
    }
    const challenge = crypto.randomBytes(32).toString('base64url');
    const cid = crypto.randomBytes(12).toString('hex');
    webauthnChallenges.set(cid, { challenge, userId: staff.id, expiresAt: Date.now() + 300000 });
    res.json({ challengeId: cid, challenge, allowCredentials: staff.credentialIds });
  });

  app.post('/api/auth/webauthn/login', (req, res) => {
    const challengeId = String(req.body?.challengeId || '');
    const credentialId = String(req.body?.credentialId || '');
    const entry = webauthnChallenges.get(challengeId);
    if (!entry || entry.expiresAt < Date.now()) {
      res.status(401).json({ error: 'Biometric challenge expired.' });
      return;
    }
    const staff = store.staff.find((s) => s.id === entry.userId && s.active);
    if (!staff || !staff.credentialIds.includes(credentialId)) {
      res.status(401).json({ error: 'Passkey verification failed.' });
      return;
    }
    webauthnChallenges.delete(challengeId);
    staff.lastLoginAt = new Date().toISOString();
    saveStore(store);
    const token = createSessionToken(staff, 'WebAuthn Passkey');
    appendAudit(staff.name, staff.role, 'BIOMETRIC_LOGIN_SUCCESS', staff.email, 'Success', 'Signed in via biometric passkey.');
    const alert = dispatchNotification('Push', staff.email, 'login_alert', {
      name: staff.name,
      timestamp: new Date().toLocaleString(),
      method: 'Biometric Passkey',
    });
    res.json({ token, user: sanitizeStaff(staff), loginAlert: alert });
  });

  app.post('/api/auth/logout', requireAuth, (req: AuthedRequest, res) => {
    const raw = req.headers.authorization?.slice(7) || '';
    const sid = raw.slice(0, raw.lastIndexOf('.'));
    sessions.delete(sid);
    appendAudit(req.auth!.staff.name, req.auth!.staff.role, 'LOGOUT', req.auth!.staff.email, 'Success', 'Session terminated.');
    res.json({ ok: true });
  });

  // Public A/B variant assignment + impression tracking
  app.get('/api/public/experiment', (req, res) => {
    const requested = req.query.variant === 'A' || req.query.variant === 'B' ? (req.query.variant as 'A' | 'B') : null;
    const exp = store.abExperiment;
    let assigned: 'A' | 'B';
    if (requested) {
      assigned = requested;
    } else if (exp.winner) {
      assigned = exp.winner;
    } else {
      const roll = Math.random() * 100;
      assigned = roll < exp.variants.A.weight ? 'A' : 'B';
    }
    if (req.query.track === '1') {
      exp.variants[assigned].impressions += 1;
      saveStore(store);
    }
    res.json({
      experimentId: exp.id,
      assignedVariant: assigned,
      variant: exp.variants[assigned],
    });
  });

  // Public heatmap click capture (privacy-aware: client only calls when analytics consent granted)
  app.post('/api/public/heatmap', (req, res) => {
    const section = String(req.body?.section || 'hero');
    const validSections = ['hero', 'services', 'academy', 'fyp', 'contact'];
    if (!validSections.includes(section)) {
      res.status(400).json({ error: 'Invalid section' });
      return;
    }
    const xPct = Math.max(0, Math.min(100, Number(req.body?.xPct || 50)));
    const yPct = Math.max(0, Math.min(100, Number(req.body?.yPct || 50)));
    const device = req.body?.device === 'mobile' ? 'mobile' : 'desktop';
    const variant = req.body?.variant === 'B' ? 'B' : 'A';
    const label = String(req.body?.label || 'Interaction').slice(0, 60);

    store.heatmapPoints.unshift({
      id: `hm-${crypto.randomBytes(4).toString('hex')}`,
      section,
      xPct: Math.round(xPct),
      yPct: Math.round(yPct),
      device,
      variant,
      label,
      timestamp: new Date().toISOString(),
    });
    if (store.heatmapPoints.length > 300) store.heatmapPoints = store.heatmapPoints.slice(0, 300);
    saveStore(store);
    res.json({ ok: true });
  });

  // Public case studies & testimonials
  app.get('/api/public/showcase', (_req, res) => {
    res.json({ caseStudies: store.caseStudies });
  });

  // Public consultation slot availability for a date (YYYY-MM-DD)
  app.get('/api/public/slots', (req, res) => {
    const dateStr = String(req.query.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const baseSlots = ['11:00 AM PKT', '02:00 PM PKT', '04:30 PM PKT', '07:00 PM PKT'];
    const booked = new Set(
      store.leads
        .filter((l) => l.stage !== 'Closed' && typeof l.preferredSlot === 'string' && l.preferredSlot.startsWith(dateStr))
        .map((l) => l.preferredSlot)
    );
    res.json({
      date: dateStr,
      slots: baseSlots.map((time) => {
        const key = `${dateStr} · ${time}`;
        return { time, key, available: !booked.has(key) };
      }),
    });
  });

  // Public inquiry status tracker (requires matching Reference ID + email or phone digits)
  app.get('/api/public/track', (req, res) => {
    const ip = String(req.ip || 'unknown');
    if (!checkRateLimit(`track:${ip}`, 25, 60_000)) {
      res.status(429).json({ error: 'Too many lookup requests. Please wait a minute.' });
      return;
    }
    const id = String(req.query.id || '').trim().toLowerCase();
    const contact = String(req.query.contact || '').trim().toLowerCase();
    const contactDigits = contact.replace(/\D/g, '');
    if (!id || contact.length < 4) {
      res.status(400).json({ error: 'Provide both Reference ID and registered email or phone number.' });
      return;
    }
    const lead = store.leads.find((l) => {
      if (l.id.toLowerCase() !== id) return false;
      const emailMatch = l.email && l.email.toLowerCase() === contact;
      const phoneDigits = String(l.phone || '').replace(/\D/g, '');
      const phoneMatch = contactDigits.length >= 6 && phoneDigits.endsWith(contactDigits.slice(-6));
      return Boolean(emailMatch || phoneMatch);
    });
    if (!lead) {
      res.status(404).json({ error: 'No matching inquiry found. Check your Reference ID and contact details.' });
      return;
    }
    res.json({
      inquiry: {
        id: lead.id,
        firstName: String(lead.name).split(' ')[0],
        service: lead.service,
        category: lead.category,
        stage: lead.stage,
        sequenceStep: lead.sequenceStep,
        sequenceStatus: lead.sequenceStatus,
        preferredSlot: lead.preferredSlot || null,
        estimatedBudget: lead.estimatedBudget || null,
        updatedAt: lead.updatedAt,
      },
    });
  });

  // Public lead / course enrollment capture -> triggers CRM + Automated Nurturing + Email notification
  app.post('/api/public/leads', (req, res) => {
    const ip = String(req.ip || 'unknown');
    if (!checkRateLimit(`lead:${ip}`, 20, 60_000)) {
      res.status(429).json({ error: 'Too many submissions. Please wait a moment.' });
      return;
    }
    const name = String(req.body?.name || '').trim();
    const phone = String(req.body?.phone || '').trim();
    const email = String(req.body?.email || '').trim();
    const service = String(req.body?.service || 'Website Design').trim();
    const category = ['agency', 'course', 'fyp'].includes(req.body?.category) ? req.body.category : 'agency';
    const notes = String(req.body?.notes || '').trim();
    const preferredSlot = req.body?.preferredSlot ? String(req.body.preferredSlot).trim().slice(0, 60) : undefined;
    const estimatedBudget = req.body?.estimatedBudget ? String(req.body.estimatedBudget).trim().slice(0, 60) : undefined;
    const sourceVariant = req.body?.sourceVariant === 'B' ? 'B' : 'A';
    const consentMarketing = Boolean(req.body?.consentMarketing);

    if (name.length < 2 || phone.length < 7) {
      res.status(400).json({ error: 'Please provide a valid name and phone/WhatsApp number.' });
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Please provide a valid email address.' });
      return;
    }
    if (
      preferredSlot &&
      store.leads.some((l) => l.stage !== 'Closed' && l.preferredSlot === preferredSlot)
    ) {
      res.status(409).json({ error: 'That consultation slot was just booked. Please pick another time.' });
      return;
    }

    const now = new Date().toISOString();
    const lead = {
      id: `ld-${crypto.randomBytes(3).toString('hex')}`,
      name: name.slice(0, 80),
      phone: phone.slice(0, 30),
      email: email.slice(0, 120),
      service: service.slice(0, 80),
      category,
      notes: notes.slice(0, 1000),
      stage: 'New',
      sourceVariant,
      consentMarketing,
      sequenceStep: 1,
      sequenceStatus: consentMarketing ? 'Active' : 'Paused',
      crmSynced: Boolean(store.crmConfig.autoSync),
      preferredSlot,
      estimatedBudget,
      createdAt: now,
      updatedAt: now,
    };

    store.leads.unshift(lead);
    store.abExperiment.variants[sourceVariant].conversions += 1;
    if (store.crmConfig.autoSync) {
      store.crmConfig.syncedCount += 1;
      store.crmConfig.lastSyncAt = now;
    }
    store.sequences[0].sentCount += 1;
    saveStore(store);

    const tplKey = category === 'course' ? 'course_enrollment' : 'welcome_lead';
    if (email) {
      dispatchNotification('Email', email, tplKey, { name: lead.name, service: lead.service });
    }
    dispatchNotification('Push', 'asifriaz1297@gmail.com', 'login_alert', {
      subject: `New Lead: ${lead.name} (${lead.service})`,
      preview: `Captured via Variant ${sourceVariant}. Phone: ${lead.phone}`,
    });
    appendAudit('Public Lead Form', 'Visitor', 'LEAD_CAPTURED', lead.id, 'Success', `${lead.service} · Variant ${sourceVariant}`);

    res.status(201).json({ lead });
  });

  // Public GDPR / CCPA privacy request submission
  app.post('/api/public/gdpr', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const type = ['Export Data', 'Delete Data', 'Do Not Sell (CCPA)'].includes(req.body?.type)
      ? req.body.type
      : 'Export Data';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Valid email address is required for verification.' });
      return;
    }
    const item = {
      id: `gdpr-${crypto.randomBytes(3).toString('hex')}`,
      email,
      type,
      status: 'Pending',
      requestedAt: new Date().toISOString(),
      completedAt: null,
    };
    store.gdprRequests.unshift(item);
    saveStore(store);
    appendAudit(email, 'Data Subject', 'GDPR_CCPA_REQUEST', item.id, 'Success', `Submitted ${type} request.`);
    res.status(201).json({ request: item });
  });

  // Protected Admin Dashboard Bundle
  app.get('/api/admin/overview', requireAuth, requirePerm('analytics:read'), (req: AuthedRequest, res) => {
    const staff = req.auth!.staff;
    const totalImpressions = store.abExperiment.variants.A.impressions + store.abExperiment.variants.B.impressions;
    const totalConversions = store.abExperiment.variants.A.conversions + store.abExperiment.variants.B.conversions;

    res.json({
      user: sanitizeStaff(staff),
      kpis: {
        totalLeads: store.leads.length,
        qualifiedOrEnrolled: store.leads.filter((l) => l.stage === 'Qualified' || l.stage === 'Enrolled').length,
        conversionRatePct: totalImpressions > 0 ? Number(((totalConversions / totalImpressions) * 100).toFixed(2)) : 0,
        heatmapClicks: store.heatmapPoints.length,
        activeSequences: store.leads.filter((l) => l.sequenceStatus === 'Active').length,
      },
      leads: store.leads,
      abExperiment: store.abExperiment,
      heatmapPoints: store.heatmapPoints,
      sequences: store.sequences,
      crmConfig: store.crmConfig,
      staff: store.staff.map(sanitizeStaff),
      gdprRequests: store.gdprRequests,
      auditLogs: store.auditLogs,
      emailTemplates: store.emailTemplates,
      notificationLogs: store.notificationLogs,
      caseStudies: store.caseStudies,
      activeSessionsCount: sessions.size,
      securityPosture: buildVulnerabilityChecks(staff),
    });
  });

  // Create Lead manually inside Admin CRM
  app.post('/api/admin/leads', requireAuth, requirePerm('leads:write'), (req: AuthedRequest, res) => {
    const name = String(req.body?.name || '').trim();
    const phone = String(req.body?.phone || '').trim();
    const email = String(req.body?.email || '').trim();
    const service = String(req.body?.service || 'High-Conversion Website Design').trim();
    const category = ['agency', 'course', 'fyp'].includes(req.body?.category) ? req.body.category : 'agency';
    const notes = String(req.body?.notes || '').trim();

    if (name.length < 2 || phone.length < 7) {
      res.status(400).json({ error: 'Name and valid phone number are required.' });
      return;
    }
    const now = new Date().toISOString();
    const lead = {
      id: `ld-${crypto.randomBytes(3).toString('hex')}`,
      name: name.slice(0, 80),
      phone: phone.slice(0, 30),
      email: email.slice(0, 120),
      service: service.slice(0, 80),
      category,
      notes: notes.slice(0, 1000),
      stage: 'Qualified',
      sourceVariant: 'A',
      consentMarketing: true,
      sequenceStep: 1,
      sequenceStatus: 'Active',
      crmSynced: false,
      createdAt: now,
      updatedAt: now,
    };
    store.leads.unshift(lead);
    saveStore(store);
    appendAudit(req.auth!.staff.name, req.auth!.staff.role, 'LEAD_CREATED_ADMIN', lead.id, 'Success', `${lead.name} · ${lead.service}`);
    res.status(201).json({ lead });
  });

  // Update Lead Stage / Notes / Advance Nurturing Sequence
  app.patch('/api/admin/leads/:id', requireAuth, requirePerm('leads:write'), (req: AuthedRequest, res) => {
    const lead = store.leads.find((l) => l.id === req.params.id);
    if (!lead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }
    if (['New', 'Nurturing', 'Qualified', 'Enrolled', 'Closed'].includes(req.body?.stage)) {
      lead.stage = req.body.stage;
    }
    if (typeof req.body?.notes === 'string') {
      lead.notes = req.body.notes.slice(0, 1000);
    }
    if (req.body?.advanceSequence) {
      lead.sequenceStep = Math.min(3, lead.sequenceStep + 1);
      if (lead.sequenceStep >= 3) lead.sequenceStatus = 'Completed';
      store.sequences[lead.sequenceStep - 1].sentCount += 1;
      if (lead.email) {
        dispatchNotification('Email', lead.email, 'welcome_lead', { name: lead.name, service: lead.service });
      }
    }
    lead.updatedAt = new Date().toISOString();
    saveStore(store);
    appendAudit(req.auth!.staff.name, req.auth!.staff.role, 'LEAD_UPDATED', lead.id, 'Success', `Stage: ${lead.stage}, Sequence Step: ${lead.sequenceStep}`);
    res.json({ lead });
  });

  // Delete Lead from CRM
  app.delete('/api/admin/leads/:id', requireAuth, requirePerm('leads:write'), (req: AuthedRequest, res) => {
    const idx = store.leads.findIndex((l) => l.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }
    const [removed] = store.leads.splice(idx, 1);
    saveStore(store);
    appendAudit(req.auth!.staff.name, req.auth!.staff.role, 'LEAD_DELETED', removed.id, 'Warning', `Removed lead ${removed.name}`);
    res.json({ ok: true });
  });

  // Update A/B Experiment Weights, Copy, Metrics Reset, or Promote Winner
  app.patch('/api/admin/ab-experiment', requireAuth, requirePerm('ab:manage'), (req: AuthedRequest, res) => {
    const exp = store.abExperiment;
    if (req.body?.weightA !== undefined) {
      const wA = Math.max(0, Math.min(100, Number(req.body.weightA)));
      exp.variants.A.weight = wA;
      exp.variants.B.weight = 100 - wA;
      exp.status = 'Running';
      exp.winner = null;
    }
    if (req.body?.winner === 'A' || req.body?.winner === 'B') {
      exp.winner = req.body.winner;
      exp.status = 'Winner Selected';
    } else if (req.body?.winner === null) {
      exp.winner = null;
      exp.status = 'Running';
    }
    if (typeof req.body?.headlineA === 'string' && req.body.headlineA.trim()) exp.variants.A.headline = req.body.headlineA.trim().slice(0, 140);
    if (typeof req.body?.subheadlineA === 'string' && req.body.subheadlineA.trim()) exp.variants.A.subheadline = req.body.subheadlineA.trim().slice(0, 320);
    if (typeof req.body?.ctaLabelA === 'string' && req.body.ctaLabelA.trim()) exp.variants.A.ctaLabel = req.body.ctaLabelA.trim().slice(0, 50);
    if (typeof req.body?.headlineB === 'string' && req.body.headlineB.trim()) exp.variants.B.headline = req.body.headlineB.trim().slice(0, 140);
    if (typeof req.body?.subheadlineB === 'string' && req.body.subheadlineB.trim()) exp.variants.B.subheadline = req.body.subheadlineB.trim().slice(0, 320);
    if (typeof req.body?.ctaLabelB === 'string' && req.body.ctaLabelB.trim()) exp.variants.B.ctaLabel = req.body.ctaLabelB.trim().slice(0, 50);

    if (req.body?.resetMetrics === true) {
      exp.variants.A.impressions = 0;
      exp.variants.A.conversions = 0;
      exp.variants.B.impressions = 0;
      exp.variants.B.conversions = 0;
    }

    saveStore(store);
    appendAudit(req.auth!.staff.name, req.auth!.staff.role, 'AB_EXPERIMENT_UPDATED', exp.id, 'Success', `Status: ${exp.status}, Split ${exp.variants.A.weight}/${exp.variants.B.weight}`);
    res.json({ abExperiment: exp });
  });

  // CRM Config & Sync (with optional live outbound webhook dispatch + SSRF protection)
  app.post('/api/admin/crm/sync', requireAuth, requirePerm('crm:sync'), async (req: AuthedRequest, res) => {
    const provider = ['HubSpot', 'Zoho CRM', 'Custom Webhook'].includes(req.body?.provider)
      ? req.body.provider
      : store.crmConfig.provider;
    const webhookUrl = String(req.body?.webhookUrl || store.crmConfig.webhookUrl).trim();
    if (!isSafeWebhookUrl(webhookUrl)) {
      appendAudit(req.auth!.staff.name, req.auth!.staff.role, 'CRM_WEBHOOK_REJECTED', webhookUrl, 'Blocked', 'Blocked unsafe or private network webhook URL.');
      res.status(400).json({ error: 'Webhook URL must use http(s) and a public non-private host.' });
      return;
    }
    store.crmConfig.provider = provider;
    store.crmConfig.webhookUrl = webhookUrl;
    store.crmConfig.autoSync = Boolean(req.body?.autoSync ?? store.crmConfig.autoSync);

    const pendingLeads = store.leads.filter((l) => !l.crmSynced);
    let webhookStatus = 'Queued locally (no remote ping requested)';
    if (req.body?.liveDispatch) {
      try {
        const resp = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'Asif Digital Solutions',
            provider,
            syncedAt: new Date().toISOString(),
            contacts: pendingLeads.slice(0, 10).map((l) => ({
              id: l.id,
              name: l.name,
              service: l.service,
              stage: l.stage,
            })),
          }),
          signal: AbortSignal.timeout(3500),
        });
        webhookStatus = `HTTP ${resp.status} from ${new URL(webhookUrl).hostname}`;
      } catch {
        webhookStatus = `Remote endpoint unreachable; contacts synced in local CRM store`;
      }
    }

    let newlySynced = 0;
    for (const lead of store.leads) {
      if (!lead.crmSynced) {
        lead.crmSynced = true;
        newlySynced += 1;
      }
    }
    store.crmConfig.syncedCount += newlySynced;
    store.crmConfig.lastSyncAt = new Date().toISOString();
    saveStore(store);

    appendAudit(req.auth!.staff.name, req.auth!.staff.role, 'CRM_SYNC_EXECUTED', provider, 'Success', `Synced ${newlySynced} contacts · ${webhookStatus}`);
    res.json({ crmConfig: store.crmConfig, newlySynced, webhookStatus });
  });

  // RBAC Staff Add / Update / Delete
  app.post('/api/admin/staff', requireAuth, requirePerm('rbac:manage'), (req: AuthedRequest, res) => {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const validRoles: RoleName[] = ['Super Admin', 'Agency Manager', 'Course Instructor', 'Growth Analyst', 'Client Viewer'];
    const role: RoleName = validRoles.includes(req.body?.role) ? req.body.role : 'Client Viewer';

    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Valid staff name and email address are required.' });
      return;
    }
    if (store.staff.some((s) => s.email.toLowerCase() === email)) {
      res.status(409).json({ error: 'A staff account with this email already exists.' });
      return;
    }

    const defaultPerms: Record<RoleName, string[]> = {
      'Super Admin': ['analytics:read', 'leads:read', 'leads:write', 'ab:manage', 'crm:sync', 'gdpr:manage', 'security:manage', 'rbac:manage', 'templates:manage'],
      'Agency Manager': ['analytics:read', 'leads:read', 'leads:write', 'ab:manage', 'crm:sync', 'templates:manage'],
      'Course Instructor': ['analytics:read', 'leads:read', 'leads:write'],
      'Growth Analyst': ['analytics:read', 'leads:read', 'ab:manage'],
      'Client Viewer': ['analytics:read'],
    };

    const created: StaffRecord = {
      id: `usr-${crypto.randomBytes(3).toString('hex')}`,
      name: name.slice(0, 60),
      email,
      role,
      permissions: defaultPerms[role],
      twoFactorEnabled: false,
      twoFactorMethod: 'none',
      totpSecret: base32Encode(crypto.randomBytes(20)),
      biometricEnabled: false,
      credentialIds: [],
      lastLoginAt: null,
      active: true,
    };
    store.staff.push(created);
    saveStore(store);
    appendAudit(req.auth!.staff.name, req.auth!.staff.role, 'STAFF_INVITED', email, 'Success', `Added ${role} profile.`);
    res.status(201).json({ staff: sanitizeStaff(created) });
  });

  app.patch('/api/admin/staff/:id', requireAuth, requirePerm('rbac:manage'), (req: AuthedRequest, res) => {
    const target = store.staff.find((s) => s.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Staff member not found' });
      return;
    }
    const validRoles: RoleName[] = ['Super Admin', 'Agency Manager', 'Course Instructor', 'Growth Analyst', 'Client Viewer'];
    if (validRoles.includes(req.body?.role)) target.role = req.body.role;
    if (Array.isArray(req.body?.permissions)) target.permissions = req.body.permissions.map(String);
    if (typeof req.body?.active === 'boolean' && target.id !== req.auth!.staff.id) target.active = req.body.active;
    saveStore(store);
    appendAudit(req.auth!.staff.name, req.auth!.staff.role, 'RBAC_UPDATED', target.email, 'Success', `Role: ${target.role}, Perms: ${target.permissions.length}`);
    res.json({ staff: sanitizeStaff(target) });
  });

  app.delete('/api/admin/staff/:id', requireAuth, requirePerm('rbac:manage'), (req: AuthedRequest, res) => {
    if (req.params.id === req.auth!.staff.id) {
      res.status(400).json({ error: 'You cannot delete your own active admin account.' });
      return;
    }
    const idx = store.staff.findIndex((s) => s.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Staff member not found' });
      return;
    }
    const [removed] = store.staff.splice(idx, 1);
    saveStore(store);
    appendAudit(req.auth!.staff.name, req.auth!.staff.role, 'STAFF_REMOVED', removed.email, 'Warning', `Removed staff account.`);
    res.json({ ok: true });
  });

  // Active Session Inspection & Revocation
  app.get('/api/admin/sessions', requireAuth, (req: AuthedRequest, res) => {
    const raw = req.headers.authorization?.slice(7) || '';
    const currentSid = raw.slice(0, raw.lastIndexOf('.'));
    const list = Array.from(sessions.entries())
      .filter(([, s]) => s.expiresAt >= Date.now())
      .map(([sid, s]) => ({
        sidPrefix: sid.slice(0, 10),
        email: s.email,
        role: s.role,
        device: s.device,
        createdAt: new Date(s.createdAt).toISOString(),
        expiresAt: new Date(s.expiresAt).toISOString(),
        isCurrent: sid === currentSid,
      }));
    res.json({ sessions: list });
  });

  app.delete('/api/admin/sessions/:sidPrefix', requireAuth, (req: AuthedRequest, res) => {
    const prefix = String(req.params.sidPrefix || '');
    const raw = req.headers.authorization?.slice(7) || '';
    const currentSid = raw.slice(0, raw.lastIndexOf('.'));
    let revoked = 0;
    for (const sid of Array.from(sessions.keys())) {
      if (sid.startsWith(prefix) && sid !== currentSid) {
        sessions.delete(sid);
        revoked += 1;
      }
    }
    if (revoked > 0) {
      appendAudit(req.auth!.staff.name, req.auth!.staff.role, 'SESSION_REVOKED', prefix, 'Warning', 'Revoked active session.');
    }
    res.json({ revoked });
  });

  // Case Studies Management
  app.post('/api/admin/showcase', requireAuth, requirePerm('templates:manage'), (req: AuthedRequest, res) => {
    const client = String(req.body?.client || '').trim();
    const headline = String(req.body?.headline || '').trim();
    const metric = String(req.body?.metric || '').trim();
    if (!client || !headline || !metric) {
      res.status(400).json({ error: 'Client, headline, and quantified metric are required.' });
      return;
    }
    const item = {
      id: `cs-${crypto.randomBytes(3).toString('hex')}`,
      client: client.slice(0, 80),
      city: String(req.body?.city || 'Lahore').slice(0, 40),
      category: ['Agency', 'Academy', 'FYP'].includes(req.body?.category) ? req.body.category : 'Agency',
      headline: headline.slice(0, 120),
      metric: metric.slice(0, 80),
      beforeState: String(req.body?.beforeState || 'Initial audit & discovery baseline.').slice(0, 240),
      solution: String(req.body?.solution || 'Full-stack build & measurable conversion funnel.').slice(0, 240),
      testimonial: String(req.body?.testimonial || 'Delivered on schedule with clear analytics.').slice(0, 260),
      authorName: String(req.body?.authorName || client).slice(0, 60),
      authorRole: String(req.body?.authorRole || 'Partner').slice(0, 60),
    };
    store.caseStudies.unshift(item);
    saveStore(store);
    appendAudit(req.auth!.staff.name, req.auth!.staff.role, 'CASE_STUDY_ADDED', item.client, 'Success', item.metric);
    res.status(201).json({ caseStudy: item });
  });

  app.delete('/api/admin/showcase/:id', requireAuth, requirePerm('templates:manage'), (req: AuthedRequest, res) => {
    const idx = store.caseStudies.findIndex((c) => c.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Case study not found' });
      return;
    }
    const [removed] = store.caseStudies.splice(idx, 1);
    saveStore(store);
    appendAudit(req.auth!.staff.name, req.auth!.staff.role, 'CASE_STUDY_DELETED', removed.client, 'Warning', removed.headline);
    res.json({ ok: true });
  });

  // Security & 2FA Setup / Verification for current user
  app.post('/api/admin/security/2fa/init', requireAuth, (req: AuthedRequest, res) => {
    const staff = req.auth!.staff;
    const method = req.body?.method === 'sms' ? 'sms' : 'totp';
    if (method === 'totp') {
      staff.totpSecret = base32Encode(crypto.randomBytes(20));
      saveStore(store);
      const otpauthUri = `otpauth://totp/AsifDigital:${encodeURIComponent(staff.email)}?secret=${staff.totpSecret}&issuer=AsifDigital`;
      res.json({ method: 'totp', secret: staff.totpSecret, otpauthUri });
      return;
    }
    const code = String(crypto.randomInt(100000, 999999));
    pendingTwoFactor.set(`setup-${staff.id}`, { userId: staff.id, smsCode: code, expiresAt: Date.now() + 300000 });
    dispatchNotification('SMS', staff.email, 'two_factor_code', { name: staff.name, code });
    res.json({ method: 'sms', smsPreviewHint: `SMS code dispatched (preview: ${code})` });
  });

  app.post('/api/admin/security/2fa/confirm', requireAuth, (req: AuthedRequest, res) => {
    const staff = req.auth!.staff;
    const method = req.body?.method === 'sms' ? 'sms' : 'totp';
    const code = String(req.body?.code || '').trim();
    if (method === 'totp') {
      if (!verifyTOTP(staff.totpSecret, code)) {
        res.status(400).json({ error: 'Invalid authenticator code. Please check device clock and try again.' });
        return;
      }
    } else {
      const challenge = pendingTwoFactor.get(`setup-${staff.id}`);
      if (!challenge || challenge.smsCode !== code || challenge.expiresAt < Date.now()) {
        res.status(400).json({ error: 'Invalid or expired SMS verification code.' });
        return;
      }
      pendingTwoFactor.delete(`setup-${staff.id}`);
    }
    staff.twoFactorEnabled = true;
    staff.twoFactorMethod = method;
    saveStore(store);
    appendAudit(staff.name, staff.role, '2FA_ENABLED', staff.email, 'Success', `Activated ${method.toUpperCase()} two-factor auth.`);
    res.json({ user: sanitizeStaff(staff) });
  });

  app.post('/api/admin/security/2fa/disable', requireAuth, (req: AuthedRequest, res) => {
    const staff = req.auth!.staff;
    staff.twoFactorEnabled = false;
    staff.twoFactorMethod = 'none';
    saveStore(store);
    appendAudit(staff.name, staff.role, '2FA_DISABLED', staff.email, 'Warning', 'Two-factor authentication disabled by user.');
    res.json({ user: sanitizeStaff(staff) });
  });

  // Fulfill GDPR/CCPA Request + Audit
  app.post('/api/admin/gdpr/:id/fulfill', requireAuth, requirePerm('gdpr:manage'), (req: AuthedRequest, res) => {
    const item = store.gdprRequests.find((r) => r.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    if (item.type === 'Delete Data') {
      store.leads = store.leads.filter((l) => l.email.toLowerCase() !== item.email.toLowerCase());
    }
    item.status = 'Completed';
    item.completedAt = new Date().toISOString();
    saveStore(store);
    appendAudit(req.auth!.staff.name, req.auth!.staff.role, 'GDPR_REQUEST_FULFILLED', item.email, 'Success', `Fulfilled ${item.type}.`);
    res.json({ request: item });
  });

  // Run Vulnerability Scan
  app.post('/api/admin/security/scan', requireAuth, requirePerm('security:manage'), (req: AuthedRequest, res) => {
    const findings = buildVulnerabilityChecks(req.auth!.staff);
    appendAudit(req.auth!.staff.name, req.auth!.staff.role, 'SECURITY_VULNERABILITY_SCAN', 'Platform Posture', 'Success', `Evaluated ${findings.length} security controls.`);
    res.json({ findings, scannedAt: new Date().toISOString() });
  });

  // Email Templates Update & Test Send
  app.patch('/api/admin/templates/:id', requireAuth, requirePerm('templates:manage'), (req: AuthedRequest, res) => {
    const tpl = store.emailTemplates.find((t) => t.id === req.params.id);
    if (!tpl) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    if (typeof req.body?.subject === 'string') tpl.subject = req.body.subject.slice(0, 180);
    if (typeof req.body?.body === 'string') tpl.body = req.body.body.slice(0, 4000);
    if (typeof req.body?.enabled === 'boolean') tpl.enabled = req.body.enabled;
    tpl.updatedAt = new Date().toISOString();
    saveStore(store);
    appendAudit(req.auth!.staff.name, req.auth!.staff.role, 'EMAIL_TEMPLATE_UPDATED', tpl.key, 'Success', tpl.name);
    res.json({ template: tpl });
  });

  app.post('/api/admin/templates/:id/test', requireAuth, requirePerm('templates:manage'), (req: AuthedRequest, res) => {
    const tpl = store.emailTemplates.find((t) => t.id === req.params.id);
    if (!tpl) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    const log = dispatchNotification('Email', req.auth!.staff.email, tpl.key, {
      name: req.auth!.staff.name,
      service: 'Website Design & Growth Engine',
      timestamp: new Date().toLocaleString(),
      method: 'Template Test Dispatch',
      code: '482910',
    });
    res.json({ log });
  });

  // Vite Dev Middleware or Static Production Build
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws/live' });

  wss.on('connection', async (clientWs, req) => {
    const ai = getGeminiClient();
    if (!ai) {
      clientWs.send(JSON.stringify({ type: 'error', error: 'Gemini API key is not configured on the server.' }));
      clientWs.close();
      return;
    }

    const url = new URL(req.url || '/ws/live', 'http://localhost');
    const requestedVoice = url.searchParams.get('voice') || 'Zephyr';
    const voiceName = ['Zephyr', 'Kore', 'Puck', 'Fenrir', 'Charon'].includes(requestedVoice)
      ? requestedVoice
      : 'Zephyr';
    const mode = url.searchParams.get('mode') || 'agency';

    const modePrompts: Record<string, string> = {
      agency:
        'You are the Senior Solutions Consultant at Asif Digital Solutions (Bahawalpur & Lahore, Pakistan). Help clients scope high-converting websites, Shopify/WooCommerce stores, SEO growth campaigns, and budgets in PKR cleanly and concisely.',
      academy:
        'You are the Career Academy Advisor at Asif Digital Solutions. Help students choose between Graphic Design & Craft, Python & Data Foundations, Social Media & Content AI, and SEO/Copywriting tracks, sharing realistic timelines and freelance outcomes.',
      fyp: 'You are the FYP Architecture Mentor at Asif Digital Solutions. Help CS/SE/IT university students refine their Final Year Project scope, system architecture, dataset/ML choices, and defense milestones.',
    };

    let liveSession: Awaited<ReturnType<typeof ai.live.connect>> | null = null;
    let isClosing = false;

    try {
      liveSession = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: modePrompts[mode] || modePrompts.agency,
        },
        callbacks: {
          onopen: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'ready', voiceName, mode }));
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== WebSocket.OPEN) return;
            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              clientWs.send(JSON.stringify({ type: 'inputTranscript', text: content.inputTranscription.text }));
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(JSON.stringify({ type: 'outputTranscript', text: content.outputTranscription.text }));
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ type: 'audio', data: part.inlineData.data }));
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ type: 'interrupted' }));
            }
            if (content?.turnComplete) {
              clientWs.send(JSON.stringify({ type: 'turnComplete' }));
            }
          },
          onerror: (err) => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'error', error: err?.message || 'Live session error.' }));
            }
          },
          onclose: () => {
            if (!isClosing && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'closed' }));
            }
          },
        },
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'error', error: formatted.message }));
        clientWs.close();
      }
      return;
    }

    clientWs.on('message', (raw) => {
      if (!liveSession) return;
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'audio' && typeof msg.data === 'string' && msg.data.length > 0) {
          liveSession.sendRealtimeInput({
            audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (msg.type === 'text' && typeof msg.text === 'string' && msg.text.trim().length > 0) {
          liveSession.sendRealtimeInput({
            text: msg.text.trim().slice(0, 600),
          });
        }
      } catch {
        // Ignore malformed frame
      }
    });

    clientWs.on('close', () => {
      isClosing = true;
      try {
        liveSession?.close();
      } catch {
        // Already closed
      }
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Asif Digital Solutions server running on http://0.0.0.0:${PORT}`);
  });
}

function buildVulnerabilityChecks(currentUser: StaffRecord) {
  const twoFaRatio = store.staff.filter((s) => s.twoFactorEnabled).length / Math.max(1, store.staff.length);
  const hasPendingGdpr = store.gdprRequests.some((r) => r.status === 'Pending');
  return [
    {
      id: 'chk-hash',
      control: 'Server-Side Scrypt Password Hashing',
      category: 'Authentication',
      severity: 'Pass',
      finding: 'Credentials use 16-byte random salt with crypto.scryptSync and timingSafeEqual comparison.',
      remediation: 'No action required.',
    },
    {
      id: 'chk-2fa',
      control: 'Multi-Factor & Biometric Adoption',
      category: 'Authentication',
      severity: currentUser.twoFactorEnabled && twoFaRatio >= 0.75 ? 'Pass' : 'Advisory',
      finding: `${Math.round(twoFaRatio * 100)}% of staff accounts have 2FA enabled (${currentUser.twoFactorEnabled ? 'your account is protected' : 'your account 2FA is off'}).`,
      remediation: currentUser.twoFactorEnabled ? 'Maintain authenticator or biometric passkeys.' : 'Enable TOTP or SMS 2FA in the Security tab.',
    },
    {
      id: 'chk-session',
      control: 'In-Memory Signed Bearer Session Tokens',
      category: 'API Security',
      severity: 'Pass',
      finding: 'HMAC-SHA256 tokens stay in React memory (never persisted to localStorage) with 12h expiry.',
      remediation: 'No action required.',
    },
    {
      id: 'chk-ssrf',
      control: 'CRM Webhook SSRF & Private IP Guardrail',
      category: 'API Security',
      severity: 'Pass',
      finding: 'Outbound webhook configurations block localhost, loopback, link-local metadata, and RFC1918 ranges.',
      remediation: 'No action required.',
    },
    {
      id: 'chk-headers',
      control: 'HTTP Hardening & Transport Headers',
      category: 'Transport & Headers',
      severity: 'Pass',
      finding: 'nosniff, strict referrer policy, and camera/mic permissions policy enforced on all routes.',
      remediation: 'No action required.',
    },
    {
      id: 'chk-gdpr',
      control: 'GDPR / CCPA Data Subject SLA Queue',
      category: 'Data Privacy',
      severity: hasPendingGdpr ? 'Advisory' : 'Pass',
      finding: hasPendingGdpr ? '1 or more privacy requests await fulfillment in the Compliance tab.' : 'All privacy export/deletion requests are fulfilled.',
      remediation: hasPendingGdpr ? 'Review and fulfill pending requests within 30-day SLA.' : 'No action required.',
    },
  ];
}

startServer().catch((err) => {
  console.error('Server startup error:', err);
  process.exit(1);
});
