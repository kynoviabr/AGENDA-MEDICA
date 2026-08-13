import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { PageHeader } from '@/components/ui/page-header';
import { BrandBadge, type BadgeStatus } from '@/components/ui/brand-badge';
import { BrandButton } from '@/components/ui/brand-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Filter,
  Plus,
  Search,
  Wallet,
} from 'lucide-react';

type PaymentMethod = 'credit_card' | 'debit_card' | 'pix' | 'bank_transfer' | 'cash' | 'boleto';

type NewPaymentPlanForm = {
  contractId: string;
  totalAmount: string;
  paymentMethod: PaymentMethod;
  numInstallments: string;
  firstDueDate: string;
  notes: string;
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  pix: 'Pix',
  bank_transfer: 'Transferência',
  cash: 'Dinheiro',
  boleto: 'Boleto',
};

const statusToBadge: Record<string, BadgeStatus> = {
  pending: 'pending',
  paid: 'paid',
  overdue: 'overdue',
  cancelled: 'cancelled',
  refunded: 'default',
};

const emptyForm: NewPaymentPlanForm = {
  contractId: '',
  totalAmount: '',
  paymentMethod: 'pix',
  numInstallments: '1',
  firstDueDate: '',
  notes: '',
};

function addMonthsToDate(baseDate: Date, months: number) {
  const nextDate = new Date(baseDate);
  nextDate.setMonth(nextDate.getMonth() + months);
  return nextDate;
}

