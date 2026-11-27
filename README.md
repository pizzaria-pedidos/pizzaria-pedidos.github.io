# 🍕 Site de Pedidos da Pizzaria (v1)

> 👉 **Novo chat / outra pessoa assumindo o projeto?** Comece pelo **[CONTEXTO.md](CONTEXTO.md)**: ele resume tudo o que foi feito e decidido. Os testes automáticos estão em [`testes/`](testes/LEIA-ME.md).

O cliente abre o link, monta o pedido e, ao finalizar, o WhatsApp abre com o resumo pronto para enviar à pizzaria. Você acompanha tudo em tempo real no painel.

- **`index.html`**: página do cliente (cardápio, montagem da pizza, carrinho, "Meus pedidos")
- **`admin.html`**: painel (pedidos com som, cardápio, clientes, ajustes)
- HTML + CSS + JavaScript puro, sem build. Firebase (Firestore + Authentication). Hospedagem no GitHub Pages.

## ✅ Status atual (28/11/2026): no ar

| | |
|---|---|
| Site do cliente | <https://pizzaria-pedidos.github.io> |
| Painel (admin) | <https://pizzaria-pedidos.github.io/admin.html> |
| Repositório | <https://github.com/pizzaria-pedidos/pizzaria-pedidos.github.io> (organização `pizzaria-pedidos`, branch `main`, Pages na raiz) |
| Firebase | projeto `pizzaria-site-ad43a` (Firestore em São Paulo + Authentication e-mail/senha). Regras deste repositório **publicadas em 11/11/2026** (versão com `apelido` e área de custos). |
| Admin | UID `KRosnMXQ9nbvaw1U81HRKyUgF0i1` (fixo no `firestore.rules`) |
| Domínios autorizados no Auth | `pizzaria-pedidos.github.io` (e o antigo `magalhaeseduardo71.github.io`) |

- **Cardápio:** um tamanho só, **Pizza Grande 35 cm, 8 fatias, até 3 sabores**. A Pizza Média foi excluída do cardápio; se um dia voltar a vender outro tamanho, é só cadastrar um produto pizza com o tamanho (o sistema aceita vários).
- **Área de custos:** o PIN já foi criado. As fichas foram importadas do sistema antigo: Massa (rende 4 discos), Base (molho, mussarela e orégano), Calabresa e Mussarela. Frango c/ Catupiry foi preenchido à mão.
- **Novidades de 11/11/2026:**
  - Apelido opcional na entrada do cliente.
  - Botão de **ligar e desligar a entrega**, no topo de Pedidos e em Ajustes.
  - Versão dos arquivos `?v=4`.
- **Novidades de 12/11/2026:**
  - Número **aleatório** do pedido ("Número do seu pedido: 8218").
  - Histórico do cliente (1º pedido, 8º pedido…) só no painel, fora da mensagem do WhatsApp.
  - Versão dos arquivos `?v=5`.
- **Novidades de 12/11/2026 (2):**
  - Código do pedido com **6 letras e números** ("Código do seu pedido: K7Q2M9").
  - Em Cardápio → Sabores, só aparece o preço da **Grande**. Tamanhos desligados, como a Média, ficam escondidos, e o preço deles fica guardado para quando for religar.
  - Versão dos arquivos `?v=6`.
- **Novidades de 12/11/2026 (3):**
  - Preço por grupo (Tradicionais / Especiais).
  - Seção "Nossos sabores" com a descrição de cada sabor.
  - Versão dos arquivos `?v=7`.
- **Novidades de 12/11/2026 (4):**
  - Botão **Apagar cliente**, com opção de apagar também os pedidos dele.
  - Versão dos arquivos `?v=8`.
- **Novidades de 12/11/2026 (5):**
  - Foto da galeria em produtos, sabores e logo (o painel diminui a foto sozinho; sem Storage).
  - Foto do sabor também aparece em "Nossos sabores".
  - Versão dos arquivos `?v=9`.
- **Ajuste de 12/11/2026:**
  - Pagamento "Cartão" sem o "(na entrega)", que não fazia sentido na retirada.
  - A chave Pix é enviada pelo WhatsApp Business; o campo de chave Pix em Ajustes é opcional.
  - Versão dos arquivos `?v=10`.
- **Novidade de 12/11/2026:**
  - Tempo de espera (entrega e retirada) configurável, no fim da mensagem do WhatsApp.
  - Versão dos arquivos `?v=11`.
- **Novidade de 12/11/2026 (2):**
  - Contador "há X min" em cada pedido, com cor laranja e vermelha pelo tempo de espera.
  - 6 opções de som.
  - Versão dos arquivos `?v=12`.
- **Novidade de 12/11/2026 (3):**
  - Botão **✅ Pedido pronto**: abre o WhatsApp do cliente com a mensagem editável e muda o status.
  - Versão dos arquivos `?v=13`.
- **Novidade de 12/11/2026 (4):**
  - Tempo de cada pedido registrado (pronto e concluído) e "Preparo médio" do dia.
  - O apelido agora é gravado junto com o pedido.
  - Versão dos arquivos `?v=14`.
- **Ajuste final de 12/11/2026:**
  - Card simplificado: cronômetro com segundos → **✅ Pedido pronto** (para o cronômetro) → **📲 Informar cliente** (abre o WhatsApp com a mensagem e conclui).
  - Versão dos arquivos `?v=15`.
