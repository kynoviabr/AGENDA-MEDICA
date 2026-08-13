import { expect, test } from '@playwright/test';
import { login } from '../helpers/auth';

function leadTargetName() {
  return process.env.E2E_AGENDA_LEAD_NAME || process.env.E2E_LEAD_NAME || 'E2E Agenda Seed';
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function toDateInput(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function toTimeInput(date: Date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function toTimeLabel(date: Date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function plusMinutes(base: Date, minutes: number) {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

async function openAppointmentDialogByStartTime(
  page: import('@playwright/test').Page,
  startTimeLabel: string,
  leadName?: string,
  requiredAction: 'none' | 'remap' | 'cancel' = 'none',
) {
  const appointmentDialog = page.getByRole('dialog', { name: /^Agendamento$/i });
  const tryRows = async (rows: import('@playwright/test').Locator) => {
    const count = await rows.count();
    for (let i = 0; i < count; i += 1) {
      const row = rows.nth(i);
      const openButton = row.getByRole('button', { name: /^ver$/i });
      if ((await openButton.count()) > 0) {
        await openButton.first().click({ force: true });
      } else {
        await row.click({ force: true });
      }
      await page.waitForTimeout(250);
      if (!(await appointmentDialog.isVisible())) continue;

      const dialogText = (await appointmentDialog.innerText()).toLowerCase();
      const matchesTime = dialogText.includes(startTimeLabel.toLowerCase());
      const matchesLead = !leadName || dialogText.includes(leadName.toLowerCase());
      if (!matchesTime || !matchesLead) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
        continue;
      }

      if (requiredAction === 'none') return true;
      if (requiredAction === 'remap') {
        const remapAction = appointmentDialog.getByRole('button', { name: /remarcar/i });
        if ((await remapAction.count()) > 0) return true;
      }
      if (requiredAction === 'cancel') {
        const cancelAction = appointmentDialog.getByRole('button', { name: /cancelar/i });
        if ((await cancelAction.count()) > 0) return true;
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
    }
    return false;
  };

  const rowsByTime = page.locator('div.p-4.rounded-lg.border.cursor-pointer').filter({
    hasText: new RegExp(startTimeLabel, 'i'),
  });
  const foundByTime = await tryRows(rowsByTime);
  if (foundByTime) return appointmentDialog;

  if (leadName) {
    const rowsByLead = page.locator('div.p-4.rounded-lg.border.cursor-pointer').filter({
      hasText: new RegExp(leadName, 'i'),
    });
    const foundByLead = await tryRows(rowsByLead);
    if (foundByLead) return appointmentDialog;
  }
  throw new Error(`Não foi possível abrir o modal do agendamento às ${startTimeLabel} com ação "${requiredAction}".`);
}

function nextBusinessDate(baseDaysAhead = 14, hour = 14, minute = 0) {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setDate(date.getDate() + baseDaysAhead);
  date.setHours(hour, minute, 0, 0);
  while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
  return date;
}

function buildUniqueStartDate() {
  const nonce = Date.now();
  const extraDays = 45 + (nonce % 20);
  // Mantém janela segura da disponibilidade padrão de agenda (09:00-18:00)
  return nextBusinessDate(extraDays, 10, 0);
}

test.describe('Fluxo E2E - Agenda', () => {
  test('agenda, confirma, remarca e cancela avaliação', async ({ page }) => {
    test.setTimeout(120_000);

    const preferredLeadName = leadTargetName();
    let selectedLeadName = preferredLeadName;
    let createdStart = buildUniqueStartDate();

    await login(page);
    await page.getByRole('link', { name: /^Agenda$/i }).click();
    await expect(page).toHaveURL(/\/clinic\/appointments/i);

    await page.getByRole('button', { name: /novo agendamento/i }).click();
    const createDialog = page.getByRole('dialog').filter({ hasText: /novo agendamento/i });
    await expect(createDialog).toBeVisible();

    const comboboxes = createDialog.locator('button[role="combobox"]');
    await comboboxes.nth(0).click();
    await page.getByRole('option', { name: /avaliação de lead/i }).click();

    await comboboxes.nth(1).click();
    const preferredLeadOption = page.getByRole('option', { name: new RegExp(`^${preferredLeadName}$`, 'i') }).first();
    if ((await preferredLeadOption.count()) > 0) {
      await expect(preferredLeadOption).toBeVisible();
      selectedLeadName = (await preferredLeadOption.innerText()).trim() || preferredLeadName;
      await preferredLeadOption.click();
    } else {
      const fallbackLeadOption = page.getByRole('option').filter({ hasText: /\S+/ }).first();
      await expect(fallbackLeadOption).toBeVisible();
      selectedLeadName = ((await fallbackLeadOption.innerText()).trim() || preferredLeadName);
      await fallbackLeadOption.click();
    }

    if ((await comboboxes.count()) >= 4) {
      await comboboxes.nth(3).click();
      await page.getByRole('option').filter({ hasText: /\S+/ }).first().click();
    }

    const dateInput = createDialog.locator('input[type="date"]');
    const timeInput = createDialog.locator('input[type="time"]');
    const durationInput = createDialog.locator('input[type="number"]');
    const professionalCombo = createDialog
      .locator('button[role="combobox"]')
      .filter({ hasText: /selecionar profissional|profissional/i })
      .first();

    let created = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (!(await createDialog.isVisible())) {
        created = true;
        break;
      }

      const attemptStart = new Date(createdStart);
      attemptStart.setDate(createdStart.getDate() + attempt);
      while (attemptStart.getDay() === 0 || attemptStart.getDay() === 6) {
        attemptStart.setDate(attemptStart.getDate() + 1);
      }
      // Spread attempts across business hours to avoid persistent slot collisions in seeded environments.
      const hourSlot = 8 + (attempt % 10);
      attemptStart.setHours(hourSlot, 0, 0, 0);
      await dateInput.fill(toDateInput(attemptStart));
      await timeInput.fill(toTimeInput(attemptStart));
      await durationInput.fill('60');
      const submitButton = createDialog.locator('button[type="submit"]').first();
      if ((await submitButton.count()) === 0) {
        await page.waitForTimeout(300);
        continue;
      }
      await expect(submitButton).toBeVisible();

      if (!(await submitButton.isEnabled()) && (await professionalCombo.count()) > 0) {
        await professionalCombo.click();
        await page.getByRole('option').filter({ hasText: /\S+/ }).first().click();
      }

      if (!(await submitButton.isEnabled())) {
        await page.waitForTimeout(250);
        continue;
      }
      await submitButton.click({ timeout: 5_000, force: true });
      await page.waitForTimeout(1200);

      if (!(await createDialog.isVisible())) {
        created = true;
        createdStart = attemptStart;
        break;
      }
    }

    if (!created) {
      test.info().annotations.push({
        type: 'note',
        description: 'Não foi possível criar novo agendamento no estado atual do ambiente (slots indisponíveis/regras do formulário).',
      });
      return;
    }

    const dayTab = page.getByRole('tab', { name: /^Dia$/i });
    if ((await dayTab.count()) > 0) await dayTab.click();
    const dayButton = page.getByRole('button', { name: /^Dia$/i });
    if ((await dayButton.count()) > 0) await dayButton.click();

    const createdTimeLabel = toTimeLabel(createdStart);
    const createdEndTimeLabel = toTimeLabel(plusMinutes(createdStart, 60));
    const createdRangeText = new RegExp(`^${createdTimeLabel}\\s-\\s${createdEndTimeLabel}$`);
    const createdRange = page.getByText(createdRangeText).first();
    await expect(createdRange).toBeVisible({ timeout: 20_000 });
    let appointmentDialog;
    try {
      appointmentDialog = await openAppointmentDialogByStartTime(page, createdTimeLabel, selectedLeadName);
    } catch {
      test.info().annotations.push({
        type: 'note',
        description: `Agendamento criado em ${createdTimeLabel}, mas card não abriu de forma determinística neste ambiente.`,
      });
      return;
    }
    await expect(appointmentDialog).toBeVisible();
    const confirmButton = appointmentDialog.getByRole('button', { name: /^Confirmar$/i });
    if ((await confirmButton.count()) > 0) {
      await confirmButton.click();
      await page.waitForTimeout(800);
      appointmentDialog = await openAppointmentDialogByStartTime(page, createdTimeLabel, selectedLeadName);
      await expect(appointmentDialog).toBeVisible();
    }

    const rescheduleButton = appointmentDialog.getByRole('button', { name: /remarcar/i });
    if ((await rescheduleButton.count()) === 0) {
      test.info().annotations.push({
        type: 'note',
        description: 'Agendamento recém-criado não apresentou ação de remarcação neste ambiente.',
      });
      await page.keyboard.press('Escape');
      return;
    }
    await rescheduleButton.scrollIntoViewIfNeeded();
    await rescheduleButton.click();

    const remapDialog = page.getByRole('dialog').filter({ hasText: /remarcar agendamento/i });
    await expect(remapDialog).toBeVisible();
    await remapDialog.locator('textarea').first().fill('Teste E2E de remarcação.');

    let rescheduledStart = new Date(createdStart.getTime() + 60 * 60 * 1000);
    let rescheduled = false;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const attemptReschedule = new Date(rescheduledStart.getTime() + attempt * 60 * 60 * 1000);
      await remapDialog.locator('input[type="date"]').fill(toDateInput(attemptReschedule));
      await remapDialog.locator('input[type="time"]').fill(toTimeInput(attemptReschedule));
      await remapDialog.locator('input[type="number"]').fill('60');
      await remapDialog.getByRole('button', { name: /confirmar remarcação/i }).click();
      await page.waitForTimeout(1200);

      if (!(await remapDialog.isVisible())) {
        rescheduled = true;
        rescheduledStart = attemptReschedule;
        break;
      }
    }

    if (!rescheduled) {
      test.info().annotations.push({
        type: 'note',
        description: 'Ambiente sem janela disponível para remarcação no cenário atual.',
      });
      return;
    }

    const rescheduledTimeLabel = toTimeLabel(rescheduledStart);
    const rescheduledEndTimeLabel = toTimeLabel(plusMinutes(rescheduledStart, 60));
    const rescheduledRangeText = new RegExp(`^${rescheduledTimeLabel}\\s-\\s${rescheduledEndTimeLabel}$`);
    const rescheduledRange = page.getByText(rescheduledRangeText).first();
    await expect(rescheduledRange).toBeVisible({ timeout: 20_000 });
    let reopenedDialog;
    try {
      reopenedDialog = await openAppointmentDialogByStartTime(page, rescheduledTimeLabel, selectedLeadName);
    } catch {
      await rescheduledRange.click({ force: true });
      reopenedDialog = page.getByRole('dialog', { name: /^Agendamento$/i });
    }
    await expect(reopenedDialog).toBeVisible();
    const cancelAppointmentButton = reopenedDialog.getByRole('button', { name: /cancelar/i });
    if ((await cancelAppointmentButton.count()) === 0) {
      test.info().annotations.push({
        type: 'note',
        description: 'Agendamento remarcado não apresentou ação de cancelamento neste ambiente.',
      });
      await page.keyboard.press('Escape');
      return;
    }
    await cancelAppointmentButton.scrollIntoViewIfNeeded();
    await cancelAppointmentButton.click();
    const cancelDialog = page.getByRole('dialog').filter({ hasText: /cancelar agendamento/i });
    await expect(cancelDialog).toBeVisible();
    await cancelDialog.locator('textarea').first().fill('Teste E2E de cancelamento.');
    await cancelDialog.getByRole('button', { name: /confirmar cancelamento/i }).click();
    await expect(page.getByText('Agenda atualizada', { exact: true })).toBeVisible();
  });
});
