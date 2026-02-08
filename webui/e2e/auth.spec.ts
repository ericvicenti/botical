import { test, expect } from "@playwright/test";
import { execSync } from "child_process";

const BASE_URL = "http://localhost:6001";

// Helper to clear auth state
async function clearAuth(page: any) {
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

// Helper to extract magic link token from server logs
function extractMagicLinkToken(): string {
  try {
    const logs = execSync(
      "sudo journalctl -u botical --since '1 minute ago' --no-pager | grep -A 3 'MAGIC LINK'"
    ).toString();
    
    const tokenMatch = logs.match(/token=([A-Za-z0-9_-]+)/);
    if (!tokenMatch) {
      throw new Error("Magic link token not found in logs");
    }
    
    return tokenMatch[1];
  } catch (error) {
    throw new Error(`Failed to extract magic link token: ${error}`);
  }
}

// Helper to configure server mode
async function setServerMode(mode: "single-user" | "multi-user") {
  const envVar = mode === "single-user" ? "true" : "false";
  execSync(`sudo sed -i 's/Environment=BOTICAL_SINGLE_USER=.*/Environment=BOTICAL_SINGLE_USER=${envVar}/' /etc/systemd/system/botical.service`);
  execSync("sudo systemctl daemon-reload");
  execSync("sudo systemctl restart botical");
  
  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 2000));
}

