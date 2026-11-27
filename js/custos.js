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
  db, doc, setDoc, updateDoc, deleteField, FieldPath, onSnapshot, collection, query, where, writeBatch, Timestamp, serverTimestamp,
} from './firebase-config.js?v=32';
import * as U from './utils.js?v=32';
import * as N from './notas.js?v=32';

const { esc, fmtBRL: brl } = U;
const $ = (s, el = document) => el.querySelector(s);

let ctx;                     // { S, tratarErro, abrirModal, fecharModal }
let CU = normCU(null);       // fichas em memória
let carregado = false;
let aberto = false;
let TAB = 'balanco', FICHA = 'ingredientes';
let NOTA = null, NOTA_RES = null;   // nota fiscal em conferência / resultado da última aplicada
let SABSEL = '', BORSEL = '', ADSEL = '', GRAMTAM = '';
let DIA = inicioDia(new Date());
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
  // lista única de ingredientes: { id: { id, nome, base:'kg'|'L'|'un', preco (R$ por base), emb, hist:[{d,p,desc}], at } }
  c.ingredientes = c.ingredientes || {};
  c.apelidos = c.apelidos || {};          // o que a nota escreve → ingrediente (aprendido na conferência)
  c.lucroMinimo = c.lucroMinimo ?? '';
  if (migrar(c)) c._migrou = true;
  // a antiga caixinha "quantidade fixa" (v20–v24) vira quantidade própria na ½ e no ⅓
  const todas = [c.massa.itens, c.base.itens, ...['sabores', 'bordas', 'adicionais'].flatMap((g) => Object.values(c[g] || {}).map((x) => x.itens || []))];
  Object.values(c.sabores).forEach((x) => (x.itens || []).forEach((it) => { if (it.fixo) { it.meia = it.usa; it.terco = it.usa; } }));
  todas.forEach((L) => L.forEach((it) => { if ('fixo' in it) { delete it.fixo; c._migrou = true; } }));
  return c;
}
function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function r4(n) { return Math.round((Number(n) || 0) * 10000) / 10000; }
/**
 * Fichas antigas guardavam pacote + preço em cada linha. Agora cada linha só aponta
 * para um ingrediente da lista única ({ id, ing, usa }). Junta os de mesmo nome.
 */
