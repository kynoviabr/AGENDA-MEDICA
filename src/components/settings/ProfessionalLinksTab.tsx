import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, CalendarClock, Loader2, Save, ShieldCheck, Stethoscope, UserRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import WeeklyHoursEditor from './WeeklyHoursEditor';
import { describeLocationDependencies, type LocationDependencyCounts } from './professionalLocationLinks';
import { availabilityRowsToWeeklyHours, getActiveLinkChanges, weeklyHoursToAvailabilityRows } from './professionalLinksModel';
import { emptyWeeklyHours, validateWeeklyOperatingHours, type WeeklyOperatingHours } from '@/scheduling/operatingHours';

interface ProfessionalOption { id: string; full_name: string; specialty: string | null; status: string; private_consultation_price: number | null }
interface LocationOption { id: string; name: string; is_primary: boolean; active: boolean }
interface ServiceOption { id: string; name: string; is_active: boolean }
interface InsuranceOption { id: string; name: string; status: string }
interface LocationLink { location_id: string; professional_id: string; active: boolean }
interface ServiceLink { treatment_id: string; professional_id: string; status: string }
interface InsuranceLink { health_insurance_id: string; professional_id: string; status: string }
interface AvailabilityRow { location_id: string | null; professional_id: string; day_of_week: number; start_time: string; end_time: string }
interface ProfessionalSetting { professional_id: string; private_appointment_duration_minutes: number }

interface ProfessionalLinksTabProps { initialProfessionalId?: string }

