import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';

export interface ProfessionalTreatment {
  id: string;
  professional_id: string;
  treatment_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface Filters {
  professional_id?: string;
  treatment_id?: string;
  status?: string;
}

export function useProfessionalTreatments() {
  const { clinicId } = useUserRole();
  const [items, setItems] = useState<ProfessionalTreatment[]>([]);
  const [loading, setLoading] = useState(true);

  const list = useCallback(async (filters?: Filters) => {
    if (!clinicId) return;
    setLoading(true);
    let q = supabase.from('professional_treatments').select('*, professionals!inner(clinic_id)').eq('professionals.clinic_id', clinicId);
    if (filters?.professional_id) q = q.eq('professional_id', filters.professional_id);
    if (filters?.treatment_id) q = q.eq('treatment_id', filters.treatment_id);
    if (filters?.status) q = q.eq('status', filters.status);
    const { data, error } = await q;
    if (error) { toast.error(error.message); } else { setItems(data || []); }
    setLoading(false);
  }, [clinicId]);

  useEffect(() => { list(); }, [list]);

  const create = async (professional_id: string, treatment_id: string) => {
    const { data, error } = await supabase.from('professional_treatments').insert({ professional_id, treatment_id }).select().single();
    if (error) { toast.error(error.message); return null; }
    toast.success('Tratamento vinculado');
    await list();
    return data;
  };

  const update = async (id: string, input: Partial<Pick<ProfessionalTreatment, 'status'>>) => {
    const { data, error } = await supabase.from('professional_treatments').update(input).eq('id', id).select().single();
    if (error) { toast.error(error.message); return null; }
    toast.success('Vínculo atualizado');
    await list();
    return data;
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('professional_treatments').delete().eq('id', id);
    if (error) { toast.error(error.message); return false; }
    toast.success('Vínculo removido');
    await list();
    return true;
  };

  const toggleStatus = async (id: string, current: string) => {
    return update(id, { status: current === 'active' ? 'inactive' : 'active' });
  };

  return { items, loading, list, create, update, remove, toggleStatus };
}
