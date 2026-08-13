import jsPDF from 'jspdf';

/**
 * Generates a PDF Blob from contract template data using jsPDF.
 * Produces a clean, professional legal document.
 */
export function generateContractPDF(data: {
  clinicName: string;
  clinicCnpj: string;
  clinicCity: string;
  patientName: string;
  patientCpf: string;
  patientBirthDate: string;
  payerName: string | null;
  payerCpf: string | null;
  payerBirthDate: string | null;
  isSelfPayer: boolean;
  treatmentName: string;
  sessions: number;
  proposalNumber: string;
  anamnesisId: string | null;
  totalValue: number;
  paymentTerms: string;
  contractNumber: string;
  formattedDate: string;
}): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const marginL = 25;
  const marginR = 25;
  const contentW = pageW - marginL - marginR;
  let y = 20;

  const PRIMARY = [26, 122, 109] as [number, number, number];
  const BLACK = [26, 26, 26] as [number, number, number];
  const GRAY = [100, 100, 100] as [number, number, number];

  function checkPage(needed: number) {
    if (y + needed > 270) { doc.addPage(); y = 20; }
  }

  function sectionTitle(title: string) {
    checkPage(14);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PRIMARY);
    doc.text(title.toUpperCase(), marginL, y);
    y += 1;
    doc.setDrawColor(...PRIMARY);
    doc.setLineWidth(0.3);
    doc.line(marginL, y, pageW - marginR, y);
    y += 6;
  }

  function field(label: string, value: string) {
    checkPage(8);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLACK);
    doc.text(`${label}: `, marginL, y);
    const labelW = doc.getTextWidth(`${label}: `);
    doc.setFont('helvetica', 'normal');
    doc.text(value || 'não informado', marginL + labelW, y);
    y += 6;
  }

  function paragraph(text: string, indent = 0) {
    checkPage(12);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...BLACK);
    const lines = doc.splitTextToSize(text, contentW - indent);
    doc.text(lines, marginL + indent, y);
    y += lines.length * 5 + 2;
  }

  function bulletItem(text: string) {
    checkPage(10);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...BLACK);
    doc.text('•', marginL + 4, y);
    const lines = doc.splitTextToSize(text, contentW - 12);
    doc.text(lines, marginL + 10, y);
    y += lines.length * 5 + 1;
  }

  function signatureLine(label: string, sublabel: string, x: number, w: number) {
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.3);
    doc.line(x, y, x + w, y);
    y += 4;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLACK);
    doc.text(label, x + w / 2, y, { align: 'center' });
    y += 4;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY);
    doc.text(sublabel, x + w / 2, y, { align: 'center' });
  }

  const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  // === HEADER ===
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PRIMARY);
  doc.text('CONTRATO DE PRESTACAO DE SERVICOS ESTETICOS', pageW / 2, y, { align: 'center' });
  y += 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY);
  doc.text(`Contrato No ${data.contractNumber}`, pageW / 2, y, { align: 'center' });
  y += 4;
  doc.setDrawColor(...PRIMARY);
  doc.setLineWidth(0.8);
  doc.line(marginL, y, pageW - marginR, y);
  y += 10;

  // === CONTRATANTE ===
  sectionTitle('Contratante');
  field('Nome', data.patientName);
  field('CPF', data.patientCpf);
  field('Data de Nascimento', data.patientBirthDate);
  y += 4;

  // === PAGADOR ===
  if (!data.isSelfPayer && data.payerName) {
    sectionTitle('Responsavel Financeiro (Pagador)');
    field('Nome', data.payerName);
    field('CPF', data.payerCpf || '');
    field('Data de Nascimento', data.payerBirthDate || '');
    y += 4;
  }

  // === CONTRATADA ===
  sectionTitle('Contratada');
  field(data.clinicName, '');
  field('CNPJ', data.clinicCnpj);
  y += 4;

  // === OBJETO ===
  sectionTitle('Clausula 1a - Objeto do Contrato');
  paragraph('O presente contrato tem como objeto a prestacao de servicos esteticos descritos abaixo:');
  y += 2;
  // Highlight box
  checkPage(30);
  doc.setFillColor(240, 250, 248);
  doc.setDrawColor(...PRIMARY);
  doc.setLineWidth(0.5);
  doc.roundedRect(marginL, y - 2, contentW, 28, 2, 2, 'FD');
  y += 4;
  field('Tratamento', data.treatmentName);
  field('Numero de Sessoes', String(data.sessions));
  field('Orcamento No', data.proposalNumber);
  if (data.anamnesisId) field('Anamnese No', data.anamnesisId);
  y += 4;

  // === VALOR ===
  sectionTitle('Clausula 2a - Valor');
  paragraph('O valor total do tratamento objeto deste contrato e de:');
  checkPage(14);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PRIMARY);
  doc.text(formatCurrency(data.totalValue), pageW / 2, y, { align: 'center' });
  y += 10;

  // === PAGAMENTO ===
  sectionTitle('Clausula 3a - Forma de Pagamento');
  paragraph(data.paymentTerms || 'Conforme condicoes acordadas entre as partes.');
  y += 2;

  // === DECLARAÇÕES ===
  sectionTitle('Clausula 4a - Declaracoes do Paciente');
  paragraph('O paciente declara que:');
  bulletItem('Recebeu todas as informacoes sobre o tratamento contratado, incluindo procedimentos, etapas, resultados esperados e limitacoes;');
  bulletItem('Esta ciente dos riscos inerentes e possiveis efeitos colaterais associados ao tratamento;');
  bulletItem('Compreende que os resultados podem variar de acordo com as caracteristicas individuais de cada organismo;');
  bulletItem('Nao possui contraindicacoes conhecidas que impediam a realizacao do tratamento, conforme declarado na anamnese;');
  bulletItem('Autoriza o registro fotografico para fins de acompanhamento e documentacao clinica.');
  y += 2;

  // === RESPONSABILIDADE ===
  sectionTitle('Clausula 5a - Termo de Responsabilidade');
  paragraph('O paciente declara, sob as penas da lei, que todas as informacoes fornecidas na anamnese sao verdadeiras e completas, assumindo total responsabilidade por eventuais omissoes ou informacoes incorretas que possam comprometer o tratamento.');
  y += 2;

  // === CANCELAMENTO ===
  sectionTitle('Clausula 6a - Cancelamento e Reagendamento');
  paragraph('6.1. O cancelamento do presente contrato devera ser comunicado por escrito com antecedencia minima de 48 (quarenta e oito) horas.');
  paragraph('6.2. As sessoes nao realizadas dentro do periodo de vigencia do contrato serao consideradas consumidas, salvo acordo previo entre as partes.');
  paragraph('6.3. Em caso de desistencia pelo paciente, aplicam-se as regras do Codigo de Defesa do Consumidor.');
  y += 2;

  // === LGPD ===
  sectionTitle('Clausula 7a - Protecao de Dados (LGPD)');
  paragraph('Os dados pessoais coletados serao tratados em conformidade com a Lei no 13.709/2018 (Lei Geral de Protecao de Dados Pessoais - LGPD), sendo utilizados exclusivamente para a finalidade de prestacao dos servicos contratados, gestao administrativa e cumprimento de obrigacoes legais.');
  y += 2;

  // === FORO ===
  sectionTitle('Clausula 8a - Foro');
  paragraph(`Fica eleito o foro da comarca de ${data.clinicCity || 'da sede da clinica'} para dirimir quaisquer questoes oriundas do presente contrato.`);
  y += 6;

  // === DATA ===
  checkPage(10);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...BLACK);
  doc.text(`${data.clinicCity || '____'}, ${data.formattedDate}.`, pageW / 2, y, { align: 'center' });
  y += 16;

  // === ASSINATURAS ===
  checkPage(60);
  const sigW = 70;
  const sigGap = 20;
  const sig1X = marginL;
  const sig2X = marginL + sigW + sigGap;

  const savedY = y;
  signatureLine(data.patientName, `CPF: ${data.patientCpf || '_______________'}`, sig1X, sigW);

  if (!data.isSelfPayer && data.payerName) {
    y = savedY;
    signatureLine(data.payerName, `CPF: ${data.payerCpf || '_______________'}`, sig2X, sigW);
  }

  y += 16;
  const savedY2 = y;
  signatureLine(data.clinicName, `CNPJ: ${data.clinicCnpj || '_______________'}`, marginL, sigW);

  y = savedY2 + 28;

  // === TESTEMUNHAS ===
  checkPage(30);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PRIMARY);
  doc.text('TESTEMUNHAS', marginL, y);
  y += 10;

  const wSavedY = y;
  signatureLine('Nome: _______________________', 'CPF: _______________', sig1X, sigW);
  y = wSavedY;
  signatureLine('Nome: _______________________', 'CPF: _______________', sig2X, sigW);

  y += 14;

  // Footer
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...GRAY);
  doc.text('Documento gerado automaticamente - nao passivel de edicao manual.', pageW / 2, 285, { align: 'center' });

  return doc.output('blob');
}
