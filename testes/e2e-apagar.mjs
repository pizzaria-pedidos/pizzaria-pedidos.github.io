// Testa: apagar cliente (com e sem os pedidos dele).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const { chromium, devices } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');

const DIR = path.dirname(new URL(import.meta.url).pathname);
const SITE = 'http://127.0.0.1:5500';
const FB = path.join(DIR, 'node_modules/firebase');
const V = 'v=29';
const shots = path.join(DIR, 'shots-apagar');
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
  await ctx.route('https://api.whatsapp.com/**', (r) => r.fulfill({ body: 'ok', contentType: 'text/html' }));
  return ctx;
}
const erros = [];
const vigiar = (pg, n) => pg.on('pageerror', (e) => erros.push(`[${n}] ${e.message}`));
const toastTem = (pg, t) => pg.waitForFunction((t) => document.getElementById('toast').textContent.includes(t), t, { timeout: 8000 });
const contar = (pg, col) => pg.evaluate(async ([col, V]) => {
  const m = await import(`/js/firebase-config.js?${V}`);
  return (await m.getDocs(m.collection(m.db, col))).size;
}, [col, V]);

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
await adm.waitForTimeout(400);
await adm.fill('[name="whatsapp"]', '(71) 98888-7777');
for (const d of await adm.$$('.horario-linha')) {
  await (await d.$('[data-h="aberto"]')).check();
  await (await d.$('[data-h="abre"]')).fill('00:00');
  await (await d.$('[data-h="fecha"]')).fill('23:59');
}
await adm.click('#cfg-salvar');
await toastTem(adm, 'salvos');

// dois clientes de teste, cada um com 1 pedido
async function pedido(tel, nome) {
  const ctx = await ctxNovo({ ...devices['Pixel 7'] });
  const c = await ctx.newPage(); vigiar(c, nome);
  await c.goto(`${SITE}/index.html`);
  await c.fill('#id-tel', tel);
  await c.fill('#id-nome', nome);
  await c.click('#id-btn');
  await c.waitForSelector('.produto');
  await c.click('#cardapio [data-produto="refri-lata"]');
  await c.click('#mp-add');
  await c.waitForSelector('#modal-produto', { state: 'hidden' });
  await c.click('#barra-carrinho');
  await c.check('input[name="tipo"][value="retirada"]', { force: true });
  await c.locator('#pagamentos label', { hasText: 'Pix' }).click();
  await c.click('#btn-finalizar');
  await c.waitForTimeout(2500);
  await ctx.close();
}
await pedido('71911112222', 'Teste Um');
await pedido('71933334444', 'Teste Dois');
await adm.waitForTimeout(1500);
check((await contar(adm, 'pedidos')) === 2 && (await contar(adm, 'clientes')) === 2, '2 clientes de teste com 1 pedido cada');

console.log('\nApagar COM os pedidos');
await adm.click('[data-view="clientes"]');
await adm.locator('#tabela-clientes tbody tr', { hasText: 'Teste Um' }).click();
await adm.waitForSelector('#cli-apagar');
check(await adm.isVisible('#cli-apagar'), 'botão "🗑️ Apagar cliente" na ficha do cliente');
await adm.click('#cli-apagar');
await adm.waitForSelector('#cli-apagar-ok');
check((await adm.textContent('#modal-corpo')).includes('1 pedido(s)'), 'oferece apagar também 1 pedido');
check(!(await adm.isChecked('#cli-apagar-pedidos')), 'caixinha de pedidos vem desmarcada (protege cliente real)');
await adm.screenshot({ path: `${shots}/01-confirmar.png` });
await adm.click('#cli-apagar-pedidos');
await adm.click('#cli-apagar-ok');
await toastTem(adm, 'Teste Um apagado');
await adm.waitForTimeout(800);
check(!(await adm.textContent('#tabela-clientes tbody')).includes('Teste Um'), 'sumiu da lista de clientes');
check((await contar(adm, 'pedidos')) === 1, 'pedido dele também foi apagado');

console.log('\nApagar SEM os pedidos');
await adm.locator('#tabela-clientes tbody tr', { hasText: 'Teste Dois' }).click();
await adm.click('#cli-apagar');
await adm.waitForSelector('#cli-apagar-ok');
await adm.click('#cli-apagar-ok');
await toastTem(adm, 'Teste Dois apagado');
await adm.waitForTimeout(800);
check((await contar(adm, 'clientes')) === 0, 'cadastro apagado');
check((await contar(adm, 'pedidos')) === 1, 'pedido mantido (histórico de vendas)');
await adm.click('[data-view="pedidos"]');
await adm.waitForSelector('.pedido-card');
check((await adm.textContent('.pedido-card')).includes('Teste Dois'), 'painel continua mostrando o pedido antigo');

console.log('\nErros de JavaScript:', erros.length ? '\n  ' + erros.join('\n  ') : 'nenhum');
console.log(`\nRESULTADO: ${ok} ok, ${falhas} falha(s)`);
await browser.close();
process.exit(falhas ? 1 : 0);
