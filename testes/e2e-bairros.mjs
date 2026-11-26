// Testa: bairros de entrega com taxa automática + "bairro fora da lista" bloqueia a entrega + horário de Salvador e "Fechar agora" até a próxima abertura.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const { chromium, devices } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');

const DIR = path.dirname(new URL(import.meta.url).pathname);
const SITE = 'http://127.0.0.1:5500';
const FB = path.join(DIR, 'node_modules/firebase');
const V = 'v=31';
const shots = path.join(DIR, 'shots-bairros');
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

const loja = () => adm.evaluate(async (V) => {
  const m = await import(`/js/firebase-config.js?${V}`);
  return (await m.getDoc(m.doc(m.db, 'config', 'loja'))).data();
}, V);
const pedidos = () => adm.evaluate(async (V) => {
  const m = await import(`/js/firebase-config.js?${V}`);
  return (await m.getDocs(m.collection(m.db, 'pedidos'))).docs.map((d) => ({ id: d.id, ...d.data() }));
}, V);

console.log('\n1) Painel: cadastrar bairros com taxa');
check(await adm.isVisible('#cfg-bairros') && (await adm.textContent('#cfg-bairros')).includes('Nenhum bairro cadastrado'), 'Ajustes: quadro "🏘️ Bairros de entrega" (vazio = vale a taxa única)');
await adm.fill('#nb-nome', 'Centro');
await adm.fill('#nb-taxa', '5');
await adm.click('#nb-add');
await toastTem(adm, 'Centro adicionado');
await adm.fill('#nb-nome', 'Itapuã');
await adm.fill('#nb-taxa', '8');
await adm.press('#nb-taxa', 'Enter');
await toastTem(adm, 'Itapuã adicionado');
await adm.fill('#nb-nome', 'Stella Maris');
await adm.fill('#nb-taxa', '12');
await adm.click('#nb-add');
await toastTem(adm, 'Stella Maris adicionado');
await adm.fill('#nb-nome', 'centro');
await adm.click('#nb-add');
await toastTem(adm, 'já está na lista');
let L = await loja();
check(L.bairros?.length === 3 && L.bairros.map((b) => b.nome).join(',') === 'Centro,Itapuã,Stella Maris', `3 bairros salvos em ordem: ${L.bairros?.map((b) => `${b.nome} ${b.taxa}`).join(', ')}`);
const idStella = L.bairros.find((b) => b.nome === 'Stella Maris').id;
await adm.fill(`[data-bairro-taxa="${idStella}"]`, '10,50');
await adm.press(`[data-bairro-taxa="${idStella}"]`, 'Tab');
await toastTem(adm, 'Stella Maris: taxa');
L = await loja();
check(L.bairros.find((b) => b.id === idStella).taxa === 10.5, 'mudar a taxa de um bairro salva na hora (R$ 10,50)');
const idCentro = L.bairros.find((b) => b.nome === 'Centro').id;
await adm.click(`[data-bairro-del="${idCentro}"]`);
await toastTem(adm, 'Centro excluído');
L = await loja();
check(L.bairros.length === 2 && !L.bairros.some((b) => b.nome === 'Centro'), 'excluir bairro');
await adm.screenshot({ path: `${shots}/01-ajustes-bairros.png`, fullPage: true });

