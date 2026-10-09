import { describe, expect, it } from "vitest";
import { createMempoolBitcoinSource, mempoolCapacityLevel } from "./bitcoin-mempool-source.js";
import { bitcoinAddressScript, type BitcoinSource } from "./bitcoin.js";

const address = "bc1qwzeyu8ju5pf5fmk9mcyallgv7nlkmmvvy7dk79";

function verifier(transactions: any[] = []): BitcoinSource {
  return {
    historyMode: "complete",
    head: async () => ({ height: 100, hash: "a".repeat(64) }),
    blockHash: async () => "a".repeat(64),
    feeRate: async () => 2,
    transactions: async () => transactions
  };
}

function socketHarness() {
  const listeners = new Map<string, (event: any) => void>();
  const sent: string[] = [];
  return {
    socket: {
      readyState: 0,
      send(data: string) { sent.push(data); },
      close() {},
      addEventListener(type: string, listener: (event: any) => void) { listeners.set(type, listener); }
    },
    sent,
    open() { listeners.get("open")?.({}); },
    message(payload: unknown) { listeners.get("message")?.({ data: JSON.stringify(payload) }); }
  };
}

describe("public Mempool Bitcoin source", () => {
  it("defines visible scale thresholds", () => {
    expect(mempoolCapacityLevel(39)).toBe("normal");
    expect(mempoolCapacityLevel(40)).toBe("warning");
    expect(mempoolCapacityLevel(50)).toBe("critical");
  });

  it("tracks addresses without credentials and wakes only after an address event", async () => {
    const harness = socketHarness();
    const source = createMempoolBitcoinSource({ verifier: verifier(), websocketFactory: () => { setTimeout(() => { harness.socket.readyState = 1; harness.open(); }, 0); return harness.socket; } });
    await source.syncAddresses!([address]);
    expect(harness.sent).toEqual([JSON.stringify({ "track-addresses": [address] })]);
    expect(source.hasPendingTransactions(address)).toBe(false);
    harness.message({ "multi-address-transactions": { [address]: { mempool: [], confirmed: [] } } });
    expect(source.hasPendingTransactions(address)).toBe(true);
  });

  it("uses the independent Esplora verifier only for a dirty address", async () => {
    const harness = socketHarness();
    const tx = { txid: "b".repeat(64), vout: [{ scriptpubkey: bitcoinAddressScript(address), value: 100 }], status: { confirmed: false } };
    const source = createMempoolBitcoinSource({ verifier: verifier([tx]), websocketFactory: () => { setTimeout(() => { harness.socket.readyState = 1; harness.open(); }, 0); return harness.socket; } });
    await source.syncAddresses!([address]);
    harness.message({ "address-transactions": [] });
    expect((await source.transactions(address, 0)).length).toBe(1);
    expect((await source.transactions(address, 0)).length).toBe(1);
  });
});
