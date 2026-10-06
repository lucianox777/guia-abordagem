"""Converte a planilha consolidada 'Guia de Ofertas Tratado para Validação' (aba Fluxos Tratados)
em dados/guia.json, usado pela página.

Estrutura: um NÚCLEO por público (os campos normalizados ao Banco Mestre são iguais para todos os
órgãos de um mesmo público). O órgão solicitante fica como metadado: Registro ID, linha de origem,
'Fluxo inicial' original e encaminhamentos específicos.
Uso: python ferramentas/guia_v2_para_json.py dados/Guia_V2.xlsx
"""
import json, os, re, sys
from collections import OrderedDict
import pandas as pd

CAMPOS = [("risco", "Risco Imediato (BM)"), ("porta", "Porta de Entrada"), ("referencia", "Serviço de Referência"),
          ("articulados", "Serviços Articulados"), ("encaminhamentos", "Encaminhamentos"), ("proximo", "Próximo Passo"),
          ("contra", "Contrarreferência"), ("base", "Base Normativa")]
ORIGINAIS = [("Fluxo inicial", "Fluxo Inicial Original"), ("Risco imediato", "Risco Imediato Original"), ("Primeira porta", "Primeira Porta Original"),
             ("Serviços articulados", "Serviços Articulados Original"), ("Serviço de referência", "Serviço de Referência Original"),
             ("Próximo passo", "Próximo Passo Original"), ("Contrarreferência", "Contrarreferência Original"), ("Base oficial", "Base Oficial/Protocolo Original")]
SIGLA = {"Vara da Infância e Juventude": "VIJ", "Conselho Tutelar": "CT", "Escola": "ESCOLA", "UBS": "UBS", "Poder Judiciário": "PJ",
         "Defensoria Pública": "DP", "Ministério Público": "MP", "Munícipe": "MUNICIPE"}


def s(v):
    return None if pd.isna(v) else str(v).strip()


def segmentos(txt):
    """'FL03: texto | FL11: texto' -> [{'tag':'FL03','texto':...}]. Texto sem prefixo vira tag None."""
    if not txt:
        return []
    out = []
    for parte in re.split(r"\s+\|\s+|;\s+(?=(?:FL|OF|N)\d+\s*:)", txt):
        m = re.match(r"^((?:FL|OF|N)\d+)\s*:\s*(.*)$", parte.strip(), re.S)
        out.append({"tag": m.group(1), "texto": m.group(2).strip()} if m else {"tag": None, "texto": parte.strip()})
    return out


def main(xlsx, destino="dados/guia.json"):
    t = pd.read_excel(xlsx, "Fluxos Tratados")
    pend = pd.read_excel(xlsx, "Pendências para Validação")
    nucleos = OrderedDict()
    for _, r in t.iterrows():
        pub = s(r["Público Original"])
        n = nucleos.get(pub)
        if n is None:
            n = nucleos[pub] = {
                "publico": pub, "status": s(r["Status da Adequação"]),
                "necessidades": re.findall(r"N\d{2}", s(r["Necessidade Associada"]) or s(r["Necessidade"]) or ""),
                "necessidade_txt": s(r["Necessidade"]), "fluxos": re.findall(r"FL\d{2}", s(r["Fluxo Associado"]) or ""),
                "fluxo_txt": s(r["Fluxo Associado"]), "ofertas": [], "campos": {k: segmentos(s(r[c])) for k, c in CAMPOS},
                "nao_mapeados": [x.strip() for x in (s(r["Recursos do Original não Mapeados no BM"]) or "").split(";") if x.strip()],
                "justificativa": s(r["Justificativa da Alteração"]), "por_orgao": {}, "pendencias": [],
                "original": {k: s(r[c]) for k, c in ORIGINAIS[1:]}}
        for of in re.findall(r"OF\d{3}", s(r["Oferta Associada"]) or ""):
            if of not in n["ofertas"]:
                n["ofertas"].append(of)
        org = s(r["Órgão Solicitante / Aba de Origem"])
        n["por_orgao"][SIGLA.get(org, org)] = {"orgao": org, "registro": s(r["Registro ID"]), "linha": s(r["Linha Original"]),
                                              "fluxo_inicial": s(r["Fluxo Inicial Original"]), "encaminhamentos": segmentos(s(r["Encaminhamentos"])),
                                              "porta": segmentos(s(r["Porta de Entrada"]))}
    for _, p in pend.iterrows():
        pub = s(p["Público"])
        if pub in nucleos:
            item = {"tipo": s(p["Tipo de Pendência"]), "descricao": s(p["Descrição"]), "acao": s(p["Ação Necessária"]), "status": s(p["Status"])}
            if item not in nucleos[pub]["pendencias"]:
                nucleos[pub]["pendencias"].append(item)
    links = sorted({u for n in nucleos.values() for u in re.findall(r"https?://[^\s|]+", n["original"]["Base oficial"] or "")}
                   | {u for _, r in t.iterrows() for u in re.findall(r"https?://[^\s|]+", s(r["Base Oficial/Protocolo Original"]) or "")})
    out = {"fonte": os.path.basename(xlsx), "registros": len(t), "orgaos": [{"id": SIGLA[o], "nome": o} for o in SIGLA],
           "nucleos": list(nucleos.values()), "links_base": links}
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    json.dump(out, open(destino, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(t)} registros -> {len(nucleos)} núcleos por público; {sum(len(n['pendencias']) for n in nucleos.values())} pendências distintas; {len(links)} links de base")
    return out


if __name__ == "__main__":
    main(sys.argv[1])
