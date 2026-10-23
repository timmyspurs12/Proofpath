import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { PlanSchema, type Plan } from '../shared/schemas';

const STORAGE_KEY = 'proofpath.plans.v1';
const MAX_SAVED_PLANS = 20;

interface PlanLibraryValue {
  plans: Plan[];
  currentPlan: Plan | null;
  storageError: string | null;
  currentIsSaved: boolean;
  openPlan: (plan: Plan) => void;
  updateCurrentPlan: (plan: Plan, persist?: boolean) => void;
  saveCurrentPlan: () => Plan | null;
  deletePlan: (id: string) => void;
  clearPlans: () => void;
}

const PlanLibraryContext = createContext<PlanLibraryValue | null>(null);

function readPlans(): { plans: Plan[]; error: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { plans: [], error: null };
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) throw new Error('Invalid library');
    const plans = value.map((plan) => PlanSchema.parse(plan));
    return { plans, error: null };
  } catch {
    return {
      plans: [],
      error:
        'Saved plans could not be read. Your existing browser data was not overwritten; export or clear site data if this continues.',
    };
  }
}

export function PlanLibraryProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(readPlans);
  const [plans, setPlans] = useState<Plan[]>(initial.plans);
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
  const [storageError, setStorageError] = useState<string | null>(initial.error);

  const persist = useCallback((next: Plan[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setStorageError(null);
      return true;
    } catch {
      setStorageError(
        'This browser could not save the plan. Export it instead, or delete older saved plans and retry.',
      );
      return false;
    }
  }, []);

  const openPlan = useCallback((plan: Plan) => setCurrentPlan(plan), []);
  const currentIsSaved = Boolean(currentPlan && plans.some((plan) => plan.id === currentPlan.id));

  const updateCurrentPlan = useCallback(
    (plan: Plan, shouldPersist = false) => {
      setCurrentPlan(plan);
      if (shouldPersist) {
        setPlans((existing) => {
          const next = existing.map((entry) => (entry.id === plan.id ? plan : entry));
          persist(next);
          return next;
        });
      }
    },
    [persist],
  );

  const saveCurrentPlan = useCallback(() => {
    if (!currentPlan) return null;
    const alreadySaved = plans.some((plan) => plan.id === currentPlan.id);
    const now = new Date().toISOString();
    const toSave: Plan = alreadySaved
      ? { ...currentPlan, updatedAt: now }
      : {
          ...currentPlan,
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        };
    const next = alreadySaved
      ? plans.map((plan) => (plan.id === toSave.id ? toSave : plan))
      : [toSave, ...plans];
    if (!alreadySaved && plans.length >= MAX_SAVED_PLANS) {
      setStorageError(
        `This browser library is limited to ${MAX_SAVED_PLANS} plans. Delete or export an older plan first.`,
      );
      return null;
    }
    if (!persist(next)) return null;
    setPlans(next);
    setCurrentPlan(toSave);
    return toSave;
  }, [currentPlan, plans, persist]);

  const deletePlan = useCallback(
    (id: string) => {
      setPlans((existing) => {
        const next = existing.filter((plan) => plan.id !== id);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const clearPlans = useCallback(() => {
    setPlans([]);
    setCurrentPlan(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
      setStorageError(null);
    } catch {
      setStorageError('The browser did not allow local data to be cleared.');
    }
  }, []);

  const value = useMemo(
    () => ({
      plans,
      currentPlan,
      storageError,
      currentIsSaved,
      openPlan,
      updateCurrentPlan,
      saveCurrentPlan,
      deletePlan,
      clearPlans,
    }),
    [
      plans,
      currentPlan,
      storageError,
      currentIsSaved,
      openPlan,
      updateCurrentPlan,
      saveCurrentPlan,
      deletePlan,
      clearPlans,
    ],
  );

  return <PlanLibraryContext.Provider value={value}>{children}</PlanLibraryContext.Provider>;
}

export function usePlanLibrary() {
  const context = useContext(PlanLibraryContext);
  if (!context) throw new Error('usePlanLibrary must be used inside PlanLibraryProvider');
  return context;
}
