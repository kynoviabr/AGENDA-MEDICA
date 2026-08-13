import { useState } from 'react';
import { useClassEntities } from '@/hooks/useClassEntities';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Loader2, Search, Building2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const classEntityTemplates = [
  { abbreviation: 'CRM', name: 'Conselho Regional de Medicina', linked_professionals: 'Médicos, dermatologistas, nutrólogos, endocrinologistas, cirurgiões plásticos e responsáveis técnicos médicos', description: 'Conselho profissional regional da medicina.' },
  { abbreviation: 'CFM', name: 'Conselho Federal de Medicina', linked_professionals: 'Órgão federal que regulamenta a medicina no Brasil', description: 'Órgão federal regulador da medicina.' },
  { abbreviation: 'CRBM', name: 'Conselho Regional de Biomedicina', linked_professionals: 'Biomédicos estetas, biomédicos habilitados em procedimentos estéticos', description: 'Conselho profissional regional da biomedicina.' },
  { abbreviation: 'CFBM', name: 'Conselho Federal de Biomedicina', linked_professionals: 'Órgão federal da biomedicina', description: 'Órgão federal regulador da biomedicina.' },
  { abbreviation: 'CREFITO', name: 'Conselho Regional de Fisioterapia e Terapia Ocupacional', linked_professionals: 'Fisioterapeutas dermato-funcionais, fisioterapeutas atuantes em estética corporal e reabilitação', description: 'Conselho regional de fisioterapia e terapia ocupacional.' },
  { abbreviation: 'COFFITO', name: 'Conselho Federal de Fisioterapia e Terapia Ocupacional', linked_professionals: 'Órgão federal da fisioterapia e terapia ocupacional', description: 'Órgão federal regulador da fisioterapia e terapia ocupacional.' },
  { abbreviation: 'COREN', name: 'Conselho Regional de Enfermagem', linked_professionals: 'Enfermeiros, técnicos e auxiliares de enfermagem', description: 'Conselho regional da enfermagem.' },
  { abbreviation: 'COFEN', name: 'Conselho Federal de Enfermagem', linked_professionals: 'Órgão federal da enfermagem', description: 'Órgão federal regulador da enfermagem.' },
  { abbreviation: 'CRO', name: 'Conselho Regional de Odontologia', linked_professionals: 'Cirurgiões-dentistas, harmonização orofacial, estética facial odontológica', description: 'Conselho regional da odontologia.' },
  { abbreviation: 'CFO', name: 'Conselho Federal de Odontologia', linked_professionals: 'Órgão federal da odontologia', description: 'Órgão federal regulador da odontologia.' },
  { abbreviation: 'CRN', name: 'Conselho Regional de Nutricionistas', linked_professionals: 'Nutricionistas, profissionais de emagrecimento, reeducação alimentar e acompanhamento nutricional', description: 'Conselho regional da nutrição.' },
  { abbreviation: 'CFN', name: 'Conselho Federal de Nutricionistas', linked_professionals: 'Órgão federal da nutrição', description: 'Órgão federal regulador da nutrição.' },
  { abbreviation: 'CRF', name: 'Conselho Regional de Farmácia', linked_professionals: 'Farmacêuticos estetas, farmacêuticos responsáveis por manipulação, cosméticos ou procedimentos permitidos', description: 'Conselho regional da farmácia.' },
  { abbreviation: 'CFF', name: 'Conselho Federal de Farmácia', linked_professionals: 'Órgão federal da farmácia', description: 'Órgão federal regulador da farmácia.' },
  { abbreviation: 'CREF', name: 'Conselho Regional de Educação Física', linked_professionals: 'Profissionais de educação física, personal trainers, acompanhamento físico e programas de emagrecimento', description: 'Conselho regional da educação física.' },
  { abbreviation: 'CONFEF', name: 'Conselho Federal de Educação Física', linked_professionals: 'Órgão federal da educação física', description: 'Órgão federal regulador da educação física.' },
  { abbreviation: 'CRP', name: 'Conselho Regional de Psicologia', linked_professionals: 'Psicólogos, apoio comportamental, compulsão alimentar, autoestima e acompanhamento emocional', description: 'Conselho regional da psicologia.' },
  { abbreviation: 'CFP', name: 'Conselho Federal de Psicologia', linked_professionals: 'Órgão federal da psicologia', description: 'Órgão federal regulador da psicologia.' },
  { abbreviation: 'CRA', name: 'Conselho Regional de Administração', linked_professionals: 'Administradores, gestores administrativos, consultores de gestão, quando registrados', description: 'Conselho regional da administração.' },
  { abbreviation: 'CFA', name: 'Conselho Federal de Administração', linked_professionals: 'Órgão federal da administração', description: 'Órgão federal regulador da administração.' },
] as const;

