'use client';

import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Sparkles, MessageSquare, Send, Copy, FileCode, Check, RefreshCw, FileText, CheckSquare } from 'lucide-react';

interface AIPanelProps {
  editorContent: string;
  selectedText: string;
  focusedBlockId: string | null;
  onInsertText: (text: string) => void;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isMock?: boolean;
}

export default function AIPanel({ editorContent, selectedText, focusedBlockId, onInsertText }: AIPanelProps) {
  const { isOnline, isSimulatedOffline } = useApp();
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hi! I am your Gemini AI assistant. Highlight any text in the editor to rewrite it, summarize the document, or ask me questions about your writing.' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiOutput, setAiOutput] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleAIAction = async (action: 'summarize' | 'rewrite' | 'grammar', promptExtra?: string) => {
    const online = isOnline && !isSimulatedOffline;
    let contextText = '';

    if (action === 'summarize') {
      contextText = editorContent || 'The document is currently empty.';
    } else {
      contextText = selectedText || editorContent || '';
    }

    if (!contextText.trim() && action !== 'summarize') {
      alert('Please write some text or select a paragraph first.');
      return;
    }

    setIsGenerating(true);
    setAiOutput(null);
    setLastAction(action);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          context: contextText,
          prompt: promptExtra,
        }),
      });

      if (!res.ok) throw new Error('AI request failed');
      const data = await res.json();
      setAiOutput(data.result);
      
      // Append to chat as well
      const actionLabels = {
        summarize: 'Document Summary',
        rewrite: `Rewrite (${promptExtra || 'Professional'})`,
        grammar: 'Grammar Checker',
      };
      setMessages(prev => [
        ...prev,
        { role: 'user', content: `${actionLabels[action]}: "${contextText.slice(0, 40)}${contextText.length > 40 ? '...' : ''}"` },
        { role: 'assistant', content: data.result, isMock: data.isMock }
      ]);
    } catch (err) {
      alert('AI Assistant service is currently offline or unreachable.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isGenerating) return;

    const userMsg = chatInput.trim();
    setChatInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsGenerating(true);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'chat',
          context: editorContent || 'Empty Document',
          prompt: userMsg,
        }),
      });

      if (!res.ok) throw new Error('AI request failed');
      const data = await res.json();
      
      setMessages(prev => [...prev, { role: 'assistant', content: data.result, isMock: data.isMock }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I failed to process that query. Check your internet connection.' }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!aiOutput) return;
    navigator.clipboard.writeText(aiOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-full flex-col border border-border bg-card shadow-sm rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted-bg/30 px-4 py-3">
        <Sparkles className="h-4.5 w-4.5 text-indigo-500 animate-pulse" />
        <h3 className="text-sm font-bold text-foreground">Gemini AI Co-Writer</h3>
        {!isOnline && (
          <span className="ml-auto text-[9px] font-semibold text-amber-500 bg-amber-500/10 px-1 rounded">
            Offline Simulation
          </span>
        )}
      </div>

      {/* Tools Quick Actions */}
      <div className="border-b border-border/50 bg-background/50 p-3 space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-text">Quick Actions</div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => handleAIAction('summarize')}
            disabled={isGenerating}
            className="flex items-center justify-center gap-1 rounded-lg border border-border bg-background p-2 text-xs font-semibold hover:bg-muted-bg transition hover:text-primary disabled:opacity-50"
          >
            <FileText className="h-3.5 w-3.5" />
            Summarize Doc
          </button>
          <button
            onClick={() => handleAIAction('grammar')}
            disabled={isGenerating}
            className="flex items-center justify-center gap-1 rounded-lg border border-border bg-background p-2 text-xs font-semibold hover:bg-muted-bg transition hover:text-primary disabled:opacity-50"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            Fix Grammar
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          <button
            onClick={() => handleAIAction('rewrite', 'professional')}
            disabled={isGenerating}
            className="rounded border border-border bg-background p-1 text-[10px] font-medium hover:bg-muted-bg transition disabled:opacity-50"
          >
            Professional
          </button>
          <button
            onClick={() => handleAIAction('rewrite', 'casual')}
            disabled={isGenerating}
            className="rounded border border-border bg-background p-1 text-[10px] font-medium hover:bg-muted-bg transition disabled:opacity-50"
          >
            Casual
          </button>
          <button
            onClick={() => handleAIAction('rewrite', 'shorter')}
            disabled={isGenerating}
            className="rounded border border-border bg-background p-1 text-[10px] font-medium hover:bg-muted-bg transition disabled:opacity-50"
          >
            Make Shorter
          </button>
        </div>
      </div>

      {/* active context banner */}
      {selectedText && (
        <div className="bg-primary/5 px-4 py-2 border-b border-border/30 text-[10px] text-primary flex items-center justify-between">
          <span className="truncate max-w-[200px]">Selected: &quot;{selectedText}&quot;</span>
          <span className="font-bold underline shrink-0 cursor-default">Ready for AI Actions</span>
        </div>
      )}

      {/* Chat messages */}
      <div className="flex-grow overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground font-medium rounded-tr-none shadow-sm shadow-primary/10'
                : 'bg-muted-bg text-foreground rounded-tl-none border border-border/40'
            }`}>
              {msg.content}
              {msg.isMock && (
                <div className="mt-1 text-[9px] text-amber-500 font-bold border-t border-amber-500/10 pt-1">
                  [Simulated Offline Response]
                </div>
              )}
            </div>
          </div>
        ))}
        {isGenerating && (
          <div className="flex items-center gap-1 text-xs text-muted-text animate-pulse-slow">
            <RefreshCw className="h-3 w-3 animate-spin text-primary" />
            <span>AI is writing...</span>
          </div>
        )}
      </div>

      {/* Last Action Output Box */}
      {aiOutput && (
        <div className="mx-4 mb-2 p-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5 text-xs">
          <div className="flex justify-between items-center mb-1 text-[10px] font-semibold text-indigo-500">
            <span>AI Draft Output</span>
            <div className="flex gap-2">
              <button onClick={handleCopy} className="hover:text-foreground transition flex items-center gap-0.5">
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              {focusedBlockId && (
                <button
                  onClick={() => onInsertText(aiOutput)}
                  className="hover:text-foreground transition font-bold flex items-center gap-0.5 text-primary"
                >
                  <FileCode className="h-3 w-3" />
                  Insert
                </button>
              )}
            </div>
          </div>
          <p className="text-foreground leading-normal whitespace-pre-wrap">{aiOutput}</p>
        </div>
      )}

      {/* Input Form */}
      <form onSubmit={handleChatSubmit} className="border-t border-border/60 p-3 flex gap-1.5 bg-background">
        <input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder={selectedText ? "Ask AI about selected text..." : "Ask Gemini about document..."}
          disabled={isGenerating}
          className="flex-grow rounded-lg border border-border bg-muted-bg/40 px-3 py-2 text-xs text-foreground placeholder:text-muted-text focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          disabled={isGenerating || !chatInput.trim()}
          className="rounded-lg bg-primary p-2 text-primary-foreground hover:bg-primary/95 transition disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
