'use client';

import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Mail, Lock, FileText, Sparkles, LogIn, ArrowRight } from 'lucide-react';

export default function Login() {
  const { login } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    const res = await login(email, password);
    setIsSubmitting(false);

    if (!res.success) {
      setError(res.error || 'Invalid credentials');
    }
  };

  const handleQuickLogin = async (roleEmail: string) => {
    setError('');
    setIsSubmitting(true);
    setEmail(roleEmail);
    setPassword('password123');

    const res = await login(roleEmail, 'password123');
    setIsSubmitting(false);

    if (!res.success) {
      setError(res.error || 'Quick login failed');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/40 via-background to-background p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card/60 p-8 shadow-2xl backdrop-blur-xl transition-all duration-300">
        
        {/* Header Logo */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20">
            <FileText className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Edtech Collaborative
          </h1>
          <p className="mt-2 text-sm text-muted-text">
            Local-First Document Editor & Sync Engine
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-6 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-500">
            {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-text">Email Address</label>
            <div className="relative mt-1">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <Mail className="h-4 w-4 text-muted-text" />
              </span>
              <input
                type="email"
                required
                placeholder="owner@demo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-border bg-muted-bg/50 py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-text">Password</label>
            <div className="relative mt-1">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <Lock className="h-4 w-4 text-muted-text" />
              </span>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-border bg-muted-bg/50 py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/10 transition hover:bg-primary/95 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          >
            {isSubmitting ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
            ) : (
              <>
                <span>Sign In</span>
                <LogIn className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <div className="relative my-6 flex items-center">
          <div className="flex-grow border-t border-border"></div>
          <span className="mx-4 text-xs font-medium uppercase tracking-wider text-muted-text">Demo Roles Preset</span>
          <div className="flex-grow border-t border-border"></div>
        </div>

        {/* Quick Demo Logins */}
        <div className="space-y-2">
          <button
            onClick={() => handleQuickLogin('owner@demo.com')}
            className="flex w-full items-center justify-between rounded-lg border border-border/80 bg-background/40 p-3 text-left transition hover:bg-muted-bg hover:border-primary/50 group"
          >
            <div>
              <div className="text-sm font-semibold text-foreground group-hover:text-primary">Owner Admin</div>
              <div className="text-xs text-muted-text">Full CRUD + Share rights</div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-text transition group-hover:translate-x-1 group-hover:text-primary" />
          </button>

          <button
            onClick={() => handleQuickLogin('editor@demo.com')}
            className="flex w-full items-center justify-between rounded-lg border border-border/80 bg-background/40 p-3 text-left transition hover:bg-muted-bg hover:border-primary/50 group"
          >
            <div>
              <div className="text-sm font-semibold text-foreground group-hover:text-primary">Jane Editor</div>
              <div className="text-xs text-muted-text">Can read and write document blocks</div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-text transition group-hover:translate-x-1 group-hover:text-primary" />
          </button>

          <button
            onClick={() => handleQuickLogin('viewer@demo.com')}
            className="flex w-full items-center justify-between rounded-lg border border-border/80 bg-background/40 p-3 text-left transition hover:bg-muted-bg hover:border-primary/50 group"
          >
            <div>
              <div className="text-sm font-semibold text-foreground group-hover:text-primary">John Viewer</div>
              <div className="text-xs text-muted-text">Read-only real-time stream</div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-text transition group-hover:translate-x-1 group-hover:text-primary" />
          </button>
        </div>

        <div className="mt-8 flex justify-center gap-1.5 text-center text-xs text-muted-text">
          <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
          <span>Demo credentials: password123</span>
        </div>
      </div>
    </div>
  );
}
