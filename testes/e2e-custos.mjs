import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const { chromium, devices } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');

const DIR = path.dirname(new URL(import.meta.url).pathname);
const SITE = 'http://127.0.0.1:5500';
const FB = path.join(DIR, 'node_modules/firebase');
const shots = path.join(DIR, 'shots-custos');
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
const vigiar = (pg, n) => { pg.on('pageerror', (e) => erros.push(`[${n}] ${e.message}`)); };
const toastTem = (pg, t) => pg.waitForFunction((t) => document.getElementById('toast').textContent.includes(t), t, { timeout: 8000 });

// ---------- admin: login, seed, ajustes ----------
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
await adm.click('[data-view="pedidos"]');

console.log('\nCadeado + PIN');
check(await adm.isVisible('#btn-cadeado'), 'cadeado visível no topo');
await adm.click('#btn-cadeado');
await adm.waitForSelector('#cu-p1');
await adm.fill('#cu-p1', '12');
await adm.fill('#cu-p2', '12');
await adm.click('#modal-rodape button[type="submit"]');
check((await adm.textContent('#cu-pin-erro')).includes('4 a 8'), 'PIN curto rejeitado');
await adm.fill('#cu-p1', '1234');
await adm.fill('#cu-p2', '1234');
await adm.click('#modal-rodape button[type="submit"]');
await adm.waitForSelector('#v-custos:not([hidden])');
check(await adm.evaluate(() => document.body.classList.contains('custo')), 'entrou na área (tema azul)');
check(await adm.isHidden('#v-pedidos'), 'tela de pedidos escondida');
await adm.screenshot({ path: `${shots}/01-balanco-vazio.png` });

console.log('\nImportar backup do sistema antigo');
await adm.click('[data-cu="tab"][data-v="fichas"]');
await adm.click('[data-cu="ficha"][data-v="massa"]');
await adm.waitForSelector('[data-ci="rende"]');
let alertaFora = '';
adm.removeAllListeners('dialog');
adm.on('dialog', (d) => { if (d.type() === 'alert') alertaFora = d.message(); d.accept(); });
await adm.setInputFiles('#cu-importar', path.join(DIR, 'backup-antigo.json'));
await toastTem(adm, 'importadas');
await adm.waitForTimeout(500);
check(alertaFora.includes('Napolitana') && alertaFora.includes('Coca Lata'), 'avisa o que ficou de fora (nomes diferentes)');
check((await adm.inputValue('[data-ci="rende"]')) === '4', 'massa importada (rende 4)');
check((await adm.textContent('#cu-res')).includes('1,25'), 'custo de 1 disco = R$ 1,25');
await adm.screenshot({ path: `${shots}/02-massa.png`, fullPage: true });

await adm.click('[data-cu="ficha"][data-v="base"]');
check((await adm.textContent('#cu-res')).includes('10,25'), 'base de 1 pizza = R$ 10,25');
check((await adm.textContent('#v-custos')).toLowerCase().includes('ainda não definido'), 'avisa proporção da Média não definida');
await adm.fill('[data-ci="fator"][data-tam="Média"]', '70');
await adm.screenshot({ path: `${shots}/03-base-tamanhos.png`, fullPage: true });

await adm.click('[data-cu="ficha"][data-v="sabores"]');
await adm.click('[data-cu="sabSel"][data-id="calabresa"]');
const resCal = await adm.textContent('#cu-res');
check(resCal.includes('14,75'), 'Calabresa Grande: custo R$ 14,75');
check(resCal.includes('10,33') || resCal.includes('10,32'), 'Calabresa Média (70%): custo ~R$ 10,33');
check(resCal.includes('37,25'), 'Calabresa Grande: lucro R$ 37,25 (vende 52)');
check(await adm.$eval('[data-cu="sabSel"][data-id="atum"]', (b) => b.classList.contains('vazia')), 'sabor sem ficha com contorno tracejado');
await adm.screenshot({ path: `${shots}/04-sabores.png`, fullPage: true });

// edição manual: adiciona ingrediente no recheio do Atum
await adm.click('[data-cu="sabSel"][data-id="atum"]');
await adm.click('[data-cu="mAdd"]');
await adm.waitForTimeout(150); // o painel põe o cursor no campo novo — espera como uma pessoa
// ficha nova: escolhe "➕ Novo ingrediente", cria Atum sólido a R$ 50/kg, usa 170 g = R$ 8,50
await adm.selectOption('[data-ci="ing"][data-i="0"]', '__novo');
await adm.waitForSelector('#cu-ing-nome');
await adm.fill('#cu-ing-nome', 'Atum sólido');
await adm.selectOption('#cu-ing-base', 'kg');
await adm.fill('#cu-ing-preco', '50,00');
await adm.click('#modal-rodape button[type="submit"]');
await adm.waitForSelector('#modal', { state: 'hidden' });
await adm.fill('[data-ci="m"][data-i="0"][data-f="usa"]', '170');
check((await adm.textContent('[data-calc="0"]')).includes('8,50'), 'conta automática ao digitar (vírgula aceita)');

