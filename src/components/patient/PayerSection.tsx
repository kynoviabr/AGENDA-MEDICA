import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users } from 'lucide-react';

export interface PayerData {
  is_self_payer: boolean;
  payer_id: string | null;
  new_payer?: {
    name: string;
    cpf: string;
    birth_date: string;
  };
}

interface PayerSectionProps {
  value: PayerData;
  onChange: (data: PayerData) => void;
  patientName?: string;
  payerOptionsOverride?: Array<{ id: string; name: string; cpf?: string | null }>;
}

export default function PayerSection({ value, onChange, patientName, payerOptionsOverride }: PayerSectionProps) {
  const { clinicId } = useBranding();
  const [mode, setMode] = useState<'existing' | 'new'>('new');

  const { data: payers = [] } = useQuery({
    queryKey: ['payers', clinicId],
    queryFn: async () => {
      if (!clinicId) return [];
      const { data } = await supabase
        .from('payers' as unknown)
        .select('id, name, cpf')
        .eq('clinic_id', clinicId)
        .order('name');
      return (data as unknown[]) || [];
    },
    enabled: !!clinicId && !value.is_self_payer && !payerOptionsOverride,
  });

  const payerOptions = payerOptionsOverride || (payers as Array<{ id: string; name: string; cpf?: string | null }>);

  useEffect(() => {
    if (!value.is_self_payer && payerOptions.length > 0 && value.payer_id) {
      setMode('existing');
      return;
    }
    if (!value.is_self_payer && payerOptions.length === 0) {
      setMode('new');
    }
  }, [value.is_self_payer, value.payer_id, payerOptions.length]);

  return (
    <div className="space-y-4 p-4 rounded-lg border bg-secondary/30">
      <div className="flex items-center gap-2 mb-2">
        <Users className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm text-foreground">Dados do Pagador</h3>
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="self-payer" className="text-sm">Pagador é o próprio paciente?</Label>
        <Switch
          id="self-payer"
          checked={value.is_self_payer}
          onCheckedChange={(checked) =>
            onChange({
              is_self_payer: checked,
              payer_id: null,
              new_payer: checked ? undefined : { name: '', cpf: '', birth_date: '' },
            })
          }
        />
      </div>

      {!value.is_self_payer && (
        <div className="space-y-3 animate-fade-in">
          {payerOptions.length > 0 && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('existing')}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${mode === 'existing' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-secondary'}`}
              >
                Pagador existente
              </button>
              <button
                type="button"
                onClick={() => { setMode('new'); onChange({ ...value, payer_id: null, new_payer: { name: '', cpf: '', birth_date: '' } }); }}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${mode === 'new' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-secondary'}`}
              >
                Novo pagador
              </button>
            </div>
          )}

          {mode === 'existing' && payerOptions.length > 0 ? (
            <div className="space-y-2">
              <Label>Selecionar pagador</Label>
              <Select
                value={value.payer_id || ''}
                onValueChange={(v) => onChange({ ...value, payer_id: v, new_payer: undefined })}
              >
                <SelectTrigger><SelectValue placeholder="Selecionar pagador existente" /></SelectTrigger>
                <SelectContent>
                  {payerOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} {p.cpf ? `(${p.cpf})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Nome do pagador *</Label>
                <Input
                  value={value.new_payer?.name || ''}
                  onChange={(e) =>
                    onChange({ ...value, new_payer: { ...value.new_payer!, name: e.target.value } })
                  }
                  placeholder="Nome completo do responsável"
                  required={!value.is_self_payer}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>CPF *</Label>
                  <Input
                    value={value.new_payer?.cpf || ''}
                    onChange={(e) =>
                      onChange({ ...value, new_payer: { ...value.new_payer!, cpf: e.target.value } })
                    }
                    placeholder="000.000.000-00"
                    required={!value.is_self_payer}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data de nascimento *</Label>
                  <Input
                    type="date"
                    value={value.new_payer?.birth_date || ''}
                    onChange={(e) =>
                      onChange({ ...value, new_payer: { ...value.new_payer!, birth_date: e.target.value } })
                    }
                    required={!value.is_self_payer}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
