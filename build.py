"""Atualiza o Banco Mestre auto-contido com o conteúdo das páginas oficiais e gera publico/index.html.

Regras de atualização (sem correção de dados):
- Unidade encontrada numa página oficial: endereço, CEP, telefone, horário, e-mail e subprefeitura passam a ser os da página.
- Duas páginas oficiais divergem: prevalece a publicação com data de atualização mais recente; a divergência fica registrada e visível.
- Unidade nova na página: entra na base.
- Unidade da base ausente da página: só é marcada "não consta" quando o serviço foi lido por inteiro e o total confere com o declarado.
"""
import json, os, re, hashlib
from collections import defaultdict, Counter
import pandas as pd
from coletor import parsers
from coletor.pipeline import mesmo_endereco, _tels

CAMPOS = ["id", "of", "nome", "sub", "dist", "end", "num", "tel", "telN", "email", "hor", "status", "site", "subDer"]
base = json.load(open("dados/app_base.json", encoding="utf-8"))
col = json.load(open("saida/coleta.json", encoding="utf-8"))
units = [dict(zip(CAMPOS, a)) for a in base["units"]]
por_id = {u["id"]: u for u in units}
terr_idx = {parsers.normaliza_nome(s): s for s in base["terr"]}
terr_idx.update({parsers.normaliza_nome(k): v for k, v in {"Perus": "Perus/Anhanguera", "M Boi Mirim": "M'Boi Mirim", "São Miguel Paulista": "São Miguel"}.items()})
d2s = {d: s for s, ds in base["terr"].items() for d in ds}


def sub_norm(s):
    return terr_idx.get(parsers.normaliza_nome((s or "").replace("/ ", "/"))) if s else None


def dkey(p):
    d = p.get("data_pagina") or ""
    return d + "-01" if len(d) == 7 else d


paginas = col["paginas"]
achados_por = defaultdict(list)
for a in col["achados"]:
    if a["unidade"] and a["nivel"] in ("erro", "alerta") and a["codigo"] != "FONTES_OFICIAIS_DIVERGENTES":
        achados_por[a["unidade"]].append(a["mensagem"] + (f" ({a['valor_publicado']})" if a.get("valor_publicado") else ""))
grupos, novos = defaultdict(list), []
for u in col["unidades"]:
    (grupos[u["id_base"]].append(u) if u.get("id_base") else (novos.append(u) if u.get("oferta") else None))

prov = {}
for i, us in grupos.items():
    if i not in por_id:
        continue
    us = sorted(us, key=lambda u: dkey(paginas[u["pagina"]]), reverse=True)   # mais recente primeiro
    b = por_id[i]
    for campo, chave in [("end", "endereco"), ("tel", "telefone"), ("email", "email"), ("hor", "horario")]:
        v = next((u.get(chave) for u in us if u.get(chave)), None)
        if v:
            b[campo] = v
            if campo == "end":
                b["num"] = None
    cep = next((u.get("cep") for u in us if u.get("cep")), None)
    s = next((sub_norm(u.get("subprefeitura")) for u in us if u.get("subprefeitura")), None)
    if s:
        b["sub"], b["subDer"] = s, 0
    b["status"] = "ATUALIZADO PELA FONTE OFICIAL"
    conflitos = []
    if len({u["servico"] for u in us}) > 1:
        vals = lambda ch: [(u.get(ch), paginas[u["pagina"]]) for u in us if u.get(ch)]
        fmt = lambda vs: [{"valor": v, "fonte": p.get("titulo"), "data": p.get("data_pagina")} for v, p in vs]
        t = vals("telefone")
        if len(t) > 1 and not set.intersection(*[_tels(v) for v, _ in t]):
            conflitos.append({"campo": "Telefone", "valores": fmt(t)})
        e = vals("endereco")
        if len(e) > 1 and not mesmo_endereco(e[0][0], e[1][0]):
            conflitos.append({"campo": "Endereço", "valores": fmt(e)})
        c_ = vals("cep")
        if len({re.sub(r"\D", "", v) for v, _ in c_}) > 1:
            conflitos.append({"campo": "CEP", "valores": fmt(c_)})
    extra = {k: v for u in us for k, v in u.items() if k in ("gestao", "vagas_noturnas") and v}
    prov[i] = {"cep": cep, "fontes": [{"url": u["pagina"], "titulo": paginas[u["pagina"]].get("titulo"), "secretaria": paginas[u["pagina"]].get("secretaria"),
                                      "data_pagina": paginas[u["pagina"]].get("data_pagina"), "data_aquisicao": paginas[u["pagina"]].get("data_aquisicao")} for u in us],
               "conflitos": conflitos, "alertas": sorted(set(sum((achados_por[u["nome"]] for u in us), []))), **extra}

vistos = set()
for u in novos:
    k = (u["oferta"], parsers.normaliza_nome(u["nome"]))
    if k in vistos:
        continue
    vistos.add(k)
    nid = "P" + hashlib.sha1("|".join(k).encode()).hexdigest()[:7]
    s = sub_norm(u.get("subprefeitura"))
    units[:] = [x for x in units if x["id"] != nid]          # idempotente: reescreve se já existir
    units.append({"id": nid, "of": u["oferta"], "nome": u["nome"], "sub": s, "dist": None, "end": u.get("endereco"), "num": None, "tel": u.get("telefone"),
                  "telN": 0, "email": u.get("email"), "hor": u.get("horario"), "status": "NOVA NA FONTE OFICIAL", "site": None, "subDer": 0})
    p = paginas[u["pagina"]]
    prov[nid] = {"cep": u.get("cep"), "fontes": [{"url": u["pagina"], "titulo": p.get("titulo"), "secretaria": p.get("secretaria"), "data_pagina": p.get("data_pagina"), "data_aquisicao": p.get("data_aquisicao")}],
                 "conflitos": [], "alertas": sorted(set(achados_por[u["nome"]])), **{k: v for k, v in u.items() if k in ("gestao", "vagas_noturnas") and v}}

