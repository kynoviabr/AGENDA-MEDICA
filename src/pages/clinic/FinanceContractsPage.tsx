import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { addDays, endOfMonth, endOfWeek, endOfYear, format, startOfMonth, startOfWeek, startOfYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, Download, RefreshCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';

type PeriodMode = 'day' | 'week' | 'month' | 'year' | 'custom';

type MatrixRow = {
  contract_id: string;
  contract_number: string;
  approval_date: string | null;
  patient_name: string | null;
  patient_cpf: string | null;
  seller_name: string | null;
  seller_id: string | null;
  treatments: string | null;
  contract_total: number;
  cash_total: number;
  pix_total: number;
  card_total: number;
  boleto_total: number;
  other_total: number;
  jan_total: number;
  feb_total: number;
  mar_total: number;
  apr_total: number;
  may_total: number;
  jun_total: number;
  jul_total: number;
  aug_total: number;
  sep_total: number;
  oct_total: number;
  nov_total: number;
  dec_total: number;
  out_of_period_total: number;
  total_predicted: number;
  has_financial_divergence: boolean;
  divergence_reason: string | null;
};

type ForecastContractDetail = {
  contract_number: string | null;
  patient_name: string | null;
  patient_cpf: string | null;
  payer_name: string | null;
  proposal_number: string | null;
  seller_name: string | null;
  contract_total: number | null;
  prediction_status: string | null;
};

type ForecastMethodDetail = {
  id: string;
  payment_method: string;
  installments_count: number;
  card_brand: string | null;
  card_last_digits: string | null;
  amount: number;
};

type ForecastInstallmentDetail = {
  id: string;
  installment_number: number;
  installments_count: number;
  payment_method: string;
  due_date: string | null;
  amount: number;
  notes: string | null;
};

type ForecastDetailResponse = {
  contract?: ForecastContractDetail;
  methods?: ForecastMethodDetail[];
  installments?: ForecastInstallmentDetail[];
} | null;

const monthColumns = [
  { key: 'jan_total', label: 'Jan' },
  { key: 'feb_total', label: 'Fev' },
  { key: 'mar_total', label: 'Mar' },
  { key: 'apr_total', label: 'Abr' },
  { key: 'may_total', label: 'Mai' },
  { key: 'jun_total', label: 'Jun' },
  { key: 'jul_total', label: 'Jul' },
  { key: 'aug_total', label: 'Ago' },
  { key: 'sep_total', label: 'Set' },
  { key: 'oct_total', label: 'Out' },
  { key: 'nov_total', label: 'Nov' },
  { key: 'dec_total', label: 'Dez' },
] as const;

const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const isTruthyFilter = (value: string) => value && value !== 'all';

function getPeriodRange(mode: PeriodMode, anchorDate: string, customStart: string, customEnd: string) {
  const base = anchorDate ? new Date(`${anchorDate}T12:00:00`) : new Date();
  switch (mode) {
    case 'day':
      return { startDate: format(base, 'yyyy-MM-dd'), endDateExclusive: format(addDays(base, 1), 'yyyy-MM-dd') };
    case 'week':
      return {
        startDate: format(startOfWeek(base, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        endDateExclusive: format(addDays(endOfWeek(base, { weekStartsOn: 1 }), 1), 'yyyy-MM-dd'),
      };
    case 'month':
      return {
        startDate: format(startOfMonth(base), 'yyyy-MM-dd'),
        endDateExclusive: format(addDays(endOfMonth(base), 1), 'yyyy-MM-dd'),
      };
    case 'year':
      return {
        startDate: format(startOfYear(base), 'yyyy-MM-dd'),
        endDateExclusive: format(addDays(endOfYear(base), 1), 'yyyy-MM-dd'),
      };
    case 'custom':
      return {
        startDate: customStart || '',
        endDateExclusive: customEnd ? format(addDays(new Date(`${customEnd}T12:00:00`), 1), 'yyyy-MM-dd') : '',
      };
    default:
      return { startDate: '', endDateExclusive: '' };
  }
}

export default function FinanceContractsPage() {
  const { clinicId } = useBranding();
  const { role } = useUserRole();
  const { toast } = useToast();
  const [tab, setTab] = useState<'matrix' | 'divergence'>('matrix');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const [anchorDate, setAnchorDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [sellerFilter, setSellerFilter] = useState('all');
  const [treatmentFilter, setTreatmentFilter] = useState('all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('closed');
  const [search, setSearch] = useState('');
  const [detailContractId, setDetailContractId] = useState<string | null>(null);

  const canAccess = role === 'admin' || role === 'receptionist' || role === 'sales';
  const { startDate, endDateExclusive } = getPeriodRange(periodMode, anchorDate, customStart, customEnd);
  const referenceYear = useMemo(() => {
    if (periodMode === 'custom') {
      if (!customStart) return null;
      return Number(format(new Date(`${customStart}T12:00:00`), 'yyyy'));
    }
    return Number(format(new Date(`${anchorDate}T12:00:00`), 'yyyy'));
  }, [anchorDate, customStart, periodMode]);

  const filters = useMemo(
    () => ({
      clinicId,
      startDate: startDate || null,
      endDateExclusive: endDateExclusive || null,
      referenceYear,
      sellerId: isTruthyFilter(sellerFilter) ? sellerFilter : null,
      treatmentId: isTruthyFilter(treatmentFilter) ? treatmentFilter : null,
      paymentMethod: isTruthyFilter(paymentMethodFilter) ? paymentMethodFilter : null,
      contractStatus: isTruthyFilter(statusFilter) ? statusFilter : null,
      search: search.trim() ? search.trim() : null,
    }),
    [clinicId, endDateExclusive, paymentMethodFilter, referenceYear, search, sellerFilter, startDate, statusFilter, treatmentFilter]
  );

  const matrixQuery = useQuery({
    queryKey: ['finance-contracts-matrix', filters],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as {
        rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: MatrixRow[] | null; error: Error | null }>
      }).rpc('get_finance_contracts_monthly_matrix', {
        p_clinic_id: filters.clinicId,
        p_start_date: filters.startDate,
        p_end_date: filters.endDateExclusive,
        p_reference_year: filters.referenceYear,
        p_seller_id: filters.sellerId,
        p_treatment_id: filters.treatmentId,
        p_payment_method: filters.paymentMethod,
        p_contract_status: filters.contractStatus,
        p_search: filters.search,
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!filters.clinicId && canAccess,
  });

  const detailQuery = useQuery({
    queryKey: ['finance-contract-detail', detailContractId],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as {
        rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: ForecastDetailResponse; error: Error | null }>
      }).rpc('get_finance_contract_forecast_detail', { p_contract_id: detailContractId });
      if (error) throw error;
      return data;
    },
    enabled: !!detailContractId,
  });

  const sellersQuery = useQuery({
    queryKey: ['finance-contract-sellers', clinicId],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as {
        rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: Array<{ seller_id: string | null; seller_name: string | null }> | null; error: Error | null }>
      }).rpc('get_finance_contract_sellers', { p_clinic_id: clinicId });
      if (error) throw error;
      return (data || [])
        .filter((seller) => !!seller.seller_id)
        .map((seller) => ({ id: seller.seller_id as string, name: seller.seller_name || 'Sem responsável' }));
    },
    enabled: !!clinicId && canAccess,
  });

  const treatmentsQuery = useQuery({
    queryKey: ['finance-contract-treatments', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('treatments').select('id, name').eq('clinic_id', clinicId!).order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId && canAccess,
  });

  const backfillMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as unknown as {
        rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: { processed?: number; skipped?: number } | null; error: Error | null }>
      }).rpc('backfill_contract_financial_forecast', {
        p_clinic_id: clinicId,
        p_force: false,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      matrixQuery.refetch();
      toast({
        title: 'Backfill executado',
        description: `Processados: ${data?.processed || 0} · Ignorados: ${data?.skipped || 0}`,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro no backfill', description: error.message, variant: 'destructive' });
    },
  });

  const rows = matrixQuery.data || [];
  const visibleRows = tab === 'divergence' ? rows.filter((row) => row.has_financial_divergence) : rows;
  const totals = useMemo(() => {
    const sum = (getValue: (row: MatrixRow) => number) => visibleRows.reduce((acc, row) => acc + Number(getValue(row) || 0), 0);
    return {
      contract_total: sum((row) => row.contract_total),
      cash_total: sum((row) => row.cash_total),
      pix_total: sum((row) => row.pix_total),
      card_total: sum((row) => row.card_total),
      boleto_total: sum((row) => row.boleto_total),
      other_total: sum((row) => row.other_total),
      jan_total: sum((row) => row.jan_total),
      feb_total: sum((row) => row.feb_total),
      mar_total: sum((row) => row.mar_total),
      apr_total: sum((row) => row.apr_total),
      may_total: sum((row) => row.may_total),
      jun_total: sum((row) => row.jun_total),
      jul_total: sum((row) => row.jul_total),
      aug_total: sum((row) => row.aug_total),
      sep_total: sum((row) => row.sep_total),
      oct_total: sum((row) => row.oct_total),
      nov_total: sum((row) => row.nov_total),
      dec_total: sum((row) => row.dec_total),
      out_of_period_total: sum((row) => row.out_of_period_total),
      total_predicted: sum((row) => row.total_predicted),
    };
  }, [visibleRows]);

  const exportCsv = () => {
    const headers = [
      'Contrato',
      'Paciente',
      'Vendedor',
      'Tratamento',
      'Valor contrato',
      'Dinheiro',
      'Pix',
      'Cartão',
      'Boleto',
      'Outros',
      'Jan',
      'Fev',
      'Mar',
      'Abr',
      'Mai',
      'Jun',
      'Jul',
      'Ago',
      'Set',
      'Out',
      'Nov',
      'Dez',
      'Fora do período',
      'Total previsto',
      'Divergência',
    ];

    const lines = visibleRows.map((row) => [
      row.contract_number,
      row.patient_name || '',
      row.seller_name || '',
      row.treatments || '',
      row.contract_total.toFixed(2),
      row.cash_total.toFixed(2),
      row.pix_total.toFixed(2),
      row.card_total.toFixed(2),
      row.boleto_total.toFixed(2),
      row.other_total.toFixed(2),
      row.jan_total.toFixed(2),
      row.feb_total.toFixed(2),
      row.mar_total.toFixed(2),
      row.apr_total.toFixed(2),
      row.may_total.toFixed(2),
      row.jun_total.toFixed(2),
      row.jul_total.toFixed(2),
      row.aug_total.toFixed(2),
      row.sep_total.toFixed(2),
      row.oct_total.toFixed(2),
      row.nov_total.toFixed(2),
      row.dec_total.toFixed(2),
      row.out_of_period_total.toFixed(2),
      row.total_predicted.toFixed(2),
      row.has_financial_divergence ? (row.divergence_reason || 'Divergência financeira') : '',
    ]);

    const csv = [headers, ...lines]
      .map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `financeiro-contratos-previsto-${format(new Date(), 'yyyyMMdd-HHmmss')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const periodLegend = (() => {
    if (!startDate || !endDateExclusive) return 'Período analisado: —';
    const start = new Date(`${startDate}T12:00:00`);
    const endInclusive = addDays(new Date(`${endDateExclusive}T12:00:00`), -1);
    if (periodMode === 'day') return `Período analisado: ${format(start, 'dd/MM/yyyy', { locale: ptBR })}`;
    if (periodMode === 'week') return `Período analisado: ${format(start, 'dd/MM/yyyy', { locale: ptBR })} a ${format(endInclusive, 'dd/MM/yyyy', { locale: ptBR })}`;
    if (periodMode === 'month') return `Período analisado: ${format(start, "MMMM 'de' yyyy", { locale: ptBR })}`;
    if (periodMode === 'year') return `Período analisado: Ano de ${format(start, 'yyyy', { locale: ptBR })}`;
    return `Período analisado: ${format(start, 'dd/MM/yyyy', { locale: ptBR })} a ${format(endInclusive, 'dd/MM/yyyy', { locale: ptBR })}`;
  })();

  if (!canAccess) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6">
        <p className="font-semibold text-destructive">Acesso restrito</p>
        <p className="text-sm text-muted-foreground">Este módulo financeiro está disponível apenas para perfis autorizados.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro — Contratos"
        description="Previsão financeira contratual por forma de pagamento e mês"
      >
        <BrandButton variant="outline" onClick={() => backfillMutation.mutate()} disabled={backfillMutation.isPending}>
          <RefreshCcw className="w-4 h-4" />
          {backfillMutation.isPending ? 'Processando...' : 'Gerar previsões antigas'}
        </BrandButton>
        <BrandButton variant="outline" onClick={exportCsv} disabled={visibleRows.length === 0}>
          <Download className="w-4 h-4" />
          Exportar CSV
        </BrandButton>
      </PageHeader>

      <Card className="shadow-card">
        <CardContent className="p-4 grid gap-3 md:grid-cols-5 lg:grid-cols-7">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Período</p>
            <Select value={periodMode} onValueChange={(value) => setPeriodMode(value as PeriodMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Dia</SelectItem>
                <SelectItem value="week">Semana</SelectItem>
                <SelectItem value="month">Mês</SelectItem>
                <SelectItem value="year">Ano</SelectItem>
                <SelectItem value="custom">Período personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{periodMode === 'custom' ? 'Data inicial' : 'Data base'}</p>
            <Input
              type="date"
              value={periodMode === 'custom' ? customStart : anchorDate}
              onChange={(event) => (periodMode === 'custom' ? setCustomStart(event.target.value) : setAnchorDate(event.target.value))}
            />
          </div>

          {periodMode === 'custom' && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Data final</p>
              <Input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
            </div>
          )}

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Vendedor</p>
            <Select value={sellerFilter} onValueChange={setSellerFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(sellersQuery.data || []).map((seller) => (
                  <SelectItem key={seller.id} value={seller.id}>{seller.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Tratamento</p>
            <Select value={treatmentFilter} onValueChange={setTreatmentFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(treatmentsQuery.data || []).map((treatment) => (
                  <SelectItem key={treatment.id} value={treatment.id}>{treatment.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Forma prevista</p>
            <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="cash">Dinheiro</SelectItem>
                <SelectItem value="pix">Pix</SelectItem>
                <SelectItem value="card">Cartão</SelectItem>
                <SelectItem value="boleto">Boleto</SelectItem>
                <SelectItem value="other">Outros</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Status contrato</p>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="closed">Fechados/Aprovados</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
                <SelectItem value="draft">Rascunho</SelectItem>
                <SelectItem value="confirmed">Confirmado</SelectItem>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="completed">Concluído</SelectItem>
                <SelectItem value="pending_confirmation">Pend. confirmação</SelectItem>
                <SelectItem value="pending_upload">Pend. upload</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardContent className="px-4 py-3">
          <p className="text-sm text-muted-foreground">{periodLegend}</p>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
            <Tabs value={tab} onValueChange={(value) => setTab(value as 'matrix' | 'divergence')}>
              <TabsList>
                <TabsTrigger value="matrix">Contrato mês a mês</TabsTrigger>
                <TabsTrigger value="divergence">Contratos com divergência</TabsTrigger>
              </TabsList>
            </Tabs>
            <Input
              placeholder="Buscar por contrato, paciente ou CPF..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="md:w-[360px]"
            />
          </div>

          {matrixQuery.isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Carregando previsão contratual...</div>
          ) : matrixQuery.isError ? (
            <div className="py-12 text-center text-sm text-destructive">Erro ao carregar dados financeiros previstos.</div>
          ) : visibleRows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Nenhum contrato encontrado para os filtros atuais.</div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[130px]">Contrato</TableHead>
                      <TableHead className="min-w-[180px]">Paciente</TableHead>
                      <TableHead className="min-w-[160px]">Vendedor</TableHead>
                      <TableHead className="min-w-[210px]">Tratamento</TableHead>
                      <TableHead className="text-right min-w-[130px]">Valor contrato</TableHead>
                      <TableHead className="text-right min-w-[110px]">Dinheiro</TableHead>
                      <TableHead className="text-right min-w-[110px]">Pix</TableHead>
                      <TableHead className="text-right min-w-[110px]">Cartão</TableHead>
                      <TableHead className="text-right min-w-[110px]">Boleto</TableHead>
                      <TableHead className="text-right min-w-[110px]">Outros</TableHead>
                      {monthColumns.map((month) => (
                        <TableHead key={month.key} className="text-right min-w-[96px]">{month.label}</TableHead>
                      ))}
                      <TableHead className="text-right min-w-[130px]">Fora do período</TableHead>
                      <TableHead className="text-right min-w-[130px]">Total previsto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="bg-primary/10 font-semibold">
                      <TableCell>TOTAL</TableCell>
                      <TableCell className="text-muted-foreground">{visibleRows.length} contratos</TableCell>
                      <TableCell>—</TableCell>
                      <TableCell>—</TableCell>
                      <TableCell className="text-right">{money(totals.contract_total)}</TableCell>
                      <TableCell className="text-right">{money(totals.cash_total)}</TableCell>
                      <TableCell className="text-right">{money(totals.pix_total)}</TableCell>
                      <TableCell className="text-right">{money(totals.card_total)}</TableCell>
                      <TableCell className="text-right">{money(totals.boleto_total)}</TableCell>
                      <TableCell className="text-right">{money(totals.other_total)}</TableCell>
                      {monthColumns.map((month) => (
                        <TableCell key={month.key} className="text-right">{money(Number(totals[month.key]))}</TableCell>
                      ))}
                      <TableCell className="text-right">{money(totals.out_of_period_total)}</TableCell>
                      <TableCell className="text-right">{money(totals.total_predicted)}</TableCell>
                    </TableRow>
                    {visibleRows.map((row) => (
                      <TableRow key={row.contract_id} className="cursor-pointer" onClick={() => setDetailContractId(row.contract_id)}>
                        <TableCell className="font-semibold">{row.contract_number}</TableCell>
                        <TableCell>{row.patient_name || '—'}</TableCell>
                        <TableCell>{row.seller_name || '—'}</TableCell>
                        <TableCell>{row.treatments || '—'}</TableCell>
                        <TableCell className="text-right">{money(row.contract_total)}</TableCell>
                        <TableCell className="text-right">{money(row.cash_total)}</TableCell>
                        <TableCell className="text-right">{money(row.pix_total)}</TableCell>
                        <TableCell className="text-right">{money(row.card_total)}</TableCell>
                        <TableCell className="text-right">{money(row.boleto_total)}</TableCell>
                        <TableCell className="text-right">{money(row.other_total)}</TableCell>
                        {monthColumns.map((month) => (
                          <TableCell key={month.key} className="text-right">{money(Number(row[month.key]))}</TableCell>
                        ))}
                        <TableCell className="text-right">{money(row.out_of_period_total)}</TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-2">
                            {row.has_financial_divergence && <AlertTriangle className="w-4 h-4 text-warning" />}
                            <span>{money(row.total_predicted)}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detailContractId} onOpenChange={(open) => !open && setDetailContractId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhe financeiro previsto do contrato</DialogTitle>
          </DialogHeader>
          {!detailQuery.data || detailQuery.isLoading ? (
            <div className="py-8 text-sm text-muted-foreground">Carregando detalhe...</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Contrato:</span> <span className="font-semibold">{detailQuery.data.contract?.contract_number}</span></div>
                <div><span className="text-muted-foreground">Paciente:</span> <span className="font-semibold">{detailQuery.data.contract?.patient_name || '—'}</span></div>
                <div><span className="text-muted-foreground">CPF:</span> {detailQuery.data.contract?.patient_cpf || '—'}</div>
                <div><span className="text-muted-foreground">Pagador:</span> {detailQuery.data.contract?.payer_name || 'Próprio paciente'}</div>
                <div><span className="text-muted-foreground">Proposta:</span> {detailQuery.data.contract?.proposal_number || '—'}</div>
                <div><span className="text-muted-foreground">Vendedor:</span> {detailQuery.data.contract?.seller_name || '—'}</div>
                <div><span className="text-muted-foreground">Valor contrato:</span> <span className="font-semibold">{money(Number(detailQuery.data.contract?.contract_total || 0))}</span></div>
                <div><span className="text-muted-foreground">Status previsão:</span> {detailQuery.data.contract?.prediction_status || 'previsto'}</div>
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-sm font-semibold mb-2">Formas de pagamento previstas</p>
                <div className="space-y-2 text-sm">
                  {(detailQuery.data.methods || []).length === 0 ? (
                    <p className="text-muted-foreground">Sem formas estruturadas.</p>
                  ) : (
                    detailQuery.data.methods.map((method: ForecastMethodDetail) => (
                      <div key={method.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                        <div>
                          <p className="font-medium">{method.payment_method}</p>
                          <p className="text-xs text-muted-foreground">
                            {method.installments_count}x
                            {method.card_brand ? ` · ${method.card_brand}` : ''}
                            {method.card_last_digits ? ` · finais ${method.card_last_digits}` : ''}
                          </p>
                        </div>
                        <p className="font-semibold">{money(Number(method.amount || 0))}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-sm font-semibold mb-2">Parcelas previstas</p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Parcela</TableHead>
                        <TableHead>Forma</TableHead>
                        <TableHead>Vencimento previsto</TableHead>
                        <TableHead className="text-right">Valor previsto</TableHead>
                        <TableHead>Observação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(detailQuery.data.installments || []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">Sem parcelas estruturadas.</TableCell>
                        </TableRow>
                      ) : (
                        detailQuery.data.installments.map((installment: ForecastInstallmentDetail) => (
                          <TableRow key={installment.id}>
                            <TableCell>{installment.installment_number}/{installment.installments_count}</TableCell>
                            <TableCell>{installment.payment_method}</TableCell>
                            <TableCell>
                              {installment.due_date ? format(new Date(`${installment.due_date}T12:00:00`), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                            </TableCell>
                            <TableCell className="text-right">{money(Number(installment.amount || 0))}</TableCell>
                            <TableCell>{installment.notes || '—'}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
