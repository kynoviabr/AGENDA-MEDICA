import { supabase } from '@/integrations/supabase/client';
import type { PaymentConfig, PaymentMethod } from '@/components/contracts/ContractPaymentConfigurator';

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Dinheiro',
  pix: 'Pix',
  card: 'Cartão',
  boleto: 'Boleto',
};

export function buildContractPaymentNotes(
  selectedPaymentMethods: PaymentMethod[],
  paymentConfig: PaymentConfig,
  paymentDetails: Partial<Record<PaymentMethod, string>>,
  paymentConditionLabel: string
) {
  const methodsDescription = selectedPaymentMethods
    .map((method) => {
      const label = PAYMENT_METHOD_LABELS[method] || method;
      const amount = Number(paymentConfig[method]?.amount || 0);
      const installments = Number(paymentConfig[method]?.installments || 0);
      const configuredInstallmentAmount = Number(paymentConfig[method]?.installmentAmount || 0);
      const installmentAmount = configuredInstallmentAmount > 0
        ? configuredInstallmentAmount
        : installments > 0
          ? amount / installments
          : 0;
      const details = paymentDetails[method]?.trim();
      if (method === 'card' || method === 'boleto') {
        const base = `${label}: valor R$ ${amount.toFixed(2)} | ${installments}x de R$ ${installmentAmount.toFixed(2)}`;
        return details ? `${base} (${details})` : base;
      }

      const base = `${label}: R$ ${amount.toFixed(2)}`;
      return details ? `${base} (${details})` : base;
    })
    .join(' | ');

  return `Condição: ${paymentConditionLabel}\nFormas: ${methodsDescription}`;
}

export async function upsertContractFinancialForecast(contractId: string) {
  const { data, error } = await (supabase as unknown as {
    rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>
  }).rpc('upsert_contract_financial_forecast', {
    p_contract_id: contractId,
    p_force: true,
  });

  if (error) throw error;
  return data;
}
