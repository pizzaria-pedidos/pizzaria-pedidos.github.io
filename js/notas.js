// =====================================================================
//  Leitura do resumo da nota fiscal (texto que a IA devolve) e sugestão
//  de qual ingrediente é cada linha. Funções puras — sem tela, sem banco.
//
//  Formatos aceitos (uma compra por linha):
//    * Queijo mussarela Morro Alto: 4,154 kg × 36,99 = 153,66
//    * Farinha de trigo Finna 1 kg: 4 × 4,59 = 18,36
//    * Refrigerante Antarctica 1 L, fardo com 12: 1 × 46,99
//    CALABRESA FATIADA;2,094;kg;24,99;52,33        (produto;qtd;unidade;preço;total)
//  Linhas de título, subtotal e total são ignoradas sozinhas.
// =====================================================================
import { norm } from './utils.js?v=19';

/** "4,154" → 4.154 · "1.234,56" → 1234.56 · "36.99" → 36.99 */
export function numBR(v) {
  let t = String(v ?? '').trim().replace(/[^\d.,-]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}
const r2 = (n) => Math.round(n * 100) / 100;

/** unidade escrita → kg | g | l | ml | un */
function unidade(u) {
  const s = norm(u || '').replace(/\./g, '');
  if (/^(kg|kgs|quilo|quilos)$/.test(s)) return 'kg';
  if (/^(g|gr|grs|grama|gramas)$/.test(s)) return 'g';
  if (/^(l|lt|lts|litro|litros)$/.test(s)) return 'l';
  if (/^(ml|mls)$/.test(s)) return 'ml';
  return 'un';
}

const RE_TAM = /(\d+(?:[.,]\d+)?)\s*(kg|g|gr|l|lt|litros?|ml)\b/i;
const RE_PACOTE = /(?:fardo|pacote|pct|caixa|cx|embalagem|saco)\s*(?:com|c\/|de)?\s*(\d+)\s*(?:un|unid|unidades)?\b/i;
const RE_UNIDADES = /(?:c\/\s*)?(\d+)\s*(?:unidades|unid|un)\b/i;

/** Tamanho escrito no nome ("Requeijão 1,5 kg") e unidades por pacote ("fardo com 12") */
function detalhesDoNome(desc) {
  const t = desc.match(RE_TAM);
  const pc = desc.match(RE_PACOTE) || desc.match(RE_UNIDADES);
  return {
    tam: t ? { v: numBR(t[1]), u: unidade(t[2]) } : null,
    porPacote: pc ? Number(pc[1]) : null,
  };
}

/** Data "15/11/2026" no texto → "2026-11-15" */
function dataDoTexto(texto) {
  const m = texto.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

const RE_LINHA = /^(.+?):\s*([\d.,]+)\s*(kg|kgs|g|gr|l|lt|ml|un|und|unid|unidades?|pct|cx|pc|pç)?\.?\s*[×xX*]\s*(?:R\$\s*)?([\d.,]+)\s*(?:=\s*(?:R\$\s*)?([\d.,]+))?/;

/**
 * Lê o texto colado e devolve { data, linhas: [{ desc, qtd, uq, preco, total, tam, porPacote }] }.
 * uq = unidade da quantidade (kg, g, l, ml ou un).
 */
export function lerNota(texto) {
  const linhas = [];
  for (const bruta of String(texto || '').split(/\r?\n/)) {
    const s = bruta.replace(/^[\s*\-•·▪◦>]+/, '').replace(/\*\*/g, '').trim();
    if (!s) continue;
    let desc, qtd, uq, preco, total;
    const m = s.match(RE_LINHA);
    if (m) {
      desc = m[1].trim();
      qtd = numBR(m[2]);
      uq = unidade(m[3]);
      preco = numBR(m[4]);
      total = m[5] ? numBR(m[5]) : r2(qtd * preco);
    } else if (s.includes(';')) {
      const c = s.split(';').map((x) => x.trim());
      if (c.length < 4 || /produto/i.test(c[0])) continue;
      desc = c[0];
      qtd = numBR(c[1]);
      uq = unidade(c[2]);
      preco = numBR(c[3]);
      total = c[4] ? numBR(c[4]) : r2(qtd * preco);
    } else continue;
    if (!desc || !(qtd > 0) || !(total > 0)) continue;
    linhas.push({ desc, qtd, uq, preco, total, ...detalhesDoNome(desc) });
  }
  return { data: dataDoTexto(String(texto || '')), linhas };
}

// ---------------------------------------------------------------------
//  Quantidades e preço por kg / L / un
// ---------------------------------------------------------------------
const CONV = { kg: { kg: 1, g: 0.001 }, L: { l: 1, ml: 0.001 } };

/** Unidade-base que faz sentido para a linha (para um ingrediente novo) */
export function baseDaLinha(l) {
  if (l.uq === 'kg' || l.uq === 'g') return 'kg';
  if (l.uq === 'l' || l.uq === 'ml') return 'L';
  if (l.tam?.u === 'kg' || l.tam?.u === 'g') return 'kg';
  if (l.tam?.u === 'l' || l.tam?.u === 'ml') return 'L';
  return 'un';
}

/**
 * Quanto foi comprado na unidade-base do ingrediente (kg, L ou un).
 * emb = tamanho da embalagem que o ingrediente já conhece (ex.: molho de 2 kg).
 * Devolve { q, certo } — certo=false quando foi um chute (o dono precisa conferir).
 */
export function qtdNaBase(l, base, emb = 0) {
  const c = CONV[base];
  if (l.uq !== 'un') {
    const f = c?.[l.uq];
    return f ? { q: l.qtd * f, certo: true } : { q: 0, certo: false };
  }
  if (base === 'un') {
    if (l.porPacote) return { q: l.qtd * l.porPacote, certo: true };
    if (emb > 0) return { q: l.qtd * emb, certo: true };
    return { q: l.qtd, certo: false };
  }
  if (l.tam && c?.[l.tam.u]) return { q: l.qtd * l.tam.v * c[l.tam.u], certo: true };
  if (emb > 0) return { q: l.qtd * emb, certo: true };
  return { q: 0, certo: false };
}

// ---------------------------------------------------------------------
//  Sugestão: qual ingrediente é esta linha?
// ---------------------------------------------------------------------
const PARADAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'sem', 'para', 'a', 'o', 'em', 'c', 'tipo']);
// palavras que a nota usa e que querem dizer o mesmo ingrediente
const SINONIMOS = {
  requeijao: 'catupiry', mucarela: 'mussarela', muzzarela: 'mussarela', mozarela: 'mussarela', muzarela: 'mussarela',
  peito: 'frango', sobrecoxa: 'frango', caixa: 'embalagem', refri: 'refrigerante', azeitonas: 'azeitona', ovos: 'ovo',
};
// palavras que podem vir ANTES do nome do ingrediente na nota
const PREFIXOS = new Set(['queijo', 'file', 'peito', 'carne', 'linguica', 'farinha', 'massa', 'oleo', 'acucar']);
// grafias diferentes da mesma marca (a nota escreve de um jeito, o cardápio de outro)
const GRAFIAS = { antarctica: 'antartica', antartic: 'antartica', cocacola: 'coca cola', coke: 'coca cola', guarana: 'guarana' };
/** palavras (sem acento, sem tamanho/número), com sinônimos acrescentados */
function palavras(txt, comSinonimos = true) {
  const ws = norm(txt).replace(/(\d+(?:[.,]\d+)?)\s*(kg|g|gr|l|lt|ml)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ')
    .split(' ').flatMap((w) => (GRAFIAS[w] || w).split(' ')).filter((w) => w && !/^\d+$/.test(w) && !PARADAS.has(w));
  if (!comSinonimos) return ws;
  return [...ws, ...ws.map((w) => SINONIMOS[w]).filter(Boolean)];
}
/** tamanhos no texto, normalizados: "1 L" → "1l", "350ml" → "350ml" */
function tamanhosDo(txt) {
  return [...norm(txt).matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|g|gr|l|lt|ml)\b/g)].map((m) => `${m[1].replace(',', '.')}${m[2] === 'lt' ? 'l' : m[2] === 'gr' ? 'g' : m[2]}`);
}

