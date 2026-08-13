import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';

export interface Role {
  id: string;
  clinic_id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

type RoleInsert = Omit<Role, 'id' | 'created_at' | 'updated_at' | 'clinic_id'>;
type RoleUpdate = Partial<RoleInsert>;

interface Filters {
  status?: string;
  search?: string;
}

export function useRoles() {
  const { clinicId } = useUserRole();
  const [items, setItems] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  const list = useCallback(async (filters?: Filters) => {
    if (!clinicId) return;
    setLoading(true);
    let q = supabase.from('roles').select('*').eq('clinic_id', clinicId).order('name');
    if (filters?.status) q = q.eq('status', filters.status);
    if (filters?.search) q = q.ilike('name', `%${filters.search}%`);
    const { data, error } = await q;
    if (error) { toast.error(error.message); } else { setItems(data || []); }
    setLoading(false);
  }, [clinicId]);

  useEffect(() => { list(); }, [list]);

  const create = async (input: RoleInsert) => {
    if (!clinicId) return null;
    const { data, error } = await supabase.from('roles').insert({ ...input, clinic_id: clinicId }).select().single();
    if (error) {
      if (error.message?.includes('duplicate') || error.code === '23505') {
        toast.error('Já existe um cargo com este nome');
      } else {
        toast.error(error.message);
      }
      return null;
    }
    toast.success('Cargo criado com sucesso');
    await list();
    return data;
  };

  const update = async (id: string, input: RoleUpdate) => {
    const { data, error } = await supabase.from('roles').update(input).eq('id', id).select().single();
    if (error) { toast.error(error.message); return null; }
    await list();
    return data;
  };

  const toggleStatus = async (id: string, current: string) => {
    const newStatus = current === 'active' ? 'inactive' : 'active';
    const result = await update(id, { status: newStatus });
    if (result) {
      toast.success(newStatus === 'active' ? 'Cargo reativado com sucesso' : 'Cargo inativado com sucesso');
    }
    return result;
  };

  return { items, loading, list, create, update, toggleStatus };
}
