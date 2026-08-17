import assert from "node:assert/strict";
import test from "node:test";

import { normalizeProviderReport } from "./report-parser";
import { reportToMarkdown } from "./report-export";
import type { ProviderResearchResult } from "../providers/types";

const markdown = `# GLM and Kimi for coding agents

## Executive Summary

The available evidence supports a scoped comparison.

## Key Findings

- **Availability**: Evidence differs by deployment surface.
- **Evaluation**: Public measurements need careful qualification.

## Detailed Analysis

GLM documentation describes one set of supported workflows.

## Comparison Table

| Criterion | GLM 5.3 | Kimi K3 |
| --- | --- | --- |
| Documentation | Available | Available |
| Independent evidence | Insufficient evidence | Insufficient evidence |

## Trade-offs

The practical choice depends on constraints.

## Open Questions / Insufficient Evidence

Insufficient evidence for a universal winner.

## Conclusion

Run task-specific evaluations before choosing.`;

function resultFor(text: string): ProviderResearchResult {
  const startIndex = Buffer.byteLength(text.slice(0, text.indexOf("GLM documentation")));
  const endIndex = startIndex + Buffer.byteLength("GLM documentation");
  const annotation = {
    type: "url_citation" as const,
    url: "https://example.com/docs",
    title: "Primary documentation",
    startIndex,
    endIndex,
    contentBlockIndex: 0,
  };
  return {
    provider: {
      id: "google-deep-research",
      label: "Deep Research",
      agent: "deep-research-preview-04-2026",
      mode: "deep-research",
    },
    interactionId: "interaction-1",
    providerStatus: "completed",
    contentBlocks: [
      {
        type: "text",
        text,
        annotations: [annotation],
      },
    ],
    rawAnnotations: [annotation],
    completedAt: "2026-08-17T06:30:00.000Z",
  };
}

test("normalizes recognized Markdown without fabricating blocks", () => {
  const report = normalizeProviderReport({
    id: "research-test",
    runId: "run-test",
    question: "Compare GLM 5.3 and Kimi K3 for coding agents.",
    scope: "",
    queuedAt: "2026-08-17T06:25:00.000Z",
    startedAt: "2026-08-17T06:25:10.000Z",
    progress: [],
    result: resultFor(markdown),
  });

  assert.equal(report.title, "GLM and Kimi for coding agents");
  assert.equal(report.executiveSummary.length, 1);
  assert.equal(report.keyFindings.length, 2);
  assert.equal(report.comparison.subjectA, "GLM 5.3");
  assert.equal(report.comparison.rows.length, 2);
  assert.equal(report.citations.length, 1);
  assert.equal(report.authoritative?.markdown, markdown);
});

test("keeps prose authoritative when an optional table is absent", () => {
  const text = markdown.replace(
    /## Comparison Table[\s\S]*?(?=## Trade-offs)/,
    "",
  );
  const report = normalizeProviderReport({
    id: "research-no-table",
    runId: "run-no-table",
    question: "Research two systems.",
    scope: "",
    queuedAt: "2026-08-17T06:25:00.000Z",
    startedAt: "2026-08-17T06:25:10.000Z",
    progress: [],
    result: resultFor(text),
  });

  assert.deepEqual(report.comparison.rows, []);
  assert.equal(report.authoritative?.markdown, text);
});

test("strips provider tokens from normalized text without changing audit data", () => {
  const text = markdown
    .replace(
      "The available evidence supports a scoped comparison.",
      "The available evidence supports a scoped comparison [cite: 1, 15].",
    )
    .replace(
      "**Availability**: Evidence differs by deployment surface.",
      "**Availability [cite: 8]**: Evidence differs by deployment surface [cite: 2].",
    )
    .replace(
      "GLM documentation describes one set of supported workflows.",
      "GLM documentation describes one set of supported workflows [cite: 6].",
    )
    .replace(
      "| Documentation | Available | Available |",
      "| Documentation [cite: 3] | Available [cite: 4] | Available [cite: 5] |",
    );
  const result = resultFor(text);
  const report = normalizeProviderReport({
    id: "research-citation-tokens",
    runId: "run-citation-tokens",
    question: "Research two systems.",
    scope: "",
    queuedAt: "2026-08-17T06:25:00.000Z",
    startedAt: "2026-08-17T06:25:10.000Z",
    progress: [],
    result,
  });
  const normalizedText = [
    ...report.executiveSummary,
    ...report.keyFindings.flatMap(({ title, summary }) => [title, summary]),
    report.comparison.subjectA,
    report.comparison.subjectB,
    ...report.comparison.rows.flatMap(
      ({ criterion, subjectA, subjectB }) => [
        criterion,
        subjectA,
        subjectB,
      ],
    ),
    ...report.sections.flatMap(({ heading, paragraphs }) => [
      heading,
      ...paragraphs,
    ]),
  ].join("\n");

  assert.doesNotMatch(normalizedText, /\[cite\s*:/i);
  assert.equal(
    report.executiveSummary[0],
    "The available evidence supports a scoped comparison.",
  );
  assert.equal(report.keyFindings[0].title, "Availability");
  assert.equal(
    report.keyFindings[0].summary,
    "Evidence differs by deployment surface.",
  );
  assert.deepEqual(report.comparison.rows[0], {
    criterion: "Documentation",
    subjectA: "Available",
    subjectB: "Available",
    citationIds: [],
  });
  assert.equal(report.normalization?.parserVersion, "proofweave-markdown-2");

  assert.equal(report.authoritative?.markdown, text);
  assert.deepEqual(report.authoritative?.contentBlocks, result.contentBlocks);
  assert.deepEqual(report.authoritative?.rawAnnotations, result.rawAnnotations);
  assert.match(reportToMarkdown(report), /\[cite: 1, 15\]/);

  const serialized = JSON.parse(JSON.stringify(report)) as typeof report;
  assert.equal(serialized.authoritative?.markdown, text);
  assert.deepEqual(
    serialized.authoritative?.rawAnnotations,
    result.rawAnnotations,
  );
});
