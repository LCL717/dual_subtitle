export const DEBUG_LOG = 'dual-subtitle:debug-log:v1';
export const DEBUG_LIMIT = 7200;
export interface DebugEntry {
  elapsedMs: number;
  timelineControls?: ReturnType<typeof import('./timeline-probe.ts').readTimelineControls>;
  interaction?: NonNullable<ReturnType<typeof import('./timeline-probe.ts').timelineInteraction>>;
  event: string;
  videoTime: number | null;
  videoDuration?: number | null;
  videoCount?: number;
  hidden?: boolean;
  requestMs?: number;
  videoDelta?: number | null;
  playerDelta?: number | null;
  timelineJump?: boolean;
  diagnostics?: import('./ad-diagnostics.ts').AdDiagnostics;
  internalTiming?: import('./internal-timing-probe.ts').InternalTiming;
  videoId: number | null;
  paused: boolean | null;
  seeking: boolean | null;
  rate: number | null;
  readyState: number | null;
  phase: string;
  waiting: boolean;
  syncMode?: string;
  syncOffset?: number | null;
  syncDiagnostics?: import('./subtitle-sync.ts').SyncStatus['diagnostics'];
  syncProgress?: import('./subtitle-sync.ts').SyncStatus['progress'];
  playerTime?: number | null;
  playerId?: number | null;
  ad?: boolean;
  markers?: string[];
}
export function createDebugLog(limit = DEBUG_LIMIT, now = () => performance.now()) {
  let entries: DebugEntry[] = [];
  let cursor = 0;
  let dropped = 0;
  let active = false;
  let start = 0;
  let end = 0;
  let startedAt: string | null = null;
  return {
    start() {
      if (active) return;
      entries = []; cursor = 0; dropped = 0;
      start = end = now(); startedAt = new Date().toISOString(); active = true;
    },
    stop() { if (active) { end = now(); active = false; } },
    add(entry: Omit<DebugEntry, 'elapsedMs'>) {
      if (!active) return;
      const row = { ...entry, elapsedMs: Math.round(now() - start) };
      if (entries.length < limit) entries.push(row);
      else { entries[cursor] = row; cursor = (cursor + 1) % limit; dropped++; }
    },
    status() { return { active, count: entries.length, dropped, durationMs: startedAt ? Math.round((active ? now() : end) - start) : 0 }; },
    export() { return { schemaVersion: 4, experiment: 'internal-timing-v1', startedAt, ...this.status(), entries: [...entries.slice(cursor), ...entries.slice(0, cursor)] }; },
  };
}
