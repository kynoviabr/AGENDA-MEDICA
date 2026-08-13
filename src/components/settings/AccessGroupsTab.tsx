import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useStaffDirectory } from '@/hooks/useStaffDirectory';
import { useToast } from '@/hooks/use-toast';
import { MENU_PERMISSION_KEYS, type MenuPermissionKey } from '@/lib/accessPermissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type AccessGroup = {
  id: string;
  clinic_id: string;
  name: string;
  code: string;
  description: string | null;
  is_system: boolean;
  status: 'active' | 'inactive';
};

type StaffUser = {
  user_id: string;
  role: string;
};

const LABELS: Record<MenuPermissionKey, string> = {
  'dashboard.view': 'Dashboard',
  'crm.view': 'CRM',
  'whatsapp_ai.view': 'WhatsApp IA',
  'patients.view': 'Pacientes',
  'treatments.view': 'Tratamentos',
  'proposals.view': 'Propostas',
  'contracts.view': 'Contratos',
  'payments.view': 'Pagamentos',
  'finance_contracts.view': 'Financeiro Contratos',
  'goals.view': 'Metas',
  'appointments.view': 'Agenda',
  'sessions.view': 'Sessões',
  'evolution.view': 'Evolução',
  'photos.view': 'Fotos',
  'feedback.view': 'Feedbacks',
  'nps.view': 'NPS',
  'satisfaction.view': 'Satisfação',
  'reports.view': 'Relatórios',
  'settings.view': 'Configurações',
};

