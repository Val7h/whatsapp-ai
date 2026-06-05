import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { validarToken } from './token';
import { gerarPDF } from './gerar-pdf';

const router = express.Router();

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'exames');
const PDFS_DIR = path.join(process.cwd(), 'uploads', 'pdfs');

// garante que os diretórios existem
[UPLOADS_DIR, PDFS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter(_req, file, cb) {
    const ok = /\.(jpg|jpeg|png|pdf)$/i.test(file.originalname);
    cb(null, ok);
  },
});

const BASE_URL = process.env.FORM_BASE_URL || 'http://localhost:3030';
const N8N_WEBHOOK = process.env.N8N_WEBHOOK_PRE_CONSULTA || 'http://localhost:5678/webhook/pre-consulta';

// ── GET /pre-consulta ─────────────────────────────────────────────
// Serve o formulário HTML
router.get('/pre-consulta', (_req: Request, res: Response) => {
  res.sendFile(path.join(process.cwd(), 'public', 'pre-consulta.html'));
});

// ── GET /confirmacao ──────────────────────────────────────────────
router.get('/confirmacao', (_req: Request, res: Response) => {
  res.sendFile(path.join(process.cwd(), 'public', 'confirmacao.html'));
});

// ── POST /upload-exame ────────────────────────────────────────────
router.post('/upload-exame', upload.single('arquivo'), (req: Request, res: Response) => {
  const { token, exp, agendamento_id } = req.query as Record<string, string>;

  if (!token || !exp || !agendamento_id) {
    res.status(400).json({ erro: 'parametros_ausentes' });
    return;
  }

  const resultado = validarToken(agendamento_id, exp, token);
  if (!resultado.valido) {
    res.status(401).json({ erro: resultado.motivo });
    return;
  }

  if (!req.file) {
    res.status(400).json({ erro: 'arquivo_ausente' });
    return;
  }

  // nome seguro: sem path traversal
  const ext = path.extname(req.file.originalname).toLowerCase();
  const nomeSeguro = `${agendamento_id}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
  const filepath = path.join(UPLOADS_DIR, nomeSeguro);
  fs.writeFileSync(filepath, req.file.buffer);

  res.json({
    url: `${BASE_URL}/uploads/exames/${nomeSeguro}`,
    nome: req.file.originalname,
    tamanho_kb: Math.round(req.file.size / 1024),
  });
});

// ── POST /submit-pre-consulta ─────────────────────────────────────
router.post('/submit-pre-consulta', express.json({ limit: '50kb' }), async (req: Request, res: Response) => {
  const body = req.body;
  const { token, exp, agendamento_id } = body;

  if (!token || !exp || !agendamento_id) {
    res.status(400).json({ erro: 'parametros_ausentes' });
    return;
  }

  const resultado = validarToken(agendamento_id, exp, token);
  if (!resultado.valido) {
    res.status(401).json({ erro: resultado.motivo, token_expirado: resultado.motivo === 'expirado' });
    return;
  }

  try {
    // gera PDF
    const pdfFilename = await gerarPDF(body, PDFS_DIR);
    const pdf_url = `${BASE_URL}/uploads/pdfs/${pdfFilename}`;

    // notifica n8n
    const payload = { ...body, pdf_url };
    await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch((err) => {
      // não bloqueia resposta ao paciente se n8n estiver fora
      console.error('[pre-consulta] erro ao notificar n8n:', err.message);
    });

    res.json({ ok: true, pdf_url });
  } catch (err) {
    console.error('[pre-consulta] erro ao gerar PDF:', err);
    res.status(500).json({ erro: 'erro_interno' });
  }
});

export default router;
