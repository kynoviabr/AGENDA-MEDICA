import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeDollarSign, CalendarClock, Link2, Save, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import HealthInsurancesPage from '@/pages/clinic/HealthInsurancesPage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type Section = 'insurances' | 'private-prices' | 'links' | 'durations';

const sections = [
  { id: 'insurances' as const, label: 'Cadastro de convênios', icon: ShieldCheck },
  { id: 'private-prices' as const, label: 'Consulta particular', icon: BadgeDollarSign },
  { id: 'links' as const, label: 'Profissional × convênio', icon: Link2 },
  { id: 'durations' as const, label: 'Duração das consultas', icon: CalendarClock },
];

export default function HealthcareSettingsTab() {
  const { clinicId } = useUserRole();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [section, setSection] = useState<Section>('insurances');
  const [selectedProfessionalId, setSelectedProfessionalId] = useState('');
  const [selectedInsuranceIds, setSelectedInsuranceIds] = useState<string[]>([]);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [durationDrafts, setDurationDrafts] = useState<Record<string, string>>({});

  const { data: professionals = [], isLoading: loadingProfessionals } = useQuery({
    queryKey: ['healthcare-settings-professionals', clinicId],
    queryFn: async () => {
      if (!clinicId) return [];
      const { data, error } = await supabase
        .from('professionals')
        .select('id, full_name, specialty, private_consultation_price')
        .eq('clinic_id', clinicId)
        .eq('status', 'active')
        .order('full_name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: insurances = [], isLoading: loadingInsurances } = useQuery({
    queryKey: ['healthcare-settings-insurances', clinicId],
    queryFn: async () => {
      if (!clinicId) return [];
      const { data, error } = await supabase
        .from('health_insurances')
        .select('id, name, status, professional_health_insurances(professional_id, status)')
        .eq('clinic_id', clinicId)
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const priceMutation = useMutation({
    mutationFn: async ({ professionalId, rawValue }: { professionalId: string; rawValue: string }) => {
      if (!clinicId) throw new Error('Clínica não identificada');
      const normalized = rawValue.trim().replace(',', '.');
      const price = normalized === '' ? null : Number(normalized);
      if (price !== null && (!Number.isFinite(price) || price < 0)) throw new Error('Informe um valor válido');
      const { error } = await supabase.from('professionals').update({ private_consultation_price: price }).eq('id', professionalId).eq('clinic_id', clinicId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['healthcare-settings-professionals'] });
      toast({ title: 'Valor da consulta atualizado' });
    },
    onError: (error: Error) => toast({ title: 'Não foi possível salvar', description: error.message, variant: 'destructive' }),
  });

  const linksMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !selectedProfessionalId) throw new Error('Selecione um profissional');
      if (selectedInsuranceIds.length) {
        const { error } = await supabase.from('professional_health_insurances').upsert(
          selectedInsuranceIds.map(insuranceId => ({ clinic_id: clinicId, professional_id: selectedProfessionalId, health_insurance_id: insuranceId })),
          { onConflict: 'health_insurance_id,professional_id' },
        );
        if (error) throw error;
      }
      let deleteQuery = supabase.from('professional_health_insurances').delete().eq('clinic_id', clinicId).eq('professional_id', selectedProfessionalId);
      if (selectedInsuranceIds.length) deleteQuery = deleteQuery.not('health_insurance_id', 'in', `(${selectedInsuranceIds.join(',')})`);
      const { error: deleteError } = await deleteQuery;
      if (deleteError) throw deleteError;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['healthcare-settings-insurances'] }),
        queryClient.invalidateQueries({ queryKey: ['health-insurances'] }),
      ]);
      toast({ title: 'Convênios do profissional atualizados' });
    },
    onError: (error: Error) => toast({ title: 'Não foi possível salvar os vínculos', description: error.message, variant: 'destructive' }),
  });

  const selectProfessional = (professionalId: string) => {
    setSelectedProfessionalId(professionalId);
    setSelectedInsuranceIds(
      insurances
        .filter(insurance => insurance.professional_health_insurances.some(link => link.professional_id === professionalId && link.status === 'active'))
        .map(insurance => insurance.id),
    );
  };

  const { data: durationSettings } = useQuery({
    queryKey: ['professional-appointment-durations', clinicId, selectedProfessionalId],
    queryFn: async () => {
      const [{ data: settings, error: settingsError }, { data: links, error: linksError }] = await Promise.all([
        supabase.from('professional_settings').select('private_appointment_duration_minutes').eq('clinic_id', clinicId!).eq('professional_id', selectedProfessionalId).maybeSingle(),
        supabase.from('professional_health_insurances').select('health_insurance_id, appointment_duration_minutes, health_insurances(name)').eq('clinic_id', clinicId!).eq('professional_id', selectedProfessionalId).eq('status', 'active'),
      ]);
      if (settingsError) throw settingsError;
      if (linksError) throw linksError;
      return { privateDuration: settings?.private_appointment_duration_minutes || 60, links: links || [] };
    },
    enabled: !!clinicId && !!selectedProfessionalId && section === 'durations',
  });

  const durationMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !selectedProfessionalId || !durationSettings) throw new Error('Selecione um profissional');
      const normalize = (value: string | undefined, fallback: number) => {
        const parsed = Number(value ?? fallback);
        if (!Number.isInteger(parsed) || parsed < 5 || parsed > 480) throw new Error('As durações devem estar entre 5 e 480 minutos');
        return parsed;
      };
      const { error: settingsError } = await supabase.from('professional_settings').upsert({
        clinic_id: clinicId,
        professional_id: selectedProfessionalId,
        private_appointment_duration_minutes: normalize(durationDrafts.private, durationSettings.privateDuration),
      }, { onConflict: 'professional_id' });
      if (settingsError) throw settingsError;
      await Promise.all(durationSettings.links.map(link => supabase.from('professional_health_insurances').update({
        appointment_duration_minutes: normalize(durationDrafts[link.health_insurance_id], link.appointment_duration_minutes),
      }).eq('clinic_id', clinicId).eq('professional_id', selectedProfessionalId).eq('health_insurance_id', link.health_insurance_id).then(({ error }) => { if (error) throw error; })));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['professional-appointment-durations'] });
      toast({ title: 'Durações das consultas atualizadas' });
    },
    onError: (error: Error) => toast({ title: 'Não foi possível salvar', description: error.message, variant: 'destructive' }),
  });

  return (
    <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="h-fit rounded-lg border bg-card p-2">
        <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Atendimento</p>
        <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Configurações de atendimento">
          {sections.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.id} type="button" onClick={() => setSection(item.id)} className={cn('flex min-w-max items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors lg:w-full', section === item.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                <Icon className="h-4 w-4" />{item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0">
        {section === 'insurances' && <HealthInsurancesPage embedded manageProfessionalLinks={false} />}

        {section === 'private-prices' && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Valor da consulta particular</CardTitle><p className="text-sm text-muted-foreground">Defina o valor padrão cobrado por cada profissional.</p></CardHeader>
            <CardContent>
              {loadingProfessionals ? <p className="text-sm text-muted-foreground">Carregando profissionais...</p> : (
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader><TableRow><TableHead>Profissional</TableHead><TableHead>Especialidade</TableHead><TableHead className="w-56">Valor particular</TableHead><TableHead className="w-20">Ação</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {professionals.map(professional => (
                        <TableRow key={professional.id}>
                          <TableCell className="font-medium">{professional.full_name}</TableCell>
                          <TableCell className="text-muted-foreground">{professional.specialty || '—'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2"><span className="text-sm text-muted-foreground">R$</span><Input value={priceDrafts[professional.id] ?? String(professional.private_consultation_price ?? '')} onChange={event => setPriceDrafts(current => ({ ...current, [professional.id]: event.target.value }))} inputMode="decimal" placeholder="0,00" className="h-8" aria-label={`Valor particular de ${professional.full_name}`} /></div>
                          </TableCell>
                          <TableCell><Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={priceMutation.isPending} onClick={() => priceMutation.mutate({ professionalId: professional.id, rawValue: priceDrafts[professional.id] ?? String(professional.private_consultation_price ?? '') })} aria-label={`Salvar valor de ${professional.full_name}`}><Save className="h-4 w-4" /></Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {section === 'links' && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Vínculo profissional × convênio</CardTitle><p className="text-sm text-muted-foreground">Selecione o profissional e marque todos os convênios que ele atende.</p></CardHeader>
            <CardContent className="space-y-5">
              <div className="max-w-md space-y-2"><Label>Profissional</Label><Select value={selectedProfessionalId} onValueChange={selectProfessional}><SelectTrigger><SelectValue placeholder="Selecione um profissional" /></SelectTrigger><SelectContent>{professionals.map(professional => <SelectItem key={professional.id} value={professional.id}>{professional.full_name}{professional.specialty ? ` — ${professional.specialty}` : ''}</SelectItem>)}</SelectContent></Select></div>
              {selectedProfessionalId && (
                <div className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {loadingInsurances ? <p className="text-sm text-muted-foreground">Carregando convênios...</p> : insurances.map(insurance => (
                      <label key={insurance.id} className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 hover:bg-muted/50"><Checkbox checked={selectedInsuranceIds.includes(insurance.id)} onCheckedChange={checked => setSelectedInsuranceIds(current => checked ? Array.from(new Set([...current, insurance.id])) : current.filter(id => id !== insurance.id))} /><span className="text-sm font-medium">{insurance.name}</span></label>
                    ))}
                  </div>
                  <Button onClick={() => linksMutation.mutate()} disabled={linksMutation.isPending}><Save className="mr-2 h-4 w-4" />{linksMutation.isPending ? 'Salvando...' : 'Salvar vínculos'}</Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {section === 'durations' && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Duração das consultas por profissional</CardTitle><p className="text-sm text-muted-foreground">Defina o tempo da consulta particular e de cada convênio atendido pelo médico.</p></CardHeader>
            <CardContent className="space-y-5">
              <div className="max-w-md space-y-2"><Label>Profissional</Label><Select value={selectedProfessionalId} onValueChange={id => { setSelectedProfessionalId(id); setDurationDrafts({}); }}><SelectTrigger><SelectValue placeholder="Selecione um profissional" /></SelectTrigger><SelectContent>{professionals.map(professional => <SelectItem key={professional.id} value={professional.id}>{professional.full_name}{professional.specialty ? ` — ${professional.specialty}` : ''}</SelectItem>)}</SelectContent></Select></div>
              {selectedProfessionalId && durationSettings && (
                <div className="overflow-hidden rounded-lg border">
                  <Table><TableHeader><TableRow><TableHead>Modalidade</TableHead><TableHead className="w-56">Duração da consulta</TableHead></TableRow></TableHeader><TableBody>
                    <TableRow><TableCell className="font-medium">Particular</TableCell><TableCell><div className="flex items-center gap-2"><Input type="number" min="5" max="480" step="5" className="h-8" value={durationDrafts.private ?? String(durationSettings.privateDuration)} onChange={event => setDurationDrafts(current => ({ ...current, private: event.target.value }))} /><span className="text-sm text-muted-foreground">min</span></div></TableCell></TableRow>
                    {durationSettings.links.map(link => <TableRow key={link.health_insurance_id}><TableCell className="font-medium">{link.health_insurances?.name || 'Convênio'}</TableCell><TableCell><div className="flex items-center gap-2"><Input type="number" min="5" max="480" step="5" className="h-8" value={durationDrafts[link.health_insurance_id] ?? String(link.appointment_duration_minutes)} onChange={event => setDurationDrafts(current => ({ ...current, [link.health_insurance_id]: event.target.value }))} /><span className="text-sm text-muted-foreground">min</span></div></TableCell></TableRow>)}
                  </TableBody></Table>
                </div>
              )}
              {selectedProfessionalId && durationSettings?.links.length === 0 && <p className="text-sm text-muted-foreground">Este profissional ainda não está vinculado a nenhum convênio. A duração particular já pode ser configurada.</p>}
              {selectedProfessionalId && <Button onClick={() => durationMutation.mutate()} disabled={!durationSettings || durationMutation.isPending}><Save className="mr-2 h-4 w-4" />{durationMutation.isPending ? 'Salvando...' : 'Salvar durações'}</Button>}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
