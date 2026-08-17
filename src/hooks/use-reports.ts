"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  ApiErrorResponse,
  ReportResponse,
  ReportsCollectionResponse,
  ResearchReport,
} from "@/types/report";

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);

  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => ({ error: "The request failed." }))) as ApiErrorResponse;
    throw new Error(payload.error || "The request failed.");
  }

  return (await response.json()) as T;
}

export function useReports() {
  const [reports, setReports] = useState<ResearchReport[]>([]);
  const [selectedReport, setSelectedReport] =
    useState<ResearchReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void requestJson<ReportsCollectionResponse>(
      "/api/reports",
      { cache: "no-store" },
    )
      .then((payload) => {
        if (cancelled) return;
        setReports(payload.reports);
        setSelectedReport(payload.reports[0] ?? null);
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Reports could not be loaded.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const reloadReports = useCallback(async () => {
    const payload = await requestJson<ReportsCollectionResponse>(
        "/api/reports",
        { cache: "no-store" },
      );
    setReports(payload.reports);
    setSelectedReport((current) => current ?? payload.reports[0] ?? null);
  }, []);

  const openReport = useCallback(async (reportId: string) => {
    setError(null);
    const payload = await requestJson<ReportResponse>(
      `/api/reports/${encodeURIComponent(reportId)}`,
      { cache: "no-store" },
    );
    setSelectedReport(payload.report);
    return payload.report;
  }, []);

  const saveLocalCopy = useCallback(async (source: ResearchReport) => {
    const timestamp = new Date().toISOString();
    const report: ResearchReport = {
      ...source,
      id: `local-${crypto.randomUUID()}`,
      origin: "saved",
      title: `${source.title} — local copy`,
      createdAt: timestamp,
      updatedAt: timestamp,
      run: {
        ...source.run,
        id: `local-preview-${Math.random().toString(36).slice(2, 10)}`,
      },
    };

    const payload = await requestJson<ReportResponse>("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
    });

    setReports((current) => [
      payload.report,
      ...current.filter(({ id }) => id !== payload.report.id),
    ]);
    setSelectedReport(payload.report);
    return payload.report;
  }, []);

  const removeReport = useCallback(
    async (reportId: string) => {
      const response = await fetch(
        `/api/reports/${encodeURIComponent(reportId)}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const payload = (await response
          .json()
          .catch(() => ({ error: "The report could not be deleted." }))) as ApiErrorResponse;
        throw new Error(payload.error);
      }

      setReports((current) =>
        current.filter((report) => report.id !== reportId),
      );
      setSelectedReport((current) =>
        current?.id === reportId ? null : current,
      );
    },
    [],
  );

  return {
    reports,
    selectedReport,
    isLoading,
    error,
    reloadReports,
    openReport,
    saveLocalCopy,
    removeReport,
  };
}