export default function ClassEntitiesTab() {
  const { items, loading, create, toggleStatus } = useClassEntities();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [abbreviation, setAbbreviation] = useState('');
  const [description, setDescription] = useState('');
  const [linkedProfessionals, setLinkedProfessionals] = useState('');
  const [templateAbbreviation, setTemplateAbbreviation] = useState('');
  const [search, setSearch] = useState('');
  const [confirmToggle, setConfirmToggle] = useState<{ id: string; name: string; current: string } | null>(null);
  const [toggling, setToggling] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !abbreviation.trim()) { toast.error('Preencha todos os campos obrigatórios'); return; }
    setSaving(true);
    const result = await create({
      name: name.trim(),
      abbreviation: abbreviation.trim().toUpperCase(),
      description: description.trim() || null,
      linked_professionals: linkedProfessionals.trim() || null,
      status: 'active',
    });
    setSaving(false);
    if (result) {
      setOpen(false);
      setName('');
      setAbbreviation('');
      setDescription('');
      setLinkedProfessionals('');
      setTemplateAbbreviation('');
    }
  };

  const handleConfirmToggle = async () => {
    if (!confirmToggle) return;
    setToggling(true);
    await toggleStatus(confirmToggle.id, confirmToggle.current);
    setToggling(false);
    setConfirmToggle(null);
  };

  const filtered = items.filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.abbreviation.toLowerCase().includes(search.toLowerCase()));
  const activeCount = items.filter(e => e.status === 'active').length;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="shadow-card">
          <CardContent className="pt-5 pb-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{items.length}</p>
              <p className="text-xs text-muted-foreground">Total de entidades</p>
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
              <p className="text-xs text-muted-foreground">Ativas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters + action */}
      <Card className="shadow-card">
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar por nome ou sigla..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-64" />
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gradient-primary text-primary-foreground shadow-glow">
                  <Plus className="w-4 h-4 mr-2" />Nova Entidade
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><Building2 className="w-5 h-5 text-primary" />Cadastrar Entidade de Classe</DialogTitle>
                  <DialogDescription>Registre um conselho ou órgão de classe profissional.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Modelo de conselho (opcional)</Label>
                    <Select
                      value={templateAbbreviation}
                      onValueChange={(value) => {
                        setTemplateAbbreviation(value);
                        const selected = classEntityTemplates.find((item) => item.abbreviation === value);
                        if (!selected) return;
                        setAbbreviation(selected.abbreviation);
                        setName(selected.name);
                        setDescription(selected.description);
                        setLinkedProfessionals(selected.linked_professionals);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um conselho para autopreencher" />
                      </SelectTrigger>
                      <SelectContent>
                        {classEntityTemplates.map((template) => (
                          <SelectItem key={template.abbreviation} value={template.abbreviation}>
                            {template.abbreviation} — {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nome completo <span className="text-destructive">*</span></Label>
                    <Input value={name} onChange={e => setName(e.target.value)} required placeholder="Ex: Conselho Regional de Medicina" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Sigla <span className="text-destructive">*</span></Label>
                    <Input value={abbreviation} onChange={e => setAbbreviation(e.target.value)} required placeholder="Ex: CRM, COREN, CRO" className="uppercase" />
                    <p className="text-xs text-muted-foreground">A sigla será salva em maiúsculas automaticamente.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Descrição</Label>
                    <Textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="Descrição da entidade/conselho"
                      rows={2}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Profissionais geralmente vinculados</Label>
                    <Textarea
                      value={linkedProfessionals}
                      onChange={e => setLinkedProfessionals(e.target.value)}
                      placeholder="Ex: Biomédicos estetas, fisioterapeutas dermato-funcionais..."
                      rows={3}
                    />
                  </div>
                  <Separator />
                  <Button type="submit" disabled={saving} className="w-full gradient-primary text-primary-foreground shadow-glow">
                    {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : <><Plus className="w-4 h-4 mr-2" />Cadastrar Entidade</>}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5 text-primary" />Entidades de Classe</CardTitle>
          <CardDescription>{filtered.length} entidade(s) encontrada(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">Nenhuma entidade encontrada</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Cadastre uma nova entidade de classe.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(e => {
                const isInactive = e.status === 'inactive';
                return (
                  <div key={e.id} className={`rounded-xl border p-4 transition-all hover:shadow-md flex items-center justify-between gap-4 ${isInactive ? 'opacity-60 bg-muted/30' : 'bg-card'}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${isInactive ? 'bg-muted text-muted-foreground' : 'gradient-primary text-primary-foreground shadow-glow'}`}>
                        {e.abbreviation.slice(0, 3)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-foreground">{e.abbreviation}</p>
                          <Badge variant={isInactive ? 'secondary' : 'default'} className="text-[10px] px-1.5 py-0">{isInactive ? 'Inativa' : 'Ativa'}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{e.name}</p>
                        {e.linked_professionals && (
                          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{e.linked_professionals}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={isInactive ? 'default' : 'outline'}
                      className={isInactive ? '' : 'text-destructive border-destructive/30 hover:bg-destructive/10'}
                      onClick={() => setConfirmToggle({ id: e.id, name: `${e.abbreviation} — ${e.name}`, current: e.status })}
                    >
                      {isInactive ? 'Reativar' : 'Inativar'}
                    </Button>
                  </div>
                );
              })}
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
              {confirmToggle?.current === 'active' ? 'Inativar entidade?' : 'Reativar entidade?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmToggle?.current === 'active'
                ? `A entidade "${confirmToggle?.name}" será inativada e não aparecerá em novos cadastros de profissionais.`
                : `A entidade "${confirmToggle?.name}" será reativada e estará disponível novamente.`}
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
