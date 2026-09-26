import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAccessControl } from '@/hooks/useAccessControl';

const mockGetUser = vi.fn();
const mockUseAuth = vi.fn();
const mockUseUserRole = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/hooks/useUserRole', () => ({
  useUserRole: () => mockUseUserRole(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

describe('useAccessControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty permissions when user or clinicId is missing', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    mockUseUserRole.mockReturnValue({ clinicId: null, role: null, loading: false });

    const { result } = renderHook(() => useAccessControl());
    expect(result.current.loading).toBe(false);
    expect(result.current.permissions.size).toBe(0);
    expect(result.current.has('dashboard.view')).toBe(false);
  });

  it('loads permissions exclusively from access groups without role bypass', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'admin-1' } });
    mockUseUserRole.mockReturnValue({ clinicId: 'clinic-1', role: 'admin', loading: false });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_access_groups') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => Promise.resolve({ data: [{ group_id: 'grp-admin' }], error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'access_group_permissions') {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                eq: () => Promise.resolve({
                  data: [
                    { permission_key: 'dashboard.view' },
                    { permission_key: 'settings.view' },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    const { result } = renderHook(() => useAccessControl());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.has('dashboard.view')).toBe(true);
    expect(result.current.has('settings.view')).toBe(true);
    expect(result.current.has('crm.view')).toBe(false);
  });

  it('yields empty permissions if admin has no assigned groups (no hardcoded bypass)', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'admin-unassigned' } });
    mockUseUserRole.mockReturnValue({ clinicId: 'clinic-1', role: 'admin', loading: false });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_access_groups') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    const { result } = renderHook(() => useAccessControl());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.permissions.size).toBe(0);
    expect(result.current.has('dashboard.view')).toBe(false);
    expect(result.current.has('settings.view')).toBe(false);
  });

  it('yields empty permissions on fetch failure (no fallback to default permissions)', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'user-err' } });
    mockUseUserRole.mockReturnValue({ clinicId: 'clinic-1', role: 'receptionist', loading: false });

    mockFrom.mockImplementation(() => {
      throw new Error('Database connection failed');
    });

    const { result } = renderHook(() => useAccessControl());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.permissions.size).toBe(0);
    expect(result.current.has('dashboard.view')).toBe(false);
  });
});
