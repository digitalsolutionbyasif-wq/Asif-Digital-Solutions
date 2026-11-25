export type PermissionKey =
  | 'analytics:read'
  | 'leads:read'
  | 'leads:write'
  | 'ab:manage'
  | 'crm:sync'
  | 'gdpr:manage'
  | 'security:manage'
  | 'rbac:manage'
  | 'templates:manage';

export type RoleName = 'Super Admin' | 'Agency Manager' | 'Course Instructor' | 'Growth Analyst' | 'Client Viewer';

export interface StaffAccount {
  id: string;
  name: string;
  email: string;
  role: RoleName;
  permissions: PermissionKey[];
  twoFactorEnabled: boolean;
  twoFactorMethod: 'totp' | 'sms' | 'none';
  biometricEnabled: boolean;
  lastLoginAt: string | null;
  active: boolean;
}

export interface LeadRecord {
  id: string;
  name: string;
  phone: string;
  email: string;
  service: string;
  category: 'agency' | 'course' | 'fyp';
  notes: string;
  stage: 'New' | 'Nurturing' | 'Qualified' | 'Enrolled' | 'Closed';
  sourceVariant: 'A' | 'B';
  consentMarketing: boolean;
  sequenceStep: number;
  sequenceStatus: 'Active' | 'Completed' | 'Paused';
  crmSynced: boolean;
  preferredSlot?: string;
  estimatedBudget?: string;
  createdAt: string;
  updatedAt: string;
  offlineQueued?: boolean;
}

export interface ABVariantStats {
  variant: 'A' | 'B';
  name: string;
  headline: string;
  subheadline: string;
  ctaLabel: string;
  impressions: number;
  conversions: number;
  weight: number;
}

export interface ABExperiment {
  id: string;
  name: string;
  status: 'Running' | 'Winner Selected';
  winner: 'A' | 'B' | null;
  variants: {
    A: ABVariantStats;
    B: ABVariantStats;
  };
}

export interface HeatmapPoint {
  id: string;
  section: 'hero' | 'services' | 'academy' | 'fyp' | 'contact';
  xPct: number;
  yPct: number;
  device: 'desktop' | 'mobile';
  variant: 'A' | 'B';
  label: string;
  timestamp: string;
}

export interface NurturingSequenceStep {
  step: number;
  delayLabel: string;
  channel: 'Email' | 'WhatsApp Brief';
  subject: string;
  summary: string;
  sentCount: number;
  openRatePct: number;
}

export interface CRMConfig {
  provider: 'HubSpot' | 'Zoho CRM' | 'Custom Webhook';
  webhookUrl: string;
  autoSync: boolean;
  lastSyncAt: string | null;
  syncedCount: number;
}

export interface GDPRRequest {
  id: string;
  email: string;
  type: 'Export Data' | 'Delete Data' | 'Do Not Sell (CCPA)';
  status: 'Pending' | 'Completed';
  requestedAt: string;
  completedAt: string | null;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  role: string;
  action: string;
  target: string;
  status: 'Success' | 'Warning' | 'Blocked';
  detail: string;
}

export interface VulnerabilityCheck {
  id: string;
  control: string;
  category: 'Authentication' | 'Transport & Headers' | 'Data Privacy' | 'API Security';
  severity: 'Pass' | 'Advisory' | 'Action Needed';
  finding: string;
  remediation: string;
}

export interface EmailTemplate {
  id: string;
  key: 'welcome_lead' | 'course_enrollment' | 'login_alert' | 'two_factor_code';
  name: string;
  subject: string;
  body: string;
  enabled: boolean;
  updatedAt: string;
}

export interface NotificationLogEntry {
  id: string;
  channel: 'Email' | 'SMS' | 'Push';
  recipient: string;
  subject: string;
  preview: string;
  status: 'Delivered' | 'Queued';
  timestamp: string;
}

export interface ConsentPreferences {
  essential: true;
  analytics: boolean;
  marketing: boolean;
  savedAt: string;
}

export interface CourseItem {
  id: string;
  title: string;
  track: string;
  duration: string;
  level: string;
  feePkr: string;
  format: string;
  image: string;
  summary: string;
  outcomes: string[];
  syllabus: string[];
}

export interface ServiceItem {
  index: string;
  title: string;
  tier: 'Core Foundations' | 'Growth & Automation';
  outcome: string;
  deliverables: string;
}

export interface AuthSessionState {
  initialized: boolean;
  envPasscodeActive: boolean;
  authenticated: boolean;
  requiresTwoFactor: boolean;
  pendingToken: string | null;
  token: string | null;
  user: StaffAccount | null;
}

export interface CaseStudyItem {
  id: string;
  client: string;
  city: string;
  category: 'Agency' | 'Academy' | 'FYP';
  headline: string;
  metric: string;
  beforeState: string;
  solution: string;
  testimonial: string;
  authorName: string;
  authorRole: string;
}

export interface ActiveSessionInfo {
  sidPrefix: string;
  email: string;
  role: RoleName;
  device: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export type ThemeId = 'sapphire-light' | 'obsidian-dark' | 'emerald-dark' | 'ivory-editorial';

export interface StrategyBriefOutput {
  headline: string;
  recommendedService: string;
  timeline: string;
  roadmapSteps: string[];
  techStack: string[];
  estimatedImpact: string;
}

export interface FirestoreBriefDoc {
  id: string;
  ownerId: string;
  title: string;
  serviceTrack: string;
  budgetEstimate: string;
  notes?: string;
  aiSummary: string;
  status: 'Draft' | 'Submitted' | 'Archived';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FirestoreVoiceSessionDoc {
  id: string;
  ownerId: string;
  mode: 'Agency Scoping' | 'Academy Advisor' | 'FYP Architecture';
  voiceName: 'Zephyr' | 'Kore' | 'Puck' | 'Fenrir' | 'Charon';
  userTranscript: string;
  assistantTranscript: string;
  createdAt?: unknown;
}

export interface FirestoreAssetDoc {
  id: string;
  ownerId: string;
  prompt: string;
  aspectRatio: '1:1' | '4:3' | '3:4' | '16:9' | '9:16';
  imageSize: '1K' | '2K' | '4K';
  operation: 'generate' | 'edit';
  createdAt?: unknown;
}

