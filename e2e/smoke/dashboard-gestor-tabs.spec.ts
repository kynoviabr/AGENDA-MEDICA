import { expect, test } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('Smoke - Dashboard Gestor', () => {
  test('exibe abas macro e alterna entre áreas', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: /^dashboard$/i }).click();
    await expect(page).toHaveURL(/\/clinic(\/dashboard)?(\/|$)/i);

    await expect(page.getByRole('tab', { name: /visão executiva/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /comercial/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /financeiro/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /operação/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /pessoas/i })).toBeVisible();

    await expect(page.getByText(/saúde executiva/i)).toBeVisible();

    await page.getByRole('tab', { name: /comercial/i }).click();
    await expect(page.getByText(/performance comercial/i)).toBeVisible();

    await page.getByRole('tab', { name: /operação/i }).click();
    await expect(page.getByText(/agenda de hoje/i)).toBeVisible();
  });
});
