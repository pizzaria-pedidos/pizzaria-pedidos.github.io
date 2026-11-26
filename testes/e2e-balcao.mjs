// Testa: 🏪 Pedido no balcão (index.html?balcao=1) — só o dono logado no painel faz pedido pelo cliente.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const { chromium, devices } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');

const DIR = path.dirname(new URL(import.meta.url).pathname);
const SITE = 'http://127.0.0.1:5500';
const FB = path.join(DIR, 'node_modules/firebase');
const V = 'v=30';
const shots = path.join(DIR, 'shots-balcao');
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

const pedidos = () => adm.evaluate(async (V) => {
  const m = await import(`/js/firebase-config.js?${V}`);
  return (await m.getDocs(m.collection(m.db, 'pedidos'))).docs.map((d) => ({ id: d.id, ...d.data() }));
}, V);
const cliente = (tel) => adm.evaluate(async ({ V, tel }) => {
  const m = await import(`/js/firebase-config.js?${V}`);
  const s = await m.getDoc(m.doc(m.db, 'clientes', tel));
  return s.exists() ? s.data() : null;
}, { V, tel });
const br = (t) => String(t || '').replace(/ /g, ' ');

console.log('\n1) Botão no painel');
await adm.click('[data-view="pedidos"]');
check(await adm.isVisible('#btn-balcao') && (await adm.getAttribute('#btn-balcao', 'href')) === 'index.html?balcao=1', 'Pedidos: botão "🏪 Pedido no balcão" (abre index.html?balcao=1)');

console.log('\n2) Quem não está logado no painel não consegue');
const ctxC = await ctxNovo({ ...devices['iPhone 13'] });
const estranho = await ctxC.newPage(); vigiar(estranho, 'estranho');
await estranho.goto(`${SITE}/index.html?balcao=1`);
await estranho.waitForFunction(() => document.getElementById('bc-msg').textContent.includes('logado no painel'));
check(!(await estranho.isVisible('#form-balcao')) && !(await estranho.isVisible('#app')), 'celular sem o login do painel: "só funciona no aparelho logado no painel", sem cardápio');

console.log('\n3) Dono: cliente com WhatsApp (novo)');
const bal = await ctxA.newPage(); vigiar(bal, 'balcao');   // mesmo celular do painel (mesmo login)
await bal.goto(`${SITE}/index.html?balcao=1`);
await bal.waitForSelector('#form-balcao:not([hidden])');
check((await bal.textContent('#tela-balcao')).includes('WhatsApp é opcional'), 'tela "Pedido no balcão": WhatsApp opcional + nome');
await bal.fill('#bc-tel', '71977776666');
await bal.waitForSelector('#bc-achado:not([hidden])');
check((await bal.textContent('#bc-achado')).includes('Cliente novo'), 'número novo: "🆕 Cliente novo"');
await bal.click('#bc-btn');
check((await bal.textContent('#bc-erro')).includes('nome'), 'sem nome: pede o nome');
await bal.fill('#bc-nome', 'João Balcão');
await bal.click('#bc-btn');
await bal.waitForSelector('#app:not([hidden]) .produto');
const faixa = await bal.textContent('#faixa-balcao');
check(faixa.includes('MODO BALCÃO') && faixa.includes('João Balcão') && faixa.includes('(71) 97777-6666'), `faixa laranja: "${faixa.trim().replace(/\s+/g, ' ')}"`);
check(!(await bal.isVisible('#btn-trocar')) && !(await bal.isVisible('nav.abas')), 'sem "Trocar número" e sem a aba "Meus pedidos"');
await bal.click('#cardapio [data-produto="pizza-grande"]');
await bal.click('[data-sabor="calabresa"]');
await bal.click('[data-beb="refri-2l"][data-d="1"]');
await bal.click('#mp-fin');
await bal.waitForSelector('#tela-carrinho:not([hidden])');
check(await bal.isChecked('input[name="tipo"][value="retirada"]'), 'começa em "Retirar no local"');
await bal.locator('#pagamentos label', { hasText: 'Dinheiro' }).click();
check((await bal.textContent('#btn-finalizar')).includes('Registrar pedido'), 'botão final: "✅ Registrar pedido"');
await bal.screenshot({ path: `${shots}/01-carrinho-balcao.png` });
await bal.click('#btn-finalizar');
await bal.waitForSelector('#tela-sucesso:not([hidden])');
check((await bal.textContent('#tela-sucesso h2')) === 'Pedido registrado!', 'tela "Pedido registrado!" (não abre o WhatsApp da pizzaria)');
const link = await bal.getAttribute('#sucesso-link', 'href');
check(await bal.isVisible('#sucesso-link') && link.includes('phone=5571977776666') && decodeURIComponent(link).includes('Código do seu pedido'), 'botão "📲 Mandar resumo para o cliente" (WhatsApp do cliente)');
await bal.screenshot({ path: `${shots}/02-registrado.png` });
let ps = await pedidos();
const p1 = ps[0];
check(ps.length === 1 && p1.origem === 'balcao' && p1.status === 'novo' && p1.clienteTel === '5571977776666' && p1.clienteNome === 'João Balcão' && p1.tipo === 'retirada' && p1.itens.length === 2, 'pedido gravado: origem balcão, status Novo, cliente e itens');
let c1 = await cliente('5571977776666');
check(c1 && c1.nome === 'João Balcão' && c1.totalPedidos === 1, 'cliente cadastrado em Clientes (1 pedido)');
check(await bal.evaluate(() => localStorage.getItem('pz_carrinho') === null && localStorage.getItem('pz_cliente') === null), 'não mexeu no cadastro/carrinho pessoal do celular');

