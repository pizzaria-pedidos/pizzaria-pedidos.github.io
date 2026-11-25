// Testa: ingrediente de quantidade fixa (ovo): 1 un na inteira, na ½ e no ⅓, em todo tamanho.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const { chromium, devices } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');

const DIR = path.dirname(new URL(import.meta.url).pathname);
const SITE = 'http://127.0.0.1:5500';
const FB = path.join(DIR, 'node_modules/firebase');
const V = 'v=21';
const shots = path.join(DIR, 'shots-ovo');
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

// fichas no formato antigo, parecidas com as do Eduardo
const it = (nome, pacote, un, preco, usa) => ({ id: nome, nome, pacote, un, preco, usa });
fs.writeFileSync(path.join(DIR, 'backup-eduardo.json'), JSON.stringify({ custos: { v: 2,
  massa: { rende: 4, itens: [it('Farinha de trigo', 1, 'kg', 4.2, 1000), it('Fermento biológico', 500, 'g', 15, 10), it('Açúcar', 1, 'kg', 4, 20), it('Sal', 1, 'kg', 2, 15), it('Óleo', 900, 'ml', 8, 50)] },
  base: { itens: [it('Molho de tomate', 2, 'kg', 16, 100), it('Mussarela', 1, 'kg', 40, 200), it('Orégano', 100, 'g', 5, 2)] },
  sabores: {
    Calabresa: { itens: [it('Calabresa', 1, 'kg', 30, 150), it('Cebola', 1, 'kg', 6, 50), it('Ovo', 30, 'un', 24, 1)] },
    Mussarela: { itens: [it('Mussarela', 1, 'kg', 40, 150)] },
    'Frango c/ Catupiry': { itens: [it('Frango', 1, 'kg', 20, 80), it('Catupiry', 1, 'kg', 12, 80)] },
    Portuguesa: { itens: [it('Presunto', 1, 'kg', 30, 100)] },
  },
  bordas: {}, bebidas: {} } }));

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
const fichas = (pg) => pg.evaluate(async (V) => {
  const m = await import(`/js/firebase-config.js?${V}`);
  return (await m.getDoc(m.doc(m.db, 'custos', 'fichas'))).data();
}, V);
const ingPor = (cu, nome) => Object.values(cu.ingredientes).find((i) => i.nome === nome);

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
await adm.click('#btn-cadeado');
await adm.fill('#cu-p1', '1234');
await adm.fill('#cu-p2', '1234');
await adm.click('#modal-rodape button[type="submit"]');
await adm.waitForSelector('#v-custos:not([hidden])');
await adm.click('[data-cu="tab"][data-v="fichas"]');
await adm.click('[data-cu="ficha"][data-v="massa"]');
await adm.setInputFiles('#cu-importar', path.join(DIR, 'backup-eduardo.json'));
await toastTem(adm, 'importadas');
await adm.waitForTimeout(1500);

const custos = (pg, pedido) => pg.evaluate(async ({ V, pedido }) => (await import(`/js/custos.js?${V}`)).calcPedido(pedido), { V, pedido });
const pizza = (tam, ...ids) => ({ itens: [{ tipo: 'pizza', nome: `Pizza ${tam}`, tamanho: tam, qtd: 1, precoUnit: 50, sabores: ids.map((id) => ({ id, nome: id })) }] });
const perto = (a, b) => Math.abs(a - b) < 0.015;

console.log('\n1) Ovo importado vira ingrediente em unidade, sem quantidade fixa ainda');
let cu = await fichas(adm);
const ovo = ingPor(cu, 'Ovo');
check(ovo && ovo.base === 'un' && perto(ovo.preco, 0.8), `Ovo: R$ 0,80 a unidade (${ovo && ovo.preco})`);
const antesMeia = (await custos(adm, pizza('Grande', 'calabresa', 'mussarela'))).custo;
const mussG = (await custos(adm, pizza('Grande', 'mussarela'))).custo;
check(perto(antesMeia - mussG, -0.2), `antes: o ovo era dividido na meia (diferença ${(antesMeia - mussG).toFixed(2)})`);

console.log('\n2) Marcar "Quantidade fixa" no ovo da Calabresa');
await adm.click('[data-cu="ficha"][data-v="sabores"]');
await adm.click('[data-cu="sabSel"][data-id="calabresa"]');
const nFx = await adm.$$eval('#v-custos .m-fx input', (els) => els.length);
check(nFx === 3, `caixinha "Quantidade fixa" em cada ingrediente do sabor (${nFx})`);
const iOvo = await adm.$$eval('#v-custos select[data-ci="ing"]', (els) => els.findIndex((s) => s.options[s.selectedIndex].text === 'Ovo'));
await adm.check(`#v-custos input[data-ci="fixo"][data-i="${iOvo}"]`);
await adm.waitForTimeout(1500);
const res = await adm.textContent('#cu-res');
check(res.includes('vai inteiro'), 'ficha avisa que o ovo vai inteiro nas frações');
// recheio var = 4,80; fixo = 0,80 → ½ = 3,20 e ⅓ = 2,40
check(res.includes('3,20') && res.includes('2,40'), 'Metade = R$ 3,20 e Terço = R$ 2,40 (o ovo entra inteiro)');
await adm.screenshot({ path: `${shots}/01-ficha-calabresa.png`, fullPage: true });
cu = await fichas(adm);
check(cu.sabores.calabresa.itens[iOvo].fixo === true, 'gravado no banco (fixo: true)');
check(cu.sabores.calabresa.itens.filter((x) => x.fixo).length === 1, 'só o ovo ficou fixo');

