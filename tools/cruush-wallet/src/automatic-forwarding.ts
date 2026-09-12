/** Automatic forwarding to pinned cold destinations. Runs separately from the website.
 * The owner provisions receive-chain keys once. No master seed or ELLIPAL key is stored.
 */
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { Address as BitcoinAddress, Transaction, p2wpkh } from '@scure/btc-signer';
import { encodeFunctionData, getAddress, keccak256, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ELLIPAL_DESTINATION, RECEIVE_CHAIN_PATH, PUBLIC_DESCRIPTOR_SAMPLE_INDICES } from './constants.js';
import { assertSafeSecretSession, readHiddenLine, readVisibleLine } from './interactive.js';
import { readDefaultPublicDescriptor } from './public-descriptor-file.js';
import { assertValidWalletMnemonic, deriveAddressFromReceiveChainXpub, fingerprintReceiveChainXpub, type WalletPublicDescriptor } from './wallet.js';
import { getOperatorWalletRail } from './networks.js';
import { type WalletSweepPlanBundle, type SignedWalletSweepBundle } from './wallet-rpc.js';
import type { SignedOperatorWalletTransaction } from './signing.js';

export const BITCOIN_PATH = "m/84'/0'/0'/0";
const GENESIS = '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f';
export type ForwardingKeys = { version: 1; evmReceiveChainXprv: string; bitcoinReceiveChainXprv: string; bitcoinDestination: string };
export type BitcoinForward = { kind: 'bitcoin'; rawTransaction: string; transactionHash: string; feeAtomic: string; amountAtomic: string; destination: string };
const transferAbi = parseAbi(['function transfer(address to, uint256 value) returns (bool)']);

export function forwardingPublicConfig(keys: ForwardingKeys) {
  const evm = HDKey.fromExtendedKey(keys.evmReceiveChainXprv);
  const btc = HDKey.fromExtendedKey(keys.bitcoinReceiveChainXprv);
  try {
    if (keys.version !== 1 || !evm.privateKey || !btc.privateKey || evm.depth !== 4 || btc.depth !== 4) throw new Error('Invalid automatic forwarding key file.');
    BitcoinAddress().decode(keys.bitcoinDestination);
    return { evmXpub: evm.publicExtendedKey, bitcoinXpub: btc.publicExtendedKey, bitcoinDestination: keys.bitcoinDestination, evmDestination: ELLIPAL_DESTINATION };
  } finally { evm.wipePrivateData(); btc.wipePrivateData(); }
}

export function descriptorFromForwardingKeys(keys: ForwardingKeys): WalletPublicDescriptor {
  const { evmXpub } = forwardingPublicConfig(keys);
  return { version: 1, receiveChainPath: RECEIVE_CHAIN_PATH, receiveChainXpub: evmXpub, xpubFingerprint: fingerprintReceiveChainXpub(evmXpub), treasuryDerivationIndex: 0, treasuryAddress: deriveAddressFromReceiveChainXpub(evmXpub, 0), sampleAddresses: PUBLIC_DESCRIPTOR_SAMPLE_INDICES.map(derivationIndex => ({ derivationIndex, address: deriveAddressFromReceiveChainXpub(evmXpub, derivationIndex) })) };
}

export async function readForwardingKeys(filePath: string): Promise<ForwardingKeys> {
  const file = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid()) || stat.size > 4096) throw new Error('Forwarding key file must be private and owned by this service user.');
    const keys = JSON.parse(await file.readFile('utf8')) as ForwardingKeys;
    forwardingPublicConfig(keys);
    return keys;
  } catch { throw new Error('Unable to load the private forwarding configuration.'); }
  finally { await file.close(); }
}