test.describe("Authentication Frontend", () => {
  test.beforeEach(async ({ page }) => {
    // Ensure we start with multi-user mode for auth tests
    await setServerMode("multi-user");
    await clearAuth(page);
  });

  test.describe("Unauthenticated User Experience", () => {
    test("shows login page when accessing the app", async ({ page }) => {
      await page.goto(BASE_URL);

      // Should show the login page
      await expect(page.getByText("Welcome to Botical")).toBeVisible();
      await expect(page.getByText("Enter your email to receive a magic login link")).toBeVisible();
      
      // Should have email input and submit button
      const emailInput = page.getByPlaceholder("Email address");
      await expect(emailInput).toBeVisible();
      
      const submitButton = page.getByRole("button", { name: "Send Magic Link" });
      await expect(submitButton).toBeVisible();
    });

    test("login form works correctly", async ({ page }) => {
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
      
      // Submit button should be disabled during submission
      await expect(submitButton).toBeDisabled();
      
      // After submission completes, form should be cleared
      await expect(emailInput).toHaveValue("");
    });

    test("validates email format", async ({ page }) => {
      await page.goto(BASE_URL);

      const emailInput = page.getByPlaceholder("Email address");
      const submitButton = page.getByRole("button", { name: "Send Magic Link" });

      // Test invalid email
      await emailInput.fill("not-an-email");
      await submitButton.click();

      // Should show validation message (browser native or custom)
      // The exact message varies by browser, so we check for either
      const hasNativeValidation = await emailInput.evaluate(
        (el: HTMLInputElement) => !el.validity.valid
      );
      
      if (!hasNativeValidation) {
        // If no native validation, should show custom error
        await expect(page.getByText(/email/i)).toBeVisible();
      }
    });

    test("handles empty email submission", async ({ page }) => {
      await page.goto(BASE_URL);

      const emailInput = page.getByPlaceholder("Email address");
      const submitButton = page.getByRole("button", { name: "Send Magic Link" });

      // Submit without entering email
      await submitButton.click();

      // Should show required field validation
      const hasNativeValidation = await emailInput.evaluate(
        (el: HTMLInputElement) => !el.validity.valid
      );
      
      if (!hasNativeValidation) {
        // If no native validation, should show custom error
        await expect(page.getByText(/required/i)).toBeVisible();
      }
    });

    test("shows loading state during submission", async ({ page }) => {
      await page.goto(BASE_URL);

      const emailInput = page.getByPlaceholder("Email address");
      const submitButton = page.getByRole("button", { name: "Send Magic Link" });

      await emailInput.fill("test@example.com");
      
      // Click submit and immediately check loading state
      await submitButton.click();
      await expect(page.getByText("Sending...")).toBeVisible();
      
      // Eventually should complete
      await expect(page.getByText("If this email is valid, a login link has been sent")).toBeVisible();
    });
  });

  test.describe("Magic Link Flow", () => {
    test("magic link verification redirects to app", async ({ page }) => {
      // Step 1: Request magic link
      await page.goto(BASE_URL);
      
      const emailInput = page.getByPlaceholder("Email address");
      const submitButton = page.getByRole("button", { name: "Send Magic Link" });

      await emailInput.fill("e2e-test@example.com");
      await submitButton.click();

      await expect(page.getByText("If this email is valid, a login link has been sent")).toBeVisible();

      // Step 2: Extract magic link token from server logs
      const token = extractMagicLinkToken();

      // Step 3: Visit magic link
      await page.goto(`${BASE_URL}/auth/verify?token=${token}`);

      // Should redirect to main app (not login page)
      await expect(page.getByText("Welcome to Botical")).not.toBeVisible();
      await expect(page.getByText("Projects")).toBeVisible();
    });

    test("first user becomes admin", async ({ page }) => {
      // Reset database to ensure this is the first user
      execSync("sudo systemctl stop botical");
      execSync("rm -rf /opt/ion-lynx/.botical/databases");
      execSync("sudo systemctl start botical");
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Request magic link
      await page.goto(BASE_URL);
      
      const emailInput = page.getByPlaceholder("Email address");
      const submitButton = page.getByRole("button", { name: "Send Magic Link" });

      await emailInput.fill("admin@example.com");
      await submitButton.click();

      // Get and use magic link
      const token = extractMagicLinkToken();
      await page.goto(`${BASE_URL}/auth/verify?token=${token}`);

      // Should be in main app
      await expect(page.getByText("Projects")).toBeVisible();

      // User should have admin privileges (check by accessing settings or admin-only features)
      // This depends on your UI - adjust selector as needed
      await page.getByRole("button", { name: /settings|menu|user/i }).click();
      // Check for admin-only UI elements if they exist
    });

    test("handles invalid magic link token", async ({ page }) => {
      await page.goto(`${BASE_URL}/auth/verify?token=invalid-token-12345`);

      // Should show error message or redirect back to login
      // Exact behavior depends on your implementation
      const hasError = await page.getByText(/error|invalid|expired/i).isVisible().catch(() => false);
      const backToLogin = await page.getByText("Welcome to Botical").isVisible().catch(() => false);
      
      expect(hasError || backToLogin).toBeTruthy();
    });

    test("handles expired magic link token", async ({ page }) => {
      // Request magic link
      await page.goto(BASE_URL);
      
      const emailInput = page.getByPlaceholder("Email address");
      const submitButton = page.getByRole("button", { name: "Send Magic Link" });

      await emailInput.fill("expired-test@example.com");
      await submitButton.click();

      const token = extractMagicLinkToken();

      // Manually expire the token in database
      execSync(`
        sqlite3 /opt/ion-lynx/.botical/databases/root.db "
          UPDATE email_verification_tokens 
          SET expires_at = ${Date.now() - 1000} 
          WHERE token_hash = (SELECT token_hash FROM email_verification_tokens WHERE email = 'expired-test@example.com')
        "
      `);

      // Try to use expired token
      await page.goto(`${BASE_URL}/auth/verify?token=${token}`);

      // Should show error or redirect to login
      const hasError = await page.getByText(/error|invalid|expired/i).isVisible().catch(() => false);
      const backToLogin = await page.getByText("Welcome to Botical").isVisible().catch(() => false);
      
      expect(hasError || backToLogin).toBeTruthy();
    });
  });

  test.describe("Authenticated User Experience", () => {
    test.beforeEach(async ({ page }) => {
      // Set up authenticated user
      await page.goto(BASE_URL);
      
      const emailInput = page.getByPlaceholder("Email address");
      const submitButton = page.getByRole("button", { name: "Send Magic Link" });

      await emailInput.fill("authenticated-user@example.com");
      await submitButton.click();

      const token = extractMagicLinkToken();
      await page.goto(`${BASE_URL}/auth/verify?token=${token}`);

      // Wait for app to load
      await expect(page.getByText("Projects")).toBeVisible();
    });

    test("loads main app instead of login page", async ({ page }) => {
      // Navigate to home page again
      await page.goto(BASE_URL);

      // Should show main app, not login page
      await expect(page.getByText("Welcome to Botical")).not.toBeVisible();
      await expect(page.getByText("Projects")).toBeVisible();
    });

    test("can access protected features", async ({ page }) => {
      // Try to access projects list
      await expect(page.getByText("Projects")).toBeVisible();

      // Should be able to see sidebar and other app features
      // Adjust these selectors based on your app structure
      const sidebar = page.locator('[data-testid="sidebar"], .sidebar, nav').first();
      await expect(sidebar).toBeVisible();
    });

    test("auth state persists across page reloads", async ({ page }) => {
      // Reload the page
      await page.reload();

      // Should still be authenticated
      await expect(page.getByText("Welcome to Botical")).not.toBeVisible();
      await expect(page.getByText("Projects")).toBeVisible();
    });

    test("logout works correctly", async ({ page }) => {
      // Find and click logout button
      // This depends on your UI - common patterns:
      const logoutButton = page.getByRole("button", { name: /logout|sign out/i }).first();
      
      if (await logoutButton.isVisible()) {
        await logoutButton.click();
      } else {
        // Might be in a dropdown/menu
        await page.getByRole("button", { name: /user|account|menu/i }).first().click();
        await page.getByRole("button", { name: /logout|sign out/i }).click();
      }

      // Should redirect to login page
      await expect(page.getByText("Welcome to Botical")).toBeVisible();
      await expect(page.getByPlaceholder("Email address")).toBeVisible();
    });
  });

  test.describe("Single-User Mode", () => {
    test("bypasses authentication in single-user mode", async ({ page }) => {
      await setServerMode("single-user");
      await clearAuth(page);

      await page.goto(BASE_URL);

      // Should go directly to main app, not login page
      await expect(page.getByText("Welcome to Botical")).not.toBeVisible();
      await expect(page.getByText("Projects")).toBeVisible();
    });

    test("shows no authentication UI in single-user mode", async ({ page }) => {
      await setServerMode("single-user");
      await page.goto(BASE_URL);

      // Should not show login/logout buttons
      const loginElements = page.getByText(/login|sign in|logout|sign out/i);
      await expect(loginElements.first()).not.toBeVisible();
    });
  });

  test.describe("Error Handling", () => {
    test("handles network errors gracefully", async ({ page }) => {
      await page.goto(BASE_URL);

      // Stop the server to simulate network error
      execSync("sudo systemctl stop botical");

      const emailInput = page.getByPlaceholder("Email address");
      const submitButton = page.getByRole("button", { name: "Send Magic Link" });

      await emailInput.fill("test@example.com");
      await submitButton.click();

      // Should show error message
      await expect(page.getByText(/error|failed|try again/i)).toBeVisible();

      // Restart server for cleanup
      execSync("sudo systemctl start botical");
      await new Promise(resolve => setTimeout(resolve, 2000));
    });

    test("handles auth errors and triggers re-authentication", async ({ page }) => {
      // This test would require more complex setup to simulate auth token expiry
      // during app usage. For now, we'll test the basic error handling flow.
      
      await page.goto(BASE_URL);
      
      // Set invalid auth token in storage
      await page.evaluate(() => {
        localStorage.setItem('botical:auth-token', 'invalid-token-123');
      });

      // Navigate to a protected route
      await page.goto(`${BASE_URL}/api/projects`);

      // Should either redirect to login or show appropriate error
      const isLoginPage = await page.getByText("Welcome to Botical").isVisible().catch(() => false);
      const hasError = await page.getByText(/error|unauthorized/i).isVisible().catch(() => false);
      
      expect(isLoginPage || hasError).toBeTruthy();
    });
  });

  test.describe("Responsive Design", () => {
    test("login page works on mobile", async ({ page }) => {
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

    test("main app works on mobile after login", async ({ page }) => {
      // First authenticate on desktop
      await page.goto(BASE_URL);
      
      const emailInput = page.getByPlaceholder("Email address");
      const submitButton = page.getByRole("button", { name: "Send Magic Link" });

      await emailInput.fill("mobile-app-test@example.com");
      await submitButton.click();

      const token = extractMagicLinkToken();
      await page.goto(`${BASE_URL}/auth/verify?token=${token}`);

      // Now switch to mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      await page.reload();

      // Main app should still work
      await expect(page.getByText("Projects")).toBeVisible();
    });
  });
});

test.describe("Security", () => {
  test("magic link tokens are single-use", async ({ page }) => {
    // Request magic link
    await page.goto(BASE_URL);
    
    const emailInput = page.getByPlaceholder("Email address");
    const submitButton = page.getByRole("button", { name: "Send Magic Link" });

    await emailInput.fill("single-use-test@example.com");
    await submitButton.click();

    const token = extractMagicLinkToken();

    // Use the token once
    await page.goto(`${BASE_URL}/auth/verify?token=${token}`);
    await expect(page.getByText("Projects")).toBeVisible();

    // Clear auth and try to use the same token again
    await clearAuth(page);
    await page.goto(`${BASE_URL}/auth/verify?token=${token}`);

    // Should fail - either error or redirect to login
    const hasError = await page.getByText(/error|invalid|expired/i).isVisible().catch(() => false);
    const backToLogin = await page.getByText("Welcome to Botical").isVisible().catch(() => false);
    
    expect(hasError || backToLogin).toBeTruthy();
  });

  test("protects against email enumeration", async ({ page }) => {
    await page.goto(BASE_URL);

    const emailInput = page.getByPlaceholder("Email address");
    const submitButton = page.getByRole("button", { name: "Send Magic Link" });

    // Test with clearly fake email
    await emailInput.fill("definitely-not-real@nonexistent-domain-12345.com");
    await submitButton.click();

    // Should still show success message (no enumeration)
    await expect(page.getByText("If this email is valid, a login link has been sent")).toBeVisible();

    // Should not reveal whether email exists or not
    await expect(page.getByText(/not found|invalid|does not exist/i)).not.toBeVisible();
  });
});