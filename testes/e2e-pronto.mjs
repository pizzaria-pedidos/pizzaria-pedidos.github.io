// Testa o fluxo final do card: cronômetro com segundos → ✅ Pedido pronto (para) → 📲 Informar cliente (WhatsApp com mensagem).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const { chromium, devices } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');

const DIR = path.dirname(new URL(import.meta.url).pathname);
const SITE = 'http://127.0.0.1:5500';
const FB = path.join(DIR, 'node_modules/firebase');
const V = 'v=19';
const shots = path.join(DIR, 'shots-pronto');
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
const aberturas = [];
await ctxA.route('https://api.whatsapp.com/**', (route) => { aberturas.push(route.request().url()); route.fulfill({ body: 'whatsapp', contentType: 'text/html' }); });
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
await adm.fill('#form-config [name="tempoEntrega"]', '40 a 60 minutos');
await adm.fill('[name="msgProntoEntrega"]', 'Oi {nome}! Seu pedido {codigo} ({total}) saiu agora com o motoboy 🛵');
await adm.click('#cfg-salvar');
await toastTem(adm, 'salvos');
await adm.click('[data-view="pedidos"]');

async function pedido(tel, nome, apelido, tipo) {
  const ctx = await ctxNovo({ ...devices['Pixel 7'] });
  await ctx.route('https://api.whatsapp.com/**', (r) => r.fulfill({ body: 'ok', contentType: 'text/html' }));
  const c = await ctx.newPage(); vigiar(c, nome);
  await c.goto(`${SITE}/index.html`);
  await c.waitForSelector('#tela-boasvindas:not([hidden])');
  await c.waitForTimeout(150);
  await c.fill('#id-tel', tel);
  await c.fill('#id-nome', nome);
  if (apelido) await c.fill('#id-apelido', apelido);
  await c.click('#id-btn');
  await c.waitForSelector('#cardapio .produto', { state: 'visible' });
  await c.click('#cardapio [data-produto="refri-lata"]');
  await c.click('#mp-add');
  await c.waitForSelector('#modal-produto', { state: 'hidden' });
  await c.click('#barra-carrinho');
  await c.check(`input[name="tipo"][value="${tipo}"]`, { force: true });
  if (tipo === 'entrega') {
    await c.fill('[data-end="rua"]', 'Rua A');
    await c.fill('[data-end="numero"]', '1');
    await c.fill('[data-end="bairro"]', 'Centro');
  }
  await c.locator('#pagamentos label', { hasText: 'Pix' }).click();
  await c.click('#btn-finalizar');
  await c.waitForTimeout(2500);
  await ctx.close();
}
await pedido('71911112222', 'João Silva', 'Joãozinho', 'entrega');
await pedido('71933334444', 'Ana Paula Costa', '', 'retirada');
await adm.waitForFunction(() => document.querySelectorAll('.pedido-card').length === 2, null, { timeout: 10000 });
await adm.waitForTimeout(800);
const card = (nome) => adm.locator('.pedido-card', { hasText: nome });
const visiveis = async (nome) => card(nome).locator('.pc-acoes > *:visible').evaluateAll((els) => els.map((e) => e.textContent.trim()));

console.log('\n1) Pedido chegou: cronômetro com segundos + 1 botão');
let t1 = await card('João Silva').locator('.pc-espera').textContent();
check(/^⏱️ \d+:\d\d$/.test(t1.trim()), `cronômetro em min:seg → "${t1.trim()}"`);
await adm.waitForTimeout(2200);
const t2 = await card('João Silva').locator('.pc-espera').textContent();
check(t2 !== t1, `cronômetro anda de segundo em segundo ("${t1.trim()}" → "${t2.trim()}")`);
let bts = await visiveis('João Silva');
check(bts.length === 1 && bts[0] === '✅ Pedido pronto', `só 1 botão no card: ${JSON.stringify(bts)}`);
check(!(await card('João Silva').locator('.pc-mais select').isVisible()), 'mudar status/cancelar escondido em "⋯ Mais opções"');
await adm.screenshot({ path: `${shots}/01-chegou.png`, fullPage: true });

console.log('\n2) ✅ Pedido pronto → para o cronômetro (sem abrir nada)');
const nAntes = aberturas.length;
await card('João Silva').locator('[data-pronto]').click();
await adm.waitForFunction(() => {
  const c = [...document.querySelectorAll('.pedido-card')].find((x) => x.textContent.includes('João Silva'));
  return c && !c.querySelector('.pc-espera') && c.querySelector('.pc-tempos')?.textContent.includes('ficou pronto em');
}, null, { timeout: 8000 }).then(() => check(true, 'cronômetro parou: "✅ ficou pronto em m:ss"'), () => check(false, 'cronômetro não parou'));
await adm.waitForTimeout(800);
check(aberturas.length === nAntes, '"Pedido pronto" não abre o WhatsApp (só para o tempo)');
const parado1 = await card('João Silva').locator('.pc-tempos').textContent();
await adm.waitForTimeout(2000);
check((await card('João Silva').locator('.pc-tempos').textContent()) === parado1, `tempo fica parado: "${parado1.trim()}"`);
check((await card('João Silva').locator('.status').textContent()).includes('Saiu para entrega'), 'status: Saiu para entrega');
bts = await visiveis('João Silva');
check(bts.length === 1 && bts[0] === '📲 Informar cliente', `agora só "📲 Informar cliente": ${JSON.stringify(bts)}`);
await adm.screenshot({ path: `${shots}/02-pronto.png`, fullPage: true });

