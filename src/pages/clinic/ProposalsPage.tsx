import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { BrandBadge, type BadgeStatus } from '@/components/ui/brand-badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Plus, FileText, Trash2, Search, Eye, Send, Check, X, Printer, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Database } from '@/integrations/supabase/types';
import {
  ContractPaymentConfigurator,
  paymentConditionLabels,
  paymentMethodOptions,
  type PaymentCondition,
  type PaymentConfig,
  type PaymentMethod,
} from '@/components/contracts/ContractPaymentConfigurator';
import PayerSection, { type PayerData } from '@/components/patient/PayerSection';
import { buildContractPaymentNotes, upsertContractFinancialForecast } from '@/lib/contractFinance';

const statusMap: Record<string, { label: string; badge: BadgeStatus }> = {
  draft: { label: 'Rascunho', badge: 'draft' },
  sent: { label: 'Enviada', badge: 'sent' },
  accepted: { label: 'Aprovada', badge: 'approved' },
  expired: { label: 'Expirada', badge: 'expired' },
  rejected: { label: 'Reprovada', badge: 'rejected' },
};

interface ProposalItem {
  treatment_id: string;
  quantity: number;
  unit_price: number;
  is_combo?: boolean;
  combo_id?: string;
}

type ProposalStatus = Database['public']['Enums']['proposal_status'];
type ContractStatus = Database['public']['Enums']['contract_status'];
type ProposalRow = Database['public']['Tables']['proposals']['Row'];
type ProposalInsert = Database['public']['Tables']['proposals']['Insert'];
type ProposalItemRow = Database['public']['Tables']['proposal_items']['Row'];
type PatientLite = Pick<Database['public']['Tables']['patients']['Row'], 'id' | 'full_name' | 'payer_id' | 'is_self_payer'>;
type TreatmentLite = Pick<Database['public']['Tables']['treatments']['Row'], 'id' | 'name' | 'price' | 'min_price' | 'default_price'>;
type LeadLite = Pick<Database['public']['Tables']['leads']['Row'], 'id' | 'full_name' | 'kanban_stage' | 'patient_id' | 'proposal_id'>;
type ProposalWithPatient = ProposalRow & { patients?: { full_name?: string | null; cpf?: string | null } | null };
type ProposalItemWithTreatment = ProposalItemRow & { treatments?: { name?: string | null } | null };
type ComboItem = { treatment_id: string | null; quantity: number | null; treatments?: { id?: string | null; name?: string | null; price?: number | null } | null };
type ComboLite = { id: string; name: string; promotional_price: number | null; treatment_combo_items?: ComboItem[] | null };
type PaymentPresetSnapshot = {
  condition: PaymentCondition;
  methods: PaymentMethod[];
  config: PaymentConfig;
  details: Partial<Record<PaymentMethod, string>>;
};

const PAYMENT_PRESET_MARKER = '[PAGAMENTO_PRESET]';

const sanitizePaymentSnapshot = (snapshot?: PaymentPresetSnapshot | null): PaymentPresetSnapshot | null => {
  if (!snapshot) return null;
  const methods = (snapshot.methods || []).filter((method): method is PaymentMethod =>
    paymentMethodOptions.some((option) => option.value === method)
  ).slice(0, 2);
  if (methods.length === 0) return null;
  const condition: PaymentCondition = snapshot.condition === 'installments' ? 'installments' : 'cash';
  const details: Partial<Record<PaymentMethod, string>> = {};
  const config: PaymentConfig = {};

  methods.forEach((method) => {
    details[method] = snapshot.details?.[method] || '';
    config[method] = {
      amount: snapshot.config?.[method]?.amount || '',
      installments: snapshot.config?.[method]?.installments || '',
      installmentAmount: snapshot.config?.[method]?.installmentAmount || '',
    };
  });

  return { condition, methods, details, config };
};

const parseProposalNotesPayload = (rawNotes?: string | null): { plainNotes: string; paymentPreset: PaymentPresetSnapshot | null } => {
  const noteText = rawNotes || '';
  const regex = new RegExp(`\\n?${PAYMENT_PRESET_MARKER}([A-Za-z0-9+/=]+)\\s*$`);
  const match = noteText.match(regex);
  if (!match) return { plainNotes: noteText, paymentPreset: null };

  let paymentPreset: PaymentPresetSnapshot | null = null;
  try {
    const decoded = decodeURIComponent(escape(atob(match[1])));
    paymentPreset = sanitizePaymentSnapshot(JSON.parse(decoded) as PaymentPresetSnapshot);
  } catch {
    paymentPreset = null;
  }

  const plainNotes = noteText.replace(regex, '').trim();
  return { plainNotes, paymentPreset };
};

const composeProposalNotesPayload = (plainNotes: string, paymentPreset?: PaymentPresetSnapshot | null) => {
  const cleanNotes = plainNotes.trim();
  const sanitizedPreset = sanitizePaymentSnapshot(paymentPreset);
  if (!sanitizedPreset) return cleanNotes || null;

  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(sanitizedPreset))));
  const markerLine = `${PAYMENT_PRESET_MARKER}${encoded}`;
  return cleanNotes ? `${cleanNotes}\n\n${markerLine}` : markerLine;
};

const buildPaymentPresetSummary = (preset?: PaymentPresetSnapshot | null) => {
  if (!preset || preset.methods.length === 0) return '';
  const methodsText = preset.methods
    .map((method) => {
      const option = paymentMethodOptions.find((item) => item.value === method)?.label || method;
      const amount = Number(preset.config?.[method]?.amount || 0);
      const installments = Number(preset.config?.[method]?.installments || 0);
      const installmentAmount = Number(preset.config?.[method]?.installmentAmount || 0);
      if (method === 'card') {
        return `${option}: R$ ${amount.toFixed(2)} · ${installments || 1}x de R$ ${(installmentAmount || amount).toFixed(2)}`;
      }
      if (method === 'boleto') {
        return `${option}: R$ ${amount.toFixed(2)} · ${installments || 1}x de R$ ${(installmentAmount || amount).toFixed(2)}`;
      }
      return `${option}: R$ ${amount.toFixed(2)}`;
    })
    .join(' | ');
  return `Condição: ${paymentConditionLabels[preset.condition]} | ${methodsText}`;
};