await adm.click('[data-cu="ficha"][data-v="simples"]');
check((await adm.textContent('[data-bcalc="refri-2l"]')).includes('8,00'), 'Refrigerante 2L importado: custo R$ 8,00 cada');

console.log('\nPedido do cliente → balanço automático');
await adm.waitForTimeout(1200); // debounce de salvar
const ctxC = await ctxNovo({ ...devices['Pixel 7'] });
const cli = await ctxC.newPage(); vigiar(cli, 'cliente');
await cli.goto(`${SITE}/index.html`);
await cli.fill('#id-tel', '71999998888');
await cli.fill('#id-nome', 'Maria Souza');
await cli.click('#id-btn');
await cli.waitForSelector('.produto');
await cli.click('#cardapio [data-produto="pizza-grande"]');
await cli.click('[data-sabor="calabresa"]');
await cli.click('[data-sabor="frango-catupiry"]');
await cli.click('[data-borda="catupiry"]');
await cli.click('#mp-add');
await cli.waitForSelector('#modal-produto', { state: 'hidden' });
await cli.click('#cardapio [data-produto="pizza-media"]');
await cli.click('[data-sabor="calabresa"]');
await cli.click('#mp-add');
await cli.waitForSelector('#modal-produto', { state: 'hidden' });
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

console.log('   cliente url:', cli.url(), '| erro checkout:', await cli.textContent('#checkout-erro').catch(()=>'-'));
await adm.click('[data-cu="tab"][data-v="balanco"]');
await adm.waitForTimeout(3000);
console.log('   balanço:', (await adm.textContent('#cu-bal')).slice(0,300));
await adm.waitForFunction(() => document.querySelector('#cu-bal')?.textContent.includes('Maria Souza'), null, { timeout: 8000 });
await adm.waitForTimeout(1500);
const bal = await adm.textContent('#cu-bal');
check(bal.includes('120,00'), 'vendido em produtos R$ 120,00 (64 + 42 + 14)');
check(bal.includes('35,83'), 'dinheiro do custo R$ 35,83');
check(bal.includes('84,17'), 'dinheiro do lucro R$ 84,17');
check(bal.includes('Taxas de entrega') && bal.includes('5,00'), 'taxa de entrega à parte');
check(!bal.includes('ainda não têm o custo gravado'), 'custo gravado automaticamente ao chegar o pedido');
const salvo = await adm.evaluate(async () => {
  const m = await import('/js/firebase-config.js?v=31');
  const s = await m.getDocs(m.collection(m.db, 'custosPedidos'));
  return s.docs.map((d) => d.data().custo);
});
check(salvo.length === 1 && Math.abs(salvo[0] - 35.83) < 0.02, `custosPedidos gravado (${salvo})`);
await adm.screenshot({ path: `${shots}/05-balanco.png`, fullPage: true });

console.log('\nLucro e Gramas');
await adm.click('[data-cu="tab"][data-v="lucro"]');
const luc = await adm.textContent('#cu-corpo');
check(luc.includes('Pizza Grande') && luc.includes('Pizza Média') && luc.includes('Bebidas e outros'), 'tabelas de lucro por tamanho e bebidas');
await adm.screenshot({ path: `${shots}/06-lucro.png`, fullPage: true });
await adm.click('[data-cu="tab"][data-v="gramas"]');
let gr = await adm.textContent('#cu-corpo');
check(gr.includes('150 g') && gr.includes('75 g') && gr.includes('50 g'), 'Calabresa Grande: 150 g / ½ 75 g / ⅓ 50 g');
await adm.click('[data-cu="gramTam"][data-v="Média"]');
gr = await adm.textContent('#cu-corpo');
check(gr.includes('105 g'), 'Calabresa Média: 105 g (70%)');
await adm.screenshot({ path: `${shots}/07-gramas.png`, fullPage: true });

