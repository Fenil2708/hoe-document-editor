'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/context/AppContext';
import { Users, UserPlus, Shield, Trash2, Check, RefreshCw } from 'lucide-react';

interface Collaborator {
  id: string;
  role: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export default function Collaborators() {
  const { activeDocumentId, isOnline, isSimulatedOffline, user } = useApp();
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'EDITOR' | 'VIEWER'>('EDITOR');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchCollaborators = useCallback(async () => {
    if (!activeDocumentId) return;
    const online = isOnline && !isSimulatedOffline;
    if (!online) return;

    setIsLoading(true);
    try {
      const res = await fetch(`/api/documents/${activeDocumentId}/share`);
      const data = await res.json();
      if (data.success && data.permissions) {
        setCollaborators(data.permissions);
      }
    } catch (err) {
      console.error('Error fetching collaborators:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeDocumentId, isOnline, isSimulatedOffline]);

  useEffect(() => {
    fetchCollaborators();
  }, [fetchCollaborators, activeDocumentId]);

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDocumentId || !inviteEmail.trim() || isSubmitting) return;

    const online = isOnline && !isSimulatedOffline;
    if (!online) {
      alert('You must be online to update permissions.');
      return;
    }

    setIsSubmitting(true);
    setStatusMsg(null);

    try {
      const res = await fetch(`/api/documents/${activeDocumentId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMsg({ type: 'success', text: `Successfully updated ${inviteEmail}!` });
        setInviteEmail('');
        fetchCollaborators();
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Failed to update share permissions' });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Error connecting to share server' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-text flex items-center gap-1.5 border-b border-border/50 pb-2">
        <Users className="h-3.5 w-3.5" />
        Document Access & Sharing
      </h3>

      {/* Share Form */}
      {user && (
        <form onSubmit={handleShare} className="mt-3 space-y-2.5">
          <div>
            <label className="text-[10px] font-semibold text-muted-text uppercase tracking-wider">Collaborator Email</label>
            <div className="flex gap-1.5 mt-1">
              <input
                type="email"
                required
                placeholder="editor@demo.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={isSubmitting}
                className="flex-grow rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-text focus:border-primary focus:outline-none"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as any)}
                disabled={isSubmitting}
                className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
              >
                <option value="EDITOR">Editor</option>
                <option value="VIEWER">Viewer</option>
              </select>
              <button
                type="submit"
                disabled={isSubmitting || !inviteEmail.trim()}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/95 transition disabled:opacity-50 flex items-center justify-center shrink-0"
              >
                {isSubmitting ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserPlus className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {statusMsg && (
            <div className={`rounded p-2 text-[10px] border ${
              statusMsg.type === 'success'
                ? 'bg-green-500/10 border-green-500/20 text-green-500'
                : 'bg-red-500/10 border-red-500/20 text-red-500'
            }`}>
              {statusMsg.text}
            </div>
          )}
        </form>
      )}

      {/* Collaborators List */}
      <div className="mt-4 space-y-2 max-h-[220px] overflow-y-auto pr-1">
        {isLoading && collaborators.length === 0 ? (
          <div className="text-center text-xs text-muted-text py-2">Loading collaborators...</div>
        ) : collaborators.length === 0 ? (
          <div className="text-center text-xs text-muted-text py-4">
            No collaborators listed. (Check connection status)
          </div>
        ) : (
          collaborators.map((collab) => (
            <div
              key={collab.id}
              className="flex items-center justify-between rounded-lg border border-border/40 bg-background/50 p-2 text-left"
            >
              <div className="min-w-0 flex-grow pr-2">
                <div className="text-xs font-semibold text-foreground truncate">{collab.user.name}</div>
                <div className="text-[10px] text-muted-text truncate">{collab.user.email}</div>
              </div>
              <span className={`shrink-0 flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                collab.role === 'OWNER'
                  ? 'bg-red-500/10 text-red-500'
                  : collab.role === 'EDITOR'
                  ? 'bg-indigo-500/10 text-indigo-500'
                  : 'bg-zinc-500/10 text-muted-text'
              }`}>
                <Shield className="h-2.5 w-2.5" />
                {collab.role}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
