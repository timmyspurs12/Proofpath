import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { weatherPactClient } from '../client';
import type { ActivityEvent, ClientCapabilities, Pact } from '../types/weatherpact';

interface WeatherPactContextValue {
  pacts: Pact[];
  activity: ActivityEvent[];
  capabilities: ClientCapabilities;
  isLoading: boolean;
  error: string | null;
  isOnline: boolean;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
  getPact: (id: string) => Pact | undefined;
}

const WeatherPactContext = createContext<WeatherPactContextValue | null>(null);

export function WeatherPactProvider({ children }: { children: ReactNode }) {
  const [pacts, setPacts] = useState<Pact[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [nextPacts, nextActivity] = await Promise.all([
        weatherPactClient.listPacts(),
        weatherPactClient.listActivity(),
      ]);
      setPacts(nextPacts);
      setActivity(nextActivity);
      setLastUpdated(new Date());
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'The public pact record could not be loaded.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  const value = useMemo<WeatherPactContextValue>(
    () => ({
      pacts,
      activity,
      capabilities: weatherPactClient.capabilities,
      isLoading,
      error,
      isOnline,
      lastUpdated,
      refresh,
      getPact: (id) => pacts.find((pact) => pact.id === id),
    }),
    [pacts, activity, isLoading, error, isOnline, lastUpdated, refresh],
  );

  return <WeatherPactContext.Provider value={value}>{children}</WeatherPactContext.Provider>;
}

export function useWeatherPact() {
  const context = useContext(WeatherPactContext);
  if (!context) throw new Error('useWeatherPact must be used within WeatherPactProvider');
  return context;
}
