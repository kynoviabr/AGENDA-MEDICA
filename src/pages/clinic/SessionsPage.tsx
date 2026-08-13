import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { BrandBadge, type BadgeStatus } from '@/components/ui/brand-badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { AnamneseAlertBanner } from '@/components/anamnese/AnamneseAlertBanner';
import { useStaffDirectory } from '@/hooks/useStaffDirectory';
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Filter,
  Package,
  Plus,
  Search,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useSearchParams } from 'react-router-dom';
import type { Database } from '@/integrations/supabase/types';

type SessionForm = {
  appointment_id: string;
  patient_id: string;
  treatment_id: string;
  notes: string;
  products_used: string;
  observations: string;
};

type SessionSummaryRow = {
  key: string;
  patientId: string;
  patientName: string;
  treatmentId: string | null;
  treatmentName: string;
  contracted: number;
  performed: number;
  balance: number;
  lastPerformedAt: string | null;
};
type SessionRecordRow = Database['public']['Tables']['session_records']['Row'] & {
  patients?: { full_name?: string | null; dissatisfaction_flag?: boolean | null; dissatisfaction_level?: string | null } | null;
  treatments?: { name?: string | null } | null;
  appointments?: { start_time?: string | null } | null;
};
type PatientRow = Pick<Database['public']['Tables']['patients']['Row'], 'id' | 'full_name' | 'current_anamnese_status' | 'current_anamnese_expires_at'>;
type TreatmentRow = Pick<Database['public']['Tables']['treatments']['Row'], 'id' | 'name' | 'num_sessions' | 'duration_minutes'>;
type AvailabilityRow = Database['public']['Tables']['professional_availability']['Row'];
type BlockRow = Database['public']['Tables']['appointment_blocks']['Row'];
type AppointmentRow = Pick<Database['public']['Tables']['appointments']['Row'], 'id' | 'patient_id' | 'treatment_id' | 'professional_id' | 'start_time' | 'status' | 'end_time'> & {
  patients?: { full_name?: string | null } | null;
  treatments?: { name?: string | null } | null;
};
type ContractRow = Pick<Database['public']['Tables']['contracts']['Row'], 'id' | 'patient_id' | 'proposal_id' | 'status'>;
type ProposalItemRow = Pick<Database['public']['Tables']['proposal_items']['Row'], 'proposal_id' | 'quantity' | 'treatment_id'> & {
  treatments?: { name?: string | null; num_sessions?: number | null } | null;
};
type RenewalTaskRow = {
  id: string;
  patient_id: string;
  treatment_id: string;
  status: 'pending' | 'contacted' | 'revaluation_scheduled' | 'snoozed' | 'converted' | 'discarded';
};

const emptyForm: SessionForm = {
  appointment_id: 'manual',
  patient_id: '',
  treatment_id: '',
  notes: '',
  products_used: '',
  observations: '',
};

const weekDays = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
];

