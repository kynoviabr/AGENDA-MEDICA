import { useState, useEffect, type FormEvent } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Plus, Activity } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { buildMetricNote, extractTreatmentIdFromNotes, getMetricOptionsForCategory } from '@/lib/evolutionMetrics';
type PatientRow = { id: string; full_name: string };
type TreatmentContextRow = { id: string; name: string; category: string | null };
type MetricRow = { id: string; recorded_at: string; value: number; unit: string; notes: string | null; metric_type: string };

export default function EvolutionPage() {
  const { clinicId } = useUserRole();
  const { toast } = useToast();
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [patientTreatments, setPatientTreatments] = useState<TreatmentContextRow[]>([]);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [selectedTreatment, setSelectedTreatment] = useState('');
  const [selectedMetric, setSelectedMetric] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form state
  const [formPatient, setFormPatient] = useState('');
  const [formTreatment, setFormTreatment] = useState('');
  const [formMetric, setFormMetric] = useState('');
  const [formValue, setFormValue] = useState('');
  const [formNotes, setFormNotes] = useState('');

  useEffect(() => {
    if (!clinicId) return;
    supabase.from('patients').select('id, full_name').eq('clinic_id', clinicId).eq('status', 'active')
      .then(({ data }) => { if (data) setPatients(data); });
  }, [clinicId]);

  useEffect(() => {
    if (!clinicId || !selectedPatient) { setMetrics([]); setLoading(false); return; }
    setLoading(true);
    supabase.from('patient_metrics')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('patient_id', selectedPatient)
      .order('recorded_at', { ascending: true })
      .then(({ data }) => { setMetrics((data || []) as MetricRow[]); setLoading(false); });
  }, [clinicId, selectedPatient]);

  useEffect(() => {
    if (!clinicId || !selectedPatient) {
      setPatientTreatments([]);
      setSelectedTreatment('');
      return;
    }
    const loadTreatmentContext = async () => {
      const { data: contracts } = await supabase
        .from('contracts')
        .select('proposal_id, status')
        .eq('clinic_id', clinicId)
        .eq('patient_id', selectedPatient);
      const proposalIds = (contracts || [])
        .filter((contract: { proposal_id: string | null; status?: string | null }) => !!contract.proposal_id)
        .map((contract: { proposal_id: string | null }) => contract.proposal_id as string);
      if (proposalIds.length === 0) {
        setPatientTreatments([]);
        setSelectedTreatment('');
        return;
      }

      const { data: items } = await supabase
        .from('proposal_items')
        .select('treatment_id, treatments(id, name, category)')
        .in('proposal_id', proposalIds);
      const map = new Map<string, TreatmentContextRow>();
      ((items || []) as Array<{ treatment_id: string; treatments?: { id?: string; name?: string; category?: string | null } | null }>).forEach((item) => {
        if (!item.treatment_id) return;
        if (!map.has(item.treatment_id)) {
          map.set(item.treatment_id, {
            id: item.treatment_id,
            name: item.treatments?.name || 'Tratamento',
            category: item.treatments?.category || null,
          });
        }
      });
      const list = Array.from(map.values());
      setPatientTreatments(list);
      setSelectedTreatment((current) => (current && map.has(current) ? current : list[0]?.id || ''));
    };
    void loadTreatmentContext();
  }, [clinicId, selectedPatient]);

  const availableMetricTypes = getMetricOptionsForCategory(
    patientTreatments.find((treatment) => treatment.id === selectedTreatment)?.category,
  );

  useEffect(() => {
    if (!availableMetricTypes.length) return;
    const hasCurrent = availableMetricTypes.some((metric) => metric.value === selectedMetric);
    if (!hasCurrent) setSelectedMetric(availableMetricTypes[0].value);
  }, [availableMetricTypes, selectedMetric]);

  useEffect(() => {
    if (!availableMetricTypes.length) return;
    const hasCurrent = availableMetricTypes.some((metric) => metric.value === formMetric);
    if (!hasCurrent) setFormMetric(availableMetricTypes[0].value);
  }, [availableMetricTypes, formMetric]);

  useEffect(() => {
    if (!formPatient) return;
    const treatmentList = formPatient === selectedPatient ? patientTreatments : [];
    if (!treatmentList.length) return;
    setFormTreatment((current) => current || treatmentList[0].id);
  }, [formPatient, selectedPatient, patientTreatments]);

  const filteredMetrics = metrics.filter((metric) => {
    if (metric.metric_type !== selectedMetric) return false;
    if (!selectedTreatment) return true;
    const taggedTreatment = extractTreatmentIdFromNotes(metric.notes);
    return !taggedTreatment || taggedTreatment === selectedTreatment;
  });

  const chartData = filteredMetrics.map((m) => ({
    date: format(new Date(m.recorded_at), 'dd/MM', { locale: ptBR }),
    value: Number(m.value),
  }));

  const metricInfo = availableMetricTypes.find((metric) => metric.value === selectedMetric) || availableMetricTypes[0];
  const lastValue = filteredMetrics.length > 0 ? Number(filteredMetrics[filteredMetrics.length - 1].value) : null;
  const firstValue = filteredMetrics.length > 1 ? Number(filteredMetrics[0].value) : null;
  const diff = lastValue !== null && firstValue !== null ? lastValue - firstValue : null;

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const metricUnit = availableMetricTypes.find((metric) => metric.value === formMetric)?.unit || 'score';
    const notes = buildMetricNote(formNotes, formTreatment);
    const { error } = await supabase.from('patient_metrics').insert({
      clinic_id: clinicId!, patient_id: formPatient, metric_type: formMetric,
      value: Number(formValue), unit: metricUnit, notes,
    });
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Medição registrada!' });
    setOpen(false);
    setFormValue('');
    setFormNotes('');
    if (formPatient === selectedPatient && formMetric === selectedMetric) {
      supabase.from('patient_metrics').select('*').eq('clinic_id', clinicId!)
        .eq('patient_id', selectedPatient)
        .order('recorded_at', { ascending: true })
        .then(({ data }) => setMetrics((data || []) as MetricRow[]));
    }
  };

  return (
    <div>
      <PageHeader title="Evolução" description="Acompanhe as medidas e progresso dos pacientes">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-2" />Nova Medição</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Registrar Medição</DialogTitle></DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-2">
                <Label>Paciente</Label>
                <Select value={formPatient} onValueChange={setFormPatient}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{patients.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tratamento</Label>
                <Select value={formTreatment} onValueChange={setFormTreatment}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {(formPatient === selectedPatient ? patientTreatments : []).map((treatment) => (
                      <SelectItem key={treatment.id} value={treatment.id}>{treatment.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={formMetric} onValueChange={setFormMetric}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{availableMetricTypes.map(m => <SelectItem key={m.value} value={m.value}>{m.label} ({m.unit})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor</Label>
                <Input type="number" step="0.1" value={formValue} onChange={e => setFormValue(e.target.value)} required placeholder="Ex: 72.5" />
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Input value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Opcional" />
              </div>
              <Button type="submit" className="w-full gradient-primary text-primary-foreground">Salvar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="md:col-span-2">
          <Select value={selectedPatient} onValueChange={setSelectedPatient}>
            <SelectTrigger><SelectValue placeholder="Selecione o paciente" /></SelectTrigger>
            <SelectContent>{patients.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Select value={selectedTreatment} onValueChange={setSelectedTreatment}>
            <SelectTrigger><SelectValue placeholder="Selecione o tratamento" /></SelectTrigger>
            <SelectContent>
              {patientTreatments.map((treatment) => (
                <SelectItem key={treatment.id} value={treatment.id}>{treatment.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Select value={selectedMetric} onValueChange={setSelectedMetric}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{availableMetricTypes.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {!selectedPatient ? (
        <Card className="shadow-card"><CardContent className="py-16 text-center">
          <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Selecione um paciente para ver a evolução</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="shadow-card"><CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground uppercase">Medições</p>
              <p className="text-2xl font-bold text-foreground">{filteredMetrics.length}</p>
            </CardContent></Card>
            <Card className="shadow-card"><CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground uppercase">Última</p>
              <p className="text-2xl font-bold text-foreground">{lastValue !== null ? `${lastValue} ${metricInfo?.unit}` : '—'}</p>
            </CardContent></Card>
            <Card className="shadow-card"><CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground uppercase">Variação</p>
              <p className={`text-2xl font-bold ${diff !== null && diff < 0 ? 'text-green-600' : diff !== null && diff > 0 ? 'text-red-500' : 'text-foreground'}`}>
                {diff !== null ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)} ${metricInfo?.unit}` : '—'}
              </p>
            </CardContent></Card>
          </div>

          {/* Chart */}
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">{metricInfo?.label} ao longo do tempo</CardTitle></CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" className="text-xs fill-muted-foreground" />
                    <YAxis className="text-xs fill-muted-foreground" />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" className="stroke-primary" strokeWidth={2} dot={{ r: 4, className: 'fill-primary' }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-8">Nenhuma medição registrada para este tipo</p>
              )}
            </CardContent>
          </Card>

          {/* History table */}
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">Histórico</CardTitle></CardHeader>
            <CardContent>
              {filteredMetrics.length > 0 ? (
                <div className="divide-y divide-border">
                  {[...filteredMetrics].reverse().map(m => (
                    <div key={m.id} className="flex items-center justify-between py-3">
                      <span className="text-sm text-muted-foreground">{format(new Date(m.recorded_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                      <span className="font-semibold text-foreground">{Number(m.value)} {m.unit}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-center text-muted-foreground py-4">Sem medições</p>}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
