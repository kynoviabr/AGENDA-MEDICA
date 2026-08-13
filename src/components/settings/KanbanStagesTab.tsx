import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Lock, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

type StageDefinition = {
  code: string;
  label: string;
  description: string;
  isSystem?: boolean;
};

const defaultStages: StageDefinition[] = [
  { code: 'new_lead', label: 'Novo Lead', description: 'Entradas novas sem contato.', isSystem: true },
  { code: 'contacted', label: 'Contato Iniciado', description: 'Primeiro contato em andamento.', isSystem: true },
  { code: 'scheduled', label: 'Agendado', description: 'Avaliação marcada e acompanhada.', isSystem: true },
  { code: 'proposal_sent', label: 'Proposta', description: 'Proposta criada ou em negociação.', isSystem: true },
  { code: 'closed_won', label: 'Fechado', description: 'Venda convertida em paciente.', isSystem: true },
  { code: 'closed_lost', label: 'Perdido', description: 'Lead encerrado com motivo.', isSystem: true },
];

function slugifyStageCode(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeStageCode(code?: string | null) {
  if (!code) return 'new_lead';
  if (code === 'attended' || code === 'negotiating') return 'proposal_sent';
  return code;
}

export default function KanbanStagesTab() {
  const { clinicId, role } = useUserRole();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [stageDraft, setStageDraft] = useState({ label: '', description: '' });

  const stageSettingsQuery = useQuery({
    queryKey: ['crm-stage-settings', clinicId],
    queryFn: async () => {
      if (!clinicId) return defaultStages;
      const { data, error } = await supabase
        .from('clinic_settings')
        .select('value')
        .eq('clinic_id', clinicId)
        .eq('key', 'crm_kanban_stages')
        .maybeSingle();
      if (error) throw error;
      if (!data?.value) return defaultStages;
      try {
        const parsed = JSON.parse(data.value);
        if (!Array.isArray(parsed) || parsed.length === 0) return defaultStages;
        return parsed.map((stage: { code?: string; label?: string; description?: string }) => ({
          code: normalizeStageCode(stage.code),
          label: stage.label || stage.code || 'Etapa',
          description: stage.description || '',
          isSystem: !!defaultStages.find((item) => item.code === normalizeStageCode(stage.code)),
        }));
      } catch {
        return defaultStages;
      }
    },
    enabled: !!clinicId,
  });

  const stages = stageSettingsQuery.data || defaultStages;

  const leadUsageQuery = useQuery({
    queryKey: ['crm-stage-usage', clinicId],
    queryFn: async () => {
      if (!clinicId) return {} as Record<string, number>;
      const { data, error } = await supabase
        .from('leads')
        .select('kanban_stage')
        .eq('clinic_id', clinicId);
      if (error) throw error;
      return (data || []).reduce<Record<string, number>>((acc, row: { kanban_stage: string }) => {
        const stage = normalizeStageCode(row.kanban_stage);
        acc[stage] = (acc[stage] || 0) + 1;
        return acc;
      }, {});
    },
    enabled: !!clinicId,
  });

  const usageMap = useMemo(() => leadUsageQuery.data || {}, [leadUsageQuery.data]);

  const saveStagesMutation = useMutation({
    mutationFn: async (nextStages: StageDefinition[]) => {
      if (!clinicId) return;
      const payload = JSON.stringify(
        nextStages.map((stage) => ({
          code: stage.code,
          label: stage.label,
          description: stage.description,
        }))
      );

      const { data: existing, error: existingError } = await supabase
        .from('clinic_settings')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('key', 'crm_kanban_stages')
        .maybeSingle();
      if (existingError) throw existingError;

      if (existing?.id) {
        const { error } = await supabase
          .from('clinic_settings')
          .update({ value: payload })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('clinic_settings')
          .insert({ clinic_id: clinicId, key: 'crm_kanban_stages', value: payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-stage-settings'] });
      toast({ title: 'Etapas do Kanban atualizadas' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao salvar etapas', description: error.message, variant: 'destructive' });
    },
  });

  const canEdit = role === 'admin';

  const addStage = () => {
    if (!canEdit) return;
    const label = stageDraft.label.trim();
    if (!label) {
      toast({ title: 'Informe o nome da etapa', variant: 'destructive' });
      return;
    }
    const code = slugifyStageCode(label);
    if (!code) {
      toast({ title: 'Nome inválido', variant: 'destructive' });
      return;
    }
    if (stages.some((stage) => stage.code === code)) {
      toast({ title: 'Já existe uma etapa com esse nome', variant: 'destructive' });
      return;
    }
    saveStagesMutation.mutate([
      ...stages,
      {
        code,
        label,
        description: stageDraft.description.trim() || 'Etapa personalizada do processo comercial.',
        isSystem: false,
      },
    ]);
    setStageDraft({ label: '', description: '' });
  };

  const moveStage = (stageCode: string, direction: -1 | 1) => {
    if (!canEdit) return;
    const index = stages.findIndex((stage) => stage.code === stageCode);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= stages.length) return;
    const next = [...stages];
    const [moved] = next.splice(index, 1);
    next.splice(nextIndex, 0, moved);
    saveStagesMutation.mutate(next);
  };

  const removeStage = (stageCode: string) => {
    if (!canEdit) return;
    const target = stages.find((stage) => stage.code === stageCode);
    if (!target || target.isSystem) return;
    if ((usageMap[stageCode] || 0) > 0) {
      toast({
        title: 'Etapa em uso',
        description: 'Mova os leads dessa etapa antes de removê-la.',
        variant: 'destructive',
      });
      return;
    }
    saveStagesMutation.mutate(stages.filter((stage) => stage.code !== stageCode));
  };

  const totalLeadsInPipeline = useMemo(
    () => Object.values(usageMap).reduce((acc, count) => acc + Number(count || 0), 0),
    [usageMap]
  );

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>CRM Kanban — Etapas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-xl border bg-slate-50/70 p-4">
          <p className="text-sm font-medium text-slate-900">Padrão recomendado</p>
          <p className="mt-1 text-xs text-slate-500">
            Novo Lead · Contato Iniciado · Agendado · Proposta · Fechado · Perdido
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Leads atualmente distribuídos nas etapas: <span className="font-semibold text-slate-700">{totalLeadsInPipeline}</span>
          </p>
        </div>

        <div className="space-y-2">
          {stages.map((stage, index) => (
            <div key={stage.code} className="flex items-center gap-2 rounded-xl border px-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-900">{stage.label}</p>
                  {stage.isSystem && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                      <Lock className="h-3 w-3" /> padrão
                    </span>
                  )}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                    {usageMap[stage.code] || 0} lead(s)
                  </span>
                </div>
                <p className="text-xs text-slate-500">{stage.description || 'Sem descrição.'}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => moveStage(stage.code, -1)} disabled={!canEdit || index === 0 || saveStagesMutation.isPending}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => moveStage(stage.code, 1)} disabled={!canEdit || index === stages.length - 1 || saveStagesMutation.isPending}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                {!stage.isSystem && (
                  <Button size="sm" variant="outline" className="h-8 px-2 text-rose-600" onClick={() => removeStage(stage.code)} disabled={!canEdit || saveStagesMutation.isPending}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border p-4">
          <p className="text-sm font-medium text-slate-900">Adicionar nova etapa</p>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1.2fr_auto]">
            <Input
              value={stageDraft.label}
              onChange={(event) => setStageDraft((current) => ({ ...current, label: event.target.value }))}
              placeholder="Nome da etapa"
              disabled={!canEdit}
            />
            <Input
              value={stageDraft.description}
              onChange={(event) => setStageDraft((current) => ({ ...current, description: event.target.value }))}
              placeholder="Descrição curta"
              disabled={!canEdit}
            />
            <Button onClick={addStage} disabled={!canEdit || saveStagesMutation.isPending}>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
