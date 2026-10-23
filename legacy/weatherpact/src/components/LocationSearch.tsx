import { AlertCircle, Check, LoaderCircle, MapPin, Navigation, Search, X } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';
import type { Location } from '../types/weatherpact';
import { formatCoordinates } from '../lib/weather';
import { isValidTimezone } from '../lib/utils';
import { Button } from './ui/Button';

const geocodingSchema = z.object({
  results: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        country: z.string().optional(),
        country_code: z.string().optional(),
        admin1: z.string().optional(),
        timezone: z.string().optional(),
      }),
    )
    .optional(),
});

const manualSchema = z.object({
  name: z.string().trim().min(2, 'Give this location a short name.'),
  country: z.string().trim().optional(),
  latitude: z.preprocess(
    (value) => (value === '' ? undefined : Number(value)),
    z.number({ required_error: 'Enter a latitude.' }).min(-90).max(90),
  ),
  longitude: z.preprocess(
    (value) => (value === '' ? undefined : Number(value)),
    z.number({ required_error: 'Enter a longitude.' }).min(-180).max(180),
  ),
  timezone: z
    .string()
    .trim()
    .min(1, 'Enter an IANA timezone.')
    .refine(isValidTimezone, 'Use a valid IANA timezone, such as Africa/Lagos.'),
});

interface LocationSearchProps {
  value: Location | null;
  onChange: (location: Location | null) => void;
  error?: string;
}

