import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { BrandBadge, type BadgeStatus } from '@/components/ui/brand-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft, User, Phone, Mail, Calendar, ClipboardList, Activity, Camera,
  MessageSquare, Star, ExternalLink, Loader2, AlertTriangle, FileSignature, Upload, Edit
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

import PatientAnamneseTab from '@/components/anamnese/PatientAnamneseTab';
import { FileText as FileTextIcon } from 'lucide-react';
import { ContractStatusBadge } from '@/components/contracts/ContractStatusBadge';
import PayerSection, { type PayerData } from '@/components/patient/PayerSection';
import {
  ContractPaymentConfigurator,
  paymentConditionLabels,
  type PaymentCondition,
  type PaymentConfig,
  type PaymentMethod,
} from '@/components/contracts/ContractPaymentConfigurator';
import type { Database } from '@/integrations/supabase/types';
import { formatCep, lookupCepAddress } from '@/lib/cep';
import { buildContractPaymentNotes, upsertContractFinancialForecast } from '@/lib/contractFinance';

const PATIENT_FILES_BUCKET = 'patient-files';
const typeLabels: Record<string, string> = { before: 'Antes', during: 'Durante', after: 'Depois', progress: 'Progresso' };
const typeColors: Record<string, string> = { before: 'bg-blue-100 text-blue-700', during: 'bg-yellow-100 text-yellow-700', after: 'bg-green-100 text-green-700', progress: 'bg-purple-100 text-purple-700' };
const anamneseBadgeConfig: Record<string, { label: string; cls: string; hint: string }> = {
  valid: {
    label: 'Anamnese válida',
    cls: 'bg-green-100 text-green-700 border-green-200',
    hint: 'Paciente apto para seguir na agenda e nas sessões.',
  },
  expired: {
    label: 'Anamnese vencida',
    cls: 'bg-red-100 text-red-700 border-red-200',
    hint: 'Vale atualizar a ficha antes do próximo atendimento.',
  },
  pending: {
    label: 'Anamnese pendente',
    cls: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    hint: 'Complete ou revise a ficha para fechar o fluxo clínico.',
  },
  none: {
    label: 'Sem anamnese',
    cls: 'bg-muted text-muted-foreground border-border',
    hint: 'Cadastre a primeira anamnese para dar segurança ao atendimento.',
  },
};

type PatientEditForm = {
  full_name: string;
  email: string;
  phone: string;
  cpf: string;
  date_of_birth: string;
  gender: string;
  zip_code: string;
  address: string;
  city: string;
  state: string;
  notes: string;
};

