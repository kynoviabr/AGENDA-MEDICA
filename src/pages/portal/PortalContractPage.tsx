import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusMap: Record<string, { label: string; className: string }> = {
  draft: { label: 'Rascunho', className: 'bg-muted text-muted-foreground' },
  active: { label: 'Vigente', className: 'bg-green-100 text-green-700' },
  completed: { label: 'Concluído', className: 'bg-blue-100 text-blue-700' },
  cancelled: { label: 'Cancelado', className: 'bg-red-100 text-red-700' },
};

export default function PortalContractPage() {
  const { user } = useAuth();
  const [contracts, setContracts] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: portal } = await supabase.from('patient_users' as unknown)
        .select('patient_id').eq('auth_user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
      if (!portal) { setLoading(false); return; }
      const { data } = await supabase.from('contracts').select('*').eq('patient_id', portal.patient_id).order('created_at', { ascending: false });
      setContracts(data || []);
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-xl font-bold text-foreground">Meu Contrato</h2>
      {contracts.length === 0 ? (
        <Card className="shadow-card"><CardContent className="py-12 text-center">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">Nenhum contrato encontrado</p>
        </CardContent></Card>
      ) : contracts.map(c => {
        const st = statusMap[c.status] || statusMap.draft;
        return (
          <Card key={c.id} className="shadow-card">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">{c.contract_number}</span>
                <Badge className={st.className}>{st.label}</Badge>
              </div>
              {c.start_date && <p className="text-xs text-muted-foreground">Início: {format(new Date(c.start_date), 'dd/MM/yyyy', { locale: ptBR })}</p>}
              {c.end_date && <p className="text-xs text-muted-foreground">Término: {format(new Date(c.end_date), 'dd/MM/yyyy', { locale: ptBR })}</p>}
              {c.notes && <p className="text-sm text-muted-foreground border-t pt-2">{c.notes}</p>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
