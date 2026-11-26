# Atualiza a versão dos arquivos (?v=N) nos testes e registra novas baterias no rodar.sh
import os, re, sys
D = os.path.dirname(os.path.abspath(__file__))
V = sys.argv[1]
for f in ['e2e.mjs', 'e2e-custos.mjs', 'e2e-v4.mjs', 'e2e-grupos.mjs', 'e2e-apagar.mjs', 'e2e-fotos.mjs', 'e2e-tempo.mjs', 'e2e-pronto.mjs', 'e2e-som.mjs', 'e2e-nota.mjs', 'e2e-ovo.mjs', 'e2e-bebida.mjs', 'e2e-ajuste.mjs', 'rodar.sh']:
    p = os.path.join(D, f)
    if not os.path.exists(p):
        continue
    t = open(p).read()
    t = re.sub(r"firebase-config\.js\?v=\d+/g", f"firebase-config.js?v={V}/g", t)
    t = re.sub(r"const V = 'v=\d+';", f"const V = 'v={V}';", t)
    if f != 'rodar.sh':
        t = re.sub(r"firebase-config\.js\?v=\d+'", f"firebase-config.js?v={V}'", t)
    if f == 'rodar.sh' and 'tempo)' not in t:
        t = t.replace("    fotos)      timeout", "    tempo)      timeout 250 node e2e-tempo.mjs > out-$t.txt 2>&1 ;;\n    fotos)      timeout")
        t = t.replace(" e2e-apagar.mjs e2e-fotos.mjs\n", " e2e-apagar.mjs e2e-fotos.mjs e2e-tempo.mjs\n")
    if f == 'rodar.sh' and 'pronto)' not in t:
        t = t.replace("    fotos)      timeout", "    pronto)     timeout 250 node e2e-pronto.mjs > out-$t.txt 2>&1 ;;\n    fotos)      timeout")
    if f == 'rodar.sh' and 'som)' not in t:
        t = t.replace("    fotos)      timeout", "    som)        timeout 250 node e2e-som.mjs > out-$t.txt 2>&1 ;;\n    fotos)      timeout")
    open(p, 'w').write(t)
print('versão dos testes:', V)
