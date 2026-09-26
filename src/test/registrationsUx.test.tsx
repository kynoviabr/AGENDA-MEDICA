import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RegistrationsTab from '@/components/settings/RegistrationsTab';

vi.mock('@/pages/clinic/HealthInsurancesPage', () => ({ default: () => <div>CRUD Convênios</div> }));
vi.mock('@/components/settings/RolesTab', () => ({ default: () => <div>CRUD Cargos</div> }));
vi.mock('@/components/settings/ClassEntitiesTab', () => ({ default: () => <div>CRUD Conselhos</div> }));
vi.mock('@/components/settings/CategoriesTab', () => ({ default: () => <div>CRUD Categorias</div> }));

describe('Registrations UX', () => {
  it('reuses every existing master-data screen under Cadastros', async () => {
    render(<RegistrationsTab />);
    expect(screen.getByText('CRUD Convênios')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Cargos' }), { button: 0 });
    await waitFor(() => expect(screen.getByText('CRUD Cargos')).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Conselhos' }), { button: 0 });
    await waitFor(() => expect(screen.getByText('CRUD Conselhos')).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Categorias' }), { button: 0 });
    await waitFor(() => expect(screen.getByText('CRUD Categorias')).toBeInTheDocument());
  });
});
