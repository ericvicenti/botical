import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:5173";

test.describe("Authentication Frontend - Basic Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Clear any existing auth state
    await page.goto(BASE_URL);
    await page.context().clearCookies();
  });

  test("shows login page for unauthenticated users", async ({ page }) => {
    await page.goto(BASE_URL);

    // Should show the login page components
    await expect(page.getByText("Welcome to Botical")).toBeVisible();
    await expect(page.getByText("Enter your email to receive a magic login link")).toBeVisible();
    
    // Should have email input and submit button
    const emailInput = page.getByPlaceholder("Email address");
    await expect(emailInput).toBeVisible();
    
    const submitButton = page.getByRole("button", { name: "Send Magic Link" });
    await expect(submitButton).toBeVisible();
  });

  test("email input and form work correctly", async ({ page }) => {
    await page.goto(BASE_URL);

    const emailInput = page.getByPlaceholder("Email address");
    const submitButton = page.getByRole("button", { name: "Send Magic Link" });

    // Test email input
    await emailInput.fill("test@example.com");
    await expect(emailInput).toHaveValue("test@example.com");

    // Test form submission
    await submitButton.click();

    // Should show success message
    await expect(page.getByText("If this email is valid, a login link has been sent")).toBeVisible();
    
    // Email input should be cleared after successful submission
    await expect(emailInput).toHaveValue("");
  });

  test("validates required email field", async ({ page }) => {
    await page.goto(BASE_URL);

    const emailInput = page.getByPlaceholder("Email address");
    const submitButton = page.getByRole("button", { name: "Send Magic Link" });

    // Try to submit without entering email
    await submitButton.click();

    // Should not proceed - either browser validation or custom validation
    // Browser will show native validation, we just check that success message doesn't appear
    await expect(page.getByText("If this email is valid, a login link has been sent")).not.toBeVisible();
  });

  test("shows loading state during submission", async ({ page }) => {
    await page.goto(BASE_URL);

    const emailInput = page.getByPlaceholder("Email address");
    const submitButton = page.getByRole("button", { name: "Send Magic Link" });

    await emailInput.fill("test@example.com");
    
    // Click submit and check for loading state
    await submitButton.click();
    
    // Should show loading text (button text changes)
    await expect(page.getByText("Sending...")).toBeVisible();
    
    // Eventually should complete and show success
    await expect(page.getByText("If this email is valid, a login link has been sent")).toBeVisible();
  });

  test("prevents email enumeration - always shows success", async ({ page }) => {
    await page.goto(BASE_URL);

    const emailInput = page.getByPlaceholder("Email address");
    const submitButton = page.getByRole("button", { name: "Send Magic Link" });

    // Test with clearly fake email
    await emailInput.fill("definitely-not-real@fake-domain-12345.com");
    await submitButton.click();

    // Should still show success message (no enumeration)
    await expect(page.getByText("If this email is valid, a login link has been sent")).toBeVisible();

    // Should not reveal whether email exists or not
    await expect(page.getByText(/not found|invalid|does not exist/i)).not.toBeVisible();
  });

  test("form works on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    await page.goto(BASE_URL);

    // All elements should be visible and usable
    await expect(page.getByText("Welcome to Botical")).toBeVisible();
    
    const emailInput = page.getByPlaceholder("Email address");
    const submitButton = page.getByRole("button", { name: "Send Magic Link" });
    
    await expect(emailInput).toBeVisible();
    await expect(submitButton).toBeVisible();

    // Form should work
    await emailInput.fill("mobile-test@example.com");
    await submitButton.click();
    
    await expect(page.getByText("If this email is valid, a login link has been sent")).toBeVisible();
  });

  test("handles network errors gracefully", async ({ page }) => {
    await page.goto(BASE_URL);

    // Intercept API requests and simulate network error
    await page.route("**/auth/magic-link", route => {
      route.abort("internetdisconnected");
    });

    const emailInput = page.getByPlaceholder("Email address");
    const submitButton = page.getByRole("button", { name: "Send Magic Link" });

    await emailInput.fill("test@example.com");
    await submitButton.click();

    // Should show error message
    await expect(page.getByText(/error|failed|try again/i)).toBeVisible();
  });

  test("can verify basic magic link flow", async ({ page }) => {
    await page.goto(BASE_URL);

    // Submit email to get magic link
    const emailInput = page.getByPlaceholder("Email address");
    const submitButton = page.getByRole("button", { name: "Send Magic Link" });

    await emailInput.fill("e2e-test@example.com");
    await submitButton.click();

    await expect(page.getByText("If this email is valid, a login link has been sent")).toBeVisible();

    // Simulate clicking a magic link by directly visiting the verify endpoint
    // We can't extract the actual token from logs in e2e, so we test the error case
    await page.goto(`${BASE_URL}/auth/verify?token=fake-token-for-testing`);

    // Should either show error message or redirect back to login
    // The exact behavior depends on implementation, but shouldn't crash
    const hasError = await page.getByText(/error|invalid|expired/i).isVisible().catch(() => false);
    const backToLogin = await page.getByText("Welcome to Botical").isVisible().catch(() => false);
    
    expect(hasError || backToLogin).toBeTruthy();
  });
});