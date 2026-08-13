import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useStaffDirectory } from '@/hooks/useStaffDirectory';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { BrandBadge, type BadgeStatus } from '@/components/ui/brand-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Plus, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Check, X, AlertTriangle, ClipboardList, UserPlus, CalendarCheck2, Clock3, CheckCircle2, CalendarCog, Lock, Trash2, BellRing } from 'lucide-react';
import QuickPatientModal from '@/components/patient/QuickPatientModal';
import { AnamneseAlertBanner } from '@/components/anamnese/AnamneseAlertBanner';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek,
  isSameMonth, isSameDay, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays,
  startOfDay, endOfDay
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Database } from '@/integrations/supabase/types';

const professionalColors = [
  'hsl(var(--primary))', 'hsl(210 80% 50%)', 'hsl(280 60% 50%)',
  'hsl(30 80% 50%)', 'hsl(160 60% 40%)', 'hsl(350 70% 50%)',
  'hsl(190 70% 40%)', 'hsl(60 70% 40%)',
];

const statusConfig: Record<string, { label: string; badge: BadgeStatus; style: string }> = {
  scheduled: { label: 'Agendado', badge: 'scheduled', style: 'border-l-4 border-l-info' },
  confirmed: { label: 'Confirmado', badge: 'confirmed', style: 'border-l-4 border-l-success' },
  completed: { label: 'Concluído', badge: 'completed', style: 'opacity-60 border-l-4 border-l-success' },
  cancelled: { label: 'Cancelado', badge: 'cancelled', style: 'opacity-50 line-through border-l-4 border-l-destructive' },
  no_show: { label: 'Não compareceu', badge: 'no_show', style: 'border-l-4 border-l-warning' },
  rescheduled: { label: 'Remarcado', badge: 'scheduled', style: 'border-l-4 border-l-sky-500 opacity-80' },
  in_progress: { label: 'Em andamento', badge: 'in_progress', style: 'border-l-4 border-l-info' },
};

type ViewMode = 'month' | 'week' | 'day';
type WaitlistWindowType = Database['public']['Enums']['waitlist_window_type'];
type WaitlistPriority = Database['public']['Enums']['waitlist_priority'];
type WaitlistContactPreference = Database['public']['Enums']['waitlist_contact_preference'];
type WaitlistTargetType = 'lead' | 'patient';
type AppointmentRow = Database['public']['Tables']['appointments']['Row'] & {
  appointment_type?: 'session' | 'evaluation' | null;
  scheduled_at?: string | null;
  duration_minutes?: number | null;
  lead_id?: string | null;
  is_batch?: boolean | null;
  patients?: {
    full_name?: string | null;
    dissatisfaction_flag?: boolean | null;
    dissatisfaction_level?: string | null;
    dissatisfaction_reason?: string | null;
  } | null;
  leads?: { full_name?: string | null; phone?: string | null } | null;
  treatments?: { name?: string | null } | null;
};
type WaitlistRow = Database['public']['Tables']['appointment_waitlist']['Row'] & {
  patients?: { full_name?: string | null } | null;
  leads?: { full_name?: string | null } | null;
  treatments?: { name?: string | null } | null;
};
type WaitlistNotificationRow = Database['public']['Tables']['waitlist_notifications']['Row'] & {
  appointment_waitlist?: WaitlistRow | null;
};
type ReminderRow = Database['public']['Tables']['appointment_reminders']['Row'];
type WhatsAppCommandLogRow = Database['public']['Tables']['whatsapp_command_logs']['Row'];
type AgendaJobExecutionRow = Database['public']['Tables']['agenda_job_executions']['Row'];
type ContractLite = Pick<Database['public']['Tables']['contracts']['Row'], 'id' | 'patient_id' | 'proposal_id' | 'status'>;
type ProposalItemLite = Pick<Database['public']['Tables']['proposal_items']['Row'], 'proposal_id' | 'treatment_id'>;
type SessionRecordLite = Pick<Database['public']['Tables']['session_records']['Row'], 'patient_id' | 'treatment_id'>;
const weekDays = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
];

function getWindowByType(type: WaitlistWindowType) {
  const now = new Date();
  if (type === 'this_week') {
    return {
      start: format(startOfWeek(now, { locale: ptBR }), 'yyyy-MM-dd'),
      end: format(endOfWeek(now, { locale: ptBR }), 'yyyy-MM-dd'),
    };
  }
  if (type === 'next_week') {
    const nextWeek = addWeeks(now, 1);
    return {
      start: format(startOfWeek(nextWeek, { locale: ptBR }), 'yyyy-MM-dd'),
      end: format(endOfWeek(nextWeek, { locale: ptBR }), 'yyyy-MM-dd'),
    };
  }
  if (type === 'this_month') {
    return {
      start: format(startOfMonth(now), 'yyyy-MM-dd'),
      end: format(endOfMonth(now), 'yyyy-MM-dd'),
    };
  }
  return {
    start: format(now, 'yyyy-MM-dd'),
    end: format(addDays(now, 7), 'yyyy-MM-dd'),
  };
}

function waitlistPriorityLabel(priority: WaitlistPriority) {
  if (priority === 'urgent') return 'Urgente';
  if (priority === 'high') return 'Alta';
  return 'Normal';
}

function isMissingRelationError(message?: string | null) {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('could not find the table') || normalized.includes('relation') && normalized.includes('does not exist');
}

function waitlistStatusLabel(status: Database['public']['Enums']['waitlist_status']) {
  if (status === 'waiting') return 'Aguardando vaga';
  if (status === 'match_found') return 'Vaga encontrada';
  if (status === 'contact_attempted') return 'Contato iniciado';
  if (status === 'scheduled') return 'Agendado';
  if (status === 'expired') return 'Expirado';
  if (status === 'cancelled_by_patient') return 'Cancelado pelo paciente';
  return 'Cancelado pela clínica';
}