function getPatientFilePath(value?: string | null) {
  if (!value) return null;
  if (!value.startsWith('http')) return value.replace(/^patient-files:/, '');

  try {
    const marker = `/storage/v1/object/public/${PATIENT_FILES_BUCKET}/`;
    const url = new URL(value);
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex === -1) return value;
    return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
  } catch {
    return value;
  }
}

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { clinicId } = useUserRole();
  const queryClient = useQueryClient();
  type AppointmentRow = Database['public']['Tables']['appointments']['Row'] & { treatments?: { name?: string | null } | null };
  type SessionRow = Database['public']['Tables']['session_records']['Row'] & { treatments?: { name?: string | null } | null };
  type PhotoRow = Database['public']['Tables']['patient_photos']['Row'];
  type MetricRow = Database['public']['Tables']['patient_metrics']['Row'];
  type FeedbackRow = Database['public']['Tables']['session_feedback']['Row'] & {
    session_records?: { performed_at?: string | null; treatments?: { name?: string | null } | null } | null;
  };
  type ProposalRow = Pick<Database['public']['Tables']['proposals']['Row'], 'id' | 'proposal_number' | 'status' | 'final_amount' | 'created_at' | 'valid_until' | 'patient_id'>;
  type ContractRow = Database['public']['Tables']['contracts']['Row'] & {
    proposals?: { proposal_number?: string | null; final_amount?: number | null } | null;
  };
  const [viewPhoto, setViewPhoto] = useState<PhotoRow | null>(null);
  const [grantingAccess, setGrantingAccess] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<PatientEditForm>({
    full_name: '',
    email: '',
    phone: '',
    cpf: '',
    date_of_birth: '',
    gender: '',
    zip_code: '',
    address: '',
    city: '',
    state: '',
    notes: '',
  });
  const [contractDialogProposal, setContractDialogProposal] = useState<ProposalRow | null>(null);
  const [paymentCondition, setPaymentCondition] = useState<PaymentCondition>('cash');
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentDetails, setPaymentDetails] = useState<Record<string, string>>({});
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig>({});
  const [payerData, setPayerData] = useState<PayerData>({ is_self_payer: true, payer_id: null });
  const [avatarDisplayUrl, setAvatarDisplayUrl] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const { data: patient, isLoading } = useQuery({
    queryKey: ['patient', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('patients').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ['patient-appointments', id],
    queryFn: async () => {
      const { data } = await supabase.from('appointments').select('*, treatments(name)')
        .eq('patient_id', id!).order('start_time', { ascending: false }).limit(10);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ['patient-sessions', id],
    queryFn: async () => {
      const { data } = await supabase.from('session_records').select('*, treatments(name)')
        .eq('patient_id', id!).order('performed_at', { ascending: false }).limit(20);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: photos = [] } = useQuery({
    queryKey: ['patient-photos', id],
    queryFn: async () => {
      const { data } = await supabase.from('patient_photos').select('*')
        .eq('patient_id', id!).order('taken_at', { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: metrics = [] } = useQuery({
    queryKey: ['patient-metrics', id],
    queryFn: async () => {
      const { data } = await supabase.from('patient_metrics').select('*')
        .eq('patient_id', id!).order('recorded_at', { ascending: true });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: feedbacks = [] } = useQuery({
    queryKey: ['patient-feedbacks', id],
    queryFn: async () => {
      const { data } = await supabase.from('session_feedback').select('*, session_records(performed_at, treatments(name))')
        .eq('patient_id', id!).order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: proposals = [] } = useQuery({
    queryKey: ['patient-proposals', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('proposals')
        .select('id, proposal_number, status, final_amount, created_at, valid_until, patient_id')
        .eq('patient_id', id!)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ['patient-contracts', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('contracts')
        .select('id, proposal_id, contract_number, process_status, status, created_at, signed_pdf_url, proposals(proposal_number, final_amount)')
        .eq('patient_id', id!)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: portalAccess } = useQuery({
    queryKey: ['patient-portal-access', id],
    queryFn: async () => {
      const { data } = await supabase.from('patient_users' as unknown).select('*')
        .eq('patient_id', id!).limit(1).maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    let active = true;

    const resolveAvatar = async () => {
      if (!patient?.avatar_url) {
        setAvatarDisplayUrl(null);
        return;
      }

      const filePath = getPatientFilePath(patient.avatar_url);
      if (!filePath) {
        setAvatarDisplayUrl(null);
        return;
      }

      if (filePath.startsWith('http') && !filePath.includes(`/storage/v1/object/public/${PATIENT_FILES_BUCKET}/`)) {
        setAvatarDisplayUrl(filePath);
        return;
      }

      const { data, error } = await supabase.storage
        .from(PATIENT_FILES_BUCKET)
        .createSignedUrl(filePath, 60 * 60);

      if (!active) return;
      setAvatarDisplayUrl(error ? null : data?.signedUrl || null);
    };

    void resolveAvatar();

    return () => {
      active = false;
    };
  }, [patient?.avatar_url]);

  const handleGrantPortalAccess = async () => {
    if (!patient?.email || !clinicId || !id) {
      toast.error('Paciente precisa ter um e-mail cadastrado');
      return;
    }
    setGrantingAccess(true);
    try {
      const { data, error } = await supabase.functions.invoke('invite-patient', {
        body: { patientId: id, clinicId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data?.message || 'Acesso ao portal concedido!');
      queryClient.invalidateQueries({ queryKey: ['patient-portal-access', id] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao conceder acesso';
      toast.error(message);
    } finally {
      setGrantingAccess(false);
    }
  };

  const handleAvatarUpload = async (file?: File) => {
    if (!file || !clinicId || !id) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione um arquivo de imagem');
      return;
    }

    setUploadingAvatar(true);
    try {
      const extension = file.name.split('.').pop() || 'jpg';
      const filePath = `${clinicId}/${id}/avatar-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from(PATIENT_FILES_BUCKET).upload(filePath, file, {
        contentType: file.type,
        upsert: true,
      });
      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from('patients')
        .update({ avatar_url: filePath })
        .eq('id', id)
        .eq('clinic_id', clinicId);
      if (updateError) throw updateError;

      const { data: signedData } = await supabase.storage
        .from(PATIENT_FILES_BUCKET)
        .createSignedUrl(filePath, 60 * 60);
      setAvatarDisplayUrl(signedData?.signedUrl || null);
      queryClient.invalidateQueries({ queryKey: ['patient', id] });
      toast.success('Foto do paciente atualizada');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao enviar foto';
      toast.error(message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const openEditPatient = () => {
    if (!patient) return;
    setEditForm({
      full_name: patient.full_name || '',
      email: patient.email || '',
      phone: patient.phone || '',
      cpf: patient.cpf || '',
      date_of_birth: patient.date_of_birth || '',
      gender: patient.gender || '',
      zip_code: patient.zip_code || '',
      address: patient.address || '',
      city: patient.city || '',
      state: patient.state || '',
      notes: patient.notes || '',
    });
    setEditOpen(true);
  };

  const updatePatientMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !id) throw new Error('Paciente não encontrado');
      if (!editForm.full_name.trim()) throw new Error('Nome é obrigatório');

      const payload = {
        full_name: editForm.full_name.trim(),
        email: editForm.email.trim() || null,
        phone: editForm.phone.trim() || null,
        cpf: editForm.cpf.trim() || null,
        date_of_birth: editForm.date_of_birth || null,
        gender: editForm.gender || null,
        zip_code: editForm.zip_code.trim() || null,
        address: editForm.address.trim() || null,
        city: editForm.city.trim() || null,
        state: editForm.state.trim() || null,
        notes: editForm.notes.trim() || null,
      };

      const { error } = await supabase
        .from('patients')
        .update(payload)
        .eq('id', id)
        .eq('clinic_id', clinicId);
      if (error) throw error;

      await supabase
        .from('leads' as unknown)
        .update({
          full_name: payload.full_name,
          phone: payload.phone,
          cpf: payload.cpf,
          email: payload.email,
          birth_date: payload.date_of_birth,
          zip_code: payload.zip_code,
          address: payload.address,
          city: payload.city,
          state: payload.state,
          notes: payload.notes,
        } as unknown)
        .eq('clinic_id', clinicId)
        .eq('patient_id', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient', id] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['crm-leads'] });
      setEditOpen(false);
      toast.success('Dados do paciente atualizados');
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Erro ao atualizar paciente';
      toast.error(message);
    },
  });

  const resetContractDialog = () => {
    setContractDialogProposal(null);
    setPaymentCondition('cash');
    setSelectedPaymentMethods([]);
    setPaymentDetails({});
    setPaymentConfig({});
    setPayerData({ is_self_payer: true, payer_id: null });
  };

  const openContractDialog = (proposal: ProposalRow) => {
    setContractDialogProposal(proposal);
    setPayerData({
      is_self_payer: patient?.is_self_payer ?? true,
      payer_id: patient?.payer_id || null,
      new_payer: patient?.is_self_payer === false ? { name: '', cpf: '', birth_date: '' } : undefined,
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
        toast.error('Você pode selecionar no máximo 2 formas de pagamento.');
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

  const generateContractMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !id || !contractDialogProposal) throw new Error('Selecione uma proposta aprovada.');
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

      const existingContract = contracts.find((contract: ContractRow) => contract.proposal_id === contractDialogProposal.id);
      if (existingContract) {
        throw new Error('Esta proposta já possui contrato vinculado.');
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
              patient_id: id,
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

      const { data: insertedContract, error } = await supabase
        .from('contracts')
        .insert({
          clinic_id: clinicId,
          patient_id: id,
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
        .eq('id', id)
        .eq('clinic_id', clinicId);
      if (patientError) throw patientError;

      return contractNumber;
    },
    onSuccess: (contractNumber) => {
      queryClient.invalidateQueries({ queryKey: ['patient', id] });
      queryClient.invalidateQueries({ queryKey: ['patient-contracts', id] });
      queryClient.invalidateQueries({ queryKey: ['patient-proposals', id] });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['finance-contracts'] });
      toast.success(`Contrato ${contractNumber} gerado`);
      resetContractDialog();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Erro ao gerar contrato';
      toast.error(message);
    },
  });

  const handleEditCepChange = async (value: string) => {
    const zipCode = formatCep(value);
    setEditForm((current) => ({ ...current, zip_code: zipCode }));

    if (zipCode.replace(/\D/g, '').length !== 8) return;

    try {
      const address = await lookupCepAddress(zipCode);
      if (!address) {
        toast.error('CEP não encontrado');
        return;
      }
      setEditForm((current) => {
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
      toast.error(message);
    }
  };

  // Group metrics by type for evolution chart
  const metricTypes = [...new Set(metrics.map((m: MetricRow) => m.metric_type))];
  const metricLabels: Record<string, string> = {
    weight: 'Peso', waist: 'Cintura', hip: 'Quadril', arm: 'Braço',
    thigh: 'Coxa', abdomen: 'Abdômen',
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-muted rounded w-1/3" />
        <div className="h-64 bg-muted rounded-xl" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="text-center py-16">
        <h3 className="text-lg font-semibold">Paciente não encontrado</h3>
        <BrandButton variant="outline" onClick={() => navigate('/clinic/patients')} className="mt-4">Voltar</BrandButton>
      </div>
    );
  }

  const initials = patient.full_name.split(' ').slice(0, 2).map((n: string) => n[0]).join('').toUpperCase();
  const currentAnamneseStatus = patient.current_anamnese_status || 'none';
  const currentAnamneseConfig = anamneseBadgeConfig[currentAnamneseStatus] || anamneseBadgeConfig.none;
  const upcomingAppointments = [...appointments]
    .filter((appointment: AppointmentRow) => new Date(appointment.start_time).getTime() >= Date.now())
    .sort((a: AppointmentRow, b: AppointmentRow) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  const nextAppointment = upcomingAppointments[0] || null;
  const lastSession = sessions[0] || null;
  const latestProposal = proposals[0] || null;
  const latestContract = contracts[0] || null;
  const averageFeedback = feedbacks.length
    ? feedbacks.reduce((sum: number, feedback: FeedbackRow) => sum + Number(feedback.rating || 0), 0) / feedbacks.length
    : null;
  const operationalStep = currentAnamneseStatus === 'none'
    ? 'Cadastrar anamnese'
    : currentAnamneseStatus === 'expired'
      ? 'Renovar anamnese'
      : latestContract?.process_status === 'pending_upload'
        ? 'Receber contrato assinado'
        : latestContract?.process_status === 'pending_confirmation'
          ? 'Validar contrato recebido'
          : latestProposal?.status === 'accepted' && !latestContract
            ? 'Gerar contrato'
            : (latestProposal?.status === 'sent' || latestProposal?.status === 'draft')
              ? 'Acompanhar proposta'
              : (!latestProposal && appointments.some((appointment: AppointmentRow) => appointment.status === 'completed'))
                ? 'Criar proposta'
                : nextAppointment
                  ? 'Acompanhar próximo atendimento'
                  : 'Agendar próxima visita';
  const operationalHint = currentAnamneseStatus === 'none'
    ? anamneseBadgeConfig.none.hint
    : currentAnamneseStatus === 'expired'
      ? anamneseBadgeConfig.expired.hint
      : latestContract?.process_status === 'pending_upload'
        ? 'Depois da avaliação e da proposta, este é o ponto principal para seguir com a venda.'
        : latestContract?.process_status === 'pending_confirmation'
          ? 'Confira o documento recebido para ativar o contrato com segurança.'
          : latestProposal?.status === 'accepted' && !latestContract
            ? 'A proposta foi aprovada. Agora o próximo passo é formalizar o contrato.'
            : latestProposal?.status === 'sent'
              ? 'A proposta já foi enviada. Vale acompanhar retorno e objeções do paciente.'
              : latestProposal?.status === 'draft'
                ? 'A proposta ainda está em rascunho. Complete e envie para avançar a conversão.'
                : (!latestProposal && appointments.some((appointment: AppointmentRow) => appointment.status === 'completed'))
                  ? 'A avaliação já aconteceu. O momento agora é transformar esse atendimento em proposta.'
                  : nextAppointment
                    ? 'Há atendimento previsto. Use esse momento para evoluir clínica e comercialmente.'
                    : 'Agende a próxima avaliação ou sessão para manter o paciente ativo.';
  const commercialSummary = latestContract
    ? `${latestContract.contract_number || 'Contrato'}`
    : latestProposal
      ? `${latestProposal.proposal_number || 'Proposta'}`
      : 'Sem proposta';
  const commercialDetail = latestContract
    ? `Status: ${latestContract.process_status}`
    : latestProposal
      ? `Status: ${latestProposal.status} • R$ ${Number(latestProposal.final_amount || 0).toLocaleString('pt-BR')}`
      : 'Depois da avaliação, a proposta passa a aparecer aqui.';
  const openPatientAgenda = () => {
    navigate(`/clinic/appointments?patientId=${id}&appointmentType=session&openNew=1`);
  };

  return (
    <div>
      <PageHeader title={patient.full_name} description="Detalhes do paciente">
        <BrandButton variant="outline" onClick={() => navigate('/clinic/patients')}>
          <ArrowLeft className="w-4 h-4" /> Voltar
        </BrandButton>
      </PageHeader>

      {/* Header card */}
      <Card className="shadow-card mb-6 animate-fade-in">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="group relative w-16 h-16 rounded-full overflow-hidden border border-border"
                disabled={uploadingAvatar}
              >
                {avatarDisplayUrl ? (
                  <img src={avatarDisplayUrl} alt={patient.full_name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-xl">
                    {initials}
                  </div>
                )}
                <span className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                  {uploadingAvatar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                </span>
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  void handleAvatarUpload(file);
                  event.currentTarget.value = '';
                }}
              />
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-xl font-bold text-foreground">{patient.full_name}</h2>
                <BrandBadge status={patient.status as BadgeStatus} />
                <Badge variant="outline" className={currentAnamneseConfig.cls}>
                  <FileTextIcon className="w-3 h-3 mr-1" />
                  {currentAnamneseConfig.label}
                </Badge>
                {latestProposal && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    <FileTextIcon className="w-3 h-3 mr-1" />
                    Proposta {latestProposal.proposal_number}
                  </Badge>
                )}
                {latestContract && (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                    <FileSignature className="w-3 h-3 mr-1" />
                    Contrato {latestContract.contract_number}
                  </Badge>
                )}
                {portalAccess ? (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <ExternalLink className="w-3 h-3 mr-1" />Portal ativo
                  </Badge>
                ) : (
                  <Button size="sm" variant="outline" onClick={handleGrantPortalAccess} disabled={grantingAccess || !patient.email}>
                    {grantingAccess ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <ExternalLink className="w-3 h-3 mr-1" />}
                    Conceder acesso ao portal
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {patient.email && (
                  <a
                    href={`mailto:${patient.email}`}
                    className="flex items-center gap-1 hover:text-primary transition-colors"
                  >
                    <Mail className="w-4 h-4" />
                    {patient.email}
                  </a>
                )}
                {patient.phone && (
                  <a
                    href={`https://wa.me/55${(patient.phone || '').replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 hover:text-primary transition-colors"
                  >
                    <Phone className="w-4 h-4" />
                    {patient.phone}
                  </a>
                )}
                {patient.date_of_birth && <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{new Date(patient.date_of_birth).toLocaleDateString('pt-BR')}</span>}
              </div>
              {patient.cpf && <p className="text-sm text-muted-foreground">CPF: {patient.cpf}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 mb-6 lg:grid-cols-5">
        <Card className="shadow-card">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Próximo passo</p>
            <p className="mt-2 text-lg font-semibold text-foreground">{operationalStep}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{operationalHint}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Agenda</p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {nextAppointment
                ? format(new Date(nextAppointment.start_time), "dd 'de' MMM, HH:mm", { locale: ptBR })
                : 'Sem atendimento futuro'}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {nextAppointment
                ? `${nextAppointment.treatments?.name || 'Tratamento'} • ${nextAppointment.status || 'agendado'}`
                : 'Agende a próxima avaliação ou sessão para manter o paciente ativo.'}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Última sessão</p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {lastSession
                ? format(new Date(lastSession.performed_at), "dd 'de' MMM", { locale: ptBR })
                : 'Nenhuma sessão registrada'}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {lastSession
                ? `${lastSession.treatments?.name || 'Tratamento'} • Sessão ${lastSession.session_number || '—'}`
                : 'Quando a execução começar, o histórico de sessões aparece aqui.'}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Comercial</p>
            <p className="mt-2 text-sm font-semibold text-foreground">{commercialSummary}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{commercialDetail}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Satisfação</p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {averageFeedback ? `${averageFeedback.toFixed(1)} / 5` : 'Sem feedback'}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {feedbacks.length
                ? `${feedbacks.length} feedback${feedbacks.length > 1 ? 's' : ''} registrado${feedbacks.length > 1 ? 's' : ''}.`
                : 'Os próximos retornos do paciente ajudam a medir satisfação e risco.'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Dissatisfaction Alert */}
      {patient.dissatisfaction_flag && (
        <Card className="mb-6 border-destructive bg-destructive/5 animate-fade-in">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-destructive text-sm">Paciente insatisfeito — Nível: {patient.dissatisfaction_level || 'N/A'}</p>
              {patient.dissatisfaction_reason && (
                <p className="text-xs text-muted-foreground mt-0.5">{patient.dissatisfaction_reason}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="data" className="animate-fade-in">
        <TabsList className="w-full flex overflow-x-auto gap-1 mb-6">
          <TabsTrigger value="data" className="flex items-center gap-1"><User className="w-3.5 h-3.5" />Dados</TabsTrigger>
          <TabsTrigger value="anamnese" className="flex items-center gap-1"><FileTextIcon className="w-3.5 h-3.5" />Anamnese</TabsTrigger>
          <TabsTrigger value="appointments" className="flex items-center gap-1" onClick={openPatientAgenda}><Calendar className="w-3.5 h-3.5" />Agenda</TabsTrigger>
          <TabsTrigger value="proposals" className="flex items-center gap-1"><FileTextIcon className="w-3.5 h-3.5" />Propostas</TabsTrigger>
          <TabsTrigger value="contracts" className="flex items-center gap-1"><FileSignature className="w-3.5 h-3.5" />Contratos</TabsTrigger>
          <TabsTrigger value="sessions" className="flex items-center gap-1"><ClipboardList className="w-3.5 h-3.5" />Sessões</TabsTrigger>
          <TabsTrigger value="evolution" className="flex items-center gap-1"><Activity className="w-3.5 h-3.5" />Evolução</TabsTrigger>
          <TabsTrigger value="photos" className="flex items-center gap-1"><Camera className="w-3.5 h-3.5" />Fotos</TabsTrigger>
          <TabsTrigger value="feedback" className="flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" />Feedback</TabsTrigger>
        </TabsList>

        {/* Data tab */}
        <TabsContent value="data">
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle>Informações Pessoais</CardTitle>
              <BrandButton size="sm" variant="outline" onClick={openEditPatient}>
                <Edit className="w-4 h-4" />
                Editar dados
              </BrandButton>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                {[
                  ['Nome', patient.full_name],
                  ['E-mail', patient.email],
                  ['Telefone', patient.phone],
                  ['CPF', patient.cpf],
                  ['Nascimento', patient.date_of_birth ? new Date(patient.date_of_birth).toLocaleDateString('pt-BR') : null],
                  ['Gênero', patient.gender === 'female' ? 'Feminino' : patient.gender === 'male' ? 'Masculino' : patient.gender],
                  ['CEP', patient.zip_code],
                  ['Endereço', patient.address],
                  ['Cidade/UF', [patient.city, patient.state].filter(Boolean).join(' / ') || null],
                ].map(([label, value], i) => (
                  <div key={i}>
                    <dt className="text-muted-foreground text-xs uppercase tracking-wider">{label}</dt>
                    <dd className="font-medium text-foreground mt-0.5">{value || '—'}</dd>
                  </div>
                ))}
              </dl>
              {patient.notes && (
                <div className="mt-4 pt-4 border-t">
                  <dt className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Observações</dt>
                  <dd className="text-sm text-foreground whitespace-pre-wrap">{patient.notes}</dd>
                </div>
              )}
              
            </CardContent>
          </Card>
        </TabsContent>

        {/* Anamnese tab */}
        <TabsContent value="anamnese">
          {clinicId && id && (
            <PatientAnamneseTab
              patientId={id}
              clinicId={clinicId}
              patientAnamneseStatus={patient.current_anamnese_status}
            />
          )}
        </TabsContent>

        {/* Appointments tab */}
        <TabsContent value="appointments">
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Agendamentos</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Avaliações e sessões previstas para este paciente.
                  </p>
                </div>
                <BrandButton variant="outline" onClick={openPatientAgenda}>
                  Ir para agenda
                </BrandButton>
              </div>
            </CardHeader>
            <CardContent>
              {appointments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum agendamento encontrado</p>
              ) : (
                <div className="space-y-3">
                  {appointments.map((a: AppointmentRow) => (
                    <div key={a.id} className="flex flex-col gap-3 rounded-lg bg-secondary/50 p-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{a.treatments?.name || 'Tratamento'}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(a.start_time).toLocaleDateString('pt-BR')} às {new Date(a.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 self-start md:self-center">
                        <BrandBadge status={a.status as BadgeStatus} />
                        {['confirmed', 'in_progress'].includes(a.status) && (
                          <BrandButton
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/clinic/sessions?appointmentId=${a.id}`)}
                          >
                            Ir para sessão
                          </BrandButton>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Proposals tab */}
        <TabsContent value="proposals">
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Propostas do paciente</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Veja rapidamente as propostas comerciais ligadas a este paciente.
                  </p>
                </div>
                <BrandButton variant="outline" onClick={() => navigate('/clinic/proposals')}>
                  Abrir módulo de propostas
                </BrandButton>
              </div>
            </CardHeader>
            <CardContent>
              {proposals.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma proposta encontrada</p>
              ) : (
                <div className="space-y-3">
                  {proposals.map((proposal: ProposalRow) => {
                    const linkedContract = contracts.find((contract: ContractRow) => contract.proposal_id === proposal.id);
                    const canGenerateContract = proposal.status === 'accepted' && !linkedContract;

                    return (
                      <div key={proposal.id} className="flex flex-col gap-3 rounded-lg bg-secondary/50 p-3 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                              onClick={() => navigate(`/clinic/proposals?proposalId=${proposal.id}&view=1`)}
                            >
                              {proposal.proposal_number || 'Proposta sem número'}
                            </button>
                            <BrandBadge status={proposal.status === 'accepted' ? 'approved' : proposal.status === 'rejected' ? 'rejected' : proposal.status === 'draft' ? 'draft' : 'sent'}>
                              {proposal.status}
                            </BrandBadge>
                            {linkedContract && (
                              <Badge variant="outline" className="bg-white">
                                Contrato {linkedContract.contract_number || 'gerado'}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Valor final: R$ {Number(proposal.final_amount || 0).toLocaleString('pt-BR')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Criada em {format(new Date(proposal.created_at), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                            {proposal.valid_until ? ` • válida até ${format(new Date(`${proposal.valid_until}T12:00:00`), "dd/MM/yyyy", { locale: ptBR })}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 self-start md:self-center">
                          {canGenerateContract && (
                            <BrandButton size="sm" onClick={() => openContractDialog(proposal)}>
                              <FileSignature className="h-4 w-4" />
                              Gerar contrato
                            </BrandButton>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contracts tab */}
        <TabsContent value="contracts">
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Contratos do paciente</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Acesse rapidamente os contratos vinculados a este paciente.
                  </p>
                </div>
                <BrandButton variant="outline" onClick={() => navigate('/clinic/contracts')}>
                  Abrir módulo de contratos
                </BrandButton>
              </div>
            </CardHeader>
            <CardContent>
              {contracts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum contrato encontrado</p>
              ) : (
                <div className="space-y-3">
                  {contracts.map((contract: ContractRow) => (
                    <div key={contract.id} className="flex flex-col gap-3 rounded-lg bg-secondary/50 p-3 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                            onClick={() => navigate(`/clinic/contracts?contractId=${contract.id}&view=1`)}
                          >
                            {contract.contract_number || 'Contrato sem número'}
                          </button>
                          <ContractStatusBadge status={contract.process_status} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {contract.proposals?.proposal_number
                            ? `Proposta ${contract.proposals.proposal_number}`
                            : 'Sem proposta vinculada'}
                          {contract.proposals?.final_amount
                            ? ` • R$ ${Number(contract.proposals.final_amount).toLocaleString('pt-BR')}`
                            : ''}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Criado em {format(new Date(contract.created_at), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 self-start md:self-center">
                        {contract.signed_pdf_url && (
                          <BrandButton
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(contract.signed_pdf_url, '_blank', 'noopener,noreferrer')}
                          >
                            Ver PDF
                          </BrandButton>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sessions tab */}
        <TabsContent value="sessions">
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Sessões Realizadas</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Histórico de execução do tratamento e últimas observações clínicas.
                  </p>
                </div>
                <BrandButton variant="outline" onClick={() => navigate('/clinic/sessions')}>
                  Abrir módulo de sessões
                </BrandButton>
              </div>
            </CardHeader>
            <CardContent>
              {sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma sessão registrada</p>
              ) : (
                <div className="space-y-3">
                  {sessions.map((s: SessionRow) => (
                    <div key={s.id} className="p-3 rounded-lg bg-secondary/50">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-foreground">
                          Sessão {s.session_number}/{s.total_sessions} — {s.treatments?.name || 'Tratamento'}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {new Date(s.performed_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                      {s.notes && <p className="text-xs text-muted-foreground">{s.notes}</p>}
                      {s.observations && <p className="text-xs text-muted-foreground mt-1">{s.observations}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Evolution tab */}
        <TabsContent value="evolution">
          {metricTypes.length === 0 ? (
            <Card className="shadow-card">
              <CardContent className="py-12 text-center">
                <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma medição registrada</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {metricTypes.map(type => {
                const typeMetrics = metrics.filter((m: MetricRow) => m.metric_type === type);
                const chartData = typeMetrics.map((m: MetricRow) => ({
                  date: format(new Date(m.recorded_at), 'dd/MM', { locale: ptBR }),
                  value: Number(m.value),
                }));
                const unit = typeMetrics[0]?.unit || '';
                const first = Number(typeMetrics[0]?.value);
                const last = Number(typeMetrics[typeMetrics.length - 1]?.value);
                const diff = last - first;

                return (
                  <Card key={type} className="shadow-card">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{metricLabels[type] || type}</CardTitle>
                        <div className="text-right">
                          <p className="text-lg font-bold text-foreground">{last} {unit}</p>
                          {typeMetrics.length > 1 && (
                            <p className={`text-xs font-medium ${diff < 0 ? 'text-green-600' : diff > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                              {diff > 0 ? '+' : ''}{diff.toFixed(1)} {unit}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="date" className="text-xs fill-muted-foreground" />
                          <YAxis className="text-xs fill-muted-foreground" />
                          <Tooltip />
                          <Line type="monotone" dataKey="value" className="stroke-primary" strokeWidth={2} dot={{ r: 3, className: 'fill-primary' }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Photos tab */}
        <TabsContent value="photos">
          {photos.length === 0 ? (
            <Card className="shadow-card">
              <CardContent className="py-12 text-center">
                <Camera className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma foto registrada</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {photos.map((p: PhotoRow) => (
                <Card key={p.id} className="shadow-card overflow-hidden cursor-pointer hover:shadow-card-hover transition-all" onClick={() => setViewPhoto(p)}>
                  <div className="relative aspect-square">
                    <img src={p.photo_url} alt={p.description || ''} className="w-full h-full object-cover" />
                    <Badge className={`absolute top-2 left-2 text-xs ${typeColors[p.photo_type]}`}>{typeLabels[p.photo_type]}</Badge>
                  </div>
                  <CardContent className="p-2">
                    <p className="text-xs text-muted-foreground">{format(new Date(p.taken_at), 'dd/MM/yyyy', { locale: ptBR })}</p>
                    {p.description && <p className="text-xs text-foreground truncate">{p.description}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Feedback tab */}
        <TabsContent value="feedback">
          {feedbacks.length === 0 ? (
            <Card className="shadow-card">
              <CardContent className="py-12 text-center">
                <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhum feedback registrado</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {feedbacks.map((fb: FeedbackRow) => (
                <Card key={fb.id} className="shadow-card">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map(s => (
                          <Star key={s} className={`w-4 h-4 ${s <= fb.rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground'}`} />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">{format(new Date(fb.created_at), 'dd/MM/yyyy', { locale: ptBR })}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">
                      {fb.session_records?.treatments?.name || 'Sessão'} — {fb.session_records?.performed_at ? format(new Date(fb.session_records.performed_at), 'dd/MM', { locale: ptBR }) : ''}
                    </p>
                    {fb.comment && <p className="text-sm text-foreground">{fb.comment}</p>}
                    {fb.response && (
                      <div className="mt-2 p-2 rounded-lg bg-secondary/50">
                        <p className="text-xs font-medium text-muted-foreground">Resposta:</p>
                        <p className="text-sm text-foreground">{fb.response}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Photo lightbox */}
      <Dialog open={!!viewPhoto} onOpenChange={() => setViewPhoto(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{viewPhoto?.description || 'Foto'}</DialogTitle></DialogHeader>
          {viewPhoto && (
            <>
              <img src={viewPhoto.photo_url} alt="" className="w-full rounded-xl" />
              <div className="flex items-center gap-2 mt-2">
                <Badge className={typeColors[viewPhoto.photo_type]}>{typeLabels[viewPhoto.photo_type]}</Badge>
                <span className="text-sm text-muted-foreground">{format(new Date(viewPhoto.taken_at), 'dd/MM/yyyy', { locale: ptBR })}</span>
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
            <DialogTitle>Gerar contrato</DialogTitle>
            <DialogDescription>
              Configure pagamento e pagador sem sair do prontuário do paciente.
            </DialogDescription>
          </DialogHeader>

          {contractDialogProposal && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-amber-50/60 p-4">
                <p className="text-sm font-semibold text-foreground">
                  {contractDialogProposal.proposal_number || 'Proposta sem número'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {patient.full_name} · R$ {Number(contractDialogProposal.final_amount || 0).toFixed(2)}
                </p>
                <p className="mt-2 text-xs text-amber-800">
                  A proposta já está aprovada. Ao confirmar, o contrato será criado em rascunho e vinculado a este paciente.
                </p>
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
                    patientName={patient.full_name || undefined}
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
                  disabled={generateContractMutation.isPending}
                  onClick={() => generateContractMutation.mutate()}
                >
                  {generateContractMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileTextIcon className="h-4 w-4" />
                  )}
                  {generateContractMutation.isPending ? 'Gerando...' : 'Confirmar e gerar contrato'}
                </BrandButton>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar dados do paciente</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4 mt-4"
            onSubmit={(event) => {
              event.preventDefault();
              updatePatientMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label>Nome completo *</Label>
              <Input value={editForm.full_name} onChange={(event) => setEditForm((current) => ({ ...current, full_name: event.target.value }))} required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input type="email" value={editForm.email} onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={editForm.phone} onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))} placeholder="(11) 99999-9999" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>CPF</Label>
                <Input value={editForm.cpf} onChange={(event) => setEditForm((current) => ({ ...current, cpf: event.target.value }))} placeholder="000.000.000-00" />
              </div>
              <div className="space-y-2">
                <Label>Data de nascimento</Label>
                <Input type="date" value={editForm.date_of_birth} onChange={(event) => setEditForm((current) => ({ ...current, date_of_birth: event.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Gênero</Label>
              <Select value={editForm.gender || 'none'} onValueChange={(value) => setEditForm((current) => ({ ...current, gender: value === 'none' ? '' : value }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não informado</SelectItem>
                  <SelectItem value="female">Feminino</SelectItem>
                  <SelectItem value="male">Masculino</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border p-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Endereço</h3>
                <p className="text-xs text-muted-foreground mt-1">Dados complementares usados na ficha do paciente e na formalização do contrato.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>CEP</Label>
                  <Input value={editForm.zip_code} onChange={(event) => handleEditCepChange(event.target.value)} placeholder="00000-000" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Endereço completo</Label>
                  <Input value={editForm.address} onChange={(event) => setEditForm((current) => ({ ...current, address: event.target.value }))} placeholder="Rua, número, complemento e bairro" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Cidade</Label>
                  <Input value={editForm.city} onChange={(event) => setEditForm((current) => ({ ...current, city: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>UF</Label>
                  <Input value={editForm.state} onChange={(event) => setEditForm((current) => ({ ...current, state: event.target.value.toUpperCase().slice(0, 2) }))} placeholder="SP" maxLength={2} />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={editForm.notes} onChange={(event) => setEditForm((current) => ({ ...current, notes: event.target.value }))} rows={3} />
            </div>
            <div className="flex gap-3 pt-2">
              <BrandButton type="button" variant="outline" onClick={() => setEditOpen(false)} className="flex-1">
                Cancelar
              </BrandButton>
              <BrandButton type="submit" className="flex-1" disabled={updatePatientMutation.isPending}>
                {updatePatientMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
              </BrandButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
