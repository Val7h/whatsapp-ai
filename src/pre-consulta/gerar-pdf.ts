import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

interface DadosFormulario {
  nome: string;
  telefone: string;
  data_consulta: string;
  nascimento: string;
  cpf: string;
  cidade: string;
  bairro: string;
  profissao: string;
  estado_civil: string;
  filhos: number;
  doencas_cronicas: string[];
  medicacoes: string;
  alergias: string;
  cirurgias_anteriores: string;
  tabagismo: string;
  alcool: string;
  regiao_corpo: string;
  descricao: string;
  tempo_sintomas: string;
  mecanismo: string;
  eva: number;
  piora: string;
  melhora: string;
  tratamento_anterior: string;
  uso_analgesicos: string;
  exames_urls: string[];
  forma_pagamento: string;
  plano_saude: string | null;
  agendamento_id: string;
}

function calcularIdade(nascimento: string): number {
  const nasc = new Date(nascimento);
  const hoje = new Date();
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

function formatarData(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR');
}

function formatarHora(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const LABELS_REGIAO: Record<string, string> = {
  joelho_dir: 'Joelho direito',
  joelho_esq: 'Joelho esquerdo',
  quadril: 'Quadril',
  ombro: 'Ombro',
  tornozelo: 'Tornozelo',
  coluna: 'Coluna',
  mao_punho: 'Mão / Punho',
  outro: 'Outro',
};

const LABELS_TEMPO: Record<string, string> = {
  menos_1sem: 'Menos de 1 semana',
  '1_4sem': '1 a 4 semanas',
  '1_6meses': '1 a 6 meses',
  mais_6meses: 'Mais de 6 meses',
  mais_1ano: 'Mais de 1 ano',
};

const LABELS_DOENCA: Record<string, string> = {
  has: 'HAS',
  dm: 'Diabetes',
  osteoporose: 'Osteoporose',
  artrite: 'Artrite',
  artrose: 'Artrose',
  obesidade: 'Obesidade',
  outra: 'Outra',
};

export async function gerarPDF(dados: DadosFormulario, outputDir: string): Promise<string> {
  const filename = `pre-consulta_${dados.agendamento_id}_${Date.now()}.pdf`;
  const filepath = path.join(outputDir, filename);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    const W = doc.page.width - 80; // largura útil
    const AZUL = '#1a4fa0';
    const CINZA = '#555555';
    const VERMELHO = '#cc0000';

    // ── Cabeçalho ──────────────────────────────────────────────
    doc.rect(40, 40, W, 60).fill(AZUL);
    doc.fillColor('white').fontSize(14).font('Helvetica-Bold')
      .text('CTO – Centro de Trauma e Ortopedia', 50, 50);
    doc.fontSize(10).font('Helvetica')
      .text('Formulário Pré-Consulta  ·  Dr. Valth Menezes Guimarães  ·  CRM-PB 6326', 50, 68);
    doc.fillColor('black');

    let y = 115;

    // ── Linha paciente / consulta ───────────────────────────────
    const meiox = 40 + W / 2;
    doc.rect(40, y, W / 2 - 5, 60).stroke(AZUL);
    doc.rect(meiox + 5, y, W / 2 - 5, 60).stroke(AZUL);

    doc.fontSize(8).fillColor(AZUL).font('Helvetica-Bold')
      .text('PACIENTE', 48, y + 6);
    doc.fillColor('black').fontSize(10).font('Helvetica-Bold')
      .text(dados.nome, 48, y + 17);
    doc.fontSize(9).font('Helvetica').fillColor(CINZA)
      .text(`${calcularIdade(dados.nascimento)} anos  ·  ${dados.estado_civil}  ·  ${dados.profissao}`, 48, y + 31);
    doc.text(`${dados.cidade} – ${dados.bairro}`, 48, y + 43);

    doc.fontSize(8).fillColor(AZUL).font('Helvetica-Bold')
      .text('CONSULTA', meiox + 13, y + 6);
    doc.fillColor('black').fontSize(10).font('Helvetica-Bold')
      .text(`${formatarData(dados.data_consulta)} às ${formatarHora(dados.data_consulta)}`, meiox + 13, y + 17);
    doc.fontSize(9).font('Helvetica').fillColor(CINZA)
      .text(`Pagamento: ${dados.forma_pagamento === 'convenio' ? `Convênio – ${dados.plano_saude}` : 'Particular'}`, meiox + 13, y + 31);

    y += 75;

    // ── Seção helper ───────────────────────────────────────────
    function secao(titulo: string) {
      doc.rect(40, y, W, 18).fill(AZUL);
      doc.fillColor('white').fontSize(9).font('Helvetica-Bold')
        .text(titulo, 46, y + 5);
      doc.fillColor('black');
      y += 24;
    }

    function linha(label: string, valor: string, destaque = false) {
      if (!valor) return;
      doc.fontSize(9).font('Helvetica-Bold').fillColor(destaque ? VERMELHO : CINZA)
        .text(`${label}: `, 48, y, { continued: true });
      doc.font('Helvetica').fillColor(destaque ? VERMELHO : 'black')
        .text(valor);
      y = doc.y + 3;
    }

    function evaBar(val: number) {
      doc.fontSize(9).font('Helvetica-Bold').fillColor(CINZA)
        .text('EVA (dor): ', 48, y, { continued: true });
      // barra
      const barX = doc.x + 2;
      const barW = 120;
      const barH = 10;
      doc.rect(barX, y, barW, barH).stroke('#cccccc');
      const fill = Math.min(val / 10, 1);
      const cor = val >= 7 ? VERMELHO : val >= 4 ? '#e67e00' : '#27ae60';
      doc.rect(barX, y, barW * fill, barH).fill(cor);
      doc.fillColor('black').font('Helvetica')
        .text(` ${val}/10`, barX + barW + 4, y);
      y = doc.y + 4;
    }

    // ── Queixa Principal ───────────────────────────────────────
    secao('QUEIXA PRINCIPAL');
    linha('Região', LABELS_REGIAO[dados.regiao_corpo] || dados.regiao_corpo);
    linha('Tempo de sintomas', LABELS_TEMPO[dados.tempo_sintomas] || dados.tempo_sintomas);
    linha('Mecanismo', dados.mecanismo);
    evaBar(dados.eva);

    // descrição em caixa
    doc.rect(48, y, W - 16, 42).stroke('#dddddd');
    doc.fontSize(9).font('Helvetica-Oblique').fillColor('#333')
      .text(`"${dados.descricao}"`, 54, y + 4, { width: W - 28 });
    y = doc.y + 8;

    linha('Piora', dados.piora);
    linha('Melhora', dados.melhora);
    if (dados.tratamento_anterior) linha('Tratamento prévio', dados.tratamento_anterior);
    if (dados.uso_analgesicos) linha('Analgésicos em uso', dados.uso_analgesicos);

    y += 6;

    // ── Saúde Geral ────────────────────────────────────────────
    secao('SAÚDE GERAL');

    const doencas = (dados.doencas_cronicas || [])
      .map((d) => LABELS_DOENCA[d] || d)
      .join(', ');
    if (doencas) linha('Comorbidades', doencas);
    if (dados.medicacoes) linha('Medicações', dados.medicacoes);

    // alergia em destaque vermelho se preenchida
    if (dados.alergias) linha('Alergias ⚠', dados.alergias, true);

    if (dados.cirurgias_anteriores) linha('Cirurgias anteriores', dados.cirurgias_anteriores);
    linha('Tabagismo', dados.tabagismo);
    linha('Álcool', dados.alcool);

    y += 6;

    // ── Exames ─────────────────────────────────────────────────
    if (dados.exames_urls && dados.exames_urls.length > 0) {
      secao('EXAMES ANEXADOS');
      dados.exames_urls.forEach((url) => {
        const nome = decodeURIComponent(url.split('/').pop() || url);
        doc.fontSize(9).fillColor('#1a4fa0')
          .text(`• ${nome}`, 48, y);
        y = doc.y + 2;
      });
      y += 4;
    }

    // ── Rodapé ─────────────────────────────────────────────────
    const agora = new Date().toLocaleString('pt-BR');
    doc.fontSize(8).fillColor('#999')
      .text(`Gerado em: ${agora}  ·  ID agendamento: ${dados.agendamento_id}`,
        40, doc.page.height - 40, { width: W, align: 'center' });

    doc.end();
    stream.on('finish', () => resolve(filename));
    stream.on('error', reject);
  });
}
