import { expect, test } from '@playwright/test';
import { login } from '../helpers/auth';

function leadTargetName() {
  return process.env.E2E_LEAD_NAME || 'Agenda teste';
}

test.describe('Fluxo E2E - Kanban', () => {
  test('move lead entre etapas principais pelo card detalhado', async ({ page }) => {
    const leadName = leadTargetName();

    await login(page);
    await page.getByRole('link', { name: /^CRM$/i }).click();
    await expect(page).toHaveURL(/\/clinic\/crm/i);

    const search = page.getByPlaceholder(/buscar por nome, telefone ou cpf/i);
    await expect(search).toBeVisible();
    await search.fill(leadName);

    const leadNameOnBoard = page.getByText(new RegExp(`^${leadName}$`, 'i')).first();
    await expect(leadNameOnBoard).toBeVisible({ timeout: 20_000 });
    await leadNameOnBoard.click();

    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('tab', { name: /^Dados Gerais$/i })).toBeVisible();

    const stageSelect = drawer.locator('button[role="combobox"]').first();
    const stagesToTest = ['Contato Iniciado', 'Agendado', 'Proposta'];

    for (const stageLabel of stagesToTest) {
      await stageSelect.click();
      await page.getByRole('option', { name: new RegExp(`^${stageLabel}$`, 'i') }).click();
      await expect(drawer.getByText(new RegExp(stageLabel, 'i')).first()).toBeVisible();
    }
  });
});