console.log('\n4) Painel: chega como pedido novo, com etiqueta 🏪 Balcão');
await adm.waitForSelector('.pedido-card .tag-balcao');
check((await adm.textContent('.pedido-card')).includes('João Balcão') && await adm.isVisible('#badge-novos'), 'card com "🏪 Balcão" + contador de pedidos novos (o som toca como os outros)');
await adm.screenshot({ path: `${shots}/03-painel.png`, fullPage: true });

console.log('\n5) Próximo cliente: já cadastrado, o nome vem sozinho');
await bal.click('#bc-novo');
await bal.waitForSelector('#form-balcao:not([hidden])');
await bal.fill('#bc-tel', '(71) 97777-6666');
await bal.waitForFunction(() => document.getElementById('bc-achado').textContent.includes('Já é cliente'));
check((await bal.inputValue('#bc-nome')) === 'João Balcão' && (await bal.textContent('#bc-achado')).includes('1 pedido'), 'número conhecido: "⭐ Já é cliente: João Balcão · 1 pedido" e nome preenchido');
await bal.click('#bc-btn');
await bal.waitForSelector('#app:not([hidden]) .produto');
await bal.click('#cardapio [data-produto="refri-lata"]');
await bal.click('#mp-fin');
await bal.waitForSelector('#tela-carrinho:not([hidden])');
await bal.locator('#pagamentos label', { hasText: 'Pix' }).click();
await bal.click('#btn-finalizar');
await bal.waitForSelector('#tela-sucesso:not([hidden])');
c1 = await cliente('5571977776666');
check(c1.totalPedidos === 2, 'mesmo cliente: agora 2 pedidos');

console.log('\n6) Cliente sem WhatsApp');
await bal.click('#bc-novo');
await bal.waitForSelector('#form-balcao:not([hidden])');
await bal.fill('#bc-nome', 'Seu Zé');
await bal.click('#bc-btn');
await bal.waitForSelector('#app:not([hidden]) .produto');
check((await bal.textContent('#faixa-balcao')).includes('sem WhatsApp'), 'faixa: "sem WhatsApp"');
await bal.click('#cardapio [data-produto="refri-lata"]');
await bal.click('#mp-fin');
await bal.waitForSelector('#tela-carrinho:not([hidden])');
await bal.locator('#pagamentos label', { hasText: 'Pix' }).click();
await bal.click('#btn-finalizar');
await bal.waitForSelector('#tela-sucesso:not([hidden])');
check(!(await bal.isVisible('#sucesso-link')), 'sem número: não aparece "Mandar resumo"');
ps = await pedidos();
const pz = ps.find((p) => p.clienteNome === 'Seu Zé');
check(pz && pz.clienteTel === '' && pz.origem === 'balcao', 'pedido registrado sem número');
await adm.waitForFunction(() => [...document.querySelectorAll('.pedido-card')].some((c) => c.textContent.includes('Seu Zé')));
const cardZe = adm.locator('.pedido-card', { hasText: 'Seu Zé' });
check((await cardZe.textContent()).includes('(sem WhatsApp)'), 'painel: "Seu Zé (sem WhatsApp)"');
await cardZe.locator('[data-pronto]').click();
await adm.waitForTimeout(800);
await adm.locator('.pedido-card', { hasText: 'Seu Zé' }).locator('[data-avancar]').click();
await adm.waitForTimeout(800);
check((await pedidos()).find((p) => p.clienteNome === 'Seu Zé').status === 'concluido', 'sem WhatsApp: "✅ Pedido pronto" → "🏁 Entregue ao cliente" conclui');

console.log('\n7) Fora do horário: avisa, mas deixa registrar');
await adm.evaluate(async (V) => {
  const m = await import(`/js/firebase-config.js?${V}`);
  const h = Object.fromEntries(['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'].map((d) => [d, { aberto: false, abre: '18:00', fecha: '23:00' }]));
  await m.setDoc(m.doc(m.db, 'config', 'loja'), { horarios: h }, { merge: true });
}, V);
await bal.click('#bc-novo');
await bal.fill('#bc-nome', 'Cliente Tarde');
await bal.click('#bc-btn');
await bal.waitForSelector('#app:not([hidden]) .produto');
await bal.click('#cardapio [data-produto="refri-lata"]');
await bal.click('#mp-fin');
await bal.waitForSelector('#tela-carrinho:not([hidden])');
await bal.locator('#pagamentos label', { hasText: 'Pix' }).click();
check(br(await bal.textContent('#resumo')).includes('Loja fechada pelo horário') && !(await bal.isDisabled('#btn-finalizar')), 'aviso "⚠️ Loja fechada pelo horário…" e o botão continua liberado');
await bal.screenshot({ path: `${shots}/04-fora-do-horario.png` });
await bal.click('#btn-finalizar');
await bal.waitForSelector('#tela-sucesso:not([hidden])');
check((await pedidos()).some((p) => p.clienteNome === 'Cliente Tarde'), 'pedido registrado fora do horário');
// e o cliente comum continua bloqueado
const comum = await ctxC.newPage(); vigiar(comum, 'comum');
await comum.goto(`${SITE}/index.html`);
await comum.fill('#id-tel', '71966665555');
await comum.fill('#id-nome', 'Maria Comum');
await comum.click('#id-btn');
await comum.waitForSelector('.produto');
await comum.click('#cardapio [data-produto="refri-lata"]');
await comum.click('#mp-fin');
await comum.waitForSelector('#tela-carrinho:not([hidden])');
check(await comum.isDisabled('#btn-finalizar'), 'cliente comum, pelo link: continua bloqueado fora do horário');

check(!erros.length, `sem erros de JavaScript ${erros.join(' | ')}`);
console.log(`\nRESULTADO: ${ok} ok, ${falhas} falha(s)`);
await browser.close();
process.exit(falhas ? 1 : 0);
