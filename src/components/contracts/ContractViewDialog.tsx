import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BrandButton } from '@/components/ui/brand-button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ContractStatusBadge } from './ContractStatusBadge';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Copy, ExternalLink, FileUp, Printer, TriangleAlert } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  contract: unknown;
  clinicName: string;
  onClose: () => void;
}

type AuditLogRow = {
  id: string;
  action: string;
  created_at: string;
  user_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

type PaymentCondition = 'cash' | 'installments';
type PaymentMethod = 'cash' | 'pix' | 'card' | 'boleto';
type CardBrand = 'visa' | 'mastercard' | 'elo' | 'amex' | 'hipercard' | 'cabal' | 'diners' | 'outro';
type ReviewPaymentConfig = Partial<Record<PaymentMethod, { amount: string; installments?: string; installmentAmount?: string; brand?: CardBrand; last4?: string }>>;

const paymentConditionLabels: Record<PaymentCondition, string> = {
  cash: 'À vista',
  installments: 'Parcelado',
};

const paymentMethodOptions: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'cash', label: 'Dinheiro' },
  { value: 'pix', label: 'Pix' },
  { value: 'card', label: 'Cartão' },
  { value: 'boleto', label: 'Boleto' },
];

const cardBrandOptions: Array<{ value: CardBrand; label: string }> = [
  { value: 'visa', label: 'Visa' },
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'elo', label: 'Elo' },
  { value: 'amex', label: 'Amex' },
  { value: 'hipercard', label: 'Hipercard' },
  { value: 'cabal', label: 'Cabal' },
  { value: 'diners', label: 'Diners' },
  { value: 'outro', label: 'Outro' },
];

const parseContractNotes = (rawNotes?: string | null) => {
  const notes = rawNotes || '';
  const conditionMatch = notes.match(/Condição:\s*([^.\n]+)/i);
  const methodsMatch = notes.match(/Formas:\s*([^.\n]+)/i);

  const parsedCondition: PaymentCondition =
    conditionMatch?.[1]?.toLowerCase().includes('parcel') ? 'installments' : 'cash';

  const methodsPart = methodsMatch?.[1] || '';
  const selectedMethods: PaymentMethod[] = [];
  const details: Partial<Record<PaymentMethod, string>> = {};
  const config: ReviewPaymentConfig = {};

  methodsPart
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const [labelPart, ...detailParts] = entry.split(':');
      const label = labelPart.trim().toLowerCase();
      const detail = detailParts.join(':').trim();

      const method = paymentMethodOptions.find((option) => option.label.toLowerCase() === label)?.value;
      if (!method) return;
      selectedMethods.push(method);
      if (detail) details[method] = detail;

      const amountMatch = entry.match(/R\$\s*([\d.,]+)/i);
      const installmentsMatch = entry.match(/(\d+)\s*x\s*de/i);
      if (amountMatch) {
        const normalized = amountMatch[1].replace(/\./g, '').replace(',', '.');
        config[method] = {
          ...(config[method] || {}),
          amount: Number(normalized).toString(),
          installments: installmentsMatch?.[1] || config[method]?.installments || '',
          installmentAmount: config[method]?.installmentAmount || '',
        };
      }
    });

  return {
    condition: parsedCondition,
    methods: selectedMethods.slice(0, 2),
    details,
    config,
  };
};

