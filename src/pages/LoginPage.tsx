import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Stethoscope, Eye, EyeOff, Mail, Sparkles, Shield, Activity } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Tente novamente em alguns instantes.';

/**
 * Stripe-style split-screen login.
 * Left: navy hero with marketing.   Right: form card.
 * On mobile, hero collapses and form takes full width.
 */
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const { signIn, signInWithSocial, signUp, signOut, user } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [socialLoading, setSocialLoading] = useState<'google' | 'facebook' | null>(null);
  const [accessBlockedMessage, setAccessBlockedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (user && !roleLoading) {
      if (role === 'patient') navigate('/portal', { replace: true });
      else if (role) navigate('/clinic', { replace: true });
      else {
        const provider = (user.app_metadata?.provider || '').toLowerCase();
        if (provider === 'facebook') {
          setAccessBlockedMessage(
            'Login com Facebook está liberado para pacientes com acesso ativo. Contate a clínica para ativar seu vínculo.',
          );
        } else {
          setAccessBlockedMessage(
            'Seu acesso ainda não foi liberado. Apenas usuários convidados por um administrador da clínica podem entrar.',
          );
        }
      }
    }
  }, [user, role, roleLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err: unknown) {
      toast({ title: 'Erro ao entrar', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signUp(signupEmail, signupPassword, { full_name: signupName });
      toast({
        title: 'Conta criada!',
        description: 'Verifique seu e-mail para confirmar o cadastro.',
      });
    } catch (err: unknown) {
      toast({ title: 'Erro ao cadastrar', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setForgotSent(true);
    } catch (err: unknown) {
      toast({ title: 'Erro', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setForgotLoading(false);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'facebook') => {
    setSocialLoading(provider);
    try {
      await signInWithSocial(provider);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha no login social.';
      toast({ title: 'Erro no login social', description: message, variant: 'destructive' });
      setSocialLoading(null);
    }
  };

  const handleBlockedSignOut = async () => {
    try {
      await signOut();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao sair';
      toast({ title: 'Erro ao sair', description: message, variant: 'destructive' });
    } finally {
      setAccessBlockedMessage(null);
    }
  };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1.05fr_1fr] bg-bg-page">
      {/* ============ HERO LEFT (Stripe navy) ============ */}
      <aside className="relative hidden lg:flex flex-col justify-between p-12 xl:p-16 overflow-hidden bg-navy text-white">
        {/* Decorative gradient blobs (hero/marketing only) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(circle, hsl(243 100% 68%) 0%, transparent 70%)' }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -left-20 h-[28rem] w-[28rem] rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, hsl(190 100% 50%) 0%, transparent 70%)' }}
        />

        <div className="relative flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-btn bg-primary flex items-center justify-center shadow-glow">
            <Stethoscope className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-heading font-semibold text-[17px] tracking-tight">Kynovia</span>
        </div>

        <div className="relative max-w-md">
          <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-primary-light/90 mb-4">
            Plataforma de gestão clínica
          </p>
          <h2 className="font-heading text-4xl xl:text-5xl font-bold leading-[1.05] tracking-tight">
            A jornada completa do seu paciente,{' '}
            <span className="text-primary-light">em uma única plataforma.</span>
          </h2>
          <p className="text-[15px] leading-relaxed text-white/70 mt-5 max-w-sm">
            Propostas, contratos, pagamentos, agenda e evolução — tudo conectado, com inteligência de retenção e portal próprio do paciente.
          </p>

          <ul className="mt-10 space-y-4 text-sm">
            {[
              { icon: Sparkles, text: 'Funil comercial completo: proposta → contrato → pagamento' },
              { icon: Activity, text: 'Acompanhamento de evolução com fotos antes/depois' },
              { icon: Shield, text: 'Multi-tenant seguro com white-label por clínica' },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-btn bg-white/8 ring-1 ring-white/10">
                  <Icon className="h-3.5 w-3.5 text-primary-light" />
                </span>
                <span className="text-white/85 leading-relaxed">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/40">
          © 2026 Kynovia. Todos os direitos reservados.
        </p>
      </aside>

      {/* ============ FORM RIGHT ============ */}
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[420px] animate-fade-in">
          {/* Mobile-only logo */}
          <div className="lg:hidden text-center mb-6">
            <div className="inline-flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-btn bg-primary flex items-center justify-center shadow-glow">
                <Stethoscope className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-heading font-semibold text-lg tracking-tight text-foreground">
                Kynovia
              </span>
            </div>
          </div>

          <div className="mb-8">
            <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
              Bem-vindo de volta
            </h1>
            <p className="text-[15px] text-[hsl(var(--text-secondary))] mt-2">
              Acesse sua clínica ou crie uma conta nova.
            </p>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-[13px] font-medium">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-[13px] font-medium">Senha</Label>
                    <button
                      type="button"
                      onClick={() => { setForgotEmail(email); setForgotSent(false); setForgotOpen(true); }}
                      className="text-xs font-medium text-primary hover:text-primary-dark hover:underline"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPw ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--text-muted))] hover:text-foreground transition-colors"
                      aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? 'Entrando...' : 'Entrar'}
                </Button>
                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-bg-page px-2 text-muted-foreground">ou</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleSocialLogin('google')}
                    disabled={!!socialLoading}
                  >
                    {socialLoading === 'google' ? 'Redirecionando...' : 'Entrar com Google'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleSocialLogin('facebook')}
                    disabled={!!socialLoading}
                  >
                    {socialLoading === 'facebook' ? 'Redirecionando...' : 'Entrar com Facebook (pacientes)'}
                  </Button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="signup-name" className="text-[13px] font-medium">Nome completo</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="Seu nome"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-email" className="text-[13px] font-medium">E-mail</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-password" className="text-[13px] font-medium">Senha</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? 'Criando...' : 'Criar conta'}
                </Button>
                <p className="text-xs text-[hsl(var(--text-muted))] text-center pt-1">
                  Ao criar uma conta, você concorda com os Termos de Uso e Política de Privacidade.
                </p>
              </form>
            </TabsContent>
          </Tabs>

          <p className="lg:hidden text-center text-xs text-[hsl(var(--text-muted))] mt-8">
            © 2026 Kynovia
          </p>
        </div>
      </main>

      <Dialog open={!!accessBlockedMessage} onOpenChange={(open) => { if (!open) setAccessBlockedMessage(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Acesso não liberado</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[hsl(var(--text-secondary))]">{accessBlockedMessage}</p>
          <div className="mt-2 flex justify-end">
            <Button type="button" onClick={handleBlockedSignOut}>
              Sair
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Forgot Password Dialog */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              Recuperar senha
            </DialogTitle>
          </DialogHeader>
          {forgotSent ? (
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-pill bg-primary-light flex items-center justify-center mx-auto mb-3">
                <Mail className="w-6 h-6 text-primary-dark" />
              </div>
              <h3 className="font-heading font-semibold text-foreground mb-1">E-mail enviado!</h3>
              <p className="text-sm text-[hsl(var(--text-secondary))]">
                Se existe uma conta com o e-mail <strong className="text-foreground">{forgotEmail}</strong>, você receberá um link para redefinir sua senha.
              </p>
              <Button variant="outline" className="mt-5" onClick={() => setForgotOpen(false)}>
                Fechar
              </Button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <p className="text-sm text-[hsl(var(--text-secondary))]">
                Informe seu e-mail e enviaremos um link para redefinir sua senha.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email" className="text-[13px] font-medium">E-mail</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="seu@email.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={forgotLoading}>
                {forgotLoading ? 'Enviando...' : 'Enviar link de recuperação'}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
