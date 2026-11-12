// =====================================================================
//  Página do cliente: identificação → cardápio → montagem → carrinho → WhatsApp
// =====================================================================
import {
  db, configurado, doc, getDoc, setDoc, updateDoc, onSnapshot, collection,
  runTransaction, serverTimestamp,
} from './firebase-config.js?v=11';
import * as U from './utils.js?v=11';

const { esc, fmtBRL } = U;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const S = {
  loja: U.mesclarLoja(),
  lojaOk: false,
  categorias: [], produtos: [], sabores: [], bordas: [], adicionais: [],
  ok: {},                       // quais coleções já carregaram
  cliente: null,                // { tel, nome, totalPedidos, primeiroPedidoEm, ultimoEndereco, ... }
  carrinho: [],
  checkout: { tipo: 'entrega', endereco: {}, pagamento: '', troco: '' },
  busca: '',
  aba: 'inicio',
  m: null,                      // montagem em andamento no modal
};

// =====================================================================
//  Camadas (modais/telas) integradas ao botão "voltar" do celular
// =====================================================================
const camadas = [];
function abrirCamada(el, aoFechar) {
  el.hidden = false;
  document.body.classList.add('travado');
  camadas.push({ el, aoFechar });
  history.pushState({ camada: camadas.length }, '');
}
function fecharCamada() {
  if (camadas.length) history.back();
}
window.addEventListener('popstate', () => {
  const c = camadas.pop();
  if (!c) return;
  c.el.hidden = true;
  c.aoFechar?.();
  if (!camadas.length) document.body.classList.remove('travado');
});
function fecharTodasCamadas() {
  while (camadas.length) camadas.pop().el.hidden = true;
  document.body.classList.remove('travado');
}

// =====================================================================
//  Regras do cardápio
// =====================================================================
/** A pizzaria pode desligar a entrega no painel (ex.: "hoje só retirada") */
const entregaOn = () => S.loja.entregaAtiva !== false;
const catAtiva = (id) => S.categorias.some((c) => c.id === id && c.ativo !== false);
const saborPermitido = (s, p) => !p.saboresPermitidos?.length || p.saboresPermitidos.includes(s.id);

/** Preço do sabor para o tamanho da pizza (ou o preço base do produto). null = não vende nesse tamanho */
function precoSabor(s, p) {
  const v = s.precos?.[p.tamanho];
  if (typeof v === 'number' && v > 0) return v;
  if (p.preco > 0) return p.preco;
  return null;
}
function saboresDoProduto(p, incluirIndisp = false) {
  return S.sabores.filter(
    (s) => (incluirIndisp || s.disponivel !== false) && saborPermitido(s, p) && precoSabor(s, p) != null,
  );
}
function disponivel(p) {
  return p.disponivel !== false && (p.tipo !== 'pizza' || saboresDoProduto(p).length > 0);
}
function precoAPartir(p) {
  if (p.tipo !== 'pizza') return p.preco || 0;
  const precos = saboresDoProduto(p).map((s) => precoSabor(s, p));
  return precos.length ? Math.min(...precos) : p.preco || 0;
}
const bordasDisp = () => S.bordas.filter((b) => b.disponivel !== false);
const adicDisp = () => S.adicionais.filter((a) => a.disponivel !== false);
function emojiProduto(p) {
  if (p.tipo === 'pizza') return '🍕';
  const cat = S.categorias.find((c) => c.id === p.categoriaId);
  return /bebida|refri|suco/i.test(cat?.nome || '') ? '🥤' : '🍽️';
}

/**
 * Recalcula um item do carrinho com o cardápio ATUAL (preços e disponibilidade).
 * Retorna os campos atualizados, ou null se algo não estiver mais disponível.
 */
function recalcular(item) {
  const p = S.produtos.find((x) => x.id === item.produtoId);
  if (!p || !disponivel(p) || !catAtiva(p.categoriaId)) return null;
  if (p.tipo !== 'pizza') {
    return { nome: p.nome, tipo: 'simples', tamanho: '', sabores: [], borda: null, adicionais: [], precoUnit: U.round2(p.preco) };
  }
  const sabores = [];
  for (const s of item.sabores || []) {
    const sab = S.sabores.find((x) => x.id === s.id);
    if (!sab || sab.disponivel === false || !saborPermitido(sab, p)) return null;
    const pr = precoSabor(sab, p);
    if (pr == null) return null;
    sabores.push({ id: sab.id, nome: sab.nome, preco: pr });
  }
  if (!sabores.length || sabores.length > (p.maxSabores || 1)) return null;
  let borda = null;
  if (item.borda) {
    const b = S.bordas.find((x) => x.id === item.borda.id);
    if (!b || b.disponivel === false || p.usaBordas === false) return null;
    borda = { id: b.id, nome: b.nome, preco: U.round2(b.preco) };
  }
  const adicionais = [];
  for (const a of item.adicionais || []) {
    const ad = S.adicionais.find((x) => x.id === a.id);
    if (!ad || ad.disponivel === false || p.usaAdicionais === false) return null;
    adicionais.push({ id: ad.id, nome: ad.nome, preco: U.round2(ad.preco), qtd: a.qtd });
  }
  const precoUnit = U.round2(
    U.precoPizza(sabores.map((s) => s.preco), S.loja.regraPrecoPizza) +
      (borda?.preco || 0) +
      adicionais.reduce((t, a) => t + a.preco * a.qtd, 0),
  );
  return { nome: p.nome, tipo: 'pizza', tamanho: p.tamanho || '', sabores, borda, adicionais, precoUnit };
}

function cardapioCarregado() {
  return S.ok.categorias && S.ok.produtos && S.ok.sabores && S.ok.bordas && S.ok.adicionais;
}

// =====================================================================
//  Firestore: ouvir cardápio e configurações em tempo real
// =====================================================================
let renderAgendado = false;
function agendarRender() {
  if (renderAgendado) return;
  renderAgendado = true;
  requestAnimationFrame(() => {
    renderAgendado = false;
    renderTudo();
  });
}
function ouvirCardapio() {
  onSnapshot(
    doc(db, 'config', 'loja'),
    (s) => { S.loja = U.mesclarLoja(s.data()); S.lojaOk = true; agendarRender(); },
    (e) => { console.error('config/loja', e); S.lojaOk = true; agendarRender(); },
  );
  ['categorias', 'produtos', 'sabores', 'bordas', 'adicionais'].forEach((nome) => {
    onSnapshot(
      collection(db, nome),
      (snap) => {
        S[nome] = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(U.porOrdem);
        S.ok[nome] = true;
        agendarRender();
      },
      (e) => { console.error(nome, e); S.ok[nome] = true; agendarRender(); },
    );
  });
}

function renderTudo() {
  renderTopo();
  renderCardapio();
  if (cardapioCarregado()) sincronizarCarrinho();
  renderBarra();
  if (!$('#tela-carrinho').hidden) renderCarrinho();
}

