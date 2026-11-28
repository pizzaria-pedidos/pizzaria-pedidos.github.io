// Testa: 💸 Ajustar valor do pedido (painel, faturamento, Balanço) sem mexer nos itens/total originais.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const { chromium, devices } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');

const DIR = path.dirname(new URL(import.meta.url).pathname);
const SITE = 'http://127.0.0.1:5500';
const FB = path.join(DIR, 'node_modules/firebase');
const V = 'v=34';
const shots = path.join(DIR, 'shots-ajuste');
fs.mkdirSync(shots, { recursive: true });
let ok = 0, falhas = 0;
const check = (c, m) => { if (c) { ok++; console.log('  ✔', m); } else { falhas++; console.log('  ✘', m); } };

const r = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'dono@teste.com', password: 'senha123', returnSecureToken: true }),
});
const { localId } = await r.json();
fs.writeFileSync(path.join(DIR, 'regras-teste.rules'),
  fs.readFileSync(path.join(DIR, '..', 'firestore.rules'), 'utf8').replace(/request\.auth\.uid == '[^']+'/, `request.auth.uid == '${localId}'`));
await new Promise((s) => setTimeout(s, 2500));

const browser = await chromium.launch();
async function ctxNovo(opts) {
  const ctx = await browser.newContext(opts);
  await ctx.route('https://www.gstatic.com/firebasejs/10.12.2/*', (route) =>
    route.fulfill({ path: path.join(FB, new URL(route.request().url()).pathname.split('/').pop()), contentType: 'text/javascript' }));
  await ctx.route('**/js/firebase-config.js*', (route) => route.fulfill({ path: path.join(DIR, 'config-teste.js'), contentType: 'text/javascript' }));
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  await ctx.route('https://fonts.gstatic.com/**', (r) => r.abort());
  return ctx;
}
const erros = [];
const vigiar = (pg, n) => pg.on('pageerror', (e) => erros.push(`[${n}] ${e.message}`));
const toastTem = (pg, t) => pg.waitForFunction((t) => document.getElementById('toast').textContent.includes(t), t, { timeout: 8000 });

const ctxA = await ctxNovo({ ...devices['iPhone 13'] });
const adm = await ctxA.newPage(); vigiar(adm, 'admin');
adm.on('dialog', (d) => d.accept());
await adm.goto(`${SITE}/admin.html`);
await adm.fill('#login-email', 'dono@teste.com');
await adm.fill('#login-senha', 'senha123');
await adm.click('#login-btn');
await adm.waitForSelector('#painel:not([hidden])');
await adm.click('[data-view="config"]');
await adm.click('.avancado summary');
await adm.click('#btn-seed');
await toastTem(adm, 'exemplo cadastrado');
await adm.waitForTimeout(500);
await adm.fill('[name="whatsapp"]', '(71) 98888-7777');
for (const d of await adm.$$('.horario-linha')) {
  await (await d.$('[data-h="aberto"]')).check();
  await (await d.$('[data-h="abre"]')).fill('00:00');
  await (await d.$('[data-h="fecha"]')).fill('23:59');
}
await adm.click('#cfg-salvar');
await toastTem(adm, 'salvos');

// ---------- cliente faz um pedido: 2 pizzas iguais (como o do Ramon) ----------
const ctxC = await ctxNovo({ ...devices['iPhone 13'] });
await ctxC.route('https://api.whatsapp.com/**', (route) => route.fulfill({ body: 'ok', contentType: 'text/html' }));
const cli = await ctxC.newPage(); vigiar(cli, 'cliente');
await cli.goto(`${SITE}/index.html`);
await cli.fill('#id-tel', '71999998888');
await cli.fill('#id-nome', 'Ramon Moreira');
await cli.click('#id-btn');
await cli.waitForSelector('.produto');
await cli.click('#cardapio [data-produto="pizza-grande"]');
await cli.click('[data-sabor="calabresa"]');
await cli.click('[data-qtd="1"]');
await cli.click('#mp-fin');
await cli.waitForSelector('#tela-carrinho:not([hidden])');
await cli.locator('#tela-carrinho label', { hasText: 'Retirar no local' }).click();
await cli.locator('#pagamentos label', { hasText: 'Pix' }).click();
await cli.click('#btn-finalizar');
await cli.waitForTimeout(2500);

const pedidos = () => adm.evaluate(async (V) => {
  const m = await import(`/js/firebase-config.js?${V}`);
  return (await m.getDocs(m.collection(m.db, 'pedidos'))).docs.map((d) => ({ id: d.id, ...d.data() }));
}, V);
let [ped] = await pedidos();
const total = ped.total, itensAntes = JSON.stringify(ped.itens);
const recebido = Math.round((total - 18.24) * 100) / 100;
const br = (v) => v.toFixed(2).replace('.', ',');
console.log(`pedido de R$ ${total}; vai receber R$ ${recebido}`);

console.log('\n1) Botão "💸 Ajustar valor" em "Mais opções"');
await adm.click('[data-view="pedidos"]');
await adm.waitForSelector('.pedido-card');
await adm.click('.pedido-card .pc-mais summary');
check(await adm.isVisible('[data-ajustar]'), 'botão aparece em "⋯ Mais opções"');
await adm.click('[data-ajustar]');
await adm.waitForSelector('#form-ajuste');
check((await adm.textContent('#modal-corpo')).includes(br(total)), 'janela mostra o total do pedido');
await adm.click('#modal-rodape button[type="submit"]');
check((await adm.textContent('#aj-erro')).includes('Digite o valor'), 'sem valor: pede para digitar');
await adm.fill('#form-ajuste [name="recebido"]', br(recebido));
check((await adm.textContent('#aj-dif')).includes('18,24'), 'mostra "Desconto de R$ 18,24" enquanto digita');
await adm.fill('#form-ajuste [name="motivo"]', 'divergência no pedido');
await adm.screenshot({ path: `${shots}/01-janela.png` });
await adm.click('#modal-rodape button[type="submit"]');
await toastTem(adm, 'Ajuste salvo');
await adm.waitForTimeout(800);

console.log('\n2) Pedido original intacto + ajuste guardado à parte');
[ped] = await pedidos();
check(ped.total === total && JSON.stringify(ped.itens) === itensAntes, 'itens e total do pedido não mudaram');
check(ped.ajuste?.recebido === recebido && Math.abs(ped.ajuste.desconto - 18.24) < 0.001 && ped.ajuste.motivo === 'divergência no pedido', `ajuste gravado: recebido ${ped.ajuste?.recebido}, desconto ${ped.ajuste?.desconto}`);
const card = await adm.textContent('.pedido-card');
check(card.includes('💸 Recebido') && card.includes(br(recebido)) && card.includes('18,24') && card.includes('divergência no pedido'), 'card mostra "💸 Recebido" com valor, desconto e motivo');
check(await adm.$eval('.pc-total', (e) => e.classList.contains('riscado')), 'total original aparece riscado');
check((await adm.textContent('#stats')).includes(br(recebido)), 'Faturamento do dia usa o valor recebido');
await adm.screenshot({ path: `${shots}/02-card.png`, fullPage: true });

console.log('\n3) Balanço: venda cai, custo continua');
await adm.click('#btn-cadeado');
await adm.fill('#cu-p1', '1234');
await adm.fill('#cu-p2', '1234');
await adm.click('#modal-rodape button[type="submit"]');
await adm.waitForSelector('#v-custos:not([hidden])');
await adm.click('[data-cu="tab"][data-v="balanco"]');
await adm.waitForSelector('#cu-bal .cli-card');
const bal = (await adm.textContent('#cu-bal')).replace(/\s/g, '');
check(bal.includes('💸Ajustedevalor·divergêncianopedido'), 'linha "💸 Ajuste de valor · divergência no pedido"');
check(bal.includes(`Vendidoemprodutos(1pedido)R$${br(recebido)}`), `"Vendido" do dia = R$ ${br(recebido)}`);
await adm.screenshot({ path: `${shots}/03-balanco.png`, fullPage: true });

console.log('\n4) Mudar e tirar o ajuste');
await adm.goto(`${SITE}/admin.html`);
await adm.waitForSelector('.pedido-card');
await adm.click('.pedido-card .pc-mais summary');
check((await adm.textContent('[data-ajustar]')).includes('Mudar'), 'botão vira "Mudar o ajuste de valor"');
await adm.click('[data-ajustar]');
await adm.waitForSelector('#aj-tirar');
check((await adm.inputValue('#form-ajuste [name="recebido"]')) === br(recebido), 'janela já vem com o valor salvo');
await adm.click('#aj-tirar');
await toastTem(adm, 'Ajuste removido');
await adm.waitForTimeout(800);
[ped] = await pedidos();
check(!ped.ajuste && ped.total === total, 'ajuste removido, pedido volta ao total original');
check((await adm.textContent('#stats')).includes(br(total)), 'Faturamento volta ao total');

console.log('\n5) 🗑️ Excluir pedido');
const cliAntes = await adm.evaluate(async (V) => {
  const m = await import(`/js/firebase-config.js?${V}`);
  return (await m.getDoc(m.doc(m.db, 'clientes', '5571999998888'))).data();
}, V);
await adm.click('.pedido-card .pc-mais summary');
check(await adm.isVisible('[data-excluir]'), '"🗑️ Excluir pedido" em "⋯ Mais opções"');
await adm.click('[data-excluir]');
await adm.waitForSelector('#ex-ok');
check((await adm.textContent('#modal-corpo')).includes('não pode ser desfeito'), 'pede confirmação ("não pode ser desfeito")');
await adm.click('#modal-rodape [data-fechar]');
check((await pedidos()).length === 1, '"Voltar" não exclui');
await adm.click('[data-excluir]');
await adm.click('#ex-ok');
await toastTem(adm, 'excluído');
await adm.waitForTimeout(800);
check((await pedidos()).length === 0, 'pedido excluído do banco');
check(!(await adm.$('.pedido-card')) && (await adm.textContent('#stats')).replace(/\u00a0/g, ' ').includes('R$ 0,00'), 'sumiu da lista e do faturamento');
const cliDepois = await adm.evaluate(async (V) => {
  const m = await import(`/js/firebase-config.js?${V}`);
  return (await m.getDoc(m.doc(m.db, 'clientes', '5571999998888'))).data();
}, V);
check(cliDepois.totalPedidos === cliAntes.totalPedidos - 1 && !(cliDepois.ultimosPedidos || []).includes(ped.id), `descontado do histórico do cliente (${cliAntes.totalPedidos} → ${cliDepois.totalPedidos})`);

check(!erros.length, `sem erros de JavaScript ${erros.join(' | ')}`);
console.log(`\nRESULTADO: ${ok} ok, ${falhas} falha(s)`);
await browser.close();
process.exit(falhas ? 1 : 0);
