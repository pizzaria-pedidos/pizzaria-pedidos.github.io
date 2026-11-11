// =====================================================================
//  Painel de controle (somente admin autenticado)
// =====================================================================
import {
  app, db, configurado, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, writeBatch, increment, serverTimestamp, Timestamp,
} from './firebase-config.js?v=4';
// Mesma versão do SDK usada em firebase-config.js
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import * as U from './utils.js?v=4';
import { iniciarCustos, pararCustos, sairCustos, abrirCadeado, custosCardapioMudou } from './custos.js?v=4';

const { esc, fmtBRL } = U;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const auth = getAuth(app);

const S = {
  user: null,
  loja: U.mesclarLoja(),
  categorias: [], produtos: [], sabores: [], bordas: [], adicionais: [],
  clientes: [], pedidos: [], novos: [],
  view: 'pedidos',
  col: 'categorias',
  cliSort: { col: 'ult', dir: -1 },
  som: U.lsGet('pz_admin_som', true),
  unsubs: [],
  unsubDia: null,
  cfgPreenchida: false,
};

if (!configurado) $('#aviso-config').hidden = false;

// =====================================================================
//  Login
// =====================================================================
const ERROS_LOGIN = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
  'auth/network-request-failed': 'Sem conexão com a internet.',
};
$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  garantirAudio();
  const btn = $('#login-btn');
  btn.disabled = true;
  btn.textContent = 'Entrando…';
  $('#login-erro').textContent = '';
  try {
    await signInWithEmailAndPassword(auth, $('#login-email').value.trim(), $('#login-senha').value);
  } catch (err) {
    $('#login-erro').textContent = ERROS_LOGIN[err.code] || `Não foi possível entrar (${err.code || err.message}).`;
  }
  btn.disabled = false;
  btn.textContent = 'Entrar';
});
$('#btn-sair').addEventListener('click', () => { if (confirm('Sair do painel?')) signOut(auth); });

onAuthStateChanged(auth, (user) => {
  if (user) iniciarPainel(user);
  else {
    pararTudo();
    $('#painel').hidden = true;
    $('#tela-login').hidden = false;
  }
});

function pararTudo() {
  S.unsubs.forEach((u) => u());
  S.unsubs = [];
  S.unsubDia?.();
  S.unsubDia = null;
  S.cfgPreenchida = false;
  pararCustos();
}

function tratarErro(e) {
  console.error(e);
  if (e?.code === 'permission-denied') {
    const av = $('#aviso-permissao');
    av.hidden = false;
    av.innerHTML = `🔒 Sem permissão no banco de dados. Confira se o UID abaixo está no arquivo <b>firestore.rules</b> e se as regras foram publicadas:<br><code>${esc(S.user?.uid)}</code>`;
  } else if (e?.code === 'failed-precondition') {
    U.toast('Índice do Firestore ausente — veja o console do navegador.', 'erro-t');
  }
}

// =====================================================================
//  Inicialização / listeners em tempo real
// =====================================================================
function iniciarPainel(user) {
  pararTudo();
  S.user = user;
  $('#tela-login').hidden = true;
  $('#painel').hidden = false;
  $('#cfg-uid').textContent = user.uid;

  S.unsubs.push(onSnapshot(doc(db, 'config', 'loja'), (s) => {
    S.loja = U.mesclarLoja(s.data());
    $('#menu-nome').textContent = S.loja.nome;
    renderBotaoLoja();
    renderBotaoEntrega();
    if (!S.cfgPreenchida) preencherConfig();
    if (S.view === 'clientes') renderClientes();
  }, tratarErro));

  ['categorias', 'produtos', 'sabores', 'bordas', 'adicionais'].forEach((c) => {
    S.unsubs.push(onSnapshot(collection(db, c), (snap) => {
      S[c] = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(U.porOrdem);
      if (S.view === 'cardapio') renderCrud();
      custosCardapioMudou();
    }, tratarErro));
  });

  S.unsubs.push(onSnapshot(collection(db, 'clientes'), (snap) => {
    S.clientes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (S.view === 'clientes') renderClientes();
    if (S.view === 'pedidos') renderPedidos();
  }, tratarErro));

  iniciarCustos({ S, tratarErro, abrirModal, fecharModal, mostrarView });
  ouvirNovos();
  if (!$('#f-data').value) $('#f-data').value = hojeISO();
  ouvirDia();
  mostrarView((location.hash.slice(1) || 'pedidos').split('/')[0]);
  atualizarAvisoSom();
  renderBotaoSom();
}

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ---------- Navegação ----------
function mostrarView(v) {
  if (!['pedidos', 'cardapio', 'clientes', 'config'].includes(v)) v = 'pedidos';
  sairCustos();
  S.view = v;
  $$('.view').forEach((el) => (el.hidden = el.id !== `v-${v}`));
  $$('.menu [data-view]').forEach((b) => b.classList.toggle('ativo', b.dataset.view === v));
  history.replaceState(null, '', `#${v}`);
  if (v === 'pedidos') renderPedidos();
  if (v === 'cardapio') renderCrud();
  if (v === 'clientes') renderClientes();
  if (v === 'config') preencherConfig();
  window.scrollTo({ top: 0 });
}
$('#btn-cadeado').addEventListener('click', abrirCadeado);
$('.menu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-view]');
  if (b) mostrarView(b.dataset.view);
});

// =====================================================================
//  Som de alerta (gerado via Web Audio — sem arquivo)
// =====================================================================
let audioCtx = null;
function garantirAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume().then(atualizarAvisoSom);
  } catch { /* sem áudio */ }
  atualizarAvisoSom();
}
document.addEventListener('pointerdown', garantirAudio);
function atualizarAvisoSom() {
  const precisa = S.user && S.som && (!audioCtx || audioCtx.state !== 'running');
  $('#ativar-som').hidden = !precisa;
}
function tocarAlerta() {
  navigator.vibrate?.([300, 120, 300]);
  if (!S.som || !audioCtx || audioCtx.state !== 'running') return;
  const t0 = audioCtx.currentTime;
  [0, 0.22, 0.44, 0.9, 1.12, 1.34].forEach((t, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'triangle';
    o.frequency.value = i % 3 === 2 ? 1318 : i % 3 === 1 ? 1046 : 784;
    g.gain.setValueAtTime(0.0001, t0 + t);
    g.gain.exponentialRampToValueAtTime(0.5, t0 + t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + t + 0.2);
    o.connect(g).connect(audioCtx.destination);
    o.start(t0 + t);
    o.stop(t0 + t + 0.22);
  });
}
$('#ativar-som').addEventListener('click', () => { garantirAudio(); setTimeout(tocarAlerta, 100); });
function renderBotaoSom() {
  $('#btn-som').textContent = S.som ? '🔔 Som ligado' : '🔕 Som desligado';
}
$('#btn-som').addEventListener('click', () => {
  S.som = !S.som;
  U.lsSet('pz_admin_som', S.som);
  renderBotaoSom();
  atualizarAvisoSom();
  if (S.som) { garantirAudio(); setTimeout(tocarAlerta, 100); }
});

