/**
 * Read-only JSON-RPC access for the crypto payment watcher.
 *
 * Request and response shapes come from the current official Ethereum JSON-RPC
 * documentation (https://ethereum.org/en/developers/docs/apis/json-rpc/), which
 * Base implements:
 *
 *   eth_blockNumber
 *     request  {"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":83}
 *     response {"id":83,"jsonrpc":"2.0","result":"0x4b7"}
 *
 *   eth_chainId
 *     request  {"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":84}
 *     response {"id":84,"jsonrpc":"2.0","result":"0x2105"}
 *
 *   eth_getBlockByNumber
 *     request  {"jsonrpc":"2.0","method":"eth_getBlockByNumber","params":["0x4b7",false],"id":85}
 *     response block object containing the authoritative hex `number` and `timestamp`
 *
 *   eth_getLogs
 *     request  filter object with fromBlock, toBlock, address, topics
 *              (blockHash is mutually exclusive with fromBlock/toBlock)
 *     response array of log objects, each with address, topics, data,
 *              blockNumber, transactionHash, transactionIndex, blockHash,
 *              logIndex, and removed. `removed` is documented as
 *              "true when the log was removed, due to a chain reorganization".
 *
 * This module only reads. It has no signing key, sends no transaction, and
 * exposes no broadcast call. It makes no request at all unless an endpoint is
 * configured, and the transport is injected so tests never touch a network.
 */

import { ApiError } from "./errors.js";

export type JsonRpcTransport = (
  url: string,
  body: string,
  signal: AbortSignal
) => Promise<{ status: number; text: () => Promise<string> }>;

export type ChainLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: bigint;
  blockHash: string;
  transactionHash: string;
  logIndex: number;
  removed: boolean;
};

export type ChainSource = {
  chainId: number;
  getChainId(): Promise<number>;
  getBlockNumber(): Promise<bigint>;
  getBlockTimestamp(blockNumber: bigint, expectedBlockHash?: string): Promise<Date>;
  getLogs(input: {
    fromBlock: bigint;
    toBlock: bigint;
    address: string[];
    topics: (string | string[] | null)[];
  }): Promise<ChainLog[]>;
};

// keccak256("Transfer(address,address,uint256)"). This is fixed by ERC-20 and
// is the topic0 every compliant token emits on transfer.
export const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const HEX_QUANTITY = /^0x(0|[1-9a-f][0-9a-f]*)$/;
const HEX_DATA = /^0x[0-9a-f]*$/;

function parseHexQuantity(value: unknown, field: string): bigint {
  if (typeof value !== "string" || !HEX_QUANTITY.test(value.toLowerCase())) {
    throw new Error(`Chain source returned an invalid ${field}.`);
  }

  return BigInt(value);
}

function toHexQuantity(value: bigint) {
  if (value < 0n) {
    throw new Error("Block numbers cannot be negative.");
  }

  return `0x${value.toString(16)}`;
}

function parseLog(value: unknown): ChainLog {
  if (typeof value !== "object" || value === null) {
    throw new Error("Chain source returned a log that is not an object.");
  }

  const log = value as Record<string, unknown>;
  const topics = Array.isArray(log.topics) ? log.topics : null;
  if (!topics || topics.some((topic) => typeof topic !== "string")) {
    throw new Error("Chain source returned a log without valid topics.");
  }

  if (typeof log.address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(log.address)) {
    throw new Error("Chain source returned a log without a valid address.");
  }

  if (typeof log.data !== "string" || !HEX_DATA.test(log.data.toLowerCase())) {
    throw new Error("Chain source returned a log without valid data.");
  }

  if (typeof log.transactionHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(log.transactionHash)) {
    throw new Error("Chain source returned a log without a valid transaction hash.");
  }

  if (typeof log.blockHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(log.blockHash)) {
    throw new Error("Chain source returned a log without a valid block hash.");
  }

  return {
    address: log.address.toLowerCase(),
    topics: (topics as string[]).map((topic) => topic.toLowerCase()),
    data: log.data.toLowerCase(),
    blockNumber: parseHexQuantity(log.blockNumber, "block number"),
    blockHash: log.blockHash.toLowerCase(),
    transactionHash: log.transactionHash.toLowerCase(),
    logIndex: Number(parseHexQuantity(log.logIndex, "log index")),
    // An absent `removed` is treated as not removed, which is what the field
    // means; it is only ever set to true by a reorganization.
    removed: log.removed === true
  };
}

/**
 * Decodes an ERC-20 Transfer log. `from` and `to` are indexed, so they arrive
 * as 32-byte topics that must be narrowed to their low 20 bytes; the value is
 * the non-indexed 32-byte data word.
 *
 * Returns null rather than throwing for anything that is not a well-formed
 * Transfer, so one malformed log cannot stall the whole watcher.
 */
export function decodeErc20Transfer(log: ChainLog) {
  if (log.topics[0] !== ERC20_TRANSFER_TOPIC || log.topics.length < 3) {
    return null;
  }

  const fromTopic = log.topics[1];
  const toTopic = log.topics[2];
  if (!fromTopic || !toTopic || fromTopic.length !== 66 || toTopic.length !== 66) {
    return null;
  }

  // A 32-byte topic holding an address must be zero-padded on the left. A
  // non-zero prefix means this is not an address and must not be trusted.
  if (!/^0x0{24}[0-9a-f]{40}$/.test(fromTopic) || !/^0x0{24}[0-9a-f]{40}$/.test(toTopic)) {
    return null;
  }

  const dataWord = log.data.slice(2);
  if (dataWord.length < 64) {
    return null;
  }

  // Take the first word only. A compliant Transfer has exactly one.
  let amountAtomic: bigint;
  try {
    amountAtomic = BigInt(`0x${dataWord.slice(0, 64)}`);
  } catch {
    return null;
  }

  return {
    tokenAddress: log.address,
    fromAddress: `0x${fromTopic.slice(26)}`,
    toAddress: `0x${toTopic.slice(26)}`,
    amountAtomic
  };
}

