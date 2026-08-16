import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useAgendaProfessionals } from '@/hooks/useAgendaProfessionals';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { BrandBadge, type BadgeStatus } from '@/components/ui/brand-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { Plus, ChevronLeft, ChevronRight, ChevronDown, Check, X, AlertTriangle, ClipboardList, UserPlus, CalendarCheck2, Clock3, CheckCircle2, CalendarCog, Lock, Trash2, BellRing, Stethoscope, MapPin, MoreHorizontal, RefreshCw, Search, CalendarRange } from 'lucide-react';
import QuickPatientModal from '@/components/patient/QuickPatientModal';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek,
  isSameMonth, isSameDay, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays,
  startOfDay, endOfDay
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Database } from '@/integrations/supabase/types';
import { getAgendaErrorMessage } from '@/lib/agenda/errors';
import { AgendaStatCard } from '@/components/agenda/AgendaStatCard';
import { AgendaSidePanel } from '@/components/agenda/AgendaSidePanel';

type AgendaRpcError = { message: string; code?: string; details?: string; hint?: string };
type AgendaRpcResult<T> = { data: T | null; error: AgendaRpcError | null };
const callAgendaRpc = <T,>(name: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (functionName: string, parameters: Record<string, unknown>) => Promise<AgendaRpcResult<T>>)(name, args);

const professionalColors = [
  'hsl(var(--primary))', 'hsl(210 80% 50%)', 'hsl(280 60% 50%)',
  'hsl(30 80% 50%)', 'hsl(160 60% 40%)', 'hsl(350 70% 50%)',
  'hsl(190 70% 40%)', 'hsl(60 70% 40%)',
];

const timeToMinutes = (value: string) => {
  const [hours = 0, minutes = 0] = value.slice(0, 5).split(':').map(Number);
  return hours * 60 + minutes;
};

const statusConfig: Record<string, { label: string; badge: BadgeStatus; style: string }> = {
  scheduled: { label: 'Agendado', badge: 'scheduled', style: 'border-l-4 border-l-info' },
  confirmed: { label: 'Confirmado', badge: 'confirmed', style: 'border-l-4 border-l-success' },
  completed: { label: 'Concluído', badge: 'completed', style: 'opacity-60 border-l-4 border-l-success' },
  cancelled: { label: 'Cancelado', badge: 'cancelled', style: 'opacity-50 line-through border-l-4 border-l-destructive' },
  no_show: { label: 'Não compareceu', badge: 'no_show', style: 'border-l-4 border-l-warning' },
  rescheduled: { label: 'Remarcado', badge: 'scheduled', style: 'border-l-4 border-l-sky-500 opacity-80' },
  in_progress: { label: 'Em andamento', badge: 'in_progress', style: 'border-l-4 border-l-info' },
};

