import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Smartphone, ShieldCheck, ShieldOff, Send, UserPlus, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type PatientOption = {
  id: string;
  full_name: string;
  email: string | null;
  clinic_id: string;
};

type PatientAppAccessRow = {
  id: string;
  clinic_id: string;
  patient_id: string;
  auth_user_id: string;
  status: 'active' | 'blocked' | 'invited' | 'inactive';
  created_at: string;
  updated_at: string;
  patients?: {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  last_login_at?: string | null;
};

export default function PatientAppAccessTab() {
  const { clinicId, role } = useUserRole();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PatientAppAccessRow[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [query, setQuery] = useState('');

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const name = row.patients?.full_name?.toLowerCase() || '';
      const email = row.patients?.email?.toLowerCase() || '';
      return name.includes(q) || email.includes(q);
    });
  }, [rows, query]);

  const loadData = async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const [accessRes, portalRes, patientsRes] = await Promise.all([
        supabase
          .from('patient_users' as unknown)
          .select('id, clinic_id, patient_id, auth_user_id, status, created_at, updated_at, patients(full_name,email,phone)')
          .eq('clinic_id', clinicId)
          .order('created_at', { ascending: false }),
        supabase
          .from('patient_portal_access')
          .select('patient_id, auth_user_id, last_login_at')
          .eq('clinic_id', clinicId),
        supabase
          .from('patients')
          .select('id, full_name, email, clinic_id')
          .eq('clinic_id', clinicId)
          .order('full_name'),
      ]);

      if (accessRes.error) throw accessRes.error;
      if (portalRes.error) throw portalRes.error;
      if (patientsRes.error) throw patientsRes.error;

      const loginMap = new Map<string, string | null>();
      (portalRes.data || []).forEach((item) => {
        loginMap.set(`${item.patient_id}::${item.auth_user_id}`, item.last_login_at ?? null);
      });

      const accessRows = ((accessRes.data || []) as PatientAppAccessRow[]).map((item) => ({
        ...item,
        last_login_at: loginMap.get(`${item.patient_id}::${item.auth_user_id}`) ?? null,
      }));

      setRows(accessRows);
      setPatients((patientsRes.data || []) as PatientOption[]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao carregar acessos do APP';
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId]);

  const handleGrantAccess = async () => {
    if (!clinicId || !selectedPatientId) return;
    try {
      const { data, error } = await supabase.functions.invoke('invite-patient', {
        body: { patientId: selectedPatientId, clinicId, forceResend: true },
      });
      if (error) throw error;
      if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error);
      toast({ title: 'Acesso liberado', description: (data as { message?: string } | null)?.message || 'Convite processado com sucesso.' });
      setOpen(false);
      setSelectedPatientId('');
      loadData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao liberar acesso do paciente';
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    }
  };

  const handleSetStatus = async (row: PatientAppAccessRow, nextStatus: 'active' | 'blocked') => {
    try {
      const { error } = await supabase
        .from('patient_users' as unknown)
        .update({ status: nextStatus } as unknown)
        .eq('id', row.id);
      if (error) throw error;

      await supabase
        .from('patient_portal_access')
        .update({ access_status: nextStatus === 'active' ? 'active' : 'inactive' })
        .eq('clinic_id', row.clinic_id)
        .eq('patient_id', row.patient_id)
        .eq('auth_user_id', row.auth_user_id);

      toast({ title: nextStatus === 'active' ? 'Acesso liberado' : 'Acesso bloqueado' });
      loadData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao atualizar status do acesso';
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    }
  };

  const handleResend = async (row: PatientAppAccessRow) => {
    try {
      const { data, error } = await supabase.functions.invoke('invite-patient', {
        body: { patientId: row.patient_id, clinicId: row.clinic_id, forceResend: true },
      });
      if (error) throw error;
      if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error);
      toast({ title: 'Convite reenviado', description: (data as { message?: string } | null)?.message || 'Novo convite disparado com sucesso.' });
      loadData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao reenviar convite';
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    }
  };

  const canManage = role === 'admin';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por paciente ou e-mail"
          className="max-w-sm"
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={!canManage}>
                <UserPlus className="w-4 h-4 mr-2" />
                Liberar acesso APP
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Liberar Acesso ao APP do Paciente</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Paciente</Label>
                  <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o paciente" />
                    </SelectTrigger>
                    <SelectContent>
                      {patients
                        .filter((patient) => !!patient.email)
                        .map((patient) => (
                          <SelectItem key={patient.id} value={patient.id}>
                            {patient.full_name} ({patient.email})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Apenas pacientes com e-mail válido podem receber acesso.
                  </p>
                </div>
                <Button onClick={handleGrantAccess} className="w-full" disabled={!selectedPatientId || !canManage}>
                  <Send className="w-4 h-4 mr-2" />
                  Liberar acesso / reenviar convite
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" />
            Pacientes com acesso ao APP
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando acessos...</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum acesso encontrado.</p>
          ) : (
            <div className="divide-y divide-border">
              {filteredRows.map((row) => (
                <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{row.patients?.full_name || 'Paciente'}</p>
                    <p className="text-xs text-muted-foreground truncate">{row.patients?.email || 'Sem e-mail'}</p>
                    <p className="text-xs text-muted-foreground">
                      Vinculado em {format(new Date(row.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                      {row.last_login_at ? ` • Último acesso: ${format(new Date(row.last_login_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={row.status === 'active' ? 'default' : 'secondary'} className={row.status === 'active' ? 'bg-green-100 text-green-700' : ''}>
                      {row.status === 'active' ? 'Ativo' : row.status === 'blocked' ? 'Bloqueado' : row.status}
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => handleResend(row)} disabled={!canManage}>
                      <Send className="w-4 h-4 mr-2" />
                      Reenviar
                    </Button>
                    {row.status === 'active' ? (
                      <Button variant="outline" size="sm" onClick={() => handleSetStatus(row, 'blocked')} disabled={!canManage}>
                        <ShieldOff className="w-4 h-4 mr-2" />
                        Bloquear
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => handleSetStatus(row, 'active')} disabled={!canManage}>
                        <ShieldCheck className="w-4 h-4 mr-2" />
                        Liberar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
