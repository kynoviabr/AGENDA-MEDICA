import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { BrandStat } from '@/components/ui/brand-stat';
import { Card, CardContent } from '@/components/ui/card';
import { BrandBadge } from '@/components/ui/brand-badge';
import { Star, MessageSquare, BarChart3, TrendingUp, AlertTriangle, ThumbsDown, Clock, HeartHandshake } from 'lucide-react';
import { subDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

function isNegativeFeedback(f: unknown): boolean {
  return f.rating <= 3 || (f.service_attention != null && f.service_attention <= 2) || (f.waiting_time != null && f.waiting_time <= 2);
}

export default function FeedbackPage() {
  const { clinicId } = useBranding();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: feedbacks = [], isLoading } = useQuery({
    queryKey: ['feedbacks', clinicId],
    queryFn: async () => {
      const { data } = await supabase
        .from('session_feedback')
        .select('*, patients(full_name), session_records(treatment_id, professional_id, treatments(name))')
        .eq('clinic_id', clinicId!)
        .order('created_at', { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: !!clinicId,
  });

  const last30 = feedbacks.filter((f: unknown) => new Date(f.created_at) >= subDays(new Date(), 30));
  const avgRating = last30.length > 0 ? last30.reduce((s: number, f: unknown) => s + f.rating, 0) / last30.length : 0;
  const avgService = last30.filter((f: unknown) => f.service_attention != null);
  const avgServiceScore = avgService.length > 0 ? avgService.reduce((s: number, f: unknown) => s + f.service_attention, 0) / avgService.length : 0;
  const avgWaiting = last30.filter((f: unknown) => f.waiting_time != null);
  const avgWaitingScore = avgWaiting.length > 0 ? avgWaiting.reduce((s: number, f: unknown) => s + f.waiting_time, 0) / avgWaiting.length : 0;
  const negativeCount = last30.filter(isNegativeFeedback).length;

  return (
    <div>
      <PageHeader title="Feedbacks" description="Avaliações dos pacientes por sessão">
        <BrandButton variant="outline" onClick={() => navigate('/clinic/satisfaction')}>
          <BarChart3 className="w-4 h-4" /> Análise completa
        </BrandButton>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <div className="flex items-center gap-1 mb-1">
              {[1, 2, 3, 4, 5].map(s => (
                <Star key={s} className={cn("w-4 h-4", s <= Math.round(avgRating) ? "text-accent fill-accent" : "text-muted")} />
              ))}
            </div>
            <p className="text-2xl font-bold text-foreground">{avgRating > 0 ? avgRating.toFixed(1) : '—'}</p>
            <p className="text-xs text-muted-foreground">Média Geral (30d)</p>
          </CardContent>
        </Card>
        <BrandStat icon={TrendingUp} label="Total (30d)" value={last30.length} />
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <HeartHandshake className="w-5 h-5 text-primary mb-1" />
            <p className="text-2xl font-bold text-foreground">{avgServiceScore > 0 ? avgServiceScore.toFixed(1) : '—'}</p>
            <p className="text-xs text-muted-foreground">Atenção (30d)</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <Clock className="w-5 h-5 text-primary mb-1" />
            <p className="text-2xl font-bold text-foreground">{avgWaitingScore > 0 ? avgWaitingScore.toFixed(1) : '—'}</p>
            <p className="text-xs text-muted-foreground">Tempo de Espera (30d)</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <ThumbsDown className="w-5 h-5 text-destructive mb-1" />
            <p className="text-2xl font-bold text-foreground">{negativeCount}</p>
            <p className="text-xs text-muted-foreground">Negativos (30d)</p>
          </CardContent>
        </Card>
      </div>

      {isLoading && <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>}

      {!isLoading && feedbacks.length === 0 && (
        <div className="text-center py-16 animate-fade-in">
          <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold">Nenhum feedback recebido</h3>
          <p className="text-sm text-muted-foreground">Avaliações de sessão aparecerão aqui</p>
        </div>
      )}

      {!isLoading && feedbacks.length > 0 && (
        <div className="space-y-3">
          {feedbacks.map((f: unknown) => {
            const negative = isNegativeFeedback(f);
            return (
              <Card key={f.id} className={cn("shadow-card animate-fade-in", negative && "border-destructive/30")}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        {negative && <AlertTriangle className="w-4 h-4 text-destructive" />}
                        <p className="font-semibold text-foreground">{(f.patients as unknown)?.full_name}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(f.session_records as unknown)?.treatments?.name || '—'}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        {[1, 2, 3, 4, 5].map(s => (
                          <Star key={s} className={cn("w-4 h-4", s <= f.rating ? "text-accent fill-accent" : "text-muted")} />
                        ))}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-muted-foreground">{format(new Date(f.created_at), 'dd/MM/yyyy', { locale: ptBR })}</span>
                      <div className="flex gap-2 mt-1">
                        {f.service_attention != null && (
                          <span className="text-xs text-muted-foreground">Atenção: <strong>{f.service_attention}/5</strong></span>
                        )}
                        {f.waiting_time != null && (
                          <span className="text-xs text-muted-foreground">Espera: <strong>{f.waiting_time}/5</strong></span>
                        )}
                      </div>
                    </div>
                  </div>
                  {f.comment && <p className="text-sm text-muted-foreground mt-2 border-t pt-2">{f.comment}</p>}
                  {f.response && (
                    <div className="mt-2 p-2 rounded-lg bg-secondary/50">
                      <p className="text-xs font-medium text-muted-foreground">Resposta da clínica:</p>
                      <p className="text-sm">{f.response}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
