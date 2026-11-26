// Testa: lista única de ingredientes (migração), nota fiscal (texto real do Eduardo), histórico, lucro mínimo.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const { chromium, devices } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');

const DIR = path.dirname(new URL(import.meta.url).pathname);
const SITE = 'http://127.0.0.1:5500';
const FB = path.join(DIR, 'node_modules/firebase');
const V = 'v=27';
const shots = path.join(DIR, 'shots-nota');
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
const NOTA1 = fs.readFileSync(path.join(DIR, 'compra-15-11-2026.txt'), 'utf8');

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

console.log('\n1) Fichas antigas viraram a lista única de ingredientes');
let cu = await fichas(adm);
const nomes = Object.values(cu.ingredientes).map((i) => i.nome).sort();
check(nomes.length === 12, `12 ingredientes, sem repetir: ${nomes.join(', ')}`);
check(nomes.filter((n) => n === 'Mussarela').length === 1, 'Mussarela aparece uma vez (estava na Base e no sabor Mussarela)');
check(cu.base.itens.every((x) => x.ing && !('preco' in x)), 'fichas agora só apontam para o ingrediente');
check(Math.abs(ingPor(cu, 'Molho de tomate').preco - 8) < 0.001 && ingPor(cu, 'Molho de tomate').emb === 2, 'Molho de tomate: R$ 8/kg, embalagem de 2 kg lembrada');
await adm.click('[data-cu="ficha"][data-v="sabores"]');
await adm.click('[data-cu="sabSel"][data-id="calabresa"]');
check((await adm.textContent('#cu-res')).includes('14,96'), 'custo da Calabresa igual a antes da mudança (R$ 14,96)');
check((await adm.$eval('[data-ci="ing"][data-i="0"]', (el) => el.selectedOptions[0].textContent)) === 'Calabresa', 'ficha da Calabresa mostra o ingrediente escolhido');
await adm.click('[data-cu="ficha"][data-v="ingredientes"]');
await adm.screenshot({ path: `${shots}/01-ingredientes.png`, fullPage: true });

console.log('\n2) Nota fiscal de 15/11 (texto exato do Eduardo)');
await adm.click('[data-cu="tab"][data-v="nota"]');
check(await adm.isVisible('[data-cu="copiarPrompt"]'), 'botão "Copiar pedido para a IA"');
await adm.fill('#cu-nota-texto', NOTA1);
await adm.click('[data-cu="lerNota"]');
await adm.waitForSelector('.nota-linha');
const linhas = await adm.$$eval('.nota-linha', (els) => els.length);
check(linhas === 18, `leu as 18 linhas (${linhas})`);
check((await adm.inputValue('[data-nl="data"]')) === '2026-11-15', 'data da compra 15/11/2026');
const destinoDe = (i) => adm.$eval(`select[data-nl="${i}"][data-campo="destino"]`, (el) => el.selectedOptions[0].textContent);
check((await destinoDe(0)) === 'Mussarela', 'Queijo mussarela Morro Alto → Mussarela');
check((await destinoDe(1)) === 'Catupiry', 'Requeijão cremoso → Catupiry');
check((await destinoDe(3)) === 'Calabresa', 'Calabresa fatiada → Calabresa');
check((await destinoDe(4)) === 'Frango', 'Filé de peito de frango → Frango');
check((await destinoDe(13)) === '— escolha —', 'Pimenta calabresa NÃO vai para Calabresa');
const pend = await adm.$$eval('.nota-linha.pendente', (els) => els.length);
check(pend === 7, `7 linhas para você escolher (presunto, bacon, milho, pimenta, vinagre, embalagem, refrigerante): ${pend}`);
check((await adm.textContent('#nlres-0')).includes('36,99/kg'), 'Mussarela: 4,154 kg por R$ 153,66 = R$ 36,99/kg');
check((await adm.textContent('#nlres-1')).includes('29,99/kg'), 'Requeijão 1,5 kg por R$ 44,99 = R$ 29,99/kg');
check((await adm.textContent('#nlres-7')).includes('35,80/kg'), 'Fermento 500 g por R$ 17,90 = R$ 35,80/kg');
check((await adm.textContent('#nlres-11')).includes('8,40/kg'), 'Molho sem tamanho na nota: usou a embalagem lembrada (2 kg) = R$ 8,40/kg');
console.log('\n   Óleo 900 ml (o caso do Eduardo)');
check((await adm.inputValue('[data-nl="8"][data-campo="q"]')) === '900' && (await adm.inputValue('[data-nl="8"][data-campo="qUn"]')) === 'ml', 'óleo: quantidade vem como 900 ml (não 0,9 L)');
check((await adm.inputValue('[data-nl="7"][data-campo="q"]')) === '500' && (await adm.inputValue('[data-nl="7"][data-campo="qUn"]')) === 'g', 'fermento: vem como 500 g');
let ol = await adm.textContent('#nlres-8');
check(ol.includes('8,88/L') && ol.includes('por 900 ml'), `óleo: "${ol.replace(/\s+/g, ' ').trim()}"`);
await adm.selectOption('[data-nl="8"][data-campo="qUn"]', 'L');
ol = await adm.textContent('#nlres-8');
check(ol.includes('Variação muito grande'), 'se a unidade ficar errada (900 L): aparece "⚠️ Variação muito grande"');
await adm.selectOption('[data-nl="8"][data-campo="qUn"]', 'ml');
await adm.fill('[data-nl="8"][data-campo="q"]', '900');
check((await adm.textContent('#nlres-8')).includes('8,88/L') && !(await adm.textContent('#nlres-8')).includes('muito grande'), 'voltando para ml: R$ 8,88/L, sem aviso');
await adm.screenshot({ path: `${shots}/02-conferencia.png`, fullPage: true });