export async function setupAutomaticForwarding(filePath: string) {
  assertSafeSecretSession();
  const { descriptor } = await readDefaultPublicDescriptor();
  const destination = (await readVisibleLine('ELLIPAL Bitcoin Receive address (public): ')).trim();
  BitcoinAddress().decode(destination);
  if ((await readVisibleLine('Type ENABLE AUTOMATIC FORWARDING to authorize this separate service: ')).trim() !== 'ENABLE AUTOMATIC FORWARDING') throw new Error('Setup cancelled.');
  let words = await readHiddenLine('Existing PROCESSOR software-wallet recovery words, NOT ELLIPAL words (hidden): ');
  let seed: Uint8Array | undefined;
  let root: HDKey | undefined;
  let evm: HDKey | undefined;
  let btc: HDKey | undefined;
  try {
    seed = mnemonicToSeedSync(assertValidWalletMnemonic(words));
    root = HDKey.fromMasterSeed(seed);
    evm = root.derive(RECEIVE_CHAIN_PATH);
    btc = root.derive(BITCOIN_PATH);
    if (fingerprintReceiveChainXpub(evm.publicExtendedKey) !== descriptor.xpubFingerprint) throw new Error('These words do not match the existing processor wallet. No configuration was written.');
    const keys: ForwardingKeys = { version: 1, evmReceiveChainXprv: evm.privateExtendedKey, bitcoinReceiveChainXprv: btc.privateExtendedKey, bitcoinDestination: destination };
    const file = await open(filePath, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(keys)); await file.sync(); } finally { await file.close(); }
    const publicConfig = forwardingPublicConfig(keys);
    process.stdout.write(`Private forwarding configuration saved. Keep this file off the website server.\nCRYPTO_PROCESSOR_BITCOIN_WALLET_XPUB=${publicConfig.bitcoinXpub}\nBitcoin destination: ${destination}\n`);
    keys.evmReceiveChainXprv = ''; keys.bitcoinReceiveChainXprv = '';
  } finally { words = ''; evm?.wipePrivateData(); btc?.wipePrivateData(); root?.wipePrivateData(); seed?.fill(0); }
}

