# 🍕 CONTEXTO DO PROJETO: leia isto primeiro

> **Para o Claude do próximo chat:** este arquivo resume tudo o que foi construído e decidido até 25/11/2026.
> Leia este arquivo inteiro. Depois leia o `README.md` (detalhes de uso) e o código antes de propor qualquer mudança.
> O conteúdo deste repositório é **exatamente o que está no ar**.

---

## 1. O que é

Sistema de pedidos online de uma pizzaria em **Salvador (DDD 71)**. O dono é o **Eduardo**.

Ele tem duas partes:

1. **Site do cliente** (`index.html`): o cliente recebe o link pelo WhatsApp, monta a pizza, finaliza, e o WhatsApp abre com o pedido pronto para enviar à pizzaria.
2. **Painel do administrador** (`admin.html`): pedidos em tempo real com som e cronômetro, cardápio, clientes, ajustes, e uma **área de custos** protegida por PIN (cadeado 🔒), com fichas técnicas, lucro, balanço, gramas e atualização de preços pela nota fiscal.

**Stack:**
- HTML, CSS e JavaScript puro (módulos ES), **sem build**.
- **Firebase**: Firestore e Authentication por e-mail e senha.
- SDK **10.12.2** pela CDN gstatic.
- **GitHub Pages** para hospedar.
- Tudo no **plano grátis**: Firebase Spark, sem cartão cadastrado.

## 2. Onde está cada coisa

| | |
|---|---|
| Site do cliente | https://pizzaria-pedidos.github.io |
| Link personalizado | `https://pizzaria-pedidos.github.io/?tel=5571999999999` (55 + DDD + número) |
| Painel | https://pizzaria-pedidos.github.io/admin.html |
| Repositório | https://github.com/pizzaria-pedidos/pizzaria-pedidos.github.io (organização `pizzaria-pedidos`, branch `main`, Pages na raiz) |
| Firebase | projeto `pizzaria-site-ad43a` (Firestore em São Paulo). Console: https://console.firebase.google.com/project/pizzaria-site-ad43a |
| Admin | UID `KRosnMXQ9nbvaw1U81HRKyUgF0i1`, que está escrito em `firestore.rules` (função `isAdmin`) |
| Domínios autorizados no Auth | `pizzaria-pedidos.github.io` e `magalhaeseduardo71.github.io` |
| Sistema antigo (separado, NÃO mexer) | `magalhaeseduardo71.github.io/pizzaria/`, projeto Firebase `pizzaria-pedidos-61780`, repositório `magalhaeseduardo71/pizzaria` |

**Regras do Firestore:** as do arquivo `firestore.rules` deste repositório estão **publicadas**. Se mudar o arquivo, o Eduardo precisa colar e publicar de novo no console. Mostre o arquivo inteiro num bloco de código e explique onde colar.

## 3. Arquivos

```
index.html        site do cliente
admin.html        painel (login, Pedidos, Cardápio, Clientes, Ajustes, área de custos)
css/style.css     estilos (tema quente; tema azul na área de custos; modo escuro automático)
js/firebase-config.js  config do Firebase + reexporta o Firestore (versão do SDK fica aqui e no import do Auth em admin.js)
js/utils.js       funções compartilhadas (formatação, horário da loja, regras de preço, código do pedido,
                  link do WhatsApp, mensagem "pedido pronto", tempo de espera, comprimir foto…)
js/cliente.js     lógica do site do cliente
js/admin.js       lógica do painel
js/custos.js      área de custos (fichas, ingredientes, nota fiscal, lucro, balanço, gramas, PIN)
js/notas.js       leitor do resumo da nota fiscal + sugestão de ingrediente (funções puras)
firestore.rules   regras de segurança (publicadas)
README.md         manual de uso completo (passo a passo de cada função)
CONTEXTO.md       este arquivo
testes/           testes automáticos (emulador Firebase + Playwright). Veja testes/LEIA-ME.md
```

⚠️ **Versão dos arquivos: hoje é `?v=22`.** Todo `<script>`, `<link>` e `import` usa `?v=N`, para o celular não misturar versão nova e antiga. **Ao mudar qualquer JS ou CSS**, troque para o próximo número (`?v=23`) **em todos os lugares**. Depois rode `python3 testes/versao.py 23` para os testes acompanharem. Para achar: `grep -rn "?v=" index.html admin.html js`.

## 4. Dados no Firestore