function migrar(c) {
  let mudou = false;
  const porNome = {};
  Object.values(c.ingredientes).forEach((i) => { porNome[U.norm(i.nome).trim()] = i.id; });
  const listas = [c.massa.itens, c.base.itens, ...['sabores', 'bordas', 'adicionais'].flatMap((g) => Object.values(c[g] || {}).map((x) => x.itens || []))];
  const BASE = { kg: 'kg', g: 'kg', L: 'L', ml: 'L', un: 'un' };
  const CONV = { kg: 1, g: 0.001, L: 1, ml: 0.001, un: 1 };
  for (const L of listas) {
    for (let k = 0; k < L.length; k++) {
      const it = L[k];
      if (it.ing !== undefined) continue;
      mudou = true;
      const nome = String(it.nome || '').trim();
      if (!nome) { L[k] = { id: it.id || uid(), ing: '', usa: it.usa ?? '' }; continue; }
      const base = BASE[it.un] || 'kg';
      const emb = num(it.pacote) * (CONV[it.un] || 1);
      const preco = emb > 0 && num(it.preco) > 0 ? num(it.preco) / emb : 0;
      const chave = U.norm(nome).trim();
      let id = porNome[chave];
      if (!id) {
        id = uid();
        c.ingredientes[id] = { id, nome, base, preco: r4(preco), emb: r4(emb), hist: preco > 0 ? [{ d: hojeISO(), p: r4(preco), desc: 'fichas anteriores' }] : [], at: '' };
        porNome[chave] = id;
      } else if (!(num(c.ingredientes[id].preco) > 0) && preco > 0) {
        const ingx = c.ingredientes[id];
        Object.assign(ingx, { preco: r4(preco), emb: r4(emb) });
        if (!(ingx.hist || []).length) ingx.hist = [{ d: hojeISO(), p: r4(preco), desc: 'fichas anteriores' }];
      }
      L[k] = { id: it.id || uid(), ing: id, usa: it.usa ?? '' };
    }
  }
  return mudou;
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
/** Aceita "4,20", "4.20", 4.2 */
function num(v) {
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
function inicioDia(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

// Unidade do pacote → [unidade de uso, multiplicador]
const UN = { kg: ['g', 1000], g: ['g', 1], L: ['ml', 1000], ml: ['ml', 1], un: ['un', 1] };
// Unidade-base do ingrediente → [unidade em que a ficha diz "quanto vai", divisor]
const USO = { kg: ['g', 1000], L: ['ml', 1000], un: ['un', 1] };
const ingDe = (it) => (it && it.ing ? CU.ingredientes[it.ing] : null);
const nomeItem = (it) => ingDe(it)?.nome || it.nome || '?';
function unUso(it) {
  if (it.ing !== undefined) return (USO[ingDe(it)?.base] || USO.kg)[0];
  return (UN[it.un] || UN.un)[0];
}
/** custo do que vai na receita = preço do ingrediente (por kg/L/un) × quanto vai */
function custoItem(it) {
  if (it.ing !== undefined) {
    const ing = ingDe(it);
    return ing ? (num(ing.preco) * num(it.usa)) / (USO[ing.base] || USO.kg)[1] : 0;
  }
  const tam = num(it.pacote) * (UN[it.un] || UN.un)[1];
  return tam > 0 ? (num(it.preco) / tam) * num(it.usa) : 0;
}
const precoTexto = (ing) => (num(ing.preco) > 0 ? `${brl(ing.preco)}/${ing.base}` : 'sem preço');
const fmtD = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const fmtNum = (n) => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
function novoIngrediente(nome, base = 'kg', preco = 0) {
  const id = uid();
  CU.ingredientes[id] = { id, nome, base, preco: r4(preco), emb: 0, hist: preco > 0 ? [{ d: hojeISO(), p: r4(preco), desc: 'cadastro' }] : [], at: preco > 0 ? hojeISO() : '' };
  return id;
}
const listaIngredientes = () => Object.values(CU.ingredientes).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
const somaItens = (lista) => (lista || []).reduce((s, it) => s + custoItem(it), 0);
/**
 * Quanto vai de um ingrediente do recheio quando o sabor ocupa 1/n da pizza.
 * Normalmente divide (½ = metade, ⅓ = um terço). Se o Eduardo preencheu uma quantidade
 * própria para a metade (it.meia) ou o terço (it.terco) — ex.: Portuguesa: 3 ovos na
 * inteira, 2 na metade, 1 no terço — vale o que ele preencheu.
 */
const temFrac = (it) => it.meia !== undefined || it.terco !== undefined;
const preenchido = (v) => v !== undefined && String(v).trim() !== '';
function qtdFrac(it, n) {
  if (n === 2 && preenchido(it.meia)) return num(it.meia);
  if (n === 3 && preenchido(it.terco)) return num(it.terco);
  return num(it.usa) / (n || 1);
}
const recheioFrac = (id, n = 1) => (CU.sabores[id]?.itens || []).reduce((s, it) => s + custoItem({ ...it, usa: qtdFrac(it, n) }), 0);
const custoReceita = () => somaItens(CU.massa.itens);
const custoDisco = () => (num(CU.massa.rende) > 0 ? custoReceita() / num(CU.massa.rende) : 0);
/** base de toda pizza (tamanho de referência) = 1 disco + molho + mussarela… */
const custoBase = () => custoDisco() + somaItens(CU.base.itens);
const recheioCusto = (id) => somaItens(CU.sabores[id]?.itens);
const bordaCusto = (id) => somaItens(CU.bordas[id]?.itens);
const adicCusto = (id) => somaItens(CU.adicionais[id]?.itens);
/** Custos ajustados ao tamanho t; o recheio, à fração do sabor (n = 1 inteira, 2 meia, 3 terço) */
const baseT = (t) => custoBase() * fator(t);
const recheioT = (id, t, n = 1) => recheioFrac(id, n) * fator(t);
const bordaT = (id, t) => bordaCusto(id) * fator(t);
const pizzaT = (id, t) => baseT(t) + recheioT(id, t);
const temItens = (grupo, id) => (CU[grupo][id]?.itens || []).some((it) => custoItem(it) > 0);
function simplesCustoUn(id) {
  const b = CU.simples[id];
  return b && num(b.qtd) > 0 ? num(b.preco) / num(b.qtd) : 0;
}

// ---------- Tamanhos ----------
/** Tamanhos das pizzas LIGADAS no cardápio (desligadas não aparecem; se todas
 *  estiverem desligadas, mostra todas para as fichas não sumirem). */
function tamanhos() {
  const t = [];
  const pizzas = ctx.S.produtos.filter((p) => p.tipo === 'pizza' && p.tamanho);
  const ligadas = pizzas.filter((p) => p.disponivel !== false);
  [...(ligadas.length ? ligadas : pizzas)]
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
      const sabs = it.sabores || [];
      const n = sabs.length || 1;
      const rech = sabs.reduce((s, x) => s + recheioT(x.id, it.tamanho, n), 0);
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
        qtd: q, venda: (it.precoUnit - bordaV - adicV) * q, custo: (baseT(it.tamanho) + rech) * q, aviso,
      });
      if (it.borda) {
        const cb = bordaT(it.borda.id, it.tamanho);
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
// Salvamento seguro com o painel aberto em mais de um lugar (celular + notebook, duas abas):
//  - BASE é a última versão que veio da nuvem; CU é o que está na tela.
//  - Ao salvar, grava SÓ o que mudou em relação à BASE (cada bebida, ingrediente, sabor… separado),
//    com updateDoc — o que outro aparelho salvou em outra parte não é apagado.
//  - Quando chega uma versão nova da nuvem e ainda há alteração local não salva, as alterações
//    locais são reaplicadas por cima da versão nova (nada se perde dos dois lados).
//  - Se falhar (internet, login expirado), avisa na tela e tenta de novo sozinho.
const MAPAS = ['ingredientes', 'sabores', 'bordas', 'adicionais', 'simples', 'apelidos'];
const DEL = Symbol('apagar');
const copia = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
let BASE = null;                 // última versão da nuvem (null = documento ainda não existe)
let _t, agendado = false, emAndamento = 0, falhou = false, _retry;
/** Diferenças CU × BASE: [[chave, subchave|null, valor|DEL]] */
function diferencas(base, cu) {
  const ops = [];
  const b = base || {};
  const chaves = new Set([...Object.keys(b), ...Object.keys(cu)]);
  for (const k of chaves) {
    if (k.startsWith('_')) continue;
    if (MAPAS.includes(k) && cu[k] && typeof cu[k] === 'object' && b[k] && typeof b[k] === 'object') {
      for (const sub of new Set([...Object.keys(b[k]), ...Object.keys(cu[k])])) {
        if (!(sub in cu[k])) ops.push([k, sub, DEL]);
        else if (JSON.stringify(cu[k][sub]) !== JSON.stringify(b[k][sub])) ops.push([k, sub, copia(cu[k][sub])]);
      }
    } else if (!(k in cu)) ops.push([k, null, DEL]);
    else if (JSON.stringify(cu[k]) !== JSON.stringify(b[k])) ops.push([k, null, copia(cu[k])]);
  }
  return ops;
}
function aplicar(obj, ops) {
  for (const [k, sub, v] of ops) {
    if (sub === null) { if (v === DEL) delete obj[k]; else obj[k] = copia(v); continue; }
    if (!obj[k] || typeof obj[k] !== 'object') obj[k] = {};
    if (v === DEL) delete obj[k][sub]; else obj[k][sub] = copia(v);
  }
  return obj;
}
function statusSalvo() {
  const el = document.getElementById('cu-salvo');
  if (!el) return;
  const pend = agendado || emAndamento > 0;
  el.className = `cu-salvo ${falhou ? 'erro' : pend ? 'salvando' : 'ok'}`;
  el.textContent = falhou ? '⚠️ Não salvou — tentando de novo…' : pend ? '💾 Salvando…' : '✓ Tudo salvo';
}
async function gravar() {
  clearTimeout(_t);
  agendado = false;
  const ops = diferencas(BASE, CU);
  if (!ops.length && BASE) { statusSalvo(); return; }
  emAndamento++;
  statusSalvo();
  try {
    if (!BASE) {
      await setDoc(refFichas(), copia(CU));
    } else {
      const args = ops.flatMap(([k, sub, v]) => [sub === null ? new FieldPath(k) : new FieldPath(k, sub), v === DEL ? deleteField() : v]);
      await updateDoc(refFichas(), ...args);
    }
    BASE = aplicar(BASE ? copia(BASE) : {}, ops.length ? ops : diferencas({}, CU));
    falhou = false;
    clearTimeout(_retry);
  } catch (e) {
    console.error('Erro ao salvar custos', e);
    falhou = true;
    ctx.tratarErro(e);
    U.toast('⚠️ Não foi possível salvar os custos. Tentando de novo…', 'erro-t');
    clearTimeout(_retry);
    _retry = setTimeout(() => { if (falhou) gravar(); }, 8000);
  } finally {
    emAndamento--;
    statusSalvo();
  }
}
function salvar() {
  agendado = true;
  clearTimeout(_t);
  _t = setTimeout(gravar, 700);
  statusSalvo();
}

/** Grava já (sem esperar) — usado ao aplicar uma nota fiscal, PIN e importação */
function salvarAgora() {
  return gravar();
}
// avisa antes de fechar a página se ainda tem alteração não salva
window.addEventListener('beforeunload', (e) => {
  if (agendado || emAndamento > 0 || falhou) { gravar(); e.preventDefault(); e.returnValue = ''; }
});

export function iniciarCustos(c) {
  ctx = c;
  pararCustos();
  unsubs.push(onSnapshot(refFichas(), (s) => {
    if (s.metadata.hasPendingWrites) return;   // eco do que este aparelho acabou de gravar
    const nuvem = s.exists() ? copia(s.data()) : null;
    // alterações deste aparelho ainda não confirmadas: reaplica por cima da versão nova da nuvem
    const locais = carregado ? diferencas(BASE, CU) : [];
    BASE = nuvem;
    CU = normCU(nuvem ? aplicar(copia(nuvem), locais) : null);
    carregado = true;
    const migrou = CU._migrou;
    delete CU._migrou;
    if (migrou || diferencas(BASE, CU).length) salvar();
    statusSalvo();
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
    try {
      await salvarAgora();
      if (falhou) throw new Error('não salvou');
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
const ABAS = [['balanco', '📒', 'Balanço'], ['nota', '📥', 'Nota fiscal'], ['fichas', '📋', 'Fichas'], ['lucro', '💲', 'Lucro'], ['gramas', '⚖️', 'Gramas']];
const FICHAS = [['ingredientes', '🧾 Ingredientes'], ['massa', 'Massa'], ['base', 'Base e tamanhos'], ['sabores', 'Sabores'], ['bordas', 'Bordas'], ['adicionais', 'Adicionais'], ['simples', 'Bebidas e outros']];

function render() {
  if (!aberto) return;
  if (TAB !== 'balanco') unsubBal.splice(0).forEach((u) => u());
  const el = $('#v-custos');
  el.innerHTML = `
    <div class="view-topo"><h1>🔒 Custos e lucro</h1><span id="cu-salvo" class="cu-salvo"></span>
      <button type="button" class="btn btn-sec btn-peq" data-cu="sair">↩️ Sair da área</button></div>
    <div class="subabas">${ABAS.map(([k, i, t]) => `<button type="button" data-cu="tab" data-v="${k}" class="${TAB === k ? 'ativo' : ''}">${i} ${t}</button>`).join('')}</div>
    ${TAB === 'fichas' ? `<div class="subabas cu-fichas">${FICHAS.map(([k, t]) => `<button type="button" data-cu="ficha" data-v="${k}" class="${FICHA === k ? 'ativo' : ''}">${t}</button>`).join('')}</div>` : ''}
    <div id="cu-corpo">${corpo()}</div>`;
  if (TAB === 'balanco') ouvirBalanco();
  statusSalvo();
}
function corpo() {
  if (TAB === 'lucro') return viewLucro();
  if (TAB === 'gramas') return viewGramas();
  if (TAB === 'nota') return viewNota();
  if (TAB === 'balanco') return '<div id="cu-bal"><span class="sk sk-card"></span></div>';
  return { ingredientes: viewIngredientes, massa: viewMassa, base: viewBase, sabores: viewSabores, bordas: viewBordas, adicionais: viewAdicionais, simples: viewSimples }[FICHA]();
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
function opcoesIng(sel) {
  return `<option value="">Escolha o ingrediente…</option>${listaIngredientes().map((i) => `<option value="${esc(i.id)}" ${i.id === sel ? 'selected' : ''}>${esc(i.nome)}</option>`).join('')}<option value="__novo">➕ Novo ingrediente…</option>`;
}
const fmtIn = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
/** Linha extra só nos Sabores: quantidade própria na metade e no terço (ex.: ovos da Portuguesa) */
function fracHTML(it, i) {
  if (!temFrac(it)) return `<div class="m-fx"><button type="button" class="link" data-cu="frAbrir" data-i="${i}">✏️ Quantidade diferente na metade e no terço</button></div>`;
  const u = unUso(it);
  const campo = (f, rot, auto) => `<label class="m-frc"><span>${rot}</span><div class="inl"><input class="input" inputmode="decimal" data-ci="m" data-i="${i}" data-f="${f}" value="${esc(it[f] ?? '')}" placeholder="${fmtIn(auto)}"><span class="u">${u}</span></div></label>`;
  return `<div class="m-fx m-fr">${campo('meia', 'Na metade (½)', num(it.usa) / 2)}${campo('terco', 'No terço (⅓)', num(it.usa) / 3)}
    <button type="button" class="link link-discreto" data-cu="frTirar" data-i="${i}">↩︎ voltar a dividir sozinho</button></div>`;
}
function tabelaItens(lista, rotuloUso) {
  const comFrac = FICHA === 'sabores';
  let h = `<div class="cartao"><div class="mrow ming head"><span>Ingrediente <small>(o preço vem de 🧾 Ingredientes)</small></span><span>${rotuloUso}</span><span class="num">Custo</span><span></span></div>`;
  if (!lista.length) h += '<p class="vazio" style="padding:16px">Nenhum ingrediente. Toque em “+ Ingrediente”.</p>';
  lista.forEach((it, i) => {
    const ing = ingDe(it);
    h += `<div class="mrow ming${comFrac ? ' fx' : ''}">
      <label class="m-nm"><span>Ingrediente</span><select class="input" data-ci="ing" data-i="${i}">${opcoesIng(it.ing)}</select>
        <small class="m-preco">${ing ? (num(ing.preco) > 0 ? precoTexto(ing) : '⚠️ sem preço — preencha em 🧾 Ingredientes') : ''}</small></label>
      <label class="m-us"><span>${rotuloUso}</span><div class="inl"><input class="input" inputmode="decimal" data-ci="m" data-i="${i}" data-f="usa" value="${esc(it.usa)}" placeholder="0"><span class="u" data-un="${i}">${unUso(it)}</span></div></label>
      <div class="m-ct" data-calc="${i}">${brl(custoItem(it))}</div>
      <button type="button" class="m-x btn-icone" data-cu="mDel" data-i="${i}" aria-label="Remover ingrediente">✕</button>
      ${comFrac ? fracHTML(it, i) : ''}
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
  ${p('Escolha cada ingrediente e diga quanto vai na receita. O preço vem da aba 🧾 Ingredientes (e da 📥 Nota fiscal) — a conta é feita sozinha.')}
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
  const nomes = CU.base.itens.map((it) => esc(nomeItem(it)).toLowerCase()).join(' + ');
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
    const c = pizzaT(SABSEL, t), v = num(sab.precos?.[t]);
    return `<tr><td>${esc(t)}${t === ref ? ' <small>(ref.)</small>' : ''}</td><td>${brl(c)}</td><td>${v ? brl(v) : '—'}</td><td>${v ? `<b class="${v - c < 0 ? 'neg' : 'okc'}">${brl(v - c)}</b>` : '—'}</td></tr>`;
  }).join('');
  return `<div class="cartao">
    ${linhaRes('Base (disco + molho + mussarela)', brl(base))}
    ${linhaRes(`Recheio de ${esc(sab.nome)}`, brl(rech))}
    ${destaque(`Custo da <b>pizza inteira</b>${ref ? ` ${esc(ref)}` : ''}`, brl(base + rech))}
    ${linhasTam ? `<div class="tbl"><table class="res"><tr><th>Tamanho</th><th>Custo</th><th>Venda</th><th>Lucro</th></tr>${linhasTam}</table></div>` : ''}
  </div>
  <div class="cartao"><b>Nas frações</b> <small style="color:var(--texto-2)">(o recheio é dividido, a base fica inteira${(CU.sabores[SABSEL]?.itens || []).some(temFrac) ? '; os ingredientes com quantidade própria usam o que você preencheu' : ''})</small>
    ${linhaRes(`Metade (½) de ${esc(sab.nome)}`, brl(recheioT(SABSEL, ref, 2)))}
    ${linhaRes(`Um terço (⅓) de ${esc(sab.nome)}`, brl(recheioT(SABSEL, ref, 3)))}</div>`;
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
    ${tamanhos().length > 1 ? p('Nos outros tamanhos, o custo da borda segue a proporção definida em “Base e tamanhos” (menos o que tem quantidade fixa).') : ''}</div>`;
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
  if (TAB !== 'fichas' || FICHA === 'ingredientes') return;
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

// ---------- 🧾 Ingredientes (lista única) ----------
function usosDoIngrediente(id) {
  const usa = (lista) => (lista || []).some((it) => it.ing === id);
  const nomes = [];
  if (usa(CU.massa.itens)) nomes.push('Massa');
  if (usa(CU.base.itens)) nomes.push('Base');
  ctx.S.sabores.forEach((x) => { if (usa(CU.sabores[x.id]?.itens)) nomes.push(x.nome); });
  ctx.S.bordas.forEach((x) => { if (usa(CU.bordas[x.id]?.itens)) nomes.push(`borda ${x.nome}`); });
  ctx.S.adicionais.forEach((x) => { if (usa(CU.adicionais[x.id]?.itens)) nomes.push(x.nome); });
  return nomes;
}
/** variação entre as duas últimas compras: "🔺 +10,0%" */
function variacao(hist) {
  const h = hist || [];
  if (h.length < 2) return '';
  const a = num(h[h.length - 2].p), b = num(h[h.length - 1].p);
  if (!(a > 0)) return '';
  const pct = ((b - a) / a) * 100;
  if (Math.abs(pct) < 0.5) return '= mesmo preço';
  return `${pct > 0 ? '🔺 +' : '🔻 '}${pct.toFixed(1).replace('.', ',')}%`;
}
const BASES = { kg: 'kg (por peso)', L: 'L (líquido)', un: 'un (por unidade)' };
function viewIngredientes() {
  const ings = listaIngredientes();
  return `<h2 class="cu-h2">🧾 Ingredientes</h2>
  ${p('Cada ingrediente aparece <b>uma vez só</b>, com o preço por kg, litro ou unidade. As fichas (massa, base, sabores, bordas) usam esses preços: mudou aqui, <b>todas as pizzas se recalculam</b>. O jeito mais fácil de atualizar é pela aba <b>📥 Nota fiscal</b>.')}
  <div class="lista-toolbar"><button type="button" class="btn btn-primario btn-peq" data-cu="ingNovo">+ Novo ingrediente</button></div>
  ${ings.length ? ings.map((ing) => {
    const usos = usosDoIngrediente(ing.id);
    const hist = [...(ing.hist || [])].reverse();
    const v = variacao(ing.hist);
    return `<div class="cartao ing-card${num(ing.preco) > 0 ? '' : ' ing-sem'}">
      <div class="ing-linha">
        <label class="campo ing-nome"><span>Nome</span><input class="input" data-ci="ingNome" data-id="${esc(ing.id)}" value="${esc(ing.nome)}" maxlength="40"></label>
        <label class="campo ing-preco"><span>Preço (R$ por ${ing.base})</span><input class="input" inputmode="decimal" data-ci="ingPreco" data-id="${esc(ing.id)}" value="${num(ing.preco) > 0 ? String(U.round2(ing.preco)).replace('.', ',') : ''}" placeholder="0,00"></label>
        <label class="campo ing-base"><span>Unidade</span><select class="input" data-ci="ingBase" data-id="${esc(ing.id)}">${Object.entries(BASES).map(([k, t]) => `<option value="${k}" ${ing.base === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      </div>
      <small class="ing-info">${ing.at ? `Última compra: <b>${fmtD(ing.at)}</b>` : 'Sem compra registrada'}${v ? ` · <b class="${v.startsWith('🔺') ? 'neg' : 'okc'}">${v}</b>` : ''} · ${usos.length ? `usado em: ${esc(usos.join(', '))}` : '<i>não usado em nenhuma ficha</i>'}</small>
      ${hist.length ? `<details class="ing-hist"><summary>📈 Histórico de preços (${hist.length})</summary>
        <div class="tbl"><table class="res"><tr><th>Data</th><th>Preço</th><th>Produto</th><th></th></tr>
        ${hist.map((x, k) => `<tr><td>${fmtD(x.d)}</td><td>${brl(x.p)}/${ing.base}</td><td>${esc(x.desc || '')}</td><td><button type="button" class="hist-x" data-cu="histDel" data-id="${esc(ing.id)}" data-k="${hist.length - 1 - k}" title="Apagar este preço (lançado errado)" aria-label="Apagar este preço">✕</button></td></tr>`).join('')}</table></div>
        <small class="cu-dica">Lançou errado? Toque no ✕. Se for o último preço, o ingrediente volta para o preço anterior.</small></details>` : ''}
      ${usos.length ? '' : `<button type="button" class="link link-perigo" data-cu="ingDel" data-id="${esc(ing.id)}">Excluir ingrediente</button>`}
    </div>`;
  }).join('') : `<div class="cartao">${p('Nenhum ingrediente ainda. Toque em “+ Novo ingrediente” ou atualize pela 📥 Nota fiscal.')}</div>`}`;
}
function formNovoIngrediente(aoCriar) {
  ctx.abrirModal('Novo ingrediente', `
    <form id="cu-fing" novalidate>
      <label class="campo"><span>Nome (genérico, sem marca)</span><input class="input" id="cu-ing-nome" placeholder="Ex.: Calabresa" maxlength="40"></label>
      <label class="campo"><span>Como você compra</span><select class="input" id="cu-ing-base">
        <option value="kg">Por peso (preço por kg)</option><option value="L">Líquido (preço por litro)</option><option value="un">Por unidade (preço por unidade)</option></select></label>
      <label class="campo"><span>Preço (opcional)</span><input class="input" id="cu-ing-preco" inputmode="decimal" placeholder="Ex.: 24,99"></label>
      <p class="erro" id="cu-ing-erro"></p>
    </form>`,
  `<button type="button" class="btn btn-sec" data-fechar>Cancelar</button>
   <button type="submit" form="cu-fing" class="btn btn-primario">Criar</button>`);
  setTimeout(() => $('#cu-ing-nome')?.focus(), 50);
  $('#cu-fing').addEventListener('submit', (e) => {
    e.preventDefault();
    const nome = $('#cu-ing-nome').value.trim();
    if (!nome) { $('#cu-ing-erro').textContent = 'Informe o nome.'; return; }
    if (Object.values(CU.ingredientes).some((i) => U.norm(i.nome).trim() === U.norm(nome))) { $('#cu-ing-erro').textContent = 'Já existe um ingrediente com esse nome.'; return; }
    const id = novoIngrediente(nome, $('#cu-ing-base').value, num($('#cu-ing-preco').value));
    aoCriar?.(id);
    salvar();
    ctx.fecharModal();
    render();
  });
}

// ---------- 📥 Nota fiscal ----------
const unDestino = (o) => (o.destino.startsWith('ing:') ? CU.ingredientes[o.destino.slice(4)]?.base || 'kg' : o.destino === 'novo' ? o.novoBase : 'un');
/** Recalcula quanto foi comprado (na unidade do destino) quando o destino muda */
function calcQtdLinha(o) {
  o.q = 0; o.certo = true;
  if (o.destino.startsWith('ing:')) {
    const ing = CU.ingredientes[o.destino.slice(4)];
    if (ing) Object.assign(o, N.qtdNaBase(o, ing.base, num(ing.emb)));
  } else if (o.destino === 'novo') {
    Object.assign(o, N.qtdNaBase(o, o.novoBase));
  } else if (o.destino.startsWith('simples:')) {
    const prev = CU.simples[o.destino.slice(8)];
    const porPacote = o.porPacote || num(prev?.qtd) || 0;
    o.q = o.uq === 'un' ? o.qtd * (porPacote || 1) : o.qtd;
    o.certo = !!porPacote || o.uq !== 'un';
  }
  o.q = r4(o.q);
  // digita na unidade da nota: 900 ml (não 0,9 L), 500 g (não 0,5 kg)
  const b = unDestino(o);
  const pequena = o.uq === 'g' || o.uq === 'ml' || o.tam?.u === 'g' || o.tam?.u === 'ml';
  o.qUn = b === 'kg' ? (pequena ? 'g' : 'kg') : b === 'L' ? (pequena ? 'ml' : 'L') : 'un';
}
const FATOR_UN = { kg: 1, g: 0.001, L: 1, ml: 0.001, un: 1 };
const UNIDADES_QTD = { kg: ['kg', 'g'], L: ['L', 'ml'], un: ['un'] };
/** quantidade na unidade escolhida (ex.: 0,9 L → 900 ml) */
const qtdMostrada = (o) => r4(num(o.q) / (FATOR_UN[o.qUn] || 1));
function precoAntes(o) {
  if (o.destino.startsWith('ing:')) return num(CU.ingredientes[o.destino.slice(4)]?.preco);
  if (o.destino.startsWith('simples:')) return simplesCustoUn(o.destino.slice(8));
  return 0;
}
function resLinha(o) {
  if (!(num(o.q) > 0)) return '<span class="warnc">⚠️ Informe quanto foi comprado</span>';
  const pu = num(o.total) / num(o.q);
  const ant = precoAntes(o);
  let comp = ' · primeiro preço';
  if (ant > 0) {
    const pct = ((pu - ant) / ant) * 100;
    comp = ` · antes ${brl(ant)} ${Math.abs(pct) < 0.5 ? '(igual)' : `<b class="${pct > 0 ? 'neg' : 'okc'}">${pct > 0 ? '🔺 +' : '🔻 '}${pct.toFixed(1).replace('.', ',')}%</b>`}`;
  }
  // variação muito grande costuma ser quantidade na unidade errada (900 "L" em vez de 900 ml)
  const estranho = ant > 0 && (pu < ant * 0.3 || pu > ant * 3);
  const conta = o.qUn && o.qUn !== unDestino(o) ? ` <small>(${brl(o.total)} por ${fmtNum(qtdMostrada(o))} ${o.qUn})</small>` : '';
  return `= <b>${brl(pu)}/${unDestino(o)}</b>${conta}${comp}${o.certo ? '' : ' <span class="warnc">· confira a quantidade</span>'}${estranho ? '<br><b class="neg">⚠️ Variação muito grande — confira a quantidade e a unidade (ml/L, g/kg).</b>' : ''}`;
}
function lerNotaColada() {
  const texto = $('#cu-nota-texto')?.value || '';
  const lida = N.lerNota(texto);
  if (!lida.linhas.length) { U.toast('Não encontrei itens. Confira se o texto está no formato do pedido para a IA.', 'erro-t'); return; }
  const ings = listaIngredientes();
  const simples = produtosSimples();
  NOTA = {
    data: lida.data || hojeISO(),
    linhas: lida.linhas.map((l) => {
      const sug = N.sugerir(l.desc, ings, simples, CU.apelidos);
      const o = { ...l, destino: sug.destino, certeza: sug.certeza, novoNome: N.nomeSugerido(l.desc), novoBase: N.baseDaLinha(l) };
      calcQtdLinha(o);
      return o;
    }),
  };
  NOTA_RES = null;
  render();
}
function opcoesDestino(o) {
  const ings = listaIngredientes();
  const simples = produtosSimples();
  const op = (v, t) => `<option value="${esc(v)}" ${o.destino === v ? 'selected' : ''}>${t}</option>`;
  return `${op('', '— escolha —')}
    <optgroup label="Ingredientes">${ings.map((i) => op(`ing:${i.id}`, esc(i.nome))).join('')}</optgroup>
    ${simples.length ? `<optgroup label="Bebidas e outros (cardápio)">${simples.map((x) => op(`simples:${x.id}`, esc(x.nome))).join('')}</optgroup>` : ''}
    ${op('novo', '➕ Novo ingrediente')}
    ${op('ignorar', '🚫 Ignorar (não entra no custo)')}`;
}
function linhaNotaHTML(o, i) {
  const selo = o.certeza === 'aprendido' ? '<span class="tag tag-recorrente">✓ já conhecido</span>'
    : o.destino ? '<span class="tag tag-novo">sugestão — confira</span>' : '<span class="tag tag-sumido">escolha</span>';
  const ativo = o.destino && o.destino !== 'ignorar';
  return `<div class="cartao nota-linha${o.destino ? '' : ' pendente'}${o.destino === 'ignorar' ? ' ignorada' : ''}" id="nl-${i}">
    <div class="nl-topo"><b>${esc(o.desc)}</b>${selo}</div>
    <small class="nl-orig">${fmtNum(o.qtd)}${o.uq !== 'un' ? ` ${o.uq}` : ''} × ${brl(o.preco)} = ${brl(o.total)}</small>
    <label class="campo"><span>É qual ingrediente?</span><select class="input" data-nl="${i}" data-campo="destino">${opcoesDestino(o)}</select></label>
    ${o.destino === 'novo' ? `<div class="linha-campos">
      <label class="campo"><span>Nome do novo ingrediente</span><input class="input" data-nl="${i}" data-campo="novoNome" value="${esc(o.novoNome)}" maxlength="40"></label>
      <label class="campo"><span>Unidade</span><select class="input" data-nl="${i}" data-campo="novoBase">${Object.entries(BASES).map(([k, t]) => `<option value="${k}" ${o.novoBase === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>` : ''}
    ${ativo ? `<div class="linha-campos">
      <label class="campo"><span>Quantidade comprada</span><div class="inl">
        <input class="input${o.certo ? '' : ' conferir'}" inputmode="decimal" data-nl="${i}" data-campo="q" value="${o.q > 0 ? String(qtdMostrada(o)).replace('.', ',') : ''}" placeholder="${o.qUn === 'un' ? 'Ex.: 25' : o.qUn === 'ml' ? 'Ex.: 900' : 'Ex.: 2'}">
        ${(UNIDADES_QTD[unDestino(o)] || ['un']).length > 1 ? `<select class="input qtd-un" data-nl="${i}" data-campo="qUn" aria-label="Unidade da quantidade">${UNIDADES_QTD[unDestino(o)].map((u) => `<option value="${u}" ${o.qUn === u ? 'selected' : ''}>${u}</option>`).join('')}</select>` : `<span class="u">${o.qUn || 'un'}</span>`}
      </div></label>
      <label class="campo"><span>Total pago (R$)</span><input class="input" inputmode="decimal" data-nl="${i}" data-campo="total" value="${String(o.total).replace('.', ',')}"></label></div>
      <div class="nl-res" id="nlres-${i}">${resLinha(o)}</div>` : ''}
  </div>`;
}
function viewNota() {
  if (NOTA_RES) return viewNotaResultado();
  if (!NOTA) {
    return `<h2 class="cu-h2">📥 Atualizar preços pela nota fiscal</h2>
    <div class="cartao">
      <b>1. No app do Claude</b> ${p('Mande a foto do cupom fiscal junto com este pedido (toque para copiar):')}
      <button type="button" class="btn btn-sec btn-peq" data-cu="copiarPrompt">📋 Copiar pedido para a IA</button>
      <details class="prompt-ia"><summary>Ver o pedido</summary><pre>${esc(N.PROMPT_IA)}</pre></details>
    </div>
    <div class="cartao">
      <b>2. Cole aqui o resumo que a IA devolver</b>
      <textarea class="input nota-texto" id="cu-nota-texto" rows="9" placeholder="Compra de 15/11/2026&#10;* Queijo mussarela Morro Alto: 4,154 kg × 36,99 = 153,66&#10;* Farinha de trigo Finna 1 kg: 4 × 4,59 = 18,36&#10;…"></textarea>
      <button type="button" class="btn btn-primario btn-bloco" data-cu="lerNota" style="margin-top:10px">Ler nota</button>
    </div>
    ${p('Depois você confere linha por linha antes de aplicar. Marcas diferentes (Aurora, Perdigão…) vão para o mesmo ingrediente.')}`;
  }
  const soma = NOTA.linhas.reduce((t, o) => t + num(o.total), 0);
  const pend = NOTA.linhas.filter((o) => !o.destino).length;
  return `<h2 class="cu-h2">📥 Confira a nota antes de aplicar</h2>
  <div class="cartao nota-resumo">
    <label class="campo" style="margin:0"><span>Data da compra</span><input type="date" class="input" data-nl="data" data-campo="data" value="${esc(NOTA.data)}" style="max-width:200px"></label>
    <div><b>${NOTA.linhas.length}</b> itens · soma <b>${brl(soma)}</b>${pend ? ` · <span class="warnc">${pend} sem destino</span>` : ''}</div>
  </div>
  ${NOTA.linhas.map(linhaNotaHTML).join('')}
  <div class="nota-acoes">
    <button type="button" class="btn btn-sec" data-cu="notaCancelar">Cancelar</button>
    <button type="button" class="btn btn-primario" data-cu="notaAplicar">✅ Aplicar preços</button>
  </div>`;
}
function notaMudou(el, mudouSelect) {
  if (!NOTA) return;
  const campo = el.dataset.campo;
  if (campo === 'data') { NOTA.data = el.value || hojeISO(); return; }
  const i = +el.dataset.nl;
  const o = NOTA.linhas[i];
  if (!o) return;
  if (campo === 'destino') {
    if (!mudouSelect) return;
    o.destino = el.value; o.certeza = '';
    calcQtdLinha(o);
  } else if (campo === 'novoBase') {
    if (!mudouSelect) return;
    o.novoBase = el.value;
    calcQtdLinha(o);
  } else if (campo === 'novoNome') { o.novoNome = el.value; return; }
  else if (campo === 'q') { o.q = r4(num(el.value) * (FATOR_UN[o.qUn] || 1)); o.certo = true; el.classList.remove('conferir'); }
  else if (campo === 'qUn') {
    if (!mudouSelect) return;
    // mantém o número digitado e muda só a unidade (digitou 900 e escolheu ml → 900 ml)
    const campoQ = document.querySelector(`[data-nl="${i}"][data-campo="q"]`);
    o.qUn = el.value;
    o.q = r4(num(campoQ?.value) * (FATOR_UN[o.qUn] || 1));
    const r = document.getElementById(`nlres-${i}`); if (r) r.innerHTML = resLinha(o);
    return;
  }
  else if (campo === 'total') { o.total = num(el.value); }
  if (campo === 'q' || campo === 'total') { const r = document.getElementById(`nlres-${i}`); if (r) r.innerHTML = resLinha(o); return; }
  const card = document.getElementById(`nl-${i}`);
  if (card) card.outerHTML = linhaNotaHTML(o, i);
}
/** Custos e lucros (tamanho de referência) para comparar antes × depois */
function fotografiaCustos() {
  const ref = tamRef(), f = {};
  ctx.S.sabores.forEach((x) => {
    const venda = num(x.precos?.[ref]);
    if (venda > 0) f[`s:${x.id}`] = { nome: `Pizza ${x.nome}`, custo: pizzaT(x.id, ref), venda, pizza: true };
  });
  ctx.S.bordas.filter((b) => b.preco > 0).forEach((b) => { f[`b:${b.id}`] = { nome: `Borda ${b.nome}`, custo: bordaCusto(b.id), venda: b.preco }; });
  ctx.S.adicionais.forEach((a) => { f[`a:${a.id}`] = { nome: a.nome, custo: adicCusto(a.id), venda: a.preco }; });
  produtosSimples().forEach((x) => { f[`p:${x.id}`] = { nome: x.nome, custo: simplesCustoUn(x.id), venda: x.preco }; });
  return f;
}
function aplicarNota() {
  if (!NOTA) return;
  const sem = NOTA.linhas.findIndex((o) => !o.destino);
  if (sem >= 0) { U.toast('Escolha o destino de todas as linhas (ou “Ignorar”).', 'erro-t'); document.getElementById(`nl-${sem}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  const ruim = NOTA.linhas.findIndex((o) => o.destino !== 'ignorar' && !(num(o.q) > 0 && num(o.total) > 0));
  if (ruim >= 0) { U.toast('Informe a quantidade comprada e o total da linha marcada.', 'erro-t'); document.getElementById(`nl-${ruim}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  const novoSemNome = NOTA.linhas.findIndex((o) => o.destino === 'novo' && !String(o.novoNome || '').trim());
  if (novoSemNome >= 0) { U.toast('Dê um nome ao ingrediente novo.', 'erro-t'); return; }

  const antes = fotografiaCustos();
  const grupos = {};
  for (const o of NOTA.linhas) {
    const sig = N.assinatura(o.desc);
    if (o.destino === 'ignorar') { if (sig) CU.apelidos[sig] = 'ignorar'; continue; }
    let dest = o.destino;
    if (dest === 'novo') {
      const chave = U.norm(o.novoNome).trim();
      const existe = Object.values(CU.ingredientes).find((i) => U.norm(i.nome).trim() === chave);
      dest = `ing:${existe ? existe.id : novoIngrediente(o.novoNome.trim(), o.novoBase)}`;
    }
    if (sig) CU.apelidos[sig] = dest;   // aprende para a próxima nota
    const g = (grupos[dest] ||= { q: 0, total: 0, descs: [], linhas: [] });
    g.q += num(o.q); g.total += num(o.total); g.descs.push(o.desc); g.linhas.push(o);
  }
  const mudancas = [];
  for (const [dest, g] of Object.entries(grupos)) {
    const pu = g.total / g.q;
    const desc = g.descs.join(' + ');
    if (dest.startsWith('ing:')) {
      const ing = CU.ingredientes[dest.slice(4)];
      const ant = num(ing.preco);
      ing.preco = r4(pu);
      ing.at = NOTA.data;
      ing.hist = [...(ing.hist || []), { d: NOTA.data, p: r4(pu), desc }].slice(-40);
      const l0 = g.linhas[0];
      if (l0.uq === 'un' && l0.qtd > 0) ing.emb = r4(num(l0.q) / l0.qtd); // aprende o tamanho da embalagem
      mudancas.push({ nome: ing.nome, un: ing.base, antes: ant, depois: pu, id: ing.id });
    } else if (dest.startsWith('simples:')) {
      const pid = dest.slice(8);
      const prev = CU.simples[pid] || {};
      const ant = simplesCustoUn(pid);
      const l0 = g.linhas[0];
      const porPacote = l0.qtd > 0 ? num(l0.q) / l0.qtd : g.q;
      CU.simples[pid] = { ...prev, qtd: r4(porPacote), preco: U.round2(g.total / (g.q / porPacote)), at: NOTA.data, hist: [...(prev.hist || []), { d: NOTA.data, p: r4(pu), desc }].slice(-40) };
      mudancas.push({ nome: produtosSimples().find((x) => x.id === pid)?.nome || 'Produto', un: 'un', antes: ant, depois: pu });
    }
  }
  salvarAgora();
  const depois = fotografiaCustos();
  const impacto = Object.keys(depois).map((k) => ({ ...depois[k], custoAntes: antes[k]?.custo ?? 0 }))
    .filter((x) => Math.abs(x.custo - x.custoAntes) >= 0.005)
    .sort((a, b) => (b.custo - b.custoAntes) - (a.custo - a.custoAntes));
  NOTA_RES = { data: NOTA.data, mudancas, impacto };
  NOTA = null;
  U.toast(`${mudancas.length} preço(s) atualizado(s) ✓`);
  render();
  window.scrollTo({ top: 0 });
}
function viewNotaResultado() {
  const R = NOTA_RES;
  const min = num(CU.lucroMinimo);
  const pct = (a, b) => (a > 0 ? `${b >= a ? '🔺 +' : '🔻 '}${(((b - a) / a) * 100).toFixed(1).replace('.', ',')}%` : 'novo');
  const baixas = R.impacto.filter((x) => x.pizza && min > 0 && x.venda - x.custo < min);
  const embs = R.mudancas.filter((m) => m.id && /embalag|caixa/i.test(m.nome) && !usosDoIngrediente(m.id).length);
  return `<h2 class="cu-h2">✅ Preços atualizados — compra de ${fmtD(R.data)}</h2>
  ${baixas.length ? `<div class="cu-aviso">⚠️ ${baixas.length} pizza(s) com lucro abaixo de ${brl(min)}: <b>${baixas.map((x) => esc(x.nome)).join(', ')}</b></div>` : ''}
  ${min > 0 ? '' : p('Dica: defina na aba 💲 Lucro o lucro mínimo por pizza para receber alertas aqui.')}
  ${embs.map((m) => `<div class="cu-aviso cu-info">📦 <b>${esc(m.nome)}</b> vai em toda pizza? <button type="button" class="btn btn-sec btn-peq" data-cu="embBase" data-id="${esc(m.id)}">➕ Colocar 1 na Base</button></div>`).join('')}
  <div class="cartao"><b>Preços</b><div class="tbl"><table class="res"><tr><th>Item</th><th>Antes</th><th>Agora</th><th>Variação</th></tr>
    ${R.mudancas.map((m) => `<tr><td>${esc(m.nome)}</td><td>${m.antes > 0 ? `${brl(m.antes)}/${m.un}` : '—'}</td><td><b>${brl(m.depois)}/${m.un}</b></td><td class="${m.depois > m.antes && m.antes > 0 ? 'neg' : 'okc'}">${pct(m.antes, m.depois)}</td></tr>`).join('')}
  </table></div></div>
  <div class="cartao"><b>O que mudou no custo e no lucro</b>${R.impacto.length ? `<div class="tbl"><table class="res"><tr><th>Produto</th><th>Custo antes</th><th>Custo agora</th><th>Lucro agora</th></tr>
    ${R.impacto.map((x) => { const baixo = x.pizza && min > 0 && x.venda - x.custo < min; return `<tr class="${baixo ? 'lucro-baixo' : ''}"><td>${baixo ? '⚠️ ' : ''}${esc(x.nome)}</td><td>${brl(x.custoAntes)}</td><td><b>${brl(x.custo)}</b></td><td class="${x.venda - x.custo < 0 || baixo ? 'neg' : 'okc'}"><b>${brl(x.venda - x.custo)}</b></td></tr>`; }).join('')}
  </table></div>` : p('Nenhum produto do cardápio mudou de custo (os itens desta nota ainda não estão em nenhuma ficha).')}</div>
  ${p('Os pedidos antigos continuam com o custo do dia em que foram feitos. Os novos já usam os preços novos.')}
  <button type="button" class="btn btn-primario btn-bloco" data-cu="notaNova">📥 Ler outra nota</button>`;
}

// ---------- Lucro por produto ----------
function viewLucro() {
  const min = num(CU.lucroMinimo);
  const baixas = [];
  const linha = (nome, custo, venda, ok, pizza = false) => {
    const baixo = pizza && ok && min > 0 && venda - custo < min;
    if (baixo) baixas.push(nome);
    return `<tr class="${baixo ? 'lucro-baixo' : ''}"><td>${baixo ? '⚠️ ' : ''}${esc(nome)}</td>${ok
      ? `<td>${brl(custo)}</td><td>${brl(venda)}</td><td><b class="${venda - custo < 0 || baixo ? 'neg' : 'okc'}">${brl(venda - custo)}</b></td>`
      : '<td colspan="3" class="cu-falta">falta preencher</td>'}</tr>`;
  };
  const cab = (t) => `<tr><th>${t}</th><th>Custo</th><th>Venda</th><th>Lucro</th></tr>`;
  const base = custoBase();
  const tabela = (t, linhas) => `<div class="cartao"><div class="tbl"><table class="res">${cab(t)}${linhas}</table></div></div>`;
  let h = `<h2 class="cu-h2">Lucro por produto</h2>${p('Quanto custa, quanto você vende e quanto sobra de cada um.')}
  <div class="cartao"><label class="campo" style="margin:0"><span>⚠️ Me avise quando o lucro de uma pizza ficar abaixo de (R$)</span>
    <input class="input" inputmode="decimal" data-ci="lucroMin" value="${esc(CU.lucroMinimo ?? '')}" placeholder="Ex.: 15" style="max-width:160px"></label></div>
  <div id="cu-alerta-lucro"></div>`;
  for (const t of tamanhos()) {
    const sabs = ctx.S.sabores.filter((s) => num(s.precos?.[t]) > 0);
    if (!sabs.length) continue;
    h += tabela(`Pizza ${esc(t)}`, sabs.map((s) => linha(s.nome, pizzaT(s.id, t), num(s.precos[t]), base > 0 && recheioCusto(s.id) > 0, true)).join(''));
  }
  const bs = ctx.S.bordas.filter((b) => b.preco > 0);
  if (bs.length) h += tabela(`Borda${tamRef() ? ` (${esc(tamRef())})` : ''}`, bs.map((b) => linha(b.nome, bordaCusto(b.id), b.preco, bordaCusto(b.id) > 0)).join(''));
  if (ctx.S.adicionais.length) h += tabela('Adicional', ctx.S.adicionais.map((a) => linha(a.nome, adicCusto(a.id), a.preco, adicCusto(a.id) > 0)).join(''));
  const ps = produtosSimples();
  if (ps.length) h += tabela('Bebidas e outros', ps.map((b) => linha(b.nome, simplesCustoUn(b.id), b.preco, simplesCustoUn(b.id) > 0)).join(''));
  if (baixas.length) h = h.replace('<div id="cu-alerta-lucro"></div>', `<div class="cu-aviso">⚠️ ${baixas.length} pizza(s) com lucro abaixo de ${brl(min)}: <b>${baixas.map(esc).join(', ')}</b></div>`);
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
  ${p('Quanto vai de cada coisa. A base é igual em toda pizza; o recheio divide na metade e no terço, menos os ingredientes em que você preencheu uma quantidade própria para a ½ e o ⅓ (ex.: ovos).')}
  ${ts.length > 1 ? `<div class="chips">${ts.map((t) => `<button type="button" class="chip ${t === GRAMTAM ? 'on' : ''}" data-cu="gramTam" data-v="${esc(t)}">Pizza ${esc(t)}</button>`).join('')}</div>` : ''}
  ${fatorDefinido(GRAMTAM) ? '' : `<div class="cu-aviso">⚠️ A proporção da pizza ${esc(GRAMTAM)} ainda não foi definida (Fichas → Base e tamanhos). Mostrando igual à ${esc(tamRef())}.</div>`}
  <div class="cartao"><b>Toda pizza${GRAMTAM ? ` ${esc(GRAMTAM)}` : ''} (qualquer sabor e fração)</b>
    <div class="tbl"><table class="res"><tr><th>Item</th><th>Quantidade</th></tr>
    <tr><td>Disco de massa</td><td>1 un</td></tr>${B.map((it) => `<tr><td>${esc(nomeItem(it))}</td><td>${fmtQ(num(it.usa) * f, unUso(it))}</td></tr>`).join('')}</table></div></div>`;
  const sabs = ctx.S.sabores.filter((s) => (CU.sabores[s.id]?.itens || []).some((it) => num(it.usa) > 0));
  sabs.forEach((s) => {
    const its = CU.sabores[s.id].itens.filter((it) => num(it.usa) > 0);
    h += `<div class="cartao"><b>${esc(s.nome)}</b><div class="tbl"><table class="res"><tr><th>Recheio</th><th>Inteira</th><th>Metade ½</th><th>Terço ⅓</th></tr>
      ${its.map((it) => { const u = unUso(it); return `<tr><td>${esc(nomeItem(it))}</td><td><b>${fmtQ(qtdFrac(it, 1) * f, u)}</b></td><td>${fmtQ(qtdFrac(it, 2) * f, u)}</td><td>${fmtQ(qtdFrac(it, 3) * f, u)}</td></tr>`; }).join('')}
    </table></div></div>`;
  });
  const bors = ctx.S.bordas.filter((b) => (CU.bordas[b.id]?.itens || []).some((it) => num(it.usa) > 0));
  if (bors.length) {
    h += `<div class="cartao"><b>Bordas (por borda)</b><div class="tbl"><table class="res"><tr><th>Borda</th><th>Item</th><th>Quantidade</th></tr>
      ${bors.map((b) => CU.bordas[b.id].itens.filter((it) => num(it.usa) > 0).map((it) => `<tr><td>${esc(b.nome)}</td><td>${esc(nomeItem(it))}</td><td>${fmtQ(num(it.usa) * f, unUso(it))}</td></tr>`).join('')).join('')}
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
    // 💸 ajuste de valor feito no painel: a venda cai (ou sobe), o custo continua o mesmo
    const aj = U.descontoAjuste(x);
    venda += c.venda - aj; custo += c.custo; taxas += x.taxaEntrega || 0;
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
  const aj = U.descontoAjuste;
  h += '<h2 class="cu-h2">Pedido por pedido</h2>';
  ps.forEach((x, i) => {
    const c = calcs[i];
    h += `<div class="cartao cli-card" style="--h:${corCliente(x.clienteTel)}">
      <div class="cli-head"><span class="cli-av">${esc(iniciais(x.clienteNome))}</span>
        <div><b class="cli-nm">${esc(x.clienteNome)}</b><small>Pedido ${U.codigoPedido(x.id)} · ${U.fmtHoraMin(U.toDate(x.criadoEm))}</small></div></div>
      ${c.linhas.map((l) => `<div class="bal"><div>${l.qtd}x ${esc(l.desc)}</div>
        <small>custou <b>${brl(l.custo)}</b> · vendeu <b>${brl(l.venda)}</b> · lucro <b class="${l.venda - l.custo < 0 ? 'neg' : 'okc'}">${brl(l.venda - l.custo)}</b></small>
        ${l.aviso ? `<small class="warnc">⚠️ ${esc(l.aviso)}</small>` : ''}</div>`).join('')}
      ${x.ajuste ? `<div class="bal"><div>💸 Ajuste de valor${x.ajuste.motivo ? ` · ${esc(x.ajuste.motivo)}` : ''}</div>
        <small>pedido ${brl(x.total)} · recebido <b>${brl(U.valorRecebido(x))}</b> · ${aj(x) >= 0 ? 'desconto' : 'a mais'} <b class="${aj(x) > 0 ? 'neg' : 'okc'}">${brl(Math.abs(aj(x)))}</b></small></div>` : ''}
      <div class="tot"><b>Total do pedido</b>
        ${linhaRes('Custo', brl(c.custo))}${linhaRes('Venda', brl(c.venda - aj(x)))}
        ${linhaRes('<b>Lucro</b>', `<span class="${c.venda - aj(x) - c.custo < 0 ? 'neg' : 'okc'}" style="font-size:1.15rem">${brl(c.venda - aj(x) - c.custo)}</span>`)}
        ${x.taxaEntrega ? `${linhaRes('Taxa de entrega (fora do lucro)', brl(x.taxaEntrega))}${linhaRes('Cliente pagou no total', brl(U.valorRecebido(x)))}` : ''}
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
  migrar(CU);
  try {
    await salvarAgora();
    if (falhou) throw new Error('não salvou');
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
  if (a === 'frAbrir' || a === 'frTirar') {
    const it = listaAtual()[+t.dataset.i];
    if (!it) return;
    if (a === 'frAbrir') { it.meia = ''; it.terco = ''; } else { delete it.meia; delete it.terco; }
    salvar(); render();
    if (a === 'frAbrir') setTimeout(() => document.querySelector(`[data-f="meia"][data-i="${t.dataset.i}"]`)?.focus(), 30);
    return;
  }
  if (a === 'mAdd') {
    listaAtual().push({ id: uid(), ing: '', usa: '' });
    salvar(); render();
    setTimeout(() => { const ins = document.querySelectorAll('[data-ci="ing"]'); ins[ins.length - 1]?.focus(); }, 30);
    return;
  }
  if (a === 'ingNovo') { formNovoIngrediente(); return; }
  if (a === 'histDel') {
    const ing = CU.ingredientes[t.dataset.id];
    const k = +t.dataset.k;
    const h = ing?.hist || [];
    const x = h[k];
    if (!x || !confirm(`Apagar o preço ${brl(x.p)}/${ing.base} de ${fmtD(x.d)}?`)) return;
    const eraUltimo = k === h.length - 1;
    h.splice(k, 1);
    ing.hist = h;
    if (eraUltimo) {
      const ant = h[h.length - 1];
      if (ant) { ing.preco = ant.p; ing.at = ant.d; }
      U.toast(ant ? `${ing.nome} voltou para ${brl(ant.p)}/${ing.base}` : 'Era o único preço registrado — corrija o valor no campo Preço');
    }
    salvarAgora(); render();
    return;
  }
  if (a === 'ingDel') {
    const ing = CU.ingredientes[t.dataset.id];
    if (!ing || !confirm(`Excluir o ingrediente “${ing.nome}”?`)) return;
    delete CU.ingredientes[ing.id];
    Object.keys(CU.apelidos).forEach((k) => { if (CU.apelidos[k] === `ing:${ing.id}`) delete CU.apelidos[k]; });
    salvar(); render();
    return;
  }
  if (a === 'copiarPrompt') {
    navigator.clipboard?.writeText(N.PROMPT_IA).then(() => U.toast('Pedido copiado ✓ — cole no app do Claude junto com a foto'), () => U.toast('Não foi possível copiar. Selecione o texto e copie.'));
    return;
  }
  if (a === 'lerNota') { lerNotaColada(); return; }
  if (a === 'notaCancelar') { NOTA = null; render(); return; }
  if (a === 'notaAplicar') { aplicarNota(); return; }
  if (a === 'notaNova') { NOTA = null; NOTA_RES = null; render(); return; }
  if (a === 'embBase') {
    CU.base.itens.push({ id: uid(), ing: t.dataset.id, usa: 1 });
    salvarAgora(); U.toast('Embalagem colocada na Base: agora entra no custo de toda pizza ✓'); render();
    return;
  }
  if (a === 'mDel') {
    const L = listaAtual(), it = L[+t.dataset.i];
    if (!confirm(`Remover “${nomeItem(it) === '?' ? 'ingrediente' : nomeItem(it)}”?`)) return;
    L.splice(+t.dataset.i, 1); salvar(); render();
  }
});

function aoEditar(e) {
  const el = e.target.closest('#v-custos [data-ci]');
  if (!el) return;
  const ci = el.dataset.ci;
  if (ci === 'm') listaAtual()[+el.dataset.i][el.dataset.f] = el.value;
  else if (ci === 'ing') {
    if (el.value === '__novo') { const i = +el.dataset.i; render(); formNovoIngrediente((id) => { listaAtual()[i].ing = id; }); return; }
    listaAtual()[+el.dataset.i].ing = el.value; salvar(); render(); return;
  }
  else if (ci === 'ingNome' || ci === 'ingPreco' || ci === 'ingBase') {
    const ing = CU.ingredientes[el.dataset.id];
    if (!ing) return;
    if (ci === 'ingNome') ing.nome = el.value.trimStart().slice(0, 40);
    if (ci === 'ingPreco') ing.preco = r4(num(el.value));
    if (ci === 'ingBase') { ing.base = el.value; salvar(); render(); return; }
    salvar();
    return;
  }
  else if (ci === 'lucroMin') { CU.lucroMinimo = el.value; salvar(); return; }
  else if (ci === 'rende') CU.massa.rende = el.value;
  else if (ci === 'simples') CU.simples[el.dataset.id] = { ...(CU.simples[el.dataset.id] || {}), [el.dataset.f]: el.value };
  else if (ci === 'fator') CU.tamanhos.fator[el.dataset.tam] = el.value;
  else if (ci === 'ref') { CU.tamanhos.ref = el.value; salvar(); render(); return; }
  salvar();
  refreshCalcs();
}
document.addEventListener('input', (e) => {
  if (e.target.closest('#v-custos [data-nl]')) { notaMudou(e.target, false); return; }
  aoEditar(e);
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'cu-importar' && e.target.files[0]) { importarAntigo(e.target.files[0]); e.target.value = ''; return; }
  // preço mudado à mão → entra no histórico
  if (e.target.matches('#v-custos [data-ci="ingPreco"]')) {
    const ing = CU.ingredientes[e.target.dataset.id];
    if (ing && num(ing.preco) > 0) {
      const h = ing.hist || [];
      const ult = h[h.length - 1];
      if (ult && ult.d === hojeISO() && ult.desc === 'ajuste manual') ult.p = ing.preco;
      else if (!ult || ult.p !== ing.preco) h.push({ d: hojeISO(), p: ing.preco, desc: 'ajuste manual' });
      ing.hist = h.slice(-40);
      ing.at = hojeISO();
      salvar();
    }
    return;
  }
  if (e.target.matches('#v-custos [data-ci="lucroMin"]')) { render(); return; }
  if (e.target.closest('#v-custos [data-nl]')) { notaMudou(e.target, true); return; }
  if (e.target.matches('#v-custos select[data-ci]')) aoEditar(e);
});
