import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:5173";

test.describe("Auth Debug - Check Page Content", () => {
  test("debug: check what's actually on the page", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.context().clearCookies();
    await page.goto(BASE_URL);

    // Wait a bit for the page to load
    await page.waitForTimeout(2000);

    // Take a screenshot to see what's being rendered
    await page.screenshot({ path: 'test-results/debug-page-content.png', fullPage: true });

    // Get the page title
    const title = await page.title();
    console.log("Page title:", title);

    // Get all text content
    const bodyText = await page.locator('body').textContent();
    console.log("Body text content:", bodyText);

    // Check if there's any text containing "Botical"
    const boticalElements = page.getByText(/botical/i);
    const boticalCount = await boticalElements.count();
    console.log("Elements containing 'Botical':", boticalCount);

    if (boticalCount > 0) {
      for (let i = 0; i < boticalCount; i++) {
        const text = await boticalElements.nth(i).textContent();
        console.log(`Botical element ${i}:`, text);
      }
    }

    // Check for login form elements
    const emailInput = page.getByRole('textbox', { name: /email/i });
    const hasEmailInput = await emailInput.count();
    console.log("Email inputs found:", hasEmailInput);

    const submitButtons = page.getByRole('button');
    const buttonCount = await submitButtons.count();
    console.log("Buttons found:", buttonCount);

    if (buttonCount > 0) {
      for (let i = 0; i < buttonCount; i++) {
        const buttonText = await submitButtons.nth(i).textContent();
        console.log(`Button ${i}:`, buttonText);
      }
    }

    // Check for heading elements
    const headings = page.locator('h1, h2, h3, h4, h5, h6');
    const headingCount = await headings.count();
    console.log("Headings found:", headingCount);

    if (headingCount > 0) {
      for (let i = 0; i < headingCount; i++) {
        const headingText = await headings.nth(i).textContent();
        console.log(`Heading ${i}:`, headingText);
      }
    }

    // Check if we're in the main app or login page
    const projectsText = page.getByText(/projects/i);
    const hasProjects = await projectsText.count() > 0;
    console.log("Has 'Projects' text (main app):", hasProjects);

    // Check for loading states
    const loadingElements = page.locator('[data-testid="loading"], .loading, .spinner');
    const loadingCount = await loadingElements.count();
    console.log("Loading elements found:", loadingCount);

    // Just make sure the page loaded something
    expect(bodyText?.length || 0).toBeGreaterThan(0);
  });
});