import { useState } from 'react';
import { useRoles } from '@/hooks/useRoles';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Plus, Loader2, Search, Briefcase, ShieldCheck, UserX, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const roleTemplates = [
  { name: 'Gestor(a) da Clínica', description: 'Responsável pela gestão geral da clínica, acompanhando resultados, equipe, metas e operação. Define prioridades, controla indicadores e garante processos. Atua na tomada de decisão estratégica, financeira e comercial.' },
  { name: 'Coordenador(a) Operacional', description: 'Organiza a rotina diária da clínica, agenda da equipe e fluxo de atendimentos. Garante salas, profissionais e equipamentos disponíveis no momento correto. Atua como ponte entre recepção, equipe técnica e gestão.' },
  { name: 'Recepcionista', description: 'Realiza o primeiro atendimento ao paciente, presencialmente, por telefone ou WhatsApp. Confirma agendas, cadastra clientes, orienta horários e direciona o paciente. Apoia no controle de presença e reagendamentos.' },
  { name: 'Consultor(a) Comercial / Vendas', description: 'Conduz avaliações comerciais, apresenta tratamentos, planos e condições de pagamento. Faz follow-up com leads, recupera oportunidades e converte avaliações em contratos. Registra negociações e mantém relacionamento.' },
  { name: 'Avaliador(a) / Consultor(a) de Tratamentos', description: 'Realiza a avaliação inicial do paciente, entende objetivos, queixas e expectativas. Indica protocolos estéticos ou de emagrecimento conforme necessidade e regras da clínica. Pode apoiar o comercial na proposta.' },
  { name: 'Biomédico(a) Esteta', description: 'Executa procedimentos estéticos autorizados pela formação e habilitação profissional. Avalia condições do paciente, aplica protocolos e acompanha evolução. Orienta cuidados pré e pós-procedimento.' },
  { name: 'Esteticista', description: 'Realiza procedimentos estéticos faciais e corporais, como limpeza de pele, drenagem, massagens, protocolos corporais e aparelhos. Prepara sala, organiza materiais e acompanha evolução conforme protocolos da clínica.' },
  { name: 'Fisioterapeuta Dermato-Funcional', description: 'Atua em tratamentos corporais, pós-operatórios, drenagem linfática e recursos terapêuticos. Avalia o paciente e aplica técnicas voltadas à estética, recuperação e bem-estar.' },
  { name: 'Nutricionista', description: 'Avalia hábitos alimentares, composição corporal e objetivos de emagrecimento/saúde. Prescreve planos alimentares conforme atuação profissional e acompanha evolução integrada aos protocolos da clínica.' },
  { name: 'Médico(a) / Responsável Técnico', description: 'Atua na avaliação, prescrição e acompanhamento de procedimentos que exigem responsabilidade médica. Garante segurança clínica, protocolos adequados e conformidade com normas profissionais.' },
  { name: 'Enfermeiro(a)', description: 'Apoia procedimentos clínicos e estéticos conforme habilitação e normas aplicáveis. Realiza cuidados, preparo do paciente, controle de materiais e suporte técnico. Pode acompanhar biossegurança e rotinas assistenciais.' },
  { name: 'Auxiliar de Sala / Apoio Técnico', description: 'Prepara salas, materiais, macas, equipamentos e produtos antes dos atendimentos. Auxilia profissionais técnicos na rotina e higienização entre procedimentos, garantindo fluidez e segurança operacional.' },
  { name: 'Administrativo / Financeiro', description: 'Controla pagamentos, contratos, parcelas previstas, cobranças administrativas e documentação. Apoia emissão de recibos, controle de caixa, relatórios, fornecedores, compras e despesas.' },
  { name: 'Marketing / Social Media', description: 'Cuida de redes sociais, campanhas, conteúdos, fotos, vídeos e divulgação dos tratamentos. Apoia ações de captação de leads, relacionamento com pacientes e fortalecimento da marca.' },
  { name: 'Auxiliar de Limpeza / Serviços Gerais', description: 'Responsável pela limpeza, higienização e organização dos ambientes da clínica. Mantém recepção, banheiros, salas e áreas comuns em condições adequadas para biossegurança e boa experiência.' },
] as const;