- **Correção de 12/11/2026 (emojis):** os links do WhatsApp usam **`api.whatsapp.com/send`** (função `linkWhats` em `js/utils.js`) em vez de `wa.me`. O redirecionamento do `wa.me` trocava emojis por "?" ou "�"; texto e negrito não mudam. Versão dos arquivos `?v=16`.
- **Novidade de 18/11/2026:** lista única de **🧾 Ingredientes**, atualização de preços pela **📥 Nota fiscal**, histórico de preços e alerta de lucro mínimo. Versão dos arquivos `?v=17`.
- **Ajuste de 18/11/2026:**
  - Na conferência da nota, a quantidade é digitada **na unidade da nota**, com seletor **ml/L** e **g/kg** (ex.: óleo "900 ml", e não 0,9 L).
  - Aviso quando um preço varia demais.
  - ✕ no histórico para apagar um preço lançado errado (se for o último, o preço volta ao anterior).
  - Versão dos arquivos `?v=18`.
- **Bebidas por marca (18/11/2026):** cadastre no Cardápio uma bebida para cada marca (ex.: "Pepsi 1L", "Antártica 1L", "Coca-Cola 1L"). Na nota, cada marca vai para a sua bebida, com o seu custo. Grafias diferentes são entendidas: Antarctica = Antártica, Coca-Cola = Coca Cola = Cocacola. O tamanho também precisa bater (1L ≠ 2L). Versão dos arquivos `?v=19`.
- **Novidade de 25/11/2026: ingrediente de quantidade fixa (ex.: ovo).** *(Substituída em 26/11 pela "quantidade diferente na metade e no terço"; veja abaixo.)*
  - Nas fichas de Sabores, Base e Bordas, cada ingrediente tem a caixinha **🥚 Quantidade fixa**. Marcada, ele vai **igual na inteira, na ½ e no ⅓** e **em todo tamanho** (1 ovo é sempre 1 ovo).
  - Ao escolher um ingrediente chamado "Ovo", a caixinha já vem marcada.
  - Vale no custo de cada pedido (Balanço), no Lucro, nas Gramas e no impacto da nota fiscal.
  - Versão dos arquivos `?v=20`.
- **Novidade de 25/11/2026 (2): bebida na mesma tela da pizza.**
  - Depois de Borda e Adicionais, a tela da pizza mostra **🥤 Bebida** com as bebidas da categoria **Bebidas** do cardápio, cada uma com − e +.
  - O botão já soma pizza + bebidas. Novo botão **Adicionar e finalizar ➜**, que coloca tudo no carrinho e abre direto a tela de finalizar.
  - Versão dos arquivos `?v=21`.
  - Ajuste: o título da seção ficou só "🥤 Bebida", sem frase embaixo. Versão dos arquivos `?v=22`.
- **Novidades de 26/11/2026:**
  - **💸 Ajustar valor do pedido**: em "⋯ Mais opções" do pedido, informe o valor que você realmente recebeu e o motivo. O pedido continua guardado como foi feito, e o faturamento e o Balanço passam a usar o valor recebido.
  - **Quantidade diferente na metade e no terço**: substitui a caixinha "Quantidade fixa". Em Fichas → Sabores, cada ingrediente tem o botão **✏️ Quantidade diferente na metade e no terço** (ex.: Portuguesa com 3 ovos na inteira, 2 na metade e 1 no terço).
  - Versão dos arquivos `?v=25`.
- **Novidades de 26/11/2026 (2):**
  - **🏘️ Bairros de entrega com taxa automática** (Ajustes → Entrega e pagamento). O cliente escolhe o bairro numa lista. **Só dá para pedir entrega nos bairros da lista**: quem marca "Meu bairro não está na lista" não consegue finalizar com entrega e é orientado a retirar no local ou falar no WhatsApp (v27).
  - **Horário automático de verdade:** sempre na hora de Salvador, e o "Fechar agora" vale só até a próxima abertura (depois a loja abre sozinha).
  - Versão dos arquivos `?v=26`; com o bloqueio de bairro fora da lista, `?v=27`.
  - Com bairros cadastrados, a tela de entrega pede **só Bairro → Número da casa → Ponto de referência** (sem Rua e Complemento). Versão dos arquivos `?v=28`.
- **Novidade de 27/11/2026: 🏪 Pedido no balcão.** Botão no painel para você mesmo registrar o pedido de quem chegou na porta ou ligou. Versão dos arquivos `?v=29`.
- **Correção de 27/11/2026 (custos que "não salvavam"):** com o painel aberto em dois lugares ao mesmo tempo (celular e notebook, ou duas abas), um aparelho podia gravar a ficha inteira por cima e apagar o que o outro tinha salvo (foi o que sumiu com o custo das bebidas e o preço da Calabresa/Frango). Agora cada aparelho grava **só o que mudou** e junta o que vem do outro. No topo da área de custos aparece **✓ Tudo salvo**, **💾 Salvando…** ou **⚠️ Não salvou — tentando de novo…**. Versão dos arquivos `?v=30`.
- **Novidade de 27/11/2026: 🗑️ Excluir pedido** em "⋯ Mais opções" do pedido (para pedido de teste ou lançado por engano). Versão dos arquivos `?v=31`.
- **Correção de 28/11/2026: chave Pix.** A chave estava salva, mas só aparecia numa linha pequena do carrinho e **não ia na mensagem do WhatsApp**. Agora ela vai na mensagem ("🏦 *Chave Pix:* …", logo abaixo do pagamento), aparece em destaque no carrinho e na tela "Pedido enviado", com botão **📋 Copiar chave Pix**. Versão dos arquivos `?v=32`.
- **Teste de 25/11/2026 (desfeito):** a `?v=23` mostrava a foto da bebida sempre inteira, com sobras brancas. O Eduardo não gostou, e a `?v=24` voltou ao jeito anterior: a foto preenche o quadro todo, como nas pizzas.
- **O sistema antigo de custos** (`magalhaeseduardo71.github.io/pizzaria/`, Firebase `pizzaria-pedidos-61780`) é **separado** e continua funcionando. Não foi alterado.

