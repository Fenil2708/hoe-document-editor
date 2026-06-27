'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '@/context/AppContext';
import { BlockState, generatePositionBetween } from '@/lib/sync';
import {
  getLocalBlocks,
  saveLocalBlocks,
  enqueueSyncMutation,
  saveLocalDocument,
  getLocalDocument,
} from '@/lib/indexeddb';
import { Trash2, Plus, ArrowUp, ArrowDown, Type, AlertTriangle, FileUp, Sparkles, Bold, Link2 } from 'lucide-react';

interface EditorProps {
  documentId: string;
  previewVersion: any | null;
  setFocusedBlockId: (id: string | null) => void;
  setSelectedText: (text: string) => void;
  onRegisterContentChange: (content: string) => void;
}

export default function Editor({
  documentId,
  previewVersion,
  setFocusedBlockId,
  setSelectedText,
  onRegisterContentChange,
}: EditorProps) {
  const { user, versionTrigger, triggerLocalUpdate, forceSync, isOnline, isSimulatedOffline } = useApp();
  const [blocks, setBlocks] = useState<BlockState[]>([]);
  const [docTitle, setDocTitle] = useState('');
  const [userRole, setUserRole] = useState<'OWNER' | 'EDITOR' | 'VIEWER' | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const inputRefs = useRef<{ [key: string]: HTMLTextAreaElement | null }>({});

  const isReadOnly = previewVersion !== null || userRole === 'VIEWER';

  // Load document metadata and access level
  const loadDocMeta = useCallback(async () => {
    try {
      const doc = await getLocalDocument(documentId);
      if (doc) {
        setDocTitle(doc.title);
      }

      // Query access role online
      const online = isOnline && !isSimulatedOffline;
      if (online) {
        const res = await fetch(`/api/documents/${documentId}/share`);
        const data = await res.json();
        if (data.success && data.permissions) {
          const matching = data.permissions.find((p: any) => p.user.id === user?.id);
          if (matching) {
            setUserRole(matching.role);
          }
        }
      } else {
        // Fallback offline role assumptions
        setUserRole('EDITOR'); // Assume editor if offline and has local access
      }
    } catch (err) {
      console.error('Failed to load document meta:', err);
    }
  }, [documentId, user, isOnline, isSimulatedOffline]);

  // Load blocks from IndexedDB
  const loadBlocks = useCallback(async () => {
    if (previewVersion) {
      // In preview/time travel mode, load blocks from snapshot payload
      const snap = JSON.parse(previewVersion.blocksData) as BlockState[];
      const sorted = snap.sort((a, b) => a.position.localeCompare(b.position));
      setBlocks(sorted);
      
      // Register text for AI summaries
      const fullText = sorted.map(b => b.content).join('\n\n');
      onRegisterContentChange(fullText);
      return;
    }

    try {
      const local = await getLocalBlocks(documentId);
      setBlocks(local);

      // Register text for AI summaries
      const fullText = local.map(b => b.content).join('\n\n');
      onRegisterContentChange(fullText);
    } catch (err) {
      console.error('Failed to load blocks:', err);
    }
  }, [documentId, previewVersion, onRegisterContentChange]);

  useEffect(() => {
    loadDocMeta();
  }, [loadDocMeta, documentId]);

  useEffect(() => {
    loadBlocks();
  }, [loadBlocks, documentId, versionTrigger, previewVersion]);

  // Handle document title update
  const handleTitleChange = async (newTitle: string) => {
    setDocTitle(newTitle);
    if (isReadOnly) return;

    try {
      // Update IndexedDB
      const doc = await getLocalDocument(documentId);
      if (doc) {
        const updated = { ...doc, title: newTitle, updatedAt: new Date().toISOString() };
        await saveLocalDocument(updated);
      }

      // Push to server online
      const online = isOnline && !isSimulatedOffline;
      if (online) {
        await fetch(`/api/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentId,
            clientId: 'title-update',
            mutations: [], // title sync is simplified or we push later
          }),
        });
      }
    } catch (err) {
      console.error('Error updating title:', err);
    }
  };

  // Capture highlighted text for AI rewrite actions
  const handleSelection = () => {
    if (typeof window !== 'undefined') {
      const selection = window.getSelection()?.toString() || '';
      setSelectedText(selection);
    }
  };

  // Block Manipulation Operations
  const handleSaveBlockContent = async (blockId: string, type: string, position: string, content: string) => {
    if (isReadOnly) return;

    const blockToSave: BlockState = {
      id: blockId,
      documentId,
      type,
      position,
      content,
      updatedAt: new Date().toISOString(),
      updatedBy: user?.id || 'unknown',
      isDeleted: false,
    };

    // 1. Write to client DB
    await saveLocalBlocks([blockToSave]);

    // 2. Queue mutation
    await enqueueSyncMutation({
      documentId,
      blockId,
      mutation: blockToSave,
    });

    // 3. Update sync state triggers
    triggerLocalUpdate();
  };

  const handleAddBlock = async (afterBlockIndex: number) => {
    if (isReadOnly) return;

    const prevBlock = blocks[afterBlockIndex];
    const nextBlock = blocks[afterBlockIndex + 1];

    const prevPos = prevBlock ? prevBlock.position : null;
    const nextPos = nextBlock ? nextBlock.position : null;
    const newPos = generatePositionBetween(prevPos, nextPos);

    const newBlock: BlockState = {
      id: crypto.randomUUID(),
      documentId,
      type: 'text',
      content: '',
      position: newPos,
      updatedAt: new Date().toISOString(),
      updatedBy: user?.id || 'unknown',
      isDeleted: false,
    };

    // Write & queue
    await saveLocalBlocks([newBlock]);
    await enqueueSyncMutation({
      documentId,
      blockId: newBlock.id,
      mutation: newBlock,
    });

    triggerLocalUpdate();

    // Focus newly created block on next render loop
    setTimeout(() => {
      inputRefs.current[newBlock.id]?.focus();
    }, 50);
  };

  const handleDeleteBlock = async (blockId: string) => {
    if (isReadOnly) return;
    if (blocks.length <= 1) {
      alert('A document must have at least one block.');
      return;
    }

    const blockToDelete = blocks.find(b => b.id === blockId);
    if (!blockToDelete) return;

    const markedDeleted: BlockState = {
      ...blockToDelete,
      isDeleted: true,
      updatedAt: new Date().toISOString(),
      updatedBy: user?.id || 'unknown',
    };

    // Save tombstone & queue deletion mutation
    await saveLocalBlocks([markedDeleted]);
    await enqueueSyncMutation({
      documentId,
      blockId,
      mutation: markedDeleted,
    });

    triggerLocalUpdate();
  };

  const handleChangeBlockType = async (blockId: string, newType: string) => {
    if (isReadOnly) return;

    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    const updated = {
      ...block,
      type: newType,
      updatedAt: new Date().toISOString(),
      updatedBy: user?.id || 'unknown',
    };

    await saveLocalBlocks([updated]);
    await enqueueSyncMutation({
      documentId,
      blockId,
      mutation: updated,
    });

    triggerLocalUpdate();
  };

  const handleMoveBlock = async (index: number, direction: 'UP' | 'DOWN') => {
    if (isReadOnly) return;
    if (direction === 'UP' && index === 0) return;
    if (direction === 'DOWN' && index === blocks.length - 1) return;

    const block = blocks[index];
    let newPos = '';

    if (direction === 'UP') {
      const prevBlock = blocks[index - 1];
      const prevPrevBlock = blocks[index - 2];
      newPos = generatePositionBetween(prevPrevBlock ? prevPrevBlock.position : null, prevBlock.position);
    } else {
      const nextBlock = blocks[index + 1];
      const nextNextBlock = blocks[index + 2];
      newPos = generatePositionBetween(nextBlock.position, nextNextBlock ? nextNextBlock.position : null);
    }

    const updated = {
      ...block,
      position: newPos,
      updatedAt: new Date().toISOString(),
      updatedBy: user?.id || 'unknown',
    };

    await saveLocalBlocks([updated]);
    await enqueueSyncMutation({
      documentId,
      blockId: block.id,
      mutation: updated,
    });

    triggerLocalUpdate();
  };

  const handleRestoreVersion = async () => {
    if (!previewVersion || isReadOnly || isRestoring) return;

    setIsRestoring(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/versions/${previewVersion.id}/restore`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // Clear preview trigger
        window.location.reload(); // Refresh the window is the simplest way to pull fresh DB state
      } else {
        alert(data.error || 'Failed to restore snapshot');
      }
    } catch (err) {
      alert('Error connecting to restoration server');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="flex-grow flex flex-col bg-card/45 rounded-xl border border-border overflow-hidden h-full shadow-sm">
      {/* Time Travel Banner */}
      {previewVersion && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-600 dark:text-amber-500">
            <AlertTriangle className="h-4 w-4" />
            <span>
              Previewing historical version &quot;{previewVersion.name}&quot; (saved by {previewVersion.createdBy})
            </span>
          </div>
          <div className="flex items-center gap-2">
            {userRole !== 'VIEWER' && (
              <button
                onClick={handleRestoreVersion}
                disabled={isRestoring}
                className="flex items-center gap-1 bg-amber-500 px-3 py-1 rounded text-xs font-bold text-black hover:bg-amber-400 transition disabled:opacity-50"
              >
                <FileUp className="h-3.5 w-3.5" />
                Restore Snapshot
              </button>
            )}
          </div>
        </div>
      )}

      {/* Editor Main Section */}
      <div className="flex-grow overflow-y-auto p-6 md:p-8 space-y-6">
        {/* Document Title Header */}
        <input
          type="text"
          value={docTitle}
          onChange={(e) => handleTitleChange(e.target.value)}
          disabled={isReadOnly}
          className="w-full text-3xl font-extrabold text-foreground bg-transparent border-b border-transparent hover:border-border/30 focus:border-primary focus:outline-none py-1.5 transition placeholder:text-muted-text font-serif"
          placeholder="Untitled Collaboration Document"
        />

        {/* Access Rights Indicators */}
        <div className="flex items-center gap-2 text-[10px] text-muted-text font-semibold uppercase tracking-wider">
          <span>Role Permission:</span>
          <span className={`px-1.5 py-0.5 rounded font-bold ${
            userRole === 'OWNER' ? 'bg-red-500/10 text-red-500' :
            userRole === 'EDITOR' ? 'bg-indigo-500/10 text-indigo-500' :
            'bg-zinc-500/10 text-muted-text'
          }`}>
            {previewVersion ? 'Time Travel Preview (Read-only)' : userRole || 'Loading...'}
          </span>
        </div>

        {/* Blocks rendering list */}
        <div className="space-y-4 pt-4">
          {blocks.map((block, index) => (
            <div
              key={block.id}
              className="group relative flex gap-3 items-start border-l border-transparent hover:border-border/40 pl-3 transition-all"
            >
              {/* Left sidebar controller (on hover) */}
              {!isReadOnly && (
                <div className="absolute -left-12 top-0.5 flex flex-col md:flex-row items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pr-2 shrink-0">
                  {/* Block Type Dropdown */}
                  <select
                    value={block.type}
                    onChange={(e) => handleChangeBlockType(block.id, e.target.value)}
                    className="bg-card border border-border rounded px-1.5 py-0.5 text-[10px] font-semibold text-muted-text hover:text-foreground cursor-pointer focus:outline-none"
                  >
                    <option value="text">Paragraph</option>
                    <option value="h1">Heading 1</option>
                    <option value="h2">Heading 2</option>
                    <option value="todo">Checklist</option>
                    <option value="code">Code Block</option>
                  </select>

                  {/* Move Up/Down Controls */}
                  <button
                    onClick={() => handleMoveBlock(index, 'UP')}
                    disabled={index === 0}
                    className="p-1 rounded hover:bg-muted-bg text-muted-text hover:text-foreground disabled:opacity-20"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => handleMoveBlock(index, 'DOWN')}
                    disabled={index === blocks.length - 1}
                    className="p-1 rounded hover:bg-muted-bg text-muted-text hover:text-foreground disabled:opacity-20"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>

                  {/* Delete Trash Control */}
                  <button
                    onClick={() => handleDeleteBlock(block.id)}
                    className="p-1 rounded hover:bg-red-500/10 text-muted-text hover:text-red-500"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}

              {/* Block Content Input Container */}
              <div className="flex-grow min-w-0">
                {block.type === 'todo' ? (
                  <TodoBlockRow
                    block={block}
                    isReadOnly={isReadOnly}
                    onSaveContent={(content) => handleSaveBlockContent(block.id, block.type, block.position, content)}
                    onFocus={() => setFocusedBlockId(block.id)}
                    onSelectText={handleSelection}
                    inputRef={(el) => { inputRefs.current[block.id] = el; }}
                  />
                ) : (
                  <StandardBlockRow
                    block={block}
                    isReadOnly={isReadOnly}
                    onSaveContent={(content) => handleSaveBlockContent(block.id, block.type, block.position, content)}
                    onFocus={() => setFocusedBlockId(block.id)}
                    onSelectText={handleSelection}
                    inputRef={(el) => { inputRefs.current[block.id] = el; }}
                  />
                )}
              </div>

              {/* Hover quick insertion "+" block */}
              {!isReadOnly && (
                <button
                  onClick={() => handleAddBlock(index)}
                  className="absolute -bottom-3 right-4 opacity-0 group-hover:opacity-100 flex items-center justify-center p-1 bg-primary text-primary-foreground rounded-full shadow hover:scale-105 transition-all z-10 shrink-0"
                >
                  <Plus className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 1. Text / Headings / Code Block Row helper
interface BlockRowProps {
  block: BlockState;
  isReadOnly: boolean;
  onSaveContent: (content: string) => void;
  onFocus: () => void;
  onSelectText: () => void;
  inputRef: (el: HTMLTextAreaElement | null) => void;
}

function StandardBlockRow({ block, isReadOnly, onSaveContent, onFocus, onSelectText, inputRef }: BlockRowProps) {
  const [text, setText] = useState(block.content);
  const timerRef = useRef<any>(null);

  // Sync state if it changes externally
  useEffect(() => {
    setText(block.content);
  }, [block.content]);

  // Debounced save updates
  const handleChange = (val: string) => {
    setText(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSaveContent(val);
    }, 500); // 500ms debounce
  };

  const handleBlur = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onSaveContent(text);
  };

  const textStyle =
    block.type === 'h1'
      ? 'text-2xl font-bold tracking-tight text-foreground placeholder:text-muted-text font-serif'
      : block.type === 'h2'
      ? 'text-xl font-semibold text-foreground placeholder:text-muted-text font-serif'
      : block.type === 'code'
      ? 'font-mono bg-muted-bg/40 border border-border/40 p-3 rounded-lg text-xs leading-normal text-foreground placeholder:text-muted-text/30 focus:bg-muted-bg/60'
      : 'text-sm text-foreground leading-relaxed placeholder:text-muted-text/30';

  return (
    <textarea
      value={text}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={handleBlur}
      onFocus={onFocus}
      onMouseUp={onSelectText}
      onKeyUp={onSelectText}
      disabled={isReadOnly}
      placeholder={
        block.type === 'h1'
          ? 'Heading 1'
          : block.type === 'h2'
          ? 'Heading 2'
          : block.type === 'code'
          ? '// Paste or write code here...'
          : 'Write document content here...'
      }
      rows={1}
      className={`w-full bg-transparent resize-none focus:outline-none focus:ring-0 select-text p-1 ${textStyle}`}
      style={{ height: 'auto', overflowY: 'hidden' }}
      onInput={(e) => {
        const el = e.currentTarget;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
      }}
      ref={(el) => {
        inputRef(el);
        if (el) {
          el.style.height = 'auto';
          el.style.height = `${el.scrollHeight}px`;
        }
      }}
    />
  );
}

// 2. Checklist / Todo Block Row helper
function TodoBlockRow({ block, isReadOnly, onSaveContent, onFocus, onSelectText, inputRef }: BlockRowProps) {
  let parsedContent = { text: '', completed: false };
  try {
    parsedContent = JSON.parse(block.content);
  } catch (err) {
    parsedContent = { text: block.content, completed: false };
  }

  const [text, setText] = useState(parsedContent.text);
  const [completed, setCompleted] = useState(parsedContent.completed);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    try {
      const parsed = JSON.parse(block.content);
      setText(parsed.text);
      setCompleted(parsed.completed);
    } catch (err) {
      setText(block.content);
    }
  }, [block.content]);

  const saveState = (newText: string, newCompleted: boolean) => {
    onSaveContent(JSON.stringify({ text: newText, completed: newCompleted }));
  };

  const handleTextChange = (val: string) => {
    setText(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveState(val, completed);
    }, 500);
  };

  const handleBlur = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    saveState(text, completed);
  };

  const handleCheckboxToggle = () => {
    if (isReadOnly) return;
    const nextVal = !completed;
    setCompleted(nextVal);
    saveState(text, nextVal);
  };

  return (
    <div className="flex gap-2 items-center w-full">
      <input
        type="checkbox"
        checked={completed}
        onChange={handleCheckboxToggle}
        disabled={isReadOnly}
        className="h-4 w-4 shrink-0 rounded border-border bg-background text-primary focus:ring-primary focus:ring-offset-background cursor-pointer"
      />
      <textarea
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        onBlur={handleBlur}
        onFocus={onFocus}
        onMouseUp={onSelectText}
        onKeyUp={onSelectText}
        disabled={isReadOnly}
        placeholder="Checkbox list item..."
        rows={1}
        className={`w-full bg-transparent resize-none focus:outline-none focus:ring-0 text-sm p-1 select-text ${
          completed ? 'text-muted-text line-through font-normal' : 'text-foreground'
        }`}
        style={{ height: 'auto', overflowY: 'hidden' }}
        onInput={(e) => {
          const el = e.currentTarget;
          el.style.height = 'auto';
          el.style.height = `${el.scrollHeight}px`;
        }}
        ref={(el) => {
          inputRef(el);
          if (el) {
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight}px`;
          }
        }}
      />
    </div>
  );
}
