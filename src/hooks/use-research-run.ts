"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  ResearchRunDiscoveryResponse,
  ResearchRunResponse,
  ResearchRunSnapshot,
  StartResearchRequest,
  StartResearchResponse,
} from "@/types/research";

const ACTIVE_RUN_KEY = "proofweave-active-run";

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "Research request failed.");
  }
  return payload;
}

function isActive(run: ResearchRunSnapshot | null) {
  return Boolean(
    run && ["queued", "researching", "reconnecting"].includes(run.status),
  );
}

export function useResearchRun() {
  const [run, setRun] = useState<ResearchRunSnapshot | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const runId = window.sessionStorage.getItem(ACTIVE_RUN_KEY);
    const fastPath = runId
      ? requestJson<ResearchRunResponse>(`/api/research/${runId}`)
          .then(({ run: restoredRun }) => restoredRun)
          .catch(() => null)
      : Promise.resolve(null);

    void fastPath
      .then((restoredRun) =>
        restoredRun
          ? restoredRun
          : requestJson<ResearchRunDiscoveryResponse>("/api/research", {
              cache: "no-store",
            }).then(({ run: discoveredRun }) => discoveredRun),
      )
      .then((restoredRun) => {
        if (!restoredRun) {
          window.sessionStorage.removeItem(ACTIVE_RUN_KEY);
          return;
        }
        setRun(restoredRun);
        if (isActive(restoredRun)) {
          window.sessionStorage.setItem(ACTIVE_RUN_KEY, restoredRun.id);
        } else {
          window.sessionStorage.removeItem(ACTIVE_RUN_KEY);
        }
      })
      .catch((restoreError: unknown) => {
        setError(
          restoreError instanceof Error
            ? restoreError.message
            : "Unable to discover persisted research runs.",
        );
      });
  }, []);

  useEffect(() => {
    if (!run?.id || !isActive(run)) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void requestJson<ResearchRunResponse>(`/api/research/${run.id}`)
        .then(({ run: nextRun }) => {
          if (cancelled) return;
          setRun(nextRun);
          setError(null);
          if (!isActive(nextRun)) {
            window.sessionStorage.removeItem(ACTIVE_RUN_KEY);
          }
        })
        .catch((pollError: unknown) => {
          if (cancelled) return;
          setRun((current) =>
            current ? { ...current, status: "reconnecting" } : current,
          );
          setError(
            pollError instanceof Error
              ? pollError.message
              : "Unable to reconnect to the local run.",
          );
        });
    }, 2_000);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [run]);

  const start = useCallback(
    async (question: string, scope: string) => {
      if (isStarting || isActive(run)) return null;
      setIsStarting(true);
      setError(null);
      try {
        const request: StartResearchRequest = {
          question,
          scope,
          confirmedPaidPreview: true,
        };
        const response = await requestJson<StartResearchResponse>(
          "/api/research",
          {
            method: "POST",
            body: JSON.stringify(request),
          },
        );
        setRun(response.run);
        window.sessionStorage.setItem(ACTIVE_RUN_KEY, response.run.id);
        return response.run;
      } catch (startError) {
        setError(
          startError instanceof Error
            ? startError.message
            : "Unable to start research.",
        );
        return null;
      } finally {
        setIsStarting(false);
      }
    },
    [isStarting, run],
  );

  const cancel = useCallback(async () => {
    if (!run || !isActive(run)) return;
    try {
      const response = await requestJson<ResearchRunResponse>(
        `/api/research/${run.id}/cancel`,
        { method: "POST" },
      );
      setRun(response.run);
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : "Unable to cancel research.",
      );
    }
  }, [run]);

  return {
    run,
    isStarting,
    isRunning: isActive(run),
    error,
    start,
    cancel,
  };
}