export default function ProfessionalLinksTab({ initialProfessionalId }: ProfessionalLinksTabProps) {
  const { clinicId, role } = useUserRole();
  const { toast } = useToast();
  const canEdit = role === 'admin';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [professionals, setProfessionals] = useState<ProfessionalOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [insurances, setInsurances] = useState<InsuranceOption[]>([]);
  const [locationLinks, setLocationLinks] = useState<LocationLink[]>([]);
  const [serviceLinks, setServiceLinks] = useState<ServiceLink[]>([]);
  const [insuranceLinks, setInsuranceLinks] = useState<InsuranceLink[]>([]);
  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [professionalSettings, setProfessionalSettings] = useState<ProfessionalSetting[]>([]);
  const [selectedProfessionalId, setSelectedProfessionalId] = useState('');
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedInsuranceIds, setSelectedInsuranceIds] = useState<string[]>([]);
  const [privatePrice, setPrivatePrice] = useState('');
  const [privateDuration, setPrivateDuration] = useState('60');
  const [hoursByLocation, setHoursByLocation] = useState<Record<string, WeeklyOperatingHours>>({});
  const [dirty, setDirty] = useState(false);

  const loadData = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    const results = await Promise.all([
      supabase.from('professionals').select('id,full_name,specialty,status,private_consultation_price').eq('clinic_id', clinicId).order('full_name'),
      supabase.from('clinic_locations').select('id,name,is_primary,active').eq('clinic_id', clinicId).order('is_primary', { ascending: false }).order('name'),
      supabase.from('treatments').select('id,name,is_active').eq('clinic_id', clinicId).order('name'),
      supabase.from('health_insurances').select('id,name,status').eq('clinic_id', clinicId).order('name'),
      supabase.from('professional_locations').select('professional_id,location_id,active').eq('clinic_id', clinicId),
      supabase.from('professional_treatments').select('professional_id,treatment_id,status').eq('clinic_id', clinicId),
      supabase.from('professional_health_insurances').select('professional_id,health_insurance_id,status').eq('clinic_id', clinicId),
      supabase.from('professional_availability').select('professional_id,location_id,day_of_week,start_time,end_time').eq('clinic_id', clinicId).eq('is_active', true),
      supabase.from('professional_settings').select('professional_id,private_appointment_duration_minutes').eq('clinic_id', clinicId),
    ]);
    const error = results.find((result) => result.error)?.error;
    if (error) {
      toast({ title: 'Não foi possível carregar os vínculos', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }
    setProfessionals((results[0].data || []) as ProfessionalOption[]);
    setLocations((results[1].data || []) as LocationOption[]);
    setServices((results[2].data || []) as ServiceOption[]);
    setInsurances((results[3].data || []) as InsuranceOption[]);
    setLocationLinks((results[4].data || []) as LocationLink[]);
    setServiceLinks((results[5].data || []) as ServiceLink[]);
    setInsuranceLinks((results[6].data || []) as InsuranceLink[]);
    setAvailability((results[7].data || []) as AvailabilityRow[]);
    setProfessionalSettings((results[8].data || []) as ProfessionalSetting[]);
    setLoading(false);
  }, [clinicId, toast]);

  useEffect(() => { void loadData(); }, [loadData]);

  const populateDraft = useCallback((professionalId: string) => {
    const professional = professionals.find((item) => item.id === professionalId);
    const nextLocationIds = locationLinks.filter((item) => item.professional_id === professionalId && item.active).map((item) => item.location_id);
    setSelectedProfessionalId(professionalId);
    setSelectedLocationIds(nextLocationIds);
    setSelectedServiceIds(serviceLinks.filter((item) => item.professional_id === professionalId && item.status === 'active').map((item) => item.treatment_id));
    setSelectedInsuranceIds(insuranceLinks.filter((item) => item.professional_id === professionalId && item.status === 'active').map((item) => item.health_insurance_id));
    setPrivatePrice(professional?.private_consultation_price == null ? '' : String(professional.private_consultation_price));
    setPrivateDuration(String(professionalSettings.find((item) => item.professional_id === professionalId)?.private_appointment_duration_minutes || 60));
    setHoursByLocation(Object.fromEntries(nextLocationIds.map((locationId) => [
      locationId,
      availabilityRowsToWeeklyHours(availability.filter((item) => item.professional_id === professionalId && item.location_id === locationId)),
    ])));
    setDirty(false);
  }, [availability, insuranceLinks, locationLinks, professionalSettings, professionals, serviceLinks]);

  useEffect(() => {
    if (!loading && initialProfessionalId && professionals.some((item) => item.id === initialProfessionalId) && !selectedProfessionalId) {
      populateDraft(initialProfessionalId);
    }
  }, [initialProfessionalId, loading, populateDraft, professionals, selectedProfessionalId]);

  const selectProfessional = (professionalId: string) => {
    if (dirty && !window.confirm('Existem alterações não salvas. Deseja descartá-las e trocar de profissional?')) return;
    populateDraft(professionalId);
  };

  const toggleId = (id: string, values: string[], setter: (next: string[]) => void) => {
    setter(values.includes(id) ? values.filter((item) => item !== id) : [...values, id]);
    setDirty(true);
  };

  const getLocationDependencies = async (professionalId: string, locationId: string): Promise<LocationDependencyCounts> => {
    if (!clinicId) throw new Error('Clínica não identificada.');
    const nowIso = new Date().toISOString();
    const today = nowIso.slice(0, 10);
    const results = await Promise.all([
      supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId).eq('professional_id', professionalId).eq('location_id', locationId).gte('start_time', nowIso).in('status', ['scheduled', 'confirmed', 'in_progress']),
      supabase.from('professional_availability').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId).eq('professional_id', professionalId).eq('location_id', locationId).eq('is_active', true),
      supabase.from('appointment_blocks').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId).eq('professional_id', professionalId).eq('location_id', locationId).gte('end_at', nowIso),
      supabase.from('scheduling_exceptions').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId).eq('professional_id', professionalId).eq('location_id', locationId).gte('exception_date', today),
    ]);
    const error = results.find((result) => result.error)?.error;
    if (error) throw new Error('Não foi possível validar as dependências da unidade. Nenhum vínculo foi removido.');
    return {
      futureAppointments: results[0].count || 0,
      activeAvailability: results[1].count || 0,
      futureBlocks: results[2].count || 0,
      futureExceptions: results[3].count || 0,
    };
  };

  const saveLinks = async () => {
    if (!clinicId || !selectedProfessionalId || !canEdit) return;
    const parsedPrice = privatePrice.trim() === '' ? null : Number(privatePrice.replace(',', '.'));
    const parsedDuration = Number(privateDuration);
    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      toast({ title: 'Valor particular inválido', variant: 'destructive' }); return;
    }
    if (!Number.isInteger(parsedDuration) || parsedDuration < 5 || parsedDuration > 480) {
      toast({ title: 'Duração particular inválida', description: 'Informe de 5 a 480 minutos.', variant: 'destructive' }); return;
    }
    for (const locationId of selectedLocationIds) {
      const errors = validateWeeklyOperatingHours(hoursByLocation[locationId] || emptyWeeklyHours());
      if (errors.length > 0) { toast({ title: 'Horário inválido', description: errors[0], variant: 'destructive' }); return; }
    }

    setSaving(true);
    try {
      const locationChanges = getActiveLinkChanges(
        locationLinks.filter((item) => item.professional_id === selectedProfessionalId).map((item) => ({ targetId: item.location_id, active: item.active })),
        selectedLocationIds,
      );
      const serviceChanges = getActiveLinkChanges(
        serviceLinks.filter((item) => item.professional_id === selectedProfessionalId).map((item) => ({ targetId: item.treatment_id, active: item.status === 'active' })),
        selectedServiceIds,
      );
      const insuranceChanges = getActiveLinkChanges(
        insuranceLinks.filter((item) => item.professional_id === selectedProfessionalId).map((item) => ({ targetId: item.health_insurance_id, active: item.status === 'active' })),
        selectedInsuranceIds,
      );

      for (const locationId of locationChanges.deactivate) {
        const dependencies = describeLocationDependencies(await getLocationDependencies(selectedProfessionalId, locationId));
        if (dependencies.length > 0) {
          const locationName = locations.find((item) => item.id === locationId)?.name || 'Unidade';
          throw new Error(`Não é possível remover ${locationName}: existem ${dependencies.join(', ')}.`);
        }
      }
      for (const treatmentId of serviceChanges.deactivate) {
        const { count, error } = await supabase.from('appointments').select('id', { count: 'exact', head: true })
          .eq('clinic_id', clinicId).eq('professional_id', selectedProfessionalId).eq('treatment_id', treatmentId)
          .gte('start_time', new Date().toISOString()).in('status', ['scheduled', 'confirmed', 'in_progress']);
        if (error) throw new Error('Não foi possível validar agendamentos futuros do serviço.');
        if ((count || 0) > 0) throw new Error('Não é possível remover um serviço com agendamentos futuros para este profissional.');
      }

      if (locationChanges.activate.length) {
        const { error } = await supabase.from('professional_locations').upsert(locationChanges.activate.map((locationId) => ({ clinic_id: clinicId, professional_id: selectedProfessionalId, location_id: locationId, active: true })), { onConflict: 'professional_id,location_id' });
        if (error) throw error;
      }
      if (serviceChanges.activate.length) {
        const { error } = await supabase.from('professional_treatments').upsert(serviceChanges.activate.map((treatmentId) => ({ clinic_id: clinicId, professional_id: selectedProfessionalId, treatment_id: treatmentId, status: 'active' })), { onConflict: 'professional_id,treatment_id' });
        if (error) throw error;
      }
      if (insuranceChanges.activate.length) {
        const { error } = await supabase.from('professional_health_insurances').upsert(insuranceChanges.activate.map((healthInsuranceId) => ({ clinic_id: clinicId, professional_id: selectedProfessionalId, health_insurance_id: healthInsuranceId, status: 'active' })), { onConflict: 'health_insurance_id,professional_id' });
        if (error) throw error;
      }
      if (serviceChanges.deactivate.length) {
        const { error } = await supabase.from('professional_treatments').update({ status: 'inactive' }).eq('clinic_id', clinicId).eq('professional_id', selectedProfessionalId).in('treatment_id', serviceChanges.deactivate);
        if (error) throw error;
      }
      if (insuranceChanges.deactivate.length) {
        const { error } = await supabase.from('professional_health_insurances').update({ status: 'inactive' }).eq('clinic_id', clinicId).eq('professional_id', selectedProfessionalId).in('health_insurance_id', insuranceChanges.deactivate);
        if (error) throw error;
      }

      const { error: professionalError } = await supabase.from('professionals').update({ private_consultation_price: parsedPrice }).eq('id', selectedProfessionalId).eq('clinic_id', clinicId);
      if (professionalError) throw professionalError;
      const { error: settingsError } = await supabase.from('professional_settings').upsert({ clinic_id: clinicId, professional_id: selectedProfessionalId, private_appointment_duration_minutes: parsedDuration }, { onConflict: 'professional_id' });
      if (settingsError) throw settingsError;

      for (const locationId of selectedLocationIds) {
        const { error: deleteError } = await supabase.from('professional_availability').delete().eq('clinic_id', clinicId).eq('professional_id', selectedProfessionalId).eq('location_id', locationId);
        if (deleteError) throw deleteError;
        const rows = weeklyHoursToAvailabilityRows(hoursByLocation[locationId] || emptyWeeklyHours(), clinicId, selectedProfessionalId, locationId);
        if (rows.length) {
          const { error: insertError } = await supabase.from('professional_availability').insert(rows);
          if (insertError) throw insertError;
        }
      }
      if (locationChanges.deactivate.length) {
        const { error } = await supabase.from('professional_locations').update({ active: false }).eq('clinic_id', clinicId).eq('professional_id', selectedProfessionalId).in('location_id', locationChanges.deactivate);
        if (error) throw error;
      }

      await loadData();
      setDirty(false);
      toast({ title: 'Vínculos salvos', description: 'Relações e horários padrão foram atualizados.' });
    } catch (error) {
      toast({ title: 'Não foi possível salvar todos os vínculos', description: error instanceof Error ? error.message : 'Revise os dados e tente novamente.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const selectedProfessional = professionals.find((item) => item.id === selectedProfessionalId);
  const selectedLocations = useMemo(() => locations.filter((item) => selectedLocationIds.includes(item.id)), [locations, selectedLocationIds]);
  const markHours = (locationId: string, value: WeeklyOperatingHours) => { setHoursByLocation((current) => ({ ...current, [locationId]: value })); setDirty(true); };

  if (loading) return <p className="text-sm text-muted-foreground">Carregando vínculos...</p>;
  if (professionals.length === 0) return <Card><CardContent className="py-12 text-center"><UserRound className="mx-auto mb-3 h-10 w-10 text-muted-foreground" /><p className="font-medium">Nenhum profissional cadastrado</p><p className="text-sm text-muted-foreground">Cadastre um profissional antes de configurar vínculos.</p></CardContent></Card>;

  return (
    <div className="space-y-5">
      <div><h2 className="text-lg font-semibold">Vínculos</h2><p className="text-sm text-muted-foreground">Configure como cada profissional se relaciona com a estrutura da clínica.</p></div>
      <div className="max-w-xl space-y-2"><Label>Profissional</Label><Select value={selectedProfessionalId} onValueChange={selectProfessional}><SelectTrigger><SelectValue placeholder="Selecione o profissional" /></SelectTrigger><SelectContent>{professionals.map((professional) => <SelectItem key={professional.id} value={professional.id}>{professional.full_name}{professional.specialty ? ` — ${professional.specialty}` : ''}{professional.status !== 'active' ? ' (Inativo)' : ''}</SelectItem>)}</SelectContent></Select></div>

      {selectedProfessional && <>
        {selectedProfessional.status !== 'active' && <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><AlertTriangle className="h-4 w-4" />Este profissional está inativo. Os vínculos permanecem visíveis para manutenção.</div>}
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4 text-primary" />1. Unidades de atendimento</CardTitle></CardHeader><CardContent className="space-y-2">
          {locations.length === 0 ? <p className="text-sm text-muted-foreground">Cadastre uma unidade em Geral.</p> : locations.map((location) => {
            const checked = selectedLocationIds.includes(location.id); const cannotAdd = !location.active && !checked;
            return <label key={location.id} className={`flex items-center gap-3 rounded-md border p-3 ${cannotAdd ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-muted/40'}`}><Checkbox checked={checked} disabled={!canEdit || cannotAdd || saving} onCheckedChange={() => toggleId(location.id, selectedLocationIds, setSelectedLocationIds)} /><span className="flex-1 text-sm font-medium">{location.name}</span>{location.is_primary && <Badge variant="secondary">Principal</Badge>}{!location.active && <Badge variant="outline">Inativa</Badge>}</label>;
          })}
        </CardContent></Card>

        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Stethoscope className="h-4 w-4 text-primary" />2. Serviços realizados</CardTitle></CardHeader><CardContent className="space-y-2">
          {services.length === 0 ? <p className="text-sm text-muted-foreground">Cadastre serviços antes de vincular.</p> : services.map((service) => {
            const checked = selectedServiceIds.includes(service.id); const cannotAdd = !service.is_active && !checked;
            return <label key={service.id} className={`flex items-center gap-3 rounded-md border p-3 ${cannotAdd ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-muted/40'}`}><Checkbox checked={checked} disabled={!canEdit || cannotAdd || saving} onCheckedChange={() => toggleId(service.id, selectedServiceIds, setSelectedServiceIds)} /><span className="flex-1 text-sm font-medium">{service.name}</span>{!service.is_active && <Badge variant="outline">Inativo</Badge>}</label>;
          })}
        </CardContent></Card>

        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" />3. Convênios atendidos</CardTitle></CardHeader><CardContent className="space-y-2">
          {insurances.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum convênio cadastrado. O atendimento particular continua disponível.</p> : insurances.map((insurance) => {
            const checked = selectedInsuranceIds.includes(insurance.id); const cannotAdd = insurance.status !== 'active' && !checked;
            return <label key={insurance.id} className={`flex items-center gap-3 rounded-md border p-3 ${cannotAdd ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-muted/40'}`}><Checkbox checked={checked} disabled={!canEdit || cannotAdd || saving} onCheckedChange={() => toggleId(insurance.id, selectedInsuranceIds, setSelectedInsuranceIds)} /><span className="flex-1 text-sm font-medium">{insurance.name}</span>{insurance.status !== 'active' && <Badge variant="outline">Inativo</Badge>}</label>;
          })}
        </CardContent></Card>

        <Card><CardHeader><CardTitle className="text-base">4. Atendimento particular</CardTitle></CardHeader><CardContent className="space-y-4">
          <label className="flex items-center gap-3 rounded-md border p-3"><Checkbox checked disabled /><span><span className="block text-sm font-medium">Atendimento particular</span><span className="block text-xs text-muted-foreground">Modalidade nativa do sistema; não existe um segundo vínculo para ativar.</span></span></label>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="links-private-price">Valor da consulta</Label><Input id="links-private-price" inputMode="decimal" value={privatePrice} onChange={(event) => { setPrivatePrice(event.target.value); setDirty(true); }} disabled={!canEdit || saving} placeholder="0,00" /></div><div className="space-y-2"><Label htmlFor="links-private-duration">Duração (minutos)</Label><Input id="links-private-duration" type="number" min="5" max="480" step="5" value={privateDuration} onChange={(event) => { setPrivateDuration(event.target.value); setDirty(true); }} disabled={!canEdit || saving} /></div></div>
        </CardContent></Card>

        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4 text-primary" />5. Horário padrão de trabalho</CardTitle><p className="text-sm text-muted-foreground">Configure separadamente cada unidade vinculada. Exceções continuam na Agenda.</p></CardHeader><CardContent className="space-y-5">
          {selectedLocations.length === 0 ? <p className="text-sm text-muted-foreground">Vincule ao menos uma unidade para configurar horários.</p> : selectedLocations.map((location) => <section key={location.id} className="space-y-3 rounded-lg border p-4"><div className="flex items-center gap-2"><h3 className="font-semibold">{location.name}</h3>{!location.active && <Badge variant="outline">Inativa</Badge>}</div><WeeklyHoursEditor idPrefix={`links-${selectedProfessionalId}-${location.id}`} value={hoursByLocation[location.id] || emptyWeeklyHours()} onChange={(value) => markHours(location.id, value)} disabled={!canEdit || saving} /></section>)}
        </CardContent></Card>

        <div className="sticky bottom-3 flex items-center justify-end gap-3 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur"><span className="mr-auto text-xs text-muted-foreground">{dirty ? 'Alterações não salvas' : 'Vínculos sincronizados'}</span><Button onClick={() => void saveLinks()} disabled={!canEdit || saving || !dirty}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{saving ? 'Salvando...' : 'Salvar vínculos'}</Button></div>
      </>}
    </div>
  );
}
