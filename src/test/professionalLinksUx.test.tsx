import { render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import ProfessionalLinksTab from '@/components/settings/ProfessionalLinksTab';

const { calls, roleState } = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
  roleState: { value: 'admin' },
}));

const tableData: Record<string, unknown[]> = {
  professionals: [{ id: 'professional-a', full_name: 'Dra. Helena Costa', specialty: 'Dermatologia', status: 'active', private_consultation_price: 350 }],
  clinic_locations: [
    { id: 'location-a', name: 'Unidade Principal', is_primary: true, active: true },
    { id: 'location-b', name: 'Unidade Jardins', is_primary: false, active: true },
    { id: 'location-c', name: 'Unidade Antiga', is_primary: false, active: false },
  ],
  treatments: [{ id: 'service-a', name: 'Consulta Dermatológica', is_active: true }, { id: 'service-b', name: 'Peeling', is_active: true }],
  health_insurances: [{ id: 'insurance-a', name: 'Unimed', status: 'active' }, { id: 'insurance-b', name: 'SulAmérica', status: 'active' }],
  professional_locations: [
    { professional_id: 'professional-a', location_id: 'location-a', active: true },
    { professional_id: 'professional-a', location_id: 'location-b', active: true },
  ],
  professional_treatments: [{ professional_id: 'professional-a', treatment_id: 'service-a', status: 'active' }],
  professional_health_insurances: [{ professional_id: 'professional-a', health_insurance_id: 'insurance-a', status: 'active' }],
  professional_availability: [
    { professional_id: 'professional-a', location_id: 'location-a', day_of_week: 1, start_time: '08:00:00', end_time: '12:00:00' },
    { professional_id: 'professional-a', location_id: 'location-b', day_of_week: 1, start_time: '14:00:00', end_time: '18:00:00' },
  ],
  professional_settings: [{ professional_id: 'professional-a', private_appointment_duration_minutes: 60 }],
};

function queryChain(table: string) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order']) chain[method] = vi.fn((...args: unknown[]) => { calls.push({ table, method, args }); return chain; });
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: tableData[table] || [], error: null }).then(resolve);
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn((table: string) => queryChain(table)) } }));
vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => ({ clinicId: 'clinic-a', role: roleState.value }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

describe('Professional Links UX', () => {
  beforeAll(() => vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }));
  beforeEach(() => { calls.length = 0; roleState.value = 'admin'; });

  it('loads canonical units, services, insurances, private care and separate hours per unit', async () => {
    render(<ProfessionalLinksTab initialProfessionalId="professional-a" />);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Unidade Principal/ })).toBeChecked());
    expect(screen.getByRole('checkbox', { name: /Unidade Jardins/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Unidade Antiga/ })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Consulta Dermatológica' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Peeling' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Unimed' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'SulAmérica' })).not.toBeChecked();
    expect(screen.getByLabelText('Valor da consulta')).toHaveValue('350');
    expect(screen.getByLabelText('Duração (minutos)')).toHaveValue(60);
    expect(screen.getByLabelText('Início de Segunda-feira, período 1', { selector: '#links-professional-a-location-a-1-0-start' })).toHaveValue('08:00');
    expect(screen.getByLabelText('Início de Segunda-feira, período 1', { selector: '#links-professional-a-location-b-1-0-start' })).toHaveValue('14:00');
    expect(document.querySelector('#links-professional-a-location-c-1-0-start')).not.toBeInTheDocument();
    for (const table of Object.keys(tableData)) expect(calls).toContainEqual({ table, method: 'eq', args: ['clinic_id', 'clinic-a'] });
  });

  it('keeps every mutation control disabled for non-admin users', async () => {
    roleState.value = 'receptionist';
    render(<ProfessionalLinksTab initialProfessionalId="professional-a" />);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Unidade Principal/ })).toBeDisabled());
    expect(screen.getByLabelText('Valor da consulta')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Salvar vínculos' })).toBeDisabled();
  });
});
