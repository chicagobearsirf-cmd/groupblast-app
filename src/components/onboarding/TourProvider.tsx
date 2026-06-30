import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { TOUR_STEPS, type TourStep } from "@/lib/onboarding/steps";

// Bump the suffix to force the tour to re-show for everyone after a big change.
const STORAGE_KEY = "onboarding.tour.completed.v1";

type TourContextValue = {
  active: boolean;
  index: number;
  total: number;
  step: TourStep | null;
  start: () => void;
  next: () => void;
  back: () => void;
  stop: (markComplete?: boolean) => void;
};

const TourContext = createContext<TourContextValue | null>(null);

function hasCompleted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markCompleted(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Private mode / storage disabled — tour just re-shows next time. Harmless.
  }
}

export function TourProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);

  // Auto-start once for a first-time buddy. Delay a beat so the layout and its
  // data-tour targets are mounted before we try to spotlight one.
  useEffect(() => {
    if (hasCompleted()) return;
    const timer = setTimeout(() => {
      setIndex(0);
      setActive(true);
    }, 700);
    return () => clearTimeout(timer);
  }, []);

  // Keep the route in sync with the active step so cross-page steps land on the
  // right screen before the overlay tries to find their target.
  useEffect(() => {
    if (!active) return;
    const route = TOUR_STEPS[index]?.route;
    if (route) void navigate({ to: route });
  }, [active, index, navigate]);

  const start = useCallback(() => {
    setIndex(0);
    setActive(true);
  }, []);

  const stop = useCallback((complete = true) => {
    setActive(false);
    if (complete) markCompleted();
  }, []);

  const next = useCallback(() => {
    setIndex((current) => {
      if (current >= TOUR_STEPS.length - 1) {
        setActive(false);
        markCompleted();
        return current;
      }
      return current + 1;
    });
  }, []);

  const back = useCallback(() => {
    setIndex((current) => Math.max(0, current - 1));
  }, []);

  const value = useMemo<TourContextValue>(
    () => ({
      active,
      index,
      total: TOUR_STEPS.length,
      step: active ? (TOUR_STEPS[index] ?? null) : null,
      start,
      next,
      back,
      stop,
    }),
    [active, index, start, next, back, stop],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within a TourProvider.");
  return ctx;
}