export async function signAutomaticEvmBundle(keys: ForwardingKeys, plan: WalletSweepPlanBundle): Promise<SignedWalletSweepBundle> {
  const descriptor = descriptorFromForwardingKeys(keys);
  if (plan.walletXpubFingerprint !== descriptor.xpubFingerprint || plan.derivationIndex < 1 || plan.derivationIndex >= 2 ** 31) throw new Error('Forwarding plan does not match this wallet.');
  const token = plan.tokenSweepPlan;
  const rail = getOperatorWalletRail(token.rail);
  const from = getAddress(deriveAddressFromReceiveChainXpub(descriptor.receiveChainXpub, plan.derivationIndex));
  if (token.fromAddress !== from || token.tokenContract !== rail.tokenAddress || token.destinationAddress !== ELLIPAL_DESTINATION || token.fromDerivationIndex !== plan.derivationIndex || token.chainId !== rail.chainId) throw new Error('Forwarding plan must pay the pinned ELLIPAL destination.');
  const root = HDKey.fromExtendedKey(keys.evmReceiveChainXprv);
  async function sign(index: number, tx: Parameters<ReturnType<typeof privateKeyToAccount>['signTransaction']>[0]) {
    const child = root.deriveChild(index);
    try {
      if (!child.privateKey) throw new Error('Missing receiving key.');
      return await privateKeyToAccount(`0x${Buffer.from(child.privateKey).toString('hex')}`).signTransaction(tx);
    } finally { child.wipePrivateData(); }
  }
  try {
    let gas: SignedOperatorWalletTransaction | null = null;
    const funding = plan.gasFundingPlan;
    if (funding) {
      if (funding.fromDerivationIndex !== 0 || funding.toDerivationIndex !== plan.derivationIndex || funding.fromAddress !== getAddress(descriptor.treasuryAddress) || funding.toAddress !== from || funding.chainId !== rail.chainId) throw new Error('Invalid automatic fee-funding destination.');
      const raw = await sign(0, { chainId: funding.chainId, type: 'eip1559', nonce: funding.nonce, gas: funding.gasLimit, maxFeePerGas: funding.maxFeePerGas, maxPriorityFeePerGas: funding.maxPriorityFeePerGas, to: from, value: funding.valueWei });
      gas = { version: 1, network: plan.network, rail: null, kind: funding.kind, chainId: funding.chainId, walletXpubFingerprint: descriptor.xpubFingerprint, sourceDerivationIndex: 0, recipientDerivationIndex: plan.derivationIndex, fromAddress: funding.fromAddress, transactionTo: from, recipientAddress: from, amountAtomic: funding.valueWei.toString(), maximumFeeWei: (funding.gasLimit * funding.maxFeePerGas).toString(), transactionHash: keccak256(raw), rawTransaction: raw };
    }
    const raw = await sign(plan.derivationIndex, { chainId: rail.chainId, type: 'eip1559', nonce: token.nonce, gas: token.gasLimit, maxFeePerGas: token.maxFeePerGas, maxPriorityFeePerGas: token.maxPriorityFeePerGas, to: rail.tokenAddress, value: 0n, data: encodeFunctionData({ abi: transferAbi, functionName: 'transfer', args: [ELLIPAL_DESTINATION, token.amountAtomic] }) });
    return { version: 1, kind: 'wallet-sweep-signed-bundle', network: plan.network, rail: plan.rail, walletXpubFingerprint: descriptor.xpubFingerprint, derivationIndex: plan.derivationIndex, gasFundingTransaction: gas, tokenSweepTransaction: { version: 1, network: plan.network, rail: plan.rail, kind: token.kind, chainId: rail.chainId, walletXpubFingerprint: descriptor.xpubFingerprint, sourceDerivationIndex: plan.derivationIndex, recipientDerivationIndex: null, destinationAddress: ELLIPAL_DESTINATION, fromAddress: from, transactionTo: rail.tokenAddress, recipientAddress: ELLIPAL_DESTINATION, amountAtomic: token.amountAtomic.toString(), maximumFeeWei: (token.gasLimit * token.maxFeePerGas).toString(), transactionHash: keccak256(raw), rawTransaction: raw } };
  } finally { root.wipePrivateData(); }
}

export function createBitcoinForwardingApi(endpoint: string, fetcher: typeof fetch = fetch) {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Invalid Bitcoin source URL.');
  if (url.username || url.password || url.search || url.hash) throw new Error('Invalid Bitcoin source URL.');
  async function request(path: string, body?: string) {
    try {
      const response = await fetcher(`${url.href.replace(/\/$/, '')}/${path}`, { method: body === undefined ? 'GET' : 'POST', body, signal: AbortSignal.timeout(15000), redirect: 'error' });
      if (!response.ok) throw new Error('unavailable');
      return await response.text();
    } catch { throw new Error('Bitcoin forwarding network request failed.'); }
  }
  return { request, async json(path: string) { return JSON.parse(await request(path)); } };
}