```
index.html  admin.html  firestore.rules  README.md
css/style.css
js/firebase-config.js   ← único arquivo onde você cola a configuração
js/utils.js             ← funções compartilhadas (preço, horário, formatação)
js/cliente.js           ← lógica da página do cliente
js/admin.js             ← lógica do painel
js/custos.js            ← área de custos (cadeado 🔒 no painel)
js/notas.js             ← leitor do resumo da nota fiscal (funções puras)
testes/                 ← testes automáticos (veja testes/LEIA-ME.md)
```

---

## 1) Criar o projeto no Firebase e colar a configuração

1. Acesse <https://console.firebase.google.com> e clique em **Adicionar projeto**. Dê um nome (ex.: `pizzaria-pedidos`). O Google Analytics pode ficar desligado.
2. No menu da esquerda: **Criação → Firestore Database → Criar banco de dados**.
   - Local: `southamerica-east1 (São Paulo)`.
   - Modo: **produção** (as regras certas entram no passo 3).
3. Na página inicial do projeto, clique no ícone **`</>` (Web)** para registrar um app web. Dê um apelido e **não** marque o Firebase Hosting.
4. O Firebase mostra um bloco `const firebaseConfig = { ... }`. Copie os valores para **`js/firebase-config.js`**, substituindo cada `COLE_AQUI`:

```js
export const firebaseConfig = {
  apiKey: 'AIza...',
  authDomain: 'pizzaria-pedidos.firebaseapp.com',
  projectId: 'pizzaria-pedidos',
  storageBucket: 'pizzaria-pedidos.appspot.com',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abc123',
};
```

> Essas chaves **podem ficar públicas** no site. Quem protege os dados são as regras do passo 3.

## 2) Criar seu usuário admin

1. No console: **Criação → Authentication → Vamos começar**.
2. Na aba **Método de login**, ative **E-mail/senha** e salve.
3. Na aba **Usuários**, clique em **Adicionar usuário** e informe seu e-mail e uma senha forte.
4. Copie o **UID do usuário**, um código como `a7aSn53yQ3JdNHqSKh6oe9y2Hfbs`. Você vai usar no passo 3.

## 3) Publicar as regras de segurança

1. Abra o arquivo **`firestore.rules`** e troque `COLE_AQUI_O_UID_DO_ADMIN` pelo seu UID.
2. No console: **Firestore Database → aba Regras**. Apague o que estiver lá, cole o conteúdo inteiro do arquivo e clique em **Publicar**.

Resumo do que as regras permitem:

| Coleção | Público (cliente) | Admin |
|---|---|---|
| cardápio, categorias, sabores, bordas, adicionais, `config/loja` | lê | lê e escreve |
| `pedidos` | só **cria**, com validação, e lê um pedido pelo ID | tudo |
| `clientes/{telefone}` | cria e atualiza só os campos permitidos; contadores só sobem de 1 em 1 | tudo |
| `config/contador` | só avança +1 junto com o pedido | tudo |
| `custos`, `custosPedidos` | **nada** | tudo |

## 4) Publicar no GitHub Pages

1. Crie uma conta em <https://github.com>, se ainda não tiver.
2. Clique em **New repository**. Use um nome como `pizzaria-pedidos.github.io` (dentro da organização `pizzaria-pedidos`), marque **Public** e crie.
3. Clique em **uploading an existing file** e arraste **todos os arquivos e as pastas** (`css`, `js`, `index.html`, `admin.html`, etc.). Depois clique em **Commit changes**.
4. Vá em **Settings → Pages**. Em *Source*, escolha **Deploy from a branch**, depois a branch **main** e a pasta **/(root)**, e clique em **Save**.
5. Depois de 1 ou 2 minutos, o site fica no ar em:
   `https://pizzaria-pedidos.github.io/`
6. **Importante:** no Firebase, vá em **Authentication → Configurações → Domínios autorizados** e adicione `pizzaria-pedidos.github.io` (sem isso o login do painel não funciona). Se um dia trocar o endereço do site, adicione o novo domínio aqui também.

Depois disso:
1. Abra `https://pizzaria-pedidos.github.io/admin.html` e entre com o e-mail e a senha do passo 2.
2. Vá em **Ajustes**, preencha o nome, o **WhatsApp que recebe os pedidos**, o horário, a taxa de entrega e a chave Pix, e clique em **Salvar**.
3. Se quiser começar com um exemplo, abra **Ajustes → Avançado → Popular cardápio de exemplo**. Depois é só editar ou apagar o que não usar.

> Se o painel mostrar "🔒 Sem permissão", o UID que aparece na mensagem não está no `firestore.rules` ou as regras não foram publicadas.

## 5) Qual link mandar para os clientes

> Repositório: <https://github.com/pizzaria-pedidos/pizzaria-pedidos.github.io> (organização `pizzaria-pedidos`).
> Como o repositório se chama `pizzaria-pedidos.github.io`, o site fica na raiz do endereço, sem nome de pasta.

