import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const METRIC_TYPES = [
  { value: 'weight', label: 'Peso', unit: 'kg' },
  { value: 'waist', label: 'Cintura', unit: 'cm' },
  { value: 'hip', label: 'Quadril', unit: 'cm' },
  { value: 'arm', label: 'Braço', unit: 'cm' },
  { value: 'thigh', label: 'Coxa', unit: 'cm' },
  { value: 'abdomen', label: 'Abdômen', unit: 'cm' },
];

export default function PortalEvolutionPage() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<unknown[]>([]);
  const [selectedMetric, setSelectedMetric] = useState('weight');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const { data: portal } = await supabase.from('patient_users' as unknown)
        .select('patient_id').eq('auth_user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
      if (!portal) { setLoading(false); return; }
      const { data } = await supabase.from('patient_metrics')
        .select('*').eq('patient_id', portal.patient_id).eq('metric_type', selectedMetric)
        .order('recorded_at', { ascending: true });
      setMetrics(data || []);
      setLoading(false);
    };
    load();
  }, [user, selectedMetric]);

  const chartData = metrics.map(m => ({
    date: format(new Date(m.recorded_at), 'dd/MM', { locale: ptBR }),
    value: Number(m.value),
  }));

  const metricInfo = METRIC_TYPES.find(m => m.value === selectedMetric);
  const last = metrics.length > 0 ? Number(metrics[metrics.length - 1].value) : null;
  const first = metrics.length > 1 ? Number(metrics[0].value) : null;
  const diff = last !== null && first !== null ? last - first : null;

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-xl font-bold text-foreground">Minha Evolução</h2>

      <Select value={selectedMetric} onValueChange={setSelectedMetric}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{METRIC_TYPES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
      </Select>

      <div className="grid grid-cols-2 gap-3">
        <Card className="shadow-card"><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Atual</p>
          <p className="text-lg font-bold text-foreground">{last !== null ? `${last} ${metricInfo?.unit}` : '—'}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Variação</p>
          <p className={`text-lg font-bold ${diff !== null && diff < 0 ? 'text-green-600' : diff !== null && diff > 0 ? 'text-red-500' : 'text-foreground'}`}>
            {diff !== null ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)} ${metricInfo?.unit}` : '—'}
          </p>
        </CardContent></Card>
      </div>

      <Card className="shadow-card">
        <CardContent className="p-4">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" className="text-xs fill-muted-foreground" />
                <YAxis className="text-xs fill-muted-foreground" />
                <Tooltip />
                <Line type="monotone" dataKey="value" className="stroke-primary" strokeWidth={2} dot={{ r: 3, className: 'fill-primary' }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="py-12 text-center">
              <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma medição registrada</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