console.log('\n3) 📲 Informar cliente → WhatsApp do cliente COM a mensagem');
const codJoao = (await card('João Silva').locator('.pc-num').textContent()).trim();
await card('João Silva').locator('[data-informar]').click();
await adm.waitForTimeout(1500);
let u = aberturas[aberturas.length - 1] || '';
let msg = decodeURIComponent(u.split('text=')[1] || '');
check(u.startsWith('https://api.whatsapp.com/send?phone=5571911112222&text='), 'abriu o WhatsApp do João');
check(msg === `Oi Joãozinho! Seu pedido ${codJoao} (R$ 6,00) saiu agora com o motoboy 🛵`.replace('6,00', '11,00'), `mensagem completa → "${msg}"`);
await adm.waitForFunction(() => [...document.querySelectorAll('.pedido-card')].find((x) => x.textContent.includes('João Silva'))?.querySelector('.status')?.textContent.includes('Concluído'), null, { timeout: 8000 })
  .then(() => check(true, 'pedido concluído'), () => check(false, 'não concluiu'));
await adm.waitForFunction(() => [...document.querySelectorAll('.pedido-card')].find((x) => x.textContent.includes('João Silva'))?.querySelector('.pc-tempos')?.textContent.includes('cliente avisado às'), null, { timeout: 8000 })
  .then(() => check(true, 'mostra "📲 cliente avisado às HH:MM"'), () => check(false, 'sem hora do aviso'));
bts = await visiveis('João Silva');
check(bts.length === 1 && bts[0].includes('Avisar de novo'), `depois: ${JSON.stringify(bts)}`);

console.log('\n4) Retirada (mensagem padrão, primeiro nome)');
await card('Ana Paula').locator('[data-pronto]').click();
await adm.waitForSelector('.pedido-card:has-text("Ana Paula") [data-informar]', { timeout: 8000 });
check((await card('Ana Paula').locator('.status').textContent()).includes('Pronto p/ retirada'), 'status: Pronto p/ retirada');
const codAna = (await card('Ana Paula').locator('.pc-num').textContent()).trim();
const href = await card('Ana Paula').locator('[data-informar]').getAttribute('href');
check(decodeURIComponent(href.split('text=')[1]) === `Olá, Ana! 🍕 Seu pedido ${codAna} já está pronto. Pode vir até o local retirar o seu pedido. Por favor, avise quando estiver a caminho. Obrigado!`, 'link do "Informar cliente" já leva a mensagem de retirada');
await card('Ana Paula').locator('[data-informar]').click();
await adm.waitForTimeout(1500);
u = aberturas[aberturas.length - 1] || '';
check(u.startsWith('https://api.whatsapp.com/send?phone=5571933334444&text=') && decodeURIComponent(u.split('text=')[1]).includes('Pode vir até o local retirar'), 'abriu o WhatsApp da Ana com a mensagem de retirada');

console.log('\n5) Ficou tudo salvo');
const salvo = await adm.evaluate(async (V) => {
  const m = await import(`/js/firebase-config.js?${V}`);
  const s = await m.getDocs(m.query(m.collection(m.db, 'pedidos'), m.where('clienteTel', '==', '5571911112222')));
  const d = s.docs[0].data();
  const cli = (await m.getDoc(m.doc(m.db, 'clientes', '5571911112222'))).data();
  return { status: d.status, pronto: !!d.prontoEm, avisado: !!d.informadoEm, ordem: d.criadoEm.toMillis() <= d.prontoEm.toMillis() && d.prontoEm.toMillis() <= d.informadoEm.toMillis(), apelido: cli.apelido };
}, V);
check(salvo.status === 'concluido' && salvo.pronto && salvo.avisado && salvo.ordem, `gravado: pedido → pronto → avisado (${JSON.stringify(salvo)})`);
check(salvo.apelido === 'Joãozinho', 'apelido gravado');
check(!(await adm.textContent('#stats')).match(/Preparo médio\s*—/), 'topo mostra o preparo médio do dia');
await card('João Silva').locator('.pc-mais summary').click();
check(await card('João Silva').locator('.pc-mais select option[value="cancelado"]').count() === 1, '"⋯ Mais opções" tem mudar status / cancelar');
await adm.screenshot({ path: `${shots}/03-final.png`, fullPage: true });

console.log('\nErros de JavaScript:', erros.length ? '\n  ' + erros.join('\n  ') : 'nenhum');
console.log(`\nRESULTADO: ${ok} ok, ${falhas} falha(s)`);
await browser.close();
process.exit(falhas ? 1 : 0);