type ViewMode = 'month' | 'week' | 'day' | 'doctors-day';
type AppointmentType = 'consultation' | 'return' | 'evaluation' | 'post_operative';
const appointmentTypeLabels: Record<AppointmentType | 'session', string> = {
  consultation: 'Consulta',
  return: 'Retorno',
  evaluation: 'Avaliação',
  post_operative: 'Pós-Operatório',
  session: 'Consulta',
};
type WaitlistWindowType = Database['public']['Enums']['waitlist_window_type'];
type WaitlistPriority = Database['public']['Enums']['waitlist_priority'];
type WaitlistContactPreference = Database['public']['Enums']['waitlist_contact_preference'];
type WaitlistTargetType = 'lead' | 'patient';
type AppointmentRow = Database['public']['Tables']['appointments']['Row'] & {
  appointment_type?: AppointmentType | 'session' | null;
  scheduled_at?: string | null;
  duration_minutes?: number | null;
  lead_id?: string | null;
  is_batch?: boolean | null;
  patients?: {
    full_name?: string | null;
    phone?: string | null;
    cpf?: string | null;
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
type AgendaSessionPreferences = {
  viewMode?: ViewMode;
  currentDate?: string;
  locationId?: string;
  professional?: string;
  professionalIds?: string[];
  status?: string;
};
const agendaPreferenceKey = 'agenda-med:session-preferences';
function loadAgendaPreferences(): AgendaSessionPreferences {
  try {
    return JSON.parse(sessionStorage.getItem(agendaPreferenceKey) || '{}') as AgendaSessionPreferences;
  } catch {
    return {};
  }
}
const halfHourSlots = Array.from({ length: 22 }, (_, index) => {
  const minutes = 8 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});
function halfHourKey(date: Date) {
  const hour = String(date.getHours()).padStart(2, '0');
  return `${hour}:${date.getMinutes() < 30 ? '00' : '30'}`;
}
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
  const sessionPreferences = useMemo(loadAgendaPreferences, []);
  const [clockNow, setClockNow] = useState(() => new Date());
  const [currentDate, setCurrentDate] = useState(() => sessionPreferences.currentDate ? new Date(sessionPreferences.currentDate) : new Date());
  const [viewMode, setViewMode] = useState<ViewMode>(sessionPreferences.viewMode || 'week');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewAppt, setViewAppt] = useState<AppointmentRow | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('09:00');
  const [appointmentType, setAppointmentType] = useState<AppointmentType>('consultation');
  const [selectedPatient, setSelectedPatient] = useState('');
  const [selectedLead, setSelectedLead] = useState('');
  const [selectedTreatment, setSelectedTreatment] = useState('');
  const [selectedProfessional, setSelectedProfessional] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState(sessionPreferences.locationId || '');
  const [filterProfessional, setFilterProfessional] = useState(sessionPreferences.professional || 'all');
  const [selectedDoctorIds, setSelectedDoctorIds] = useState<string[]>(sessionPreferences.professionalIds || []);
  const [filterStatus, setFilterStatus] = useState(sessionPreferences.status || 'all');
  const [agendaSearch, setAgendaSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [createFormError, setCreateFormError] = useState('');
  const [duration, setDuration] = useState('60');
  const [billingType, setBillingType] = useState<'private' | 'insurance'>('private');
  const [selectedHealthInsurance, setSelectedHealthInsurance] = useState('');
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

  const { data: locations = [] } = useQuery({
    queryKey: ['clinic-locations', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('clinic_locations').select('id,name,is_primary,active').eq('clinic_id', clinicId!).eq('active', true).order('is_primary', { ascending: false }).order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });
  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (locations.length && !locations.some((location) => location.id === selectedLocationId)) {
      setSelectedLocationId(locations.find(location => location.is_primary)?.id || locations[0].id);
    }
  }, [locations, selectedLocationId]);
  useEffect(() => {
    sessionStorage.setItem(agendaPreferenceKey, JSON.stringify({
      viewMode,
      currentDate: currentDate.toISOString(),
      locationId: selectedLocationId,
      professional: filterProfessional,
      professionalIds: selectedDoctorIds,
      status: filterStatus,
    } satisfies AgendaSessionPreferences));
  }, [viewMode, currentDate, selectedLocationId, filterProfessional, selectedDoctorIds, filterStatus]);

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

  const { data: appointments = [], isLoading: appointmentsLoading, isError: appointmentsError, refetch: refetchAppointments } = useQuery({
    queryKey: ['appointments', clinicId, rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('*, patients(full_name, phone, cpf, dissatisfaction_flag, dissatisfaction_level, dissatisfaction_reason), leads!appointments_lead_id_fkey(full_name, phone), treatments(name)')
        .eq('clinic_id', clinicId!)
        .eq('location_id', selectedLocationId)
        .gte('scheduled_at', rangeStart.toISOString())
        .lte('scheduled_at', rangeEnd.toISOString())
        .order('scheduled_at');
      if (error) throw error;
      return (data || []) as AppointmentRow[];
    },
    enabled: !!clinicId && !!selectedLocationId,
  });

  const selectedPatientLookupId = selectedPatient || prefillPatientId || '';
  const { data: patients = [] } = useQuery({
    queryKey: ['patients-select', clinicId, selectedPatientLookupId],
    queryFn: async () => {
      let query = supabase
        .from('patients')
        .select('id, full_name')
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

  const { data: appointmentDurationSettings } = useQuery({
    queryKey: ['agenda-appointment-durations', clinicId, selectedProfessional],
    queryFn: async () => {
      const [{ data: settings, error: settingsError }, { data: insuranceLinks, error: linksError }] = await Promise.all([
        supabase.from('professional_settings').select('private_appointment_duration_minutes').eq('clinic_id', clinicId!).eq('professional_id', selectedProfessional).maybeSingle(),
        supabase.from('professional_health_insurances').select('health_insurance_id, appointment_duration_minutes, health_insurances(name)').eq('clinic_id', clinicId!).eq('professional_id', selectedProfessional).eq('status', 'active'),
      ]);
      if (settingsError) throw settingsError;
      if (linksError) throw linksError;
      return { privateDuration: settings?.private_appointment_duration_minutes || 60, insuranceLinks: insuranceLinks || [] };
    },
    enabled: !!clinicId && !!selectedProfessional && dialogOpen,
  });

  useEffect(() => {
    if (!appointmentDurationSettings) return;
    if (billingType === 'private') {
      setDuration(String(appointmentDurationSettings.privateDuration));
      return;
    }
    const link = appointmentDurationSettings.insuranceLinks.find(item => item.health_insurance_id === selectedHealthInsurance);
    if (link) setDuration(String(link.appointment_duration_minutes));
  }, [appointmentDurationSettings, billingType, selectedHealthInsurance]);

  const { data: treatments = [] } = useQuery({
    queryKey: ['treatments-select', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('treatments').select('id, name, duration_minutes').eq('clinic_id', clinicId!).eq('is_active', true).order('name');
      return data || [];
    },
    enabled: !!clinicId,
  });
  const { professionals: agendaProfessionals } = useAgendaProfessionals(clinicId, user?.id);
  const { data: locationProfessionalIds = [] } = useQuery({
    queryKey: ['agenda-location-professionals', clinicId, selectedLocationId],
    queryFn: async () => {
      const { data, error } = await supabase.from('professional_locations').select('professional_id').eq('clinic_id', clinicId!).eq('location_id', selectedLocationId).eq('active', true);
      if (error) throw error;
      return (data || []).map(link => link.professional_id as string);
    },
    enabled: !!clinicId && !!selectedLocationId,
  });
  const professionals = useMemo(
    () => agendaProfessionals.filter(professional => locationProfessionalIds.includes(professional.id)).map((professional, index) => ({
      ...professional,
      color: professionalColors[index % professionalColors.length],
    })),
    [agendaProfessionals, locationProfessionalIds],
  );
  const currentProfessionalId = professionals.find(professional => professional.user_id === user?.id)?.id || null;
  const professionalIdsKey = professionals.map((professional) => professional.id).join(',');

  useEffect(() => {
    if (professionals.length === 0) return;
    if (isProfessional && currentProfessionalId) {
      setSelectedDoctorIds([currentProfessionalId]);
      setFilterProfessional(currentProfessionalId);
      return;
    }
    setSelectedDoctorIds((current) => {
      const next = current.length > 0
        ? current.filter((id) => professionals.some((professional) => professional.id === id))
        : professionals.map((professional) => professional.id);
      return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next;
    });
  }, [isProfessional, professionalIdsKey, currentProfessionalId, professionals]);

  const { data: availability = [] } = useQuery({
    queryKey: ['professional-availability', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('professional_availability')
        .select('*')
        .eq('clinic_id', clinicId!)
        .eq('location_id', selectedLocationId)
        .eq('is_active', true)
        .order('professional_id')
        .order('day_of_week');
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId && !!selectedLocationId,
  });

  const { data: appointmentBlocks = [] } = useQuery({
    queryKey: ['appointment-blocks', clinicId, rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: async () => {
      const from = startOfDay(addDays(rangeStart, -14)).toISOString();
      const to = endOfDay(addDays(rangeEnd, 30)).toISOString();
      const { data, error } = await supabase.from('appointment_blocks')
        .select('*')
        .eq('clinic_id', clinicId!)
        .eq('location_id', selectedLocationId)
        .gte('start_at', from)
        .lte('end_at', to)
        .order('start_at');
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId && !!selectedLocationId,
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

  const getSelectedPatientData = (patientId: string) => patients.find((p) => p.id === patientId);
  const getSelectedLeadData = useCallback((leadId: string) => leads.find((lead) => lead.id === leadId), [leads]);
  const getAppointmentStartDate = (appointment) => new Date(appointment.start_time || appointment.scheduled_at);
  const getAppointmentEndDate = (appointment) => {
    if (appointment.end_time) return new Date(appointment.end_time);
    const start = getAppointmentStartDate(appointment);
    return new Date(start.getTime() + (appointment.duration_minutes || 60) * 60000);
  };
  const getAppointmentDisplayName = (appointment) => {
    return (appointment.patients as { full_name?: string | null } | null)?.full_name || (appointment.leads as { full_name?: string | null } | null)?.full_name || 'Paciente sem cadastro';
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
    return professionals.find((professional) => professional.id === professionalId)?.label || 'Profissional';
  };
  const openExceptionModal = (mode: 'cancel' | 'no_show' | 'reschedule', appointment: Record<string, unknown> & { id: string; clinic_id: string; status: string; appointment_type?: string | null; lead_id?: string | null }) => {
    setExceptionReason('');
    setRescheduleDate(format(getAppointmentStartDate(appointment), 'yyyy-MM-dd'));
    setRescheduleTime(format(getAppointmentStartDate(appointment), 'HH:mm'));
    setRescheduleDuration(String(appointment.duration_minutes || Math.max(15, Math.round((getAppointmentEndDate(appointment).getTime() - getAppointmentStartDate(appointment).getTime()) / 60000))));
    setRescheduleProfessional(appointment.professional_id || 'unassigned');
    setRescheduleNotes(appointment.notes || '');
    setExceptionModal({ mode, appointment });
    setViewAppt(null);
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
      setAppointmentType(prefillAppointmentType === 'return' ? 'return' : prefillAppointmentType === 'post_operative' ? 'post_operative' : 'consultation');
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
      if (!selectedProfessional && isProfessional && currentProfessionalId) {
        setSelectedProfessional(currentProfessionalId);
      }
      return;
    }

    const assignedProfessional = professionals.find((professional) => professional.user_id === lead.assigned_to);
    setSelectedProfessional(assignedProfessional?.id || (isProfessional ? currentProfessionalId || '' : ''));
  }, [appointmentType, selectedLead, professionals, isProfessional, currentProfessionalId, dialogOpen, selectedProfessional, getSelectedLeadData]);

  useEffect(() => {
    if (professionals.length > 0 && availabilityProfessional === 'unassigned') {
      setAvailabilityProfessional(professionals[0].id);
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
    const index = professionals.findIndex(p => p.id === profId);
    return professionalColors[(index >= 0 ? index : 0) % professionalColors.length];
  };

  const filteredAppointments = useMemo(() => {
    let filtered = appointments;
    if (viewMode === 'doctors-day') {
      filtered = filtered.filter((appointment) => !!appointment.professional_id && selectedDoctorIds.includes(appointment.professional_id));
    } else if (filterProfessional === 'unassigned') {
      filtered = filtered.filter((appointment) => !appointment.professional_id);
    } else if (filterProfessional !== 'all') {
      filtered = filtered.filter((a) => a.professional_id === filterProfessional);
    }
    if (filterStatus === 'all') {
      // A remarcação preserva o registro anterior para auditoria, mas ele não
      // representa mais um horário ocupado e não deve aparecer na agenda ativa.
      filtered = filtered.filter((appointment) => appointment.status !== 'rescheduled');
    } else {
      filtered = filtered.filter((a) => a.status === filterStatus);
    }
    return filtered;
  }, [appointments, filterProfessional, filterStatus, selectedDoctorIds, viewMode]);

  const searchResults = useMemo(() => {
    const term = agendaSearch.trim().toLocaleLowerCase('pt-BR');
    if (term.length < 2) return [];
    return appointments.filter((appointment) => {
      const patient = appointment.patients as { full_name?: string | null; phone?: string | null; cpf?: string | null } | null;
      const lead = appointment.leads as { full_name?: string | null; phone?: string | null } | null;
      const treatment = appointment.treatments as { name?: string | null } | null;
      const professionalName = professionals.find((professional) => professional.id === appointment.professional_id)?.label;
      return [patient?.full_name, patient?.phone, patient?.cpf, lead?.full_name, lead?.phone, treatment?.name,
        professionalName, statusConfig[appointment.status]?.label]
        .some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(term));
    }).slice(0, 8);
  }, [agendaSearch, appointments, professionals]);

  const openNewAppointmentAt = (day: Date, time: string, professionalId?: string | null) => {
    resetForm();
    setSelectedDate(format(day, 'yyyy-MM-dd'));
    setSelectedTime(time);
    if (professionalId) setSelectedProfessional(professionalId);
    else if (filterProfessional !== 'all' && filterProfessional !== 'unassigned') setSelectedProfessional(filterProfessional);
    setDialogOpen(true);
  };

  const isWithinProfessionalAvailability = useCallback((
    day: Date,
    time: string,
    professionalId: string | null,
    durationMinutes = 30,
  ) => {
    if (!professionalId) return true;
    const startMinutes = timeToMinutes(time);
    const endMinutes = startMinutes + durationMinutes;
    return availability.some((slot) =>
      slot.professional_id === professionalId &&
      slot.day_of_week === day.getDay() &&
      timeToMinutes(slot.start_time) <= startMinutes &&
      timeToMinutes(slot.end_time) >= endMinutes
    );
  }, [availability]);

  const visibleProfessionalId = filterProfessional !== 'all' && filterProfessional !== 'unassigned'
    ? filterProfessional
    : null;

  const selectSearchResult = (appointment: AppointmentRow) => {
    setCurrentDate(getAppointmentStartDate(appointment));
    setViewMode('day');
    setViewAppt(appointment);
    setAgendaSearch('');
    setSearchOpen(false);
  };

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
      confirmedToday: todayAppointments.filter((appointment) => appointment.status === 'confirmed').length,
      awaitingToday: todayAppointments.filter((appointment) => appointment.status === 'scheduled').length,
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

  const createMutation = useMutation({
    mutationFn: async () => {
      setCreateFormError('');
      const startTime = new Date(`${selectedDate}T${selectedTime}:00`);
      const profId = selectedProfessional || (isProfessional ? currentProfessionalId : null);
      if (!profId) {
        throw new Error('Selecione um profissional para este agendamento.');
      }
      if (!isWithinProfessionalAvailability(startTime, selectedTime, profId, parseInt(duration) || 30)) {
        throw new Error('Horário fora da disponibilidade do profissional. Escolha um dos horários disponíveis na grade.');
      }
      if (billingType === 'insurance') {
        if (!selectedHealthInsurance) throw new Error('Selecione o convênio da consulta.');
        const professionalAcceptsInsurance = appointmentDurationSettings?.insuranceLinks.some(link => link.health_insurance_id === selectedHealthInsurance);
        if (!professionalAcceptsInsurance) throw new Error('O convênio selecionado não está ativo para este profissional.');
      }
      if (appointmentType !== 'evaluation' && !selectedPatient) throw new Error('Selecione um paciente.');
      const { data: insertedAppointment, error } = await callAgendaRpc<{ id: string; start_time: string; professional_id: string }>('create_appointment_secure', {
        p_clinic_id: clinicId!,
        p_location_id: selectedLocationId,
        p_professional_id: profId,
        p_patient_id: appointmentType === 'evaluation' ? null : selectedPatient,
        p_lead_id: appointmentType === 'evaluation' ? selectedLead : null,
        p_treatment_id: selectedTreatment || null,
        p_start_time: startTime.toISOString(),
        p_appointment_type: appointmentType,
        p_notes: notes || null,
        // O banco resolve a duração pela modalidade configurada para o profissional.
        p_duration_minutes: null,
        p_contract_id: null,
        p_contract_item_id: null,
        p_billing_type: billingType,
        p_health_insurance_id: billingType === 'insurance' ? selectedHealthInsurance : null,
      });
      if (error) throw error;
      if (!insertedAppointment) throw new Error('O banco não retornou o agendamento criado.');

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
    onError: (err: unknown) => {
      const msg = getAgendaErrorMessage(err) || 'Erro ao criar agendamento.';
      if (
        msg.toLocaleLowerCase('pt-BR').includes('horário') ||
        msg.toLocaleLowerCase('pt-BR').includes('bloqueio') ||
        msg.toLocaleLowerCase('pt-BR').includes('disponibilidade')
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
      const { error } = status === 'confirmed'
        ? await callAgendaRpc<AppointmentRow>('confirm_appointment_secure', {
            p_clinic_id: clinicId!,
            p_appointment_id: id,
          })
        : await callAgendaRpc<AppointmentRow>('transition_appointment_status_secure', {
            p_clinic_id: clinicId!,
            p_appointment_id: id,
            p_status: status,
          });
      if (error) throw error;

      if (appointment?.lead_id && status === 'completed') {
        const { error: leadError } = await supabase.from('leads')
          .update({ kanban_stage: 'closed_won' })
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

        const { error } = await callAgendaRpc<AppointmentRow>('cancel_appointment_secure', {
          p_clinic_id: clinicId,
          p_appointment_id: appointment.id,
          p_reason: exceptionReason.trim(),
          p_status: exceptionModal.mode === 'cancel' ? 'cancelled' : 'no_show',
        });
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
      const nextProfessionalId = rescheduleProfessional === 'unassigned' ? null : rescheduleProfessional;
      const effectiveProfessionalId = nextProfessionalId || appointment.professional_id;
      if (!effectiveProfessionalId) throw new Error('Selecione um profissional para remarcar.');

      const mergedNotes = [appointment.notes, rescheduleNotes].filter(Boolean).join('\n\n');
      const { data: newAppointment, error: createError } = await callAgendaRpc<{ id: string }>('reschedule_appointment_secure', {
        p_clinic_id: clinicId,
        p_appointment_id: appointment.id,
        p_start_time: startTime.toISOString(),
        p_professional_id: nextProfessionalId,
        p_location_id: appointment.location_id || selectedLocationId,
        p_notes: mergedNotes || null,
        // O PostgreSQL recalcula pela modalidade, convênio, serviço e profissional vigentes.
        p_duration_minutes: null,
        p_reason: exceptionReason.trim() || 'Remarcado',
      });
      if (createError) throw createError;
      if (!newAppointment) throw new Error('O banco não retornou o novo agendamento.');

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
    onError: (err: Error) => toast({ title: 'Erro', description: getAgendaErrorMessage(err), variant: 'destructive' }),
  });

  const reassignProfessionalMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !viewAppt) return;
      const nextProfessionalId = reassignProfessional === 'unassigned' ? null : reassignProfessional;
      if ((viewAppt.professional_id || null) === nextProfessionalId) return;

      if (!nextProfessionalId) throw new Error('Selecione um profissional para o agendamento.');
      const { error } = await callAgendaRpc<AppointmentRow>('reassign_appointment_professional_secure', {
        p_clinic_id: clinicId,
        p_appointment_id: viewAppt.id,
        p_professional_id: nextProfessionalId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      if (!viewAppt) return;
      const nextProfessionalId = reassignProfessional === 'unassigned' ? null : reassignProfessional;
      setViewAppt({ ...viewAppt, professional_id: nextProfessionalId });
      qc.invalidateQueries({ queryKey: ['appointments'] });
      toast({ title: 'Profissional reatribuído!' });
    },
    onError: (error) => toast({ title: 'Não foi possível reatribuir', description: getAgendaErrorMessage(error), variant: 'destructive' }),
  });

  const saveAvailabilityMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !availabilityProfessional || availabilityProfessional === 'unassigned') {
        throw new Error('Selecione um profissional.');
      }

      const { error: deleteError } = await supabase.from('professional_availability')
        .delete()
        .eq('clinic_id', clinicId)
        .eq('location_id', selectedLocationId)
        .eq('professional_id', availabilityProfessional);
      if (deleteError) throw deleteError;

      const rows = weekDays
        .map((day) => ({ day, config: availabilityDraft[day.value] }))
        .filter(({ config }) => config?.isActive)
        .map(({ day, config }) => ({
          clinic_id: clinicId,
          location_id: selectedLocationId,
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
        location_id: selectedLocationId,
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
      const professionalId = notification.matched_professional_id;
      if (!professionalId) throw new Error('Profissional da vaga não identificado.');

      const { data: appointment, error: appointmentError } = await callAgendaRpc<{ id: string }>('create_appointment_secure', {
        p_clinic_id: clinicId,
        p_location_id: selectedLocationId,
        p_professional_id: professionalId,
        p_patient_id: waitlist.patient_id,
        p_lead_id: waitlist.lead_id,
        p_treatment_id: waitlist.treatment_id,
        p_start_time: startTime,
        p_appointment_type: waitlist.lead_id ? 'evaluation' : 'consultation',
        p_notes: waitlist.notes || null,
        // A duração ofertada e criada tem a mesma autoridade canônica no PostgreSQL.
        p_duration_minutes: null,
        p_contract_id: null,
        p_contract_item_id: null,
      });
      if (appointmentError) throw appointmentError;
      if (!appointment) throw new Error('O banco não retornou o agendamento criado.');

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
    onError: (err: Error) => toast({ title: 'Erro ao criar agendamento', description: getAgendaErrorMessage(err), variant: 'destructive' }),
  });

  const createWaitlistMutation = useMutation({
    mutationFn: async () => {
      if (!waitlistSchemaAvailable) {
        throw new Error('Lista de espera indisponível: rode as migrations de Agenda Avançada nesta base.');
      }
      if (!clinicId) throw new Error('Clínica não identificada.');
      if (waitlistTargetType === 'lead' && !waitlistLeadId) throw new Error('Selecione um paciente em avaliação.');
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
      toast({ title: 'Paciente adicionado à lista de espera' });
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
    setAppointmentType('consultation');
    setSelectedPatient('');
    setSelectedLead('');
    setSelectedTreatment('');
    setSelectedProfessional('');
    setDuration('60');
    setBillingType('private');
    setSelectedHealthInsurance('');
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

  const navigate_ = (dir: number) => {
    if (viewMode === 'month') setCurrentDate(dir > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(dir > 0 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    else setCurrentDate(dir > 0 ? addDays(currentDate, 1) : subDays(currentDate, 1));
  };

  const getApptsForDay = (day: Date) => filteredAppointments.filter((a) => isSameDay(getAppointmentStartDate(a), day));
  const selectedDoctors = professionals.filter((professional) => selectedDoctorIds.includes(professional.id));
  const filterProfessionalLabel = filterProfessional === 'all'
    ? 'Todos os médicos'
    : filterProfessional === 'unassigned'
      ? 'Não atribuído'
      : professionals.find((professional) => professional.id === filterProfessional)?.label || 'Selecionar médico';
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const headerLabel = viewMode === 'month'
    ? format(currentDate, 'MMM yyyy', { locale: ptBR })
    : viewMode === 'week'
    ? `${format(rangeStart, 'd', { locale: ptBR })}–${format(rangeEnd, 'd MMM', { locale: ptBR })}`
    : format(currentDate, 'd MMM', { locale: ptBR });
  const now = clockNow;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const agendaStartMinutes = 8 * 60;
  const agendaEndMinutes = agendaStartMinutes + halfHourSlots.length * 30;
  const showCurrentTime = currentMinutes >= agendaStartMinutes && currentMinutes < agendaEndMinutes;
  const currentTimeSlotIndex = Math.floor((currentMinutes - agendaStartMinutes) / 30);
  const currentTimeOffset = ((currentMinutes % 30) / 30) * 48;
  const currentTimeDayOffset = ((currentMinutes % 30) / 30) * 58;

  return (
    <div>
      <PageHeader title="Agenda" description="Gerencie agendamentos, disponibilidade e atendimentos da clínica.">
        <BrandButton className="h-10 shadow-sm" onClick={() => {
            resetForm();
            setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
            if (isProfessional && currentProfessionalId) {
              setSelectedProfessional(currentProfessionalId || '');
            }
            setDialogOpen(true);
          }}>
          <Plus className="h-4 w-4" /> Novo agendamento
        </BrandButton>
      </PageHeader>

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-sm">
        <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
          <SelectTrigger className="h-10 w-[220px] border-0 bg-secondary/60 shadow-none" aria-label="Selecionar unidade"><MapPin className="mr-2 h-4 w-4"/><SelectValue placeholder="Selecionar unidade" /></SelectTrigger>
          <SelectContent>{locations.map(location => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}</SelectContent>
        </Select>
        <BrandButton className="h-10" size="sm" variant="ghost" onClick={() => setAvailabilityDialogOpen(true)}>
          <CalendarCog className="h-4 w-4" /> Disponibilidade
        </BrandButton>
        <BrandButton className="h-10" size="sm" variant="ghost" onClick={() => setBlocksDialogOpen(true)}>
          <Lock className="h-4 w-4" /> Bloqueios{appointmentBlocks.length > 0 ? ` (${appointmentBlocks.length})` : ''}
        </BrandButton>
        <BrandButton className="h-10" size="sm" variant="ghost" onClick={() => { resetWaitlistForm(); setWaitlistDialogOpen(true); }}>
          <BellRing className="h-4 w-4" /> Lista de espera{waitlistEntries.length > 0 ? ` · ${waitlistEntries.length}` : ''}
        </BrandButton>
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <BrandButton className="h-10" size="sm" variant="ghost" aria-label="Abrir automações da agenda">
                <MoreHorizontal className="h-4 w-4" /> Automações
              </BrandButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Operações administrativas</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <button className="w-full rounded-sm px-2 py-2 text-left text-sm hover:bg-secondary" onClick={() => sendReminderQueueMutation.mutate()}>Lembretes de consultas</button>
              <button className="w-full rounded-sm px-2 py-2 text-left text-sm hover:bg-secondary" onClick={() => dispatchReminderMutation.mutate()}>Confirmações via WhatsApp</button>
              <button className="w-full rounded-sm px-2 py-2 text-left text-sm hover:bg-secondary" onClick={() => generateDailySummaryMutation.mutate()}>Resumo diário</button>
              <button className="w-full rounded-sm px-2 py-2 text-left text-sm hover:bg-secondary" onClick={() => runAgendaJobsMutation.mutate('manual')}>Automação de encaixe</button>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        <AgendaStatCard value={operationalSummary.totalInView} label="Agendamentos no período" icon={CalendarCheck2} />
        <AgendaStatCard value={operationalSummary.today} label="Atendimentos hoje" icon={Clock3} />
        <AgendaStatCard value={operationalSummary.confirmedToday} label="Confirmados hoje" icon={CheckCircle2} tone="success" />
        <AgendaStatCard value={operationalSummary.awaitingToday} label="Aguardando confirmação" icon={Clock3} tone="warning" />
        <AgendaStatCard value={operationalSummary.noShow} label="Faltas no período" icon={X} tone="danger" />
        <AgendaStatCard value={waitlistEntries.length} label="Na lista de espera" icon={BellRing} />
      </div>

      {/* Controls */}
      <div className="mb-3 flex flex-col gap-2 rounded-xl border bg-card p-2.5 shadow-sm xl:flex-row xl:items-center">
        <div className="flex min-w-0 shrink-0 items-center gap-1">
          <button aria-label="Período anterior" onClick={() => navigate_(-1)} className="rounded-lg p-2 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><ChevronLeft className="h-5 w-5" /></button>
          <button aria-label="Próximo período" onClick={() => navigate_(1)} className="rounded-lg p-2 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><ChevronRight className="h-5 w-5" /></button>
          <BrandButton size="sm" variant="outline" className="ml-1 h-9" onClick={() => setCurrentDate(new Date())}>Hoje</BrandButton>
          <span className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
          <h2 className="mx-1 max-w-[120px] truncate whitespace-nowrap text-sm font-semibold capitalize text-foreground sm:text-base" title={headerLabel}>{headerLabel}</h2>
        </div>
        <Popover open={searchOpen && agendaSearch.trim().length >= 2} onOpenChange={setSearchOpen}>
          <PopoverTrigger asChild>
            <div className="relative w-full min-w-0 md:w-[240px] md:flex-none xl:ml-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={agendaSearch} onFocus={() => setSearchOpen(true)} onChange={(event) => { setAgendaSearch(event.target.value); setSearchOpen(true); }} className="h-9 pl-9" placeholder="Buscar paciente ou agendamento" aria-label="Buscar paciente ou agendamento" />
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-[360px] max-w-[calc(100vw-2rem)] p-1" align="start" onOpenAutoFocus={(event) => event.preventDefault()}>
            {searchResults.length === 0 ? <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum agendamento encontrado neste período.</p> : (
              <div className="max-h-80 overflow-y-auto">
                {searchResults.map((appointment) => (
                  <button key={appointment.id} type="button" className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => selectSearchResult(appointment)}>
                    <p className="text-sm font-semibold">{getAppointmentDisplayName(appointment)}</p>
                    <p className="text-xs text-muted-foreground">{(appointment.treatments as { name?: string | null } | null)?.name || 'Atendimento'} · {getProfessionalLabel(appointment.professional_id)}</p>
                    <p className="mt-1 text-xs text-primary">{format(getAppointmentStartDate(appointment), "dd/MM/yyyy '·' HH:mm")}</p>
                  </button>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>
        <div className="flex min-w-0 flex-wrap items-center gap-2.5 xl:ml-auto xl:justify-end 2xl:flex-nowrap">
          {viewMode === 'doctors-day' ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <BrandButton variant="outline" className="min-w-[210px] justify-between">
                  <span className="flex items-center gap-2"><Stethoscope className="h-4 w-4" />{selectedDoctorIds.length} médico(s)</span>
                  <ChevronDown className="h-4 w-4" />
                </BrandButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Médicos exibidos no dia</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={selectedDoctorIds.length === professionals.length && professionals.length > 0}
                  onCheckedChange={(checked) => setSelectedDoctorIds(checked ? professionals.map((professional) => professional.id) : [])}
                  onSelect={(event) => event.preventDefault()}
                >
                  Todos os médicos
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                {professionals.map((professional) => (
                  <DropdownMenuCheckboxItem
                    key={professional.id}
                    checked={selectedDoctorIds.includes(professional.id)}
                    onCheckedChange={(checked) => setSelectedDoctorIds((current) => checked
                      ? Array.from(new Set([...current, professional.id]))
                      : current.filter((id) => id !== professional.id))}
                    onSelect={(event) => event.preventDefault()}
                  >
                    <span className="mr-2 h-3 w-3 rounded-full" style={{ background: professional.color }} />
                    {professional.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Select value={filterProfessional} onValueChange={setFilterProfessional}>
              <SelectTrigger
                className="h-9 w-[170px] min-w-0 [&>span:first-child]:block [&>span:first-child]:min-w-0 [&>span:first-child]:truncate [&>span:first-child]:whitespace-nowrap"
                title={filterProfessionalLabel}
              >
                <SelectValue placeholder="Selecionar médico" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os médicos</SelectItem>
                <SelectItem value="unassigned">Não atribuído</SelectItem>
                {professionals.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: p.color }} />
                      <span className="truncate">{p.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Todos os status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="scheduled">Agendado</SelectItem>
              <SelectItem value="confirmed">Confirmado</SelectItem>
              <SelectItem value="in_progress">Em andamento</SelectItem>
              <SelectItem value="completed">Concluído</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
              <SelectItem value="rescheduled">Remarcado</SelectItem>
              <SelectItem value="no_show">Não compareceu</SelectItem>
            </SelectContent>
          </Select>
          <Tabs className="shrink-0" value={viewMode} onValueChange={v => setViewMode(v as ViewMode)}>
            <TabsList className="grid h-9 w-[240px] grid-cols-4">
              <TabsTrigger className="min-w-0 px-3 text-xs sm:text-sm" value="day">Dia</TabsTrigger>
              <TabsTrigger className="min-w-0 px-3 text-xs sm:text-sm" value="week">Semana</TabsTrigger>
              <TabsTrigger className="min-w-0 px-3 text-xs sm:text-sm" value="month">Mês</TabsTrigger>
              <TooltipProvider><Tooltip><TooltipTrigger asChild><TabsTrigger className="min-w-0 px-3 text-xs sm:text-sm" value="doctors-day">Equipe</TabsTrigger></TooltipTrigger><TooltipContent>Visualizar agendas dos profissionais lado a lado.</TooltipContent></Tooltip></TooltipProvider>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <main className="min-w-0" aria-label="Calendário de agendamentos">
      {appointmentsLoading && (
        <div className="rounded-xl border bg-card p-4 shadow-sm" aria-label="Carregando agenda">
          <div className="mb-4 h-10 animate-pulse rounded-lg bg-secondary" />
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 21 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-lg bg-secondary/70" />)}
          </div>
        </div>
      )}
      {appointmentsError && (
        <div className="rounded-xl border border-destructive/20 bg-card px-6 py-12 text-center shadow-sm">
          <AlertTriangle className="mx-auto mb-3 h-7 w-7 text-destructive" />
          <p className="font-medium text-foreground">Não foi possível carregar a agenda.</p>
          <BrandButton className="mt-4" variant="outline" onClick={() => refetchAppointments()}><RefreshCw className="h-4 w-4" /> Tentar novamente</BrandButton>
        </div>
      )}
      {!appointmentsLoading && !appointmentsError && viewMode === 'doctors-day' && (
        <div className="max-h-[calc(100vh-330px)] min-h-[460px] overflow-auto rounded-xl bg-card shadow-card animate-fade-in">
          {selectedDoctors.length === 0 ? (
            <div className="p-10 text-center">
              <Stethoscope className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="font-medium text-foreground">Selecione pelo menos um médico</p>
              <p className="mt-1 text-sm text-muted-foreground">Use o seletor de médicos acima.</p>
            </div>
          ) : (
            <div
              className="grid w-full min-w-max"
              style={{ gridTemplateColumns: `64px repeat(${selectedDoctors.length}, minmax(280px, 1fr))` }}
            >
              <div className="sticky left-0 top-0 z-40 border-b border-r bg-card" />
              {selectedDoctors.map((professional) => {
                const appointmentCount = getApptsForDay(currentDate)
                  .filter((appointment) => appointment.professional_id === professional.id).length;
                return (
                  <div key={`header-${professional.id}`} className="sticky top-0 z-30 border-b border-r bg-secondary/95 px-4 py-3 backdrop-blur">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: professional.color }} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground" title={professional.label}>{professional.label}</p>
                        <p className="text-xs text-muted-foreground">{appointmentCount} agendamento(s)</p>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="sticky left-0 z-20 border-b border-r bg-card" />
              {selectedDoctors.map((professional) => (
                <button
                  key={`new-${professional.id}`}
                  type="button"
                  className="border-b border-r px-4 py-2 text-left text-xs font-medium text-primary hover:bg-primary/5"
                  onClick={() => {
                    resetForm();
                    setSelectedDate(format(currentDate, 'yyyy-MM-dd'));
                    setSelectedProfessional(professional.id);
                    setDialogOpen(true);
                  }}
                >
                  + Novo agendamento para este médico
                </button>
              ))}

              {halfHourSlots.flatMap((slot, slotIndex) => [
                <div key={`team-time-${slot}`} className="sticky left-0 z-20 h-12 border-b border-r border-dashed bg-card pr-2 pt-1 text-right text-[10px] font-medium text-muted-foreground">
                  {slot}
                </div>,
                ...selectedDoctors.map((professional) => {
                  const doctorAppointments = getApptsForDay(currentDate)
                    .filter((appointment) => appointment.professional_id === professional.id);
                  const slotAppointments = doctorAppointments.filter((appointment) => halfHourKey(getAppointmentStartDate(appointment)) === slot);
                  const slotStart = new Date(`${format(currentDate, 'yyyy-MM-dd')}T${slot}:00`);
                  const coveringAppointment = doctorAppointments.find((appointment) =>
                    getAppointmentStartDate(appointment) < slotStart && getAppointmentEndDate(appointment) > slotStart
                  );
                  const doctorBlocks = getBlocksForDay(currentDate)
                    .filter((block) => !block.professional_id || block.professional_id === professional.id);
                  const startingBlock = doctorBlocks.find((block) => halfHourKey(new Date(block.start_at)) === slot);
                  const coveringBlock = doctorBlocks.find((block) =>
                    new Date(block.start_at) < slotStart && new Date(block.end_at) > slotStart
                  );
                  const isAvailable = isWithinProfessionalAvailability(currentDate, slot, professional.id);

                  return (
                    <div key={`${professional.id}-${slot}`} className={`group relative h-12 border-b border-r border-dashed px-1 py-0.5 ${!isAvailable ? 'bg-muted/40' : ''}`}>
                      {showCurrentTime && isSameDay(currentDate, now) && slotIndex === currentTimeSlotIndex && (
                        <div className="pointer-events-none absolute inset-x-0 z-20 border-t border-primary/70" style={{ top: currentTimeOffset }} />
                      )}
                      {startingBlock ? (
                        <div className="relative z-10 h-full overflow-hidden rounded-md border border-amber-200 bg-amber-50 px-1.5 py-1 text-[10px] text-amber-800" title={startingBlock.reason || 'Indisponível'}>
                          <span className="block truncate font-medium">Bloqueado · {format(new Date(startingBlock.start_at), 'HH:mm')}–{format(new Date(startingBlock.end_at), 'HH:mm')}</span>
                          <span className="block truncate">{startingBlock.reason || 'Indisponível'}</span>
                        </div>
                      ) : coveringBlock || (slotAppointments.length === 0 && coveringAppointment) ? (
                        <div className="pointer-events-none h-full w-full" aria-label="Horário ocupado" />
                      ) : slotAppointments.length === 0 ? (
                        <button
                          type="button"
                          disabled={!isAvailable}
                          className="h-full w-full rounded text-[10px] text-transparent transition-colors enabled:hover:bg-primary/5 enabled:hover:text-primary enabled:focus-visible:bg-primary/5 enabled:focus-visible:text-primary enabled:focus-visible:outline-none enabled:focus-visible:ring-1 enabled:focus-visible:ring-primary disabled:cursor-not-allowed"
                          onClick={() => openNewAppointmentAt(currentDate, slot, professional.id)}
                          aria-label={isAvailable ? `Agendar com ${professional.label} às ${slot}` : `${professional.label} indisponível às ${slot}`}
                        >
                          + Agendar
                        </button>
                      ) : slotAppointments.map((appointment) => {
                        const status = statusConfig[appointment.status];
                        return (
                          <button
                            key={appointment.id}
                            type="button"
                            className={`relative z-10 w-full overflow-hidden rounded-md border bg-background px-1.5 py-1 text-left text-[10px] shadow-sm transition hover:-translate-y-px hover:shadow-md ${status?.style || ''}`}
                            style={{ height: `${Math.max(44, ((appointment.duration_minutes || 60) / 30) * 48 - 4)}px` }}
                            onClick={() => setViewAppt(appointment)}
                            aria-label={`Abrir agendamento de ${getAppointmentDisplayName(appointment)} com ${professional.label}`}
                          >
                            <span className="block truncate font-semibold">{format(getAppointmentStartDate(appointment), 'HH:mm')}–{format(getAppointmentEndDate(appointment), 'HH:mm')} · {getAppointmentDisplayName(appointment)}</span>
                            <span className="block truncate text-muted-foreground">{appointment.billing_type === 'insurance' ? 'Convênio' : 'Particular'} · {appointment.duration_minutes || 60} min</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                }),
              ])}

              <div className="sticky left-0 z-20 border-r bg-card px-1 py-2 text-right text-[9px] text-muted-foreground">Extras</div>
              {selectedDoctors.map((professional) => (
                <div key={`team-extras-${professional.id}`} className="min-h-9 border-r p-1">
                  {getApptsForDay(currentDate)
                    .filter((appointment) => appointment.professional_id === professional.id && !halfHourSlots.includes(halfHourKey(getAppointmentStartDate(appointment))))
                    .map((appointment) => (
                      <button key={appointment.id} type="button" className="w-full rounded-md border bg-background p-1.5 text-left text-[10px] shadow-sm hover:shadow-md" onClick={() => setViewAppt(appointment)}>
                        <span className="block truncate font-semibold">{format(getAppointmentStartDate(appointment), 'HH:mm')} · {getAppointmentDisplayName(appointment)}</span>
                        <span className="text-muted-foreground">Fora da grade operacional</span>
                      </button>
                    ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!appointmentsLoading && !appointmentsError && viewMode === 'month' && (
        <div className="overflow-x-auto rounded-xl bg-card shadow-card animate-fade-in">
          <div className="grid min-w-[700px] grid-cols-7">
            {dayNames.map(d => (
              <div key={d} className="px-2 py-2 text-xs font-semibold text-muted-foreground text-center border-b bg-secondary/50">{d}</div>
            ))}
          </div>
          <div className="grid min-w-[700px] grid-cols-7">
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

      {!appointmentsLoading && !appointmentsError && viewMode === 'week' && (
        <div className="max-h-[calc(100vh-330px)] min-h-[460px] overflow-auto rounded-xl bg-card shadow-card animate-fade-in">
          <div className="grid min-w-[820px] grid-cols-[64px_repeat(7,minmax(108px,1fr))]">
            <div className="sticky left-0 top-0 z-30 border-b border-r bg-card" />
            {calendarDays.map((day, i) => {
              const isToday = isSameDay(day, now);
              return <div key={day.toISOString()} className={`sticky top-0 z-20 border-b border-r px-2 py-2 text-center ${isToday ? 'bg-primary/10' : 'bg-secondary/95'}`}><span className="text-xs text-muted-foreground">{dayNames[i]}</span> <span className={`text-sm font-semibold ${isToday ? 'text-primary' : ''}`}>{format(day, 'd')}</span></div>;
            })}
            <div className="sticky left-0 z-10 border-b border-r bg-card" />
            {calendarDays.map((day) => {
              const dayBlocks = getBlocksForDay(day);
              return <div key={`blocks-${day.toISOString()}`} className="min-h-8 border-b border-r p-1">{dayBlocks.length > 0 && <div className="truncate rounded border border-amber-200 bg-amber-50 px-1.5 py-1 text-[10px] text-amber-700"><Lock className="mr-1 inline h-3 w-3" />{dayBlocks.length} bloqueio{dayBlocks.length > 1 ? 's' : ''}</div>}</div>;
            })}
            {halfHourSlots.flatMap((slot, slotIndex) => [
              <div key={`time-${slot}`} className="sticky left-0 z-10 h-12 border-b border-r border-dashed bg-card pr-2 pt-1 text-right text-[10px] font-medium text-muted-foreground">{slot}</div>,
              ...calendarDays.map((day) => {
                const dayAppointments = getApptsForDay(day);
                const slotAppointments = dayAppointments.filter((appointment) => halfHourKey(getAppointmentStartDate(appointment)) === slot);
                const slotStart = new Date(`${format(day, 'yyyy-MM-dd')}T${slot}:00`);
                const coveringAppointment = dayAppointments.find((appointment) =>
                  getAppointmentStartDate(appointment) < slotStart && getAppointmentEndDate(appointment) > slotStart
                );
                const isCurrentDay = isSameDay(day, now);
                const isAvailable = isWithinProfessionalAvailability(day, slot, visibleProfessionalId);
                return (
                  <div key={`${day.toISOString()}-${slot}`} className={`group relative h-12 border-b border-r border-dashed px-1 py-0.5 ${!isAvailable ? 'bg-muted/40' : ''}`}>
                    {showCurrentTime && isCurrentDay && slotIndex === currentTimeSlotIndex && <div className="pointer-events-none absolute inset-x-0 z-20 border-t border-primary/70" style={{ top: currentTimeOffset }} />}
                    {slotAppointments.length === 0 && coveringAppointment ? (
                      <div className="pointer-events-none h-full w-full" aria-label={`Horário ocupado até ${format(getAppointmentEndDate(coveringAppointment), 'HH:mm')}`} />
                    ) : slotAppointments.length === 0 ? (
                      <button type="button" disabled={!isAvailable} className="h-full w-full rounded text-[10px] text-transparent transition-colors enabled:hover:bg-primary/5 enabled:hover:text-primary enabled:focus-visible:bg-primary/5 enabled:focus-visible:text-primary enabled:focus-visible:outline-none enabled:focus-visible:ring-1 enabled:focus-visible:ring-primary disabled:cursor-not-allowed" onClick={() => openNewAppointmentAt(day, slot)} aria-label={isAvailable ? `Agendar em ${format(day, 'dd/MM')} às ${slot}` : `Indisponível em ${format(day, 'dd/MM')} às ${slot}`}>+ Agendar</button>
                    ) : slotAppointments.map((appointment) => (
                      <button
                        key={appointment.id}
                        type="button"
                        className={`relative z-10 w-full overflow-hidden rounded-md border bg-background px-1.5 py-1 text-left text-[10px] shadow-sm transition hover:-translate-y-px hover:shadow-md ${statusConfig[appointment.status]?.style || ''}`}
                        style={{ height: `${Math.max(44, ((appointment.duration_minutes || 60) / 30) * 48 - 4)}px` }}
                        onClick={() => setViewAppt(appointment)}
                        aria-label={`Abrir agendamento de ${getAppointmentDisplayName(appointment)}`}
                      >
                        <span className="block truncate font-semibold">{format(getAppointmentStartDate(appointment), 'HH:mm')}–{format(getAppointmentEndDate(appointment), 'HH:mm')} · {getAppointmentDisplayName(appointment)}</span>
                        <span className="block truncate text-muted-foreground">{appointment.billing_type === 'insurance' ? 'Convênio' : 'Particular'} · {appointment.duration_minutes || 60} min</span>
                      </button>
                    ))}
                  </div>
                );
              }),
            ])}
            <div className="sticky left-0 z-10 border-r bg-card px-1 py-2 text-right text-[9px] text-muted-foreground">Extras</div>
            {calendarDays.map((day) => (
              <div key={`extras-${day.toISOString()}`} className="min-h-9 border-r p-1">
                {getApptsForDay(day).filter((appointment) => !halfHourSlots.includes(halfHourKey(getAppointmentStartDate(appointment)))).map((appointment) => (
                  <button key={appointment.id} type="button" className="w-full rounded-md border bg-background p-1.5 text-left text-[10px] shadow-sm hover:shadow-md" onClick={() => setViewAppt(appointment)}>
                    <span className="block truncate font-semibold">{format(getAppointmentStartDate(appointment), 'HH:mm')} · {getAppointmentDisplayName(appointment)}</span>
                    <span className="text-muted-foreground">Fora da grade operacional</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {!appointmentsLoading && !appointmentsError && viewMode === 'day' && (
        <div className="max-h-[calc(100vh-330px)] min-h-[460px] overflow-y-auto rounded-xl bg-card p-3 shadow-card animate-fade-in">
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
          <div className="divide-y">
            {halfHourSlots.map((slot, slotIndex) => {
              const dayAppointments = getApptsForDay(currentDate);
              const slotAppointments = dayAppointments.filter((appointment) => halfHourKey(getAppointmentStartDate(appointment)) === slot);
              const slotStart = new Date(`${format(currentDate, 'yyyy-MM-dd')}T${slot}:00`);
              const coveringAppointment = dayAppointments.find((appointment) =>
                getAppointmentStartDate(appointment) < slotStart && getAppointmentEndDate(appointment) > slotStart
              );
              const isAvailable = isWithinProfessionalAvailability(currentDate, slot, visibleProfessionalId);
              return (
                <div key={slot} className={`group relative grid min-h-[58px] grid-cols-[56px_1fr] gap-3 py-1 ${!isAvailable ? 'bg-muted/30' : ''}`}>
                  {showCurrentTime && isSameDay(currentDate, now) && slotIndex === currentTimeSlotIndex && <div className="pointer-events-none absolute left-[68px] right-0 z-20 border-t border-primary/70" style={{ top: currentTimeDayOffset }}><span className="absolute -left-[52px] -top-2 text-[10px] font-medium text-primary">{format(now, 'HH:mm')}</span></div>}
                  <span className="pt-2 text-xs font-medium text-muted-foreground">{slot}</span>
                  {slotAppointments.length === 0 && coveringAppointment ? (
                    <div className="pointer-events-none min-h-[48px]" aria-label={`Horário ocupado até ${format(getAppointmentEndDate(coveringAppointment), 'HH:mm')}`} />
                  ) : slotAppointments.length === 0 ? (
                    <button type="button" disabled={!isAvailable} className="min-h-[48px] rounded-lg border border-transparent text-left text-xs text-transparent transition enabled:hover:border-dashed enabled:hover:border-primary/30 enabled:hover:bg-primary/5 enabled:hover:px-3 enabled:hover:text-primary enabled:focus-visible:border-primary/30 enabled:focus-visible:bg-primary/5 enabled:focus-visible:px-3 enabled:focus-visible:text-primary enabled:focus-visible:outline-none enabled:focus-visible:ring-2 enabled:focus-visible:ring-primary disabled:cursor-not-allowed" onClick={() => openNewAppointmentAt(currentDate, slot)} aria-label={isAvailable ? `Agendar às ${slot}` : `Indisponível às ${slot}`}>+ Agendar</button>
                  ) : (
                    <div className="space-y-1">
                      {slotAppointments.map((appointment) => {
                        const status = statusConfig[appointment.status];
                        return (
                          <button
                            key={appointment.id}
                            type="button"
                            className={`relative z-10 flex w-full flex-col gap-2 overflow-hidden rounded-lg border bg-background px-3 py-2 text-left shadow-sm transition hover:-translate-y-px hover:shadow-md sm:flex-row sm:items-start sm:justify-between ${status?.style || ''}`}
                            style={{ minHeight: `${Math.max(48, ((appointment.duration_minutes || 60) / 30) * 58 - 8)}px` }}
                            onClick={() => setViewAppt(appointment)}
                          >
                            <div className="min-w-0">
                              <p className="font-semibold">{format(getAppointmentStartDate(appointment), 'HH:mm')}–{format(getAppointmentEndDate(appointment), 'HH:mm')} · {getAppointmentDisplayName(appointment)}</p>
                              <p className="truncate text-xs text-muted-foreground">{appointment.billing_type === 'insurance' ? 'Convênio' : 'Particular'} · {appointment.duration_minutes || 60} min · {getProfessionalLabel(appointment.professional_id)}</p>
                            </div>
                            <BrandBadge status={status?.badge || 'default'}>{status?.label || appointment.status}</BrandBadge>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {getApptsForDay(currentDate).filter((appointment) => !halfHourSlots.includes(halfHourKey(getAppointmentStartDate(appointment)))).map((appointment) => (
              <button key={appointment.id} type="button" className="mt-2 w-full rounded-lg border bg-background p-3 text-left shadow-sm hover:shadow-md" onClick={() => setViewAppt(appointment)}>
                <span className="font-semibold">{format(getAppointmentStartDate(appointment), 'HH:mm')}–{format(getAppointmentEndDate(appointment), 'HH:mm')} · {getAppointmentDisplayName(appointment)}</span>
                <span className="ml-2 text-xs text-muted-foreground">Fora da grade operacional</span>
              </button>
            ))}
          </div>
        </div>
      )}
        </main>
        <AgendaSidePanel
          date={currentDate}
          onDateChange={(date) => { setCurrentDate(date); setViewMode('day'); }}
          upcoming={todayQueue.slice(0, 3).map((appointment) => ({
            id: appointment.id,
            time: format(getAppointmentStartDate(appointment), 'HH:mm'),
            title: getAppointmentDisplayName(appointment),
            subtitle: (appointment.treatments as { name?: string | null } | null)?.name || 'Atendimento',
            meta: getProfessionalLabel(appointment.professional_id),
          }))}
          waitlist={waitlistEntries.slice(0, 3).map((entry) => ({
            id: entry.id,
            title: entry.patients?.full_name || entry.leads?.full_name || 'Paciente',
            subtitle: entry.treatments?.name || 'Qualquer atendimento',
            meta: `Preferência: ${(entry.preferred_periods || []).join(', ') || 'qualquer período'}`,
          }))}
          onViewWaitlist={() => setWaitlistDialogOpen(true)}
          onViewDay={() => { setCurrentDate(new Date()); setViewMode('day'); }}
        />
      </div>

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
            {appointmentType !== 'evaluation' ? (
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
              </>
            ) : (
              <div className="space-y-2">
                <Label>Paciente *</Label>
                <Select value={selectedLead} onValueChange={setSelectedLead}>
                  <SelectTrigger><SelectValue placeholder="Selecionar paciente para avaliação" /></SelectTrigger>
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
              <Select value={appointmentType} onValueChange={value => setAppointmentType(value as AppointmentType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="consultation">Consulta</SelectItem>
                  <SelectItem value="return">Retorno</SelectItem>
                  <SelectItem value="evaluation">Avaliação</SelectItem>
                  <SelectItem value="post_operative">Pós-Operatório</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{appointmentType === 'evaluation' ? 'Tratamento de interesse' : 'Tratamento'}</Label>
              <Select value={selectedTreatment} onValueChange={v => {
                setSelectedTreatment(v);
              }}>
                <SelectTrigger><SelectValue placeholder="Selecionar tratamento" /></SelectTrigger>
                <SelectContent>
                  {treatments.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Profissional</Label>
              <Select value={selectedProfessional} onValueChange={setSelectedProfessional}>
                <SelectTrigger><SelectValue placeholder="Selecionar profissional" /></SelectTrigger>
                <SelectContent>
                  {professionals.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {appointmentType === 'evaluation' && !selectedProfessional && (
                <p className="text-xs text-amber-700">Escolha quem fará a avaliação para ela aparecer na agenda correta.</p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Modalidade da consulta</Label>
                <Select value={billingType} onValueChange={value => { setBillingType(value as 'private' | 'insurance'); setSelectedHealthInsurance(''); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="private">Particular</SelectItem><SelectItem value="insurance">Convênio</SelectItem></SelectContent>
                </Select>
              </div>
              {billingType === 'insurance' && (
                <div className="space-y-2">
                  <Label>Convênio</Label>
                  <Select value={selectedHealthInsurance} onValueChange={setSelectedHealthInsurance} disabled={!selectedProfessional}>
                    <SelectTrigger><SelectValue placeholder={selectedProfessional ? 'Selecionar convênio' : 'Selecione o profissional'} /></SelectTrigger>
                    <SelectContent>{appointmentDurationSettings?.insuranceLinks.map(link => <SelectItem key={link.health_insurance_id} value={link.health_insurance_id}>{link.health_insurances?.name || 'Convênio'} · {link.appointment_duration_minutes} min</SelectItem>)}</SelectContent>
                  </Select>
                </div>
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
                <Input type="number" value={duration} readOnly className="bg-muted/50" />
                <p className="text-[11px] text-muted-foreground">Definida pela regra de {billingType === 'insurance' ? 'convênio' : 'consulta particular'} deste profissional.</p>
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
                disabled={createMutation.isPending || (appointmentType === 'evaluation' ? !selectedLead : !selectedPatient) || !selectedProfessional || (billingType === 'insurance' && !selectedHealthInsurance)}
              >
                {createMutation.isPending ? 'Criando...' : appointmentType === 'evaluation' ? 'Agendar avaliação' : 'Agendar'}
              </BrandButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Appointment quick view */}
      <Sheet open={!!viewAppt} onOpenChange={(open) => !open && setViewAppt(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {viewAppt && (
            <>
              <SheetHeader>
                <SheetTitle>{getAppointmentDisplayName(viewAppt)}</SheetTitle>
                <SheetDescription>{(viewAppt.treatments as { name?: string | null } | null)?.name || appointmentTypeLabels[(viewAppt.appointment_type as AppointmentType | 'session') || 'consultation'] || 'Atendimento'}</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 mt-4">
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
                  <div className="flex justify-between"><span className="text-muted-foreground">Tipo:</span><span className="font-medium">{appointmentTypeLabels[(viewAppt.appointment_type as AppointmentType | 'session') || 'consultation'] || 'Consulta'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Profissional:</span><span className="font-medium">{getProfessionalLabel(viewAppt.professional_id)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Unidade:</span><span className="font-medium">{locations.find((location) => location.id === viewAppt.location_id)?.name || 'Unidade atual'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Tratamento:</span><span className="font-medium">{(viewAppt.treatments as { name?: string | null } | null)?.name || '—'}</span></div>
                  {(viewAppt.patients as { phone?: string | null } | null)?.phone && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Contato:</span><span className="font-medium">{(viewAppt.patients as { phone?: string | null } | null)?.phone}</span></div>
                  )}
                  {(viewAppt.leads as { phone?: string | null } | null)?.phone && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Contato do paciente:</span><span className="font-medium">{(viewAppt.leads as { phone?: string | null } | null)?.phone}</span></div>
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
                        <SelectTrigger id="appointment-professional-editor" className="sm:flex-1">
                          <SelectValue placeholder="Selecionar profissional" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Sem profissional</SelectItem>
                          {professionals.map((professional) => (
                            <SelectItem key={professional.id} value={professional.id}>
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
                  {canAdjustAppointment && (
                    <>
                      <BrandButton size="sm" variant="outline" onClick={() => openExceptionModal('reschedule', viewAppt)}>
                        <CalendarRange className="h-4 w-4" /> Remarcar
                      </BrandButton>
                      {!isProfessional && (
                        <BrandButton size="sm" variant="outline" onClick={() => document.getElementById('appointment-professional-editor')?.focus()}>
                          Editar responsável
                        </BrandButton>
                      )}
                      <BrandButton size="sm" className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => openExceptionModal('cancel', viewAppt)}>
                        <X className="w-4 h-4" /> Cancelar
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
        </SheetContent>
      </Sheet>

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
                        <Input type="number" value={rescheduleDuration} readOnly className="bg-muted/50" />
                        <p className="text-[11px] text-muted-foreground">Recalculada pela regra ao salvar.</p>
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
                              <SelectItem key={professional.id} value={professional.id}>
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
                    <SelectItem key={professional.id} value={professional.id}>
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
                        <SelectItem key={professional.id} value={professional.id}>
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
                      <SelectItem value="lead">Paciente em avaliação</SelectItem>
                      <SelectItem value="patient">Paciente cadastrado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {waitlistTargetType === 'lead' ? (
                  <div className="space-y-2">
                    <Label>Paciente em avaliação *</Label>
                    <Select value={waitlistLeadId} onValueChange={setWaitlistLeadId}>
                      <SelectTrigger><SelectValue placeholder="Selecionar paciente" /></SelectTrigger>
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
                        <SelectItem key={professional.id} value={professional.id}>{professional.label}</SelectItem>
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
                <Textarea rows={2} value={waitlistNotes} onChange={(event) => setWaitlistNotes(event.target.value)} placeholder="Preferências extras do paciente" />
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
                          Paciente · {notification.appointment_waitlist?.id.slice(0, 8)}
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
