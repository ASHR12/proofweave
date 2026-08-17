import { chromium } from "playwright";

const baseUrl = process.env.PROOFWEAVE_URL ?? "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 1100 },
  deviceScaleFactor: 1,
});
const browserErrors = [];
const realReportTitle =
  "Comparative Analysis of GLM 5.3 and Kimi K3 for Autonomous Coding Agents";

page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(message.text());
});
page.on("pageerror", (error) => browserErrors.push(error.message));

await page.emulateMedia({ reducedMotion: "reduce" });
await Promise.all([
  page.waitForResponse(
    (response) =>
      response.url().includes("/api/reports") && response.status() === 200,
  ),
  page.goto(baseUrl, { waitUntil: "domcontentloaded" }),
]);
await page.getByRole("heading", { name: "Begin with a question worth tracing." }).waitFor();
await page.screenshot({
  path: "artifacts/01-new-research.png",
  fullPage: true,
});

await page.getByRole("button", { name: "Report reader" }).click();
await page.getByRole("heading", { name: realReportTitle }).first().waitFor();
await page.screenshot({
  path: "artifacts/report-reader-real-only.png",
  fullPage: true,
});

await page.getByRole("button", { name: /^Library/ }).click();
await page.getByRole("heading", { name: "Saved reports" }).waitFor();
await page.getByText("1 of 1").waitFor();
const openReportButtons = page.getByRole("button", { name: "Open report" });
if ((await openReportButtons.count()) !== 1) {
  throw new Error("Library should contain exactly one report.");
}
await page.getByRole("heading", { name: realReportTitle }).waitFor();
await page.screenshot({
  path: "artifacts/library-real-only.png",
  fullPage: true,
});

await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole("button", { name: "New research", exact: true }).click();
await page.screenshot({
  path: "artifacts/04-mobile-new-research.png",
  fullPage: true,
});

const mobileOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
if (mobileOverflow > 1) {
  throw new Error(`Mobile layout overflows horizontally by ${mobileOverflow}px.`);
}

await page.setViewportSize({ width: 900, height: 1000 });
await page.getByRole("button", { name: /^Library/ }).click();
const tabletOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
if (tabletOverflow > 1) {
  throw new Error(`Tablet layout overflows horizontally by ${tabletOverflow}px.`);
}

await browser.close();

if (browserErrors.length > 0) {
  throw new Error(`Browser errors:\n${browserErrors.join("\n")}`);
}

console.log("Captured Proofweave screenshots with no browser errors.");