export function addressToTopic(address: string) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error("Cannot build a log topic from an invalid address.");
  }

  return `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
}

const defaultTransport: JsonRpcTransport = async (url, body, signal) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    signal
  });

export function createJsonRpcChainSource(input: {
  chainId: number;
  endpointUrl: string;
  timeoutMs?: number;
  transport?: JsonRpcTransport;
}): ChainSource {
  const transport = input.transport ?? defaultTransport;
  const timeoutMs = input.timeoutMs ?? 10_000;
  let nextRequestId = 1;

  async function call(method: string, params: unknown[]): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const requestId = nextRequestId++;

    let response: { status: number; text: () => Promise<string> };
    try {
      response = await transport(
        input.endpointUrl,
        JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }),
        controller.signal
      );
    } catch {
      // The endpoint URL can carry an API key, so it never reaches the message.
      throw new ApiError(502, "CRYPTO_CHAIN_SOURCE_UNAVAILABLE", `Chain source did not answer ${method}.`);
    } finally {
      clearTimeout(timeout);
    }

    if (response.status < 200 || response.status >= 300) {
      throw new ApiError(
        502,
        "CRYPTO_CHAIN_SOURCE_UNAVAILABLE",
        `Chain source answered ${method} with HTTP ${response.status}.`
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(await response.text());
    } catch {
      throw new ApiError(502, "CRYPTO_CHAIN_SOURCE_UNAVAILABLE", `Chain source returned invalid JSON for ${method}.`);
    }

    if (typeof body !== "object" || body === null) {
      throw new ApiError(502, "CRYPTO_CHAIN_SOURCE_UNAVAILABLE", `Chain source returned no result for ${method}.`);
    }

    const envelope = body as Record<string, unknown>;
    if (envelope.error !== undefined && envelope.error !== null) {
      const error = envelope.error as Record<string, unknown>;
      const detail = typeof error.message === "string" ? error.message : "unknown error";
      throw new ApiError(502, "CRYPTO_CHAIN_SOURCE_UNAVAILABLE", `Chain source rejected ${method}: ${detail}`);
    }

    if (!("result" in envelope)) {
      throw new ApiError(502, "CRYPTO_CHAIN_SOURCE_UNAVAILABLE", `Chain source returned no result for ${method}.`);
    }

    return envelope.result;
  }

  return {
    chainId: input.chainId,

    async getChainId() {
      const chainId = parseHexQuantity(await call("eth_chainId", []), "chain id");
      if (chainId > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("Chain source returned a chain id outside the safe integer range.");
      }
      return Number(chainId);
    },

    async getBlockNumber() {
      return parseHexQuantity(await call("eth_blockNumber", []), "block number");
    },

    async getBlockTimestamp(blockNumber, expectedBlockHash) {
      if (blockNumber < 0n) {
        throw new Error("Block numbers cannot be negative.");
      }

      const result = await call("eth_getBlockByNumber", [toHexQuantity(blockNumber), false]);
      if (typeof result !== "object" || result === null) {
        throw new ApiError(
          502,
          "CRYPTO_CHAIN_SOURCE_UNAVAILABLE",
          "Chain source returned no block for eth_getBlockByNumber."
        );
      }

      const block = result as Record<string, unknown>;
      const observedBlockNumber = parseHexQuantity(block.number, "block number");
      if (observedBlockNumber !== blockNumber) {
        throw new Error("Chain source returned a different block than requested.");
      }
      if (expectedBlockHash !== undefined) {
        if (
          typeof block.hash !== "string"
          || !/^0x[0-9a-fA-F]{64}$/.test(block.hash)
          || block.hash.toLowerCase() !== expectedBlockHash.toLowerCase()
        ) {
          throw new Error("Chain source returned a different block hash than the transfer log.");
        }
      }

      const timestampSeconds = parseHexQuantity(block.timestamp, "block timestamp");
      const maxDateSeconds = 8_640_000_000_000n;
      if (timestampSeconds > maxDateSeconds) {
        throw new Error("Chain source returned a block timestamp outside the supported date range.");
      }

      return new Date(Number(timestampSeconds) * 1000);
    },

    async getLogs(filter) {
      if (filter.fromBlock > filter.toBlock) {
        throw new Error("Log filter fromBlock cannot be after toBlock.");
      }

      if (filter.address.length === 0) {
        return [];
      }

      const result = await call("eth_getLogs", [
        {
          fromBlock: toHexQuantity(filter.fromBlock),
          toBlock: toHexQuantity(filter.toBlock),
          address: filter.address.map((value) => value.toLowerCase()),
          topics: filter.topics
        }
      ]);

      if (!Array.isArray(result)) {
        throw new ApiError(
          502,
          "CRYPTO_CHAIN_SOURCE_UNAVAILABLE",
          "Chain source returned a non-array result for eth_getLogs."
        );
      }

      return result.map(parseLog);
    }
  };
}
