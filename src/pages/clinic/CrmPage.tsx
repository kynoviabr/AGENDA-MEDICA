import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow, startOfDay, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowDown, ArrowUp, CalendarDays, Clock3, FileText, GripVertical, MessageSquare, Phone, Plus, Search, TrendingUp, UserCheck2, UserRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useStaffDirectory } from '@/hooks/useStaffDirectory';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { BrandBadge } from '@/components/ui/brand-badge';
import { Checkbox } from '@/components/ui/checkbox';
import { getRenewalAlertLevel, getSnoozeLimitDays } from '@/lib/renewal/rules';
import { formatCep, lookupCepAddress } from '@/lib/cep';
import PayerSection, { type PayerData } from '@/components/patient/PayerSection';
import {
  ContractPaymentConfigurator,
  paymentConditionLabels,
  type PaymentCondition,
  type PaymentConfig,
  type PaymentMethod,
} from '@/components/contracts/ContractPaymentConfigurator';
import { buildContractPaymentNotes, upsertContractFinancialForecast } from '@/lib/contractFinance';

type StageCode = string;

type StageDefinition = {
  code: StageCode;
  label: string;
  accent: string;
  surface: string;
  description: string;
  isSystem?: boolean;
};

interface LeadRow {
  id: string;
  clinic_id: string;
  full_name: string;
  phone: string | null;
  cpf: string | null;
  birth_date: string | null;
  email: string | null;
  zip_code: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  kanban_stage: StageCode;
  assigned_to: string | null;
  source: string | null;
  next_action: string | null;
  next_action_at: string | null;
  priority_level: 'high' | 'medium' | 'low' | null;
  treatments_of_interest: string[] | null;
  notes: string | null;
  lost_reason: string | null;
  lost_reason_notes: string | null;
  patient_id: string | null;
  appointment_id: string | null;
  proposal_id: string | null;
  last_credit_risk_level: string | null;
  last_boleto_eligible: boolean | null;
  last_recommended_payment: string | null;
  last_credit_check_at: string | null;
  last_interaction_at: string | null;
  stage_changed_at: string;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface RenewalTaskRow {
  id: string;
  clinic_id: string;
  patient_id: string;
  treatment_id: string;
  contract_id: string | null;
  status: 'pending' | 'contacted' | 'revaluation_scheduled' | 'snoozed' | 'converted' | 'discarded';
  patient_name: string;
  patient_phone: string | null;
  treatment_name: string;
  suggested_treatment_name: string | null;
  suggested_treatment_id: string | null;
  patient_ltv: number | null;
  avg_rating: number | null;
  patient_created_at: string | null;
  sessions_completed: number | null;
  sessions_total: number | null;
  days_since_last_action: number | null;
  created_at: string;
}

interface RenewalInteractionRow {
  id: string;
  renewal_task_id: string;
  type: string;
  notes: string | null;
  performed_at: string;
}

type LeadProposalRow = {
  id: string;
  proposal_number: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
  final_amount: number | null;
  patient_id: string;
  created_at: string;
  notes?: string | null;
  patients?: {
    full_name?: string | null;
    payer_id?: string | null;
    is_self_payer?: boolean | null;
  } | null;
};

type LeadProposalItem = {
  id?: string;
  treatment_id: string;
  quantity: number;
  unit_price: number;
  subtotal?: number | null;
  treatments?: { name?: string | null } | null;
};

type LeadProposalView = LeadProposalRow & { items?: LeadProposalItem[] };

type CrmTreatmentRow = {
  id: string;
  name: string;
  price: number | null;
  min_price?: number | null;
  default_price?: number | null;
};

const proposalStatusLabel: Record<LeadProposalRow['status'], string> = {
  draft: 'Rascunho',
  sent: 'Enviada',
  accepted: 'Aprovada',
  rejected: 'Reprovada',
  expired: 'Expirada',
};

const defaultStages: StageDefinition[] = [
  { code: 'new_lead', label: 'Novo Lead', accent: 'bg-slate-100 text-slate-700', surface: 'from-slate-50 to-white border-slate-200', description: 'Entradas novas sem contato.', isSystem: true },
  { code: 'contacted', label: 'Contato Iniciado', accent: 'bg-sky-100 text-sky-700', surface: 'from-sky-50 to-white border-sky-200', description: 'Primeiro contato em andamento.', isSystem: true },
  { code: 'scheduled', label: 'Agendado', accent: 'bg-cyan-100 text-cyan-700', surface: 'from-cyan-50 to-white border-cyan-200', description: 'Avaliação marcada e acompanhada.', isSystem: true },
  { code: 'proposal_sent', label: 'Proposta', accent: 'bg-amber-100 text-amber-700', surface: 'from-amber-50 to-white border-amber-200', description: 'Proposta criada ou em negociação.', isSystem: true },
  { code: 'closed_won', label: 'Fechado', accent: 'bg-emerald-100 text-emerald-700', surface: 'from-emerald-50 to-white border-emerald-200', description: 'Venda convertida em paciente.', isSystem: true },
  { code: 'closed_lost', label: 'Perdido', accent: 'bg-rose-100 text-rose-700', surface: 'from-rose-50 to-white border-rose-200', description: 'Lead encerrado com motivo.', isSystem: true },
];

const stageAppearanceMap = Object.fromEntries(defaultStages.map((stage) => [stage.code, stage])) as Record<string, StageDefinition>;

function normalizeStageCode(code?: string | null) {
  if (!code) return 'new_lead';
  if (code === 'attended' || code === 'negotiating') return 'proposal_sent';
  return code;
}

function stageAppearance(stage: Pick<StageDefinition, 'code' | 'label' | 'description'>, index: number): StageDefinition {
  const preset = stageAppearanceMap[stage.code];
  if (preset) return { ...preset, ...stage };

  const customPalette = [
    { accent: 'bg-indigo-100 text-indigo-700', surface: 'from-indigo-50 to-white border-indigo-200' },
    { accent: 'bg-fuchsia-100 text-fuchsia-700', surface: 'from-fuchsia-50 to-white border-fuchsia-200' },
    { accent: 'bg-teal-100 text-teal-700', surface: 'from-teal-50 to-white border-teal-200' },
    { accent: 'bg-lime-100 text-lime-700', surface: 'from-lime-50 to-white border-lime-200' },
  ][index % 4];

  return {
    ...stage,
    ...customPalette,
  };
}

const lostReasons = [
  'Preço acima do orçamento',
  'Optou por concorrente',
  'Não compareceu à avaliação',
  'Perdeu interesse no tratamento',
  'Sem condições financeiras no momento',
  'Não respondeu após múltiplos contatos',
  'Outro',
];

const interactionTypes = [
  { value: 'call_made', label: 'Ligação realizada' },
  { value: 'call_missed', label: 'Ligação não atendida' },
  { value: 'whatsapp', label: 'WhatsApp enviado' },
  { value: 'email', label: 'E-mail enviado' },
  { value: 'in_person', label: 'Contato presencial' },
  { value: 'note', label: 'Observação interna' },
];

function relativeDate(value?: string | null) {
  if (!value) return 'Sem registro';
  return formatDistanceToNow(new Date(value), { addSuffix: true, locale: ptBR });
}

function normalizePhone(phone?: string | null) {
  return phone?.replace(/\D/g, '') || '';
}

function getSchemaMissingColumn(error) {
  const message = error?.message || '';
  const match = message.match(/Could not find the '([^']+)' column/i);
  return match?.[1] || null;
}

function stripUnsupportedLeadFields<T extends Record<string, unknown>>(payload: T, missingColumn: string | null) {
  if (!missingColumn || !(missingColumn in payload)) return payload;
  const nextPayload = { ...payload };
  delete nextPayload[missingColumn];
  return nextPayload;
}

function buildEvaluationScheduleLink(leadId: string, professionalId?: string | null) {
  const params = new URLSearchParams({
    leadId,
    openNew: '1',
  });

  if (professionalId) {
    params.set('professionalId', professionalId);
  }

  return `/clinic/appointments?${params.toString()}`;
}

function isSchedulableAppointmentStatus(status?: string | null) {
  return status === 'scheduled' || status === 'confirmed';
}

function getRiskLabel(risk?: string | null) {
  if (risk === 'high') return { label: 'Risco alto', className: 'bg-rose-100 text-rose-700' };
  if (risk === 'medium') return { label: 'Risco médio', className: 'bg-amber-100 text-amber-700' };
  if (risk === 'low') return { label: 'Risco baixo', className: 'bg-emerald-100 text-emerald-700' };
  return { label: 'Sem análise', className: 'bg-slate-100 text-slate-600' };
}

function getFollowUpStatus(nextActionAt?: string | null) {
  if (!nextActionAt) {
    return { label: 'Sem próxima ação', className: 'bg-slate-100 text-slate-600' };
  }

  const now = Date.now();
  const dueAt = new Date(nextActionAt).getTime();

  if (dueAt < now) {
    return { label: 'Follow-up atrasado', className: 'bg-rose-100 text-rose-700' };
  }

  if (dueAt - now <= 1000 * 60 * 60 * 24) {
    return { label: 'Follow-up hoje', className: 'bg-amber-100 text-amber-700' };
  }

  return { label: 'Próxima ação agendada', className: 'bg-sky-100 text-sky-700' };
}

function isFollowUpDue(nextActionAt?: string | null) {
  if (!nextActionAt) return false;
  return new Date(nextActionAt).getTime() <= Date.now();
}

function getPriorityBadge(priority?: string | null) {
  if (priority === 'high') return { label: 'Alta prioridade', className: 'bg-rose-100 text-rose-700' };
  if (priority === 'low') return { label: 'Baixa prioridade', className: 'bg-emerald-100 text-emerald-700' };
  return { label: 'Média prioridade', className: 'bg-amber-100 text-amber-700' };
}

function getPriorityRank(priority?: string | null) {
  if (priority === 'high') return 0;
  if (priority === 'medium' || !priority) return 1;
  return 2;
}

function normalizeLeadSource(source?: string | null) {
  const normalized = source?.trim().toLowerCase();
  if (!normalized || normalized === 'sem origem' || normalized === 'nao informado' || normalized === 'não informado') return 'Sem origem';
  if (['google ads', 'ads google'].includes(normalized)) return 'google';
  if (['whatsapp ia', 'whatsapp-ai', 'whatsapp_ai'].includes(normalized)) return 'whatsapp_ai';
  if (['indicação', 'indicacao'].includes(normalized)) return 'indicacao';
  return normalized;
}

function getLeadSourceMeta(source?: string | null) {
  const normalized = normalizeLeadSource(source);
  if (normalized === 'whatsapp_ai') {
    return {
      label: 'WhatsApp IA',
      className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    };
  }
  if (normalized === 'whatsapp') {
    return {
      label: 'WhatsApp',
      className: 'bg-green-50 text-green-700 ring-1 ring-green-200',
    };
  }
  if (!normalized) {
    return {
      label: 'Sem origem',
      className: 'bg-slate-100 text-slate-600',
    };
  }
  if (normalized === 'Sem origem') {
    return {
      label: 'Sem origem',
      className: 'bg-slate-100 text-slate-600',
    };
  }
  if (normalized === 'google') {
    return {
      label: 'Google',
      className: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    };
  }
  if (normalized === 'instagram') {
    return {
      label: 'Instagram',
      className: 'bg-pink-50 text-pink-700 ring-1 ring-pink-200',
    };
  }
  if (normalized === 'site') {
    return {
      label: 'Site',
      className: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
    };
  }
  if (normalized === 'indicacao') {
    return {
      label: 'Indicação',
      className: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
    };
  }
  return {
    label: normalized.charAt(0).toUpperCase() + normalized.slice(1),
    className: 'bg-slate-100 text-slate-700',
  };
}

