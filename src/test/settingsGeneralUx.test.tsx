import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from '@/pages/clinic/SettingsPage';

const clinic = {
  id: 'clinic-a', name: 'Clínica Aura', email: 'administrativo@aura.test', phone: '(11) 3333-3333',
  support_whatsapp: '(11) 99999-9999', address: 'Endereço legado', primary_color: '#1a7a6d',
  secondary_color: '#f5f0e8', accent_color: '#c8912e', logo_url: null,
};

function queryChain() {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.order = vi.fn(async () => ({ data: [] }));
  chain.maybeSingle = vi.fn(async () => ({ data: clinic, error: null }));
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
  return chain;
}

vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => ({ clinicId: 'clinic-a', role: 'admin' }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-a' } }) }));
vi.mock('@/contexts/BrandingContext', () => ({ useBranding: () => ({}) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => queryChain()),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), getPublicUrl: vi.fn() })) },
    functions: { invoke: vi.fn() },
  },
}));

vi.mock('@/components/settings/LocationsTab', () => ({
  default: () => <section><h2>Unidades</h2><button>Adicionar unidade</button><button>Editar unidade</button></section>,
}));
vi.mock('@/components/settings/CategoriesTab', () => ({ default: () => null }));
vi.mock('@/components/settings/ProfessionalsTab', () => ({ default: () => null }));
vi.mock('@/components/settings/RolesTab', () => ({ default: () => null }));
vi.mock('@/components/settings/ClassEntitiesTab', () => ({ default: () => null }));
vi.mock('@/components/settings/KanbanStagesTab', () => ({ default: () => null }));
vi.mock('@/components/settings/PatientAppAccessTab', () => ({ default: () => null }));
vi.mock('@/components/settings/AccessGroupsTab', () => ({ default: () => null }));
vi.mock('@/components/settings/WhatsAppAiSettingsTab', () => ({ default: () => null }));
vi.mock('@/components/settings/HealthcareSettingsTab', () => ({ default: () => null }));
vi.mock('@/components/settings/ProfessionalRulesTab', () => ({ default: () => null }));
vi.mock('@/pages/clinic/TreatmentsPage', () => ({ default: () => null }));

describe('Settings General UX', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows clinic data, administrative contacts and the shared locations manager', async () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByLabelText('Nome da clínica')).toHaveValue('Clínica Aura'));
    expect(screen.getByLabelText('E-mail administrativo')).toHaveValue('administrativo@aura.test');
    expect(screen.getByLabelText('WhatsApp administrativo')).toHaveValue('(11) 99999-9999');
    expect(screen.getByLabelText('Telefone administrativo')).toHaveValue('(11) 3333-3333');
    expect(screen.getByText(/WhatsApp utilizado no atendimento de pacientes é configurado em WhatsApp IA/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Unidades' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar unidade' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar unidade' })).toBeInTheDocument();
  });

  it('does not expose the legacy clinic address or a duplicate Units tab', async () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    await screen.findByLabelText('Nome da clínica');
    expect(screen.queryByDisplayValue('Endereço legado')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Unidades' })).not.toBeInTheDocument();
  });
});
