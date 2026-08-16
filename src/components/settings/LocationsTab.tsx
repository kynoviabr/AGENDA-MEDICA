import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, CalendarOff, MapPin, Pencil, Phone, Plus, Save, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import WeeklyHoursEditor from './WeeklyHoursEditor';
import { formatLocationAddress, formatOperatingHoursSummary, hasConfiguredOperatingHours } from './locationSummary';
import {
  emptyWeeklyHours,
  validatePeriods,
  validateWeeklyOperatingHours,
  type OperatingPeriod,
  type WeeklyOperatingHours,
} from '@/scheduling/operatingHours';

type LocationRow = Database['public']['Tables']['clinic_locations']['Row'];

interface LocationForm {
  name: string;
  address_line: string;
  city: string;
  state: string;
  zip_code: string;
  phone: string;
  timezone: string;
  parking_information: string;
  accessibility_information: string;
  opening_hours: WeeklyOperatingHours;
  hide_closed_days: boolean;
  limit_calendar_to_operating_hours: boolean;
}

const emptyLocationForm = (): LocationForm => ({
  name: '', address_line: '', city: '', state: '', zip_code: '', phone: '',
  timezone: 'America/Sao_Paulo', parking_information: '', accessibility_information: '',
  opening_hours: emptyWeeklyHours(), hide_closed_days: true, limit_calendar_to_operating_hours: true,
});

function parseHours(value: unknown): WeeklyOperatingHours {
  const candidate = value as WeeklyOperatingHours | null;
  return candidate && validateWeeklyOperatingHours(candidate).length === 0 ? candidate : emptyWeeklyHours();
}

function formFromLocation(location: LocationRow): LocationForm {
  return {
    name: location.name,
    address_line: location.address_line || '',
    city: location.city || '',
    state: location.state || '',
    zip_code: location.zip_code || '',
    phone: location.phone || '',
    timezone: location.timezone,
    parking_information: location.parking_information || '',
    accessibility_information: location.accessibility_information || '',
    opening_hours: parseHours(location.opening_hours),
    hide_closed_days: location.hide_closed_days,
    limit_calendar_to_operating_hours: location.limit_calendar_to_operating_hours,
  };
}

