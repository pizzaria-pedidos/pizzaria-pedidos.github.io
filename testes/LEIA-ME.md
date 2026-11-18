# Testes automáticos

São testes "de ponta a ponta":
- o **emulador do Firebase** (Firestore e Auth) roda com as **regras reais** do `firestore.rules`;
- o site é servido localmente;
- o **Playwright** abre o site como cliente (celular) e como admin.

O Firebase de verdade **não é usado**.

## Preparar (uma vez)
Precisa de Node 18+, Java 11+ (para o emulador), Python 3 e Playwright com Chromium.

```bash
cd testes
npm install                                   # firebase@10.12.2 (SDK servido no lugar da CDN) + firebase-tools
npx firebase setup:emulators:firestore        # baixa o emulador
```

O Playwright precisa estar instalado. Se ele não estiver no `node_modules` desta pasta, aponte o caminho:

```bash
export PLAYWRIGHT=/caminho/para/node_modules/playwright
```

## Rodar
```bash
bash testes/rodar.sh original custos v4-novas grupos apagar fotos tempo som pronto nota
```

Cada bateria roda com o banco limpo e mostra `RESULTADO: N ok, 0 falha(s)`. As falhas aparecem com ✘. Detalhes ficam em `testes/out-<bateria>.txt`, e as capturas de tela em `testes/shots-*/`.

| Bateria | O que cobre |
|---|---|
| original | pedido completo do cliente → WhatsApp, painel em tempo real, clientes, regras de segurança |
| custos | cadeado/PIN, importar fichas antigas, fichas, balanço automático, lucro, gramas |
| v4-novas | apelido, ligar/desligar entrega, esconder produto desligado, sabores só com Grande |
| grupos | preço por grupo (Tradicionais/Especiais), "Nossos sabores" com descrição |
| apagar | apagar cliente (com e sem pedidos) |
| fotos | foto da galeria (reduzida) em produto, sabor e logo |
| tempo | tempo de espera no fim da mensagem |
| som | 6 sons, cronômetro com cores |
| pronto | cronômetro com segundos → Pedido pronto → Informar cliente (WhatsApp com mensagem) |
| nota | lista única de ingredientes, nota fiscal real de 15/11/2026, ml/L, histórico, lucro mínimo, bebidas |

## Versão dos arquivos
Os testes importam `/js/firebase-config.js?v=N`, e esse N precisa ser **o mesmo** do site. Depois de subir a versão do site (ex.: `?v=20`), rode:

```bash
python3 testes/versao.py 20
```
