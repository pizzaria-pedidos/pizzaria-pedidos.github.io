// Testa: bebida dentro da tela da pizza + botão "Adicionar e finalizar".
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const { chromium, devices } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');

const DIR = path.dirname(new URL(import.meta.url).pathname);
const SITE = 'http://127.0.0.1:5500';
const FB = path.join(DIR, 'node_modules/firebase');
const V = 'v=26';
const shots = path.join(DIR, 'shots-bebida');
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

const ctxC = await ctxNovo({ ...devices['iPhone 13'] });
let url = null;
await ctxC.route('https://api.whatsapp.com/**', (route) => { url = route.request().url(); route.fulfill({ body: 'ok', contentType: 'text/html' }); });
const cli = await ctxC.newPage(); vigiar(cli, 'cliente');
await cli.goto(`${SITE}/index.html`);
await cli.fill('#id-tel', '71999998888');
await cli.fill('#id-nome', 'Maria Souza');
await cli.click('#id-btn');
await cli.waitForSelector('.produto');
const reais = (t) => Number((t.match(/R\$\s*([\d.]+,\d\d)/) || [])[1]?.replace('.', '').replace(',', '.'));

console.log('\n1) Tela da pizza mostra as bebidas');
await cli.click('#cardapio [data-produto="pizza-grande"]');
await cli.waitForSelector('#mp-bebidas');
const bebs = await cli.$$eval('#mp-bebidas .opcao strong', (els) => els.map((e) => e.textContent));
check(bebs.join('|') === 'Refrigerante lata 350ml|Refrigerante 2L', `só as bebidas da categoria Bebidas (${bebs.join(', ')})`);
const ordem = await cli.$$eval('#mp-sheet .grupo h3', (els) => els.map((e) => e.textContent.trim()));
check(ordem.join('|') === 'Sabores|Borda|Adicionais|🥤 Bebida|Observação da pizza', `ordem: ${ordem.join(' → ')}`);
check(await cli.isDisabled('#mp-add') && await cli.isDisabled('#mp-fin'), 'sem sabor: os dois botões ficam bloqueados');
await cli.click('[data-sabor="calabresa"]');
const pizzaV = reais(await cli.textContent('#mp-add'));
check(pizzaV > 0, `pizza Calabresa: R$ ${pizzaV}`);
await cli.click('[data-beb="refri-2l"][data-d="1"]');
await cli.click('[data-beb="refri-lata"][data-d="1"]');
await cli.click('[data-beb="refri-lata"][data-d="1"]');
check(reais(await cli.textContent('#mp-add')) === pizzaV + 14 + 12, `botão soma pizza + 1 refri 2L + 2 latas (R$ ${reais(await cli.textContent('#mp-add'))})`);
await cli.click('[data-qtd="1"]');
check(reais(await cli.textContent('#mp-add')) === pizzaV * 2 + 26, 'quantidade de pizzas não multiplica as bebidas');
await cli.click('[data-qtd="-1"]');
await cli.locator('#mp-bebidas').scrollIntoViewIfNeeded();
await cli.screenshot({ path: `${shots}/01-pizza-com-bebida.png` });
check(await cli.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'sem rolagem para o lado');

console.log('\n2) "Adicionar" põe pizza e bebidas no carrinho');
await cli.click('#mp-add');
await toastTem(cli, 'Pizza e 3 bebidas no carrinho');
await cli.waitForSelector('#modal-produto', { state: 'hidden' });
check((await cli.textContent('#barra-carrinho')).includes('4 itens'), 'barra do carrinho: 4 itens');

