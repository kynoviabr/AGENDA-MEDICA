import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, Plus, Search, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';

interface InsuranceForm {
  name: string;
  ans_code: string;
  phone: string;
  email: string;
  authorization_notes: string;
  status: 'active' | 'inactive';
}

const emptyForm: InsuranceForm = {
  name: '', ans_code: '', phone: '', email: '', authorization_notes: '', status: 'active',
};

export default function HealthInsurancesPage() {
  const { clinicId } = useUserRole();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<InsuranceForm>(emptyForm);
  const [professionalIds, setProfessionalIds] = useState<string[]>([]);

  const { data: professionals = [] } = useQuery({
    queryKey: ['professionals-for-health-insurances', clinicId],
    queryFn: async () => {
      if (!clinicId) return [];
      const { data, error } = await supabase.from('professionals').select('id, full_name, specialty').eq('clinic_id', clinicId).eq('status', 'active').order('full_name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: insurances = [], isLoading } = useQuery({
    queryKey: ['health-insurances', clinicId],
    queryFn: async () => {
      if (!clinicId) return [];
      const { data, error } = await supabase
        .from('health_insurances')
        .select('*, professional_health_insurances(professional_id, status)')
        .eq('clinic_id', clinicId)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId) throw new Error('Clínica não identificada');
      const payload = {
        clinic_id: clinicId,
        name: form.name.trim(),
        ans_code: form.ans_code.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        authorization_notes: form.authorization_notes.trim() || null,
        status: form.status,
      };

      let insuranceId = editingId;
      if (editingId) {
        const { error } = await supabase.from('health_insurances').update(payload).eq('id', editingId).eq('clinic_id', clinicId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('health_insurances').insert(payload).select('id').single();
        if (error) throw error;
        insuranceId = data.id;
      }

      if (!insuranceId) return;
      const { error: deleteError } = await supabase.from('professional_health_insurances').delete().eq('health_insurance_id', insuranceId).eq('clinic_id', clinicId);
      if (deleteError) throw deleteError;
      if (professionalIds.length) {
        const { error } = await supabase.from('professional_health_insurances').insert(
          professionalIds.map(professionalId => ({ clinic_id: clinicId, health_insurance_id: insuranceId!, professional_id: professionalId })),
        );
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['health-insurances'] });
      setOpen(false);
      toast({ title: editingId ? 'Convênio atualizado' : 'Convênio cadastrado' });
    },
    onError: (error: Error) => toast({ title: 'Não foi possível salvar', description: error.message, variant: 'destructive' }),
  });

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setProfessionalIds([]);
    setOpen(true);
  };

  const startEdit = (insurance: typeof insurances[number]) => {
    setEditingId(insurance.id);
    setForm({
      name: insurance.name,
      ans_code: insurance.ans_code || '',
      phone: insurance.phone || '',
      email: insurance.email || '',
      authorization_notes: insurance.authorization_notes || '',
      status: insurance.status as 'active' | 'inactive',
    });
    setProfessionalIds(insurance.professional_health_insurances.filter(link => link.status === 'active').map(link => link.professional_id));
    setOpen(true);
  };

  const filtered = insurances.filter(insurance => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return !term || insurance.name.toLocaleLowerCase('pt-BR').includes(term) || insurance.ans_code?.toLocaleLowerCase('pt-BR').includes(term);
  });

  return (
    <div>
      <PageHeader title="Convênios" description="Cadastre os planos aceitos e indique quais profissionais atendem cada convênio.">
        <BrandButton onClick={startCreate}><Plus className="h-4 w-4" />Novo convênio</BrandButton>
      </PageHeader>

      <div className="relative mb-5 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nome ou registro ANS" className="pl-9" />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando convênios...</p>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-12 text-center"><ShieldCheck className="mb-3 h-10 w-10 text-muted-foreground" /><p className="font-medium">Nenhum convênio cadastrado</p><p className="mt-1 text-sm text-muted-foreground">Cadastre o primeiro plano aceito pela clínica.</p></CardContent></Card>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[24%]">Convênio</TableHead>
                <TableHead className="w-[13%]">Registro ANS</TableHead>
                <TableHead className="w-[22%]">Contato</TableHead>
                <TableHead>Profissionais</TableHead>
                <TableHead className="w-[10%]">Status</TableHead>
                <TableHead className="w-14 text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(insurance => {
                const linkedIdSet = new Set(insurance.professional_health_insurances.filter(link => link.status === 'active').map(link => link.professional_id));
                const linkedNames = professionals.filter(professional => linkedIdSet.has(professional.id)).map(professional => professional.full_name);
                const contact = insurance.phone || insurance.email;
                return (
                  <TableRow key={insurance.id}>
                    <TableCell className="py-2.5 font-medium">{insurance.name}</TableCell>
                    <TableCell className="py-2.5 text-muted-foreground">{insurance.ans_code || '—'}</TableCell>
                    <TableCell className="max-w-[220px] truncate py-2.5 text-muted-foreground" title={contact || undefined}>{contact || '—'}</TableCell>
                    <TableCell className="max-w-[300px] truncate py-2.5 text-muted-foreground" title={linkedNames.join(', ') || undefined}>
                      {linkedNames.length ? linkedNames.join(', ') : 'Nenhum vinculado'}
                    </TableCell>
                    <TableCell className="py-2.5"><Badge variant={insurance.status === 'active' ? 'default' : 'secondary'}>{insurance.status === 'active' ? 'Ativo' : 'Inativo'}</Badge></TableCell>
                    <TableCell className="py-2.5 text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(insurance)} aria-label={`Editar ${insurance.name}`} title={`Editar ${insurance.name}`}><Edit className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Editar convênio' : 'Cadastrar convênio'}</DialogTitle></DialogHeader>
          <form className="space-y-5" onSubmit={event => { event.preventDefault(); saveMutation.mutate(); }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="insurance-name">Nome do convênio *</Label><Input id="insurance-name" required value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Ex.: Unimed" /></div>
              <div className="space-y-1.5"><Label htmlFor="insurance-ans">Registro ANS</Label><Input id="insurance-ans" value={form.ans_code} onChange={event => setForm(current => ({ ...current, ans_code: event.target.value }))} placeholder="Número de registro" /></div>
              <div className="space-y-1.5"><Label htmlFor="insurance-phone">Telefone</Label><Input id="insurance-phone" value={form.phone} onChange={event => setForm(current => ({ ...current, phone: event.target.value }))} placeholder="(00) 0000-0000" /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="insurance-email">E-mail</Label><Input id="insurance-email" type="email" value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} placeholder="autorizacao@convenio.com.br" /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="insurance-notes">Orientações para autorização</Label><Textarea id="insurance-notes" value={form.authorization_notes} onChange={event => setForm(current => ({ ...current, authorization_notes: event.target.value }))} placeholder="Documentos, prazos e regras que a equipe e a IA devem considerar" rows={3} /></div>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div><p className="text-sm font-semibold">Profissionais que atendem este convênio</p><p className="text-xs text-muted-foreground">Esta relação poderá ser consultada pela IA durante o atendimento.</p></div>
              {professionals.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum profissional ativo cadastrado.</p> : professionals.map(professional => (
                <label key={professional.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50">
                  <Checkbox checked={professionalIds.includes(professional.id)} onCheckedChange={checked => setProfessionalIds(current => checked ? [...current, professional.id] : current.filter(id => id !== professional.id))} />
                  <span className="text-sm">{professional.full_name}{professional.specialty ? ` — ${professional.specialty}` : ''}</span>
                </label>
              ))}
            </div>

            <label className="flex items-center gap-3"><Checkbox checked={form.status === 'active'} onCheckedChange={checked => setForm(current => ({ ...current, status: checked ? 'active' : 'inactive' }))} /><span className="text-sm">Convênio ativo</span></label>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={saveMutation.isPending || !form.name.trim()}>{saveMutation.isPending ? 'Salvando...' : 'Salvar convênio'}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