export default function RolesTab() {
  const { items, loading, create, toggleStatus } = useRoles();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [search, setSearch] = useState('');
  const [confirmToggle, setConfirmToggle] = useState<{ id: string; name: string; current: string } | null>(null);
  const [toggling, setToggling] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Informe o nome do cargo'); return; }
    setSaving(true);
    const result = await create({ name: name.trim(), description: description.trim() || null, status: 'active' });
    setSaving(false);
    if (result) { setOpen(false); setName(''); setDescription(''); setTemplateName(''); }
  };

  const handleConfirmToggle = async () => {
    if (!confirmToggle) return;
    setToggling(true);
    await toggleStatus(confirmToggle.id, confirmToggle.current);
    setToggling(false);
    setConfirmToggle(null);
  };

  const filtered = items.filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()));
  const activeCount = items.filter(r => r.status === 'active').length;

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
              <Briefcase className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{items.length}</p>
              <p className="text-xs text-muted-foreground">Total de cargos</p>
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
      </div>

      {/* Filters + action */}
      <Card className="shadow-card">
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar cargo..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-56" />
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gradient-primary text-primary-foreground shadow-glow">
                  <Plus className="w-4 h-4 mr-2" />Novo Cargo
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><Briefcase className="w-5 h-5 text-primary" />Cadastrar Cargo/Função</DialogTitle>
                  <DialogDescription>Defina um cargo que será vinculado aos profissionais.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Modelo de cargo (opcional)</Label>
                    <Select
                      value={templateName}
                      onValueChange={(value) => {
                        setTemplateName(value);
                        const selected = roleTemplates.find((item) => item.name === value);
                        if (!selected) return;
                        setName(selected.name);
                        setDescription(selected.description);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um cargo padrão para autopreencher" />
                      </SelectTrigger>
                      <SelectContent>
                        {roleTemplates.map((template) => (
                          <SelectItem key={template.name} value={template.name}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nome do cargo <span className="text-destructive">*</span></Label>
                    <Input value={name} onChange={e => setName(e.target.value)} required placeholder="Ex: Esteticista, Biomédica, Fisioterapeuta" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Descrição</Label>
                    <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição das atribuições do cargo (opcional)" rows={3} />
                  </div>
                  <Separator />
                  <Button type="submit" disabled={saving} className="w-full gradient-primary text-primary-foreground shadow-glow">
                    {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : <><Plus className="w-4 h-4 mr-2" />Cadastrar Cargo</>}
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
          <CardTitle className="flex items-center gap-2"><Briefcase className="w-5 h-5 text-primary" />Cargos/Funções</CardTitle>
          <CardDescription>{filtered.length} cargo(s) encontrado(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <Briefcase className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">Nenhum cargo encontrado</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Cadastre um novo cargo para começar.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(r => {
                const isInactive = r.status === 'inactive';
                return (
                  <div key={r.id} className={`rounded-xl border p-4 transition-all hover:shadow-md flex items-center justify-between gap-4 ${isInactive ? 'opacity-60 bg-muted/30' : 'bg-card'}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isInactive ? 'bg-muted' : 'bg-primary/10'}`}>
                        <Briefcase className={`w-4 h-4 ${isInactive ? 'text-muted-foreground' : 'text-primary'}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-foreground">{r.name}</p>
                          <Badge variant={isInactive ? 'secondary' : 'default'} className="text-[10px] px-1.5 py-0">{isInactive ? 'Inativo' : 'Ativo'}</Badge>
                        </div>
                        {r.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.description}</p>}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={isInactive ? 'default' : 'outline'}
                      className={isInactive ? '' : 'text-destructive border-destructive/30 hover:bg-destructive/10'}
                      onClick={() => setConfirmToggle({ id: r.id, name: r.name, current: r.status })}
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
              {confirmToggle?.current === 'active' ? 'Inativar cargo?' : 'Reativar cargo?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmToggle?.current === 'active'
                ? `O cargo "${confirmToggle?.name}" será inativado e não poderá ser selecionado em novos cadastros. Profissionais já vinculados não serão alterados.`
                : `O cargo "${confirmToggle?.name}" será reativado e voltará a estar disponível.`}
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