| | Link |
|---|---|
| Clientes | <https://pizzaria-pedidos.github.io> |
| Link personalizado | `https://pizzaria-pedidos.github.io/?tel=5571999999999` |
| Painel | <https://pizzaria-pedidos.github.io/admin.html> |

- **Link personalizado** (o cliente nem digita o número): troque o número pelo do cliente, com 55 + DDD.
  - Se o número já estiver cadastrado, o cliente entra direto no cardápio.
  - Se for novo, o número já vem preenchido e ele só informa o nome.

⚠️ O endereço antigo `magalhaeseduardo71.github.io/pedidos-pizzaria/` **não funciona mais** desde a mudança para a organização, porque o GitHub não redireciona sites. Use só os links acima.

Dica: salve o link como **mensagem rápida** no WhatsApp Business (ex.: `/cardapio`).

---

## Como usar no dia a dia

- **🏪 Pedido no balcão (cliente na porta ou por telefone):**
  1. No painel, tela **Pedidos**, toque em **🏪 Pedido no balcão**. Abre o cardápio com uma **faixa laranja "MODO BALCÃO"**.
  2. Digite o **WhatsApp do cliente** (opcional, mas recomendado). Se ele já for cliente, aparece "⭐ Já é cliente: João · 8 pedidos" e o nome vem sozinho. Se não, digite o **nome**.
  3. Toque em **Começar pedido** e monte o pedido como o cliente faria: pizza, borda, bebida…
  4. No carrinho, já vem **Retirar no local**. Para pedido por telefone com entrega, escolha **Entrega** e o bairro. Escolha o pagamento.
  5. Toque em **✅ Registrar pedido**. O pedido entra na hora na lista de Pedidos (com a etiqueta **🏪 Balcão**), como **Novo** e **tocando o som**, igual aos outros. Conta no faturamento, no Balanço e no histórico do cliente.
  6. Se tiver o número, toque em **📲 Mandar resumo para o cliente** para mandar o pedido e o código no WhatsApp dele. Depois, **🏪 Novo pedido no balcão** para o próximo.
  - **Só funciona no aparelho logado no painel.** Se outra pessoa abrir o link do balcão, vê a mensagem de que precisa do login do painel.
  - **Fora do horário:** o balcão avisa "⚠️ Loja fechada pelo horário" mas deixa registrar; quem decide se atende é você. Para os clientes, pelo link, continua bloqueado.
  - **Sem WhatsApp:** o pedido é registrado com o nome, mas o cliente **não entra em Clientes** (o cadastro é pelo número). No painel aparece "(sem WhatsApp)", e depois do ✅ Pedido pronto o botão é **🏁 Entregue ao cliente**.
  - O modo balcão usa um carrinho separado: não mistura com o seu "Olá, Eduardo" do site.
- **🗑️ Excluir pedido (teste ou engano):** em **Pedidos**, escolha o dia, toque em **⋯ Mais opções → 🗑️ Excluir pedido** e confirme em **Excluir definitivamente**. O pedido some da lista, do faturamento e do Balanço; se o cliente tem cadastro, o pedido é descontado do histórico dele. **Não dá para desfazer.** Para um pedido de verdade que não aconteceu, prefira mudar o status para **Cancelado** (fica registrado, mas não conta).
- **💸 Ajustar valor (desconto, cortesia, divergência):** quando o cliente pagou um valor diferente do pedido:
  1. Em **Pedidos**, escolha o **dia** do pedido no campo de data.
  2. No card do pedido, toque em **⋯ Mais opções → 💸 Ajustar valor**.
  3. Em **Valor que você recebeu**, digite o valor (ex.: `65,76`). Embaixo aparece o desconto (ex.: "Desconto de R$ 18,24").
  4. Em **Motivo**, escreva o porquê (opcional, ex.: "divergência no pedido") e toque em **Salvar ajuste**.
  - O card mostra o total original riscado e **💸 Recebido R$ 65,76**. Os itens e o total do pedido **não mudam**.
  - O **Faturamento** do dia e o **Balanço** (🔒) usam o valor recebido: a venda e o lucro caem, e o custo continua o mesmo, porque os ingredientes foram usados.
  - Errou? Toque de novo em **💸 Mudar o ajuste de valor** e corrija, ou toque em **Tirar ajuste**.
  - O cadastro do cliente (quanto ele já gastou) não muda.
- **Pedidos:** deixe o painel aberto (PC ou celular). Quando chega um pedido novo, toca um alerta. No primeiro acesso, toque na faixa vermelha "ativar o som", porque o navegador só libera áudio depois de um toque. Avance o status com o botão principal. Cancelar um pedido desconta ele das estatísticas do cliente.
- **Acabou um ingrediente:** em **Cardápio → Sabores**, busque, por exemplo, "catupiry" e toque em **Desativar todos**. Para um item só, use a chavinha. O site do cliente atualiza na hora, sem recarregar.
- **Preço por grupo (Tradicionais / Especiais):** em **Cardápio → Sabores**, o quadro **"💰 Preço por grupo"** tem um preço para cada grupo. Ex.: Tradicionais R$ 35 e Especiais R$ 40. Toque em **Salvar e aplicar** e o preço vai para **todos** os sabores do grupo de uma vez.
  - Em cada sabor da lista, a caixinha ao lado escolhe o grupo dele. Basta um toque, e o preço já muda.
  - "Preço próprio" serve para um sabor com preço diferente do grupo.
  - **+ Novo grupo** cria outro grupo (ex.: Doces). O **✕** exclui o grupo, e os sabores dele ficam com o preço atual.
  - Os grupos ficam em `config/loja.gruposSabor`. O preço é copiado para `precos` de cada sabor, então o resto do sistema (carrinho, custos e lucro) continua igual.
