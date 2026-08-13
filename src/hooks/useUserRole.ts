import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type AppRole = 'admin' | 'receptionist' | 'professional' | 'patient' | 'sales';

interface UserRoleData {
  role: AppRole | null;
  clinicId: string | null;
  loading: boolean;
  resolved: boolean;
}

export function useUserRole(): UserRoleData {
  const { user } = useAuth();
  const [data, setData] = useState<UserRoleData>({ role: null, clinicId: null, loading: true, resolved: false });

  useEffect(() => {
    if (!user) {
      setData({ role: null, clinicId: null, loading: false, resolved: true });
      return;
    }

    const fetch = async () => {
      setData((current) => ({ ...current, loading: true, resolved: false }));
      // Check staff roles first
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role, clinic_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (roleData) {
        setData({ role: roleData.role as AppRole, clinicId: roleData.clinic_id, loading: false, resolved: true });
        return;
      }

      // Check patient app access
      const { data: portalData } = await supabase
        .from('patient_users' as unknown)
        .select('clinic_id')
        .eq('auth_user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      if (portalData) {
        setData({ role: 'patient', clinicId: (portalData as unknown).clinic_id, loading: false, resolved: true });
      } else {
        setData({ role: null, clinicId: null, loading: false, resolved: true });
      }
    };

    fetch();
  }, [user]);

  return data;
}
