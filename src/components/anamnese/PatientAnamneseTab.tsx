import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { BrandButton } from '@/components/ui/brand-button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AnamneseStatusBadge } from './AnamneseStatusBadge';
import CurrentAnamneseCard from './CurrentAnamneseCard';
import PatientAnamneseHistoryTable from './PatientAnamneseHistoryTable';
import NewAnamneseModal from './NewAnamneseModal';
import EditAnamneseModal from './EditAnamneseModal';
import AnamneseDetailDrawer from './AnamneseDetailDrawer';
import AnamnesisFormModal from '@/components/patient/AnamnesisFormModal';
import { toast } from 'sonner';
import { Plus, FileText, ClipboardEdit } from 'lucide-react';

interface Props {
  patientId: string;
  clinicId: string;
  patientAnamneseStatus?: string | null;
}

export default function PatientAnamneseTab({ patientId, clinicId, patientAnamneseStatus }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editAnamnese, setEditAnamnese] = useState<unknown>(null);
  const [detailAnamnese, setDetailAnamnese] = useState<unknown>(null);

  const { data: anamneses = [], isLoading } = useQuery({
    queryKey: ['patient-anamneses', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patient_anamneses')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!patientId,
  });

  const { data: validityDays = 180 } = useQuery({
    queryKey: ['anamnese-validity', clinicId],
    queryFn: async () => {
      const { data } = await supabase
        .from('clinic_settings')
        .select('value')
        .eq('clinic_id', clinicId)
        .eq('key', 'anamnese_validity_days')
        .maybeSingle();
      return data ? parseInt((data as any).value) || 180 : 180;
    },
    enabled: !!clinicId,
  });

  const current = anamneses.find((a: any) => a.is_current);
  const history = anamneses.filter((a: any) => !a.is_current);

  const validateMut = useMutation({
    mutationFn: async (id: string) => {
      const now = new Date().toISOString();
      const { error } = await supabase.from('patient_anamneses').update({
        status: 'validated',
        validated_by: user?.id,
        validated_at: now,
        updated_by: user?.id,
        filled_at: now,
      } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient-anamneses', patientId] });
      qc.invalidateQueries({ queryKey: ['patient', patientId] });
      toast.success('Anamnese validada!');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const archiveMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('patient_anamneses').update({
        status: 'archived',
        archived_at: new Date().toISOString(),
        is_current: false,
        updated_by: user?.id,
      } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient-anamneses', patientId] });
      qc.invalidateQueries({ queryKey: ['patient', patientId] });
      toast.success('Anamnese arquivada!');
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  // Empty state
  if (anamneses.length === 0) {
    return (
      <>
        <Card className="shadow-card">
          <CardContent className="py-16 text-center">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-foreground mb-1">Nenhuma anamnese cadastrada</h3>
            <p className="text-sm text-muted-foreground mb-6">Este paciente ainda não possui anamnese cadastrada.</p>
            <div className="flex flex-wrap justify-center gap-2">
              <BrandButton onClick={() => setNewOpen(true)}>
                <Plus className="w-4 h-4" /> Criar anamnese
              </BrandButton>
              <BrandButton variant="outline" onClick={() => setFormOpen(true)}>
                <ClipboardEdit className="w-4 h-4" /> Preencher digitalmente
              </BrandButton>
            </div>
          </CardContent>
        </Card>
        <NewAnamneseModal open={newOpen} onOpenChange={setNewOpen} patientId={patientId} clinicId={clinicId} />
        <AnamnesisFormModal open={formOpen} onOpenChange={setFormOpen} patientId={patientId} clinicId={clinicId} validityDays={validityDays} />
      </>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-foreground">Anamnese</h3>
          <AnamneseStatusBadge status={patientAnamneseStatus || (current?.status)} />
        </div>
        <div className="flex gap-2">
          <BrandButton variant="outline" onClick={() => setFormOpen(true)}>
            <ClipboardEdit className="w-4 h-4" /> Preencher digitalmente
          </BrandButton>
          <BrandButton onClick={() => setNewOpen(true)}>
            <Plus className="w-4 h-4" /> Nova Anamnese
          </BrandButton>
        </div>
      </div>

      {/* Current anamnese card */}
      {current && (
        <CurrentAnamneseCard
          anamnese={current}
          patientId={patientId}
          onValidate={id => validateMut.mutate(id)}
          onArchive={id => archiveMut.mutate(id)}
          onEdit={a => setEditAnamnese(a)}
          onView={a => setDetailAnamnese(a)}
          validating={validateMut.isPending}
          archiving={archiveMut.isPending}
        />
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Histórico</h4>
          <PatientAnamneseHistoryTable
            anamneses={history}
            patientId={patientId}
            onValidate={id => validateMut.mutate(id)}
            onArchive={id => archiveMut.mutate(id)}
            onEdit={a => setEditAnamnese(a)}
            onView={a => setDetailAnamnese(a)}
          />
        </div>
      )}

      <NewAnamneseModal open={newOpen} onOpenChange={setNewOpen} patientId={patientId} clinicId={clinicId} />
      <AnamnesisFormModal open={formOpen} onOpenChange={setFormOpen} patientId={patientId} clinicId={clinicId} validityDays={validityDays} />
      {editAnamnese && (
        <EditAnamneseModal open={!!editAnamnese} onOpenChange={o => !o && setEditAnamnese(null)} anamnese={editAnamnese} patientId={patientId} />
      )}
      <AnamneseDetailDrawer open={!!detailAnamnese} onOpenChange={o => !o && setDetailAnamnese(null)} anamnese={detailAnamnese} />
    </div>
  );
}
