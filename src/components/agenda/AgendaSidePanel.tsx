import { Calendar } from '@/components/ui/calendar';
import { BrandButton } from '@/components/ui/brand-button';
import { CalendarClock, ListPlus } from 'lucide-react';

export type AgendaPreviewItem = {
  id: string;
  time?: string;
  title: string;
  subtitle: string;
  meta?: string;
};

type AgendaSidePanelProps = {
  date: Date;
  onDateChange: (date: Date) => void;
  upcoming: AgendaPreviewItem[];
  waitlist: AgendaPreviewItem[];
  onViewWaitlist: () => void;
  onViewDay: () => void;
};

function PreviewList({ items, empty }: { items: AgendaPreviewItem[]; empty: string }) {
  if (items.length === 0) return <p className="py-4 text-center text-xs text-muted-foreground">{empty}</p>;
  return (
    <div className="divide-y">
      {items.map((item) => (
        <div key={item.id} className="py-3 first:pt-1 last:pb-1">
          <div className="flex items-start gap-3">
            {item.time && <span className="w-11 shrink-0 text-xs font-semibold text-primary">{item.time}</span>}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
              <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
              {item.meta && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.meta}</p>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AgendaSidePanel({ date, onDateChange, upcoming, waitlist, onViewWaitlist, onViewDay }: AgendaSidePanelProps) {
  return (
    <aside className="hidden space-y-4 2xl:block" aria-label="Informações complementares da agenda">
      <section className="rounded-xl border bg-card p-3 shadow-sm">
        <Calendar mode="single" selected={date} onSelect={(next) => next && onDateChange(next)} className="mx-auto p-0" />
      </section>
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Próximos hoje</h3>
        </div>
        <PreviewList items={upcoming} empty="Nenhum atendimento hoje." />
        <BrandButton variant="ghost" size="sm" className="mt-2 w-full" onClick={onViewDay}>Ver todos</BrandButton>
      </section>
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <ListPlus className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Lista de espera</h3>
        </div>
        <PreviewList items={waitlist} empty="Lista de espera vazia." />
        <BrandButton variant="ghost" size="sm" className="mt-2 w-full" onClick={onViewWaitlist}>Ver todos</BrandButton>
      </section>
    </aside>
  );
}
