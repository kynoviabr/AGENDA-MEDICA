import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from '@/pages/clinic/SettingsPage';

const { clinicUpdates, clinicEqCalls, roleState, toastMock, storageUploadMock, storagePublicUrlMock } = vi.hoisted(() => ({
  clinicUpdates: [] as Array<Record<string, unknown>>,
  clinicEqCalls: [] as Array<[string, unknown]>,
  roleState: { value: 'admin' },
  toastMock: vi.fn(),
  storageUploadMock: vi.fn(async () => ({ error: null })),
  storagePublicUrlMock: vi.fn(() => ({ data: { publicUrl: 'https://storage.test/clinic-a/logo.png' } })),
}));

const clinic = {
  id: 'clinic-a', name: 'Clínica Aura', email: 'administrativo@aura.test', phone: '(11) 3333-3333',
  support_whatsapp: '(11) 99999-9999', address: 'Endereço legado', primary_color: '#1a7a6d',
  secondary_color: '#f5f0e8', accent_color: '#c8912e', logo_url: null,
  administrative_manager_name: 'Maria Silva', reception_contact_name: 'Ana Souza',
};

function queryChain() {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn((column: string, value: unknown) => { clinicEqCalls.push([column, value]); return chain; });
  chain.update = vi.fn((payload: Record<string, unknown>) => { clinicUpdates.push(payload); return chain; });
  chain.limit = vi.fn(() => chain);
  chain.order = vi.fn(async () => ({ data: [] }));
  chain.maybeSingle = vi.fn(async () => ({ data: clinic, error: null }));
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
  return chain;
}

vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => ({ clinicId: 'clinic-a', role: roleState.value }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-a' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => queryChain()),
    storage: { from: vi.fn(() => ({ upload: storageUploadMock, getPublicUrl: storagePublicUrlMock })) },
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
vi.mock('@/components/settings/ProfessionalLinksTab', () => ({ default: () => <div>Central de vínculos</div> }));
vi.mock('@/components/settings/RegistrationsTab', () => ({ default: () => <div>Cadastros auxiliares</div> }));
vi.mock('@/pages/clinic/TreatmentsPage', () => ({ default: () => null }));
vi.mock('@/pages/clinic/ServicesPage', () => ({ default: () => null }));

describe('Settings General UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clinicUpdates.length = 0;
    clinicEqCalls.length = 0;
    roleState.value = 'admin';
  });

  it('shows clinic data, administrative contacts and the shared locations manager', async () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByLabelText('Nome da clínica')).toHaveValue('Clínica Aura'));
    expect(screen.getByLabelText('Logo da clínica')).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp');
    expect(screen.getByRole('button', { name: 'Enviar logo' })).toBeInTheDocument();
    expect(screen.getByText('Logo da clínica').compareDocumentPosition(screen.getByText('Nome da clínica')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByLabelText('E-mail administrativo')).toHaveValue('administrativo@aura.test');
    expect(screen.getByLabelText('Gestor responsável')).toHaveValue('Maria Silva');
    expect(screen.getByLabelText('Secretária / responsável pela recepção')).toHaveValue('Ana Souza');
    expect(screen.getByLabelText('WhatsApp administrativo')).toHaveValue('(11) 99999-9999');
    expect(screen.getByLabelText('Telefone administrativo')).toHaveValue('(11) 3333-3333');
    expect(screen.getByText(/WhatsApp utilizado no atendimento de pacientes é configurado em WhatsApp IA/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Unidades' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar unidade' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar unidade' })).toBeInTheDocument();
    expect(screen.queryByText('Profissional × unidade')).not.toBeInTheDocument();
    const settingsTabs = screen.getByRole('tablist');
    expect(settingsTabs).toHaveClass('grid', 'grid-cols-2', 'sm:grid-cols-3', 'lg:grid-cols-5');
    expect(within(settingsTabs).getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Geral', 'Profissionais', 'Serviços', 'Vínculos', 'Atendimento', 'Regras', 'WhatsApp IA', 'CRM Kanban', 'Segurança e Acesso', 'Cadastros',
    ]);
    expect(within(settingsTabs).queryByRole('tab', { name: 'Cargos' })).not.toBeInTheDocument();
    expect(within(settingsTabs).queryByRole('tab', { name: 'Conselhos' })).not.toBeInTheDocument();
    expect(within(settingsTabs).queryByRole('tab', { name: 'Categorias' })).not.toBeInTheDocument();
  });

  it('does not expose the legacy clinic address or a duplicate Units tab', async () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    await screen.findByLabelText('Nome da clínica');
    expect(screen.queryByDisplayValue('Endereço legado')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Unidades' })).not.toBeInTheDocument();
  });

  it('removes the Branding tab and color/theme controls from Settings UI', async () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    await screen.findByLabelText('Nome da clínica');
    expect(screen.queryByRole('tab', { name: 'Branding' })).not.toBeInTheDocument();
    expect(screen.queryByText('Identidade Visual')).not.toBeInTheDocument();
    expect(screen.queryByText('Cor Primária')).not.toBeInTheDocument();
    expect(screen.queryByText('Cor Secundária')).not.toBeInTheDocument();
    expect(screen.queryByText('Cor de Destaque')).not.toBeInTheDocument();
    expect(screen.queryByText(/As cores serão aplicadas em todo o sistema/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aplicar Branding' })).not.toBeInTheDocument();
  });

  it('falls back to General for the legacy Branding deep link', async () => {
    render(<MemoryRouter initialEntries={['/clinic/settings?section=branding']}><SettingsPage /></MemoryRouter>);
    await screen.findByLabelText('Logo da clínica');
    expect(screen.getByRole('tab', { name: 'Geral' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Branding' })).not.toBeInTheDocument();
  });

  it('saves trimmed administrative names, existing contacts and the current tenant', async () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    const manager = await screen.findByLabelText('Gestor responsável');
    fireEvent.change(manager, { target: { value: '  João Gestor  ' } });
    fireEvent.change(screen.getByLabelText('Secretária / responsável pela recepção'), { target: { value: '  Carla Recepção  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar dados gerais' }));

    await waitFor(() => expect(clinicUpdates).toContainEqual(expect.objectContaining({
      administrative_manager_name: 'João Gestor',
      reception_contact_name: 'Carla Recepção',
      email: 'administrativo@aura.test',
      support_whatsapp: '(11) 99999-9999',
      phone: '(11) 3333-3333',
    })));
    expect(clinicEqCalls).toContainEqual(['id', 'clinic-a']);
  });

  it('saves empty administrative names as null', async () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    await screen.findByLabelText('Gestor responsável');
    fireEvent.change(screen.getByLabelText('Gestor responsável'), { target: { value: '   ' } });
    fireEvent.change(screen.getByLabelText('Secretária / responsável pela recepção'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar dados gerais' }));

    await waitFor(() => expect(clinicUpdates).toContainEqual(expect.objectContaining({
      administrative_manager_name: null,
      reception_contact_name: null,
    })));
  });

  it('does not grant editing to a non-admin user', async () => {
    roleState.value = 'receptionist';
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    expect(await screen.findByLabelText('Gestor responsável')).toBeDisabled();
    expect(screen.getByLabelText('Secretária / responsável pela recepção')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Salvar dados gerais' })).toBeDisabled();
  });

  it('reuses clinic-logos upload and renders the uploaded logo preview', async () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    const input = await screen.findByLabelText('Logo da clínica');
    const logoFile = new File(['logo'], 'logo.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [logoFile] } });

    await waitFor(() => expect(storageUploadMock).toHaveBeenCalledWith(
      'clinic-a/logo.png',
      logoFile,
      expect.objectContaining({ upsert: true, contentType: 'image/png' }),
    ));
    await waitFor(() => expect(screen.getByAltText('Logo da clínica')).toHaveAttribute('src', expect.stringContaining('https://storage.test/clinic-a/logo.png?t=')));
    expect(clinicUpdates).toContainEqual(expect.objectContaining({ logo_url: expect.stringContaining('https://storage.test/clinic-a/logo.png?t=') }));
  });
});
