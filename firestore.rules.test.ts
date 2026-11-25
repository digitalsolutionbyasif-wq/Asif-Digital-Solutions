/**
 * Payload-First Security Rules Test Matrix (mirrors security_spec.md Dirty Dozen)
 * Documents the expected ALLOW / PERMISSION_DENIED outcomes for every collection.
 */
export interface RuleTestCase {
  id: string;
  description: string;
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  authUid: string | null;
  emailVerified: boolean;
  email?: string;
  payload?: Record<string, unknown>;
  expected: 'ALLOW' | 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: RuleTestCase[] = [
  {
    id: 'DD-01',
    description: 'Unauthenticated read on user profile',
    path: '/users/uid_1',
    operation: 'get',
    authUid: null,
    emailVerified: false,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-02',
    description: 'Unverified email creating user profile',
    path: '/users/uid_1',
    operation: 'create',
    authUid: 'uid_1',
    emailVerified: false,
    payload: { uid: 'uid_1', displayName: 'Test', email: 'a@b.com', role: 'client' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-03',
    description: 'Cross-tenant list on another user briefs',
    path: '/users/uid_1/briefs',
    operation: 'list',
    authUid: 'uid_2',
    emailVerified: true,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-04',
    description: 'Role self-escalation to admin on profile create',
    path: '/users/uid_1',
    operation: 'create',
    authUid: 'uid_1',
    emailVerified: true,
    payload: { uid: 'uid_1', displayName: 'Attacker', email: 'a@b.com', role: 'admin' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-05',
    description: 'Shadow ghost field isApproved on brief create',
    path: '/users/uid_1/briefs/brief_1',
    operation: 'create',
    authUid: 'uid_1',
    emailVerified: true,
    payload: {
      id: 'brief_1',
      ownerId: 'uid_1',
      title: 'Storefront',
      serviceTrack: 'E-Commerce',
      budgetEstimate: 'PKR 120,000',
      aiSummary: 'Summary',
      status: 'Draft',
      isApproved: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-06',
    description: 'Owner spoofing inside brief payload',
    path: '/users/uid_2/briefs/brief_1',
    operation: 'create',
    authUid: 'uid_2',
    emailVerified: true,
    payload: {
      id: 'brief_1',
      ownerId: 'uid_1',
      title: 'Spoofed',
      serviceTrack: 'SEO',
      budgetEstimate: 'PKR 50,000',
      aiSummary: 'Summary',
      status: 'Draft',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-07',
    description: 'Orphaned subcollection brief without parent user doc',
    path: '/users/uid_orphan/briefs/brief_1',
    operation: 'create',
    authUid: 'uid_orphan',
    emailVerified: true,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-08',
    description: 'Invalid path document ID containing illegal characters',
    path: '/users/uid_1/briefs/bad$id!',
    operation: 'create',
    authUid: 'uid_1',
    emailVerified: true,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-09',
    description: 'Oversized aiSummary exceeding 3000 chars',
    path: '/users/uid_1/briefs/brief_long',
    operation: 'create',
    authUid: 'uid_1',
    emailVerified: true,
    payload: { aiSummary: 'x'.repeat(3005) },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-10',
    description: 'Client-spoofed createdAt timestamp instead of serverTimestamp',
    path: '/users/uid_1/briefs/brief_time',
    operation: 'create',
    authUid: 'uid_1',
    emailVerified: true,
    payload: { createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-11',
    description: 'Updating archived brief without admin rights',
    path: '/users/uid_1/briefs/brief_archived',
    operation: 'update',
    authUid: 'uid_1',
    emailVerified: true,
    payload: { title: 'Mutate Archived' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-12',
    description: 'Value poisoning status outside allowed enum',
    path: '/users/uid_1/briefs/brief_1',
    operation: 'update',
    authUid: 'uid_1',
    emailVerified: true,
    payload: { status: 'AdminApproved' },
    expected: 'PERMISSION_DENIED',
  },
];
