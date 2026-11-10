# 🍕 Site de Pedidos da Pizzaria (v1)

O cliente abre o link, monta o pedido e, ao finalizar, o WhatsApp abre com o resumo pronto para enviar à pizzaria. Você acompanha tudo em tempo real no painel.

- **`index.html`**: página do cliente (cardápio, montagem da pizza, carrinho, "Meus pedidos")
- **`admin.html`**: painel (pedidos com som, cardápio, clientes, ajustes)
- HTML + CSS + JavaScript puro, sem build. Firebase (Firestore + Authentication). Hospedagem no GitHub Pages.

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


- **Link geral:** `https://pizzaria-pedidos.github.io/`
- **Link personalizado** (o cliente nem digita o número): `https://pizzaria-pedidos.github.io/?tel=5571999999999`
  - Se o número já estiver cadastrado, o cliente entra direto no cardápio.
  - Se for novo, o número já vem preenchido e ele só informa o nome.

Dica: salve o link como **mensagem rápida** no WhatsApp Business (ex.: `/cardapio`).

---

## Como usar no dia a dia

- **Pedidos:** deixe o painel aberto (PC ou celular). Quando chega um pedido novo, toca um alerta. No primeiro acesso, toque na faixa vermelha "ativar o som", porque o navegador só libera áudio depois de um toque. Avance o status com o botão principal. Cancelar um pedido desconta ele das estatísticas do cliente.
- **Acabou um ingrediente:** em **Cardápio → Sabores**, busque, por exemplo, "catupiry" e toque em **Desativar todos**. Para um item só, use a chavinha. O site do cliente atualiza na hora, sem recarregar.
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

**Tamanhos:** preencha todas as fichas para a pizza de **referência** (por padrão, a Grande). Em *Fichas → Base e tamanhos*, diga quanto os outros tamanhos usam. Exemplo: "a Média usa 70% da Grande". Nas pizzas de 2 ou 3 sabores, o recheio é dividido e a base entra inteira.

**Trazer as fichas do sistema antigo:**
1. No sistema antigo, vá em **Cardápio → Exportar dados**. Isso baixa um arquivo `.json`.
2. No site novo, vá em **cadeado → Fichas → Massa → Importar fichas do sistema antigo** e escolha esse arquivo.

Massa e base são copiadas. Sabores, bordas e bebidas são copiados **pelo nome**. Os que tiverem nome diferente no cardápio novo aparecem numa lista, e você pode renomear e importar de novo.

> O PIN protege contra olhares de quem usa o painel aberto, por exemplo um funcionário. Os custos e o lucro **nunca** chegam ao site do cliente: as regras do Firestore só deixam o admin ler `custos` e `custosPedidos`.

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
- **Versão do SDK do Firebase:** fica fixa (10.12.2) em `js/firebase-config.js` e no import do Auth em `js/admin.js`. Se for atualizar, troque nos dois lugares.
