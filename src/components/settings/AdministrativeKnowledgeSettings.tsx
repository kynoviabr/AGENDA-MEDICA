import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpenCheck, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Policy = {
  arrival_minutes: number | null; arrival_instructions: string; required_documents: string[];
  companion_policy: string; children_policy: string; first_consultation_information: string;
  allowed_payment_methods: string[]; late_policy: string; cancellation_policy: string;
};
type Entry = { id: string; question: string; answer: string; keywords: string[]; status: 'draft' | 'published' | 'archived'; verified_at: string | null };

const emptyPolicy: Policy = {
  arrival_minutes: null, arrival_instructions: '', required_documents: [], companion_policy: '',
  children_policy: '', first_consultation_information: '', allowed_payment_methods: [], late_policy: '', cancellation_policy: '',
};

export default function AdministrativeKnowledgeSettings() {
  const { clinicId } = useBranding();
  const { role } = useUserRole();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canManage = role === 'admin';
  const [policy, setPolicy] = useState<Policy>(emptyPolicy);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [keywords, setKeywords] = useState('');

  const policyQuery = useQuery({
    queryKey: ['administrative-policy', clinicId], enabled: !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase.from('clinic_administrative_policies' as never)
        .select('arrival_minutes,arrival_instructions,required_documents,companion_policy,children_policy,first_consultation_information,allowed_payment_methods,late_policy,cancellation_policy')
        .eq('clinic_id', clinicId!).maybeSingle();
      if (error) throw error;
      const row = data as Partial<Policy> | null;
      return { ...emptyPolicy, ...row } as Policy;
    },
  });
  const entriesQuery = useQuery({
    queryKey: ['administrative-knowledge', clinicId], enabled: !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase.from('administrative_knowledge_entries' as never)
        .select('id,question,answer,keywords,status,verified_at').eq('clinic_id', clinicId!).eq('scope', 'clinic')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Entry[];
    },
  });
  useEffect(() => { if (policyQuery.data) setPolicy(policyQuery.data); }, [policyQuery.data]);

  const savePolicy = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('clinic_administrative_policies' as never).upsert({
        clinic_id: clinicId, ...policy,
        arrival_instructions: nullable(policy.arrival_instructions), companion_policy: nullable(policy.companion_policy),
        children_policy: nullable(policy.children_policy), first_consultation_information: nullable(policy.first_consultation_information),
        late_policy: nullable(policy.late_policy), cancellation_policy: nullable(policy.cancellation_policy),
      } as never, { onConflict: 'clinic_id' });
      if (error) throw error;
    },
    onSuccess: () => toast({ title: 'Políticas administrativas salvas' }),
    onError: (error: Error) => toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' }),
  });
  const createEntry = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('administrative_knowledge_entries' as never).insert({
        clinic_id: clinicId, topic: 'faq', scope: 'clinic', question: question.trim(), answer: answer.trim(),
        keywords: csv(keywords), status: 'draft', priority: 50,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { setQuestion(''); setAnswer(''); setKeywords(''); queryClient.invalidateQueries({ queryKey: ['administrative-knowledge', clinicId] }); },
  });
  const publish = useMutation({
    mutationFn: async (entry: Entry) => {
      const status = entry.status === 'published' ? 'draft' : 'published';
      const { error } = await supabase.from('administrative_knowledge_entries' as never)
        .update({ status, patient_visible: status === 'published', verified_at: status === 'published' ? new Date().toISOString() : null } as never)
        .eq('clinic_id', clinicId!).eq('id', entry.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['administrative-knowledge', clinicId] }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('administrative_knowledge_entries' as never).delete().eq('clinic_id', clinicId!).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['administrative-knowledge', clinicId] }),
  });

  if (policyQuery.isLoading || entriesQuery.isLoading) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Carregando base administrativa...</CardContent></Card>;
  if (policyQuery.error || entriesQuery.error) return <Card><CardContent className="p-6 text-sm text-destructive">A estrutura da Base de Conhecimento ainda precisa ser publicada no Supabase.</CardContent></Card>;
  return (
    <div className="space-y-4">
      <Card className="shadow-card">
        <CardHeader><CardTitle className="flex items-center gap-2"><BookOpenCheck className="h-5 w-5" />Base administrativa da Aura</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="flex gap-3 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p>A Aura responde somente com dados estruturados ou respostas publicadas e verificadas. Quando não existir informação, ela encaminhará a dúvida para a equipe.</p></div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Antecedência (minutos)"><Input type="number" min={0} max={180} value={policy.arrival_minutes ?? ''} disabled={!canManage} onChange={(e) => setPolicy({ ...policy, arrival_minutes: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="Orientação de chegada"><Input value={policy.arrival_instructions} disabled={!canManage} onChange={(e) => setPolicy({ ...policy, arrival_instructions: e.target.value })} /></Field>
            <Field label="Documentos necessários (separados por vírgula)"><Input value={policy.required_documents.join(', ')} disabled={!canManage} onChange={(e) => setPolicy({ ...policy, required_documents: csv(e.target.value) })} /></Field>
            <Field label="Formas de pagamento (separadas por vírgula)"><Input value={policy.allowed_payment_methods.join(', ')} disabled={!canManage} onChange={(e) => setPolicy({ ...policy, allowed_payment_methods: csv(e.target.value) })} /></Field>
            <Field label="Política de acompanhante"><Textarea rows={3} value={policy.companion_policy} disabled={!canManage} onChange={(e) => setPolicy({ ...policy, companion_policy: e.target.value })} /></Field>
            <Field label="Atendimento a crianças"><Textarea rows={3} value={policy.children_policy} disabled={!canManage} onChange={(e) => setPolicy({ ...policy, children_policy: e.target.value })} /></Field>
            <Field label="Primeira consulta"><Textarea rows={3} value={policy.first_consultation_information} disabled={!canManage} onChange={(e) => setPolicy({ ...policy, first_consultation_information: e.target.value })} /></Field>
            <Field label="Política de atraso"><Textarea rows={3} value={policy.late_policy} disabled={!canManage} onChange={(e) => setPolicy({ ...policy, late_policy: e.target.value })} /></Field>
            <Field label="Política de cancelamento"><Textarea rows={3} value={policy.cancellation_policy} disabled={!canManage} onChange={(e) => setPolicy({ ...policy, cancellation_policy: e.target.value })} /></Field>
          </div>
          <Button disabled={!canManage || savePolicy.isPending} onClick={() => savePolicy.mutate()}>Salvar políticas</Button>
        </CardContent>
      </Card>
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">Perguntas frequentes verificadas</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {canManage && <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-2">
            <Field label="Pergunta"><Input value={question} onChange={(e) => setQuestion(e.target.value)} /></Field>
            <Field label="Palavras-chave"><Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="estacionamento, vaga" /></Field>
            <div className="md:col-span-2"><Field label="Resposta confirmada"><Textarea rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} /></Field></div>
            <div className="md:col-span-2"><Button disabled={question.trim().length < 3 || answer.trim().length < 3 || createEntry.isPending} onClick={() => createEntry.mutate()}><Plus className="mr-2 h-4 w-4" />Adicionar como rascunho</Button></div>
          </div>}
          <div className="divide-y rounded-lg border">
            {(entriesQuery.data || []).map((entry) => <div key={entry.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between">
              <div><p className="font-medium">{entry.question}</p><p className="mt-1 text-sm text-muted-foreground">{entry.answer}</p><p className="mt-2 text-xs text-muted-foreground">{entry.status === 'published' ? 'Publicada e verificada' : 'Rascunho — não usado pela Aura'}</p></div>
              {canManage && <div className="flex shrink-0 gap-2"><Button size="sm" variant={entry.status === 'published' ? 'outline' : 'default'} onClick={() => publish.mutate(entry)}>{entry.status === 'published' ? 'Retirar' : 'Verificar e publicar'}</Button><Button size="icon" variant="ghost" onClick={() => remove.mutate(entry.id)}><Trash2 className="h-4 w-4" /></Button></div>}
            </div>)}
            {!entriesQuery.data?.length && <p className="p-4 text-sm text-muted-foreground">Nenhuma pergunta frequente cadastrada.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
function csv(value: string) { return value.split(',').map((item) => item.trim()).filter(Boolean); }
function nullable(value: string) { return value.trim() || null; }