console.log('\n2) Cliente: escolhe o bairro e a taxa entra sozinha');
const ctxC = await ctxNovo({ ...devices['iPhone 13'], timezoneId: 'Asia/Tokyo' });   // celular em outro fuso: não pode atrapalhar
let url = null;
await ctxC.route('https://api.whatsapp.com/**', (route) => { url = route.request().url(); route.fulfill({ body: 'ok', contentType: 'text/html' }); });
const cli = await ctxC.newPage(); vigiar(cli, 'cliente');
await cli.goto(`${SITE}/index.html`);
await cli.fill('#id-tel', '71999998888');
await cli.fill('#id-nome', 'Maria Souza');
await cli.click('#id-btn');
await cli.waitForSelector('.produto');
check((await cli.textContent('#status-loja')).startsWith('Aberta'), 'celular no fuso de Tóquio: loja aparece Aberta (usa a hora de Salvador)');
async function carrinhoComRefri() {
  await cli.goto(`${SITE}/index.html`);
  await cli.waitForSelector('.produto');
  await cli.click('#cardapio [data-produto="refri-2l"]');
  await cli.click('#mp-fin');
  await cli.waitForSelector('#tela-carrinho:not([hidden])');
}
await carrinhoComRefri();
await cli.locator('#tela-carrinho label', { hasText: 'Entrega' }).click();
check(await cli.isVisible('#bairro-sel') && !(await cli.isVisible('[data-end="bairro"]')), 'Entrega: aparece a lista de bairros (o campo de digitar some)');
const opcoes = await cli.$$eval('#bairro-sel option', (os) => os.map((o) => o.textContent.trim().replace(/\u00a0/g, ' ')));
check(opcoes.join('|') === 'Escolha seu bairro…|Itapuã — R$ 8,00|Stella Maris — R$ 10,50|❌ Meu bairro não está na lista', `opções: ${opcoes.join(' | ')}`);
check((await cli.textContent('#resumo')).includes('escolha o bairro'), 'resumo: "Taxa de entrega: escolha o bairro"');
const campos = await cli.$$eval('#campos-entrega .campo', (els) => els.filter((e) => !e.hidden && e.offsetParent).map((e) => e.querySelector('span').textContent.trim()));
check(campos.join('|') === 'Bairro *|Número da casa *|Ponto de referência', `só 3 campos, nesta ordem: ${campos.join(' → ')}`);
await cli.fill('[data-end="numero"]', '10');
await cli.fill('[data-end="referencia"]', 'Perto da padaria');
await cli.locator('#pagamentos label', { hasText: 'Pix' }).click();
await cli.click('#btn-finalizar');
check((await cli.textContent('#checkout-erro')).includes('Escolha o seu bairro'), 'sem bairro: "Escolha o seu bairro para a entrega."');
await cli.selectOption('#bairro-sel', { label: 'Itapuã — R$ 8,00' });
await cli.waitForTimeout(200);
const resumo = await cli.textContent('#resumo');
check(resumo.includes('8,00') && resumo.includes('22,00'), `resumo: taxa R$ 8,00 e total R$ 22,00 (refri 14 + 8)`);
await cli.locator('#campos-entrega').scrollIntoViewIfNeeded();
await cli.screenshot({ path: `${shots}/02-cliente-bairro.png` });
await cli.click('#btn-finalizar');
await cli.waitForTimeout(2500);
let msg = url ? decodeURIComponent(url.split('text=')[1]).replace(/\u00a0/g, ' ') : '';
check(msg.includes('📍 Itapuã, nº 10') && msg.includes('Ref.: Perto da padaria') && msg.includes('Taxa de entrega: R$ 8,00'), 'WhatsApp: "📍 Itapuã, nº 10", "Ref.: Perto da padaria" e "Taxa de entrega: R$ 8,00"');
let [p1] = await pedidos();
check(p1.taxaEntrega === 8 && p1.total === 22 && p1.endereco.bairro === 'Itapuã' && p1.endereco.rua === '' && p1.endereco.numero === '10', 'pedido gravado com taxa 8, bairro Itapuã, nº 10 (sem rua)');

console.log('\n3) Próximo pedido: o bairro já vem escolhido');
await carrinhoComRefri();
check((await cli.$eval('#bairro-sel', (s) => s.options[s.selectedIndex].textContent)).startsWith('Itapuã'), 'Itapuã já marcado');

console.log('\n4) "Meu bairro não está na lista" → não deixa pedir entrega');
url = null;
const nPed = (await pedidos()).length;
await cli.selectOption('#bairro-sel', { label: '❌ Meu bairro não está na lista' });
await cli.waitForTimeout(200);
const info = await cli.textContent('#info-bairro');
check(await cli.isVisible('#info-bairro') && info.includes('Ainda não entregamos no seu bairro') && info.includes('Retirar no local'), 'aviso: "Ainda não entregamos no seu bairro… Retirar no local"');
const zap = await cli.getAttribute('#zap-bairro', 'href');
check(zap && zap.includes('api.whatsapp.com/send') && zap.includes('5571988887777'), 'botão "💬 falar com a gente no WhatsApp" (sem pedido)');
check(!(await cli.isVisible('[data-end="bairro"]')), 'não aparece campo para digitar outro bairro');
check(await cli.isDisabled('#btn-finalizar') && (await cli.textContent('#btn-finalizar')).includes('Não entregamos nesse bairro'), 'botão de finalizar bloqueado: "Não entregamos nesse bairro"');
check((await cli.textContent('#resumo')).includes('não entregamos'), 'resumo: taxa "não entregamos"');
await cli.locator('#campos-entrega').scrollIntoViewIfNeeded();
await cli.screenshot({ path: `${shots}/03-fora-da-lista.png` });
await cli.click('#btn-finalizar', { force: true });
await cli.waitForTimeout(1500);
check((await pedidos()).length === nPed && !url, 'nenhum pedido foi gravado nem enviado');

console.log('\n5) Mudou para "Retirar no local" → pode finalizar');
await cli.locator('#tela-carrinho label', { hasText: 'Retirar no local' }).click();
check(!(await cli.isDisabled('#btn-finalizar')), 'retirada: botão liberado');
await cli.click('#btn-finalizar');
await cli.waitForTimeout(2500);
check((await pedidos()).length === nPed + 1 && url, 'pedido de retirada enviado normalmente');

console.log('\n6) Sem bairros cadastrados: volta ao jeito antigo (taxa única)');
await adm.evaluate(async (V) => {
  const m = await import(`/js/firebase-config.js?${V}`);
  await m.setDoc(m.doc(m.db, 'config', 'loja'), { bairros: [] }, { merge: true });
}, V);
await carrinhoComRefri();
await cli.locator('#tela-carrinho label', { hasText: 'Entrega' }).click();
check(!(await cli.isVisible('#bairro-sel')) && await cli.isVisible('[data-end="bairro"]') && await cli.isVisible('[data-end="rua"]'), 'sem lista: volta o formulário completo (rua e bairro digitados)');
check((await cli.textContent('#resumo')).includes('5,00'), 'taxa única do painel (R$ 5,00)');

