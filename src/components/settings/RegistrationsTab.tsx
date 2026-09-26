import { useState } from 'react';
import { Briefcase, Building2, ShieldCheck, Tags } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import HealthInsurancesPage from '@/pages/clinic/HealthInsurancesPage';
import RolesTab from './RolesTab';
import ClassEntitiesTab from './ClassEntitiesTab';
import CategoriesTab from './CategoriesTab';

const registrations = [
  { value: 'insurances', label: 'Convênios', icon: ShieldCheck },
  { value: 'roles', label: 'Cargos', icon: Briefcase },
  { value: 'entities', label: 'Conselhos', icon: Building2 },
  { value: 'categories', label: 'Categorias', icon: Tags },
] as const;

export default function RegistrationsTab() {
  const [section, setSection] = useState<(typeof registrations)[number]['value']>('insurances');
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Cadastros</h2>
        <p className="text-sm text-muted-foreground">Defina o que existe na clínica. Os vínculos operacionais são configurados por profissional.</p>
      </div>
      <Tabs value={section} onValueChange={(value) => setSection(value as typeof section)} className="space-y-4">
        <TabsList aria-label="Cadastros auxiliares" className="grid h-auto w-full grid-cols-2 gap-1 p-1 md:grid-cols-4">
          {registrations.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value}><Icon className="mr-1 h-4 w-4" />{label}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="insurances"><HealthInsurancesPage embedded manageProfessionalLinks={false} /></TabsContent>
        <TabsContent value="roles"><RolesTab /></TabsContent>
        <TabsContent value="entities"><ClassEntitiesTab /></TabsContent>
        <TabsContent value="categories"><CategoriesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
