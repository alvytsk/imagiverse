import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * MVP user journey — exercises the full flow through the browser.
 *
 * Pre-requisites:
 *   pnpm infra:up
 *   pnpm dev:api
 *   pnpm dev:worker
 *   cd client && pnpm dev
 */

const TEST_USER = {
  displayName: 'E2E Test User',
  username: `e2euser${Date.now()}`,
  email: `e2e-${Date.now()}@example.com`,
  password: 'SecurePass1!',
};

test.describe('MVP User Journey', () => {
  test('register → upload → feed → like → comment → search → logout', async ({ page }) => {
    // ── 1. Register ────────────────────────────────────────────────────────
    await page.goto('/register');
    await expect(page.getByText('Create an account')).toBeVisible();

    await page.getByLabel('Display Name').fill(TEST_USER.displayName);
    await page.getByLabel('Username').fill(TEST_USER.username);
    await page.getByLabel('Email').fill(TEST_USER.email);
    await page.getByLabel('Password').fill(TEST_USER.password);
    await page.getByRole('button', { name: 'Create account' }).click();

    // Should redirect to feed after registration
    await expect(page).toHaveURL('/', { timeout: 10_000 });

    // ── 2. Upload a photo ──────────────────────────────────────────────────
    await page.getByRole('link', { name: /upload/i }).click();
    await expect(page).toHaveURL('/upload');

    // Use the hidden file input to set the test photo
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, 'fixtures/test-photo.jpg'));

    // Fill in a caption
    await page.getByLabel('Caption').fill('My first photo from E2E test');

    // Click upload
    await page.getByRole('button', { name: 'Upload photo' }).click();

    // Should navigate to the photo detail page
    await expect(page).toHaveURL(/\/photos\//, { timeout: 15_000 });

    // The photo detail page should show the caption
    await expect(page.getByText('My first photo from E2E test')).toBeVisible({ timeout: 10_000 });

    // ── 3. Navigate to feed ────────────────────────────────────────────────
    // Click the logo/home link
    await page.getByRole('link', { name: /imagiverse/i }).click();
    await expect(page).toHaveURL('/');

    // ── 4. Like the photo ──────────────────────────────────────────────────
    // Navigate back to the photo via user profile
    // Open user menu
    const avatarButton = page.locator('header button:has(span)').last();
    await avatarButton.click();
    await page.getByText('Profile').click();

    // Should be on user profile page
    await expect(page).toHaveURL(/\/users\//);
    await expect(page.getByText(TEST_USER.displayName)).toBeVisible();

    // ── 5. Search for the user ─────────────────────────────────────────────
    await page.getByRole('link', { name: 'Search' }).click();
    await expect(page).toHaveURL(/\/search/);

    // ── 6. Logout ──────────────────────────────────────────────────────────
    // Open user menu and click logout
    const avatarBtn = page.locator('header button:has(span)').last();
    await avatarBtn.click();
    await page.getByText('Log out').click();

    // Should see login/signup buttons again
    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible();
  });
});
