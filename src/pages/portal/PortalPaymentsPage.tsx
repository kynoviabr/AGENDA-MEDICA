import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CreditCard } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusMap: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pendente', className: 'bg-yellow-100 text-yellow-700' },
  paid: { label: 'Pago', className: 'bg-green-100 text-green-700' },
  overdue: { label: 'Atrasado', className: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Cancelado', className: 'bg-muted text-muted-foreground' },
  refunded: { label: 'Reembolsado', className: 'bg-blue-100 text-blue-700' },
};

export default function PortalPaymentsPage() {
  const { user } = useAuth();
  const [installments, setInstallments] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: portal } = await supabase.from('patient_users' as unknown)
        .select('patient_id').eq('auth_user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
      if (!portal) { setLoading(false); return; }
      const { data: plans } = await supabase.from('payment_plans').select('id').eq('patient_id', portal.patient_id);
      if (!plans?.length) { setLoading(false); return; }
      const planIds = plans.map(p => p.id);
      const { data } = await supabase.from('payment_installments').select('*').in('payment_plan_id', planIds).order('due_date');
      setInstallments(data || []);
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  const totalPaid = installments.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0);
  const totalPending = installments.filter(i => i.status !== 'paid' && i.status !== 'cancelled').reduce((s, i) => s + Number(i.amount), 0);

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-xl font-bold text-foreground">Pagamentos</h2>

      <div className="grid grid-cols-2 gap-3">
        <Card className="shadow-card"><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Pago</p>
          <p className="text-lg font-bold text-green-600">R$ {totalPaid.toFixed(2)}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Pendente</p>
          <p className="text-lg font-bold text-yellow-600">R$ {totalPending.toFixed(2)}</p>
        </CardContent></Card>
      </div>

      {installments.length === 0 ? (
        <Card className="shadow-card"><CardContent className="py-12 text-center">
          <CreditCard className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">Nenhum pagamento encontrado</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {installments.map(inst => {
            const st = statusMap[inst.status] || statusMap.pending;
            return (
              <Card key={inst.id} className="shadow-card">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Parcela {inst.installment_number}</p>
                    <p className="text-xs text-muted-foreground">Venc: {format(new Date(inst.due_date), 'dd/MM/yyyy', { locale: ptBR })}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">R$ {Number(inst.amount).toFixed(2)}</p>
                    <Badge className={`text-xs ${st.className}`}>{st.label}</Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
