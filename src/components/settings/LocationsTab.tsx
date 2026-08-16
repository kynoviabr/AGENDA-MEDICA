import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, CalendarOff, MapPin, Plus, Save, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import WeeklyHoursEditor from './WeeklyHoursEditor';
import { emptyWeeklyHours, validatePeriods, validateWeeklyOperatingHours, type OperatingPeriod, type WeeklyOperatingHours } from '@/scheduling/operatingHours';

const emptyForm = { name: '', address_line: '', city: '', state: '', zip_code: '', phone: '', timezone: 'America/Sao_Paulo' };

function parseHours(value: unknown): WeeklyOperatingHours {
  const candidate = value as WeeklyOperatingHours | null;
  return candidate && validateWeeklyOperatingHours(candidate).length === 0 ? candidate : emptyWeeklyHours();
}

export default function LocationsTab() {
  const { clinicId, role } = useUserRole();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canManage = role === 'admin';
  const [form, setForm] = useState(emptyForm);
  const [professionalId, setProfessionalId] = useState('');
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [scheduleLocationId, setScheduleLocationId] = useState('');
  const [openingHours, setOpeningHours] = useState<WeeklyOperatingHours>(emptyWeeklyHours());
  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [hideClosedDays, setHideClosedDays] = useState(true);
  const [limitCalendarHours, setLimitCalendarHours] = useState(true);
  const [exceptionDate, setExceptionDate] = useState('');
  const [exceptionReason, setExceptionReason] = useState('');
  const [exceptionClosed, setExceptionClosed] = useState(true);
  const [exceptionPeriods, setExceptionPeriods] = useState<OperatingPeriod[]>([{ start: '08:00', end: '12:00' }]);

  const locationsQuery = useQuery({ queryKey: ['clinic-locations', clinicId], queryFn: async () => {
    const { data, error } = await supabase.from('clinic_locations').select('*').eq('clinic_id', clinicId!).order('is_primary', { ascending: false }).order('name');
    if (error) throw error; return data || [];
  }, enabled: !!clinicId });
  const professionalsQuery = useQuery({ queryKey: ['location-professionals', clinicId], queryFn: async () => {
    const { data, error } = await supabase.from('professionals').select('id,full_name,specialty,professional_locations(location_id,active)').eq('clinic_id', clinicId!).eq('status', 'active').order('full_name');
    if (error) throw error; return data || [];
  }, enabled: !!clinicId });
  const exceptionsQuery = useQuery({ queryKey: ['location-schedule-exceptions', clinicId, scheduleLocationId], queryFn: async () => {
    const { data, error } = await supabase.from('scheduling_exceptions').select('*').eq('clinic_id', clinicId!).eq('location_id', scheduleLocationId).is('professional_id', null).order('exception_date');
    if (error) throw error; return data || [];
  }, enabled: !!clinicId && !!scheduleLocationId });

  useEffect(() => { if (!scheduleLocationId && locationsQuery.data?.[0]) setScheduleLocationId(locationsQuery.data[0].id); }, [locationsQuery.data, scheduleLocationId]);
  useEffect(() => {
    const location = locationsQuery.data?.find((item) => item.id === scheduleLocationId);
    if (!location) return;
    setOpeningHours(parseHours(location.opening_hours));
    setTimezone(location.timezone);
    setHideClosedDays(location.hide_closed_days);
    setLimitCalendarHours(location.limit_calendar_to_operating_hours);
  }, [locationsQuery.data, scheduleLocationId]);

  const createLocation = useMutation({ mutationFn: async () => {
    if (!clinicId || !form.name.trim()) throw new Error('Informe o nome da unidade.');
    const { error } = await supabase.from('clinic_locations').insert({ clinic_id: clinicId, ...form, name: form.name.trim(), state: form.state.toUpperCase().slice(0, 2) });
    if (error) throw error;
  }, onSuccess: async () => { setForm(emptyForm); await queryClient.invalidateQueries({ queryKey: ['clinic-locations'] }); toast({ title: 'Unidade cadastrada' }); }, onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }) });
  const saveLinks = useMutation({ mutationFn: async () => {
    if (!clinicId || !professionalId) throw new Error('Selecione um profissional.');
    const client = supabase.from('professional_locations');
    const { error: deleteError } = await client.delete().eq('clinic_id', clinicId).eq('professional_id', professionalId); if (deleteError) throw deleteError;
    if (selectedLocationIds.length) { const { error } = await client.insert(selectedLocationIds.map((location_id) => ({ clinic_id: clinicId, professional_id: professionalId, location_id }))); if (error) throw error; }
  }, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['location-professionals'] }); toast({ title: 'Unidades do profissional atualizadas' }); }, onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }) });
  const saveSchedule = useMutation({ mutationFn: async () => {
    if (!clinicId || !scheduleLocationId) throw new Error('Selecione uma unidade.');
    const errors = validateWeeklyOperatingHours(openingHours); if (errors.length) throw new Error(errors[0]);
    const { error } = await supabase.from('clinic_locations').update({ opening_hours: openingHours, timezone, hide_closed_days: hideClosedDays, limit_calendar_to_operating_hours: limitCalendarHours }).eq('clinic_id', clinicId).eq('id', scheduleLocationId);
    if (error) throw error;
  }, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['clinic-locations'] }); toast({ title: 'Funcionamento da unidade atualizado' }); }, onError: (error: Error) => toast({ title: 'Não foi possível salvar', description: error.message, variant: 'destructive' }) });
  const createException = useMutation({ mutationFn: async () => {
    if (!clinicId || !scheduleLocationId || !exceptionDate) throw new Error('Informe a data da exceção.');
    if (!exceptionClosed) { const errors = validatePeriods(exceptionPeriods); if (errors.length) throw new Error(errors[0]); }
    const { error: deleteError } = await supabase.from('scheduling_exceptions').delete().eq('clinic_id', clinicId).eq('location_id', scheduleLocationId).eq('exception_date', exceptionDate).is('professional_id', null); if (deleteError) throw deleteError;
    const { error } = await supabase.from('scheduling_exceptions').insert({ clinic_id: clinicId, location_id: scheduleLocationId, professional_id: null, exception_date: exceptionDate, is_closed: exceptionClosed, periods: exceptionClosed ? null : exceptionPeriods, kind: exceptionClosed ? 'holiday' : 'special_hours', reason: exceptionReason.trim() || null }); if (error) throw error;
  }, onSuccess: async () => { setExceptionDate(''); setExceptionReason(''); await queryClient.invalidateQueries({ queryKey: ['location-schedule-exceptions'] }); toast({ title: 'Exceção de funcionamento salva' }); }, onError: (error: Error) => toast({ title: 'Não foi possível salvar', description: error.message, variant: 'destructive' }) });
  const removeException = useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.from('scheduling_exceptions').delete().eq('clinic_id', clinicId!).eq('id', id); if (error) throw error; }, onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['location-schedule-exceptions'] }) });

  const chooseProfessional = (id: string) => { setProfessionalId(id); const professional = professionalsQuery.data?.find((item) => item.id === id); setSelectedLocationIds((professional?.professional_locations || []).filter((link) => link.active).map((link) => link.location_id)); };

  return <div className="space-y-5">
    <div className="grid gap-5 xl:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Unidades</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="space-y-2">{locationsQuery.data?.map((location) => <div key={location.id} className="flex items-start gap-3 rounded-lg border p-3"><MapPin className="mt-0.5 h-4 w-4 text-primary" /><div><p className="font-medium">{location.name}{location.is_primary ? ' · Principal' : ''}</p><p className="text-xs text-muted-foreground">{[location.address_line, location.city, location.state].filter(Boolean).join(' — ') || 'Endereço não informado'}</p><p className="mt-1 text-xs text-muted-foreground">{location.opening_hours ? `Timezone: ${location.timezone}` : 'Horário de funcionamento pendente'}</p></div></div>)}</div>
        {canManage && <div className="space-y-3 rounded-lg border p-4"><p className="text-sm font-semibold">Nova unidade</p><Input placeholder="Nome da unidade" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/><Input placeholder="Endereço" value={form.address_line} onChange={(event) => setForm({ ...form, address_line: event.target.value })}/><div className="grid grid-cols-3 gap-2"><Input placeholder="Cidade" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })}/><Input placeholder="UF" maxLength={2} value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })}/><Input placeholder="CEP" value={form.zip_code} onChange={(event) => setForm({ ...form, zip_code: event.target.value })}/></div><Input placeholder="Telefone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })}/><Button onClick={() => createLocation.mutate()} disabled={createLocation.isPending}><Plus className="mr-2 h-4 w-4"/>Cadastrar unidade</Button></div>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Profissional × unidade</CardTitle></CardHeader><CardContent className="space-y-4"><div><Label>Profissional</Label><Select value={professionalId} onValueChange={chooseProfessional}><SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger><SelectContent>{professionalsQuery.data?.map((professional) => <SelectItem key={professional.id} value={professional.id}>{professional.full_name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2">{locationsQuery.data?.filter((location) => location.active).map((location) => <label key={location.id} className="flex items-center gap-2 rounded-md border p-3"><Checkbox checked={selectedLocationIds.includes(location.id)} onCheckedChange={(checked) => setSelectedLocationIds((ids) => checked ? [...new Set([...ids, location.id])] : ids.filter((id) => id !== location.id))}/>{location.name}</label>)}</div><Button onClick={() => saveLinks.mutate()} disabled={!canManage || !professionalId || saveLinks.isPending}><Save className="mr-2 h-4 w-4"/>Salvar vínculos</Button></CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle>Dias e horários de funcionamento</CardTitle></CardHeader><CardContent className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2"><div><Label htmlFor="schedule-location">Unidade</Label><Select value={scheduleLocationId} onValueChange={setScheduleLocationId}><SelectTrigger id="schedule-location"><SelectValue placeholder="Selecione a unidade" /></SelectTrigger><SelectContent>{locationsQuery.data?.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="location-timezone">Timezone da unidade</Label><Input id="location-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} disabled={!canManage} /></div></div>
      {!locationsQuery.data?.find((item) => item.id === scheduleLocationId)?.opening_hours && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Configure o expediente antes de usar disponibilidade automática ou Aura IA nesta unidade.</div>}
      <WeeklyHoursEditor idPrefix={`location-${scheduleLocationId}`} value={openingHours} onChange={setOpeningHours} disabled={!canManage} />
      <div className="grid gap-3 md:grid-cols-2"><label className="flex items-center gap-2 rounded-lg border p-3"><Checkbox checked={hideClosedDays} onCheckedChange={(checked) => setHideClosedDays(checked === true)} disabled={!canManage} />Ocultar dias sem atendimento na Agenda</label><label className="flex items-center gap-2 rounded-lg border p-3"><Checkbox checked={limitCalendarHours} onCheckedChange={(checked) => setLimitCalendarHours(checked === true)} disabled={!canManage} />Limitar grade ao funcionamento da unidade</label></div>
      <Button onClick={() => saveSchedule.mutate()} disabled={!canManage || !scheduleLocationId || saveSchedule.isPending}><Save className="mr-2 h-4 w-4" />Salvar funcionamento</Button>
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarOff className="h-5 w-5" />Feriados e horários especiais</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[180px_180px_1fr_auto] md:items-end"><div><Label htmlFor="exception-date">Data</Label><Input id="exception-date" type="date" value={exceptionDate} onChange={(event) => setExceptionDate(event.target.value)} /></div><div><Label>Regra</Label><Select value={exceptionClosed ? 'closed' : 'special'} onValueChange={(value) => setExceptionClosed(value === 'closed')}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="closed">Fechado</SelectItem><SelectItem value="special">Horário especial</SelectItem></SelectContent></Select></div><div><Label htmlFor="exception-reason">Motivo</Label><Input id="exception-reason" value={exceptionReason} onChange={(event) => setExceptionReason(event.target.value)} placeholder="Ex.: Natal" /></div><Button onClick={() => createException.mutate()} disabled={!canManage || !scheduleLocationId || createException.isPending}>Salvar exceção</Button></div>
      {!exceptionClosed && <div className="grid max-w-md grid-cols-[1fr_auto_1fr] items-center gap-2"><Input aria-label="Início do horário especial" type="time" value={exceptionPeriods[0].start} onChange={(event) => setExceptionPeriods([{ ...exceptionPeriods[0], start: event.target.value }])} /><span>até</span><Input aria-label="Fim do horário especial" type="time" value={exceptionPeriods[0].end} onChange={(event) => setExceptionPeriods([{ ...exceptionPeriods[0], end: event.target.value }])} /></div>}
      <div className="space-y-2">{exceptionsQuery.data?.map((exception) => <div key={exception.id} className="flex items-center justify-between rounded-lg border p-3"><div><p className="text-sm font-medium">{new Date(`${exception.exception_date}T12:00:00`).toLocaleDateString('pt-BR')} · {exception.is_closed ? 'Fechado' : 'Horário especial'}</p><p className="text-xs text-muted-foreground">{exception.reason || 'Sem observação'}</p></div>{canManage && <Button variant="ghost" size="icon" aria-label="Remover exceção" onClick={() => removeException.mutate(exception.id)}><Trash2 className="h-4 w-4" /></Button>}</div>)}</div>
    </CardContent></Card>
  </div>;
}
