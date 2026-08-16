import { expect, test } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('Smoke - Dashboard da agenda', () => {
  test('exibe indicadores operacionais do produto ativo', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: /^dashboard$/i }).click();
    await expect(page).toHaveURL(/\/clinic(\/dashboard)?(\/|$)/i);

    await expect(page.getByRole('heading', { level: 1, name: /dashboard da agenda/i })).toBeVisible();
    await expect(page.getByText(/pacientes hoje/i)).toBeVisible();
    await expect(page.getByText(/agendados por médico/i)).toBeVisible();
    await expect(page.getByText(/fila de encaixe/i)).toBeVisible();
    await expect(page.getByText(/convênio e particular/i)).toBeVisible();
  });
});
