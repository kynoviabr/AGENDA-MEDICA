import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { type MenuPermissionKey } from '@/lib/accessPermissions';

export function useAccessControl() {
  const { user } = useAuth();
  const { clinicId, role, loading: roleLoading } = useUserRole();
  const [permissions, setPermissions] = useState<Set<MenuPermissionKey>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (roleLoading) return;
    if (!user || !clinicId || !role) {
      setPermissions(new Set());
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const { data: assignments } = await supabase
          .from('user_access_groups' as unknown)
          .select('group_id, is_active')
          .eq('clinic_id', clinicId)
          .eq('user_id', user.id)
          .eq('is_active', true);

        const groupIds = (assignments || []).map((row: { group_id: string }) => row.group_id);
        if (groupIds.length === 0) {
          setPermissions(new Set());
          return;
        }

        const { data: perms } = await supabase
          .from('access_group_permissions' as unknown)
          .select('permission_key, can_view')
          .eq('clinic_id', clinicId)
          .in('group_id', groupIds)
          .eq('can_view', true);

        const resolved = (perms || []).map((row: { permission_key: MenuPermissionKey }) => row.permission_key);
        setPermissions(new Set<MenuPermissionKey>(resolved));
      } catch {
        setPermissions(new Set());
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user, clinicId, role, roleLoading]);

  const api = useMemo(() => ({
    loading,
    permissions,
    has: (key: MenuPermissionKey) => permissions.has(key),
  }), [loading, permissions]);

  return api;
}