- `config/loja`: nome, logoUrl, whatsapp, endereco, horarios{dom..sab:{aberto,abre,fecha}}, fechadoManual, **entregaAtiva**, taxaEntrega, pedidoMinimo, **tempoEntrega/tempoRetirada** (texto livre), pagamentos[], chavePix, **msgProntoEntrega/msgProntoRetirada** (aceitam {nome} {codigo} {total}), regraPrecoPizza ('maior'), ocultarIndisponiveis, limiteRecorrente, limiteVip, diasSumido, **gruposSabor**[{id,nome,precos{tamanho:valor}}].
- `config/contador`: ultimoNumero (contador interno; o cliente vê o **código aleatório**).
- `categorias`, `produtos` (tipo 'pizza'|'simples', tamanho, fatias, maxSabores, fotoUrl, disponivel…), `sabores` (ingredientes = descrição, precos{tamanho}, **grupo**, fotoUrl), `bordas`, `adicionais`.
- `pedidos/{id}`: itens[] (com cópia de nomes e preços), tipo, endereco, pagamento, troco, subtotal, taxaEntrega, total, status, criadoEm, **prontoEm, informadoEm, concluidoEm**.
- `clientes/{tel}`: nome, **apelido**, telefone, totalPedidos, totalGasto, primeiro/ultimoPedidoEm, ultimoEndereco, ultimosPedidos[].
- `custos/fichas` (só admin): pinHash, massa{rende,itens}, base{itens}, sabores{id:{itens}}, bordas, adicionais, simples{produtoId:{qtd,preco,hist}}, tamanhos{ref,fator}, **ingredientes**{id:{nome,base:'kg'|'L'|'un',preco,emb,hist[{d,p,desc}],at}}, **apelidos**{assinatura→destino}, **lucroMinimo**. Os itens das fichas são `{id, ing, usa, fixo?}`. `fixo: true` (ex.: ovo) = a quantidade não divide na ½ e no ⅓ e não muda com o tamanho; só existe em sabores, base e bordas.
- `custosPedidos/{pedidoId}` (só admin): custo, venda e linhas gravados no momento do pedido.
- **Fotos** ficam como `data:image/jpeg;base64` dentro do próprio documento, reduzidas no navegador. Não usa Storage, porque o Storage exige o plano Blaze.

## 5. Como o cardápio está configurado (dados reais do Eduardo)

- Trabalha com **um tamanho só: Pizza Grande 35 cm, 8 fatias, até 3 sabores.** A Pizza Média existe, mas está **desligada** (não excluída). Pode voltar no futuro, então manter o suporte a vários tamanhos.
- Os sabores ficam em **grupos de preço**: **Tradicionais** (~R$ 35) e **Especiais** (R$ 40 a 45). Pizza com vários sabores = preço do **sabor mais caro**.
- As bebidas ficam por **marca** no cardápio (ex.: "Pepsi 1L"; ele vai criar "Antártica 1L", "Coca-Cola…").
- A **embalagem** (pacote com 25 por R$ 28,99 = R$ 1,16 cada) pode ir na **Base** da área de custos.

## 6. Funcionalidades (resumo; detalhes no README)

**Cliente:**
- Entrada: WhatsApp + nome + **apelido opcional**. Nas próximas vezes entra direto, ou pelo link `?tel=`.
- Seção **"Nossos sabores"** com a descrição de cada sabor, separada por grupo.
- **Bebida dentro da tela da pizza** (25/11/2026): depois de Borda e Adicionais, a seção 🥤 Bebida lista os produtos simples das categorias com "bebida" no nome (função `bebidasParaPizza` em `js/cliente.js`). Cada bebida vira uma linha simples no carrinho. Botões **Adicionar** e **Adicionar e finalizar ➜** (`#mp-fin`), que abre o carrinho direto. A quantidade de pizzas não multiplica as bebidas.
- Carrinho; entrega ou retirada (a entrega pode estar desligada no dia); Pix, Cartão ou Dinheiro com troco.
- Mensagem do WhatsApp:
  - começa com "🍕 *Código do seu pedido: K7Q2M9*" (6 caracteres, sem 0/O/1/I/L);
  - termina com o **tempo de espera estimado**;
  - **NÃO** mostra "cliente novo / Nº pedido" (isso fica só no painel).

**Painel:**
- **Pedidos:**
  - cronômetro com **segundos** desde a chegada, que muda de cor pelo tempo de espera;
  - **um botão por vez**: ✅ Pedido pronto (para o cronômetro) → 📲 Informar cliente (abre o WhatsApp do cliente com a mensagem editável e conclui) → Avisar de novo;
  - "⋯ Mais opções" para mudar status ou cancelar;
  - 6 sons para escolher (vale por aparelho);
  - botões rápidos: abrir/fechar loja, entrega ligada/desligada, ⏱️ tempo de espera;
  - "Preparo médio" do dia.
- **Cardápio:** CRUD; **preço por grupo** de sabores; fotos da **galeria** (o painel reduz o tamanho sozinho).
- **Clientes:** tabela ordenável; etiquetas Novo, Recorrente, VIP e Sumido; histórico; **apagar cliente** (com opção de apagar os pedidos).
- **Ajustes:** loja, horários, entrega e pagamento, tempos de espera, mensagens do "pedido pronto", regras.