// =====================================================================
//  Pedidos
// =====================================================================
function ouvirNovos() {
  let pronto = false;
  S.unsubs.push(onSnapshot(
    query(collection(db, 'pedidos'), where('status', '==', 'novo')),
    { includeMetadataChanges: true },
    (snap) => {
      S.novos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const n = S.novos.length;
      $('#badge-novos').hidden = !n;
      $('#badge-novos').textContent = n;
      document.title = n ? `(${n}) Novo pedido! — Painel` : 'Painel da pizzaria';
      if (!pronto) {
        if (!snap.metadata.fromCache) pronto = true; // ignora o que já existia ao abrir
        return;
      }
      const chegaram = snap.docChanges().filter((c) => c.type === 'added').map((c) => c.doc.data());
      if (chegaram.length) {
        tocarAlerta();
        const p = chegaram[0];
        U.toast(`🍕 Novo pedido ${U.numPedido(p.numero)} — ${p.clienteNome}`);
      }
    },
    tratarErro,
  ));
}

function ouvirDia() {
  S.unsubDia?.();
  const valor = $('#f-data').value || hojeISO();
  const [y, m, d] = valor.split('-').map(Number);
  const ini = new Date(y, m - 1, d);
  const fim = new Date(y, m - 1, d + 1);
  S.pedidos = [];
  renderPedidos(true);
  S.unsubDia = onSnapshot(
    query(
      collection(db, 'pedidos'),
      where('criadoEm', '>=', Timestamp.fromDate(ini)),
      where('criadoEm', '<', Timestamp.fromDate(fim)),
      orderBy('criadoEm', 'desc'),
    ),
    (snap) => {
      S.pedidos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      S.pedidosOk = true;
      renderPedidos();
    },
    tratarErro,
  );
}
$('#f-data').addEventListener('change', () => { S.pedidosOk = false; ouvirDia(); });
$('#f-status').addEventListener('change', () => renderPedidos());

function itensHTML(itens) {
  return `<ul class="pc-itens">${itens.map((it) => {
    const det = [];
    if (it.sabores?.length) det.push(`Sabores: ${it.sabores.map((s) => s.nome).join(', ')}`);
    if (it.borda) det.push(`Borda: ${it.borda.nome}`);
    if (it.adicionais?.length) det.push(`Adicionais: ${it.adicionais.map((a) => `${a.qtd}x ${a.nome}`).join(', ')}`);
    if (it.obs) det.push(`⚠️ Obs: ${it.obs}`);
    return `<li><b>${it.qtd}x ${esc(it.nome)}</b> — ${fmtBRL(it.total)}${det.map((x) => `<span class="det">${esc(x)}</span>`).join('')}</li>`;
  }).join('')}</ul>`;
}
function enderecoTexto(p) {
  if (p.tipo !== 'entrega' || !p.endereco) return '🏃 Retirada no local';
  const e = p.endereco;
  return `🛵 ${e.rua}, ${e.numero} — ${e.bairro}${e.complemento ? ` · ${e.complemento}` : ''}${e.referencia ? ` · Ref.: ${e.referencia}` : ''}`;
}
function pagamentoTexto(p) {
  if (p.pagamento === 'dinheiro') return `💵 Dinheiro${p.troco ? ` (troco p/ ${fmtBRL(p.troco)})` : ' (sem troco)'}`;
  return `${p.pagamento === 'pix' ? '⚡' : '💳'} ${U.PAGAMENTOS[p.pagamento] || p.pagamento}`;
}

const apelidoDe = (tel) => (S.clientes.find((c) => c.id === tel)?.apelido || '').trim();
const apelidoHTML = (tel) => (apelidoDe(tel) ? ` <span class="apelido">“${esc(apelidoDe(tel))}”</span>` : '');

function pedidoHTML(p, comAcoes = true) {
  const fluxo = U.fluxoStatus(p.tipo);
  const i = fluxo.indexOf(p.status);
  const proximo = i >= 0 && i < fluxo.length - 1 ? fluxo[i + 1] : null;
  const opcoes = [...fluxo, 'cancelado']
    .map((s) => `<option value="${s}" ${s === p.status ? 'selected' : ''}>${U.STATUS[s].nome}</option>`).join('');
  return `<article class="pedido-card ${esc(p.status)}">
    <div class="pc-topo">
      <span class="pc-num">${U.numPedido(p.numero) || '—'}</span>
      <span class="pc-hora">${U.fmtHoraMin(U.toDate(p.criadoEm))}${comAcoes ? '' : ` · ${U.fmtData(U.toDate(p.criadoEm))}`}</span>
      <span class="status st-${esc(p.status)}">${U.STATUS[p.status]?.nome || esc(p.status)}</span>
    </div>
    <div class="pc-cliente">${esc(p.clienteNome)}${apelidoHTML(p.clienteTel)} <small>${U.fmtTel(p.clienteTel)}</small></div>
    <div class="pc-bloco">${esc(enderecoTexto(p))}</div>
    ${itensHTML(p.itens || [])}
    <div class="pc-bloco">${esc(pagamentoTexto(p))}</div>
    <div class="pc-total"><span>Total${p.taxaEntrega ? ` <small style="font-weight:600">(entrega ${fmtBRL(p.taxaEntrega)})</small>` : ''}</span><span>${fmtBRL(p.total)}</span></div>
    ${comAcoes ? `<div class="pc-acoes">
      ${proximo ? `<button type="button" class="btn btn-primario btn-peq" data-avancar="${esc(p.id)}" data-para="${proximo}">${U.STATUS[proximo].nome} →</button>` : ''}
      <select data-status="${esc(p.id)}" aria-label="Mudar status">${opcoes}</select>
      <a class="btn btn-whats btn-peq" href="https://wa.me/${esc(p.clienteTel)}" target="_blank" rel="noopener">WhatsApp</a>
    </div>` : ''}
  </article>`;
}

function renderPedidos(carregando = false) {
  if (S.view !== 'pedidos') return;
  const validos = S.pedidos.filter((p) => p.status !== 'cancelado');
  const fat = validos.reduce((t, p) => t + (p.total || 0), 0);
  $('#stats').innerHTML = `
    <div class="stat"><small>Pedidos</small><strong>${validos.length}</strong></div>
    <div class="stat"><small>Faturamento</small><strong>${fmtBRL(fat)}</strong></div>
    <div class="stat"><small>Ticket médio</small><strong>${fmtBRL(validos.length ? fat / validos.length : 0)}</strong></div>`;
  const filtro = $('#f-status').value;
  const lista = S.pedidos.filter((p) => !filtro || p.status === filtro);
  const el = $('#lista-pedidos-admin');
  if (carregando || !S.pedidosOk) {
    el.innerHTML = '<span class="sk sk-card"></span><span class="sk sk-card"></span>';
    return;
  }
  el.innerHTML = lista.length
    ? lista.map((p) => pedidoHTML(p)).join('')
    : `<p class="vazio"><span class="emoji">🍕</span>${filtro ? 'Nenhum pedido com esse status.' : 'Nenhum pedido neste dia ainda.'}</p>`;
}

