import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const baseUrl = process.env.PROOFWEAVE_URL ?? "http://127.0.0.1:3000";
const artifactsDirectory = path.join(process.cwd(), "artifacts");
await mkdir(artifactsDirectory, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
const browserErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(message.text());
});
page.on("pageerror", (error) => browserErrors.push(error.message));

await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /^Library/ }).click();
const realCard = page
  .locator("article")
  .filter({ hasText: "Deep Research" })
  .first();
await realCard.waitFor();
await page.screenshot({
  path: path.join(artifactsDirectory, "real-library.png"),
  fullPage: true,
});

await realCard.getByRole("button", { name: "Open report" }).click();
await page.getByRole("heading", { name: "Authoritative cited report" }).waitFor();
const visibleReportText = await page.locator("body").innerText();
if (/\[cite\s*:/i.test(visibleReportText)) {
  throw new Error("Provider citation tokens remain visible in the report.");
}
await page.screenshot({
  path: path.join(artifactsDirectory, "real-report.png"),
  fullPage: true,
});
const comparisonSection = page
  .locator("section")
  .filter({
    has: page.getByRole("heading", { name: "Comparison frame" }),
  })
  .first();
await comparisonSection.waitFor();
await comparisonSection.screenshot({
  path: path.join(
    artifactsDirectory,
    "citation-clean-comparison-report.png",
  ),
});

const markdownDownloadPromise = page.waitForEvent("download");
await page.getByRole("button", { name: "Markdown" }).click();
const markdownDownload = await markdownDownloadPromise;
const markdownPath = path.join(artifactsDirectory, "verified-real-report.md");
await markdownDownload.saveAs(markdownPath);

const jsonDownloadPromise = page.waitForEvent("download");
await page.getByRole("button", { name: "JSON" }).click();
const jsonDownload = await jsonDownloadPromise;
const jsonPath = path.join(artifactsDirectory, "verified-real-report.json");
await jsonDownload.saveAs(jsonPath);

const normalized = JSON.parse(await readFile(jsonPath, "utf8"));
const markdown = await readFile(markdownPath, "utf8");
const savedReport = JSON.parse(
  await readFile(
    path.join(process.cwd(), "data", "reports", `${normalized.id}.json`),
    "utf8",
  ),
);
if (
  normalized.origin !== "saved" ||
  normalized.status !== "completed" ||
  !normalized.authoritative?.markdown ||
  !markdown.includes("## Proofweave Evidence") ||
  normalized.authoritative.markdown !== savedReport.authoritative?.markdown ||
  JSON.stringify(normalized.authoritative.contentBlocks) !==
    JSON.stringify(savedReport.authoritative?.contentBlocks) ||
  JSON.stringify(normalized.authoritative.rawAnnotations) !==
    JSON.stringify(savedReport.authoritative?.rawAnnotations) ||
  !normalized.authoritative.markdown.includes("[cite:") ||
  !markdown.includes("[cite:")
) {
  throw new Error("Export verification failed.");
}

await page.getByRole("button", { name: "Evidence" }).click();
await page.getByRole("heading", { name: "Sources & citations" }).waitFor();
await page.waitForTimeout(500);
const visibleEvidenceText = await page.getByRole("dialog").innerText();
if (/\[cite\s*:/i.test(visibleEvidenceText)) {
  throw new Error("Provider citation tokens remain visible in evidence.");
}
await page.screenshot({
  path: path.join(artifactsDirectory, "real-evidence-drawer.png"),
  fullPage: false,
});
await page.screenshot({
  path: path.join(
    artifactsDirectory,
    "citation-clean-evidence-drawer.png",
  ),
  fullPage: false,
});

if (browserErrors.length > 0) {
  throw new Error(`Browser errors: ${browserErrors.join(" | ")}`);
}

console.log(
  JSON.stringify({
    reportId: normalized.id,
    title: normalized.title,
    provider: normalized.provider.label,
    agent: normalized.provider.agent,
    status: normalized.status,
    citationCount: normalized.citations.length,
  }),
);

await browser.close();
