import { expect, test } from '@playwright/test';
import { login } from '../helpers/auth';

const moduleChecks = [
  { menu: 'Dashboard', url: /\/clinic(\/dashboard)?(\/|$)/i, heading: /dashboard/i },
  { menu: 'Agenda', url: /\/clinic\/appointments/i, heading: /agenda/i },
  { menu: 'CRM', url: /\/clinic\/crm/i, heading: /micro crm/i },
  { menu: 'WhatsApp IA', url: /\/clinic\/whatsapp-ai/i, heading: /whatsapp ia/i },
  { menu: 'Pacientes', url: /\/clinic\/patients/i, heading: /pacientes/i },
  { menu: 'Tratamentos', url: /\/clinic\/treatments/i, heading: /serviços/i },
];

test.describe('Smoke - módulos principais', () => {
  test('abre os módulos principais pela sidebar', async ({ page }) => {
    await login(page);

    for (const moduleCheck of moduleChecks) {
      await test.step(`Acessa ${moduleCheck.menu}`, async () => {
        await page.getByRole('link', { name: new RegExp(`^${moduleCheck.menu}$`, 'i') }).click();
        await expect(page).toHaveURL(moduleCheck.url);
        await expect(page.locator('main').getByRole('heading', { level: 1 }).first()).toContainText(moduleCheck.heading);
      });
    }
  });
});