export default function CrmPage() {
  const { clinicId } = useBranding();
  const { user } = useAuth();
  const { role } = useUserRole();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [assignedFilter, setAssignedFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [insightFilter, setInsightFilter] = useState<'all' | 'without_owner' | 'stalled' | 'scheduled' | 'proposal_open' | 'overdue_follow_up' | 'high_priority'>('all');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [renewalsExpanded, setRenewalsExpanded] = useState(true);
  const [renewalHistoryTaskId, setRenewalHistoryTaskId] = useState<string | null>(null);
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);
  const [leadDrawer, setLeadDrawer] = useState<LeadRow | null>(null);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [lossModal, setLossModal] = useState<{ lead: LeadRow; targetStage: StageCode } | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [bulkAssignValue, setBulkAssignValue] = useState('unassigned');
  const [bulkStageValue, setBulkStageValue] = useState('none');
  const [quickForm, setQuickForm] = useState({
    full_name: '',
    phone: '',
    cpf: '',
    email: '',
    zip_code: '',
    address: '',
    city: '',
    state: '',
    source: '',
    priority_level: 'medium',
    assigned_to: 'unassigned',
    treatment: 'none',
    notes: '',
  });
  const [interactionForm, setInteractionForm] = useState({ type: 'call_made', notes: '' });
  const [lossForm, setLossForm] = useState({ reason: lostReasons[0], notes: '' });
  const [contractDialogProposal, setContractDialogProposal] = useState<LeadProposalRow | null>(null);
  const [paymentCondition, setPaymentCondition] = useState<PaymentCondition>('cash');
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentDetails, setPaymentDetails] = useState<Partial<Record<PaymentMethod, string>>>({});
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig>({});
  const [payerData, setPayerData] = useState<PayerData>({ is_self_payer: true, payer_id: null });
  const [proposalDialogOpen, setProposalDialogOpen] = useState(false);
  const [proposalLead, setProposalLead] = useState<LeadRow | null>(null);
  const [proposalPatientId, setProposalPatientId] = useState('');
  const [proposalValidUntil, setProposalValidUntil] = useState('');
  const [proposalNotes, setProposalNotes] = useState('');
  const [proposalItems, setProposalItems] = useState<LeadProposalItem[]>([]);
  const [proposalViewDialog, setProposalViewDialog] = useState<LeadProposalView | null>(null);
  const prefillLeadId = searchParams.get('leadId');

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['crm-leads', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('leads')
        .select('*')
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data || []) as LeadRow[]).map((lead) => ({
        ...lead,
        kanban_stage: normalizeStageCode(lead.kanban_stage),
      }));
    },
    enabled: !!clinicId,
  });

  const { data: configuredStages = defaultStages } = useQuery({
    queryKey: ['crm-stage-settings', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clinic_settings')
        .select('id, value')
        .eq('clinic_id', clinicId!)
        .eq('key', 'crm_kanban_stages')
        .maybeSingle();

      if (error) throw error;
      if (!data?.value) return defaultStages;

      try {
        const parsed = JSON.parse(data.value);
        if (!Array.isArray(parsed) || parsed.length === 0) return defaultStages;
        return parsed.map((stage: { code?: string; label?: string; description?: string }, index: number) =>
          stageAppearance({
            code: normalizeStageCode(stage.code),
            label: stage.label || stage.code,
            description: stage.description || '',
            isSystem: !!defaultStages.find((item) => item.code === normalizeStageCode(stage.code)),
          }, index)
        );
      } catch {
        return defaultStages;
      }
    },
    enabled: !!clinicId,
  });

  const { staff } = useStaffDirectory(clinicId, ['admin', 'sales', 'receptionist', 'professional']);

  const { data: treatments = [] } = useQuery({
    queryKey: ['crm-treatments', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('treatments').select('id, name, price, min_price, default_price').eq('clinic_id', clinicId!).eq('is_active', true).order('name');
      if (error) throw error;
      return (data || []) as CrmTreatmentRow[];
    },
    enabled: !!clinicId,
  });

  const { data: proposals = [] } = useQuery({
    queryKey: ['crm-all-proposals', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select('id, proposal_number, status, final_amount, patient_id, created_at')
        .eq('clinic_id', clinicId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: renewalTasks = [] } = useQuery({
    queryKey: ['crm-renewal-tasks', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_renewal_tasks_active' as unknown)
        .select('*')
        .eq('clinic_id', clinicId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as RenewalTaskRow[];
    },
    enabled: !!clinicId,
  });

  const { data: renewalInteractions = [] } = useQuery({
    queryKey: ['crm-renewal-interactions', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('renewal_interactions' as unknown)
        .select('id, renewal_task_id, type, notes, performed_at')
        .eq('clinic_id', clinicId!)
        .order('performed_at', { ascending: false });
      if (error) throw error;
      return (data || []) as RenewalInteractionRow[];
    },
    enabled: !!clinicId,
  });

  const { data: interactions = [] } = useQuery({
    queryKey: ['crm-interactions', clinicId, leadDrawer?.id],
    queryFn: async () => {
      if (!leadDrawer) return [];
      const { data, error } = await supabase.from('lead_interactions')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('lead_id', leadDrawer.id)
        .order('performed_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId && !!leadDrawer,
  });

  const { data: leadAppointments = [] } = useQuery({
    queryKey: ['crm-appointments', clinicId, leadDrawer?.id],
    queryFn: async () => {
      if (!leadDrawer) return [];
      const { data, error } = await supabase.from('appointments')
        .select('id, status, scheduled_at, start_time, appointment_type')
        .eq('clinic_id', clinicId)
        .eq('lead_id', leadDrawer.id)
        .order('start_time', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId && !!leadDrawer,
  });

  const { data: leadProposals = [] } = useQuery({
    queryKey: ['crm-proposals', clinicId, leadDrawer?.patient_id],
    queryFn: async () => {
      if (!leadDrawer?.patient_id) return [];
      const { data, error } = await supabase
        .from('proposals')
        .select('id, proposal_number, status, final_amount, patient_id, notes, created_at, patients(full_name, payer_id, is_self_payer)')
        .eq('clinic_id', clinicId!)
        .eq('patient_id', leadDrawer.patient_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as LeadProposalRow[];
    },
    enabled: !!clinicId && !!leadDrawer?.patient_id,
  });

  const { data: leadContracts = [] } = useQuery({
    queryKey: ['crm-contracts', clinicId, leadDrawer?.patient_id],
    queryFn: async () => {
      if (!leadDrawer?.patient_id) return [];
      const { data, error } = await supabase
        .from('contracts')
        .select('id, contract_number, process_status, status, proposal_id, created_at')
        .eq('clinic_id', clinicId!)
        .eq('patient_id', leadDrawer.patient_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId && !!leadDrawer?.patient_id,
  });

  const staffMap = useMemo(() => Object.fromEntries(staff.map((member) => [member.user_id, member.label])), [staff]);
  const staffRoleMap = useMemo(() => Object.fromEntries(staff.map((member) => [member.user_id, member.role])), [staff]);
  const treatmentMap = useMemo(() => Object.fromEntries(treatments.map((t) => [t.id, t.name])), [treatments]);
  const proposalMap = useMemo(() => Object.fromEntries(proposals.map((proposal) => [proposal.id, proposal])), [proposals]);
  const stageMap = useMemo(() => Object.fromEntries(configuredStages.map((stage) => [stage.code, stage])), [configuredStages]);
  const availableSources = useMemo(
    () => Array.from(new Set(leads.map((lead) => normalizeLeadSource(lead.source))))
      .sort((a, b) => getLeadSourceMeta(a).label.localeCompare(getLeadSourceMeta(b).label)),
    [leads]
  );

  useEffect(() => {
    if (!prefillLeadId || !leads.length || leadDrawer?.id === prefillLeadId) return;
    const targetLead = leads.find((lead) => lead.id === prefillLeadId);
    if (!targetLead) return;

    setLeadDrawer(targetLead);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('leadId');
    setSearchParams(nextParams, { replace: true });
  }, [prefillLeadId, leads, leadDrawer, searchParams, setSearchParams]);

  const resetProposalDialog = () => {
    setProposalDialogOpen(false);
    setProposalLead(null);
    setProposalPatientId('');
    setProposalValidUntil('');
    setProposalNotes('');
    setProposalItems([]);
  };

  const generateProposalNumber = () => {
    const now = new Date();
    return `PROP-${format(now, 'yyyyMM')}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`;
  };

  const defaultProposalItemForLead = (lead: LeadRow): LeadProposalItem[] => {
    const preferredTreatment = treatments.find((treatment) => lead.treatments_of_interest?.includes(treatment.id)) || treatments[0];
    if (!preferredTreatment) return [];
    return [{
      treatment_id: preferredTreatment.id,
      quantity: 1,
      unit_price: Number(preferredTreatment.default_price || preferredTreatment.price || 0),
    }];
  };

  const proposalTotal = proposalItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

  const addProposalItem = () => {
    if (treatments.length === 0) return;
    const treatment = treatments[0];
    setProposalItems((current) => [
      ...current,
      {
        treatment_id: treatment.id,
        quantity: 1,
        unit_price: Number(treatment.default_price || treatment.price || 0),
      },
    ]);
  };

  const openProposalFlow = async (lead: LeadRow) => {
    try {
      const patientId = await ensurePatientForLead(lead);
      const leadWithPatient = { ...lead, patient_id: patientId };
      setLeadDrawer((current) => current?.id === lead.id ? { ...current, patient_id: patientId } : current);
      setProposalLead(leadWithPatient);
      setProposalPatientId(patientId);
      setProposalValidUntil('');
      setProposalNotes('');
      setProposalItems(defaultProposalItemForLead(lead));
      setProposalDialogOpen(true);
    } catch (error) {
      toast({ title: 'Erro ao preparar proposta', description: error.message, variant: 'destructive' });
    }
  };

  const openExistingProposal = async (proposalId: string) => {
    const { data: proposal, error } = await supabase
      .from('proposals')
      .select('id, proposal_number, status, final_amount, patient_id, notes, created_at, patients(full_name, payer_id, is_self_payer)')
      .eq('clinic_id', clinicId!)
      .eq('id', proposalId)
      .single();
    if (error) {
      toast({ title: 'Erro ao abrir proposta', description: error.message, variant: 'destructive' });
      return;
    }

    const { data: items, error: itemsError } = await supabase
      .from('proposal_items')
      .select('id, treatment_id, quantity, unit_price, subtotal, treatments(name)')
      .eq('proposal_id', proposalId);
    if (itemsError) {
      toast({ title: 'Erro ao abrir itens', description: itemsError.message, variant: 'destructive' });
      return;
    }

    setProposalViewDialog({ ...(proposal as LeadProposalRow), items: (items || []) as LeadProposalItem[] });
  };

  const openExistingContract = (contractId: string, leadId?: string) => {
    const returnLeadId = leadId || leadDrawer?.id;
    navigate(
      returnLeadId
        ? `/clinic/contracts?contractId=${contractId}&view=1&returnTo=crm&returnLeadId=${returnLeadId}`
        : `/clinic/contracts?contractId=${contractId}&view=1`,
    );
  };

  const resetContractDialog = () => {
    setContractDialogProposal(null);
    setPaymentCondition('cash');
    setSelectedPaymentMethods([]);
    setPaymentDetails({});
    setPaymentConfig({});
    setPayerData({ is_self_payer: true, payer_id: null });
  };

  const openLeadContractDialog = (proposal: LeadProposalRow) => {
    setContractDialogProposal(proposal);
    setPayerData({
      is_self_payer: proposal.patients?.is_self_payer ?? true,
      payer_id: proposal.patients?.payer_id || null,
      new_payer: proposal.patients?.is_self_payer === false ? { name: '', cpf: '', birth_date: '' } : undefined,
    });
    setPaymentCondition('cash');
    setSelectedPaymentMethods([]);
    setPaymentDetails({});
    setPaymentConfig({});
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

  const clearQuickFilters = () => {
    setInsightFilter('all');
    setAssignedFilter('all');
    setStageFilter('all');
    setSourceFilter('all');
  };

  const toggleInsightFilter = (filter: 'without_owner' | 'stalled' | 'scheduled' | 'proposal_open' | 'overdue_follow_up' | 'high_priority') => {
    const nextValue = insightFilter === filter ? 'all' : filter;
    setInsightFilter(nextValue);
    if (nextValue === 'all') {
      setAssignedFilter('all');
      setStageFilter('all');
      return;
    }
    if (filter === 'without_owner') {
      setAssignedFilter('unassigned');
      setStageFilter('all');
      return;
    }
    if (filter === 'scheduled') {
      setStageFilter('scheduled');
      return;
    }
    if (filter === 'overdue_follow_up') {
      setStageFilter('all');
      return;
    }
    if (filter === 'high_priority') {
      setStageFilter('all');
      return;
    }
    if (filter === 'proposal_open') {
      setStageFilter('proposal_sent');
    }
  };

  const baseFilteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchesSearch = !search || [lead.full_name, lead.phone, lead.cpf]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(search.toLowerCase()));
      const matchesAssignee =
        assignedFilter === 'all' ||
        (assignedFilter === 'unassigned' ? !lead.assigned_to : lead.assigned_to === assignedFilter);
      const matchesStage = stageFilter === 'all' || lead.kanban_stage === stageFilter;
      const leadSource = normalizeLeadSource(lead.source);
      const matchesSource = sourceFilter === 'all' || leadSource === sourceFilter;
      return matchesSearch && matchesAssignee && matchesStage && matchesSource;
    });
  }, [leads, search, assignedFilter, stageFilter, sourceFilter]);

  const filteredLeads = useMemo(() => {
    const isStalledLead = (lead: LeadRow) => {
      const lastTouch = new Date(lead.last_interaction_at || lead.stage_changed_at || lead.created_at).getTime();
      const daysWithoutProgress = (Date.now() - lastTouch) / (1000 * 60 * 60 * 24);
      return !['closed_won', 'closed_lost'].includes(lead.kanban_stage) && daysWithoutProgress > 3;
    };

    return baseFilteredLeads.filter((lead) => {
      if (insightFilter === 'without_owner') return !lead.assigned_to && !['closed_won', 'closed_lost'].includes(lead.kanban_stage);
      if (insightFilter === 'stalled') return isStalledLead(lead);
      if (insightFilter === 'scheduled') return lead.kanban_stage === 'scheduled';
      if (insightFilter === 'overdue_follow_up') return !!lead.next_action_at && new Date(lead.next_action_at).getTime() < Date.now();
      if (insightFilter === 'high_priority') return lead.priority_level === 'high';
      if (insightFilter === 'proposal_open') return lead.kanban_stage === 'proposal_sent';
      return true;
    }).sort((a, b) => {
      const priorityDiff = getPriorityRank(a.priority_level) - getPriorityRank(b.priority_level);
      if (priorityDiff !== 0) return priorityDiff;

      const aFollowUp = a.next_action_at ? new Date(a.next_action_at).getTime() : Number.MAX_SAFE_INTEGER;
      const bFollowUp = b.next_action_at ? new Date(b.next_action_at).getTime() : Number.MAX_SAFE_INTEGER;
      if (aFollowUp !== bFollowUp) return aFollowUp - bFollowUp;

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [baseFilteredLeads, insightFilter]);

  const stageGroups = useMemo(() => {
    return configuredStages.map((stage) => {
      const items = filteredLeads.filter((lead) => lead.kanban_stage === stage.code);
      const totalValue = items.reduce((sum, lead) => {
        const matched = proposalMap[lead.proposal_id || ''];
        return sum + Number(matched?.final_amount || 0);
      }, 0);
      return { ...stage, items, totalValue };
    });
  }, [configuredStages, filteredLeads, proposalMap]);

  const selectedLeads = useMemo(
    () => filteredLeads.filter((lead) => selectedLeadIds.includes(lead.id)),
    [filteredLeads, selectedLeadIds]
  );

  const topKpis = useMemo(() => {
    const activePipeline = filteredLeads.filter((lead) => !['closed_won', 'closed_lost'].includes(lead.kanban_stage));
    const closedWon = filteredLeads.filter((lead) => lead.kanban_stage === 'closed_won');
    const closedLost = filteredLeads.filter((lead) => lead.kanban_stage === 'closed_lost');
    const acceptedValues = closedWon.reduce((sum, lead) => {
      const proposal = proposalMap[lead.proposal_id || ''];
      return sum + Number(proposal?.final_amount || 0);
    }, 0);
    const pipelineValue = filteredLeads
      .filter((lead) => lead.kanban_stage === 'proposal_sent')
      .reduce((sum, lead) => {
        const proposal = proposalMap[lead.proposal_id || ''];
        return sum + Number(proposal?.final_amount || 0);
      }, 0);

    return {
      total: activePipeline.length,
      conversion: closedWon.length + closedLost.length > 0 ? Math.round((closedWon.length / (closedWon.length + closedLost.length)) * 100) : 0,
      ticket: closedWon.length ? acceptedValues / closedWon.length : 0,
      pipelineValue,
    };
  }, [filteredLeads, proposalMap]);

  const commercialInsights = useMemo(() => {
    const now = Date.now();
    const stalledLeads = baseFilteredLeads.filter((lead) => {
      const lastTouch = new Date(lead.last_interaction_at || lead.stage_changed_at || lead.created_at).getTime();
      const daysWithoutProgress = (now - lastTouch) / (1000 * 60 * 60 * 24);
      return !['closed_won', 'closed_lost'].includes(lead.kanban_stage) && daysWithoutProgress > 3;
    });

    const withoutOwner = baseFilteredLeads.filter((lead) =>
      !lead.assigned_to && !['closed_won', 'closed_lost'].includes(lead.kanban_stage)
    );

    const nextEvaluations = baseFilteredLeads.filter((lead) => lead.kanban_stage === 'scheduled').length;
    const highPriority = baseFilteredLeads.filter((lead) => lead.priority_level === 'high').length;
    const awaitingProposalResponse = baseFilteredLeads.filter((lead) => lead.kanban_stage === 'proposal_sent').length;
    const overdueFollowUps = baseFilteredLeads.filter((lead) => !!lead.next_action_at && new Date(lead.next_action_at).getTime() < now).length;

    const topSources = Object.entries(
      baseFilteredLeads.reduce<Record<string, number>>((acc, lead) => {
        const source = normalizeLeadSource(lead.source);
        acc[source] = (acc[source] || 0) + 1;
        return acc;
      }, {})
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const ownerCoverage = baseFilteredLeads.length
      ? Math.round(((baseFilteredLeads.length - withoutOwner.length) / baseFilteredLeads.length) * 100)
      : 0;

    const renewalWithoutAction = renewalTasks.filter((task) => (task.days_since_last_action || 0) >= 3).length;

    return {
      stalledLeads,
      withoutOwner,
      nextEvaluations,
      highPriority,
      awaitingProposalResponse,
      overdueFollowUps,
      topSources,
      ownerCoverage,
      renewalWithoutAction,
    };
  }, [baseFilteredLeads, renewalTasks]);

  const sortedRenewalTasks = useMemo(() => {
    const score = (task: RenewalTaskRow) => {
      const level = getRenewalAlertLevel(task.days_since_last_action || 0);
      if (level === 'critical') return 0;
      if (level === 'warning') return 1;
      return 2;
    };

    return [...renewalTasks].sort((a, b) => {
      const s = score(a) - score(b);
      if (s !== 0) return s;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [renewalTasks]);

  const renewalInteractionsByTask = useMemo(() => {
    const map = new Map<string, RenewalInteractionRow[]>();
    renewalInteractions.forEach((interaction) => {
      const list = map.get(interaction.renewal_task_id) || [];
      list.push(interaction);
      map.set(interaction.renewal_task_id, list);
    });
    return map;
  }, [renewalInteractions]);

  useEffect(() => {
    if (renewalTasks.length === 0) return;
    setRenewalsExpanded(true);
  }, [renewalTasks.length]);

  const insightFilterLabel = useMemo(() => {
    if (insightFilter === 'without_owner') return 'Sem responsável definido';
    if (insightFilter === 'stalled') return 'Parados há mais de 3 dias';
    if (insightFilter === 'scheduled') return 'Avaliações agendadas';
    if (insightFilter === 'overdue_follow_up') return 'Follow-up atrasado';
    if (insightFilter === 'high_priority') return 'Alta prioridade';
    if (insightFilter === 'proposal_open') return 'Propostas abertas';
    return '';
  }, [insightFilter]);

  const createLeadMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !quickForm.full_name.trim() || !quickForm.phone.trim()) {
        throw new Error('Nome e telefone são obrigatórios.');
      }

      const normalizedPhone = normalizePhone(quickForm.phone);
      const duplicate = leads.find((lead) =>
        normalizePhone(lead.phone) === normalizedPhone ||
        (!!quickForm.cpf && !!lead.cpf && lead.cpf === quickForm.cpf)
      );

      if (duplicate) {
        throw new Error(`Já existe um lead com esse telefone/CPF: ${duplicate.full_name}.`);
      }

      const payload = {
        clinic_id: clinicId,
        full_name: quickForm.full_name.trim(),
        phone: quickForm.phone.trim(),
        cpf: quickForm.cpf.trim() || null,
        email: quickForm.email.trim() || null,
        zip_code: quickForm.zip_code.trim() || null,
        address: quickForm.address.trim() || null,
        city: quickForm.city.trim() || null,
        state: quickForm.state.trim() || null,
        source: quickForm.source ? normalizeLeadSource(quickForm.source) : null,
        priority_level: quickForm.priority_level,
        assigned_to: quickForm.assigned_to === 'unassigned' ? null : quickForm.assigned_to,
        treatments_of_interest: quickForm.treatment === 'none' ? [] : [quickForm.treatment],
        notes: quickForm.notes.trim() || null,
        created_by: user?.id || null,
      };

      let requestPayload = payload;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { data, error } = await supabase.from('leads').insert(requestPayload).select('*').single();
        if (!error) return data as LeadRow;

        const missingColumn = getSchemaMissingColumn(error);
        if (!missingColumn) throw error;

        requestPayload = stripUnsupportedLeadFields(requestPayload, missingColumn);
      }

      throw new Error('Não foi possível criar o lead com a estrutura atual do banco.');
    },
    onSuccess: (lead) => {
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      setQuickCreateOpen(false);
      setQuickForm({ full_name: '', phone: '', cpf: '', email: '', zip_code: '', address: '', city: '', state: '', source: '', priority_level: 'medium', assigned_to: 'unassigned', treatment: 'none', notes: '' });
      toast({ title: 'Lead criado', description: `${lead.full_name} entrou em Novo Lead.` });
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const createProposalFromCrmMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !proposalLead || !proposalPatientId) {
        throw new Error('Selecione um lead válido para criar a proposta.');
      }
      if (proposalItems.length === 0) {
        throw new Error('Inclua ao menos um tratamento na proposta.');
      }
      if (proposalItems.some((item) => !item.treatment_id || item.quantity <= 0 || item.unit_price <= 0)) {
        throw new Error('Revise tratamento, quantidade e valor dos itens.');
      }

      const proposalNumber = generateProposalNumber();
      const { data: proposal, error } = await supabase
        .from('proposals')
        .insert({
          clinic_id: clinicId,
          patient_id: proposalPatientId,
          proposal_number: proposalNumber,
          total_amount: proposalTotal,
          final_amount: proposalTotal,
          notes: proposalNotes.trim() || null,
          valid_until: proposalValidUntil || null,
          created_by: user?.id || null,
        })
        .select('id, proposal_number, status, final_amount, patient_id, notes, created_at')
        .single();
      if (error) throw error;

      const proposalItemPayload = proposalItems.map((item) => ({
        proposal_id: proposal.id,
        treatment_id: item.treatment_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: item.quantity * item.unit_price,
      }));
      const { error: itemsError } = await supabase.from('proposal_items').insert(proposalItemPayload);
      if (itemsError) throw itemsError;

      const { error: leadError } = await supabase
        .from('leads')
        .update({
          patient_id: proposalPatientId,
          proposal_id: proposal.id,
          kanban_stage: 'proposal_sent',
        })
        .eq('clinic_id', clinicId)
        .eq('id', proposalLead.id);
      if (leadError) throw leadError;

      const itemsWithNames = proposalItems.map((item) => ({
        ...item,
        subtotal: item.quantity * item.unit_price,
        treatments: { name: treatmentMap[item.treatment_id] || 'Tratamento' },
      }));

      return {
        ...(proposal as LeadProposalRow),
        patients: { full_name: proposalLead.full_name, payer_id: null, is_self_payer: true },
        items: itemsWithNames,
        leadId: proposalLead.id,
      };
    },
    onSuccess: (proposal) => {
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      qc.invalidateQueries({ queryKey: ['crm-proposals'] });
      qc.invalidateQueries({ queryKey: ['crm-all-proposals'] });
      qc.invalidateQueries({ queryKey: ['proposals'] });
      setLeadDrawer((current) => current?.id === proposal.leadId
        ? { ...current, patient_id: proposal.patient_id, proposal_id: proposal.id, kanban_stage: 'proposal_sent' }
        : current
      );
      resetProposalDialog();
      setProposalViewDialog(proposal);
      toast({ title: 'Proposta criada', description: `${proposal.proposal_number} aberta para negociação.` });
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const updateRenewalMutation = useMutation({
    mutationFn: async ({
      task,
      actionType,
      notes,
      patch,
    }: {
      task: RenewalTaskRow;
      actionType: 'whatsapp_sent' | 'call_attempted' | 'revaluation_scheduled' | 'snoozed' | 'converted' | 'discarded' | 'note';
      notes?: string;
      patch?: Record<string, unknown>;
    }) => {
      const updatePayload = {
        last_action_at: new Date().toISOString(),
        last_action_type: actionType,
        ...patch,
      };

      const { error: updateError } = await supabase
        .from('renewal_tasks' as unknown)
        .update(updatePayload)
        .eq('id', task.id);
      if (updateError) throw updateError;

      const { error: interactionError } = await supabase.from('renewal_interactions' as unknown).insert({
        clinic_id: task.clinic_id,
        renewal_task_id: task.id,
        patient_id: task.patient_id,
        type: actionType,
        notes: notes || null,
        performed_by: user?.id || null,
      });
      if (interactionError) throw interactionError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-renewal-tasks'] });
      toast({ title: 'Renovação atualizada' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    },
  });

  async function ensurePatientForLead(lead: LeadRow) {
    if (lead.patient_id) return lead.patient_id;

    const { data, error } = await supabase
      .from('patients')
      .insert({
        clinic_id: lead.clinic_id,
        full_name: lead.full_name,
        phone: lead.phone,
        cpf: lead.cpf,
        email: lead.email,
        date_of_birth: lead.birth_date,
        zip_code: lead.zip_code,
        address: lead.address,
        city: lead.city,
        state: lead.state,
        notes: lead.notes,
        status: 'active',
      })
      .select('id')
      .single();

    if (error) throw error;

    const convertedAt = new Date().toISOString();

    await supabase.from('leads')
      .update({ patient_id: data.id, converted_at: convertedAt })
      .eq('id', lead.id);

    qc.invalidateQueries({ queryKey: ['crm-leads'] });
    qc.invalidateQueries({ queryKey: ['patients-list'] });
    qc.invalidateQueries({ queryKey: ['patients-select'] });

    if (leadDrawer?.id === lead.id) {
      setLeadDrawer({ ...leadDrawer, patient_id: data.id, converted_at: convertedAt });
    }

    return data.id as string;
  }

  async function registerLeadInteraction({
    lead,
    type,
    notes,
    autoAdvance,
  }: {
    lead: LeadRow;
    type: string;
    notes?: string | null;
    autoAdvance?: boolean;
  }) {
    const { error } = await supabase.from('lead_interactions').insert({
      clinic_id: lead.clinic_id,
      lead_id: lead.id,
      type,
      notes: notes || null,
      performed_by: user?.id || null,
    });
    if (error) throw error;

    if (autoAdvance && lead.kanban_stage === 'new_lead') {
      const { error: updateError } = await supabase.from('leads')
        .update({ kanban_stage: 'contacted' })
        .eq('clinic_id', lead.clinic_id)
        .eq('id', lead.id);
      if (updateError) throw updateError;
    }
  }

  async function transitionLeadStage({
    lead,
    targetStage,
    lostReason,
    lostReasonNotes,
  }: {
    lead: LeadRow;
    targetStage: StageCode;
    lostReason?: string;
    lostReasonNotes?: string;
  }) {
    if (['closed_won', 'closed_lost'].includes(lead.kanban_stage) && role !== 'admin' && targetStage !== lead.kanban_stage) {
      throw new Error('Apenas admin pode reabrir lead fechado ou perdido.');
    }

    if (targetStage === 'proposal_sent' && !lead.proposal_id) {
      throw new Error('Crie ou vincule uma proposta antes de mover para Proposta Enviada.');
    }

    let nextPatientId = lead.patient_id;
    let nextAppointmentId = lead.appointment_id;
    const patch: Record<string, unknown> = {
      kanban_stage: targetStage,
    };

    if (targetStage === 'scheduled') {
      if (!lead.appointment_id) {
        throw new Error('Para mover para Agendado, primeiro confirme data, hora e profissional na Agenda.');
      }

      const { data: appointment, error } = await supabase.from('appointments')
        .select('id, professional_id, start_time, scheduled_at, status')
        .eq('clinic_id', lead.clinic_id)
        .eq('lead_id', lead.id)
        .eq('id', lead.appointment_id)
        .maybeSingle();

      if (error) throw error;
      if (!appointment) {
        throw new Error('Agendamento vinculado não encontrado. Abra a Agenda e confirme data, hora e profissional antes de mover.');
      }
      if (!appointment.professional_id || !(appointment.start_time || appointment.scheduled_at)) {
        throw new Error('O agendamento precisa ter profissional, data e hora confirmados antes de mover para Agendado.');
      }
      if (!isSchedulableAppointmentStatus(appointment.status)) {
        throw new Error('O agendamento vinculado precisa estar com status Agendado ou Confirmado.');
      }
    }

    if (targetStage === 'proposal_sent' && lead.appointment_id) {
      const { error } = await supabase.from('appointments')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', lead.appointment_id);
      if (error) throw error;
    }

    if (targetStage === 'closed_won') {
      if (!lead.proposal_id) {
        throw new Error('Vincule uma proposta antes de fechar o lead.');
      }
      nextPatientId = await ensurePatientForLead(lead);
      patch.patient_id = nextPatientId;
      patch.converted_at = new Date().toISOString();
    }

    if (targetStage === 'closed_lost') {
      if (!lostReason) {
        throw new Error('Informe o motivo da perda.');
      }
      patch.lost_reason = lostReason;
      patch.lost_reason_notes = lostReasonNotes || null;
    }

    const { error } = await supabase.from('leads').update(patch).eq('id', lead.id);
    if (error) throw error;

    return { nextPatientId, nextAppointmentId };
  }

  const moveLeadMutation = useMutation({
    mutationFn: async ({ lead, targetStage, lostReason, lostReasonNotes }: { lead: LeadRow; targetStage: StageCode; lostReason?: string; lostReasonNotes?: string }) => {
      return transitionLeadStage({ lead, targetStage, lostReason, lostReasonNotes });
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['patients'] });
      if (leadDrawer?.id === variables.lead.id) {
        setLeadDrawer({ ...leadDrawer, kanban_stage: variables.targetStage });
      }
      toast({ title: 'Lead atualizado', description: `Movido para ${stageMap[variables.targetStage]?.label || variables.targetStage}.` });
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const requestLeadStageMove = (lead: LeadRow, targetStage: StageCode) => {
    if (targetStage === lead.kanban_stage) return;
    if (targetStage === 'scheduled' && !lead.appointment_id) {
      toast({
        title: 'Agende primeiro',
        description: 'Confirme data, hora e profissional na Agenda antes de mover o lead para Agendado.',
      });
      navigate(buildEvaluationScheduleLink(lead.id, lead.assigned_to || null));
      return;
    }
    if (targetStage === 'closed_lost') {
      setLossModal({ lead, targetStage });
      return;
    }
    moveLeadMutation.mutate({ lead, targetStage });
  };

  const handleQuickCepChange = async (value: string) => {
    const zipCode = formatCep(value);
    setQuickForm((current) => ({ ...current, zip_code: zipCode }));

    if (zipCode.replace(/\D/g, '').length !== 8) return;

    try {
      const address = await lookupCepAddress(zipCode);
      if (!address) {
        toast({ title: 'CEP não encontrado', variant: 'destructive' });
        return;
      }
      setQuickForm((current) => {
        if (current.zip_code.replace(/\D/g, '') !== zipCode.replace(/\D/g, '')) return current;
        return {
          ...current,
          zip_code: address.zip_code,
          address: address.address || current.address,
          city: address.city || current.city,
          state: address.state || current.state,
        };
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Não foi possível consultar o CEP.';
      toast({ title: 'Erro ao consultar CEP', description: message, variant: 'destructive' });
    }
  };

  const handleLeadCepChange = async (value: string) => {
    if (!leadDrawer) return;
    const zipCode = formatCep(value);
    setLeadDrawer({ ...leadDrawer, zip_code: zipCode });

    if (zipCode.replace(/\D/g, '').length !== 8) return;

    try {
      const address = await lookupCepAddress(zipCode);
      if (!address) {
        toast({ title: 'CEP não encontrado', variant: 'destructive' });
        return;
      }
      setLeadDrawer((current) => {
        if (!current || current.zip_code?.replace(/\D/g, '') !== zipCode.replace(/\D/g, '')) return current;
        return {
          ...current,
          zip_code: address.zip_code,
          address: address.address || current.address,
          city: address.city || current.city,
          state: address.state || current.state,
        };
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Não foi possível consultar o CEP.';
      toast({ title: 'Erro ao consultar CEP', description: message, variant: 'destructive' });
    }
  };

  const saveLeadMutation = useMutation({
    mutationFn: async (payload: Partial<LeadRow>) => {
      if (!leadDrawer) return;
      let requestPayload = payload;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { error } = await supabase.from('leads').update(requestPayload).eq('id', leadDrawer.id);
        if (!error) break;

        const missingColumn = getSchemaMissingColumn(error);
        if (!missingColumn) throw error;

        requestPayload = stripUnsupportedLeadFields(requestPayload, missingColumn);
        if (Object.keys(requestPayload).length === 0) return;
      }

      if ('assigned_to' in requestPayload && leadDrawer.appointment_id) {
        const professionalId = requestPayload.assigned_to || null;
        const { error: appointmentError } = await supabase.from('appointments')
          .update({ professional_id: professionalId })
          .eq('clinic_id', leadDrawer.clinic_id)
          .eq('id', leadDrawer.appointment_id);
        if (appointmentError) throw appointmentError;
      }

      if (leadDrawer.patient_id) {
        const patientPayload = {
          full_name: requestPayload.full_name ?? leadDrawer.full_name,
          phone: requestPayload.phone ?? leadDrawer.phone,
          cpf: requestPayload.cpf ?? leadDrawer.cpf,
          email: requestPayload.email ?? leadDrawer.email,
          zip_code: requestPayload.zip_code ?? leadDrawer.zip_code,
          address: requestPayload.address ?? leadDrawer.address,
          city: requestPayload.city ?? leadDrawer.city,
          state: requestPayload.state ?? leadDrawer.state,
          notes: requestPayload.notes ?? leadDrawer.notes,
        };
        const { error: patientError } = await supabase.from('patients')
          .update(patientPayload)
          .eq('clinic_id', leadDrawer.clinic_id)
          .eq('id', leadDrawer.patient_id);
        if (patientError) throw patientError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
      toast({ title: 'Lead atualizado' });
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const assignLeadMutation = useMutation({
    mutationFn: async ({ leadId, assignedTo, appointmentId, clinicId: targetClinicId }: { leadId: string; assignedTo: string | null; appointmentId: string | null; clinicId: string }) => {
      const { error } = await supabase.from('leads')
        .update({ assigned_to: assignedTo })
        .eq('clinic_id', targetClinicId)
        .eq('id', leadId);
      if (error) throw error;

      if (appointmentId) {
        const professionalId = assignedTo || null;
        const { error: appointmentError } = await supabase.from('appointments')
          .update({ professional_id: professionalId })
          .eq('clinic_id', targetClinicId)
          .eq('id', appointmentId);
        if (appointmentError) throw appointmentError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
      toast({ title: 'Responsável atualizado' });
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const bulkAssignMutation = useMutation({
    mutationFn: async (assignedTo: string | null) => {
      for (const lead of selectedLeads) {
        const { error } = await supabase.from('leads')
          .update({ assigned_to: assignedTo })
          .eq('clinic_id', lead.clinic_id)
          .eq('id', lead.id);
        if (error) throw error;

        if (lead.appointment_id) {
          const professionalId = assignedTo || null;
          const { error: appointmentError } = await supabase.from('appointments')
            .update({ professional_id: professionalId })
            .eq('clinic_id', lead.clinic_id)
            .eq('id', lead.appointment_id);
          if (appointmentError) throw appointmentError;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
      setSelectedLeadIds([]);
      setBulkAssignValue('unassigned');
      toast({ title: 'Responsável atualizado em lote' });
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const bulkMoveStageMutation = useMutation({
    mutationFn: async (targetStage: StageCode) => {
      if (targetStage === 'closed_lost') {
        throw new Error('Perda em lote exige motivo. Faça essa ação lead por lead.');
      }

      for (const lead of selectedLeads) {
        if (lead.kanban_stage === targetStage) continue;
        await transitionLeadStage({ lead, targetStage });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['patients'] });
      setSelectedLeadIds([]);
      setBulkStageValue('none');
      toast({ title: 'Etapa atualizada em lote' });
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const createInteractionMutation = useMutation({
    mutationFn: async () => {
      if (!leadDrawer) return;
      const { error } = await supabase.from('lead_interactions').insert({
        clinic_id: leadDrawer.clinic_id,
        lead_id: leadDrawer.id,
        type: interactionForm.type,
        notes: interactionForm.notes.trim() || null,
        performed_by: user?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-interactions'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      setInteractionOpen(false);
      setInteractionForm({ type: 'call_made', notes: '' });
      toast({ title: 'Interação registrada' });
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const quickInteractionMutation = useMutation({
    mutationFn: async ({ lead, type, notes, autoAdvance }: { lead: LeadRow; type: string; notes?: string; autoAdvance?: boolean }) => {
      await registerLeadInteraction({ lead, type, notes, autoAdvance });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-interactions'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      toast({ title: 'Interação registrada' });
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const completeFollowUpMutation = useMutation({
    mutationFn: async (lead: LeadRow) => {
      await registerLeadInteraction({
        lead,
        type: 'note',
        notes: `Follow-up executado: ${lead.next_action || 'ação concluída'}.`,
        autoAdvance: true,
      });

      const { error } = await supabase.from('leads')
        .update({
          next_action: null,
          next_action_at: null,
        })
        .eq('clinic_id', lead.clinic_id)
        .eq('id', lead.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-interactions'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      toast({ title: 'Follow-up concluído' });
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const bulkCompleteFollowUpMutation = useMutation({
    mutationFn: async () => {
      const dueLeads = selectedLeads.filter((lead) => isFollowUpDue(lead.next_action_at));
      if (dueLeads.length === 0) {
        throw new Error('Nenhum lead selecionado possui próxima ação vencida/para agora.');
      }

      for (const lead of dueLeads) {
        await registerLeadInteraction({
          lead,
          type: 'note',
          notes: `Follow-up executado em lote: ${lead.next_action || 'ação concluída'}.`,
          autoAdvance: true,
        });

        const { error } = await supabase.from('leads')
          .update({
            next_action: null,
            next_action_at: null,
          })
          .eq('clinic_id', lead.clinic_id)
          .eq('id', lead.id);
        if (error) throw error;
      }

      return dueLeads.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ['crm-interactions'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      setSelectedLeadIds([]);
      toast({ title: 'Follow-up em lote concluído', description: `${count} lead(s) atualizado(s).` });
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const generateContractFromCrmMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !contractDialogProposal) throw new Error('Selecione uma proposta.');
      if (selectedPaymentMethods.length === 0) throw new Error('Selecione ao menos uma forma de pagamento.');

      const proposalAmount = Number(contractDialogProposal.final_amount || 0);
      const amounts = selectedPaymentMethods.map((method) => Number(paymentConfig[method]?.amount || 0));
      if (amounts.some((value) => !Number.isFinite(value) || value <= 0)) {
        throw new Error('Informe um valor válido para cada forma selecionada.');
      }

      const installmentMethods = selectedPaymentMethods.filter((method) => method === 'card' || method === 'boleto');
      if (installmentMethods.some((method) => Number(paymentConfig[method]?.installments || 0) <= 0)) {
        throw new Error('Cartão e boleto exigem quantidade de parcelas maior que zero.');
      }

      const totalInformed = amounts.reduce((sum, value) => sum + value, 0);
      if (totalInformed + 0.0001 < proposalAmount) {
        throw new Error(
          `A soma das formas de pagamento (R$ ${totalInformed.toFixed(2)}) deve ser igual ou maior ao valor da proposta (R$ ${proposalAmount.toFixed(2)}).`
        );
      }

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
              clinic_id: clinicId,
              patient_id: contractDialogProposal.patient_id,
              name: payerData.new_payer.name.trim(),
              cpf: payerData.new_payer.cpf.trim(),
              birth_date: payerData.new_payer.birth_date || null,
            } as unknown)
            .select('id')
            .single();
          if (payerError) throw payerError;
          resolvedPayerId = (newPayer as { id: string }).id;
        } else {
          throw new Error('Selecione ou cadastre um pagador.');
        }
      }

      const now = new Date();
      const contractNumber = `CONT-${format(now, 'yyyyMM')}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`;
      const paymentNotes = buildContractPaymentNotes(
        selectedPaymentMethods,
        paymentConfig,
        paymentDetails,
        paymentConditionLabels[paymentCondition]
      );

      if (contractDialogProposal.status !== 'accepted') {
        const { error: proposalError } = await supabase
          .from('proposals')
          .update({ status: 'accepted' })
          .eq('clinic_id', clinicId)
          .eq('id', contractDialogProposal.id);
        if (proposalError) throw proposalError;
      }

      const { data: insertedContract, error } = await supabase
        .from('contracts')
        .insert({
          clinic_id: clinicId,
          patient_id: contractDialogProposal.patient_id,
          proposal_id: contractDialogProposal.id,
          contract_number: contractNumber,
          status: 'draft',
          created_by: user?.id || null,
          start_date: format(now, 'yyyy-MM-dd'),
          notes: paymentNotes,
          payer_id: payerData.is_self_payer ? null : resolvedPayerId,
        })
        .select('id')
        .single();
      if (error) throw error;

      if (insertedContract?.id) {
        await upsertContractFinancialForecast(insertedContract.id);
      }

      const { error: patientError } = await supabase
        .from('patients')
        .update({
          is_self_payer: payerData.is_self_payer,
          payer_id: payerData.is_self_payer ? null : resolvedPayerId,
        })
        .eq('id', contractDialogProposal.patient_id)
        .eq('clinic_id', clinicId);
      if (patientError) throw patientError;

      if (leadDrawer) {
        const { error: leadError } = await supabase
          .from('leads')
          .update({ kanban_stage: 'closed_won', proposal_id: contractDialogProposal.id })
          .eq('clinic_id', clinicId)
          .eq('id', leadDrawer.id);
        if (leadError) throw leadError;
      }

      return contractNumber;
    },
    onSuccess: (contractNumber) => {
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      qc.invalidateQueries({ queryKey: ['crm-proposals'] });
      qc.invalidateQueries({ queryKey: ['crm-contracts'] });
      qc.invalidateQueries({ queryKey: ['proposals'] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
      toast({ title: 'Contrato gerado!', description: `Nº ${contractNumber}` });
      setProposalViewDialog(null);
      resetContractDialog();
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const canOpenWhatsApp = (lead: LeadRow) => !!normalizePhone(lead.phone);

  const latestLeadProposal = leadProposals[0];
  const latestLeadContract = leadContracts[0];

  return (
    <div>
      <PageHeader title="CRM Kanban" description="Funil comercial de leads e avaliações da clínica">
        <div className="flex gap-2">
          <BrandButton variant="outline" onClick={() => navigate('/clinic/appointments')}>
            <CalendarDays className="w-4 h-4" />
            Agenda
          </BrandButton>
          <BrandButton onClick={() => setQuickCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            Novo Lead
          </BrandButton>
        </div>
      </PageHeader>

      <div className="mb-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <Card className="overflow-hidden border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-100/70 shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Leads no pipeline</p>
            <div className="mt-2 flex items-end justify-between">
              <p className="text-xl font-semibold tracking-tight text-slate-900">{topKpis.total}</p>
              <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-600 shadow-sm">Em aberto</span>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-sky-200 bg-gradient-to-br from-sky-50 via-white to-sky-100/70 shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-600">Taxa de conversão</p>
            <div className="mt-2 flex items-end justify-between">
              <p className="text-xl font-semibold tracking-tight text-slate-900">{topKpis.conversion}%</p>
              <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-sky-700 shadow-sm">Fechamento</span>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-violet-200 bg-gradient-to-br from-violet-50 via-white to-violet-100/70 shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-600">Ticket médio</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <p className="text-xl font-semibold tracking-tight text-slate-900">R$ {topKpis.ticket.toFixed(0)}</p>
              <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-violet-700 shadow-sm">Venda</span>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-emerald-100/70 shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-600">Receita no pipeline</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <p className="text-xl font-semibold tracking-tight text-slate-900">R$ {topKpis.pipelineValue.toFixed(0)}</p>
              <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-emerald-700 shadow-sm">Potencial</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-3 border-slate-200 bg-white/95 shadow-sm">
        <CardContent className="p-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome, telefone ou CPF..."
                className="h-10 rounded-lg border-slate-200 bg-slate-50/80 pl-10 text-sm"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:w-[620px] xl:grid-cols-4">
              <Select value={assignedFilter} onValueChange={setAssignedFilter}>
                <SelectTrigger className="h-10 rounded-lg border-slate-200 bg-slate-50/80 text-sm"><SelectValue placeholder="Responsável" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos responsáveis</SelectItem>
                  <SelectItem value="unassigned">Sem responsável</SelectItem>
                  {staff.map((member) => (
                    <SelectItem key={member.user_id} value={member.user_id}>{member.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="h-10 rounded-lg border-slate-200 bg-slate-50/80 text-sm"><SelectValue placeholder="Etapa" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas etapas</SelectItem>
                  {configuredStages.map((stage) => <SelectItem key={stage.code} value={stage.code}>{stage.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="h-10 rounded-lg border-slate-200 bg-slate-50/80 text-sm"><SelectValue placeholder="Origem" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas origens</SelectItem>
                  {availableSources.map((source) => <SelectItem key={source} value={source}>{getLeadSourceMeta(source).label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={viewMode} onValueChange={(value) => setViewMode(value as 'kanban' | 'list')}>
                <SelectTrigger className="h-10 rounded-lg border-slate-200 bg-slate-50/80 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="kanban">Kanban</SelectItem>
                  <SelectItem value="list">Lista</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-3 border-slate-200 bg-white/95 shadow-sm">
        <CardContent className="px-3 py-2.5">
          <button
            type="button"
            onClick={() => setDetailsExpanded((current) => !current)}
            className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:bg-slate-50"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Detalhes</p>
              <p className="mt-0.5 text-sm text-slate-700">
                Radar comercial, origens e pendências da operação
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{detailsExpanded ? 'Ocultar' : 'Expandir'}</span>
              {detailsExpanded ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            </div>
          </button>
        </CardContent>
      </Card>

      {detailsExpanded && (
      <div className="mb-4 grid gap-3 xl:grid-cols-[1.28fr_0.72fr]">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Radar comercial</p>
                <h3 className="mt-1 text-sm font-semibold tracking-tight text-slate-900">Onde a operação precisa agir agora</h3>
              </div>
              <div className="rounded-xl bg-slate-100 p-2 text-slate-500">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              <button
                type="button"
                onClick={() => toggleInsightFilter('stalled')}
                className={`rounded-xl border border-rose-200 bg-rose-50/80 p-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${insightFilter === 'stalled' ? 'ring-2 ring-rose-300' : ''}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-semibold text-rose-900">Parados há mais de 3 dias</p>
                  <AlertTriangle className="h-4 w-4 text-rose-500" />
                </div>
                <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{commercialInsights.stalledLeads.length}</p>
                <p className="mt-0.5 text-[11px] text-rose-700">Leads sem avanço recente</p>
              </button>
              <button
                type="button"
                onClick={() => toggleInsightFilter('scheduled')}
                className={`rounded-xl border border-sky-200 bg-sky-50/80 p-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${insightFilter === 'scheduled' ? 'ring-2 ring-sky-300' : ''}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-semibold text-sky-900">Avaliações agendadas</p>
                  <CalendarDays className="h-4 w-4 text-sky-500" />
                </div>
                <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{commercialInsights.nextEvaluations}</p>
                <p className="mt-0.5 text-[11px] text-sky-700">Leads aguardando comparecimento</p>
              </button>
              <button
                type="button"
                onClick={() => toggleInsightFilter('high_priority')}
                className={`rounded-xl border border-fuchsia-200 bg-fuchsia-50/80 p-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${insightFilter === 'high_priority' ? 'ring-2 ring-fuchsia-300' : ''}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-semibold text-fuchsia-900">Alta prioridade</p>
                  <TrendingUp className="h-4 w-4 text-fuchsia-500" />
                </div>
                <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{commercialInsights.highPriority}</p>
                <p className="mt-0.5 text-[11px] text-fuchsia-700">Leads que precisam de atenção especial</p>
              </button>
              <button
                type="button"
                onClick={() => toggleInsightFilter('overdue_follow_up')}
                className={`rounded-xl border border-orange-200 bg-orange-50/80 p-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${insightFilter === 'overdue_follow_up' ? 'ring-2 ring-orange-300' : ''}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-semibold text-orange-900">Follow-up atrasado</p>
                  <MessageSquare className="h-4 w-4 text-orange-500" />
                </div>
                <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{commercialInsights.overdueFollowUps}</p>
                <p className="mt-0.5 text-[11px] text-orange-700">Leads com próxima ação vencida</p>
              </button>
              <button
                type="button"
                onClick={() => toggleInsightFilter('proposal_open')}
                className={`rounded-xl border border-amber-200 bg-amber-50/80 p-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${insightFilter === 'proposal_open' ? 'ring-2 ring-amber-300' : ''}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-semibold text-amber-900">Propostas abertas</p>
                  <MessageSquare className="h-4 w-4 text-amber-500" />
                </div>
                <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{commercialInsights.awaitingProposalResponse}</p>
                <p className="mt-0.5 text-[11px] text-amber-700">
                  {commercialInsights.overdueFollowUps > 0
                    ? `${commercialInsights.overdueFollowUps} follow-up${commercialInsights.overdueFollowUps > 1 ? 's' : ''} atrasado${commercialInsights.overdueFollowUps > 1 ? 's' : ''}`
                    : 'Leads com proposta em andamento'}
                </p>
              </button>
              <button
                type="button"
                onClick={() => toggleInsightFilter('without_owner')}
                className={`rounded-xl border border-emerald-200 bg-emerald-50/80 p-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${insightFilter === 'without_owner' ? 'ring-2 ring-emerald-300' : ''}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-semibold text-emerald-900">Sem responsável definido</p>
                  <UserCheck2 className="h-4 w-4 text-emerald-500" />
                </div>
                <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{commercialInsights.withoutOwner.length}</p>
                <p className="mt-0.5 text-[11px] text-emerald-700">Leads sem dono atribuído</p>
              </button>
              <button
                type="button"
                className="rounded-xl border border-violet-200 bg-violet-50/80 p-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-semibold text-violet-900">Renovações sem ação</p>
                  <Clock3 className="h-4 w-4 text-violet-500" />
                </div>
                <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{commercialInsights.renewalWithoutAction}</p>
                <p className="mt-0.5 text-[11px] text-violet-700">Tarefas de renovação com SLA de 3+ dias</p>
              </button>
            </div>

            {sortedRenewalTasks.length > 0 && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
                <button
                  type="button"
                  onClick={() => setRenewalsExpanded((current) => !current)}
                  className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-left hover:bg-white/70"
                >
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Renovações pendentes</p>
                    <p className="text-sm font-semibold text-slate-900">🔄 Renovações pendentes ({sortedRenewalTasks.length})</p>
                  </div>
                  <div className="text-slate-500">{renewalsExpanded ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}</div>
                </button>

                {renewalsExpanded && (
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    {sortedRenewalTasks.map((task) => {
                      const alertLevel = getRenewalAlertLevel(task.days_since_last_action || 0);
                      const alertClasses = alertLevel === 'critical'
                        ? 'border-rose-300 bg-rose-50/70'
                        : alertLevel === 'warning'
                          ? 'border-amber-300 bg-amber-50/70'
                          : 'border-slate-200 bg-white';
                      const interactions = renewalInteractionsByTask.get(task.id) || [];
                      return (
                        <div key={task.id} className={`rounded-xl border p-2 ${alertClasses}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{task.patient_name}</p>
                              <p className="truncate text-xs text-slate-600">{task.treatment_name}</p>
                            </div>
                            <span className="text-[10px] text-slate-500">há {task.days_since_last_action || 0}d</span>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-600">
                            Sessão {task.sessions_completed || 0} de {task.sessions_total || 0} · LTV R$ {Number(task.patient_ltv || 0).toFixed(0)}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-600">
                            Sugestão: {task.suggested_treatment_name || task.treatment_name}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <BrandButton
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => {
                                if (!task.patient_phone) return;
                                const digits = task.patient_phone.replace(/\D/g, '');
                                window.open(`https://wa.me/55${digits}`, '_blank', 'noopener,noreferrer');
                                updateRenewalMutation.mutate({ task, actionType: 'whatsapp_sent' });
                              }}
                            >
                              WhatsApp
                            </BrandButton>
                            <BrandButton
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => {
                                if (task.patient_phone) {
                                  window.location.href = `tel:${task.patient_phone}`;
                                }
                                updateRenewalMutation.mutate({ task, actionType: 'call_attempted' });
                              }}
                            >
                              <Phone className="mr-1 h-3 w-3" /> Ligar
                            </BrandButton>
                            <BrandButton
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => {
                                navigate(`/clinic/appointments?openNew=1&patientId=${task.patient_id}&appointmentType=return&treatmentId=${task.treatment_id}`);
                                updateRenewalMutation.mutate({ task, actionType: 'revaluation_scheduled', patch: { status: 'revaluation_scheduled' } });
                              }}
                            >
                              Agendar reavaliação
                            </BrandButton>
                            <BrandButton
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => {
                                const snoozeDays = 7;
                                const until = addDays(startOfDay(new Date()), Math.min(snoozeDays, getSnoozeLimitDays())).toISOString();
                                updateRenewalMutation.mutate({
                                  task,
                                  actionType: 'snoozed',
                                  patch: {
                                    status: 'snoozed',
                                    snoozed_until: until,
                                    snooze_count: ((task as unknown as { snooze_count?: number }).snooze_count || 0) + 1,
                                  },
                                });
                              }}
                            >
                              Snooze 7d
                            </BrandButton>
                            <BrandButton
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => {
                                navigate(`/clinic/proposals?patientId=${task.patient_id}&openNew=1&treatmentId=${task.suggested_treatment_id || task.treatment_id}&renewalTaskId=${task.id}`);
                                updateRenewalMutation.mutate({ task, actionType: 'converted', patch: { status: 'converted' } });
                              }}
                            >
                              Converter
                            </BrandButton>
                            <BrandButton
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-[11px] text-rose-700"
                              onClick={() => {
                                const reason = window.prompt('Motivo do descarte:');
                                if (!reason) return;
                                updateRenewalMutation.mutate({
                                  task,
                                  actionType: 'discarded',
                                  notes: reason,
                                  patch: { status: 'discarded', discarded_reason: reason },
                                });
                              }}
                            >
                              Descartar
                            </BrandButton>
                            <BrandButton
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => setRenewalHistoryTaskId((current) => (current === task.id ? null : task.id))}
                            >
                              {renewalHistoryTaskId === task.id ? 'Ocultar histórico' : 'Ver histórico'}
                            </BrandButton>
                          </div>
                          {renewalHistoryTaskId === task.id && (
                            <div className="mt-2 rounded-lg border border-slate-200 bg-white/80 p-2">
                              {interactions.length === 0 ? (
                                <p className="text-[11px] text-slate-500">Sem interações registradas ainda.</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {interactions.slice(0, 5).map((interaction) => (
                                    <div key={interaction.id} className="rounded-md bg-slate-50 px-2 py-1.5 text-[11px]">
                                      <p className="font-medium text-slate-700">{interaction.type}</p>
                                      <p className="text-slate-500">
                                        {format(new Date(interaction.performed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                      </p>
                                      {interaction.notes && <p className="text-slate-600">{interaction.notes}</p>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Leitura rápida</p>
            <div className="mt-2.5 space-y-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Origens que mais geram entrada</p>
                <div className="mt-2 space-y-1.5">
                  {commercialInsights.topSources.length === 0 && (
                    <p className="text-sm text-slate-500">Sem origem registrada ainda.</p>
                  )}
                  {commercialInsights.topSources.map(([source, count], index) => (
                    <button
                      type="button"
                      key={source}
                      onClick={() => setSourceFilter((current) => current === source ? 'all' : source)}
                      className={`flex w-full items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-left ring-1 ring-black/5 transition-colors hover:bg-slate-50 ${sourceFilter === source ? 'ring-sky-300' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
                          {index + 1}
                        </span>
                        <span className="text-[13px] font-medium text-slate-800">{getLeadSourceMeta(source).label}</span>
                      </div>
                      <span className="text-[13px] font-semibold text-slate-900">{count}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      )}

      {(insightFilter !== 'all' || sourceFilter !== 'all') && (
        <div className="mb-2 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
          <p className="text-sm text-slate-700">
            Filtro ativo:{' '}
            <span className="font-semibold text-slate-900">
              {[insightFilter !== 'all' ? insightFilterLabel : null, sourceFilter !== 'all' ? `Origem: ${getLeadSourceMeta(sourceFilter).label}` : null]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </p>
          <BrandButton size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={clearQuickFilters}>
            Limpar
          </BrandButton>
        </div>
      )}

      {viewMode === 'kanban' ? (
        <div className="pb-2">
          <div className="grid gap-2 lg:grid-cols-3 xl:grid-cols-6">
          {stageGroups.map((stage) => (
            <Card
              key={stage.code}
              className={`overflow-hidden border bg-gradient-to-b shadow-sm ${stage.surface}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (!dragLeadId) return;
                const dragged = leads.find((lead) => lead.id === dragLeadId);
                if (!dragged || dragged.kanban_stage === stage.code) return;
                requestLeadStageMove(dragged, stage.code);
              }}
            >
              <CardHeader className="space-y-1.5 border-b border-black/5 px-2.5 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-800">
                      {stage.label}
                    </CardTitle>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      {stage.items.length} {stage.items.length === 1 ? 'lead' : 'leads'} · R$ {stage.totalValue.toFixed(0)}
                    </p>
                  </div>
                  <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${stage.accent}`}>
                    {stage.items.length}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-1.5 p-1.5">
                {stage.items.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-white/70 px-2 py-4 text-center text-[11px] text-slate-500">
                    Nenhum lead nesta etapa.
                  </div>
                )}
                {stage.items.map((lead) => {
                  const isStale = Math.abs((Date.now() - new Date(lead.last_interaction_at || lead.stage_changed_at || lead.created_at).getTime()) / (1000 * 60 * 60 * 24)) > 3;
                  const followUp = getFollowUpStatus(lead.next_action_at);
                  const priority = getPriorityBadge(lead.priority_level);
                  const source = getLeadSourceMeta(lead.source);
                  return (
                    <button
                      key={lead.id}
                      draggable
                      onDragStart={() => setDragLeadId(lead.id)}
                      onClick={() => setLeadDrawer(lead)}
                      className={`w-full rounded-lg border bg-white/95 p-2 text-left shadow-sm ring-1 ring-black/5 transition-all hover:-translate-y-0.5 hover:shadow-md ${isStale ? 'border-rose-300' : 'border-slate-200'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 pr-2">
                          <p className="truncate text-[13px] font-semibold tracking-tight text-slate-900">{lead.full_name}</p>
                          {lead.next_action && (
                            <p className="mt-0.5 truncate text-[10px] text-slate-500">{lead.next_action}</p>
                          )}
                        </div>
                        <div className="rounded-full bg-slate-100 p-1 text-slate-400">
                          <GripVertical className="w-3 h-3" />
                        </div>
                      </div>
                      {lead.next_action_at && (
                        <div className="mt-1 flex justify-start">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${followUp.className}`}>
                            {followUp.label}
                          </span>
                        </div>
                      )}
                      {isFollowUpDue(lead.next_action_at) && (
                        <div className="mt-1.5 flex justify-start">
                          <BrandButton
                            size="sm"
                            variant="outline"
                            className="h-6 rounded-md border-amber-200 bg-amber-50 px-2 text-[10px] text-amber-800"
                            onClick={(event) => {
                              event.stopPropagation();
                              completeFollowUpMutation.mutate(lead);
                            }}
                            disabled={completeFollowUpMutation.isPending}
                          >
                            Concluir próxima ação
                          </BrandButton>
                        </div>
                      )}
                      <div className="mt-1 flex justify-start">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${priority.className}`}>
                          {priority.label}
                        </span>
                      </div>
                      {(lead.source || '').trim() && (
                        <div className="mt-1 flex justify-start">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${source.className}`}>
                            {source.label}
                          </span>
                        </div>
                      )}
                      {canOpenWhatsApp(lead) && (
                        <div className="mt-2 flex justify-end">
                          <BrandButton
                            size="sm"
                            variant="outline"
                            className="h-6 rounded-md border-slate-200 bg-white px-2 text-[10px]"
                            onClick={(event) => {
                              event.stopPropagation();
                              window.open(`https://wa.me/55${normalizePhone(lead.phone)}`, '_blank');
                            }}
                          >
                            WhatsApp
                          </BrandButton>
                        </div>
                      )}
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          ))}
          </div>
        </div>
      ) : (
        <Card className="shadow-card">
          <CardContent className="p-0">
            {selectedLeadIds.length > 0 && (
              <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">{selectedLeadIds.length}</span> lead(s) selecionado(s)
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Select value={bulkAssignValue} onValueChange={setBulkAssignValue}>
                    <SelectTrigger className="h-8 min-w-[220px] bg-white text-xs">
                      <SelectValue placeholder="Atribuir responsável" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Sem responsável</SelectItem>
                      {staff.map((member) => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          {member.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <BrandButton
                    size="sm"
                    className="h-8"
                    disabled={bulkAssignMutation.isPending}
                    onClick={() => bulkAssignMutation.mutate(bulkAssignValue === 'unassigned' ? null : bulkAssignValue)}
                  >
                    Aplicar responsável
                  </BrandButton>
                  <Select value={bulkStageValue} onValueChange={setBulkStageValue}>
                    <SelectTrigger className="h-8 min-w-[220px] bg-white text-xs">
                      <SelectValue placeholder="Mover etapa em lote" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecionar etapa</SelectItem>
                      {configuredStages.map((stage) => (
                        <SelectItem key={stage.code} value={stage.code}>
                          {stage.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <BrandButton
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={bulkMoveStageMutation.isPending || bulkStageValue === 'none'}
                    onClick={() => bulkMoveStageMutation.mutate(bulkStageValue)}
                  >
                    Aplicar etapa
                  </BrandButton>
                  <BrandButton
                    size="sm"
                    variant="outline"
                    className="h-8 border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                    disabled={bulkCompleteFollowUpMutation.isPending}
                    onClick={() => bulkCompleteFollowUpMutation.mutate()}
                  >
                    {bulkCompleteFollowUpMutation.isPending ? 'Concluindo...' : 'Concluir follow-up em lote'}
                  </BrandButton>
                  <BrandButton size="sm" variant="outline" className="h-8" onClick={() => setSelectedLeadIds([])}>
                    Limpar seleção
                  </BrandButton>
                </div>
              </div>
            )}
            <table className="w-full">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="w-12 px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
                    <Checkbox
                      checked={filteredLeads.length > 0 && filteredLeads.every((lead) => selectedLeadIds.includes(lead.id))}
                      onCheckedChange={(checked) => setSelectedLeadIds(checked ? filteredLeads.map((lead) => lead.id) : [])}
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Lead</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Origem</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Etapa</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Responsável</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Último contato</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Próxima ação</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Prioridade</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Risco</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => {
                  const stage = stageMap[lead.kanban_stage] || stageAppearance({ code: lead.kanban_stage, label: lead.kanban_stage, description: '' }, 0);
                  const risk = getRiskLabel(lead.last_credit_risk_level);
                  const followUp = getFollowUpStatus(lead.next_action_at);
                  const priority = getPriorityBadge(lead.priority_level);
                  const source = getLeadSourceMeta(lead.source);
                  return (
                    <tr key={lead.id} className="border-b hover:bg-secondary/20 cursor-pointer" onClick={() => setLeadDrawer(lead)}>
                      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={selectedLeadIds.includes(lead.id)}
                          onCheckedChange={(checked) =>
                            setSelectedLeadIds((current) =>
                              checked ? [...current, lead.id] : current.filter((id) => id !== lead.id)
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-sm text-foreground">{lead.full_name}</p>
                        <p className="text-xs text-muted-foreground">{lead.phone || 'Sem telefone'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${source.className}`}>{source.label}</span>
                      </td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${stage.accent}`}>{stage.label}</span></td>
                      <td className="px-4 py-3 text-sm text-muted-foreground" onClick={(event) => event.stopPropagation()}>
                        <Select
                          value={lead.assigned_to || 'unassigned'}
                          onValueChange={(value) => assignLeadMutation.mutate({
                            leadId: lead.id,
                            clinicId: lead.clinic_id,
                            appointmentId: lead.appointment_id,
                            assignedTo: value === 'unassigned' ? null : value,
                          })}
                        >
                          <SelectTrigger className="h-8 min-w-[180px] text-xs">
                            <SelectValue placeholder="Delegar responsável" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Sem responsável</SelectItem>
                            {staff.map((member) => (
                              <SelectItem key={member.user_id} value={member.user_id}>
                                {member.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{relativeDate(lead.last_interaction_at || lead.stage_changed_at)}</td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <p className="text-sm text-foreground">{lead.next_action || 'Sem próxima ação'}</p>
                          {lead.next_action_at && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${followUp.className}`}>
                                {format(new Date(lead.next_action_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                              </span>
                              {isFollowUpDue(lead.next_action_at) && (
                                <BrandButton
                                  size="sm"
                                  variant="outline"
                                  className="h-6 rounded-md border-amber-200 bg-amber-50 px-2 text-[10px] text-amber-800"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    completeFollowUpMutation.mutate(lead);
                                  }}
                                  disabled={completeFollowUpMutation.isPending}
                                >
                                  Concluir
                                </BrandButton>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${priority.className}`}>{priority.label}</span>
                      </td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${risk.className}`}>{risk.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={quickCreateOpen} onOpenChange={setQuickCreateOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader>
            <div className="border-b px-6 py-5">
              <DialogTitle>Novo lead</DialogTitle>
              <DialogDescription className="mt-1">
                Cadastre os dados comerciais e, quando disponível, complete as informações usadas no contrato.
              </DialogDescription>
            </div>
          </DialogHeader>
          <form
            className="space-y-5 px-6 py-5"
            onSubmit={(event) => {
              event.preventDefault();
              createLeadMutation.mutate();
            }}
          >
            <section className="rounded-lg border bg-card p-4">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-foreground">Dados do lead</h3>
                <p className="mt-1 text-xs text-muted-foreground">Informações mínimas para iniciar o atendimento comercial.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2 md:col-span-2">
                  <Label>Nome completo *</Label>
                  <Input value={quickForm.full_name} onChange={(event) => setQuickForm((current) => ({ ...current, full_name: event.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>Telefone / WhatsApp *</Label>
                  <Input value={quickForm.phone} onChange={(event) => setQuickForm((current) => ({ ...current, phone: event.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>CPF <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                  <Input value={quickForm.cpf} onChange={(event) => setQuickForm((current) => ({ ...current, cpf: event.target.value }))} />
                  <p className="text-xs text-muted-foreground">Não é necessário pedir CPF no primeiro contato.</p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>E-mail</Label>
                  <Input value={quickForm.email} onChange={(event) => setQuickForm((current) => ({ ...current, email: event.target.value }))} />
                </div>
              </div>
            </section>

            <section className="rounded-lg border bg-card p-4">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Endereço</h3>
                  <p className="text-xs text-muted-foreground mt-1">Mesmos campos do cadastro de paciente, úteis para formalizar contrato depois.</p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label>CEP</Label>
                    <Input value={quickForm.zip_code} onChange={(event) => handleQuickCepChange(event.target.value)} placeholder="00000-000" />
                  </div>
                  <div className="space-y-2 md:col-span-3">
                    <Label>Endereço completo</Label>
                    <Input value={quickForm.address} onChange={(event) => setQuickForm((current) => ({ ...current, address: event.target.value }))} placeholder="Rua, número, complemento e bairro" />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  <div className="space-y-2 md:col-span-3">
                    <Label>Cidade</Label>
                    <Input value={quickForm.city} onChange={(event) => setQuickForm((current) => ({ ...current, city: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>UF</Label>
                    <Input value={quickForm.state} onChange={(event) => setQuickForm((current) => ({ ...current, state: event.target.value.toUpperCase().slice(0, 2) }))} placeholder="SP" maxLength={2} />
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border bg-card p-4">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-foreground">Entrada comercial</h3>
                <p className="mt-1 text-xs text-muted-foreground">Origem, responsável e prioridade para organizar o CRM.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>Origem</Label>
                  <Select value={quickForm.source || 'none'} onValueChange={(value) => setQuickForm((current) => ({ ...current, source: value === 'none' ? '' : value }))}>
                    <SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não informado</SelectItem>
                      <SelectItem value="indicacao">Indicação</SelectItem>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="google">Google</SelectItem>
                      <SelectItem value="site">Site</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="whatsapp_ai">WhatsApp IA</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Responsável</Label>
                  <Select value={quickForm.assigned_to} onValueChange={(value) => setQuickForm((current) => ({ ...current, assigned_to: value }))}>
                    <SelectTrigger><SelectValue placeholder="Responsável" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Sem responsável</SelectItem>
                      {staff.map((member) => <SelectItem key={member.user_id} value={member.user_id}>{member.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Prioridade</Label>
                  <Select value={quickForm.priority_level} onValueChange={(value) => setQuickForm((current) => ({ ...current, priority_level: value }))}>
                    <SelectTrigger><SelectValue placeholder="Prioridade" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">Alta prioridade</SelectItem>
                      <SelectItem value="medium">Média prioridade</SelectItem>
                      <SelectItem value="low">Baixa prioridade</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tratamento de interesse</Label>
                  <Select value={quickForm.treatment} onValueChange={(value) => setQuickForm((current) => ({ ...current, treatment: value }))}>
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não informado</SelectItem>
                      {treatments.map((treatment) => <SelectItem key={treatment.id} value={treatment.id}>{treatment.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Label>Observações</Label>
                <Textarea value={quickForm.notes} onChange={(event) => setQuickForm((current) => ({ ...current, notes: event.target.value }))} rows={3} />
              </div>
            </section>

            <div className="sticky bottom-0 -mx-6 -mb-5 flex justify-end gap-3 border-t bg-card/95 px-6 py-4 backdrop-blur">
              <BrandButton type="button" variant="outline" onClick={() => setQuickCreateOpen(false)}>Cancelar</BrandButton>
              <BrandButton type="submit" disabled={createLeadMutation.isPending}>
                {createLeadMutation.isPending ? 'Salvando...' : 'Salvar lead'}
              </BrandButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={interactionOpen} onOpenChange={setInteractionOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar interação</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4 mt-4"
            onSubmit={(event) => {
              event.preventDefault();
              createInteractionMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={interactionForm.type} onValueChange={(value) => setInteractionForm((current) => ({ ...current, type: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {interactionTypes.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observação</Label>
              <Textarea value={interactionForm.notes} onChange={(event) => setInteractionForm((current) => ({ ...current, notes: event.target.value }))} rows={4} />
            </div>
            <div className="flex gap-3 pt-2">
              <BrandButton type="button" variant="outline" className="flex-1" onClick={() => setInteractionOpen(false)}>Cancelar</BrandButton>
              <BrandButton type="submit" className="flex-1" disabled={createInteractionMutation.isPending}>
                {createInteractionMutation.isPending ? 'Salvando...' : 'Registrar'}
              </BrandButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!lossModal} onOpenChange={() => setLossModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Motivo da perda</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Motivo *</Label>
              <Select value={lossForm.reason} onValueChange={(value) => setLossForm((current) => ({ ...current, reason: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {lostReasons.map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Detalhes</Label>
              <Textarea value={lossForm.notes} onChange={(event) => setLossForm((current) => ({ ...current, notes: event.target.value }))} rows={3} />
            </div>
            <div className="flex gap-3 pt-2">
              <BrandButton type="button" variant="outline" className="flex-1" onClick={() => setLossModal(null)}>Cancelar</BrandButton>
              <BrandButton
                className="flex-1"
                onClick={() => {
                  if (!lossModal) return;
                  moveLeadMutation.mutate({
                    lead: lossModal.lead,
                    targetStage: lossModal.targetStage,
                    lostReason: lossForm.reason,
                    lostReasonNotes: lossForm.notes,
                  });
                  setLossModal(null);
                  setLossForm({ reason: lostReasons[0], notes: '' });
                }}
              >
                Confirmar perda
              </BrandButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!leadDrawer} onOpenChange={(open) => !open && setLeadDrawer(null)}>
        <DialogContent className="flex h-[90vh] max-h-[90vh] max-w-5xl flex-col overflow-hidden rounded-2xl border-slate-200 p-0">
          {leadDrawer && (
            <>
              <DialogHeader className="shrink-0 border-b border-slate-200 px-5 py-3 text-left">
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <UserRound className="w-5 h-5 text-primary" />
                  {leadDrawer.full_name}
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getLeadSourceMeta(leadDrawer.source).className}`}>
                    {getLeadSourceMeta(leadDrawer.source).label}
                  </span>
                </DialogTitle>
                <DialogDescription>
                  {stageMap[leadDrawer.kanban_stage]?.label || leadDrawer.kanban_stage} · Responsável {leadDrawer.assigned_to ? staffMap[leadDrawer.assigned_to] || 'Equipe' : 'não atribuído'}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-3">
                <div className="mb-3 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                    {leadDrawer.phone || 'Sem telefone'}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                    {relativeDate(leadDrawer.last_interaction_at || leadDrawer.stage_changed_at)}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getRiskLabel(leadDrawer.last_credit_risk_level).className}`}>
                    {getRiskLabel(leadDrawer.last_credit_risk_level).label}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getPriorityBadge(leadDrawer.priority_level).className}`}>
                    {getPriorityBadge(leadDrawer.priority_level).label}
                  </span>
                  {leadDrawer.next_action_at && (
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getFollowUpStatus(leadDrawer.next_action_at).className}`}>
                      {getFollowUpStatus(leadDrawer.next_action_at).label}
                    </span>
                  )}
                  {leadDrawer.appointment_id && <BrandBadge status="scheduled" withDot={false}>Avaliação vinculada</BrandBadge>}
                  {leadDrawer.treatments_of_interest?.[0] && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                      {treatmentMap[leadDrawer.treatments_of_interest[0]] || leadDrawer.treatments_of_interest[0]}
                    </span>
                  )}
                  {latestLeadProposal && (
                    <button
                      type="button"
                      onClick={() => openExistingProposal(latestLeadProposal.id)}
                      className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200 transition hover:bg-amber-100"
                    >
                      Proposta {latestLeadProposal.proposal_number} · {latestLeadProposal.status}
                    </button>
                  )}
                  {latestLeadContract && (
                    <button
                      type="button"
                      onClick={() => openExistingContract(latestLeadContract.id)}
                      className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200 transition hover:bg-emerald-100"
                    >
                      Contrato {latestLeadContract.contract_number} · {latestLeadContract.process_status}
                    </button>
                  )}
                </div>

                <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end">
                    <div className="space-y-2 flex-1">
                      <Label>Mover etapa</Label>
                      <Select
                        value={leadDrawer.kanban_stage}
                        onValueChange={(value) => {
                          const targetStage = value as StageCode;
                          requestLeadStageMove(leadDrawer, targetStage);
                        }}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {configuredStages.map((stage) => <SelectItem key={stage.code} value={stage.code}>{stage.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <BrandButton size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => setInteractionOpen(true)}>
                        <MessageSquare className="w-4 h-4" />
                        Registrar interação
                      </BrandButton>
                      <BrandButton
                        size="sm"
                        variant="outline"
                        className="h-8 px-3 text-xs"
                        onClick={() =>
                          navigate(
                            buildEvaluationScheduleLink(
                              leadDrawer.id,
                              leadDrawer.assigned_to || null,
                            ),
                          )
                        }
                      >
                        <CalendarDays className="w-4 h-4" />
                        Agendar avaliação
                      </BrandButton>
                      {leadDrawer.kanban_stage === 'scheduled' && (
                        <BrandButton size="sm" className="h-8 px-3 text-xs" onClick={() => openProposalFlow(leadDrawer)}>
                          Nova proposta
                        </BrandButton>
                      )}
                      {leadDrawer.kanban_stage === 'proposal_sent' && (
                        <BrandButton size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => openProposalFlow(leadDrawer)}>
                          Criar proposta
                        </BrandButton>
                      )}
                      {leadDrawer.patient_id && (
                        <BrandButton size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => navigate(`/clinic/patients/${leadDrawer.patient_id}`)}>
                          Ver paciente
                        </BrandButton>
                      )}
                      {canOpenWhatsApp(leadDrawer) && (
                        <BrandButton
                          size="sm"
                          variant="outline"
                          className="h-8 px-3 text-xs"
                          onClick={() => window.open(`https://wa.me/55${normalizePhone(leadDrawer.phone)}`, '_blank')}
                        >
                          Abrir WhatsApp
                        </BrandButton>
                      )}
                    </div>
                  </div>
                </div>

                <Tabs defaultValue="general">
                  <TabsList className="mb-3 w-full justify-start overflow-x-auto rounded-lg bg-slate-100/80 p-1">
                    <TabsTrigger value="general">Dados Gerais</TabsTrigger>
                    <TabsTrigger value="interactions">Interações</TabsTrigger>
                    <TabsTrigger value="proposals">Propostas</TabsTrigger>
                    <TabsTrigger value="contracts">Contratos</TabsTrigger>
                    <TabsTrigger value="appointments">Agendamentos</TabsTrigger>
                  </TabsList>
                  <TabsContent value="general" className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Nome</Label>
                        <Input value={leadDrawer.full_name} onChange={(event) => setLeadDrawer({ ...leadDrawer, full_name: event.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Telefone</Label>
                        <Input value={leadDrawer.phone || ''} onChange={(event) => setLeadDrawer({ ...leadDrawer, phone: event.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>CPF <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                        <Input value={leadDrawer.cpf || ''} onChange={(event) => setLeadDrawer({ ...leadDrawer, cpf: event.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>E-mail</Label>
                        <Input value={leadDrawer.email || ''} onChange={(event) => setLeadDrawer({ ...leadDrawer, email: event.target.value })} />
                      </div>
                      <div className="space-y-4 rounded-lg border p-4 md:col-span-2 xl:col-span-3">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">Endereço</h3>
                          <p className="text-xs text-muted-foreground mt-1">Mesma base usada no cadastro de Novo Paciente e na formalização do contrato.</p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                          <div className="space-y-2">
                            <Label>CEP</Label>
                            <Input value={leadDrawer.zip_code || ''} onChange={(event) => handleLeadCepChange(event.target.value)} placeholder="00000-000" />
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <Label>Endereço completo</Label>
                            <Input value={leadDrawer.address || ''} onChange={(event) => setLeadDrawer({ ...leadDrawer, address: event.target.value })} placeholder="Rua, número, complemento e bairro" />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                          <div className="space-y-2 md:col-span-2">
                            <Label>Cidade</Label>
                            <Input value={leadDrawer.city || ''} onChange={(event) => setLeadDrawer({ ...leadDrawer, city: event.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label>UF</Label>
                            <Input value={leadDrawer.state || ''} onChange={(event) => setLeadDrawer({ ...leadDrawer, state: event.target.value.toUpperCase().slice(0, 2) })} placeholder="SP" maxLength={2} />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Origem</Label>
                        <Select value={leadDrawer.source ? normalizeLeadSource(leadDrawer.source) : 'none'} onValueChange={(value) => setLeadDrawer({ ...leadDrawer, source: value === 'none' ? null : value })}>
                          <SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Não informado</SelectItem>
                            <SelectItem value="indicacao">Indicação</SelectItem>
                            <SelectItem value="instagram">Instagram</SelectItem>
                            <SelectItem value="google">Google</SelectItem>
                            <SelectItem value="site">Site</SelectItem>
                            <SelectItem value="whatsapp">WhatsApp</SelectItem>
                            <SelectItem value="whatsapp_ai">WhatsApp IA</SelectItem>
                            <SelectItem value="outro">Outro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Responsável</Label>
                        <Select value={leadDrawer.assigned_to || 'unassigned'} onValueChange={(value) => setLeadDrawer({ ...leadDrawer, assigned_to: value === 'unassigned' ? null : value })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Sem responsável</SelectItem>
                            {staff.map((member) => <SelectItem key={member.user_id} value={member.user_id}>{member.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Prioridade</Label>
                        <Select
                          value={leadDrawer.priority_level || 'medium'}
                          onValueChange={(value) => setLeadDrawer({ ...leadDrawer, priority_level: value as 'high' | 'medium' | 'low' })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="high">Alta prioridade</SelectItem>
                            <SelectItem value="medium">Média prioridade</SelectItem>
                            <SelectItem value="low">Baixa prioridade</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Próxima ação</Label>
                        <Input
                          value={leadDrawer.next_action || ''}
                          onChange={(event) => setLeadDrawer({ ...leadDrawer, next_action: event.target.value })}
                          placeholder="Ex: Retornar proposta, ligar amanhã..."
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Data da próxima ação</Label>
                        <Input
                          type="datetime-local"
                          value={leadDrawer.next_action_at ? format(new Date(leadDrawer.next_action_at), "yyyy-MM-dd'T'HH:mm") : ''}
                          onChange={(event) => setLeadDrawer({ ...leadDrawer, next_action_at: event.target.value ? new Date(event.target.value).toISOString() : null })}
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2 xl:col-span-2">
                      <Label>Observações</Label>
                        <Textarea value={leadDrawer.notes || ''} onChange={(event) => setLeadDrawer({ ...leadDrawer, notes: event.target.value })} rows={3} />
                      </div>
                      <div className="space-y-2">
                        <Label>Tratamentos de interesse</Label>
                        <div className="flex flex-wrap gap-2">
                          {leadDrawer.treatments_of_interest?.length ? leadDrawer.treatments_of_interest.map((item) => (
                            <span key={item} className="rounded-full bg-secondary px-2 py-1 text-xs text-foreground">
                              {treatmentMap[item] || item}
                            </span>
                          )) : <span className="text-xs text-muted-foreground">Nenhum tratamento selecionado.</span>}
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="interactions">
                    <div className="space-y-3">
                      {interactions.length === 0 && (
                        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                          Nenhuma interação registrada.
                        </div>
                      )}
                      {interactions.map((interaction) => {
                        const typeLabel = interactionTypes.find((item) => item.value === interaction.type)?.label || interaction.type;
                        return (
                          <div key={interaction.id} className="rounded-xl border p-4">
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-medium text-foreground text-sm">{typeLabel}</p>
                              <span className="text-xs text-muted-foreground">{relativeDate(interaction.performed_at)}</span>
                            </div>
                            {interaction.notes && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{interaction.notes}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </TabsContent>
                  <TabsContent value="proposals">
                    <div className="space-y-3">
                      {!leadDrawer.patient_id && (
                        <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                          Este lead ainda não foi convertido em paciente. Feche a venda para vincular propostas e contratos.
                        </div>
                      )}
                      {leadDrawer.kanban_stage === 'proposal_sent' && (
                        <div className="flex justify-end">
                          <BrandButton size="sm" onClick={() => openProposalFlow(leadDrawer)}>
                            Criar nova proposta
                          </BrandButton>
                        </div>
                      )}
                      {leadDrawer.patient_id && leadProposals.length === 0 && (
                        <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                          Nenhuma proposta vinculada a este paciente ainda.
                        </div>
                      )}
                      {leadProposals.map((proposal) => {
                        const hasLinkedContract = leadContracts.some((contract) => contract.proposal_id === proposal.id);
                        const canGenerateContract = !hasLinkedContract && (proposal.status === 'draft' || proposal.status === 'sent' || proposal.status === 'accepted');
                        return (
                          <div key={proposal.id} className="rounded-xl border p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <button
                                  type="button"
                                  onClick={() => openExistingProposal(proposal.id)}
                                  className="text-left font-medium text-foreground text-sm underline-offset-4 hover:underline"
                                >
                                  {proposal.proposal_number}
                                </button>
                                <p className="text-xs text-muted-foreground">{relativeDate(proposal.created_at)}</p>
                              </div>
                              <div className="text-right">
                                <BrandBadge status={proposal.status === 'accepted' ? 'approved' : proposal.status === 'rejected' ? 'rejected' : proposal.status === 'draft' ? 'draft' : 'sent'}>
                                  {proposal.status}
                                </BrandBadge>
                                <p className="text-sm font-semibold text-foreground mt-1">R$ {Number(proposal.final_amount || 0).toFixed(0)}</p>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap justify-end gap-2 border-t pt-3">
                              {hasLinkedContract ? (
                                <span className="text-xs text-muted-foreground">Contrato já gerado para esta proposta</span>
                              ) : canGenerateContract ? (
                                <BrandButton size="sm" onClick={() => openLeadContractDialog(proposal)}>
                                  <FileText className="w-4 h-4" />
                                  {proposal.status === 'accepted' ? 'Gerar contrato' : 'Aprovar e gerar contrato'}
                                </BrandButton>
                              ) : (
                                <span className="text-xs text-muted-foreground">Proposta sem ação de contrato</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </TabsContent>
                  <TabsContent value="contracts">
                    <div className="space-y-3">
                      {!leadDrawer.patient_id && (
                        <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                          Este lead ainda não foi convertido em paciente. Os contratos aparecem depois da conversão e da proposta aprovada.
                        </div>
                      )}
                      {leadDrawer.patient_id && leadContracts.length === 0 && (
                        <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                          Nenhum contrato vinculado a este paciente ainda.
                        </div>
                      )}
                      {leadContracts.map((contract) => (
                        <div key={contract.id} className="rounded-xl border p-4 flex items-center justify-between gap-3">
                          <div>
                            <button
                              type="button"
                              onClick={() => openExistingContract(contract.id)}
                              className="text-left font-medium text-foreground text-sm underline-offset-4 hover:underline"
                            >
                              {contract.contract_number}
                            </button>
                            <p className="text-xs text-muted-foreground">{relativeDate(contract.created_at)}</p>
                          </div>
                          <div className="text-right">
                            <BrandBadge status={contract.process_status === 'confirmed' ? 'approved' : contract.process_status === 'pending_confirmation' ? 'sent' : contract.process_status === 'overdue' ? 'rejected' : 'draft'}>
                              {contract.process_status}
                            </BrandBadge>
                            {contract.proposal_id && (
                              <p className="mt-1 text-xs text-muted-foreground">Ligado a proposta</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                  <TabsContent value="appointments">
                    <div className="space-y-3">
                      {leadAppointments.length === 0 && (
                        <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                          Nenhum agendamento ligado a este lead.
                        </div>
                      )}
                      {leadAppointments.map((appointment) => (
                        <div key={appointment.id} className="rounded-xl border p-4 flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-foreground text-sm">{appointment.appointment_type === 'evaluation' ? 'Avaliação' : 'Agendamento'}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(appointment.scheduled_at || appointment.start_time), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </p>
                          </div>
                          <BrandBadge status={appointment.status === 'completed' ? 'completed' : appointment.status === 'confirmed' ? 'confirmed' : appointment.status === 'cancelled' ? 'cancelled' : appointment.status === 'no_show' ? 'no_show' : 'scheduled'}>
                            {appointment.status}
                          </BrandBadge>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
              <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-3">
                <div className="flex justify-end">
                  <BrandButton size="sm" onClick={() => saveLeadMutation.mutate({
                    full_name: leadDrawer.full_name,
                    phone: leadDrawer.phone,
                    cpf: leadDrawer.cpf,
                    email: leadDrawer.email,
                    zip_code: leadDrawer.zip_code,
                    address: leadDrawer.address,
                    city: leadDrawer.city,
                    state: leadDrawer.state,
                    source: leadDrawer.source ? normalizeLeadSource(leadDrawer.source) : null,
                    notes: leadDrawer.notes,
                    assigned_to: leadDrawer.assigned_to,
                    priority_level: leadDrawer.priority_level,
                    next_action: leadDrawer.next_action,
                    next_action_at: leadDrawer.next_action_at,
                  })}>
                    Salvar alterações
                  </BrandButton>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={proposalDialogOpen}
        onOpenChange={(open) => {
          if (!open) resetProposalDialog();
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova proposta</DialogTitle>
            <DialogDescription>
              Monte a proposta sem sair do CRM. Ao salvar, ela abre aqui mesmo para negociação.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              createProposalFromCrmMutation.mutate();
            }}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Lead / paciente</Label>
                <Input value={proposalLead?.full_name || leadDrawer?.full_name || ''} disabled />
              </div>
              <div className="space-y-2">
                <Label>Validade</Label>
                <Input type="date" value={proposalValidUntil} onChange={(event) => setProposalValidUntil(event.target.value)} />
              </div>
            </div>

            <section className="rounded-lg border bg-card p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Tratamentos</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Inclua os itens negociados na sala.</p>
                </div>
                <BrandButton type="button" size="sm" variant="outline" onClick={addProposalItem}>
                  <Plus className="w-4 h-4" />
                  Adicionar
                </BrandButton>
              </div>

              <div className="space-y-3">
                {proposalItems.length === 0 && (
                  <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                    Nenhum tratamento incluído.
                  </div>
                )}
                {proposalItems.map((item, index) => {
                  const treatment = treatments.find((current) => current.id === item.treatment_id);
                  const belowMinimum = treatment?.min_price && item.unit_price < Number(treatment.min_price);
                  return (
                    <div key={`${item.treatment_id}-${index}`} className="rounded-lg border p-3">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_90px_130px_40px] md:items-end">
                        <div className="space-y-2">
                          <Label>Tratamento</Label>
                          <Select
                            value={item.treatment_id}
                            onValueChange={(value) => {
                              const nextTreatment = treatments.find((current) => current.id === value);
                              setProposalItems((current) => current.map((row, rowIndex) => rowIndex === index
                                ? {
                                    ...row,
                                    treatment_id: value,
                                    unit_price: Number(nextTreatment?.default_price || nextTreatment?.price || row.unit_price || 0),
                                  }
                                : row
                              ));
                            }}
                          >
                            <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                            <SelectContent>
                              {treatments.map((current) => (
                                <SelectItem key={current.id} value={current.id}>{current.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Qtd</Label>
                          <Input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(event) => setProposalItems((current) => current.map((row, rowIndex) => rowIndex === index
                              ? { ...row, quantity: parseInt(event.target.value, 10) || 1 }
                              : row
                            ))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Valor unit.</Label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.unit_price}
                            onChange={(event) => setProposalItems((current) => current.map((row, rowIndex) => rowIndex === index
                              ? { ...row, unit_price: parseFloat(event.target.value) || 0 }
                              : row
                            ))}
                          />
                        </div>
                        <button
                          type="button"
                          className="rounded-md p-2 text-destructive hover:bg-destructive/10"
                          onClick={() => setProposalItems((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                          aria-label="Remover tratamento"
                        >
                          x
                        </button>
                      </div>
                      {belowMinimum && (
                        <p className="mt-2 text-xs text-destructive">Abaixo do mínimo: R$ {Number(treatment?.min_price || 0).toFixed(2)}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 rounded-md bg-secondary/40 px-3 py-2 text-right text-sm">
                Total: <span className="font-semibold text-foreground">R$ {proposalTotal.toFixed(2)}</span>
              </div>
            </section>

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={proposalNotes} onChange={(event) => setProposalNotes(event.target.value)} rows={3} />
            </div>

            <div className="flex justify-end gap-3 border-t pt-4">
              <BrandButton type="button" variant="outline" onClick={resetProposalDialog}>
                Cancelar
              </BrandButton>
              <BrandButton type="submit" disabled={createProposalFromCrmMutation.isPending || proposalItems.length === 0}>
                {createProposalFromCrmMutation.isPending ? 'Salvando...' : 'Salvar e visualizar'}
              </BrandButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!proposalViewDialog} onOpenChange={(open) => !open && setProposalViewDialog(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {proposalViewDialog && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between gap-3">
                  <span>Proposta {proposalViewDialog.proposal_number}</span>
                  <BrandBadge status={proposalViewDialog.status === 'accepted' ? 'approved' : proposalViewDialog.status === 'rejected' ? 'rejected' : proposalViewDialog.status === 'draft' ? 'draft' : 'sent'}>
                    {proposalStatusLabel[proposalViewDialog.status] || proposalViewDialog.status}
                  </BrandBadge>
                </DialogTitle>
                <DialogDescription>
                  {proposalViewDialog.patients?.full_name || leadDrawer?.full_name || 'Paciente'} · criada {relativeDate(proposalViewDialog.created_at)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/60">
                      <tr>
                        <th className="px-3 py-2 text-left">Tratamento</th>
                        <th className="px-3 py-2 text-center">Qtd</th>
                        <th className="px-3 py-2 text-right">Valor unit.</th>
                        <th className="px-3 py-2 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(proposalViewDialog.items || []).map((item, index) => (
                        <tr key={item.id || `${item.treatment_id}-${index}`} className="border-t">
                          <td className="px-3 py-2">{item.treatments?.name || treatmentMap[item.treatment_id] || 'Tratamento'}</td>
                          <td className="px-3 py-2 text-center">{item.quantity}</td>
                          <td className="px-3 py-2 text-right">R$ {Number(item.unit_price || 0).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-medium">R$ {Number(item.subtotal || item.quantity * item.unit_price || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {proposalViewDialog.notes && (
                  <div className="rounded-lg border bg-secondary/30 p-3 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Observações: </span>{proposalViewDialog.notes}
                  </div>
                )}

                <div className="rounded-lg bg-primary/5 p-4 text-right">
                  <span className="text-sm text-muted-foreground">Valor total</span>
                  <p className="text-2xl font-semibold text-foreground">R$ {Number(proposalViewDialog.final_amount || 0).toFixed(2)}</p>
                </div>

                <div className="flex flex-wrap justify-end gap-3 border-t pt-4">
                  <BrandButton variant="outline" onClick={() => setProposalViewDialog(null)}>
                    Fechar
                  </BrandButton>
                  {leadContracts.some((contract) => contract.proposal_id === proposalViewDialog.id) ? (
                    <BrandBadge status="approved">Contrato já gerado</BrandBadge>
                  ) : (
                    <BrandButton onClick={() => openLeadContractDialog(proposalViewDialog)}>
                      <FileText className="w-4 h-4" />
                      {proposalViewDialog.status === 'accepted' ? 'Gerar contrato' : 'Aprovar e gerar contrato'}
                    </BrandButton>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!contractDialogProposal}
        onOpenChange={(open) => {
          if (!open) resetContractDialog();
        }}
      >
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {contractDialogProposal?.status === 'accepted' ? 'Gerar contrato' : 'Aprovar proposta e gerar contrato'}
            </DialogTitle>
            <DialogDescription>
              Configure pagamento e pagador sem sair da negociação do lead.
            </DialogDescription>
          </DialogHeader>

          {contractDialogProposal && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-amber-50/60 p-4">
                <p className="text-sm font-semibold text-foreground">{contractDialogProposal.proposal_number}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {contractDialogProposal.patients?.full_name || leadDrawer?.full_name || 'Paciente'} · R$ {Number(contractDialogProposal.final_amount || 0).toFixed(2)}
                </p>
                {contractDialogProposal.status !== 'accepted' && (
                  <p className="mt-2 text-xs text-amber-800">
                    Ao confirmar, a proposta será marcada como aprovada e o lead irá para Fechado.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
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
                <div className="space-y-4">
                  <PayerSection
                    value={payerData}
                    onChange={setPayerData}
                    patientName={contractDialogProposal.patients?.full_name || leadDrawer?.full_name || undefined}
                  />
                  <div className="rounded-md border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
                    Valor da proposta: <span className="font-semibold text-foreground">R$ {Number(contractDialogProposal.final_amount || 0).toFixed(2)}</span> ·
                    Soma informada: <span className="font-semibold text-foreground">R$ {selectedPaymentMethods.reduce((sum, method) => sum + Number(paymentConfig[method]?.amount || 0), 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t pt-4">
                <BrandButton type="button" variant="outline" onClick={resetContractDialog}>
                  Cancelar
                </BrandButton>
                <BrandButton
                  type="button"
                  disabled={generateContractFromCrmMutation.isPending}
                  onClick={() => generateContractFromCrmMutation.mutate()}
                >
                  <FileText className="w-4 h-4" />
                  {generateContractFromCrmMutation.isPending ? 'Gerando...' : 'Confirmar e gerar contrato'}
                </BrandButton>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
