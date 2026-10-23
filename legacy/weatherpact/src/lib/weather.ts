import type { Comparator, Pact, PactStatus, WeatherMetric } from '../types/weatherpact';

export const METRICS: Array<{
  value: WeatherMetric;
  label: string;
  shortLabel: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}> = [
  {
    value: 'rain_sum',
    label: 'Daily rain sum',
    shortLabel: 'Rain sum',
    unit: 'mm',
    min: 0,
    max: 2000,
    step: 0.1,
  },
  {
    value: 'precipitation_sum',
    label: 'Daily total precipitation',
    shortLabel: 'Precipitation',
    unit: 'mm',
    min: 0,
    max: 2000,
    step: 0.1,
  },
  {
    value: 'temperature_2m_max',
    label: 'Maximum daily temperature',
    shortLabel: 'Max temperature',
    unit: '°C',
    min: -100,
    max: 70,
    step: 0.1,
  },
  {
    value: 'temperature_2m_min',
    label: 'Minimum daily temperature',
    shortLabel: 'Min temperature',
    unit: '°C',
    min: -100,
    max: 70,
    step: 0.1,
  },
  {
    value: 'wind_speed_10m_max',
    label: 'Maximum daily wind speed',
    shortLabel: 'Max wind speed',
    unit: 'km/h',
    min: 0,
    max: 500,
    step: 0.1,
  },
];

export const COMPARATORS: Array<{ value: Comparator; label: string; symbol: string }> = [
  { value: 'gt', label: 'Greater than', symbol: '>' },
  { value: 'gte', label: 'Greater than or equal to', symbol: '≥' },
  { value: 'lt', label: 'Less than', symbol: '<' },
  { value: 'lte', label: 'Less than or equal to', symbol: '≤' },
];

export const STATUS_LABELS: Record<PactStatus, string> = {
  OPEN: 'Open',
  READY_TO_RESOLVE: 'Ready to resolve',
  RESOLVED_YES: 'Resolved yes',
  RESOLVED_NO: 'Resolved no',
  SOURCE_UNAVAILABLE: 'Source unavailable',
};

export function getMetric(metric: WeatherMetric) {
  const definition = METRICS.find((item) => item.value === metric);
  if (!definition) throw new Error(`Unknown weather metric: ${metric}`);
  return definition;
}

export function getComparator(comparator: Comparator) {
  const definition = COMPARATORS.find((item) => item.value === comparator);
  if (!definition) throw new Error(`Unknown comparator: ${comparator}`);
  return definition;
}

export function formatCompactCondition(pact: Pick<Pact, 'metric' | 'comparator' | 'threshold'>) {
  const metric = getMetric(pact.metric);
  const comparator = getComparator(pact.comparator);
  return `${metric.shortLabel} ${comparator.symbol} ${pact.threshold} ${metric.unit}`;
}

export function formatConditionSentence(
  pact: Pick<Pact, 'metric' | 'comparator' | 'threshold' | 'location' | 'targetDate'>,
) {
  const metric = getMetric(pact.metric);
  const comparator = getComparator(pact.comparator);
  return `Will ${metric.label.toLowerCase()} in ${pact.location.name} be ${comparator.label.toLowerCase()} ${pact.threshold} ${metric.unit} on ${formatDate(pact.targetDate)}?`;
}

export function formatDate(date: string, options?: Intl.DateTimeFormatOptions) {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(
    'en-GB',
    options ?? {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    },
  ).format(parsed);
}

export function formatShortDate(date: string) {
  return formatDate(date, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function formatTimestamp(timestamp: string) {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return 'Unavailable';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export function shortenAddress(address: string | null) {
  if (!address) return 'Unavailable';
  if (address.length < 14) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function getTodayInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function hasTargetDatePassed(pact: Pick<Pact, 'targetDate' | 'location'>) {
  return pact.targetDate < getTodayInTimezone(pact.location.timezone);
}

export function formatCoordinates(latitude: number, longitude: number) {
  const lat = `${Math.abs(latitude).toFixed(4)}° ${latitude >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(longitude).toFixed(4)}° ${longitude >= 0 ? 'E' : 'W'}`;
  return `${lat} · ${lon}`;
}