export default function SessionsPage() {
  const { clinicId } = useBranding();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [balanceFilter, setBalanceFilter] = useState('all');
  const [form, setForm] = useState<SessionForm>(emptyForm);
  const [plannerTarget, setPlannerTarget] = useState<SessionSummaryRow | null>(null);
  const [plannerStartDate, setPlannerStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [plannerTime, setPlannerTime] = useState('09:00');
  const [plannerIntervalDays, setPlannerIntervalDays] = useState('7');
  const [plannerCount, setPlannerCount] = useState('1');
  const [plannerProfessional, setPlannerProfessional] = useState('unassigned');
  const [plannerNotes, setPlannerNotes] = useState('');
  const [renewalOnly, setRenewalOnly] = useState(false);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['sessions', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('session_records')
        .select('*, patients(full_name, dissatisfaction_flag, dissatisfaction_level), treatments(name), appointments(start_time)')
        .eq('clinic_id', clinicId!)
        .order('performed_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: patients = [] } = useQuery({
    queryKey: ['patients-sessions', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patients')
        .select('id, full_name, current_anamnese_status, current_anamnese_expires_at')
        .eq('clinic_id', clinicId!)
        .eq('status', 'active')
        .order('full_name');

      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: treatments = [] } = useQuery({
    queryKey: ['treatments-sessions', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('treatments')
        .select('id, name, num_sessions, duration_minutes')
        .eq('clinic_id', clinicId!)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { staff: professionals = [] } = useStaffDirectory(clinicId, ['admin', 'professional']);

  const { data: availability = [] } = useQuery({
    queryKey: ['professional-availability-sessions', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('professional_availability')
        .select('*')
        .eq('clinic_id', clinicId!)
        .eq('is_active', true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: appointmentBlocks = [] } = useQuery({
    queryKey: ['appointment-blocks-sessions', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('appointment_blocks')
        .select('*')
        .eq('clinic_id', clinicId!)
        .gte('end_at', new Date().toISOString())
        .order('start_at');
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ['session-appointments', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, patient_id, treatment_id, professional_id, start_time, status, patients(full_name), treatments(name)')
        .eq('clinic_id', clinicId!)
        .in('status', ['confirmed', 'in_progress', 'completed'])
        .order('start_time', { ascending: false })
        .limit(150);

      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ['session-contracts', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('id, patient_id, proposal_id, status')
        .eq('clinic_id', clinicId!)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: proposalItems = [] } = useQuery({
    queryKey: ['session-proposal-items', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposal_items')
        .select('proposal_id, quantity, treatment_id, treatments(name, num_sessions)');

      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: renewalTasks = [] } = useQuery({
    queryKey: ['sessions-renewal-tasks', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_renewal_tasks_active' as never)
        .select('id, patient_id, treatment_id, status')
        .eq('clinic_id', clinicId!);
      if (error) throw error;
      return ((data || []) as unknown) as RenewalTaskRow[];
    },
    enabled: !!clinicId,
  });

  const sessionByAppointmentId = useMemo(() => {
    const map = new Map<string, SessionRecordRow>();
    sessions.forEach((session: SessionRecordRow) => {
      if (session.appointment_id) map.set(session.appointment_id, session);
    });
    return map;
  }, [sessions]);

  const availableAppointments = useMemo(
    () => appointments.filter((appointment: AppointmentRow) => !sessionByAppointmentId.has(appointment.id)),
    [appointments, sessionByAppointmentId]
  );

  const summaryRows = useMemo<SessionSummaryRow[]>(() => {
    const patientNameMap = new Map<string, string>();
    patients.forEach((patient: PatientRow) => {
      patientNameMap.set(patient.id, patient.full_name);
    });

    const treatmentMap = new Map<string, { name: string; num_sessions: number }>();
    treatments.forEach((treatment: TreatmentRow) => {
      treatmentMap.set(treatment.id, {
        name: treatment.name,
        num_sessions: Number(treatment.num_sessions || 1),
      });
    });

    const proposalItemsByProposal = new Map<string, ProposalItemRow[]>();
    proposalItems.forEach((item: ProposalItemRow) => {
      const current = proposalItemsByProposal.get(item.proposal_id) || [];
      current.push(item);
      proposalItemsByProposal.set(item.proposal_id, current);
    });

    const summaryMap = new Map<string, SessionSummaryRow>();

    const ensureRow = (patientId: string, treatmentId: string | null, treatmentName?: string) => {
      const key = `${patientId}:${treatmentId || 'none'}`;
      const existing = summaryMap.get(key);
      if (existing) return existing;

      const row: SessionSummaryRow = {
        key,
        patientId,
        patientName: patientNameMap.get(patientId) || 'Paciente',
        treatmentId,
        treatmentName:
          treatmentName ||
          (treatmentId ? treatmentMap.get(treatmentId)?.name || 'Tratamento' : 'Sem tratamento'),
        contracted: 0,
        performed: 0,
        balance: 0,
        lastPerformedAt: null,
      };
      summaryMap.set(key, row);
      return row;
    };

    contracts.forEach((contract: ContractRow) => {
      if (!contract.proposal_id) return;
      const items = proposalItemsByProposal.get(contract.proposal_id) || [];
      items.forEach((item: ProposalItemRow) => {
        const treatmentId = item.treatment_id || null;
        const treatmentInfo = treatmentId ? treatmentMap.get(treatmentId) : null;
        const sessionsPerItem = Number(item.quantity || 1) * Number(treatmentInfo?.num_sessions || 1);
        const row = ensureRow(contract.patient_id, treatmentId, treatmentInfo?.name);
        row.contracted += sessionsPerItem;
      });
    });

    sessions.forEach((session: SessionRecordRow) => {
      const treatmentId = session.treatment_id || null;
      const treatmentName = session.treatments?.name || (treatmentId ? treatmentMap.get(treatmentId)?.name : undefined);
      const row = ensureRow(session.patient_id, treatmentId, treatmentName);
      row.performed += 1;
      if (!row.lastPerformedAt || new Date(session.performed_at) > new Date(row.lastPerformedAt)) {
        row.lastPerformedAt = session.performed_at;
      }
    });

    return Array.from(summaryMap.values())
      .map((row) => ({ ...row, balance: Math.max(row.contracted - row.performed, 0) }))
      .sort((a, b) => {
        if (b.balance !== a.balance) return b.balance - a.balance;
        if (b.contracted !== a.contracted) return b.contracted - a.contracted;
        return a.patientName.localeCompare(b.patientName);
      });
  }, [contracts, patients, proposalItems, sessions, treatments]);

  const renewalTaskKeys = useMemo(() => {
    const keys = new Set<string>();
    renewalTasks.forEach((task) => {
      const treatmentKey = task.treatment_id || 'none';
      keys.add(`${task.patient_id}:${treatmentKey}`);
      keys.add(`${task.patient_id}:none`);
    });
    return keys;
  }, [renewalTasks]);

  const filteredSummaryRows = useMemo(() => {
    return summaryRows.filter((row) => {
      const normalizedSearch = search.trim().toLowerCase();
      const matchesSearch =
        !normalizedSearch ||
        row.patientName.toLowerCase().includes(normalizedSearch) ||
        row.treatmentName.toLowerCase().includes(normalizedSearch);

      if (!matchesSearch) return false;

      if (balanceFilter === 'with_balance') return row.balance > 0;
      if (balanceFilter === 'completed') return row.contracted > 0 && row.balance === 0;
      if (balanceFilter === 'no_contract') return row.contracted === 0;
      if (balanceFilter === 'renewal_window') return renewalTaskKeys.has(row.key);
      return true;
    });
  }, [balanceFilter, search, summaryRows, renewalTaskKeys]);

  const contractedTreatmentsByPatient = useMemo(() => {
    const map = new Map<string, Array<{ id: string; name: string }>>();
    summaryRows.forEach((row) => {
      if (!row.patientId || !row.treatmentId || row.contracted <= 0) return;
      const current = map.get(row.patientId) || [];
      if (!current.some((item) => item.id === row.treatmentId)) {
        current.push({ id: row.treatmentId, name: row.treatmentName });
      }
      map.set(row.patientId, current);
    });
    map.forEach((items, patientId) => {
      map.set(
        patientId,
        items.sort((a, b) => a.name.localeCompare(b.name))
      );
    });
    return map;
  }, [summaryRows]);

  useEffect(() => {
    setRenewalOnly(balanceFilter === 'renewal_window');
  }, [balanceFilter]);

  const selectedAppointment =
    form.appointment_id !== 'manual'
      ? availableAppointments.find((appointment: AppointmentRow) => appointment.id === form.appointment_id)
      : null;

  useEffect(() => {
    const appointmentId = searchParams.get('appointmentId');
    if (!appointmentId || availableAppointments.length === 0) return;

    const appointment = availableAppointments.find((item: AppointmentRow) => item.id === appointmentId);
    if (!appointment) return;

    setForm((current) => ({
      ...current,
      appointment_id: appointment.id,
      patient_id: '',
      treatment_id: '',
    }));
    setDialogOpen(true);
  }, [availableAppointments, searchParams]);

  const selectedPatientId = selectedAppointment?.patient_id || form.patient_id;
  const selectedTreatmentId = selectedAppointment?.treatment_id || form.treatment_id || null;
  const selectedPatient = patients.find((patient: PatientRow) => patient.id === selectedPatientId);
  const manualTreatmentOptions = useMemo(
    () => (form.patient_id ? contractedTreatmentsByPatient.get(form.patient_id) || [] : []),
    [contractedTreatmentsByPatient, form.patient_id]
  );

  useEffect(() => {
    if (form.appointment_id !== 'manual') return;
    if (!form.patient_id) return;
    if (!form.treatment_id) return;
    const allowed = (contractedTreatmentsByPatient.get(form.patient_id) || []).some((item) => item.id === form.treatment_id);
    if (!allowed) {
      setForm((current) => ({ ...current, treatment_id: '' }));
    }
  }, [contractedTreatmentsByPatient, form.appointment_id, form.patient_id, form.treatment_id]);

  const currentFlowSummary = useMemo(() => {
    if (!selectedPatientId) return null;
    const key = `${selectedPatientId}:${selectedTreatmentId || 'none'}`;
    return summaryRows.find((row) => row.key === key) || null;
  }, [selectedPatientId, selectedTreatmentId, summaryRows]);

  const getProfessionalLabel = (professionalId?: string | null) => {
    if (!professionalId) return 'Não atribuído';
    return professionals.find((professional) => professional.user_id === professionalId)?.label || 'Profissional';
  };

  const hasAvailabilityWindow = (professionalId: string, startTime: Date, endTime: Date) => {
    const dayOfWeek = startTime.getDay();
    const slots = availability.filter((slot: AvailabilityRow) => slot.professional_id === professionalId && slot.day_of_week === dayOfWeek && slot.is_active);
    if (slots.length === 0) return false;

    const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
    const endMinutes = endTime.getHours() * 60 + endTime.getMinutes();
    return slots.some((slot: AvailabilityRow) => {
      const [startHour, startMinute] = String(slot.start_time).slice(0, 5).split(':').map(Number);
      const [endHour, endMinute] = String(slot.end_time).slice(0, 5).split(':').map(Number);
      const slotStartMinutes = startHour * 60 + startMinute;
      const slotEndMinutes = endHour * 60 + endMinute;
      return startMinutes >= slotStartMinutes && endMinutes <= slotEndMinutes;
    });
  };

  const hasBlockConflict = (professionalId: string, startTime: Date, endTime: Date) => {
    return appointmentBlocks.some((block: BlockRow) => {
      const applies = !block.professional_id || block.professional_id === professionalId;
      if (!applies) return false;
      return startTime < new Date(block.end_at) && endTime > new Date(block.start_at);
    });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const appointment = selectedAppointment;
      const patientId = appointment?.patient_id || form.patient_id;
      const treatmentId = appointment?.treatment_id || form.treatment_id || null;

      if (!patientId) throw new Error('Selecione um paciente');
      if (!treatmentId) throw new Error('Selecione um tratamento');

      const summaryKey = `${patientId}:${treatmentId || 'none'}`;
      const summary = summaryRows.find((row) => row.key === summaryKey);
      if (!summary || summary.contracted <= 0) {
        throw new Error('Este tratamento não está contratado para o paciente selecionado.');
      }
      const nextSessionNumber = summary ? summary.performed + 1 : 1;
      const totalSessions = summary?.contracted || Math.max(summary?.performed || 0, nextSessionNumber);

      const insertPayload = {
        clinic_id: clinicId!,
        appointment_id: appointment?.id || null,
        patient_id: patientId,
        treatment_id: treatmentId,
        professional_id: appointment?.professional_id || null,
        session_number: nextSessionNumber,
        total_sessions: totalSessions,
        notes: form.notes || null,
        products_used: form.products_used || null,
        observations: form.observations || null,
        performed_at: appointment?.start_time || new Date().toISOString(),
      };

      const { error } = await supabase.from('session_records').insert(insertPayload);
      if (error) throw error;

      if (appointment && appointment.status !== 'completed') {
        const { error: appointmentError } = await supabase
          .from('appointments')
          .update({ status: 'completed' })
          .eq('id', appointment.id);

        if (appointmentError) throw appointmentError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] });
      qc.invalidateQueries({ queryKey: ['session-appointments'] });
      qc.invalidateQueries({ queryKey: ['patient-sessions'] });
      setDialogOpen(false);
      setForm(emptyForm);
      toast({ title: 'Sessão registrada com sucesso!' });
    },
    onError: (err: unknown) => {
      toast({ title: 'Erro', description: err instanceof Error ? err.message : 'Erro ao registrar sessão', variant: 'destructive' });
    },
  });

  const plannerMutation = useMutation({
    mutationFn: async () => {
      if (!plannerTarget || !clinicId) throw new Error('Selecione um tratamento para planejar.');
      if (!plannerProfessional || plannerProfessional === 'unassigned') throw new Error('Selecione um profissional.');
      if (!plannerStartDate || !plannerTime) throw new Error('Defina a data e o horário iniciais.');

      const count = Math.max(1, Math.min(parseInt(plannerCount) || 1, plannerTarget.balance || 1));
      const intervalDays = Math.max(1, parseInt(plannerIntervalDays) || 7);
      const treatment = treatments.find((item: TreatmentRow) => item.id === plannerTarget.treatmentId);
      const durationMinutes = Number(treatment?.duration_minutes || 60);
      const batchId = crypto.randomUUID();
      const pendingRows: Array<Database['public']['Tables']['appointments']['Insert']> = [];

      for (let index = 0; index < count; index += 1) {
        const startTime = new Date(`${plannerStartDate}T${plannerTime}:00`);
        startTime.setDate(startTime.getDate() + index * intervalDays);
        const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

        if (!hasAvailabilityWindow(plannerProfessional, startTime, endTime)) {
          const dayLabel = weekDays.find((day) => day.value === startTime.getDay())?.label || 'dia';
          throw new Error(`O profissional está fora da disponibilidade em ${dayLabel}, ${format(startTime, 'dd/MM HH:mm', { locale: ptBR })}.`);
        }

        if (hasBlockConflict(plannerProfessional, startTime, endTime)) {
          throw new Error(`Existe um bloqueio em ${format(startTime, 'dd/MM HH:mm', { locale: ptBR })}.`);
        }

        const { data: conflicts, error: conflictError } = await supabase.from('appointments')
          .select('id')
          .eq('clinic_id', clinicId)
          .eq('professional_id', plannerProfessional)
          .lt('start_time', endTime.toISOString())
          .gt('end_time', startTime.toISOString())
          .not('status', 'in', '(cancelled,rescheduled)');
        if (conflictError) throw conflictError;
        if ((conflicts || []).length > 0) {
          throw new Error(`Já existe outro atendimento em ${format(startTime, 'dd/MM HH:mm', { locale: ptBR })}.`);
        }

        pendingRows.push({
          clinic_id: clinicId,
          patient_id: plannerTarget.patientId,
          treatment_id: plannerTarget.treatmentId,
          professional_id: plannerProfessional,
          appointment_type: 'session',
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          scheduled_at: startTime.toISOString(),
          duration_minutes: durationMinutes,
          status: 'scheduled',
          notes: plannerNotes.trim() || null,
          is_batch: true,
          batch_id: batchId,
        });
      }

      const { error } = await supabase.from('appointments').insert(pendingRows);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['session-appointments'] });
      setPlannerOpen(false);
      setPlannerTarget(null);
      toast({ title: 'Sessões planejadas com sucesso!' });
    },
    onError: (err: unknown) => {
      toast({ title: 'Erro ao planejar sessões', description: err instanceof Error ? err.message : 'Erro ao planejar sessões', variant: 'destructive' });
    },
  });

  const openDialog = () => {
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const registerFromSummary = (row: SessionSummaryRow) => {
    setForm({
      ...emptyForm,
      patient_id: row.patientId,
      treatment_id: row.treatmentId || '',
    });
    setDialogOpen(true);
  };

  const openPlanner = (row: SessionSummaryRow) => {
    setPlannerTarget(row);
    setPlannerStartDate(format(new Date(), 'yyyy-MM-dd'));
    setPlannerTime('09:00');
    setPlannerIntervalDays('7');
    setPlannerCount(String(Math.max(1, row.balance)));
    setPlannerProfessional('unassigned');
    setPlannerNotes('');
    setPlannerOpen(true);
  };

  return (
    <div>
      <PageHeader title="Sessões" description="Acompanhe saldo contratado, sessões realizadas e registro operacional">
        <BrandButton onClick={openDialog}>
          <Plus className="w-4 h-4" /> Registrar Sessão
        </BrandButton>
      </PageHeader>

      <div className="grid gap-3 md:grid-cols-5 mb-6">
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <CalendarCheck2 className="w-5 h-5 text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">{availableAppointments.length}</p>
            <p className="text-xs text-muted-foreground">Agendamentos prontos para registrar</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <Package className="w-5 h-5 text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">{summaryRows.reduce((sum, row) => sum + row.contracted, 0)}</p>
            <p className="text-xs text-muted-foreground">Sessões contratadas</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <CheckCircle2 className="w-5 h-5 text-success mb-2" />
            <p className="text-2xl font-bold text-foreground">{summaryRows.reduce((sum, row) => sum + row.performed, 0)}</p>
            <p className="text-xs text-muted-foreground">Sessões realizadas</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <AlertTriangle className="w-5 h-5 text-warning mb-2" />
            <p className="text-2xl font-bold text-foreground">
              {summaryRows.filter((row) => row.balance > 0).reduce((sum, row) => sum + row.balance, 0)}
            </p>
            <p className="text-xs text-muted-foreground">Saldo pendente de execução</p>
          </CardContent>
        </Card>
        <Card
          className={cn(
            'shadow-card animate-fade-in cursor-pointer',
            renewalOnly ? 'border-primary bg-primary/5' : 'border-border/60'
          )}
          onClick={() => setBalanceFilter((current) => (current === 'renewal_window' ? 'all' : 'renewal_window'))}
        >
          <CardContent className="p-4">
            <AlertTriangle className="w-5 h-5 text-warning mb-2" />
            <p className="text-2xl font-bold text-foreground">{renewalTasks.length}</p>
            <p className="text-xs text-muted-foreground">Renovação</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card mb-6 animate-fade-in">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resumo por paciente e tratamento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar paciente ou tratamento..."
                className="pl-10"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={balanceFilter} onValueChange={setBalanceFilter}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filtrar resumo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="with_balance">Com saldo pendente</SelectItem>
                <SelectItem value="completed">Pacotes concluídos</SelectItem>
                <SelectItem value="no_contract">Sem contrato associado</SelectItem>
                <SelectItem value="renewal_window">Janela de renovação</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredSummaryRows.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-lg font-semibold">Nenhum resumo encontrado</h3>
              <p className="text-sm text-muted-foreground">
                O resumo aparece quando existem contratos ou sessões registradas.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSummaryRows.map((row) => (
                <div
                  key={row.key}
                  className="rounded-xl border bg-background p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-foreground">{row.patientName}</p>
                      <BrandBadge
                        status={
                          row.balance > 0 ? 'pending' : row.contracted > 0 ? 'completed' : 'draft'
                        }
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">{row.treatmentName}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.lastPerformedAt
                        ? `Última sessão em ${format(new Date(row.lastPerformedAt), 'dd/MM/yyyy', { locale: ptBR })}`
                        : 'Nenhuma sessão registrada ainda'}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-3 min-w-[280px]">
                    <div className="rounded-lg bg-secondary/40 px-3 py-2">
                      <p className="text-xs text-muted-foreground">Contratadas</p>
                      <p className="text-lg font-semibold">{row.contracted}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/40 px-3 py-2">
                      <p className="text-xs text-muted-foreground">Realizadas</p>
                      <p className="text-lg font-semibold">{row.performed}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/40 px-3 py-2">
                      <p className="text-xs text-muted-foreground">Saldo</p>
                      <p className={cn('text-lg font-semibold', row.balance > 0 ? 'text-warning' : 'text-success')}>
                        {row.balance}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    {row.balance > 0 && (
                      <BrandButton variant="outline" onClick={() => openPlanner(row)}>
                        <CalendarRange className="w-4 h-4" />
                        Planejar
                      </BrandButton>
                    )}
                    <BrandButton onClick={() => registerFromSummary(row)}>
                      <Plus className="w-4 h-4" />
                      Registrar
                    </BrandButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-card animate-fade-in">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Histórico recente</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="space-y-3">
              {[...Array(5)].map((_, index) => (
                <div key={index} className="h-20 bg-muted rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && sessions.length === 0 && (
            <div className="text-center py-12">
              <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-lg font-semibold">Nenhuma sessão registrada</h3>
              <p className="text-sm text-muted-foreground">
                Registre sessões a partir da agenda ou manualmente quando necessário.
              </p>
            </div>
          )}

          {!isLoading && sessions.length > 0 && (
            <div className="space-y-3">
              {sessions.map((session: SessionRecordRow) => (
                <Card key={session.id} className="shadow-card border-border/60">
                  <CardContent className="p-4">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground">{session.patients?.full_name}</p>
                          {session.patients?.dissatisfaction_flag && (
                            <span className="flex items-center gap-1 text-xs text-destructive font-medium">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Insatisfeito
                            </span>
                          )}
                          {session.appointment_id && <BrandBadge status={'scheduled' as BadgeStatus} />}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {session.treatments?.name || 'Tratamento não informado'} · Sessão {session.session_number}/{session.total_sessions}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Realizada em {format(new Date(session.performed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          {session.appointments?.start_time ? ' via agenda' : ' em registro manual'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Observações operacionais</p>
                        <p className="text-sm text-foreground max-w-md">
                          {session.notes || session.observations || 'Sem observações registradas'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar sessão</DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              createMutation.mutate();
            }}
            className="space-y-4 mt-4"
          >
            <div className="space-y-2">
              <Label>Origem do registro</Label>
              <Select
                value={form.appointment_id}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    appointment_id: value,
                    patient_id: value === 'manual' ? current.patient_id : '',
                    treatment_id: value === 'manual' ? current.treatment_id : '',
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar agendamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Registro manual (sem agendamento)</SelectItem>
                  {availableAppointments.map((appointment: AppointmentRow) => (
                    <SelectItem key={appointment.id} value={appointment.id}>
                      {format(new Date(appointment.start_time), 'dd/MM HH:mm', { locale: ptBR })} ·{' '}
                      {appointment.patients?.full_name} · {appointment.treatments?.name || 'Sem tratamento'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.appointment_id === 'manual' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Paciente *</Label>
                  <Select
                    value={form.patient_id}
                    onValueChange={(value) => setForm((current) => ({ ...current, patient_id: value, treatment_id: '' }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar paciente" />
                    </SelectTrigger>
                    <SelectContent>
                      {patients.map((patient: PatientRow) => (
                        <SelectItem key={patient.id} value={patient.id}>
                          {patient.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tratamento *</Label>
                  <Select
                    value={form.treatment_id}
                    onValueChange={(value) => setForm((current) => ({ ...current, treatment_id: value }))}
                    disabled={!form.patient_id || manualTreatmentOptions.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={!form.patient_id ? 'Selecione um paciente' : manualTreatmentOptions.length === 0 ? 'Paciente sem tratamento contratado' : 'Selecionar tratamento'} />
                    </SelectTrigger>
                    <SelectContent>
                      {manualTreatmentOptions.map((treatment) => (
                        <SelectItem key={treatment.id} value={treatment.id}>
                          {treatment.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {selectedPatient && (
              <AnamneseAlertBanner
                status={selectedPatient.current_anamnese_status}
                expiresAt={selectedPatient.current_anamnese_expires_at}
                patientId={selectedPatient.id}
                patientName={selectedPatient.full_name}
              />
            )}

            {currentFlowSummary && (
              <div className="rounded-xl border bg-secondary/30 p-4">
                <p className="text-sm font-medium text-foreground mb-2">Resumo operacional do tratamento</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Contratadas</p>
                    <p className="text-lg font-semibold">{currentFlowSummary.contracted}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Realizadas</p>
                    <p className="text-lg font-semibold">{currentFlowSummary.performed}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Próxima sessão</p>
                    <p className="text-lg font-semibold">
                      {currentFlowSummary.performed + 1}
                      {currentFlowSummary.contracted > 0 ? ` / ${currentFlowSummary.contracted}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Notas do procedimento</Label>
              <Textarea
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Produtos utilizados</Label>
              <Input
                value={form.products_used}
                onChange={(event) => setForm((current) => ({ ...current, products_used: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Observações / recomendações</Label>
              <Textarea
                value={form.observations}
                onChange={(event) => setForm((current) => ({ ...current, observations: event.target.value }))}
                rows={2}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <BrandButton type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                Cancelar
              </BrandButton>
              <BrandButton
                type="submit"
                className="flex-1"
                disabled={createMutation.isPending || (!selectedPatientId && !form.patient_id)}
              >
                {createMutation.isPending ? 'Salvando...' : 'Registrar sessão'}
              </BrandButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={plannerOpen} onOpenChange={setPlannerOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Planejar sessões</DialogTitle>
          </DialogHeader>

          {plannerTarget && (
            <div className="space-y-5 mt-4">
              <div className="rounded-xl border bg-secondary/30 p-4">
                <p className="font-semibold text-foreground">{plannerTarget.patientName}</p>
                <p className="text-sm text-muted-foreground">{plannerTarget.treatmentName}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Saldo pendente: {plannerTarget.balance} sessão{plannerTarget.balance === 1 ? '' : 'ões'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Profissional *</Label>
                  <Select value={plannerProfessional} onValueChange={setPlannerProfessional}>
                    <SelectTrigger><SelectValue placeholder="Selecionar profissional" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Selecionar</SelectItem>
                      {professionals.map((professional) => (
                        <SelectItem key={professional.user_id} value={professional.user_id}>
                          {professional.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quantidade de sessões</Label>
                  <Input
                    type="number"
                    min={1}
                    max={Math.max(1, plannerTarget.balance)}
                    value={plannerCount}
                    onChange={(event) => setPlannerCount(event.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Data inicial</Label>
                  <Input type="date" value={plannerStartDate} onChange={(event) => setPlannerStartDate(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Horário</Label>
                  <Input type="time" value={plannerTime} onChange={(event) => setPlannerTime(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Intervalo em dias</Label>
                  <Input type="number" min={1} value={plannerIntervalDays} onChange={(event) => setPlannerIntervalDays(event.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notas para todos os agendamentos</Label>
                <Textarea
                  value={plannerNotes}
                  onChange={(event) => setPlannerNotes(event.target.value)}
                  rows={3}
                  placeholder="Ex.: pacote pós-operatório, manter mesmo horário semanal, etc."
                />
              </div>

              {plannerProfessional !== 'unassigned' && (
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  Sessões serão criadas para <span className="font-medium text-foreground">{getProfessionalLabel(plannerProfessional)}</span>,
                  respeitando disponibilidade semanal e bloqueios já cadastrados.
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <BrandButton type="button" variant="outline" className="flex-1" onClick={() => setPlannerOpen(false)}>
                  Cancelar
                </BrandButton>
                <BrandButton className="flex-1" onClick={() => plannerMutation.mutate()} disabled={plannerMutation.isPending}>
                  {plannerMutation.isPending ? 'Planejando...' : 'Criar agenda das sessões'}
                </BrandButton>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