export default function AppointmentsPage() {
  const { clinicId } = useBranding();
  const { user } = useAuth();
  const { role } = useUserRole();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewAppt, setViewAppt] = useState<AppointmentRow | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('09:00');
  const [appointmentType, setAppointmentType] = useState<'session' | 'evaluation'>('session');
  const [selectedPatient, setSelectedPatient] = useState('');
  const [selectedLead, setSelectedLead] = useState('');
  const [selectedTreatment, setSelectedTreatment] = useState('');
  const [selectedProfessional, setSelectedProfessional] = useState('');
  const [filterProfessional, setFilterProfessional] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [queueExpanded, setQueueExpanded] = useState(true);
  const [createFormError, setCreateFormError] = useState('');
  const [duration, setDuration] = useState('60');
  const [notes, setNotes] = useState('');
  const [quickPatientOpen, setQuickPatientOpen] = useState(false);
  const [availabilityDialogOpen, setAvailabilityDialogOpen] = useState(false);
  const [blocksDialogOpen, setBlocksDialogOpen] = useState(false);
  const [waitlistDialogOpen, setWaitlistDialogOpen] = useState(false);
  const [availabilityProfessional, setAvailabilityProfessional] = useState('unassigned');
  const [availabilityDraft, setAvailabilityDraft] = useState<Record<number, { isActive: boolean; start: string; end: string }>>({});
  const [blockProfessional, setBlockProfessional] = useState('all');
  const [blockStartDate, setBlockStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [blockStartTime, setBlockStartTime] = useState('09:00');
  const [blockEndDate, setBlockEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [blockEndTime, setBlockEndTime] = useState('10:00');
  const [blockReason, setBlockReason] = useState('');
  const [blockNotes, setBlockNotes] = useState('');
  const [exceptionModal, setExceptionModal] = useState<{ mode: 'cancel' | 'no_show' | 'reschedule'; appointment: Record<string, unknown> & { id: string; clinic_id: string; status: string; appointment_type?: string | null; lead_id?: string | null } } | null>(null);
  const [exceptionReason, setExceptionReason] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('09:00');
  const [rescheduleDuration, setRescheduleDuration] = useState('60');
  const [rescheduleProfessional, setRescheduleProfessional] = useState('unassigned');
  const [rescheduleNotes, setRescheduleNotes] = useState('');
  const [reassignProfessional, setReassignProfessional] = useState('unassigned');
  const [proposalLoadingId, setProposalLoadingId] = useState<string | null>(null);
  const [waitlistTargetType, setWaitlistTargetType] = useState<WaitlistTargetType>('lead');
  const [waitlistLeadId, setWaitlistLeadId] = useState('');
  const [waitlistPatientId, setWaitlistPatientId] = useState('');
  const [waitlistProfessionalId, setWaitlistProfessionalId] = useState('any');
  const [waitlistTreatmentId, setWaitlistTreatmentId] = useState('none');
  const [waitlistWindowType, setWaitlistWindowType] = useState<WaitlistWindowType>('this_week');
  const [waitlistWindowStart, setWaitlistWindowStart] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [waitlistWindowEnd, setWaitlistWindowEnd] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
  const [waitlistPreferredPeriod, setWaitlistPreferredPeriod] = useState<'morning' | 'afternoon' | 'evening' | 'all'>('all');
  const [waitlistDuration, setWaitlistDuration] = useState('60');
  const [waitlistPriority, setWaitlistPriority] = useState<WaitlistPriority>('normal');
  const [waitlistContactPreference, setWaitlistContactPreference] = useState<WaitlistContactPreference>('whatsapp');
  const [waitlistContactPhone, setWaitlistContactPhone] = useState('');
  const [waitlistNotes, setWaitlistNotes] = useState('');
  const [waitlistSchemaAvailable, setWaitlistSchemaAvailable] = useState(true);

  const prefillLeadId = searchParams.get('leadId');
  const prefillPatientId = searchParams.get('patientId');
  const prefillProfessionalId = searchParams.get('professionalId');
  const prefillAppointmentType = searchParams.get('appointmentType');
  const prefillTreatmentId = searchParams.get('treatmentId');
  const shouldOpenNewFromQuery = searchParams.get('openNew') === '1';

  const isProfessional = role === 'professional';

  // Get date range based on view
  const { rangeStart, rangeEnd, calendarDays } = useMemo(() => {
    if (viewMode === 'month') {
      const ms = startOfMonth(currentDate);
      const me = endOfMonth(currentDate);
      const cs = startOfWeek(ms, { locale: ptBR });
      const ce = endOfWeek(me, { locale: ptBR });
      return { rangeStart: cs, rangeEnd: ce, calendarDays: eachDayOfInterval({ start: cs, end: ce }) };
    } else if (viewMode === 'week') {
      const ws = startOfWeek(currentDate, { locale: ptBR });
      const we = endOfWeek(currentDate, { locale: ptBR });
      return { rangeStart: ws, rangeEnd: we, calendarDays: eachDayOfInterval({ start: ws, end: we }) };
    } else {
      return { rangeStart: startOfDay(currentDate), rangeEnd: endOfDay(currentDate), calendarDays: [currentDate] };
    }
  }, [currentDate, viewMode]);

  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments', clinicId, rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('*, patients(full_name, dissatisfaction_flag, dissatisfaction_level, dissatisfaction_reason), leads!appointments_lead_id_fkey(full_name, phone), treatments(name)')
        .eq('clinic_id', clinicId!)
        .gte('scheduled_at', rangeStart.toISOString())
        .lte('scheduled_at', rangeEnd.toISOString())
        .order('scheduled_at');
      if (error) throw error;
      return (data || []) as AppointmentRow[];
    },
    enabled: !!clinicId,
  });

  const selectedPatientLookupId = selectedPatient || prefillPatientId || '';
  const { data: patients = [] } = useQuery({
    queryKey: ['patients-select', clinicId, selectedPatientLookupId],
    queryFn: async () => {
      let query = supabase
        .from('patients')
        .select('id, full_name, current_anamnese_status, current_anamnese_expires_at')
        .eq('clinic_id', clinicId!)
        .order('full_name');
      query = selectedPatientLookupId
        ? query.or(`status.eq.active,id.eq.${selectedPatientLookupId}`)
        : query.eq('status', 'active');
      const { data } = await query;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['leads-select', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('leads')
        .select('id, full_name, phone, cpf, kanban_stage, assigned_to, appointment_id')
        .eq('clinic_id', clinicId!)
        .is('deleted_at', null)
        .order('full_name');
      if (error) throw error;
      return (data || []).filter((lead) => !['closed_won', 'closed_lost'].includes(lead.kanban_stage));
    },
    enabled: !!clinicId,
  });

  const { data: treatments = [] } = useQuery({
    queryKey: ['treatments-select', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('treatments').select('id, name, duration_minutes').eq('clinic_id', clinicId!).eq('is_active', true).order('name');
      return data || [];
    },
    enabled: !!clinicId,
  });
  const { data: contracts = [] } = useQuery({
    queryKey: ['appointments-contracts', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('id, patient_id, proposal_id, status')
        .eq('clinic_id', clinicId!)
        .neq('status', 'cancelled');
      if (error) throw error;
      return (data || []) as ContractLite[];
    },
    enabled: !!clinicId,
  });
  const { data: proposalItems = [] } = useQuery({
    queryKey: ['appointments-proposal-items', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposal_items')
        .select('proposal_id, treatment_id');
      if (error) throw error;
      return (data || []) as ProposalItemLite[];
    },
    enabled: !!clinicId,
  });
  const { data: sessionRecords = [] } = useQuery({
    queryKey: ['appointments-session-records', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('session_records')
        .select('patient_id, treatment_id')
        .eq('clinic_id', clinicId!);
      if (error) throw error;
      return (data || []) as SessionRecordLite[];
    },
    enabled: !!clinicId,
  });

  const { staff: professionals = [] } = useStaffDirectory(clinicId);

  const { data: availability = [] } = useQuery({
    queryKey: ['professional-availability', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('professional_availability')
        .select('*')
        .eq('clinic_id', clinicId!)
        .eq('is_active', true)
        .order('professional_id')
        .order('day_of_week');
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: appointmentBlocks = [] } = useQuery({
    queryKey: ['appointment-blocks', clinicId, rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: async () => {
      const from = startOfDay(addDays(rangeStart, -14)).toISOString();
      const to = endOfDay(addDays(rangeEnd, 30)).toISOString();
      const { data, error } = await supabase.from('appointment_blocks')
        .select('*')
        .eq('clinic_id', clinicId!)
        .gte('start_at', from)
        .lte('end_at', to)
        .order('start_at');
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });
  const { data: waitlistEntries = [] } = useQuery({
    queryKey: ['appointment-waitlist', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointment_waitlist')
        .select('*, patients(full_name), leads(full_name), treatments(name)')
        .eq('clinic_id', clinicId!)
        .in('status', ['waiting', 'match_found', 'contact_attempted'])
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(50);
      if (error) {
        if (isMissingRelationError(error.message)) {
          setWaitlistSchemaAvailable(false);
          return [];
        }
        throw error;
      }
      setWaitlistSchemaAvailable(true);
      return (data || []) as WaitlistRow[];
    },
    enabled: !!clinicId,
  });
  const { data: waitlistNotifications = [] } = useQuery({
    queryKey: ['waitlist-notifications', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('waitlist_notifications')
        .select('*, appointment_waitlist(*)')
        .eq('clinic_id', clinicId!)
        .eq('action_taken', 'none')
        .order('notification_sent_at', { ascending: false })
        .limit(20);
      if (error) {
        if (isMissingRelationError(error.message)) {
          setWaitlistSchemaAvailable(false);
          return [];
        }
        throw error;
      }
      return (data || []) as WaitlistNotificationRow[];
    },
    enabled: !!clinicId,
  });
  const { data: reminderQueue = [] } = useQuery({
    queryKey: ['appointment-reminders', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointment_reminders')
        .select('*')
        .eq('clinic_id', clinicId!)
        .order('created_at', { ascending: false })
        .limit(120);
      if (error) throw error;
      return (data || []) as ReminderRow[];
    },
    enabled: !!clinicId,
  });
  const { data: whatsappLogs = [] } = useQuery({
    queryKey: ['whatsapp-command-logs', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_command_logs')
        .select('*')
        .eq('clinic_id', clinicId!)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as WhatsAppCommandLogRow[];
    },
    enabled: !!clinicId,
  });
  const { data: agendaJobExecutions = [] } = useQuery({
    queryKey: ['agenda-job-executions', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agenda_job_executions')
        .select('*')
        .or(`clinic_id.is.null,clinic_id.eq.${clinicId}`)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as AgendaJobExecutionRow[];
    },
    enabled: !!clinicId,
  });

  const getSelectedPatientData = (patientId: string) => patients.find((p) => p.id === patientId);
  const getSelectedLeadData = useCallback((leadId: string) => leads.find((lead) => lead.id === leadId), [leads]);
  const getAppointmentStartDate = (appointment) => new Date(appointment.start_time || appointment.scheduled_at);
  const getAppointmentEndDate = (appointment) => {
    if (appointment.end_time) return new Date(appointment.end_time);
    const start = getAppointmentStartDate(appointment);
    return new Date(start.getTime() + (appointment.duration_minutes || 60) * 60000);
  };
  const getAppointmentDisplayName = (appointment) => {
    return (appointment.patients as { full_name?: string | null } | null)?.full_name || (appointment.leads as { full_name?: string | null } | null)?.full_name || 'Lead sem paciente';
  };
  const getBlocksForDay = useCallback((day: Date) => {
    const dayStart = startOfDay(day).getTime();
    const dayEnd = endOfDay(day).getTime();
    return appointmentBlocks.filter((block) => {
      const blockStart = new Date(block.start_at).getTime();
      const blockEnd = new Date(block.end_at).getTime();
      return blockStart <= dayEnd && blockEnd >= dayStart;
    });
  }, [appointmentBlocks]);
  const getProfessionalLabel = (professionalId?: string | null) => {
    if (!professionalId) return 'Não atribuído';
    return professionals.find((professional) => professional.user_id === professionalId)?.label || 'Profissional';
  };
  const hasAvailabilityWindow = (professionalId: string | null, startTime: Date, endTime: Date) => {
    if (!professionalId) return true;
    const dayOfWeek = startTime.getDay();
    const slots = availability.filter((slot) => slot.professional_id === professionalId && slot.day_of_week === dayOfWeek && slot.is_active);
    if (slots.length === 0) return false;

    const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
    const endMinutes = endTime.getHours() * 60 + endTime.getMinutes();
    return slots.some((slot) => {
      const [startHour, startMinute] = String(slot.start_time).slice(0, 5).split(':').map(Number);
      const [endHour, endMinute] = String(slot.end_time).slice(0, 5).split(':').map(Number);
      const slotStartMinutes = startHour * 60 + startMinute;
      const slotEndMinutes = endHour * 60 + endMinute;
      return startMinutes >= slotStartMinutes && endMinutes <= slotEndMinutes;
    });
  };
  const assertNoSchedulingConflicts = async ({
    professionalId,
    startTime,
    endTime,
    ignoreAppointmentId,
  }: {
    professionalId: string | null;
    startTime: Date;
    endTime: Date;
    ignoreAppointmentId?: string;
  }) => {
    if (!clinicId) return;

    let appointmentsQuery = supabase.from('appointments')
      .select('id, start_time, end_time, status, professional_id')
      .eq('clinic_id', clinicId)
      .lt('start_time', endTime.toISOString())
      .gt('end_time', startTime.toISOString())
      .not('status', 'in', '(cancelled,rescheduled)');

    if (professionalId) {
      appointmentsQuery = appointmentsQuery.eq('professional_id', professionalId);
    }

    const { data: conflictingAppointments, error: appointmentError } = await appointmentsQuery;
    if (appointmentError) throw appointmentError;

    const realConflict = (conflictingAppointments || []).some((appointment) => appointment.id !== ignoreAppointmentId);
    if (realConflict) {
      throw new Error('Já existe outro agendamento para esse horário.');
    }

    let blocksQuery = supabase.from('appointment_blocks')
      .select('id, professional_id, start_at, end_at')
      .eq('clinic_id', clinicId)
      .lt('start_at', endTime.toISOString())
      .gt('end_at', startTime.toISOString());

    if (professionalId) {
      blocksQuery = blocksQuery.or(`professional_id.is.null,professional_id.eq.${professionalId}`);
    }

    const { data: conflictingBlocks, error: blockError } = await blocksQuery;
    if (blockError) throw blockError;
    if ((conflictingBlocks || []).length > 0) {
      throw new Error('Existe um bloqueio para esse horário.');
    }
  };

  const openExceptionModal = (mode: 'cancel' | 'no_show' | 'reschedule', appointment: Record<string, unknown> & { id: string; clinic_id: string; status: string; appointment_type?: string | null; lead_id?: string | null }) => {
    setExceptionReason('');
    setRescheduleDate(format(getAppointmentStartDate(appointment), 'yyyy-MM-dd'));
    setRescheduleTime(format(getAppointmentStartDate(appointment), 'HH:mm'));
    setRescheduleDuration(String(appointment.duration_minutes || Math.max(15, Math.round((getAppointmentEndDate(appointment).getTime() - getAppointmentStartDate(appointment).getTime()) / 60000))));
    setRescheduleProfessional(appointment.professional_id || 'unassigned');
    setRescheduleNotes(appointment.notes || '');
    setExceptionModal({ mode, appointment });
  };

  useEffect(() => {
    if (!viewAppt) {
      setReassignProfessional('unassigned');
      return;
    }
    setReassignProfessional(viewAppt.professional_id || 'unassigned');
  }, [viewAppt]);

  useEffect(() => {
    if (!shouldOpenNewFromQuery) return;
    resetForm();
    if (prefillLeadId && leads.some((lead) => lead.id === prefillLeadId)) {
      setAppointmentType('evaluation');
      setSelectedLead(prefillLeadId);
      setSelectedPatient('');
    } else if (prefillPatientId) {
      setAppointmentType('session');
      setSelectedPatient(prefillPatientId);
      setSelectedLead('');
    } else {
      return;
    }
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
    setSelectedProfessional(prefillProfessionalId || '');
    if (prefillTreatmentId && treatments.some((treatment) => treatment.id === prefillTreatmentId)) {
      setSelectedTreatment(prefillTreatmentId);
    }
    setDialogOpen(true);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('openNew');
    nextParams.delete('leadId');
    nextParams.delete('patientId');
    nextParams.delete('professionalId');
    nextParams.delete('appointmentType');
    nextParams.delete('treatmentId');
    setSearchParams(nextParams, { replace: true });
  }, [shouldOpenNewFromQuery, prefillLeadId, prefillPatientId, prefillAppointmentType, prefillTreatmentId, prefillProfessionalId, leads, patients, treatments, searchParams, setSearchParams]);

  useEffect(() => {
    if (appointmentType !== 'evaluation') return;
    if (!selectedLead) {
      if (!dialogOpen) {
        setSelectedProfessional('');
      }
      return;
    }

    const lead = getSelectedLeadData(selectedLead);
    if (!lead?.assigned_to) {
      if (!selectedProfessional && isProfessional && user?.id) {
        setSelectedProfessional(user.id);
      }
      return;
    }

    const hasProfessionalAssigned = professionals.some((professional) => professional.user_id === lead.assigned_to);
    setSelectedProfessional(hasProfessionalAssigned ? lead.assigned_to : (isProfessional && user?.id ? user.id : ''));
  }, [appointmentType, selectedLead, professionals, isProfessional, user, dialogOpen, selectedProfessional, getSelectedLeadData]);

  useEffect(() => {
    if (professionals.length > 0 && availabilityProfessional === 'unassigned') {
      setAvailabilityProfessional(professionals[0].user_id);
    }
  }, [professionals, availabilityProfessional]);

  useEffect(() => {
    if (!availabilityProfessional || availabilityProfessional === 'unassigned') return;
    const nextDraft = weekDays.reduce((acc, day) => {
      const slot = availability.find((item) => item.professional_id === availabilityProfessional && item.day_of_week === day.value && item.is_active);
      acc[day.value] = {
        isActive: !!slot,
        start: slot ? String(slot.start_time).slice(0, 5) : '09:00',
        end: slot ? String(slot.end_time).slice(0, 5) : '18:00',
      };
      return acc;
    }, {} as Record<number, { isActive: boolean; start: string; end: string }>);
    setAvailabilityDraft(nextDraft);
  }, [availabilityProfessional, availability]);

  useEffect(() => {
    if (waitlistWindowType !== 'custom') {
      const window = getWindowByType(waitlistWindowType);
      setWaitlistWindowStart(window.start);
      setWaitlistWindowEnd(window.end);
    }
  }, [waitlistWindowType]);

  const getProfColor = (profId: string | null) => {
    if (!profId) return professionalColors[0];
    const index = professionals.findIndex(p => p.user_id === profId);
    return professionalColors[(index >= 0 ? index : 0) % professionalColors.length];
  };

  const sessionTreatmentSummaryMap = useMemo(() => {
    const contractedByKey = new Map<string, number>();
    const performedByKey = new Map<string, number>();
    const treatmentMap = new Map(
      treatments.map((t) => [t.id, { id: t.id, name: t.name, duration: Number(t.duration_minutes || 60), sessionsPerContractItem: 1 }])
    );
    const proposalIdsByPatient = new Map<string, Set<string>>();
    contracts.forEach((contract) => {
      if (!contract.patient_id || !contract.proposal_id) return;
      if (!proposalIdsByPatient.has(contract.patient_id)) {
        proposalIdsByPatient.set(contract.patient_id, new Set<string>());
      }
      proposalIdsByPatient.get(contract.patient_id)!.add(contract.proposal_id);
    });
    const patientByProposal = new Map<string, string>();
    proposalIdsByPatient.forEach((proposalIds, patientId) => {
      proposalIds.forEach((proposalId) => patientByProposal.set(proposalId, patientId));
    });
    proposalItems.forEach((item) => {
      if (!item.treatment_id || !item.proposal_id) return;
      const patientId = patientByProposal.get(item.proposal_id);
      if (!patientId) return;
      const key = `${patientId}:${item.treatment_id}`;
      contractedByKey.set(key, (contractedByKey.get(key) || 0) + 1);
    });
    sessionRecords.forEach((session) => {
      if (!session.patient_id || !session.treatment_id) return;
      const key = `${session.patient_id}:${session.treatment_id}`;
      performedByKey.set(key, (performedByKey.get(key) || 0) + 1);
    });
    return { contractedByKey, performedByKey, treatmentMap };
  }, [contracts, proposalItems, sessionRecords, treatments]);

  const sessionTreatmentOptions = useMemo(() => {
    if (appointmentType !== 'session' || !selectedPatient) return [] as Array<{ id: string; name: string; duration: number; contracted: number; performed: number; balance: number }>;
    const { contractedByKey, performedByKey, treatmentMap } = sessionTreatmentSummaryMap;
    const rows = new Map<string, { id: string; name: string; duration: number; contracted: number; performed: number; balance: number }>();
    contractedByKey.forEach((contracted, key) => {
      const [patientId, treatmentId] = key.split(':');
      if (patientId !== selectedPatient) return;
      const treatment = treatmentMap.get(treatmentId);
      if (!treatment) return;
      const performed = performedByKey.get(key) || 0;
      rows.set(treatmentId, {
        id: treatmentId,
        name: treatment.name,
        duration: treatment.duration,
        contracted,
        performed,
        balance: Math.max(contracted - performed, 0),
      });
    });
    return Array.from(rows.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [appointmentType, selectedPatient, sessionTreatmentSummaryMap]);

  const selectedSessionTreatmentSummary = useMemo(() => {
    if (appointmentType !== 'session' || !selectedTreatment) return null;
    return sessionTreatmentOptions.find((item) => item.id === selectedTreatment) || null;
  }, [appointmentType, selectedTreatment, sessionTreatmentOptions]);

  const hasSessionBalance = selectedSessionTreatmentSummary ? selectedSessionTreatmentSummary.balance > 0 : false;

  useEffect(() => {
    if (appointmentType !== 'session') return;
    if (!selectedTreatment) return;
    const valid = sessionTreatmentOptions.some((item) => item.id === selectedTreatment);
    if (!valid) setSelectedTreatment('');
  }, [appointmentType, selectedTreatment, sessionTreatmentOptions]);

  const filteredAppointments = useMemo(() => {
    let filtered = appointments;
    if (filterProfessional === 'unassigned') {
      filtered = filtered.filter((appointment) => !appointment.professional_id);
    } else if (filterProfessional !== 'all') {
      filtered = filtered.filter((a) => a.professional_id === filterProfessional);
    }
    if (filterStatus !== 'all') {
      filtered = filtered.filter((a) => a.status === filterStatus);
    }
    return filtered;
  }, [appointments, filterProfessional, filterStatus]);

  const operationalSummary = useMemo(() => {
    const todayAppointments = filteredAppointments.filter((appointment) =>
      isSameDay(getAppointmentStartDate(appointment), new Date())
    );
    const readyForSession = todayAppointments.filter((appointment) =>
      appointment.status === 'confirmed' || appointment.status === 'in_progress'
    );

    return {
      totalInView: filteredAppointments.length,
      today: todayAppointments.length,
      readyForSession: readyForSession.length,
      noShow: filteredAppointments.filter((appointment) => appointment.status === 'no_show').length,
      unassigned: filteredAppointments.filter((appointment) => !appointment.professional_id).length,
    };
  }, [filteredAppointments]);

  const todayQueue = useMemo(() => {
    return filteredAppointments
      .filter((appointment) => isSameDay(getAppointmentStartDate(appointment), new Date()))
      .sort((a, b) => +getAppointmentStartDate(a) - +getAppointmentStartDate(b))
      .slice(0, 5);
  }, [filteredAppointments]);

  const agendaSignals = useMemo(() => {
    const evaluations = filteredAppointments.filter((appointment) => appointment.appointment_type === 'evaluation').length;
    const batches = filteredAppointments.filter((appointment) => appointment.is_batch).length;
    const blockedDays = calendarDays.filter((day) => {
      const dayStart = startOfDay(day).getTime();
      const dayEnd = endOfDay(day).getTime();
      return appointmentBlocks.some((block) => {
        const blockStart = new Date(block.start_at).getTime();
        const blockEnd = new Date(block.end_at).getTime();
        return blockStart <= dayEnd && blockEnd >= dayStart;
      });
    }).length;

    return {
      evaluations,
      batches,
      blockedDays,
      blocks: appointmentBlocks.length,
    };
  }, [filteredAppointments, appointmentBlocks, calendarDays]);
  const whatsappOpsSummary = useMemo(() => {
    const pending = reminderQueue.filter((item) => item.status === 'pending').length;
    const sent = reminderQueue.filter((item) => item.status === 'sent').length;
    const failed = reminderQueue.filter((item) => item.status === 'failed').length;
    const inboundApplied = whatsappLogs.filter((log) => log.result_status === 'applied').length;
    const jobSuccess = agendaJobExecutions.filter((job) => job.status === 'completed').length;
    return {
      pending,
      sent,
      failed,
      inboundApplied,
      jobSuccess,
    };
  }, [reminderQueue, whatsappLogs, agendaJobExecutions]);

  const createMutation = useMutation({
    mutationFn: async () => {
      setCreateFormError('');
      const startTime = new Date(`${selectedDate}T${selectedTime}:00`);
      const endTime = new Date(startTime.getTime() + parseInt(duration) * 60000);
      const profId = selectedProfessional || (isProfessional ? user?.id || null : null);
      if (!profId) {
        throw new Error('Selecione um profissional para este agendamento.');
      }
      if (profId && !hasAvailabilityWindow(profId, startTime, endTime)) {
        throw new Error('Esse horário está fora da disponibilidade semanal do profissional.');
      }
      await assertNoSchedulingConflicts({ professionalId: profId, startTime, endTime });
      const lead = appointmentType === 'evaluation' ? getSelectedLeadData(selectedLead) : null;
      if (appointmentType === 'session') {
        if (!selectedTreatment) throw new Error('Selecione um tratamento.');
        const isAllowed = sessionTreatmentOptions.some((item) => item.id === selectedTreatment);
        if (!isAllowed) {
          throw new Error('Selecione um tratamento contratado para o paciente.');
        }
        const chosen = sessionTreatmentOptions.find((item) => item.id === selectedTreatment);
        if (!chosen || chosen.balance <= 0) {
          throw new Error('Este tratamento já foi finalizado (saldo 0).');
        }
      }
      const payload: Record<string, unknown> = {
        clinic_id: clinicId!,
        patient_id: appointmentType === 'session' ? selectedPatient : null,
        lead_id: appointmentType === 'evaluation' ? selectedLead : null,
        treatment_id: selectedTreatment || null,
        professional_id: profId,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        scheduled_at: startTime.toISOString(),
        duration_minutes: parseInt(duration) || 60,
        appointment_type: appointmentType,
        credit_check_required: appointmentType === 'evaluation' ? !!lead?.cpf : false,
        credit_check_status: appointmentType === 'evaluation' && lead?.cpf ? 'pending' : 'not_required',
        notes: notes || null,
      };
      const { data: insertedAppointment, error } = await supabase.from('appointments')
        .insert(payload)
        .select('id, start_time, professional_id')
        .single();
      if (error) throw error;

      if (appointmentType === 'evaluation' && selectedLead) {
        const { error: leadError } = await supabase.from('leads')
          .update({ kanban_stage: 'scheduled', appointment_id: insertedAppointment.id })
          .eq('clinic_id', clinicId!)
          .eq('id', selectedLead);
        if (leadError) throw leadError;
      }

      return {
        appointment: insertedAppointment,
        startTime,
        professionalId: profId,
      };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      if (result?.startTime) {
        setCurrentDate(result.startTime);
      }
      if (result?.professionalId) {
        setFilterProfessional(result.professionalId);
      }
      setViewMode('day');
      setDialogOpen(false);
      resetForm();
      setCreateFormError('');
      toast({ title: 'Agendamento criado!' });
    },
    onError: (err: Error) => {
      const msg = err.message || 'Erro ao criar agendamento.';
      if (
        msg.includes('Já existe outro agendamento para esse horário.') ||
        msg.includes('Existe um bloqueio para esse horário.') ||
        msg.includes('fora da disponibilidade semanal do profissional')
      ) {
        setCreateFormError(msg);
        return;
      }
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const appointment = appointments.find((item) => item.id === id);
      const patch: Record<string, unknown> = { status };

      if (status === 'confirmed') patch.confirmed_at = new Date().toISOString();
      if (status === 'in_progress') patch.checked_in_at = new Date().toISOString();
      if (status === 'completed') patch.completed_at = new Date().toISOString();

      const { error } = await supabase.from('appointments').update(patch).eq('id', id);
      if (error) throw error;

      if (appointment?.lead_id && status === 'completed') {
        const { error: leadError } = await supabase.from('leads')
          .update({ kanban_stage: 'proposal_sent' })
          .eq('clinic_id', clinicId!)
          .eq('id', appointment.lead_id);
        if (leadError) throw leadError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      setViewAppt(null);
      toast({ title: 'Status atualizado!' });
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const appointmentExceptionMutation = useMutation({
    mutationFn: async () => {
      if (!exceptionModal || !clinicId) return;

      const appointment = exceptionModal.appointment;

      if (exceptionModal.mode === 'cancel' || exceptionModal.mode === 'no_show') {
        if (!exceptionReason.trim()) {
          throw new Error('Informe o motivo para continuar.');
        }

        const patch: Record<string, unknown> = {
          status: exceptionModal.mode === 'cancel' ? 'cancelled' : 'no_show',
        };

        if (exceptionModal.mode === 'cancel') patch.cancelled_reason = exceptionReason.trim();
        if (exceptionModal.mode === 'no_show') patch.no_show_reason = exceptionReason.trim();

        const { error } = await supabase.from('appointments')
          .update(patch)
          .eq('clinic_id', clinicId)
          .eq('id', appointment.id);
        if (error) throw error;

        if (appointment.lead_id && appointment.appointment_type === 'evaluation') {
          const { error: leadError } = await supabase.from('leads')
            .update({ kanban_stage: 'contacted' })
            .eq('clinic_id', clinicId)
            .eq('id', appointment.lead_id);
          if (leadError) throw leadError;
        }

        return;
      }

      if (!rescheduleDate || !rescheduleTime) {
        throw new Error('Escolha a nova data e horário.');
      }

      const startTime = new Date(`${rescheduleDate}T${rescheduleTime}:00`);
      const durationMinutes = parseInt(rescheduleDuration) || 60;
      const endTime = new Date(startTime.getTime() + durationMinutes * 60000);
      const nextProfessionalId = rescheduleProfessional === 'unassigned' ? null : rescheduleProfessional;
      if (nextProfessionalId && !hasAvailabilityWindow(nextProfessionalId, startTime, endTime)) {
        throw new Error('Esse novo horário está fora da disponibilidade semanal do profissional.');
      }
      await assertNoSchedulingConflicts({
        professionalId: nextProfessionalId,
        startTime,
        endTime,
        ignoreAppointmentId: appointment.id,
      });
      const mergedNotes = [appointment.notes, rescheduleNotes].filter(Boolean).join('\n\n');

      const { data: newAppointment, error: createError } = await supabase.from('appointments')
        .insert({
          clinic_id: clinicId,
          patient_id: appointment.patient_id,
          lead_id: appointment.lead_id,
          treatment_id: appointment.treatment_id,
          professional_id: nextProfessionalId,
          appointment_type: appointment.appointment_type,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          scheduled_at: startTime.toISOString(),
          duration_minutes: durationMinutes,
          notes: mergedNotes || null,
          status: 'scheduled',
          credit_check_required: appointment.credit_check_required || false,
          credit_check_status: appointment.credit_check_status || 'not_required',
          rescheduled_from: appointment.id,
          created_by: user?.id || null,
        })
        .select('id')
        .single();
      if (createError) throw createError;

      const { error: updateError } = await supabase.from('appointments')
        .update({
          status: 'rescheduled',
          rescheduled_to: newAppointment.id,
          cancelled_reason: exceptionReason.trim() || 'Remarcado',
        })
        .eq('clinic_id', clinicId)
        .eq('id', appointment.id);
      if (updateError) throw updateError;

      if (appointment.lead_id && appointment.appointment_type === 'evaluation') {
        const { error: leadError } = await supabase.from('leads')
          .update({ kanban_stage: 'scheduled', appointment_id: newAppointment.id })
          .eq('clinic_id', clinicId)
          .eq('id', appointment.lead_id);
        if (leadError) throw leadError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      setViewAppt(null);
      setExceptionModal(null);
      toast({ title: 'Agenda atualizada' });
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const reassignProfessionalMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !viewAppt) return;
      const nextProfessionalId = reassignProfessional === 'unassigned' ? null : reassignProfessional;
      if ((viewAppt.professional_id || null) === nextProfessionalId) return;

      const start = getAppointmentStartDate(viewAppt);
      const end = getAppointmentEndDate(viewAppt);

      if (nextProfessionalId && !hasAvailabilityWindow(nextProfessionalId, start, end)) {
        throw new Error('O profissional selecionado não possui disponibilidade neste horário.');
      }

      await assertNoSchedulingConflicts({
        professionalId: nextProfessionalId,
        startTime: start,
        endTime: end,
        ignoreAppointmentId: viewAppt.id,
      });

      const { error } = await supabase
        .from('appointments')
        .update({ professional_id: nextProfessionalId })
        .eq('id', viewAppt.id)
        .eq('clinic_id', clinicId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (!viewAppt) return;
      const nextProfessionalId = reassignProfessional === 'unassigned' ? null : reassignProfessional;
      setViewAppt({ ...viewAppt, professional_id: nextProfessionalId });
      qc.invalidateQueries({ queryKey: ['appointments'] });
      toast({ title: 'Profissional reatribuído!' });
    },
    onError: (error) => toast({ title: 'Não foi possível reatribuir', description: error.message, variant: 'destructive' }),
  });

  const saveAvailabilityMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !availabilityProfessional || availabilityProfessional === 'unassigned') {
        throw new Error('Selecione um profissional.');
      }

      const { error: deleteError } = await supabase.from('professional_availability')
        .delete()
        .eq('clinic_id', clinicId)
        .eq('professional_id', availabilityProfessional);
      if (deleteError) throw deleteError;

      const rows = weekDays
        .map((day) => ({ day, config: availabilityDraft[day.value] }))
        .filter(({ config }) => config?.isActive)
        .map(({ day, config }) => ({
          clinic_id: clinicId,
          professional_id: availabilityProfessional,
          day_of_week: day.value,
          start_time: config.start,
          end_time: config.end,
          is_active: true,
        }));

      if (rows.length > 0) {
        const { error: insertError } = await supabase.from('professional_availability').insert(rows);
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['professional-availability'] });
      setAvailabilityDialogOpen(false);
      toast({ title: 'Disponibilidade atualizada' });
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const createBlockMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !blockReason.trim()) {
        throw new Error('Informe pelo menos o motivo do bloqueio.');
      }

      const startAt = new Date(`${blockStartDate}T${blockStartTime}:00`);
      const endAt = new Date(`${blockEndDate}T${blockEndTime}:00`);
      if (endAt <= startAt) {
        throw new Error('O fim do bloqueio precisa ser depois do início.');
      }

      const { error } = await supabase.from('appointment_blocks').insert({
        clinic_id: clinicId,
        professional_id: blockProfessional === 'all' ? null : blockProfessional,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        reason: blockReason.trim(),
        notes: blockNotes.trim() || null,
        created_by: user?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointment-blocks'] });
      setBlockReason('');
      setBlockNotes('');
      toast({ title: 'Bloqueio criado' });
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const deleteBlockMutation = useMutation({
    mutationFn: async (blockId: string) => {
      const { error } = await supabase.from('appointment_blocks').delete().eq('id', blockId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointment-blocks'] });
      toast({ title: 'Bloqueio removido' });
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });
  const sendReminderQueueMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('send-appointment-reminder', {
        body: { clinicId, lookAheadHours: 24, limit: 150 },
      });
      if (error) throw error;
      return data as { queued?: number; scanned?: number };
    },
    onSuccess: (result) => {
      toast({
        title: 'Fila de lembretes atualizada',
        description: `${result?.queued || 0} lembrete(s) preparados de ${result?.scanned || 0} agendamento(s).`,
      });
    },
    onError: (err: Error) => toast({ title: 'Erro ao preparar lembretes', description: err.message, variant: 'destructive' }),
  });
  const dispatchReminderMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('dispatch-appointment-reminders', {
        body: { clinicId, limit: 100 },
      });
      if (error) throw error;
      return data as { processed?: number; sent?: number; failed?: number };
    },
    onSuccess: (result) => {
      toast({
        title: 'Despacho de lembretes executado',
        description: `Processados: ${result?.processed || 0} · Enviados: ${result?.sent || 0} · Falhas: ${result?.failed || 0}`,
      });
    },
    onError: (err: Error) => toast({ title: 'Erro no despacho', description: err.message, variant: 'destructive' }),
  });
  const generateDailySummaryMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('send-daily-agenda-summary', {
        body: { clinicId },
      });
      if (error) throw error;
      return data as { generated?: number };
    },
    onSuccess: (result) => {
      toast({
        title: 'Resumo diário gerado',
        description: `${result?.generated || 0} clínica(s) processada(s).`,
      });
    },
    onError: (err: Error) => toast({ title: 'Erro ao gerar resumo diário', description: err.message, variant: 'destructive' }),
  });
  const runAgendaJobsMutation = useMutation({
    mutationFn: async (mode: 'morning' | 'hourly' | 'manual') => {
      const { data, error } = await supabase.functions.invoke('run-agenda-jobs', {
        body: { clinicId, mode },
      });
      if (error) throw error;
      return data as { runKey?: string; skipped?: boolean; reason?: string };
    },
    onSuccess: (result) => {
      toast({
        title: result?.skipped ? 'Job já executado' : 'Orquestrador executado',
        description: result?.runKey ? `Run key: ${result.runKey}` : (result?.reason || 'Processo concluído'),
      });
    },
    onError: (err: Error) => toast({ title: 'Erro no orquestrador', description: err.message, variant: 'destructive' }),
  });
  const runWaitlistMutation = useMutation({
    mutationFn: async () => {
      if (!waitlistSchemaAvailable) {
        throw new Error('Lista de espera indisponível: rode as migrations de Agenda Avançada nesta base.');
      }
      const { data, error } = await supabase.functions.invoke('check-waitlist', {
        body: { clinicId },
      });
      if (error) throw error;
      return data as { matchesFound?: number; notificationsSent?: number };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['appointment-waitlist'] });
      qc.invalidateQueries({ queryKey: ['waitlist-notifications'] });
      toast({
        title: 'Matching executado',
        description: `${result?.matchesFound || 0} vaga(s) encontrada(s), ${result?.notificationsSent || 0} notificação(ões).`,
      });
    },
    onError: (err: Error) => {
      if (isMissingRelationError(err.message)) {
        setWaitlistSchemaAvailable(false);
        toast({ title: 'Schema da lista de espera não aplicado', description: 'Aplique a migration de Agenda Avançada para habilitar este módulo.', variant: 'destructive' });
        return;
      }
      toast({ title: 'Erro ao rodar o matching', description: err.message, variant: 'destructive' });
    },
  });

  const createAppointmentFromNotificationMutation = useMutation({
    mutationFn: async (notification: WaitlistNotificationRow) => {
      const waitlist = notification.appointment_waitlist;
      if (!clinicId || !waitlist) throw new Error('Dados da lista de espera inválidos.');

      const startTime = notification.matched_slot_start;
      const endTime = notification.matched_slot_end;
      const professionalId = notification.matched_professional_id;
      if (!professionalId) throw new Error('Profissional da vaga não identificado.');

      const appointmentPayload: Record<string, unknown> = {
        clinic_id: clinicId,
        patient_id: waitlist.patient_id,
        lead_id: waitlist.lead_id,
        treatment_id: waitlist.treatment_id,
        professional_id: professionalId,
        start_time: startTime,
        end_time: endTime,
        scheduled_at: startTime,
        duration_minutes: waitlist.min_duration_minutes,
        appointment_type: waitlist.lead_id ? 'evaluation' : 'session',
        status: 'scheduled',
        notes: waitlist.notes || null,
      };

      const { data: appointment, error: appointmentError } = await supabase
        .from('appointments')
        .insert(appointmentPayload)
        .select('id')
        .single();
      if (appointmentError) throw appointmentError;

      const { error: notifError } = await supabase
        .from('waitlist_notifications')
        .update({
          action_taken: 'scheduled',
          action_taken_at: new Date().toISOString(),
          action_taken_by: user?.id || null,
          resulting_appointment_id: appointment.id,
        })
        .eq('id', notification.id);
      if (notifError) throw notifError;

      const waitlistUpdate: Record<string, unknown> = {
        status: 'scheduled',
        resulting_appointment_id: appointment.id,
      };
      if (waitlist.lead_id) waitlistUpdate['match_found_at'] = new Date().toISOString();

      const { error: waitlistError } = await supabase
        .from('appointment_waitlist')
        .update(waitlistUpdate)
        .eq('id', waitlist.id);
      if (waitlistError) throw waitlistError;

      if (waitlist.lead_id) {
        await supabase
          .from('leads')
          .update({ appointment_id: appointment.id, kanban_stage: 'scheduled' })
          .eq('id', waitlist.lead_id)
          .eq('clinic_id', clinicId);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['appointment-waitlist'] });
      qc.invalidateQueries({ queryKey: ['waitlist-notifications'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      toast({ title: 'Agendamento criado a partir da lista de espera' });
    },
    onError: (err: Error) => toast({ title: 'Erro ao criar agendamento', description: err.message, variant: 'destructive' }),
  });

  const createWaitlistMutation = useMutation({
    mutationFn: async () => {
      if (!waitlistSchemaAvailable) {
        throw new Error('Lista de espera indisponível: rode as migrations de Agenda Avançada nesta base.');
      }
      if (!clinicId) throw new Error('Clínica não identificada.');
      if (waitlistTargetType === 'lead' && !waitlistLeadId) throw new Error('Selecione um lead.');
      if (waitlistTargetType === 'patient' && !waitlistPatientId) throw new Error('Selecione um paciente.');
      if (!waitlistWindowStart || !waitlistWindowEnd) throw new Error('Informe a janela de busca.');
      if (waitlistWindowEnd < waitlistWindowStart) throw new Error('A data final deve ser maior ou igual à data inicial.');

      const periods = waitlistPreferredPeriod === 'all'
        ? ['morning', 'afternoon', 'evening']
        : [waitlistPreferredPeriod];

      const payload: Database['public']['Tables']['appointment_waitlist']['Insert'] = {
        clinic_id: clinicId,
        lead_id: waitlistTargetType === 'lead' ? waitlistLeadId : null,
        patient_id: waitlistTargetType === 'patient' ? waitlistPatientId : null,
        preferred_professional_id: waitlistProfessionalId === 'any' ? null : waitlistProfessionalId,
        treatment_id: waitlistTreatmentId === 'none' ? null : waitlistTreatmentId,
        window_type: waitlistWindowType,
        window_start: waitlistWindowStart,
        window_end: waitlistWindowEnd,
        preferred_periods: periods,
        min_duration_minutes: parseInt(waitlistDuration, 10) || 60,
        priority: waitlistPriority,
        status: 'waiting',
        contact_preference: waitlistContactPreference,
        contact_phone: waitlistContactPhone.trim() || null,
        notes: waitlistNotes.trim() || null,
        created_by: user?.id || null,
      };

      const { error } = await supabase.from('appointment_waitlist').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointment-waitlist'] });
      toast({ title: 'Lead/paciente adicionado à lista de espera' });
      resetWaitlistForm();
    },
    onError: (err: Error) => {
      if (isMissingRelationError(err.message)) {
        setWaitlistSchemaAvailable(false);
        toast({ title: 'Schema da lista de espera não aplicado', description: 'Aplique a migration de Agenda Avançada para habilitar este módulo.', variant: 'destructive' });
        return;
      }
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setAppointmentType('session');
    setSelectedPatient('');
    setSelectedLead('');
    setSelectedTreatment('');
    setSelectedProfessional('');
    setDuration('60');
    setNotes('');
    setCreateFormError('');
  };

  const resetWaitlistForm = () => {
    setWaitlistTargetType('lead');
    setWaitlistLeadId('');
    setWaitlistPatientId('');
    setWaitlistProfessionalId('any');
    setWaitlistTreatmentId('none');
    setWaitlistWindowType('this_week');
    const window = getWindowByType('this_week');
    setWaitlistWindowStart(window.start);
    setWaitlistWindowEnd(window.end);
    setWaitlistPreferredPeriod('all');
    setWaitlistDuration('60');
    setWaitlistPriority('normal');
    setWaitlistContactPreference('whatsapp');
    setWaitlistContactPhone('');
    setWaitlistNotes('');
  };

  const ensurePatientForLead = async (leadId: string) => {
    const { data: lead, error: leadError } = await supabase.from('leads')
      .select('*')
      .eq('clinic_id', clinicId!)
      .eq('id', leadId)
      .single();
    if (leadError) throw leadError;

    if (lead.patient_id) return lead.patient_id as string;

    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .insert({
        clinic_id: clinicId!,
        full_name: lead.full_name,
        phone: lead.phone,
        cpf: lead.cpf,
        email: lead.email,
        date_of_birth: lead.birth_date,
        notes: lead.notes,
        status: 'active',
      })
      .select('id')
      .single();
    if (patientError) throw patientError;

    const { error: updateLeadError } = await supabase.from('leads')
      .update({
        patient_id: patient.id,
        converted_at: new Date().toISOString(),
      })
      .eq('clinic_id', clinicId!)
      .eq('id', leadId);
    if (updateLeadError) throw updateLeadError;

    qc.invalidateQueries({ queryKey: ['crm-leads'] });
    qc.invalidateQueries({ queryKey: ['patients'] });
    qc.invalidateQueries({ queryKey: ['patients-select'] });

    return patient.id as string;
  };

  const openProposalFromEvaluation = async (appointment: AppointmentRow, finalizeFirst = false) => {
    if (!clinicId || !appointment?.lead_id) return;

    setProposalLoadingId(appointment.id);
    try {
      if (finalizeFirst) {
        const { error: appointmentError } = await supabase.from('appointments')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('clinic_id', clinicId)
          .eq('id', appointment.id);
        if (appointmentError) throw appointmentError;

        const { error: leadError } = await supabase.from('leads')
          .update({ kanban_stage: 'proposal_sent' })
          .eq('clinic_id', clinicId)
          .eq('id', appointment.lead_id);
        if (leadError) throw leadError;
      }

      const patientId = await ensurePatientForLead(appointment.lead_id);
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      setViewAppt(null);
      navigate(`/clinic/proposals?patientId=${patientId}&leadId=${appointment.lead_id}&openNew=1`);
    } catch (err) {
      toast({ title: 'Erro', description: err.message || 'Não foi possível abrir a proposta.', variant: 'destructive' });
    } finally {
      setProposalLoadingId(null);
    }
  };

  const navigate_ = (dir: number) => {
    if (viewMode === 'month') setCurrentDate(dir > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(dir > 0 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    else setCurrentDate(dir > 0 ? addDays(currentDate, 1) : subDays(currentDate, 1));
  };

  const getApptsForDay = (day: Date) => filteredAppointments.filter((a) => isSameDay(getAppointmentStartDate(a), day));
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const headerLabel = viewMode === 'month'
    ? format(currentDate, 'MMMM yyyy', { locale: ptBR })
    : viewMode === 'week'
    ? `${format(rangeStart, 'dd/MM', { locale: ptBR })} - ${format(rangeEnd, 'dd/MM/yyyy', { locale: ptBR })}`
    : format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR });

  return (
    <div>
      <PageHeader title="Agenda" description="Gerencie os agendamentos da clínica">
        <div className="flex flex-wrap gap-2">
          <>
            <BrandButton variant="outline" onClick={() => setAvailabilityDialogOpen(true)}>
              <CalendarCog className="w-4 h-4" /> Disponibilidade
            </BrandButton>
            <BrandButton variant="outline" onClick={() => setBlocksDialogOpen(true)}>
              <Lock className="w-4 h-4" /> Bloqueios
            </BrandButton>
            <BrandButton
              variant="outline"
              onClick={() => {
                resetWaitlistForm();
                setWaitlistDialogOpen(true);
              }}
            >
              <BellRing className="w-4 h-4" /> Lista de Espera
            </BrandButton>
            <BrandButton
              variant="outline"
              onClick={() => sendReminderQueueMutation.mutate()}
              disabled={sendReminderQueueMutation.isPending}
            >
              {sendReminderQueueMutation.isPending ? 'Processando...' : 'Fila Lembretes WA'}
            </BrandButton>
            <BrandButton
              variant="outline"
              onClick={() => dispatchReminderMutation.mutate()}
              disabled={dispatchReminderMutation.isPending}
            >
              {dispatchReminderMutation.isPending ? 'Enviando...' : 'Disparar Lembretes WA'}
            </BrandButton>
            <BrandButton
              variant="outline"
              onClick={() => generateDailySummaryMutation.mutate()}
              disabled={generateDailySummaryMutation.isPending}
            >
              {generateDailySummaryMutation.isPending ? 'Gerando...' : 'Resumo Diário WA'}
            </BrandButton>
            <BrandButton
              variant="outline"
              onClick={() => runAgendaJobsMutation.mutate('manual')}
              disabled={runAgendaJobsMutation.isPending}
            >
              {runAgendaJobsMutation.isPending ? 'Executando...' : 'Rodar Jobs Agenda'}
            </BrandButton>
          </>
          <BrandButton onClick={() => {
            resetForm();
            setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
            if (isProfessional && user?.id) {
              setSelectedProfessional(user.id);
            }
            setDialogOpen(true);
          }}>
            <Plus className="w-4 h-4" /> Novo Agendamento
          </BrandButton>
        </div>
      </PageHeader>

      <div className="grid gap-3 md:grid-cols-5 mb-6">
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <CalendarCheck2 className="w-5 h-5 text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">{operationalSummary.totalInView}</p>
            <p className="text-xs text-muted-foreground">Agendamentos no período</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <Clock3 className="w-5 h-5 text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">{operationalSummary.today}</p>
            <p className="text-xs text-muted-foreground">Atendimentos de hoje</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <CheckCircle2 className="w-5 h-5 text-success mb-2" />
            <p className="text-2xl font-bold text-foreground">{operationalSummary.readyForSession}</p>
            <p className="text-xs text-muted-foreground">Prontos para sessão</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <AlertTriangle className="w-5 h-5 text-warning mb-2" />
            <p className="text-2xl font-bold text-foreground">{operationalSummary.noShow}</p>
            <p className="text-xs text-muted-foreground">Não compareceu</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in border-warning/30 cursor-pointer" onClick={() => setFilterProfessional('unassigned')}>
          <CardContent className="p-4">
            <AlertTriangle className="w-5 h-5 text-warning mb-2" />
            <p className="text-2xl font-bold text-foreground">{operationalSummary.unassigned}</p>
            <p className="text-xs text-muted-foreground">Não atribuído</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-5 mb-6">
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">WA pendente</p>
            <p className="text-xl font-semibold">{whatsappOpsSummary.pending}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">WA enviado</p>
            <p className="text-xl font-semibold">{whatsappOpsSummary.sent}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">WA falhou</p>
            <p className="text-xl font-semibold">{whatsappOpsSummary.failed}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Inbound aplicado</p>
            <p className="text-xl font-semibold">{whatsappOpsSummary.inboundApplied}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Jobs concluídos</p>
            <p className="text-xl font-semibold">{whatsappOpsSummary.jobSuccess}</p>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate_(-1)} className="p-2 rounded-lg hover:bg-secondary"><ChevronLeft className="w-5 h-5" /></button>
          <h2 className="text-lg font-semibold text-foreground capitalize min-w-[200px] text-center">{headerLabel}</h2>
          <button onClick={() => navigate_(1)} className="p-2 rounded-lg hover:bg-secondary"><ChevronRight className="w-5 h-5" /></button>
        </div>

        <div className="flex items-center gap-3">
          <Select value={filterProfessional} onValueChange={setFilterProfessional}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Todos profissionais" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os responsáveis</SelectItem>
              <SelectItem value="unassigned">Não atribuído</SelectItem>
              {professionals.map(p => (
                <SelectItem key={p.user_id} value={p.user_id}>
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full inline-block" style={{ background: p.color }} />
                    {p.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[190px]"><SelectValue placeholder="Todos status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="scheduled">Agendado</SelectItem>
              <SelectItem value="confirmed">Confirmado</SelectItem>
              <SelectItem value="in_progress">Em andamento</SelectItem>
              <SelectItem value="completed">Concluído</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
              <SelectItem value="rescheduled">Remarcado</SelectItem>
              <SelectItem value="no_show">Não compareceu</SelectItem>
            </SelectContent>
          </Select>
          <Tabs value={viewMode} onValueChange={v => setViewMode(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="month">Mês</TabsTrigger>
              <TabsTrigger value="week">Semana</TabsTrigger>
              <TabsTrigger value="day">Dia</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {todayQueue.length > 0 && (
        <div className="bg-card rounded-xl shadow-card p-4 mb-6 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Fila operacional de hoje</h3>
              <p className="text-xs text-muted-foreground">Os próximos atendimentos do dia para acompanhamento rápido.</p>
            </div>
            <BrandButton
              size="sm"
              variant="outline"
              onClick={() => setQueueExpanded((current) => !current)}
            >
              {queueExpanded ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  Ocultar
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  Expandir
                </>
              )}
            </BrandButton>
          </div>
          {!queueExpanded ? (
            <div className="rounded-lg border border-dashed bg-background/60 px-4 py-3 text-sm text-muted-foreground">
              {todayQueue.length} atendimento(s) oculto(s) nesta fila.
            </div>
          ) : (
            <div className="space-y-2">
              {todayQueue.map((appointment) => (
                <div key={appointment.id} className="rounded-lg border bg-background px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground">{getAppointmentDisplayName(appointment)}</p>
                      <BrandBadge status={statusConfig[appointment.status]?.badge || 'default'}>
                        {statusConfig[appointment.status]?.label || appointment.status}
                      </BrandBadge>
                      {appointment.appointment_type === 'evaluation' && (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                          Avaliação
                        </span>
                      )}
                      {appointment.is_batch && (
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                          Lote
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(getAppointmentStartDate(appointment), "HH:mm", { locale: ptBR })} · {(appointment.treatments as { name?: string | null } | null)?.name || 'Sem tratamento'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {getProfessionalLabel(appointment.professional_id)}
                    </p>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <BrandButton size="sm" variant="outline" onClick={() => setViewAppt(appointment)}>
                      Ver
                    </BrandButton>
                    {appointment.status === 'scheduled' && (
                      <BrandButton
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: 'confirmed' })}
                        disabled={updateStatusMutation.isPending}
                      >
                        Confirmar
                      </BrandButton>
                    )}
                    {appointment.status === 'confirmed' && (
                      <BrandButton
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: 'in_progress' })}
                        disabled={updateStatusMutation.isPending}
                      >
                        Iniciar
                      </BrandButton>
                    )}
                    {appointment.status === 'in_progress' && (
                      <BrandButton
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: 'completed' })}
                        disabled={updateStatusMutation.isPending}
                      >
                        Concluir
                      </BrandButton>
                    )}
                    {appointment.appointment_type === 'evaluation' && appointment.status === 'completed' && (
                      <BrandButton size="sm" variant="outline" onClick={() => openProposalFromEvaluation(appointment, false)}>
                        Proposta
                      </BrandButton>
                    )}
                    {(appointment.status === 'confirmed' || appointment.status === 'in_progress' || appointment.status === 'scheduled') && (
                      <BrandButton size="sm" onClick={() => navigate(`/clinic/sessions?appointmentId=${appointment.id}`)}>
                        <ClipboardList className="w-4 h-4" />
                        Sessão
                      </BrandButton>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Professional legend */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {professionals.length > 0 && viewMode !== 'day' && (
          <div className="flex flex-wrap gap-3">
            {professionals.map(p => (
              <span key={p.user_id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-3 h-3 rounded-full" style={{ background: p.color }} />
                {p.label}
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            {agendaSignals.evaluations} avaliações
          </span>
          <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            {agendaSignals.batches} sessões em lote
          </span>
          <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            {agendaSignals.blocks} bloqueios
          </span>
          <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            {agendaSignals.blockedDays} dias com restrição
          </span>
          <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            {waitlistEntries.length} em lista de espera
          </span>
        </div>
      </div>

      {/* Calendar */}
      {viewMode === 'month' && (
        <div className="bg-card rounded-xl shadow-card overflow-hidden animate-fade-in">
          <div className="grid grid-cols-7">
            {dayNames.map(d => (
              <div key={d} className="px-2 py-2 text-xs font-semibold text-muted-foreground text-center border-b bg-secondary/50">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendarDays.map((day, i) => {
              const dayAppts = getApptsForDay(day);
              const dayBlocks = getBlocksForDay(day);
              const isToday = isSameDay(day, new Date());
              const isCurrentMonth = isSameMonth(day, currentDate);
              return (
                <div
                  key={i}
                  className={`min-h-[80px] md:min-h-[100px] border-b border-r p-1 cursor-pointer hover:bg-secondary/30 transition-colors ${!isCurrentMonth ? 'opacity-40' : ''}`}
                  onClick={() => { setSelectedDate(format(day, 'yyyy-MM-dd')); resetForm(); setDialogOpen(true); }}
                >
                  <span className={`text-xs font-medium inline-flex w-6 h-6 items-center justify-center rounded-full ${isToday ? 'gradient-primary text-primary-foreground' : 'text-foreground'}`}>
                    {format(day, 'd')}
                  </span>
                  {dayBlocks.length > 0 && (
                    <div className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-1 text-[10px] font-medium text-amber-700">
                      {dayBlocks.length} bloqueio{dayBlocks.length > 1 ? 's' : ''}
                    </div>
                  )}
                  <div className="space-y-0.5 mt-1">
                    {dayAppts.slice(0, 3).map((a) => (
                      <div
                        key={a.id}
                        className={`rounded px-1.5 py-1 text-[10px] text-white cursor-pointer ${statusConfig[a.status]?.style || ''}`}
                        style={{ backgroundColor: getProfColor(a.professional_id) }}
                        onClick={e => { e.stopPropagation(); setViewAppt(a); }}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate font-medium">{format(getAppointmentStartDate(a), 'HH:mm')} {getAppointmentDisplayName(a).split(' ')[0]}</span>
                          <div className="flex gap-1 shrink-0">
                            {a.appointment_type === 'evaluation' && <span className="rounded bg-white/20 px-1 text-[9px]">A</span>}
                            {a.is_batch && <span className="rounded bg-white/20 px-1 text-[9px]">L</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                    {dayAppts.length > 3 && <span className="text-[10px] text-muted-foreground">+{dayAppts.length - 3} mais</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === 'week' && (
        <div className="bg-card rounded-xl shadow-card overflow-hidden animate-fade-in">
          <div className="grid grid-cols-7">
            {calendarDays.map((day, i) => {
              const dayAppts = getApptsForDay(day);
              const dayBlocks = getBlocksForDay(day);
              const isToday = isSameDay(day, new Date());
              return (
                <div key={i} className="border-r min-h-[300px]">
                  <div className={`px-2 py-2 text-center border-b ${isToday ? 'bg-primary/10' : 'bg-secondary/50'}`}>
                    <div className="text-xs text-muted-foreground">{dayNames[i]}</div>
                    <div className={`text-sm font-semibold ${isToday ? 'text-primary' : ''}`}>{format(day, 'd')}</div>
                  </div>
                  <div className="p-1 space-y-1">
                    {dayBlocks.length > 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
                        {dayBlocks.length} bloqueio{dayBlocks.length > 1 ? 's' : ''} neste dia
                      </div>
                    )}
                    {dayAppts.map((a) => (
                      <div
                        key={a.id}
                        className={`rounded p-2 text-xs text-white cursor-pointer ${statusConfig[a.status]?.style || ''}`}
                        style={{ backgroundColor: getProfColor(a.professional_id) }}
                        onClick={() => setViewAppt(a)}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <div className="font-semibold">{format(getAppointmentStartDate(a), 'HH:mm')}</div>
                          <div className="flex gap-1">
                            {a.appointment_type === 'evaluation' && <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px]">Avaliação</span>}
                            {a.is_batch && <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px]">Lote</span>}
                          </div>
                        </div>
                        <div className="truncate">{getAppointmentDisplayName(a)}</div>
                        <div className="truncate opacity-80">{(a.treatments as { name?: string | null } | null)?.name}</div>
                        <div className="truncate opacity-80">{getProfessionalLabel(a.professional_id)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === 'day' && (
        <div className="bg-card rounded-xl shadow-card p-4 animate-fade-in">
          {getBlocksForDay(currentDate).length > 0 && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-800">Dia com bloqueios operacionais</p>
              <div className="mt-2 space-y-1 text-xs text-amber-700">
                {getBlocksForDay(currentDate).map((block) => (
                  <p key={block.id}>
                    {format(new Date(block.start_at), 'HH:mm')} - {format(new Date(block.end_at), 'HH:mm')} · {block.reason}
                  </p>
                ))}
              </div>
            </div>
          )}
          {getApptsForDay(currentDate).length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum agendamento neste dia</p>
          ) : (
            <div className="space-y-3">
              {getApptsForDay(currentDate).map((a) => {
                const sc = statusConfig[a.status];
                return (
                  <div
                    key={a.id}
                    className={`p-4 rounded-lg border cursor-pointer hover:shadow-md transition-shadow ${sc?.style || ''}`}
                    onClick={() => setViewAppt(a)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground">{getAppointmentDisplayName(a)}</p>
                          {a.appointment_type === 'evaluation' && (
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                              Avaliação
                            </span>
                          )}
                          {a.is_batch && (
                            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                              Sessão em lote
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{(a.treatments as { name?: string | null } | null)?.name || 'Sem tratamento'}</p>
                        <p className="text-xs text-muted-foreground">{getProfessionalLabel(a.professional_id)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-foreground">{format(getAppointmentStartDate(a), 'HH:mm')} - {format(getAppointmentEndDate(a), 'HH:mm')}</p>
                        <div className="mt-1 flex items-center justify-end gap-2">
                          <BrandBadge status={sc?.badge || 'default'}>{sc?.label || a.status}</BrandBadge>
                          <BrandButton
                            size="sm"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation();
                              setViewAppt(a);
                            }}
                          >
                            Ver
                          </BrandButton>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo Agendamento</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); createMutation.mutate(); }} className="space-y-4 mt-4">
            {createFormError && (
              <Alert className="border-amber-300 bg-amber-50 text-amber-900">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{createFormError}</AlertDescription>
              </Alert>
            )}
            {appointmentType === 'session' ? (
              <>
                <div className="space-y-2">
                  <Label>Paciente *</Label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Select value={selectedPatient} onValueChange={(value) => {
                        setSelectedPatient(value);
                        setSelectedTreatment('');
                      }}>
                        <SelectTrigger><SelectValue placeholder="Selecionar paciente" /></SelectTrigger>
                        <SelectContent>{patients.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <BrandButton
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setQuickPatientOpen(true)}
                      title="Cadastrar novo paciente"
                    >
                      <UserPlus className="w-4 h-4" />
                    </BrandButton>
                  </div>
                </div>
                {selectedPatient && (() => {
                  const p = getSelectedPatientData(selectedPatient);
                  return p ? <AnamneseAlertBanner status={p.current_anamnese_status} expiresAt={p.current_anamnese_expires_at} patientId={p.id} patientName={p.full_name} /> : null;
                })()}
              </>
            ) : (
              <div className="space-y-2">
                <Label>Lead *</Label>
                <Select value={selectedLead} onValueChange={setSelectedLead}>
                  <SelectTrigger><SelectValue placeholder="Selecionar lead para avaliação" /></SelectTrigger>
                  <SelectContent>
                    {leads.map((lead) => (
                      <SelectItem key={lead.id} value={lead.id}>
                        {lead.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedLead && getSelectedLeadData(selectedLead)?.phone && (
                  <p className="text-xs text-muted-foreground">
                    Contato: {getSelectedLeadData(selectedLead)?.phone}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Tipo de agendamento</Label>
              <Select value={appointmentType} onValueChange={value => setAppointmentType(value as 'session' | 'evaluation')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="session">Sessão de paciente</SelectItem>
                  <SelectItem value="evaluation">Avaliação de lead</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{appointmentType === 'evaluation' ? 'Tratamento de interesse' : 'Tratamento'}</Label>
                <Select value={selectedTreatment} onValueChange={v => {
                setSelectedTreatment(v);
                const source = appointmentType === 'session' ? sessionTreatmentOptions : treatments.map((t) => ({ id: t.id, name: t.name, duration: Number(t.duration_minutes || 60) }));
                const t = source.find((tr) => tr.id === v);
                if (t) setDuration(String(t.duration));
              }} disabled={appointmentType === 'session' && (!selectedPatient || sessionTreatmentOptions.length === 0)}>
                <SelectTrigger><SelectValue placeholder={appointmentType === 'session' && !selectedPatient ? 'Selecione um paciente' : appointmentType === 'session' && sessionTreatmentOptions.length === 0 ? 'Paciente sem tratamento contratado' : 'Selecionar tratamento'} /></SelectTrigger>
                <SelectContent>
                  {(appointmentType === 'session' ? sessionTreatmentOptions : treatments.map((t) => ({ id: t.id, name: t.name, duration_minutes: t.duration_minutes }))).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {appointmentType === 'session' && selectedSessionTreatmentSummary && (
                <div className="rounded-xl border bg-secondary/30 p-4 mt-2">
                  <p className="text-sm font-medium text-foreground mb-2">Resumo operacional do tratamento</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Contratadas</p>
                      <p className="text-lg font-semibold">{selectedSessionTreatmentSummary.contracted}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Realizadas</p>
                      <p className="text-lg font-semibold">{selectedSessionTreatmentSummary.performed}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Saldo</p>
                      <p className={`text-lg font-semibold ${selectedSessionTreatmentSummary.balance > 0 ? 'text-warning' : 'text-success'}`}>
                        {selectedSessionTreatmentSummary.balance}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {appointmentType === 'session' && selectedTreatment && selectedSessionTreatmentSummary?.balance === 0 && (
                <p className="text-xs text-destructive mt-1">
                  Este tratamento está finalizado (saldo 0). Escolha outro tratamento com saldo para agendar.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Profissional</Label>
              <Select value={selectedProfessional} onValueChange={setSelectedProfessional}>
                <SelectTrigger><SelectValue placeholder="Selecionar profissional" /></SelectTrigger>
                <SelectContent>
                  {professionals.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {appointmentType === 'evaluation' && !selectedProfessional && (
                <p className="text-xs text-amber-700">Escolha quem fará a avaliação para ela aparecer na agenda correta.</p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Data *</Label>
                <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Horário *</Label>
                <Input type="time" value={selectedTime} onChange={e => setSelectedTime(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Duração (min)</Label>
                <Input type="number" value={duration} onChange={e => setDuration(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
            </div>
            <div className="flex gap-3 pt-2">
              <BrandButton type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancelar</BrandButton>
              <BrandButton
                type="submit"
                className="flex-1"
                disabled={createMutation.isPending || (appointmentType === 'session' ? (!selectedPatient || !selectedTreatment || !hasSessionBalance) : !selectedLead) || !selectedProfessional}
              >
                {createMutation.isPending ? 'Criando...' : appointmentType === 'evaluation' ? 'Agendar avaliação' : 'Agendar'}
              </BrandButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* View appointment */}
      <Dialog open={!!viewAppt} onOpenChange={() => setViewAppt(null)}>
        <DialogContent className="max-w-md">
          {viewAppt && (
            <>
              <DialogHeader>
                <DialogTitle>Agendamento</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                {(() => {
                  const p = getSelectedPatientData(viewAppt.patient_id);
                  return p ? <AnamneseAlertBanner status={p?.current_anamnese_status} expiresAt={p?.current_anamnese_expires_at} patientId={viewAppt.patient_id} patientName={(viewAppt.patients as { full_name?: string | null; dissatisfaction_flag?: boolean | null; dissatisfaction_level?: string | null; dissatisfaction_reason?: string | null } | null)?.full_name} showActions={false} /> : null;
                })()}
                {(viewAppt.patients as { full_name?: string | null; dissatisfaction_flag?: boolean | null; dissatisfaction_level?: string | null; dissatisfaction_reason?: string | null } | null)?.dissatisfaction_flag && (
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive bg-destructive/5">
                    <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-destructive">Paciente insatisfeito — {(viewAppt.patients as { full_name?: string | null; dissatisfaction_flag?: boolean | null; dissatisfaction_level?: string | null; dissatisfaction_reason?: string | null } | null)?.dissatisfaction_level || 'N/A'}</p>
                      {(viewAppt.patients as { full_name?: string | null; dissatisfaction_flag?: boolean | null; dissatisfaction_level?: string | null; dissatisfaction_reason?: string | null } | null)?.dissatisfaction_reason && <p className="text-xs text-muted-foreground">{(viewAppt.patients as { dissatisfaction_reason?: string | null } | null)?.dissatisfaction_reason}</p>}
                    </div>
                  </div>
                )}
                <div className="text-sm space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Paciente:</span><span className="font-medium">{getAppointmentDisplayName(viewAppt)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Tipo:</span><span className="font-medium">{viewAppt.appointment_type === 'evaluation' ? 'Avaliação' : 'Sessão'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Profissional:</span><span className="font-medium">{getProfessionalLabel(viewAppt.professional_id)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Tratamento:</span><span className="font-medium">{(viewAppt.treatments as { name?: string | null } | null)?.name || '—'}</span></div>
                  {(viewAppt.leads as { phone?: string | null } | null)?.phone && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Contato do lead:</span><span className="font-medium">{(viewAppt.leads as { phone?: string | null } | null)?.phone}</span></div>
                  )}
                  <div className="flex justify-between"><span className="text-muted-foreground">Horário:</span><span className="font-medium">{format(getAppointmentStartDate(viewAppt), 'dd/MM/yyyy HH:mm', { locale: ptBR })} - {format(getAppointmentEndDate(viewAppt), 'HH:mm')}</span></div>
                  <div className="flex justify-between items-center"><span className="text-muted-foreground">Status:</span><BrandBadge status={statusConfig[viewAppt.status]?.badge || 'default'}>{statusConfig[viewAppt.status]?.label || viewAppt.status}</BrandBadge></div>
                  {viewAppt.notes && <div><span className="text-muted-foreground">Notas:</span><p className="mt-1">{viewAppt.notes}</p></div>}
                </div>

                {!isProfessional && (
                  <div className="space-y-2 pt-3 border-t">
                    <Label>Reatribuir profissional</Label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Select value={reassignProfessional} onValueChange={setReassignProfessional}>
                        <SelectTrigger className="sm:flex-1">
                          <SelectValue placeholder="Selecionar profissional" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Sem profissional</SelectItem>
                          {professionals.map((professional) => (
                            <SelectItem key={professional.user_id} value={professional.user_id}>
                              {professional.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <BrandButton
                        type="button"
                        variant="outline"
                        disabled={reassignProfessionalMutation.isPending || ['completed', 'cancelled', 'no_show'].includes(viewAppt.status)}
                        onClick={() => reassignProfessionalMutation.mutate()}
                      >
                        {reassignProfessionalMutation.isPending ? 'Salvando...' : 'Salvar responsável'}
                      </BrandButton>
                    </div>
                    {['completed', 'cancelled', 'no_show'].includes(viewAppt.status) && (
                      <p className="text-xs text-muted-foreground">Este status não permite reatribuição de profissional.</p>
                    )}
                  </div>
                )}

                <div className="space-y-3 pt-4 border-t">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Ações do agendamento
                  </div>
                  {(() => {
                    const canAdjustAppointment = !['completed', 'cancelled', 'no_show'].includes(viewAppt.status);
                    return (
                  <div className="flex flex-wrap gap-2">
                  {viewAppt.status === 'scheduled' && (
                    <BrandButton size="sm" onClick={() => updateStatusMutation.mutate({ id: viewAppt.id, status: 'confirmed' })}>
                      <Check className="w-4 h-4" /> Confirmar
                    </BrandButton>
                  )}
                  {viewAppt.status === 'confirmed' && (
                    <BrandButton size="sm" onClick={() => updateStatusMutation.mutate({ id: viewAppt.id, status: 'in_progress' })}>
                      <Check className="w-4 h-4" /> Iniciar atendimento
                    </BrandButton>
                  )}
                  {viewAppt.status === 'in_progress' && (
                    <BrandButton size="sm" onClick={() => updateStatusMutation.mutate({ id: viewAppt.id, status: 'completed' })}>
                      <Check className="w-4 h-4" /> Concluir atendimento
                    </BrandButton>
                  )}
                  {viewAppt.appointment_type === 'evaluation' && viewAppt.status === 'in_progress' && (
                    <BrandButton size="sm" onClick={() => openProposalFromEvaluation(viewAppt, true)} disabled={proposalLoadingId === viewAppt.id}>
                      <CalendarCheck2 className="w-4 h-4" /> {proposalLoadingId === viewAppt.id ? 'Abrindo...' : 'Finalizar e abrir proposta'}
                    </BrandButton>
                  )}
                  {viewAppt.appointment_type === 'evaluation' && viewAppt.status === 'completed' && (
                    <BrandButton size="sm" variant="outline" onClick={() => openProposalFromEvaluation(viewAppt, false)} disabled={proposalLoadingId === viewAppt.id}>
                      <CalendarCheck2 className="w-4 h-4" /> {proposalLoadingId === viewAppt.id ? 'Abrindo...' : 'Abrir proposta'}
                    </BrandButton>
                  )}
                  {canAdjustAppointment && (
                    <>
                      <BrandButton size="sm" variant="outline" onClick={() => openExceptionModal('reschedule', viewAppt)}>
                        Remarcar agendamento
                      </BrandButton>
                      <BrandButton size="sm" className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => openExceptionModal('cancel', viewAppt)}>
                        <X className="w-4 h-4" /> Cancelar agendamento
                      </BrandButton>
                      <BrandButton size="sm" variant="outline" onClick={() => openExceptionModal('no_show', viewAppt)}>
                        <AlertTriangle className="w-4 h-4" /> Registrar não comparecimento
                      </BrandButton>
                    </>
                  )}
                  {(viewAppt.status === 'confirmed' || viewAppt.status === 'scheduled' || viewAppt.status === 'in_progress') && (
                    <BrandButton size="sm" variant="outline" onClick={() => {
                      setViewAppt(null);
                      navigate(`/clinic/sessions?appointmentId=${viewAppt.id}`);
                    }}>
                      <ClipboardList className="w-4 h-4" /> Ir para Sessão
                    </BrandButton>
                  )}
                  </div>
                    );
                  })()}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!exceptionModal} onOpenChange={() => setExceptionModal(null)}>
        <DialogContent className="max-w-lg">
          {exceptionModal && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {exceptionModal.mode === 'cancel' ? 'Cancelar agendamento' :
                    exceptionModal.mode === 'no_show' ? 'Registrar não comparecimento' :
                    'Remarcar agendamento'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="rounded-xl border bg-secondary/30 p-4 text-sm">
                  <p className="font-medium text-foreground">{getAppointmentDisplayName(exceptionModal.appointment)}</p>
                  <p className="text-muted-foreground mt-1">
                    {format(getAppointmentStartDate(exceptionModal.appointment), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>
                    {exceptionModal.mode === 'reschedule' ? 'Motivo da remarcação' : 'Motivo'}
                  </Label>
                  <Textarea
                    value={exceptionReason}
                    onChange={(event) => setExceptionReason(event.target.value)}
                    rows={3}
                    placeholder={exceptionModal.mode === 'cancel' ? 'Explique por que o agendamento foi cancelado...' : 'Adicione um contexto para o time...'}
                  />
                </div>

                {exceptionModal.mode === 'reschedule' && (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label>Nova data</Label>
                        <Input type="date" value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Novo horário</Label>
                        <Input type="time" value={rescheduleTime} onChange={(event) => setRescheduleTime(event.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Duração</Label>
                        <Input type="number" value={rescheduleDuration} onChange={(event) => setRescheduleDuration(event.target.value)} />
                      </div>
                    </div>

                    {!isProfessional && (
                      <div className="space-y-2">
                        <Label>Profissional</Label>
                        <Select value={rescheduleProfessional} onValueChange={setRescheduleProfessional}>
                          <SelectTrigger><SelectValue placeholder="Selecionar profissional" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Sem profissional</SelectItem>
                            {professionals.map((professional) => (
                              <SelectItem key={professional.user_id} value={professional.user_id}>
                                {professional.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Notas do novo agendamento</Label>
                      <Textarea
                        value={rescheduleNotes}
                        onChange={(event) => setRescheduleNotes(event.target.value)}
                        rows={3}
                        placeholder="Adicione ajustes para o próximo horário, se necessário."
                      />
                    </div>
                  </>
                )}

                <div className="flex gap-3 pt-2">
                  <BrandButton type="button" variant="outline" className="flex-1" onClick={() => setExceptionModal(null)}>
                    Voltar
                  </BrandButton>
                  <BrandButton className="flex-1" onClick={() => appointmentExceptionMutation.mutate()} disabled={appointmentExceptionMutation.isPending}>
                    {appointmentExceptionMutation.isPending ? 'Salvando...' :
                      exceptionModal.mode === 'cancel' ? 'Confirmar cancelamento' :
                      exceptionModal.mode === 'no_show' ? 'Registrar no-show' :
                      'Confirmar remarcação'}
                  </BrandButton>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={availabilityDialogOpen} onOpenChange={setAvailabilityDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Disponibilidade semanal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Profissional</Label>
              <Select value={availabilityProfessional} onValueChange={setAvailabilityProfessional}>
                <SelectTrigger><SelectValue placeholder="Selecionar profissional" /></SelectTrigger>
                <SelectContent>
                  {professionals.map((professional) => (
                    <SelectItem key={professional.user_id} value={professional.user_id}>
                      {professional.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              {weekDays.map((day) => {
                const row = availabilityDraft[day.value] || { isActive: false, start: '09:00', end: '18:00' };
                return (
                  <div key={day.value} className="grid grid-cols-[160px_100px_1fr_1fr] gap-3 items-center rounded-xl border p-3">
                    <p className="text-sm font-medium text-foreground">{day.label}</p>
                    <Select
                      value={row.isActive ? 'active' : 'inactive'}
                      onValueChange={(value) => setAvailabilityDraft((current) => ({
                        ...current,
                        [day.value]: {
                          ...row,
                          isActive: value === 'active',
                        },
                      }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Ativo</SelectItem>
                        <SelectItem value="inactive">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="time"
                      value={row.start}
                      disabled={!row.isActive}
                      onChange={(event) => setAvailabilityDraft((current) => ({
                        ...current,
                        [day.value]: { ...row, start: event.target.value },
                      }))}
                    />
                    <Input
                      type="time"
                      value={row.end}
                      disabled={!row.isActive}
                      onChange={(event) => setAvailabilityDraft((current) => ({
                        ...current,
                        [day.value]: { ...row, end: event.target.value },
                      }))}
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3 pt-2">
              <BrandButton type="button" variant="outline" className="flex-1" onClick={() => setAvailabilityDialogOpen(false)}>
                Fechar
              </BrandButton>
              <BrandButton className="flex-1" onClick={() => saveAvailabilityMutation.mutate()} disabled={saveAvailabilityMutation.isPending}>
                {saveAvailabilityMutation.isPending ? 'Salvando...' : 'Salvar disponibilidade'}
              </BrandButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={blocksDialogOpen} onOpenChange={setBlocksDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bloqueios de agenda</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 mt-4">
            <div className="rounded-2xl border p-4 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Novo bloqueio</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Profissional</Label>
                  <Select value={blockProfessional} onValueChange={setBlockProfessional}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Bloqueio geral</SelectItem>
                      {professionals.map((professional) => (
                        <SelectItem key={professional.user_id} value={professional.user_id}>
                          {professional.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Motivo</Label>
                  <Input value={blockReason} onChange={(event) => setBlockReason(event.target.value)} placeholder="Ex.: reunião interna, manutenção..." />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-2">
                  <Label>Início</Label>
                  <Input type="date" value={blockStartDate} onChange={(event) => setBlockStartDate(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Hora</Label>
                  <Input type="time" value={blockStartTime} onChange={(event) => setBlockStartTime(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Fim</Label>
                  <Input type="date" value={blockEndDate} onChange={(event) => setBlockEndDate(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Hora</Label>
                  <Input type="time" value={blockEndTime} onChange={(event) => setBlockEndTime(event.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notas</Label>
                <Textarea value={blockNotes} onChange={(event) => setBlockNotes(event.target.value)} rows={3} />
              </div>
              <div className="flex justify-end">
                <BrandButton onClick={() => createBlockMutation.mutate()} disabled={createBlockMutation.isPending}>
                  {createBlockMutation.isPending ? 'Salvando...' : 'Criar bloqueio'}
                </BrandButton>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Bloqueios cadastrados</h3>
              {appointmentBlocks.length === 0 ? (
                <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Nenhum bloqueio encontrado para o período.
                </div>
              ) : (
                appointmentBlocks.map((block) => (
                  <div key={block.id} className="rounded-xl border p-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{block.reason || 'Bloqueio'}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {format(new Date(block.start_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} - {format(new Date(block.end_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {block.professional_id ? getProfessionalLabel(block.professional_id) : 'Bloqueio geral'}
                      </p>
                      {block.notes && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{block.notes}</p>}
                    </div>
                    <BrandButton size="sm" variant="outline" onClick={() => deleteBlockMutation.mutate(block.id)}>
                      <Trash2 className="w-4 h-4" />
                    </BrandButton>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={waitlistDialogOpen} onOpenChange={setWaitlistDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lista de Espera Inteligente</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 mt-4">
            {!waitlistSchemaAvailable && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-sm font-semibold text-destructive">Schema da lista de espera não está aplicado nesta base</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Rode a migration `20260515231500_agenda_avancada_waitlist.sql` no Supabase e recarregue a tela.
                </p>
              </div>
            )}
            <div className="rounded-xl border border-dashed p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Monitorar vagas agora</p>
                <p className="text-xs text-muted-foreground">Roda o agente e procura encaixes usando disponibilidade, bloqueios e conflitos.</p>
              </div>
              <BrandButton
                type="button"
                variant="outline"
                onClick={() => runWaitlistMutation.mutate()}
                disabled={runWaitlistMutation.isPending || !waitlistSchemaAvailable}
              >
                {runWaitlistMutation.isPending ? 'Processando...' : 'Buscar vagas'}
              </BrandButton>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                createWaitlistMutation.mutate();
              }}
              className="rounded-2xl border p-4 space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de cadastro</Label>
                  <Select value={waitlistTargetType} onValueChange={(value) => setWaitlistTargetType(value as WaitlistTargetType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="patient">Paciente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {waitlistTargetType === 'lead' ? (
                  <div className="space-y-2">
                    <Label>Lead *</Label>
                    <Select value={waitlistLeadId} onValueChange={setWaitlistLeadId}>
                      <SelectTrigger><SelectValue placeholder="Selecionar lead" /></SelectTrigger>
                      <SelectContent>
                        {leads.map((lead) => (
                          <SelectItem key={lead.id} value={lead.id}>{lead.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Paciente *</Label>
                    <Select value={waitlistPatientId} onValueChange={setWaitlistPatientId}>
                      <SelectTrigger><SelectValue placeholder="Selecionar paciente" /></SelectTrigger>
                      <SelectContent>
                        {patients.map((patient) => (
                          <SelectItem key={patient.id} value={patient.id}>{patient.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Profissional preferido</Label>
                  <Select value={waitlistProfessionalId} onValueChange={setWaitlistProfessionalId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Qualquer profissional</SelectItem>
                      {professionals.map((professional) => (
                        <SelectItem key={professional.user_id} value={professional.user_id}>{professional.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tratamento</Label>
                  <Select value={waitlistTreatmentId} onValueChange={setWaitlistTreatmentId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Qualquer tratamento</SelectItem>
                      {treatments.map((treatment) => (
                        <SelectItem key={treatment.id} value={treatment.id}>{treatment.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Período preferido</Label>
                  <Select value={waitlistPreferredPeriod} onValueChange={(value) => setWaitlistPreferredPeriod(value as 'morning' | 'afternoon' | 'evening' | 'all')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Qualquer horário</SelectItem>
                      <SelectItem value="morning">Manhã</SelectItem>
                      <SelectItem value="afternoon">Tarde</SelectItem>
                      <SelectItem value="evening">Noite</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Janela</Label>
                  <Select value={waitlistWindowType} onValueChange={(value) => setWaitlistWindowType(value as WaitlistWindowType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="this_week">Esta semana</SelectItem>
                      <SelectItem value="next_week">Próxima semana</SelectItem>
                      <SelectItem value="this_month">Este mês</SelectItem>
                      <SelectItem value="custom">Personalizada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Início</Label>
                  <Input type="date" value={waitlistWindowStart} onChange={(event) => setWaitlistWindowStart(event.target.value)} disabled={waitlistWindowType !== 'custom'} />
                </div>
                <div className="space-y-2">
                  <Label>Fim</Label>
                  <Input type="date" value={waitlistWindowEnd} onChange={(event) => setWaitlistWindowEnd(event.target.value)} disabled={waitlistWindowType !== 'custom'} />
                </div>
                <div className="space-y-2">
                  <Label>Duração mínima (min)</Label>
                  <Input type="number" min={15} step={5} value={waitlistDuration} onChange={(event) => setWaitlistDuration(event.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Prioridade</Label>
                  <Select value={waitlistPriority} onValueChange={(value) => setWaitlistPriority(value as WaitlistPriority)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">Alta</SelectItem>
                      <SelectItem value="urgent">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Canal de contato</Label>
                  <Select value={waitlistContactPreference} onValueChange={(value) => setWaitlistContactPreference(value as WaitlistContactPreference)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="phone">Ligação</SelectItem>
                      <SelectItem value="email">E-mail</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Telefone de contato</Label>
                  <Input value={waitlistContactPhone} onChange={(event) => setWaitlistContactPhone(event.target.value)} placeholder="Opcional" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea rows={2} value={waitlistNotes} onChange={(event) => setWaitlistNotes(event.target.value)} placeholder="Preferências extras do paciente/lead" />
              </div>

              <div className="flex justify-end gap-2">
                <BrandButton type="button" variant="outline" onClick={resetWaitlistForm}>Limpar</BrandButton>
                <BrandButton type="submit" disabled={createWaitlistMutation.isPending || !waitlistSchemaAvailable}>
                  {createWaitlistMutation.isPending ? 'Salvando...' : 'Adicionar à lista'}
                </BrandButton>
              </div>
            </form>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Entradas ativas da lista de espera</h3>
              {waitlistEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Nenhuma entrada ativa na lista de espera.
                </div>
              ) : (
                <div className="space-y-2">
                  {waitlistEntries.map((entry) => (
                    <div key={entry.id} className="rounded-xl border p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">
                          {entry.patients?.full_name || entry.leads?.full_name || 'Cadastro sem nome'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Janela: {format(new Date(`${entry.window_start}T00:00:00`), 'dd/MM/yyyy')} - {format(new Date(`${entry.window_end}T00:00:00`), 'dd/MM/yyyy')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {entry.treatments?.name || 'Qualquer tratamento'} · {entry.min_duration_minutes} min · {getProfessionalLabel(entry.preferred_professional_id)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <BrandBadge status={entry.priority === 'urgent' ? 'overdue' : entry.priority === 'high' ? 'pending' : 'default'}>
                          {waitlistPriorityLabel(entry.priority)}
                        </BrandBadge>
                        <BrandBadge status="scheduled">{waitlistStatusLabel(entry.status)}</BrandBadge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Vagas encontradas (pendentes de ação)</h3>
              {waitlistNotifications.length === 0 ? (
                <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Nenhuma vaga encontrada pendente.
                </div>
              ) : (
                <div className="space-y-2">
                  {waitlistNotifications.map((notification) => (
                    <div key={notification.id} className="rounded-xl border p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">
                          {notification.appointment_waitlist?.patient_id ? 'Paciente' : 'Lead'} · {notification.appointment_waitlist?.id.slice(0, 8)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(notification.matched_slot_start), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} - {format(new Date(notification.matched_slot_end), "HH:mm", { locale: ptBR })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {getProfessionalLabel(notification.matched_professional_id)}
                        </p>
                      </div>
                      <BrandButton
                        size="sm"
                        onClick={() => createAppointmentFromNotificationMutation.mutate(notification)}
                        disabled={createAppointmentFromNotificationMutation.isPending}
                      >
                        Agendar esta vaga
                      </BrandButton>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <QuickPatientModal
        open={quickPatientOpen}
        onOpenChange={setQuickPatientOpen}
        onCreated={(patient) => setSelectedPatient(patient.id)}
      />
    </div>
  );
}
