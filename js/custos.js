// =====================================================================
//  Área de custos (restrita, protegida por PIN) — dentro do painel admin.
//  Veio do sistema antigo: Fichas (massa, base, sabores, bordas…), Lucro,
//  Balanço do dia e Tabela de gramas.
//
//  Dados (só o admin lê/escreve — ver firestore.rules):
//    custos/fichas        → todas as fichas + PIN (hash)
//    custosPedidos/{id}   → custo/venda/lucro gravados de cada pedido
// =====================================================================
import {
  db, doc, setDoc, onSnapshot, collection, query, where, writeBatch, Timestamp, serverTimestamp,
} from './firebase-config.js';
import * as U from './utils.js';

const { esc, fmtBRL: brl } = U;
const $ = (s, el = document) => el.querySelector(s);

let ctx;                     // { S, tratarErro, abrirModal, fecharModal }
let CU = normCU(null);       // fichas em memória
let carregado = false;
let aberto = false;
let TAB = 'balanco', FICHA = 'massa';
let SABSEL = '', BORSEL = '', ADSEL = '', GRAMTAM = '';
let DIA = inicioDia(new Date());
let ultimaEdicao = 0;
const unsubs = [];
let unsubBal = [];

// ---------------------------------------------------------------------
//  Modelo
// ---------------------------------------------------------------------
function novoItem(nome = '', un = 'kg') { return { id: uid(), nome, pacote: '', un, preco: '', usa: '' }; }
function normCU(d) {
  const c = d ? structuredClone(d) : {};
  c.v = 1;
  c.pinHash = c.pinHash || null;
  c.massa = c.massa || {
    rende: '',
    itens: [novoItem('Farinha de trigo'), novoItem('Fermento biológico', 'g'), novoItem('Açúcar'), novoItem('Sal'), novoItem('Óleo', 'ml')],
  };
  c.base = c.base || { itens: [novoItem('Molho de tomate'), novoItem('Mussarela')] };
  c.sabores = c.sabores || {};
  c.bordas = c.bordas || {};
  c.adicionais = c.adicionais || {};
  c.simples = c.simples || {};
  c.tamanhos = c.tamanhos || { ref: '', fator: {} };
  c.tamanhos.fator = c.tamanhos.fator || {};
  return c;
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
/** Aceita "4,20", "4.20", 4.2 */
function num(v) {
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
function inicioDia(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

// Unidade do pacote → [unidade de uso, multiplicador]
const UN = { kg: ['g', 1000], g: ['g', 1], L: ['ml', 1000], ml: ['ml', 1], un: ['un', 1] };
const unUso = (it) => (UN[it.un] || UN.un)[0];
/** custo do que vai = preço do pacote ÷ tamanho do pacote × quanto usa */
function custoItem(it) {
  const tam = num(it.pacote) * (UN[it.un] || UN.un)[1];
  return tam > 0 ? (num(it.preco) / tam) * num(it.usa) : 0;
}
const somaItens = (lista) => (lista || []).reduce((s, it) => s + custoItem(it), 0);
const custoReceita = () => somaItens(CU.massa.itens);
const custoDisco = () => (num(CU.massa.rende) > 0 ? custoReceita() / num(CU.massa.rende) : 0);
/** base de toda pizza (tamanho de referência) = 1 disco + molho + mussarela… */
const custoBase = () => custoDisco() + somaItens(CU.base.itens);
const recheioCusto = (id) => somaItens(CU.sabores[id]?.itens);
const bordaCusto = (id) => somaItens(CU.bordas[id]?.itens);
const adicCusto = (id) => somaItens(CU.adicionais[id]?.itens);
const temItens = (grupo, id) => (CU[grupo][id]?.itens || []).some((it) => custoItem(it) > 0);
function simplesCustoUn(id) {
  const b = CU.simples[id];
  return b && num(b.qtd) > 0 ? num(b.preco) / num(b.qtd) : 0;
}

// ---------- Tamanhos ----------
function tamanhos() {
  const t = [];
  [...ctx.S.produtos].filter((p) => p.tipo === 'pizza' && p.tamanho)
    .sort((a, b) => (b.fatias || 0) - (a.fatias || 0))
    .forEach((p) => { if (!t.includes(p.tamanho)) t.push(p.tamanho); });
  return t;
}
/** Tamanho de referência (as fichas são preenchidas para ele). Padrão: o de mais fatias. */
function tamRef() {
  const ts = tamanhos();
  return ts.includes(CU.tamanhos.ref) ? CU.tamanhos.ref : ts[0] || '';
}
/** Proporção de um tamanho em relação à referência (1 = igual) */
function fator(t) {
  if (!t || t === tamRef()) return 1;
  const f = num(CU.tamanhos.fator[t]);
  return f > 0 ? f / 100 : 1;
}
const fatorDefinido = (t) => !t || t === tamRef() || num(CU.tamanhos.fator[t]) > 0;

// ---------------------------------------------------------------------
//  Custo / venda / lucro de um pedido do site
// ---------------------------------------------------------------------
export function calcPedido(p) {
  const L = [];
  const base = custoBase();
  for (const it of p.itens || []) {
    const q = it.qtd || 1;
    if (it.tipo === 'pizza') {
      const f = fator(it.tamanho);
      const sabs = it.sabores || [];
      const n = sabs.length || 1;
      const rech = sabs.reduce((s, x) => s + recheioCusto(x.id), 0) / n;
      const bordaV = it.borda?.preco || 0;
      const adicV = (it.adicionais || []).reduce((s, a) => s + (a.preco || 0) * (a.qtd || 0), 0);
      const falta = sabs.filter((x) => !(recheioCusto(x.id) > 0)).map((x) => x.nome);
      const aviso = [
        base > 0 ? '' : 'base não preenchida',
        falta.length ? `sem ficha: ${falta.join(', ')}` : '',
        fatorDefinido(it.tamanho) ? '' : `proporção do tamanho ${it.tamanho} não definida`,
      ].filter(Boolean).join(' · ');
      L.push({
        desc: `${it.nome} (${sabs.map((s) => s.nome).join(' / ')})`,
        qtd: q, venda: (it.precoUnit - bordaV - adicV) * q, custo: (base + rech) * f * q, aviso,
      });
      if (it.borda) {
        const cb = bordaCusto(it.borda.id) * f;
        L.push({ desc: `Borda ${it.borda.nome}`, qtd: q, venda: bordaV * q, custo: cb * q, aviso: cb > 0 ? '' : 'borda sem ficha' });
      }
      for (const a of it.adicionais || []) {
        const ca = adicCusto(a.id);
        const qa = (a.qtd || 0) * q;
        L.push({ desc: `Adicional ${a.nome}`, qtd: qa, venda: (a.preco || 0) * qa, custo: ca * qa, aviso: ca > 0 ? '' : 'adicional sem ficha' });
      }
    } else {
      const cu = simplesCustoUn(it.produtoId);
      L.push({ desc: it.nome, qtd: q, venda: it.precoUnit * q, custo: cu * q, aviso: cu > 0 ? '' : 'sem custo preenchido' });
    }
  }
  L.forEach((l) => { l.venda = U.round2(l.venda); l.custo = U.round2(l.custo); });
  return {
    linhas: L,
    venda: U.round2(L.reduce((s, l) => s + l.venda, 0)),
    custo: U.round2(L.reduce((s, l) => s + l.custo, 0)),
  };
}

// ---------------------------------------------------------------------
//  Firestore
// ---------------------------------------------------------------------
const refFichas = () => doc(db, 'custos', 'fichas');
let _t;
function salvar() {
  ultimaEdicao = Date.now();
  clearTimeout(_t);
  _t = setTimeout(() => {
    setDoc(refFichas(), CU).catch((e) => { ctx.tratarErro(e); U.toast('Erro ao salvar custos.', 'erro-t'); });
  }, 700);
}

export function iniciarCustos(c) {
  ctx = c;
  pararCustos();
  unsubs.push(onSnapshot(refFichas(), (s) => {
    if (s.metadata.hasPendingWrites || Date.now() - ultimaEdicao < 3000) { carregado = true; return; }
    CU = normCU(s.exists() ? s.data() : null);
    carregado = true;
    if (aberto && !digitando()) render();
  }, ctx.tratarErro));
  gravarAutomatico();
}
export function pararCustos() {
  unsubs.splice(0).forEach((u) => u());
  unsubBal.splice(0).forEach((u) => u());
  aberto = false;
  carregado = false;
  document.body.classList.remove('custo');
}
/** Chamado pelo admin quando o cardápio muda */
export function custosCardapioMudou() {
  if (aberto && !digitando()) render();
}
const digitando = () => {
  const a = document.activeElement;
  return a && $('#v-custos')?.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName);
};

/**
 * Grava o custo de cada pedido de hoje no momento em que ele chega,
 * com os preços das fichas daquele momento (igual ao sistema antigo).
 * Só grava se a base já estiver preenchida — senão o Balanço calcula na hora.
 */
let hojeAncora = null;
function gravarAutomatico() {
  const hoje = inicioDia(new Date());
  hojeAncora = hoje.getTime();
  const ini = Timestamp.fromDate(hoje);
  let peds = null, salvos = null;
  const gravando = new Set();
  const tentar = () => {
    if (!peds || !salvos || !carregado || !(custoBase() > 0)) return;
    for (const p of peds) {
      if (salvos.has(p.id) || gravando.has(p.id) || !p.criadoEm) continue;
      gravando.add(p.id);
      setDoc(doc(db, 'custosPedidos', p.id), { ...calcPedido(p), data: p.criadoEm, calculadoEm: serverTimestamp() })
        .catch((e) => { gravando.delete(p.id); console.warn(e); });
    }
  };
  unsubs.push(onSnapshot(query(collection(db, 'pedidos'), where('criadoEm', '>=', ini)), (s) => {
    peds = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    tentar();
  }, ctx.tratarErro));
  unsubs.push(onSnapshot(query(collection(db, 'custosPedidos'), where('data', '>=', ini)), (s) => {
    salvos = new Set(s.docs.map((d) => d.id));
    tentar();
  }, ctx.tratarErro));
}
setInterval(() => {
  // virou o dia com o painel aberto → reinicia a gravação automática
  if (ctx && hojeAncora && inicioDia(new Date()).getTime() !== hojeAncora) iniciarCustos(ctx);
}, 10 * 60 * 1000);

// ---------------------------------------------------------------------
//  PIN
// ---------------------------------------------------------------------
async function hashPin(pin) {
  const dados = new TextEncoder().encode(`pizzaria-custos:${pin}`);
  const h = await crypto.subtle.digest('SHA-256', dados);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function abrirCadeado() {
  if (!carregado) { U.toast('Carregando… tente de novo em instantes.'); return; }
  if (!CU.pinHash) return formPin(true);
  ctx.abrirModal('Área restrita', `
    <form id="cu-fpin" novalidate>
      <label class="campo"><span>Digite o PIN</span><input type="password" inputmode="numeric" id="cu-pin" autocomplete="off" maxlength="8"></label>
      <p class="erro" id="cu-pin-erro"></p>
    </form>`,
    `<button type="button" class="btn btn-sec" data-fechar>Cancelar</button>
     <button type="submit" form="cu-fpin" class="btn btn-primario">Entrar</button>`);
  setTimeout(() => $('#cu-pin')?.focus(), 50);
  $('#cu-fpin').addEventListener('submit', async (e) => {
    e.preventDefault();
    if ((await hashPin($('#cu-pin').value.trim())) === CU.pinHash) { ctx.fecharModal(); entrar(); }
    else { $('#cu-pin-erro').textContent = 'PIN incorreto.'; $('#cu-pin').select(); }
  });
}
function formPin(primeiro) {
  ctx.abrirModal(primeiro ? 'Criar PIN da área de custos' : 'Trocar PIN', `
    <p style="color:var(--texto-2);margin-bottom:12px">Use de 4 a 8 números. O PIN será pedido sempre que alguém tocar no cadeado.</p>
    <form id="cu-fpin2" novalidate>
      <label class="campo"><span>Novo PIN</span><input type="password" inputmode="numeric" id="cu-p1" autocomplete="off" maxlength="8"></label>
      <label class="campo"><span>Repita o PIN</span><input type="password" inputmode="numeric" id="cu-p2" autocomplete="off" maxlength="8"></label>
      <p class="erro" id="cu-pin-erro"></p>
    </form>`,
    `<button type="button" class="btn btn-sec" data-fechar>Cancelar</button>
     <button type="submit" form="cu-fpin2" class="btn btn-primario">${primeiro ? 'Criar e entrar' : 'Salvar PIN'}</button>`);
  setTimeout(() => $('#cu-p1')?.focus(), 50);
  $('#cu-fpin2').addEventListener('submit', async (e) => {
    e.preventDefault();
    const p1 = $('#cu-p1').value.trim(), p2 = $('#cu-p2').value.trim();
    if (!/^\d{4,8}$/.test(p1)) { $('#cu-pin-erro').textContent = 'Use de 4 a 8 números.'; return; }
    if (p1 !== p2) { $('#cu-pin-erro').textContent = 'Os dois PINs não são iguais.'; return; }
    CU.pinHash = await hashPin(p1);
    ultimaEdicao = Date.now();
    try {
      await setDoc(refFichas(), CU);
      ctx.fecharModal();
      U.toast(primeiro ? 'PIN criado ✓' : 'PIN alterado ✓');
      if (primeiro) entrar();
    } catch (err) { ctx.tratarErro(err); $('#cu-pin-erro').textContent = 'Não foi possível salvar. Confira as regras do Firestore.'; }
  });
}

// ---------------------------------------------------------------------
//  Entrar / sair
// ---------------------------------------------------------------------
function entrar() {
  aberto = true;
  TAB = 'balanco';
  DIA = inicioDia(new Date());
  document.querySelectorAll('.view').forEach((v) => (v.hidden = v.id !== 'v-custos'));
  document.querySelectorAll('.menu [data-view]').forEach((b) => b.classList.remove('ativo'));
  document.body.classList.add('custo');
  render();
  window.scrollTo({ top: 0 });
}
/** Chamado pelo admin ao trocar de tela pelo menu */
export function sairCustos() {
  aberto = false;
  unsubBal.splice(0).forEach((u) => u());
  document.body.classList.remove('custo');
}

// ---------------------------------------------------------------------
//  Render
// ---------------------------------------------------------------------
const ABAS = [['balanco', '📒', 'Balanço'], ['fichas', '📋', 'Fichas'], ['lucro', '💲', 'Lucro'], ['gramas', '⚖️', 'Gramas']];
const FICHAS = [['massa', 'Massa'], ['base', 'Base e tamanhos'], ['sabores', 'Sabores'], ['bordas', 'Bordas'], ['adicionais', 'Adicionais'], ['simples', 'Bebidas e outros']];

function render() {
  if (!aberto) return;
  if (TAB !== 'balanco') unsubBal.splice(0).forEach((u) => u());
  const el = $('#v-custos');
  el.innerHTML = `
    <div class="view-topo"><h1>🔒 Custos e lucro</h1>
      <button type="button" class="btn btn-sec btn-peq" data-cu="sair">↩️ Sair da área</button></div>
    <div class="subabas">${ABAS.map(([k, i, t]) => `<button type="button" data-cu="tab" data-v="${k}" class="${TAB === k ? 'ativo' : ''}">${i} ${t}</button>`).join('')}</div>
    ${TAB === 'fichas' ? `<div class="subabas cu-fichas">${FICHAS.map(([k, t]) => `<button type="button" data-cu="ficha" data-v="${k}" class="${FICHA === k ? 'ativo' : ''}">${t}</button>`).join('')}</div>` : ''}
    <div id="cu-corpo">${corpo()}</div>`;
  if (TAB === 'balanco') ouvirBalanco();
}
function corpo() {
  if (TAB === 'lucro') return viewLucro();
  if (TAB === 'gramas') return viewGramas();
  if (TAB === 'balanco') return '<div id="cu-bal"><span class="sk sk-card"></span></div>';
  return { massa: viewMassa, base: viewBase, sabores: viewSabores, bordas: viewBordas, adicionais: viewAdicionais, simples: viewSimples }[FICHA]();
}

// ---------- Tabela de ingredientes (igual em todas as fichas) ----------
function listaAtual() {
  if (FICHA === 'massa') return CU.massa.itens;
  if (FICHA === 'base') return CU.base.itens;
  const sel = { sabores: SABSEL, bordas: BORSEL, adicionais: ADSEL }[FICHA];
  const G = CU[FICHA];
  if (!G[sel]) G[sel] = { itens: [] };
  return G[sel].itens;
}
function tabelaItens(lista, rotuloUso) {
  let h = `<div class="cartao"><div class="mrow head"><span>Ingrediente</span><span>Pacote</span><span>Paguei no pacote</span><span>${rotuloUso}</span><span class="num">Custo</span><span></span></div>`;
  if (!lista.length) h += '<p class="vazio" style="padding:16px">Nenhum ingrediente. Toque em “+ Ingrediente”.</p>';
  lista.forEach((it, i) => {
    h += `<div class="mrow">
      <label class="m-nm"><span>Ingrediente</span><input class="input" data-ci="m" data-i="${i}" data-f="nome" value="${esc(it.nome)}" placeholder="Nome do ingrediente"></label>
      <label class="m-pc"><span>Pacote</span><div class="inl"><input class="input" inputmode="decimal" data-ci="m" data-i="${i}" data-f="pacote" value="${esc(it.pacote)}" placeholder="1">
        <select class="input" data-ci="m" data-i="${i}" data-f="un" aria-label="Unidade do pacote">${Object.keys(UN).map((u) => `<option ${it.un === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div></label>
      <label class="m-pg"><span>Paguei no pacote</span><div class="inl"><span class="u">R$</span><input class="input" inputmode="decimal" data-ci="m" data-i="${i}" data-f="preco" value="${esc(it.preco)}" placeholder="0,00"></div></label>
      <label class="m-us"><span>${rotuloUso}</span><div class="inl"><input class="input" inputmode="decimal" data-ci="m" data-i="${i}" data-f="usa" value="${esc(it.usa)}" placeholder="0"><span class="u" data-un="${i}">${unUso(it)}</span></div></label>
      <div class="m-ct" data-calc="${i}">${brl(custoItem(it))}</div>
      <button type="button" class="m-x btn-icone" data-cu="mDel" data-i="${i}" aria-label="Remover ingrediente">✕</button>
    </div>`;
  });
  return `${h}<button type="button" class="btn btn-sec btn-peq" data-cu="mAdd" style="margin-top:10px">+ Ingrediente</button></div>`;
}
const linhaRes = (txt, valor, cls = '') => `<div class="cu-item ${cls}"><span>${txt}</span><b>${valor}</b></div>`;
const destaque = (txt, valor) => `<div class="cu-disco"><span>${txt}</span><span class="cu-big">${valor}</span></div>`;
const chips = (lista, sel, grupo, acao) => `<div class="chips">${lista.map((x) =>
  `<button type="button" class="chip ${x.id === sel ? 'on' : ''} ${temItens(grupo, x.id) ? '' : 'vazia'}" data-cu="${acao}" data-id="${esc(x.id)}">${esc(x.nome)}</button>`).join('')}</div>
  <p class="cu-dica">Contorno tracejado = ainda não preenchido.</p>`;
const p = (t) => `<p class="cu-dica">${t}</p>`;

// ---------- Massa ----------
function viewMassa() {
  return `<h2 class="cu-h2">Massa</h2>
  ${p('Para cada ingrediente: o tamanho do pacote, quanto pagou no pacote e quanto vai na receita. A conta é feita sozinha.')}
  ${tabelaItens(CU.massa.itens, 'Vai na receita')}
  <div class="cartao"><label class="campo" style="margin:0"><span>Essa receita rende quantos discos${tamRef() ? ` (pizza ${esc(tamRef())})` : ''}?</span>
    <input class="input" inputmode="decimal" data-ci="rende" value="${esc(CU.massa.rende)}" placeholder="Ex.: 4" style="max-width:160px"></label></div>
  <div id="cu-res">${resMassa()}</div>
  <div class="cartao cu-ajustes">
    <h3>⚙️ Área de custos</h3>
    <button type="button" class="btn btn-sec btn-peq" data-cu="trocarPin">🔑 Trocar PIN</button>
    <label class="btn btn-sec btn-peq">⬆️ Importar fichas do sistema antigo<input type="file" accept=".json,application/json" id="cu-importar" hidden></label>
    ${p('No sistema antigo: Cardápio → Exportar dados. Depois escolha aqui o arquivo .json baixado. Massa, base, sabores, bordas e bebidas são copiados (pelo nome).')}
  </div>`;
}
function resMassa() {
  const ok = num(CU.massa.rende) > 0;
  return `<div class="cartao">${linhaRes('Custo da receita inteira', brl(custoReceita()))}
    ${destaque('Custo de <b>1 disco</b>', ok ? brl(custoDisco()) : '—')}</div>
    ${ok ? '' : p('Preencha quantos discos a receita rende para ver o valor de 1 disco.')}`;
}

// ---------- Base + tamanhos ----------
function viewBase() {
  const ts = tamanhos(), ref = tamRef();
  return `<h2 class="cu-h2">Base da pizza</h2>
  ${p(`O que vai em <b>toda</b> pizza, na mesma quantidade, seja qual for o sabor e seja inteira, meia ou 3 sabores.${ref ? ` Preencha para a pizza <b>${esc(ref)}</b>.` : ''}`)}
  <div class="cartao">${linhaRes('<b>1 disco de massa</b><small>vem da aba Massa</small>', num(CU.massa.rende) > 0 ? brl(custoDisco()) : 'preencher na Massa')}</div>
  ${tabelaItens(CU.base.itens, 'Vai em cada pizza')}
  <div id="cu-res">${resBase()}</div>
  <h2 class="cu-h2">Tamanhos</h2>
  ${ts.length ? `<div class="cartao">
    ${p('Todas as fichas (massa, base, recheio e borda) são preenchidas para a pizza de <b>referência</b>. Para os outros tamanhos, diga quanto eles usam em comparação com ela.')}
    <label class="campo"><span>Tamanho de referência</span>
      <select class="input" data-ci="ref" style="max-width:240px">${ts.map((t) => `<option ${t === ref ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
    ${ts.filter((t) => t !== ref).map((t) => `
      <label class="campo"><span>A pizza <b>${esc(t)}</b> usa quanto da ${esc(ref)}?</span>
        <div class="inl" style="max-width:200px"><input class="input" inputmode="decimal" data-ci="fator" data-tam="${esc(t)}" value="${esc(CU.tamanhos.fator[t] ?? '')}" placeholder="Ex.: 70"><span class="u">%</span></div>
        ${fatorDefinido(t) ? '' : '<small class="warnc">⚠️ Ainda não definido — está contando como 100%.</small>'}</label>`).join('')}
  </div>` : '<div class="cartao">' + p('Cadastre produtos do tipo pizza (com tamanho) no Cardápio.') + '</div>'}`;
}
function resBase() {
  const nomes = CU.base.itens.map((it) => esc(it.nome || '?').toLowerCase()).join(' + ');
  return `<div class="cartao">${destaque(`Custo da <b>base de 1 pizza</b>${tamRef() ? ` ${esc(tamRef())}` : ''}<small>disco + ${nomes}</small>`, brl(custoBase()))}</div>`;
}

// ---------- Sabores ----------
function viewSabores() {
  const sabs = ctx.S.sabores;
  if (!sabs.length) return `<h2 class="cu-h2">Sabores</h2><div class="cartao">${p('Nenhum sabor cadastrado no Cardápio.')}</div>`;
  if (!sabs.some((s) => s.id === SABSEL)) SABSEL = sabs[0].id;
  const nome = sabs.find((s) => s.id === SABSEL).nome;
  return `<h2 class="cu-h2">Sabores</h2>
  ${p(`Escolha o sabor e coloque só o <b>recheio</b> de uma pizza inteira${tamRef() ? ` <b>${esc(tamRef())}</b>` : ''}. A base (disco, molho e mussarela) já entra sozinha.`)}
  ${chips(sabs, SABSEL, 'sabores', 'sabSel')}
  <h2 class="cu-h2">Recheio: ${esc(nome)}</h2>
  ${tabelaItens(listaAtual(), 'Vai na pizza inteira')}
  <div id="cu-res">${resSabor()}</div>`;
}
function resSabor() {
  const sab = ctx.S.sabores.find((s) => s.id === SABSEL);
  if (!sab) return '';
  const base = custoBase(), rech = recheioCusto(SABSEL), ref = tamRef();
  const linhasTam = tamanhos().map((t) => {
    const c = (base + rech) * fator(t), v = num(sab.precos?.[t]);
    return `<tr><td>${esc(t)}${t === ref ? ' <small>(ref.)</small>' : ''}</td><td>${brl(c)}</td><td>${v ? brl(v) : '—'}</td><td>${v ? `<b class="${v - c < 0 ? 'neg' : 'okc'}">${brl(v - c)}</b>` : '—'}</td></tr>`;
  }).join('');
  return `<div class="cartao">
    ${linhaRes('Base (disco + molho + mussarela)', brl(base))}
    ${linhaRes(`Recheio de ${esc(sab.nome)}`, brl(rech))}
    ${destaque(`Custo da <b>pizza inteira</b>${ref ? ` ${esc(ref)}` : ''}`, brl(base + rech))}
    ${linhasTam ? `<div class="tbl"><table class="res"><tr><th>Tamanho</th><th>Custo</th><th>Venda</th><th>Lucro</th></tr>${linhasTam}</table></div>` : ''}
  </div>
  <div class="cartao"><b>Nas frações</b> <small style="color:var(--texto-2)">(o recheio é dividido, a base fica inteira)</small>
    ${linhaRes(`Metade (½) de ${esc(sab.nome)}`, brl(rech / 2))}
    ${linhaRes(`Um terço (⅓) de ${esc(sab.nome)}`, brl(rech / 3))}</div>`;
}

// ---------- Bordas ----------
function viewBordas() {
  const bs = ctx.S.bordas.filter((b) => b.preco > 0);
  if (!bs.length) return `<h2 class="cu-h2">Bordas</h2><div class="cartao">${p('Nenhuma borda paga cadastrada no Cardápio.')}</div>`;
  if (!bs.some((b) => b.id === BORSEL)) BORSEL = bs[0].id;
  const nome = bs.find((b) => b.id === BORSEL).nome;
  return `<h2 class="cu-h2">Bordas</h2>
  ${p(`Coloque o que vai em <b>uma</b> borda recheada${tamRef() ? ` da pizza <b>${esc(tamRef())}</b>` : ''}.`)}
  ${chips(bs, BORSEL, 'bordas', 'borSel')}
  <h2 class="cu-h2">Borda de ${esc(nome)}</h2>
  ${tabelaItens(listaAtual(), 'Vai em cada borda')}
  <div id="cu-res">${resBorda()}</div>`;
}
function resBorda() {
  const b = ctx.S.bordas.find((x) => x.id === BORSEL);
  if (!b) return '';
  const c = bordaCusto(BORSEL);
  return `<div class="cartao">${destaque('Custo de <b>1 borda</b>', brl(c))}
    ${b.preco ? linhaRes(`Cobro ${brl(b.preco)} pela borda`, `lucro ${brl(b.preco - c)}`) : ''}
    ${tamanhos().length > 1 ? p('Nos outros tamanhos, o custo da borda segue a proporção definida em “Base e tamanhos”.') : ''}</div>`;
}

// ---------- Adicionais ----------
function viewAdicionais() {
  const as = ctx.S.adicionais;
  if (!as.length) return `<h2 class="cu-h2">Adicionais</h2><div class="cartao">${p('Nenhum adicional cadastrado no Cardápio.')}</div>`;
  if (!as.some((a) => a.id === ADSEL)) ADSEL = as[0].id;
  const nome = as.find((a) => a.id === ADSEL).nome;
  return `<h2 class="cu-h2">Adicionais</h2>
  ${p('Coloque o que vai em <b>uma</b> porção do adicional (ex.: 30 g de bacon).')}
  ${chips(as, ADSEL, 'adicionais', 'adSel')}
  <h2 class="cu-h2">${esc(nome)}</h2>
  ${tabelaItens(listaAtual(), 'Vai em cada porção')}
  <div id="cu-res">${resAdic()}</div>`;
}
function resAdic() {
  const a = ctx.S.adicionais.find((x) => x.id === ADSEL);
  if (!a) return '';
  const c = adicCusto(ADSEL);
  return `<div class="cartao">${destaque('Custo de <b>1 porção</b>', brl(c))}
    ${a.preco ? linhaRes(`Cobro ${brl(a.preco)}`, `lucro ${brl(a.preco - c)}`) : ''}</div>`;
}

// ---------- Bebidas e outros itens simples ----------
const produtosSimples = () => ctx.S.produtos.filter((x) => x.tipo !== 'pizza');
function viewSimples() {
  const ps = produtosSimples();
  let h = `<h2 class="cu-h2">Bebidas e outros</h2>
  ${p('Quantas unidades vêm no fardo (ou pacote) e quanto pagou nele. O preço de venda vem do Cardápio.')}<div class="cartao">`;
  if (!ps.length) h += p('Nenhum item simples no Cardápio.');
  ps.forEach((b) => {
    const c = CU.simples[b.id] || {};
    h += `<div class="bebrow"><div class="b-n"><b>${esc(b.nome)}</b><small>vendo por ${brl(b.preco)}</small></div>
      <label><small>Unidades no fardo</small><input class="input" inputmode="numeric" data-ci="simples" data-id="${esc(b.id)}" data-f="qtd" value="${esc(c.qtd ?? '')}" placeholder="12"></label>
      <label><small>Paguei no fardo (R$)</small><input class="input" inputmode="decimal" data-ci="simples" data-id="${esc(b.id)}" data-f="preco" value="${esc(c.preco ?? '')}" placeholder="0,00"></label>
      <div class="b-c" data-bcalc="${esc(b.id)}">${bebCalc(b)}</div></div>`;
  });
  return `${h}</div>`;
}
function bebCalc(b) {
  const cu = simplesCustoUn(b.id);
  return cu > 0 ? `custo <b>${brl(cu)}</b> cada · lucro <b class="${b.preco - cu < 0 ? 'neg' : 'okc'}">${brl(b.preco - cu)}</b> cada` : '<span style="color:var(--texto-2)">preencha para ver o lucro</span>';
}

/** Atualiza só os números, sem redesenhar os campos (não perde o foco) */
function refreshCalcs() {
  if (FICHA === 'simples') {
    produtosSimples().forEach((b) => { const el = document.querySelector(`[data-bcalc="${CSS.escape(b.id)}"]`); if (el) el.innerHTML = bebCalc(b); });
    return;
  }
  listaAtual().forEach((it, i) => {
    const c = document.querySelector(`[data-calc="${i}"]`); if (c) c.textContent = brl(custoItem(it));
    const u = document.querySelector(`[data-un="${i}"]`); if (u) u.textContent = unUso(it);
  });
  const r = $('#cu-res');
  if (r) r.innerHTML = { massa: resMassa, base: resBase, sabores: resSabor, bordas: resBorda, adicionais: resAdic }[FICHA]();
}

// ---------- Lucro por produto ----------
function viewLucro() {
  const linha = (nome, custo, venda, ok) => `<tr><td>${esc(nome)}</td>${ok
    ? `<td>${brl(custo)}</td><td>${brl(venda)}</td><td><b class="${venda - custo < 0 ? 'neg' : 'okc'}">${brl(venda - custo)}</b></td>`
    : '<td colspan="3" class="cu-falta">falta preencher</td>'}</tr>`;
  const cab = (t) => `<tr><th>${t}</th><th>Custo</th><th>Venda</th><th>Lucro</th></tr>`;
  const base = custoBase();
  const tabela = (t, linhas) => `<div class="cartao"><div class="tbl"><table class="res">${cab(t)}${linhas}</table></div></div>`;
  let h = `<h2 class="cu-h2">Lucro por produto</h2>${p('Quanto custa, quanto você vende e quanto sobra de cada um.')}`;
  for (const t of tamanhos()) {
    const sabs = ctx.S.sabores.filter((s) => num(s.precos?.[t]) > 0);
    if (!sabs.length) continue;
    h += tabela(`Pizza ${esc(t)}`, sabs.map((s) => linha(s.nome, (base + recheioCusto(s.id)) * fator(t), num(s.precos[t]), base > 0 && recheioCusto(s.id) > 0)).join(''));
  }
  const bs = ctx.S.bordas.filter((b) => b.preco > 0);
  if (bs.length) h += tabela(`Borda${tamRef() ? ` (${esc(tamRef())})` : ''}`, bs.map((b) => linha(b.nome, bordaCusto(b.id), b.preco, bordaCusto(b.id) > 0)).join(''));
  if (ctx.S.adicionais.length) h += tabela('Adicional', ctx.S.adicionais.map((a) => linha(a.nome, adicCusto(a.id), a.preco, adicCusto(a.id) > 0)).join(''));
  const ps = produtosSimples();
  if (ps.length) h += tabela('Bebidas e outros', ps.map((b) => linha(b.nome, simplesCustoUn(b.id), b.preco, simplesCustoUn(b.id) > 0)).join(''));
  return h;
}

// ---------- Tabela de gramas ----------
const fmtQ = (v, u) => `${(Math.round(num(v) * 10) / 10).toLocaleString('pt-BR')} ${u}`;
function viewGramas() {
  const ts = tamanhos();
  if (!ts.includes(GRAMTAM)) GRAMTAM = tamRef();
  const f = fator(GRAMTAM);
  const B = CU.base.itens.filter((it) => num(it.usa) > 0);
  let h = `<h2 class="cu-h2">Tabela de gramas</h2>
  ${p('Quanto vai de cada coisa. A base é igual em toda pizza; o recheio divide na metade e no terço.')}
  ${ts.length > 1 ? `<div class="chips">${ts.map((t) => `<button type="button" class="chip ${t === GRAMTAM ? 'on' : ''}" data-cu="gramTam" data-v="${esc(t)}">Pizza ${esc(t)}</button>`).join('')}</div>` : ''}
  ${fatorDefinido(GRAMTAM) ? '' : `<div class="cu-aviso">⚠️ A proporção da pizza ${esc(GRAMTAM)} ainda não foi definida (Fichas → Base e tamanhos). Mostrando igual à ${esc(tamRef())}.</div>`}
  <div class="cartao"><b>Toda pizza${GRAMTAM ? ` ${esc(GRAMTAM)}` : ''} (qualquer sabor e fração)</b>
    <div class="tbl"><table class="res"><tr><th>Item</th><th>Quantidade</th></tr>
    <tr><td>Disco de massa</td><td>1 un</td></tr>${B.map((it) => `<tr><td>${esc(it.nome)}</td><td>${fmtQ(num(it.usa) * f, unUso(it))}</td></tr>`).join('')}</table></div></div>`;
  const sabs = ctx.S.sabores.filter((s) => (CU.sabores[s.id]?.itens || []).some((it) => num(it.usa) > 0));
  sabs.forEach((s) => {
    const its = CU.sabores[s.id].itens.filter((it) => num(it.usa) > 0);
    h += `<div class="cartao"><b>${esc(s.nome)}</b><div class="tbl"><table class="res"><tr><th>Recheio</th><th>Inteira</th><th>Metade ½</th><th>Terço ⅓</th></tr>
      ${its.map((it) => { const u = unUso(it), q = num(it.usa) * f; return `<tr><td>${esc(it.nome)}</td><td><b>${fmtQ(q, u)}</b></td><td>${fmtQ(q / 2, u)}</td><td>${fmtQ(q / 3, u)}</td></tr>`; }).join('')}
    </table></div></div>`;
  });
  const bors = ctx.S.bordas.filter((b) => (CU.bordas[b.id]?.itens || []).some((it) => num(it.usa) > 0));
  if (bors.length) {
    h += `<div class="cartao"><b>Bordas (por borda)</b><div class="tbl"><table class="res"><tr><th>Borda</th><th>Item</th><th>Quantidade</th></tr>
      ${bors.map((b) => CU.bordas[b.id].itens.filter((it) => num(it.usa) > 0).map((it) => `<tr><td>${esc(b.nome)}</td><td>${esc(it.nome)}</td><td>${fmtQ(num(it.usa) * f, unUso(it))}</td></tr>`).join('')).join('')}
    </table></div></div>`;
  }
  const faltam = ctx.S.sabores.length - sabs.length;
  if (faltam) h += p(`${faltam} sabor(es) ainda sem gramas preenchidas não aparecem aqui.`);
  return h;
}

// ---------- Balanço do dia ----------
const PALETA = [210, 140, 25, 285, 340, 180, 48, 0, 250, 95];
function corCliente(tel) {
  let h = 2166136261;
  for (const ch of String(tel || '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return PALETA[h % PALETA.length];
}
const iniciais = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
let BAL = { peds: null, salvos: null };
function ouvirBalanco() {
  unsubBal.splice(0).forEach((u) => u());
  BAL = { peds: null, salvos: null };
  const ini = Timestamp.fromDate(DIA);
  const fim = Timestamp.fromDate(new Date(DIA.getFullYear(), DIA.getMonth(), DIA.getDate() + 1));
  unsubBal.push(onSnapshot(query(collection(db, 'pedidos'), where('criadoEm', '>=', ini), where('criadoEm', '<', fim)), (s) => {
    BAL.peds = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderBalanco();
  }, ctx.tratarErro));
  unsubBal.push(onSnapshot(query(collection(db, 'custosPedidos'), where('data', '>=', ini), where('data', '<', fim)), (s) => {
    BAL.salvos = Object.fromEntries(s.docs.map((d) => [d.id, d.data()]));
    renderBalanco();
  }, ctx.tratarErro));
}
function renderBalanco() {
  const el = $('#cu-bal');
  if (!el || !BAL.peds || !BAL.salvos) return;
  const hoje = DIA.getTime() === inicioDia(new Date()).getTime();
  const ps = BAL.peds.filter((x) => x.status !== 'cancelado')
    .sort((a, b) => (U.toDate(a.criadoEm)?.getTime() || 0) - (U.toDate(b.criadoEm)?.getTime() || 0));
  let venda = 0, custo = 0, taxas = 0, avisos = 0, naHora = 0;
  const calcs = ps.map((x) => {
    const c = BAL.salvos[x.id] || calcPedido(x);
    if (!BAL.salvos[x.id]) naHora++;
    venda += c.venda; custo += c.custo; taxas += x.taxaEntrega || 0;
    avisos += c.linhas.filter((l) => l.aviso).length;
    return c;
  });
  let h = `<div class="daynav">
      <button type="button" class="btn btn-sec btn-peq" data-cu="dia" data-d="-1" aria-label="Dia anterior">◀</button>
      <b>${hoje ? 'Hoje · ' : ''}${U.DIAS_NOME[U.DIAS[DIA.getDay()]]}, ${U.fmtData(DIA)}</b>
      <button type="button" class="btn btn-sec btn-peq" data-cu="dia" data-d="1" ${hoje ? 'disabled' : ''} aria-label="Próximo dia">▶</button></div>
    <div class="cartao">
      ${linhaRes(`Vendido em produtos (${ps.length} pedido${ps.length === 1 ? '' : 's'})`, brl(venda))}
      ${linhaRes('💵 Dinheiro do <b>custo</b><small>separar para repor ingredientes e bebidas</small>', brl(custo))}
      ${destaque('💰 Dinheiro do <b>lucro</b>', brl(venda - custo))}
      ${taxas ? linhaRes('Taxas de entrega (à parte, fora do lucro)', brl(taxas), 'cu-sep') : ''}
    </div>
    ${avisos ? `<div class="cu-aviso">⚠️ ${avisos} item(ns) estão sem ficha preenchida, então o custo está incompleto (o lucro aparece maior do que é). Preencha nas Fichas e depois toque em “Recalcular”.</div>` : ''}
    ${naHora ? `<div class="cu-aviso cu-info">ℹ️ ${naHora} pedido(s) deste dia ainda não têm o custo gravado e estão sendo calculados com as fichas de agora. Toque em “Recalcular” para gravar.</div>` : ''}`;
  if (!ps.length) { el.innerHTML = `${h}<p class="vazio">Nenhum pedido neste dia.</p>`; return; }
  h += '<h2 class="cu-h2">Pedido por pedido</h2>';
  ps.forEach((x, i) => {
    const c = calcs[i];
    h += `<div class="cartao cli-card" style="--h:${corCliente(x.clienteTel)}">
      <div class="cli-head"><span class="cli-av">${esc(iniciais(x.clienteNome))}</span>
        <div><b class="cli-nm">${esc(x.clienteNome)}</b><small>Pedido ${U.numPedido(x.numero)} · ${U.fmtHoraMin(U.toDate(x.criadoEm))}</small></div></div>
      ${c.linhas.map((l) => `<div class="bal"><div>${l.qtd}x ${esc(l.desc)}</div>
        <small>custou <b>${brl(l.custo)}</b> · vendeu <b>${brl(l.venda)}</b> · lucro <b class="${l.venda - l.custo < 0 ? 'neg' : 'okc'}">${brl(l.venda - l.custo)}</b></small>
        ${l.aviso ? `<small class="warnc">⚠️ ${esc(l.aviso)}</small>` : ''}</div>`).join('')}
      <div class="tot"><b>Total do pedido</b>
        ${linhaRes('Custo', brl(c.custo))}${linhaRes('Venda', brl(c.venda))}
        ${linhaRes('<b>Lucro</b>', `<span class="${c.venda - c.custo < 0 ? 'neg' : 'okc'}" style="font-size:1.15rem">${brl(c.venda - c.custo)}</span>`)}
        ${x.taxaEntrega ? `${linhaRes('Taxa de entrega (fora do lucro)', brl(x.taxaEntrega))}${linhaRes('Cliente pagou no total', brl(x.total))}` : ''}
      </div></div>`;
  });
  el.innerHTML = `${h}<p style="text-align:right"><button type="button" class="btn btn-sec btn-peq" data-cu="recalcDia">🔄 Recalcular este dia com os preços atuais</button></p>`;
}
async function recalcularDia() {
  if (!BAL.peds) return;
  const b = writeBatch(db);
  BAL.peds.forEach((x) => b.set(doc(db, 'custosPedidos', x.id), { ...calcPedido(x), data: x.criadoEm, calculadoEm: serverTimestamp() }));
  try { await b.commit(); U.toast('Dia recalculado ✓'); } catch (e) { ctx.tratarErro(e); U.toast('Erro ao recalcular.', 'erro-t'); }
}

// ---------------------------------------------------------------------
//  Importar fichas do sistema antigo (backup .json)
// ---------------------------------------------------------------------
async function importarAntigo(arquivo) {
  let d;
  try { d = JSON.parse(await arquivo.text()); } catch { U.toast('Arquivo inválido.', 'erro-t'); return; }
  const c = d?.custos;
  if (!c || !c.massa) { U.toast('Esse arquivo não tem as fichas de custos.', 'erro-t'); return; }
  const porNome = (lista) => Object.fromEntries(lista.map((x) => [U.norm(x.nome).trim(), x.id]));
  const temAlgo = (g) => (g?.itens || []).some((it) => num(it.preco) > 0 || num(it.usa) > 0);
  const mapa = { sabores: porNome(ctx.S.sabores), bordas: porNome(ctx.S.bordas), simples: porNome(produtosSimples()) };
  const res = { ok: [], fora: [] };
  const novos = { sabores: {}, bordas: {}, simples: {} };
  for (const g of ['sabores', 'bordas']) {
    for (const [nome, v] of Object.entries(c[g] || {})) {
      if (!temAlgo(v)) continue;
      const id = mapa[g][U.norm(nome).trim()];
      if (id) { novos[g][id] = structuredClone(v); res.ok.push(nome); } else res.fora.push(nome);
    }
  }
  for (const [nome, v] of Object.entries(c.bebidas || {})) {
    if (!(num(v?.qtd) > 0)) continue;
    const id = mapa.simples[U.norm(nome).trim()];
    if (id) { novos.simples[id] = { qtd: v.qtd, preco: v.preco }; res.ok.push(nome); } else res.fora.push(nome);
  }
  const msg = `Importar do sistema antigo?\n\n• Massa e base: serão substituídas\n• ${res.ok.length} ficha(s) encontradas pelo nome${res.ok.length ? `: ${res.ok.join(', ')}` : ''}`
    + (res.fora.length ? `\n\n⚠️ Sem item com o mesmo nome no cardápio novo (não serão importadas): ${res.fora.join(', ')}` : '')
    + '\n\nO PIN não é copiado (continua o PIN atual).';
  if (!confirm(msg)) return;
  CU.massa = structuredClone(c.massa);
  if (c.base) CU.base = structuredClone(c.base);
  Object.assign(CU.sabores, novos.sabores);
  Object.assign(CU.bordas, novos.bordas);
  Object.assign(CU.simples, novos.simples);
  ultimaEdicao = Date.now();
  try {
    await setDoc(refFichas(), CU);
    U.toast('Fichas importadas ✓');
    if (res.fora.length) alert(`Importado! Itens que ficaram de fora (nome diferente no cardápio novo):\n\n${res.fora.join('\n')}\n\nVocê pode renomear no Cardápio e importar de novo, ou preencher à mão.`);
  } catch (e) { ctx.tratarErro(e); U.toast('Erro ao salvar.', 'erro-t'); }
  render();
}

// ---------------------------------------------------------------------
//  Eventos
// ---------------------------------------------------------------------
document.addEventListener('click', (e) => {
  const t = e.target.closest('#v-custos [data-cu]');
  if (!t) return;
  const a = t.dataset.cu;
  if (a === 'sair') { sairCustos(); ctx.mostrarView('pedidos'); return; }
  if (a === 'tab') { TAB = t.dataset.v; render(); return; }
  if (a === 'ficha') { FICHA = t.dataset.v; render(); return; }
  if (a === 'sabSel') { SABSEL = t.dataset.id; render(); return; }
  if (a === 'borSel') { BORSEL = t.dataset.id; render(); return; }
  if (a === 'adSel') { ADSEL = t.dataset.id; render(); return; }
  if (a === 'gramTam') { GRAMTAM = t.dataset.v; render(); return; }
  if (a === 'trocarPin') { formPin(false); return; }
  if (a === 'recalcDia') { recalcularDia(); return; }
  if (a === 'dia') {
    const d = new Date(DIA); d.setDate(d.getDate() + Number(t.dataset.d));
    const hoje = inicioDia(new Date());
    DIA = d > hoje ? hoje : inicioDia(d);
    render();
    return;
  }
  if (a === 'mAdd') {
    listaAtual().push(novoItem());
    salvar(); render();
    setTimeout(() => { const ins = document.querySelectorAll('[data-ci="m"][data-f="nome"]'); ins[ins.length - 1]?.focus(); }, 30);
    return;
  }
  if (a === 'mDel') {
    const L = listaAtual(), it = L[+t.dataset.i];
    if (!confirm(`Remover “${it.nome || 'ingrediente'}”?`)) return;
    L.splice(+t.dataset.i, 1); salvar(); render();
  }
});

function aoEditar(e) {
  const el = e.target.closest('#v-custos [data-ci]');
  if (!el) return;
  const ci = el.dataset.ci;
  if (ci === 'm') listaAtual()[+el.dataset.i][el.dataset.f] = el.value;
  else if (ci === 'rende') CU.massa.rende = el.value;
  else if (ci === 'simples') CU.simples[el.dataset.id] = { ...(CU.simples[el.dataset.id] || {}), [el.dataset.f]: el.value };
  else if (ci === 'fator') CU.tamanhos.fator[el.dataset.tam] = el.value;
  else if (ci === 'ref') { CU.tamanhos.ref = el.value; salvar(); render(); return; }
  salvar();
  refreshCalcs();
}
document.addEventListener('input', aoEditar);
document.addEventListener('change', (e) => {
  if (e.target.id === 'cu-importar' && e.target.files[0]) { importarAntigo(e.target.files[0]); e.target.value = ''; return; }
  if (e.target.matches('#v-custos select[data-ci]')) aoEditar(e);
});
