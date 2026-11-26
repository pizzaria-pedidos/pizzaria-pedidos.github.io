// Testa: preço por grupo (Tradicionais/Especiais) e "Nossos sabores" com descrição.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const { chromium, devices } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');

const DIR = path.dirname(new URL(import.meta.url).pathname);
const SITE = 'http://127.0.0.1:5500';
const FB = path.join(DIR, 'node_modules/firebase');
const V = 'v=26';
const shots = path.join(DIR, 'shots-grupos');
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
const sabor = (pg, id) => pg.evaluate(async ([id, V]) => {
  const m = await import(`/js/firebase-config.js?${V}`);
  return (await m.getDoc(m.doc(m.db, 'sabores', id))).data();
}, [id, V]);

// ---------- admin igual ao do Eduardo: só Grande ----------
const ctxA = await ctxNovo({ viewport: { width: 1280, height: 900 } });
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
await adm.check('[name="ocultarIndisponiveis"]');
await adm.click('#cfg-salvar');
await toastTem(adm, 'salvos');
await adm.click('[data-view="cardapio"]');
await adm.click('[data-col="produtos"]');
await adm.locator('.crud-item', { hasText: 'Pizza Média' }).locator('.switch').click();
await adm.waitForTimeout(600);

console.log('\n1) Preço por grupo');
await adm.click('[data-col="sabores"]');
await adm.waitForSelector('.grupos-preco');
check(await adm.isVisible('.grupo-linha[data-g="tradicional"]') && await adm.isVisible('.grupo-linha[data-g="especial"]'), 'quadro "Preço por grupo" com Tradicionais e Especiais');
const camposPreco = await adm.$$eval('.grupo-linha[data-g="tradicional"] [data-gpreco]', (els) => els.map((e) => e.dataset.tam));
check(camposPreco.length === 1 && camposPreco[0] === 'Grande', 'só campo de preço da Grande no grupo');
check((await adm.textContent('.grupo-linha[data-g="tradicional"]')).includes('3 sabores'), 'Tradicionais: 3 sabores (seed)');
await adm.fill('.grupo-linha[data-g="tradicional"] [data-gpreco]', '35');
await adm.click('[data-aplicar-grupo="tradicional"]');
await toastTem(adm, 'aplicado a 3');
await adm.fill('.grupo-linha[data-g="especial"] [data-gpreco]', '40');
await adm.click('[data-aplicar-grupo="especial"]');
await toastTem(adm, 'aplicado a 5');
await adm.waitForTimeout(600);
let c = await sabor(adm, 'calabresa'), f = await sabor(adm, 'frango-catupiry');
check(c.precos.Grande === 35 && f.precos.Grande === 40, 'Calabresa R$ 35 (tradicional) e Frango R$ 40 (especial) — de uma vez');
check(c.precos['Média'] === 42, 'preço guardado da Média não foi apagado');
check(/Tradicionais · Grande R\$\s35,00/.test(await adm.textContent('#crud-lista')), 'lista mostra grupo e preço');
await adm.screenshot({ path: `${shots}/01-painel-grupos.png`, fullPage: true });

console.log('\n2) Trocar grupo de um sabor (1 toque)');
await adm.selectOption('[data-grupo-sabor="chocolate"]', 'tradicional');
await toastTem(adm, 'Chocolate → Tradicionais');
await adm.waitForTimeout(500);
check((await sabor(adm, 'chocolate')).precos.Grande === 35, 'Chocolate passou para Tradicionais e já ficou R$ 35');

console.log('\n3) Formulário do sabor: descrição + grupo');
await adm.locator('.crud-item', { hasText: 'Calabresa' }).locator('[data-editar]').click();
await adm.waitForSelector('#form-crud');
check(await adm.isHidden('#form-crud .campo-precos'), 'com grupo: campo de preço próprio escondido');
check((await adm.textContent('#form-crud')).includes('o cliente vê no cardápio'), 'campo "Descrição / ingredientes (o cliente vê no cardápio)"');
await adm.fill('#form-crud [name="ingredientes"]', 'Molho, mussarela, calabresa, orégano e cebola');
await adm.selectOption('#form-crud [name="grupo"]', '');
check(await adm.isVisible('#form-crud .campo-precos'), '"Sem grupo": aparece o preço próprio');
await adm.selectOption('#form-crud [name="grupo"]', 'tradicional');
await adm.click('#crud-salvar');
await toastTem(adm, 'Salvo');

