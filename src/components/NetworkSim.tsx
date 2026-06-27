'use client';

import { useApp } from '@/context/AppContext';
import { Wifi, WifiOff, RefreshCw, Layers, ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function NetworkSim() {
  const {
    isOnline,
    isSimulatedOffline,
    setSimulatedOffline,
    simulatedLatency,
    setSimulatedLatency,
    syncStatus,
    syncQueueSize,
    forceSync,
  } = useApp();

  const isActuallyOnline = isOnline && !isSimulatedOffline;

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-text flex items-center gap-1.5">
        <Layers className="h-3.5 w-3.5" />
        Sync Engine Simulator
      </h3>

      {/* Network Status Badge */}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Network Status:</span>
        <div className="flex items-center gap-1.5">
          {isActuallyOnline ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-semibold text-green-500">
              <Wifi className="h-3.5 w-3.5" />
              Online
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-500">
              <WifiOff className="h-3.5 w-3.5" />
              Offline
            </span>
          )}
        </div>
      </div>

      {/* Sync Status Badge */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Sync Engine:</span>
        <div className="flex items-center gap-1.5">
          {syncStatus === 'SYNCED' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-semibold text-indigo-500">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Synced
            </span>
          )}
          {syncStatus === 'SYNCING' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-500 animate-pulse-slow">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Syncing...
            </span>
          )}
          {syncStatus === 'OFFLINE' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-500">
              <WifiOff className="h-3.5 w-3.5" />
              Queueing
            </span>
          )}
          {syncStatus === 'ERROR' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-500">
              <ShieldAlert className="h-3.5 w-3.5" />
              Sync Error
            </span>
          )}
        </div>
      </div>

      {/* Queue Details */}
      <div className="mt-4 rounded-lg bg-muted-bg/50 p-3 text-xs border border-border/50">
        <div className="flex justify-between items-center">
          <span className="text-muted-text">IndexedDB Sync Queue:</span>
          <span className={`font-mono font-bold px-1.5 py-0.5 rounded ${syncQueueSize > 0 ? 'bg-amber-500/10 text-amber-500' : 'bg-green-500/10 text-green-500'}`}>
            {syncQueueSize} pending {syncQueueSize === 1 ? 'edit' : 'edits'}
          </span>
        </div>
        {syncQueueSize > 0 && (
          <p className="mt-1.5 text-[10px] text-muted-text leading-normal">
            Edits are batched client-side. Going online will flush queue and merge conflict registers.
          </p>
        )}
      </div>

      {/* Manual Toggle */}
      <div className="mt-4 space-y-3">
        <label className="relative flex cursor-pointer items-center justify-between">
          <span className="text-sm font-medium text-foreground">Simulate Offline Mode</span>
          <input
            type="checkbox"
            checked={isSimulatedOffline}
            onChange={(e) => setSimulatedOffline(e.target.checked)}
            className="peer sr-only"
          />
          <div className="peer relative h-5 w-9 rounded-full bg-secondary after:absolute after:start-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-border after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-focus:outline-none" />
        </label>

        {/* Latency Slider */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="font-medium text-foreground">Simulate Network Latency</span>
            <span className="font-mono text-muted-text font-semibold">{simulatedLatency}ms</span>
          </div>
          <input
            type="range"
            min="0"
            max="5000"
            step="500"
            value={simulatedLatency}
            onChange={(e) => setSimulatedLatency(Number(e.target.value))}
            className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary border border-border"
          />
        </div>

        {/* Manual Sync Trigger */}
        <button
          onClick={() => forceSync()}
          disabled={!isActuallyOnline || syncStatus === 'SYNCING'}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background py-2 text-xs font-semibold text-foreground transition hover:bg-muted-bg hover:text-primary disabled:opacity-50 disabled:hover:bg-background disabled:hover:text-foreground"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncStatus === 'SYNCING' ? 'animate-spin' : ''}`} />
          Force Sync Sync Now
        </button>
      </div>
    </div>
  );
}
