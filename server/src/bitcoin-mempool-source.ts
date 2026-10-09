import { ApiError } from "./errors.js";
import { bitcoinAddressScript, type BitcoinSource, type BitcoinTransaction } from "./bitcoin.js";

const MEMPOOL_WEBSOCKET_URL = "wss://mempool.space/api/v1/ws";
const SOCKET_TIMEOUT_MS = 10_000;
export const MEMPOOL_CAPACITY_WARNING = 40;
export const MEMPOOL_CAPACITY_CRITICAL = 50;

type MempoolSocket = {
  readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: "open" | "message" | "error" | "close", listener: (event: any) => void): void;
};

export type MempoolBitcoinSource = BitcoinSource & {
  readonly historyMode: "triggered";
  hasPendingTransactions(address: string): boolean;
  verifyTransactions(address: string, origin: number): Promise<BitcoinTransaction[]>;
};

export type MempoolBitcoinSourceOptions = {
  verifier: BitcoinSource;
  websocketFactory?: () => MempoolSocket;
  onStatus?: (status: MempoolStatus) => void;
};

export type MempoolStatus =
  | { type: "capacity"; activeAddresses: number; level: MempoolCapacityLevel }
  | { type: "socket-error" | "socket-disconnected" };

export type MempoolCapacityLevel = "normal" | "warning" | "critical";

export function mempoolCapacityLevel(activeAddresses: number): MempoolCapacityLevel {
  if (activeAddresses >= MEMPOOL_CAPACITY_CRITICAL) return "critical";
  if (activeAddresses >= MEMPOOL_CAPACITY_WARNING) return "warning";
  return "normal";
}

function validAddress(value: string) {
  try {
    bitcoinAddressScript(value);
    return true;
  } catch {
    return false;
  }
}

function messageText(event: any) {
  if (typeof event?.data === "string") return event.data;
  if (event?.data instanceof ArrayBuffer) return new TextDecoder().decode(event.data);
  return "";
}

export function createMempoolBitcoinSource(options: MempoolBitcoinSourceOptions): MempoolBitcoinSource {
  const websocketFactory = options.websocketFactory ?? (() => new WebSocket(MEMPOOL_WEBSOCKET_URL) as unknown as MempoolSocket);
  const desired = new Set<string>();
  const dirty = new Set<string>();
  const cached = new Map<string, BitcoinTransaction[]>();
  let socket: MempoolSocket | null = null;
  let connecting: Promise<void> | null = null;
  let lastCapacityLevel: MempoolCapacityLevel | null = null;

  function markAllDirty() {
    for (const address of desired) dirty.add(address);
  }

  function handleMessage(event: any) {
    let payload: unknown;
    try { payload = JSON.parse(messageText(event)); } catch { return; }
    if (!payload || typeof payload !== "object") return;
    const value = payload as Record<string, unknown>;
    const multi = value["multi-address-transactions"];
    if (multi && typeof multi === "object") {
      for (const address of Object.keys(multi as Record<string, unknown>)) {
        if (desired.has(address)) dirty.add(address);
      }
    }
    if ("address-transactions" in value || "block-transactions" in value || "address-removed-transactions" in value || "replaced-transactions" in value) {
      // Mempool's single-address event does not include the subscribed address.
      // Marking the small active set dirty is safe; Esplora performs exact output matching.
      markAllDirty();
    }
  }

  async function ensureSocket() {
    if (socket?.readyState === 1) return;
    if (connecting) return connecting;
    connecting = new Promise<void>((resolve, reject) => {
      const next = websocketFactory();
      let settled = false;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else resolve();
      };
      const timer = setTimeout(() => finish(new Error("Mempool WebSocket connection timed out.")), SOCKET_TIMEOUT_MS);
      next.addEventListener("message", handleMessage);
      next.addEventListener("open", () => {
        clearTimeout(timer);
        socket = next;
        next.send(JSON.stringify({ "track-addresses": [...desired] }));
        finish();
      });
      next.addEventListener("error", () => {
        clearTimeout(timer);
        if (socket === next) socket = null;
        options.onStatus?.({ type: "socket-error" });
        finish(new Error("Mempool WebSocket connection failed."));
      });
      next.addEventListener("close", () => {
        if (socket === next) {
          socket = null;
          markAllDirty();
          options.onStatus?.({ type: "socket-disconnected" });
        }
      });
    }).finally(() => { connecting = null; });
    try {
      await connecting;
    } catch {
      throw new ApiError(502, "CRYPTO_CHAIN_SOURCE_UNAVAILABLE", "Bitcoin address monitoring is temporarily unavailable.");
    }
  }

  async function syncAddresses(addresses: string[]) {
    const normalized = [...new Set(addresses)].filter(validAddress).sort();
    desired.clear();
    for (const address of normalized) desired.add(address);
    for (const address of [...dirty]) if (!desired.has(address)) dirty.delete(address);
    for (const address of [...cached.keys()]) if (!desired.has(address)) cached.delete(address);
    const level = mempoolCapacityLevel(normalized.length);
    if (level !== lastCapacityLevel) {
      lastCapacityLevel = level;
      options.onStatus?.({ type: "capacity", activeAddresses: normalized.length, level });
    }
    const wasOpen = socket?.readyState === 1;
    await ensureSocket();
    if (wasOpen && socket?.readyState === 1) socket.send(JSON.stringify({ "track-addresses": normalized }));
  }

  async function transactions(address: string, origin: number) {
    if (!desired.has(address) || !dirty.delete(address)) return cached.get(address) ?? [];
    const script = bitcoinAddressScript(address);
    const history = await options.verifier.transactions(address, origin);
    const filtered = history.filter(tx => tx.vout.some(output => output.scriptpubkey === script && output.value > 0));
    cached.set(address, filtered);
    return filtered;
  }

  return {
    historyMode: "triggered",
    head: () => options.verifier.head(),
    blockHash: height => options.verifier.blockHash(height),
    feeRate: () => options.verifier.feeRate(),
    transactions,
    verifyTransactions: (address, origin) => options.verifier.transactions(address, origin),
    syncAddresses,
    hasPendingTransactions: address => desired.has(address) && (dirty.has(address) || (cached.get(address)?.length ?? 0) > 0),
    stop() { socket?.close(); socket = null; }
  };
}
