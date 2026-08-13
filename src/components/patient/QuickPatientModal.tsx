import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrandButton } from '@/components/ui/brand-button';
import { useToast } from '@/hooks/use-toast';
import { UserPlus } from 'lucide-react';

interface QuickPatientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (patient: { id: string; full_name: string }) => void;
}

export default function QuickPatientModal({ open, onOpenChange, onCreated }: QuickPatientModalProps) {
  const { clinicId } = useBranding();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId) throw new Error('Clínica não encontrada');
      if (!fullName.trim()) throw new Error('Nome é obrigatório');
      if (!phone.trim()) throw new Error('Telefone é obrigatório');

      // Check duplicates by phone
      const { data: byPhone } = await supabase
        .from('patients')
        .select('id, full_name')
        .eq('clinic_id', clinicId)
        .eq('phone', phone.trim())
        .limit(1);

      if (byPhone && byPhone.length > 0) {
        throw new Error(`Já existe um paciente com este telefone: ${byPhone[0].full_name}`);
      }

      // Check duplicates by CPF if provided
      if (cpf.trim()) {
        const { data: byCpf } = await supabase
          .from('patients')
          .select('id, full_name')
          .eq('clinic_id', clinicId)
          .eq('cpf', cpf.trim())
          .limit(1);

        if (byCpf && byCpf.length > 0) {
          throw new Error(`Já existe um paciente com este CPF: ${byCpf[0].full_name}`);
        }
      }

      const { data, error } = await supabase
        .from('patients')
        .insert({
          clinic_id: clinicId,
          full_name: fullName.trim(),
          phone: phone.trim(),
          cpf: cpf.trim() || null,
          email: email.trim() || null,
          is_self_payer: true,
        })
        .select('id, full_name')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.invalidateQueries({ queryKey: ['patients-select'] });
      toast({ title: 'Paciente criado com sucesso!' });
      onCreated(data);
      resetForm();
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setFullName('');
    setPhone('');
    setCpf('');
    setEmail('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            Cadastro Rápido de Paciente
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="space-y-4 mt-2"
        >
          <div className="space-y-2">
            <Label>Nome completo *</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nome do paciente"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Telefone *</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 99999-9999"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>CPF</Label>
              <Input
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                placeholder="000.000.000-00"
              />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <BrandButton
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancelar
            </BrandButton>
            <BrandButton
              type="submit"
              className="flex-1"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Salvando...' : 'Cadastrar e Selecionar'}
            </BrandButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
