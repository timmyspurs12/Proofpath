import type { CreatePactInput } from '../types/weatherpact';

export type JournalKind = 'create' | 'resolve';
export type JournalStatus = 'SUBMITTED' | 'FINALIZED' | 'FAILED';

export interface JournalEntry {
  hash: string;
  kind: JournalKind;
  account: string;
  pactId: string | null;
  fingerprint: string | null;
  input: CreatePactInput | null;
  status: JournalStatus;
  submittedAt: string;
  updatedAt: string;
}

const memoryFallback = new Map<string, JournalEntry[]>();
const HASH = /^0x[0-9a-fA-F]{64}$/;

/** Non-secret local journal used only to resume existing transaction IDs. */
export class TransactionJournal {
  private readonly key: string;

  constructor(chainId: string, contractAddress: string) {
    this.key = `weatherpact:writes:v1:${chainId}:${contractAddress.toLowerCase()}`;
  }

  private read(): JournalEntry[] {
    let stored: JournalEntry[] = [];
    try {
      const raw = window.localStorage.getItem(this.key);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          stored = parsed.filter((item): item is JournalEntry =>
            Boolean(
              item &&
              typeof item === 'object' &&
              typeof item.hash === 'string' &&
              HASH.test(item.hash) &&
              (item.kind === 'create' || item.kind === 'resolve') &&
              (item.status === 'SUBMITTED' ||
                item.status === 'FINALIZED' ||
                item.status === 'FAILED'),
            ),
          );
        }
      }
    } catch {
      // A denied read still has the same-page memory journal.
    }

    // Merge rather than trusting storage alone: setItem can fail (for example,
    // quota exhaustion) while getItem continues to return an older value.
    const byHash = new Map<string, JournalEntry>();
    for (const entry of [...stored, ...(memoryFallback.get(this.key) ?? [])]) {
      const key = entry.hash.toLowerCase();
      const previous = byHash.get(key);
      if (!previous || entry.updatedAt >= previous.updatedAt) byHash.set(key, entry);
    }
    return [...byHash.values()];
  }

  private write(entries: JournalEntry[]): void {
    const pending = entries.filter((entry) => entry.status === 'SUBMITTED');
    const completed = entries
      .filter((entry) => entry.status !== 'SUBMITTED')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const bounded = [...pending, ...completed].slice(0, 100);
    memoryFallback.set(this.key, bounded);
    try {
      window.localStorage.setItem(this.key, JSON.stringify(bounded));
    } catch {
      // A storage denial must never turn a received transaction ID into an
      // exception that encourages another submission. Memory still deduplicates.
    }
  }

  findCreate(account: string, fingerprint: string): JournalEntry | undefined {
    return this.read().find(
      (entry) =>
        entry.kind === 'create' &&
        entry.status === 'SUBMITTED' &&
        entry.account.toLowerCase() === account.toLowerCase() &&
        entry.fingerprint === fingerprint,
    );
  }

  findResolution(pactId: string): JournalEntry | undefined {
    return this.read().find(
      (entry) =>
        entry.kind === 'resolve' && entry.status === 'SUBMITTED' && entry.pactId === pactId,
    );
  }

  get(hash: string): JournalEntry | undefined {
    return this.read().find((entry) => entry.hash.toLowerCase() === hash.toLowerCase());
  }

  hashFor(pactId: string, kind: JournalKind): string | null {
    const matches = this.read()
      .filter((entry) => entry.kind === kind && entry.pactId === pactId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return matches[0]?.hash ?? null;
  }

  record(
    details: Pick<JournalEntry, 'hash' | 'kind' | 'account' | 'pactId' | 'fingerprint' | 'input'>,
  ): JournalEntry {
    const now = new Date().toISOString();
    const entry: JournalEntry = {
      ...details,
      status: 'SUBMITTED',
      submittedAt: now,
      updatedAt: now,
    };
    this.write([entry, ...this.read().filter((item) => item.hash !== entry.hash)]);
    return entry;
  }

  update(hash: string, update: Partial<Pick<JournalEntry, 'status' | 'pactId'>>): void {
    this.write(
      this.read().map((entry) =>
        entry.hash.toLowerCase() === hash.toLowerCase()
          ? { ...entry, ...update, updatedAt: new Date().toISOString() }
          : entry,
      ),
    );
  }
}