/** "Assinatura" da descrição, para lembrar associações (sem números, tamanhos e pontuação) */
export function assinatura(desc) {
  return palavras(desc, false).join(' ');
}

/**
 * Sugere o destino da linha.
 * ingredientes: [{ id, nome }] · simples: [{ id, nome }] (produtos do cardápio) · apelidos: { assinatura: destino }
 * Destino: 'ing:<id>' | 'simples:<id>' | 'ignorar' | ''
 * Devolve { destino, certeza: 'aprendido' | 'alta' | 'baixa' | '' }
 */
export function sugerir(desc, ingredientes, simples, apelidos = {}) {
  const ap = apelidos[assinatura(desc)];
  if (ap === 'ignorar') return { destino: 'ignorar', certeza: 'aprendido' };
  if (ap?.startsWith('ing:') && ingredientes.some((i) => `ing:${i.id}` === ap)) return { destino: ap, certeza: 'aprendido' };
  if (ap?.startsWith('simples:') && simples.some((s) => `simples:${s.id}` === ap)) return { destino: ap, certeza: 'aprendido' };

  const dw = palavras(desc);
  const dwBase = palavras(desc, false);
  const primeira = dwBase[0];
  let melhor = { destino: '', certeza: '', pontos: 0 };
  for (const ing of ingredientes) {
    const iw = palavras(ing.nome, false);
    if (!iw.length || !iw.every((w) => dw.includes(w))) continue;
    // o ingrediente tem que vir no começo, ou só depois de palavras como "queijo", "filé", "peito"
    // ("Pimenta calabresa" NÃO é Calabresa; "Queijo mussarela" É Mussarela)
    const idx = dwBase.findIndex((w) => w === iw[0] || SINONIMOS[w] === iw[0]);
    if (idx < 0 || !dwBase.slice(0, idx).every((w) => PREFIXOS.has(w))) continue;
    const pontos = iw.length * 10 + (idx === 0 ? 5 : 0);
    if (pontos > melhor.pontos) melhor = { destino: `ing:${ing.id}`, certeza: 'alta', pontos };
  }
  // bebidas e outros itens do cardápio (precisa bater também o tamanho, ex.: 1l x 2l)
  const dt = tamanhosDo(desc);
  for (const pr of simples) {
    const pw = palavras(pr.nome, false);
    const pt = tamanhosDo(pr.nome);
    if (!pw.length || !pw.every((w) => dw.includes(w))) continue;
    if (pt.length && !pt.every((t) => dt.includes(t))) continue;
    const pontos = pw.length * 10 + pt.length * 5 + 1;
    if (pontos > melhor.pontos) melhor = { destino: `simples:${pr.id}`, certeza: pw[0] === primeira ? 'alta' : 'baixa', pontos };
  }
  return { destino: melhor.destino, certeza: melhor.certeza };
}