inativadas = 0
for sid, sv in col["servicos"].items():
    if not sv.get("total_confere"):
        continue
    ofs = {u["oferta"] for u in col["unidades"] if u["servico"] == sid}
    casados = {u["id_base"] for u in col["unidades"] if u["servico"] == sid and u.get("id_base")}
    for b in units:
        if b["of"] in ofs and b["id"] not in casados and not b["id"].startswith("P") and b["status"] != "ATUALIZADO PELA FONTE OFICIAL":
            b["status"] = "NÃO CONSTA NA FONTE OFICIAL"; inativadas += 1

tc = Counter(u["tel"].strip() for u in units if u.get("tel"))
for u in units:
    u["telN"] = tc.get((u.get("tel") or "").strip(), 0)
base["units"] = [[u[c] for c in CAMPOS] for u in units]
json.dump([{"id": u["id"], "oferta": u["of"], "nome": u["nome"], "endereco": u["end"], "numero": u["num"], "telefone": u["tel"], "horario": u["hor"], "email": u["email"]}
           for u in units], open("dados/base_unidades.json", "w", encoding="utf-8"), ensure_ascii=False)
json.dump(base, open("dados/app_base.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

# Banco Mestre em planilha, para a equipe que mantém o Guia
try:
    df = pd.read_excel("dados/Banco_Mestre.xlsx", "Unidades")
    upd = {u["id"]: u for u in units}
    for i, r in df.iterrows():
        u = upd.get(r["ID Unidade"]); p = prov.get(r["ID Unidade"])
        if not u or not p:
            continue
        df.at[i, "Endereço"], df.at[i, "Número"], df.at[i, "Telefone"] = u["end"], None, u["tel"]
        df.at[i, "Horário"], df.at[i, "E-mail"], df.at[i, "Status"] = u["hor"], u["email"], u["status"]
        if u["sub"]: df.at[i, "Subprefeitura"] = u["sub"]
    for col_ in ["CEP", "Fonte oficial (página)", "Atualizada pela secretaria em", "Lida em", "Divergência entre fontes"]:
        df[col_] = None
    for i, r in df.iterrows():
        p = prov.get(r["ID Unidade"])
        if p:
            df.at[i, "CEP"] = p["cep"]; f = p["fontes"][0]
            df.at[i, "Fonte oficial (página)"], df.at[i, "Atualizada pela secretaria em"], df.at[i, "Lida em"] = f["url"], f["data_pagina"], f["data_aquisicao"]
            df.at[i, "Divergência entre fontes"] = "; ".join(f"{c['campo']}: " + " × ".join(f"{v['valor']} ({v['fonte']}, {v['data']})" for v in c["valores"]) for c in p["conflitos"]) or None
    novas = [{"ID Unidade": u["id"], "ID Oferta": u["of"], "Nome da unidade": u["nome"], "Subprefeitura": u["sub"], "Endereço": u["end"], "Telefone": u["tel"],
              "Status": u["status"], "CEP": prov[u["id"]]["cep"], "Fonte oficial (página)": prov[u["id"]]["fontes"][0]["url"],
              "Atualizada pela secretaria em": prov[u["id"]]["fontes"][0]["data_pagina"], "Lida em": prov[u["id"]]["fontes"][0]["data_aquisicao"]} for u in units if u["id"].startswith("P")]
    df = pd.concat([df, pd.DataFrame(novas)], ignore_index=True)
    df.loc[df["ID Unidade"].isin([u["id"] for u in units if u["status"] == "NÃO CONSTA NA FONTE OFICIAL"]), "Status"] = "NÃO CONSTA NA FONTE OFICIAL"
    df.to_excel("saida/Banco_Mestre_Unidades_atualizado.xlsx", sheet_name="Unidades", index=False)
except FileNotFoundError:
    pass

base["coleta"] = {"data_coleta": col["data_coleta"], "modo": col["modo"], "servicos": col["servicos"], "paginas": col["paginas"], "normas": col["normas"],
                  "unidades": prov, "achados": col["achados"], "divergencias": [c for c in col["conciliacao"] if c.get("diferencas")], "mudancas": col.get("mudancas", []),
                  "resumo": {"atualizadas": sum(1 for u in units if u["status"] == "ATUALIZADO PELA FONTE OFICIAL"), "novas": sum(1 for u in units if u["id"].startswith("P")),
                             "nao_constam": inativadas, "com_conflito": sum(1 for p in prov.values() if p["conflitos"])}}
base["guia"] = json.load(open("dados/guia.json", encoding="utf-8"))
d = json.dumps(base, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/").replace("\ufffd", "?")
tpl = open("app/template.html", encoding="utf-8").read()
html = tpl.replace("/*CSS*/", open("app/style.css", encoding="utf-8").read()).replace("/*DATA*/", d).replace("/*JS*/", open("app/app.js", encoding="utf-8").read())
os.makedirs("publico", exist_ok=True)
open("publico/index.html", "w", encoding="utf-8").write(html)
print("publico/index.html", round(len(html) / 1e6, 2), "MB ·", base["coleta"]["resumo"])
