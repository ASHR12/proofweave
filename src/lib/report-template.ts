"use client";

import { reportToMarkdown } from "@/lib/report-export";
import type { ResearchReport } from "@/types/report";

export const REPORT_TEMPLATE_STORAGE_KEY =
  "proofweave.custom-report-template.v1";

export const DEFAULT_REPORT_TEMPLATE = `{{ reportMarkdown }}

---

_Completed {{ completionDate }} with {{ provider }} ({{ agent }}) in {{ duration }} · {{ citationLabel }}_`;

export const REPORT_TEMPLATE_FIELDS = [
  {
    name: "title",
    description: "Report title",
  },
  {
    name: "question",
    description: "Original research question",
  },
  {
    name: "provider",
    description: "Research provider",
  },
  {
    name: "agent",
    description: "Provider agent",
  },
  {
    name: "citationCount",
    description: "Number of cited sources",
  },
  {
    name: "citationLabel",
    description: "Citation count with singular or plural label",
  },
  {
    name: "duration",
    description: "Formatted run duration",
  },
  {
    name: "completionDate",
    description: "Formatted completion date",
  },
  {
    name: "reportMarkdown",
    description: "Complete report Markdown",
  },
] as const;

export interface ReportTemplateResult {
  output: string;
  error: string | null;
}

type ReportTemplateValues = {
  title: string;
  question: string;
  provider: string;
  agent: string;
  citationCount: number;
  citationLabel: string;
  duration: string;
  completionDate: string;
  reportMarkdown: string;
};

const LEGACY_CITATION_LABEL_EXPRESSION =
  /^citationCount\s*===\s*1\s*\?\s*(?:"1 citation"|'1 citation')\s*:\s*citationCount\s*\+\s*(?:" citations"|' citations')$/;

function formatDuration(durationSeconds?: number) {
  if (durationSeconds === undefined) return "No live run";

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function formatCompletionDate(report: ResearchReport) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(report.completedAt ?? report.updatedAt));
}

export function getReportTemplateValues(
  report: ResearchReport,
): ReportTemplateValues {
  const citationCount = report.citations.length;

  return {
    title: report.title,
    question: report.question,
    provider: report.provider.label,
    agent: report.provider.agent,
    citationCount,
    citationLabel:
      citationCount === 1 ? "1 citation" : `${citationCount} citations`,
    duration: formatDuration(report.durationSeconds),
    completionDate: formatCompletionDate(report),
    reportMarkdown: reportToMarkdown(report),
  };
}

function evaluateTemplateExpression(
  expression: string,
  values: ReportTemplateValues,
  position: number,
) {
  const fieldName = expression.trim();
  if (!fieldName) {
    throw new Error(`Expression ${position} is empty.`);
  }

  if (Object.prototype.hasOwnProperty.call(values, fieldName)) {
    return String(values[fieldName as keyof ReportTemplateValues]);
  }

  if (LEGACY_CITATION_LABEL_EXPRESSION.test(fieldName)) {
    return values.citationLabel;
  }

  throw new Error(
    `Expression ${position}: use one of the available report values.`,
  );
}

export function renderReportTemplate(
  template: string,
  report: ResearchReport,
): ReportTemplateResult {
  if (!template.trim()) {
    return {
      output: "",
      error: "Add template text before exporting.",
    };
  }

  const values = getReportTemplateValues(report);
  const expressionPattern = /{{([\s\S]*?)}}/g;
  let cursor = 0;
  let position = 0;
  let output = "";

  try {
    for (const match of template.matchAll(expressionPattern)) {
      const matchIndex = match.index;
      const leadingText = template.slice(cursor, matchIndex);
      if (leadingText.includes("{{") || leadingText.includes("}}")) {
        throw new Error("Check the opening and closing braces.");
      }

      position += 1;
      output += leadingText;
      output += evaluateTemplateExpression(match[1], values, position);
      cursor = matchIndex + match[0].length;
    }

    const trailingText = template.slice(cursor);
    if (trailingText.includes("{{") || trailingText.includes("}}")) {
      throw new Error("Check the opening and closing braces.");
    }

    output += trailingText;
    return {
      output,
      error: null,
    };
  } catch (error) {
    return {
      output: "",
      error:
        error instanceof Error
          ? error.message
          : "The template could not be rendered.",
    };
  }
}

function exportFilename(title: string) {
  const stem =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64) || "proofweave-report";
  return `${stem}-custom.md`;
}

export function downloadRenderedReport(
  report: ResearchReport,
  contents: string,
) {
  const blob = new Blob([contents], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = exportFilename(report.title);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
