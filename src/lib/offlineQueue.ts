export interface QueuedLeadPayload {
  id: string;
  name: string;
  phone: string;
  email: string;
  service: string;
  category: 'agency' | 'course' | 'fyp';
  notes: string;
  sourceVariant: 'A' | 'B';
  consentMarketing: boolean;
  queuedAt: string;
}

const DB_NAME = 'asif-digital-offline-db';
const DB_VERSION = 1;
const STORE_LEADS = 'queued_leads';

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_LEADS)) {
        db.createObjectStore(STORE_LEADS, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed opening IndexedDB'));
  });
}

export async function queueLeadOffline(
  payload: Omit<QueuedLeadPayload, 'id' | 'queuedAt'>
): Promise<QueuedLeadPayload> {
  const item: QueuedLeadPayload = {
    ...payload,
    id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    queuedAt: new Date().toISOString(),
  };

  try {
    const db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_LEADS, 'readwrite');
      tx.objectStore(STORE_LEADS).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Graceful fallback if private browsing disables IndexedDB
  }
  return item;
}

export async function getQueuedLeads(): Promise<QueuedLeadPayload[]> {
  try {
    const db = await openOfflineDb();
    const items = await new Promise<QueuedLeadPayload[]>((resolve, reject) => {
      const tx = db.transaction(STORE_LEADS, 'readonly');
      const req = tx.objectStore(STORE_LEADS).getAll();
      req.onsuccess = () => resolve((req.result as QueuedLeadPayload[]) || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return items;
  } catch {
    return [];
  }
}

export async function removeQueuedLead(id: string): Promise<void> {
  try {
    const db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_LEADS, 'readwrite');
      tx.objectStore(STORE_LEADS).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore cleanup errors
  }
}

export async function flushLeadQueue(): Promise<{ synced: number; remaining: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const pending = await getQueuedLeads();
    return { synced: 0, remaining: pending.length };
  }

  const queued = await getQueuedLeads();
  let synced = 0;

  for (const item of queued) {
    try {
      const res = await fetch('/api/public/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: item.name,
          phone: item.phone,
          email: item.email,
          service: item.service,
          category: item.category,
          notes: item.notes,
          sourceVariant: item.sourceVariant,
          consentMarketing: item.consentMarketing,
        }),
      });
      if (res.ok || res.status === 400) {
        await removeQueuedLead(item.id);
        if (res.ok) synced += 1;
      }
    } catch {
      break;
    }
  }

  const remaining = (await getQueuedLeads()).length;
  return { synced, remaining };
}