// =====================================================================
//  Identificação do cliente
// =====================================================================
async function iniciar() {
  if (!configurado) $('#aviso-config').hidden = false;
  S.carrinho = U.lsGet('pz_carrinho', []);
  S.checkout = { ...S.checkout, ...U.lsGet('pz_checkout', {}) };
  S.checkout.endereco = S.checkout.endereco || {};
  ouvirCardapio();
  setInterval(renderTopo, 60_000); // status aberta/fechada muda com o relógio

  const salvo = U.lsGet('pz_cliente', null);
  const telUrl = U.normTel(new URLSearchParams(location.search).get('tel') || '');

  if (telUrl && telUrl !== salvo?.tel) {
    // Link personalizado (?tel=...): se já é cliente, entra direto
    const snap = await U.comTimeout(getDoc(doc(db, 'clientes', telUrl)), 6000).catch(() => null);
    if (snap?.exists() && snap.data().nome) {
      entrar({ tel: telUrl, nome: snap.data().nome, apelido: snap.data().apelido || '' }, snap.data());
      return;
    }
    mostrarBoasVindas(telUrl);
    return;
  }
  if (salvo?.tel && salvo?.nome) {
    entrar(salvo);
    carregarDadosCliente();
    return;
  }
  mostrarBoasVindas();
}

function mostrarBoasVindas(tel = '') {
  $('#app').hidden = true;
  $('#tela-boasvindas').hidden = false;
  $('#id-tel').value = U.mascaraTel(tel);
  $('#id-nome').value = '';
  $('#id-apelido').value = '';
  $('#id-erro').textContent = '';
  setTimeout(() => (tel ? $('#id-nome') : $('#id-tel')).focus(), 50);
}

/** Como chamar o cliente: o apelido, se tiver; senão o primeiro nome */
const chamarPor = (c) => (c.apelido || '').trim() || c.nome.split(' ')[0];

function entrar(cli, dados = {}) {
  const apelido = (cli.apelido ?? dados.apelido ?? '').trim();
  S.cliente = { ...dados, tel: cli.tel, nome: cli.nome, apelido };
  U.lsSet('pz_cliente', { tel: cli.tel, nome: cli.nome, apelido });
  $('#tela-boasvindas').hidden = true;
  $('#app').hidden = false;
  $('#primeiro-nome').textContent = chamarPor(S.cliente);
  preencherEnderecoSalvo();
  renderTudo();
}

async function carregarDadosCliente() {
  try {
    const snap = await U.comTimeout(getDoc(doc(db, 'clientes', S.cliente.tel)), 8000);
    if (snap.exists()) {
      const d = snap.data();
      S.cliente = { ...S.cliente, ...d, tel: S.cliente.tel, nome: S.cliente.nome, apelido: S.cliente.apelido || d.apelido || '' };
      $('#primeiro-nome').textContent = chamarPor(S.cliente);
      preencherEnderecoSalvo();
    }
  } catch (e) {
    console.warn('Não foi possível carregar o cliente', e);
  }
}

function preencherEnderecoSalvo() {
  const ult = S.cliente?.ultimoEndereco;
  if (ult && !S.checkout.endereco?.rua) {
    S.checkout.endereco = { ...ult };
    salvarCheckout();
  }
}

$('#id-tel').addEventListener('input', (e) => (e.target.value = U.mascaraTel(e.target.value)));

$('#form-id').addEventListener('submit', async (e) => {
  e.preventDefault();
  const erro = $('#id-erro');
  const tel = U.normTel($('#id-tel').value);
  const nome = $('#id-nome').value.trim().replace(/\s+/g, ' ');
  $('#campo-tel').classList.toggle('invalido', !tel);
  if (!tel) { erro.textContent = 'Informe um WhatsApp válido com DDD.'; $('#id-tel').focus(); return; }
  const palavras = nome.split(' ').filter((p) => p.length >= 2);
  $('#campo-nome').classList.toggle('invalido', palavras.length < 2);
  if (palavras.length < 2) { erro.textContent = 'Informe seu nome e sobrenome.'; $('#id-nome').focus(); return; }
  erro.textContent = '';
  const apelido = $('#id-apelido').value.trim().replace(/\s+/g, ' ').slice(0, 30);

  const btn = $('#id-btn');
  btn.disabled = true;
  btn.textContent = 'Entrando…';
  let dados = {};
  try {
    const ref = doc(db, 'clientes', tel);
    const snap = await U.comTimeout(getDoc(ref), 8000);
    if (!snap.exists()) {
      await U.comTimeout(
        setDoc(ref, { nome, telefone: tel, criadoEm: serverTimestamp(), totalPedidos: 0, totalGasto: 0 }),
        8000,
      );
      dados = { totalPedidos: 0 };
    } else {
      dados = snap.data();
      if (dados.nome !== nome) await U.comTimeout(updateDoc(ref, { nome }), 8000);
    }
  } catch (err) {
    // Sem internet ou erro: segue mesmo assim — o cadastro é feito ao finalizar o pedido.
    console.warn('Cadastro do cliente adiado', err);
  }
  btn.disabled = false;
  btn.textContent = 'Continuar';
  entrar({ tel, nome, apelido }, dados);
  salvarApelido(tel, apelido, dados.apelido || '');
});

/**
 * O apelido é gravado à parte (nunca dentro do pedido), então um erro aqui
 * — sem internet, ou regras do Firestore antigas — nunca impede o pedido.
 */
async function salvarApelido(tel, apelido, atual) {
  if (apelido === atual) return;
  try {
    await U.comTimeout(updateDoc(doc(db, 'clientes', tel), { apelido }), 8000);
  } catch (e) {
    console.warn('Apelido não salvo na nuvem (fica só neste aparelho)', e);
  }
}

$('#btn-trocar').addEventListener('click', () => {
  U.lsDel('pz_cliente');
  U.lsDel('pz_checkout');
  S.cliente = null;
  S.checkout = { tipo: 'entrega', endereco: {}, pagamento: '', troco: '' };
  mostrarBoasVindas();
});

// =====================================================================
//  Topo / informações
// =====================================================================
function logoHTML() {
  return S.loja.logoUrl ? `<img src="${esc(S.loja.logoUrl)}" alt="" onerror="this.replaceWith('🍕')">` : '🍕';
}
let ultimoLogo = null;
function renderTopo() {
  if (!S.lojaOk) return;
  const l = S.loja;
  document.title = `${l.nome} — Faça seu pedido`;
  $('#nome-loja').textContent = l.nome;
  $('#bv-nome-loja').textContent = l.nome;
  if (ultimoLogo !== l.logoUrl) {
    ultimoLogo = l.logoUrl;
    $('#logo').innerHTML = logoHTML();
    $('#bv-logo').innerHTML = logoHTML();
  }
  const st = U.statusLoja(l);
  const pill = $('#status-loja');
  pill.textContent = st.texto;
  pill.className = `pill ${st.aberta ? 'aberta' : 'fechada'}`;
  $('#aviso-retirada').hidden = entregaOn();
}