console.log('\n3) "Adicionar e finalizar" já abre o carrinho');
await cli.click('#cardapio [data-produto="pizza-grande"]');
await cli.waitForSelector('#mp-bebidas');
check(await cli.$$eval('#mp-bebidas [data-d="-1"]', (b) => b.every((x) => x.disabled)), 'nova pizza começa sem bebida marcada');
await cli.click('[data-sabor="mussarela"]');
await cli.click('[data-beb="refri-2l"][data-d="1"]');
await cli.click('#mp-fin');
await cli.waitForSelector('#tela-carrinho:not([hidden])');
check(await cli.isVisible('#btn-finalizar'), 'tela de finalizar aberta direto');
const cart = await cli.evaluate(() => JSON.parse(localStorage.getItem('pz_carrinho')));
check(cart.length === 4, `carrinho com 4 linhas (2 pizzas, refri 2L, lata): ${cart.map((i) => `${i.qtd}x ${i.nome}`).join(', ')}`);
check(cart.find((i) => i.produtoId === 'refri-2l')?.qtd === 2, 'Refrigerante 2L somado numa linha só (2x)');
await cli.locator('#tela-carrinho label', { hasText: 'Retirar no local' }).click();
check(await cli.isChecked('input[name="tipo"][value="retirada"]'), 'escolheu Retirar no local');
await cli.locator('#pagamentos label', { hasText: 'Pix' }).click();
await cli.screenshot({ path: `${shots}/02-carrinho.png`, fullPage: true });
await cli.click('#btn-finalizar');
await cli.waitForTimeout(2500);
const msg = url ? decodeURIComponent(url.split('text=')[1]) : '';
check(/2x\s*Refrigerante 2L/.test(msg) && /2x\s*Refrigerante lata/.test(msg), 'WhatsApp: "2x Refrigerante 2L" e "2x Refrigerante lata"');
check(msg.includes('Calabresa') && msg.includes('Mussarela'), 'WhatsApp: as duas pizzas');
const peds = await adm.evaluate(async (V) => {
  const m = await import(`/js/firebase-config.js?${V}`);
  return (await m.getDocs(m.collection(m.db, 'pedidos'))).docs.map((d) => d.data());
}, V);
check(peds.length === 1 && peds[0].itens.length === 4 && peds[0].itens.filter((i) => i.produtoId?.startsWith('refri')).length === 2, `pedido gravado com 4 itens, 2 de bebida (total R$ ${peds[0]?.total})`);

console.log('\n4) Bebida desligada no painel fica "Esgotado"');
await adm.click('[data-view="cardapio"]');
await adm.click('[data-col="produtos"]');
await adm.locator('.crud-item', { hasText: 'Refrigerante lata' }).locator('.switch').click();
await adm.waitForTimeout(1200);
await cli.goto(`${SITE}/index.html`);
await cli.waitForSelector('.produto');
await cli.click('#cardapio [data-produto="pizza-grande"]');
await cli.waitForSelector('#mp-bebidas');
const lata = await cli.locator('#mp-bebidas .opcao', { hasText: 'lata' });
check((await lata.textContent()).includes('Esgotado') && !(await lata.locator('[data-beb]').count()), 'lata: "Esgotado", sem botão +');
await cli.click('#mp-sheet [data-fechar]');

console.log('\n5) Produto simples também tem "Adicionar e finalizar"');
await cli.click('#cardapio [data-produto="molho-alho"]');
await cli.waitForSelector('#mp-fin');
check(!(await cli.$('#mp-bebidas')), 'sem lista de bebidas fora da pizza');
await cli.click('#mp-fin');
await cli.waitForSelector('#tela-carrinho:not([hidden])');
check(true, 'abre o carrinho');

console.log('\n6) Foto da bebida preenche o quadro (igual à pizza)');
await cli.goto(`${SITE}/index.html`);
await cli.waitForSelector('.produto');
await adm.evaluate(async (V) => {
  const m = await import(`/js/firebase-config.js?${V}`);
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const foto = cv.toDataURL('image/jpeg', 0.7);
  await m.updateDoc(m.doc(m.db, 'produtos', 'refri-2l'), { fotoUrl: foto });
}, V);
await cli.waitForSelector('#cardapio [data-produto="refri-2l"] img');
check(await cli.$eval('#cardapio [data-produto="refri-2l"] img', (el) => getComputedStyle(el).objectFit) === 'cover', 'sem sobras brancas: a foto preenche o quadro');

check(!erros.length, `sem erros de JavaScript ${erros.join(' | ')}`);
console.log(`\nRESULTADO: ${ok} ok, ${falhas} falha(s)`);
await browser.close();
process.exit(falhas ? 1 : 0);
