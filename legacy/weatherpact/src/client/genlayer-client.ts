import { createClient, isSuccessful } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';
import { TransactionHashVariant, type Hash } from 'genlayer-js/types';
import { getAddress, type Address } from 'viem';
import { SOURCE_DISCLOSURE } from '../config';
import { COMPARATORS, getMetric, METRICS } from '../lib/weather';
import type {
  ActivityEvent,
  ActivityType,
  ClientCapabilities,
  Comparator,
  CreatePactInput,
  Pact,
  PactStatus,
  Prediction,
  Reputation,
  WeatherMetric,
  WeatherPactClient,
  WriteResult,
} from '../types/weatherpact';
import { BRADBURY_CHAIN_ID, verifyBradburyNode } from './network';
import { TransactionJournal, type JournalEntry } from './transaction-journal';

const PAGE_SIZE = 50;
const MAX_READ_PAGES = 20;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const PACT_STATUSES: PactStatus[] = ['OPEN', 'READY_TO_RESOLVE', 'RESOLVED_YES', 'RESOLVED_NO'];

interface AdapterOptions {
  contractAddress: string;
  rpcUrl: string;
  chainName: string;
}

interface NormalizedCreate {
  args: string[];
  fingerprint: string;
  input: CreatePactInput;
}

interface Page {
  items: unknown[];
  hasMore: boolean;
}

class FinalizedExecutionError extends Error {
  readonly pending = false;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} was not a contract record.`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} was not text.`);
  return value;
}

function nullableText(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  return asString(value, label);
}

function asAddress(value: unknown, label: string): string {
  try {
    return getAddress(asString(value, label));
  } catch {
    throw new Error(`${label} was not a valid address.`);
  }
}

function decimal(value: unknown, label: string): number {
  const text = asString(value, label);
  if (!/^-?(0|[1-9]\d*)(\.\d+)?$/.test(text)) {
    throw new Error(`${label} was not a normalized decimal.`);
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) throw new Error(`${label} was not finite.`);
  return parsed;
}

function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new Error(`${label} was not an integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} was not a safe non-negative integer.`);
  }
  return parsed;
}

function timestamp(value: unknown, label: string): string {
  const text = asString(value, label);
  if (Number.isNaN(Date.parse(text))) throw new Error(`${label} was not a timestamp.`);
  return text;
}

function parseMetric(value: unknown): WeatherMetric {
  const metric = asString(value, 'Metric');
  if (!METRICS.some((item) => item.value === metric)) {
    throw new Error('The contract returned an unsupported weather metric.');
  }
  return metric as WeatherMetric;
}

function parseComparator(value: unknown): Comparator {
  const comparator = asString(value, 'Comparator');
  if (!COMPARATORS.some((item) => item.value === comparator)) {
    throw new Error('The contract returned an unsupported comparator.');
  }
  return comparator as Comparator;
}

function parsePrediction(value: unknown): Prediction {
  const prediction = asString(value, 'Prediction');
  if (prediction !== 'YES' && prediction !== 'NO') {
    throw new Error('The contract returned an invalid prediction.');
  }
  return prediction;
}

function parseStatus(value: unknown): PactStatus {
  const status = asString(value, 'Pact status');
  if (!PACT_STATUSES.includes(status as PactStatus)) {
    throw new Error('The contract returned an unsupported pact status.');
  }
  return status as PactStatus;
}

function sourceUrl(value: unknown): string | null {
  const text = nullableText(value, 'Evidence source URL');
  if (!text) return null;
  const url = new URL(text);
  if (url.protocol !== 'https:' || url.hostname !== 'archive-api.open-meteo.com') {
    throw new Error('The contract returned an unexpected evidence host.');
  }
  return text;
}

