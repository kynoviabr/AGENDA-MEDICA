import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, MapPin, Plus, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const emptyForm = { name: '', address_line: '', city: '', state: '', zip_code: '', phone: '', timezone: 'America/Sao_Paulo' };

export default function LocationsTab() {
  const { clinicId, role } = useUserRole();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [professionalId, setProfessionalId] = useState('');
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const canManage = role === 'admin';
  const locationsQuery = useQuery({ queryKey: ['clinic-locations', clinicId], queryFn: async () => {
    const { data, error } = await supabase.from('clinic_locations').select('*').eq('clinic_id', clinicId!).order('is_primary', { ascending: false }).order('name');
    if (error) throw error; return data || [];
  }, enabled: !!clinicId });
  const professionalsQuery = useQuery({ queryKey: ['location-professionals', clinicId], queryFn: async () => {
    const { data, error } = await supabase.from('professionals').select('id,full_name,specialty,professional_locations(location_id,active)').eq('clinic_id', clinicId!).eq('status', 'active').order('full_name');
    if (error) throw error; return data || [];
  }, enabled: !!clinicId });
  const createLocation = useMutation({ mutationFn: async () => {
    if (!clinicId || !form.name.trim()) throw new Error('Informe o nome da unidade.');
    const { error } = await supabase.from('clinic_locations').insert({ clinic_id: clinicId, ...form, name: form.name.trim(), state: form.state.toUpperCase().slice(0, 2) }); if (error) throw error;
  }, onSuccess: async () => { setForm(emptyForm); await qc.invalidateQueries({ queryKey: ['clinic-locations'] }); toast({ title: 'Unidade cadastrada' }); }, onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }) });
  const saveLinks = useMutation({ mutationFn: async () => {
    if (!clinicId || !professionalId) throw new Error('Selecione um profissional.');
    const client = supabase.from('professional_locations');
    const { error: deleteError } = await client.delete().eq('clinic_id', clinicId).eq('professional_id', professionalId); if (deleteError) throw deleteError;
    if (selectedLocationIds.length) { const { error } = await client.insert(selectedLocationIds.map(location_id => ({ clinic_id: clinicId, professional_id: professionalId, location_id }))); if (error) throw error; }
  }, onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['location-professionals'] }); toast({ title: 'Unidades do profissional atualizadas' }); }, onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }) });
  const chooseProfessional = (id: string) => { setProfessionalId(id); const p = professionalsQuery.data?.find(item => item.id === id); setSelectedLocationIds((p?.professional_locations || []).filter(link => link.active).map(link => link.location_id)); };
  return <div className="grid gap-5 xl:grid-cols-2">
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Unidades</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="space-y-2">{locationsQuery.data?.map(location => <div key={location.id} className="flex items-start gap-3 rounded-lg border p-3"><MapPin className="mt-0.5 h-4 w-4 text-primary" /><div><p className="font-medium">{location.name}{location.is_primary ? ' · Principal' : ''}</p><p className="text-xs text-muted-foreground">{[location.address_line, location.city, location.state].filter(Boolean).join(' — ') || 'Endereço não informado'}</p></div></div>)}</div>
      {canManage && <div className="space-y-3 rounded-lg border p-4"><p className="text-sm font-semibold">Nova unidade</p><Input placeholder="Nome da unidade" value={form.name} onChange={e => setForm({...form,name:e.target.value})}/><Input placeholder="Endereço" value={form.address_line} onChange={e => setForm({...form,address_line:e.target.value})}/><div className="grid grid-cols-3 gap-2"><Input placeholder="Cidade" value={form.city} onChange={e => setForm({...form,city:e.target.value})}/><Input placeholder="UF" maxLength={2} value={form.state} onChange={e => setForm({...form,state:e.target.value})}/><Input placeholder="CEP" value={form.zip_code} onChange={e => setForm({...form,zip_code:e.target.value})}/></div><Input placeholder="Telefone" value={form.phone} onChange={e => setForm({...form,phone:e.target.value})}/><Button onClick={() => createLocation.mutate()} disabled={createLocation.isPending}><Plus className="mr-2 h-4 w-4"/>Cadastrar unidade</Button></div>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Profissional × unidade</CardTitle></CardHeader><CardContent className="space-y-4"><div><Label>Profissional</Label><Select value={professionalId} onValueChange={chooseProfessional}><SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger><SelectContent>{professionalsQuery.data?.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2">{locationsQuery.data?.filter(l => l.active).map(location => <label key={location.id} className="flex items-center gap-2 rounded-md border p-3"><Checkbox checked={selectedLocationIds.includes(location.id)} onCheckedChange={checked => setSelectedLocationIds(ids => checked ? [...new Set([...ids,location.id])] : ids.filter(id => id !== location.id))}/>{location.name}</label>)}</div><Button onClick={() => saveLinks.mutate()} disabled={!canManage || !professionalId || saveLinks.isPending}><Save className="mr-2 h-4 w-4"/>Salvar vínculos</Button></CardContent></Card>
  </div>;
}
