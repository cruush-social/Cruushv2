import { isAbsolute } from "node:path";
import { Worker } from "node:worker_threads";

export type TownPoint = { lat: number; lng: number };
export const MAX_TOWN_LOOKUP_POINTS = 128;
export const MAX_PENDING_TOWN_LOOKUPS = 8;
const REQUEST_TIMEOUT_MS = 2_000;
const STARTUP_TIMEOUT_MS = 120_000;

type Pending = {
  id: number;
  points: TownPoint[];
  resolve: (labels: Array<string | null>) => void;
  timer: NodeJS.Timeout;
};

/** One worker, one active request, a bounded queue; no coordinate/result cache. */
export class TownBoundaryLookup {
  private worker: Worker | null = null;
  private ready = false;
  private stopped = false;
  private sequence = 0;
  private active: Pending | null = null;
  private queue: Pending[] = [];
  private startupTimer: NodeJS.Timeout | null = null;

  constructor(private readonly databasePath: string) {}

  lookup(points: readonly TownPoint[]): Promise<Array<string | null>> {
    if (!points.length || points.length > MAX_TOWN_LOOKUP_POINTS) return Promise.resolve([]);
    const unknown = () => points.map(() => null);
    if (this.stopped || !isAbsolute(this.databasePath) || this.databasePath.includes("\0")
      || this.queue.length + Number(Boolean(this.active)) >= MAX_PENDING_TOWN_LOOKUPS) {
      return Promise.resolve(unknown());
    }
    if (!this.worker) this.start();
    if (this.stopped) return Promise.resolve(unknown());
    return new Promise((resolve) => {
      const entry: Pending = {
        id: ++this.sequence,
        points: points.map(({ lat, lng }) => ({ lat, lng })),
        resolve,
        timer: setTimeout(() => {
          if (this.active === entry) void this.close();
          else {
            this.queue = this.queue.filter((item) => item !== entry);
            resolve(unknown());
          }
        }, REQUEST_TIMEOUT_MS)
      };
      this.queue.push(entry);
      this.dispatch();
    });
  }

  private start() {
    try {
      const source = import.meta.url.endsWith(".ts");
      const [major, minor] = process.versions.node.split(".").map(Number);
      this.worker = new Worker(new URL(source ? "./town-boundary-worker.ts" : "./town-boundary-worker.js", import.meta.url), {
        workerData: { databasePath: this.databasePath },
        execArgv: [...(source ? ["--experimental-strip-types"] : []),
          ...(major === 22 && minor < 13 ? ["--experimental-sqlite"] : [])],
        resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
        // Never forward worker diagnostics containing artifact data to app logs.
        stdout: true,
        stderr: true
      });
      this.worker.stdout?.resume();
      this.worker.stderr?.resume();
      this.worker.on("error", () => { void this.close(); });
      this.worker.on("exit", () => { void this.close(); });
      this.worker.on("message", (message: unknown) => {
        if (!message || typeof message !== "object") return void this.close();
        const reply = message as { type?: string; id?: number; labels?: unknown };
        if (reply.type === "ready" && !this.ready) {
          this.ready = true;
          if (this.startupTimer) clearTimeout(this.startupTimer);
          this.dispatch();
        } else if (reply.type === "result" && this.active && reply.id === this.active.id
          && Array.isArray(reply.labels) && reply.labels.length === this.active.points.length
          && reply.labels.every((label) => label === null || (typeof label === "string" && label.length <= 160))) {
          const entry = this.active;
          this.active = null;
          clearTimeout(entry.timer);
          entry.resolve(reply.labels);
          this.dispatch();
        } else void this.close();
      });
      this.startupTimer = setTimeout(() => { void this.close(); }, STARTUP_TIMEOUT_MS);
      this.startupTimer.unref();
      this.worker.unref();
    } catch { void this.close(); }
  }

  private dispatch() {
    if (!this.ready || this.active || this.stopped || !this.worker) return;
    this.active = this.queue.shift() ?? null;
    if (!this.active) { this.worker.unref(); return; }
    this.worker.ref();
    try { this.worker.postMessage({ id: this.active.id, points: this.active.points }); }
    catch { void this.close(); }
  }

  async close(): Promise<void> {
    this.stopped = true;
    if (this.startupTimer) clearTimeout(this.startupTimer);
    for (const entry of [...(this.active ? [this.active] : []), ...this.queue]) {
      clearTimeout(entry.timer);
      entry.resolve(entry.points.map(() => null));
    }
    this.active = null;
    this.queue = [];
    const worker = this.worker;
    this.worker = null;
    if (worker) await worker.terminate().catch(() => undefined);
  }
}
