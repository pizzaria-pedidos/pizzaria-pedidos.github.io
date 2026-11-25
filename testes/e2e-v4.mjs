// Testa: apelido opcional, ligar/desligar entrega, esconder pizza desligada.
// REGRAS=antigas → usa o firestore.rules do último commit (o que está publicado hoje).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const { chromium, devices } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');

const DIR = path.dirname(new URL(import.meta.url).pathname);
const SITE = 'http://127.0.0.1:5500';
const FB = path.join(DIR, 'node_modules/firebase');
const ANTIGAS = process.env.REGRAS === 'antigas';
const shots = path.join(DIR, 'shots-v4');
fs.mkdirSync(shots, { recursive: true });
let ok = 0, falhas = 0;
const check = (c, m) => { if (c) { ok++; console.log('  ✔', m); } else { falhas++; console.log('  ✘', m); } };

const r = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'dono@teste.com', password: 'senha123', returnSecureToken: true }),
});
const { localId } = await r.json();
const fonte = ANTIGAS ? execSync(`git -C ${path.join(DIR, '..')} show HEAD:firestore.rules`).toString() : fs.readFileSync(path.join(DIR, '..', 'firestore.rules'), 'utf8');
console.log(`Regras: ${ANTIGAS ? 'ANTIGAS (publicadas hoje, sem apelido)' : 'NOVAS (deste commit)'}`);
fs.writeFileSync(path.join(DIR, 'regras-teste.rules'), fonte.replace(/request\.auth\.uid == '[^']+'/, `request.auth.uid == '${localId}'`));
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

// ---------- admin: login, seed, ajustes ----------
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
await adm.fill('[name="endereco"]', 'Rua da Pizzaria, 10');
for (const d of await adm.$$('.horario-linha')) {
  await (await d.$('[data-h="aberto"]')).check();
  await (await d.$('[data-h="abre"]')).fill('00:00');
  await (await d.$('[data-h="fecha"]')).fill('23:59');
}
await adm.click('#cfg-salvar');
await toastTem(adm, 'salvos');
await adm.click('[data-view="pedidos"]');

// ---------- cliente com apelido ----------
console.log('\n1) Apelido opcional');
const ctxC = await ctxNovo({ ...devices['iPhone 13'] });
let urlWhats = null;
await ctxC.route('https://api.whatsapp.com/**', (route) => { urlWhats = route.request().url(); route.fulfill({ body: 'ok', contentType: 'text/html' }); });
const cli = await ctxC.newPage(); vigiar(cli, 'cliente');
await cli.goto(`${SITE}/index.html`);
await cli.waitForSelector('#tela-boasvindas:not([hidden])');
check(await cli.isVisible('#id-apelido'), 'campo Apelido aparece');
check((await cli.textContent('#campo-apelido')).includes('opcional'), 'marcado como (opcional)');
await cli.fill('#id-tel', '71999998888');
await cli.fill('#id-nome', 'João Silva');
await cli.fill('#id-apelido', 'Joãozinho');
await cli.screenshot({ path: `${shots}/01-entrada.png` });
await cli.click('#id-btn');
await cli.waitForSelector('#app:not([hidden])');
check((await cli.textContent('#primeiro-nome')) === 'Joãozinho', 'cumprimenta pelo apelido: "Olá, Joãozinho!"');
await cli.waitForSelector('.produto');

// pedido de entrega normal
await cli.click('#cardapio [data-produto="refri-2l"]');
await cli.click('#mp-add');
await cli.waitForSelector('#modal-produto', { state: 'hidden' });
await cli.click('#barra-carrinho');
await cli.check('input[name="tipo"][value="entrega"]', { force: true });
await cli.fill('[data-end="rua"]', 'Rua A');
await cli.fill('[data-end="numero"]', '1');
await cli.fill('[data-end="bairro"]', 'Centro');
await cli.locator('#pagamentos label', { hasText: 'Pix' }).click();
await cli.click('#btn-finalizar');
await cli.waitForTimeout(2500);
let msg = urlWhats ? decodeURIComponent(urlWhats.split('text=')[1]) : '';
check(/Código do seu pedido: [A-Z2-9]{6}/.test(msg), 'pedido registrado (com código) mesmo com apelido');
check(msg.includes('*Cliente:* João Silva (Joãozinho)'), 'mensagem do WhatsApp: "João Silva (Joãozinho)"');

await adm.waitForSelector('.pedido-card .pc-num', { timeout: 8000 });
const apelidoSalvo = await adm.evaluate(async () => {
  const m = await import('/js/firebase-config.js?v=24');
  return (await m.getDoc(m.doc(m.db, 'clientes', '5571999998888'))).data()?.apelido || '';
});
if (ANTIGAS) {
  check(apelidoSalvo === '', 'regras antigas: apelido NÃO salvo na nuvem, mas o pedido passou');
} else {
  check(apelidoSalvo === 'Joãozinho', 'apelido salvo no cadastro do cliente');
  await adm.waitForFunction(() => document.querySelector('.pedido-card .pc-cliente')?.textContent.includes('Joãozinho'), null, { timeout: 8000 })
    .then(() => check(true, 'painel: apelido no card do pedido'), () => check(false, 'painel: apelido no card do pedido'));
  await adm.click('[data-view="clientes"]');
  await adm.fill('#cli-busca', 'joaozinho');
  await adm.waitForSelector('#tabela-clientes tbody tr[data-cli]');
  check((await adm.textContent('#tabela-clientes tbody')).includes('João Silva'), 'painel: busca por apelido (sem acento) acha o cliente');
  await adm.click('[data-view="pedidos"]');
}

// cliente sem apelido continua funcionando
const ctxC3 = await ctxNovo({ ...devices['Pixel 7'] });
const cli3 = await ctxC3.newPage(); vigiar(cli3, 'cliente-sem-apelido');
await cli3.goto(`${SITE}/index.html`);
await cli3.fill('#id-tel', '71988887777');
await cli3.fill('#id-nome', 'Ana Paula Costa');
await cli3.click('#id-btn');
await cli3.waitForSelector('#app:not([hidden])');
check((await cli3.textContent('#primeiro-nome')) === 'Ana', 'sem apelido: cumprimenta pelo primeiro nome');

// ---------- entrega ligar/desligar ----------
console.log('\n2) Ligar/desligar entrega');
await cli.goto(`${SITE}/index.html`);
await cli.waitForSelector('.produto');
check(await cli.isHidden('#aviso-retirada'), 'entrega ligada: sem aviso no topo');
check((await adm.textContent('#btn-entrega-toggle')).includes('Entrega ligada'), 'painel: botão "Entrega ligada · Desligar"');
await adm.click('#btn-entrega-toggle');
await toastTem(adm, 'Entrega desligada');
await cli.waitForSelector('#aviso-retirada:not([hidden])', { timeout: 8000 });
check(true, 'cliente: aparece "🏃 Hoje só retirada no local" sem recarregar');
check((await adm.textContent('#btn-entrega-toggle')).includes('Só retirada'), 'painel: botão mudou para "Só retirada hoje · Ligar entrega"');
await cli.screenshot({ path: `${shots}/02-topo-so-retirada.png` });
await cli.click('#cardapio [data-produto="refri-lata"]');
await cli.click('#mp-add');
await cli.waitForSelector('#modal-produto', { state: 'hidden' });
await cli.click('#barra-carrinho');
check(await cli.isDisabled('input[name="tipo"][value="entrega"]'), 'carrinho: opção Entrega bloqueada');
check(await cli.isChecked('input[name="tipo"][value="retirada"]'), 'carrinho: Retirada marcada sozinha');
check(await cli.isVisible('#entrega-off'), 'carrinho: mostra "hoje não"');
const pags = await cli.textContent('#pagamentos');
check(pags.includes('Cartão') && !pags.includes('na entrega'), `pagamento: "Cartão" sem "(na entrega)" → ${pags.replace(/\s+/g, ' ').trim()}`);
await cli.screenshot({ path: `${shots}/03b-pagamentos.png` });
const resumo = await cli.textContent('#resumo');
check(!resumo.includes('Taxa de entrega'), 'sem taxa de entrega no total');
await cli.screenshot({ path: `${shots}/03-carrinho-so-retirada.png`, fullPage: true });
await cli.locator('#pagamentos label', { hasText: 'Dinheiro' }).click();
urlWhats = null;
await cli.click('#btn-finalizar');
await cli.waitForTimeout(2500);
msg = urlWhats ? decodeURIComponent(urlWhats.split('text=')[1]) : '';
check(msg.includes('Retirada no local') && !msg.includes('Taxa de entrega'), 'mensagem: "Retirada no local", sem taxa');
check(/Código do seu pedido: [A-Z2-9]{6}/.test(msg), 'pedido de retirada registrado (com código)');

await adm.click('[data-view="config"]');
check((await adm.textContent('#cfg-entrega')).includes('Só retirada'), 'Ajustes: mesmo botão de entrega também aparece');
await adm.click('#cfg-entrega');
await toastTem(adm, 'Entrega ligada');
await cli.goto(`${SITE}/index.html`);
await cli.waitForSelector('.produto');
await cli.waitForTimeout(800);
check(await cli.isHidden('#aviso-retirada'), 'entrega religada: aviso some');
await cli.click('#cardapio [data-produto="refri-lata"]');
await cli.click('#mp-add');
await cli.waitForSelector('#modal-produto', { state: 'hidden' });
await cli.click('#barra-carrinho');
check(!(await cli.isDisabled('input[name="tipo"][value="entrega"]')), 'entrega religada: opção Entrega volta');
await cli.click('#tela-carrinho .tela-topo [data-fechar]');

// ---------- esconder pizza desligada ----------
console.log('\n3) Pizza Média desligada');
await adm.click('[data-view="cardapio"]');
await adm.click('[data-col="produtos"]');
await adm.locator('.crud-item', { hasText: 'Pizza Média' }).locator('.switch').click();
await cli.waitForSelector('#cardapio [data-produto="pizza-media"].indisp', { timeout: 8000 });
check(true, 'antes: aparece acinzentada (como o Eduardo viu)');
await adm.click('[data-col="sabores"]');
await adm.waitForFunction(() => !document.querySelector('#crud-lista')?.textContent.includes('Média'), null, { timeout: 8000 })
  .then(() => check(true, 'Cardápio → Sabores: lista sem preço da Média'), () => check(false, 'lista de sabores ainda mostra Média'));
await adm.locator('.crud-item', { hasText: 'Calabresa' }).locator('[data-editar]').click();
await adm.waitForSelector('#form-crud');
const tams = await adm.$$eval('#form-crud [data-tam]', (els) => els.map((e) => e.dataset.tam));
check(tams.length === 1 && tams[0] === 'Grande', `editar sabor: só o campo da Grande (${tams.join(', ')})`);
await adm.selectOption('#form-crud [name="grupo"]', ''); // preço próprio (fora dos grupos)
await adm.fill('#form-crud [data-tam="Grande"]', '35');
await adm.click('#crud-salvar');
await toastTem(adm, 'Salvo');
const precos = await adm.evaluate(async () => {
  const m = await import('/js/firebase-config.js?v=24');
  return (await m.getDoc(m.doc(m.db, 'sabores', 'calabresa'))).data().precos;
});
check(precos.Grande === 35, 'preço da Grande salvo (R$ 35)');
check(precos['Média'] === 42, 'preço antigo da Média continua guardado (para religar)');
await adm.screenshot({ path: `${shots}/06-sabores-so-grande.png` });
await adm.click('[data-view="config"]');
await adm.check('[name="ocultarIndisponiveis"]');
await adm.click('#cfg-salvar');
await toastTem(adm, 'salvos');
await cli.waitForSelector('#cardapio [data-produto="pizza-media"]', { state: 'detached', timeout: 8000 })
  .then(() => check(true, 'depois de "Esconder itens indisponíveis": some do cardápio'), () => check(false, 'Pizza Média sumiu'));
check(await cli.isVisible('#cardapio [data-produto="pizza-grande"]'), 'Pizza Grande continua');
await cli.screenshot({ path: `${shots}/04-sem-media.png`, fullPage: true });

const larg = await cli.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
check(larg, 'celular sem rolagem horizontal');
await adm.click('[data-view="pedidos"]');
await adm.screenshot({ path: `${shots}/05-painel.png` });

console.log('\nErros de JavaScript:', erros.length ? '\n  ' + erros.join('\n  ') : 'nenhum');
console.log(`\nRESULTADO: ${ok} ok, ${falhas} falha(s)`);
await browser.close();
process.exit(falhas ? 1 : 0);
