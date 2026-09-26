import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AgendaProfessional {
  id: string;
  user_id: string | null;
  full_name: string;
  specialty: string | null;
  label: string;
}

export function useAgendaProfessionals(clinicId?: string | null, authUserId?: string | null) {
  const query = useQuery({
    queryKey: ['agenda-professionals', clinicId],
    queryFn: async () => {
      if (!clinicId) return [];
      const { data, error } = await supabase
        .from('professionals')
        .select('id, user_id, full_name, specialty')
        .eq('clinic_id', clinicId)
        .eq('status', 'active')
        .order('full_name');
      if (error) throw error;
      return (data || []).map((professional) => ({
        ...professional,
        label: professional.specialty
          ? `${professional.full_name} · ${professional.specialty}`
          : professional.full_name,
      })) as AgendaProfessional[];
    },
    enabled: !!clinicId,
  });

  const currentProfessionalId = useMemo(
    () => query.data?.find((professional) => professional.user_id === authUserId)?.id || null,
    [authUserId, query.data],
  );

  return { professionals: query.data || [], currentProfessionalId, isLoading: query.isLoading };
}