- **Descrição dos sabores:** é o campo **"Descrição / ingredientes"** do sabor (ex.: "Molho, mussarela, calabresa, cebola e orégano"). O cliente vê essa descrição na seção **"🍕 Nossos sabores"** do cardápio, separada por grupo e com o preço, e também na hora de montar a pizza. Tocar num sabor já abre a pizza com ele escolhido.
- **Código do pedido:** cada pedido recebe um **código aleatório de 6 caracteres**, com letras e números (ex.: K7Q2M9). Ficaram de fora 0/O e 1/I/L, para ninguém confundir. A mensagem do WhatsApp começa com "🍕 *Código do seu pedido: K7Q2M9*", e o mesmo código aparece no card do painel, no Balanço e em "Meus pedidos" do cliente. Por baixo existe um contador interno (#0001, #0002…), mas ele não é mostrado a ninguém. O código é calculado a partir do ID do pedido, então não precisou mudar as regras.
- **Histórico do cliente só no painel:** a mensagem do WhatsApp **não** mostra "cliente novo / 1º pedido". No painel, cada card de pedido mostra "🆕 Cliente novo · 1º pedido" ou "⭐ 8º pedido · cliente desde 03/2026 · já gastou R$ X".
- **Fotos da galeria:** em Cardápio (Produtos e Sabores) e em Ajustes (logo), toque em **📷 Escolher da galeria**. No celular, abre a galeria ou a câmera. O painel **diminui a foto sozinho** (cerca de 640 px, de 40 a 120 KB) e ela fica guardada no próprio Firestore, dentro do produto ou sabor. Por isso **não precisa do Firebase Storage**, que hoje exige o plano pago Blaze. Depois de escolher, toque em **Salvar**. Ainda dá para colar um link de imagem em "ou colar o link de uma imagem".
- **Apagar cliente:** em **Clientes**, toque no cliente e depois em **🗑️ Apagar cliente**. Para cadastros de **teste**, marque **"Apagar também os pedidos"**: eles saem do faturamento e do Balanço. Para cliente real, deixe desmarcado, para manter o histórico de vendas. Não dá para desfazer.
- **Fluxo do pedido no painel (um botão por vez):**
  1. O pedido chega e o **cronômetro com segundos** começa sozinho (⏱️ 0:01 … 12:34). Ele muda de cor conforme o tempo de espera: verde, laranja perto do limite e vermelho "atrasado".
  2. **✅ Pedido pronto** **para o cronômetro** e grava o tempo ("✅ ficou pronto em 12:34"). O status vira Saiu p/ entrega ou Pronto p/ retirada.
  3. **📲 Informar cliente** é um link do WhatsApp do cliente **já com a mensagem**. Ele marca o pedido como **Concluído** e grava a hora ("📲 cliente avisado às 21:30").
  4. Depois, se precisar, **📲 Avisar de novo**.
  - Mudar status ou cancelar ficam em **"⋯ Mais opções"**, junto com "Conversar no WhatsApp (sem mensagem)".
- **Mensagem de pedido pronto:** o botão **✅ Pedido pronto** para o cronômetro e muda o status para **Saiu para entrega** (entrega) ou **Pronto p/ retirada** (retirada). Depois, o botão **📲 Informar cliente** abre o **WhatsApp do cliente** com o aviso já escrito e conclui o pedido. As duas mensagens ficam em **Ajustes → 📲 Aviso de pedido pronto** e aceitam **{nome}** (apelido ou primeiro nome), **{codigo}** e **{total}**. Se o campo ficar em branco, vale a mensagem padrão.
- **Tempo que cada pedido levou (fica salvo):** ao marcar o pedido como pronto (✅ Pedido pronto, Saiu para entrega ou Pronto p/ retirada), o painel grava a hora em `prontoEm`. Ao marcar como Concluído, grava em `concluidoEm`. O card mostra "✅ ficou pronto em 32 min · 🏁 concluído em 45 min", contando desde a hora do pedido, e isso também aparece no histórico do cliente. No topo da tela de Pedidos, **⏱️ Preparo médio** mostra a média do dia.
- **Há quanto tempo o cliente pediu:** cada pedido em andamento mostra o **cronômetro "⏱️ 12:34"** (minutos e segundos) desde a hora do pedido, atualizando sozinho. A etiqueta é verde no começo, fica **laranja** perto do limite (80% do tempo de espera configurado) e **vermelha piscando, com "atrasado"**, quando passa do limite (ex.: mais de 60 min em "40 a 60 minutos"). O contador some quando o pedido é concluído ou cancelado.
- **Som de pedido novo:** o botão **🔔** na tela de Pedidos abre a escolha entre 6 sons: Plim-plim (padrão), Campainha, Sino, Alarme, Bipes rápidos e Melodia, cada um com **▶ Ouvir**. Ali também liga e desliga o som. A escolha vale **para cada aparelho**.
- **Tempo de espera:** em **Ajustes → Entrega e pagamento**, preencha os campos **Entrega** e **Retirada** (ex.: "40 a 60 minutos"). Para mudar rápido, use o botão **⏱️** no topo da tela de Pedidos, que tem atalhos de 30 a 45 min, 40 a 60 min, 1 hora e 1h30. O tempo vai no **fim da mensagem do WhatsApp** ("⏱️ *Tempo de espera estimado:* …"), conforme o cliente escolheu entrega ou retirada, e aparece no resumo do carrinho e em "Mais informações". Em branco, não aparece.
- **Hoje sem entrega:** toque em **🛵 Entrega ligada · Desligar**, no topo de Pedidos ou em Ajustes. O cliente vê "🏃 Hoje só retirada no local", a opção Entrega fica bloqueada e o pedido vai como retirada, sem taxa. Toque de novo para religar. Vale até você religar.
- **Apelido do cliente:** na entrada, além do WhatsApp e do nome, o cliente pode informar um **apelido (opcional)**. O site cumprimenta pelo apelido ("Olá, Joãozinho!"), a mensagem do WhatsApp mostra "João Silva (Joãozinho)" e o painel mostra o apelido nos pedidos e em Clientes. A busca também procura pelo apelido.
- **Bebida junto com a pizza:** na tela de montar a pizza, depois de Borda e Adicionais, aparece **🥤 Bebida** com as bebidas da categoria **Bebidas** do Cardápio (outras categorias, como Adicionais, não aparecem). O cliente escolhe a quantidade com − e +, e o valor já entra no botão.
  - **Adicionar** coloca a pizza e as bebidas no carrinho e volta ao cardápio, para quem quer pedir outra coisa.
  - **Adicionar e finalizar ➜** coloca tudo no carrinho e já abre a tela de finalizar.
  - No carrinho, no WhatsApp e no painel, cada bebida aparece numa linha separada, como antes ("2x Refrigerante 2L"). A mesma bebida pedida duas vezes é somada numa linha só.
  - A quantidade de pizzas (− 1 +) não multiplica as bebidas.
  - Bebida desligada no Cardápio aparece como "Esgotado", sem o botão +. Com "Esconder itens indisponíveis" marcado, ela some.
  - Para uma bebida aparecer ali, ela precisa estar na categoria **Bebidas** e ter preço. Se você renomear a categoria, mantenha a palavra "Bebida" no nome.
  - A categoria Bebidas continua no cardápio, para quem quer só bebida.
- **Foto da bebida:** a foto preenche o quadro todo, e o que sobra do formato é cortado. Para não cortar a garrafa, use foto **quadrada (1:1)**, de 1024 × 1024 px (o painel reduz para 640 × 640), com a garrafa centralizada e margem em volta. Lugares onde ela aparece: lista do cardápio (quadrado de 96 px), tela da pizza (quadrado de 52 px), Destaques (160 × 110) e topo da janela da bebida (largura da tela × 200). Nos dois últimos, o corte pega um pouco de cima e de baixo. Mostrar a foto inteira com sobras brancas foi testado em 25/11/2026 e descartado.
- **Esconder o que está desligado:** por padrão, produto ou sabor desligado aparece **acinzentado** para o cliente. Para ele **sumir**, marque **Ajustes → Cardápio → "Esconder itens indisponíveis"** e salve. Isso vale para tudo: produtos (ex.: a Pizza Média) e sabores esgotados.
- **Horário (abre e fecha sozinha):** a loja segue o horário de **Ajustes → 🕒 Funcionamento**, sempre na **hora de Salvador**, mesmo que o celular do cliente esteja com outro fuso. Ex.: 18:00 às 23:00 → antes das 18h e a partir das 23h ninguém consegue finalizar pedido ("Loja fechada — abrimos hoje às 18h"). Funciona também com horário que passa da meia-noite (ex.: 18:00 → 01:00).
- **Fechar a loja agora:** use o botão no topo da tela de Pedidos (ou em Ajustes). Ele vale **só até a próxima abertura do horário**:
  - fechou às 20h → fica fechada hoje e **abre sozinha amanhã às 18h**;
  - fechou às 17h, antes de abrir → **hoje não abre**, e amanhã às 18h abre sozinha;
  - enquanto estiver fechada por você, o botão mostra "🔒 Fechada por você até amanhã às 18h — toque para reabrir agora".
- **🏘️ Bairros de entrega:** em **Ajustes → 🛵 Entrega e pagamento → 🏘️ Bairros de entrega**:
  1. Digite o **nome do bairro** e a **taxa** (ex.: Itapuã, 8) e toque em **+ Adicionar**. Salva na hora, sem precisar do botão Salvar.
  2. Para mudar uma taxa ou um nome, edite o campo e saia dele. Para excluir, toque no **✕**.
  - O cliente, ao escolher **Entrega**, preenche só 3 coisas, nesta ordem: **Bairro** (lista "Escolha seu bairro…" com a taxa de cada um), **Número da casa** e **Ponto de referência** (opcional). Rua e Complemento não aparecem. A mensagem do WhatsApp mostra "📍 Itapuã, nº 10" e "Ref.: …".
  - Ao escolher o bairro, a taxa entra sozinha no total e na mensagem do WhatsApp.
  - Última opção da lista: **"❌ Meu bairro não está na lista"**. Aparece **"😕 Ainda não entregamos no seu bairro. Só entregamos nos bairros da lista. Você pode escolher 🏃 Retirar no local ou 💬 falar com a gente no WhatsApp"**, e o botão de finalizar fica bloqueado ("Não entregamos nesse bairro"). **Nenhum pedido de entrega é enviado para bairro fora da lista.** O link do WhatsApp só abre uma conversa, sem pedido.
  - **Cadastre só os bairros onde você entrega.**
  - Sem nenhum bairro cadastrado, vale a **taxa única** e o cliente digita o bairro, como antes.
  - "Mais informações", no site do cliente, mostra a lista de bairros com as taxas.
- **Preço de pizza com vários sabores:** por padrão vale o **sabor mais caro**. Dá para trocar para **média dos sabores** em Ajustes → Cardápio.
- **Tamanhos:** o campo "Tamanho" do produto pizza (ex.: `Grande`) é o nome que aparece na tabela de preços de cada sabor. Se um sabor ficar sem preço num tamanho, ele não é oferecido nesse tamanho.

## 🔒 Área de custos (cadeado no canto superior direito do painel)

Toque no cadeado discreto no topo do painel. Na primeira vez, você cria um **PIN de 4 a 8 números**; depois ele é pedido sempre.

**Está salvo?** No topo da área de custos aparece **✓ Tudo salvo** (verde). Logo depois de digitar aparece **💾 Salvando…** por um instante. Se aparecer **⚠️ Não salvou — tentando de novo…** (vermelho), confira a internet: o painel tenta de novo sozinho e avisa antes de você fechar a página. Pode usar o celular e o notebook ao mesmo tempo: um não apaga o que o outro salvou.

- **Balanço:** cada pedido que chega tem o custo **gravado sozinho** com os preços das fichas naquele momento. Mostra o dinheiro do custo (para repor), o dinheiro do lucro e as taxas de entrega à parte, pedido por pedido, com cada cliente numa cor. Use ◀ ▶ para outros dias. Se mudar as fichas, toque em **Recalcular este dia**.
- **Fichas:**
  - Massa: o custo de 1 disco.
  - Base e tamanhos: o que vai em toda pizza, mais a proporção de cada tamanho.
  - Sabores: o recheio de cada um.
  - Bordas e Adicionais.
  - Bebidas e outros: unidades no fardo e quanto pagou nele.
- **Lucro:** custo, venda e lucro de cada sabor, em cada tamanho, e também das bordas, adicionais e bebidas.
- **Gramas:** quanto vai de cada ingrediente na pizza inteira, na metade (½) e no terço (⅓), por tamanho.

**✏️ Quantidade diferente na metade e no terço (ex.: ovos):** normalmente o sistema divide o recheio sozinho: se a inteira leva 100 g, a metade leva 50 g e o terço 33 g. Para um ingrediente que não divide certinho, como o ovo:
1. Em **🔒 → Fichas → Sabores**, escolha o sabor (ex.: Portuguesa).
2. No ingrediente (ex.: Ovo), preencha **"Vai na pizza inteira"** (ex.: 3).
3. Toque em **✏️ Quantidade diferente na metade e no terço**.
4. Preencha **Na metade (½)** (ex.: 2) e **No terço (⅓)** (ex.: 1). Em cinza aparece a conta automática, só como dica. Campo em branco = divide sozinho.
5. Pronto: o custo de cada pedido, a ficha ("Nas frações") e a tabela de **Gramas** passam a usar essas quantidades. Para desfazer, toque em **↩︎ voltar a dividir sozinho**.

Só aparece em Sabores, porque a base e a borda vão inteiras em toda pizza. Nos outros tamanhos, como a Média, tudo segue a proporção definida em "Base e tamanhos".

**Tamanhos:** as fichas valem para a pizza de **referência** (hoje, a Grande, que é a única ligada). Tamanhos **desligados** no cardápio não aparecem na área de custos. Se um dia ligar outro tamanho, ele aparece sozinho em *Fichas → Base e tamanhos*, onde você diz quanto ele usa da Grande (ex.: "a Média usa 70%"). Nas pizzas de 2 ou 3 sabores, o recheio é dividido e a base entra inteira.

**Trazer as fichas do sistema antigo:**
1. No sistema antigo, vá em **Cardápio → Exportar dados**. Isso baixa um arquivo `.json`.
2. No site novo, vá em **cadeado → Fichas → Massa → Importar fichas do sistema antigo** e escolha esse arquivo.

Massa e base são copiadas. Sabores, bordas e bebidas são copiados **pelo nome**. Os que tiverem nome diferente no cardápio novo aparecem numa lista, e você pode renomear e importar de novo.

> O PIN protege contra olhares de quem usa o painel aberto, por exemplo um funcionário. Os custos e o lucro **nunca** chegam ao site do cliente: as regras do Firestore só deixam o admin ler `custos` e `custosPedidos`.

## 📥 Atualizar preços pela nota fiscal (área de custos)

1. **No app do Claude**, mande a foto do cupom junto com o pedido. Ele fica em **🔒 Custos → 📥 Nota fiscal → 📋 Copiar pedido para a IA**. A IA devolve uma linha por item, assim:
   `* Queijo mussarela Morro Alto: 4,154 kg × 36,99 = 153,66`
2. **No painel**, vá em **🔒 Custos → 📥 Nota fiscal**, cole o resumo e toque em **Ler nota**.
3. **Confira** cada linha: qual ingrediente ela é, quanto foi comprado e o total. O sistema:
   - **sugere sozinho** o ingrediente, mesmo com marca diferente: Calabresa Aurora ou Perdigão → **Calabresa**; "muçarela" → **Mussarela**; requeijão → **Catupiry**;
   - **calcula o preço por kg, litro ou unidade**: barra de 4,154 kg; requeijão de 1,5 kg; fermento de 500 g; pacote com 25 embalagens; fardo com 12 refrigerantes;
   - **lembra** o que você escolheu, inclusive o que é para "Ignorar", e na próxima nota já vem marcado ✓.
4. Toque em **✅ Aplicar preços**. Aparece o que mudou: o preço de cada ingrediente (antes, agora e %) e o **custo e o lucro de cada pizza**.

**🧾 Ingredientes** (em Fichas) é a **lista única**: cada ingrediente aparece uma vez, com o preço por kg, L ou un, a última compra, a variação e o **📈 histórico de preços**. As fichas (massa, base, sabores, bordas) só dizem **qual** ingrediente e **quanto vai**. Mudou o preço, **todas as pizzas se recalculam**. As fichas antigas foram convertidas sozinhas, juntando os ingredientes de mesmo nome, e os custos continuaram iguais.

**⚠️ Lucro mínimo:** em **💲 Lucro**, defina "me avise quando o lucro de uma pizza ficar abaixo de R$ X". As pizzas abaixo ficam em vermelho, e o aviso também aparece depois de aplicar uma nota.

Técnico: o leitor da nota e as sugestões ficam em `js/notas.js` (funções puras). Os dados ficam em `custos/fichas`:
- `ingredientes` (id → { nome, base, preco, emb, hist, at });
- `apelidos` (assinatura da descrição → destino);
- `lucroMinimo`.

## 📱 Se não abrir no celular

1. **Confira o endereço.** Tem que ser `pizzaria-pedidos.github.io`. O navegador pode sugerir o endereço antigo pelo histórico.
2. **Não confunda com o app antigo.** O sistema de custos antigo pode estar instalado no celular com o nome **"Pizzaria Pedidos"** (ícone 🍕). Ele abre o sistema velho. Para o site novo, abra o link no Chrome e use **⋮ → Adicionar à tela inicial**. No iPhone, use **Compartilhar → Adicionar à Tela de Início**. Dê um nome diferente, por exemplo **"Painel Pedidos"**.
3. Se aparecer **"Não conseguimos abrir a página"**, toque em **Recarregar**. Se continuar, atualize o Chrome ou o Safari. A linha "Detalhe" no fim da mensagem mostra a causa: tire um print e mande para o Claude.
4. **Logo depois de uma atualização do site**, o celular pode levar alguns minutos para pegar a versão nova. Recarregar resolve.

## ⚠️ Aviso honesto sobre segurança (v1)

O "login" do cliente é só o número de WhatsApp, sem senha e sem código por SMS. Por isso:

- **Quem digitar o número de outra pessoa entra como ela.** Essa pessoa vê o nome, o último endereço e os pedidos recentes dela, e pode fazer pedidos em nome dela.
- Um cliente com conhecimento técnico consegue gravar um pedido com valores alterados. **Confira sempre o total na mensagem do WhatsApp** antes de produzir. Ninguém, porém, consegue listar os pedidos ou clientes de todo mundo, nem mexer no cardápio ou nos ajustes.

Para a v1 isso é aceitável. Numa próxima versão dá para adicionar verificação do número por código (Firebase Phone Auth ou um código enviado no WhatsApp).

**Decisão de 12/11/2026: a identidade do cliente é o número do WhatsApp que envia a mensagem.** O pedido sempre chega pelo WhatsApp do cliente, e o número de quem envia não dá para falsificar. Por isso:
- Ao receber um pedido, **confira se a mensagem veio do mesmo número que aparece no pedido**. Se não veio, é alguém se passando por outra pessoa.
- **Fidelidade (futura):** contar pontos **só pelos pedidos que o dono concluiu no painel**, depois de conferir o número. Prêmios são liberados **só pelo dono**, nunca pelo cliente no site. Não usar os contadores `totalPedidos`/`totalGasto` do cadastro como base de prêmio, porque o próprio site do cliente atualiza esses contadores.
- Opções avaliadas e **adiadas**:
  - Login com Google: atrapalha quem tem pouca familiaridade e usuários de iPhone.
  - Senha: o cliente esquece e o dono vira suporte.
  - Código por SMS: é a melhor se um dia precisar, mas exige o plano Blaze e tem custo por SMS.
  - Esconder o endereço e o histórico em celular novo: pode ser feito depois, por privacidade (LGPD).

## Fora da v1 (o código já está organizado para receber)

Pagamento online, frete por bairro ou distância, cupons, fidelidade, impressão de comanda, verificação por SMS e upload de fotos para o Storage (hoje a foto vem da galeria, reduzida e guardada dentro do próprio documento, sem Storage).

- **Frete por bairro:** troque a função `taxa()` em `js/cliente.js`.
- **Nova regra de preço:** acrescente uma entrada em `REGRAS_PRECO` em `js/utils.js`.
- **Comanda:** reaproveite `pedidoHTML()` em `js/admin.js`.
- **Ao mudar qualquer arquivo de `js/` ou `css/`:** aumente o número `?v=32` → `?v=33` em **todos** os lugares, para o celular não misturar versão nova e antiga. São 2 linhas no `index.html`, 2 no `admin.html` e os `import` de `js/cliente.js`, `js/admin.js` e `js/custos.js`. Todos precisam ter o **mesmo** número. Para achar, use: `grep -rn "?v=" index.html admin.html js`.
- **Versão do SDK do Firebase:** fica fixa (10.12.2) em `js/firebase-config.js` e no import do Auth em `js/admin.js`. Se for atualizar, troque nos dois lugares.