export default function LocationsTab() {
  const { clinicId, role } = useUserRole();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canManage = role === 'admin';
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [form, setForm] = useState<LocationForm>(emptyLocationForm());
  const [professionalId, setProfessionalId] = useState('');
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [exceptionDate, setExceptionDate] = useState('');
  const [exceptionReason, setExceptionReason] = useState('');
  const [exceptionClosed, setExceptionClosed] = useState(true);
  const [exceptionPeriods, setExceptionPeriods] = useState<OperatingPeriod[]>([{ start: '08:00', end: '12:00' }]);

  const locationsQuery = useQuery({
    queryKey: ['clinic-locations', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('clinic_locations').select('*')
        .eq('clinic_id', clinicId!).order('is_primary', { ascending: false }).order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });
  const professionalsQuery = useQuery({
    queryKey: ['location-professionals', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('professionals')
        .select('id,full_name,specialty,professional_locations(location_id,active)')
        .eq('clinic_id', clinicId!).eq('status', 'active').order('full_name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });
  const exceptionsQuery = useQuery({
    queryKey: ['location-schedule-exceptions', clinicId, editingLocationId],
    queryFn: async () => {
      const { data, error } = await supabase.from('scheduling_exceptions').select('*')
        .eq('clinic_id', clinicId!).eq('location_id', editingLocationId!).is('professional_id', null)
        .order('exception_date');
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId && !!editingLocationId && editorOpen,
  });

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingLocationId(null);
    setForm(emptyLocationForm());
    setExceptionDate('');
    setExceptionReason('');
    setExceptionClosed(true);
  };
  const openCreate = () => {
    setEditingLocationId(null);
    setForm(emptyLocationForm());
    setEditorOpen(true);
  };
  const openEdit = (location: LocationRow) => {
    setEditingLocationId(location.id);
    setForm(formFromLocation(location));
    setEditorOpen(true);
  };

  const saveLocation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !form.name.trim()) throw new Error('Informe o nome da unidade.');
      const scheduleErrors = validateWeeklyOperatingHours(form.opening_hours);
      if (scheduleErrors.length) throw new Error(scheduleErrors[0]);
      if (!hasConfiguredOperatingHours(form.opening_hours)) throw new Error('Configure pelo menos um dia e horário de funcionamento.');
      const payload = {
        name: form.name.trim(), address_line: form.address_line.trim() || null,
        city: form.city.trim() || null, state: form.state.trim().toUpperCase().slice(0, 2) || null,
        zip_code: form.zip_code.trim() || null, phone: form.phone.trim() || null,
        timezone: form.timezone.trim(), parking_information: form.parking_information.trim() || null,
        accessibility_information: form.accessibility_information.trim() || null,
        opening_hours: form.opening_hours,
        hide_closed_days: form.hide_closed_days,
        limit_calendar_to_operating_hours: form.limit_calendar_to_operating_hours,
      };
      if (editingLocationId) {
        const { error } = await supabase.from('clinic_locations').update(payload)
          .eq('clinic_id', clinicId).eq('id', editingLocationId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clinic_locations').insert({ clinic_id: clinicId, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['clinic-locations'] });
      toast({ title: editingLocationId ? 'Unidade atualizada' : 'Unidade cadastrada' });
      closeEditor();
    },
    onError: (error: Error) => toast({ title: 'Não foi possível salvar', description: error.message, variant: 'destructive' }),
  });

  const saveLinks = useMutation({
    mutationFn: async () => {
      if (!clinicId || !professionalId) throw new Error('Selecione um profissional.');
      const client = supabase.from('professional_locations');
      const { error: deleteError } = await client.delete().eq('clinic_id', clinicId).eq('professional_id', professionalId);
      if (deleteError) throw deleteError;
      if (selectedLocationIds.length) {
        const { error } = await client.insert(selectedLocationIds.map((location_id) => ({ clinic_id: clinicId, professional_id: professionalId, location_id })));
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['location-professionals'] });
      toast({ title: 'Unidades do profissional atualizadas' });
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const createException = useMutation({
    mutationFn: async () => {
      if (!clinicId || !editingLocationId || !exceptionDate) throw new Error('Informe a data da exceção.');
      if (!exceptionClosed) {
        const errors = validatePeriods(exceptionPeriods);
        if (errors.length) throw new Error(errors[0]);
      }
      const baseQuery = supabase.from('scheduling_exceptions');
      const { error: deleteError } = await baseQuery.delete().eq('clinic_id', clinicId)
        .eq('location_id', editingLocationId).eq('exception_date', exceptionDate).is('professional_id', null);
      if (deleteError) throw deleteError;
      const { error } = await baseQuery.insert({
        clinic_id: clinicId, location_id: editingLocationId, professional_id: null,
        exception_date: exceptionDate, is_closed: exceptionClosed,
        periods: exceptionClosed ? null : exceptionPeriods,
        kind: exceptionClosed ? 'holiday' : 'special_hours', reason: exceptionReason.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setExceptionDate('');
      setExceptionReason('');
      await queryClient.invalidateQueries({ queryKey: ['location-schedule-exceptions'] });
      toast({ title: 'Exceção de funcionamento salva' });
    },
    onError: (error: Error) => toast({ title: 'Não foi possível salvar', description: error.message, variant: 'destructive' }),
  });
  const removeException = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('scheduling_exceptions').delete().eq('clinic_id', clinicId!).eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['location-schedule-exceptions'] }),
  });

  const chooseProfessional = (id: string) => {
    setProfessionalId(id);
    const professional = professionalsQuery.data?.find((item) => item.id === id);
    setSelectedLocationIds((professional?.professional_locations || [])
      .filter((link) => link.active).map((link) => link.location_id));
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Unidades</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Endereços, contatos locais, horários e vínculos dos profissionais.</p>
        </div>
        {canManage && <Button type="button" onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Adicionar unidade</Button>}
      </CardHeader>
      <CardContent className="space-y-6">
        {locationsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando unidades...</p>
        ) : locationsQuery.data?.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {locationsQuery.data.map((location) => (
              <div key={location.id} className="flex min-w-0 flex-col justify-between gap-4 rounded-xl border p-4">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{location.name}</p>
                    {location.is_primary && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Principal</span>}
                    {!location.active && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Inativa</span>}
                  </div>
                  <p className="flex items-start gap-2 text-sm text-muted-foreground"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{formatLocationAddress(location)}</p>
                  <p className="text-sm text-muted-foreground">{formatOperatingHoursSummary(location.opening_hours)}</p>
                  {location.phone && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Phone className="h-4 w-4" />{location.phone}</p>}
                  {!hasConfiguredOperatingHours(location.opening_hours) && <p className="text-xs font-medium text-amber-700">Horários pendentes — disponibilidade automática bloqueada.</p>}
                </div>
                <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => openEdit(location)} disabled={!canManage}>
                  <Pencil className="mr-2 h-4 w-4" />Editar unidade
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <p className="font-medium">Nenhuma unidade cadastrada.</p>
            <p className="mt-1 text-sm text-muted-foreground">Cadastre pelo menos uma unidade para configurar endereço, horários e agenda.</p>
            {canManage && <Button type="button" className="mt-4" onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Adicionar unidade</Button>}
          </div>
        )}

        <div className="border-t pt-5">
          <h3 className="font-semibold">Profissional × unidade</h3>
          <p className="mt-1 text-sm text-muted-foreground">Defina em quais unidades cada profissional realiza atendimentos.</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(220px,320px)_1fr_auto] lg:items-end">
            <div><Label>Profissional</Label><Select value={professionalId} onValueChange={chooseProfessional}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{professionalsQuery.data?.map((professional) => <SelectItem key={professional.id} value={professional.id}>{professional.full_name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-2 sm:grid-cols-2">{locationsQuery.data?.filter((location) => location.active).map((location) => <label key={location.id} className="flex items-center gap-2 rounded-md border p-3"><Checkbox checked={selectedLocationIds.includes(location.id)} onCheckedChange={(checked) => setSelectedLocationIds((ids) => checked ? [...new Set([...ids, location.id])] : ids.filter((id) => id !== location.id))} disabled={!canManage || !professionalId} />{location.name}</label>)}</div>
            <Button type="button" onClick={() => saveLinks.mutate()} disabled={!canManage || !professionalId || saveLinks.isPending}><Save className="mr-2 h-4 w-4" />Salvar vínculos</Button>
          </div>
        </div>
      </CardContent>

      <Dialog open={editorOpen} onOpenChange={(open) => open ? setEditorOpen(true) : closeEditor()}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLocationId ? 'Editar unidade' : 'Adicionar unidade'}</DialogTitle>
            <DialogDescription>Endereço, contato local, acessibilidade e funcionamento desta unidade.</DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <section className="space-y-4">
              <h3 className="font-semibold">Dados da unidade</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="location-name">Nome da unidade</Label><Input id="location-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="location-phone">Telefone da unidade</Label><Input id="location-phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></div>
                <div className="space-y-2 md:col-span-2"><Label htmlFor="location-address">Endereço</Label><Input id="location-address" value={form.address_line} onChange={(event) => setForm({ ...form, address_line: event.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="location-zip">CEP</Label><Input id="location-zip" value={form.zip_code} onChange={(event) => setForm({ ...form, zip_code: event.target.value })} /></div>
                <div className="grid grid-cols-[1fr_90px] gap-3"><div className="space-y-2"><Label htmlFor="location-city">Cidade</Label><Input id="location-city" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="location-state">UF</Label><Input id="location-state" maxLength={2} value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} /></div></div>
                <div className="space-y-2 md:col-span-2"><Label htmlFor="location-timezone">Timezone da unidade</Label><Input id="location-timezone" value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="location-parking">Estacionamento</Label><Textarea id="location-parking" value={form.parking_information} onChange={(event) => setForm({ ...form, parking_information: event.target.value })} placeholder="Informações administrativas sobre estacionamento" /></div>
                <div className="space-y-2"><Label htmlFor="location-accessibility">Acessibilidade</Label><Textarea id="location-accessibility" value={form.accessibility_information} onChange={(event) => setForm({ ...form, accessibility_information: event.target.value })} placeholder="Informações administrativas sobre acessibilidade" /></div>
              </div>
            </section>

            <section className="space-y-4 border-t pt-5">
              <div><h3 className="font-semibold">Dias e horários de funcionamento</h3><p className="text-sm text-muted-foreground">Os horários pertencem ao timezone desta unidade.</p></div>
              <WeeklyHoursEditor idPrefix={`location-${editingLocationId || 'new'}`} value={form.opening_hours} onChange={(opening_hours) => setForm({ ...form, opening_hours })} />
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 rounded-lg border p-3"><Checkbox checked={form.hide_closed_days} onCheckedChange={(checked) => setForm({ ...form, hide_closed_days: checked === true })} />Ocultar dias sem atendimento na Agenda</label>
                <label className="flex items-center gap-2 rounded-lg border p-3"><Checkbox checked={form.limit_calendar_to_operating_hours} onCheckedChange={(checked) => setForm({ ...form, limit_calendar_to_operating_hours: checked === true })} />Limitar grade ao funcionamento da unidade</label>
              </div>
            </section>

            {editingLocationId && <section className="space-y-4 border-t pt-5">
              <div><h3 className="flex items-center gap-2 font-semibold"><CalendarOff className="h-4 w-4" />Feriados e horários especiais</h3><p className="text-sm text-muted-foreground">Exceções específicas desta unidade e data.</p></div>
              <div className="grid gap-3 md:grid-cols-[170px_170px_1fr_auto] md:items-end">
                <div><Label htmlFor="exception-date">Data</Label><Input id="exception-date" type="date" value={exceptionDate} onChange={(event) => setExceptionDate(event.target.value)} /></div>
                <div><Label>Regra</Label><Select value={exceptionClosed ? 'closed' : 'special'} onValueChange={(value) => setExceptionClosed(value === 'closed')}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="closed">Fechado</SelectItem><SelectItem value="special">Horário especial</SelectItem></SelectContent></Select></div>
                <div><Label htmlFor="exception-reason">Motivo</Label><Input id="exception-reason" value={exceptionReason} onChange={(event) => setExceptionReason(event.target.value)} placeholder="Ex.: Natal" /></div>
                <Button type="button" variant="outline" onClick={() => createException.mutate()} disabled={!exceptionDate || createException.isPending}>Salvar exceção</Button>
              </div>
              {!exceptionClosed && <div className="grid max-w-md grid-cols-[1fr_auto_1fr] items-center gap-2"><Input aria-label="Início do horário especial" type="time" value={exceptionPeriods[0].start} onChange={(event) => setExceptionPeriods([{ ...exceptionPeriods[0], start: event.target.value }])} /><span>até</span><Input aria-label="Fim do horário especial" type="time" value={exceptionPeriods[0].end} onChange={(event) => setExceptionPeriods([{ ...exceptionPeriods[0], end: event.target.value }])} /></div>}
              <div className="space-y-2">{exceptionsQuery.data?.map((exception) => <div key={exception.id} className="flex items-center justify-between rounded-lg border p-3"><div><p className="text-sm font-medium">{new Date(`${exception.exception_date}T12:00:00`).toLocaleDateString('pt-BR')} · {exception.is_closed ? 'Fechado' : 'Horário especial'}</p><p className="text-xs text-muted-foreground">{exception.reason || 'Sem observação'}</p></div><Button type="button" variant="ghost" size="icon" aria-label="Remover exceção" onClick={() => removeException.mutate(exception.id)}><Trash2 className="h-4 w-4" /></Button></div>)}</div>
            </section>}

            <div className="flex justify-end gap-3 border-t pt-5">
              <Button type="button" variant="outline" onClick={closeEditor}>Cancelar</Button>
              <Button type="button" onClick={() => saveLocation.mutate()} disabled={saveLocation.isPending}><Save className="mr-2 h-4 w-4" />{saveLocation.isPending ? 'Salvando...' : 'Salvar unidade'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
