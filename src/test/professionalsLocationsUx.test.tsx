import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import ProfessionalsTab from '@/components/settings/ProfessionalsTab';

const { dbCalls } = vi.hoisted(() => ({
  dbCalls: [] as Array<{ table: string; method: string; args: unknown[] }>,
}));

const locations = [
  { id: 'location-main', name: 'Unidade Principal', is_primary: true, active: true },
  { id: 'location-second', name: 'Unidade Centro', is_primary: false, active: true },
  { id: 'location-inactive', name: 'Unidade Antiga', is_primary: false, active: false },
];

const links = [
  { id: 'link-main', professional_id: 'professional-a', location_id: 'location-main', active: true },
  { id: 'link-inactive', professional_id: 'professional-a', location_id: 'location-inactive', active: true },
];

function resultFor(table: string) {
  if (table === 'clinic_locations') return { data: locations, error: null };
  if (table === 'professional_locations') return { data: links, error: null };
  if (table === 'treatments') return { data: [], error: null };
  return { data: [], error: null, count: 0 };
}

function queryChain(table: string) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'gte', 'in', 'order', 'update', 'upsert']) {
    chain[method] = vi.fn((...args: unknown[]) => {
      dbCalls.push({ table, method, args });
      return chain;
    });
  }
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resultFor(table)).then(resolve);
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn((table: string) => queryChain(table)) },
}));
vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => ({ clinicId: 'clinic-a', role: 'admin' }) }));
vi.mock('@/hooks/useProfessionals', () => ({
  useProfessionals: () => ({
    items: [{
      id: 'professional-a', clinic_id: 'clinic-a', user_id: null, role_id: 'role-a', class_entity_id: 'entity-a',
      full_name: 'Dra. Helena Costa', cpf: null, email: null, phone: null, additional_phones: [],
      private_consultation_price: null, registration_number: '123', specialty: 'Dermatologia', status: 'active',
      created_at: '2026-08-16T10:00:00Z', updated_at: '2026-08-16T10:00:00Z',
    }],
    loading: false,
    create: vi.fn(),
    toggleStatus: vi.fn(),
  }),
}));
vi.mock('@/hooks/useRoles', () => ({ useRoles: () => ({ items: [{ id: 'role-a', name: 'Médico', status: 'active' }] }) }));
vi.mock('@/hooks/useClassEntities', () => ({ useClassEntities: () => ({ items: [{ id: 'entity-a', name: 'Conselho Regional de Medicina', abbreviation: 'CRM', status: 'active' }] }) }));
vi.mock('@/hooks/useProfessionalTreatments', () => ({ useProfessionalTreatments: () => ({ items: [], create: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

describe('Professionals location UX', () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    dbCalls.length = 0;
  });

  it('shows linked units on the professional and loads existing links checked in the editor', async () => {
    render(<ProfessionalsTab />);

    await waitFor(() => expect(screen.getByText('Unidade Principal · Principal')).toBeInTheDocument());
    expect(screen.getByText('Unidade Antiga · Inativa')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Unidades' }));

    const dialog = await screen.findByRole('dialog', { name: 'Unidades de atendimento' });
    expect(within(dialog).getByText(/Defina em quais unidades Dra. Helena Costa realiza atendimentos/)).toBeInTheDocument();
    expect(within(dialog).getByRole('checkbox', { name: /Unidade Principal/ })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: /Unidade Centro/ })).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: /Unidade Antiga/ })).toBeChecked();
  });

  it('allows selecting multiple active units while creating a professional and identifies inactive units', async () => {
    render(<ProfessionalsTab />);
    fireEvent.click(screen.getByRole('button', { name: /Novo Profissional/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Cadastrar Profissional' });
    const main = within(dialog).getByRole('checkbox', { name: /Unidade Principal/ });
    const second = within(dialog).getByRole('checkbox', { name: /Unidade Centro/ });
    const inactive = within(dialog).getByRole('checkbox', { name: /Unidade Antiga/ });
    fireEvent.click(main);
    fireEvent.click(second);
    await waitFor(() => {
      expect(within(dialog).getByRole('checkbox', { name: /Unidade Principal/ })).toBeChecked();
      expect(within(dialog).getByRole('checkbox', { name: /Unidade Centro/ })).toBeChecked();
    });
    expect(inactive).toBeDisabled();
    expect(within(dialog).getByText('Principal')).toBeInTheDocument();
    expect(within(dialog).getByText('Inativa')).toBeInTheDocument();
  });

  it('saves additions through tenant-scoped professional_locations upsert', async () => {
    render(<ProfessionalsTab />);
    await screen.findByText('Unidade Principal · Principal');
    fireEvent.click(screen.getByRole('button', { name: 'Unidades' }));
    const dialog = await screen.findByRole('dialog', { name: 'Unidades de atendimento' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Unidade Centro/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar unidades' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Unidades de atendimento' })).not.toBeInTheDocument());
    const upsert = dbCalls.find(call => call.table === 'professional_locations' && call.method === 'upsert');
    expect(upsert?.args[0]).toEqual([{ clinic_id: 'clinic-a', professional_id: 'professional-a', location_id: 'location-second', active: true }]);
    expect(dbCalls).toContainEqual({ table: 'professional_locations', method: 'eq', args: ['clinic_id', 'clinic-a'] });
  });

  it('removes a cleared link by inactivation instead of destructive deletion', async () => {
    render(<ProfessionalsTab />);
    await screen.findByText('Unidade Principal · Principal');
    fireEvent.click(screen.getByRole('button', { name: 'Unidades' }));
    const dialog = await screen.findByRole('dialog', { name: 'Unidades de atendimento' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Unidade Principal/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar unidades' }));

    await waitFor(() => expect(dbCalls.some(call =>
      call.table === 'professional_locations'
      && call.method === 'update'
      && JSON.stringify(call.args[0]) === JSON.stringify({ active: false }),
    )).toBe(true));
    expect(dbCalls.some(call => call.method === 'delete')).toBe(false);
    expect(dbCalls).toContainEqual({ table: 'professional_locations', method: 'in', args: ['location_id', ['location-main']] });
  });
});