async function mudarStatus(id, novo) {
  const p = S.pedidos.find((x) => x.id === id);
  if (!p || p.status === novo) return;
  if (novo === 'cancelado' && !confirm(`Cancelar o pedido ${U.numPedido(p.numero)} de ${p.clienteNome}?`)) {
    renderPedidos();
    return;
  }
  const batch = writeBatch(db);
  batch.update(doc(db, 'pedidos', id), { status: novo, atualizadoEm: serverTimestamp() });
  // pedido cancelado não conta nas estatísticas do cliente
  const cli = doc(db, 'clientes', p.clienteTel);
  if (novo === 'cancelado' && p.status !== 'cancelado') {
    batch.set(cli, { totalPedidos: increment(-1), totalGasto: increment(-(p.total || 0)) }, { merge: true });
  } else if (p.status === 'cancelado' && novo !== 'cancelado') {
    batch.set(cli, { totalPedidos: increment(1), totalGasto: increment(p.total || 0) }, { merge: true });
  }
  try {
    await batch.commit();
    U.toast(`${U.numPedido(p.numero)} → ${U.STATUS[novo].nome}`);
  } catch (e) {
    tratarErro(e);
    U.toast('Não foi possível atualizar o status.', 'erro-t');
  }
}
$('#lista-pedidos-admin').addEventListener('click', (e) => {
  const b = e.target.closest('[data-avancar]');
  if (b) mudarStatus(b.dataset.avancar, b.dataset.para);
});
$('#lista-pedidos-admin').addEventListener('change', (e) => {
  if (e.target.dataset.status) mudarStatus(e.target.dataset.status, e.target.value);
});

// ---------- Abrir / fechar loja ----------
function renderBotaoLoja() {
  const st = U.statusLoja(S.loja);
  $$('[data-toggle-loja]').forEach((b) => {
    if (S.loja.fechadoManual) {
      b.className = `btn ${b.id === 'cfg-fechar' ? 'btn-bloco' : 'btn-peq'} btn-loja-fechada`;
      b.textContent = '🔒 Loja fechada manualmente — toque para reabrir';
    } else {
      b.className = `btn ${b.id === 'cfg-fechar' ? 'btn-bloco' : 'btn-peq'} ${st.aberta ? 'btn-loja-aberta' : 'btn-loja-fechada'}`;
      b.textContent = `${st.aberta ? '🟢' : '🔴'} ${st.texto} · Fechar agora`;
    }
  });
}
setInterval(() => S.user && renderBotaoLoja(), 60_000);

// ---------- Ligar / desligar entrega (ex.: "hoje só retirada") ----------
function renderBotaoEntrega() {
  const on = S.loja.entregaAtiva !== false;
  $$('[data-toggle-entrega]').forEach((b) => {
    b.className = `btn ${b.id === 'cfg-entrega' ? 'btn-bloco' : 'btn-peq'} ${on ? 'btn-loja-aberta' : 'btn-loja-fechada'}`;
    b.textContent = on ? '🛵 Entrega ligada · Desligar' : '🏃 Só retirada hoje · Ligar entrega';
  });
}
$$('[data-toggle-entrega]').forEach((b) => b.addEventListener('click', async () => {
  const ligar = S.loja.entregaAtiva === false;
  if (!ligar && !confirm('Desligar a entrega? Os clientes só vão conseguir pedir para RETIRAR no local até você ligar de novo.')) return;
  try {
    await setDoc(doc(db, 'config', 'loja'), { entregaAtiva: ligar }, { merge: true });
    U.toast(ligar ? 'Entrega ligada 🛵' : 'Entrega desligada — só retirada 🏃');
  } catch (e) { tratarErro(e); U.toast('Erro ao salvar.', 'erro-t'); }
}));
$$('[data-toggle-loja]').forEach((b) => b.addEventListener('click', async () => {
  const fechar = !S.loja.fechadoManual;
  if (fechar && !confirm('Fechar a loja agora? Os clientes não vão conseguir finalizar pedidos até você reabrir.')) return;
  try {
    await setDoc(doc(db, 'config', 'loja'), { fechadoManual: fechar }, { merge: true });
    U.toast(fechar ? 'Loja fechada 🔒' : 'Loja reaberta (segue o horário) 🟢');
  } catch (e) { tratarErro(e); U.toast('Erro ao salvar.', 'erro-t'); }
}));

// =====================================================================
//  Cardápio (CRUD genérico)
// =====================================================================
const tamanhosPizza = () => [...new Set(S.produtos.filter((p) => p.tipo === 'pizza' && p.tamanho).map((p) => p.tamanho))];
const nomeCategoria = (id) => S.categorias.find((c) => c.id === id)?.nome || 'Sem categoria';