export default function ProposalsPage() {
  const { clinicId, clinicName } = useBranding();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialog, setViewDialog] = useState<(ProposalWithPatient & { items?: ProposalItemWithTreatment[] }) | null>(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [quickFilter, setQuickFilter] = useState<'all' | 'draft' | 'sent' | 'accepted'>('draft');
  const [search, setSearch] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');

  // Form state
  const [selectedPatient, setSelectedPatient] = useState('');
  const [notes, setNotes] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [items, setItems] = useState<ProposalItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [itemTab, setItemTab] = useState('treatment');
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [proposalToContract, setProposalToContract] = useState<ProposalWithPatient | null>(null);
  const [paymentCondition, setPaymentCondition] = useState<PaymentCondition>('cash');
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentDetails, setPaymentDetails] = useState<Partial<Record<PaymentMethod, string>>>({});
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig>({});
  const [payerData, setPayerData] = useState<PayerData>({ is_self_payer: true, payer_id: null });
  const [proposalPaymentEnabled, setProposalPaymentEnabled] = useState(false);
  const [proposalPaymentCondition, setProposalPaymentCondition] = useState<PaymentCondition>('cash');
  const [proposalSelectedPaymentMethods, setProposalSelectedPaymentMethods] = useState<PaymentMethod[]>([]);
  const [proposalPaymentDetails, setProposalPaymentDetails] = useState<Partial<Record<PaymentMethod, string>>>({});
  const [proposalPaymentConfig, setProposalPaymentConfig] = useState<PaymentConfig>({});
  const prefillPatientId = searchParams.get('patientId');
  const prefillLeadId = searchParams.get('leadId');
  const shouldOpenNewFromQuery = searchParams.get('openNew') === '1';
  const prefillProposalId = searchParams.get('proposalId');
  const shouldOpenViewFromQuery = searchParams.get('view') === '1';
  const returnTo = searchParams.get('returnTo');
  const returnLeadId = searchParams.get('returnLeadId');
  const crmReturnUrl = returnTo === 'crm' && returnLeadId ? `/clinic/crm?leadId=${returnLeadId}` : null;

  const { data: proposals = [], isLoading } = useQuery({
    queryKey: ['proposals', clinicId, filterStatus, quickFilter, search],
    queryFn: async () => {
      const activeStatus = quickFilter !== 'all' ? quickFilter : filterStatus;
      let q = supabase
        .from('proposals')
        .select('*, patients(full_name, cpf)')
        .eq('clinic_id', clinicId!)
        .order('created_at', { ascending: false });
      if (activeStatus !== 'all') q = q.eq('status', activeStatus as ProposalStatus);
      const { data } = await q;
      return ((data || []) as ProposalWithPatient[]);
    },
    enabled: !!clinicId,
  });

  const { data: patients = [] } = useQuery({
    queryKey: ['patients-list', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('patients').select('id, full_name, payer_id, is_self_payer').eq('clinic_id', clinicId!).eq('status', 'active').order('full_name');
      return ((data || []) as PatientLite[]);
    },
    enabled: !!clinicId,
  });

  const selectedContractPatient = proposalToContract
    ? patients.find((patient) => patient.id === proposalToContract.patient_id) || null
    : null;
  const linkedPayerId = selectedContractPatient?.payer_id || null;

  const { data: linkedPayerOption = null } = useQuery({
    queryKey: ['proposal-linked-payer', clinicId, linkedPayerId],
    queryFn: async () => {
      if (!linkedPayerId) return null;
      const { data } = await supabase
        .from('payers' as unknown)
        .select('id, name, cpf')
        .eq('clinic_id', clinicId!)
        .eq('id', linkedPayerId)
        .maybeSingle();
      return (data as { id: string; name: string; cpf?: string | null } | null) || null;
    },
    enabled: !!clinicId && !!linkedPayerId,
  });

  const { data: treatments = [] } = useQuery({
    queryKey: ['treatments-list', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('treatments').select('id, name, price, min_price, default_price').eq('clinic_id', clinicId!).eq('is_active', true).order('name');
      return ((data || []) as TreatmentLite[]);
    },
    enabled: !!clinicId,
  });

  const { data: combos = [] } = useQuery({
    queryKey: ['combos-list', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('treatment_combos').select('*, treatment_combo_items(*, treatments(id, name, price, min_price))').eq('clinic_id', clinicId!).eq('active', true);
      return ((data || []) as unknown as ComboLite[]);
    },
    enabled: !!clinicId,
  });

  const { data: crmLead } = useQuery({
    queryKey: ['crm-lead-context', clinicId, prefillLeadId],
    queryFn: async () => {
      if (!prefillLeadId) return null;
      const { data, error } = await supabase
        .from('leads')
        .select('id, full_name, kanban_stage, patient_id, proposal_id')
        .eq('clinic_id', clinicId)
        .eq('id', prefillLeadId)
        .single();
      if (error) throw error;
      return data as LeadLite;
    },
    enabled: !!clinicId && !!prefillLeadId,
  });

  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const normalizeDigits = (value?: string | null) => (value || '').replace(/\D/g, '');
  const normalizedSearch = search.trim().toLowerCase();
  const normalizedSearchDigits = normalizeDigits(search);
  const handleStatusFilterChange = (value: string) => {
    setFilterStatus(value);
    setQuickFilter('all');
  };

  const visibleProposals = proposals.filter((proposal) => {
    const proposalNumber = (proposal.proposal_number || '').toLowerCase();
    const patientCpf = normalizeDigits(proposal.patients?.cpf);

    const matchesSearch = !normalizedSearch ||
      proposalNumber.includes(normalizedSearch) ||
      patientCpf.includes(normalizedSearchDigits);
    if (!matchesSearch) return false;

    if (dateStart && proposal.created_at < `${dateStart}T00:00:00`) return false;
    if (dateEnd && proposal.created_at > `${dateEnd}T23:59:59`) return false;
    return true;
  });

  useEffect(() => {
    if (!shouldOpenNewFromQuery || !prefillPatientId || dialogOpen || !!editingId) return;
    if (!patients.some((patient) => patient.id === prefillPatientId)) return;

    resetForm();
    setSelectedPatient(prefillPatientId);
    setDialogOpen(true);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('openNew');
    setSearchParams(nextParams, { replace: true });
  }, [shouldOpenNewFromQuery, prefillPatientId, dialogOpen, editingId, patients, searchParams, setSearchParams]);

  useEffect(() => {
    if (!shouldOpenViewFromQuery || !prefillProposalId || proposals.length === 0 || !!viewDialog) return;
    const targetProposal = proposals.find((proposal) => proposal.id === prefillProposalId);
    if (!targetProposal) return;

    openView(targetProposal);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('proposalId');
    nextParams.delete('view');
    setSearchParams(nextParams, { replace: true });
  }, [shouldOpenViewFromQuery, prefillProposalId, proposals, viewDialog, searchParams, setSearchParams]);

  const generateProposalNumber = () => {
    const now = new Date();
    const yymm = format(now, 'yyyyMM');
    const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
    return `PROP-${yymm}-${seq}`;
  };

  const validatePaymentPreset = (targetTotal: number) => {
    if (!proposalPaymentEnabled) return { ok: true as const };
    if (proposalSelectedPaymentMethods.length === 0) {
      return { ok: false as const, message: 'Selecione pelo menos uma forma de pagamento na proposta ou desative a seção opcional.' };
    }

    const totalInformed = proposalSelectedPaymentMethods.reduce(
      (sum, method) => sum + Number(proposalPaymentConfig[method]?.amount || 0),
      0
    );

    const hasInvalidAmount = proposalSelectedPaymentMethods.some(
      (method) => Number(proposalPaymentConfig[method]?.amount || 0) <= 0
    );
    if (hasInvalidAmount) {
      return { ok: false as const, message: 'Informe um valor maior que zero para cada forma de pagamento selecionada.' };
    }

    const installmentMethods = proposalSelectedPaymentMethods.filter((method) => method === 'card' || method === 'boleto');
    const invalidInstallments = installmentMethods.some((method) => Number(proposalPaymentConfig[method]?.installments || 0) <= 0);
    if (invalidInstallments) {
      return { ok: false as const, message: 'Informe número de parcelas válido para cartão/boleto.' };
    }

    if (totalInformed < targetTotal) {
      return {
        ok: false as const,
        message: `A soma das formas de pagamento (R$ ${totalInformed.toFixed(2)}) deve ser igual ou maior ao valor da proposta (R$ ${targetTotal.toFixed(2)}).`,
      };
    }

    return { ok: true as const };
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const num = editingId ? undefined : generateProposalNumber();
      const presetValidation = validatePaymentPreset(total);
      if (!presetValidation.ok) {
        throw new Error(presetValidation.message);
      }
      const notesPayload = composeProposalNotesPayload(
        notes,
        proposalPaymentEnabled
          ? {
              condition: proposalPaymentCondition,
              methods: proposalSelectedPaymentMethods,
              config: proposalPaymentConfig,
              details: proposalPaymentDetails,
            }
          : null
      );
      
      if (editingId) {
        const { error } = await supabase.from('proposals').update({
          patient_id: selectedPatient,
          total_amount: total,
          final_amount: total,
          notes: notesPayload,
          valid_until: validUntil || null,
        }).eq('id', editingId);
        if (error) throw error;

        await supabase.from('proposal_items').delete().eq('proposal_id', editingId);
        if (items.length > 0) {
          const { error: ie } = await supabase.from('proposal_items').insert(
            items.map(i => ({
              proposal_id: editingId,
              treatment_id: i.treatment_id,
              quantity: i.quantity,
              unit_price: i.unit_price,
              subtotal: i.quantity * i.unit_price,
            }))
          );
          if (ie) throw ie;
        }
      } else {
        const proposalPayload: ProposalInsert = {
          clinic_id: clinicId!,
          patient_id: selectedPatient,
          proposal_number: num!,
          total_amount: total,
          final_amount: total,
          notes: notesPayload,
          valid_until: validUntil || null,
          created_by: user?.id || null,
        };
        const { data: proposal, error } = await supabase.from('proposals').insert(proposalPayload).select().single();
        if (error) throw error;

        if (items.length > 0) {
          const { error: ie } = await supabase.from('proposal_items').insert(
            items.map(i => ({
              proposal_id: proposal.id,
              treatment_id: i.treatment_id,
              quantity: i.quantity,
              unit_price: i.unit_price,
              subtotal: i.quantity * i.unit_price,
            }))
          );
          if (ie) throw ie;
        }

        if (prefillLeadId) {
          const { error: leadError } = await supabase
            .from('leads')
            .update({
              patient_id: selectedPatient,
              proposal_id: proposal.id,
              kanban_stage: 'proposal_sent',
            })
            .eq('clinic_id', clinicId!)
            .eq('id', prefillLeadId);
          if (leadError) throw leadError;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      qc.invalidateQueries({ queryKey: ['crm-lead-context'] });
      setDialogOpen(false);
      resetForm();
      if (prefillLeadId || prefillPatientId) {
        // Keep CRM return context so approving a proposal can navigate back to the lead.
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('patientId');
        nextParams.delete('leadId');
        nextParams.delete('openNew');
        setSearchParams(nextParams, { replace: true });
      }
      toast({ title: editingId ? 'Proposta atualizada!' : 'Proposta criada!' });
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('proposals').update({ status: status as ProposalStatus }).eq('id', id);
      if (error) throw error;

      if (status === 'sent' || status === 'accepted') {
        const nextStage = status === 'accepted' ? 'closed_won' : 'proposal_sent';
        const { error: leadError } = await supabase
          .from('leads')
          .update({ kanban_stage: nextStage })
          .eq('clinic_id', clinicId!)
          .eq('proposal_id', id);
        if (leadError) throw leadError;
      }
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      qc.invalidateQueries({ queryKey: ['crm-lead-context'] });
      setViewDialog(null);
      toast({ title: 'Status atualizado!' });
      if (variables.status === 'accepted' && crmReturnUrl) {
        navigate(crmReturnUrl);
      }
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const resetForm = () => {
    setSelectedPatient('');
    setNotes('');
    setValidUntil('');
    setItems([]);
    setEditingId(null);
    setProposalPaymentEnabled(false);
    setProposalPaymentCondition('cash');
    setProposalSelectedPaymentMethods([]);
    setProposalPaymentDetails({});
    setProposalPaymentConfig({});
  };

  const addTreatmentItem = () => {
    if (treatments.length > 0) {
      const t = treatments[0];
      setItems([...items, { treatment_id: t.id, quantity: 1, unit_price: Number(t.default_price || t.price) }]);
    }
  };

  const addComboItem = (combo: ComboLite) => {
    const comboItems = combo.treatment_combo_items || [];
    const newItems: ProposalItem[] = comboItems.map((ci) => ({
      treatment_id: ci.treatments?.id || ci.treatment_id,
      quantity: ci.quantity || 1,
      unit_price: combo.promotional_price
        ? Number(combo.promotional_price) / comboItems.length
        : Number(ci.treatments?.price || 0),
      is_combo: true,
      combo_id: combo.id,
    }));
    setItems([...items, ...newItems]);
  };

  const getMinPriceWarning = (item: ProposalItem) => {
    const t = treatments.find((tr) => tr.id === item.treatment_id);
    if (t?.min_price && item.unit_price < Number(t.min_price)) {
      return `Abaixo do mínimo (R$ ${Number(t.min_price).toFixed(2)})`;
    }
    return null;
  };

  const openEdit = async (proposal: ProposalWithPatient) => {
    const parsed = parseProposalNotesPayload(proposal.notes);
    setEditingId(proposal.id);
    setSelectedPatient(proposal.patient_id);
    setNotes(parsed.plainNotes);
    setValidUntil(proposal.valid_until || '');
    if (parsed.paymentPreset) {
      setProposalPaymentEnabled(true);
      setProposalPaymentCondition(parsed.paymentPreset.condition);
      setProposalSelectedPaymentMethods(parsed.paymentPreset.methods);
      setProposalPaymentDetails(parsed.paymentPreset.details);
      setProposalPaymentConfig(parsed.paymentPreset.config);
    } else {
      setProposalPaymentEnabled(false);
      setProposalPaymentCondition('cash');
      setProposalSelectedPaymentMethods([]);
      setProposalPaymentDetails({});
      setProposalPaymentConfig({});
    }

    const { data: pItems } = await supabase.from('proposal_items').select('*').eq('proposal_id', proposal.id);
    setItems(((pItems || []) as ProposalItemRow[]).map((pi) => ({
      treatment_id: pi.treatment_id,
      quantity: pi.quantity,
      unit_price: Number(pi.unit_price),
    })));
    setDialogOpen(true);
  };

  const openView = async (proposal: ProposalWithPatient) => {
    const { data: pItems } = await supabase.from('proposal_items').select('*, treatments(name)').eq('proposal_id', proposal.id);
    setViewDialog({ ...proposal, items: (pItems || []) as ProposalItemWithTreatment[] });
  };

  const handlePrint = (proposal: ProposalWithPatient & { items?: ProposalItemWithTreatment[] }) => {
    const patient = patients.find((p) => p.id === proposal.patient_id);
    const printItems = proposal.items || [];
    const parsed = parseProposalNotesPayload(proposal.notes);
    const paymentSummary = buildPaymentPresetSummary(parsed.paymentPreset);
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Proposta ${proposal.proposal_number}</title>
      <style>body{font-family:Arial,sans-serif;padding:40px;color:#333}
      h1{font-size:24px;margin-bottom:4px}h2{font-size:14px;color:#666;margin-top:0}
      table{width:100%;border-collapse:collapse;margin-top:20px}
      th,td{border:1px solid #ddd;padding:10px;text-align:left;font-size:13px}
      th{background:#f5f5f5;font-weight:600}.total{text-align:right;font-size:18px;font-weight:bold;margin-top:20px}
      .signature{margin-top:80px;border-top:1px solid #333;width:300px;text-align:center;padding-top:8px;font-size:12px}
      </style></head><body>
      <h1>${clinicName}</h1><h2>Proposta Comercial</h2>
      <p><strong>Nº:</strong> ${proposal.proposal_number}</p>
      <p><strong>Paciente:</strong> ${patient?.full_name || proposal.patients?.full_name || '—'}</p>
      <p><strong>Data:</strong> ${format(new Date(proposal.created_at), 'dd/MM/yyyy', { locale: ptBR })}</p>
      ${proposal.valid_until ? `<p><strong>Validade:</strong> ${format(new Date(proposal.valid_until + 'T12:00'), 'dd/MM/yyyy', { locale: ptBR })}</p>` : ''}
      <table><thead><tr><th>Tratamento</th><th>Qtd</th><th>Valor Unit.</th><th>Subtotal</th></tr></thead><tbody>
      ${printItems.map((i) => `<tr><td>${i.treatments?.name || '—'}</td><td>${i.quantity}</td><td>R$ ${Number(i.unit_price).toFixed(2)}</td><td>R$ ${Number(i.subtotal).toFixed(2)}</td></tr>`).join('')}
      </tbody></table>
      <p class="total">Total: R$ ${Number(proposal.final_amount).toFixed(2)}</p>
      ${parsed.plainNotes ? `<p style="margin-top:20px"><strong>Observações:</strong> ${parsed.plainNotes}</p>` : ''}
      ${paymentSummary ? `<p style="margin-top:8px"><strong>Condições comerciais sugeridas:</strong> ${paymentSummary}</p>` : ''}
      <div class="signature">Assinatura do paciente</div>
      </body></html>`);
    w.document.close();
    w.print();
  };

  const openGenerateContractDialog = (proposal: ProposalWithPatient) => {
    const parsed = parseProposalNotesPayload(proposal.notes);
    setProposalToContract(proposal);
    const patientData = patients.find((patient) => patient.id === proposal.patient_id) || null;
    setPayerData({
      is_self_payer: patientData?.is_self_payer ?? true,
      payer_id: patientData?.payer_id || null,
      new_payer: patientData?.is_self_payer === false ? { name: '', cpf: '', birth_date: '' } : undefined,
    });
    if (parsed.paymentPreset) {
      setPaymentCondition(parsed.paymentPreset.condition);
      setSelectedPaymentMethods(parsed.paymentPreset.methods);
      setPaymentDetails(parsed.paymentPreset.details);
      setPaymentConfig(parsed.paymentPreset.config);
    } else {
      setPaymentCondition('cash');
      setSelectedPaymentMethods([]);
      setPaymentDetails({});
      setPaymentConfig({});
    }
    setContractDialogOpen(true);
  };

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

  const toggleProposalPaymentMethod = (method: PaymentMethod, checked: boolean) => {
    if (checked) {
      if (proposalSelectedPaymentMethods.includes(method)) return;
      if (proposalSelectedPaymentMethods.length >= 2) {
        toast({
          title: 'Limite de formas de pagamento',
          description: 'Você pode selecionar no máximo 2 formas de pagamento.',
          variant: 'destructive',
        });
        return;
      }
      setProposalSelectedPaymentMethods((current) => [...current, method]);
      return;
    }
    setProposalSelectedPaymentMethods((current) => current.filter((item) => item !== method));
    setProposalPaymentDetails((current) => {
      const next = { ...current };
      delete next[method];
      return next;
    });
    setProposalPaymentConfig((current) => {
      const next = { ...current };
      delete next[method];
      return next;
    });
  };

  const proposalPaymentSum = proposalSelectedPaymentMethods.reduce(
    (sum, method) => sum + Number(proposalPaymentConfig[method]?.amount || 0),
    0
  );
  const proposalPaymentValidation = validatePaymentPreset(total);
  const canSaveProposal = !proposalPaymentEnabled || proposalPaymentValidation.ok;

  const generateContract = async (proposal: ProposalWithPatient) => {
    const proposalAmount = Number(proposal.final_amount || 0);
    const totalInformed = selectedPaymentMethods.reduce((sum, method) => sum + Number(paymentConfig[method]?.amount || 0), 0);
    const hasInvalidAmount = selectedPaymentMethods.some((method) => Number(paymentConfig[method]?.amount || 0) <= 0);
    if (hasInvalidAmount) {
      toast({ title: 'Erro', description: 'Informe valor válido para cada forma selecionada.', variant: 'destructive' });
      return;
    }
    const installmentMethods = selectedPaymentMethods.filter((method) => method === 'card' || method === 'boleto');
    const invalidInstallments = installmentMethods.some((method) => Number(paymentConfig[method]?.installments || 0) <= 0);
    if (invalidInstallments) {
      toast({ title: 'Erro', description: 'Cartão e boleto exigem número de parcelas.', variant: 'destructive' });
      return;
    }
    if (totalInformed + 0.0001 < proposalAmount) {
      toast({
        title: 'Erro',
        description: `A soma das formas de pagamento (R$ ${totalInformed.toFixed(2)}) deve ser igual ou maior ao valor da proposta (R$ ${proposalAmount.toFixed(2)}).`,
        variant: 'destructive',
      });
      return;
    }

    let resolvedPayerId: string | null = null;
    if (!payerData.is_self_payer) {
      if (payerData.payer_id) {
        resolvedPayerId = payerData.payer_id;
      } else if (payerData.new_payer) {
        if (!payerData.new_payer.name.trim()) {
          toast({ title: 'Erro', description: 'Nome do pagador é obrigatório.', variant: 'destructive' });
          return;
        }
        if (!payerData.new_payer.cpf.trim()) {
          toast({ title: 'Erro', description: 'CPF do pagador é obrigatório.', variant: 'destructive' });
          return;
        }
        const { data: newPayer, error: payerError } = await supabase
          .from('payers' as unknown)
          .insert({
            clinic_id: clinicId!,
            patient_id: proposal.patient_id,
            name: payerData.new_payer.name.trim(),
            cpf: payerData.new_payer.cpf.trim(),
            birth_date: payerData.new_payer.birth_date || null,
          } as unknown)
          .select('id')
          .single();
        if (payerError) {
          toast({ title: 'Erro', description: payerError.message, variant: 'destructive' });
          return;
        }
        resolvedPayerId = (newPayer as { id: string }).id;
      } else {
        toast({ title: 'Erro', description: 'Selecione ou cadastre um pagador.', variant: 'destructive' });
        return;
      }
    }

    const now = new Date();
    const num = `CONT-${format(now, 'yyyyMM')}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`;
    const paymentNotes = buildContractPaymentNotes(
      selectedPaymentMethods,
      paymentConfig,
      paymentDetails,
      paymentConditionLabels[paymentCondition]
    );

    if (proposal.status !== 'accepted') {
      const { error: proposalStatusError } = await supabase
        .from('proposals')
        .update({ status: 'accepted' as ProposalStatus })
        .eq('clinic_id', clinicId!)
        .eq('id', proposal.id);
      if (proposalStatusError) {
        toast({ title: 'Erro', description: proposalStatusError.message, variant: 'destructive' });
        return;
      }

      const { error: leadStatusError } = await supabase
        .from('leads')
        .update({ kanban_stage: 'closed_won' })
        .eq('clinic_id', clinicId!)
        .eq('proposal_id', proposal.id);
      if (leadStatusError) {
        toast({ title: 'Erro', description: leadStatusError.message, variant: 'destructive' });
        return;
      }
    }

    const { data: insertedContract, error } = await supabase.from('contracts').insert({
      clinic_id: clinicId!,
      patient_id: proposal.patient_id,
      proposal_id: proposal.id,
      contract_number: num,
      status: 'draft' as ContractStatus,
      created_by: user?.id || null,
      start_date: format(now, 'yyyy-MM-dd'),
      notes: paymentNotes,
      payer_id: payerData.is_self_payer ? null : resolvedPayerId,
    }).select('id').single();
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      if (insertedContract?.id) {
        await upsertContractFinancialForecast(insertedContract.id);
      }
      qc.invalidateQueries({ queryKey: ['proposals'] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      toast({ title: 'Contrato gerado!', description: `Nº ${num}` });
      await supabase
        .from('patients')
        .update({
          is_self_payer: payerData.is_self_payer,
          payer_id: payerData.is_self_payer ? null : resolvedPayerId,
        })
        .eq('id', proposal.patient_id)
        .eq('clinic_id', clinicId!);
      setViewDialog(null);
      setContractDialogOpen(false);
      setProposalToContract(null);
      setPayerData({ is_self_payer: true, payer_id: null });
      if (crmReturnUrl) {
        navigate(crmReturnUrl);
      }
    }
  };

  return (
    <div>
      <PageHeader title="Propostas" description="Geração e gestão de propostas comerciais">
        {crmReturnUrl && (
          <BrandButton variant="outline" onClick={() => navigate(crmReturnUrl)}>
            Voltar ao CRM
          </BrandButton>
        )}
        <BrandButton onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="w-4 h-4" /> Nova Proposta
        </BrandButton>
      </PageHeader>

      {crmLead && (
        <Card className="mb-6 shadow-card border-primary/15 bg-primary/5">
          <CardContent className="p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Fluxo vindo do CRM</p>
              <p className="text-sm text-muted-foreground">
                Lead <span className="font-medium text-foreground">{crmLead.full_name}</span> pronto para proposta comercial.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <BrandBadge status="scheduled" withDot={false}>
                {crmLead.kanban_stage}
              </BrandBadge>
              {prefillPatientId && (
                <BrandButton
                  size="sm"
                  onClick={() => {
                    resetForm();
                    setSelectedPatient(prefillPatientId);
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4" />
                  Criar proposta deste lead
                </BrandButton>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nº da proposta ou CPF..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={handleStatusFilterChange}>
          <SelectTrigger className="w-[180px]">
            <Filter className="w-4 h-4 mr-2" /><SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="draft">Rascunho</SelectItem>
            <SelectItem value="sent">Enviada</SelectItem>
            <SelectItem value="accepted">Aprovada</SelectItem>
            <SelectItem value="rejected">Reprovada</SelectItem>
            <SelectItem value="expired">Expirada</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} className="w-[170px]" />
        <Input type="date" value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} className="w-[170px]" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <BrandButton size="sm" variant={quickFilter === 'all' ? 'default' : 'outline'} onClick={() => setQuickFilter('all')}>
          Todas
        </BrandButton>
        <BrandButton size="sm" variant={quickFilter === 'draft' ? 'default' : 'outline'} onClick={() => setQuickFilter('draft')}>
          Rascunhos
        </BrandButton>
        <BrandButton size="sm" variant={quickFilter === 'sent' ? 'default' : 'outline'} onClick={() => setQuickFilter('sent')}>
          Enviadas
        </BrandButton>
        <BrandButton size="sm" variant={quickFilter === 'accepted' ? 'default' : 'outline'} onClick={() => setQuickFilter('accepted')}>
          Aprovadas
        </BrandButton>
      </div>

      {isLoading && <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>}

      {!isLoading && visibleProposals.length === 0 && (
        <div className="text-center py-16 animate-fade-in">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold">Nenhuma proposta encontrada</h3>
          <p className="text-sm text-muted-foreground mb-4">Crie sua primeira proposta comercial</p>
          <BrandButton onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="w-4 h-4" /> Nova Proposta
          </BrandButton>
        </div>
      )}

      {!isLoading && visibleProposals.length > 0 && (
        <div className="bg-card rounded-xl shadow-card overflow-hidden animate-fade-in">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Nº</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Paciente</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Data</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Validade</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Valor Total</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visibleProposals.map((p) => {
                  const sm = statusMap[p.status] || { label: p.status, badge: 'default' as BadgeStatus };
                  return (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{p.proposal_number}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{p.patients?.full_name}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{format(new Date(p.created_at), 'dd/MM/yyyy', { locale: ptBR })}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{p.valid_until ? format(new Date(p.valid_until + 'T12:00'), 'dd/MM/yyyy', { locale: ptBR }) : '—'}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-foreground text-right">R$ {Number(p.final_amount).toFixed(2)}</td>
                      <td className="px-4 py-3"><BrandBadge status={sm.badge}>{sm.label}</BrandBadge></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <BrandButton variant="ghost" size="sm" onClick={() => openView(p)} title="Ver"><Eye className="w-3.5 h-3.5" /></BrandButton>
                          {p.status === 'draft' && (
                            <BrandButton variant="ghost" size="sm" onClick={() => openEdit(p)} title="Editar"><FileText className="w-3.5 h-3.5" /></BrandButton>
                          )}
                          {(p.status === 'draft' || p.status === 'sent') && (
                            <BrandButton
                              variant="ghost"
                              size="sm"
                              onClick={() => statusMutation.mutate({ id: p.id, status: 'accepted' })}
                              title="Aprovar"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </BrandButton>
                          )}
                          {p.status === 'accepted' && (
                            <BrandButton
                              variant="ghost"
                              size="sm"
                              onClick={() => openGenerateContractDialog(p)}
                              title="Gerar contrato"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </BrandButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Editar Proposta' : 'Nova Proposta'}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); createMutation.mutate(); }} className="space-y-4 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Paciente *</Label>
                <Select value={selectedPatient} onValueChange={setSelectedPatient}>
                  <SelectTrigger><SelectValue placeholder="Selecionar paciente" /></SelectTrigger>
                  <SelectContent>
                    {patients.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Validade</Label>
                <Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
              <div className="space-y-4 rounded-lg border p-4 bg-card">
                <div className="flex items-center justify-between mb-2">
                  <Label>Itens da proposta</Label>
                </div>

                <Tabs value={itemTab} onValueChange={setItemTab} className="mb-3">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="treatment">Tratamento Individual</TabsTrigger>
                    <TabsTrigger value="combo">Combo</TabsTrigger>
                  </TabsList>
                  <TabsContent value="treatment" className="pt-2">
                    <BrandButton type="button" size="sm" variant="outline" onClick={addTreatmentItem}>
                      <Plus className="w-3 h-3" /> Adicionar Tratamento
                    </BrandButton>
                  </TabsContent>
                  <TabsContent value="combo" className="pt-2">
                    {combos.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum combo disponível</p>
                    ) : (
                      <div className="space-y-2">
                        {combos.map((c) => (
                          <div key={c.id} className="flex items-center justify-between p-2 border rounded-lg">
                            <div>
                              <p className="text-sm font-medium">{c.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {(c.treatment_combo_items || []).map((ci) => ci.treatments?.name).filter(Boolean).join(', ')}
                              </p>
                              {c.promotional_price && <p className="text-xs font-semibold text-primary">R$ {Number(c.promotional_price).toFixed(2)}</p>}
                            </div>
                            <BrandButton type="button" size="sm" variant="outline" onClick={() => addComboItem(c)}>
                              <Plus className="w-3 h-3" /> Adicionar
                            </BrandButton>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>

                {items.map((item, idx) => {
                  const warning = getMinPriceWarning(item);
                  return (
                    <div key={idx} className="mb-2">
                      <div className="flex gap-2 items-end">
                        <div className="flex-1">
                          <Select value={item.treatment_id} onValueChange={v => {
                            const t = treatments.find((tr) => tr.id === v);
                            const newItems = [...items];
                            newItems[idx] = { ...item, treatment_id: v, unit_price: t ? Number(t.default_price || t.price) : item.unit_price };
                            setItems(newItems);
                          }}>
                            <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {treatments.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <Input type="number" min={1} value={item.quantity} className="w-16" onChange={e => {
                          const newItems = [...items];
                          newItems[idx] = { ...item, quantity: parseInt(e.target.value) || 1 };
                          setItems(newItems);
                        }} />
                        <Input type="number" step="0.01" value={item.unit_price} className="w-28" onChange={e => {
                          const newItems = [...items];
                          newItems[idx] = { ...item, unit_price: parseFloat(e.target.value) || 0 };
                          setItems(newItems);
                        }} />
                        <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-destructive p-2">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {warning && <p className="text-xs text-destructive mt-1">{warning}</p>}
                    </div>
                  );
                })}
                {items.length > 0 && (
                  <p className="text-right font-bold text-foreground mt-2">Total: R$ {total.toFixed(2)}</p>
                )}

                <div className="space-y-2 pt-2 border-t">
                  <Label>Observações</Label>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
                </div>
              </div>

              <div className="space-y-3 rounded-lg border p-4 bg-card">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-sm">Condições de pagamento na proposta (opcional)</Label>
                    <p className="text-xs text-muted-foreground">
                      Se preencher aqui, o contrato já abre pré-carregado para confirmar/editar.
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`inline-flex h-6 w-11 items-center rounded-full transition ${proposalPaymentEnabled ? 'bg-primary' : 'bg-muted'}`}
                    onClick={() => setProposalPaymentEnabled((current) => !current)}
                    aria-pressed={proposalPaymentEnabled}
                    aria-label="Habilitar condições de pagamento na proposta"
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white transition ${proposalPaymentEnabled ? 'translate-x-5' : 'translate-x-0.5'}`}
                    />
                  </button>
                </div>
                {proposalPaymentEnabled ? (
                  <div className="space-y-3">
                    <ContractPaymentConfigurator
                      paymentCondition={proposalPaymentCondition}
                      setPaymentCondition={setProposalPaymentCondition}
                      selectedPaymentMethods={proposalSelectedPaymentMethods}
                      togglePaymentMethod={toggleProposalPaymentMethod}
                      paymentConfig={proposalPaymentConfig}
                      setPaymentConfig={setProposalPaymentConfig}
                      paymentDetails={proposalPaymentDetails}
                      setPaymentDetails={setProposalPaymentDetails}
                    />
                    <div className="rounded-md border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
                      Valor da proposta: <span className="font-semibold text-foreground">R$ {total.toFixed(2)}</span> ·
                      Soma informada: <span className="font-semibold text-foreground">R$ {proposalPaymentSum.toFixed(2)}</span>
                      {!proposalPaymentValidation.ok && (
                        <span className="block text-destructive mt-1">
                          {proposalPaymentValidation.message}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
                    Ative para informar as condições comerciais já na proposta.
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <BrandButton type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancelar</BrandButton>
              <BrandButton type="submit" className="flex-1" disabled={createMutation.isPending || !selectedPatient || !canSaveProposal}>
                {createMutation.isPending ? 'Salvando...' : editingId ? 'Atualizar' : 'Criar Proposta'}
              </BrandButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* View dialog */}
      <Dialog open={!!viewDialog} onOpenChange={() => setViewDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {viewDialog && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between">
                  <span>Proposta {viewDialog.proposal_number}</span>
                  <BrandBadge status={statusMap[viewDialog.status]?.badge || 'default'}>
                    {statusMap[viewDialog.status]?.label || viewDialog.status}
                  </BrandBadge>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Paciente:</span> <span className="font-medium">{viewDialog.patients?.full_name}</span></div>
                  <div><span className="text-muted-foreground">Data:</span> <span className="font-medium">{format(new Date(viewDialog.created_at), 'dd/MM/yyyy', { locale: ptBR })}</span></div>
                  {viewDialog.valid_until && <div><span className="text-muted-foreground">Validade:</span> <span className="font-medium">{format(new Date(viewDialog.valid_until + 'T12:00'), 'dd/MM/yyyy', { locale: ptBR })}</span></div>}
                  <div><span className="text-muted-foreground">Valor Total:</span> <span className="font-bold">R$ {Number(viewDialog.final_amount).toFixed(2)}</span></div>
                </div>

                {viewDialog.items?.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-secondary/50">
                          <th className="text-left px-3 py-2">Tratamento</th>
                          <th className="text-center px-3 py-2">Qtd</th>
                          <th className="text-right px-3 py-2">Valor Unit.</th>
                          <th className="text-right px-3 py-2">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewDialog.items.map((i) => (
                          <tr key={i.id} className="border-b">
                            <td className="px-3 py-2">{i.treatments?.name || '—'}</td>
                            <td className="px-3 py-2 text-center">{i.quantity}</td>
                            <td className="px-3 py-2 text-right">R$ {Number(i.unit_price).toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-medium">R$ {Number(i.subtotal).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {parseProposalNotesPayload(viewDialog.notes).plainNotes && (
                  <p className="text-sm text-muted-foreground">
                    <strong>Obs:</strong> {parseProposalNotesPayload(viewDialog.notes).plainNotes}
                  </p>
                )}
                {buildPaymentPresetSummary(parseProposalNotesPayload(viewDialog.notes).paymentPreset) && (
                  <p className="text-sm text-muted-foreground">
                    <strong>Condições comerciais sugeridas:</strong>{' '}
                    {buildPaymentPresetSummary(parseProposalNotesPayload(viewDialog.notes).paymentPreset)}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 pt-4 border-t">
                  <BrandButton variant="outline" size="sm" onClick={() => handlePrint(viewDialog)}>
                    <Printer className="w-4 h-4" /> Imprimir
                  </BrandButton>

                  {viewDialog.status === 'draft' && (
                    <BrandButton size="sm" onClick={() => statusMutation.mutate({ id: viewDialog.id, status: 'sent' })}>
                      <Send className="w-4 h-4" /> Marcar como Enviada
                    </BrandButton>
                  )}

                  {(viewDialog.status === 'draft' || viewDialog.status === 'sent') && (
                    <>
                      <BrandButton size="sm" className="bg-success hover:bg-success/90" onClick={() => statusMutation.mutate({ id: viewDialog.id, status: 'accepted' })}>
                        <Check className="w-4 h-4" /> Aprovar
                      </BrandButton>
                      <BrandButton size="sm" onClick={() => openGenerateContractDialog(viewDialog)}>
                        <FileText className="w-4 h-4" /> Aprovar e gerar contrato
                      </BrandButton>
                      <BrandButton size="sm" variant="outline" className="text-destructive border-destructive" onClick={() => statusMutation.mutate({ id: viewDialog.id, status: 'rejected' })}>
                        <X className="w-4 h-4" /> Reprovar
                      </BrandButton>
                    </>
                  )}

                  {viewDialog.status === 'accepted' && (
                    <BrandButton size="sm" onClick={() => openGenerateContractDialog(viewDialog)}>
                      <FileText className="w-4 h-4" /> Gerar Contrato
                    </BrandButton>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={contractDialogOpen}
        onOpenChange={(open) => {
          setContractDialogOpen(open);
          if (!open) {
            setProposalToContract(null);
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
            <DialogTitle>{proposalToContract?.status === 'accepted' ? 'Gerar contrato' : 'Aprovar proposta e gerar contrato'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
              <ContractPaymentConfigurator
                paymentCondition={paymentCondition}
                setPaymentCondition={setPaymentCondition}
                selectedPaymentMethods={selectedPaymentMethods}
                togglePaymentMethod={togglePaymentMethod}
                paymentConfig={paymentConfig}
                setPaymentConfig={setPaymentConfig}
                paymentDetails={paymentDetails}
                setPaymentDetails={setPaymentDetails}
              />

              <div className="space-y-4 rounded-lg border p-4 bg-card">
                {proposalToContract && (
                  <PayerSection
                    value={payerData}
                    onChange={setPayerData}
                    patientName={proposalToContract.patients?.full_name || undefined}
                    payerOptionsOverride={linkedPayerOption ? [linkedPayerOption] : []}
                  />
                )}
                {proposalToContract && (
                  <div className="rounded-md border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
                    Valor da proposta: <span className="font-semibold text-foreground">R$ {Number(proposalToContract.final_amount || 0).toFixed(2)}</span> ·
                    Soma informada: <span className="font-semibold text-foreground">R$ {selectedPaymentMethods.reduce((sum, method) => sum + Number(paymentConfig[method]?.amount || 0), 0).toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <BrandButton type="button" variant="outline" className="flex-1" onClick={() => setContractDialogOpen(false)}>
                Cancelar
              </BrandButton>
              <BrandButton
                type="button"
                className="flex-1"
                disabled={
                  !proposalToContract ||
                  selectedPaymentMethods.length === 0 ||
                  selectedPaymentMethods.some((method) => Number(paymentConfig[method]?.amount || 0) <= 0) ||
                  selectedPaymentMethods
                    .filter((method) => method === 'card' || method === 'boleto')
                    .some(
                      (method) =>
                        Number(paymentConfig[method]?.installments || 0) <= 0
                    ) ||
                  (!payerData.is_self_payer &&
                    !payerData.payer_id &&
                    (!payerData.new_payer?.name?.trim() || !payerData.new_payer?.cpf?.trim()))
                }
                onClick={() => proposalToContract && generateContract(proposalToContract)}
              >
                Confirmar e gerar contrato
              </BrandButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
