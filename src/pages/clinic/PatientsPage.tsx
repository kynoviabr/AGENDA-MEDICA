import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, MoreHorizontal, Phone, Mail, Edit, Eye } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { AnamneseBadge, getAnamneseStatus, type AnamneseStatus } from '@/components/patient/AnamneseSection';
import PayerSection, { type PayerData } from '@/components/patient/PayerSection';
import { formatCep, lookupCepAddress } from '@/lib/cep';

interface PatientForm {
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
}

const emptyForm: PatientForm = {
  full_name: '', email: '', phone: '', cpf: '',
  date_of_birth: '', gender: '', zip_code: '', address: '', city: '', state: '', notes: '',
};

const defaultPayerData: PayerData = {
  is_self_payer: true,
  payer_id: null,
};

const anamneseStatusLabel: Record<AnamneseStatus, string> = {
  none: 'Sem anamnese',
  valid: 'Anamnese válida',
  expiring: 'Próxima do vencimento',
  expired: 'Anamnese vencida',
};

const anamneseStatusHint: Record<AnamneseStatus, string> = {
  none: 'Cadastrar ficha antes do próximo atendimento.',
  valid: 'Paciente apto para seguir no fluxo clínico.',
  expiring: 'Vale renovar em breve para evitar bloqueios operacionais.',
  expired: 'Priorize atualização antes da próxima sessão.',
};