/** Nome sugerido para um ingrediente novo: "Pimenta calabresa", "Vinagre de álcool", "Embalagem para pizza" */
export function nomeSugerido(desc) {
  const ws = desc.replace(RE_TAM, ' ').replace(/[,;:(].*$/, '').split(/\s+/).filter((w) => w && !/\d/.test(w));
  const out = [];
  for (const w of ws) {
    out.push(w);
    const conta = out.filter((x) => !PARADAS.has(norm(x))).length;
    if (conta >= 2 && !PARADAS.has(norm(w))) break;
  }
  const nome = out.join(' ').toLowerCase();
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

/** Prompt pronto para pedir à IA que extraia a nota neste formato */
export const PROMPT_IA = `Leia esta nota fiscal de compra e me devolva só os itens comprados, um por linha, neste formato:

Compra de DD/MM/AAAA
* Nome do produto com marca e tamanho: quantidade × preço unitário = total

Exemplos:
* Queijo mussarela Morro Alto: 4,154 kg × 36,99 = 153,66
* Farinha de trigo Finna 1 kg: 4 × 4,59 = 18,36
* Requeijão cremoso Santa Maria 1,5 kg: 1 × 44,99 = 44,99
* Refrigerante Antarctica 1 L, fardo com 12: 1 × 46,99 = 46,99
* Embalagem para pizza N35, pacote com 25 unidades: 1 × 28,99 = 28,99

Regras:
- Use vírgula nos decimais.
- Produto vendido a peso: escreva "kg" depois da quantidade (ex.: 4,154 kg).
- Se o tamanho estiver no produto (1 kg, 500 g, 900 ml, 1,5 kg), mantenha no nome.
- Fardo ou pacote: diga quantas unidades vêm (ex.: "fardo com 12", "pacote com 25 unidades").
- Não invente itens nem valores; se não conseguir ler algo, escreva [ilegível].`;
