// Testa: 👁️ esconder valores (por aparelho), sabores grifados, WhatsApp Web na mesma aba (PC), nome e banco do Pix.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const { chromium, devices } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');

const DIR = path.dirname(new URL(import.meta.url).pathname);
const SITE = 'http://127.0.0.1:5500';
const FB = path.join(DIR, 'node_modules/firebase');
const V = 'v=34';
const shots = path.join(DIR, 'shots-painel');
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

const br = (t) => String(t || '').replace(/ /g, ' ');

console.log('\n1) Ajustes: nome e banco de quem recebe o Pix');
await adm.fill('#form-config [name="chavePix"]', '71993695329');
check(await adm.isVisible('#form-config [name="pixNome"]') && await adm.isVisible('#form-config [name="pixBanco"]'), 'campos "Nome de quem recebe o Pix" e "Banco / instituição"');
await adm.fill('#form-config [name="pixNome"]', 'Eduardo Magalhães');
await adm.fill('#form-config [name="pixBanco"]', 'Nubank');
await adm.click('#cfg-salvar');
await toastTem(adm, 'salvos');
const L = await adm.evaluate(async (V) => {
  const m = await import(`/js/firebase-config.js?${V}`);
  return (await m.getDoc(m.doc(m.db, 'config', 'loja'))).data();
}, V);
check(L.pixNome === 'Eduardo Magalhães' && L.pixBanco === 'Nubank', 'salvos no banco');

console.log('\n2) Cliente: Pix com nome e banco no carrinho e na mensagem');
const ctxC = await ctxNovo({ ...devices['iPhone 13'] });
let url = null;
await ctxC.route('https://api.whatsapp.com/**', (route) => { url = route.request().url(); route.fulfill({ body: 'ok', contentType: 'text/html' }); });
const cli = await ctxC.newPage(); vigiar(cli, 'cliente');
await cli.goto(`${SITE}/index.html`);
await cli.fill('#id-tel', '71999998888');
await cli.fill('#id-nome', 'Maria Souza');
await cli.click('#id-btn');
await cli.waitForSelector('.produto');
await cli.click('#cardapio [data-produto="pizza-grande"]');
await cli.click('[data-sabor="calabresa"]');
await cli.click('[data-sabor="frango-catupiry"]');
await cli.click('#mp-fin');
await cli.waitForSelector('#tela-carrinho:not([hidden])');
await cli.locator('#tela-carrinho label', { hasText: 'Retirar no local' }).click();
await cli.locator('#pagamentos label', { hasText: 'Pix' }).click();
const caixa = await cli.textContent('#info-pix');
check(caixa.includes('71993695329') && caixa.includes('Nome: Eduardo Magalhães') && caixa.includes('Banco: Nubank'), 'quadro do Pix: chave, "👤 Nome: Eduardo Magalhães" e "🏛️ Banco: Nubank"');
await cli.locator('#info-pix').scrollIntoViewIfNeeded();
await cli.screenshot({ path: `${shots}/01-pix-nome-banco.png` });
await cli.click('#btn-finalizar');
await cli.waitForTimeout(2500);
const msg = url ? decodeURIComponent(url.split('text=')[1]) : '';
check(msg.includes('🏦 *Chave Pix:* 71993695329\n👤 *Nome:* Eduardo Magalhães\n🏛️ *Banco:* Nubank'), 'WhatsApp: chave, nome e banco, um embaixo do outro');

console.log('\n3) Painel: sabores grifados');
await adm.click('[data-view="pedidos"]');
await adm.waitForSelector('.pedido-card mark.sabor');
const marks = await adm.$$eval('.pedido-card mark.sabor', (ms) => ms.map((m) => [m.textContent, getComputedStyle(m).backgroundColor]));
check(marks.length === 2 && marks[0][0] === 'Calabresa' && marks[1][0] === 'Frango c/ Catupiry', `sabores grifados: ${marks.map((m) => m[0]).join(' / ')}`);
check(marks.every((m) => m[1] === 'rgba(255, 212, 59, 0.32)'), `grifo amarelo suave, transparente (${marks[0]?.[1]})`);
await adm.locator('.pedido-card mark.sabor').first().scrollIntoViewIfNeeded();
await adm.screenshot({ path: `${shots}/03-sabores.png` });