export default function PatientsPage() {
  const { clinicId } = useBranding();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [anamneseFilter, setAnamneseFilter] = useState<string>(searchParams.get('anamnese') || 'all');
  const [treatmentFilter, setTreatmentFilter] = useState<string>('all');
  const [contractDateStart, setContractDateStart] = useState('');
  const [contractDateEnd, setContractDateEnd] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PatientForm>(emptyForm);
  const [payerData, setPayerData] = useState<PayerData>(defaultPayerData);
  const { data: patients = [], isLoading } = useQuery({
    queryKey: ['patients', clinicId, search, statusFilter],
    queryFn: async () => {
      if (!clinicId) return [];
      let q = supabase
        .from('patients')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        q = q.eq('status', statusFilter as unknown);
      }

      const { data, error } = await q.limit(100);
      if (error) throw error;
      return data;
    },
    enabled: !!clinicId,
  });

  const { data: patientContracts = [] } = useQuery({
    queryKey: ['patient-contracts-filter-map', clinicId],
    queryFn: async () => {
      if (!clinicId) return [];
      const { data, error } = await supabase
        .from('contract_items' as unknown)
        .select('treatment_id, treatments(name), contracts!inner(patient_id, created_at, clinic_id)')
        .eq('contracts.clinic_id', clinicId);
      if (error) throw error;
      return (data as unknown[]) || [];
    },
    enabled: !!clinicId,
  });

  // Fetch latest anamnese per patient
  const { data: anamneses = [] } = useQuery({
    queryKey: ['patient-anamneses-list', clinicId],
    queryFn: async () => {
      if (!clinicId) return [];
      const { data } = await supabase
        .from('patient_anamneses' as unknown)
        .select('patient_id, uploaded_at')
        .eq('clinic_id', clinicId)
        .order('uploaded_at', { ascending: false });
      return (data as unknown[]) || [];
    },
    enabled: !!clinicId,
  });

  const { data: validityDays = 45 } = useQuery({
    queryKey: ['anamnese-validity', clinicId],
    queryFn: async () => {
      const { data } = await supabase
        .from('clinic_settings' as unknown)
        .select('value')
        .eq('clinic_id', clinicId)
        .eq('key', 'anamnese_validity_days')
        .maybeSingle();
      return data ? parseInt((data as unknown).value) || 45 : 45;
    },
    enabled: !!clinicId,
  });

  // Build anamnese map (latest per patient)
  const anamneseMap: Record<string, string> = {};
  anamneses.forEach((a: unknown) => {
    if (!anamneseMap[a.patient_id]) anamneseMap[a.patient_id] = a.uploaded_at;
  });

  const getPatientAnamneseStatus = (patientId: string): AnamneseStatus => {
    return getAnamneseStatus(anamneseMap[patientId], validityDays);
  };

  const formatDate = (value?: string) => {
    if (!value) return null;
    return new Intl.DateTimeFormat('pt-BR').format(new Date(value));
  };

  const getAnamneseSupportingText = (patientId: string) => {
    const uploadedAt = anamneseMap[patientId];
    const status = getPatientAnamneseStatus(patientId);

    if (!uploadedAt) {
      return anamneseStatusHint.none;
    }

    const uploadedLabel = formatDate(uploadedAt);
    if (status === 'valid') {
      return `Última atualização em ${uploadedLabel}.`;
    }

    if (status === 'expiring') {
      return `Última atualização em ${uploadedLabel}. Planeje a renovação.`;
    }

    return `Última atualização em ${uploadedLabel}. Atualização recomendada.`;
  };

  // Filter patients by anamnese status
  const normalizeDigits = (value?: string | null) => (value || '').replace(/\D/g, '');
  const normalizedSearch = search.trim().toLowerCase();
  const normalizedSearchDigits = normalizeDigits(search);

  const patientContractMeta = patientContracts.reduce<Record<string, { treatments: Set<string>; contractDates: string[] }>>((acc, row: unknown) => {
    const patientId = row?.contracts?.patient_id;
    if (!patientId) return acc;
    if (!acc[patientId]) {
      acc[patientId] = { treatments: new Set<string>(), contractDates: [] };
    }
    const treatmentId = row?.treatment_id;
    if (treatmentId) acc[patientId].treatments.add(treatmentId);
    if (row?.contracts?.created_at) acc[patientId].contractDates.push(row.contracts.created_at);
    return acc;
  }, {});

  const filteredPatients = patients.filter(p => {
    const fullName = (p.full_name || '').toLowerCase();
    const email = (p.email || '').toLowerCase();
    const phone = normalizeDigits(p.phone);
    const cpf = normalizeDigits(p.cpf);

    const matchSearch = !normalizedSearch ||
      fullName.includes(normalizedSearch) ||
      email.includes(normalizedSearch) ||
      phone.includes(normalizedSearchDigits) ||
      cpf.includes(normalizedSearchDigits);

    if (!matchSearch) return false;
    if (anamneseFilter !== 'all') {
      const s = getPatientAnamneseStatus(p.id);
      if (s !== anamneseFilter) return false;
    }

    const contractMeta = patientContractMeta[p.id];
    if (treatmentFilter !== 'all') {
      if (!contractMeta || !contractMeta.treatments.has(treatmentFilter)) return false;
    }

    if (contractDateStart || contractDateEnd) {
      if (!contractMeta || contractMeta.contractDates.length === 0) return false;
      const hasDateInRange = contractMeta.contractDates.some((dateValue) => {
        const date = new Date(dateValue);
        if (Number.isNaN(date.getTime())) return false;
        if (contractDateStart && date < new Date(`${contractDateStart}T00:00:00`)) return false;
        if (contractDateEnd && date > new Date(`${contractDateEnd}T23:59:59`)) return false;
        return true;
      });
      if (!hasDateInRange) return false;
    }

    return true;
  });

  const treatmentOptions = patientContracts.reduce<Array<{ id: string; name: string }>>((acc, row: unknown) => {
    if (!row?.treatment_id || !row?.treatments?.name) return acc;
    if (acc.some((item) => item.id === row.treatment_id)) return acc;
    acc.push({ id: row.treatment_id, name: row.treatments.name });
    return acc;
  }, []).sort((a, b) => a.name.localeCompare(b.name));

  const anamneseCounts = filteredPatients.reduce<Record<AnamneseStatus, number>>((acc, patient) => {
    const status = getPatientAnamneseStatus(patient.id);
    acc[status] += 1;
    return acc;
  }, { none: 0, valid: 0, expiring: 0, expired: 0 });

  const saveMutation = useMutation({
    mutationFn: async (data: PatientForm) => {
      if (!clinicId) throw new Error('Clínica não encontrada');

      // Handle payer creation if not self-payer
      let payerId: string | null = null;
      if (!payerData.is_self_payer) {
        if (payerData.payer_id) {
          payerId = payerData.payer_id;
        } else if (payerData.new_payer) {
          if (!payerData.new_payer.name.trim()) throw new Error('Nome do pagador é obrigatório');
          if (!payerData.new_payer.cpf.trim()) throw new Error('CPF do pagador é obrigatório');
          const { data: newPayer, error: payerError } = await supabase
            .from('payers' as unknown)
            .insert({
              clinic_id: clinicId,
              name: payerData.new_payer.name.trim(),
              cpf: payerData.new_payer.cpf.trim(),
              birth_date: payerData.new_payer.birth_date || null,
            })
            .select('id')
            .single();
          if (payerError) throw payerError;
          payerId = (newPayer as unknown).id;
        }
      }

      const payload: unknown = {
        ...data,
        clinic_id: clinicId,
        date_of_birth: data.date_of_birth || null,
        email: data.email || null,
        phone: data.phone || null,
        cpf: data.cpf || null,
        gender: data.gender || null,
        zip_code: data.zip_code || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        notes: data.notes || null,
        is_self_payer: payerData.is_self_payer,
        payer_id: payerId,
      };

      if (editingId) {
        const { error } = await supabase.from('patients').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        // Auto-create payer from patient data if self-payer
        if (payerData.is_self_payer) {
          const { data: autoPayer, error: autoErr } = await supabase
            .from('payers' as unknown)
            .insert({
              clinic_id: clinicId,
              name: data.full_name.trim(),
              cpf: data.cpf?.trim() || null,
              email: data.email?.trim() || null,
              phone: data.phone?.trim() || null,
              birth_date: data.date_of_birth || null,
            })
            .select('id')
            .single();
          if (!autoErr && autoPayer) {
            payload.payer_id = (autoPayer as unknown).id;
          }
        }
        const { error } = await supabase.from('patients').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      setPayerData(defaultPayerData);
      toast({ title: editingId ? 'Paciente atualizado!' : 'Paciente criado!' });
    },
    onError: (err: unknown) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  const openEdit = (patient: unknown) => {
    setEditingId(patient.id);
    setForm({
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
    setPayerData({
      is_self_payer: patient.is_self_payer ?? true,
      payer_id: patient.payer_id || null,
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setPayerData(defaultPayerData);
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }
    saveMutation.mutate(form);
  };

  const handleCepChange = async (value: string) => {
    const zipCode = formatCep(value);
    setForm((current) => ({ ...current, zip_code: zipCode }));

    if (zipCode.replace(/\D/g, '').length !== 8) return;

    try {
      const address = await lookupCepAddress(zipCode);
      if (!address) {
        toast({ title: 'CEP não encontrado', variant: 'destructive' });
        return;
      }
      setForm((current) => {
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
      toast({ title: 'Erro ao consultar CEP', description: message, variant: 'destructive' });
    }
  };

  const initials = (name: string) =>
    name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();

  return (
    <div>
      <PageHeader title="Pacientes" description="Gerencie os pacientes da clínica">
        <BrandButton onClick={openNew}>
          <Plus className="w-4 h-4" />
          Novo Paciente
        </BrandButton>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, e-mail, telefone ou CPF..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
            <SelectItem value="completed">Concluídos</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
          </SelectContent>
        </Select>
        <Select value={anamneseFilter} onValueChange={setAnamneseFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Anamnese" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas anamneses</SelectItem>
            <SelectItem value="none">Sem anamnese</SelectItem>
            <SelectItem value="valid">Válida</SelectItem>
            <SelectItem value="expiring">Próxima do vencimento</SelectItem>
            <SelectItem value="expired">Vencida</SelectItem>
          </SelectContent>
        </Select>
        <Select value={treatmentFilter} onValueChange={setTreatmentFilter}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Tratamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos tratamentos</SelectItem>
            {treatmentOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={contractDateStart}
          onChange={(event) => setContractDateStart(event.target.value)}
          className="w-full sm:w-44"
        />
        <Input
          type="date"
          value={contractDateEnd}
          onChange={(event) => setContractDateEnd(event.target.value)}
          className="w-full sm:w-44"
        />
      </div>

      {!isLoading && patients.length > 0 && (
        <div className="grid grid-cols-1 gap-3 mb-6 sm:grid-cols-2 xl:grid-cols-4">
          {(['none', 'valid', 'expiring', 'expired'] as AnamneseStatus[]).map((status) => (
            <div
              key={status}
              className={`rounded-2xl border p-4 shadow-card ${
                status === 'expired'
                  ? 'border-destructive/40 bg-destructive/5'
                  : status === 'expiring' || status === 'none'
                    ? 'border-warning/40 bg-warning/10'
                    : 'bg-card'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {anamneseStatusLabel[status]}
                  </p>
                  <p className="text-2xl font-semibold text-foreground">{anamneseCounts[status]}</p>
                </div>
                <AnamneseBadge status={status} />
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                {anamneseStatusHint[status]}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl shadow-card p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filteredPatients.length === 0 && (
        <div className="text-center py-16 animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Nenhum paciente encontrado</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {search ? 'Tente uma busca diferente' : 'Comece cadastrando seu primeiro paciente'}
          </p>
          {!search && (
            <BrandButton onClick={openNew}>
              <Plus className="w-4 h-4" />
              Novo Paciente
            </BrandButton>
          )}
        </div>
      )}

      {/* Mobile Cards */}
      {!isLoading && filteredPatients.length > 0 && (
        <>
          <div className="space-y-3 md:hidden">
            {filteredPatients.map(p => (
              <div key={p.id} className="bg-card rounded-xl shadow-card p-4 animate-fade-in" onClick={() => navigate(`/clinic/patients/${p.id}`)}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-semibold text-sm">
                      {initials(p.full_name)}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{p.full_name}</p>
                      {p.email && <p className="text-xs text-muted-foreground">{p.email}</p>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <BrandBadge status={p.status as BadgeStatus} />
                    <AnamneseBadge status={getPatientAnamneseStatus(p.id)} />
                  </div>
                </div>
                <div className="rounded-xl border bg-secondary/30 px-3 py-2">
                  <p className="text-xs font-medium text-foreground">
                    {anamneseStatusLabel[getPatientAnamneseStatus(p.id)]}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {getAnamneseSupportingText(p.id)}
                  </p>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-3 pt-3 border-t">
                  {p.phone && (
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.phone}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block bg-card rounded-xl shadow-card overflow-hidden animate-fade-in">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Paciente</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Telefone</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">CPF</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Anamnese</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map(p => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => navigate(`/clinic/patients/${p.id}`)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-semibold text-xs">
                          {initials(p.full_name)}
                        </div>
                        <div>
                          <p className="font-medium text-sm text-foreground">{p.full_name}</p>
                          {p.email && <p className="text-xs text-muted-foreground">{p.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{p.phone || '—'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{p.cpf || '—'}</td>
                    <td className="px-4 py-3">
                      <BrandBadge status={p.status as BadgeStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <AnamneseBadge status={getPatientAnamneseStatus(p.id)} />
                        <p className="text-xs text-muted-foreground">
                          {getAnamneseSupportingText(p.id)}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="p-1 rounded hover:bg-secondary text-muted-foreground">
                          <MoreHorizontal className="w-4 h-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/clinic/patients/${p.id}`)}>
                            <Eye className="w-4 h-4 mr-2" /> Ver detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(p)}>
                            <Edit className="w-4 h-4 mr-2" /> Editar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Paciente' : 'Novo Paciente'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Nome completo *</Label>
              <Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="(11) 99999-9999" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>CPF</Label>
                <Input value={form.cpf} onChange={e => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" />
              </div>
              <div className="space-y-2">
                <Label>Data de nascimento</Label>
                <Input type="date" value={form.date_of_birth} onChange={e => setForm({ ...form, date_of_birth: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Gênero</Label>
              <Select value={form.gender} onValueChange={v => setForm({ ...form, gender: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Feminino</SelectItem>
                  <SelectItem value="male">Masculino</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <PayerSection value={payerData} onChange={setPayerData} patientName={form.full_name} />
            <div className="rounded-lg border p-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Endereço</h3>
                <p className="text-xs text-muted-foreground mt-1">Dados complementares usados na ficha do paciente e na formalização do contrato.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>CEP</Label>
                  <Input value={form.zip_code} onChange={e => handleCepChange(e.target.value)} placeholder="00000-000" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Endereço completo</Label>
                  <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Rua, número, complemento e bairro" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Cidade</Label>
                  <Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>UF</Label>
                  <Input value={form.state} onChange={e => setForm({ ...form, state: e.target.value.toUpperCase().slice(0, 2) })} placeholder="SP" maxLength={2} />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} />
            </div>
            <div className="flex gap-3 pt-2">
              <BrandButton type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                Cancelar
              </BrandButton>
              <BrandButton type="submit" className="flex-1" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Salvando...' : editingId ? 'Atualizar' : 'Cadastrar'}
              </BrandButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