function abrirInfo() {
  const l = S.loja;
  const hoje = U.DIAS[new Date().getDay()];
  const horarios = U.ORDEM_SEMANA.map((d) => {
    const h = l.horarios[d];
    const txt = h?.aberto ? `${U.fmtHora(h.abre)} às ${U.fmtHora(h.fecha)}` : 'Fechado';
    return `<tr class="${d === hoje ? 'hoje' : ''}"><td>${U.DIAS_NOME[d]}</td><td>${txt}</td></tr>`;
  }).join('');
  const pags = l.pagamentos.map((p) => U.PAGAMENTOS[p]).filter(Boolean).join(' · ');
  $('#info-titulo').textContent = l.nome;
  $('#info-corpo').innerHTML = `
    <p><span class="pill ${U.statusLoja(l).aberta ? 'aberta' : 'fechada'}">${esc(U.statusLoja(l).texto)}</span></p>
    <ul class="info-lista">
      ${l.endereco ? `<li><strong>📍 Endereço</strong>${esc(l.endereco)}</li>` : ''}
      <li><strong>🕒 Horário de funcionamento</strong><table class="horarios-tabela">${horarios}</table></li>
      <li><strong>🛵 Entrega</strong>${entregaOn() ? `Taxa: ${l.taxaEntrega ? fmtBRL(l.taxaEntrega) : 'grátis'}` : 'Hoje não estamos fazendo entregas — só retirada no local.'}</li>
      ${l.pedidoMinimo ? `<li><strong>🧾 Pedido mínimo</strong>${fmtBRL(l.pedidoMinimo)}</li>` : ''}
      ${l.tempoEntrega || l.tempoRetirada ? `<li><strong>⏱️ Tempo de espera</strong>${[entregaOn() && l.tempoEntrega ? `Entrega: ${esc(l.tempoEntrega)}` : '', l.tempoRetirada ? `Retirada: ${esc(l.tempoRetirada)}` : ''].filter(Boolean).join('<br>')}</li>` : ''}
      <li><strong>💳 Formas de pagamento</strong>${esc(pags)}</li>
      ${l.whatsapp ? `<li><strong>📱 WhatsApp</strong><a class="link" href="https://wa.me/${esc(l.whatsapp)}">${esc(U.fmtTel(l.whatsapp))}</a></li>` : ''}
    </ul>`;
  abrirCamada($('#modal-info'));
}
$('#btn-info').addEventListener('click', abrirInfo);

// =====================================================================
//  Cardápio
// =====================================================================
function combinaBusca(p, b) {
  if (U.norm(`${p.nome} ${p.descricao || ''}`).includes(b)) return true;
  // pizza aparece se algum sabor combinar ("calabresa" → mostra as pizzas)
  return p.tipo === 'pizza' && saboresDoProduto(p).some((s) => U.norm(`${s.nome} ${s.ingredientes || ''}`).includes(b));
}
function textoPreco(p) {
  if (!disponivel(p)) return 'Indisponível';
  return p.tipo === 'pizza' ? `<small>a partir de</small> ${fmtBRL(precoAPartir(p))}` : fmtBRL(p.preco);
}
function cardProduto(p) {
  const d = disponivel(p);
  const meta = p.tipo === 'pizza' && !p.descricao
    ? [p.fatias ? `${p.fatias} fatias` : '', `até ${p.maxSabores || 1} sabor${(p.maxSabores || 1) > 1 ? 'es' : ''}`].filter(Boolean).join(' · ')
    : p.descricao;
  return `<button type="button" class="produto${d ? '' : ' indisp'}" data-produto="${esc(p.id)}" ${d ? '' : 'disabled'}>
    <div class="produto-info">
      <h3>${esc(p.nome)}</h3>
      ${meta ? `<p>${esc(meta)}</p>` : ''}
      <span class="preco">${textoPreco(p)}</span>
    </div>
    ${U.fotoHTML(p.fotoUrl, emojiProduto(p), 'produto-foto')}
  </button>`;
}

function produtosVisiveis() {
  const ocultar = S.loja.ocultarIndisponiveis;
  return S.produtos.filter((p) => catAtiva(p.categoriaId) && (!ocultar || disponivel(p)));
}

/** Pizza usada para mostrar os sabores no cardápio (a primeira pizza disponível) */
function pizzaDosSabores() {
  return produtosVisiveis().find((p) => p.tipo === 'pizza' && disponivel(p)) || null;
}
/** Preço comum de um grupo de sabores (se todos custam igual), senão null */
function precoDoGrupo(lista, p) {
  const ps = [...new Set(lista.filter((s) => s.disponivel !== false).map((s) => precoSabor(s, p)))];
  return ps.length === 1 ? ps[0] : null;
}
/** "🍕 Nossos sabores": Tradicionais / Especiais, com a descrição de cada sabor */
function saboresCardapioHTML(p, b) {
  let lista = saboresDoProduto(p, !S.loja.ocultarIndisponiveis);
  if (b) lista = lista.filter((s) => U.norm(`${s.nome} ${s.ingredientes || ''}`).includes(b));
  if (!lista.length) return '';
  const max = p.maxSabores || 1;
  const grupos = U.agruparSabores(lista, S.loja.gruposSabor);
  return `<div class="sabores-cardapio">
    <h3 class="sabores-titulo">🍕 Nossos sabores</h3>
    <p class="sabores-dica">${esc(p.nome)} · toque no sabor para montar${max > 1 ? ` (até ${max} sabores)` : ''}</p>
    ${grupos.map(({ grupo, sabores }) => {
      const pg = precoDoGrupo(sabores, p);
      return `<div class="sabores-grupo">
        <div class="sabores-grupo-topo"><b>${esc(grupo.nome)}</b>${pg ? `<span class="preco">${fmtBRL(pg)}</span>` : ''}</div>
        ${sabores.map((s) => {
          const esg = s.disponivel === false;
          return `<button type="button" class="sabor-card${esg ? ' indisp' : ''}" data-sabor-cardapio="${esc(s.id)}" data-pizza="${esc(p.id)}" ${esg ? 'disabled' : ''}>
            ${s.fotoUrl ? U.fotoHTML(s.fotoUrl, '🍕', 'sabor-foto') : ''}
            <span class="sabor-txt"><strong>${esc(s.nome)}</strong>${s.ingredientes ? `<small>${esc(s.ingredientes)}</small>` : ''}</span>
            <span class="sabor-preco">${esg ? 'Esgotado' : pg ? '›' : fmtBRL(precoSabor(s, p))}</span>
          </button>`;
        }).join('')}
      </div>`;
    }).join('')}
  </div>`;
}

function renderCardapio() {
  if (!cardapioCarregado()) return; // mantém o skeleton
  const b = U.norm(S.busca.trim());
  const visiveis = produtosVisiveis();
  const cats = S.categorias.filter((c) => c.ativo !== false && visiveis.some((p) => p.categoriaId === c.id));

  // barra de categorias
  const nav = $('#cats');
  const ativa = nav.querySelector('.ativa')?.dataset.ir;
  nav.innerHTML = cats
    .map((c, i) => `<button type="button" data-ir="${esc(c.id)}" class="${(ativa ? ativa === c.id : i === 0) ? 'ativa' : ''}">${esc(c.nome)}</button>`)
    .join('');
  nav.hidden = !cats.length;

  // destaques
  const dest = b ? [] : visiveis.filter((p) => p.destaque && disponivel(p));
  $('#destaques').hidden = !dest.length;
  $('#carrossel').innerHTML = dest
    .map((p) => `<button type="button" class="destaque" data-produto="${esc(p.id)}">
        ${U.fotoHTML(p.fotoUrl, emojiProduto(p), 'd-foto')}
        <div class="d-txt"><h3>${esc(p.nome)}</h3><span class="preco">${textoPreco(p)}</span></div>
      </button>`)
    .join('');

  // seções
  let algum = false;
  $('#cardapio').innerHTML = cats
    .map((c) => {
      let prods = visiveis.filter((p) => p.categoriaId === c.id);
      if (b) prods = prods.filter((p) => combinaBusca(p, b));
      if (!prods.length) return '';
      algum = true;
      const pizzaSabores = pizzaDosSabores();
      const sabores = pizzaSabores && prods.some((p) => p.id === pizzaSabores.id) ? saboresCardapioHTML(pizzaSabores, b) : '';
      return `<section class="secao" id="cat-${esc(c.id)}" data-cat="${esc(c.id)}">
        <h2>${esc(c.nome)}</h2>
        <div class="lista-produtos">${prods.map(cardProduto).join('')}</div>
        ${sabores}
      </section>`;
    })
    .join('');

  const semNada = !visiveis.length;
  $('#sem-resultado').hidden = algum;
  $('#sem-resultado').innerHTML = semNada
    ? '<span class="emoji">👨‍🍳</span>Nosso cardápio está sendo preparado. Volte em instantes!'
    : '<span class="emoji">🔎</span>Nenhum produto encontrado.';
}

