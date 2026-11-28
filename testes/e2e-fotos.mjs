// Testa: foto da galeria em produto, sabor e logo (reduzida e guardada no Firestore).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const { chromium, devices } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');

const DIR = path.dirname(new URL(import.meta.url).pathname);
const SITE = 'http://127.0.0.1:5500';
const FB = path.join(DIR, 'node_modules/firebase');
const V = 'v=34';
const shots = path.join(DIR, 'shots-fotos');
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
const docDe = (pg, col, id) => pg.evaluate(async ([col, id, V]) => {
  const m = await import(`/js/firebase-config.js?${V}`);
  return (await m.getDoc(m.doc(m.db, col, id))).data();
}, [col, id, V]);

// "foto grande" de teste: captura colorida de 1280x900 em escala 2 (2560x1800 px)
const ctxF = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const pf = await ctxF.newPage();
await pf.setContent('<body style="margin:0;background:linear-gradient(135deg,#e63,#fc3,#3a6,#36c);height:100vh"><h1 style="font:900 200px sans-serif;color:#fff;text-align:center;margin-top:250px">PIZZA 🍕</h1></body>');
const fotoGrande = await pf.screenshot();
await ctxF.close();
console.log(`Foto de teste: ${Math.round(fotoGrande.length / 1024)} KB (2560x1800)`);
const arquivo = (nome) => ({ name: nome, mimeType: 'image/png', buffer: fotoGrande });

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

console.log('\n1) Logo (Ajustes)');
check(await adm.isVisible('#cfg-logo [data-foto-campo="logoUrl"]'), 'campo de logo com "Escolher da galeria"');
await adm.setInputFiles('#cfg-logo [data-foto-arquivo]', arquivo('logo.png'));
await adm.waitForFunction(() => document.querySelector('#cfg-logo .foto-status')?.textContent.includes('Foto pronta'), null, { timeout: 8000 });
check(true, 'logo preparada');
await adm.fill('[name="whatsapp"]', '(71) 98888-7777');
for (const d of await adm.$$('.horario-linha')) {
  await (await d.$('[data-h="aberto"]')).check();
  await (await d.$('[data-h="abre"]')).fill('00:00');
  await (await d.$('[data-h="fecha"]')).fill('23:59');
}
await adm.click('#cfg-salvar');
await toastTem(adm, 'salvos');
const loja = await docDe(adm, 'config', 'loja');
check(loja.logoUrl.startsWith('data:image/jpeg') && loja.logoUrl.length < 80 * 1370 * 1.2, `logo salva reduzida (${Math.round(loja.logoUrl.length / 1370)} KB)`);

console.log('\n2) Foto de produto (Pizza Grande)');
await adm.click('[data-view="cardapio"]');
await adm.click('[data-col="produtos"]');
await adm.locator('.crud-item', { hasText: 'Pizza Grande' }).locator('[data-editar]').click();
await adm.waitForSelector('#form-crud [data-foto-campo="fotoUrl"]');
check((await adm.textContent('#form-crud [data-foto-campo]')).includes('Escolher da galeria'), 'botão "📷 Escolher da galeria" no produto');
await adm.setInputFiles('#form-crud [data-foto-arquivo]', arquivo('pizza.png'));
await adm.waitForFunction(() => document.querySelector('#form-crud .foto-status')?.textContent.includes('Foto pronta'), null, { timeout: 8000 });
check(await adm.isVisible('#form-crud .foto-prev img'), 'mostra a prévia da foto');
await adm.screenshot({ path: `${shots}/01-form-produto.png` });
await adm.click('#crud-salvar');
await toastTem(adm, 'Salvo');
const pg = await docDe(adm, 'produtos', 'pizza-grande');
check(pg.fotoUrl.startsWith('data:image/jpeg') && pg.fotoUrl.length < 120 * 1370 * 1.2, `foto do produto salva reduzida (${Math.round(pg.fotoUrl.length / 1370)} KB, original ${Math.round(fotoGrande.length / 1024)} KB)`);
const dims = await adm.evaluate((src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok([i.width, i.height]); i.src = src; }), pg.fotoUrl);
check(Math.max(...dims) === 640, `redimensionada para ${dims.join('x')} (lado maior 640)`);