function decimalString(value: number, field: string, places: number): string {
  if (!Number.isFinite(value)) throw new Error(`${field} must be finite.`);
  const scale = 10 ** places;
  const scaled = value * scale;
  if (Math.abs(scaled - Math.round(scaled)) > 0.00001) {
    throw new Error(`${field} supports at most ${places} decimal places.`);
  }
  const rounded = Math.round(scaled) / scale;
  const text = (Object.is(rounded, -0) ? 0 : rounded).toFixed(places);
  return text.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

function textInput(value: string | undefined, field: string, maximum: number, required: boolean) {
  const text = (value ?? '').trim();
  if (required && !text) throw new Error(`${field} is required.`);
  if (text.length > maximum || /[\x00-\x1F\x7F]/.test(text)) {
    throw new Error(`${field} is too long or contains control characters.`);
  }
  return text;
}

function normalizeCreate(input: CreatePactInput): NormalizedCreate {
  const locationName = textInput(input.location.name, 'Location name', 100, true);
  const admin1 = textInput(input.location.admin1, 'Administrative area', 100, false);
  const country = textInput(input.location.country, 'Country', 100, false);
  const countryCode = textInput(input.location.countryCode, 'Country code', 2, false).toUpperCase();
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
    throw new Error('Country code must contain two letters.');
  }
  if (input.location.latitude < -90 || input.location.latitude > 90) {
    throw new Error('Latitude is out of range.');
  }
  if (input.location.longitude < -180 || input.location.longitude > 180) {
    throw new Error('Longitude is out of range.');
  }
  const latitude = decimalString(input.location.latitude, 'Latitude', 6);
  const longitude = decimalString(input.location.longitude, 'Longitude', 6);
  const timezone = textInput(input.location.timezone, 'Timezone', 64, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.targetDate)) {
    throw new Error('Target date must use ISO YYYY-MM-DD format.');
  }
  const parsedDate = new Date(`${input.targetDate}T00:00:00Z`);
  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== input.targetDate ||
    input.targetDate < '1940-01-01' ||
    input.targetDate > '2100-12-24'
  ) {
    throw new Error('Target date is not a supported archive calendar date.');
  }
  const metric = parseMetric(input.metric);
  const comparator = parseComparator(input.comparator);
  const prediction = parsePrediction(input.prediction);
  const definition = getMetric(metric);
  if (input.threshold < definition.min || input.threshold > definition.max) {
    throw new Error(`Threshold must be between ${definition.min} and ${definition.max}.`);
  }
  const threshold = decimalString(input.threshold, 'Threshold', 3);
  const normalizedInput: CreatePactInput = {
    location: {
      name: locationName,
      admin1: admin1 || undefined,
      country: country || undefined,
      countryCode: countryCode || undefined,
      latitude: Number(latitude),
      longitude: Number(longitude),
      timezone,
    },
    targetDate: input.targetDate,
    metric,
    comparator,
    threshold: Number(threshold),
    prediction,
  };
  const args = [
    locationName,
    admin1,
    country,
    countryCode,
    latitude,
    longitude,
    timezone,
    input.targetDate,
    metric,
    comparator,
    threshold,
    prediction,
  ];
  return { args, fingerprint: JSON.stringify(args), input: normalizedInput };
}

function parsePage(value: unknown): Page {
  const page = asRecord(value, 'Contract page');
  if (!Array.isArray(page.items) || typeof page.hasMore !== 'boolean') {
    throw new Error('Contract pagination returned an unexpected shape.');
  }
  integer(page.total, 'Page total');
  integer(page.offset, 'Page offset');
  integer(page.limit, 'Page limit');
  return { items: page.items, hasMore: page.hasMore };
}

function transactionHash(value: unknown): string {
  let hash: unknown = value;
  if (value && typeof value === 'object') {
    const result = value as Record<string, unknown>;
    hash = result.transactionHash ?? result.hash ?? result.txId;
  }
  if (typeof hash !== 'string' || !HASH.test(hash)) {
    throw new Error('The SDK did not return a valid GenLayer transaction ID.');
  }
  return hash;
}

function trackingError(hash: string, reason: unknown): Error {
  const detail = reason instanceof Error ? reason.message : 'The receipt could not be read.';
  return Object.assign(
    new Error(
      `Tracking ${hash} was interrupted: ${detail} Resume this same transaction ID; no replacement was submitted.`,
    ),
    { name: 'TransactionTrackingError', pending: true, transactionHash: hash },
  );
}

export class GenLayerWeatherPactClient implements WeatherPactClient {
  readonly capabilities: ClientCapabilities = {
    mode: 'genlayer',
    canWrite: true,
    canResolve: true,
    canReadReputation: true,
    label: 'GenLayer Bradbury · contract connected',
  };

  private readonly contractAddress: Address;
  private readonly rpcUrl: string;
  private readonly chainName: string;
  private readonly client: ReturnType<typeof createClient>;
  private readonly journal: TransactionJournal;
  private qualification: Promise<void> | null = null;

