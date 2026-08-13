import { Card, CardContent } from '@/components/ui/card';

const portalPlaceholder = (title: string) => (
  <div className="animate-fade-in">
    <h2 className="text-xl font-bold text-foreground mb-4">{title}</h2>
    <Card className="shadow-card">
      <CardContent className="p-8 text-center">
        <p className="text-muted-foreground text-sm">Em desenvolvimento</p>
      </CardContent>
    </Card>
  </div>
);

export const PortalContractPage = () => portalPlaceholder('Meu Contrato');
export const PortalPaymentsPage = () => portalPlaceholder('Pagamentos');
export const PortalSessionsPage = () => portalPlaceholder('Minhas Sessões');
export const PortalEvolutionPage = () => portalPlaceholder('Minha Evolução');
export const PortalPhotosPage = () => portalPlaceholder('Minhas Fotos');
export const PortalFeedbackPage = () => portalPlaceholder('Avaliar Sessão');
