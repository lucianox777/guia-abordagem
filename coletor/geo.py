"""CEP -> distrito administrativo.  NÃO TESTADO no ambiente do protótipo (sem acesso de rede).

Estratégia: coordenada do CEP (BrasilAPI v2) + ponto-em-polígono na malha oficial de distritos
(GeoSampa, arquivo GeoJSON versionado em dados/distritos.geojson). Resultado em cache (dados/cache_cep.json).
Se a coordenada não vier, o distrito fica 'não derivado' e isso aparece no app. Nada é inventado.
"""
import json, os, time
import requests
from shapely.geometry import shape, Point

CACHE = "dados/cache_cep.json"


def carregar_distritos(caminho="dados/distritos.geojson", campo_nome="nm_distrito_municipal"):
    with open(caminho, encoding="utf-8") as f:
        gj = json.load(f)
    return [(feat["properties"][campo_nome], shape(feat["geometry"])) for feat in gj["features"]]


def coordenada_cep(cep, sessao, cache):
    d = cep.replace("-", "")
    if d in cache:
        return cache[d]
    r = sessao.get(f"https://brasilapi.com.br/api/cep/v2/{d}", timeout=15)
    coord = None
    if r.ok:
        loc = (r.json().get("location") or {}).get("coordinates") or {}
        if loc.get("latitude") and loc.get("longitude"):
            coord = [float(loc["longitude"]), float(loc["latitude"])]
    cache[d] = coord
    time.sleep(0.3)
    return coord


def distrito_por_cep(unidades, distritos):
    cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
    s = requests.Session()
    for u in unidades:
        u["distrito_derivado"] = None
        if not u.get("cep"):
            continue
        c = coordenada_cep(u["cep"], s, cache)
        if c:
            p = Point(c)
            u["distrito_derivado"] = next((n for n, g in distritos if g.contains(p)), None)
    json.dump(cache, open(CACHE, "w"), ensure_ascii=False, indent=0)
    return unidades
