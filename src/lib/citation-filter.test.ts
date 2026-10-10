import assert from "node:assert/strict";
import test from "node:test";

import type { Citation } from "@/types/report";

import { filterCitations } from "./citation-filter";

function makeCitation(overrides: Partial<Citation> & { id: string }): Citation {
  return {
    marker: 1,
    title: "Untitled",
    url: "https://example.com",
    ...overrides,
  };
}

const CITATIONS: Citation[] = [
  makeCitation({
    id: "c1",
    title: "State of AI Report 2025",
    publisher: "Stanford HAI",
    excerpt: "Frontier models keep improving on reasoning benchmarks.",
  }),
  makeCitation({
    id: "c2",
    title: "Renewable energy outlook",
    publisher: "IEA",
    excerpt: "Solar capacity additions reached a record high.",
  }),
  makeCitation({
    id: "c3",
    title: "Benchmark methodology",
  }),
];

test("returns every citation when the query is blank or whitespace", () => {
  assert.equal(filterCitations(CITATIONS, ""), CITATIONS);
  assert.equal(filterCitations(CITATIONS, "   "), CITATIONS);
});

test("matches title, publisher, and excerpt case-insensitively", () => {
  assert.deepEqual(
    filterCitations(CITATIONS, "REPORT").map((citation) => citation.id),
    ["c1"],
  );
  assert.deepEqual(
    filterCitations(CITATIONS, "stanford").map((citation) => citation.id),
    ["c1"],
  );
  assert.deepEqual(
    filterCitations(CITATIONS, "SoLaR").map((citation) => citation.id),
    ["c2"],
  );
});

test("trims the query and ignores missing publisher and excerpt", () => {
  assert.deepEqual(
    filterCitations(CITATIONS, "  methodology  ").map(
      (citation) => citation.id,
    ),
    ["c3"],
  );
  assert.deepEqual(filterCitations(CITATIONS, "no such source"), []);
});

test("supports a live count of filtered results against the total", () => {
  const filtered = filterCitations(CITATIONS, "stanford");
  assert.equal(
    `${filtered.length} of ${CITATIONS.length} sources`,
    "1 of 3 sources",
  );
  assert.equal(
    `${filterCitations(CITATIONS, "zzz").length} of ${CITATIONS.length} sources`,
    "0 of 3 sources",
  );
});