// escolhe o destino das 7 pendentes
const escolher = async (i, valor) => { await adm.selectOption(`select[data-nl="${i}"][data-campo="destino"]`, valor); await adm.waitForTimeout(100); };
const novo = async (i, nome, base) => {
  await escolher(i, 'novo');
  await adm.fill(`[data-nl="${i}"][data-campo="novoNome"]`, nome);
  if (base) { await adm.selectOption(`[data-nl="${i}"][data-campo="novoBase"]`, base); await adm.waitForTimeout(100); }
};
await novo(2, 'Presunto');
await novo(5, 'Bacon');
await novo(12, 'Milho');
await novo(13, 'Pimenta calabresa');
await escolher(15, 'ignorar');
await novo(16, 'Embalagem para pizza', 'un');
check(await adm.$eval('[data-nl="16"][data-campo="q"]', (el) => el.classList.contains('conferir')), 'embalagem: pede para conferir a quantidade');
await adm.fill('[data-nl="16"][data-campo="q"]', '25');
check((await adm.textContent('#nlres-16')).includes('1,16/un'), 'embalagem: 25 unidades por R$ 28,99 = R$ 1,16 cada');
await escolher(17, 'simples:refri-2l');
check((await adm.inputValue('[data-nl="17"][data-campo="q"]')) === '12', 'refrigerante: "fardo com 12" → 12 unidades');
check((await adm.textContent('#nlres-17')).includes('3,92/un'), 'refrigerante: R$ 3,92 cada');
await adm.click('[data-cu="notaAplicar"]');
await adm.waitForSelector('text=Preços atualizados');
await adm.screenshot({ path: `${shots}/03-resultado.png`, fullPage: true });

console.log('\n3) Preços aplicados e impacto');
await adm.waitForTimeout(1500);
cu = await fichas(adm);
const pr = (n) => Math.round(ingPor(cu, n).preco * 100) / 100;
check(pr('Mussarela') === 36.99 && pr('Catupiry') === 29.99 && pr('Calabresa') === 24.99 && pr('Frango') === 21.99, 'Mussarela 36,99 · Catupiry 29,99 · Calabresa 24,99 · Frango 21,99 (por kg)');
check(pr('Farinha de trigo') === 4.59 && pr('Fermento biológico') === 35.8 && pr('Óleo') === 8.88 && pr('Embalagem para pizza') === 1.16, 'Farinha 4,59 · Fermento 35,80 · Óleo 8,88/L · Embalagem 1,16/un');
check(cu.simples['refri-2l'].qtd === 12 && cu.simples['refri-2l'].preco === 46.99, 'refrigerante: fardo de 12 por R$ 46,99');
check(!Object.values(cu.ingredientes).some((i) => /vinagre/i.test(i.nome)), 'vinagre ignorado (não virou ingrediente)');
const res = await adm.textContent('#cu-corpo');
check(/Pizza Calabresa\s*R\$\s*14,96\s*R\$\s*13,74/.test(res), 'impacto: Pizza Calabresa custo R$ 14,96 → R$ 13,74');
check(await adm.isVisible('[data-cu="embBase"]'), 'sugere colocar a embalagem na Base');
await adm.click('[data-cu="embBase"]');
await toastTem(adm, 'Embalagem colocada');
await adm.click('[data-cu="tab"][data-v="lucro"]');
check(/Calabresa\s*R\$\s*14,90/.test(await adm.textContent('#cu-corpo')), 'com a embalagem na Base, Calabresa custa R$ 14,90');

