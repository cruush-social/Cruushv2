import { describe, expect, it, vi } from "vitest";
import {
  ERC20_TRANSFER_TOPIC,
  addressToTopic,
  createJsonRpcChainSource,
  decodeErc20Transfer,
  type ChainLog,
  type JsonRpcTransport
} from "./crypto-chain-source.js";

const paymentAddress = "0x73659c60270d326c06ac204f1a9c63f889a3d14b";
const senderAddress = "0x8e23ee67d1332ad560396262c48ffbb01f93d052";
const usdcOnBase = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

function transferLog(overrides: Partial<ChainLog> = {}): ChainLog {
  return {
    address: usdcOnBase,
    topics: [ERC20_TRANSFER_TOPIC, addressToTopic(senderAddress), addressToTopic(paymentAddress)],
    // 18990000 atomic units, left-padded to one 32-byte word.
    data: `0x${(18_990_000).toString(16).padStart(64, "0")}`,
    blockNumber: 1000n,
    blockHash: `0x${"a".repeat(64)}`,
    transactionHash: `0x${"b".repeat(64)}`,
    logIndex: 3,
    removed: false,
    ...overrides
  };
}

function jsonResponse(body: unknown, status = 200) {
  return { status, text: async () => JSON.stringify(body) };
}

describe("ERC-20 transfer decoding", () => {
  it("reads the sender, recipient, and amount from a well-formed transfer", () => {
    expect(decodeErc20Transfer(transferLog())).toEqual({
      tokenAddress: usdcOnBase,
      fromAddress: senderAddress,
      toAddress: paymentAddress,
      amountAtomic: 18_990_000n
    });
  });

  it("handles amounts far beyond what a 64-bit number could hold", () => {
    const huge = (2n ** 200n);
    const decoded = decodeErc20Transfer(transferLog({
      data: `0x${huge.toString(16).padStart(64, "0")}`
    }));

    expect(decoded?.amountAtomic).toBe(huge);
  });

  it("reads a zero-value transfer as zero rather than rejecting it", () => {
    expect(decodeErc20Transfer(transferLog({ data: `0x${"0".repeat(64)}` }))?.amountAtomic).toBe(0n);
  });

  it("ignores a log that is not a Transfer", () => {
    expect(decodeErc20Transfer(transferLog({ topics: [`0x${"c".repeat(64)}`] }))).toBeNull();
  });

  it("ignores a Transfer missing its indexed parameters", () => {
    expect(decodeErc20Transfer(transferLog({ topics: [ERC20_TRANSFER_TOPIC] }))).toBeNull();
  });

  it("refuses a topic whose padding is not zero, so a non-address cannot pose as one", () => {
    const poisoned = `0x1${"0".repeat(23)}${paymentAddress.slice(2)}`;

    expect(decodeErc20Transfer(transferLog({
      topics: [ERC20_TRANSFER_TOPIC, addressToTopic(senderAddress), poisoned]
    }))).toBeNull();
  });

  it("ignores a transfer whose data word is truncated", () => {
    expect(decodeErc20Transfer(transferLog({ data: "0x1234" }))).toBeNull();
  });

  it("builds a topic from an address and refuses an invalid one", () => {
    expect(addressToTopic(paymentAddress)).toBe(`0x${"0".repeat(24)}${paymentAddress.slice(2)}`);
    expect(() => addressToTopic("0xnope")).toThrow(/invalid address/);
  });
});