const SCHEMAS = {
  categorias: {
    singular: 'categoria', toggle: 'ativo',
    campos: [
      { k: 'nome', t: 'text', label: 'Nome', req: true, ph: 'Ex.: Pizzas' },
      { k: 'ativo', t: 'bool', label: 'Ativa (aparece no cardápio)', def: true },
    ],
    sub: (c) => `${S.produtos.filter((p) => p.categoriaId === c.id).length} produto(s)`,
  },
  produtos: {
    singular: 'produto', toggle: 'disponivel',
    campos: [
      { k: 'nome', t: 'text', label: 'Nome', req: true, ph: 'Ex.: Pizza Grande 35cm' },
      { k: 'descricao', t: 'textarea', label: 'Descrição curta' },
      { k: 'categoriaId', t: 'categoria', label: 'Categoria', req: true },
      { k: 'tipo', t: 'select', label: 'Tipo', def: 'simples', opcoes: { simples: 'Item simples (bebida, porção…)', pizza: 'Pizza (cliente escolhe sabores)' } },
      { k: 'fotoUrl', t: 'url', label: 'Foto (URL)', ph: 'https://…' },
      { k: 'preco', t: 'money', label: 'Preço (R$)', ajuda: 'Em pizzas, o preço vem dos sabores. Este valor só é usado se o sabor não tiver preço para este tamanho.' },
      { k: 'tamanho', t: 'text', label: 'Tamanho', pizza: true, ph: 'Ex.: Grande', ajuda: 'Nome usado na tabela de preços dos sabores (ex.: Média, Grande).' },
      { k: 'fatias', t: 'int', label: 'Nº de fatias', pizza: true, def: 8 },
      { k: 'maxSabores', t: 'int', label: 'Máximo de sabores', pizza: true, def: 2, min: 1 },
      { k: 'usaBordas', t: 'bool', label: 'Oferecer bordas', pizza: true, def: true },
      { k: 'usaAdicionais', t: 'bool', label: 'Oferecer adicionais', pizza: true, def: true },
      { k: 'saboresPermitidos', t: 'sabores', label: 'Sabores permitidos', pizza: true, ajuda: 'Nenhum marcado = todos os sabores.' },
      { k: 'destaque', t: 'bool', label: '⭐ Mostrar nos destaques', def: false },
      { k: 'disponivel', t: 'bool', label: 'Disponível', def: true },
    ],
    sub: (p) => [
      nomeCategoria(p.categoriaId),
      p.tipo === 'pizza' ? `🍕 ${p.tamanho || 'sem tamanho'} · até ${p.maxSabores || 1} sabores` : fmtBRL(p.preco),
      p.destaque ? '⭐ destaque' : '',
    ].filter(Boolean).join(' · '),
  },
  sabores: {
    singular: 'sabor', toggle: 'disponivel',
    campos: [
      { k: 'nome', t: 'text', label: 'Nome', req: true, ph: 'Ex.: Calabresa' },
      { k: 'ingredientes', t: 'textarea', label: 'Ingredientes' },
      { k: 'fotoUrl', t: 'url', label: 'Foto (URL)', ph: 'https://…' },
      { k: 'precos', t: 'precos', label: 'Preço por tamanho (R$)' },
      { k: 'disponivel', t: 'bool', label: 'Disponível', def: true },
    ],
    sub: (s) => [
      Object.entries(s.precos || {}).map(([t, v]) => `${t} ${fmtBRL(v)}`).join(' · ') || 'sem preço',
      s.ingredientes || '',
    ].filter(Boolean).join(' — '),
  },
  bordas: {
    singular: 'borda', toggle: 'disponivel',
    campos: [
      { k: 'nome', t: 'text', label: 'Nome', req: true, ph: 'Ex.: Catupiry' },
      { k: 'preco', t: 'money', label: 'Preço adicional (R$)' },
      { k: 'disponivel', t: 'bool', label: 'Disponível', def: true },
    ],
    sub: (b) => (b.preco ? `+ ${fmtBRL(b.preco)}` : 'Grátis'),
  },
  adicionais: {
    singular: 'adicional', toggle: 'disponivel',
    campos: [
      { k: 'nome', t: 'text', label: 'Nome', req: true, ph: 'Ex.: Bacon extra' },
      { k: 'preco', t: 'money', label: 'Preço (R$)' },
      { k: 'disponivel', t: 'bool', label: 'Disponível', def: true },
    ],
    sub: (a) => `+ ${fmtBRL(a.preco)}`,
  },
};

S.filtroCat = '';
$('#subabas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-col]');
  if (!b) return;
  S.col = b.dataset.col;
  $$('#subabas button').forEach((x) => x.classList.toggle('ativo', x === b));
  $('#crud-busca').value = '';
  renderCrud();
});
$('#crud-busca').addEventListener('input', () => renderCrud());
$('#crud-novo').addEventListener('click', () => abrirForm(S.col, null));

function itensDaColecao() {
  const b = U.norm($('#crud-busca').value.trim());
  let itens = [...S[S.col]];
  if (S.col === 'produtos') {
    const ordemCat = (id) => S.categorias.find((c) => c.id === id)?.ordem ?? 9999;
    itens.sort((a, c) => ordemCat(a.categoriaId) - ordemCat(c.categoriaId) || U.porOrdem(a, c));
    if (S.filtroCat) itens = itens.filter((p) => p.categoriaId === S.filtroCat);
  }
  if (b) itens = itens.filter((x) => U.norm(`${x.nome} ${x.ingredientes || ''} ${x.descricao || ''}`).includes(b));
  return itens;
}

/** Grupo usado para reordenar (produtos reordenam dentro da categoria) */
function grupoDe(item) {
  const todos = S.col === 'produtos'
    ? S.produtos.filter((p) => p.categoriaId === item.categoriaId)
    : [...S[S.col]];
  return todos.sort(U.porOrdem);
}