console.log('\n4) 👁️ Esconder valores — só neste aparelho');
const ctxN = await ctxNovo({ viewport: { width: 1280, height: 900 } });
const nb = await ctxN.newPage(); vigiar(nb, 'notebook');
nb.on('dialog', (d) => d.accept());
await nb.goto(`${SITE}/admin.html`);
await nb.fill('#login-email', 'dono@teste.com');
await nb.fill('#login-senha', 'senha123');
await nb.click('#login-btn');
await nb.waitForSelector('.pedido-card');
const temRS = (pg) => pg.evaluate(() => /R\$[\s ]*\d/.test(document.getElementById('v-pedidos').innerText));
check(await temRS(nb), 'notebook: valores aparecendo');
check(await nb.isVisible('#btn-olho') && (await nb.textContent('#btn-olho')) === '👁️', 'botão do olho 👁️ ao lado de "Pedidos"');
await nb.click('#btn-olho');
check(!(await temRS(nb)), 'tocou no olho: nenhum "R$ 00,00" visível na tela de Pedidos');
const txt = br(await nb.textContent('#v-pedidos'));
check(txt.includes('R$ •••') && txt.includes('Calabresa'), 'aparece "R$ •••" no lugar (o resto do pedido continua)');
check((await nb.textContent('#btn-olho')) === '🙈', 'botão vira 🙈');
await nb.screenshot({ path: `${shots}/02-valores-escondidos.png` });
check(await temRS(adm), 'celular continua mostrando os valores (cada aparelho é independente)');
// notificação do sistema: painel em outra aba/minimizado (ou som bloqueado) → aparece e toca
await nb.evaluate(() => {
  window.__notifs = [];
  window.Notification = class { constructor(t, o) { window.__notifs.push([t, o?.body]); } static get permission() { return 'granted'; } static requestPermission() { return Promise.resolve('granted'); } };
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
});
// chega um pedido novo: continua escondido
await cli.goto(`${SITE}/index.html`);
await cli.waitForSelector('.produto');
await cli.click('#cardapio [data-produto="refri-2l"]');
await cli.click('#mp-fin');
await cli.waitForSelector('#tela-carrinho:not([hidden])');
await cli.click('#btn-finalizar');
await nb.waitForFunction(() => document.querySelectorAll('.pedido-card').length === 2);
await nb.waitForTimeout(300);
check(!(await temRS(nb)), 'pedido novo chegou: os valores continuam escondidos');
const notifs = await nb.evaluate(() => window.__notifs);
check(notifs.length === 1 && notifs[0][0].startsWith('🍕 Novo pedido') && notifs[0][1].includes('Maria Souza'), `painel minimizado: notificação do sistema "🍕 Novo pedido … — Maria Souza" (${JSON.stringify(notifs)})`);
await nb.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); });
await nb.reload();
await nb.waitForSelector('.pedido-card');
await nb.waitForTimeout(500);
check(!(await temRS(nb)) && (await nb.textContent('#btn-olho')) === '🙈', 'recarregou a página: continua escondido (lembra no aparelho)');
await nb.click('#btn-olho');
check(await temRS(nb) && (await nb.textContent('#btn-olho')) === '👁️', 'tocou de novo (primeiro toque depois de abrir a página): valores voltam');

console.log('\n5) WhatsApp: no notebook, WhatsApp Web na mesma aba');
await nb.locator('.pedido-card', { hasText: 'Calabresa' }).locator('[data-pronto]').click();
await nb.waitForSelector('[data-informar]');
const a = await nb.$eval('[data-informar]', (el) => ({ href: el.href, target: el.target, rel: el.rel }));
check(a.href.startsWith('https://web.whatsapp.com/send?phone=5571999998888&text='), 'notebook: link direto do WhatsApp Web (sem página intermediária)');
check(a.target === 'whatsapp' && !a.rel.includes('noopener'), 'abre sempre na mesma aba ("whatsapp"), reaproveitando a aba aberta');
check(decodeURIComponent(a.href.split('text=')[1]).length > 10, 'mensagem do aviso vai junto');
await adm.waitForSelector('[data-informar]');
const am = await adm.$eval('[data-informar]', (el) => ({ href: el.href, target: el.target }));
check(am.href.startsWith('https://api.whatsapp.com/send') && am.target === '_blank', 'celular: continua abrindo o aplicativo do WhatsApp');

check(!erros.length, `sem erros de JavaScript ${erros.join(' | ')}`);
console.log(`\nRESULTADO: ${ok} ok, ${falhas} falha(s)`);
await browser.close();
process.exit(falhas ? 1 : 0);