$('#busca').addEventListener('input', (e) => {
  S.busca = e.target.value;
  renderCardapio();
});

// rolar até a categoria
$('#cats').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-ir]');
  if (!btn) return;
  if (S.busca) { S.busca = ''; $('#busca').value = ''; renderCardapio(); }
  document.getElementById(`cat-${btn.dataset.ir}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// destacar a categoria visível
let rolagemAgendada = false;
window.addEventListener('scroll', () => {
  if (rolagemAgendada || S.aba !== 'inicio') return;
  rolagemAgendada = true;
  requestAnimationFrame(() => {
    rolagemAgendada = false;
    const nav = $('#cats');
    const limite = nav.getBoundingClientRect().bottom + 12;
    let atual = null;
    for (const s of $$('.secao')) if (s.getBoundingClientRect().top <= limite) atual = s.dataset.cat;
    if (!atual) atual = $('.secao')?.dataset.cat;
    const btn = nav.querySelector(`[data-ir="${CSS.escape(atual || '')}"]`);
    if (btn && !btn.classList.contains('ativa')) {
      nav.querySelector('.ativa')?.classList.remove('ativa');
      btn.classList.add('ativa');
      nav.scrollTo({ left: btn.offsetLeft - 16, behavior: 'smooth' });
    }
  });
}, { passive: true });

document.addEventListener('click', (e) => {
  const sabor = e.target.closest('[data-sabor-cardapio]');
  if (sabor && !sabor.disabled) { abrirProduto(sabor.dataset.pizza, sabor.dataset.saborCardapio); return; }
  const card = e.target.closest('[data-produto]');
  if (card && !card.disabled) abrirProduto(card.dataset.produto);
});

// =====================================================================
//  Modal do produto (montagem da pizza / item simples)
// =====================================================================
function abrirProduto(id, saborInicial = '') {
  const p = S.produtos.find((x) => x.id === id);
  if (!p || !disponivel(p)) return;
  const pizza = p.tipo === 'pizza';
  const bordas = pizza && p.usaBordas !== false ? bordasDisp() : [];
  const adics = pizza && p.usaAdicionais !== false ? adicDisp() : [];
  const semBordaReal = bordas.find((b) => !b.preco);
  S.m = {
    p, pizza, sabores: [], adic: {}, qtd: 1, obs: '', buscaSabor: '',
    bordas: semBordaReal || !bordas.length ? bordas : [{ id: '', nome: 'Sem borda', preco: 0 }, ...bordas],
    bordaId: semBordaReal ? semBordaReal.id : '',
    adics,
  };
  // veio do "Nossos sabores": já começa com o sabor escolhido
  if (saborInicial && saboresDoProduto(p).some((s) => s.id === saborInicial)) S.m.sabores = [saborInicial];
  const max = p.maxSabores || 1;
  const regra = max === 1 ? 'Escolha 1 sabor' : `Escolha de 1 a ${max} sabores`;
  const meta = pizza ? [p.fatias ? `${p.fatias} fatias` : '', `até ${max} sabor${max > 1 ? 'es' : ''}`].filter(Boolean).join(' · ') : '';
  const muitosSabores = saboresDoProduto(p, true).length > 6;

  $('#mp-sheet').innerHTML = `
    <button type="button" class="btn-fechar" data-fechar aria-label="Fechar">×</button>
    <div class="sheet-corpo" style="padding:0">
      ${U.fotoHTML(p.fotoUrl, emojiProduto(p), 'mp-foto')}
      <div class="mp-cabecalho">
        <h2>${esc(p.nome)}</h2>
        ${p.descricao ? `<p>${esc(p.descricao)}</p>` : ''}
        ${meta ? `<p class="mp-meta">${esc(meta)}</p>` : ''}
        ${!pizza ? `<p class="preco" style="margin-top:8px;font-size:1.15rem">${fmtBRL(p.preco)}</p>` : ''}
      </div>
      ${pizza ? `
        <section class="grupo">
          <div class="grupo-topo">
            <div><h3>Sabores</h3><p>${regra} · obrigatório</p></div>
            <span class="contador" id="mp-contador"></span>
          </div>
          ${muitosSabores ? '<input type="search" class="input busca-sabor" id="mp-busca-sabor" placeholder="Buscar sabor…" aria-label="Buscar sabor">' : ''}
          <div class="lista-opcoes" id="mp-sabores"></div>
        </section>
        ${S.m.bordas.length ? `<section class="grupo">
          <div class="grupo-topo"><div><h3>Borda</h3><p>Opcional · escolha 1</p></div></div>
          <div class="lista-opcoes" id="mp-bordas"></div>
        </section>` : ''}
        ${adics.length ? `<section class="grupo">
          <div class="grupo-topo"><div><h3>Adicionais</h3><p>Opcional</p></div></div>
          <div class="lista-opcoes" id="mp-adicionais"></div>
        </section>` : ''}` : ''}
      <section class="grupo">
        <div class="grupo-topo"><div><h3>Observação</h3><p>Opcional</p></div></div>
        <div class="mp-obs"><textarea id="mp-obs" maxlength="140" placeholder="${pizza ? 'Ex.: sem cebola, bem assada…' : 'Ex.: bem gelado'}" aria-label="Observação"></textarea></div>
      </section>
    </div>
    <footer class="mp-rodape">
      <div class="qtd">
        <button type="button" data-qtd="-1" aria-label="Diminuir">−</button>
        <span id="mp-qtd">1</span>
        <button type="button" data-qtd="1" aria-label="Aumentar">+</button>
      </div>
      <button type="button" class="btn btn-primario" id="mp-add"></button>
    </footer>`;
  renderMontagem();
  abrirCamada($('#modal-produto'), () => (S.m = null));
}

function precoMontagem() {
  const { p, pizza } = S.m;
  if (!pizza) return U.round2(p.preco || 0);
  const precos = S.m.sabores.map((id) => precoSabor(S.sabores.find((s) => s.id === id), p));
  const borda = S.m.bordas.find((b) => b.id === S.m.bordaId)?.preco || 0;
  const adic = S.m.adics.reduce((t, a) => t + (S.m.adic[a.id] || 0) * (a.preco || 0), 0);
  return U.round2(U.precoPizza(precos, S.loja.regraPrecoPizza) + borda + adic);
}

function renderMontagem() {
  const { p, pizza } = S.m;
  if (pizza) {
    const max = p.maxSabores || 1;
    const n = S.m.sabores.length;
    const cont = $('#mp-contador');
    cont.textContent = `${n} de ${max} escolhido${max > 1 ? 's' : ''}`;
    cont.classList.toggle('completo', n === max);

    const b = U.norm(S.m.buscaSabor);
    const cheio = max > 1 && n >= max;
    const lista = saboresDoProduto(p, !S.loja.ocultarIndisponiveis)
      .filter((s) => !b || S.m.sabores.includes(s.id) || U.norm(`${s.nome} ${s.ingredientes || ''}`).includes(b));
    const linhaSabor = (s) => {
          const sel = S.m.sabores.includes(s.id);
          const esg = s.disponivel === false;
          return `<button type="button" class="opcao${sel ? ' sel' : ''}" data-sabor="${esc(s.id)}" aria-pressed="${sel}" ${esg || (cheio && !sel) ? 'disabled' : ''}>
            ${U.fotoHTML(s.fotoUrl, '🍕', 'opcao-foto')}
            <span class="opcao-txt"><strong>${esc(s.nome)}</strong>${s.ingredientes ? `<small>${esc(s.ingredientes)}</small>` : ''}</span>
            <span class="opcao-preco">${esg ? 'Esgotado' : fmtBRL(precoSabor(s, p))}</span>
            <span class="marcador" aria-hidden="true"></span>
          </button>`;
        };
    const grupos = U.agruparSabores(lista, S.loja.gruposSabor);
    $('#mp-sabores').innerHTML = lista.length
      ? grupos.map(({ grupo, sabores }) => {
          const pg = precoDoGrupo(sabores, p);
          return `${grupos.length > 1 || grupo.id ? `<div class="opcao-grupo">${esc(grupo.nome)}${pg ? ` · ${fmtBRL(pg)}` : ''}</div>` : ''}${sabores.map(linhaSabor).join('')}`;
        }).join('')
      : '<p class="vazio" style="padding:16px">Nenhum sabor encontrado.</p>';

    if ($('#mp-bordas')) {
      $('#mp-bordas').innerHTML = S.m.bordas.map((bd) => {
        const sel = S.m.bordaId === bd.id;
        return `<button type="button" class="opcao radio${sel ? ' sel' : ''}" data-borda="${esc(bd.id)}" aria-pressed="${sel}">
          <span class="opcao-txt"><strong>${esc(bd.nome)}</strong></span>
          <span class="opcao-preco">${bd.preco ? `+ ${fmtBRL(bd.preco)}` : ''}</span>
          <span class="marcador" aria-hidden="true"></span>
        </button>`;
      }).join('');
    }
    if ($('#mp-adicionais')) {
      $('#mp-adicionais').innerHTML = S.m.adics.map((a) => {
        const q = S.m.adic[a.id] || 0;
        return `<div class="opcao">
          <span class="opcao-txt"><strong>${esc(a.nome)}</strong><small>+ ${fmtBRL(a.preco)}</small></span>
          <div class="qtd qtd-peq">
            <button type="button" data-adic="${esc(a.id)}" data-d="-1" ${q ? '' : 'disabled'} aria-label="Remover ${esc(a.nome)}">−</button>
            <span>${q}</span>
            <button type="button" data-adic="${esc(a.id)}" data-d="1" ${q >= 5 ? 'disabled' : ''} aria-label="Adicionar ${esc(a.nome)}">+</button>
          </div>
        </div>`;
      }).join('');
    }
  }
  $('#mp-qtd').textContent = S.m.qtd;
  $('[data-qtd="-1"]', $('#mp-sheet')).disabled = S.m.qtd <= 1;
  const btn = $('#mp-add');
  const falta = pizza && !S.m.sabores.length;
  btn.disabled = falta;
  btn.textContent = falta ? 'Escolha um sabor' : `Adicionar · ${fmtBRL(precoMontagem() * S.m.qtd)}`;
}

$('#modal-produto').addEventListener('click', (e) => {
  if (e.target.id === 'modal-produto' || e.target.closest('[data-fechar]')) return fecharCamada();
  if (!S.m) return;
  const t = e.target.closest('[data-sabor],[data-borda],[data-adic],[data-qtd],#mp-add');
  if (!t || t.disabled) return;
  if (t.dataset.sabor != null) {
    const id = t.dataset.sabor;
    const max = S.m.p.maxSabores || 1;
    const i = S.m.sabores.indexOf(id);
    if (i >= 0) S.m.sabores.splice(i, 1);
    else if (max === 1) S.m.sabores = [id];
    else if (S.m.sabores.length < max) S.m.sabores.push(id);
  } else if (t.dataset.borda != null) {
    S.m.bordaId = t.dataset.borda;
  } else if (t.dataset.adic != null) {
    const q = (S.m.adic[t.dataset.adic] || 0) + Number(t.dataset.d);
    S.m.adic[t.dataset.adic] = Math.max(0, Math.min(5, q));
  } else if (t.dataset.qtd != null) {
    S.m.qtd = Math.max(1, Math.min(50, S.m.qtd + Number(t.dataset.qtd)));
  } else if (t.id === 'mp-add') {
    return adicionarAoCarrinho();
  }
  renderMontagem();
});
$('#modal-produto').addEventListener('input', (e) => {
  if (!S.m) return;
  if (e.target.id === 'mp-busca-sabor') { S.m.buscaSabor = e.target.value; renderMontagem(); }
  if (e.target.id === 'mp-obs') S.m.obs = e.target.value;
});

function adicionarAoCarrinho() {
  const { p, pizza } = S.m;
  const bruto = {
    produtoId: p.id,
    sabores: pizza ? S.m.sabores.map((id) => ({ id })) : [],
    borda: pizza && S.m.bordaId ? { id: S.m.bordaId } : null,
    adicionais: pizza ? Object.entries(S.m.adic).filter(([, q]) => q > 0).map(([id, qtd]) => ({ id, qtd })) : [],
  };
  const calc = recalcular(bruto);
  if (!calc) { U.toast('Este item ficou indisponível agora há pouco.', 'erro-t'); return; }
  // "Sem borda" com preço zero não precisa aparecer no pedido
  if (calc.borda && !calc.borda.preco && /sem borda/i.test(calc.borda.nome)) calc.borda = null;
  const obs = S.m.obs.trim();
  const qtd = S.m.qtd;

  const igual = !pizza && S.carrinho.find((it) => it.produtoId === p.id && it.tipo === 'simples' && (it.obs || '') === obs);
  if (igual) igual.qtd = Math.min(50, igual.qtd + qtd);
  else S.carrinho.push({ uid: novoUid(), produtoId: p.id, ...bruto, ...calc, obs, qtd });
  salvarCarrinho();
  fecharCamada();
  renderBarra();
  U.toast('Adicionado ao carrinho ✓');
}
const novoUid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// =====================================================================
//  Carrinho
// =====================================================================
function salvarCarrinho() { U.lsSet('pz_carrinho', S.carrinho); }
function salvarCheckout() { U.lsSet('pz_checkout', S.checkout); }

function sincronizarCarrinho() {
  let mudou = false;
  for (const it of S.carrinho) {
    const r = recalcular(it);
    if (!r) { if (!it.indisponivel) { it.indisponivel = true; mudou = true; } continue; }
    if (r.borda && !r.borda.preco && /sem borda/i.test(r.borda.nome)) r.borda = null;
    if (it.indisponivel || it.precoUnit !== r.precoUnit || it.nome !== r.nome) mudou = true;
    Object.assign(it, r, { indisponivel: false });
  }
  if (mudou) salvarCarrinho();
}

const subtotal = () => U.round2(S.carrinho.reduce((t, it) => t + it.precoUnit * it.qtd, 0));
const taxa = () => (S.checkout.tipo === 'entrega' ? U.round2(S.loja.taxaEntrega) : 0);

function renderBarra() {
  const n = S.carrinho.reduce((t, it) => t + it.qtd, 0);
  const barra = $('#barra-carrinho');
  barra.hidden = !n || !S.cliente || S.aba !== 'inicio';
  barra.innerHTML = `<span>Ver carrinho<span class="bc-qtd">${n} ${n === 1 ? 'item' : 'itens'}</span></span><span>${fmtBRL(subtotal())}</span>`;
}

function abrirCarrinho() {
  if (cardapioCarregado()) sincronizarCarrinho();
  // preenche o formulário com o que ficou salvo
  const pagOk = S.loja.pagamentos;
  if (S.checkout.pagamento && !pagOk.includes(S.checkout.pagamento)) S.checkout.pagamento = '';
  $$('input[name="tipo"]').forEach((r) => (r.checked = r.value === S.checkout.tipo));
  $$('[data-end]').forEach((i) => (i.value = S.checkout.endereco?.[i.dataset.end] || ''));
  $('#troco').value = S.checkout.troco || '';
  $('#checkout-erro').textContent = '';
  renderCarrinho();
  abrirCamada($('#tela-carrinho'));
}
$('#barra-carrinho').addEventListener('click', abrirCarrinho);

function detalhesItem(it) {
  const d = [];
  if (it.sabores?.length) d.push(`Sabores: ${it.sabores.map((s) => s.nome).join(', ')}`);
  if (it.borda) d.push(`Borda: ${it.borda.nome}${it.borda.preco ? ` (+${fmtBRL(it.borda.preco)})` : ''}`);
  if (it.adicionais?.length) d.push(`Adicionais: ${it.adicionais.map((a) => `${a.qtd}x ${a.nome}`).join(', ')}`);
  if (it.obs) d.push(`Obs: ${it.obs}`);
  return d;
}

function estadoFinalizar() {
  const st = U.statusLoja(S.loja);
  if (!S.carrinho.length) return { ok: false, texto: 'Carrinho vazio' };
  if (!st.aberta) return { ok: false, texto: st.abre ? `Loja fechada — abrimos ${st.abre}` : 'Loja fechada no momento' };
  if (S.carrinho.some((it) => it.indisponivel)) return { ok: false, texto: 'Remova os itens indisponíveis' };
  if (S.loja.pedidoMinimo && subtotal() < S.loja.pedidoMinimo) return { ok: false, texto: `Pedido mínimo: ${fmtBRL(S.loja.pedidoMinimo)}` };
  return { ok: true, texto: 'Finalizar pedido no WhatsApp' };
}

function renderCarrinho() {
  const vazio = !S.carrinho.length;
  $('#checkout').hidden = vazio;
  $('#carrinho-itens').innerHTML = vazio
    ? '<p class="vazio"><span class="emoji">🛒</span>Seu carrinho está vazio.</p>'
    : S.carrinho.map((it) => `
      <div class="item-carrinho${it.indisponivel ? ' indisp' : ''}">
        <div class="ic-topo"><span>${it.qtd}x ${esc(it.nome)}</span><span>${fmtBRL(it.precoUnit * it.qtd)}</span></div>
        <ul class="ic-detalhes">${detalhesItem(it).map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
        ${it.indisponivel ? '<p class="erro" style="margin-bottom:8px">Este item não está mais disponível. Remova para continuar.</p>' : ''}
        <div class="ic-acoes">
          <div class="qtd qtd-peq">
            <button type="button" data-item="${it.uid}" data-d="-1" ${it.qtd <= 1 ? 'disabled' : ''} aria-label="Diminuir">−</button>
            <span>${it.qtd}</span>
            <button type="button" data-item="${it.uid}" data-d="1" aria-label="Aumentar">+</button>
          </div>
          <button type="button" class="link link-perigo" data-remover="${it.uid}">Remover</button>
        </div>
      </div>`).join('');
  if (vazio) {
    $('#btn-finalizar').disabled = true;
    $('#btn-finalizar').textContent = 'Carrinho vazio';
    return;
  }

  const l = S.loja;
  // entrega desligada no painel → só retirada
  if (!entregaOn() && S.checkout.tipo === 'entrega') { S.checkout.tipo = 'retirada'; salvarCheckout(); }
  $$('input[name="tipo"]').forEach((r) => {
    r.checked = r.value === S.checkout.tipo;
    r.disabled = r.value === 'entrega' && !entregaOn();
  });
  $('#entrega-off').hidden = entregaOn();
  const entrega = S.checkout.tipo === 'entrega';
  $('#campos-entrega').hidden = !entrega;
  $('#info-retirada').hidden = entrega;
  $('#info-retirada').innerHTML = `📍 <b>Retire em:</b> ${esc(l.endereco || 'endereço da pizzaria')}`;

  $('#pagamentos').innerHTML = l.pagamentos
    .filter((p) => U.PAGAMENTOS[p])
    .map((p) => `<label><input type="radio" name="pagamento" value="${p}" ${S.checkout.pagamento === p ? 'checked' : ''}>${
      { pix: '⚡', cartao: '💳', dinheiro: '💵' }[p]} ${U.PAGAMENTOS[p]}</label>`)
    .join('');
  $('#campo-troco').hidden = S.checkout.pagamento !== 'dinheiro';
  $('#info-pix').hidden = S.checkout.pagamento !== 'pix';
  $('#info-pix').innerHTML = l.chavePix
    ? `Chave Pix: <code>${esc(l.chavePix)}</code> <button type="button" class="link" id="copiar-pix">Copiar</button><br><small>Envie o comprovante pelo WhatsApp junto com o pedido.</small>`
    : 'A chave Pix será enviada pelo WhatsApp.';

  const sub = subtotal(), tx = taxa();
  const faltaMin = l.pedidoMinimo && sub < l.pedidoMinimo ? l.pedidoMinimo - sub : 0;
  $('#resumo').innerHTML = `
    <div class="resumo-linha"><span>Subtotal</span><span>${fmtBRL(sub)}</span></div>
    ${entrega ? `<div class="resumo-linha"><span>Taxa de entrega</span><span>${tx ? fmtBRL(tx) : 'Grátis'}</span></div>` : ''}
    <div class="resumo-total"><span>Total</span><span>${fmtBRL(sub + tx)}</span></div>
    ${U.tempoEspera(l, S.checkout.tipo) ? `<p class="resumo-tempo">⏱️ Tempo de espera estimado: <b>${esc(U.tempoEspera(l, S.checkout.tipo))}</b></p>` : ''}
    ${faltaMin ? `<p class="alerta">Pedido mínimo de ${fmtBRL(l.pedidoMinimo)}. Faltam ${fmtBRL(faltaMin)}.</p>` : ''}`;

  const est = estadoFinalizar();
  $('#btn-finalizar').disabled = !est.ok;
  $('#btn-finalizar').textContent = est.texto;
}

$('#tela-carrinho').addEventListener('click', (e) => {
  if (e.target.closest('[data-fechar]')) return fecharCamada();
  const q = e.target.closest('[data-item]');
  if (q) {
    const it = S.carrinho.find((x) => x.uid === q.dataset.item);
    if (it) it.qtd = Math.max(1, Math.min(50, it.qtd + Number(q.dataset.d)));
    salvarCarrinho(); renderCarrinho(); renderBarra();
    return;
  }
  const r = e.target.closest('[data-remover]');
  if (r) {
    S.carrinho = S.carrinho.filter((x) => x.uid !== r.dataset.remover);
    salvarCarrinho(); renderCarrinho(); renderBarra();
    return;
  }
  if (e.target.id === 'copiar-pix') {
    navigator.clipboard?.writeText(S.loja.chavePix).then(() => U.toast('Chave Pix copiada ✓'), () => U.toast('Não foi possível copiar'));
  }
});
$('#tela-carrinho').addEventListener('change', (e) => {
  // Só redesenha ao trocar entrega/retirada ou pagamento. (Redesenhar no "change"
  // dos campos de endereço engolia o toque seguinte — ex.: digitar o bairro e
  // tocar direto no Pix não marcava o Pix.)
  if (e.target.name !== 'tipo' && e.target.name !== 'pagamento') return;
  if (e.target.name === 'tipo') S.checkout.tipo = e.target.value;
  if (e.target.name === 'pagamento') S.checkout.pagamento = e.target.value;
  $('#checkout-erro').textContent = '';
  salvarCheckout();
  renderCarrinho();
});
$('#tela-carrinho').addEventListener('input', (e) => {
  const k = e.target.dataset.end;
  if (k) {
    S.checkout.endereco = { ...S.checkout.endereco, [k]: e.target.value };
    e.target.closest('.campo')?.classList.remove('invalido');
  }
  if (e.target.id === 'troco') S.checkout.troco = e.target.value;
  salvarCheckout();
});

// =====================================================================
//  Finalizar → Firestore → WhatsApp
// =====================================================================
function erroCheckout(msg, foco) {
  $('#checkout-erro').textContent = msg;
  if (foco) {
    foco.closest('.campo')?.classList.add('invalido');
    foco.focus();
    foco.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

function montarPedido() {
  const entrega = S.checkout.tipo === 'entrega';
  const e = S.checkout.endereco || {};
  const sub = subtotal(), tx = taxa();
  const troco = U.parseMoney(S.checkout.troco);
  return {
    clienteTel: S.cliente.tel,
    clienteNome: S.cliente.nome,
    itens: S.carrinho.map((it) => ({
      produtoId: it.produtoId,
      nome: it.nome,
      tipo: it.tipo,
      tamanho: it.tamanho || '',
      sabores: it.sabores || [],
      borda: it.borda || null,
      adicionais: it.adicionais || [],
      obs: it.obs || '',
      qtd: it.qtd,
      precoUnit: it.precoUnit,
      total: U.round2(it.precoUnit * it.qtd),
    })),
    tipo: S.checkout.tipo,
    endereco: entrega
      ? {
          rua: (e.rua || '').trim(), numero: (e.numero || '').trim(), bairro: (e.bairro || '').trim(),
          complemento: (e.complemento || '').trim(), referencia: (e.referencia || '').trim(),
        }
      : null,
    pagamento: S.checkout.pagamento,
    troco: S.checkout.pagamento === 'dinheiro' && troco > 0 ? troco : null,
    subtotal: sub,
    taxaEntrega: tx,
    total: U.round2(sub + tx),
    status: 'novo',
  };
}

/** Grava o pedido + contador + cliente numa única transação. */
async function registrarPedido(pedido) {
  return runTransaction(db, async (tx) => {
    const contRef = doc(db, 'config', 'contador');
    const cliRef = doc(db, 'clientes', pedido.clienteTel);
    const contSnap = await tx.get(contRef);
    const cliSnap = await tx.get(cliRef);
    const numero = (contSnap.exists() ? contSnap.data().ultimoNumero || 0 : 0) + 1;
    const pedRef = doc(collection(db, 'pedidos'));

    tx.set(contRef, { ultimoNumero: numero });
    tx.set(pedRef, { ...pedido, numero, criadoEm: serverTimestamp() });

    const cli = cliSnap.exists() ? cliSnap.data() : null;
    const totalPedidos = (cli?.totalPedidos || 0) + 1;
    const dados = {
      nome: pedido.clienteNome,
      telefone: pedido.clienteTel,
      totalPedidos,
      totalGasto: U.round2((cli?.totalGasto || 0) + pedido.total),
      ultimoPedidoEm: serverTimestamp(),
      ultimosPedidos: [pedRef.id, ...(cli?.ultimosPedidos || [])].slice(0, 20),
    };
    if (pedido.endereco) dados.ultimoEndereco = pedido.endereco;
    if (!cli) {
      tx.set(cliRef, { ...dados, criadoEm: serverTimestamp(), primeiroPedidoEm: serverTimestamp() });
    } else {
      if (!cli.primeiroPedidoEm) dados.primeiroPedidoEm = serverTimestamp();
      tx.update(cliRef, dados);
    }
    const desde = U.toDate(cli?.primeiroPedidoEm) || new Date();
    return { numero, codigo: U.codigoPedido(pedRef.id), totalPedidos, desde };
  });
}

const SEP = '━━━━━━━━━━━━━━';
function montarMensagem(p, info) {
  const L = [];
  L.push(info.codigo ? `🍕 *Código do seu pedido: ${info.codigo}*` : '🍕 *Seu pedido*', '');
  const apelido = (S.cliente?.apelido || '').trim();
  L.push(`👤 *Cliente:* ${p.clienteNome}${apelido ? ` (${apelido})` : ''}`);
  L.push(`📱 *WhatsApp:* ${U.fmtTel(p.clienteTel)}`);
  L.push('', SEP);
  p.itens.forEach((it, i) => {
    if (i) L.push('');
    L.push(`*${it.qtd}x ${it.nome}* — ${fmtBRL(it.total)}`);
    if (it.sabores.length) L.push(`   • Sabores: ${it.sabores.map((s) => s.nome).join(', ')}`);
    if (it.borda) L.push(`   • Borda: ${it.borda.nome}${it.borda.preco ? ` (+${fmtBRL(it.borda.preco)})` : ''}`);
    if (it.adicionais.length) L.push(`   • Adicionais: ${it.adicionais.map((a) => `${a.qtd}x ${a.nome} (+${fmtBRL(a.preco * a.qtd)})`).join(', ')}`);
    if (it.obs) L.push(`   • Obs: ${it.obs}`);
  });
  L.push(SEP, '');
  if (p.tipo === 'entrega') {
    const e = p.endereco;
    L.push('🛵 *Entrega*');
    L.push(`📍 ${e.rua}, ${e.numero} — ${e.bairro}`);
    const extra = [e.complemento && `Complemento: ${e.complemento}`, e.referencia && `Ref.: ${e.referencia}`].filter(Boolean);
    if (extra.length) L.push(`   ${extra.join(' · ')}`);
  } else {
    L.push('🏃 *Retirada no local*');
    if (S.loja.endereco) L.push(`📍 ${S.loja.endereco}`);
  }
  L.push('');
  const pag = p.pagamento === 'dinheiro'
    ? `Dinheiro (${p.troco ? `troco para ${fmtBRL(p.troco)}` : 'sem troco'})`
    : U.PAGAMENTOS[p.pagamento];
  L.push(`💳 *Pagamento:* ${pag}`);
  L.push('', `Subtotal: ${fmtBRL(p.subtotal)}`);
  if (p.tipo === 'entrega') L.push(`Taxa de entrega: ${p.taxaEntrega ? fmtBRL(p.taxaEntrega) : 'Grátis'}`);
  L.push(`*TOTAL: ${fmtBRL(p.total)}*`);
  const tempo = U.tempoEspera(S.loja, p.tipo);
  if (tempo) L.push('', `⏱️ *Tempo de espera estimado:* ${tempo}`);
  return L.join('\n');
}

$('#btn-finalizar').addEventListener('click', async () => {
  $('#checkout-erro').textContent = '';
  const est = estadoFinalizar();
  if (!est.ok) return erroCheckout(est.texto);
  if (S.checkout.tipo === 'entrega') {
    for (const k of ['rua', 'numero', 'bairro']) {
      if (!(S.checkout.endereco?.[k] || '').trim()) {
        return erroCheckout(`Informe ${k === 'numero' ? 'o número' : k === 'rua' ? 'a rua' : 'o bairro'} para a entrega.`, $(`[data-end="${k}"]`));
      }
    }
  }
  if (!S.checkout.pagamento) {
    $('#pagamentos').scrollIntoView({ block: 'center', behavior: 'smooth' });
    return erroCheckout('Escolha a forma de pagamento.');
  }
  const pedido = montarPedido();
  if (pedido.troco && pedido.troco < pedido.total) {
    return erroCheckout(`O troco precisa ser maior que o total (${fmtBRL(pedido.total)}).`, $('#troco'));
  }
  if (!S.loja.whatsapp) return erroCheckout('A pizzaria ainda não configurou o WhatsApp. Tente mais tarde.');

  const btn = $('#btn-finalizar');
  btn.disabled = true;
  btn.textContent = 'Enviando pedido…';

  let info;
  try {
    info = await U.comTimeout(registrarPedido(pedido), 15000);
  } catch (e) {
    console.error('Falha ao registrar pedido', e);
    const seguir = confirm('Não conseguimos registrar o pedido no sistema (verifique sua internet).\n\nDeseja enviar mesmo assim pelo WhatsApp?');
    if (!seguir) { renderCarrinho(); return; }
    info = { numero: null, totalPedidos: (S.cliente.totalPedidos || 0) + 1, desde: U.toDate(S.cliente.primeiroPedidoEm) || new Date() };
  }

  // atualiza dados locais do cliente
  if (info.numero && S.cliente.apelido) salvarApelido(S.cliente.tel, S.cliente.apelido, '');
  S.cliente.totalPedidos = info.totalPedidos;
  if (!S.cliente.primeiroPedidoEm) S.cliente.primeiroPedidoEm = new Date();
  if (pedido.endereco) S.cliente.ultimoEndereco = pedido.endereco;

  const url = `https://wa.me/${S.loja.whatsapp}?text=${encodeURIComponent(montarMensagem(pedido, info))}`;
  S.carrinho = [];
  salvarCarrinho();
  S.checkout.troco = '';
  salvarCheckout();
  renderBarra();

  fecharTodasCamadas();
  $('#sucesso-link').href = url;
  $('#sucesso-texto').innerHTML = `${info.codigo ? `Código do seu pedido: <b>${info.codigo}</b>. ` : ''}Estamos abrindo o WhatsApp com o resumo. É só tocar em <b>enviar</b> ➤`;
  $('#tela-sucesso').hidden = false;
  setTimeout(() => { window.location.href = url; }, 400);
});

