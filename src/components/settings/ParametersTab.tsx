import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Save, SlidersHorizontal } from 'lucide-react';

export default function ParametersTab() {
  const { clinicId } = useBranding();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [anamneseDays, setAnamneseDays] = useState('45');

  const { data: settings, isLoading } = useQuery({
    queryKey: ['clinic-settings', clinicId],
    queryFn: async () => {
      if (!clinicId) return [];
      const { data } = await supabase.from('clinic_settings' as unknown).select('*').eq('clinic_id', clinicId);
      return (data as unknown[]) || [];
    },
    enabled: !!clinicId,
  });

  useEffect(() => {
    if (settings) {
      const found = settings.find((s: unknown) => s.key === 'anamnese_validity_days');
      if (found) setAnamneseDays(found.value);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId) throw new Error('Clínica não encontrada');
      const existing = settings?.find((s: unknown) => s.key === 'anamnese_validity_days');
      if (existing) {
        const { error } = await supabase.from('clinic_settings' as unknown).update({ value: anamneseDays } as unknown).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clinic_settings' as unknown).insert({
          clinic_id: clinicId,
          key: 'anamnese_validity_days',
          value: anamneseDays,
        } as unknown);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinic-settings'] });
      toast({ title: 'Parâmetros salvos!' });
    },
    onError: (err: unknown) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><SlidersHorizontal className="w-5 h-5" />Parâmetros</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-10 bg-muted rounded animate-pulse" />
          </div>
        ) : (
          <>
            <div className="space-y-2 max-w-xs">
              <Label>Validade da Anamnese (dias)</Label>
              <Input
                type="number"
                min="1"
                value={anamneseDays}
                onChange={e => setAnamneseDays(e.target.value)}
                placeholder="45"
              />
              <p className="text-xs text-muted-foreground">
                Após este período, a anamnese será considerada vencida e precisará ser refeita.
              </p>
            </div>
            <BrandButton onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              <Save className="w-4 h-4" />{saveMutation.isPending ? 'Salvando...' : 'Salvar Parâmetros'}
            </BrandButton>
          </>
        )}
      </CardContent>
    </Card>
  );
}
