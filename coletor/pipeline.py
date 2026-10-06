"""Job de coleta incremental.

Evidência: data de aquisição (quando o job leu) + data de atualização informada pela própria página/PDF.
O hash do conteúdo é usado só internamente, para reprocessar apenas o que mudou.

Três verificações separadas:
  1. testes do código (pytest)            -> erro NOSSO
  2. conformidade das páginas              -> saida/conformidade.md (para as secretarias)
  3. mudanças desde a última coleta        -> saida/mudancas.md (normas alteradas -> Núcleo Técnico)
Uso: python -m coletor.pipeline [--offline tests/fixtures] [--hoje AAAA-MM-DD]
Código de saída 1 = publicação bloqueada.
"""
import argparse, csv, json, os, re, sys
from collections import defaultdict
from datetime import datetime, timezone, date
import yaml
from . import parsers, validar

SAIDA = "saida"
CACHE = os.path.join(SAIDA, "cache.json")


class Leitor:
    """Lê páginas e PDFs. Online usa GET condicional (ETag/Last-Modified): se nada mudou, nem baixa."""
    def __init__(self, offline=None, agente="coletor", cache=None):
        self.offline, self.agente, self.cache = offline, agente, cache or {}
        self.mapa = json.load(open(os.path.join(offline, "index.json"))) if offline else {}

    def ler(self, url):
        if self.offline:
            f = self.mapa.get(url)
            if not f:
                return None, "indisponivel_no_teste", {}
            return open(os.path.join(self.offline, f), encoding="utf-8").read(), "ok", {}
        import requests
        c = self.cache.get(url, {})
        h = {"User-Agent": self.agente}
        if c.get("etag"): h["If-None-Match"] = c["etag"]
        if c.get("last_modified"): h["If-Modified-Since"] = c["last_modified"]
        try:
            r = requests.get(url, headers=h, timeout=60)
        except Exception as e:
            return None, f"erro_rede:{type(e).__name__}", {}
        if r.status_code == 304:
            return None, "nao_modificada", {}
        if not r.ok:
            return None, f"http_{r.status_code}", {}
        meta = {"etag": r.headers.get("ETag"), "last_modified": r.headers.get("Last-Modified")}
        if "pdf" in r.headers.get("Content-Type", "") or r.content[:4] == b"%PDF":
            import io, pdfplumber
            with pdfplumber.open(io.BytesIO(r.content)) as pdf:
                return "\n".join(p.extract_text() or "" for p in pdf.pages), "ok", meta
        return parsers.html_para_texto(r.text), "ok", meta


def oferta_de(nome, serv):
    if serv.get("oferta"):
        return serv["oferta"]
    n = parsers.normaliza_nome(nome)
    for pref, of in sorted(serv.get("oferta_por_prefixo", {}).items(), key=lambda x: -len(x[0])):
        if n.startswith(parsers.normaliza_nome(pref)):
            return of
    return None


def conciliar(u, of, base_idx):
    k = parsers.normaliza_nome(re.split(r"\s+-\s+", u["nome"])[0])
    cand = base_idx.get(of, {})
    for kk in (parsers.normaliza_nome(u["nome"]), k):
        if kk in cand:
            return cand[kk], "exato"
    tk = set(k.split())
    best, score = None, 0
    for kb, b in cand.items():
        tb = set(parsers.normaliza_nome(re.split(r"\s+-\s+", b["nome"])[0]).split())
        s = len(tk & tb) / max(len(tk | tb), 1)
        if s > score:
            best, score = b, s
    return (best, "aproximado") if score >= 0.8 else (None, None)


def _norm_end(x):
    x = parsers.normaliza_nome(x)
    for a, b in [(r"\bAV\b", "AVENIDA"), (r"\bR\b", "RUA"), (r"\bESTR\b", "ESTRADA"), (r"\bPC\b", "PRACA"), (r"\bDR\b", "DOUTOR")]:
        x = re.sub(a, b, x)
    return x


def _tels(t):
    return {m[0] + m[1] for m in re.findall(r"(\d{4,5})\s*-?\s*(\d{4})", t or "")}


