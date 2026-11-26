#!/bin/bash
# Roda as baterias de teste, cada uma com o banco do emulador limpo.
# Uso: bash testes/rodar.sh original custos v4-novas grupos apagar fotos tempo som pronto nota ovo bebida ajuste bairros
cd "$(dirname "$0")"
RAIZ="$(cd .. && pwd)"
(cd "$RAIZ" && python3 -m http.server 5500 --bind 127.0.0.1 > /dev/null 2>&1 &)
reinicia() {
  pkill -f "emulators:start"; sleep 2
  (npx firebase emulators:start --only firestore,auth --project demo-pizzaria > emu.log 2>&1 &)
  for i in $(seq 1 40); do grep -q "All emulators ready" emu.log && break; sleep 1; done
}
for t in "$@"; do
  reinicia
  case "$t" in
    original)   arq=e2e.mjs ;;
    custos)     arq=e2e-custos.mjs ;;
    v4-novas)   arq=e2e-v4.mjs ;;
    grupos)     arq=e2e-grupos.mjs ;;
    apagar)     arq=e2e-apagar.mjs ;;
    fotos)      arq=e2e-fotos.mjs ;;
    tempo)      arq=e2e-tempo.mjs ;;
    som)        arq=e2e-som.mjs ;;
    pronto)     arq=e2e-pronto.mjs ;;
    nota)       arq=e2e-nota.mjs ;;
    ovo)        arq=e2e-ovo.mjs ;;
    bebida)     arq=e2e-bebida.mjs ;;
    ajuste)     arq=e2e-ajuste.mjs ;;
    bairros)    arq=e2e-bairros.mjs ;;
    *) echo "bateria desconhecida: $t"; continue ;;
  esac
  REGRAS=novas timeout 300 node "$arq" > "out-$t.txt" 2>&1
  printf "%-11s " "$t:"; grep -E "RESULTADO" "out-$t.txt" || { echo "(quebrou)"; tail -15 "out-$t.txt"; }
  grep -E "✘" "out-$t.txt"
done
pkill -f "emulators:start"; pkill -f "http.server 5500"; true
