import assert from "node:assert/strict";
import test from "node:test";

import { stripProviderCitationTokens } from "./citation-presentation";

test("strips provider citation tokens with clean surrounding punctuation", () => {
  assert.equal(
    stripProviderCitationTokens(
      "Claim [cite: 1, 15]. Next [CITE:2], then [cite : 3]!",
    ),
    "Claim. Next, then!",
  );
  assert.equal(
    stripProviderCitationTokens(
      "Evidence [cite: 4] remains available ([cite: 5] retained).",
    ),
    "Evidence remains available (retained).",
  );
  assert.equal(stripProviderCitationTokens("[cite: 1, 2, 3]"), "");
});

test("preserves Markdown structure while stripping display-only tokens", () => {
  const markdownHardBreak = " ".repeat(2);
  const markdown = `**Finding [cite: 1]**

| Metric | Value |
| --- | --- |
| Context | 1M [cite: 21] |

Line [cite: 6]${markdownHardBreak}
continues`;

  assert.equal(
    stripProviderCitationTokens(markdown),
    `**Finding**

| Metric | Value |
| --- | --- |
| Context | 1M |

Line${markdownHardBreak}
continues`,
  );
});

test("does not reinterpret unrelated bracketed references", () => {
  const text = "Keep [cite: appendix A], [1], and source[cite: 1-3].";

  assert.equal(stripProviderCitationTokens(text), text);
});