describe("JSON-RPC chain source", () => {
  function sourceWith(transport: ReturnType<typeof vi.fn>) {
    return createJsonRpcChainSource({
      chainId: 8453,
      endpointUrl: "https://rpc.example/with-a-secret-key",
      transport: transport as unknown as JsonRpcTransport
    });
  }

  it("sends a well-formed eth_blockNumber request and parses the hex result", async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: 1, result: "0x4b7" }));

    expect(await sourceWith(transport).getBlockNumber()).toBe(1207n);

    const body = JSON.parse(transport.mock.calls[0]![1] as string);
    expect(body).toMatchObject({ jsonrpc: "2.0", method: "eth_blockNumber", params: [] });
  });

  it("reads and verifies the endpoint chain id as a safe integer", async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: 1, result: "0x2105" }));

    expect(await sourceWith(transport).getChainId()).toBe(8453);

    const body = JSON.parse(transport.mock.calls[0]![1] as string);
    expect(body).toMatchObject({ jsonrpc: "2.0", method: "eth_chainId", params: [] });
  });

  it("reads the authoritative timestamp for the exact requested block", async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse({
      jsonrpc: "2.0",
      id: 1,
      result: { number: "0x3e8", timestamp: "0x66d4f640" }
    }));

    expect(await sourceWith(transport).getBlockTimestamp(1000n))
      .toEqual(new Date(Number(0x66d4f640) * 1000));

    const body = JSON.parse(transport.mock.calls[0]![1] as string);
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      method: "eth_getBlockByNumber",
      params: ["0x3e8", false]
    });
  });

  it("rejects a block response for a different height", async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse({
      jsonrpc: "2.0",
      id: 1,
      result: { number: "0x3e9", timestamp: "0x66d4f640" }
    }));

    await expect(sourceWith(transport).getBlockTimestamp(1000n))
      .rejects.toThrow(/different block/);
  });

  it("rejects a block whose canonical hash no longer matches the transfer log", async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse({
      jsonrpc: "2.0",
      id: 1,
      result: {
        number: "0x3e8",
        hash: `0x${"c".repeat(64)}`,
        timestamp: "0x66d4f640"
      }
    }));

    await expect(sourceWith(transport).getBlockTimestamp(1000n, `0x${"a".repeat(64)}`))
      .rejects.toThrow(/different block hash/);
  });

  it("rejects an unsafe endpoint chain id", async () => {
    const unsafe = `0x${(BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString(16)}`;
    const transport = vi.fn().mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: 1, result: unsafe }));

    await expect(sourceWith(transport).getChainId()).rejects.toThrow(/safe integer range/);
  });

  it("filters eth_getLogs by block range, token address, and recipient topic", async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: 1, result: [] }));

    await sourceWith(transport).getLogs({
      fromBlock: 100n,
      toBlock: 200n,
      address: [usdcOnBase.toUpperCase()],
      topics: [ERC20_TRANSFER_TOPIC, null, [addressToTopic(paymentAddress)]]
    });

    const body = JSON.parse(transport.mock.calls[0]![1] as string);
    expect(body.method).toBe("eth_getLogs");
    expect(body.params[0]).toEqual({
      fromBlock: "0x64",
      toBlock: "0xc8",
      address: [usdcOnBase],
      topics: [ERC20_TRANSFER_TOPIC, null, [addressToTopic(paymentAddress)]]
    });
  });

  it("does not call the endpoint at all when there is no address to watch", async () => {
    const transport = vi.fn();

    expect(await sourceWith(transport).getLogs({
      fromBlock: 1n,
      toBlock: 2n,
      address: [],
      topics: []
    })).toEqual([]);
    expect(transport).not.toHaveBeenCalled();
  });

  it("parses a log response and normalises its casing", async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse({
      jsonrpc: "2.0",
      id: 1,
      result: [{
        // Checksummed casing, as a real endpoint returns it: mixed-case body,
        // lowercase 0x prefix.
        address: `0x${usdcOnBase.slice(2).toUpperCase()}`,
        topics: [ERC20_TRANSFER_TOPIC, addressToTopic(senderAddress), addressToTopic(paymentAddress)],
        data: `0x${(1).toString(16).padStart(64, "0")}`,
        blockNumber: "0x3e8",
        blockHash: `0x${"A".repeat(64)}`,
        transactionHash: `0x${"b".repeat(64)}`,
        transactionIndex: "0x1",
        logIndex: "0x3",
        removed: false
      }]
    }));

    const [log] = await sourceWith(transport).getLogs({
      fromBlock: 1n,
      toBlock: 2n,
      address: [usdcOnBase],
      topics: []
    });

    expect(log).toMatchObject({
      address: usdcOnBase,
      blockNumber: 1000n,
      logIndex: 3,
      removed: false
    });
    expect(log!.blockHash).toBe(`0x${"a".repeat(64)}`);
  });

  it("reads a canonical successful transaction receipt and rejects mismatched receipt logs", async () => {
    const log = {
      address: usdcOnBase,
      topics: [ERC20_TRANSFER_TOPIC, addressToTopic(senderAddress), addressToTopic(paymentAddress)],
      data: `0x${(18_990_000).toString(16).padStart(64, "0")}`,
      blockNumber: "0x3e8",
      blockHash: `0x${"a".repeat(64)}`,
      transactionHash: `0x${"b".repeat(64)}`,
      logIndex: "0x3",
      removed: false
    };
    const transport = vi.fn().mockResolvedValue(jsonResponse({
      jsonrpc: "2.0",
      id: 1,
      result: {
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber,
        blockHash: log.blockHash,
        status: "0x1",
        logs: [log]
      }
    }));

    await expect(sourceWith(transport).getTransactionReceipt!(log.transactionHash)).resolves.toMatchObject({
      transactionHash: log.transactionHash,
      blockNumber: 1000n,
      blockHash: log.blockHash,
      succeeded: true,
      logs: [expect.objectContaining({ logIndex: 3 })]
    });

    const mismatched = sourceWith(vi.fn().mockResolvedValue(jsonResponse({
      jsonrpc: "2.0",
      id: 1,
      result: {
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber,
        blockHash: log.blockHash,
        status: "0x1",
        logs: [{ ...log, transactionHash: `0x${"c".repeat(64)}` }]
      }
    })));
    await expect(mismatched.getTransactionReceipt!(log.transactionHash))
      .rejects.toThrow(/do not match/);
  });

  it("carries the reorganization flag through", async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse({
      jsonrpc: "2.0",
      id: 1,
      result: [{
        address: usdcOnBase,
        topics: [ERC20_TRANSFER_TOPIC],
        data: "0x",
        blockNumber: "0x1",
        blockHash: `0x${"a".repeat(64)}`,
        transactionHash: `0x${"b".repeat(64)}`,
        logIndex: "0x0",
        removed: true
      }]
    }));

    const [log] = await sourceWith(transport).getLogs({
      fromBlock: 1n,
      toBlock: 2n,
      address: [usdcOnBase],
      topics: []
    });

    expect(log!.removed).toBe(true);
  });

  it("never puts the endpoint URL in an error, because it can carry an API key", async () => {
    const transport = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    await expect(sourceWith(transport).getBlockNumber()).rejects.toMatchObject({
      code: "CRYPTO_CHAIN_SOURCE_UNAVAILABLE"
    });

    const error = await sourceWith(transport).getBlockNumber().then(
      () => new Error("expected the call to fail"),
      (caught: Error) => caught
    );
    expect(error.message).not.toContain("secret");
    expect(error.message).not.toContain("rpc.example");
  });

  it("rejects a JSON-RPC error envelope rather than treating it as data", async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32005, message: "query returned more than 10000 results" }
    }));

    await expect(sourceWith(transport).getBlockNumber()).rejects.toThrow(/query returned more than 10000 results/);
  });

  it("rejects a non-200 response, malformed JSON, and a missing result", async () => {
    await expect(sourceWith(vi.fn().mockResolvedValue(jsonResponse({}, 503))).getBlockNumber())
      .rejects.toThrow(/HTTP 503/);

    await expect(sourceWith(vi.fn().mockResolvedValue({ status: 200, text: async () => "not json" })).getBlockNumber())
      .rejects.toThrow(/invalid JSON/);

    await expect(sourceWith(vi.fn().mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: 1 }))).getBlockNumber())
      .rejects.toThrow(/no result/);
  });

  it("rejects a malformed block number instead of silently reading it as zero", async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: 1, result: "not-hex" }));

    await expect(sourceWith(transport).getBlockNumber()).rejects.toThrow(/invalid block number/);
  });

  it("refuses a backwards block range", async () => {
    await expect(sourceWith(vi.fn()).getLogs({
      fromBlock: 10n,
      toBlock: 1n,
      address: [usdcOnBase],
      topics: []
    })).rejects.toThrow(/cannot be after/);
  });
});