export function ContractViewDialog({ contract, clinicName, onClose }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const c = contract;
  const parsed = parseContractNotes(c.notes);
  const [isEditing, setIsEditing] = useState(false);
  const [reviewPaymentCondition, setReviewPaymentCondition] = useState<PaymentCondition>(parsed.condition);
  const [reviewMethods, setReviewMethods] = useState<PaymentMethod[]>(parsed.methods);
  const [reviewDetails, setReviewDetails] = useState<Partial<Record<PaymentMethod, string>>>(parsed.details);
  const [reviewConfig, setReviewConfig] = useState<ReviewPaymentConfig>(parsed.config);
  const [reviewNotes, setReviewNotes] = useState(c.notes || '');
  const [savingReview, setSavingReview] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [userNamesById, setUserNamesById] = useState<Record<string, string>>({});

  const refreshContracts = () => {
    qc.invalidateQueries({ queryKey: ['contracts'] });
    onClose();
  };

  useEffect(() => {
    let mounted = true;
    const loadAudit = async () => {
      setLoadingAudit(true);
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, action, created_at, user_id, old_data, new_data')
        .eq('clinic_id', c.clinic_id)
        .eq('table_name', 'contracts')
        .eq('record_id', c.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        if (mounted) {
          setLoadingAudit(false);
        }
        return;
      }

      const rows = ((data || []) as unknown as AuditLogRow[]).map((row) => ({
        ...row,
        old_data: row.old_data || null,
        new_data: row.new_data || null,
      }));

      const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean))) as string[];
      if (userIds.length > 0) {
        const { data: professionalsData } = await supabase
          .from('professionals')
          .select('user_id, full_name')
          .eq('clinic_id', c.clinic_id)
          .in('user_id', userIds);

        if (mounted) {
          const map = ((professionalsData || []) as Array<{ user_id: string; full_name: string }>).reduce<Record<string, string>>(
            (acc, item) => {
              acc[item.user_id] = item.full_name;
              return acc;
            },
            {}
          );
          setUserNamesById(map);
        }
      }

      if (mounted) {
        setAuditLogs(rows);
        setLoadingAudit(false);
      }
    };

    loadAudit();

    return () => {
      mounted = false;
    };
  }, [c.clinic_id, c.id]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${c.clinic_id}/${c.patient_id}/signed/${c.contract_number}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('contracts').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('contracts').getPublicUrl(path);
      const { error } = await supabase
        .from('contracts')
        .update({
          signed_pdf_url: urlData.publicUrl,
          signed_at: new Date().toISOString(),
          process_status: 'pending_confirmation',
        })
        .eq('id', c.id);

      if (error) throw error;

      toast({ title: 'Documento assinado arquivado!' });
      refreshContracts();
    } catch (err: unknown) {
      toast({ title: 'Erro no upload', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const activateContract = async () => {
    const { error } = await supabase
      .from('contracts')
      .update({
        upload_confirmed: true,
        confirmed_at: new Date().toISOString(),
        process_status: 'confirmed',
        status: 'active',
      })
      .eq('id', c.id);

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Contrato ativado!' });
    refreshContracts();
  };

  const cancelContract = async () => {
    const { error } = await supabase
      .from('contracts')
      .update({
        status: 'cancelled',
        process_status: 'cancelled',
      })
      .eq('id', c.id);

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Contrato cancelado' });
    refreshContracts();
  };

  const handlePrint = () => {
    if (!c.template_html) return;
    const windowRef = window.open('', '_blank');
    if (!windowRef) return;
    windowRef.document.write(c.template_html);
    windowRef.document.close();
    windowRef.print();
  };

  const toggleReviewMethod = (method: PaymentMethod, checked: boolean) => {
    if (checked) {
      if (reviewMethods.includes(method)) return;
      if (reviewMethods.length >= 2) {
        toast({
          title: 'Limite de formas',
          description: 'Máximo de 2 formas de pagamento.',
          variant: 'destructive',
        });
        return;
      }
      setReviewMethods((current) => [...current, method]);
      return;
    }

    setReviewMethods((current) => current.filter((item) => item !== method));
    setReviewDetails((current) => {
      const next = { ...current };
      delete next[method];
      return next;
    });
    setReviewConfig((current) => {
      const next = { ...current };
      delete next[method];
      return next;
    });
  };

  const saveReview = async () => {
    if (reviewMethods.length === 0) {
      toast({ title: 'Selecione ao menos uma forma de pagamento', variant: 'destructive' });
      return;
    }
    const hasInvalidAmount = reviewMethods.some((method) => Number(reviewConfig[method]?.amount || 0) <= 0);
    if (hasInvalidAmount) {
      toast({ title: 'Informe valor válido para cada forma selecionada', variant: 'destructive' });
      return;
    }
    const hasInvalidInstallments = reviewMethods
      .filter((method) => method === 'card' || method === 'boleto')
      .some((method) => Number(reviewConfig[method]?.installments || 0) <= 0);
    if (hasInvalidInstallments) {
      toast({ title: 'Cartão e boleto exigem número de parcelas', variant: 'destructive' });
      return;
    }
    if (reviewMethods.includes('card')) {
      const brand = reviewConfig.card?.brand;
      const last4 = (reviewConfig.card?.last4 || '').replace(/\D/g, '');
      if (!brand) {
        toast({ title: 'Selecione a bandeira do cartão', variant: 'destructive' });
        return;
      }
      if (last4.length !== 4) {
        toast({ title: 'Informe os 4 últimos dígitos do cartão', variant: 'destructive' });
        return;
      }
    }

    const paymentTermsDescription = reviewMethods
      .map((method) => {
        const label = paymentMethodOptions.find((item) => item.value === method)?.label || method;
        const amount = Number(reviewConfig[method]?.amount || 0);
        const installments = Number(reviewConfig[method]?.installments || 0);
        const configuredInstallmentAmount = Number(reviewConfig[method]?.installmentAmount || 0);
        const installmentAmount = configuredInstallmentAmount > 0
          ? configuredInstallmentAmount
          : installments > 0
            ? amount / installments
            : 0;
        const details = reviewDetails[method]?.trim();
        if (method === 'card' || method === 'boleto') {
          const brandLabel = method === 'card'
            ? cardBrandOptions.find((option) => option.value === reviewConfig.card?.brand)?.label
            : '';
          const last4 = method === 'card' ? (reviewConfig.card?.last4 || '').replace(/\D/g, '') : '';
          const trace = method === 'card' ? ` · ${brandLabel || 'Bandeira'} · finais ${last4}` : '';
          const base = `${label}: valor R$ ${amount.toFixed(2)} | ${installments}x de R$ ${installmentAmount.toFixed(2)}${trace}`;
          return details ? `${base} (${details})` : base;
        }
        const base = `${label}: R$ ${amount.toFixed(2)}`;
        return details ? `${base} (${details})` : base;
      })
      .join(' | ');

    const paymentTermsText = `Condição: ${paymentConditionLabels[reviewPaymentCondition]}. Formas: ${paymentTermsDescription}.`;
    const mergedNotes = reviewNotes?.trim()
      ? `${paymentTermsText}\n${reviewNotes.trim()}`
      : paymentTermsText;

    setSavingReview(true);
    const { error } = await supabase
      .from('contracts')
      .update({
        notes: mergedNotes,
        process_status: c.process_status === 'confirmed' ? 'overdue' : c.process_status,
      })
      .eq('id', c.id);

    setSavingReview(false);
    if (error) {
      toast({ title: 'Erro ao salvar revisão', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Revisão salva', description: 'Parâmetros do contrato atualizados.' });
    refreshContracts();
  };

  const copyToClipboard = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: successMessage });
    } catch {
      toast({ title: 'Não foi possível copiar agora', variant: 'destructive' });
    }
  };

  const reviewAuditLogs = useMemo(
    () =>
      auditLogs.filter((log) => {
        const newNotes = typeof log.new_data?.notes === 'string' ? log.new_data.notes : '';
        const oldNotes = typeof log.old_data?.notes === 'string' ? log.old_data.notes : '';
        return (
          newNotes.includes('Condição:') ||
          oldNotes.includes('Condição:') ||
          log.action.toLowerCase().includes('update')
        );
      }),
    [auditLogs]
  );

  const hasSignedFile = Boolean(c.signed_pdf_url);
  const isGenerated = c.process_status === 'pending_upload';
  const isReadyToActivate = c.process_status === 'pending_confirmation';
  const isCancelled = c.process_status === 'cancelled';
  const isActive = c.process_status === 'confirmed';
  const timelineEvents = [
    c.created_at
      ? {
          key: 'created',
          label: 'Contrato gerado',
          date: new Date(c.created_at),
          tone: 'bg-slate-100 text-slate-700',
        }
      : null,
    c.signed_at
      ? {
          key: 'signed',
          label: 'Arquivo assinado recebido',
          date: new Date(c.signed_at),
          tone: 'bg-amber-100 text-amber-700',
        }
      : null,
    c.confirmed_at
      ? {
          key: 'confirmed',
          label: 'Contrato ativado',
          date: new Date(c.confirmed_at),
          tone: 'bg-emerald-100 text-emerald-700',
        }
      : null,
    c.process_status === 'cancelled'
      ? {
          key: 'cancelled',
          label: 'Contrato cancelado',
          date: c.updated_at ? new Date(c.updated_at) : c.created_at ? new Date(c.created_at) : new Date(),
          tone: 'bg-rose-100 text-rose-700',
        }
      : null,
  ]
    .filter(Boolean)
    .sort((a: unknown, b: unknown) => a.date.getTime() - b.date.getTime());

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span>Contrato {c.contract_number}</span>
            <ContractStatusBadge status={c.process_status} />
          </DialogTitle>
        </DialogHeader>

        {c.process_status === 'overdue' && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 text-warning text-sm">
            <TriangleAlert className="w-4 h-4" />
            Este contrato precisa de revisão antes de seguir.
          </div>
        )}

        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Paciente:</span>
              <br />
              <span className="font-medium">{(c.patients as unknown)?.full_name}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Proposta:</span>
              <br />
              <span className="font-medium">{(c.proposals as unknown)?.proposal_number || '—'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Valor:</span>
              <br />
              <span className="font-bold">R$ {Number((c.proposals as unknown)?.final_amount || 0).toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Criado em:</span>
              <br />
              <span className="font-medium">{format(new Date(c.created_at), 'dd/MM/yyyy', { locale: ptBR })}</span>
            </div>
            {c.signed_at && (
              <div>
                <span className="text-muted-foreground">Arquivo recebido em:</span>
                <br />
                <span className="font-medium">{format(new Date(c.signed_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span>
              </div>
            )}
            {c.confirmed_at && (
              <div>
                <span className="text-muted-foreground">Ativado em:</span>
                <br />
                <span className="font-medium">{format(new Date(c.confirmed_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-secondary/40 p-3 text-sm">
            <p className="font-medium text-foreground mb-1">Próximo passo</p>
            <p className="text-muted-foreground">
              {isGenerated && 'Gerar ou coletar o documento assinado e arquivá-lo no contrato.'}
              {isReadyToActivate && 'Revisar o arquivo assinado e ativar o contrato para seguir a operação.'}
              {isActive && 'Contrato ativo e pronto para ser usado no fluxo operacional da clínica.'}
              {isCancelled && 'Contrato encerrado, sem continuidade operacional.'}
              {c.process_status === 'overdue' && 'Revisar o documento e decidir se ele deve ser reenviado ou ativado.'}
            </p>
          </div>

          <div className="rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium text-foreground">Timeline do contrato</p>
            {timelineEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem eventos registrados.</p>
            ) : (
              <div className="space-y-2">
                {timelineEvents.map((event: unknown) => (
                  <div key={event.key} className="flex items-center justify-between gap-2 rounded-md bg-secondary/30 px-2.5 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${event.tone}`}>{event.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {format(event.date, 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!isCancelled && (
            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Revisão de parâmetros</p>
                <BrandButton size="sm" variant="outline" onClick={() => setIsEditing((current) => !current)}>
                  {isEditing ? 'Fechar revisão' : 'Editar após envio'}
                </BrandButton>
              </div>

              {isEditing && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Condição de pagamento</p>
                    <Select
                      value={reviewPaymentCondition}
                      onValueChange={(value) => setReviewPaymentCondition(value as PaymentCondition)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">À vista</SelectItem>
                        <SelectItem value="installments">Parcelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">Formas de pagamento (até 2)</p>
                      <span className="text-xs text-muted-foreground">{reviewMethods.length}/2</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {paymentMethodOptions.map((option) => (
                        <label key={option.value} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                          <Checkbox
                            checked={reviewMethods.includes(option.value)}
                            onCheckedChange={(next) => toggleReviewMethod(option.value, Boolean(next))}
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {reviewMethods.length > 0 && (
                    <div className="space-y-2">
                      {reviewMethods.map((method) => {
                        const label = paymentMethodOptions.find((item) => item.value === method)?.label || method;
                        const isInstallmentMethod = method === 'card' || method === 'boleto';
                        return (
                          <div key={method} className="space-y-1">
                            <p className="text-xs text-muted-foreground">{label}</p>
                            <div className={`grid gap-2 ${isInstallmentMethod ? 'grid-cols-3' : 'grid-cols-1'}`}>
                              <div className="space-y-1">
                                <p className="text-[11px] text-muted-foreground">Valor</p>
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={reviewConfig[method]?.amount || ''}
                                  onChange={(event) =>
                                    setReviewConfig((current) => ({
                                      ...current,
                                      [method]: {
                                        amount: event.target.value,
                                        installments: current[method]?.installments || '',
                                        installmentAmount: current[method]?.installmentAmount || '',
                                        brand: current[method]?.brand,
                                        last4: current[method]?.last4,
                                      },
                                    }))
                                  }
                                  placeholder="Valor"
                                />
                              </div>
                              {isInstallmentMethod ? (
                                <>
                                  <div className="space-y-1">
                                    <p className="text-[11px] text-muted-foreground">Número de parcelas</p>
                                    <Input
                                      type="number"
                                      min={1}
                                      value={reviewConfig[method]?.installments || ''}
                                      onChange={(event) =>
                                        setReviewConfig((current) => ({
                                          ...current,
                                          [method]: {
                                            amount: current[method]?.amount || '',
                                            installments: event.target.value,
                                            installmentAmount: current[method]?.installmentAmount || '',
                                            brand: current[method]?.brand,
                                            last4: current[method]?.last4,
                                          },
                                        }))
                                      }
                                      placeholder="Parcelas"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-[11px] text-muted-foreground">Valor da parcela</p>
                                    <Input
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      value={reviewConfig[method]?.installmentAmount || ''}
                                      onChange={(event) =>
                                        setReviewConfig((current) => ({
                                          ...current,
                                          [method]: {
                                            amount: current[method]?.amount || '',
                                            installments: current[method]?.installments || '',
                                            installmentAmount: event.target.value,
                                            brand: current[method]?.brand,
                                            last4: current[method]?.last4,
                                          },
                                        }))
                                      }
                                      placeholder="Valor da parcela"
                                    />
                                  </div>
                                </>
                              ) : null}
                            </div>
                            {method === 'card' && (
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <p className="text-[11px] text-muted-foreground">Bandeira</p>
                                  <Select
                                    value={reviewConfig.card?.brand || ''}
                                    onValueChange={(value) =>
                                      setReviewConfig((current) => ({
                                        ...current,
                                        card: {
                                          amount: current.card?.amount || '',
                                          installments: current.card?.installments || '',
                                          installmentAmount: current.card?.installmentAmount || '',
                                          brand: value as CardBrand,
                                          last4: current.card?.last4 || '',
                                        },
                                      }))
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Bandeira" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {cardBrandOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <p className="text-[11px] text-muted-foreground">4 últimos dígitos</p>
                                  <Input
                                    inputMode="numeric"
                                    maxLength={4}
                                    value={reviewConfig.card?.last4 || ''}
                                    onChange={(event) =>
                                      setReviewConfig((current) => ({
                                        ...current,
                                        card: {
                                          amount: current.card?.amount || '',
                                          installments: current.card?.installments || '',
                                          installmentAmount: current.card?.installmentAmount || '',
                                          brand: current.card?.brand,
                                          last4: event.target.value.replace(/\D/g, '').slice(0, 4),
                                        },
                                      }))
                                    }
                                    placeholder="1234"
                                  />
                                </div>
                              </div>
                            )}
                            <Textarea
                              rows={2}
                              value={reviewDetails[method] || ''}
                              onChange={(event) =>
                                setReviewDetails((current) => ({ ...current, [method]: event.target.value }))
                              }
                              placeholder="Detalhes desta forma de pagamento"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Observações da revisão</p>
                    <Textarea
                      rows={3}
                      value={reviewNotes}
                      onChange={(event) => setReviewNotes(event.target.value)}
                      placeholder="Descreva ajustes e observações do contrato."
                    />
                  </div>

                  <div className="flex justify-end">
                    <BrandButton size="sm" onClick={saveReview} disabled={savingReview}>
                      {savingReview ? 'Salvando...' : 'Salvar revisão'}
                    </BrandButton>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-sm font-medium text-foreground">Histórico de revisões</p>
            {loadingAudit ? (
              <p className="text-xs text-muted-foreground">Carregando histórico...</p>
            ) : reviewAuditLogs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem revisões registradas ainda.</p>
            ) : (
              <div className="space-y-2">
                {reviewAuditLogs.map((log) => {
                  const actorName = log.user_id ? userNamesById[log.user_id] || `Usuário ${log.user_id.slice(0, 8)}` : 'Sistema';
                  const notesValue = typeof log.new_data?.notes === 'string' ? log.new_data.notes : null;
                  return (
                    <div key={log.id} className="rounded-md bg-secondary/30 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-foreground">{actorName}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{log.action}</p>
                      {notesValue && (
                        <p className="text-xs mt-1 whitespace-pre-wrap text-foreground/80">{notesValue}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-4 border-t">
            {c.template_html && (
              <BrandButton variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="w-4 h-4" />
                Imprimir minuta
              </BrandButton>
            )}

            {hasSignedFile && (
              <BrandButton variant="outline" size="sm" onClick={() => window.open(c.signed_pdf_url, '_blank')}>
                <ExternalLink className="w-4 h-4" />
                Ver arquivo
              </BrandButton>
            )}

            {hasSignedFile && (
              <BrandButton
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(c.signed_pdf_url, 'Link do contrato copiado!')}
              >
                <Copy className="w-4 h-4" />
                Copiar link
              </BrandButton>
            )}

            <BrandButton
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(c.contract_number || '', 'Número do contrato copiado!')}
              disabled={!c.contract_number}
            >
              <Copy className="w-4 h-4" />
              Copiar número
            </BrandButton>

            {!isCancelled && !isActive && (
              <label className="cursor-pointer">
                <BrandButton size="sm" type="button" disabled={uploading}>
                  <FileUp className="w-4 h-4" />
                  {uploading ? 'Arquivando...' : hasSignedFile ? 'Substituir arquivo' : 'Arquivar assinado'}
                </BrandButton>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files?.[0]) handleUpload(event.target.files[0]);
                  }}
                />
              </label>
            )}

            {isReadyToActivate && (
              <BrandButton size="sm" onClick={activateContract}>
                <CheckCircle2 className="w-4 h-4" />
                Ativar contrato
              </BrandButton>
            )}

            {!isCancelled && !isActive && (
              cancelConfirm ? (
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-destructive flex items-center gap-1">
                    <TriangleAlert className="w-3 h-3" />
                    Confirmar cancelamento?
                  </span>
                  <BrandButton size="sm" variant="outline" className="text-destructive border-destructive" onClick={cancelContract}>
                    Sim
                  </BrandButton>
                  <BrandButton size="sm" variant="outline" onClick={() => setCancelConfirm(false)}>
                    Não
                  </BrandButton>
                </div>
              ) : (
                <BrandButton size="sm" variant="outline" className="text-destructive border-destructive" onClick={() => setCancelConfirm(true)}>
                  Cancelar
                </BrandButton>
              )
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