console.log('\nSair, PIN errado/certo, dados persistem');
await adm.click('[data-cu="sair"]');
check(await adm.isVisible('#v-pedidos') && !(await adm.evaluate(() => document.body.classList.contains('custo'))), 'saiu da área');
await adm.reload();
await adm.waitForSelector('#painel:not([hidden])');
await adm.waitForTimeout(1500);
await adm.click('#btn-cadeado');
await adm.waitForSelector('#cu-pin');
await adm.fill('#cu-pin', '9999');
await adm.click('#modal-rodape button[type="submit"]');
await adm.waitForFunction(() => document.getElementById('cu-pin-erro').textContent.includes('incorreto'));
check(true, 'PIN errado bloqueado');
await adm.fill('#cu-pin', '1234');
await adm.click('#modal-rodape button[type="submit"]');
await adm.waitForSelector('#v-custos:not([hidden])');
await adm.click('[data-cu="tab"][data-v="fichas"]');
await adm.click('[data-cu="ficha"][data-v="sabores"]');
await adm.click('[data-cu="sabSel"][data-id="atum"]');
check((await adm.$eval('[data-ci="ing"][data-i="0"]', (el) => el.selectedOptions[0]?.textContent)) === 'Atum sólido' && (await adm.inputValue('[data-ci="m"][data-i="0"][data-f="usa"]')) === '170', 'ficha editada à mão continuou salva após recarregar');

console.log('\nSegurança: cliente não lê custos');
await cli.goto(`${SITE}/index.html`);
await cli.waitForSelector('.produto');
const tentar = (col, id) => cli.evaluate(async ([col, id]) => {
  const m = await import('/js/firebase-config.js?v=31');
  try { if (id) await m.getDoc(m.doc(m.db, col, id)); else await m.getDocs(m.collection(m.db, col)); return 'permitido'; } catch (e) { return e.code; }
}, [col, id]);
check((await tentar('custos', 'fichas')) === 'permission-denied', 'cliente não lê custos/fichas');
check((await tentar('custosPedidos')) === 'permission-denied', 'cliente não lista custosPedidos');

const larg = await adm.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
check(larg, 'área de custos sem rolagem horizontal no celular');

// PC
const ctxPC = await ctxNovo({ viewport: { width: 1280, height: 900 } });
const pc = await ctxPC.newPage(); vigiar(pc, 'pc');
await pc.goto(`${SITE}/admin.html`);
await pc.fill('#login-email', 'dono@teste.com');
await pc.fill('#login-senha', 'senha123');
await pc.click('#login-btn');
await pc.waitForSelector('#painel:not([hidden])');
await pc.waitForTimeout(1500);
await pc.screenshot({ path: `${shots}/08-pc-cadeado.png` });
await pc.click('#btn-cadeado');
await pc.fill('#cu-pin', '1234');
await pc.click('#modal-rodape button[type="submit"]');
await pc.waitForSelector('#v-custos:not([hidden])');
await pc.click('[data-cu="tab"][data-v="fichas"]');
await pc.click('[data-cu="ficha"][data-v="sabores"]');
await pc.screenshot({ path: `${shots}/09-pc-sabores.png`, fullPage: true });

console.log('\nTamanho desligado (Média) some da área de custos');
await pc.evaluate(async () => { const m = await import('/js/firebase-config.js?v=31'); await m.updateDoc(m.doc(m.db, 'produtos', 'pizza-media'), { disponivel: false }); });
await pc.waitForTimeout(1200);
await pc.click('[data-cu="tab"][data-v="lucro"]');
let txt = await pc.textContent('#cu-corpo');
check(txt.includes('Pizza Grande') && !txt.includes('Pizza Média'), 'Lucro: só Pizza Grande');
await pc.click('[data-cu="tab"][data-v="fichas"]');
await pc.click('[data-cu="ficha"][data-v="base"]');
txt = await pc.textContent('#cu-corpo');
check(!txt.includes('Média') && !txt.toLowerCase().includes('ainda não definido'), 'Base e tamanhos: sem Média e sem aviso');
await pc.click('[data-cu="ficha"][data-v="sabores"]');
txt = await pc.textContent('#cu-res');
check(!txt.includes('Média'), 'Sabores: sem linha da Média');
await pc.screenshot({ path: `${shots}/10-pc-base-1tamanho.png`, fullPage: true });

console.log('\nAviso quando a página não carrega');
await pc.goto(`${SITE}/admin.html`);
await pc.waitForTimeout(13000);
check(await pc.isHidden('#falha-carga'), 'página normal: sem aviso de falha');
const ctxF = await ctxNovo({ ...devices['iPhone 13'] });
await ctxF.route('**/js/admin.js*', (r) => r.abort());
const pf = await ctxF.newPage();
await pf.goto(`${SITE}/admin.html`);
await pf.waitForSelector('#falha-carga:not([hidden])', { timeout: 15000 }).then(() => check(true, 'script quebrado: mostra "Não conseguimos abrir" + Recarregar'), () => check(false, 'aviso de falha'));
await pf.screenshot({ path: `${shots}/11-falha.png` });

console.log('\nErros de JavaScript:', erros.length ? '\n  ' + erros.join('\n  ') : 'nenhum');
console.log(`\nRESULTADO: ${ok} ok, ${falhas} falha(s)`);
await browser.close();
process.exit(falhas ? 1 : 0);
