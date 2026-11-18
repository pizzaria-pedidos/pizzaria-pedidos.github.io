// Testa: contador "há X min" (com cores pelo tempo de espera) e escolha do som.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const { chromium, devices } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');

const DIR = path.dirname(new URL(import.meta.url).pathname);
const SITE = 'http://127.0.0.1:5500';
const FB = path.join(DIR, 'node_modules/firebase');
const shots = path.join(DIR, 'shots-som');
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

const ctxA = await ctxNovo({ viewport: { width: 1280, height: 900 } });
// espiona quantas notas cada som toca
await ctxA.addInitScript(() => {
  window.__notas = 0;
  const orig = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function () { window.__notas++; return orig.call(this); };
});
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
await adm.click('#cfg-salvar');
await toastTem(adm, 'salvos');
await adm.click('[data-view="pedidos"]');

console.log('\n1) Escolha do som');
check((await adm.textContent('#btn-som')).includes('Som: Plim-plim'), 'botão mostra "🔔 Som: Plim-plim"');
await adm.click('#btn-som');
await adm.waitForSelector('.lista-sons');
const nomes = await adm.$$eval('.som-linha label', (els) => els.map((e) => e.textContent.trim()));
check(nomes.length === 6, `6 opções de som: ${nomes.join(' | ')}`);
const notasPorSom = {};
for (const k of ['padrao', 'campainha', 'sino', 'alarme', 'bipes', 'melodia']) {
  const antes = await adm.evaluate(() => window.__notas);
  await adm.click(`[data-ouvir="${k}"]`);
  await adm.waitForTimeout(250);
  notasPorSom[k] = (await adm.evaluate(() => window.__notas)) - antes;
}
check(Object.values(notasPorSom).every((n) => n > 0), `▶ Ouvir toca cada som (notas: ${JSON.stringify(notasPorSom)})`);
await adm.screenshot({ path: `${shots}/01-sons.png` });
await adm.check('input[name="som-tipo"][value="alarme"]');
await adm.waitForTimeout(300);
await adm.click('#modal-rodape [data-fechar]');
check((await adm.textContent('#btn-som')).includes('Som: Alarme'), 'escolheu Alarme → botão "🔔 Som: Alarme"');
check((await adm.evaluate(() => localStorage.getItem('pz_admin_som_tipo'))) === '"alarme"', 'escolha guardada neste aparelho');

console.log('\n2) Pedido chega → toca o som escolhido e começa a contar');
const antes = await adm.evaluate(() => window.__notas);
const ctxC = await ctxNovo({ ...devices['Pixel 7'] });
const cli = await ctxC.newPage(); vigiar(cli, 'cliente');
await cli.goto(`${SITE}/index.html`);
await cli.fill('#id-tel', '71999998888');
await cli.fill('#id-nome', 'Maria Souza');
await cli.click('#id-btn');
await cli.waitForSelector('.produto');
await cli.click('#cardapio [data-produto="refri-lata"]');
await cli.click('#mp-add');
await cli.waitForSelector('#modal-produto', { state: 'hidden' });
await cli.click('#barra-carrinho');
await cli.check('input[name="tipo"][value="entrega"]', { force: true });
await cli.fill('[data-end="rua"]', 'Rua A');
await cli.fill('[data-end="numero"]', '1');
await cli.fill('[data-end="bairro"]', 'Centro');
await cli.locator('#pagamentos label', { hasText: 'Pix' }).click();
await cli.click('#btn-finalizar');
await adm.waitForSelector('.pedido-card .pc-espera', { timeout: 10000 });
await adm.waitForTimeout(500);
check((await adm.evaluate(() => window.__notas)) - antes === 12, 'tocou o Alarme (12 bipes) quando o pedido chegou');
let esp = await adm.textContent('.pc-espera');
check(/^⏱️ 0:\d\d$/.test(esp.trim()), `cronômetro começa em segundos: "${esp}"`);
check(!(await adm.$eval('.pc-espera', (e) => e.className)).match(/alerta|atrasado/), 'verde no começo');

// adianta o relógio do painel
const adiantar = async (min) => {
  await adm.evaluate((min) => { const real = Date.prototype.constructor.now.bind(Date); if (!window.__realNow) window.__realNow = real; Date.now = () => window.__realNow() + min * 60000; }, min);
  await adm.selectOption('#f-status', 'novo');
  await adm.selectOption('#f-status', '');
  return [await adm.textContent('.pc-espera'), await adm.$eval('.pc-espera', (e) => e.className)];
};
let [txt, cls] = await adiantar(12);
check(/⏱️ 12:\d\d/.test(txt) && !/alerta|atrasado/.test(cls), `12 min depois: "${txt}" (verde)`);
[txt, cls] = await adiantar(50);
check(/⏱️ 50:\d\d/.test(txt) && cls.includes('alerta'), `50 min: "${txt}" (laranja — perto de 60)`);
[txt, cls] = await adiantar(65);
check(/⏱️ 1:05:\d\d/.test(txt) && txt.includes('atrasado') && cls.includes('atrasado'), `65 min: "${txt}" (vermelho)`);
await adm.screenshot({ path: `${shots}/02-atrasado.png` });

console.log('\n3) Concluído → contador some');
await adm.evaluate(() => { Date.now = window.__realNow; });
await adm.click('.pedido-card .pc-mais summary');
await adm.selectOption('.pedido-card select[data-status]', 'concluido');
await adm.waitForFunction(() => !document.querySelector('.pc-espera'), null, { timeout: 8000 })
  .then(() => check(true, 'pedido concluído não mostra mais o contador'), () => check(false, 'contador continuou'));

console.log('\nErros de JavaScript:', erros.length ? '\n  ' + erros.join('\n  ') : 'nenhum');
console.log(`\nRESULTADO: ${ok} ok, ${falhas} falha(s)`);
await browser.close();
process.exit(falhas ? 1 : 0);
