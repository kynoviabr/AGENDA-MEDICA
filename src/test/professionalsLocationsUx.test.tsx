import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import ProfessionalsTab from '@/components/settings/ProfessionalsTab';

function queryChain(table: string) {
  const data = table === 'clinic_locations'
    ? [{ id: 'location-main', name: 'Unidade Principal', is_primary: true, active: true }]
    : table === 'professional_locations'
      ? [{ id: 'link-main', professional_id: 'professional-a', location_id: 'location-main', active: true }]
      : [];
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order']) chain[method] = vi.fn(() => chain);
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve);
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn((table: string) => queryChain(table)) } }));
vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => ({ clinicId: 'clinic-a', role: 'admin' }) }));
vi.mock('@/hooks/useProfessionals', () => ({
  useProfessionals: () => ({
    items: [{ id: 'professional-a', clinic_id: 'clinic-a', user_id: null, role_id: 'role-a', class_entity_id: 'entity-a', full_name: 'Dra. Helena Costa', cpf: null, email: null, phone: null, additional_phones: [], private_consultation_price: null, registration_number: '123', specialty: 'Dermatologia', status: 'active', created_at: '2026-08-16T10:00:00Z', updated_at: '2026-08-16T10:00:00Z' }],
    loading: false, create: vi.fn(), toggleStatus: vi.fn(),
  }),
}));
vi.mock('@/hooks/useRoles', () => ({ useRoles: () => ({ items: [{ id: 'role-a', name: 'Médico', status: 'active' }] }) }));
vi.mock('@/hooks/useClassEntities', () => ({ useClassEntities: () => ({ items: [{ id: 'entity-a', name: 'Conselho Regional de Medicina', abbreviation: 'CRM', status: 'active' }] }) }));
vi.mock('@/hooks/useProfessionalTreatments', () => ({ useProfessionalTreatments: () => ({ items: [] }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

describe('Professionals operational links UX', () => {
  beforeAll(() => vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }));

  it('keeps professional data focused and delegates operational links to the central screen', async () => {
    const onManageLinks = vi.fn();
    render(<ProfessionalsTab onManageLinks={onManageLinks} />);
    await waitFor(() => expect(screen.getByText('Unidade Principal · Principal')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Gerenciar vínculos' }));
    expect(onManageLinks).toHaveBeenCalledWith('professional-a');

    fireEvent.click(screen.getByRole('button', { name: /Novo Profissional/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Cadastrar Profissional' });
    expect(within(dialog).queryByText('Tratamentos Realizados')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Unidades de atendimento')).not.toBeInTheDocument();
    expect(within(dialog).getByText(/configure unidades, serviços, convênios e horário padrão/)).toBeInTheDocument();
  });
});
