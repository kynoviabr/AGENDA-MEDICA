import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { BrandButton } from '@/components/ui/brand-button';
import { AlertTriangle, RotateCcw, Save } from 'lucide-react';

type AlertConfig = {
  overduePayments: number;
  anamneseExpiryDays: number;
  dissatisfactionPatients: number;
  contractReviewDays: number;
};

const DEFAULT_CONFIG: AlertConfig = {
  overduePayments: 1,
  anamneseExpiryDays: 7,
  dissatisfactionPatients: 1,
  contractReviewDays: 7,
};

const SETTINGS_KEYS: Record<keyof AlertConfig, string> = {
  overduePayments: 'dashboard_alert_overdue_payments_threshold',
  anamneseExpiryDays: 'dashboard_alert_anamnese_expiry_window_days',
  dissatisfactionPatients: 'dashboard_alert_dissatisfaction_threshold',
  contractReviewDays: 'dashboard_alert_contract_review_window_days',
};

type ClinicSettingRow = {
  id: string;
  key: string;
  value: string;
};

export default function DashboardAlertsTab() {
  const { clinicId } = useBranding();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<AlertConfig>(DEFAULT_CONFIG);

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ['clinic-settings-dashboard-alerts', clinicId],
    queryFn: async () => {
      if (!clinicId) return [] as ClinicSettingRow[];
      const { data, error } = await supabase
        .from('clinic_settings' as never)
        .select('id, key, value')
        .eq('clinic_id', clinicId)
        .in('key', Object.values(SETTINGS_KEYS));
      if (error) throw error;
      return ((data ?? []) as unknown) as ClinicSettingRow[];
    },
    enabled: !!clinicId,
  });

  useEffect(() => {
    if (!settings.length) {
      setForm(DEFAULT_CONFIG);
      return;
    }
    const byKey = new Map(settings.map((item) => [item.key, item.value]));
    const parsed: AlertConfig = {
      overduePayments: Number(byKey.get(SETTINGS_KEYS.overduePayments) ?? DEFAULT_CONFIG.overduePayments),
      anamneseExpiryDays: Number(byKey.get(SETTINGS_KEYS.anamneseExpiryDays) ?? DEFAULT_CONFIG.anamneseExpiryDays),
      dissatisfactionPatients: Number(byKey.get(SETTINGS_KEYS.dissatisfactionPatients) ?? DEFAULT_CONFIG.dissatisfactionPatients),
      contractReviewDays: Number(byKey.get(SETTINGS_KEYS.contractReviewDays) ?? DEFAULT_CONFIG.contractReviewDays),
    };
    setForm(parsed);
  }, [settings]);

  const settingsByKey = useMemo(() => {
    const map = new Map<string, ClinicSettingRow>();
    settings.forEach((s) => map.set(s.key, s));
    return map;
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId) throw new Error('Clínica não encontrada');

      for (const [field, key] of Object.entries(SETTINGS_KEYS) as [keyof AlertConfig, string][]) {
        const existing = settingsByKey.get(key);
        const value = String(form[field]);
        if (existing) {
          const payload = { value } as unknown;
          const { error } = await supabase
            .from('clinic_settings' as never)
            .update(payload as never)
            .eq('id', existing.id);
          if (error) throw error;
          continue;
        }
        const { error } = await supabase.from('clinic_settings' as never).insert(({
          clinic_id: clinicId,
          key,
          value,
        } as unknown) as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinic-settings-dashboard-alerts'] });
      toast({ title: 'Alertas do dashboard salvos!' });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Erro ao salvar configurações';
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    },
  });

  const onNumberFieldChange = (field: keyof AlertConfig, value: string) => {
    const parsed = Math.max(0, Number(value || 0));
    setForm((prev) => ({ ...prev, [field]: parsed }));
  };

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Alertas do Dashboard
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-10 rounded bg-muted animate-pulse" />
            <div className="h-10 rounded bg-muted animate-pulse" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Parcelas vencidas para alerta</Label>
                <Input type="number" min="0" value={form.overduePayments} onChange={(e) => onNumberFieldChange('overduePayments', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Janela de anamnese próxima ao vencimento (dias)</Label>
                <Input type="number" min="0" value={form.anamneseExpiryDays} onChange={(e) => onNumberFieldChange('anamneseExpiryDays', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Pacientes insatisfeitos para acionar alerta</Label>
                <Input type="number" min="0" value={form.dissatisfactionPatients} onChange={(e) => onNumberFieldChange('dissatisfactionPatients', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Janela de revisão de contratos (dias)</Label>
                <Input type="number" min="0" value={form.contractReviewDays} onChange={(e) => onNumberFieldChange('contractReviewDays', e.target.value)} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <BrandButton onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                <Save className="w-4 h-4" />
                {saveMutation.isPending ? 'Salvando...' : 'Salvar alertas'}
              </BrandButton>
              <BrandButton
                variant="outline"
                onClick={() => setForm(DEFAULT_CONFIG)}
                disabled={saveMutation.isPending}
              >
                <RotateCcw className="w-4 h-4" />
                Restaurar padrão
              </BrandButton>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