export async function prepareBitcoinForward(keys: ForwardingKeys, index: number, budgetAtomic: string, endpoint: string, fetcher: typeof fetch = fetch): Promise<BitcoinForward> {
  if (!Number.isSafeInteger(index) || index < 1 || index >= 2 ** 31 || !/^\d+$/.test(budgetAtomic)) throw new Error('Invalid Bitcoin forwarding order.');
  const api = createBitcoinForwardingApi(endpoint, fetcher);
  if ((await api.request('block-height/0')).trim() !== GENESIS) throw new Error('Bitcoin forwarding source is on the wrong network.');
  const root = HDKey.fromExtendedKey(keys.bitcoinReceiveChainXprv);
  const child = root.deriveChild(index);
  try {
    if (!child.privateKey || !child.publicKey || root.depth !== 4) throw new Error('Invalid Bitcoin receiving key.');
    const payment = p2wpkh(child.publicKey);
    const head = Number(await api.request('blocks/tip/height'));
    if (!Number.isSafeInteger(head) || head < 0) throw new Error('Invalid Bitcoin head.');
    const tipHash = (await api.request(`block-height/${head}`)).trim();
    const received = await api.json(`address/${payment.address}/utxo`);
    if (!Array.isArray(received) || received.length > 100) throw new Error('No bounded Bitcoin collection available.');
    // A later unconfirmed dust output must not block an already confirmed purchase.
    const utxos = received.filter(u => u.status?.confirmed && Number.isInteger(u.status.block_height) && head - u.status.block_height + 1 >= 6);
    if (!utxos.length) throw new Error('Bitcoin collection is waiting for six confirmations.');
    const tx = new Transaction();
    let total = 0n;
    for (const u of utxos) {
      if (!/^[a-f0-9]{64}$/.test(u.txid) || !Number.isInteger(u.vout) || u.vout < 0 || !Number.isSafeInteger(u.value) || u.value <= 0 || !u.status?.confirmed || !Number.isInteger(u.status.block_height) || head - u.status.block_height + 1 < 6) throw new Error('Bitcoin collection is waiting for six confirmations.');
      if ((await api.request(`block-height/${u.status.block_height}`)).trim() !== u.status.block_hash) throw new Error('Bitcoin collection block changed.');
      const previous = Transaction.fromRaw(Buffer.from((await api.request(`tx/${u.txid}/hex`)).trim(), 'hex'));
      const output = previous.getOutput(u.vout);
      if (previous.id !== u.txid || output.amount !== BigInt(u.value) || !output.script || !Buffer.from(output.script).equals(Buffer.from(payment.script))) throw new Error('Bitcoin collection output did not verify.');
      tx.addInput({ txid: u.txid, index: u.vout, witnessUtxo: { script: payment.script, amount: BigInt(u.value) } });
      total += BigInt(u.value);
    }
    const rates = await api.json('fee-estimates');
    const rate = Number(rates['1']);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100000) throw new Error('Invalid Bitcoin collection rate.');
    const fee = BigInt(Math.ceil((11 + 69 * utxos.length + 43) * rate));
    if (fee > BigInt(budgetAtomic) || total - fee < 546n) throw new Error('Waiting for collection cost to fit the customer-funded fee budget.');
    tx.addOutputAddress(keys.bitcoinDestination, total - fee);
    tx.sign(child.privateKey);
    tx.finalize();
    if (BigInt(Math.ceil(tx.vsize * rate)) > fee || (await api.request(`block-height/${head}`)).trim() !== tipHash) throw new Error('Bitcoin fee or chain changed during collection planning.');
    return { kind: 'bitcoin', rawTransaction: tx.hex, transactionHash: tx.id, feeAtomic: fee.toString(), amountAtomic: (total - fee).toString(), destination: keys.bitcoinDestination };
  } finally { child.wipePrivateData(); root.wipePrivateData(); }
}

export async function broadcastBitcoinForward(bundle: BitcoinForward, keys: ForwardingKeys, endpoint: string) {
  const tx = Transaction.fromRaw(Buffer.from(bundle.rawTransaction, 'hex'));
  if (tx.id !== bundle.transactionHash || tx.outputsLength !== 1 || tx.getOutputAddress(0) !== keys.bitcoinDestination || tx.getOutput(0).amount !== BigInt(bundle.amountAtomic)) throw new Error('Saved Bitcoin forwarding transaction failed destination validation.');
  const api = createBitcoinForwardingApi(endpoint);
  if ((await api.request('block-height/0')).trim() !== GENESIS) throw new Error('Wrong Bitcoin network.');
  try {
    const existing = await api.json(`tx/${tx.id}/status`);
    return existing.confirmed === true;
  } catch {
    const hash = (await api.request('tx', bundle.rawTransaction)).trim();
    if (hash !== tx.id) throw new Error('Bitcoin broadcast hash did not match.');
    return false;
  }
}
