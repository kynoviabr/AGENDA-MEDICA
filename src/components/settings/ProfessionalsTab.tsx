import { useState, useEffect, useMemo } from 'react';
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

export default function ProfessionalsTab() {
  const { items, loading, create, toggleStatus } = useProfessionals();
  const { items: roles } = useRoles();
  const { items: entities } = useClassEntities();
  const { items: profTreatments, create: linkTreatment } = useProfessionalTreatments();
  const { clinicId } = useUserRole();

  const [treatments, setTreatments] = useState<unknown[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cpfError, setCpfError] = useState('');
  const [form, setForm] = useState({
    full_name: '', cpf: '', email: '', phone: '', specialty: '',
    registration_number: '', user_id: '', role_id: '', class_entity_id: '',
  });
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>([]);

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

  useEffect(() => {
    if (!clinicId) return;
    supabase.from('treatments').select('id, name').eq('clinic_id', clinicId).eq('is_active', true).order('name')
      .then(({ data }) => { if (data) setTreatments(data); });
  }, [clinicId]);

  const handleCpfChange = (value: string) => {
    const formatted = formatCPF(value);
    setForm(f => ({ ...f, cpf: formatted }));
    const digits = formatted.replace(/\D/g, '');
    setCpfError(digits.length === 11 && !isValidCPF(digits) ? 'CPF inválido' : '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) { toast.error('Informe o nome completo do profissional'); return; }
    if (!form.user_id.trim()) { toast.error('Informe o User ID do profissional'); return; }
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
      registration_number: form.registration_number || null, user_id: form.user_id,
      role_id: form.role_id, class_entity_id: form.class_entity_id, status: 'active',
    });
    if (result) {
      for (const tid of selectedTreatments) await linkTreatment(result.id, tid);
      setOpen(false);
      setForm({ full_name: '', cpf: '', email: '', phone: '', specialty: '', registration_number: '', user_id: '', role_id: '', class_entity_id: '' });
      setSelectedTreatments([]); setCpfError('');
    }
    setSaving(false);
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
                        <Label>User ID <span className="text-destructive">*</span></Label>
                        <Input value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} required placeholder="UUID do usuário" className="font-mono text-xs" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Email</Label>
                        <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@exemplo.com" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Telefone</Label>
                        <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(00) 00000-0000" />
                      </div>
                    </div>
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
                          </div>
                          {treatmentNames.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {treatmentNames.map((n, i) => (
                                <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0 font-normal">{n}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <Button size="sm" variant={isInactive ? 'default' : 'outline'}
                        className={isInactive ? '' : 'text-destructive border-destructive/30 hover:bg-destructive/10'}
                        onClick={() => setConfirmToggle({ id: p.id, name: p.full_name, current: p.status })}>
                        {isInactive ? <><UserCheck className="w-4 h-4 mr-1" />Reativar</> : <><UserX className="w-4 h-4 mr-1" />Inativar</>}
                      </Button>
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