console.log('\n4) Site do cliente: "Nossos sabores"');
const ctxC = await ctxNovo({ ...devices['iPhone 13'] });
const cli = await ctxC.newPage(); vigiar(cli, 'cliente');
await cli.goto(`${SITE}/index.html`);
await cli.fill('#id-tel', '71999998888');
await cli.fill('#id-nome', 'Maria Souza');
await cli.click('#id-btn');
await cli.waitForSelector('.sabores-cardapio');
const sc = await cli.textContent('.sabores-cardapio');
check(sc.includes('Nossos sabores'), 'seção "Nossos sabores" no cardápio');
check(/Tradicionais\s*R\$\s*35,00/.test(sc) && /Especiais\s*R\$\s*40,00/.test(sc), 'grupos com preço: Tradicionais R$ 35 / Especiais R$ 40');
check(sc.includes('Molho, mussarela, calabresa, orégano e cebola'), 'descrição da Calabresa aparece para o cliente');
check(!(await cli.isVisible('[data-produto="pizza-media"]')), 'Pizza Média não aparece');
check((await cli.textContent('#cardapio [data-produto="pizza-grande"]')).includes('35,00'), 'Pizza Grande "a partir de R$ 35,00"');
await cli.screenshot({ path: `${shots}/02-cliente-sabores.png`, fullPage: true });

await cli.click('[data-sabor-cardapio="calabresa"]');
await cli.waitForSelector('#mp-sabores .opcao');
check(await cli.$eval('[data-sabor="calabresa"]', (b) => b.classList.contains('sel')), 'tocar no sabor abre a pizza com ele já escolhido');
check((await cli.textContent('#mp-add')).includes('35,00'), 'botão "Adicionar · R$ 35,00"');
const cabec = await cli.$$eval('#mp-sabores .opcao-grupo', (els) => els.map((e) => e.textContent));
check(cabec.some((t) => t.includes('Tradicionais')) && cabec.some((t) => t.includes('Especiais')), `modal separa por grupo (${cabec.join(' | ')})`);
await cli.click('[data-sabor="frango-catupiry"]');
check((await cli.textContent('#mp-add')).includes('40,00'), 'meia tradicional + meia especial = R$ 40 (sabor mais caro)');
await cli.screenshot({ path: `${shots}/03-modal-grupos.png` });
await cli.click('#mp-sheet [data-fechar]');

console.log('\n5) Mudou o preço do grupo → cliente vê na hora');
await adm.click('[data-col="sabores"]');
await adm.fill('.grupo-linha[data-g="tradicional"] [data-gpreco]', '38');
await adm.press('.grupo-linha[data-g="tradicional"] [data-gpreco]', 'Enter');
await toastTem(adm, 'aplicado a 4');
await cli.waitForFunction(() => /Tradicionais\s*R\$\s*38,00/.test(document.querySelector('.sabores-cardapio')?.textContent || ''), null, { timeout: 8000 })
  .then(() => check(true, 'cliente vê "Tradicionais R$ 38,00" sem recarregar'), () => check(false, 'cliente não atualizou preço'));

const larg = await cli.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
check(larg, 'celular sem rolagem horizontal');
const ctxM = await ctxNovo({ ...devices['iPhone 13'] });
const am = await ctxM.newPage(); vigiar(am, 'admin-celular');
am.on('dialog', (d) => d.accept());
await am.goto(`${SITE}/admin.html`);
await am.fill('#login-email', 'dono@teste.com');
await am.fill('#login-senha', 'senha123');
await am.click('#login-btn');
await am.waitForSelector('#painel:not([hidden])');
await am.click('[data-view="cardapio"]');
await am.click('[data-col="sabores"]');
await am.waitForSelector('.grupos-preco');
await am.screenshot({ path: `${shots}/04-painel-celular.png`, fullPage: true });
check(await am.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'painel no celular sem rolagem horizontal');

console.log('\nErros de JavaScript:', erros.length ? '\n  ' + erros.join('\n  ') : 'nenhum');
console.log(`\nRESULTADO: ${ok} ok, ${falhas} falha(s)`);
await browser.close();
process.exit(falhas ? 1 : 0);