  constructor(options: AdapterOptions) {
    this.contractAddress = getAddress(options.contractAddress);
    const endpoint = new URL(options.rpcUrl);
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    ) {
      throw new Error(
        'The public GenLayer node endpoint must be HTTPS and contain no credentials.',
      );
    }
    this.rpcUrl = endpoint.toString();
    this.chainName = options.chainName;
    this.client = createClient({ chain: testnetBradbury, endpoint: this.rpcUrl });
    this.journal = new TransactionJournal(String(BRADBURY_CHAIN_ID), this.contractAddress);
  }

  private async ensureQualified(): Promise<void> {
    if (!this.qualification) {
      const pending = (async () => {
        await verifyBradburyNode(this.rpcUrl, this.contractAddress);
        const metadata = asRecord(await this.read('get_metadata', []), 'WeatherPact metadata');
        if (
          metadata.name !== 'WeatherPact' ||
          integer(metadata.version, 'Contract version') !== 1
        ) {
          throw new Error('The configured contract returned unexpected WeatherPact metadata.');
        }
      })();
      this.qualification = pending;
      try {
        await pending;
      } catch (reason) {
        this.qualification = null;
        throw reason;
      }
    } else {
      await this.qualification;
    }
  }

  private async read(functionName: string, args: Array<string | number>): Promise<unknown> {
    return this.client.readContract({
      address: this.contractAddress,
      functionName,
      args,
      transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
    });
  }

  private async readAll(functionName: 'get_pacts' | 'get_activity'): Promise<unknown[]> {
    const items: unknown[] = [];
    for (let pageNumber = 0; pageNumber < MAX_READ_PAGES; pageNumber += 1) {
      const page = parsePage(await this.read(functionName, [items.length, PAGE_SIZE]));
      items.push(...page.items);
      if (!page.hasMore) return items;
      if (page.items.length === 0) {
        throw new Error('Contract pagination made no progress.');
      }
    }
    throw new Error(
      `The connected record exceeds ${MAX_READ_PAGES * PAGE_SIZE} entries; this static client stopped at its bounded read limit.`,
    );
  }

  private mapPact(value: unknown): Pact {
    const raw = asRecord(value, 'Pact');
    const id = asString(raw.id, 'Pact ID');
    const location = asRecord(raw.location, 'Pact location');
    const status = parseStatus(raw.status);
    const resolved = status === 'RESOLVED_YES' || status === 'RESOLVED_NO';
    const evidence = asRecord(raw.evidence, 'Pact evidence');
    const observedValue = resolved ? decimal(evidence.observedValue, 'Observed value') : null;
    const datasetNote = nullableText(evidence.datasetNote, 'Dataset disclosure');
    if (resolved && datasetNote !== SOURCE_DISCLOSURE) {
      throw new Error('The contract returned an unexpected historical-data disclosure.');
    }
    const createdAt = timestamp(raw.createdAt, 'Creation timestamp');
    return {
      id,
      creatorAddress: asAddress(raw.creator, 'Creator address'),
      location: {
        name: asString(location.name, 'Location name'),
        admin1: nullableText(location.admin1, 'Administrative area') ?? undefined,
        country: nullableText(location.country, 'Country') ?? undefined,
        countryCode: nullableText(location.countryCode, 'Country code') ?? undefined,
        latitude: decimal(location.latitude, 'Latitude'),
        longitude: decimal(location.longitude, 'Longitude'),
        timezone: asString(location.timezone, 'Timezone'),
      },
      targetDate: asString(raw.targetDate, 'Target date'),
      metric: parseMetric(raw.metric),
      comparator: parseComparator(raw.operator),
      threshold: decimal(raw.threshold, 'Threshold'),
      prediction: parsePrediction(raw.prediction),
      status,
      createdAt,
      evidence: {
        observedValue,
        unit: nullableText(evidence.unit, 'Evidence unit'),
        sourceName: nullableText(evidence.sourceName, 'Evidence source'),
        sourceUrl: sourceUrl(evidence.sourceUrl),
        datasetNote,
        resolvedAt: resolved ? timestamp(evidence.resolvedAt, 'Resolution timestamp') : null,
      },
      onChain: {
        contractAddress: this.contractAddress,
        chainId: String(BRADBURY_CHAIN_ID),
        chainName: this.chainName,
        creationTxHash: this.journal.hashFor(id, 'create'),
        resolutionTxHash: this.journal.hashFor(id, 'resolve'),
        lifecycle: 'FINALIZED',
        isFinalized: true,
      },
      isPreview: false,
    };
  }

  async listPacts(): Promise<Pact[]> {
    await this.ensureQualified();
    return (await this.readAll('get_pacts')).map((item) => this.mapPact(item));
  }

  async getPact(id: string): Promise<Pact | null> {
    await this.ensureQualified();
    const raw = asRecord(await this.read('get_pact', [id]), 'Pact lookup');
    return Object.keys(raw).length === 0 ? null : this.mapPact(raw);
  }

  async listActivity(): Promise<ActivityEvent[]> {
    await this.ensureQualified();
    return (await this.readAll('get_activity')).map((value) => {
      const raw = asRecord(value, 'Activity');
      const type = asString(raw.type, 'Activity type') as ActivityType;
      if (type !== 'CREATED' && type !== 'RESOLVED') {
        throw new Error('The contract returned an unsupported activity type.');
      }
      return {
        id: asString(raw.id, 'Activity ID'),
        pactId: asString(raw.pactId, 'Activity pact ID'),
        type,
        timestamp: timestamp(raw.timestamp, 'Activity timestamp'),
        actorAddress: asAddress(raw.actor, 'Activity actor'),
        isPreview: false,
      };
    });
  }

  async getReputation(address: string): Promise<Reputation> {
    await this.ensureQualified();
    const raw = asRecord(await this.read('get_reputation', [getAddress(address)]), 'Reputation');
    const correctPredictions = integer(raw.correctPredictions, 'Correct predictions');
    const currentStreak = integer(raw.currentStreak, 'Current streak');
    const finalizedPacts = integer(raw.finalizedPacts, 'Finalized pacts');
    return {
      correctPredictions,
      currentStreak,
      finalizedPacts,
      achievements: [
        {
          id: 'first-signal',
          label: 'First Signal',
          description: 'One finalized pact with a contract-recorded outcome.',
          earned: finalizedPacts >= 1,
        },
        {
          id: 'clear-sky-streak',
          label: 'Clear-Sky Streak',
          description: 'Three correct finalized predictions in a row.',
          earned: currentStreak >= 3,
        },
        {
          id: 'weather-watcher',
          label: 'Weather Watcher',
          description: 'Five finalized pacts with contract-recorded outcomes.',
          earned: finalizedPacts >= 5,
        },
      ],
      calculation:
        'Calculated from this wallet’s finalized WeatherPact history. Achievements are playful only: no points, tokens, payments, or financial rewards.',
    };
  }

  private async walletAccount(expected?: string): Promise<Address> {
    const provider = window.ethereum;
    if (!provider) throw new Error('No injected wallet is available for signing.');
    const accounts = (await provider.request({ method: 'eth_accounts' })) as string[];
    const account = accounts[0];
    if (!account) throw new Error('Connect the injected wallet before writing.');
    const address = getAddress(account);
    if (expected && address.toLowerCase() !== expected.toLowerCase()) {
      throw new Error('The wallet account changed before submission. No transaction was sent.');
    }
    const chain = await provider.request({ method: 'eth_chainId' });
    if (typeof chain !== 'string' || Number.parseInt(chain, 16) !== BRADBURY_CHAIN_ID) {
      throw new Error(`Switch the wallet to Bradbury chain ${BRADBURY_CHAIN_ID} before writing.`);
    }
    return address;
  }

  private writeClient(account: Address): ReturnType<typeof createClient> {
    return createClient({
      chain: testnetBradbury,
      endpoint: this.rpcUrl,
      account,
      provider: window.ethereum,
    });
  }

  async createPact(input: CreatePactInput): Promise<WriteResult> {
    const normalized = normalizeCreate(input);
    const account = await this.walletAccount();
    await this.ensureQualified();
    const existing = this.journal.findCreate(account, normalized.fingerprint);
    if (existing) {
      return {
        pactId: existing.pactId,
        transactionHash: existing.hash,
        lifecycle: 'FINALIZING',
      };
    }

    const client = this.writeClient(account);
    const write = {
      address: this.contractAddress,
      functionName: 'create_pact',
      args: normalized.args,
    };
    // The v2 RC fee flow simulates this exact write, applies current network
    // prices and headroom, then supplies the returned profile to the real write.
    const estimate = await client.estimateTransactionFeesForWrite(write);
    await this.walletAccount(account);
    const hash = transactionHash(
      await client.writeContract({
        ...write,
        fees: {
          distribution: estimate.distribution,
          messageAllocations: estimate.messageAllocations,
          feeValue: estimate.feeValue,
        },
      }),
    );
    // Persist before returning control to the page. No code after this point
    // may submit the same intent again when finality is uncertain.
    this.journal.record({
      hash,
      kind: 'create',
      account,
      pactId: null,
      fingerprint: normalized.fingerprint,
      input: normalized.input,
    });
    return { pactId: null, transactionHash: hash, lifecycle: 'SUBMITTED' };
  }

  async resolvePact(id: string): Promise<WriteResult> {
    const pactId = textInput(id, 'Pact ID', 64, true);
    const account = await this.walletAccount();
    await this.ensureQualified();
    const existing = this.journal.findResolution(pactId);
    if (existing) {
      return { pactId, transactionHash: existing.hash, lifecycle: 'FINALIZING' };
    }

    const client = this.writeClient(account);
    const write = {
      address: this.contractAddress,
      functionName: 'resolve_pact',
      args: [pactId],
    };
    const estimate = await client.estimateTransactionFeesForWrite(write);
    await this.walletAccount(account);
    const hash = transactionHash(
      await client.writeContract({
        ...write,
        fees: {
          distribution: estimate.distribution,
          messageAllocations: estimate.messageAllocations,
          feeValue: estimate.feeValue,
        },
      }),
    );
    this.journal.record({
      hash,
      kind: 'resolve',
      account,
      pactId,
      fingerprint: null,
      input: null,
    });
    return { pactId, transactionHash: hash, lifecycle: 'SUBMITTED' };
  }

  private identifyCreatedPact(entry: JournalEntry, pacts: Pact[]): string | null {
    if (!entry.input) return null;
    const input = entry.input;
    const submitted = Date.parse(entry.submittedAt);
    const candidates = pacts.filter((pact) => {
      const created = Date.parse(pact.createdAt);
      return (
        pact.creatorAddress?.toLowerCase() === entry.account.toLowerCase() &&
        pact.location.name === input.location.name &&
        (pact.location.admin1 ?? '') === (input.location.admin1 ?? '') &&
        (pact.location.country ?? '') === (input.location.country ?? '') &&
        (pact.location.countryCode ?? '') === (input.location.countryCode ?? '') &&
        pact.location.latitude === input.location.latitude &&
        pact.location.longitude === input.location.longitude &&
        pact.location.timezone === input.location.timezone &&
        pact.targetDate === input.targetDate &&
        pact.metric === input.metric &&
        pact.comparator === input.comparator &&
        pact.threshold === input.threshold &&
        pact.prediction === input.prediction &&
        Number.isFinite(created) &&
        created >= submitted - 60 * 60 * 1000
      );
    });
    // Identical historical or concurrent pacts are ambiguous. Never guess.
    const candidate = candidates[0];
    return candidates.length === 1 && candidate ? candidate.id : null;
  }

  async waitForFinality(hash: string): Promise<WriteResult> {
    if (!HASH.test(hash)) throw new Error('A valid transaction ID is required for tracking.');
    const entry = this.journal.get(hash);
    try {
      await this.ensureQualified();
      const receipt = await this.client.waitForFinalization({
        hash: hash as Hash,
        interval: 5_000,
        retries: 120,
        fullTransaction: true,
      });
      if (!isSuccessful(receipt)) {
        this.journal.update(hash, { status: 'FAILED' });
        const status = receipt.statusName ?? String(receipt.status ?? 'unknown');
        const execution =
          receipt.txExecutionResultName ?? String(receipt.txExecutionResult ?? 'unknown');
        throw new FinalizedExecutionError(
          `Transaction ${hash} finalized without successful execution (status ${status}, execution ${execution}). No successful outcome is claimed.`,
        );
      }
      this.journal.update(hash, { status: 'FINALIZED' });
      let pactId = entry?.pactId ?? null;
      if (entry?.kind === 'create' && !pactId) {
        try {
          pactId = this.identifyCreatedPact(entry, await this.listPacts());
          if (pactId) this.journal.update(hash, { pactId });
        } catch {
          // Execution is already proven successful. A missing deep link must not
          // change that result or cause another write.
        }
      }
      return { pactId, transactionHash: hash, lifecycle: 'FINALIZED' };
    } catch (reason) {
      if (reason instanceof FinalizedExecutionError) throw reason;
      throw trackingError(hash, reason);
    }
  }
}