export function LocationSearch({ value, onChange, error }: LocationSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Location[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manual, setManual] = useState({
    name: '',
    country: '',
    latitude: '',
    longitude: '',
    timezone: 'Etc/UTC',
  });
  const abortRef = useRef<AbortController | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  async function search(event?: FormEvent) {
    event?.preventDefault();
    const name = query.trim();
    if (name.length < 2) {
      setSearchError('Enter at least two characters to search for a city.');
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);
    setSearchError(null);
    setSearched(false);
    try {
      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=6&language=en&format=json`,
        { signal: controller.signal },
      );
      if (!response.ok)
        throw new Error(`City search returned ${response.status}. Try manual coordinates instead.`);
      const payload = geocodingSchema.parse(await response.json());
      const locations = (payload.results ?? []).map((item) => ({
        id: String(item.id),
        name: item.name,
        latitude: item.latitude,
        longitude: item.longitude,
        country: item.country,
        countryCode: item.country_code,
        admin1: item.admin1,
        timezone: item.timezone ?? 'Etc/UTC',
      }));
      setResults(locations);
      setSearched(true);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      setSearchError(
        reason instanceof z.ZodError
          ? 'City search returned an unreadable response. Try again or use manual coordinates.'
          : reason instanceof Error
            ? reason.message
            : 'City search is temporarily unavailable. Use manual coordinates instead.',
      );
      setResults([]);
    } finally {
      if (abortRef.current === controller) setSearching(false);
    }
  }

  function applyManual() {
    const parsed = manualSchema.safeParse(manual);
    if (!parsed.success) {
      setManualError(parsed.error.issues[0]?.message ?? 'Check the manual location fields.');
      return;
    }
    const data = parsed.data;
    onChange({
      id: `manual-${data.latitude}-${data.longitude}`,
      name: data.name,
      country: data.country || undefined,
      latitude: data.latitude,
      longitude: data.longitude,
      timezone: data.timezone,
    });
    setManualError(null);
    setResults([]);
    setSearched(false);
  }

  if (value) {
    return (
      <div>
        <div className="relative overflow-hidden rounded-[5px] border border-teal/25 bg-teal/[0.045] p-5">
          <div className="absolute right-0 top-0 h-1 w-16 bg-lime" />
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal text-white">
                <MapPin className="h-4 w-4" />
              </span>
              <div>
                <div className="font-heading text-lg font-semibold">{value.name}</div>
                <div className="mt-0.5 text-xs text-slate">
                  {[value.admin1, value.country].filter(Boolean).join(', ') || 'Manual location'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onChange(null);
                window.setTimeout(() => searchInputRef.current?.focus(), 0);
              }}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-teal hover:bg-white"
              aria-label="Change selected location"
            >
              <X className="h-3.5 w-3.5" />
              Change
            </button>
          </div>
          <div className="mt-5 grid gap-3 border-t border-teal/15 pt-4 sm:grid-cols-2">
            <div>
              <div className="technical-label">Coordinates</div>
              <div className="mt-1 font-mono text-[11px] text-current">
                {formatCoordinates(value.latitude, value.longitude)}
              </div>
            </div>
            <div>
              <div className="technical-label">Local timezone</div>
              <div className="mt-1 font-mono text-[11px] text-current">{value.timezone}</div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-[10px] text-teal">
            <Check className="h-3.5 w-3.5" />
            Place and local time context added to the draft.
          </div>
        </div>
        {error && (
          <p className="mt-2 text-xs text-[#9B4939]" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <form onSubmit={search} role="search">
        <label htmlFor="city-search" className="field-label">
          Search for a city or location
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate" />
            <input
              ref={searchInputRef}
              id="city-search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchError(null);
              }}
              className="field-input pl-10"
              placeholder="Try Lagos, Nairobi, Tokyo…"
              autoComplete="off"
              aria-describedby="city-search-help"
            />
          </div>
          <Button type="submit" variant="dark" loading={searching} className="shrink-0 px-4">
            <span className="hidden sm:inline">Search</span>
            <Search className="h-4 w-4 sm:hidden" />
          </Button>
        </div>
        <p id="city-search-help" className="mt-2 text-[10px] leading-5 text-slate">
          City search uses Open-Meteo’s public geocoding service. No API key is required.
        </p>
      </form>
      {(error || searchError) && (
        <div
          className="mt-3 flex items-start gap-2 rounded border border-coral/25 bg-coral/[0.05] p-3 text-xs leading-5 text-[#8D4335]"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error || searchError}
        </div>
      )}
      {searching && (
        <div className="mt-3 flex items-center gap-2 rounded border border-cloud bg-mist p-3 text-xs text-slate">
          <LoaderCircle className="h-4 w-4 animate-spin text-teal" />
          Reading the location index…
        </div>
      )}
      {!searching && results.length > 0 && (
        <div
          className="mt-3 overflow-hidden rounded-[5px] border border-cloud bg-white"
          aria-label="Location search results"
        >
          <div className="border-b border-cloud bg-mist/60 px-3 py-2 technical-label">
            Select a search result
          </div>
          <div className="divide-y divide-cloud">
            {results.map((location) => (
              <button
                type="button"
                key={location.id}
                onClick={() => {
                  onChange(location);
                  setResults([]);
                }}
                className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal"
              >
                <MapPin className="h-4 w-4 shrink-0 text-teal" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{location.name}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-slate">
                    {[location.admin1, location.country].filter(Boolean).join(', ')} ·{' '}
                    {location.timezone}
                  </span>
                </span>
                <span className="font-mono text-[9px] text-slate">
                  {location.latitude.toFixed(2)}, {location.longitude.toFixed(2)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {!searching && searched && results.length === 0 && !searchError && (
        <div className="mt-3 rounded border border-cloud bg-mist p-4 text-center text-xs text-slate">
          No matching places found. Try a nearby city or enter coordinates manually.
        </div>
      )}

      <details className="group mt-4 rounded-[5px] border border-cloud bg-mist/50">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-semibold text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
          <Navigation className="h-3.5 w-3.5 text-teal" />
          Can’t find a place? Enter coordinates manually
        </summary>
        <div className="border-t border-cloud p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="field-label">Location name</span>
              <input
                className="field-input min-h-10 py-2"
                value={manual.name}
                onChange={(event) => setManual({ ...manual, name: event.target.value })}
                placeholder="e.g. Lekki field point"
              />
            </label>
            <label>
              <span className="field-label">
                Country <span className="font-normal text-slate">(optional)</span>
              </span>
              <input
                className="field-input min-h-10 py-2"
                value={manual.country}
                onChange={(event) => setManual({ ...manual, country: event.target.value })}
                placeholder="Nigeria"
              />
            </label>
            <label>
              <span className="field-label">Latitude</span>
              <input
                type="number"
                min="-90"
                max="90"
                step="any"
                className="field-input min-h-10 py-2 font-mono"
                value={manual.latitude}
                onChange={(event) => setManual({ ...manual, latitude: event.target.value })}
                placeholder="6.5244"
              />
            </label>
            <label>
              <span className="field-label">Longitude</span>
              <input
                type="number"
                min="-180"
                max="180"
                step="any"
                className="field-input min-h-10 py-2 font-mono"
                value={manual.longitude}
                onChange={(event) => setManual({ ...manual, longitude: event.target.value })}
                placeholder="3.3792"
              />
            </label>
            <label className="sm:col-span-2">
              <span className="field-label">IANA timezone</span>
              <input
                className="field-input min-h-10 py-2 font-mono"
                value={manual.timezone}
                onChange={(event) => setManual({ ...manual, timezone: event.target.value })}
                placeholder="Africa/Lagos"
              />
              <span className="mt-1.5 block text-[10px] text-slate">
                For example: Africa/Lagos, Europe/London, Asia/Tokyo.
              </span>
            </label>
          </div>
          {manualError && (
            <p className="mt-3 text-xs text-[#9B4939]" role="alert">
              {manualError}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            className="mt-4 min-h-9 text-xs"
            onClick={applyManual}
          >
            Use these coordinates
          </Button>
        </div>
      </details>
    </div>
  );
}
