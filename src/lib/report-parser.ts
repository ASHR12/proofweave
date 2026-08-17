import type { ProviderResearchResult } from "@/providers/types";
import type {
  Citation,
  ComparisonRow,
  KeyFinding,
  ReportSection,
  ResearchReport,
} from "@/types/report";
import { stripProviderCitationTokens } from "./citation-presentation";

const PARSER_VERSION = "proofweave-markdown-2";

interface NormalizationInput {
  id: string;
  runId: string;
  question: string;
  scope: string;
  queuedAt: string;
  startedAt: string;
  progress: Array<{ message: string; occurredAt: string }>;
  result: ProviderResearchResult;
}

interface ParsedMarkdownSection {
  heading: string;
  normalizedHeading: string;
  body: string;
  bodyStart: number;
  start: number;
  end: number;
}

interface CitationRange {
  citationId: string;
  start?: number;
  end?: number;
}

function normalizeHeading(value: string) {
  return value
    .toLowerCase()
    .replace(/[*_`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stripInlineMarkdown(value: string) {
  return stripProviderCitationTokens(value)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/, "")
    .trim();
}

function splitParagraphs(markdown: string) {
  return markdown
    .split(/\n\s*\n/)
    .map((paragraph) => stripInlineMarkdown(paragraph.replace(/\n+/g, " ")))
    .filter(Boolean);
}

function byteOffsetToCodeUnit(text: string, offset: number | undefined) {
  if (offset === undefined || offset < 0) return undefined;
  const bytes = Buffer.from(text, "utf8");
  if (offset > bytes.length) return undefined;
  const prefix = bytes.subarray(0, offset).toString("utf8");
  return Buffer.byteLength(prefix, "utf8") === offset
    ? prefix.length
    : undefined;
}

function sliceByByteOffsets(
  text: string,
  startIndex: number | undefined,
  endIndex: number | undefined,
) {
  const start = byteOffsetToCodeUnit(text, startIndex);
  const end = byteOffsetToCodeUnit(text, endIndex);
  if (start === undefined || end === undefined || end <= start) return undefined;
  return text.slice(start, end).trim() || undefined;
}

function parseSections(markdown: string) {
  const headingPattern = /^(#{1,3})\s+(.+?)\s*$/gm;
  const headings = Array.from(markdown.matchAll(headingPattern));
  const titleMatch = headings.find((match) => match[1].length === 1);
  const sections: ParsedMarkdownSection[] = [];
  const secondLevelHeadings = headings.filter((match) => match[1].length === 2);

  for (let index = 0; index < secondLevelHeadings.length; index += 1) {
    const match = secondLevelHeadings[index];
    const headingStart = match.index ?? 0;
    const bodyStart = headingStart + match[0].length;
    const end = secondLevelHeadings[index + 1]?.index ?? markdown.length;
    const heading = stripInlineMarkdown(match[2]);
    sections.push({
      heading,
      normalizedHeading: normalizeHeading(heading),
      body: markdown.slice(bodyStart, end).trim(),
      bodyStart,
      start: headingStart,
      end,
    });
  }

  return {
    title: titleMatch ? stripInlineMarkdown(titleMatch[2]) : undefined,
    sections,
  };
}

function parseKeyFindings(
  section: ParsedMarkdownSection | undefined,
  ranges: CitationRange[],
): KeyFinding[] {
  if (!section) return [];

  let bodyCursor = 0;
  return section.body.split("\n").flatMap((line, index) => {
    const lineStart = section.body.indexOf(line, bodyCursor);
    bodyCursor = lineStart + line.length + 1;
    if (!/^\s*(?:[-+*]|\d+[.)])\s+/.test(line)) return [];
      const finding = stripInlineMarkdown(line);
      const [candidateTitle, ...summaryParts] = finding.split(/:\s+/);
      const hasExplicitSummary = summaryParts.length > 0;
      return [{
        id: `finding-${index + 1}`,
        eyebrow: "Reported finding",
        title: hasExplicitSummary ? candidateTitle : finding,
        summary: hasExplicitSummary ? summaryParts.join(": ") : "",
        citationIds: citationIdsForRange(
          section.bodyStart + lineStart,
          section.bodyStart + lineStart + line.length,
          ranges,
        ),
      }];
    }).filter(({ title }) => title.length > 0);
}

function parseTableLine(line: string) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  if (trimmed.includes("\\|")) return null;
  return trimmed.split("|").map((cell) => stripInlineMarkdown(cell));
}

function parseComparison(
  section: ParsedMarkdownSection | undefined,
  ranges: CitationRange[],
  warnings: string[],
) {
  const empty = { subjectA: "", subjectB: "", rows: [] as ComparisonRow[] };
  if (!section) return empty;

  const lines = section.body.split("\n");
  const lineOffsets: number[] = [];
  let lineCursor = 0;
  for (const line of lines) {
    const lineStart = section.body.indexOf(line, lineCursor);
    lineOffsets.push(lineStart);
    lineCursor = lineStart + line.length + 1;
  }
  for (let index = 0; index < lines.length - 2; index += 1) {
    const header = parseTableLine(lines[index]);
    const separator = parseTableLine(lines[index + 1]);
    if (!header || !separator || header.length < 3) continue;
    if (
      separator.length !== header.length ||
      !separator.every((cell) => /^:?-{3,}:?$/.test(cell))
    ) {
      continue;
    }

    const rows: ComparisonRow[] = [];
    for (
      let rowIndex = index + 2;
      rowIndex < lines.length;
      rowIndex += 1
    ) {
      const line = lines[rowIndex];
      if (!line.includes("|")) break;
      const cells = parseTableLine(line);
      if (!cells || cells.length !== header.length) {
        warnings.push(
          "A comparison table was left in prose because its rows were irregular.",
        );
        return empty;
      }
      rows.push({
        criterion: cells[0],
        subjectA: cells[1],
        subjectB: cells[2],
        citationIds: citationIdsForRange(
          section.bodyStart + lineOffsets[rowIndex],
          section.bodyStart + lineOffsets[rowIndex] + line.length,
          ranges,
        ),
      });
    }

    if (rows.length > 0) {
      return {
        subjectA: header[1],
        subjectB: header[2],
        rows,
      };
    }
  }

  warnings.push(
    "No deterministic comparison table was found; the cited prose remains authoritative.",
  );
  return empty;
}

function citationIdsForSection(
  section: ParsedMarkdownSection | undefined,
  ranges: CitationRange[],
) {
  if (!section) return [];
  return Array.from(
    new Set(
      ranges
        .filter(
          (range) =>
            range.start !== undefined &&
            range.end !== undefined &&
            range.end >= section.start &&
            range.start <= section.end,
        )
        .map(({ citationId }) => citationId),
    ),
  );
}

function citationIdsForRange(
  start: number,
  end: number,
  ranges: CitationRange[],
) {
  return Array.from(
    new Set(
      ranges
        .filter(
          (range) =>
            range.start !== undefined &&
            range.end !== undefined &&
            range.end >= start &&
            range.start <= end,
        )
        .map(({ citationId }) => citationId),
    ),
  );
}

function buildCitations(result: ProviderResearchResult) {
  const citations: Citation[] = [];
  const ranges: CitationRange[] = [];
  const citationByUrl = new Map<string, Citation>();
  const blockStarts: number[] = [];
  let cursor = 0;

  result.contentBlocks.forEach((block, blockIndex) => {
    blockStarts[blockIndex] = cursor;
    cursor += block.text.length + (blockIndex === result.contentBlocks.length - 1 ? 0 : 2);
  });

  for (const annotation of result.rawAnnotations) {
    if (!annotation.url) continue;

    let citation = citationByUrl.get(annotation.url);
    if (!citation) {
      const sourceHost = new URL(annotation.url).hostname.replace(/^www\./, "");
      citation = {
        id: `citation-${citations.length + 1}`,
        marker: citations.length + 1,
        title: annotation.title || sourceHost,
        publisher: sourceHost,
        url: annotation.url,
        excerpt: sliceByByteOffsets(
          result.contentBlocks[annotation.contentBlockIndex]?.text ?? "",
          annotation.startIndex,
          annotation.endIndex,
        ),
        references: [],
      };
      citationByUrl.set(annotation.url, citation);
      citations.push(citation);
    }

    citation.references?.push({
      contentBlockIndex: annotation.contentBlockIndex,
      startIndex: annotation.startIndex,
      endIndex: annotation.endIndex,
    });

    const block = result.contentBlocks[annotation.contentBlockIndex];
    const start = block
      ? byteOffsetToCodeUnit(block.text, annotation.startIndex)
      : undefined;
    const end = block
      ? byteOffsetToCodeUnit(block.text, annotation.endIndex)
      : undefined;
    ranges.push({
      citationId: citation.id,
      start:
        start === undefined
          ? undefined
          : blockStarts[annotation.contentBlockIndex] + start,
      end:
        end === undefined
          ? undefined
          : blockStarts[annotation.contentBlockIndex] + end,
    });
  }

  return { citations, ranges };
}

function findSection(
  sections: ParsedMarkdownSection[],
  acceptedHeadings: string[],
) {
  return sections.find((section) =>
    acceptedHeadings.includes(section.normalizedHeading),
  );
}

export function normalizeProviderReport({
  id,
  runId,
  question,
  scope,
  queuedAt,
  startedAt,
  progress,
  result,
}: NormalizationInput): ResearchReport {
  const markdown = result.contentBlocks.map(({ text }) => text).join("\n\n");
  const parsed = parseSections(markdown);
  const warnings: string[] = [];
  const { citations, ranges } = buildCitations(result);
  const executiveSection = findSection(parsed.sections, [
    "executive summary",
    "summary",
    "overview",
  ]);
  const findingsSection = findSection(parsed.sections, [
    "key findings",
    "findings",
  ]);
  const comparisonSection = findSection(parsed.sections, [
    "comparison table",
    "comparison",
  ]);
  const executiveSummary = executiveSection
    ? splitParagraphs(executiveSection.body)
    : [];
  const keyFindings = parseKeyFindings(
    findingsSection,
    ranges,
  );
  const comparison = parseComparison(
    comparisonSection,
    ranges,
    warnings,
  );
  const reservedHeadings = new Set([
    "executive summary",
    "summary",
    "overview",
    "key findings",
    "findings",
    "comparison table",
    "comparison",
  ]);
  const sections: ReportSection[] = parsed.sections
    .filter((section) => !reservedHeadings.has(section.normalizedHeading))
    .map((section, index) => ({
      id: `section-${index + 1}`,
      heading: section.heading,
      paragraphs: splitParagraphs(section.body),
      citationIds: citationIdsForSection(section, ranges),
    }));
  const completedAt = result.completedAt;

  if (!parsed.title) {
    warnings.push("The report had no H1 title; the research question is used.");
  }
  if (citations.length === 0) {
    warnings.push("The provider returned no usable URL citation annotations.");
  }

  return {
    schemaVersion: 1,
    id,
    origin: "saved",
    title: parsed.title || question,
    question,
    scope,
    status: "completed",
    createdAt: queuedAt,
    updatedAt: completedAt,
    completedAt,
    durationSeconds: Math.max(
      0,
      Math.round(
        (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000,
      ),
    ),
    provider: result.provider,
    run: {
      id: runId,
      interactionId: result.interactionId,
      providerStatus: result.providerStatus,
      lastEventId: result.lastEventId,
      queuedAt,
      startedAt,
      completedAt,
    },
    preview: {
      isPreview: false,
      label: "",
      note: "",
    },
    executiveSummary,
    keyFindings,
    comparison,
    sections,
    citations,
    authoritative: {
      format: "markdown",
      markdown,
      contentBlocks: result.contentBlocks,
      rawAnnotations: result.rawAnnotations,
    },
    normalization: {
      method: "deterministic-markdown",
      parserVersion: PARSER_VERSION,
      warnings,
    },
    progress,
  };
}
