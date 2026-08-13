import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';

export interface ClassEntity {
  id: string;
  clinic_id: string;
  name: string;
  abbreviation: string;
  description: string | null;
  linked_professionals: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

type ClassEntityInsert = Omit<ClassEntity, 'id' | 'created_at' | 'updated_at' | 'clinic_id'>;
type ClassEntityUpdate = Partial<ClassEntityInsert>;

interface Filters {
  status?: string;
  search?: string;
}

export function useClassEntities() {
  const { clinicId } = useUserRole();
  const [items, setItems] = useState<ClassEntity[]>([]);
  const [loading, setLoading] = useState(true);

  const isMissingColumnError = (error: { code?: string; message?: string } | null) =>
    error?.code === '42703' || error?.message?.includes('Could not find the') || error?.message?.includes('column');

  const list = useCallback(async (filters?: Filters) => {
    if (!clinicId) return;
    setLoading(true);
    let q = supabase.from('class_entities').select('*').eq('clinic_id', clinicId).order('name');
    if (filters?.status) q = q.eq('status', filters.status);
    if (filters?.search) q = q.ilike('name', `%${filters.search}%`);
    const { data, error } = await q;
    if (error) { toast.error(error.message); } else { setItems(data || []); }
    setLoading(false);
  }, [clinicId]);

  useEffect(() => { list(); }, [list]);

  const create = async (input: ClassEntityInsert) => {
    if (!clinicId) return null;
    let { data, error } = await supabase.from('class_entities').insert({ ...input, clinic_id: clinicId }).select().single();
    if (isMissingColumnError(error)) {
      // Backward compatibility for environments where migrations weren't applied yet.
      const fallback = await supabase
        .from('class_entities')
        .insert({
          name: input.name,
          abbreviation: input.abbreviation,
          status: input.status,
          clinic_id: clinicId,
        })
        .select()
        .single();
      data = fallback.data;
      error = fallback.error;
    }
    if (error) {
      if (error.message?.includes('duplicate') || error.code === '23505') {
        toast.error('Já existe uma entidade com este nome ou sigla');
      } else {
        toast.error(error.message);
      }
      return null;
    }
    if (!input.description && !input.linked_professionals) {
      // no-op
    }
    if (input.description || input.linked_professionals) {
      // Inform user if fallback path was used and new fields were ignored.
      const createdWithoutExtendedFields = !(data as { description?: string | null })?.description && !(data as { linked_professionals?: string | null })?.linked_professionals;
      if (createdWithoutExtendedFields) {
        toast.warning('Entidade criada sem descrição/profissionais. Aplique a migration de class_entities para habilitar esses campos.');
      }
    }
    toast.success('Entidade de classe cadastrada com sucesso');
    await list();
    return data;
  };

  const update = async (id: string, input: ClassEntityUpdate) => {
    let { data, error } = await supabase.from('class_entities').update(input).eq('id', id).select().single();
    if (isMissingColumnError(error)) {
      const { description: _description, linked_professionals: _linkedProfessionals, ...fallbackInput } = input;
      const fallback = await supabase.from('class_entities').update(fallbackInput).eq('id', id).select().single();
      data = fallback.data;
      error = fallback.error;
      if (!error && (_description || _linkedProfessionals)) {
        toast.warning('Atualizado sem descrição/profissionais. Aplique a migration de class_entities para habilitar esses campos.');
      }
    }
    if (error) { toast.error(error.message); return null; }
    await list();
    return data;
  };

  const toggleStatus = async (id: string, current: string) => {
    const newStatus = current === 'active' ? 'inactive' : 'active';
    const result = await update(id, { status: newStatus });
    if (result) {
      toast.success(newStatus === 'active' ? 'Entidade reativada com sucesso' : 'Entidade inativada com sucesso');
    }
    return result;
  };

  return { items, loading, list, create, update, toggleStatus };
}
