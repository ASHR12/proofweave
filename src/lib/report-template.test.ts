import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_REPORT_TEMPLATE,
  getReportTemplateValues,
  renderReportTemplate,
} from "./report-template";
import type { ResearchReport } from "../types/report";

const report: ResearchReport = {
  schemaVersion: 1,
  id: "report-template-test",
  origin: "saved",
  title: "A cited research brief",
  question: "What does the available evidence show?",
  scope: "Use primary sources.",
  status: "completed",
  createdAt: "2026-08-17T10:00:00.000Z",
  updatedAt: "2026-08-17T10:06:30.000Z",
  completedAt: "2026-08-17T10:06:30.000Z",
  durationSeconds: 390,
  provider: {
    id: "google-deep-research",
    label: "Deep Research",
    agent: "deep-research-preview-04-2026",
    mode: "deep-research",
  },
  run: {
    id: "run-template-test",
    completedAt: "2026-08-17T10:06:30.000Z",
  },
  preview: {
    isPreview: false,
    label: "",
    note: "",
  },
  executiveSummary: ["The evidence supports a scoped conclusion."],
  keyFindings: [],
  comparison: {
    subjectA: "",
    subjectB: "",
    rows: [],
  },
  sections: [],
  citations: [
    {
      id: "citation-1",
      marker: 1,
      title: "Primary source",
      url: "https://example.com/source",
    },
  ],
};

test("renders report values and the legacy citation expression", () => {
  const template = `# {{ title }}

> {{ question }}

{{ provider }} / {{ agent }}
{{ citationCount === 1 ? "1 citation" : citationCount + " citations" }}
{{ duration }}`;
  const result = renderReportTemplate(template, report);

  assert.equal(result.error, null);
  assert.match(result.output, /# A cited research brief/);
  assert.match(result.output, /> What does the available evidence show\?/);
  assert.match(
    result.output,
    /Deep Research \/ deep-research-preview-04-2026/,
  );
  assert.match(result.output, /1 citation/);
  assert.match(result.output, /6m 30s/);
});

test("builds the default preview with the complete report Markdown", () => {
  const values = getReportTemplateValues(report);
  const result = renderReportTemplate(DEFAULT_REPORT_TEMPLATE, report);

  assert.equal(result.error, null);
  assert.equal(values.citationLabel, "1 citation");
  assert.match(values.reportMarkdown, /## Evidence/);
  assert.ok(result.output.startsWith(values.reportMarkdown));
  assert.match(result.output, /Deep Research/);
  assert.match(result.output, /1 citation/);
});

test("rejects executable template expressions without evaluating them", () => {
  const result = renderReportTemplate(
    '{{ (() => { throw new Error("executed") })() }}',
    report,
  );

  assert.deepEqual(result, {
    output: "",
    error: "Expression 1: use one of the available report values.",
  });
});

test("returns validation messages for incomplete templates", () => {
  assert.equal(
    renderReportTemplate("   ", report).error,
    "Add template text before exporting.",
  );
  assert.equal(
    renderReportTemplate("# {{ title", report).error,
    "Check the opening and closing braces.",
  );
  assert.match(
    renderReportTemplate("{{ missingValue }}", report).error ?? "",
    /^Expression 1:/,
  );
});
