import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, CheckCircle2, Eye, ExternalLink, FileSignature, Filter, Plus, Search, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ContractStatusBadge } from '@/components/contracts/ContractStatusBadge';
import { ContractViewDialog } from '@/components/contracts/ContractViewDialog';
import { generateContractHTML } from '@/components/contracts/ContractTemplateGenerator';
import { generateContractPDF } from '@/lib/contractPDF';
import { Card, CardContent } from '@/components/ui/card';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Database } from '@/integrations/supabase/types';
import PayerSection, { type PayerData } from '@/components/patient/PayerSection';
import {
  ContractPaymentConfigurator,
  paymentConditionLabels,
  type PaymentCondition,
  type PaymentConfig,
  type PaymentMethod,
} from '@/components/contracts/ContractPaymentConfigurator';
import { buildContractPaymentNotes, upsertContractFinancialForecast } from '@/lib/contractFinance';

type ContractRow = Database['public']['Tables']['contracts']['Row'];
type ContractStatus = Database['public']['Enums']['contract_status'];
type ProposalStatus = Database['public']['Enums']['proposal_status'];
type ContractWithRelations = ContractRow & {
  process_status?: string | null;
  signed_pdf_url?: string | null;
  template_html?: string | null;
  patients?: { full_name?: string | null; cpf?: string | null } | null;
  proposals?: { proposal_number?: string | null; final_amount?: number | null } | null;
  payers?: { name?: string | null; cpf?: string | null } | null;
};
type ApprovedProposal = {
  id: string;
  proposal_number: string;
  patient_id: string;
  final_amount: number | null;
  patients?: {
    full_name?: string | null;
    cpf?: string | null;
    date_of_birth?: string | null;
    payer_id?: string | null;
    is_self_payer?: boolean | null;
  } | null;
};
type ProposalItemLite = { quantity: number; treatments?: { name?: string | null; num_sessions?: number | null } | null };
type ProposalItemFilterRow = {
  proposal_id: string | null;
  treatment_id: string | null;
  treatments?: { name?: string | null } | null;
};