def mesmo_endereco(a, b, num_b=None):
    na = re.findall(r"\d+", re.split(r"\bCEP\b", _norm_end(a))[0])
    nb = re.findall(r"\d+", num_b or re.split(r"\bCEP\b", _norm_end(b))[0])
    ta = set(_norm_end(a).split()); tb = set(_norm_end(b).split()) - {"RUA", "AVENIDA", "DE", "DA", "DO", "DOS", "DAS", "SAO", "PAULO", "SP"}
    mesmo_num = bool(na) and bool(nb) and int(nb[0]) in {int(x) for x in na}
    return mesmo_num and len(ta & tb) / max(len(tb), 1) >= 0.5


def diferencas(u, b):
    div, comp = {}, {}
    tp, tb = _tels(u.get("telefone")), _tels(b.get("telefone"))
    if tp and not tb:
        comp["telefone"] = u["telefone"]
    elif tp and tb and tp != tb:
        (comp.__setitem__("telefone", u["telefone"]) if tb <= tp else div.__setitem__("telefone", {"base": b.get("telefone"), "pagina": u.get("telefone")}))
    for k in ("horario", "email"):
        novo, velho = (u.get(k) or "").strip(), (b.get(k) or "").strip()
        if novo and not velho:
            comp[k] = novo
        elif novo and novo != velho:
            div[k] = {"base": velho, "pagina": novo}
    if u.get("endereco") and b.get("endereco") and not mesmo_endereco(u["endereco"], b["endereco"], b.get("numero")):
        div["endereco"] = {"base": ", ".join(x for x in [b.get("endereco"), b.get("numero")] if x), "pagina": u["endereco"]}
    for k in ("cep", "subprefeitura"):
        if u.get(k):
            comp[k] = u[k]
    return div, comp