$('#sucesso-voltar').addEventListener('click', () => {
  $('#tela-sucesso').hidden = true;
  trocarAba('inicio');
  window.scrollTo({ top: 0 });
});

// =====================================================================
//  Meus pedidos
// =====================================================================
function trocarAba(aba) {
  S.aba = aba;
  $$('.abas [data-aba]').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === aba));
  $('#view-inicio').hidden = aba !== 'inicio';
  $('#view-pedidos').hidden = aba !== 'pedidos';
  renderBarra();
  window.scrollTo({ top: 0 });
  if (aba === 'pedidos') carregarMeusPedidos();
}
$('.abas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-aba]');
  if (b) trocarAba(b.dataset.aba);
});

let meusPedidos = [];
async function carregarMeusPedidos() {
  const lista = $('#lista-pedidos');
  if (!meusPedidos.length) lista.innerHTML = '<span class="sk sk-card"></span><span class="sk sk-card"></span>';
  try {
    const snap = await U.comTimeout(getDoc(doc(db, 'clientes', S.cliente.tel)), 10000);
    const ids = snap.exists() ? snap.data().ultimosPedidos || [] : [];
    const docs = await Promise.all(ids.map((id) => getDoc(doc(db, 'pedidos', id)).catch(() => null)));
    meusPedidos = docs.filter((d) => d?.exists()).map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error(e);
    if (!meusPedidos.length) {
      lista.innerHTML = '<p class="vazio"><span class="emoji">📶</span>Não foi possível carregar seus pedidos. Verifique a internet.</p>';
      return;
    }
  }
  if (!meusPedidos.length) {
    lista.innerHTML = '<p class="vazio"><span class="emoji">🧾</span>Você ainda não fez pedidos por aqui.<br>Que tal começar agora?</p>';
    return;
  }
  lista.innerHTML = meusPedidos.map((p) => {
    const st = U.STATUS[p.status] || U.STATUS.novo;
    const resumo = p.itens.map((i) => `${i.qtd}x ${i.nome}`).join(', ');
    return `<article class="pedido-hist">
      <div class="ph-topo"><strong>Pedido ${U.codigoPedido(p.id)}</strong><span class="status st-${esc(p.status)}">${st.cliente}</span></div>
      <small>${U.fmtDataHora(U.toDate(p.criadoEm))} · ${p.tipo === 'entrega' ? 'Entrega' : 'Retirada'}</small>
      <p class="ph-itens">${esc(resumo)}</p>
      <div class="ph-rodape"><strong>${fmtBRL(p.total)}</strong>
        <button type="button" class="btn btn-sec btn-peq" data-repetir="${esc(p.id)}">🔁 Pedir de novo</button></div>
    </article>`;
  }).join('');
}

