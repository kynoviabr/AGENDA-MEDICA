import { Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ClinicSidebar from './ClinicSidebar';
import { PATH_PERMISSION_MAP } from '@/lib/accessPermissions';
import { useAccessControl } from '@/hooks/useAccessControl';

/**
 * Stripe-style clinic shell.
 * - Sidebar: 220px (lg+)
 * - Mobile: 60px sticky top header
 * - Content area uses bg-page (#f6f9fc)
 */
export default function ClinicLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { has, loading } = useAccessControl();

  useEffect(() => {
    if (loading) return;
    const matched = PATH_PERMISSION_MAP.find((item) => location.pathname.startsWith(item.prefix));
    if (!matched) return;
    if (!has(matched.key)) {
      navigate(location.pathname === '/clinic' ? '/login' : '/clinic', { replace: true });
    }
  }, [location.pathname, has, loading, navigate]);

  return (
    <div className="min-h-screen bg-bg-page">
      <ClinicSidebar />
      <main className="lg:ml-[220px] pt-[60px] lg:pt-0 min-h-screen">
        <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-8 2xl:px-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
