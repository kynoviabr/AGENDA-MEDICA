import { useState, useEffect } from 'react';
import { useUserRole } from '@/hooks/useUserRole';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Stethoscope, Building2, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Tente novamente em alguns instantes.';

export default function OnboardingPage() {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [clinicName, setClinicName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(user?.email || '');

  // If user already has a role, redirect to appropriate area
  useEffect(() => {
    if (!roleLoading && role) {
      navigate(role === 'patient' ? '/portal' : '/clinic', { replace: true });
    }
  }, [role, roleLoading, navigate]);

  const handleCreateClinic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicName.trim()) return;
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-clinic', {
        body: { clinicName, phone, email },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: 'Clínica criada com sucesso!', description: 'Bem-vindo ao Kynovia.' });
      // Small delay to let role propagate
      setTimeout(() => navigate('/clinic', { replace: true }), 500);
    } catch (err: unknown) {
      toast({ title: 'Erro', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen gradient-surface flex items-center justify-center p-4">
      <div className="w-full max-w-lg animate-fade-in">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 shadow-glow">
            <Stethoscope className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Bem-vindo!</h1>
          <p className="text-muted-foreground mt-1">Vamos configurar sua clínica em poucos passos</p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2].map(s => (
            <div key={s} className={`h-2 rounded-full transition-all ${s <= step ? 'w-12 bg-primary' : 'w-8 bg-muted'}`} />
          ))}
        </div>

        <div className="bg-card rounded-2xl shadow-card p-6 sm:p-8">
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center">
                <Building2 className="w-12 h-12 text-primary mx-auto mb-3" />
                <h2 className="text-xl font-bold text-foreground">Dados da Clínica</h2>
                <p className="text-sm text-muted-foreground mt-1">Informe os dados básicos para começar</p>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); setStep(2); }} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="clinic-name">Nome da Clínica *</Label>
                  <Input
                    id="clinic-name"
                    placeholder="Ex: Clínica Bella Forma"
                    value={clinicName}
                    onChange={e => setClinicName(e.target.value)}
                    required
                    minLength={2}
                    maxLength={100}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clinic-phone">Telefone</Label>
                  <Input
                    id="clinic-phone"
                    placeholder="(11) 99999-9999"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clinic-email">E-mail da Clínica</Label>
                  <Input
                    id="clinic-email"
                    type="email"
                    placeholder="contato@clinica.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={!clinicName.trim()}>
                  Próximo <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </form>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-3 shadow-glow">
                  <Stethoscope className="w-8 h-8 text-primary-foreground" />
                </div>
                <h2 className="text-xl font-bold text-foreground">Tudo pronto!</h2>
                <p className="text-sm text-muted-foreground mt-1">Confirme os dados e crie sua clínica</p>
              </div>

              <div className="bg-secondary/50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Clínica</span>
                  <span className="text-sm font-medium text-foreground">{clinicName}</span>
                </div>
                {phone && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Telefone</span>
                    <span className="text-sm font-medium text-foreground">{phone}</span>
                  </div>
                )}
                {email && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">E-mail</span>
                    <span className="text-sm font-medium text-foreground">{email}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Seu papel</span>
                  <span className="text-sm font-medium text-primary">Administrador</span>
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Voltar</Button>
                <Button onClick={handleCreateClinic} disabled={loading} className="flex-1 gradient-primary text-primary-foreground">
                  {loading ? 'Criando...' : 'Criar Clínica'}
                </Button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © 2026 Kynovia. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
}
