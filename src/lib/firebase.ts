import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: Array<{
      providerId?: string | null;
      email?: string | null;
    }>;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let connectionChecked = false;
export async function testFirestoreConnection(): Promise<void> {
  if (connectionChecked) return;
  connectionChecked = true;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Firestore offline or unreachable. Check Firebase configuration.');
    }
  }
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleAuthProvider);
  await ensureUserProfile(result.user);
  return result.user;
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

function makeSafeId(prefix: string): string {
  const raw =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 14)
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}_${raw}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
}

export async function ensureUserProfile(user: User): Promise<void> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  const displayName = (user.displayName || user.email?.split('@')[0] || 'Client').trim().slice(0, 100);
  const email = (user.email || '').trim().slice(0, 160);
  const photoURL = (user.photoURL || '').trim().slice(0, 500);

  if (!email) return;

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const payload: Record<string, unknown> = {
        uid: user.uid,
        displayName,
        email,
        role: 'client',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (photoURL) payload.photoURL = photoURL;
      await setDoc(ref, payload);
    } else {
      const updatePayload: Record<string, unknown> = {
        displayName,
        updatedAt: serverTimestamp(),
      };
      if (photoURL) updatePayload.photoURL = photoURL;
      await updateDoc(ref, updatePayload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function saveProjectBrief(
  uid: string,
  input: {
    title: string;
    serviceTrack: string;
    budgetEstimate: string;
    notes?: string;
    aiSummary: string;
  }
): Promise<string> {
  const briefId = makeSafeId('brief');
  const path = `users/${uid}/briefs/${briefId}`;
  const payload: Record<string, unknown> = {
    id: briefId,
    ownerId: uid,
    title: input.title.trim().slice(0, 140) || 'Project Brief',
    serviceTrack: input.serviceTrack.trim().slice(0, 80) || 'Agency Build',
    budgetEstimate: input.budgetEstimate.trim().slice(0, 60) || 'Custom Scope',
    aiSummary: input.aiSummary.trim().slice(0, 3000) || 'Strategy roadmap saved.',
    status: 'Draft',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (input.notes && input.notes.trim()) {
    payload.notes = input.notes.trim().slice(0, 1500);
  }

  try {
    await setDoc(doc(db, 'users', uid, 'briefs', briefId), payload);
    return briefId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateBriefStatus(
  uid: string,
  briefId: string,
  status: 'Draft' | 'Submitted' | 'Archived'
): Promise<void> {
  const path = `users/${uid}/briefs/${briefId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'briefs', briefId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteBriefDoc(uid: string, briefId: string): Promise<void> {
  const path = `users/${uid}/briefs/${briefId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'briefs', briefId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveVoiceSessionDoc(
  uid: string,
  input: {
    mode: 'Agency Scoping' | 'Academy Advisor' | 'FYP Architecture';
    voiceName: 'Zephyr' | 'Kore' | 'Puck' | 'Fenrir' | 'Charon';
    userTranscript: string;
    assistantTranscript: string;
  }
): Promise<string> {
  const sessionId = makeSafeId('voice');
  const path = `users/${uid}/voiceSessions/${sessionId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'voiceSessions', sessionId), {
      id: sessionId,
      ownerId: uid,
      mode: input.mode,
      voiceName: input.voiceName,
      userTranscript: input.userTranscript.trim().slice(0, 3000),
      assistantTranscript: input.assistantTranscript.trim().slice(0, 4000),
      createdAt: serverTimestamp(),
    });
    return sessionId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteVoiceSessionDoc(uid: string, sessionId: string): Promise<void> {
  const path = `users/${uid}/voiceSessions/${sessionId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'voiceSessions', sessionId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveCreativeAssetLog(
  uid: string,
  input: {
    prompt: string;
    aspectRatio: '1:1' | '4:3' | '3:4' | '16:9' | '9:16';
    imageSize: '1K' | '2K' | '4K';
    operation: 'generate' | 'edit';
  }
): Promise<string> {
  const assetId = makeSafeId('asset');
  const path = `users/${uid}/assets/${assetId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'assets', assetId), {
      id: assetId,
      ownerId: uid,
      prompt: input.prompt.trim().slice(0, 800),
      aspectRatio: input.aspectRatio,
      imageSize: input.imageSize,
      operation: input.operation,
      createdAt: serverTimestamp(),
    });
    return assetId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteCreativeAssetDoc(uid: string, assetId: string): Promise<void> {
  const path = `users/${uid}/assets/${assetId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'assets', assetId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function getUserBriefsCollection(uid: string) {
  return collection(db, 'users', uid, 'briefs');
}

export function getUserVoiceCollection(uid: string) {
  return collection(db, 'users', uid, 'voiceSessions');
}

export function getUserAssetsCollection(uid: string) {
  return collection(db, 'users', uid, 'assets');
}
