// Testa: custos salvos com o painel aberto em DOIS aparelhos ao mesmo tempo (um não apaga o do outro).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const { chromium, devices } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');

const DIR = path.dirname(new URL(import.meta.url).pathname);
const SITE = 'http://127.0.0.1:5500';
const FB = path.join(DIR, 'node_modules/firebase');
const V = 'v=34';
const shots = path.join(DIR, 'shots-sincronia');
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
    Calabresa: { itens: [it('Calabresa', 1, 'kg', 30, 150), it('Cebola', 1, 'kg', 6, 50)] },
    Mussarela: { itens: [it('Mussarela', 1, 'kg', 40, 150)] },
    'Frango c/ Catupiry': { itens: [it('Frango', 1, 'kg', 20, 80), it('Catupiry', 1, 'kg', 12, 80)] },
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

const esperarSalvo = (pg) => pg.waitForFunction(() => document.getElementById('cu-salvo')?.textContent.includes('Tudo salvo'), null, { timeout: 10000 });

// ---------- segundo aparelho (notebook), aberto ao mesmo tempo ----------
const ctxB = await ctxNovo({ viewport: { width: 1280, height: 900 } });
const nb = await ctxB.newPage(); vigiar(nb, 'notebook');
nb.on('dialog', (d) => d.accept());
await nb.goto(`${SITE}/admin.html`);
await nb.fill('#login-email', 'dono@teste.com');
await nb.fill('#login-senha', 'senha123');
await nb.click('#login-btn');
await nb.waitForSelector('#painel:not([hidden])');
await nb.waitForTimeout(1500);
await nb.click('#btn-cadeado');
await nb.fill('#cu-pin', '1234');
await nb.click('#modal-rodape button[type="submit"]');
await nb.waitForSelector('#v-custos:not([hidden])');
await nb.click('[data-cu="tab"][data-v="fichas"]');

console.log('\n1) Indicador "✓ Tudo salvo"');
check(await adm.isVisible('#cu-salvo') && (await adm.textContent('#cu-salvo')).includes('Tudo salvo'), 'celular: "✓ Tudo salvo" no topo da área de custos');

console.log('\n2) Celular preenche as bebidas; notebook muda o preço da Calabresa — ao mesmo tempo');
await adm.click('[data-cu="ficha"][data-v="simples"]');
await nb.click('[data-cu="ficha"][data-v="ingredientes"]');
const idCal = await nb.evaluate(async (V) => {
  const m = await import(`/js/firebase-config.js?${V}`);
  const f = (await m.getDoc(m.doc(m.db, 'custos', 'fichas'))).data();
  return Object.values(f.ingredientes).find((i) => i.nome === 'Calabresa').id;
}, V);
// os dois digitam quase juntos
await adm.fill('[data-ci="simples"][data-id="refri-2l"][data-f="qtd"]', '6');
await nb.fill(`[data-ci="ingPreco"][data-id="${idCal}"]`, '28,50');
await adm.fill('[data-ci="simples"][data-id="refri-2l"][data-f="preco"]', '36');
await nb.press(`[data-ci="ingPreco"][data-id="${idCal}"]`, 'Tab');
check((await adm.textContent('#cu-salvo')).includes('Salvando'), 'enquanto grava: "💾 Salvando…"');
await esperarSalvo(adm);
await esperarSalvo(nb);
await adm.waitForTimeout(1500);
let cu = await fichas(adm);
check(cu.simples['refri-2l']?.qtd === '6' && cu.simples['refri-2l']?.preco === '36', `bebida do celular salva: ${JSON.stringify(cu.simples['refri-2l'])}`);
check(Math.abs(cu.ingredientes[idCal].preco - 28.5) < 0.001, `preço da Calabresa do notebook salvo: ${cu.ingredientes[idCal].preco}`);

console.log('\n3) Depois, o notebook mexe em outra coisa — não pode apagar a bebida do celular');
await nb.click('[data-cu="ficha"][data-v="massa"]');
await nb.fill('[data-ci="rende"]', '5');
await esperarSalvo(nb);
await nb.waitForTimeout(1200);
cu = await fichas(adm);
check(cu.massa.rende === '5', 'massa do notebook salva');
check(cu.simples['refri-2l']?.preco === '36', 'a bebida do celular continua lá');
check(Math.abs(cu.ingredientes[idCal].preco - 28.5) < 0.001, 'o preço da Calabresa continua lá');

console.log('\n4) E o celular, mexendo de novo, também não apaga nada do notebook');
await adm.click('[data-cu="ficha"][data-v="sabores"]');
await adm.click('[data-cu="sabSel"][data-id="mussarela"]');
await adm.fill('#v-custos input[data-ci="m"][data-i="0"]', '170');
await esperarSalvo(adm);
await adm.waitForTimeout(1200);
cu = await fichas(adm);
check(cu.sabores.mussarela.itens[0].usa === '170', 'sabor do celular salvo');
check(cu.massa.rende === '5' && Math.abs(cu.ingredientes[idCal].preco - 28.5) < 0.001 && cu.simples['refri-2l']?.preco === '36', 'massa, Calabresa e bebida continuam lá');

console.log('\n5) Os dois aparelhos mostram a mesma coisa');
await nb.click('[data-cu="ficha"][data-v="simples"]');
check((await nb.inputValue('[data-ci="simples"][data-id="refri-2l"][data-f="preco"]')) === '36', 'notebook mostra a bebida que o celular preencheu');
await adm.click('[data-cu="ficha"][data-v="ingredientes"]');
check((await adm.inputValue(`[data-ci="ingPreco"][data-id="${idCal}"]`)) === '28,5', 'celular mostra o preço que o notebook mudou');

console.log('\n6) Sem internet: avisa e salva quando volta');
await ctxA.setOffline(true);
await adm.fill(`[data-ci="ingPreco"][data-id="${idCal}"]`, '29');
await adm.waitForTimeout(1500);
await ctxA.setOffline(false);
await esperarSalvo(adm);
await adm.waitForTimeout(1500);
cu = await fichas(nb);
check(Math.abs(cu.ingredientes[idCal].preco - 29) < 0.001, 'voltou a internet: o preço digitado offline foi salvo');

check(!erros.length, `sem erros de JavaScript ${erros.join(' | ')}`);
console.log(`\nRESULTADO: ${ok} ok, ${falhas} falha(s)`);
await browser.close();
process.exit(falhas ? 1 : 0);
