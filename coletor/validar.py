"""Regras de conformidade das páginas. Cada achado vai para a secretaria responsável. Nada é corrigido."""
import re
from collections import defaultdict
from datetime import date

RX_CEP_OK = re.compile(r"^\d{5}-\d{3}$")
RX_TEL = re.compile(r"\(?\d{2}\)?\s*\d{4,5}-?\d{4}")
RX_EMAIL = re.compile(r"^[\w.+-]+@[\w-]+(\.[\w-]+)+$")
FAIXAS_SP = [(1000000, 5999999), (8000000, 8499999)]
# Prefixos típicos de CEP por região da cidade (heurística -> ALERTA, nunca erro)
ZONA_PREFIXOS = {"CENTRO": ["01"], "NORTE": ["02", "051", "052"], "LESTE": ["03", "08"], "SUDESTE": ["03", "04"],
                 "SUL": ["04", "056", "057", "058", "059"], "OESTE": ["050", "053", "054", "055", "045"]}


def achado(pagina, unidade, codigo, nivel, msg, valor=None):
    return {"servico": pagina.get("servico"), "secretaria": pagina.get("secretaria"), "url": pagina.get("url"),
            "pagina": pagina.get("titulo"), "unidade": unidade, "codigo": codigo, "nivel": nivel,
            "mensagem": msg, "valor_publicado": valor}


def validar_pagina(pag, unidades, obrigatorios, hoje=None, idade_max=180, opcoes=None):
    opcoes = opcoes or {}
    hoje = hoje or date.today()
    A = []
    if not unidades:
        A.append(achado(pag, None, "PAGINA_SEM_UNIDADES", "erro", "Nenhuma unidade encontrada na página."))
    if not pag.get("data_pagina"):
        A.append(achado(pag, None, "DATA_AUSENTE", "alerta", "A página não informa data de atualização."))
    elif (hoje - date.fromisoformat(pag["data_pagina"] if len(pag["data_pagina"]) > 7 else pag["data_pagina"] + "-01")).days > idade_max:
        A.append(achado(pag, None, "PAGINA_DESATUALIZADA", "alerta", "Página sem atualização há mais de %d dias." % idade_max, pag["data_pagina"]))
    por_nome, por_end, por_cep, por_tel = defaultdict(list), defaultdict(list), defaultdict(list), defaultdict(list)
    for u in unidades:
        n = u["nome"]; end = u.get("endereco"); cep = u.get("cep")
        por_nome[n].append(u)
        for campo in obrigatorios:
            if not u.get(campo):
                A.append(achado(pag, n, f"{campo.upper()}_AUSENTE", "erro", f"Campo '{campo}' não informado."))
        if end and end.lstrip()[:1] in ":-":
            A.append(achado(pag, n, "ENDERECO_FORMATO", "alerta", "Endereço começa com pontuação solta.", end))
        if end and not cep:
            A.append(achado(pag, n, "CEP_AUSENTE", "erro", "Endereço sem CEP.", end))
        if cep:
            d = re.sub(r"\D", "", cep)
            if not RX_CEP_OK.match(cep):
                A.append(achado(pag, n, "CEP_FORMATO", "alerta", "CEP fora do padrão 00000-000.", cep))
            if not any(a <= int(d) <= b for a, b in FAIXAS_SP):
                A.append(achado(pag, n, "CEP_FORA_MUNICIPIO", "erro", "CEP fora das faixas do Município de São Paulo.", cep))
            else:
                z = (u.get("regiao") or (pag.get("zona") if not u.get("subprefeitura") else "") or "").upper()
                pref = ZONA_PREFIXOS.get(z, [])
                if pref and not any(d.startswith(p) for p in pref):
                    A.append(achado(pag, n, "CEP_REGIAO_DIVERGENTE", "alerta", f"CEP típico de outra região, mas a unidade está listada em {z.title()}.", cep))
            por_cep[d].append(n)
            if end:
                por_end[re.sub(r"\W", "", end.lower())].append(n)
        tel = u.get("telefone")
        if tel:
            ok_sem_ddd = opcoes.get("ddd_implicito") and re.search(r"\d{4}-\d{4}", tel)
            if not RX_TEL.search(tel) and not ok_sem_ddd:
                A.append(achado(pag, n, "TELEFONE_FORMATO", "alerta", "Telefone fora do padrão (DDD) 0000-0000.", tel))
            for t in re.findall(r"\d{4,5}-?\d{4}", tel):
                por_tel[t.replace("-", "")].append(n)
        em = u.get("email")
        if em:
            if not RX_EMAIL.match(em):
                A.append(achado(pag, n, "EMAIL_FORMATO", "alerta", "E-mail fora do padrão.", em))
            elif em.lower().endswith(".gov.br") and not em.lower().endswith("sp.gov.br"):
                A.append(achado(pag, n, "EMAIL_DOMINIO_SUSPEITO", "alerta", "Domínio .gov.br que não é da Prefeitura de São Paulo. Verificar.", em))
    for n, us in por_nome.items():
        if len(us) > 1:
            A.append(achado(pag, n, "UNIDADE_DUPLICADA", "alerta", f"Unidade listada {len(us)} vezes na mesma página."))
    grupos_end = [set(v) for v in por_end.values() if len(set(v)) > 1]
    for g in grupos_end:
        for n in g:
            A.append(achado(pag, n, "ENDERECO_DUPLICADO", "info" if opcoes.get("endereco_compartilhado_ok") else "alerta", f"Mesmo endereço publicado para unidades diferentes: {', '.join(sorted(g))}. Pode ser o mesmo prédio; confirmar."))
    for v in por_cep.values():
        g = set(v)
        if len(g) > 1 and g not in grupos_end:
            for n in g:
                A.append(achado(pag, n, "CEP_COMPARTILHADO", "info", f"Mesmo CEP em unidades com endereços diferentes: {', '.join(sorted(g))}."))
    for t, v in por_tel.items():
        g = set(v)
        if len(g) > 1:
            for n in g:
                A.append(achado(pag, n, "TELEFONE_COMPARTILHADO", "alerta", f"Mesmo telefone ({t[:-4]}-{t[-4:]}) em unidades diferentes: {', '.join(sorted(g))}."))
    return A
