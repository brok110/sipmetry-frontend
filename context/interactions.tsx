/**
 * Stage 1: Interaction Tracking Context
 *
 * Provides a fire-and-forget `track()` function and a batch `trackViews()` for
 * recording user behavior events to the backend.
 *
 * Design decisions:
 * - Fire-and-forget: failures are logged, never surfaced to user
 * - Batch view tracking: accumulates view events and flushes periodically
 * - No local state cache: the source of truth is the DB
 * - Requires auth: anonymous users are not tracked
 */
import React, { createContext, useCallback, useContext, useMemo, useRef } from "react";

import { useAuth } from "@/context/auth";
import { apiFetch } from "@/lib/api";
import { warn } from "@/lib/logger";

// ── Types ────────────────────────────────────────────────────────────────

export type InteractionType =
  | "view"
  | "click"
  | "favorite"
  | "unfavorite"
  | "like"
  | "dislike"
  | "skip"
  | "made";

export type InteractionContext = {
  source?: "scan" | "recommend" | "restock" | "detail";
  has_ingredients?: boolean;
  position?: number;
  view_duration_ms?: number;
  mood?: string;
  ingredient_keys?: string[];
};

export type TrackParams = {
  recipe_key?: string;
  ingredient_key?: string;
  interaction_type: InteractionType;
  context?: InteractionContext;
};

type InteractionContextValue = {
  /** Fire-and-forget: record a single interaction */
  track: (params: TrackParams) => void;
  /** Queue a view event for batch flush */
  queueView: (params: Omit<TrackParams, "interaction_type">) => void;
  /** Force-flush any queued view events */
  flushViews: () => void;
};

// ── Context ──────────────────────────────────────────────────────────────

const InteractionCtx = createContext<InteractionContextValue | null>(null);

export function useInteractions(): InteractionContextValue {
  const ctx = useContext(InteractionCtx);
  if (!ctx) {
    // Return no-op outside provider tree (safe for tests / unauthenticated screens)
    return { track: () => {}, queueView: () => {}, flushViews: () => {} };
  }
  return ctx;
}

// ── Provider ─────────────────────────────────────────────────────────────

const FLUSH_INTERVAL_MS = 10_000; // flush view queue every 10s
const MAX_QUEUE = 50;

export function InteractionProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();

  // ── View queue for batch flushing ────────────────────────────────────
  const viewQueue = useRef<TrackParams[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doFlush = useCallback(() => {
    if (!session?.access_token || viewQueue.current.length === 0) return;

    const events = viewQueue.current.splice(0); // drain queue
    if (flushTimer.current) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }

    apiFetch("/interactions/batch", { session, method: "POST", body: { events } }).catch((err) => {
      warn("[interactions/batch] flush failed:", err?.message || err);
    });
  }, [session]);

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) return; // already scheduled
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      doFlush();
    }, FLUSH_INTERVAL_MS);
  }, [doFlush]);

  // ── Public API ───────────────────────────────────────────────────────

  const track = useCallback(
    (params: TrackParams) => {
      if (!session?.access_token) return;
      if (!params.interaction_type) return;
      if (!params.recipe_key && !params.ingredient_key) return;

      // Fire-and-forget single event
      apiFetch("/interactions", { session, method: "POST", body: params }).catch((err) => {
        warn("[interactions] track failed:", err?.message || err);
      });
    },
    [session],
  );

  const queueView = useCallback(
    (params: Omit<TrackParams, "interaction_type">) => {
      if (!session?.access_token) return;
      if (!params.recipe_key && !params.ingredient_key) return;

      viewQueue.current.push({ ...params, interaction_type: "view" });

      // Auto-flush if queue is full
      if (viewQueue.current.length >= MAX_QUEUE) {
        doFlush();
      } else {
        scheduleFlush();
      }
    },
    [session, doFlush, scheduleFlush],
  );

  const flushViews = useCallback(() => {
    doFlush();
  }, [doFlush]);

  const value = useMemo<InteractionContextValue>(
    () => ({ track, queueView, flushViews }),
    [track, queueView, flushViews],
  );

  return <InteractionCtx.Provider value={value}>{children}</InteractionCtx.Provider>;
}
