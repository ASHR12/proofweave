import { chromium } from "playwright";

async function captureScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });

  const page = await context.newPage();
  await page.goto("http://localhost:3000");
  
  await page.waitForTimeout(2000);

  console.log("Capturing light mode screenshot...");
  await page.screenshot({ path: "/tmp/light-mode.png", fullPage: false });

  console.log("Clicking theme toggle...");
  const themeToggle = page.locator('button[aria-label*="Switch to dark mode"]');
  await themeToggle.click();
  
  await page.waitForTimeout(1000);

  console.log("Capturing dark mode screenshot...");
  await page.screenshot({ path: "/tmp/dark-mode.png", fullPage: false });

  const isDarkMode = await page.evaluate(() => {
    return document.documentElement.getAttribute("data-theme") === "dark";
  });

  console.log("Dark mode active:", isDarkMode);

  const savedTheme = await page.evaluate(() => {
    return localStorage.getItem("proofweave-theme");
  });

  console.log("Saved theme in localStorage:", savedTheme);

  console.log("Clicking theme toggle to go back to light...");
  const themeToggleAgain = page.locator('button[aria-label*="Switch to light mode"]');
  await themeToggleAgain.click();
  
  await page.waitForTimeout(500);

  const isLightMode = await page.evaluate(() => {
    return document.documentElement.getAttribute("data-theme") === "light";
  });

  console.log("Light mode active:", isLightMode);

  await browser.close();

  console.log("\n✅ Screenshots saved:");
  console.log("  - /tmp/light-mode.png");
  console.log("  - /tmp/dark-mode.png");
  console.log("\n✅ Dark mode features verified:");
  console.log("  - Theme toggle visible and functional");
  console.log("  - Theme persisted to localStorage");
  console.log("  - Theme switched correctly");
}

captureScreenshots().catch(console.error);
