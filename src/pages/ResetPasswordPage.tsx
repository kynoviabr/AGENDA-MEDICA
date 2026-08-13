import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Stethoscope, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Erro ao redefinir senha';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [validSession, setValidSession] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user arrived via a recovery link (Supabase sets session automatically)
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setValidSession(true);
      } else {
        // Listen for the SIGNED_IN event from the recovery flow
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
          if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
            setValidSession(true);
          }
        });
        // Give a small window for the event
        setTimeout(() => {
          setValidSession(prev => prev === null ? false : prev);
        }, 3000);
        return () => subscription.unsubscribe();
      }
    };
    checkSession();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('A senha deve ter no mínimo 6 caracteres');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      toast.success('Senha definida com sucesso!');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen gradient-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 shadow-glow">
            <Stethoscope className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Kynovia</h1>
          <p className="text-muted-foreground mt-1">Defina sua senha de acesso</p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl shadow-card p-6 sm:p-8">
          {validSession === null && (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Verificando link...</p>
            </div>
          )}

          {validSession === false && (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-3" />
              <h2 className="text-lg font-semibold text-foreground mb-2">Link inválido ou expirado</h2>
              <p className="text-sm text-muted-foreground mb-4">
                O link de redefinição pode ter expirado. Solicite um novo link ao administrador da clínica.
              </p>
              <Button onClick={() => navigate('/login')} variant="outline">
                Ir para o login
              </Button>
            </div>
          )}

          {validSession && !success && (
            <form onSubmit={handleReset} className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground text-center mb-2">
                Crie sua senha
              </h2>
              <p className="text-sm text-muted-foreground text-center mb-4">
                Defina uma senha para acessar o portal do paciente.
              </p>

              <div className="space-y-2">
                <Label htmlFor="new-password">Nova senha</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPw ? 'text' : 'password'}
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar senha</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Repita a senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              <Button
                type="submit"
                className="w-full gradient-primary hover:opacity-90 text-primary-foreground"
                disabled={loading}
              >
                {loading ? 'Salvando...' : 'Definir senha'}
              </Button>
            </form>
          )}

          {success && (
            <div className="text-center py-8">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <h2 className="text-lg font-semibold text-foreground mb-2">Senha definida!</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Agora você pode acessar o portal do paciente com seu e-mail e a senha que acabou de criar.
              </p>
              <Button
                onClick={() => navigate('/login')}
                className="gradient-primary hover:opacity-90 text-primary-foreground"
              >
                Ir para o login
              </Button>
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
