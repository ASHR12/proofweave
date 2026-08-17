import type { ResearchReport } from "@/types/report";

function citationMarkers(report: ResearchReport, citationIds: string[]) {
  return citationIds
    .map((citationId) => report.citations.find(({ id }) => id === citationId))
    .filter((citation) => citation !== undefined)
    .map(({ marker }) => `[${marker}]`)
    .join("");
}

function safeFilename(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 72) || "proofweave-report"
  );
}

export function reportToMarkdown(report: ResearchReport): string {
  if (report.authoritative) {
    const evidence = report.citations.flatMap((citation) => [
      `${citation.marker}. [${citation.title}](${citation.url})${citation.publisher ? ` — ${citation.publisher}` : ""}`,
      ...(citation.excerpt ? [`   ${citation.excerpt}`] : []),
      "",
    ]);
    return [
      report.authoritative.markdown.trim(),
      "",
      "## Proofweave Evidence",
      "",
      ...(evidence.length > 0
        ? evidence
        : ["No usable URL citation annotations were returned.", ""]),
      "## Proofweave Run Metadata",
      "",
      `- Status: ${report.status}`,
      `- Provider: ${report.provider.label}`,
      `- Agent: ${report.provider.agent}`,
      `- Run ID: ${report.run.id}`,
      ...(report.run.interactionId
        ? [`- Interaction ID: ${report.run.interactionId}`]
        : []),
      "",
    ].join("\n");
  }

  const lines = [
    `# ${report.title}`,
    "",
    `> ${report.preview.label}`,
    `> ${report.preview.note}`,
    "",
    `**Question:** ${report.question}`,
    "",
    `**Scope:** ${report.scope}`,
    "",
    "## Executive summary",
    "",
    ...report.executiveSummary.flatMap((paragraph) => [paragraph, ""]),
    "## Key findings",
    "",
    ...report.keyFindings.flatMap((finding) => [
      `### ${finding.title}`,
      "",
      `${finding.summary}${citationMarkers(report, finding.citationIds)}`,
      "",
    ]),
    "## Comparison",
    "",
    `| Criterion | ${report.comparison.subjectA} | ${report.comparison.subjectB} |`,
    "| --- | --- | --- |",
    ...report.comparison.rows.map(
      (row) =>
        `| ${row.criterion} | ${row.subjectA} | ${row.subjectB}${citationMarkers(report, row.citationIds)} |`,
    ),
    "",
    ...report.sections.flatMap((section) => [
      `## ${section.heading}`,
      "",
      ...section.paragraphs.flatMap((paragraph, index) => [
        `${paragraph}${index === section.paragraphs.length - 1 ? citationMarkers(report, section.citationIds) : ""}`,
        "",
      ]),
    ]),
    "## Evidence",
    "",
    ...report.citations.flatMap((citation) => [
      `${citation.marker}. [${citation.title}](${citation.url})${citation.publisher ? ` — ${citation.publisher}` : ""}`,
      ...(citation.excerpt ? [`   ${citation.excerpt}`] : []),
      "",
    ]),
    "## Run metadata",
    "",
    `- Status: ${report.status}`,
    `- Provider: ${report.provider.label}`,
    `- Agent: ${report.provider.agent}`,
    `- Run ID: ${report.run.id}`,
    "",
  ];

  return lines.join("\n");
}

function downloadFile(filename: string, contents: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadMarkdown(report: ResearchReport) {
  downloadFile(
    `${safeFilename(report.title)}.md`,
    reportToMarkdown(report),
    "text/markdown;charset=utf-8",
  );
}

export function downloadNormalizedJson(report: ResearchReport) {
  downloadFile(
    `${safeFilename(report.title)}.json`,
    `${JSON.stringify(report, null, 2)}\n`,
    "application/json;charset=utf-8",
  );
}
