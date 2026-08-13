import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

type StaffRole = 'admin' | 'professional' | 'sales' | 'receptionist';

interface StaffDirectoryItem {
  user_id: string;
  role: StaffRole;
  label: string;
  full_name: string | null;
}

const roleLabelMap: Record<string, string> = {
  admin: 'Administrador',
  professional: 'Profissional',
  sales: 'Comercial',
  receptionist: 'Recepção',
};

function fallbackLabel(role: string, userId: string) {
  return `${roleLabelMap[role] || 'Equipe'} • ${userId.slice(0, 4)}`;
}

export function useStaffDirectory(clinicId?: string | null, roles?: StaffRole[]) {
  const { user } = useAuth();

  const { data = [], isLoading } = useQuery({
    queryKey: ['staff-directory', clinicId, roles?.join(',') || 'all', user?.id],
    queryFn: async () => {
      if (!clinicId) return [];

      let rolesQuery = (supabase.from('user_roles') as unknown)
        .select('user_id, role')
        .eq('clinic_id', clinicId)
        .eq('is_active', true);

      if (roles?.length) {
        rolesQuery = rolesQuery.in('role', roles);
      }

      const { data: roleRows, error: roleError } = await rolesQuery;
      if (roleError) throw roleError;

      const activeRoles = roleRows || [];
      const userIds = [...new Set(activeRoles.map((row: unknown) => row.user_id).filter(Boolean))];

      let professionalsByUser = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: professionals, error: professionalsError } = await supabase
          .from('professionals')
          .select('user_id, full_name, status')
          .eq('clinic_id', clinicId)
          .eq('status', 'active')
          .in('user_id', userIds);

        if (professionalsError) throw professionalsError;

        professionalsByUser = new Map(
          (professionals || []).map((professional: unknown) => [professional.user_id, professional.full_name])
        );
      }

      return activeRoles.map((row: unknown) => {
        const currentUserFallback =
          row.user_id === user?.id
            ? ((user.user_metadata?.full_name as string | undefined) || user.email?.split('@')[0] || null)
            : null;
        const fullName = professionalsByUser.get(row.user_id) || currentUserFallback || null;

        return {
          user_id: row.user_id,
          role: row.role,
          full_name: fullName,
          label: fullName || fallbackLabel(row.role, row.user_id),
        } as StaffDirectoryItem;
      });
    },
    enabled: !!clinicId,
  });

  const byUserId = useMemo(
    () => Object.fromEntries(data.map((item) => [item.user_id, item])),
    [data]
  );

  return {
    staff: data,
    byUserId,
    isLoading,
  };
}