def processar_pagina(url, rotulo, s, L, cache, hoje, cfg, res):
    """Lê uma página; se o conteúdo não mudou desde a última coleta, reaproveita o resultado."""
    texto, st, meta = L.ler(url)
    c = cache.get(url)
    pag = {"servico": s["id"], "secretaria": s["secretaria"], "url": url, "titulo": rotulo, "tipo": "lista", "status": st}
    if texto is None:
        if st == "nao_modificada" and c:
            pag.update(c["pagina"], status="ok", reaproveitada=True)
            return pag, c["unidades"], c["achados"]
        res["achados"].append(validar.achado(pag, None, "FONTE_INDISPONIVEL", "erro", f"Página não lida ({st})."))
        return pag, None, []
    h = parsers.sha256(parsers.conteudo(texto) if s.get("parser", "lista_rotulada") == "lista_rotulada" else texto)
    if c and c.get("sha256") == h:
        pag.update(c["pagina"], status="ok", reaproveitada=True)
        return pag, c["unidades"], c["achados"]
    tit = s.get("titulo_publicacao") or parsers.titulo(texto) or rotulo
    parser = getattr(parsers, s.get("parser", "lista_rotulada"))
    us = parser(texto, s.get("prefixo_unidade", ""), s.get("regioes", ()))
    if s.get("oferta_por_prefixo") and s.get("somente_mapeadas"):
        total = len(us)
        us = [u for u in us if oferta_de(u["nome"], s)]
        pag["ignoradas_fora_do_escopo"] = total - len(us)
    pag.update(titulo=tit, zona=parsers.zona_do_titulo(tit) or rotulo.replace("ZONA", "").strip().title(),
               data_pagina=parsers.data_pagina(texto) or parsers.data_pdf(texto), data_aquisicao=hoje,
               paginas=parsers.paginacao(texto), unidades=len(us), parcial=parsers.eh_trecho(texto))
    A = validar.validar_pagina(pag, us, s.get("campos_obrigatorios", []), date.fromisoformat(hoje), cfg["publicacao"]["idade_maxima_pagina_dias"], s.get("opcoes_validacao"))
    cache[url] = {"sha256": h, "pagina": {k: v for k, v in pag.items() if k not in ("status", "reaproveitada")}, "unidades": us, "achados": A, **meta}
    return pag, us, A


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fontes", default="fontes.yaml")
    ap.add_argument("--base", default="dados/base_unidades.json")
    ap.add_argument("--offline")
    ap.add_argument("--hoje")
    a = ap.parse_args()
    cfg = yaml.safe_load(open(a.fontes, encoding="utf-8"))
    base = json.load(open(a.base, encoding="utf-8"))
    base_idx = defaultdict(dict)
    for b in base:
        base_idx[b["oferta"]][parsers.normaliza_nome(b["nome"])] = b
    hoje = a.hoje or date.today().isoformat()
    os.makedirs(SAIDA, exist_ok=True)
    ant_path = os.path.join(SAIDA, "coleta.json")
    anterior = json.load(open(ant_path, encoding="utf-8")) if os.path.exists(ant_path) else None
    cache = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
    L = Leitor(a.offline, cfg.get("agente_http"), cache)
    res = {"gerado_em": datetime.now(timezone.utc).isoformat(timespec="seconds"), "data_coleta": hoje, "modo": "offline" if a.offline else "online",
           "servicos": {}, "paginas": {}, "unidades": [], "achados": [], "conciliacao": [], "normas": {}, "bloqueios": []}

    for s in cfg["servicos"]:
        sv = {"secretaria": s["secretaria"], "indice": s["indice"], "uso": s.get("uso_no_app"), "total_declarado": None, "unidades_lidas": 0, "filhas": []}
        res["servicos"][s["id"]] = sv
        pidx = {"servico": s["id"], "secretaria": s["secretaria"], "url": s["indice"], "titulo": "Índice"}
        texto, st, _ = L.ler(s["indice"])
        if texto is None and st == "nao_modificada" and s["indice"] in cache:
            texto = cache[s["indice"]]["texto"]
        if texto is None:
            res["achados"].append(validar.achado(pidx, None, "FONTE_INDISPONIVEL", "erro", f"Página-índice não lida ({st})."))
            continue
        cache[s["indice"]] = {"texto": texto}
        pidx.update(titulo=parsers.titulo(texto), data_pagina=parsers.data_pagina(texto), data_aquisicao=hoje)
        res["paginas"][s["indice"]] = pidx | {"tipo": "indice", "status": "ok"}
        sv["total_declarado"] = parsers.total_declarado(texto, s["total_declarado"]) if s.get("total_declarado") else None
        filhas = parsers.links(texto, s["padrao_filhas"])
        sv["filhas"] = [f["url"] for f in filhas]
        if anterior and s["id"] in anterior["servicos"]:
            antes, agora = set(anterior["servicos"][s["id"]]["filhas"]), set(sv["filhas"])
            for u in agora - antes:
                res["achados"].append(validar.achado(pidx, None, "INDICE_NOVA_PAGINA", "alerta", "Nova página-filha no índice; passou a ser coletada.", u))
            for u in antes - agora:
                res["achados"].append(validar.achado(pidx, None, "INDICE_PAGINA_REMOVIDA", "alerta", "Página-filha saiu do índice.", u))
        lidas, n_ok, parcial = [], 0, False
        for f in filhas:
            pag, us, A = processar_pagina(f["url"], f["rotulo"], s, L, cache, hoje, cfg, res)
            res["paginas"][f["url"]] = pag
            if us is None:
                continue
            n_ok += 1; parcial |= bool(pag.get("parcial"))
            res["achados"] += A
            for u in us:
                of = oferta_de(u["nome"], s)
                b, how = conciliar(u, of, base_idx) if of else (None, None)
                div, comp = diferencas(u, b) if b else ({}, {})
                res["conciliacao"].append({"servico": s["id"], "pagina": f["url"], "nome": u["nome"], "oferta": of,
                                           "id_base": b["id"] if b else None, "casamento": how, "diferencas": div, "complementos": comp})
                res["unidades"].append(u | {"servico": s["id"], "pagina": f["url"], "oferta": of, "id_base": b["id"] if b else None})
                lidas.append(u["nome"])
        sv.update(unidades_lidas=len(lidas), unidades_distintas=len(set(lidas)), paginas_lidas=n_ok, parcial=parcial)
        todas = n_ok == len(filhas) and not parcial
        sv["completo"] = todas
        if sv["total_declarado"] is not None:
            if todas and sv["unidades_distintas"] != sv["total_declarado"]:
                res["achados"].append(validar.achado(pidx, None, "TOTAL_DIVERGENTE", "alerta",
                    f"O índice declara {sv['total_declarado']} unidades; as páginas listam {sv['unidades_distintas']} distintas ({sv['unidades_lidas']} com repetições)."))
            elif not todas:
                res["achados"].append(validar.achado(pidx, None, "TOTAL_NAO_VERIFICADO", "info", f"Índice declara {sv['total_declarado']} unidades; só {n_ok} de {len(filhas)} páginas foram lidas."))
        sv["total_confere"] = todas and sv["total_declarado"] == sv["unidades_distintas"]
        if not sv["total_confere"]:
            for p in res["paginas"].values():
                if p.get("servico") == s["id"] and p.get("paginas", 1) > 1:
                    res["achados"].append(validar.achado(p, None, "PAGINACAO", "alerta", f"A página indica {p['paginas']} resultados; verificar se há unidades nas demais."))
        if anterior and s["id"] in anterior["servicos"]:
            antes = anterior["servicos"][s["id"]].get("unidades_lidas") or 0
            if antes and len(lidas) < antes * (1 - cfg["publicacao"]["queda_maxima_por_fonte"]):
                res["bloqueios"].append(f"{s['id']}: {antes} -> {len(lidas)} unidades")

    divergencias_entre_fontes(res)

    for n in cfg.get("normas", []):
        texto, st, _ = L.ler(n["url"])
        reg = {"titulo": n["titulo"], "url": n["url"], "responsavel": n["responsavel"], "status": st}
        if texto is not None:
            h = parsers.sha256(texto)
            antes = (cache.get(n["url"]) or {}).get("sha256")
            reg.update(data_aquisicao=hoje, mudou=bool(antes and antes != h))
            if reg["mudou"]:
                res["achados"].append({"servico": "normas", "secretaria": n["responsavel"], "url": n["url"], "pagina": n["titulo"], "unidade": None,
                                       "codigo": "NORMA_ALTERADA", "nivel": "alerta", "mensagem": "O texto da norma mudou. Revisar regras.json.", "valor_publicado": None})
            cache[n["url"]] = {"sha256": h}
        res["normas"][n["id"]] = reg

    # Páginas e normas citadas como base no Guia de Ofertas consolidado: só detecção de mudança
    gpath = "dados/guia.json"
    if os.path.exists(gpath):
        for url in json.load(open(gpath, encoding="utf-8"))["links_base"]:
            texto, st, _ = L.ler(url)
            reg = {"titulo": "Base citada no Guia de Ofertas consolidado", "url": url, "responsavel": "Núcleo Técnico / secretaria da página", "status": st}
            if texto is not None:
                h = parsers.sha256(parsers.conteudo(texto))
                antes = (cache.get(url) or {}).get("sha256")
                reg.update(data_aquisicao=hoje, mudou=bool(antes and antes != h))
                if reg["mudou"]:
                    res["achados"].append({"servico": "normas", "secretaria": reg["responsavel"], "url": url, "pagina": reg["titulo"], "unidade": None,
                                           "codigo": "NORMA_ALTERADA", "nivel": "alerta", "mensagem": "Página/norma citada como base de fluxo mudou. Revisar o fluxo.", "valor_publicado": None})
                cache[url] = {"sha256": h}
            res["normas"]["base:" + url] = reg

    res["mudancas"] = mudancas(anterior, res)
    json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(res, open(ant_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    relatorios(res)
    reap = sum(1 for p in res["paginas"].values() if p.get("reaproveitada"))
    print(f"{len(res['unidades'])} unidades, {len(res['achados'])} achados, {len(res['mudancas'])} mudanças, {reap} páginas sem mudança (reaproveitadas), bloqueios: {res['bloqueios'] or 'nenhum'}")
    return 1 if res["bloqueios"] else 0


def divergencias_entre_fontes(res):
    """Mesma unidade (mesmo id da base) publicada por duas fontes oficiais com dados diferentes."""
    por_id = defaultdict(list)
    for u in res["unidades"]:
        if u.get("id_base"):
            por_id[u["id_base"]].append(u)
    for i, us in por_id.items():
        fontes = {u["servico"] for u in us}
        if len(fontes) < 2:
            continue
        a, b = us[0], next(x for x in us if x["servico"] != us[0]["servico"])
        campos = []
        if _tels(a.get("telefone")) and _tels(b.get("telefone")) and not (_tels(a["telefone"]) & _tels(b["telefone"])):
            campos.append(f"telefone `{a['telefone']}` × `{b['telefone']}`")
        if a.get("endereco") and b.get("endereco") and not mesmo_endereco(a["endereco"], b["endereco"]):
            campos.append(f"endereço `{a['endereco']}` × `{b['endereco']}`")
        ca, cb = re.sub(r"\D", "", a.get("cep") or ""), re.sub(r"\D", "", b.get("cep") or "")
        if ca and cb and ca != cb:
            campos.append(f"CEP `{a['cep']}` × `{b['cep']}`")
        if campos:
            pa, pb = res["paginas"][a["pagina"]], res["paginas"][b["pagina"]]
            res["achados"].append({"servico": "entre-fontes", "secretaria": a.get("secretaria") or pa["secretaria"], "url": a["pagina"],
                "pagina": f"{pa.get('titulo')} × {pb.get('titulo')}", "unidade": a["nome"], "codigo": "FONTES_OFICIAIS_DIVERGENTES", "nivel": "alerta",
                "mensagem": "Duas publicações oficiais divergem: " + "; ".join(campos) + ".", "valor_publicado": None})


def mudancas(anterior, res):
    if not anterior:
        return []
    chave = lambda u: (u["servico"], parsers.normaliza_nome(u["nome"]))
    A = {chave(u): u for u in anterior["unidades"]}; B = {chave(u): u for u in res["unidades"]}
    out = [{"tipo": "nova", "servico": k[0], "nome": B[k]["nome"]} for k in B.keys() - A.keys()]
    out += [{"tipo": "removida", "servico": k[0], "nome": A[k]["nome"]} for k in A.keys() - B.keys()]
    for k in A.keys() & B.keys():
        d = {c: {"antes": A[k].get(c), "depois": B[k].get(c)} for c in ("endereco", "telefone", "horario", "email", "cep") if A[k].get(c) != B[k].get(c)}
        if d:
            out.append({"tipo": "alterada", "servico": k[0], "nome": B[k]["nome"], "campos": d})
    return out


def relatorios(res):
    with open(os.path.join(SAIDA, "conformidade.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["secretaria", "servico", "pagina", "url", "unidade", "nivel", "codigo", "mensagem", "valor_publicado"])
        w.writeheader(); [w.writerow(x) for x in res["achados"]]
    L = ["# Conformidade das páginas oficiais", f"Coleta de {res['data_coleta']} ({res['modo']}).", "",
         "O coletor não corrige dados. Cada item deve ser ajustado pela secretaria responsável na própria página.", ""]
    por_pag = defaultdict(list)
    for x in res["achados"]:
        por_pag[(x["secretaria"] or "", x["pagina"] or "", x["url"])].append(x)
    for (sec, tit, url), xs in sorted(por_pag.items()):
        p = res["paginas"].get(url, {})
        L += [f"## {sec} · {tit}", f"{url}", f"Atualizada pela secretaria em: {p.get('data_pagina') or 'não informado'} · lida em: {p.get('data_aquisicao') or res['data_coleta']}", ""]
        for x in sorted(xs, key=lambda x: {"erro": 0, "alerta": 1, "info": 2}[x["nivel"]]):
            L.append(f"- **{x['nivel'].upper()}** {x['unidade'] or '(página)'}: {x['mensagem']}" + (f" Publicado: `{x['valor_publicado']}`" if x.get("valor_publicado") else ""))
        L.append("")
    L += ["## Divergências com o Banco Mestre (a base foi atualizada com o dado da página oficial)", ""]
    for c in res["conciliacao"]:
        if c["id_base"] is None and c["oferta"]:
            L.append(f"- Nova (na página, ausente na base): **{c['nome']}** ({c['oferta']})")
        elif c["diferencas"]:
            L.append(f"- **{c['nome']}** ({c['id_base']}): " + "; ".join(f"{k}: `{v['base']}` → `{v['pagina']}`" for k, v in c["diferencas"].items()))
    open(os.path.join(SAIDA, "conformidade.md"), "w", encoding="utf-8").write("\n".join(L) + "\n")
    M = ["# Mudanças desde a última coleta", f"Coleta de {res['data_coleta']}.", ""]
    M += [f"- {m['tipo'].upper()} · {m['servico']} · {m['nome']}" + ("" if m["tipo"] != "alterada" else ": " + "; ".join(f"{k} `{v['antes']}` → `{v['depois']}`" for k, v in m["campos"].items())) for m in res["mudancas"]] or ["Nenhuma mudança (ou primeira coleta)."]
    M += ["", "## Normas monitoradas", ""] + [f"- {n['titulo']}: {n['status']}" + (" — TEXTO ALTERADO" if n.get("mudou") else "") for n in res["normas"].values()]
    open(os.path.join(SAIDA, "mudancas.md"), "w", encoding="utf-8").write("\n".join(M) + "\n")


if __name__ == "__main__":
    sys.exit(main())
