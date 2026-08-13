import { AlertTriangle, CheckCircle2, Clock, Upload } from 'lucide-react';

interface Props {
  contracts: unknown[];
}

export function ComplianceDashboard({ contracts }: Props) {
  const pendingUpload = contracts.filter(c => c.process_status === 'pending_upload').length;
  const pendingConfirmation = contracts.filter(c => c.process_status === 'pending_confirmation').length;
  const overdue = contracts.filter(c => c.process_status === 'overdue').length;
  const confirmed = contracts.filter(c => c.process_status === 'confirmed').length;
  const total = contracts.length || 1;
  const complianceRate = Math.round((confirmed / total) * 100);

  const cards = [
    { label: 'Aguardando Upload', value: pendingUpload, icon: Upload, color: 'text-amber-600 bg-amber-50' },
    { label: 'Confirmar Upload', value: pendingConfirmation, icon: Clock, color: 'text-blue-600 bg-blue-50' },
    { label: 'Atrasados', value: overdue, icon: AlertTriangle, color: 'text-destructive bg-destructive/10' },
    { label: 'Confirmados', value: confirmed, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
      {cards.map(c => (
        <div key={c.label} className="bg-card rounded-xl p-4 shadow-card">
          <div className="flex items-center gap-2 mb-1">
            <div className={`p-1.5 rounded-lg ${c.color}`}>
              <c.icon className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{c.value}</p>
          <p className="text-xs text-muted-foreground">{c.label}</p>
        </div>
      ))}
      <div className="bg-card rounded-xl p-4 shadow-card">
        <p className="text-2xl font-bold text-foreground">{complianceRate}%</p>
        <p className="text-xs text-muted-foreground">Taxa de Compliance</p>
        <div className="w-full bg-secondary rounded-full h-1.5 mt-2">
          <div className="bg-primary rounded-full h-1.5 transition-all" style={{ width: `${complianceRate}%` }} />
        </div>
      </div>
    </div>
  );
}