function renderCrud() {
  if (S.view !== 'cardapio') return;
  const sch = SCHEMAS[S.col];
  const itens = itensDaColecao();
  const busca = $('#crud-busca').value.trim();

  // filtros/ações extras
  let extra = '';
  if (S.col === 'produtos') {
    extra = `<select class="input" id="crud-cat" aria-label="Filtrar por categoria"><option value="">Todas as categorias</option>${
      S.categorias.map((c) => `<option value="${esc(c.id)}" ${S.filtroCat === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select>`;
  }
  if (S.col === 'sabores' && busca && itens.length) {
    extra = `<span>${itens.length} sabor(es) com “${esc(busca)}”:</span>
      <button type="button" class="btn btn-perigo btn-peq" data-massa="false">Desativar todos</button>
      <button type="button" class="btn btn-sec btn-peq" data-massa="true">Ativar todos</button>`;
  }
  if (S.col === 'sabores' && !tamanhosPizza().length) {
    extra += '<p class="aviso">Cadastre primeiro um <b>produto do tipo pizza</b> com tamanho (ex.: Grande) para definir os preços dos sabores.</p>';
  }
  $('#crud-extra').innerHTML = extra;
  $('#crud-extra').hidden = !extra;

  if (!itens.length) {
    $('#crud-lista').innerHTML = `<p class="vazio"><span class="emoji">📋</span>${busca ? 'Nada encontrado.' : `Nenhum(a) ${sch.singular} cadastrado(a). Toque em “+ Novo”.`}</p>`;
    return;
  }
  let catAtual = null;
  $('#crud-lista').innerHTML = itens.map((it) => {
    let cab = '';
    if (S.col === 'produtos' && it.categoriaId !== catAtual) {
      catAtual = it.categoriaId;
      cab = `<p class="crud-grupo">${esc(nomeCategoria(catAtual))}</p>`;
    }
    const grupo = grupoDe(it);
    const idx = grupo.findIndex((x) => x.id === it.id);
    const on = it[sch.toggle] !== false;
    return `${cab}<div class="crud-item ${on ? '' : 'off'}">
      <div class="crud-ordem">
        <button type="button" data-mover="-1" data-id="${esc(it.id)}" ${idx <= 0 || busca ? 'disabled' : ''} aria-label="Subir">▲</button>
        <button type="button" data-mover="1" data-id="${esc(it.id)}" ${idx >= grupo.length - 1 || busca ? 'disabled' : ''} aria-label="Descer">▼</button>
      </div>
      <div class="crud-info"><strong>${esc(it.nome)}</strong><small>${esc(sch.sub(it))}</small></div>
      <label class="switch" title="${on ? 'Desativar' : 'Ativar'}"><input type="checkbox" data-toggle="${esc(it.id)}" ${on ? 'checked' : ''} aria-label="${esc(it.nome)} ${sch.toggle === 'ativo' ? 'ativa' : 'disponível'}"><span></span></label>
      <button type="button" class="btn btn-sec btn-peq" data-editar="${esc(it.id)}">Editar</button>
    </div>`;
  }).join('');
}

$('#crud-extra').addEventListener('change', (e) => {
  if (e.target.id === 'crud-cat') { S.filtroCat = e.target.value; renderCrud(); }
});
$('#crud-extra').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-massa]');
  if (!b) return;
  const valor = b.dataset.massa === 'true';
  const itens = itensDaColecao();
  const batch = writeBatch(db);
  itens.forEach((s) => batch.update(doc(db, 'sabores', s.id), { disponivel: valor }));
  try {
    await batch.commit();
    U.toast(`${itens.length} sabor(es) ${valor ? 'ativado(s)' : 'desativado(s)'}`);
  } catch (err) { tratarErro(err); U.toast('Erro ao salvar.', 'erro-t'); }
});

$('#crud-lista').addEventListener('change', async (e) => {
  const id = e.target.dataset.toggle;
  if (!id) return;
  const campo = SCHEMAS[S.col].toggle;
  try {
    await updateDoc(doc(db, S.col, id), { [campo]: e.target.checked });
  } catch (err) { tratarErro(err); U.toast('Erro ao salvar.', 'erro-t'); e.target.checked = !e.target.checked; }
});
$('#crud-lista').addEventListener('click', async (e) => {
  const ed = e.target.closest('[data-editar]');
  if (ed) return abrirForm(S.col, S[S.col].find((x) => x.id === ed.dataset.editar));
  const mv = e.target.closest('[data-mover]');
  if (mv) {
    const item = S[S.col].find((x) => x.id === mv.dataset.id);
    const grupo = grupoDe(item);
    const i = grupo.findIndex((x) => x.id === item.id);
    const j = i + Number(mv.dataset.mover);
    if (j < 0 || j >= grupo.length) return;
    [grupo[i], grupo[j]] = [grupo[j], grupo[i]];
    const batch = writeBatch(db);
    grupo.forEach((x, k) => batch.update(doc(db, S.col, x.id), { ordem: k }));
    try { await batch.commit(); } catch (err) { tratarErro(err); U.toast('Erro ao reordenar.', 'erro-t'); }
  }
});

// ---------- Formulário genérico ----------
function campoHTML(c, v) {
  const cls = c.pizza ? 'so-pizza' : '';
  const ajuda = c.ajuda ? `<small>${esc(c.ajuda)}</small>` : '';
  switch (c.t) {
    case 'textarea':
      return `<label class="campo ${cls}"><span>${c.label}</span><textarea name="${c.k}" maxlength="300">${esc(v || '')}</textarea>${ajuda}</label>`;
    case 'money':
      return `<label class="campo ${cls}"><span>${c.label}</span><input name="${c.k}" inputmode="decimal" placeholder="0,00" value="${esc(U.moneyInput(v))}">${ajuda}</label>`;
    case 'int':
      return `<label class="campo ${cls}"><span>${c.label}</span><input name="${c.k}" type="number" inputmode="numeric" min="${c.min ?? 0}" value="${esc(v ?? '')}">${ajuda}</label>`;
    case 'bool':
      return `<label class="check ${cls}"><input type="checkbox" name="${c.k}" ${v ? 'checked' : ''}> ${c.label}</label>`;
    case 'select':
      return `<label class="campo ${cls}"><span>${c.label}</span><select name="${c.k}">${Object.entries(c.opcoes).map(([k, n]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${n}</option>`).join('')}</select>${ajuda}</label>`;
    case 'categoria':
      return `<label class="campo ${cls}"><span>${c.label}</span><select name="${c.k}"><option value="">Escolha…</option>${S.categorias.map((cat) => `<option value="${esc(cat.id)}" ${v === cat.id ? 'selected' : ''}>${esc(cat.nome)}</option>`).join('')}</select>${ajuda}</label>`;
    case 'precos': {
      const tams = tamanhosPizza();
      Object.keys(v || {}).forEach((t) => { if (!tams.includes(t)) tams.push(t); });
      return `<div class="campo ${cls}"><span>${c.label}</span>${tams.length
        ? `<div class="precos-tamanho">${tams.map((t) => `<label class="campo" style="margin:0"><span style="font-weight:600">${esc(t)}</span><input data-tam="${esc(t)}" inputmode="decimal" placeholder="não vende" value="${esc(U.moneyInput(v?.[t]))}"></label>`).join('')}</div><small>Deixe vazio para não oferecer o sabor naquele tamanho.</small>`
        : '<small>Nenhum tamanho de pizza cadastrado ainda (crie um produto do tipo pizza).</small>'}</div>`;
    }
    case 'sabores':
      return `<div class="campo ${cls}"><span>${c.label}</span><div class="lista-checks">${
        S.sabores.map((s) => `<label class="check"><input type="checkbox" name="saboresPermitidos" value="${esc(s.id)}" ${(v || []).includes(s.id) ? 'checked' : ''}> ${esc(s.nome)}</label>`).join('') || '<small>Nenhum sabor cadastrado.</small>'
      }</div>${ajuda}</div>`;
    default:
      return `<label class="campo ${cls}"><span>${c.label}${c.req ? ' *' : ''}</span><input name="${c.k}" type="${c.t === 'url' ? 'url' : 'text'}" maxlength="${c.t === 'url' ? 500 : 80}" placeholder="${esc(c.ph || '')}" value="${esc(v || '')}">${ajuda}</label>`;
  }
}

function abrirModal(titulo, corpo, rodape) {
  $('#modal-titulo').textContent = titulo;
  $('#modal-corpo').innerHTML = corpo;
  $('#modal-rodape').innerHTML = rodape;
  $('#modal-rodape').hidden = !rodape;
  $('#modal').hidden = false;
  document.body.classList.add('travado');
}
function fecharModal() {
  $('#modal').hidden = true;
  document.body.classList.remove('travado');
}
$('#modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal' || e.target.closest('[data-fechar]')) fecharModal();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) fecharModal(); });

function abrirForm(col, item) {
  const sch = SCHEMAS[col];
  const v = item || {};
  if (!item && col === 'produtos' && S.filtroCat) v.categoriaId = S.filtroCat;
  const corpo = `<form id="form-crud" class="form-grade" novalidate>${
    sch.campos.map((c) => campoHTML(c, v[c.k] ?? c.def)).join('')
  }<p class="erro" id="crud-erro"></p></form>`;
  const rodape = `${item ? '<button type="button" class="btn btn-perigo" id="crud-excluir">Excluir</button>' : ''}
    <button type="button" class="btn btn-sec" data-fechar>Cancelar</button>
    <button type="button" class="btn btn-primario" id="crud-salvar">Salvar</button>`;
  abrirModal(`${item ? 'Editar' : 'Novo(a)'} ${sch.singular}`, corpo, rodape);

  const form = $('#form-crud');
  const atualizarTipo = () => {
    const pizza = form.elements.tipo?.value === 'pizza';
    $$('.so-pizza', form).forEach((el) => (el.hidden = !pizza));
  };
  form.elements.tipo?.addEventListener('change', atualizarTipo);
  atualizarTipo();
  form.addEventListener('submit', (e) => e.preventDefault());

  $('#crud-salvar').addEventListener('click', () => salvarForm(col, item, form));
  $('#crud-excluir')?.addEventListener('click', () => excluirItem(col, item));
  setTimeout(() => form.elements.nome?.focus(), 50);
}

async function salvarForm(col, item, form) {
  const sch = SCHEMAS[col];
  const erro = $('#crud-erro');
  const dados = {};
  const pizza = form.elements.tipo?.value === 'pizza';
  for (const c of sch.campos) {
    if (c.pizza && !pizza) continue;
    const el = form.elements[c.k];
    switch (c.t) {
      case 'money': dados[c.k] = U.parseMoney(el.value); break;
      case 'int': dados[c.k] = Math.max(c.min ?? 0, parseInt(el.value, 10) || c.def || 0); break;
      case 'bool': dados[c.k] = el.checked; break;
      case 'precos':
        dados.precos = {};
        $$('[data-tam]', form).forEach((i) => {
          const n = U.parseMoney(i.value);
          if (n > 0) dados.precos[i.dataset.tam] = n;
        });
        break;
      case 'sabores':
        dados.saboresPermitidos = $$('input[name="saboresPermitidos"]:checked', form).map((i) => i.value);
        break;
      default: dados[c.k] = (el?.value || '').trim();
    }
  }
  if (!dados.nome) { erro.textContent = 'Informe o nome.'; return; }
  if (col === 'produtos') {
    if (!dados.categoriaId) { erro.textContent = 'Escolha a categoria.'; return; }
    if (pizza && !dados.tamanho) { erro.textContent = 'Informe o tamanho da pizza (ex.: Grande).'; return; }
    if (!pizza && !(dados.preco > 0)) { erro.textContent = 'Informe o preço.'; return; }
  }
  if (col === 'sabores' && !Object.keys(dados.precos).length && tamanhosPizza().length) {
    if (!confirm('Esse sabor está sem preço em todos os tamanhos e não vai aparecer para o cliente. Salvar mesmo assim?')) return;
  }

  const btn = $('#crud-salvar');
  btn.disabled = true;
  try {
    if (item) {
      await updateDoc(doc(db, col, item.id), dados);
    } else {
      const ordem = Math.max(-1, ...S[col].map((x) => x.ordem ?? 0)) + 1;
      await addDoc(collection(db, col), { ...dados, ordem });
    }
    fecharModal();
    U.toast('Salvo ✓');
  } catch (e) {
    tratarErro(e);
    erro.textContent = 'Não foi possível salvar. Verifique a conexão e as permissões.';
    btn.disabled = false;
  }
}

async function excluirItem(col, item) {
  let aviso = `Excluir “${item.nome}”? Isso não pode ser desfeito.`;
  if (col === 'categorias') {
    const n = S.produtos.filter((p) => p.categoriaId === item.id).length;
    if (n) aviso += `\n\nAtenção: ${n} produto(s) dessa categoria vão sumir do cardápio.`;
  }
  aviso += '\n\nDica: para tirar do cardápio só por um tempo, use o botão de ativar/desativar.';
  if (!confirm(aviso)) return;
  try {
    await deleteDoc(doc(db, col, item.id));
    fecharModal();
    U.toast('Excluído');
  } catch (e) { tratarErro(e); U.toast('Erro ao excluir.', 'erro-t'); }
}

// =====================================================================
//  Clientes
// =====================================================================
function etiqueta(c) {
  const n = c.totalPedidos || 0;
  if (n >= S.loja.limiteVip) return { k: 'vip', html: '<span class="tag tag-vip">⭐ VIP</span>' };
  if (n >= S.loja.limiteRecorrente) return { k: 'recorrente', html: '<span class="tag tag-recorrente">Recorrente</span>' };
  if (n >= 1) return { k: 'novo', html: '<span class="tag tag-novo">Novo</span>' };
  return { k: 'zero', html: '<span class="tag tag-zero">Sem pedidos</span>' };
}
function diasSemPedir(ult) {
  return ult ? Math.floor((Date.now() - ult.getTime()) / 86_400_000) : null;
}

function linhasClientes() {
  return S.clientes.map((c) => {
    const ult = U.toDate(c.ultimoPedidoEm);
    const dias = diasSemPedir(ult);
    return {
      ...c,
      telefone: c.telefone || c.id,
      totalPedidos: c.totalPedidos || 0,
      totalGasto: U.round2(c.totalGasto || 0),
      ticket: c.totalPedidos ? c.totalGasto / c.totalPedidos : 0,
      prim: U.toDate(c.primeiroPedidoEm),
      ult,
      dias,
      sumido: dias != null && dias > S.loja.diasSumido,
      etq: etiqueta(c),
    };
  });
}

function renderClientes() {
  if (S.view !== 'clientes') return;
  const b = U.norm($('#cli-busca').value.trim());
  const dig = $('#cli-busca').value.replace(/\D/g, '');
  const filtro = $('#cli-filtro').value;
  let rows = linhasClientes();
  if (b) rows = rows.filter((r) => U.norm(`${r.nome} ${r.apelido || ''}`).includes(b) || (dig && r.telefone.includes(dig)));
  if (filtro === 'sumido') rows = rows.filter((r) => r.sumido);
  else if (filtro) rows = rows.filter((r) => r.etq.k === filtro);

  const { col, dir } = S.cliSort;
  rows.sort((a, c) => {
    let x = a[col], y = c[col];
    if (x instanceof Date || y instanceof Date) { x = x?.getTime() ?? -Infinity; y = y?.getTime() ?? -Infinity; }
    if (typeof x === 'string') return x.localeCompare(y, 'pt-BR') * dir;
    return ((x ?? 0) - (y ?? 0)) * dir;
  });

  $$('#tabela-clientes [data-sort]').forEach((bt) => {
    bt.classList.toggle('ord', bt.dataset.sort === col);
    bt.classList.toggle('asc', bt.dataset.sort === col && dir === 1);
  });
  const sumidos = linhasClientes().filter((r) => r.sumido).length;
  $('#cli-resumo').textContent = `${S.clientes.length} clientes${sumidos ? ` · ${sumidos} sumidos` : ''}`;

  $('#tabela-clientes tbody').innerHTML = rows.length
    ? rows.map((r) => `<tr data-cli="${esc(r.id)}" class="${r.sumido ? 'sumido' : ''}">
        <td><b>${esc(r.nome)}</b>${apelidoHTML(r.id)} ${r.etq.html} ${r.sumido ? `<span class="tag tag-sumido">sumido há ${r.dias}d</span>` : ''}</td>
        <td>${U.fmtTel(r.telefone)}</td>
        <td class="num">${r.totalPedidos}</td>
        <td class="num">${fmtBRL(r.totalGasto)}</td>
        <td class="num">${fmtBRL(r.ticket)}</td>
        <td>${U.fmtData(r.prim)}</td>
        <td>${r.ult ? `${U.fmtData(r.ult)} <small style="color:var(--texto-2)">(${r.dias === 0 ? 'hoje' : `${r.dias}d`})</small>` : '—'}</td>
      </tr>`).join('')
    : '<tr><td colspan="7" class="vazio">Nenhum cliente encontrado.</td></tr>';
}
$('#cli-busca').addEventListener('input', renderClientes);
$('#cli-filtro').addEventListener('change', renderClientes);
$('#tabela-clientes thead').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sort]');
  if (!b) return;
  const col = b.dataset.sort;
  S.cliSort = { col, dir: S.cliSort.col === col ? -S.cliSort.dir : col === 'nome' ? 1 : -1 };
  renderClientes();
});
$('#tabela-clientes tbody').addEventListener('click', (e) => {
  const tr = e.target.closest('[data-cli]');
  if (tr) abrirCliente(tr.dataset.cli);
});

