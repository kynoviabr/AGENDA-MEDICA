import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfessionals, Professional } from '@/hooks/useProfessionals';
import { useRoles } from '@/hooks/useRoles';
import { useClassEntities } from '@/hooks/useClassEntities';
import { useProfessionalTreatments } from '@/hooks/useProfessionalTreatments';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Plus, Loader2, UserCheck, UserX, Search, Users, Stethoscope, ShieldCheck, Building2, AlertTriangle, ArrowUpDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  describeLocationDependencies,
  getProfessionalLocationChanges,
  type LocationDependencyCounts,
  type ProfessionalLocationLinkState,
} from './professionalLocationLinks';

function formatCPF(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function isValidCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  if (parseInt(digits[9]) !== check) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  return parseInt(digits[10]) === check;
}

const PAGE_SIZE = 10;

type SortKey = 'full_name' | 'status' | 'created_at';
type SortDir = 'asc' | 'desc';

interface TreatmentOption {
  id: string;
  name: string;
}

interface LocationOption {
  id: string;
  name: string;
  is_primary: boolean;
  active: boolean;
}

interface ProfessionalLocationLink extends ProfessionalLocationLinkState {
  id: string;
  professionalId: string;
}

export default function ProfessionalsTab() {
  const { items, loading, create, toggleStatus } = useProfessionals();
  const { items: roles } = useRoles();
  const { items: entities } = useClassEntities();
  const { items: profTreatments, create: linkTreatment } = useProfessionalTreatments();
  const { clinicId, role: currentUserRole } = useUserRole();
  const canManageLocations = currentUserRole === 'admin';

  const [treatments, setTreatments] = useState<TreatmentOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [professionalLocationLinks, setProfessionalLocationLinks] = useState<ProfessionalLocationLink[]>([]);
  const [selectedCreateLocationIds, setSelectedCreateLocationIds] = useState<string[]>([]);
  const [locationEditorProfessional, setLocationEditorProfessional] = useState<Professional | null>(null);
  const [selectedEditorLocationIds, setSelectedEditorLocationIds] = useState<string[]>([]);
  const [savingLocations, setSavingLocations] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cpfError, setCpfError] = useState('');
  const [form, setForm] = useState({
    full_name: '', cpf: '', email: '', phone: '', specialty: '',
    registration_number: '', user_id: '', role_id: '', class_entity_id: '',
  });
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>([]);
  const [additionalPhones, setAdditionalPhones] = useState<string[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterRoleId, setFilterRoleId] = useState('all');
  const [filterTreatmentId, setFilterTreatmentId] = useState('all');

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>('full_name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Pagination
  const [page, setPage] = useState(1);

  // Toggle confirmation
  const [confirmToggle, setConfirmToggle] = useState<{ id: string; name: string; current: string } | null>(null);
  const [toggling, setToggling] = useState(false);

  const loadLocationData = useCallback(async () => {
    if (!clinicId) return;
    const [locationsResult, linksResult] = await Promise.all([
      supabase.from('clinic_locations').select('id, name, is_primary, active').eq('clinic_id', clinicId).order('is_primary', { ascending: false }).order('name'),
      supabase.from('professional_locations').select('id, professional_id, location_id, active').eq('clinic_id', clinicId),
    ]);
    if (locationsResult.error || linksResult.error) {
      toast.error('Não foi possível carregar os vínculos entre profissionais e unidades.');
      return;
    }
    setLocations(locationsResult.data || []);
    setProfessionalLocationLinks((linksResult.data || []).map(link => ({
      id: link.id,
      professionalId: link.professional_id,
      locationId: link.location_id,
      active: link.active,
    })));
  }, [clinicId]);

  useEffect(() => {
    if (!clinicId) return;
    supabase.from('treatments').select('id, name').eq('clinic_id', clinicId).eq('is_active', true).order('name')
      .then(({ data }) => { if (data) setTreatments(data); });
    void loadLocationData();
  }, [clinicId, loadLocationData]);

  const handleCpfChange = (value: string) => {
    const formatted = formatCPF(value);
    setForm(f => ({ ...f, cpf: formatted }));
    const digits = formatted.replace(/\D/g, '');
    setCpfError(digits.length === 11 && !isValidCPF(digits) ? 'CPF inválido' : '');
  };

  const toggleLocationSelection = (
    locationId: string,
    setSelection: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    setSelection(current => current.includes(locationId)
      ? current.filter(id => id !== locationId)
      : [...current, locationId]);
  };

  const createProfessionalLocationLinks = async (professionalId: string, locationIds: string[]) => {
    if (!clinicId || locationIds.length === 0) return true;
    const { error } = await supabase.from('professional_locations').upsert(
      locationIds.map(locationId => ({
        clinic_id: clinicId,
        professional_id: professionalId,
        location_id: locationId,
        active: true,
      })),
      { onConflict: 'professional_id,location_id' },
    );
    if (error) {
      toast.error('O profissional foi criado, mas não foi possível vincular as unidades. Tente novamente na lista de profissionais.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) { toast.error('Informe o nome completo do profissional'); return; }
    if (!form.role_id) { toast.error('Selecione um cargo'); return; }
    if (!form.class_entity_id) { toast.error('Selecione uma entidade de classe'); return; }
    const cpfDigits = form.cpf.replace(/\D/g, '');
    if (cpfDigits.length > 0 && cpfDigits.length < 11) { setCpfError('CPF incompleto'); return; }
    if (cpfDigits.length === 11 && !isValidCPF(cpfDigits)) { setCpfError('CPF inválido'); return; }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { toast.error('E-mail com formato inválido'); return; }
    setSaving(true);
    const result = await create({
      full_name: form.full_name, cpf: cpfDigits || null, email: form.email || null,
      phone: form.phone || null, specialty: form.specialty || null,
      additional_phones: Array.from(new Set(additionalPhones.map(phone => phone.trim()).filter(phone => phone && phone !== form.phone.trim()))),
      registration_number: form.registration_number || null, user_id: form.user_id.trim() || null,
      role_id: form.role_id, class_entity_id: form.class_entity_id, status: 'active',
    });
    if (result) {
      for (const tid of selectedTreatments) await linkTreatment(result.id, tid);
      const linkedLocations = await createProfessionalLocationLinks(result.id, selectedCreateLocationIds);
      if (selectedCreateLocationIds.length === 0) {
        toast.warning('Profissional cadastrado sem unidade. A disponibilidade permanecerá bloqueada até que uma unidade seja vinculada.');
      } else if (linkedLocations) {
        await loadLocationData();
      }
      setOpen(false);
      setForm({ full_name: '', cpf: '', email: '', phone: '', specialty: '', registration_number: '', user_id: '', role_id: '', class_entity_id: '' });
      setSelectedTreatments([]); setSelectedCreateLocationIds([]); setAdditionalPhones([]); setCpfError('');
    }
    setSaving(false);
  };

  const openLocationEditor = (professional: Professional) => {
    setLocationEditorProfessional(professional);
    setSelectedEditorLocationIds(professionalLocationLinks
      .filter(link => link.professionalId === professional.id && link.active)
      .map(link => link.locationId));
  };

  const getLocationDependencyCounts = async (
    professionalId: string,
    locationId: string,
  ): Promise<LocationDependencyCounts> => {
    if (!clinicId) throw new Error('Clínica não identificada.');
    const now = new Date();
    const nowIso = now.toISOString();
    const today = nowIso.slice(0, 10);
    const [appointments, availability, blocks, exceptions] = await Promise.all([
      supabase.from('appointments').select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId).eq('professional_id', professionalId).eq('location_id', locationId)
        .gte('start_time', nowIso).in('status', ['scheduled', 'confirmed', 'in_progress']),
      supabase.from('professional_availability').select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId).eq('professional_id', professionalId).eq('location_id', locationId).eq('is_active', true),
      supabase.from('appointment_blocks').select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId).eq('professional_id', professionalId).eq('location_id', locationId).gte('end_at', nowIso),
      supabase.from('scheduling_exceptions').select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId).eq('professional_id', professionalId).eq('location_id', locationId).gte('exception_date', today),
    ]);
    const error = appointments.error || availability.error || blocks.error || exceptions.error;
    if (error) throw new Error('Não foi possível validar as dependências da unidade. Nenhum vínculo foi alterado.');
    return {
      futureAppointments: appointments.count || 0,
      activeAvailability: availability.count || 0,
      futureBlocks: blocks.count || 0,
      futureExceptions: exceptions.count || 0,
    };
  };

  const saveProfessionalLocations = async () => {
    if (!clinicId || !locationEditorProfessional || !canManageLocations) return;
    setSavingLocations(true);
    try {
      const existing = professionalLocationLinks
        .filter(link => link.professionalId === locationEditorProfessional.id)
        .map(link => ({ locationId: link.locationId, active: link.active }));
      const changes = getProfessionalLocationChanges(existing, selectedEditorLocationIds);

      for (const locationId of changes.deactivate) {
        const dependencies = await getLocationDependencyCounts(locationEditorProfessional.id, locationId);
        const dependencyDescriptions = describeLocationDependencies(dependencies);
        if (dependencyDescriptions.length > 0) {
          const locationName = locations.find(location => location.id === locationId)?.name || 'esta unidade';
          throw new Error(`Não é possível remover ${locationName}: existem ${dependencyDescriptions.join(', ')}. Remova ou encerre essas dependências primeiro.`);
        }
      }

      if (changes.activate.length > 0) {
        const activated = await createProfessionalLocationLinks(locationEditorProfessional.id, changes.activate);
        if (!activated) throw new Error('Não foi possível ativar todos os vínculos de unidade.');
      }
      if (changes.deactivate.length > 0) {
        const { error } = await supabase.from('professional_locations').update({ active: false })
          .eq('clinic_id', clinicId)
          .eq('professional_id', locationEditorProfessional.id)
          .in('location_id', changes.deactivate);
        if (error) throw new Error('Não foi possível remover os vínculos selecionados. Nenhum dado foi excluído.');
      }

      await loadLocationData();
      setLocationEditorProfessional(null);
      setSelectedEditorLocationIds([]);
      if (selectedEditorLocationIds.length === 0) {
        toast.warning('Profissional sem unidade. A disponibilidade permanecerá bloqueada até um novo vínculo.');
      } else {
        toast.success('Unidades de atendimento atualizadas.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar as unidades.');
    } finally {
      setSavingLocations(false);
    }
  };

  const handleConfirmToggle = async () => {
    if (!confirmToggle) return;
    setToggling(true);
    await toggleStatus(confirmToggle.id, confirmToggle.current);
    setToggling(false); setConfirmToggle(null);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  // Build professional→treatments map
  const profTreatmentMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    profTreatments.forEach(pt => {
      if (pt.status === 'active') {
        if (!map[pt.professional_id]) map[pt.professional_id] = [];
        map[pt.professional_id].push(pt.treatment_id);
      }
    });
    return map;
  }, [profTreatments]);

  // Filter, sort, paginate
  const { filtered, totalPages, paged } = useMemo(() => {
    const searchLower = search.toLowerCase().replace(/\D/g, '') || search.toLowerCase();
    const result = items.filter(p => {
      if (filterStatus !== 'all' && p.status !== filterStatus) return false;
      if (filterRoleId !== 'all' && p.role_id !== filterRoleId) return false;
      if (filterTreatmentId !== 'all') {
        const tids = profTreatmentMap[p.id] || [];
        if (!tids.includes(filterTreatmentId)) return false;
      }
      if (search) {
        const s = search.toLowerCase();
        const cpfDigits = search.replace(/\D/g, '');
        const matchName = p.full_name.toLowerCase().includes(s);
        const matchCpf = cpfDigits.length >= 3 && (p.cpf || '').includes(cpfDigits);
        const matchPhone = (p.phone || '').replace(/\D/g, '').includes(cpfDigits);
        if (!matchName && !matchCpf && !matchPhone) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'full_name') cmp = a.full_name.localeCompare(b.full_name);
      else if (sortKey === 'status') cmp = a.status.localeCompare(b.status);
      else if (sortKey === 'created_at') cmp = a.created_at.localeCompare(b.created_at);
      return sortDir === 'desc' ? -cmp : cmp;
    });

    const totalPages = Math.max(1, Math.ceil(result.length / PAGE_SIZE));
    const start = (page - 1) * PAGE_SIZE;
    const paged = result.slice(start, start + PAGE_SIZE);
    return { filtered: result, totalPages, paged };
  }, [items, search, filterStatus, filterRoleId, filterTreatmentId, profTreatmentMap, sortKey, sortDir, page]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, filterStatus, filterRoleId, filterTreatmentId]);

  const activeRoles = roles.filter(r => r.status === 'active');
  const activeEntities = entities.filter(e => e.status === 'active');
  const activeCount = items.filter(p => p.status === 'active').length;
  const inactiveCount = items.filter(p => p.status === 'inactive').length;
  const hasActiveFilters = search || filterStatus !== 'all' || filterRoleId !== 'all' || filterTreatmentId !== 'all';

  const clearFilters = () => { setSearch(''); setFilterStatus('all'); setFilterRoleId('all'); setFilterTreatmentId('all'); };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-card">
          <CardContent className="pt-5 pb-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{items.length}</p>
              <p className="text-xs text-muted-foreground">Total cadastrados</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="pt-5 pb-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-green-500/10 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{activeCount}</p>
              <p className="text-xs text-muted-foreground">Ativos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="pt-5 pb-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center">
              <UserX className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{inactiveCount}</p>
              <p className="text-xs text-muted-foreground">Inativos</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters + action */}
      <Card className="shadow-card">
        <CardContent className="pt-5 pb-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar nome, CPF ou telefone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gradient-primary text-primary-foreground shadow-glow">
                  <Plus className="w-4 h-4 mr-2" />Novo Profissional
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />Cadastrar Profissional
                  </DialogTitle>
                  <DialogDescription>Preencha os dados do profissional. Campos com * são obrigatórios.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-2"><Users className="w-4 h-4 text-primary" />Dados Pessoais</p>
                    <Separator />
                    <div className="space-y-1.5">
                      <Label>Nome completo <span className="text-destructive">*</span></Label>
                      <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required placeholder="Nome do profissional" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>CPF</Label>
                        <Input value={form.cpf} onChange={e => handleCpfChange(e.target.value)} placeholder="000.000.000-00" className={cpfError ? 'border-destructive focus-visible:ring-destructive' : ''} />
                        {cpfError && <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{cpfError}</p>}
                      </div>
                      <div className="space-y-1.5">
                        <Label>User ID de acesso (opcional)</Label>
                        <Input value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} placeholder="Vincule apenas se possuir login" className="font-mono text-xs" />
                        <p className="text-xs text-muted-foreground">O profissional pode receber agendamentos sem possuir acesso ao sistema.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Email</Label>
                        <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@exemplo.com" />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <Label>Telefone principal</Label>
                          <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs" onClick={() => setAdditionalPhones(phones => phones.length < 10 ? [...phones, ''] : phones)} disabled={additionalPhones.length >= 10}>
                            <Plus className="h-3 w-3" />Adicionar telefone
                          </Button>
                        </div>
                        <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(00) 00000-0000" />
                      </div>
                    </div>
                    {additionalPhones.length > 0 && (
                      <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                        <p className="text-xs font-medium text-muted-foreground">Telefones adicionais</p>
                        {additionalPhones.map((phone, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <Input
                              value={phone}
                              onChange={event => setAdditionalPhones(phones => phones.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                              placeholder="(00) 00000-0000"
                              aria-label={`Telefone adicional ${index + 1}`}
                            />
                            <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => setAdditionalPhones(phones => phones.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remover telefone adicional ${index + 1}`}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-2"><Stethoscope className="w-4 h-4 text-primary" />Dados Profissionais</p>
                    <Separator />
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Especialidade</Label>
                        <Input value={form.specialty} onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))} placeholder="Ex: Dermatologia" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Nº Registro</Label>
                        <Input value={form.registration_number} onChange={e => setForm(f => ({ ...f, registration_number: e.target.value }))} placeholder="Ex: 123456" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Cargo <span className="text-destructive">*</span></Label>
                        <Select value={form.role_id} onValueChange={v => setForm(f => ({ ...f, role_id: v }))}>
                          <SelectTrigger className={!form.role_id ? 'text-muted-foreground' : ''}><SelectValue placeholder="Selecione o cargo" /></SelectTrigger>
                          <SelectContent>{activeRoles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                        </Select>
                        {activeRoles.length === 0 && <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Cadastre um cargo primeiro</p>}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Entidade de classe <span className="text-destructive">*</span></Label>
                        <Select value={form.class_entity_id} onValueChange={v => setForm(f => ({ ...f, class_entity_id: v }))}>
                          <SelectTrigger className={!form.class_entity_id ? 'text-muted-foreground' : ''}><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>{activeEntities.map(e => <SelectItem key={e.id} value={e.id}>{e.abbreviation} — {e.name}</SelectItem>)}</SelectContent>
                        </Select>
                        {activeEntities.length === 0 && <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Cadastre uma entidade de classe primeiro</p>}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-2"><Stethoscope className="w-4 h-4 text-primary" />Tratamentos Realizados</p>
                    <Separator />
                    <div className="border rounded-lg p-3 max-h-44 overflow-y-auto space-y-1.5 bg-muted/30">
                      {treatments.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-3">Nenhum tratamento ativo.</p>
                      ) : treatments.map(t => (
                        <label key={t.id} className="flex items-center gap-2.5 text-sm cursor-pointer hover:bg-muted/50 rounded-md px-2 py-1.5 transition-colors">
                          <Checkbox checked={selectedTreatments.includes(t.id)} onCheckedChange={() => setSelectedTreatments(prev => prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id])} />
                          {t.name}
                        </label>
                      ))}
                    </div>
                    {selectedTreatments.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">{selectedTreatments.length} selecionado(s)</Badge>
                        <Button type="button" variant="ghost" size="sm" className="text-xs h-6" onClick={() => setSelectedTreatments([])}>Limpar</Button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" />Unidades de atendimento</p>
                    <Separator />
                    <p className="text-xs text-muted-foreground">Defina em quais unidades este profissional realiza atendimentos. Selecione uma ou mais unidades.</p>
                    {locations.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                        Nenhuma unidade cadastrada. Cadastre uma unidade em Configurações → Geral antes de definir onde o profissional atende.
                      </div>
                    ) : (
                      <div className="border rounded-lg p-3 max-h-44 overflow-y-auto space-y-1.5 bg-muted/30">
                        {locations.map(location => {
                          const checked = selectedCreateLocationIds.includes(location.id);
                          return (
                            <label key={location.id} className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm ${location.active ? 'cursor-pointer hover:bg-muted/50' : 'cursor-not-allowed opacity-60'}`}>
                              <Checkbox
                                checked={checked}
                                disabled={!canManageLocations || !location.active}
                                onCheckedChange={() => toggleLocationSelection(location.id, setSelectedCreateLocationIds)}
                              />
                              <span className="flex-1">{location.name}</span>
                              {location.is_primary && <Badge variant="secondary" className="text-[10px]">Principal</Badge>}
                              {!location.active && <Badge variant="outline" className="text-[10px]">Inativa</Badge>}
                            </label>
                          );
                        })}
                      </div>
                    )}
                    {locations.length > 0 && selectedCreateLocationIds.length === 0 && (
                      <p className="text-xs text-amber-700 flex items-start gap-1.5">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Este profissional ficará sem unidade e não terá disponibilidade válida.
                      </p>
                    )}
                  </div>
                  <Separator />
                  <Button type="submit" disabled={saving || !form.role_id || !form.class_entity_id} className="w-full gradient-primary text-primary-foreground shadow-glow">
                    {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : <><Plus className="w-4 h-4 mr-2" />Cadastrar Profissional</>}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Filter row */}
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterRoleId} onValueChange={setFilterRoleId}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Cargo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os cargos</SelectItem>
                {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterTreatmentId} onValueChange={setFilterTreatmentId}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Tratamento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tratamentos</SelectItem>
                {treatments.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs h-8 gap-1 text-muted-foreground">
                <X className="w-3 h-3" />Limpar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <Card className="shadow-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5 text-primary" />Profissionais</CardTitle>
              <CardDescription>
                {filtered.length === items.length
                  ? `${filtered.length} profissional(is)`
                  : `${filtered.length} de ${items.length} (filtrado)`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => toggleSort('full_name')}>
                Nome <ArrowUpDown className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => toggleSort('status')}>
                Status <ArrowUpDown className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => toggleSort('created_at')}>
                Data <ArrowUpDown className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {paged.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">Nenhum profissional encontrado</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Ajuste os filtros ou cadastre um novo profissional.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {paged.map(p => {
                const role = roles.find(r => r.id === p.role_id);
                const entity = entities.find(e => e.id === p.class_entity_id);
                const tids = profTreatmentMap[p.id] || [];
                const treatmentNames = tids.map(tid => treatments.find(tr => tr.id === tid)?.name).filter(Boolean);
                const linkedLocationIds = professionalLocationLinks
                  .filter(link => link.professionalId === p.id && link.active)
                  .map(link => link.locationId);
                const linkedLocations = linkedLocationIds
                  .map(locationId => locations.find(location => location.id === locationId))
                  .filter((location): location is LocationOption => Boolean(location));
                const isInactive = p.status === 'inactive';

                return (
                  <div key={p.id} className={`rounded-xl border p-4 transition-all hover:shadow-md ${isInactive ? 'opacity-60 bg-muted/30' : 'bg-card'}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 min-w-0 flex-1">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold ${isInactive ? 'bg-muted text-muted-foreground' : 'gradient-primary text-primary-foreground shadow-glow'}`}>
                          {p.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-foreground">{p.full_name}</p>
                            <Badge variant={isInactive ? 'secondary' : 'default'} className="text-[10px] px-1.5 py-0">
                              {isInactive ? 'Inativo' : 'Ativo'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                            {role && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{role.name}</span>}
                            {entity && <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" />{entity.abbreviation}{p.registration_number ? ` ${p.registration_number}` : ''}</span>}
                            {p.specialty && <span>• {p.specialty}</span>}
                            {p.cpf && <span className="font-mono">• CPF: {formatCPF(p.cpf)}</span>}
                            {p.phone && <span>• {p.phone}</span>}
                            {p.additional_phones?.map((phone, index) => <span key={`${p.id}-phone-${index}`}>• {phone}</span>)}
                          </div>
                          {treatmentNames.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {treatmentNames.map((n, i) => (
                                <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0 font-normal">{n}</Badge>
                              ))}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-1 mt-2">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mr-1">Unidades</span>
                            {linkedLocations.length === 0 ? (
                              <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 font-normal">Sem unidade</Badge>
                            ) : linkedLocations.map(location => (
                              <Badge key={location.id} variant="outline" className={`text-[10px] px-1.5 py-0 font-normal ${!location.active ? 'opacity-60' : ''}`}>
                                {location.name}{location.is_primary ? ' · Principal' : ''}{!location.active ? ' · Inativa' : ''}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button size="sm" variant="outline" disabled={!canManageLocations} onClick={() => openLocationEditor(p)}>
                          <Building2 className="w-4 h-4 mr-1" />Unidades
                        </Button>
                        <Button size="sm" variant={isInactive ? 'default' : 'outline'}
                          className={isInactive ? '' : 'text-destructive border-destructive/30 hover:bg-destructive/10'}
                          onClick={() => setConfirmToggle({ id: p.id, name: p.full_name, current: p.status })}>
                          {isInactive ? <><UserCheck className="w-4 h-4 mr-1" />Reativar</> : <><UserX className="w-4 h-4 mr-1" />Inativar</>}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <p className="text-xs text-muted-foreground">
                Página {page} de {totalPages} · {filtered.length} resultado(s)
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<(number | 'ellipsis')[]>((acc, p, i, arr) => {
                    if (i > 0 && p - (arr[i - 1]) > 1) acc.push('ellipsis');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === 'ellipsis' ? (
                      <span key={`e${i}`} className="px-1 text-xs text-muted-foreground">…</span>
                    ) : (
                      <Button key={p} variant={page === p ? 'default' : 'outline'} size="sm" className="h-8 w-8 p-0 text-xs" onClick={() => setPage(p)}>
                        {p}
                      </Button>
                    )
                  )}
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(locationEditorProfessional)}
        onOpenChange={isOpen => {
          if (!isOpen && !savingLocations) {
            setLocationEditorProfessional(null);
            setSelectedEditorLocationIds([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />Unidades de atendimento
            </DialogTitle>
            <DialogDescription>
              Defina em quais unidades {locationEditorProfessional?.full_name} realiza atendimentos. Selecione uma ou mais unidades.
            </DialogDescription>
          </DialogHeader>
          {locations.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Nenhuma unidade cadastrada. Cadastre uma unidade em Configurações → Geral antes de definir onde o profissional atende.
            </div>
          ) : (
            <div className="space-y-2 rounded-lg border p-3">
              {locations.map(location => {
                const checked = selectedEditorLocationIds.includes(location.id);
                const cannotAddInactive = !location.active && !checked;
                return (
                  <label key={location.id} className={`flex items-center gap-3 rounded-md px-2 py-2 ${cannotAddInactive ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-muted/50'}`}>
                    <Checkbox
                      checked={checked}
                      disabled={!canManageLocations || cannotAddInactive || savingLocations}
                      onCheckedChange={() => toggleLocationSelection(location.id, setSelectedEditorLocationIds)}
                    />
                    <span className="flex-1 text-sm">{location.name}</span>
                    {location.is_primary && <Badge variant="secondary" className="text-[10px]">Principal</Badge>}
                    {!location.active && <Badge variant="outline" className="text-[10px]">Inativa</Badge>}
                  </label>
                );
              })}
            </div>
          )}
          {locations.length > 0 && selectedEditorLocationIds.length === 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Sem uma unidade vinculada, o profissional não terá disponibilidade válida para novos agendamentos.
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={savingLocations} onClick={() => setLocationEditorProfessional(null)}>Cancelar</Button>
            <Button disabled={savingLocations || !canManageLocations || locations.length === 0} onClick={() => void saveProfessionalLocations()}>
              {savingLocations && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar unidades
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog */}
      <AlertDialog open={!!confirmToggle} onOpenChange={o => !o && setConfirmToggle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              {confirmToggle?.current === 'active' ? 'Inativar profissional?' : 'Reativar profissional?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmToggle?.current === 'active'
                ? `O profissional "${confirmToggle?.name}" será inativado e não aparecerá mais em agendamentos e sessões.`
                : `O profissional "${confirmToggle?.name}" será reativado e voltará a aparecer no sistema.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggling}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmToggle} disabled={toggling}
              className={confirmToggle?.current === 'active' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}>
              {toggling && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {confirmToggle?.current === 'active' ? 'Sim, inativar' : 'Sim, reativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
