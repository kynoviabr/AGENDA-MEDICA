import { expect, type Page } from '@playwright/test';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Configure E2E vars in shell export or create .env.e2e.local based on .env.e2e.example.`,
    );
  }
  return value;
}

export async function login(page: Page) {
  const email = requireEnv('E2E_USER_EMAIL');
  const password = requireEnv('E2E_USER_PASSWORD');

  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // If the session is still valid, app redirects to /clinic directly.
  if (/\/clinic(\/|$)/i.test(page.url())) {
    await expect(page).toHaveURL(/\/clinic(\/|$)/i);
    return;
  }

  await page.getByRole('tab', { name: /entrar/i }).click();
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/^senha$/i).fill(password);
  await page.getByRole('button', { name: /^entrar$/i }).click();

  await expect(page).toHaveURL(/\/clinic(\/|$)/i);
}