async function abrirCliente(id) {
  const r = linhasClientes().find((x) => x.id === id);
  if (!r) return;
  const e = r.ultimoEndereco;
  abrirModal(r.apelido ? `${r.nome} “${r.apelido}”` : r.nome, `
    <p style="margin-bottom:10px">${r.etq.html} ${r.sumido ? `<span class="tag tag-sumido">sumido há ${r.dias} dias</span>` : ''}</p>
    <div class="stats">
      <div class="stat"><small>Pedidos</small><strong>${r.totalPedidos}</strong></div>
      <div class="stat"><small>Total gasto</small><strong>${fmtBRL(r.totalGasto)}</strong></div>
      <div class="stat"><small>Ticket médio</small><strong>${fmtBRL(r.ticket)}</strong></div>
    </div>
    <div class="pc-bloco" style="margin-bottom:8px">📱 ${U.fmtTel(r.telefone)}<br>
      📅 Cliente desde ${U.fmtData(r.prim || U.toDate(r.criadoEm))} · último pedido ${U.fmtData(r.ult)}</div>
    <div class="pc-bloco" style="margin-bottom:16px">📍 ${e ? esc(`${e.rua}, ${e.numero} — ${e.bairro}${e.complemento ? ` · ${e.complemento}` : ''}${e.referencia ? ` · Ref.: ${e.referencia}` : ''}`) : 'Nenhum endereço salvo'}</div>
    <h3 style="margin-bottom:10px">Histórico de pedidos</h3>
    <div id="cli-historico" class="lista-pedidos" style="grid-template-columns:1fr"><span class="sk sk-card"></span></div>`,
    `<a class="btn btn-whats btn-bloco" href="https://wa.me/${esc(r.telefone)}" target="_blank" rel="noopener">Chamar no WhatsApp</a>`);
  try {
    const snap = await getDocs(query(collection(db, 'pedidos'), where('clienteTel', '==', r.telefone)));
    const peds = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (U.toDate(b.criadoEm)?.getTime() || 0) - (U.toDate(a.criadoEm)?.getTime() || 0));
    $('#cli-historico').innerHTML = peds.length
      ? peds.map((p) => pedidoHTML(p, false)).join('')
      : '<p class="vazio">Nenhum pedido ainda.</p>';
  } catch (err) {
    tratarErro(err);
    $('#cli-historico').innerHTML = '<p class="erro">Não foi possível carregar o histórico.</p>';
  }
}

