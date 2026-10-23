import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { beforeEach, test } from 'node:test';
import ts from 'typescript';

const source = await readFile(
  new URL('../../src/client/transaction-journal.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { TransactionJournal } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

const hashA = `0x${'a'.repeat(64)}`;
const hashB = `0x${'b'.repeat(64)}`;
const account = '0x0000000000000000000000000000000000000001';
const input = {
  location: {
    name: 'Lagos',
    latitude: 6.5244,
    longitude: 3.3792,
    timezone: 'Africa/Lagos',
  },
  targetDate: '2026-10-01',
  metric: 'rain_sum',
  comparator: 'gte',
  threshold: 5,
  prediction: 'YES',
};

function storage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

let contractSequence = 0;
let contractAddress;

beforeEach(() => {
  contractSequence += 1;
  contractAddress = `0x${contractSequence.toString(16).padStart(40, '0')}`;
  globalThis.window = { localStorage: storage() };
});

function makeJournal() {
  return new TransactionJournal('4221', contractAddress);
}

function details(hash = hashA) {
  return {
    hash,
    kind: 'create',
    account,
    pactId: null,
    fingerprint: 'fingerprint-1',
    input,
  };
}

test('returns the same submitted create intent instead of allowing a replacement', () => {
  const journal = makeJournal();
  journal.record(details());
  assert.equal(journal.findCreate(account, 'fingerprint-1')?.hash, hashA);
  assert.equal(journal.findCreate(account, 'another-fingerprint'), undefined);
});

test('a finalized execution result is no longer resumed as pending', () => {
  const journal = makeJournal();
  journal.record(details());
  journal.update(hashA, { status: 'FINALIZED', pactId: 'pact-1' });
  assert.equal(journal.findCreate(account, 'fingerprint-1'), undefined);
  assert.equal(journal.hashFor('pact-1', 'create'), hashA);
});

test('keeps the in-memory ID when writes fail but storage reads continue', () => {
  const localStorage = storage();
  localStorage.setItem = () => {
    throw new Error('quota exceeded');
  };
  globalThis.window = { localStorage };
  const journal = makeJournal();
  journal.record(details());
  assert.equal(journal.findCreate(account, 'fingerprint-1')?.hash, hashA);
});

test('resolution lookup resumes by pact and finalization removes pending status', () => {
  const journal = makeJournal();
  journal.record({
    hash: hashB,
    kind: 'resolve',
    account,
    pactId: 'pact-7',
    fingerprint: null,
    input: null,
  });
  assert.equal(journal.findResolution('pact-7')?.hash, hashB);
  journal.update(hashB, { status: 'FINALIZED' });
  assert.equal(journal.findResolution('pact-7'), undefined);
  assert.equal(journal.hashFor('pact-7', 'resolve'), hashB);
});

test('malformed or forged storage records cannot become transaction IDs', () => {
  const localStorage = storage();
  globalThis.window = { localStorage };
  const journal = makeJournal();
  const key = `weatherpact:writes:v1:4221:${contractAddress}`;
  localStorage.setItem(key, JSON.stringify([{ ...details('not-a-hash') }, null, 'forged']));
  assert.equal(journal.get('not-a-hash'), undefined);
  assert.equal(journal.findCreate(account, 'fingerprint-1'), undefined);
});
