import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

interface ReportHeader {
  clinicName: string;
  title: string;
  period: string;
}

function addHeader(doc: jsPDF, header: ReportHeader) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(header.clinicName, 14, 20);

  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  doc.text(header.title, 14, 30);

  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(header.period, 14, 37);
  doc.text(`Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, pageWidth - 14, 37, { align: 'right' });
  doc.setTextColor(0);

  doc.setDrawColor(200);
  doc.line(14, 40, pageWidth - 14, 40);
}

export interface FinancialRow {
  patient: string;
  contractNumber: string;
  totalAmount: number;
  numInstallments: number;
  paidCount: number;
  paidAmount: number;
  pendingAmount: number;
  method: string;
}

export function generateFinancialPDF(
  clinicName: string,
  period: string,
  rows: FinancialRow[],
  summary: { totalRevenue: number; totalPaid: number; totalPending: number; totalOverdue: number }
) {
  const doc = new jsPDF({ orientation: 'landscape' });

  addHeader(doc, { clinicName, title: 'Relatório Financeiro', period });

  // Summary cards
  const summaryY = 46;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  const labels = ['Receita Total', 'Recebido', 'Pendente', 'Atrasado'];
  const values = [summary.totalRevenue, summary.totalPaid, summary.totalPending, summary.totalOverdue];
  const colors: [number, number, number][] = [[40, 40, 40], [34, 139, 34], [200, 150, 0], [200, 50, 50]];
  const cardW = 60;

  labels.forEach((label, i) => {
    const x = 14 + i * (cardW + 8);
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(x, summaryY, cardW, 22, 3, 3, 'F');
    doc.setTextColor(100);
    doc.setFontSize(8);
    doc.text(label, x + 5, summaryY + 8);
    doc.setTextColor(...colors[i]);
    doc.setFontSize(13);
    doc.text(formatCurrency(values[i]), x + 5, summaryY + 18);
  });

  doc.setTextColor(0);

  // Table
  autoTable(doc, {
    startY: summaryY + 30,
    head: [['Paciente', 'Contrato', 'Valor Total', 'Parcelas', 'Pagas', 'Recebido', 'Pendente', 'Método']],
    body: rows.map(r => [
      r.patient, r.contractNumber, formatCurrency(r.totalAmount),
      String(r.numInstallments), String(r.paidCount),
      formatCurrency(r.paidAmount), formatCurrency(r.pendingAmount), r.method,
    ]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [26, 122, 109], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    foot: [[
      { content: 'TOTAL', colSpan: 2, styles: { fontStyle: 'bold' } },
      { content: formatCurrency(summary.totalRevenue), styles: { fontStyle: 'bold' } },
      '', '',
      { content: formatCurrency(summary.totalPaid), styles: { fontStyle: 'bold' } },
      { content: formatCurrency(summary.totalPending), styles: { fontStyle: 'bold' } },
      '',
    ]],
    footStyles: { fillColor: [240, 240, 240], textColor: [40, 40, 40] },
  });

  doc.save(`relatorio-financeiro-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

export interface SessionRow {
  patient: string;
  treatment: string;
  sessionNumber: string;
  performedAt: string;
  professional: string;
  observations: string;
}

export function generateSessionsPDF(
  clinicName: string,
  period: string,
  rows: SessionRow[],
  summary: { totalSessions: number; uniquePatients: number; uniqueTreatments: number }
) {
  const doc = new jsPDF();

  addHeader(doc, { clinicName, title: 'Relatório de Sessões', period });

  const summaryY = 46;
  doc.setFontSize(10);
  const sLabels = ['Total de Sessões', 'Pacientes Atendidos', 'Tratamentos'];
  const sValues = [String(summary.totalSessions), String(summary.uniquePatients), String(summary.uniqueTreatments)];
  const sCardW = 55;

  sLabels.forEach((label, i) => {
    const x = 14 + i * (sCardW + 8);
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(x, summaryY, sCardW, 22, 3, 3, 'F');
    doc.setTextColor(100);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(label, x + 5, summaryY + 8);
    doc.setTextColor(26, 122, 109);
    doc.setFontSize(16);
    doc.text(sValues[i], x + 5, summaryY + 18);
  });

  doc.setTextColor(0);

  autoTable(doc, {
    startY: summaryY + 30,
    head: [['Paciente', 'Tratamento', 'Sessão', 'Data', 'Profissional', 'Observações']],
    body: rows.map(r => [r.patient, r.treatment, r.sessionNumber, r.performedAt, r.professional, r.observations]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [26, 122, 109], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: { 5: { cellWidth: 50 } },
  });

  doc.save(`relatorio-sessoes-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

/* ========== COST & MARGIN REPORT ========== */

export interface CostReportRow {
  treatment: string;
  category: string;
  price: number;
  defaultPrice: number;
  minPrice: number;
  totalCost: number;
  marginOnPrice: number;
  marginOnMin: number;
  marginPercent: number;
  costItems: { name: string; type: string; quantity: number; unitCost: number; subtotal: number }[];
}

export function generateCostPDF(
  clinicName: string,
  rows: CostReportRow[],
  summary: { totalTreatments: number; avgMarginPercent: number; totalRevenuePotential: number; totalCost: number }
) {
  const doc = new jsPDF({ orientation: 'landscape' });

  addHeader(doc, { clinicName, title: 'Relatório de Custos e Margem de Lucro', period: 'Análise atual do catálogo de tratamentos' });

  // Summary cards
  const summaryY = 46;
  const labels = ['Tratamentos', 'Margem Média', 'Receita Potencial', 'Custo Total'];
  const values = [
    String(summary.totalTreatments),
    `${summary.avgMarginPercent.toFixed(1)}%`,
    formatCurrency(summary.totalRevenuePotential),
    formatCurrency(summary.totalCost),
  ];
  const colors: [number, number, number][] = [[40, 40, 40], [34, 139, 34], [26, 122, 109], [200, 50, 50]];
  const cardW = 60;

  labels.forEach((label, i) => {
    const x = 14 + i * (cardW + 8);
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(x, summaryY, cardW, 22, 3, 3, 'F');
    doc.setTextColor(100);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(label, x + 5, summaryY + 8);
    doc.setTextColor(...colors[i]);
    doc.setFontSize(13);
    doc.text(values[i], x + 5, summaryY + 18);
  });

  doc.setTextColor(0);

  // Main table
  autoTable(doc, {
    startY: summaryY + 30,
    head: [['Tratamento', 'Categoria', 'Preço', 'Preço Padrão', 'Preço Mín.', 'Custo Total', 'Margem (R$)', 'Margem (%)']],
    body: rows.map(r => [
      r.treatment,
      r.category || '—',
      formatCurrency(r.price),
      r.defaultPrice ? formatCurrency(r.defaultPrice) : '—',
      r.minPrice ? formatCurrency(r.minPrice) : '—',
      formatCurrency(r.totalCost),
      formatCurrency(r.marginOnPrice),
      `${r.marginPercent.toFixed(1)}%`,
    ]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [26, 122, 109], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    didParseCell: (data) => {
      // Color margin red if negative
      if (data.section === 'body' && (data.column.index === 6 || data.column.index === 7)) {
        const row = rows[data.row.index];
        if (row && row.marginOnPrice < 0) {
          data.cell.styles.textColor = [200, 50, 50];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    foot: [[
      { content: 'TOTAL', colSpan: 2, styles: { fontStyle: 'bold' } },
      { content: formatCurrency(summary.totalRevenuePotential), styles: { fontStyle: 'bold' } },
      '', '',
      { content: formatCurrency(summary.totalCost), styles: { fontStyle: 'bold' } },
      { content: formatCurrency(summary.totalRevenuePotential - summary.totalCost), styles: { fontStyle: 'bold' } },
      { content: `${summary.avgMarginPercent.toFixed(1)}%`, styles: { fontStyle: 'bold' } },
    ]],
    footStyles: { fillColor: [240, 240, 240], textColor: [40, 40, 40] },
  });

  // Detail: cost composition per treatment
  let currentY = (doc as unknown).lastAutoTable?.finalY + 15 || 120;

  for (const row of rows) {
    if (row.costItems.length === 0) continue;

    if (currentY > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Composição: ${row.treatment}`, 14, currentY);
    currentY += 3;

    autoTable(doc, {
      startY: currentY,
      head: [['Item', 'Tipo', 'Qtd', 'Custo Unit.', 'Subtotal']],
      body: row.costItems.map(ci => [
        ci.name,
        ci.type === 'labor' ? 'Mão de Obra' : ci.type === 'medication' ? 'Medicamento' : 'Insumo',
        String(ci.quantity),
        formatCurrency(ci.unitCost),
        formatCurrency(ci.subtotal),
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [100, 100, 100], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      margin: { left: 20 },
    });

    currentY = (doc as unknown).lastAutoTable?.finalY + 10 || currentY + 30;
  }

  doc.save(`relatorio-custos-margem-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}