console.log('\n4) Alerta de lucro baixo');
await adm.fill('[data-ci="lucroMin"]', '40');
await adm.press('[data-ci="lucroMin"]', 'Tab');
await adm.waitForTimeout(500);
const lucro = await adm.textContent('#cu-corpo');
check(lucro.includes('com lucro abaixo de') && lucro.includes('Calabresa'), 'aviso: pizzas com lucro abaixo de R$ 40 (Calabresa)');
check(await adm.$$eval('tr.lucro-baixo', (els) => els.length) > 0, 'linhas marcadas em vermelho');
await adm.screenshot({ path: `${shots}/04-lucro.png`, fullPage: true });

console.log('\n5) Segunda compra: outra marca, e o sistema lembra');
await adm.click('[data-cu="tab"][data-v="nota"]');
await adm.click('[data-cu="notaNova"]');
await adm.fill('#cu-nota-texto', `Compra de 22/11/2026
* Calabresa fatiada Perdigão: 1,5 kg × 27,99 = 41,99
* Queijo muçarela Tirolez: 2 kg × 38,50 = 77,00
* Pimenta calabresa: 0,1 kg × 45,00 = 4,50
* Vinagre de álcool Maratá 500 ml: 1 × 2,19 = 2,19`);
await adm.click('[data-cu="lerNota"]');
await adm.waitForSelector('.nota-linha');
check((await destinoDe(0)) === 'Calabresa', 'Calabresa Perdigão → Calabresa (marca diferente)');
check((await destinoDe(1)) === 'Mussarela', '"muçarela" Tirolez → Mussarela');
check((await destinoDe(2)) === 'Pimenta calabresa' && (await adm.textContent('#nl-2')).includes('já conhecido'), 'Pimenta calabresa: lembrou da nota anterior');
check((await destinoDe(3)).includes('Ignorar') && (await adm.textContent('#nl-3')).includes('já conhecido'), 'vinagre: lembrou de ignorar');
check(await adm.$$eval('.nota-linha.pendente', (els) => els.length) === 0, 'nenhuma linha pendente');
await adm.click('[data-cu="notaAplicar"]');
await adm.waitForSelector('text=Preços atualizados');
check((await adm.textContent('#cu-corpo')).includes('+12,0%'), 'Calabresa subiu 12,0%');

console.log('\n6) Histórico de preços');
await adm.click('[data-cu="tab"][data-v="fichas"]');
await adm.click('[data-cu="ficha"][data-v="ingredientes"]');
const card = adm.locator('.ing-card', { has: adm.locator('input[value="Calabresa"]') });
check((await card.textContent()).includes('🔺 +12,0%') && (await card.textContent()).includes('22/11/2026'), 'Calabresa: última compra 22/11 e 🔺 +12,0%');
await card.locator('.ing-hist summary').click();
const hist = await card.locator('.ing-hist tr').count();
check(hist === 4, `histórico da Calabresa com 3 preços (fichas anteriores, 15/11, 22/11): ${hist - 1}`);
await adm.screenshot({ path: `${shots}/05-historico.png`, fullPage: true });

console.log('\n7) Apagar um preço lançado errado (✕ no histórico)');
const oleo = adm.locator('.ing-card', { has: adm.locator('input[value="Óleo"]') });
await oleo.locator('.ing-hist summary').click();
check((await oleo.locator('[data-ci="ingPreco"]').inputValue()) === '8,88', 'óleo está em R$ 8,88/L (da nota)');
await oleo.locator('.hist-x').first().click();
await toastTem(adm, 'voltou para');
const oleo2 = adm.locator('.ing-card', { has: adm.locator('input[value="Óleo"]') });
check((await oleo2.locator('[data-ci="ingPreco"]').inputValue()) === '8,89', 'apagou o último: voltou para o preço anterior (R$ 8,89/L)');
cu = await fichas(adm);
check(ingPor(cu, 'Óleo').hist.length === 1, 'histórico ficou só com o preço anterior');

console.log('\nErros de JavaScript:', erros.length ? '\n  ' + erros.join('\n  ') : 'nenhum');
console.log(`\nRESULTADO: ${ok} ok, ${falhas} falha(s)`);
await browser.close();
process.exit(falhas ? 1 : 0);