export default function ContractsPage() {
  const { clinicId, clinicName } = useBranding();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get('status');
  const quickParam = searchParams.get('quick');
  const [filterStatus, setFilterStatus] = useState(() =>
    statusParam && ['all', 'pending_upload', 'pending_confirmation', 'confirmed', 'overdue', 'cancelled'].includes(statusParam)
      ? statusParam
      : 'all'
  );
  const [search, setSearch] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [treatmentFilter, setTreatmentFilter] = useState('all');
  const [viewContract, setViewContract] = useState<ContractWithRelations | null>(null);
  const [createDialog, setCreateDialog] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState('');
  const [payerData, setPayerData] = useState<PayerData>({ is_self_payer: true, payer_id: null });
  const [paymentCondition, setPaymentCondition] = useState<PaymentCondition>('cash');
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentDetails, setPaymentDetails] = useState<Partial<Record<PaymentMethod, string>>>({});
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig>({});
  const [selectedContractIds, setSelectedContractIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState('pending_confirmation');
  const [quickFilter, setQuickFilter] = useState<'all' | 'mine_today' | 'pending_signature' | 'overdue'>(() =>
    quickParam && ['all', 'mine_today', 'pending_signature', 'overdue'].includes(quickParam)
      ? (quickParam as 'all' | 'mine_today' | 'pending_signature' | 'overdue')
      : 'all'
  );
  const prefillContractId = searchParams.get('contractId');
  const shouldOpenViewFromQuery = searchParams.get('view') === '1';
  const returnTo = searchParams.get('returnTo');
  const returnLeadId = searchParams.get('returnLeadId');
  const crmReturnUrl = returnTo === 'crm' && returnLeadId ? `/clinic/crm?leadId=${returnLeadId}` : null;

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ['contracts', clinicId, filterStatus, search],
    queryFn: async () => {
      let query = supabase
        .from('contracts')
        .select('*, patients(full_name, cpf), proposals(proposal_number, final_amount), payers(name, cpf)')
        .eq('clinic_id', clinicId!)
        .order('created_at', { ascending: false });

      if (filterStatus !== 'all') query = query.eq('process_status', filterStatus);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ContractWithRelations[];
    },
    enabled: !!clinicId,
  });

  const { data: proposalItemsFilterMap = [] } = useQuery({
    queryKey: ['proposal-items-filter-map', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposal_items')
        .select('proposal_id, treatment_id, treatments(name), proposals!inner(clinic_id)')
        .eq('proposals.clinic_id', clinicId!);
      if (error) throw error;
      return ((data || []) as ProposalItemFilterRow[]);
    },
    enabled: !!clinicId,
  });

  const { data: approvedProposals = [] } = useQuery({
    queryKey: ['approved-proposals-no-contract', clinicId],
    queryFn: async () => {
      const { data: allContracts, error: contractsError } = await supabase
        .from('contracts')
        .select('proposal_id')
        .eq('clinic_id', clinicId!);

      if (contractsError) throw contractsError;

      const linkedIds = (allContracts || []).map((contract) => contract.proposal_id).filter(Boolean);
      let query = supabase
        .from('proposals')
        .select('id, proposal_number, patient_id, final_amount, patients(full_name, cpf, date_of_birth, payer_id, is_self_payer)')
        .eq('clinic_id', clinicId!)
        .eq('status', 'accepted' as ProposalStatus);

      if (linkedIds.length > 0) query = query.not('id', 'in', `(${linkedIds.join(',')})`);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ApprovedProposal[];
    },
    enabled: !!clinicId && createDialog,
  });

  const selectedProposalData = approvedProposals.find((proposal) => proposal.id === selectedProposal) || null;
  const linkedPayerId = selectedProposalData?.patients?.payer_id || null;
  const { data: linkedPayerOption } = useQuery({
    queryKey: ['contract-linked-payer', clinicId, linkedPayerId],
    queryFn: async () => {
      if (!linkedPayerId) return null;
      const { data, error } = await supabase
        .from('payers' as unknown)
        .select('id, name, cpf')
        .eq('clinic_id', clinicId!)
        .eq('id', linkedPayerId)
        .maybeSingle();
      if (error) throw error;
      return (data as { id: string; name: string; cpf?: string | null } | null) || null;
    },
    enabled: !!clinicId && !!linkedPayerId && createDialog,
  });

  const summary = useMemo(() => {
    return {
      generated: contracts.filter((contract) => contract.process_status === 'pending_upload').length,
      signedReceived: contracts.filter((contract) => contract.process_status === 'pending_confirmation').length,
      active: contracts.filter((contract) => contract.process_status === 'confirmed').length,
      needsReview: contracts.filter((contract) => contract.process_status === 'overdue').length,
    };
  }, [contracts]);

  const visibleContracts = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const normalizeDigits = (value?: string | null) => (value || '').replace(/\D/g, '');
    const normalizedSearch = search.trim().toLowerCase();
    const normalizedSearchDigits = normalizeDigits(search);
    const treatmentByProposal = proposalItemsFilterMap.reduce<Record<string, Set<string>>>((acc, item) => {
      if (!item.proposal_id || !item.treatment_id) return acc;
      if (!acc[item.proposal_id]) acc[item.proposal_id] = new Set<string>();
      acc[item.proposal_id].add(item.treatment_id);
      return acc;
    }, {});

    return contracts.filter((contract) => {
      const contractNumber = (contract.contract_number || '').toLowerCase();
      const patientName = (contract.patients?.full_name || '').toLowerCase();
      const patientCpf = normalizeDigits(contract.patients?.cpf);
      const payerCpf = normalizeDigits(contract.payers?.cpf);

      const matchesSearch = !normalizedSearch ||
        contractNumber.includes(normalizedSearch) ||
        patientName.includes(normalizedSearch) ||
        patientCpf.includes(normalizedSearchDigits) ||
        payerCpf.includes(normalizedSearchDigits);
      if (!matchesSearch) return false;

      if (dateStart && contract.created_at < `${dateStart}T00:00:00`) return false;
      if (dateEnd && contract.created_at > `${dateEnd}T23:59:59`) return false;
      if (treatmentFilter !== 'all') {
        if (!contract.proposal_id) return false;
        const treatmentSet = treatmentByProposal[contract.proposal_id];
        if (!treatmentSet || !treatmentSet.has(treatmentFilter)) return false;
      }

      if (quickFilter === 'pending_signature') return contract.process_status === 'pending_confirmation';
      if (quickFilter === 'overdue') return contract.process_status === 'overdue';
      if (quickFilter === 'mine_today') {
        const createdAt = contract.created_at ? format(new Date(contract.created_at), 'yyyy-MM-dd') : '';
        return contract.created_by === user?.id && createdAt === today;
      }
      return true;
    });
  }, [contracts, quickFilter, user?.id, search, dateStart, dateEnd, treatmentFilter, proposalItemsFilterMap]);

  const treatmentOptions = proposalItemsFilterMap.reduce<Array<{ id: string; name: string }>>((acc, item) => {
    if (!item.treatment_id || !item.treatments?.name) return acc;
    if (acc.some((row) => row.id === item.treatment_id)) return acc;
    acc.push({ id: item.treatment_id, name: item.treatments.name });
    return acc;
  }, []).sort((a, b) => a.name.localeCompare(b.name));

  const createMutation = useMutation({
    mutationFn: async () => {
      const proposal = approvedProposals.find((item) => item.id === selectedProposal);
      if (!proposal) throw new Error('Selecione uma proposta');
      if (selectedPaymentMethods.length === 0) throw new Error('Selecione ao menos uma forma de pagamento.');
      const proposalAmount = Number(proposal.final_amount || 0);

      const amounts = selectedPaymentMethods.map((method) => Number(paymentConfig[method]?.amount || 0));
      const hasInvalidAmount = amounts.some((value) => !Number.isFinite(value) || value <= 0);
      if (hasInvalidAmount) throw new Error('Informe um valor válido para cada forma selecionada.');

      const requiresInstallments = selectedPaymentMethods.filter((method) => method === 'card' || method === 'boleto');
      const hasInvalidInstallments = requiresInstallments.some((method) => Number(paymentConfig[method]?.installments || 0) <= 0);
      if (hasInvalidInstallments) throw new Error('Cartão e boleto exigem quantidade de parcelas maior que zero.');
      const totalInformed = amounts.reduce((sum, value) => sum + value, 0);
      if (totalInformed + 0.0001 < proposalAmount) {
        throw new Error(
          `A soma das formas de pagamento (R$ ${totalInformed.toFixed(2)}) deve ser igual ou maior ao valor da proposta (R$ ${proposalAmount.toFixed(2)}).`
        );
      }

      const paymentTermsText = buildContractPaymentNotes(
        selectedPaymentMethods,
        paymentConfig,
        paymentDetails,
        paymentConditionLabels[paymentCondition]
      );

      const patient = proposal.patients;
      let resolvedPayerId: string | null = null;
      if (!payerData.is_self_payer) {
        if (payerData.payer_id) {
          resolvedPayerId = payerData.payer_id;
        } else if (payerData.new_payer) {
          if (!payerData.new_payer.name.trim()) throw new Error('Nome do pagador é obrigatório.');
          if (!payerData.new_payer.cpf.trim()) throw new Error('CPF do pagador é obrigatório.');
          const { data: newPayer, error: payerError } = await supabase
            .from('payers' as unknown)
            .insert({
              clinic_id: clinicId!,
              name: payerData.new_payer.name.trim(),
              cpf: payerData.new_payer.cpf.trim(),
              birth_date: payerData.new_payer.birth_date || null,
            })
            .select('id')
            .single();
          if (payerError) throw payerError;
          resolvedPayerId = (newPayer as { id: string }).id;
        }
      }
      const { data: items, error: itemsError } = await supabase
        .from('proposal_items')
        .select('quantity, treatments(name, num_sessions)')
        .eq('proposal_id', proposal.id);
      if (itemsError) throw itemsError;

      const treatmentNames = ((items || []) as ProposalItemLite[])
        .map((item) => item.treatments?.name || '')
        .filter(Boolean)
        .join(', ');
      const totalSessions = ((items || []) as ProposalItemLite[]).reduce(
        (sum: number, item) => sum + ((item.treatments?.num_sessions || 1) * (item.quantity || 1)),
        0
      );

      let payerName: string | null = null;
      let payerCpf: string | null = null;
      let payerBirthDate: string | null = null;
      const payerIdForContract = payerData.is_self_payer ? null : (resolvedPayerId || patient?.payer_id || null);
      if (!payerData.is_self_payer && payerIdForContract) {
        const { data: payer, error: payerError } = await supabase
          .from('payers')
          .select('name, cpf, birth_date')
          .eq('id', payerIdForContract)
          .maybeSingle();
        if (payerError) throw payerError;
        if (payer) {
          payerName = payer.name;
          payerCpf = payer.cpf;
          payerBirthDate = payer.birth_date;
        }
      }

      const [{ data: clinicData, error: clinicError }, { data: cnpjSetting, error: cnpjError }, { data: anamnesis, error: anamneseError }] =
        await Promise.all([
          supabase.from('clinics').select('city').eq('id', clinicId!).maybeSingle(),
          supabase.from('clinic_settings').select('value').eq('clinic_id', clinicId!).eq('key', 'cnpj').maybeSingle(),
          supabase
            .from('patient_anamneses')
            .select('id')
            .eq('patient_id', proposal.patient_id)
            .eq('clinic_id', clinicId!)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

      if (clinicError) throw clinicError;
      if (cnpjError) throw cnpjError;
      if (anamneseError) throw anamneseError;

      const now = new Date();
      const contractNumber = `CONT-${format(now, 'yyyyMM')}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`;
      const formattedDate = format(now, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

      const templateData = {
        clinicName: clinicName || 'Clínica',
        clinicCnpj: cnpjSetting?.value || '',
        clinicCity: clinicData?.city || '',
        patientName: patient?.full_name || '',
        patientCpf: patient?.cpf || '',
        patientBirthDate: patient?.date_of_birth || null,
        payerName,
        payerCpf,
        payerBirthDate,
        isSelfPayer: payerData.is_self_payer,
        treatmentName: treatmentNames || 'Tratamento estético',
        sessions: totalSessions,
        proposalNumber: proposal.proposal_number,
        anamnesisId: anamnesis?.id ? anamnesis.id.substring(0, 8).toUpperCase() : null,
        totalValue: Number(proposal.final_amount),
        paymentTerms: paymentTermsText,
        contractNumber,
        date: now.toISOString(),
      };

      const templateHtml = generateContractHTML(templateData);
      const pdfBlob = generateContractPDF({ ...templateData, formattedDate });
      const pdfPath = `${clinicId}/${proposal.patient_id}/drafts/${contractNumber}.pdf`;

      const { error: uploadError } = await supabase.storage.from('contracts').upload(pdfPath, pdfBlob, {
        contentType: 'application/pdf',
        upsert: true,
      });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('contracts').getPublicUrl(pdfPath);

      const { data: insertedContract, error } = await supabase.from('contracts').insert({
        clinic_id: clinicId!,
        patient_id: proposal.patient_id,
        proposal_id: proposal.id,
        payer_id: payerIdForContract,
        contract_number: contractNumber,
        status: 'draft',
        process_status: 'pending_upload',
        template_html: templateHtml,
        signed_pdf_url: urlData.publicUrl,
        notes: paymentTermsText,
        created_by: user?.id || null,
        start_date: format(now, 'yyyy-MM-dd'),
      }).select('id').single();

      if (error) throw error;
      if (insertedContract?.id) {
        await upsertContractFinancialForecast(insertedContract.id);
      }

      const { error: patientUpdateError } = await supabase
        .from('patients')
        .update({
          is_self_payer: payerData.is_self_payer,
          payer_id: payerIdForContract,
        })
        .eq('id', proposal.patient_id)
        .eq('clinic_id', clinicId!);
      if (patientUpdateError) throw patientUpdateError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['patients'] });
      setCreateDialog(false);
      setSelectedProposal('');
      setPaymentCondition('cash');
      setSelectedPaymentMethods([]);
      setPaymentDetails({});
      setPaymentConfig({});
      setPayerData({ is_self_payer: true, payer_id: null });
      toast({ title: 'Contrato gerado!' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  const bulkStatusMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || selectedContractIds.length === 0) return;
      const { error } = await supabase
        .from('contracts')
        .update({ process_status: bulkStatus as ContractStatus })
        .eq('clinic_id', clinicId)
        .in('id', selectedContractIds);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts'] });
      setSelectedContractIds([]);
      toast({ title: 'Status atualizado em lote!' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  useEffect(() => {
    if (!shouldOpenViewFromQuery || !prefillContractId || contracts.length === 0 || !!viewContract) return;
    const targetContract = contracts.find((contract) => contract.id === prefillContractId);
    if (!targetContract) return;

    setViewContract(targetContract);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('contractId');
    nextParams.delete('view');
    setSearchParams(nextParams, { replace: true });
  }, [shouldOpenViewFromQuery, prefillContractId, contracts, viewContract, searchParams, setSearchParams]);

  const togglePaymentMethod = (method: PaymentMethod, checked: boolean) => {
    if (checked) {
      if (selectedPaymentMethods.includes(method)) return;
      if (selectedPaymentMethods.length >= 2) {
        toast({
          title: 'Limite de formas de pagamento',
          description: 'Você pode selecionar no máximo 2 formas de pagamento.',
          variant: 'destructive',
        });
        return;
      }
      setSelectedPaymentMethods((current) => [...current, method]);
      return;
    }

      setSelectedPaymentMethods((current) => current.filter((item) => item !== method));
      setPaymentDetails((current) => {
        const next = { ...current };
        delete next[method];
        return next;
      });
      setPaymentConfig((current) => {
        const next = { ...current };
        delete next[method];
        return next;
      });
    };

  const selectedProposalAmount = Number(selectedProposalData?.final_amount || 0);
  const selectedAmountSum = selectedPaymentMethods.reduce(
    (sum, method) => sum + Number(paymentConfig[method]?.amount || 0),
    0
  );
  const canGenerateContract =
    !!selectedProposal &&
    !createMutation.isPending &&
    selectedPaymentMethods.length > 0 &&
    selectedPaymentMethods.every((method) => Number(paymentConfig[method]?.amount || 0) > 0) &&
    selectedPaymentMethods
      .filter((method) => method === 'card' || method === 'boleto')
      .every((method) => Number(paymentConfig[method]?.installments || 0) > 0) &&
    selectedAmountSum + 0.0001 >= selectedProposalAmount;

  useEffect(() => {
    if (!selectedProposalData) {
      setPayerData({ is_self_payer: true, payer_id: null });
      return;
    }
    setPayerData({
      is_self_payer: selectedProposalData.patients?.is_self_payer ?? true,
      payer_id: selectedProposalData.patients?.payer_id || null,
      new_payer: selectedProposalData.patients?.is_self_payer
        ? undefined
        : { name: '', cpf: '', birth_date: '' },
    });
  }, [selectedProposalData]);

  return (
    <div>
      <PageHeader title="Contratos" description="Formalize a venda e acompanhe o ciclo do contrato">
        {crmReturnUrl && (
          <BrandButton variant="outline" onClick={() => navigate(crmReturnUrl)}>
            Voltar ao CRM
          </BrandButton>
        )}
        <BrandButton onClick={() => setCreateDialog(true)}>
          <Plus className="w-4 h-4" />
          Gerar contrato
        </BrandButton>
      </PageHeader>

      <div className="grid gap-3 md:grid-cols-4 mb-6">
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <FileSignature className="w-5 h-5 text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">{summary.generated}</p>
            <p className="text-xs text-muted-foreground">Gerados</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <Upload className="w-5 h-5 text-warning mb-2" />
            <p className="text-2xl font-bold text-foreground">{summary.signedReceived}</p>
            <p className="text-xs text-muted-foreground">Assinados recebidos</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <CheckCircle2 className="w-5 h-5 text-success mb-2" />
            <p className="text-2xl font-bold text-foreground">{summary.active}</p>
            <p className="text-xs text-muted-foreground">Ativos</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <AlertTriangle className="w-5 h-5 text-destructive mb-2" />
            <p className="text-2xl font-bold text-foreground">{summary.needsReview}</p>
            <p className="text-xs text-muted-foreground">Precisam de revisão</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por contrato, paciente ou CPF..."
            className="pl-10"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[220px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending_upload">Gerados</SelectItem>
            <SelectItem value="pending_confirmation">Assinado recebido</SelectItem>
            <SelectItem value="confirmed">Ativos</SelectItem>
            <SelectItem value="overdue">Revisar documento</SelectItem>
            <SelectItem value="cancelled">Cancelados</SelectItem>
          </SelectContent>
        </Select>
        <Select value={treatmentFilter} onValueChange={setTreatmentFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Tratamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos tratamentos</SelectItem>
            {treatmentOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} className="w-[170px]" />
        <Input type="date" value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} className="w-[170px]" />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <BrandButton size="sm" variant={quickFilter === 'all' ? 'default' : 'outline'} onClick={() => setQuickFilter('all')}>
          Todos
        </BrandButton>
        <BrandButton size="sm" variant={quickFilter === 'mine_today' ? 'default' : 'outline'} onClick={() => setQuickFilter('mine_today')}>
          Meus hoje
        </BrandButton>
        <BrandButton size="sm" variant={quickFilter === 'pending_signature' ? 'default' : 'outline'} onClick={() => setQuickFilter('pending_signature')}>
          Assinatura pendente
        </BrandButton>
        <BrandButton size="sm" variant={quickFilter === 'overdue' ? 'default' : 'outline'} onClick={() => setQuickFilter('overdue')}>
          Vencidos
        </BrandButton>
      </div>

      {selectedContractIds.length > 0 && (
        <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-foreground">
              {selectedContractIds.length} contrato(s) selecionado(s)
            </p>
            <div className="flex gap-2">
              <Select value={bulkStatus} onValueChange={setBulkStatus}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending_upload">Gerado</SelectItem>
                  <SelectItem value="pending_confirmation">Assinado recebido</SelectItem>
                  <SelectItem value="confirmed">Ativo</SelectItem>
                  <SelectItem value="overdue">Revisão</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
              <BrandButton size="sm" onClick={() => bulkStatusMutation.mutate()} disabled={bulkStatusMutation.isPending}>
                {bulkStatusMutation.isPending ? 'Atualizando...' : 'Aplicar em lote'}
              </BrandButton>
            </div>
          </div>
        </div>
      )}

      {isLoading && <div className="space-y-3">{[...Array(4)].map((_, index) => <div key={index} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>}

      {!isLoading && contracts.length === 0 && (
        <div className="text-center py-16 animate-fade-in">
          <FileSignature className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold">Nenhum contrato</h3>
          <p className="text-sm text-muted-foreground">Contratos são gerados a partir de propostas aprovadas.</p>
        </div>
      )}

      {!isLoading && visibleContracts.length > 0 && (
        <div className="bg-card rounded-xl shadow-card overflow-hidden animate-fade-in">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={visibleContracts.length > 0 && visibleContracts.every((item) => selectedContractIds.includes(item.id))}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setSelectedContractIds(Array.from(new Set([...selectedContractIds, ...visibleContracts.map((item) => item.id)])));
                        } else {
                          const visibleSet = new Set(visibleContracts.map((item) => item.id));
                          setSelectedContractIds(selectedContractIds.filter((id) => !visibleSet.has(id)));
                        }
                      }}
                    />
                  </th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Contrato</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Paciente</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Proposta</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Valor</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visibleContracts.map((contract) => (
                  <tr key={contract.id} className="border-b last:border-0 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedContractIds.includes(contract.id)}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedContractIds((current) => Array.from(new Set([...current, contract.id])));
                          } else {
                            setSelectedContractIds((current) => current.filter((id) => id !== contract.id));
                          }
                        }}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground">{contract.contract_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(contract.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{contract.patients?.full_name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{contract.proposals?.proposal_number || '—'}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-foreground text-right">
                      R$ {Number(contract.proposals?.final_amount || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <ContractStatusBadge status={contract.process_status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {contract.signed_pdf_url && (
                          <BrandButton
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(contract.signed_pdf_url, '_blank', 'noopener,noreferrer')}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </BrandButton>
                        )}
                        <BrandButton variant="ghost" size="sm" onClick={() => setViewContract(contract)}>
                          <Eye className="w-3.5 h-3.5" />
                        </BrandButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isLoading && contracts.length > 0 && visibleContracts.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum contrato encontrado para o filtro rápido selecionado.
        </div>
      )}

      <Dialog
        open={createDialog}
        onOpenChange={(open) => {
          setCreateDialog(open);
          if (!open) {
            setSelectedProposal('');
            setPaymentCondition('cash');
            setSelectedPaymentMethods([]);
            setPaymentDetails({});
            setPaymentConfig({});
            setPayerData({ is_self_payer: true, payer_id: null });
          }
        }}
      >
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gerar contrato</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Selecione uma proposta aprovada para gerar a minuta:</p>
              {approvedProposals.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma proposta aprovada disponível</p>
              ) : (
                <Select value={selectedProposal} onValueChange={setSelectedProposal}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar proposta" />
                  </SelectTrigger>
                  <SelectContent>
                    {approvedProposals.map((proposal) => (
                      <SelectItem key={proposal.id} value={proposal.id}>
                        {proposal.proposal_number} - {proposal.patients?.full_name} (R$ {Number(proposal.final_amount).toFixed(2)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
              <ContractPaymentConfigurator
                paymentCondition={paymentCondition}
                setPaymentCondition={setPaymentCondition}
                selectedPaymentMethods={selectedPaymentMethods}
                togglePaymentMethod={togglePaymentMethod}
                paymentConfig={paymentConfig}
                setPaymentConfig={(updater) => setPaymentConfig((current) => updater(current))}
                paymentDetails={paymentDetails}
                setPaymentDetails={(updater) => setPaymentDetails((current) => updater(current))}
              />

              <div className="space-y-4 rounded-lg border p-4 bg-card">
                {selectedProposalData && (
                  <PayerSection
                    value={payerData}
                    onChange={setPayerData}
                    patientName={selectedProposalData.patients?.full_name || undefined}
                    payerOptionsOverride={linkedPayerOption ? [linkedPayerOption] : []}
                  />
                )}
                {selectedProposal && (
                  <div className="rounded-md border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
                    Valor da proposta: <span className="font-semibold text-foreground">R$ {selectedProposalAmount.toFixed(2)}</span> ·
                    Soma informada: <span className="font-semibold text-foreground">R$ {selectedAmountSum.toFixed(2)}</span>
                    {selectedAmountSum + 0.0001 < selectedProposalAmount && (
                      <span className="block text-destructive mt-1">
                        A soma deve ser igual ou maior ao valor da proposta para liberar o contrato.
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <BrandButton variant="outline" onClick={() => setCreateDialog(false)} className="flex-1">
                Cancelar
              </BrandButton>
              <BrandButton
                onClick={() => createMutation.mutate()}
                className="flex-1"
                disabled={!canGenerateContract}
              >
                {createMutation.isPending ? 'Gerando...' : 'Gerar'}
              </BrandButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {viewContract && (
        <ContractViewDialog
          contract={viewContract}
          clinicName={clinicName || ''}
          onClose={() => setViewContract(null)}
        />
      )}
    </div>
  );
}
