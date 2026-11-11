// Funções compartilhadas entre a página do cliente (cliente.js) e o painel (admin.js).

export const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']; // índice = Date.getDay()
export const ORDEM_SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
export const DIAS_NOME = {
  dom: 'Domingo', seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta', sab: 'Sábado',
};

export const PAGAMENTOS = { pix: 'Pix', cartao: 'Cartão (na entrega)', dinheiro: 'Dinheiro' };

export const STATUS = {
  novo:      { nome: 'Novo',               cliente: 'Recebido' },
  preparo:   { nome: 'Em preparo',         cliente: 'Em preparo' },
  saiu:      { nome: 'Saiu para entrega',  cliente: 'Saiu para entrega' },
  pronto:    { nome: 'Pronto p/ retirada', cliente: 'Pronto para retirada' },
  concluido: { nome: 'Concluído',          cliente: 'Concluído' },
  cancelado: { nome: 'Cancelado',          cliente: 'Cancelado' },
};

export function fluxoStatus(tipo) {
  return tipo === 'retirada'
    ? ['novo', 'preparo', 'pronto', 'concluido']
    : ['novo', 'preparo', 'saiu', 'concluido'];
}

// ---------- Regra de preço da pizza (troque no painel: Ajustes > Cardápio) ----------
export const REGRAS_PRECO = {
  maior: { nome: 'Sabor mais caro', calc: (p) => Math.max(...p) },
  media: { nome: 'Média dos sabores', calc: (p) => p.reduce((a, b) => a + b, 0) / p.length },
};
export function precoPizza(precos, regra = 'maior') {
  if (!precos.length) return 0;
  return round2((REGRAS_PRECO[regra] || REGRAS_PRECO.maior).calc(precos));
}

// ---------- Configuração padrão da loja ----------
function horariosPadrao() {
  return Object.fromEntries(DIAS.map((d) => [d, { aberto: true, abre: '18:00', fecha: '23:00' }]));
}
export const DEFAULT_LOJA = {
  nome: 'Pizzaria',
  logoUrl: '',
  whatsapp: '',
  endereco: '',
  horarios: horariosPadrao(),
  fechadoManual: false,
  entregaAtiva: true,
  taxaEntrega: 0,
  pedidoMinimo: 0,
  pagamentos: ['pix', 'cartao', 'dinheiro'],
  chavePix: '',
  regraPrecoPizza: 'maior',
  ocultarIndisponiveis: false,
  limiteRecorrente: 2,
  limiteVip: 10,
  diasSumido: 30,
};
export function mesclarLoja(dados) {
  const l = { ...DEFAULT_LOJA, ...(dados || {}) };
  l.horarios = { ...horariosPadrao(), ...((dados && dados.horarios) || {}) };
  return l;
}

// ---------- Horário de funcionamento ----------
const minutos = (s) => {
  const [h, m] = String(s || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
export function fmtHora(s) {
  const [h, m] = String(s || '0:00').split(':');
  return `${Number(h)}h${m && m !== '00' ? m : ''}`;
}
/** Retorna { aberta, texto, abre } — "abre" é tipo "hoje às 17h". */
export function statusLoja(loja, agora = new Date()) {
  if (loja.fechadoManual) return { aberta: false, texto: 'Fechada no momento', abre: '' };
  const hs = loja.horarios || {};
  const dia = agora.getDay();
  const t = agora.getHours() * 60 + agora.getMinutes();

  // Expediente de ontem que passa da meia-noite (ex.: 18:00 → 01:00)
  const ontem = hs[DIAS[(dia + 6) % 7]];
  if (ontem?.aberto && minutos(ontem.fecha) <= minutos(ontem.abre) && t < minutos(ontem.fecha)) {
    return { aberta: true, texto: `Aberta · fecha às ${fmtHora(ontem.fecha)}` };
  }
  const hoje = hs[DIAS[dia]];
  if (hoje?.aberto) {
    const a = minutos(hoje.abre), f = minutos(hoje.fecha);
    const dentro = f > a ? t >= a && t < f : t >= a;
    if (dentro) return { aberta: true, texto: `Aberta · fecha às ${fmtHora(hoje.fecha)}` };
  }
  for (let i = 0; i <= 7; i++) {
    const d = DIAS[(dia + i) % 7];
    const h = hs[d];
    if (!h?.aberto) continue;
    if (i === 0 && minutos(h.abre) <= t) continue;
    const quando = i === 0 ? 'hoje' : i === 1 ? 'amanhã' : DIAS_NOME[d].toLowerCase();
    const abre = `${quando} às ${fmtHora(h.abre)}`;
    return { aberta: false, texto: `Fechada · abre ${abre}`, abre };
  }
  return { aberta: false, texto: 'Fechada', abre: '' };
}

// ---------- Formatação ----------
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const fmtBRL = (v) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const numPedido = (n) => (n ? `#${String(n).padStart(4, '0')}` : '');

/** "8,50" / "8.50" / "R$ 8,50" → 8.5 */
export function parseMoney(s) {
  let t = String(s ?? '').replace(/[^\d.,-]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? round2(n) : 0;
}
export const moneyInput = (v) => (v ? String(v).replace('.', ',') : '');

/** Qualquer formato → "5571999999999" (ou null se inválido) */
export function normTel(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? '55' + d : null;
}
/** "5571999999999" → "(71) 99999-9999" */
export function fmtTel(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  return mascaraTel(d);
}
/** Máscara enquanto digita */
export function mascaraTel(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  d = d.slice(0, 11);
  if (!d.length) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function toDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (ts instanceof Date) return ts;
  const d = new Date(ts);
  return isNaN(d) ? null : d;
}
const dois = (n) => String(n).padStart(2, '0');
export const fmtData = (d) => (d ? `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}` : '—');
export const fmtHoraMin = (d) => (d ? `${dois(d.getHours())}:${dois(d.getMinutes())}` : '');
export const fmtDataHora = (d) => (d ? `${fmtData(d)} às ${fmtHoraMin(d)}` : '—');
export const fmtMesAno = (d) => (d ? `${dois(d.getMonth() + 1)}/${d.getFullYear()}` : '');

/** Escapa texto antes de colocar em innerHTML */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
/** Minúsculo e sem acento, para busca */
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const porOrdem = (a, b) =>
  (a.ordem ?? 9999) - (b.ordem ?? 9999) || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');

// ---------- localStorage seguro (modo anônimo pode bloquear) ----------
export function lsGet(chave, padrao = null) {
  try {
    const v = localStorage.getItem(chave);
    return v == null ? padrao : JSON.parse(v);
  } catch {
    return padrao;
  }
}
export function lsSet(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem armazenamento */ }
}
export function lsDel(chave) {
  try { localStorage.removeItem(chave); } catch { /* sem armazenamento */ }
}

export function comTimeout(promessa, ms) {
  return Promise.race([
    promessa,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
}

/** Foto com emoji de reserva (aparece se não houver URL ou a imagem falhar) */
export function fotoHTML(url, emoji, classe) {
  return `<div class="${classe}" data-emoji="${esc(emoji)}">${
    url ? `<img src="${esc(url)}" alt="" loading="lazy" onerror="this.remove()">` : ''
  }</div>`;
}

let toastTimer;
export function toast(msg, tipo = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast mostrar ${tipo}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 2800);
}