// =====================================================================
//  Ajustes
// =====================================================================
function preencherConfig() {
  const f = $('#form-config');
  const l = S.loja;
  S.cfgPreenchida = true;
  f.elements.nome.value = l.nome;
  f.elements.logoUrl.value = l.logoUrl;
  f.elements.whatsapp.value = l.whatsapp ? U.fmtTel(l.whatsapp) : '';
  f.elements.endereco.value = l.endereco;
  f.elements.taxaEntrega.value = U.moneyInput(l.taxaEntrega);
  f.elements.pedidoMinimo.value = U.moneyInput(l.pedidoMinimo);
  f.elements.chavePix.value = l.chavePix;
  f.elements.ocultarIndisponiveis.checked = !!l.ocultarIndisponiveis;
  f.elements.limiteRecorrente.value = l.limiteRecorrente;
  f.elements.limiteVip.value = l.limiteVip;
  f.elements.diasSumido.value = l.diasSumido;
  $('#cfg-regra').innerHTML = Object.entries(U.REGRAS_PRECO)
    .map(([k, r]) => `<option value="${k}" ${l.regraPrecoPizza === k ? 'selected' : ''}>${r.nome}</option>`).join('');
  $('#cfg-pagamentos').innerHTML = Object.entries(U.PAGAMENTOS)
    .map(([k, n]) => `<label class="check"><input type="checkbox" name="pagamentos" value="${k}" ${l.pagamentos.includes(k) ? 'checked' : ''}> ${n}</label>`).join('');
  $('#cfg-horarios').innerHTML = U.ORDEM_SEMANA.map((d) => {
    const h = l.horarios[d] || {};
    return `<div class="horario-linha" data-dia="${d}">
      <label class="check"><input type="checkbox" data-h="aberto" ${h.aberto ? 'checked' : ''}> ${U.DIAS_NOME[d]}</label>
      <input type="time" data-h="abre" value="${esc(h.abre || '18:00')}" aria-label="${U.DIAS_NOME[d]} abre">
      <input type="time" data-h="fecha" value="${esc(h.fecha || '23:00')}" aria-label="${U.DIAS_NOME[d]} fecha">
    </div>`;
  }).join('');
  $('#cfg-horarios').insertAdjacentHTML('beforeend', '<small style="color:var(--texto-2)">Se fechar depois da meia-noite (ex.: 18:00 → 01:00), funciona normalmente.</small>');
  renderBotaoLoja();
}

