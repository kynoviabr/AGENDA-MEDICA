import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useBranding } from '@/contexts/BrandingContext';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Settings, Palette, Users, Stethoscope, Save, Upload, X, Image, UserPlus, Mail, Clock, CheckCircle, XCircle, Tags, DollarSign, SlidersHorizontal, Target, Briefcase, Building2, UserCog, AlertTriangle, Lock, MessageSquare, ClipboardList } from 'lucide-react';
import CategoriesTab from '@/components/settings/CategoriesTab';
import CostItemsTab from '@/components/settings/CostItemsTab';
import ParametersTab from '@/components/settings/ParametersTab';
import SalesGoalsTab from '@/components/settings/SalesGoalsTab';
import ProfessionalsTab from '@/components/settings/ProfessionalsTab';
import RolesTab from '@/components/settings/RolesTab';
import ClassEntitiesTab from '@/components/settings/ClassEntitiesTab';
import DashboardAlertsTab from '@/components/settings/DashboardAlertsTab';
import KanbanStagesTab from '@/components/settings/KanbanStagesTab';
import PatientAppAccessTab from '@/components/settings/PatientAppAccessTab';
import AccessGroupsTab from '@/components/settings/AccessGroupsTab';
import WhatsAppAiSettingsTab from '@/components/settings/WhatsAppAiSettingsTab';
import AnamneseTemplatesTab from '@/components/settings/AnamneseTemplatesTab';
import TreatmentsPage from '@/pages/clinic/TreatmentsPage';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function SettingsPage() {
  const { clinicId, role } = useUserRole();
  const { user } = useAuth();
  const branding = useBranding();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clinic info
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [whatsapp, setWhatsapp] = useState('');

  // Colors
  const [primaryColor, setPrimaryColor] = useState('#1a7a6d');
  const [secondaryColor, setSecondaryColor] = useState('#f5f0e8');
  const [accentColor, setAccentColor] = useState('#c8912e');

  // Logo
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Staff
  const [staff, setStaff] = useState<unknown[]>([]);

  // Invitations
  const [invitations, setInvitations] = useState<unknown[]>([]);

  // Invite form
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('professional');
  const [inviteCargo, setInviteCargo] = useState('');
  const [inviting, setInviting] = useState(false);
  const [cargos, setCargos] = useState<Array<{ id: string; name: string; description: string | null; status: string }>>([]);

  const mapCargoToSystemRole = (cargoName: string) => {
    const normalized = cargoName.toLowerCase();
    if (normalized.includes('recepcion') || normalized.includes('coordenador') || normalized.includes('atendimento')) return 'receptionist';
    if (normalized.includes('comercial') || normalized.includes('venda') || normalized.includes('consultor')) return 'sales';
    return 'professional';
  };

  const loadCargos = useCallback(async () => {
    if (!clinicId) return;
    const { data, error } = await supabase
      .from('roles')
      .select('id,name,description,status')
      .eq('clinic_id', clinicId)
      .eq('status', 'active')
      .order('name');
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    setCargos((data || []) as Array<{ id: string; name: string; description: string | null; status: string }>);
  }, [clinicId, toast]);

  const loadTeam = useCallback(async () => {
    if (!clinicId) return;
    const [staffRes, invRes] = await Promise.all([
      supabase.from('user_roles').select('id, user_id, role, is_active, created_at').eq('clinic_id', clinicId),
      supabase.from('team_invitations' as unknown).select('*').eq('clinic_id', clinicId).order('created_at', { ascending: false }),
    ]);
    if (staffRes.data) setStaff(staffRes.data);
    if (invRes.data) setInvitations(invRes.data as unknown[]);
  }, [clinicId]);

  useEffect(() => {
    if (!clinicId) return;

    supabase.from('clinics').select('*').eq('id', clinicId).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setName(data.name); setPhone(data.phone || ''); setEmail(data.email || '');
          setAddress(data.address || ''); setWhatsapp(data.support_whatsapp || '');
          setPrimaryColor(data.primary_color || '#1a7a6d');
          setSecondaryColor(data.secondary_color || '#f5f0e8');
          setAccentColor(data.accent_color || '#c8912e');
          setLogoUrl(data.logo_url);
        }
      });

    loadTeam();
    loadCargos();

  }, [clinicId, loadTeam, loadCargos]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !clinicId) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Arquivo inválido', description: 'Selecione uma imagem (JPG, PNG, WebP)', variant: 'destructive' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'O logo deve ter no máximo 2MB', variant: 'destructive' });
      return;
    }
    setUploading(true);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const filePath = `${clinicId}/logo.${ext}`;
    const { error: uploadError } = await supabase.storage.from('clinic-logos').upload(filePath, file, { upsert: true, contentType: file.type });
    if (uploadError) { toast({ title: 'Erro no upload', description: uploadError.message, variant: 'destructive' }); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('clinic-logos').getPublicUrl(filePath);
    const urlWithCacheBust = `${publicUrl}?t=${Date.now()}`;
    const { error: updateError } = await supabase.from('clinics').update({ logo_url: urlWithCacheBust }).eq('id', clinicId);
    setUploading(false);
    if (updateError) { toast({ title: 'Erro ao salvar', description: updateError.message, variant: 'destructive' }); return; }
    setLogoUrl(urlWithCacheBust);
    toast({ title: 'Logo atualizado!' });
  };

  const handleRemoveLogo = async () => {
    if (!clinicId) return;
    setUploading(true);
    const { error } = await supabase.from('clinics').update({ logo_url: null }).eq('id', clinicId);
    setUploading(false);
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    setLogoUrl(null);
    toast({ title: 'Logo removido' });
  };

  const saveClinic = async () => {
    if (!clinicId || role !== 'admin') return;
    setSaving(true);
    const { error } = await supabase.from('clinics').update({
      name, phone, email, address, support_whatsapp: whatsapp,
      primary_color: primaryColor, secondary_color: secondaryColor, accent_color: accentColor,
    }).eq('id', clinicId);
    setSaving(false);
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Configurações salvas!' });
    window.location.reload();
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicId || !inviteEmail.trim() || !inviteCargo) return;
    setInviting(true);

    try {
      const derivedRole = mapCargoToSystemRole(inviteCargo);
      setInviteRole(derivedRole);
      const { data, error } = await supabase.functions.invoke('invite-team-member', {
        body: { email: inviteEmail.trim(), role: derivedRole, clinicId, cargoName: inviteCargo },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: data.status === 'added' ? 'Membro adicionado!' : 'Convite enviado!', description: data.message });
      setInviteEmail('');
      setInviteCargo('');
      setInviteOpen(false);
      loadTeam();
    } catch (err: unknown) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setInviting(false);
    }
  };

  const handleToggleActive = async (staffId: string, currentActive: boolean) => {
    const { error } = await supabase.from('user_roles').update({ is_active: !currentActive }).eq('id', staffId);
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    toast({ title: currentActive ? 'Membro desativado' : 'Membro reativado' });
    loadTeam();
  };

  const handleCancelInvitation = async (invId: string) => {
    const { error } = await supabase.from('team_invitations' as unknown).update({ status: 'cancelled' } as unknown).eq('id', invId);
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Convite cancelado' });
    loadTeam();
  };

  const roleLabel: Record<string, string> = { admin: 'Admin', receptionist: 'Recepcionista', professional: 'Profissional', sales: 'Vendas' };
  const roleBadgeVariant = (r: string) => r === 'admin' ? 'default' : 'outline';

  return (
    <div>
      <PageHeader title="Configurações" description="Gerencie sua clínica" />

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="general"><Settings className="w-4 h-4 mr-1" />Geral</TabsTrigger>
          <TabsTrigger value="branding"><Palette className="w-4 h-4 mr-1" />Branding</TabsTrigger>
          <TabsTrigger value="roles"><Briefcase className="w-4 h-4 mr-1" />Cargos</TabsTrigger>
          <TabsTrigger value="entities"><Building2 className="w-4 h-4 mr-1" />Conselhos</TabsTrigger>
          <TabsTrigger value="categories"><Tags className="w-4 h-4 mr-1" />Categorias</TabsTrigger>
          <TabsTrigger value="costs"><DollarSign className="w-4 h-4 mr-1" />Custos</TabsTrigger>
          <TabsTrigger value="team"><Lock className="w-4 h-4 mr-1" />Segurança e Acesso</TabsTrigger>
          <TabsTrigger value="professionals"><UserCog className="w-4 h-4 mr-1" />Profissionais</TabsTrigger>
          <TabsTrigger value="treatments"><Stethoscope className="w-4 h-4 mr-1" />Tratamentos</TabsTrigger>
          <TabsTrigger value="anamnese"><ClipboardList className="w-4 h-4 mr-1" />Anamnese</TabsTrigger>
          <TabsTrigger value="whatsapp-ai"><MessageSquare className="w-4 h-4 mr-1" />WhatsApp IA</TabsTrigger>
          <TabsTrigger value="crm-kanban"><Settings className="w-4 h-4 mr-1" />CRM Kanban</TabsTrigger>
          <TabsTrigger value="goals"><Target className="w-4 h-4 mr-1" />Metas</TabsTrigger>
          <TabsTrigger value="parameters"><SlidersHorizontal className="w-4 h-4 mr-1" />Parâmetros</TabsTrigger>
        </TabsList>

        {/* ===== GENERAL ===== */}
        <TabsContent value="general">
          <Card className="shadow-card">
            <CardHeader><CardTitle>Dados da Clínica</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Nome</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
                <div className="space-y-2"><Label>Telefone</Label><Input value={phone} onChange={e => setPhone(e.target.value)} /></div>
                <div className="space-y-2"><Label>E-mail</Label><Input value={email} onChange={e => setEmail(e.target.value)} /></div>
                <div className="space-y-2"><Label>WhatsApp Suporte</Label><Input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} /></div>
              </div>
              <div className="space-y-2"><Label>Endereço</Label><Input value={address} onChange={e => setAddress(e.target.value)} /></div>
              <Button onClick={saveClinic} disabled={saving || role !== 'admin'} className="gradient-primary text-primary-foreground">
                <Save className="w-4 h-4 mr-2" />{saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== BRANDING ===== */}
        <TabsContent value="branding">
          <Card className="shadow-card">
            <CardHeader><CardTitle>Identidade Visual</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              {/* Logo */}
              <div className="space-y-3">
                <Label>Logo da Clínica</Label>
                <div className="flex items-center gap-4">
                  {logoUrl ? (
                    <div className="relative group">
                      <img src={logoUrl} alt="Logo" className="w-20 h-20 rounded-xl object-cover border shadow-sm" />
                      <button onClick={handleRemoveLogo} disabled={uploading || role !== 'admin'}
                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                      <Image className="w-8 h-8 text-muted-foreground/40" />
                    </div>
                  )}
                  <div>
                    <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} className="hidden" />
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading || role !== 'admin'} size="sm">
                      <Upload className="w-4 h-4 mr-2" />{uploading ? 'Enviando...' : logoUrl ? 'Trocar Logo' : 'Enviar Logo'}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG ou WebP • Máx. 2MB</p>
                  </div>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">As cores serão aplicadas em todo o sistema.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {[
                  { label: 'Cor Primária', value: primaryColor, set: setPrimaryColor },
                  { label: 'Cor Secundária', value: secondaryColor, set: setSecondaryColor },
                  { label: 'Cor de Destaque', value: accentColor, set: setAccentColor },
                ].map(({ label, value, set }) => (
                  <div key={label} className="space-y-2">
                    <Label>{label}</Label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={value} onChange={e => set(e.target.value)} className="w-10 h-10 rounded-lg border cursor-pointer" />
                      <Input value={value} onChange={e => set(e.target.value)} className="font-mono text-sm" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-xl border">
                <p className="text-sm font-medium text-foreground mb-3">Pré-visualização</p>
                <div className="flex items-center gap-4 mb-4">
                  {logoUrl ? <img src={logoUrl} alt="" className="w-10 h-10 rounded-lg object-cover" /> : (
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: primaryColor }}>
                      <Stethoscope className="w-5 h-5 text-white" />
                    </div>
                  )}
                  <span className="font-bold text-foreground">{name || 'Sua Clínica'}</span>
                </div>
                <div className="flex gap-3">
                  <div className="h-12 flex-1 rounded-lg flex items-center justify-center text-xs font-semibold text-white" style={{ background: primaryColor }}>Primária</div>
                  <div className="h-12 flex-1 rounded-lg flex items-center justify-center text-xs font-semibold border" style={{ background: secondaryColor }}>Secundária</div>
                  <div className="h-12 flex-1 rounded-lg flex items-center justify-center text-xs font-semibold text-white" style={{ background: accentColor }}>Destaque</div>
                </div>
              </div>

              <Button onClick={saveClinic} disabled={saving || role !== 'admin'} className="gradient-primary text-primary-foreground">
                <Save className="w-4 h-4 mr-2" />{saving ? 'Salvando...' : 'Aplicar Branding'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TEAM ===== */}
        <TabsContent value="team">
          <Tabs defaultValue="internal-team" className="space-y-4">
            <TabsList>
              <TabsTrigger value="internal-team">Equipe (acessos internos)</TabsTrigger>
              <TabsTrigger value="groups-permissions">Grupos e permissões</TabsTrigger>
              <TabsTrigger value="patient-app-access">Pacientes APP</TabsTrigger>
            </TabsList>

            <TabsContent value="internal-team" className="space-y-4">
            {/* Invite button */}
            <div className="flex justify-end">
              <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogTrigger asChild>
                  <Button className="gradient-primary text-primary-foreground" disabled={role !== 'admin'}>
                    <UserPlus className="w-4 h-4 mr-2" />Convidar Membro
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Convidar Membro da Equipe</DialogTitle></DialogHeader>
                  <form onSubmit={handleInvite} className="space-y-4">
                    <div className="space-y-2">
                      <Label>E-mail</Label>
                      <Input
                        type="email"
                        placeholder="colaborador@email.com"
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Cargo</Label>
                      <Select value={inviteCargo} onValueChange={setInviteCargo}>
                        <SelectTrigger><SelectValue placeholder="Selecionar cargo" /></SelectTrigger>
                        <SelectContent>
                          {cargos.map((cargo) => (
                            <SelectItem key={cargo.id} value={cargo.name}>{cargo.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {inviteCargo
                          ? `Perfil de acesso aplicado automaticamente: ${mapCargoToSystemRole(inviteCargo) === 'sales'
                            ? 'Vendas'
                            : mapCargoToSystemRole(inviteCargo) === 'receptionist'
                              ? 'Recepcionista'
                              : 'Profissional'
                          }.`
                          : 'Selecione um cargo cadastrado na aba Cargos.'}
                      </p>
                    </div>
                    <Button type="submit" disabled={inviting} className="w-full gradient-primary text-primary-foreground">
                      <Mail className="w-4 h-4 mr-2" />{inviting ? 'Enviando...' : 'Enviar Convite'}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {/* Active team */}
            <Card className="shadow-card">
              <CardHeader><CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" />Membros Ativos</CardTitle></CardHeader>
              <CardContent>
                {staff.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhum membro na equipe</p>
                ) : (
                  <div className="divide-y divide-border">
                    {staff.map(s => (
                      <div key={s.id} className="flex items-center justify-between py-3 gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shrink-0">
                            <Users className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {s.user_id === user?.id ? 'Você' : `Usuário ${s.user_id.slice(0, 8)}...`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Desde {format(new Date(s.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={roleBadgeVariant(s.role)}>{roleLabel[s.role] || s.role}</Badge>
                          <Badge variant={s.is_active ? 'default' : 'secondary'} className={s.is_active ? 'bg-green-100 text-green-700' : ''}>
                            {s.is_active ? 'Ativo' : 'Inativo'}
                          </Badge>
                          {role === 'admin' && s.user_id !== user?.id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleActive(s.id, s.is_active)}
                              className="text-xs"
                            >
                              {s.is_active ? 'Desativar' : 'Reativar'}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pending invitations */}
            {invitations.length > 0 && (
              <Card className="shadow-card">
                <CardHeader><CardTitle className="flex items-center gap-2"><Mail className="w-5 h-5" />Convites</CardTitle></CardHeader>
                <CardContent>
                  <div className="divide-y divide-border">
                    {invitations.map((inv: unknown) => {
                      const isPending = inv.status === 'pending';
                      const isAccepted = inv.status === 'accepted';
                      return (
                        <div key={inv.id} className="flex items-center justify-between py-3 gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                              isPending ? 'bg-yellow-100' : isAccepted ? 'bg-green-100' : 'bg-muted'
                            }`}>
                              {isPending ? <Clock className="w-4 h-4 text-yellow-600" /> :
                               isAccepted ? <CheckCircle className="w-4 h-4 text-green-600" /> :
                               <XCircle className="w-4 h-4 text-muted-foreground" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{inv.email}</p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(inv.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant="outline">{roleLabel[inv.role] || inv.role}</Badge>
                            {inv.cargo_name && (
                              <Badge variant="secondary">{inv.cargo_name}</Badge>
                            )}
                            <Badge variant={isPending ? 'secondary' : isAccepted ? 'default' : 'destructive'}
                              className={isPending ? 'bg-yellow-100 text-yellow-700' : isAccepted ? 'bg-green-100 text-green-700' : ''}>
                              {isPending ? 'Pendente' : isAccepted ? 'Aceito' : 'Cancelado'}
                            </Badge>
                            {isPending && role === 'admin' && (
                              <Button variant="ghost" size="sm" onClick={() => handleCancelInvitation(inv.id)} className="text-xs text-destructive">
                                Cancelar
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
            </TabsContent>

            <TabsContent value="patient-app-access">
              <PatientAppAccessTab />
            </TabsContent>

            <TabsContent value="groups-permissions">
              <AccessGroupsTab />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ===== TREATMENTS ===== */}
        <TabsContent value="treatments">
          <TreatmentsPage embedded />
        </TabsContent>

        <TabsContent value="anamnese">
          <AnamneseTemplatesTab />
        </TabsContent>

        <TabsContent value="whatsapp-ai">
          <WhatsAppAiSettingsTab />
        </TabsContent>

        {/* ===== CATEGORIES ===== */}
        <TabsContent value="categories">
          <CategoriesTab />
        </TabsContent>

        {/* ===== COSTS ===== */}
        <TabsContent value="costs">
          <CostItemsTab />
        </TabsContent>

        {/* ===== PARAMETERS ===== */}
        <TabsContent value="parameters">
          <div className="space-y-6">
            <ParametersTab />
            <div>
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Alertas Dashboard</h3>
              </div>
              <DashboardAlertsTab />
            </div>
          </div>
        </TabsContent>

        {/* ===== SALES GOALS ===== */}
        <TabsContent value="goals">
          <SalesGoalsTab />
        </TabsContent>

        <TabsContent value="crm-kanban">
          <KanbanStagesTab />
        </TabsContent>

        <TabsContent value="professionals">
          <ProfessionalsTab />
        </TabsContent>

        <TabsContent value="roles">
          <RolesTab />
        </TabsContent>

        <TabsContent value="entities">
          <ClassEntitiesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
