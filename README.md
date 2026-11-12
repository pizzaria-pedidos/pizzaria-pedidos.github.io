# 🍕 Site de Pedidos da Pizzaria (v1)

O cliente abre o link, monta o pedido e, ao finalizar, o WhatsApp abre com o resumo pronto para enviar à pizzaria. Você acompanha tudo em tempo real no painel.

- **`index.html`**: página do cliente (cardápio, montagem da pizza, carrinho, "Meus pedidos")
- **`admin.html`**: painel (pedidos com som, cardápio, clientes, ajustes)
- HTML + CSS + JavaScript puro, sem build. Firebase (Firestore + Authentication). Hospedagem no GitHub Pages.

## ✅ Status atual (11/11/2026): no ar

| | |
|---|---|
| Site do cliente | <https://pizzaria-pedidos.github.io> |
| Painel (admin) | <https://pizzaria-pedidos.github.io/admin.html> |
| Repositório | <https://github.com/pizzaria-pedidos/pizzaria-pedidos.github.io> (organização `pizzaria-pedidos`, branch `main`, Pages na raiz) |
| Firebase | projeto `pizzaria-site-ad43a` (Firestore em São Paulo + Authentication e-mail/senha). Regras deste repositório **publicadas em 11/11/2026** (versão com `apelido` e área de custos). |
| Admin | UID `KRosnMXQ9nbvaw1U81HRKyUgF0i1` (fixo no `firestore.rules`) |
| Domínios autorizados no Auth | `pizzaria-pedidos.github.io` (e o antigo `magalhaeseduardo71.github.io`) |

- **Cardápio:** um tamanho só, **Pizza Grande 35 cm, 8 fatias, até 3 sabores**. A Pizza Média está **desligada, não excluída**: para voltar a vender, é só ligar em Cardápio → Produtos.
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
- **O sistema antigo de custos** (`magalhaeseduardo71.github.io/pizzaria/`, Firebase `pizzaria-pedidos-61780`) é **separado** e continua funcionando. Não foi alterado.

```
index.html  admin.html  firestore.rules  README.md
css/style.css
js/firebase-config.js   ← único arquivo onde você cola a configuração
js/utils.js             ← funções compartilhadas (preço, horário, formatação)
js/cliente.js           ← lógica da página do cliente
js/admin.js             ← lógica do painel
js/custos.js            ← área de custos (cadeado 🔒 no painel)
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
- **Hoje sem entrega:** toque em **🛵 Entrega ligada · Desligar**, no topo de Pedidos ou em Ajustes. O cliente vê "🏃 Hoje só retirada no local", a opção Entrega fica bloqueada e o pedido vai como retirada, sem taxa. Toque de novo para religar. Vale até você religar.
- **Apelido do cliente:** na entrada, além do WhatsApp e do nome, o cliente pode informar um **apelido (opcional)**. O site cumprimenta pelo apelido ("Olá, Joãozinho!"), a mensagem do WhatsApp mostra "João Silva (Joãozinho)" e o painel mostra o apelido nos pedidos e em Clientes. A busca também procura pelo apelido.
- **Esconder o que está desligado:** por padrão, produto ou sabor desligado aparece **acinzentado** para o cliente. Para ele **sumir**, marque **Ajustes → Cardápio → "Esconder itens indisponíveis"** e salve. Isso vale para tudo: produtos (ex.: a Pizza Média) e sabores esgotados.
- **Fechar a loja agora:** use o botão no topo da tela de Pedidos. Ele vale até você reabrir. Fora desse botão, a loja abre e fecha sozinha pelo horário configurado, inclusive em horários que passam da meia-noite (ex.: 18:00 → 01:00).
- **Preço de pizza com vários sabores:** por padrão vale o **sabor mais caro**. Dá para trocar para **média dos sabores** em Ajustes → Cardápio.
- **Tamanhos:** o campo "Tamanho" do produto pizza (ex.: `Grande`) é o nome que aparece na tabela de preços de cada sabor. Se um sabor ficar sem preço num tamanho, ele não é oferecido nesse tamanho.

## 🔒 Área de custos (cadeado no canto superior direito do painel)

Toque no cadeado discreto no topo do painel. Na primeira vez, você cria um **PIN de 4 a 8 números**; depois ele é pedido sempre.

- **Balanço:** cada pedido que chega tem o custo **gravado sozinho** com os preços das fichas naquele momento. Mostra o dinheiro do custo (para repor), o dinheiro do lucro e as taxas de entrega à parte, pedido por pedido, com cada cliente numa cor. Use ◀ ▶ para outros dias. Se mudar as fichas, toque em **Recalcular este dia**.
- **Fichas:**
  - Massa: o custo de 1 disco.
  - Base e tamanhos: o que vai em toda pizza, mais a proporção de cada tamanho.
  - Sabores: o recheio de cada um.
  - Bordas e Adicionais.
  - Bebidas e outros: unidades no fardo e quanto pagou nele.
- **Lucro:** custo, venda e lucro de cada sabor, em cada tamanho, e também das bordas, adicionais e bebidas.
- **Gramas:** quanto vai de cada ingrediente na pizza inteira, na metade (½) e no terço (⅓), por tamanho.

**Tamanhos:** as fichas valem para a pizza de **referência** (hoje, a Grande, que é a única ligada). Tamanhos **desligados** no cardápio não aparecem na área de custos. Se um dia ligar outro tamanho, ele aparece sozinho em *Fichas → Base e tamanhos*, onde você diz quanto ele usa da Grande (ex.: "a Média usa 70%"). Nas pizzas de 2 ou 3 sabores, o recheio é dividido e a base entra inteira.

**Trazer as fichas do sistema antigo:**
1. No sistema antigo, vá em **Cardápio → Exportar dados**. Isso baixa um arquivo `.json`.
2. No site novo, vá em **cadeado → Fichas → Massa → Importar fichas do sistema antigo** e escolha esse arquivo.

Massa e base são copiadas. Sabores, bordas e bebidas são copiados **pelo nome**. Os que tiverem nome diferente no cardápio novo aparecem numa lista, e você pode renomear e importar de novo.

> O PIN protege contra olhares de quem usa o painel aberto, por exemplo um funcionário. Os custos e o lucro **nunca** chegam ao site do cliente: as regras do Firestore só deixam o admin ler `custos` e `custosPedidos`.

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

## Fora da v1 (o código já está organizado para receber)

Pagamento online, frete por bairro ou distância, cupons, fidelidade, impressão de comanda, verificação por SMS e upload de fotos para o Storage (hoje a foto é uma URL).

- **Frete por bairro:** troque a função `taxa()` em `js/cliente.js`.
- **Nova regra de preço:** acrescente uma entrada em `REGRAS_PRECO` em `js/utils.js`.
- **Comanda:** reaproveite `pedidoHTML()` em `js/admin.js`.
- **Ao mudar qualquer arquivo de `js/` ou `css/`:** aumente o número `?v=9` → `?v=10` em **todos** os lugares, para o celular não misturar versão nova e antiga. São 2 linhas no `index.html`, 2 no `admin.html` e os `import` de `js/cliente.js`, `js/admin.js` e `js/custos.js`. Todos precisam ter o **mesmo** número. Para achar, use: `grep -rn "?v=" index.html admin.html js`.
- **Versão do SDK do Firebase:** fica fixa (10.12.2) em `js/firebase-config.js` e no import do Auth em `js/admin.js`. Se for atualizar, troque nos dois lugares.
