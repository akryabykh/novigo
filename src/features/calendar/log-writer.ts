import type { QueryClient } from '@tanstack/react-query';

import { qk } from '../../core/query';
import type { Workspace } from '../queries';
import { applyLog, type LogInput } from './log-cache';

type Write = (changes: LogInput[]) => Promise<unknown>;
type Entry = { changes: LogInput[]; resolve: () => void };
const keyOf = (v: LogInput) => `${v.goalId}|${v.date}`;

/** One ordered writer per account/cache, independent of mounted screens. */
export class LogWriter {
  private queue: Entry[] = [];
  private confirmed = new Map<string, LogInput>();
  private listeners = new Set<() => void>();
  private running = false;
  private state: { pending: boolean; error: Error | null } = { pending: false, error: null };

  constructor(
    private qc: QueryClient,
    private uid: string,
    private write: Write,
    private onSaved: () => void,
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getSnapshot = () => this.state;
  private notify(patch: Partial<typeof this.state>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  clearError = () => this.notify({ error: null });

  /** Preserve pending edits even if a workspace read finishes during a write. */
  overlay = (ws: Workspace): Workspace => {
    let next = ws;
    for (const value of this.confirmed.values()) next = applyLog(next, value);
    for (const entry of this.queue) for (const value of entry.changes) next = applyLog(next, value);
    return next;
  };

  private repaint() {
    this.qc.setQueryData<Workspace>(qk.workspace(this.uid), (ws) => ws && this.overlay(ws));
  }

  enqueue = (changes: LogInput[]): Promise<void> => {
    if (!changes.length) return Promise.resolve();
    const unique = [...new Map(changes.map((v) => [keyOf(v), { ...v }])).values()];
    const ws = this.qc.getQueryData<Workspace>(qk.workspace(this.uid));
    for (const v of unique) {
      if (!this.confirmed.has(keyOf(v))) {
        const old = ws?.logs.find((l) => l.goalId === v.goalId && l.date === v.date);
        this.confirmed.set(keyOf(v), { ...v, value: old?.value ?? 0 });
      }
    }
    const finished = new Promise<void>((resolve) => this.queue.push({ changes: unique, resolve }));
    this.notify({ pending: true, error: null });
    this.repaint();
    void this.drain();
    return finished;
  };

  private async drain() {
    if (this.running) return;
    this.running = true;
    let saved = false;
    while (this.queue.length) {
      const entry = this.queue[0];
      try {
        await this.qc.cancelQueries({ queryKey: qk.workspace(this.uid) });
        this.repaint();
        await this.write(entry.changes);
        entry.changes.forEach((v) => this.confirmed.set(keyOf(v), v));
        saved = true;
      } catch (error) {
        this.notify({ error: error instanceof Error ? error : new Error(String(error)) });
      }
      this.queue.shift();
      this.repaint();
      entry.resolve();
    }
    this.confirmed.clear();
    this.running = false;
    this.notify({ pending: false });
    void this.qc.invalidateQueries({ queryKey: qk.workspace(this.uid) });
    if (saved) this.onSaved();
  }
}

const writers = new WeakMap<QueryClient, Map<string, LogWriter>>();

export function getLogWriter(qc: QueryClient, uid: string, write: Write, onSaved: () => void): LogWriter {
  let byUser = writers.get(qc);
  if (!byUser) { byUser = new Map(); writers.set(qc, byUser); }
  let writer = byUser.get(uid);
  if (!writer) { writer = new LogWriter(qc, uid, write, onSaved); byUser.set(uid, writer); }
  return writer;
}

export function overlayPendingLogs(qc: QueryClient, uid: string, ws: Workspace): Workspace {
  return writers.get(qc)?.get(uid)?.overlay(ws) ?? ws;
}