$('#form-config').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const zap = f.elements.whatsapp.value.trim();
  const whatsapp = zap ? U.normTel(zap) : '';
  if (zap && !whatsapp) { U.toast('WhatsApp inválido. Use DDD + número.', 'erro-t'); f.elements.whatsapp.focus(); return; }
  const pagamentos = $$('input[name="pagamentos"]:checked', f).map((i) => i.value);
  if (!pagamentos.length) { U.toast('Marque pelo menos uma forma de pagamento.', 'erro-t'); return; }
  const horarios = {};
  $$('.horario-linha', f).forEach((linha) => {
    horarios[linha.dataset.dia] = {
      aberto: $('[data-h="aberto"]', linha).checked,
      abre: $('[data-h="abre"]', linha).value || '18:00',
      fecha: $('[data-h="fecha"]', linha).value || '23:00',
    };
  });
  const int = (v, def) => Math.max(1, parseInt(v, 10) || def);
  const dados = {
    nome: f.elements.nome.value.trim() || 'Pizzaria',
    logoUrl: f.elements.logoUrl.value.trim(),
    whatsapp,
    endereco: f.elements.endereco.value.trim(),
    horarios,
    taxaEntrega: U.parseMoney(f.elements.taxaEntrega.value),
    pedidoMinimo: U.parseMoney(f.elements.pedidoMinimo.value),
    pagamentos,
    chavePix: f.elements.chavePix.value.trim(),
    regraPrecoPizza: f.elements.regraPrecoPizza.value,
    ocultarIndisponiveis: f.elements.ocultarIndisponiveis.checked,
    limiteRecorrente: int(f.elements.limiteRecorrente.value, 2),
    limiteVip: int(f.elements.limiteVip.value, 10),
    diasSumido: int(f.elements.diasSumido.value, 30),
  };
  const btn = $('#cfg-salvar');
  btn.disabled = true;
  try {
    await setDoc(doc(db, 'config', 'loja'), dados, { merge: true });
    U.toast('Ajustes salvos ✓');
    if (!whatsapp) U.toast('Atenção: sem WhatsApp configurado os clientes não conseguem finalizar.', 'erro-t');
  } catch (err) { tratarErro(err); U.toast('Erro ao salvar.', 'erro-t'); }
  btn.disabled = false;
});

// =====================================================================
//  Cardápio de exemplo (seed)
// =====================================================================
$('#btn-seed').addEventListener('click', async () => {
  if (!confirm('Cadastrar o cardápio de exemplo? Itens de exemplo já existentes serão sobrescritos.')) return;
  const b = writeBatch(db);
  const put = (col, id, d) => b.set(doc(db, col, id), d);

  put('categorias', 'pizzas', { nome: 'Pizzas', ordem: 0, ativo: true });
  put('categorias', 'bebidas', { nome: 'Bebidas', ordem: 1, ativo: true });
  put('categorias', 'adicionais', { nome: 'Adicionais', ordem: 2, ativo: true });

  const pizza = { categoriaId: 'pizzas', tipo: 'pizza', fotoUrl: '', preco: 0, disponivel: true, usaBordas: true, usaAdicionais: true, saboresPermitidos: [] };
  put('produtos', 'pizza-grande', { ...pizza, nome: 'Pizza Grande 35cm', descricao: '9 fatias · até 3 sabores', tamanho: 'Grande', fatias: 9, maxSabores: 3, destaque: true, ordem: 0 });
  put('produtos', 'pizza-media', { ...pizza, nome: 'Pizza Média', descricao: '6 fatias · até 2 sabores', tamanho: 'Média', fatias: 6, maxSabores: 2, destaque: false, ordem: 1 });
  const simples = { tipo: 'simples', fotoUrl: '', disponivel: true, destaque: false };
  put('produtos', 'refri-lata', { ...simples, categoriaId: 'bebidas', nome: 'Refrigerante lata 350ml', descricao: 'Coca-Cola, Guaraná ou Fanta — informe na observação', preco: 6, ordem: 0 });
  put('produtos', 'refri-2l', { ...simples, categoriaId: 'bebidas', nome: 'Refrigerante 2L', descricao: 'Coca-Cola, Guaraná ou Fanta — informe na observação', preco: 14, destaque: true, ordem: 1 });
  put('produtos', 'molho-alho', { ...simples, categoriaId: 'adicionais', nome: 'Molho de alho (porção)', descricao: 'Pote de 50ml', preco: 3, ordem: 0 });
  put('produtos', 'catupiry-extra', { ...simples, categoriaId: 'adicionais', nome: 'Catupiry extra (porção)', descricao: 'Pote de 50ml', preco: 5, ordem: 1 });

  const sabores = [
    ['calabresa', 'Calabresa', 'Mussarela, calabresa fatiada, cebola e orégano', 42, 52],
    ['mussarela', 'Mussarela', 'Molho de tomate, mussarela, tomate e orégano', 40, 50],
    ['frango-catupiry', 'Frango c/ Catupiry', 'Frango desfiado temperado, catupiry e milho', 46, 56],
    ['portuguesa', 'Portuguesa', 'Presunto, ovos, cebola, ervilha, azeitona e mussarela', 46, 58],
    ['atum', 'Atum', 'Atum sólido, cebola, mussarela e azeitona', 48, 58],
    ['bacon', 'Bacon', 'Mussarela, bacon crocante e cebola caramelizada', 46, 56],
    ['alho-oleo', 'Alho e Óleo', 'Mussarela, alho dourado no azeite e parmesão', 38, 48],
    ['chocolate', 'Chocolate', 'Chocolate ao leite com granulado', 44, 54],
  ];
  sabores.forEach(([id, nome, ingredientes, media, grande], i) =>
    put('sabores', id, { nome, ingredientes, fotoUrl: '', precos: { 'Média': media, Grande: grande }, disponivel: true, ordem: i }));

  put('bordas', 'sem-borda', { nome: 'Sem borda', preco: 0, disponivel: true, ordem: 0 });
  put('bordas', 'catupiry', { nome: 'Catupiry', preco: 8, disponivel: true, ordem: 1 });
  put('bordas', 'cheddar', { nome: 'Cheddar', preco: 8, disponivel: true, ordem: 2 });

  put('adicionais', 'bacon-extra', { nome: 'Bacon extra', preco: 5, disponivel: true, ordem: 0 });
  put('adicionais', 'azeitona', { nome: 'Azeitona', preco: 3, disponivel: true, ordem: 1 });
  put('adicionais', 'ovo', { nome: 'Ovo', preco: 3, disponivel: true, ordem: 2 });

  try {
    const loja = await getDoc(doc(db, 'config', 'loja'));
    if (!loja.exists()) b.set(doc(db, 'config', 'loja'), { ...U.DEFAULT_LOJA, nome: 'Pizzaria Exemplo', taxaEntrega: 5 });
    await b.commit();
    U.toast('Cardápio de exemplo cadastrado ✓');
    preencherConfig(); // mostra no formulário a config de exemplo recém-criada
  } catch (e) { tratarErro(e); U.toast('Erro ao cadastrar exemplo.', 'erro-t'); }
});
