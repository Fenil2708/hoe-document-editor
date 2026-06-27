'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/context/AppContext';
import { History, Plus, Clock, User, ArrowLeft, RotateCcw, AlertTriangle } from 'lucide-react';
import { DBVersion, getLocalVersions, saveLocalVersion } from '@/lib/indexeddb';

interface VersionsProps {
  previewVersionId: string | null;
  setPreviewVersion: (version: DBVersion | null) => void;
}

export default function Versions({ previewVersionId, setPreviewVersion }: VersionsProps) {
  const { activeDocumentId, isOnline, isSimulatedOffline, user, versionTrigger, triggerLocalUpdate } = useApp();
  const [versions, setVersions] = useState<DBVersion[]>([]);
  const [newVersionName, setNewVersionName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fetchVersions = useCallback(async () => {
    if (!activeDocumentId) return;
    setIsLoading(true);
    try {
      // 1. First fetch local copies from IndexedDB
      const local = await getLocalVersions(activeDocumentId);
      setVersions(local);

      // 2. If online, fetch fresh versions from server and update local IndexedDB
      const online = isOnline && !isSimulatedOffline;
      if (online) {
        const res = await fetch(`/api/documents/${activeDocumentId}/versions`);
        const data = await res.json();
        if (data.success && data.versions) {
          const freshVersions = data.versions as DBVersion[];
          
          // Save to IndexedDB
          for (const ver of freshVersions) {
            await saveLocalVersion(ver);
          }
          
          setVersions(freshVersions);
        }
      }
    } catch (err) {
      console.error('Failed to load version history:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeDocumentId, isOnline, isSimulatedOffline]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions, activeDocumentId, versionTrigger]);

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDocumentId || !newVersionName.trim() || isSaving) return;

    const online = isOnline && !isSimulatedOffline;
    if (!online) {
      alert('You must be online to capture a new document version snapshot.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/documents/${activeDocumentId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newVersionName.trim() }),
      });
      const data = await res.json();
      if (data.success && data.version) {
        await saveLocalVersion(data.version);
        setNewVersionName('');
        triggerLocalUpdate();
      } else {
        alert(data.error || 'Failed to save snapshot');
      }
    } catch (err) {
      alert('Failed to connect to version server');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col max-h-[400px]">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-text flex items-center gap-1.5 border-b border-border/50 pb-2">
        <History className="h-3.5 w-3.5" />
        Version History & Time Travel
      </h3>

      {/* Snapshot Form */}
      {user && (
        <form onSubmit={handleCreateSnapshot} className="mt-3 flex gap-1.5">
          <input
            type="text"
            required
            placeholder="Save named snapshot..."
            value={newVersionName}
            onChange={(e) => setNewVersionName(e.target.value)}
            disabled={isSaving}
            className="flex-grow rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-text focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            disabled={isSaving || !newVersionName.trim()}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/95 transition disabled:opacity-50 flex items-center justify-center"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </form>
      )}

      {/* Timelines */}
      <div className="mt-4 flex-grow overflow-y-auto space-y-3 pr-1">
        {isLoading && versions.length === 0 ? (
          <div className="text-center text-xs text-muted-text py-4">Loading history...</div>
        ) : versions.length === 0 ? (
          <div className="text-center text-xs text-muted-text py-6 leading-relaxed">
            No snapshots recorded yet. Record a named snapshot above.
          </div>
        ) : (
          versions.map((ver) => {
            const isPreviewing = previewVersionId === ver.id;
            const formattedDate = new Date(ver.createdAt).toLocaleTimeString([], {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={ver.id}
                onClick={() => setPreviewVersion(isPreviewing ? null : ver)}
                className={`relative cursor-pointer rounded-lg border p-2.5 transition text-left ${
                  isPreviewing
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border/60 bg-background/50 hover:bg-muted-bg hover:border-border'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold line-clamp-1 break-all">
                    {ver.name}
                  </span>
                  {isPreviewing && (
                    <span className="shrink-0 rounded bg-primary px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider text-primary-foreground animate-pulse-slow">
                      Viewing
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-text">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formattedDate}
                  </span>
                  <span className="flex items-center gap-1 font-medium">
                    <User className="h-3 w-3" />
                    {ver.createdBy}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {previewVersionId && (
        <div className="mt-3 border-t border-border/50 pt-2 flex items-center justify-between">
          <button
            onClick={() => setPreviewVersion(null)}
            className="flex items-center gap-1 text-[10px] font-semibold text-muted-text hover:text-foreground transition"
          >
            <ArrowLeft className="h-3 w-3" />
            Exit Preview
          </button>
          <span className="text-[10px] text-amber-500 font-semibold flex items-center gap-1 bg-amber-500/10 px-1.5 py-0.5 rounded">
            <AlertTriangle className="h-2.5 w-2.5" />
            Time Travel Mode
          </span>
        </div>
      )}
    </div>
  );
}