$('#lista-pedidos').addEventListener('click', (e) => {
  const b = e.target.closest('[data-repetir]');
  if (!b) return;
  const p = meusPedidos.find((x) => x.id === b.dataset.repetir);
  if (!p) return;
  if (!cardapioCarregado()) { U.toast('Aguarde o cardápio carregar…'); return; }
  let fora = 0;
  for (const it of p.itens) {
    const novo = { uid: novoUid(), produtoId: it.produtoId, sabores: it.sabores || [], borda: it.borda || null, adicionais: it.adicionais || [], obs: it.obs || '', qtd: it.qtd };
    const r = recalcular(novo);
    if (!r) { fora++; continue; }
    if (r.borda && !r.borda.preco && /sem borda/i.test(r.borda.nome)) r.borda = null;
    S.carrinho.push({ ...novo, ...r });
  }
  salvarCarrinho();
  if (fora === p.itens.length) { U.toast('Os itens desse pedido não estão disponíveis agora.', 'erro-t'); return; }
  trocarAba('inicio');
  abrirCarrinho();
  if (fora) U.toast(`${fora} item(ns) não estão disponíveis e ficaram de fora.`);
});

// Fechar modais tocando fora / no X
$('#modal-info').addEventListener('click', (e) => {
  if (e.target.id === 'modal-info' || e.target.closest('[data-fechar]')) fecharCamada();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharCamada(); });

iniciar();
