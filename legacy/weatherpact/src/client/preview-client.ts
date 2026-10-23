import { previewActivity, previewPacts } from '../data/preview-data';
import { wait } from '../lib/utils';
import type {
  ActivityEvent,
  ClientCapabilities,
  CreatePactInput,
  Pact,
  Reputation,
  WeatherPactClient,
  WriteResult,
} from '../types/weatherpact';

const unavailableReputation = (calculation: string): Reputation => ({
  correctPredictions: null,
  currentStreak: null,
  finalizedPacts: null,
  achievements: [
    {
      id: 'rainmaker',
      label: 'Rainmaker',
      description: 'One finalized correct rain prediction.',
      earned: null,
    },
    {
      id: 'clear-sky-streak',
      label: 'Clear-Sky Streak',
      description: 'Three correct finalized predictions in a row.',
      earned: null,
    },
    {
      id: 'weather-watcher',
      label: 'Weather Watcher',
      description: 'Five finalized pacts with verified outcomes.',
      earned: null,
    },
  ],
  calculation,
});

export class PreviewWeatherPactClient implements WeatherPactClient {
  readonly capabilities: ClientCapabilities = {
    mode: 'preview',
    canWrite: false,
    canResolve: false,
    canReadReputation: false,
    label: 'Illustrative preview · not on-chain',
  };

  async listPacts(): Promise<Pact[]> {
    await wait(520);
    return structuredClone(previewPacts);
  }

  async getPact(id: string): Promise<Pact | null> {
    await wait(220);
    const pact = previewPacts.find((item) => item.id === id);
    return pact ? structuredClone(pact) : null;
  }

  async listActivity(): Promise<ActivityEvent[]> {
    await wait(420);
    return structuredClone(previewActivity);
  }

  async getReputation(_address: string): Promise<Reputation> {
    await wait(180);
    return unavailableReputation(
      'Scores are calculated only from finalized on-chain pacts created by the connected wallet. Connect a GenLayer data adapter to load them.',
    );
  }

  async createPact(_input: CreatePactInput): Promise<WriteResult> {
    throw new Error('Contract not connected. Creating a pact is disabled in preview mode.');
  }

  async resolvePact(_id: string): Promise<WriteResult> {
    throw new Error('Contract not connected. Resolution is disabled in preview mode.');
  }

  async waitForFinality(_transactionHash: string): Promise<WriteResult> {
    throw new Error('Contract not connected. Transaction finality is unavailable in preview mode.');
  }
}
