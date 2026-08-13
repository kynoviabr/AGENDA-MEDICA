import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';

export interface Professional {
  id: string;
  clinic_id: string;
  user_id: string;
  role_id: string | null;
  class_entity_id: string | null;
  full_name: string;
  cpf: string | null;
  email: string | null;
  phone: string | null;
  registration_number: string | null;
  specialty: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

type ProfessionalInsert = Omit<Professional, 'id' | 'created_at' | 'updated_at' | 'clinic_id'>;
type ProfessionalUpdate = Partial<ProfessionalInsert>;

interface Filters {
  status?: string;
  search?: string;
  role_id?: string;
  class_entity_id?: string;
}

export function useProfessionals() {
  const { clinicId } = useUserRole();
  const [items, setItems] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);

  const list = useCallback(async (filters?: Filters) => {
    if (!clinicId) return;
    setLoading(true);
    let q = supabase.from('professionals').select('*').eq('clinic_id', clinicId).order('full_name');
    if (filters?.status) q = q.eq('status', filters.status);
    if (filters?.role_id) q = q.eq('role_id', filters.role_id);
    if (filters?.class_entity_id) q = q.eq('class_entity_id', filters.class_entity_id);
    if (filters?.search) q = q.ilike('full_name', `%${filters.search}%`);
    const { data, error } = await q;
    if (error) { toast.error(error.message); } else { setItems(data || []); }
    setLoading(false);
  }, [clinicId]);

  useEffect(() => { list(); }, [list]);

  const create = async (input: ProfessionalInsert) => {
    if (!clinicId) return null;
    // Check CPF uniqueness
    if (input.cpf) {
      const { data: existing } = await supabase.from('professionals').select('id').eq('clinic_id', clinicId).eq('cpf', input.cpf).limit(1);
      if (existing && existing.length > 0) {
        toast.error('Já existe um profissional com este CPF');
        return null;
      }
    }
    const { data, error } = await supabase.from('professionals').insert({ ...input, clinic_id: clinicId }).select().single();
    if (error) {
      if (error.message?.includes('duplicate') || error.code === '23505') {
        toast.error('Registro duplicado. Verifique os dados informados.');
      } else {
        toast.error(error.message);
      }
      return null;
    }
    toast.success('Profissional cadastrado com sucesso');
    await list();
    return data;
  };

  const update = async (id: string, input: ProfessionalUpdate) => {
    const { data, error } = await supabase.from('professionals').update(input).eq('id', id).select().single();
    if (error) { toast.error(error.message); return null; }
    await list();
    return data;
  };

  const toggleStatus = async (id: string, current: string) => {
    const newStatus = current === 'active' ? 'inactive' : 'active';
    const result = await update(id, { status: newStatus });
    if (result) {
      toast.success(newStatus === 'active' ? 'Profissional reativado com sucesso' : 'Profissional inativado com sucesso');
    }
    return result;
  };

  return { items, loading, list, create, update, toggleStatus };
}
