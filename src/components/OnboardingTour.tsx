import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useJoyride,
  EVENTS,
  STATUS,
  ACTIONS,
  ORIGIN,
  type EventData,
  type Step,
} from "react-joyride";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useErp } from "@/lib/erpStore";

/**
 * 🔒 GLOBAL KILL SWITCH — TOUR DISABLED
 */
const TOUR_ENABLED = false;

export function OnboardingTour() {
  /**
   * 🚫 HARD BLOCK — nothing below will ever execute
   */
  if (!TOUR_ENABLED) return null;

  // ---- (kept for future re-enable if needed) ----
  const { user } = useAuth();
  const role = user?.role;
  const navigate = useNavigate();
  const location = useLocation();
  const { hydrated } = useErp();

  const locationRef = useRef(location);
  locationRef.current = location;

  const steps = useMemo<Step[]>(() => [], []);

  const [run, setRun] = useState(false);
  const controlsRef = useRef<any>(null);

  const onEvent = useCallback((data: EventData) => {
    const { status, action, origin, type } = data;

    const ended =
      status === STATUS.FINISHED ||
      status === STATUS.SKIPPED ||
      action === ACTIONS.CLOSE ||
      action === ACTIONS.SKIP ||
      origin === ORIGIN.BUTTON_CLOSE ||
      origin === ORIGIN.BUTTON_SKIP ||
      type === EVENTS.TOUR_END;

    if (ended) {
      setRun(false);
    }
  }, []);

  const { Tour, controls } = useJoyride({
    steps,
    run,
    continuous: true,
    onEvent,
  });

  controlsRef.current = controls;

  useEffect(() => {
    return;
  }, []);

  return Tour;
}