console.log('\n3) Foto de bebida e de sabor');
await adm.locator('.crud-item', { hasText: 'Refrigerante 2L' }).locator('[data-editar]').click();
await adm.setInputFiles('#form-crud [data-foto-arquivo]', arquivo('refri.png'));
await adm.waitForFunction(() => document.querySelector('#form-crud .foto-status')?.textContent.includes('Foto pronta'), null, { timeout: 8000 });
await adm.click('#crud-salvar');
await toastTem(adm, 'Salvo');
check((await docDe(adm, 'produtos', 'refri-2l')).fotoUrl.startsWith('data:image/jpeg'), 'bebida com foto');
await adm.click('[data-col="sabores"]');
await adm.locator('[data-editar="calabresa"]').click();
await adm.setInputFiles('#form-crud [data-foto-arquivo]', arquivo('calabresa.png'));
await adm.waitForFunction(() => document.querySelector('#form-crud .foto-status')?.textContent.includes('Foto pronta'), null, { timeout: 8000 });
await adm.click('#crud-salvar');
await toastTem(adm, 'Salvo');
check((await docDe(adm, 'sabores', 'calabresa')).fotoUrl.startsWith('data:image/jpeg'), 'sabor com foto');

console.log('\n4) Arquivo que não é imagem');
await adm.locator('[data-editar="mussarela"]').click();
await adm.setInputFiles('#form-crud [data-foto-arquivo]', { name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('oi') });
await adm.waitForFunction(() => /imagem/i.test(document.querySelector('#form-crud .foto-status')?.textContent || ''), null, { timeout: 8000 });
check(true, `avisa: "${await adm.textContent('#form-crud .foto-status')}"`);
await adm.click('#modal [data-fechar]');

console.log('\n5) Remover foto');
await adm.locator('[data-editar="calabresa"]').click();
await adm.click('#form-crud [data-foto-remover]');
await adm.click('#crud-salvar');
await toastTem(adm, 'Salvo');
check((await docDe(adm, 'sabores', 'calabresa')).fotoUrl === '', 'foto removida');
// coloca de volta para o cliente ver
await adm.locator('[data-editar="calabresa"]').click();
await adm.setInputFiles('#form-crud [data-foto-arquivo]', arquivo('calabresa.png'));
await adm.waitForFunction(() => document.querySelector('#form-crud .foto-status')?.textContent.includes('Foto pronta'), null, { timeout: 8000 });
await adm.click('#crud-salvar');
await toastTem(adm, 'Salvo');

console.log('\n6) Cliente vê as fotos');
const ctxC = await ctxNovo({ ...devices['iPhone 13'] });
const cli = await ctxC.newPage(); vigiar(cli, 'cliente');
await cli.goto(`${SITE}/index.html`);
await cli.waitForSelector('#tela-boasvindas:not([hidden])');
await cli.waitForFunction(() => document.querySelector('#bv-logo img')?.src.startsWith('data:image'), null, { timeout: 8000 })
  .then(() => check(true, 'logo aparece na tela de entrada'), () => check(false, 'logo na entrada'));
await cli.fill('#id-tel', '71999998888');
await cli.fill('#id-nome', 'Maria Souza');
await cli.click('#id-btn');
await cli.waitForSelector('.produto');
const imgOk = (sel) => cli.$eval(sel, (i) => i.complete && i.naturalWidth > 0).catch(() => false);
check(await imgOk('#cardapio [data-produto="pizza-grande"] img'), 'foto da Pizza Grande no cardápio');
check(await imgOk('#cardapio [data-produto="refri-2l"] img'), 'foto do Refrigerante 2L no cardápio');
check(await imgOk('[data-sabor-cardapio="calabresa"] .sabor-foto img'), 'foto da Calabresa em "Nossos sabores"');
check(await imgOk('#logo img'), 'logo no topo');
await cli.screenshot({ path: `${shots}/02-cliente.png`, fullPage: true });
await cli.click('[data-sabor-cardapio="calabresa"]');
await cli.waitForSelector('#mp-sabores .opcao');
check(await imgOk('[data-sabor="calabresa"] .opcao-foto img'), 'foto do sabor ao montar a pizza');
await cli.screenshot({ path: `${shots}/03-modal.png` });

console.log('\nErros de JavaScript:', erros.length ? '\n  ' + erros.join('\n  ') : 'nenhum');
console.log(`\nRESULTADO: ${ok} ok, ${falhas} falha(s)`);
await browser.close();
process.exit(falhas ? 1 : 0);
