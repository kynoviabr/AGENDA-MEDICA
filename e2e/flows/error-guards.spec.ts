import { expect, test } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('Fluxo E2E - Guardrails de erro', () => {
  test('impede criar agendamento sem lead quando tipo é avaliação', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: /^Agenda$/i }).click();
    await expect(page).toHaveURL(/\/clinic\/appointments/i);

    await page.getByRole('button', { name: /novo agendamento/i }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: /novo agendamento/i });
    await expect(dialog).toBeVisible();

    const comboboxes = dialog.locator('button[role="combobox"]');
    await comboboxes.nth(0).click();
    await page.getByRole('option', { name: /avaliação de lead/i }).click();

    const submit = dialog.getByRole('button', { name: /agendar avaliação/i });
    await expect(submit).toBeDisabled();
  });

  test('não conclui criação de lead sem telefone', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: /^CRM$/i }).click();
    await expect(page).toHaveURL(/\/clinic\/crm/i);

    await page.getByRole('button', { name: /novo lead/i }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: /novo lead/i });
    await expect(dialog).toBeVisible();

    const nameInput = dialog.locator('input').nth(0);
    const phoneInput = dialog.locator('input').nth(1);
    await nameInput.fill('Lead E2E Inválido');
    await phoneInput.fill('');

    const save = dialog.getByRole('button', { name: /salvar lead/i });
    await save.click();

    await expect(dialog).toBeVisible();
    await expect(page.getByText(/lead criado/i)).toHaveCount(0);
  });
});
