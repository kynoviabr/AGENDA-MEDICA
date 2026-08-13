import { expect, test } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('Fluxo E2E - Hub do Paciente', () => {
  test('abre paciente e valida navegação das abas principais', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: /^Pacientes$/i }).click();
    await expect(page).toHaveURL(/\/clinic\/patients/i);

    const firstPatientRow = page.locator('tbody tr').first();
    await expect(firstPatientRow).toBeVisible({ timeout: 20_000 });
    await firstPatientRow.click();

    await expect(page).toHaveURL(/\/clinic\/patients\//i);
    await expect(page.locator('main h1').first()).toBeVisible();

    const tabs = [
      { name: 'Dados', expected: /informações pessoais/i },
      { name: 'Anamnese', expected: /anamnese/i },
      { name: 'Agenda', expected: /agendamentos/i },
      { name: 'Propostas', expected: /propostas do paciente|nenhuma proposta/i },
      { name: 'Contratos', expected: /contratos do paciente|nenhum contrato/i },
      { name: 'Sessões', expected: /sessões realizadas|nenhuma sessão/i },
      { name: 'Evolução', expected: /evolução|nenhuma evolução/i },
      { name: 'Fotos', expected: /fotos|nenhuma foto/i },
      { name: 'Feedback', expected: /feedback|sem feedback/i },
    ];

    for (const tab of tabs) {
      await page.getByRole('tab', { name: new RegExp(`^${tab.name}$`, 'i') }).click();
      await expect(page.getByText(tab.expected).first()).toBeVisible();
    }
  });
});