export default function PaymentsPage() {
  const { clinicId } = useBranding();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [form, setForm] = useState<NewPaymentPlanForm>(emptyForm);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['payment-plans', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_plans')
        .select('*, patients(full_name), contracts(contract_number), payment_installments(*)')
        .eq('clinic_id', clinicId!)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ['payment-contracts', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('id, contract_number, patient_id, status, patients(full_name), proposals(final_amount)')
        .eq('clinic_id', clinicId!)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const plansByContractId = useMemo(() => {
    const ids = new Set<string>();
    plans.forEach((plan: unknown) => ids.add(plan.contract_id));
    return ids;
  }, [plans]);

  const availableContracts = useMemo(
    () => contracts.filter((contract: unknown) => !plansByContractId.has(contract.id)),
    [contracts, plansByContractId]
  );

  const normalizedPlans = useMemo(() => {
    return plans.map((plan: unknown) => {
      const installments = [...(plan.payment_installments || [])].sort(
        (a: unknown, b: unknown) => a.installment_number - b.installment_number
      );
      const totalAmount = Number(plan.total_amount || 0);
      const paidAmount = installments
        .filter((installment: unknown) => installment.status === 'paid')
        .reduce((sum: number, installment: unknown) => sum + Number(installment.amount || 0), 0);
      const overdueAmount = installments
        .filter((installment: unknown) => installment.status === 'overdue')
        .reduce((sum: number, installment: unknown) => sum + Number(installment.amount || 0), 0);
      const pendingAmount = Math.max(totalAmount - paidAmount, 0);
      const paidCount = installments.filter((installment: unknown) => installment.status === 'paid').length;
      const nextInstallment = installments.find((installment: unknown) =>
        installment.status !== 'paid' && installment.status !== 'cancelled'
      );

      return {
        ...plan,
        installments,
        totalAmount,
        paidAmount,
        overdueAmount,
        pendingAmount,
        paidCount,
        nextInstallment,
      };
    });
  }, [plans]);

  const filteredPlans = useMemo(() => {
    return normalizedPlans.filter((plan: unknown) => {
      const searchValue = search.trim().toLowerCase();
      const matchesSearch =
        !searchValue ||
        (plan.patients?.full_name || '').toLowerCase().includes(searchValue) ||
        (plan.contracts?.contract_number || '').toLowerCase().includes(searchValue);

      if (!matchesSearch) return false;
      if (statusFilter === 'all') return true;
      return plan.status === statusFilter;
    });
  }, [normalizedPlans, search, statusFilter]);

  const totals = useMemo(() => {
    return normalizedPlans.reduce(
      (acc, plan: unknown) => {
        acc.total += plan.totalAmount;
        acc.paid += plan.paidAmount;
        acc.pending += plan.pendingAmount;
        acc.overdue += plan.overdueAmount;
        return acc;
      },
      { total: 0, paid: 0, pending: 0, overdue: 0 }
    );
  }, [normalizedPlans]);

  const markPaidMutation = useMutation({
    mutationFn: async ({ installmentId, planId }: { installmentId: string; planId: string }) => {
      const { error } = await supabase
        .from('payment_installments')
        .update({
          status: 'paid',
          paid_date: new Date().toISOString().slice(0, 10),
        })
        .eq('id', installmentId);

      if (error) throw error;

      const plan = normalizedPlans.find((item: unknown) => item.id === planId);
      if (!plan) return;

      const remainingOpen = plan.installments.filter(
        (installment: unknown) =>
          installment.id !== installmentId && installment.status !== 'paid' && installment.status !== 'cancelled'
      );

      const nextStatus = remainingOpen.length === 0 ? 'paid' : 'pending';
      const { error: planError } = await supabase.from('payment_plans').update({ status: nextStatus }).eq('id', planId);
      if (planError) throw planError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-plans'] });
      toast({ title: 'Pagamento registrado!' });
    },
    onError: (err: unknown) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  const createPlanMutation = useMutation({
    mutationFn: async () => {
      const selectedContract = contracts.find((contract: unknown) => contract.id === form.contractId);
      if (!selectedContract) throw new Error('Selecione um contrato');

      const totalAmount = Number(form.totalAmount || 0);
      const numInstallments = Math.max(Number(form.numInstallments || 1), 1);
      const firstDueDate = form.firstDueDate || new Date().toISOString().slice(0, 10);

      if (totalAmount <= 0) throw new Error('Informe um valor total válido');

      const { data: createdPlan, error } = await supabase
        .from('payment_plans')
        .insert({
          clinic_id: clinicId!,
          contract_id: selectedContract.id,
          patient_id: selectedContract.patient_id,
          total_amount: totalAmount,
          payment_method: form.paymentMethod,
          num_installments: numInstallments,
          notes: form.notes || null,
          status: 'pending',
        })
        .select('id')
        .single();

      if (error) throw error;

      const baseDate = new Date(`${firstDueDate}T12:00:00`);
      const amountPerInstallment = totalAmount / numInstallments;
      const installments = Array.from({ length: numInstallments }, (_, index) => {
        const dueDate = addMonthsToDate(baseDate, index);
        const roundedAmount =
          index === numInstallments - 1
            ? Number((totalAmount - amountPerInstallment * (numInstallments - 1)).toFixed(2))
            : Number(amountPerInstallment.toFixed(2));

        return {
          payment_plan_id: createdPlan.id,
          installment_number: index + 1,
          amount: roundedAmount,
          due_date: dueDate.toISOString().slice(0, 10),
          status: 'pending' as const,
        };
      });

      const { error: installmentsError } = await supabase.from('payment_installments').insert(installments);
      if (installmentsError) throw installmentsError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-plans'] });
      setDialogOpen(false);
      setForm(emptyForm);
      toast({ title: 'Plano de pagamento criado!' });
    },
    onError: (err: unknown) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  const selectedContract = contracts.find((contract: unknown) => contract.id === form.contractId);

  return (
    <div>
      <PageHeader title="Pagamentos" description="Controle operacional de cobrança e recebimento">
        <BrandButton onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4" />
          Novo pagamento
        </BrandButton>
      </PageHeader>

      <div className="grid gap-3 md:grid-cols-4 mb-6">
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <CircleDollarSign className="w-5 h-5 text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">R$ {totals.total.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Total lançado</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <CheckCircle2 className="w-5 h-5 text-success mb-2" />
            <p className="text-2xl font-bold text-foreground">R$ {totals.paid.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Recebido</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <Wallet className="w-5 h-5 text-warning mb-2" />
            <p className="text-2xl font-bold text-foreground">R$ {totals.pending.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Em aberto</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <AlertTriangle className="w-5 h-5 text-destructive mb-2" />
            <p className="text-2xl font-bold text-foreground">R$ {totals.overdue.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Atrasado</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card mb-6 animate-fade-in">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cobranças cadastradas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por paciente ou contrato..."
                className="pl-10"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filtrar status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="paid">Pagos</SelectItem>
                <SelectItem value="overdue">Atrasados</SelectItem>
                <SelectItem value="cancelled">Cancelados</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading && (
            <div className="space-y-3">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="h-32 bg-muted rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && filteredPlans.length === 0 && (
            <div className="text-center py-12">
              <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-lg font-semibold">Nenhum pagamento encontrado</h3>
              <p className="text-sm text-muted-foreground">
                Cadastre pagamentos de forma simples a partir dos contratos gerados.
              </p>
            </div>
          )}

          {!isLoading && filteredPlans.length > 0 && (
            <div className="space-y-4">
              {filteredPlans.map((plan: unknown) => (
                <Card key={plan.id} className="shadow-card border-border/60">
                  <CardContent className="p-4 space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground">{plan.patients?.full_name || 'Paciente'}</p>
                          <BrandBadge status={statusToBadge[plan.status] || 'default'} />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {plan.contracts?.contract_number || 'Sem contrato'} · {paymentMethodLabels[plan.payment_method as PaymentMethod] || plan.payment_method}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {plan.paidCount}/{plan.installments.length} parcelas recebidas
                          {plan.nextInstallment
                            ? ` · Próximo vencimento em ${format(new Date(plan.nextInstallment.due_date), 'dd/MM/yyyy', { locale: ptBR })}`
                            : ' · Sem parcelas pendentes'}
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-3 min-w-[320px]">
                        <div className="rounded-lg bg-secondary/40 px-3 py-2">
                          <p className="text-xs text-muted-foreground">Total</p>
                          <p className="text-lg font-semibold">R$ {plan.totalAmount.toFixed(2)}</p>
                        </div>
                        <div className="rounded-lg bg-secondary/40 px-3 py-2">
                          <p className="text-xs text-muted-foreground">Recebido</p>
                          <p className="text-lg font-semibold text-success">R$ {plan.paidAmount.toFixed(2)}</p>
                        </div>
                        <div className="rounded-lg bg-secondary/40 px-3 py-2">
                          <p className="text-xs text-muted-foreground">Em aberto</p>
                          <p className={cn('text-lg font-semibold', plan.pendingAmount > 0 ? 'text-warning' : 'text-success')}>
                            R$ {plan.pendingAmount.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {plan.installments.map((installment: unknown) => (
                        <div
                          key={installment.id}
                          className="rounded-xl border bg-background px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                        >
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium text-foreground">Parcela {installment.installment_number}</p>
                              <BrandBadge status={statusToBadge[installment.status] || 'default'} />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Vencimento {format(new Date(`${installment.due_date}T12:00:00`), 'dd/MM/yyyy', { locale: ptBR })}
                              {installment.paid_date
                                ? ` · Pago em ${format(new Date(`${installment.paid_date}T12:00:00`), 'dd/MM/yyyy', { locale: ptBR })}`
                                : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 justify-end">
                            <p className="text-sm font-semibold text-foreground">R$ {Number(installment.amount).toFixed(2)}</p>
                            {installment.status !== 'paid' && installment.status !== 'cancelled' && (
                              <BrandButton
                                size="sm"
                                onClick={() => markPaidMutation.mutate({ installmentId: installment.id, planId: plan.id })}
                              >
                                Receber
                              </BrandButton>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Novo pagamento</DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              createPlanMutation.mutate();
            }}
            className="space-y-4 mt-4"
          >
            <div className="space-y-2">
              <Label>Contrato *</Label>
              <Select
                value={form.contractId}
                onValueChange={(value) => {
                  const contract = contracts.find((item: unknown) => item.id === value);
                  setForm((current) => ({
                    ...current,
                    contractId: value,
                    totalAmount: contract?.proposals?.final_amount ? String(contract.proposals.final_amount) : current.totalAmount,
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar contrato" />
                </SelectTrigger>
                <SelectContent>
                  {availableContracts.map((contract: unknown) => (
                    <SelectItem key={contract.id} value={contract.id}>
                      {contract.contract_number} · {contract.patients?.full_name || 'Paciente'} · R$ {Number(contract.proposals?.final_amount || 0).toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableContracts.length === 0 && (
                <p className="text-xs text-muted-foreground">Todos os contratos já possuem cobrança cadastrada.</p>
              )}
            </div>

            {selectedContract && (
              <div className="rounded-xl border bg-secondary/30 p-4">
                <p className="text-sm font-medium text-foreground">{selectedContract.patients?.full_name || 'Paciente'}</p>
                <p className="text-xs text-muted-foreground">
                  Contrato {selectedContract.contract_number} · Valor sugerido R$ {Number(selectedContract.proposals?.final_amount || 0).toFixed(2)}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Valor total *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.totalAmount}
                  onChange={(event) => setForm((current) => ({ ...current, totalAmount: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Forma de pagamento</Label>
                <Select
                  value={form.paymentMethod}
                  onValueChange={(value) => setForm((current) => ({ ...current, paymentMethod: value as PaymentMethod }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar forma" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(paymentMethodLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Número de parcelas</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.numInstallments}
                  onChange={(event) => setForm((current) => ({ ...current, numInstallments: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Primeiro vencimento</Label>
                <Input
                  type="date"
                  value={form.firstDueDate}
                  onChange={(event) => setForm((current) => ({ ...current, firstDueDate: event.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <BrandButton type="button" variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>
                Cancelar
              </BrandButton>
              <BrandButton
                type="submit"
                className="flex-1"
                disabled={createPlanMutation.isPending || !form.contractId || availableContracts.length === 0}
              >
                {createPlanMutation.isPending ? 'Salvando...' : 'Criar cobrança'}
              </BrandButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
