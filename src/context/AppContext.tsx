'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { BlockState, mergeBlocks } from '@/lib/sync';
import {
  getLocalBlocksWithTombstones,
  saveLocalBlocks,
  getPendingSyncItems,
  clearSyncQueueItems,
} from '@/lib/indexeddb';

export interface UserSession {
  id: string;
  name: string;
  email: string;
}

export type SyncStatus = 'SYNCED' | 'SYNCING' | 'OFFLINE' | 'ERROR';

interface AppContextType {
  user: UserSession | null;
  isLoadingAuth: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  
  // Network simulation
  isOnline: boolean;
  isSimulatedOffline: boolean;
  setSimulatedOffline: (val: boolean) => void;
  simulatedLatency: number; // in ms
  setSimulatedLatency: (val: number) => void;
  
  // Document state triggers
  activeDocumentId: string | null;
  setActiveDocumentId: (id: string | null) => void;
  syncStatus: SyncStatus;
  syncQueueSize: number;
  updateQueueSize: () => Promise<void>;
  versionTrigger: number;
  triggerLocalUpdate: () => void;
  forceSync: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  
  // Network state
  const [isOnline, setIsOnline] = useState(true);
  const [isSimulatedOffline, setSimulatedOffline] = useState(false);
  const [simulatedLatency, setSimulatedLatency] = useState(0);
  
  // Document and sync state
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('SYNCED');
  const [syncQueueSize, setSyncQueueSize] = useState(0);
  const [versionTrigger, setVersionTrigger] = useState(0);
  const [clientId] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('editor_client_id');
      if (stored) return stored;
      const created = crypto.randomUUID();
      localStorage.setItem('editor_client_id', created);
      return created;
    }
    return '';
  });

  // Check physical online status
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsOnline(window.navigator.onLine);
    
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Fetch session on load
  const fetchSession = useCallback(async () => {
    setIsLoadingAuth(true);
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Failed to load session:', err);
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUser(data.user);
        return { success: true };
      }
      return { success: false, error: data.error || 'Login failed' };
    } catch (err) {
      return { success: false, error: 'Network error connecting to auth server' };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
      setUser(null);
      setActiveDocumentId(null);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Helper to trigger UI refreshes when IndexedDB changes
  const triggerLocalUpdate = useCallback(() => {
    setVersionTrigger(prev => prev + 1);
  }, []);

  const updateQueueSize = useCallback(async () => {
    if (!activeDocumentId) {
      setSyncQueueSize(0);
      return;
    }
    const items = await getPendingSyncItems(activeDocumentId);
    setSyncQueueSize(items.length);
  }, [activeDocumentId]);

  // Read auth token from cookies (we need it for SSE query parameter since standard EventSource doesn't support headers)
  const getAuthTokenFromDocumentCookies = () => {
    if (typeof document === 'undefined') return '';
    const name = 'auth_token=';
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1);
      if (c.indexOf(name) === 0) return c.substring(name.length, c.length);
    }
    return '';
  };

  // Sync execution logic
  const performSync = useCallback(async () => {
    if (!activeDocumentId || !user) return;
    
    const online = isOnline && !isSimulatedOffline;
    if (!online) {
      setSyncStatus('OFFLINE');
      return;
    }

    setSyncStatus('SYNCING');
    try {
      // Get pending mutations
      const pending = await getPendingSyncItems(activeDocumentId);
      
      // Simulate latency if configured
      if (simulatedLatency > 0) {
        await new Promise(r => setTimeout(r, simulatedLatency));
      }

      // Sync request
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: activeDocumentId,
          clientId,
          mutations: pending.map(p => p.mutation),
        }),
      });

      if (!res.ok) {
        throw new Error(`Sync API returned ${res.status}`);
      }

      const data = await res.json();
      if (data.success) {
        // Merge remote blocks into IndexedDB
        const local = await getLocalBlocksWithTombstones(activeDocumentId);
        const merged = mergeBlocks(local, data.serverBlocks);
        await saveLocalBlocks(merged);

        // Clear sync queue up to processed items
        if (pending.length > 0) {
          const maxId = Math.max(...pending.map(p => p.id || 0));
          if (maxId > 0) {
            await clearSyncQueueItems(maxId);
          }
        }

        await updateQueueSize();
        setSyncStatus('SYNCED');
        triggerLocalUpdate();
      } else {
        setSyncStatus('ERROR');
      }
    } catch (err) {
      console.error('Sync failed:', err);
      setSyncStatus('ERROR');
    }
  }, [activeDocumentId, clientId, isOnline, isSimulatedOffline, simulatedLatency, user, triggerLocalUpdate, updateQueueSize]);

  // Background sync daemon (polls every 5 seconds or whenever queue updates)
  useEffect(() => {
    if (!activeDocumentId || !user) return;

    // Immediately trigger initial sync
    performSync();

    const interval = setInterval(() => {
      performSync();
    }, 5000);

    return () => clearInterval(interval);
  }, [activeDocumentId, user, performSync]);

  // Keep queue size updated in real-time
  useEffect(() => {
    updateQueueSize();
  }, [activeDocumentId, versionTrigger, updateQueueSize]);

  // SSE stream listener for real-time upstream notifications
  useEffect(() => {
    if (!activeDocumentId || !user) return;
    
    const online = isOnline && !isSimulatedOffline;
    if (!online) return;

    const token = getAuthTokenFromDocumentCookies();
    if (!token) return;

    // Establish connection
    const es = new EventSource(`/api/documents/${activeDocumentId}/stream?clientId=${clientId}&token=${token}`);

    es.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'SYNC_MUTATIONS') {
          // If changes were pushed by another collaborator, merge them locally!
          const incomingMutations = payload.data as BlockState[];
          const local = await getLocalBlocksWithTombstones(activeDocumentId);
          const merged = mergeBlocks(local, incomingMutations);
          
          await saveLocalBlocks(merged);
          triggerLocalUpdate();
        }
      } catch (err) {
        console.error('Error parsing SSE payload:', err);
      }
    };

    es.onerror = () => {
      // EventSource automatically retries, but we print log for debugging
      console.warn('SSE stream encountered an error; reconnecting...');
    };

    return () => {
      es.close();
    };
  }, [activeDocumentId, isOnline, isSimulatedOffline, clientId, user, triggerLocalUpdate]);

  return (
    <AppContext.Provider
      value={{
        user,
        isLoadingAuth,
        login,
        logout,
        isOnline,
        isSimulatedOffline,
        setSimulatedOffline,
        simulatedLatency,
        setSimulatedLatency,
        activeDocumentId,
        setActiveDocumentId,
        syncStatus,
        syncQueueSize,
        updateQueueSize,
        versionTrigger,
        triggerLocalUpdate,
        forceSync: performSync,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
