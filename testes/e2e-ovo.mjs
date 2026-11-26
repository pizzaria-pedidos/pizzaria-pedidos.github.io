// Testa: quantidade própria na metade e no terço (ex.: Portuguesa 3 ovos inteira, 2 na ½, 1 no ⅓).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const { chromium, devices } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');

const DIR = path.dirname(new URL(import.meta.url).pathname);
const SITE = 'http://127.0.0.1:5500';
const FB = path.join(DIR, 'node_modules/firebase');
const V = 'v=31';
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
    Portuguesa: { itens: [it('Presunto', 1, 'kg', 30, 100), it('Ovo', 30, 'un', 24, 3)] },
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

console.log('\n1) Sem preencher nada: tudo divide como antes');
let cu = await fichas(adm);
const ovo = ingPor(cu, 'Ovo');
check(ovo && ovo.base === 'un' && perto(ovo.preco, 0.8), `Ovo: R$ 0,80 a unidade (${ovo && ovo.preco})`);
const mussG = (await custos(adm, pizza('Grande', 'mussarela'))).custo;
// Portuguesa: presunto 100 g a R$ 30/kg = 3,00 + 3 ovos = 2,40 → recheio 5,40
const portG = (await custos(adm, pizza('Grande', 'portuguesa'))).custo;
check(perto(portG - mussG, 5.4 - 6), `inteira: 3 ovos (diferença p/ Mussarela ${(portG - mussG).toFixed(2)})`);
const meiaAntes = (await custos(adm, pizza('Grande', 'portuguesa', 'mussarela'))).custo;
check(perto(meiaAntes - mussG, 2.7 - 3), 'meia Portuguesa: divide tudo por 2 (1,5 ovo)');

console.log('\n2) Não existe mais a caixinha "Quantidade fixa"');
await adm.click('[data-cu="ficha"][data-v="sabores"]');
await adm.click('[data-cu="sabSel"][data-id="portuguesa"]');
check(!(await adm.$('#v-custos input[type="checkbox"]')), 'nenhuma caixinha de marcar nas fichas');
const nBt = await adm.$$eval('#v-custos [data-cu="frAbrir"]', (els) => els.length);
check(nBt === 2, `botão "Quantidade diferente na metade e no terço" em cada ingrediente (${nBt})`);

console.log('\n3) Ovos da Portuguesa: 3 na inteira, 2 na metade, 1 no terço');
const iOvo = await adm.$$eval('#v-custos select[data-ci="ing"]', (els) => els.findIndex((s) => s.options[s.selectedIndex].text === 'Ovo'));
await adm.click(`#v-custos [data-cu="frAbrir"][data-i="${iOvo}"]`);
await adm.waitForSelector(`#v-custos input[data-f="meia"][data-i="${iOvo}"]`);
await adm.waitForTimeout(200);   // o painel põe o cursor na metade logo depois de abrir os campos
check((await adm.getAttribute(`#v-custos input[data-f="meia"][data-i="${iOvo}"]`, 'placeholder')) === '1,5', 'campo da metade mostra a conta automática (1,5) como dica');
await adm.fill(`#v-custos input[data-f="meia"][data-i="${iOvo}"]`, '2');
await adm.fill(`#v-custos input[data-f="terco"][data-i="${iOvo}"]`, '1');
await adm.waitForTimeout(1500);
const res = await adm.textContent('#cu-res');
// ½ = presunto 1,50 + 2 ovos 1,60 = 3,10 · ⅓ = presunto 1,00 + 1 ovo 0,80 = 1,80
check(res.includes('3,10') && res.includes('1,80'), 'ficha: Metade R$ 3,10 e Terço R$ 1,80');
await adm.screenshot({ path: `${shots}/01-ficha-portuguesa.png`, fullPage: true });
cu = await fichas(adm);
const itOvo = cu.sabores.portuguesa.itens[iOvo];
check(itOvo.meia === '2' && itOvo.terco === '1' && itOvo.usa === '3' || (itOvo.meia === '2' && itOvo.terco === '1'), `gravado no banco (meia ${itOvo.meia}, terço ${itOvo.terco})`);
check(!('meia' in cu.sabores.portuguesa.itens[1 - iOvo]), 'o presunto continua dividindo sozinho');

console.log('\n4) Custo do pedido usa o que foi preenchido');
check(perto((await custos(adm, pizza('Grande', 'portuguesa'))).custo, portG), 'inteira: continua 3 ovos');
const meia = (await custos(adm, pizza('Grande', 'portuguesa', 'mussarela'))).custo;
check(perto(meia - mussG, 3.1 - 3), `meia Portuguesa/Mussarela: 2 ovos (diferença ${(meia - mussG).toFixed(2)})`);
const terco = (await custos(adm, pizza('Grande', 'portuguesa', 'mussarela', 'frango-catupiry'))).custo;
check(perto(terco - mussG, 1.8 + 2 + 2.56 / 3 - 6), `3 sabores: 1 ovo no terço (diferença ${(terco - mussG).toFixed(2)})`);
const calM = (await custos(adm, pizza('Grande', 'calabresa', 'mussarela'))).custo;
check(perto(calM - mussG, (5.6 - 6) / 2), 'Calabresa sem preencher nada: continua dividindo (ovo da ficha dela vira 0,5)');

console.log('\n5) Só em Sabores');
await adm.click('[data-cu="ficha"][data-v="base"]');
check((await adm.$$eval('#v-custos [data-cu="frAbrir"]', (els) => els.length)) === 0, 'Base não tem (vai inteira em toda pizza)');
await adm.click('[data-cu="ficha"][data-v="massa"]');
check((await adm.$$eval('#v-custos [data-cu="frAbrir"]', (els) => els.length)) === 0, 'Massa não tem');

console.log('\n6) Gramas');
await adm.click('[data-cu="tab"][data-v="gramas"]');
await adm.waitForTimeout(300);
const linhaOvo = await adm.$$eval('#v-custos tr', (trs) => trs.map((t) => [...t.cells].map((c) => c.textContent.trim()).join('|')).filter((t) => t.startsWith('Ovo')));
check(linhaOvo.includes('Ovo|3 un|2 un|1 un'), `Portuguesa: Ovo 3 / 2 / 1 (${linhaOvo.join(' ; ')})`);
await adm.screenshot({ path: `${shots}/02-gramas.png`, fullPage: true });

console.log('\n7) Voltar a dividir sozinho');
await adm.click('[data-cu="tab"][data-v="fichas"]');
await adm.click('[data-cu="ficha"][data-v="sabores"]');
await adm.click('[data-cu="sabSel"][data-id="portuguesa"]');
await adm.click(`#v-custos [data-cu="frTirar"][data-i="${iOvo}"]`);
await adm.waitForTimeout(1500);
cu = await fichas(adm);
check(!('meia' in cu.sabores.portuguesa.itens[iOvo]), 'apagou a quantidade própria');
check(perto((await custos(adm, pizza('Grande', 'portuguesa', 'mussarela'))).custo, meiaAntes), 'meia volta a dividir por 2');
check(await adm.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'celular: sem rolagem para o lado');

check(!erros.length, `sem erros de JavaScript ${erros.join(' | ')}`);
console.log(`\nRESULTADO: ${ok} ok, ${falhas} falha(s)`);
await browser.close();
process.exit(falhas ? 1 : 0);