**Área de custos (🔒 cadeado + PIN):**
- **Balanço** do dia, com o custo gravado no momento de cada pedido.
- **📥 Nota fiscal:**
  - o Eduardo fotografa o cupom, manda ao app do Claude com o **pedido pronto** (botão "Copiar pedido para a IA") e cola o resumo;
  - o sistema lê linhas `* Produto: qtd × preço = total`;
  - calcula o preço por kg, L ou un (entende "1,5 kg", "500 g", "900 ml", "fardo com 12");
  - sugere o ingrediente mesmo com outra marca e **aprende** as escolhas;
  - na **conferência**, a quantidade vem na unidade da nota (ml/L, g/kg) e há aviso de variação estranha;
  - **Aplicar** mostra o impacto no custo e no lucro.
- **Fichas:**
  - **🧾 Ingredientes** é a lista única: preço por kg, L ou un, **histórico** (com ✕ para apagar um lançamento errado) e variação;
  - Massa, Base e tamanhos, Sabores, Bordas, Adicionais e Bebidas e outros.
- **Lucro**, com **alerta de lucro mínimo**, e **Gramas** (inteira, ½ e ⅓).
- **🥚 Quantidade fixa** (25/11/2026): caixinha em cada ingrediente das fichas de Sabores, Base e Bordas. O ovo é 1 unidade na inteira, na ½ e no ⅓, em todo tamanho. Ao escolher um ingrediente chamado "Ovo", já vem marcada. Funções em `js/custos.js`: `baseT`, `recheioT`, `bordaT` e `pizzaT`.

## 7. Decisões já tomadas (não refazer sem o Eduardo pedir)

- **Identidade do cliente = número do WhatsApp que envia a mensagem.** Não usar Google login, senha nem SMS por enquanto. Na fidelidade (futura), os pontos contam **só pelos pedidos concluídos pelo dono**, e o prêmio é liberado pelo dono. Não usar `totalPedidos`/`totalGasto` do cliente para prêmio, porque o próprio site do cliente escreve esses valores.
- **Links do WhatsApp por `api.whatsapp.com/send`** (função `U.linkWhats`), nunca `wa.me`, que estraga os emojis.
- **Nota fiscal pelo copiar e colar** (grátis). Ler a foto direto no site exigiria uma chave de IA paga e um servidor no plano Blaze: adiado.
- **Sem Firebase Storage** (exige Blaze): fotos reduzidas dentro do documento.
- Ao mudar as regras do Firestore, preferir mudanças que **não quebrem os pedidos** se o Eduardo demorar a publicar. Exemplo: o apelido é gravado de um jeito que não impede o pedido.

## 8. Sobre o Eduardo (como trabalhar com ele)

- Fala **português do Brasil** e **não é programador**. Gosta de explicação **"mastigada"**: passo a passo numerado, link direto, o que clicar e o que preencher.
- Costuma mandar **prints** da tela, e isso ajuda muito.
- Às vezes escreve por voz, com erros de digitação. Interprete pela intenção e confirme quando for ambíguo.
- Antes de mudanças grandes, ele gosta de ver um **esboço resumido** e aprovar.
- No fim de cada mudança, ele espera:
  1. **testar**;
  2. **enviar ao GitHub** (commit + push na `main`);
  3. **atualizar o README**;
  4. **entregar um ZIP** do projeto.
- **Notebook dele (Windows 7):** a bateria da placa-mãe está fraca e a data e hora desregulam. Isso causa **"sem permissão no banco de dados"** no painel. A solução é sincronizar o relógio, com fuso **"(UTC-03:00) Salvador"** e não Brasília, porque o Windows 7 aplica horário de verão.
- Também roda **outras sessões do Claude pelo navegador**, que já mexeram no GitHub e no Firebase dele.

## 9. Pendências e próximos passos possíveis

- Confirmar se os **emojis** chegam certos no WhatsApp desde a troca para `api.whatsapp.com`.
- Eduardo criar no cardápio as bebidas por marca ("Antártica 1L", "Coca-Cola…") e preencher o custo do fardo da "Pepsi 1L".
- Conferir na lista de 🧾 Ingredientes se ficou algum ingrediente sobrando (ex.: "Refrigerante antarctica" criado como ingrediente) e excluir.
- Ideias combinadas para o futuro:
  - **fidelidade** (no modelo seguro do item 7);
  - botão **"Exportar dados"** (backup);
  - código por SMS, se um dia precisar de mais segurança.

## 10. Como testar (para quem for mexer no código)

Veja `testes/LEIA-ME.md`. Resumo:
- o emulador do Firestore e do Auth roda com as **regras reais**;
- o site é servido localmente;
- o Playwright faz o papel do cliente e do admin.

São 12 baterias e ~295 verificações. Todas passavam na versão `?v=22`. Na primeira bateria de uma máquina nova, os testes de segurança podem falhar porque o emulador liga antes do arquivo de regras existir. Rode de novo para confirmar. Rode-as antes e depois de qualquer mudança.
