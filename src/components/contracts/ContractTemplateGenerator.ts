import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface ContractTemplateData {
  // Contratante (paciente)
  patientName: string;
  patientCpf: string;
  patientBirthDate: string | null;
  // Pagador
  payerName: string | null;
  payerCpf: string | null;
  payerBirthDate: string | null;
  isSelfPayer: boolean;
  // Clínica
  clinicName: string;
  clinicCnpj: string;
  clinicCity: string;
  // Tratamento
  treatmentName: string;
  sessions: number;
  proposalNumber: string;
  anamnesisId: string | null;
  // Valor
  totalValue: number;
  paymentTerms: string;
  // Contrato
  contractNumber: string;
  date: string;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'não informado';
  try {
    return format(new Date(dateStr), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return dateStr;
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function generateContractHTML(data: ContractTemplateData): string {
  const formattedDate = format(new Date(data.date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const city = data.clinicCity || 'da sede da clínica';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Contrato ${data.contractNumber}</title>
<style>
  @page { margin: 30mm 25mm; size: A4; }
  body { font-family: 'Georgia', 'Times New Roman', serif; color: #1a1a1a; line-height: 1.8; font-size: 12px; padding: 40px 50px; }
  .header { text-align: center; margin-bottom: 30px; border-bottom: 3px double #1a7a6d; padding-bottom: 20px; }
  .header h1 { font-size: 18px; font-weight: 700; color: #1a7a6d; letter-spacing: 2px; text-transform: uppercase; margin: 0 0 6px 0; }
  .header .contract-num { font-size: 11px; color: #666; }
  .section { margin: 24px 0; }
  .section-title { font-size: 13px; font-weight: 700; color: #1a7a6d; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #1a7a6d; padding-bottom: 4px; margin-bottom: 12px; }
  .field { margin: 4px 0; }
  .field-label { font-weight: 700; color: #444; }
  .clause { margin: 10px 0; text-align: justify; }
  .clause-num { font-weight: 700; color: #1a7a6d; }
  .highlight-box { background: #f0faf8; border: 1px solid #1a7a6d; border-radius: 6px; padding: 16px 20px; margin: 16px 0; }
  .declaration-list { margin: 8px 0 8px 20px; }
  .declaration-list li { margin: 6px 0; text-align: justify; }
  .signatures { margin-top: 60px; page-break-inside: avoid; }
  .sig-row { display: flex; justify-content: space-between; gap: 40px; margin-bottom: 50px; }
  .sig-block { flex: 1; text-align: center; }
  .sig-line { border-top: 1px solid #333; margin-top: 50px; padding-top: 6px; font-size: 11px; }
  .sig-sub { font-size: 9px; color: #666; }
  .witnesses { margin-top: 30px; }
  .witnesses .sig-row { margin-bottom: 40px; }
  .footer { margin-top: 40px; text-align: center; font-size: 9px; color: #999; border-top: 1px solid #ddd; padding-top: 10px; }
  .no-edit { font-size: 9px; color: #999; text-align: center; margin-top: 6px; font-style: italic; }
</style>
</head>
<body>

<div class="header">
  <h1>Contrato de Prestação de Serviços Estéticos</h1>
  <div class="contract-num">Contrato Nº ${data.contractNumber}</div>
</div>

<!-- CONTRATANTE -->
<div class="section">
  <div class="section-title">Contratante</div>
  <div class="field"><span class="field-label">Nome:</span> ${data.patientName}</div>
  <div class="field"><span class="field-label">CPF:</span> ${data.patientCpf || 'não informado'}</div>
  <div class="field"><span class="field-label">Data de Nascimento:</span> ${formatDate(data.patientBirthDate)}</div>
</div>

<!-- PAGADOR -->
${!data.isSelfPayer && data.payerName ? `
<div class="section">
  <div class="section-title">Responsável Financeiro (Pagador)</div>
  <div class="field"><span class="field-label">Nome:</span> ${data.payerName}</div>
  <div class="field"><span class="field-label">CPF:</span> ${data.payerCpf || 'não informado'}</div>
  <div class="field"><span class="field-label">Data de Nascimento:</span> ${formatDate(data.payerBirthDate)}</div>
</div>
` : ''}

<!-- CONTRATADA -->
<div class="section">
  <div class="section-title">Contratada</div>
  <div class="field"><span class="field-label">${data.clinicName}</span></div>
  <div class="field"><span class="field-label">CNPJ:</span> ${data.clinicCnpj || 'não informado'}</div>
</div>

<!-- OBJETO -->
<div class="section">
  <div class="section-title">Cláusula 1ª — Objeto do Contrato</div>
  <div class="clause">O presente contrato tem como objeto a prestação de serviços estéticos descritos abaixo:</div>
  <div class="highlight-box">
    <div class="field"><span class="field-label">Tratamento:</span> ${data.treatmentName}</div>
    <div class="field"><span class="field-label">Número de Sessões:</span> ${data.sessions}</div>
    <div class="field"><span class="field-label">Orçamento Nº:</span> ${data.proposalNumber}</div>
    ${data.anamnesisId ? `<div class="field"><span class="field-label">Anamnese Nº:</span> ${data.anamnesisId}</div>` : ''}
  </div>
</div>

<!-- VALOR -->
<div class="section">
  <div class="section-title">Cláusula 2ª — Valor</div>
  <div class="clause">O valor total do tratamento objeto deste contrato é de:</div>
  <div class="highlight-box" style="text-align:center;font-size:16px;font-weight:700;color:#1a7a6d;">
    ${formatCurrency(data.totalValue)}
  </div>
</div>

<!-- PAGAMENTO -->
<div class="section">
  <div class="section-title">Cláusula 3ª — Forma de Pagamento</div>
  <div class="clause">${data.paymentTerms || 'Conforme condições acordadas entre as partes.'}</div>
</div>

<!-- DECLARAÇÕES -->
<div class="section">
  <div class="section-title">Cláusula 4ª — Declarações do Paciente</div>
  <div class="clause">O paciente declara que:</div>
  <ul class="declaration-list">
    <li>Recebeu todas as informações sobre o tratamento contratado, incluindo procedimentos, etapas, resultados esperados e limitações;</li>
    <li>Está ciente dos riscos inerentes e possíveis efeitos colaterais associados ao tratamento;</li>
    <li>Compreende que os resultados podem variar de acordo com as características individuais de cada organismo;</li>
    <li>Não possui contraindicações conhecidas que impeçam a realização do tratamento, conforme declarado na anamnese;</li>
    <li>Autoriza o registro fotográfico para fins de acompanhamento e documentação clínica.</li>
  </ul>
</div>

<!-- RESPONSABILIDADE -->
<div class="section">
  <div class="section-title">Cláusula 5ª — Termo de Responsabilidade</div>
  <div class="clause">O paciente declara, sob as penas da lei, que todas as informações fornecidas na anamnese são verdadeiras e completas, assumindo total responsabilidade por eventuais omissões ou informações incorretas que possam comprometer o tratamento.</div>
</div>

<!-- CANCELAMENTO -->
<div class="section">
  <div class="section-title">Cláusula 6ª — Cancelamento e Reagendamento</div>
  <div class="clause"><span class="clause-num">6.1.</span> O cancelamento do presente contrato deverá ser comunicado por escrito com antecedência mínima de 48 (quarenta e oito) horas.</div>
  <div class="clause"><span class="clause-num">6.2.</span> As sessões não realizadas dentro do período de vigência do contrato serão consideradas consumidas, salvo acordo prévio entre as partes.</div>
  <div class="clause"><span class="clause-num">6.3.</span> Em caso de desistência pelo paciente, aplicam-se as regras do Código de Defesa do Consumidor.</div>
</div>

<!-- LGPD -->
<div class="section">
  <div class="section-title">Cláusula 7ª — Proteção de Dados (LGPD)</div>
  <div class="clause">Os dados pessoais coletados serão tratados em conformidade com a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais — LGPD), sendo utilizados exclusivamente para a finalidade de prestação dos serviços contratados, gestão administrativa e cumprimento de obrigações legais. O paciente poderá exercer seus direitos de titular dos dados a qualquer momento.</div>
</div>

<!-- FORO -->
<div class="section">
  <div class="section-title">Cláusula 8ª — Foro</div>
  <div class="clause">Fica eleito o foro da comarca de <strong>${city}</strong> para dirimir quaisquer questões oriundas do presente contrato, com renúncia expressa de qualquer outro, por mais privilegiado que seja.</div>
</div>

<!-- DATA E LOCAL -->
<div class="section" style="text-align: center; margin-top: 30px;">
  <p>${city}, ${formattedDate}.</p>
</div>

<!-- ASSINATURAS -->
<div class="signatures">
  <div class="sig-row">
    <div class="sig-block">
      <div class="sig-line">
        ${data.patientName}<br/>
        <span class="sig-sub">CPF: ${data.patientCpf || '_______________'}</span><br/>
        <span class="sig-sub">Paciente / Contratante</span>
      </div>
    </div>
    <div class="sig-block">
      <div class="sig-line">
        ${!data.isSelfPayer && data.payerName ? `${data.payerName}<br/><span class="sig-sub">CPF: ${data.payerCpf || '_______________'}</span><br/>` : ''}
        <span class="sig-sub">${!data.isSelfPayer && data.payerName ? 'Responsável Financeiro' : ''}</span>
      </div>
    </div>
  </div>
  <div class="sig-row">
    <div class="sig-block">
      <div class="sig-line">
        ${data.clinicName}<br/>
        <span class="sig-sub">CNPJ: ${data.clinicCnpj || '_______________'}</span><br/>
        <span class="sig-sub">Contratada</span>
      </div>
    </div>
  </div>
  <div class="witnesses">
    <div class="section-title">Testemunhas</div>
    <div class="sig-row">
      <div class="sig-block">
        <div class="sig-line">
          Nome: _______________________________<br/>
          <span class="sig-sub">CPF: _______________</span>
        </div>
      </div>
      <div class="sig-block">
        <div class="sig-line">
          Nome: _______________________________<br/>
          <span class="sig-sub">CPF: _______________</span>
        </div>
      </div>
    </div>
  </div>
</div>

<div class="no-edit">Documento gerado automaticamente — não passível de edição manual.</div>
<div class="footer">${data.clinicName} — Contrato gerado em ${formattedDate}</div>

</body>
</html>`;
}
