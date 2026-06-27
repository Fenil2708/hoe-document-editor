import { BlockState } from './sync';

const DB_NAME = 'EdtechDocEditor';
const DB_VERSION = 1;

export interface DBDocument {
  id: string;
  title: string;
  ownerId: string;
  updatedAt: string;
}

export interface DBSyncItem {
  id?: number;
  documentId: string;
  blockId: string;
  mutation: BlockState;
}

export interface DBVersion {
  id: string;
  documentId: string;
  name: string;
  blocksData: string; // JSON string of blocks
  createdAt: string;
  createdBy: string;
}

export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('IndexedDB is not available on server-side'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('documents')) {
        db.createObjectStore('documents', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('blocks')) {
        const blockStore = db.createObjectStore('blocks', { keyPath: 'id' });
        blockStore.createIndex('documentId', 'documentId', { unique: false });
      }
      if (!db.objectStoreNames.contains('syncQueue')) {
        const queueStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
        queueStore.createIndex('documentId', 'documentId', { unique: false });
      }
      if (!db.objectStoreNames.contains('versions')) {
        const versionStore = db.createObjectStore('versions', { keyPath: 'id' });
        versionStore.createIndex('documentId', 'documentId', { unique: false });
      }
    };
  });
}

export async function saveLocalDocument(doc: DBDocument): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readwrite');
    const store = tx.objectStore('documents');
    const req = store.put(doc);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getLocalDocuments(): Promise<DBDocument[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readonly');
    const store = tx.objectStore('documents');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getLocalDocument(id: string): Promise<DBDocument | null> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readonly');
    const store = tx.objectStore('documents');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveLocalBlocks(blocks: BlockState[]): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blocks', 'readwrite');
    const store = tx.objectStore('blocks');
    for (const block of blocks) {
      store.put(block);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getLocalBlocks(documentId: string): Promise<BlockState[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blocks', 'readonly');
    const store = tx.objectStore('blocks');
    const index = store.index('documentId');
    const req = index.getAll(documentId);
    req.onsuccess = () => {
      const results: BlockState[] = req.result || [];
      // Sort blocks by position lexicographically, filtering out isDeleted blocks
      const sorted = results
        .filter(b => !b.isDeleted)
        .sort((a, b) => a.position.localeCompare(b.position));
      resolve(sorted);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getLocalBlocksWithTombstones(documentId: string): Promise<BlockState[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blocks', 'readonly');
    const store = tx.objectStore('blocks');
    const index = store.index('documentId');
    const req = index.getAll(documentId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueSyncMutation(item: Omit<DBSyncItem, 'id'>): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readwrite');
    const store = tx.objectStore('syncQueue');
    const req = store.add(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingSyncItems(documentId: string): Promise<DBSyncItem[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readonly');
    const store = tx.objectStore('syncQueue');
    const index = store.index('documentId');
    const req = index.getAll(documentId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function clearSyncQueueItems(upToId: number): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readwrite');
    const store = tx.objectStore('syncQueue');
    // We open a cursor and delete items with id <= upToId
    const keyRange = IDBKeyRange.upperBound(upToId);
    const req = store.openCursor(keyRange);
    req.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveLocalVersion(version: DBVersion): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('versions', 'readwrite');
    const store = tx.objectStore('versions');
    const req = store.put(version);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getLocalVersions(documentId: string): Promise<DBVersion[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('versions', 'readonly');
    const store = tx.objectStore('versions');
    const index = store.index('documentId');
    const req = index.getAll(documentId);
    req.onsuccess = () => {
      const results: DBVersion[] = req.result || [];
      // Sort newest versions first
      const sorted = results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      resolve(sorted);
    };
    req.onerror = () => reject(req.error);
  });
}
