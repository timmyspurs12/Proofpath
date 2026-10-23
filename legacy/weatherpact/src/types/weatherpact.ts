export type WeatherMetric =
  | 'rain_sum'
  | 'precipitation_sum'
  | 'temperature_2m_max'
  | 'temperature_2m_min'
  | 'wind_speed_10m_max';

export type Comparator = 'gt' | 'gte' | 'lt' | 'lte';
export type Prediction = 'YES' | 'NO';
export type PactStatus =
  'OPEN' | 'READY_TO_RESOLVE' | 'RESOLVED_YES' | 'RESOLVED_NO' | 'SOURCE_UNAVAILABLE';

export type TransactionLifecycle =
  | 'NOT_SUBMITTED'
  | 'AWAITING_SIGNATURE'
  | 'SUBMITTED'
  | 'FINALIZING'
  | 'FINALIZED'
  | 'REJECTED'
  | 'FAILED';

export interface Location {
  id?: string;
  name: string;
  admin1?: string;
  country?: string;
  countryCode?: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface WeatherEvidence {
  observedValue: number | null;
  unit: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  datasetNote: string | null;
  resolvedAt: string | null;
}

export interface OnChainRecord {
  contractAddress: string | null;
  chainId: string | null;
  chainName: string | null;
  creationTxHash: string | null;
  resolutionTxHash: string | null;
  lifecycle: TransactionLifecycle;
  isFinalized: boolean;
}

export interface Pact {
  id: string;
  creatorAddress: string | null;
  location: Location;
  targetDate: string;
  metric: WeatherMetric;
  comparator: Comparator;
  threshold: number;
  prediction: Prediction;
  status: PactStatus;
  createdAt: string;
  evidence: WeatherEvidence;
  onChain: OnChainRecord;
  isPreview: boolean;
}

export type ActivityType = 'CREATED' | 'READY' | 'RESOLVED' | 'SOURCE_UNAVAILABLE';

export interface ActivityEvent {
  id: string;
  pactId: string;
  type: ActivityType;
  timestamp: string;
  actorAddress: string | null;
  isPreview: boolean;
}

export interface Achievement {
  id: string;
  label: string;
  description: string;
  earned: boolean | null;
}

export interface Reputation {
  correctPredictions: number | null;
  currentStreak: number | null;
  finalizedPacts: number | null;
  achievements: Achievement[];
  calculation: string;
}

export interface CreatePactInput {
  location: Location;
  targetDate: string;
  metric: WeatherMetric;
  comparator: Comparator;
  threshold: number;
  prediction: Prediction;
}

export interface WriteResult {
  pactId: string | null;
  transactionHash: string;
  lifecycle: TransactionLifecycle;
}

export interface ClientCapabilities {
  mode: 'preview' | 'genlayer';
  canWrite: boolean;
  canResolve: boolean;
  canReadReputation: boolean;
  label: string;
}

export interface WeatherPactClient {
  readonly capabilities: ClientCapabilities;
  listPacts(): Promise<Pact[]>;
  getPact(id: string): Promise<Pact | null>;
  listActivity(): Promise<ActivityEvent[]>;
  getReputation(address: string): Promise<Reputation>;
  createPact(input: CreatePactInput): Promise<WriteResult>;
  resolvePact(id: string): Promise<WriteResult>;
  waitForFinality(transactionHash: string): Promise<WriteResult>;
}
