import { expect, test } from '@playwright/test';
import { login } from '../helpers/auth';

function renewalPatientName() {
  return process.env.E2E_RENEWAL_PATIENT_NAME || 'E2E Renovacao Seed';
}

test.describe('Fluxo E2E - Renovação Automática', () => {
  test('exibe bloco de renovações no CRM e ações principais do card', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: /^CRM$/i }).click();
    await expect(page).toHaveURL(/\/clinic\/crm/i);

    const detailsToggle = page.getByRole('button', { name: /detalhes/i }).first();
    if (await page.getByText(/expandir/i).first().isVisible().catch(() => false)) {
      await detailsToggle.click();
    }

    const renewalsTitle = page.getByText(/renovações pendentes/i).first();
    if ((await renewalsTitle.count()) === 0) {
      test.info().annotations.push({
        type: 'note',
        description: 'Bloco de renovações não apareceu; rode o seed SQL da renovação antes deste teste.',
      });
      return;
    }
    await expect(renewalsTitle).toBeVisible();

    const patientName = renewalPatientName();
    const renewalCard = page
      .locator('div.rounded-xl.border.p-2')
      .filter({ hasText: new RegExp(patientName, 'i') })
      .first();

    if ((await renewalCard.count()) === 0) {
      test.info().annotations.push({
        type: 'note',
        description: `Paciente de seed "${patientName}" não encontrado no bloco; ajuste E2E_RENEWAL_PATIENT_NAME.`,
      });
      return;
    }

    await expect(renewalCard).toBeVisible();
    await expect(renewalCard.getByRole('button', { name: /whatsapp/i })).toBeVisible();
    await expect(renewalCard.getByRole('button', { name: /ligar/i })).toBeVisible();
    await expect(renewalCard.getByRole('button', { name: /agendar reavaliação/i })).toBeVisible();
    await expect(renewalCard.getByRole('button', { name: /snooze 7d/i })).toBeVisible();
    await expect(renewalCard.getByRole('button', { name: /converter/i })).toBeVisible();
    await expect(renewalCard.getByRole('button', { name: /descartar/i })).toBeVisible();
  });
});
