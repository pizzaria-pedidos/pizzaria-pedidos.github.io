// Testa: tempo de espera (entrega/retirada) configurado no painel e no fim da mensagem.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const { chromium, devices } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');

const DIR = path.dirname(new URL(import.meta.url).pathname);
const SITE = 'http://127.0.0.1:5500';
const FB = path.join(DIR, 'node_modules/firebase');
const shots = path.join(DIR, 'shots-tempo');
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
check(await adm.isVisible('[name="tempoRetirada"]'), 'Ajustes: campos de tempo (Entrega e Retirada)');
await adm.fill('#form-config [name="tempoRetirada"]', '20 a 30 minutos');
await adm.click('#cfg-salvar');
await toastTem(adm, 'salvos');

console.log('\nBotão rápido ⏱️ na tela de Pedidos');
await adm.click('[data-view="pedidos"]');
await adm.click('#btn-tempo');
await adm.waitForSelector('#form-tempo');
check((await adm.inputValue('#form-tempo [name="tempoRetirada"]')) === '20 a 30 minutos', 'mostra o tempo salvo em Ajustes');
await adm.click('[data-tempo-rapido="40 a 60 minutos"]');
check((await adm.inputValue('#form-tempo [name="tempoEntrega"]')) === '40 a 60 minutos', 'atalho preenche a entrega');
await adm.screenshot({ path: `${shots}/01-botao-rapido.png` });
await adm.click('#modal-rodape button[type="submit"]');
await toastTem(adm, 'Tempo de espera atualizado');
await adm.waitForFunction(() => document.getElementById('btn-tempo').textContent.includes('40 a 60'), null, { timeout: 5000 })
  .then(() => check(true, 'botão mostra "⏱️ 🛵 40 a 60 minutos · 🏃 20 a 30 minutos"'), () => check(false, 'texto do botão'));

// cliente
const ctxC = await ctxNovo({ ...devices['Pixel 7'] });
let url = null;
await ctxC.route('https://api.whatsapp.com/**', (route) => { url = route.request().url(); route.fulfill({ body: 'ok', contentType: 'text/html' }); });
const cli = await ctxC.newPage(); vigiar(cli, 'cliente');
await cli.goto(`${SITE}/index.html`);
await cli.fill('#id-tel', '71999998888');
await cli.fill('#id-nome', 'Maria Souza');
await cli.click('#id-btn');
await cli.waitForSelector('.produto');
async function pedir(tipo) {
  url = null;
  await cli.goto(`${SITE}/index.html`);
  await cli.waitForSelector('.produto');
  await cli.click('#cardapio [data-produto="refri-lata"]');
  await cli.click('#mp-add');
  await cli.waitForSelector('#modal-produto', { state: 'hidden' });
  await cli.click('#barra-carrinho');
  await cli.check(`input[name="tipo"][value="${tipo}"]`, { force: true });
  if (tipo === 'entrega') {
    await cli.fill('[data-end="rua"]', 'Rua A');
    await cli.fill('[data-end="numero"]', '1');
    await cli.fill('[data-end="bairro"]', 'Centro');
  }
  await cli.locator('#pagamentos label', { hasText: 'Pix' }).click();
  const resumo = await cli.textContent('#resumo');
  await cli.screenshot({ path: `${shots}/02-carrinho-${tipo}.png` });
  await cli.click('#btn-finalizar');
  await cli.waitForTimeout(2500);
  return { resumo, msg: url ? decodeURIComponent(url.split('text=')[1]) : '' };
}
console.log('\nPedido de ENTREGA');
let { resumo, msg } = await pedir('entrega');
check(resumo.includes('Tempo de espera estimado: 40 a 60 minutos'), 'carrinho mostra o tempo da entrega');
const linhas = msg.trim().split('\n');
check(linhas[linhas.length - 1] === '⏱️ *Tempo de espera estimado:* 40 a 60 minutos', 'última linha da mensagem: "⏱️ *Tempo de espera estimado:* 40 a 60 minutos"');
check(/\*TOTAL: .*\*\n\n⏱️/.test(msg), 'fica logo abaixo do TOTAL');
console.log('\n----- fim da mensagem -----\n' + linhas.slice(-4).join('\n') + '\n---------------------------');

console.log('\nPedido de RETIRADA');
({ resumo, msg } = await pedir('retirada'));
check(resumo.includes('20 a 30 minutos'), 'carrinho mostra o tempo da retirada');
check(msg.trim().endsWith('⏱️ *Tempo de espera estimado:* 20 a 30 minutos'), 'mensagem usa o tempo da retirada');

console.log('\nTempo em branco → não aparece');
await adm.click('#btn-tempo');
await adm.fill('#form-tempo [name="tempoEntrega"]', '');
await adm.fill('#form-tempo [name="tempoRetirada"]', '');
await adm.click('#modal-rodape button[type="submit"]');
await toastTem(adm, 'Tempo de espera atualizado');
await adm.waitForTimeout(800);
({ resumo, msg } = await pedir('entrega'));
check(!msg.includes('Tempo de espera') && !resumo.includes('Tempo de espera'), 'sem tempo configurado: nenhuma linha de tempo');
check((await adm.textContent('#btn-tempo')).includes('Definir tempo de espera'), 'botão volta para "Definir tempo de espera"');

console.log('\nErros de JavaScript:', erros.length ? '\n  ' + erros.join('\n  ') : 'nenhum');
console.log(`\nRESULTADO: ${ok} ok, ${falhas} falha(s)`);
await browser.close();
process.exit(falhas ? 1 : 0);
