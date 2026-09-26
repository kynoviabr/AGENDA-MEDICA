import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { DEFAULT_ROLE_PERMISSIONS, MENU_PERMISSION_KEYS, type MenuPermissionKey } from '@/lib/accessPermissions';

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

    if (role === 'admin') {
      setPermissions(new Set(MENU_PERMISSION_KEYS));
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
          const fallback = DEFAULT_ROLE_PERMISSIONS[role] || [];
          setPermissions(new Set(fallback));
          return;
        }

        const { data: perms } = await supabase
          .from('access_group_permissions' as unknown)
          .select('permission_key, can_view')
          .eq('clinic_id', clinicId)
          .in('group_id', groupIds)
          .eq('can_view', true);

        const resolved = (perms || []).map((row: { permission_key: MenuPermissionKey }) => row.permission_key);
        // Safe fallback for clinics that have not provisioned access groups yet.
        if (resolved.length === 0) {
          const fallback = DEFAULT_ROLE_PERMISSIONS[role] || [];
          setPermissions(new Set(fallback));
          return;
        }

        setPermissions(new Set<MenuPermissionKey>(resolved));
      } catch {
        const fallback = DEFAULT_ROLE_PERMISSIONS[role] || [];
        setPermissions(new Set(fallback));
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
