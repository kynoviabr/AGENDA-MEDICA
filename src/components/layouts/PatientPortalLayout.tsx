import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Home, FileText, CreditCard, CalendarDays, Activity, Camera, MessageSquare, LogOut
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { cn } from '@/lib/utils';
import NotificationBell from '@/components/NotificationBell';

const portalNav = [
  { to: '/portal', icon: Home, label: 'Início' },
  { to: '/portal/contract', icon: FileText, label: 'Contrato' },
  { to: '/portal/payments', icon: CreditCard, label: 'Pagamentos' },
  { to: '/portal/sessions', icon: CalendarDays, label: 'Sessões' },
  { to: '/portal/evolution', icon: Activity, label: 'Evolução' },
  { to: '/portal/photos', icon: Camera, label: 'Fotos' },
  { to: '/portal/feedback', icon: MessageSquare, label: 'Avaliação' },
];

/**
 * Stripe-style patient portal (mobile-first).
 * Sticky 60px navy header, page bg, navy bottom nav.
 */
export default function PatientPortalLayout() {
  const { signOut } = useAuth();
  const { clinicName } = useBranding();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-bg-page flex flex-col">
      <header className="sticky top-0 z-50 glass-navy border-b border-[hsl(var(--sidebar-border))] h-[60px] px-4 flex items-center">
        <div className="max-w-lg mx-auto w-full flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-white/55 font-semibold leading-none">
              {clinicName}
            </p>
            <h1 className="font-heading font-semibold text-white text-[15px] leading-tight mt-0.5 truncate">
              Meu Tratamento
            </h1>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button
              onClick={signOut}
              className="p-2 rounded-btn text-white/80 hover:bg-white/10 transition-colors"
              aria-label="Sair"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-6 pb-24">
        <Outlet />
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border shadow-stripe-md">
        <div className="max-w-lg mx-auto flex justify-around py-2 px-2">
          {portalNav.slice(0, 5).map(({ to, icon: Icon, label }) => {
            const isActive = location.pathname === to;
            return (
              <NavLink
                key={to}
                to={to}
                className={cn(
                  'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-btn text-[11px] font-medium transition-colors duration-150',
                  isActive
                    ? 'text-primary-dark bg-primary-light'
                    : 'text-[hsl(var(--text-muted))] hover:text-foreground'
                )}
              >
                <Icon className={cn('w-5 h-5', isActive && 'stroke-[2.5]')} />
                {label}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
