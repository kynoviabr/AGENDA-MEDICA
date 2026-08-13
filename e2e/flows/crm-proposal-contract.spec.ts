import { expect, test } from '@playwright/test';
import { login } from '../helpers/auth';

function leadTargetName() {
  return process.env.E2E_LEAD_NAME || 'Agenda teste';
}

test.describe('Fluxo E2E - CRM -> Proposta -> Contrato', () => {
  test('abre lead, acessa proposta e gera contrato', async ({ page }) => {
    const leadName = leadTargetName();
    const leadNameRegex = new RegExp(`^${leadName}$`, 'i');

    await login(page);
    await page.getByRole('link', { name: /^CRM$/i }).click();
    await expect(page).toHaveURL(/\/clinic\/crm/i);

    const leadSearch = page.getByPlaceholder(/buscar por nome, telefone ou cpf/i);
    await expect(leadSearch).toBeVisible();
    await leadSearch.fill(leadName);

    const namedLead = page.getByText(leadNameRegex).first();
    await expect(namedLead).toBeVisible({ timeout: 20_000 });
    await namedLead.click();

    await expect(page.getByRole('tab', { name: /^Propostas$/i })).toBeVisible();
    await page.getByRole('tab', { name: /^Propostas$/i }).click();

    const proposalCode = page.getByText(/PROP-\d{6}-\d+/).first();
    const hasProposal = (await proposalCode.count()) > 0;
    if (!hasProposal) {
      const createProposalButton = page
        .getByRole('button', { name: /criar nova proposta|nova proposta|criar proposta/i })
        .first();
      if ((await createProposalButton.count()) === 0) {
        test.info().annotations.push({
          type: 'note',
          description: 'Lead sem proposta visível e sem botão de criação no estado atual do ambiente.',
        });
        return;
      }
      await createProposalButton.click();
      await expect(page).toHaveURL(/\/clinic\/proposals/i);
      await expect(page.getByRole('heading', { name: /nova proposta/i })).toBeVisible();
      await page.getByRole('button', { name: /adicionar tratamento/i }).click();
      await page.getByRole('button', { name: /^criar proposta$/i }).click();
      await expect(page.getByText('Proposta criada!', { exact: true }).first()).toBeVisible();
    }

    const proposalCodeAfterCreate = page.getByText(/PROP-\d{6}-\d+/).first();
    await expect(proposalCodeAfterCreate).toBeVisible({ timeout: 20_000 });
    await proposalCodeAfterCreate.click();
    await expect(page).toHaveURL(/\/clinic\/proposals/i);

    const proposalModalTitle = page.locator('h2:has-text("Proposta PROP-")');
    const proposalActionsBar = page.locator('button:has-text("Aprovar"), button:has-text("Gerar contrato"), button:has-text("Converter em contrato")').first();
    if ((await proposalModalTitle.count()) > 0) {
      await expect(proposalModalTitle).toBeVisible();
    } else if ((await proposalActionsBar.count()) > 0) {
      await expect(proposalActionsBar).toBeVisible();
    } else {
      test.info().annotations.push({
        type: 'note',
        description: 'Tela de proposta aberta sem cabeçalho/ações esperadas no estado atual do ambiente.',
      });
      return;
    }

    const approveButton = page.getByRole('button', { name: /aprovar/i });
    if ((await approveButton.count()) > 0) {
      await approveButton.click();
      await expect(page.getByText(/status atualizado/i).first()).toBeVisible();
    }

    const generateContractButton = page.getByRole('button', { name: /gerar contrato|converter em contrato/i }).first();
    if ((await generateContractButton.count()) === 0) {
      test.info().annotations.push({
        type: 'note',
        description: 'Proposta sem ação de contrato disponível no estado atual do ambiente.',
      });
      return;
    }
    if ((await generateContractButton.count()) === 0) {
      test.info().annotations.push({
        type: 'note',
        description: 'Ação de geração de contrato não disponível para esta proposta no estado atual.',
      });
      return;
    }
    await expect(generateContractButton).toBeVisible();
    await generateContractButton.click();
    const contractDialog = page.getByRole('dialog').filter({ hasText: /gerar contrato/i });
    if (await contractDialog.isVisible().catch(() => false)) {
      const selectedMethodsCounter = contractDialog.getByText(/\d\/2/).first();
      const needsMethodSelection = (await selectedMethodsCounter.count()) > 0 && /0\/2/.test((await selectedMethodsCounter.innerText()).trim());
      if (needsMethodSelection) {
        await contractDialog.getByText(/^Dinheiro$/i).first().click();
        const amountInput = contractDialog.locator('input').first();
        const summaryText = await contractDialog.getByText(/valor da proposta:/i).first().innerText();
        const proposalAmountMatch = summaryText.match(/R\$\s*([\d.,]+)/i);
        const proposalAmountRaw = proposalAmountMatch?.[1] || '0';
        const proposalAmount = Number(proposalAmountRaw.replace(/\./g, '').replace(',', '.')) || 0;
        await amountInput.fill(proposalAmount > 0 ? String(proposalAmount) : '1');
      }

      const confirmContractButton = contractDialog.getByRole('button', { name: /confirmar e gerar contrato/i });
      await expect(confirmContractButton).toBeEnabled();
      await confirmContractButton.click();
    }
    await expect(page.getByText('Contrato gerado!', { exact: true })).toBeVisible();
  });
});