export default function AccessGroupsTab() {
  const { clinicId, role } = useUserRole();
  const { toast } = useToast();
  const [groups, setGroups] = useState<AccessGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<Set<MenuPermissionKey>>(new Set());
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [assignments, setAssignments] = useState<Array<{ user_id: string; group_id: string }>>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupCode, setNewGroupCode] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [targetGroupId, setTargetGroupId] = useState('');
  const [groupFilter, setGroupFilter] = useState<'all' | string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [groupsPage, setGroupsPage] = useState(1);
  const [assignPage, setAssignPage] = useState(1);
  const pageSize = 10;
  const [groupsSort, setGroupsSort] = useState<'name_asc' | 'name_desc'>('name_asc');
  const [assignSort, setAssignSort] = useState<'user_asc' | 'user_desc'>('user_asc');
  const { byUserId } = useStaffDirectory(clinicId);

  const canManage = role === 'admin';

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) || null,
    [groups, selectedGroupId],
  );

  const filteredGroups = useMemo(() => {
    const base = statusFilter === 'all' ? groups : groups.filter((group) => group.status === statusFilter);
    const sorted = [...base].sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, 'pt-BR');
      return groupsSort === 'name_asc' ? cmp : -cmp;
    });
    return sorted;
  }, [groups, statusFilter, groupsSort]);

  const filteredAssignments = useMemo(() => {
    const base = groupFilter === 'all' ? assignments : assignments.filter((item) => item.group_id === groupFilter);
    const sorted = [...base].sort((a, b) => {
      const aLabel = (byUserId[a.user_id]?.label || a.user_id).toLowerCase();
      const bLabel = (byUserId[b.user_id]?.label || b.user_id).toLowerCase();
      const cmp = aLabel.localeCompare(bLabel, 'pt-BR');
      return assignSort === 'user_asc' ? cmp : -cmp;
    });
    return sorted;
  }, [assignments, groupFilter, byUserId, assignSort]);

  const pagedGroups = useMemo(() => {
    const start = (groupsPage - 1) * pageSize;
    return filteredGroups.slice(start, start + pageSize);
  }, [filteredGroups, groupsPage]);

  const pagedAssignments = useMemo(() => {
    const start = (assignPage - 1) * pageSize;
    return filteredAssignments.slice(start, start + pageSize);
  }, [filteredAssignments, assignPage]);

  const groupsTotalPages = Math.max(1, Math.ceil(filteredGroups.length / pageSize));
  const assignTotalPages = Math.max(1, Math.ceil(filteredAssignments.length / pageSize));

  const loadAll = async () => {
    if (!clinicId) return;
    const [groupsRes, staffRes, assignRes] = await Promise.all([
      supabase.from('access_groups' as unknown).select('*').eq('clinic_id', clinicId).order('name'),
      supabase.from('user_roles').select('user_id, role').eq('clinic_id', clinicId).eq('is_active', true),
      supabase.from('user_access_groups' as unknown).select('user_id, group_id, is_active').eq('clinic_id', clinicId).eq('is_active', true),
    ]);

    if (groupsRes.error || staffRes.error || assignRes.error) {
      toast({ title: 'Erro', description: groupsRes.error?.message || staffRes.error?.message || assignRes.error?.message, variant: 'destructive' });
      return;
    }

    const nextGroups = (groupsRes.data || []) as AccessGroup[];
    setGroups(nextGroups);
    setStaffUsers((staffRes.data || []) as StaffUser[]);
    setAssignments((assignRes.data || []) as Array<{ user_id: string; group_id: string }>);

    if (!selectedGroupId && nextGroups.length > 0) {
      setSelectedGroupId(nextGroups[0].id);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId]);

  useEffect(() => {
    const loadPermissions = async () => {
      if (!clinicId || !selectedGroupId) return;
      const { data, error } = await supabase
        .from('access_group_permissions' as unknown)
        .select('permission_key, can_view')
        .eq('clinic_id', clinicId)
        .eq('group_id', selectedGroupId)
        .eq('can_view', true);
      if (error) {
        toast({ title: 'Erro', description: error.message, variant: 'destructive' });
        return;
      }
      setSelectedPermissions(new Set((data || []).map((row: { permission_key: MenuPermissionKey }) => row.permission_key)));
    };
    loadPermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId, selectedGroupId]);

  useEffect(() => {
    setGroupsPage(1);
  }, [statusFilter, groupsSort]);

  useEffect(() => {
    setAssignPage(1);
  }, [groupFilter, assignSort]);

  const togglePermission = (key: MenuPermissionKey) => {
    const next = new Set(selectedPermissions);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedPermissions(next);
  };

  const savePermissions = async () => {
    if (!clinicId || !selectedGroupId || !canManage) return;
    const { error: delError } = await supabase
      .from('access_group_permissions' as unknown)
      .delete()
      .eq('clinic_id', clinicId)
      .eq('group_id', selectedGroupId);
    if (delError) {
      toast({ title: 'Erro', description: delError.message, variant: 'destructive' });
      return;
    }

    if (selectedPermissions.size > 0) {
      const payload = Array.from(selectedPermissions).map((permissionKey) => ({
        clinic_id: clinicId,
        group_id: selectedGroupId,
        permission_key: permissionKey,
        can_view: true,
      }));
      const { error: insError } = await supabase.from('access_group_permissions' as unknown).insert(payload as unknown);
      if (insError) {
        toast({ title: 'Erro', description: insError.message, variant: 'destructive' });
        return;
      }
    }
    toast({ title: 'Permissões salvas' });
  };

  const createGroup = async () => {
    if (!clinicId || !newGroupName.trim() || !newGroupCode.trim() || !canManage) return;
    const { error } = await supabase.from('access_groups' as unknown).insert({
      clinic_id: clinicId,
      name: newGroupName.trim(),
      code: newGroupCode.trim().toLowerCase().replace(/\s+/g, '_'),
      status: 'active',
      is_system: false,
    } as unknown);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    setNewGroupName('');
    setNewGroupCode('');
    toast({ title: 'Grupo criado' });
    loadAll();
  };

  const assignUserToGroup = async () => {
    if (!clinicId || !targetUserId || !targetGroupId || !canManage) return;
    const { error } = await supabase.from('user_access_groups' as unknown).upsert({
      clinic_id: clinicId,
      user_id: targetUserId,
      group_id: targetGroupId,
      is_active: true,
    } as unknown, { onConflict: 'clinic_id,user_id,group_id' });
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Vínculo salvo' });
    loadAll();
  };

  return (
    <div className="space-y-4">
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Grupos de Acesso</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Input placeholder="Nome do grupo" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} />
          <Input placeholder="Código do grupo (ex: financeiro)" value={newGroupCode} onChange={(e) => setNewGroupCode(e.target.value)} />
          <Button onClick={createGroup} disabled={!canManage}>Criar grupo</Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Permissões por grupo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o grupo" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedGroup ? (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {MENU_PERMISSION_KEYS.map((key) => (
                  <label key={key} className="flex items-center gap-2 rounded border p-2 text-sm">
                    <Checkbox checked={selectedPermissions.has(key)} onCheckedChange={() => togglePermission(key)} />
                    <span>{LABELS[key]}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Selecione um grupo para editar permissões.</p>
            )}

            <Button onClick={savePermissions} disabled={!selectedGroupId || !canManage}>Salvar permissões</Button>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Vincular usuário ao grupo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Usuário</Label>
                <Select value={targetUserId} onValueChange={setTargetUserId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar usuário" /></SelectTrigger>
                  <SelectContent>
                    {staffUsers.map((staff) => (
                      <SelectItem key={staff.user_id} value={staff.user_id}>
                        {(byUserId[staff.user_id]?.label || `${staff.user_id.slice(0, 8)}...`)} ({staff.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Grupo</Label>
                <Select value={targetGroupId} onValueChange={setTargetGroupId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar grupo" /></SelectTrigger>
                  <SelectContent>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={assignUserToGroup} disabled={!targetUserId || !targetGroupId || !canManage}>
              Salvar vínculo
            </Button>

            <div className="space-y-2">
              <p className="text-sm font-medium">Vínculos atuais</p>
              <div className="grid gap-2 md:grid-cols-2">
                <Select value={groupFilter} onValueChange={(value) => setGroupFilter(value)}>
                  <SelectTrigger><SelectValue placeholder="Filtrar por grupo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os grupos</SelectItem>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={(value: 'all' | 'active' | 'inactive') => setStatusFilter(value)}>
                  <SelectTrigger><SelectValue placeholder="Status do grupo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos status</SelectItem>
                    <SelectItem value="active">Ativos</SelectItem>
                    <SelectItem value="inactive">Inativos</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={assignSort} onValueChange={(value: 'user_asc' | 'user_desc') => setAssignSort(value)}>
                  <SelectTrigger><SelectValue placeholder="Ordenação dos vínculos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user_asc">Usuário (A-Z)</SelectItem>
                    <SelectItem value="user_desc">Usuário (Z-A)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {filteredAssignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem vínculos.</p>
              ) : (
                <div className="space-y-1">
                  {pagedAssignments.map((item) => {
                    const group = groups.find((g) => g.id === item.group_id);
                    return (
                      <div className="flex items-center justify-between gap-2" key={`${item.user_id}-${item.group_id}`}>
                        <p className="text-sm text-muted-foreground">
                          {byUserId[item.user_id]?.label || `${item.user_id.slice(0, 8)}...`} → {group?.name || 'Grupo'}
                        </p>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!canManage}
                          onClick={async () => {
                            const { error } = await supabase
                              .from('user_access_groups' as unknown)
                              .update({ is_active: false } as unknown)
                              .eq('clinic_id', clinicId as string)
                              .eq('user_id', item.user_id)
                              .eq('group_id', item.group_id);
                            if (error) {
                              toast({ title: 'Erro', description: error.message, variant: 'destructive' });
                              return;
                            }
                            toast({ title: 'Vínculo removido' });
                            loadAll();
                          }}
                        >
                          Remover
                        </Button>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button size="sm" variant="outline" disabled={assignPage <= 1} onClick={() => setAssignPage((p) => Math.max(1, p - 1))}>Anterior</Button>
                    <span className="text-xs text-muted-foreground">Página {assignPage} de {assignTotalPages}</span>
                    <Button size="sm" variant="outline" disabled={assignPage >= assignTotalPages} onClick={() => setAssignPage((p) => Math.min(assignTotalPages, p + 1))}>Próxima</Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Grupos cadastrados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-end">
            <Select value={groupsSort} onValueChange={(value: 'name_asc' | 'name_desc') => setGroupsSort(value)}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Ordenação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="name_asc">Nome (A-Z)</SelectItem>
                <SelectItem value="name_desc">Nome (Z-A)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {filteredGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum grupo encontrado para o filtro selecionado.</p>
          ) : (
            pagedGroups.map((group) => (
              <div key={group.id} className="flex items-center justify-between rounded border p-2 text-sm">
                <span>{group.name} <span className="text-muted-foreground">({group.code})</span></span>
                <span className="text-muted-foreground">{group.status === 'active' ? 'Ativo' : 'Inativo'}</span>
              </div>
            ))
          )}
          {filteredGroups.length > 0 && (
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button size="sm" variant="outline" disabled={groupsPage <= 1} onClick={() => setGroupsPage((p) => Math.max(1, p - 1))}>Anterior</Button>
              <span className="text-xs text-muted-foreground">Página {groupsPage} de {groupsTotalPages}</span>
              <Button size="sm" variant="outline" disabled={groupsPage >= groupsTotalPages} onClick={() => setGroupsPage((p) => Math.min(groupsTotalPages, p + 1))}>Próxima</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