console.log('\n3) Custo do pedido: 1 ovo inteiro na inteira, na ½ e no ⅓');
const calabG = (await custos(adm, pizza('Grande', 'calabresa'))).custo;
const meia = (await custos(adm, pizza('Grande', 'calabresa', 'mussarela'))).custo;
const terco = (await custos(adm, pizza('Grande', 'calabresa', 'mussarela', 'frango-catupiry'))).custo;
check(perto(calabG - mussG, 5.6 - 6), `inteira: igual a antes (diferença p/ Mussarela ${(calabG - mussG).toFixed(2)})`);
check(perto(meia - mussG, 0.2), `meia Calabresa/Mussarela: recheio = 2,40 + 1 ovo 0,80 + 3,00 (diferença ${(meia - mussG).toFixed(2)})`);
check(perto(terco - mussG, (4.8 + 6 + 2.56) / 3 + 0.8 - 6), `3 sabores: o ovo entra inteiro (diferença ${(terco - mussG).toFixed(2)})`);
const dois = (await custos(adm, pizza('Grande', 'calabresa', 'calabresa'))).custo;
check(perto(dois - calabG, 0.8), 'meia Calabresa + meia Calabresa = 2 ovos (um em cada metade)');

console.log('\n4) Outro tamanho: o ovo não diminui');
await adm.click('[data-cu="ficha"][data-v="base"]');
await adm.fill('[data-ci="fator"][data-tam="Média"]', '70');
await adm.waitForTimeout(1500);
const calabM = (await custos(adm, pizza('Média', 'calabresa'))).custo;
const baseG = mussG - 6;
check(perto(calabM, (baseG + 4.8) * 0.7 + 0.8), `Média (70%): o resto diminui, o ovo continua 1 (R$ ${calabM})`);

console.log('\n5) Ovo escolhido em outro sabor já vem marcado');
await adm.click('[data-cu="ficha"][data-v="sabores"]');
await adm.click('[data-cu="sabSel"][data-id="portuguesa"]');
await adm.click('[data-cu="mAdd"]');
await adm.selectOption('#v-custos select[data-ci="ing"][data-i="1"]', { label: 'Ovo' });
await adm.waitForTimeout(300);
check(await adm.isChecked('#v-custos input[data-ci="fixo"][data-i="1"]'), 'Portuguesa: ao escolher "Ovo", a quantidade fixa já vem marcada');
await adm.fill('#v-custos input[data-ci="m"][data-i="1"]', '1');
await adm.click('[data-cu="ficha"][data-v="massa"]');
check((await adm.$$eval('#v-custos .m-fx', (els) => els.length)) === 0, 'Massa não tem a caixinha (a receita é dividida pelos discos)');
await adm.click('[data-cu="ficha"][data-v="adicionais"]');
check((await adm.$$eval('#v-custos .m-fx', (els) => els.length)) === 0, 'Adicionais não têm a caixinha');

console.log('\n6) Gramas e Lucro');
await adm.click('[data-cu="tab"][data-v="gramas"]');
await adm.waitForTimeout(300);
const linhaOvo = await adm.$$eval('#v-custos tr', (trs) => trs.map((t) => t.textContent).filter((t) => t.includes('Ovo')));
check(linhaOvo.length === 2 && linhaOvo.every((t) => (t.match(/1 un/g) || []).length === 3), `Gramas: Ovo "1 un" na inteira, ½ e ⅓ (${linhaOvo.join(' | ')})`);
await adm.screenshot({ path: `${shots}/02-gramas.png`, fullPage: true });
await adm.click('[data-cu="tab"][data-v="lucro"]');
await adm.waitForTimeout(300);
const lucro = await adm.textContent('#v-custos');
check(lucro.includes('Pizza Grande') && lucro.includes('Pizza Média'), 'Lucro mostra Grande e Média sem erro');
await adm.screenshot({ path: `${shots}/03-lucro.png`, fullPage: true });

console.log('\n7) Celular: a caixinha cabe na tela');
await adm.click('[data-cu="tab"][data-v="fichas"]');
await adm.click('[data-cu="ficha"][data-v="sabores"]');
await adm.click('[data-cu="sabSel"][data-id="calabresa"]');
const larg = await adm.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
check(larg, 'sem rolagem para o lado');
await adm.screenshot({ path: `${shots}/04-celular.png`, fullPage: true });

check(!erros.length, `sem erros de JavaScript ${erros.join(' | ')}`);
console.log(`\nRESULTADO: ${ok} ok, ${falhas} falha(s)`);
await browser.close();
process.exit(falhas ? 1 : 0);
