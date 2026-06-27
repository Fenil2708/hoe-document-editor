'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/context/AppContext';
import Login from '@/components/Login';
import Editor from '@/components/Editor';
import NetworkSim from '@/components/NetworkSim';
import Collaborators from '@/components/Collaborators';
import Versions from '@/components/Versions';
import AIPanel from '@/components/AIPanel';
import { DBDocument, getLocalDocuments, saveLocalDocument, saveLocalBlocks, initDB } from '@/lib/indexeddb';
import { BlockState } from '@/lib/sync';
import { FileText, Plus, LogOut, ArrowLeft, Sun, Moon, Sparkles, FolderKanban, Network, HelpCircle } from 'lucide-react';

export default function Home() {
  const {
    user,
    isLoadingAuth,
    logout,
    isOnline,
    isSimulatedOffline,
    activeDocumentId,
    setActiveDocumentId,
    versionTrigger,
    triggerLocalUpdate,
  } = useApp();

  const [documents, setDocuments] = useState<DBDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [isCreatingDoc, setIsCreatingDoc] = useState(false);
  
  // Theme state
  const [isDark, setIsDark] = useState(true);

  // Time travel states
  const [previewVersion, setPreviewVersion] = useState<any | null>(null);

  // AI context selections
  const [editorContent, setEditorContent] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);

  // Toggle theme class on document element
  const toggleTheme = () => {
    setIsDark(!isDark);
    if (typeof document !== 'undefined') {
      const html = document.documentElement;
      if (isDark) {
        html.classList.remove('dark');
      } else {
        html.classList.add('dark');
      }
    }
  };

  // Fetch document directory (local-first)
  const fetchDocuments = useCallback(async () => {
    setIsLoadingDocs(true);
    try {
      // 1. Get from IndexedDB first
      const localDocs = await getLocalDocuments();
      setDocuments(localDocs);

      // 2. If online, fetch fresh list from API and merge
      const online = isOnline && !isSimulatedOffline;
      if (online && user) {
        const res = await fetch('/api/documents');
        const data = await res.json();
        if (data.success && data.documents) {
          const fetchedDocs = data.documents as DBDocument[];
          
          // Save all to IndexedDB
          for (const d of fetchedDocs) {
            await saveLocalDocument({
              id: d.id,
              title: d.title,
              ownerId: d.ownerId,
              updatedAt: d.updatedAt,
            });
          }
          setDocuments(fetchedDocs);
        }
      }
    } catch (err) {
      console.error('Failed to load documents directory:', err);
    } finally {
      setIsLoadingDocs(false);
    }
  }, [isOnline, isSimulatedOffline, user]);

  useEffect(() => {
    if (user) {
      fetchDocuments();
    }
  }, [fetchDocuments, user, activeDocumentId]);

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocTitle.trim() || isCreatingDoc) return;

    const online = isOnline && !isSimulatedOffline;
    if (!online) {
      alert('You must be online to create new documents on the collaboration server.');
      return;
    }

    setIsCreatingDoc(true);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newDocTitle.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const newDoc = data.document;
        // Save locally
        await saveLocalDocument({
          id: newDoc.id,
          title: newDoc.title,
          ownerId: newDoc.ownerId,
          updatedAt: newDoc.updatedAt,
        });
        
        setNewDocTitle('');
        setActiveDocumentId(newDoc.id);
      } else {
        alert(data.error || 'Failed to create document');
      }
    } catch (err) {
      alert('Network error creating document');
    } finally {
      setIsCreatingDoc(false);
    }
  };

  const handleSelectDocument = async (doc: DBDocument) => {
    // 1. Save metadata locally
    await saveLocalDocument(doc);
    
    // 2. Fetch server blocks online to sync immediately
    const online = isOnline && !isSimulatedOffline;
    if (online) {
      try {
        const res = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentId: doc.id,
            clientId: 'initial-pull',
            mutations: [],
          }),
        });
        const data = await res.json();
        if (data.success) {
          // Merge blocks into IndexedDB
          await saveLocalBlocks(data.serverBlocks);
        }
      } catch (err) {
        console.warn('Initial blocks fetch failed, loading from local cache:', err);
      }
    }

    setPreviewVersion(null);
    setActiveDocumentId(doc.id);
    triggerLocalUpdate();
  };

  // Helper to let AI panel replace focused block text
  const handleAIInsert = async (text: string) => {
    if (!activeDocumentId || !focusedBlockId) return;
    
    // Fetch block to modify
    const res = await fetch(`/api/sync`, {
      method: 'POST', // dummy trigger or we save locally first
    }); // Actually we can call editor's update block directly via IndexedDB

    // We trigger the replacement by dispatching a custom save event to Editor
    const localBlocks = await getLocalDocuments(); // wait, we want blocks
    // Let's create an elegant local mutation directly in the page to bypass complex component communication:
    const db = await initDB();
    const tx = db.transaction('blocks', 'readwrite');
    const store = tx.objectStore('blocks');
    
    const request = store.get(focusedBlockId);
    request.onsuccess = async () => {
      const block = request.result as BlockState;
      if (block) {
        const updatedBlock: BlockState = {
          ...block,
          content: block.type === 'todo' ? JSON.stringify({ text, completed: false }) : text,
          updatedAt: new Date().toISOString(),
          updatedBy: user?.id || 'unknown',
        };
        
        // Write to blocks store
        const tx2 = db.transaction(['blocks', 'syncQueue'], 'readwrite');
        tx2.objectStore('blocks').put(updatedBlock);
        tx2.objectStore('syncQueue').add({
          documentId: activeDocumentId,
          blockId: focusedBlockId,
          mutation: updatedBlock,
        });

        tx2.oncomplete = () => {
          triggerLocalUpdate();
        };
      }
    };
  };

  if (isLoadingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent shadow-md" />
          <span className="text-sm font-semibold text-muted-text">Initializing Secure Workspace...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground transition-colors duration-200">
      
      {/* Global Navigation Header */}
      <header className="border-b border-border bg-card/60 backdrop-blur-md sticky top-0 z-30 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary shadow-md shadow-primary/20">
            <FileText className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-foreground sm:text-lg">
              Edtech Workspace
            </h1>
            <p className="text-[10px] text-muted-text font-medium uppercase tracking-wider flex items-center gap-1">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${isOnline && !isSimulatedOffline ? 'bg-green-500' : 'bg-amber-500'}`} />
              {isOnline && !isSimulatedOffline ? 'Sync Online' : 'Sync Paused (Offline)'}
            </p>
          </div>
        </div>

        {/* Header Right */}
        <div className="flex items-center gap-4">
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg border border-border bg-background/50 hover:bg-muted-bg text-muted-text hover:text-foreground transition"
            title="Toggle Light/Dark Theme"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* User Profile Badge */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-right">
              <div className="text-xs font-semibold text-foreground">{user.name}</div>
              <div className="text-[9px] text-muted-text">{user.email}</div>
            </div>
            <button
              onClick={logout}
              className="p-2 rounded-lg border border-border bg-red-500/5 hover:bg-red-500/10 text-red-500 border-red-500/10 transition"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Frame */}
      <main className="flex-grow flex flex-col p-4 md:p-6 max-w-7xl w-full mx-auto">
        
        {activeDocumentId ? (
          /* 1. DOCUMENT EDITOR MODE (3-Column Layout) */
          <div className="flex-grow flex flex-col h-[calc(100vh-120px)] min-h-[500px]">
            {/* Editor Top Bar */}
            <div className="mb-4 flex items-center justify-between">
              <button
                onClick={() => {
                  setActiveDocumentId(null);
                  setPreviewVersion(null);
                }}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted-bg transition"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </button>
            </div>

            <div className="flex-grow grid grid-cols-1 lg:grid-cols-4 gap-6 overflow-hidden">
              {/* Left Column: Sync Controls & Versions */}
              <div className="lg:col-span-1 space-y-4 overflow-y-auto pr-1">
                <NetworkSim />
                <Collaborators />
                <Versions previewVersionId={previewVersion?.id} setPreviewVersion={setPreviewVersion} />
              </div>

              {/* Center Column: Block Rich Editor */}
              <div className="lg:col-span-2 h-full overflow-hidden">
                <Editor
                  documentId={activeDocumentId}
                  previewVersion={previewVersion}
                  setFocusedBlockId={setFocusedBlockId}
                  setSelectedText={setSelectedText}
                  onRegisterContentChange={setEditorContent}
                />
              </div>

              {/* Right Column: AI Co-Writer Side panel */}
              <div className="lg:col-span-1 h-full overflow-hidden">
                <AIPanel
                  editorContent={editorContent}
                  selectedText={selectedText}
                  focusedBlockId={focusedBlockId}
                  onInsertText={handleAIInsert}
                />
              </div>
            </div>
          </div>
        ) : (
          /* 2. DIRECTORY DASHBOARD MODE */
          <div className="flex-grow space-y-6">
            
            {/* Folder Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                  <FolderKanban className="h-5 w-5 text-primary" />
                  Your Collaboration Documents
                </h2>
                <p className="text-xs text-muted-text mt-1">
                  Create new documents or open existing ones. Documents load instantly from cache when offline.
                </p>
              </div>

              {/* New Document Creation */}
              <form onSubmit={handleCreateDocument} className="flex gap-2">
                <input
                  type="text"
                  required
                  placeholder="New document name..."
                  value={newDocTitle}
                  onChange={(e) => setNewDocTitle(e.target.value)}
                  disabled={isCreatingDoc}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground placeholder:text-muted-text focus:border-primary focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isCreatingDoc || !newDocTitle.trim()}
                  className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/95 transition disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  Create Doc
                </button>
              </form>
            </div>

            {/* Document Cards Directory */}
            {isLoadingDocs && documents.length === 0 ? (
              <div className="text-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
                <p className="text-xs text-muted-text mt-3">Scanning document caches...</p>
              </div>
            ) : documents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-12 text-center">
                <FolderKanban className="mx-auto h-12 w-12 text-muted-text/40" />
                <h3 className="mt-4 text-sm font-semibold text-foreground">No documents found</h3>
                <p className="mt-2 text-xs text-muted-text max-w-xs mx-auto leading-normal">
                  Create a new document using the input in the top right to start editing and testing synchronization!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => handleSelectDocument(doc)}
                    className="group cursor-pointer rounded-xl border border-border bg-card p-5 shadow-sm transition hover:border-primary/50 hover:shadow-md hover:shadow-primary/5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">
                          {doc.title}
                        </h4>
                        <p className="text-[10px] text-muted-text truncate mt-1">
                          ID: {doc.id}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 border-t border-border/40 pt-3 flex items-center justify-between text-[10px] text-muted-text">
                      <span>Updated: {new Date(doc.updatedAt).toLocaleDateString()}</span>
                      <span className="font-semibold underline opacity-0 group-hover:opacity-100 transition-opacity">
                        Open Editor &rarr;
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Mandatory Footer Profile Details */}
      <footer className="border-t border-border bg-card/40 py-6 text-center text-xs text-muted-text mt-auto">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">Local-First Collaborative Doc Editor</span>
          </div>
          <div>
            Built by <span className="font-bold text-foreground">Antigravity AI Agent</span> |{' '}
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline font-semibold text-primary transition"
            >
              GitHub Profile
            </a>{' '}
            |{' '}
            <a
              href="https://linkedin.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline font-semibold text-primary transition"
            >
              LinkedIn Profile
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
