import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const SITE = 'http://127.0.0.1:5500';
const FB = path.join(DIR, 'node_modules/firebase');
const shots = path.join(DIR, 'shots');
fs.mkdirSync(shots, { recursive: true });

let ok = 0, falhas = 0;
const check = (cond, msg) => { if (cond) { ok++; console.log('  ✔', msg); } else { falhas++; console.log('  ✘', msg); } };

// --- cria usuário admin no emulador de Auth e injeta o UID nas regras ---
const r = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'dono@teste.com', password: 'senha123', returnSecureToken: true }),
});
const { localId } = await r.json();
const regras = fs.readFileSync(path.join(DIR, '..', 'firestore.rules'), 'utf8').replace(/request\.auth\.uid == '[^']+'/, `request.auth.uid == '${localId}'`);
fs.writeFileSync(path.join(DIR, 'regras-teste.rules'), regras);
await new Promise((s) => setTimeout(s, 2500)); // emulador recarrega regras
console.log('Admin UID:', localId);

const browser = await chromium.launch();
async function prepararContexto(opts) {
  const ctx = await browser.newContext(opts);
  await ctx.route('https://www.gstatic.com/firebasejs/10.12.2/*', (route) => {
    const nome = new URL(route.request().url()).pathname.split('/').pop();
    route.fulfill({ path: path.join(FB, nome), contentType: 'text/javascript' });
  });
  await ctx.route('**/js/firebase-config.js*', (route) => route.fulfill({ path: path.join(DIR, 'config-teste.js'), contentType: 'text/javascript' }));
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  await ctx.route('https://fonts.gstatic.com/**', (r) => r.abort());
  return ctx;
}
const erros = [];
const vigiar = (page, nome) => {
  page.on('pageerror', (e) => erros.push(`[${nome}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(`[${nome}] console: ${m.text()}`); });
};

// ================= ADMIN =================
const ctxA = await prepararContexto({ viewport: { width: 1280, height: 860 } });
const adm = await ctxA.newPage(); vigiar(adm, 'admin');
await adm.goto(`${SITE}/admin.html`);
await adm.fill('#login-email', 'dono@teste.com');
await adm.fill('#login-senha', 'senha123');
await adm.click('#login-btn');
await adm.waitForSelector('#painel:not([hidden])');
console.log('\nAdmin: login + seed + ajustes');
check(true, 'login do admin');
await adm.click('[data-view="config"]');
await adm.click('.avancado summary');
adm.once('dialog', (d) => d.accept());
await adm.click('#btn-seed');
await adm.waitForFunction(() => document.getElementById('toast').textContent.includes('exemplo cadastrado'));
check(true, 'seed do cardápio de exemplo');
await adm.waitForTimeout(500);
await adm.fill('[name="whatsapp"]', '(71) 98888-7777');
await adm.fill('[name="endereco"]', 'Rua da Pizzaria, 10 — Centro');
await adm.fill('[name="chavePix"]', 'pix@pizzaria.com');
for (const d of await adm.$$('.horario-linha')) {
  await (await d.$('[data-h="aberto"]')).check();
  await (await d.$('[data-h="abre"]')).fill('00:00');
  await (await d.$('[data-h="fecha"]')).fill('23:59');
}
await adm.click('#cfg-salvar');
await adm.waitForFunction(() => document.getElementById('toast').textContent.includes('salvos'));
check(true, 'ajustes salvos (whatsapp + horários)');
await adm.click('[data-view="pedidos"]');
// liga o áudio (gesto do usuário) e espiona o alerta
await adm.evaluate(() => { window.__beeps = 0; const o = AudioContext.prototype.createOscillator; AudioContext.prototype.createOscillator = function () { window.__beeps++; return o.call(this); }; });
await adm.mouse.click(5, 5);

// ================= CLIENTE (celular) =================
const ctxC = await prepararContexto({ ...devices['iPhone 13'] });
let urlWhats = null;
await ctxC.route('https://api.whatsapp.com/**', (route) => { urlWhats = route.request().url(); route.fulfill({ body: '<h1>whatsapp</h1>', contentType: 'text/html' }); });
const cli = await ctxC.newPage(); vigiar(cli, 'cliente');
await cli.goto(`${SITE}/index.html`);
console.log('\nCliente: critério 1 (identificação + pizza 3 sabores + bebida + entrega + Pix → WhatsApp)');
await cli.waitForSelector('#tela-boasvindas:not([hidden])');
await cli.screenshot({ path: `${shots}/01-boasvindas.png` });
await cli.fill('#id-tel', '71999998888');
check((await cli.inputValue('#id-tel')) === '(71) 99999-8888', 'máscara do telefone');
await cli.fill('#id-nome', 'João');
await cli.click('#id-btn');
check((await cli.textContent('#id-erro')).includes('sobrenome'), 'exige nome e sobrenome');
await cli.fill('#id-nome', 'João Silva');
await cli.click('#id-btn');
await cli.waitForSelector('#app:not([hidden])');
check((await cli.textContent('#primeiro-nome')) === 'João', 'saudação "Olá, João!"');
await cli.waitForSelector('.produto');
check((await cli.textContent('#status-loja')).startsWith('Aberta'), 'status Aberta');
await cli.screenshot({ path: `${shots}/02-cardapio.png`, fullPage: true });

await cli.click('#cardapio [data-produto="pizza-grande"]');
await cli.waitForSelector('#mp-sabores .opcao');
check(await cli.isDisabled('#mp-add'), 'botão desabilitado sem sabor');
for (const s of ['calabresa', 'frango-catupiry', 'portuguesa']) await cli.click(`[data-sabor="${s}"]`);
check((await cli.textContent('#mp-contador')) === '3 de 3 escolhidos', 'contador 3 de 3');
check(await cli.isDisabled('[data-sabor="atum"]'), 'bloqueia 4º sabor');
await cli.click('[data-borda="catupiry"]');
await cli.fill('#mp-obs', 'sem cebola');
check((await cli.textContent('#mp-add')).includes('66,00'), 'preço = sabor mais caro (58) + borda (8) = 66');
await cli.screenshot({ path: `${shots}/03-montagem.png` });
await cli.click('#mp-add');
await cli.waitForSelector('#modal-produto', { state: 'hidden' });
await cli.click('#cardapio [data-produto="refri-2l"]');
await cli.click('[data-qtd="1"]');
await cli.click('#mp-add');
await cli.waitForSelector('#modal-produto', { state: 'hidden' });
check((await cli.textContent('#barra-carrinho')).includes('3 itens'), 'barra do carrinho: 3 itens');
await cli.click('#barra-carrinho');
await cli.check('input[name="tipo"][value="entrega"]', { force: true });
await cli.click('#btn-finalizar');
check((await cli.textContent('#checkout-erro')).includes('rua'), 'valida endereço');
await cli.fill('[data-end="rua"]', 'Rua das Flores');
await cli.fill('[data-end="numero"]', '123');
await cli.fill('[data-end="bairro"]', 'Centro');
await cli.fill('[data-end="complemento"]', 'apto 201');
await cli.fill('[data-end="referencia"]', 'perto da farmácia');
await cli.click('#btn-finalizar');
check((await cli.textContent('#checkout-erro')).includes('pagamento'), 'valida pagamento');
await cli.locator('#pagamentos label', { hasText: 'Pix' }).click();
await cli.screenshot({ path: `${shots}/04-carrinho.png`, fullPage: true });
check((await cli.textContent('#resumo')).includes('99,00'), 'total = 66 + 28 + 5 = R$ 99,00');
await cli.click('#btn-finalizar');
await cli.waitForTimeout(2500);
check(!!urlWhats && urlWhats.startsWith('https://api.whatsapp.com/send?phone=5571988887777&text='), 'abriu wa.me no número da pizzaria');
const msg1 = urlWhats ? decodeURIComponent(urlWhats.split('text=')[1]) : '';
console.log('\n----- MENSAGEM 1 -----\n' + msg1 + '\n----------------------');
const cod1 = (msg1.match(/^🍕 \*Código do seu pedido: ([A-Z2-9]{6})\*$/m) || [])[1];
check(!!cod1 && /[A-Z]/.test(cod1) && /[0-9]/.test(cod1), `cabeçalho "Código do seu pedido: ${cod1}" (6 letras e números)`);
check(!/[01OIL]/.test(cod1 || ''), 'código sem 0/O/1/I/L');
check(!msg1.includes('NOVO PEDIDO'), 'sem "NOVO PEDIDO"');
check(!msg1.includes('Cliente novo') && !msg1.includes('º pedido') && !msg1.includes('Cliente desde'), 'sem "Cliente novo · 1º pedido" na mensagem');
check(msg1.includes('Sabores: Calabresa, Frango c/ Catupiry, Portuguesa'), 'sabores na mensagem');
check(msg1.includes('Borda: Catupiry (+R$'), 'borda na mensagem');
check(msg1.includes('Complemento: apto 201 · Ref.: perto da farmácia'), 'complemento/ref na mensagem');
check(msg1.includes('*TOTAL: R$') && msg1.includes('99,00'), 'total na mensagem');

console.log('\nAdmin: critério 2 e 3 (pedido em tempo real com som, clientes)');
await adm.waitForSelector('.pedido-card .pc-num', { timeout: 8000 });
check((await adm.textContent('.pedido-card .pc-num')) === cod1, `painel mostra o mesmo número (${cod1})`);
await adm.waitForFunction(() => document.querySelector('.pedido-card .pc-hist')?.textContent.includes('Cliente novo · 1º pedido'), null, { timeout: 8000 })
  .then(() => check(true, 'painel: "Cliente novo · 1º pedido" no card'), () => check(false, 'painel: "Cliente novo · 1º pedido" no card'));
check((await adm.evaluate(() => window.__beeps)) > 0, 'som de alerta tocou');
check((await adm.textContent('#stats')).includes('99,00'), 'faturamento do dia');
await adm.screenshot({ path: `${shots}/05-admin-pedidos.png`, fullPage: true });
await adm.click('[data-view="clientes"]');
await adm.waitForSelector('#tabela-clientes tbody tr[data-cli]');
const linha1 = await adm.textContent('#tabela-clientes tbody tr[data-cli]');
check(linha1.includes('João Silva') && /\b1\b/.test(linha1) && linha1.includes('99,00'), 'cliente com 1 pedido e total gasto');

// ===== segundo pedido (via "Pedir de novo"), em Dinheiro com troco =====
urlWhats = null;
await cli.goto(`${SITE}/index.html`);
await cli.waitForSelector('#app:not([hidden])');
check(true, 'critério 6: reabriu e entrou direto (sem pedir número)');
await cli.click('[data-aba="pedidos"]');
await cli.waitForSelector('[data-repetir]');
await cli.screenshot({ path: `${shots}/06-meus-pedidos.png` });
await cli.click('[data-repetir]');
await cli.waitForSelector('#tela-carrinho:not([hidden])');
check(await cli.inputValue('[data-end="rua"]') === 'Rua das Flores', 'endereço lembrado');
await cli.locator('#pagamentos label', { hasText: 'Dinheiro' }).click();
await cli.fill('#troco', '150');
await cli.click('#btn-finalizar');
await cli.waitForTimeout(2500);
const msg2 = urlWhats ? decodeURIComponent(urlWhats.split('text=')[1]) : '';
const cod2 = (msg2.match(/Código do seu pedido: ([A-Z2-9]{6})/) || [])[1];
check(!!cod2 && cod2 !== cod1, `segundo pedido com outro número (${cod1} → ${cod2})`);
check(!msg2.includes('º pedido') && !msg2.includes('Cliente desde'), 'segundo pedido: sem histórico do cliente na mensagem');
await adm.click('[data-view="pedidos"]');
await adm.waitForFunction(() => {
  const h = [...document.querySelectorAll('.pedido-card .pc-hist')].map((e) => e.textContent);
  return h.length === 2 && h[0].includes('2º pedido') && h[0].includes('cliente desde') && h[1].includes('1º pedido');
}, null, { timeout: 8000 })
  .then(() => check(true, 'painel: card novo "2º pedido · cliente desde", card antigo "1º pedido"'), () => check(false, 'painel: 2º/1º pedido nos cards'));
await adm.screenshot({ path: `${shots}/10-admin-historico.png` });
await adm.click('[data-view="clientes"]');
check(msg2.includes('troco para R$') && msg2.includes('150,00'), 'troco na mensagem');
await adm.waitForFunction(() => document.querySelector('#tabela-clientes tbody tr[data-cli]')?.children[2]?.textContent.trim() === '2', null, { timeout: 8000 }).then(() => check(true, 'clientes: passou para 2 pedidos'), () => check(false, 'clientes: passou para 2 pedidos'));

console.log('\nCritério 4: desativar sabor reflete sem recarregar');
await cli.goto(`${SITE}/index.html`);
await cli.waitForSelector('.produto');
await adm.click('[data-view="cardapio"]');
await adm.click('[data-col="sabores"]');
await adm.fill('#crud-busca', 'catupiry');
await adm.click('[data-massa="false"]');
await cli.waitForTimeout(1200);
await cli.click('#cardapio [data-produto="pizza-grande"]');
await cli.waitForSelector('#mp-sabores .opcao');
check(await cli.isDisabled('[data-sabor="frango-catupiry"]'), 'Frango c/ Catupiry ficou indisponível no cliente');
check((await cli.textContent('[data-sabor="frango-catupiry"]')).includes('Esgotado'), 'mostra "Esgotado"');
await cli.screenshot({ path: `${shots}/07-esgotado.png` });
await cli.click('#mp-sheet [data-fechar]');

console.log('\nCritério 5: fechar loja');
await adm.click('[data-view="pedidos"]');
adm.once('dialog', (d) => d.accept());
await adm.click('#btn-loja-toggle');
await cli.waitForFunction(() => document.getElementById('status-loja').textContent.startsWith('Fechada'), null, { timeout: 8000 });
check(true, 'cliente mostra "Fechada"');
await cli.click('#cardapio [data-produto="refri-lata"]');
await cli.click('#mp-add');
await cli.click('#barra-carrinho');
check(await cli.isDisabled('#btn-finalizar') && (await cli.textContent('#btn-finalizar')).includes('fechada'), 'finalizar bloqueado com loja fechada');
await cli.screenshot({ path: `${shots}/08-fechada.png` });

console.log('\nStatus e cancelamento');
await adm.click('[data-pronto]');
await adm.waitForTimeout(800);
const st = await adm.$$eval('.pedido-card .status', (els) => els.map((e) => e.textContent));
check(st.includes('Saiu para entrega'), '✅ Pedido pronto → Saiu para entrega');

console.log('\nRegras de segurança (como cliente anônimo)');
const tentar = (fn) => cli.evaluate(fn).catch((e) => 'ERRO ' + e.message);
const r1 = await tentar(async () => { const m = await import('/js/firebase-config.js?v=20'); try { await m.getDocs(m.collection(m.db, 'pedidos')); return 'permitido'; } catch (e) { return e.code; } });
check(r1 === 'permission-denied', `listar todos os pedidos negado (${r1})`);
const r2 = await tentar(async () => { const m = await import('/js/firebase-config.js?v=20'); try { await m.updateDoc(m.doc(m.db, 'clientes', '5571999998888'), { totalPedidos: 100 }); return 'permitido'; } catch (e) { return e.code; } });
check(r2 === 'permission-denied', `cliente inflar totalPedidos negado (${r2})`);
const r3 = await tentar(async () => { const m = await import('/js/firebase-config.js?v=20'); try { await m.setDoc(m.doc(m.db, 'produtos', 'hack'), { nome: 'x' }); return 'permitido'; } catch (e) { return e.code; } });
check(r3 === 'permission-denied', `cliente editar cardápio negado (${r3})`);
const r4 = await tentar(async () => { const m = await import('/js/firebase-config.js?v=20'); try { await m.addDoc(m.collection(m.db, 'pedidos'), { numero: 999, status: 'concluido' }); return 'permitido'; } catch (e) { return e.code; } });
check(r4 === 'permission-denied', `pedido forjado negado (${r4})`);
const r5 = await tentar(async () => { const m = await import('/js/firebase-config.js?v=20'); try { await m.getDocs(m.collection(m.db, 'clientes')); return 'permitido'; } catch (e) { return e.code; } });
check(r5 === 'permission-denied', `listar clientes negado (${r5})`);

// Link personalizado ?tel= num celular "novo"
console.log('\nLink personalizado ?tel=');
const ctxC2 = await prepararContexto({ ...devices['Pixel 7'] });
const cli2 = await ctxC2.newPage(); vigiar(cli2, 'cliente2');
await cli2.goto(`${SITE}/index.html?tel=5571999998888`);
await cli2.waitForSelector('#app:not([hidden])', { timeout: 8000 });
check((await cli2.textContent('#primeiro-nome')) === 'João', 'cliente já cadastrado entra direto pelo link');
await cli2.goto(`${SITE}/index.html?tel=71977776666`);
await cli2.waitForSelector('#tela-boasvindas:not([hidden])');
check((await cli2.inputValue('#id-tel')) === '(71) 97777-6666', 'número novo vem preenchido');

// admin no celular + dark mode
const ctxA2 = await prepararContexto({ ...devices['iPhone 13'], colorScheme: 'dark' });
const adm2 = await ctxA2.newPage(); vigiar(adm2, 'admin-mobile');
await adm2.goto(`${SITE}/admin.html`);
await adm2.fill('#login-email', 'dono@teste.com');
await adm2.fill('#login-senha', 'senha123');
await adm2.click('#login-btn');
await adm2.waitForSelector('.pedido-card');
await adm2.screenshot({ path: `${shots}/09-admin-mobile-dark.png`, fullPage: true });
const larg = await adm2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
check(larg, 'admin no celular sem rolagem horizontal');
const largC = await cli.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
check(largC, 'cliente no celular sem rolagem horizontal');

console.log('\nErros de página/console:', erros.length ? '\n  ' + erros.join('\n  ') : 'nenhum');
console.log(`\nRESULTADO: ${ok} ok, ${falhas} falha(s)`);
await browser.close();
process.exit(falhas ? 1 : 0);