console.log('\n7) Horário de Salvador: fecha e abre sozinha');
// coloca o horário de hoje (Salvador) para abrir daqui a 2 horas
const agoraBahia = new Date(Date.now() - 3 * 3600e3);
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const hoje = DIAS[agoraBahia.getUTCDay()];
const hh = (agoraBahia.getUTCHours() + 2) % 24;
const abre = `${String(hh).padStart(2, '0')}:00`;
await adm.evaluate(async ({ V, hoje, abre }) => {
  const m = await import(`/js/firebase-config.js?${V}`);
  const l = (await m.getDoc(m.doc(m.db, 'config', 'loja'))).data();
  const h = { ...l.horarios };
  for (const d of Object.keys(h)) h[d] = { aberto: false, abre: '18:00', fecha: '23:00' };
  h[hoje] = { aberto: true, abre, fecha: abre === '23:00' ? '23:59' : `${String((Number(abre.slice(0, 2)) + 1) % 24).padStart(2, '0')}:00` };
  await m.setDoc(m.doc(m.db, 'config', 'loja'), { horarios: h }, { merge: true });
}, { V, hoje, abre });
await cli.waitForTimeout(1500);
await cli.goto(`${SITE}/index.html`);
await cli.waitForSelector('.produto');
const st = await cli.textContent('#status-loja');
if (hh >= 2) check(st.includes(`Fechada · abre hoje às ${hh}h`), `antes do horário: "${st}"`);
else check(st.startsWith('Fechada'), `antes do horário: "${st}"`);
await cli.click('#cardapio [data-produto="refri-2l"]');
await cli.click('#mp-fin');
await cli.waitForSelector('#tela-carrinho:not([hidden])');
check(await cli.isDisabled('#btn-finalizar') && (await cli.textContent('#btn-finalizar')).includes('Loja fechada'), 'botão de finalizar bloqueado: "Loja fechada — abrimos …"');

console.log('\n8) "Fechar agora" vale só até a próxima abertura');
await adm.click('[data-view="pedidos"]');
// volta a abrir o dia todo e fecha pelo botão
await adm.evaluate(async (V) => {
  const m = await import(`/js/firebase-config.js?${V}`);
  const h = Object.fromEntries(['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'].map((d) => [d, { aberto: true, abre: '00:00', fecha: '23:59' }]));
  await m.setDoc(m.doc(m.db, 'config', 'loja'), { horarios: h }, { merge: true });
}, V);
await adm.waitForTimeout(800);
await adm.click('#btn-loja-toggle');
await toastTem(adm, 'Loja fechada');
L = await loja();
const amanha = new Date(Date.now() - 3 * 3600e3 + 24 * 3600e3);
const esperado = Date.UTC(amanha.getUTCFullYear(), amanha.getUTCMonth(), amanha.getUTCDate()) + 3 * 3600e3;
check(L.fechadoManual === true && L.fechadoAte === esperado, `fechado até a próxima abertura: ${new Date(L.fechadoAte).toISOString()} (amanhã 00:00 em Salvador)`);
await adm.waitForTimeout(500);
check((await adm.textContent('#btn-loja-toggle')).includes('Fechada por você até amanhã às 0h'), `botão: "${await adm.textContent('#btn-loja-toggle')}"`);
await cli.goto(`${SITE}/index.html`);
await cli.waitForSelector('.produto');
check((await cli.textContent('#status-loja')).startsWith('Fechada · abre amanhã'), `cliente: "${await cli.textContent('#status-loja')}"`);
// a data passou → abre sozinha
await adm.evaluate(async (V) => {
  const m = await import(`/js/firebase-config.js?${V}`);
  await m.setDoc(m.doc(m.db, 'config', 'loja'), { fechadoAte: Date.now() - 60000 }, { merge: true });
}, V);
await cli.waitForTimeout(1500);
await cli.goto(`${SITE}/index.html`);
await cli.waitForSelector('.produto');
check((await cli.textContent('#status-loja')).startsWith('Aberta'), 'passou a hora: a loja abre sozinha, sem tocar em nada');
await adm.waitForTimeout(300);
check((await adm.textContent('#btn-loja-toggle')).includes('Fechar agora'), 'painel volta a mostrar "Fechar agora"');
await adm.click('#btn-loja-toggle');
await toastTem(adm, 'Loja fechada');
await adm.click('#btn-loja-toggle');
await toastTem(adm, 'Loja reaberta');
L = await loja();
check(L.fechadoManual === false && !('fechadoAte' in L), 'reabrir na mão apaga a data');

check(!erros.length, `sem erros de JavaScript ${erros.join(' | ')}`);
console.log(`\nRESULTADO: ${ok} ok, ${falhas} falha(s)`);
await browser.close();
process.exit(falhas ? 1 : 0);
