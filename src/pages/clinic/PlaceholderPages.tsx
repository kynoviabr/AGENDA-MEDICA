import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Activity, Camera, Settings } from 'lucide-react';

const placeholder = (title: string, description: string, Icon: unknown) => (
  <div>
    <PageHeader title={title} description={description} />
    <Card className="shadow-card">
      <CardContent className="py-16 text-center animate-fade-in">
        <Icon className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">Em desenvolvimento — esta seção será implementada em breve.</p>
      </CardContent>
    </Card>
  </div>
);

export const EvolutionPage = () => placeholder('Evolução', 'Medidas e gráficos de evolução', Activity);
export const PhotosPage = () => placeholder('Fotos', 'Upload e gestão de fotos antes/depois', Camera);
export const SettingsPage = () => placeholder('Configurações', 'Configurações e branding da clínica', Settings);
