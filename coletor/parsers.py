"""Extração do conteúdo das páginas oficiais. Regra: extrair COMO PUBLICADO; nada é corrigido."""
import re, unicodedata, hashlib

MESES = {m: i for i, m in enumerate(["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
                                     "agosto", "setembro", "outubro", "novembro", "dezembro"], 1)}
ROTULOS = {"responsável": "responsavel", "responsavel": "responsavel", "endereço": "endereco", "endereco": "endereco",
           "horário de atendimento": "horario", "horario de atendimento": "horario", "horário": "horario",
           "e-mail": "email", "email": "email", "telefones": "telefone", "telefone": "telefone", "fone": "telefone",
           "gestão": "gestao", "gestao": "gestao"}
RX_ROTULO = re.compile(r"^\**\s*(" + "|".join(map(re.escape, sorted(ROTULOS, key=len, reverse=True))) + r")\s*:?\s*\**\s*:?\s*(.*)$", re.I)
RX_DATA = re.compile(r"(\d{1,2}) de ([A-Za-zçÇ]+) de (\d{4})")
RX_PAGINACAO = re.compile(r"Exibindo\s+(\d+)\s*-\s*(\d+)\s+de\s+(\d+)\s+resultados", re.I)
RX_CEP = re.compile(r"CEP\s*:?\s*(\d{5}-?\d{3}|\d{2}\.?\d{3}-?\d{3})", re.I)
RX_CEP_SOLTO = re.compile(r"\b(\d{5}-\d{3})\b")
RX_VAGAS = re.compile(r"(\d+)\s+VAGAS PARA ACOLHIMENTO NOTURNO", re.I)
RX_TITULO = re.compile(r"^##\s+(.+)$", re.M)
INVISIVEIS = dict.fromkeys(map(ord, "\u200b\u200c\u200d\ufeff\xa0"), " ")


def html_para_texto(html: str) -> str:
    """HTML do portal -> texto por linhas, negrito como ** e links como [texto](url)."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    for t in soup(["script", "style", "noscript", "header", "nav", "footer"]):
        t.decompose()
    for br in soup.find_all("br"):
        br.replace_with("\n")
    for a in soup.find_all("a", href=True):
        a.replace_with(f"[{a.get_text(' ', strip=True)}]({a['href']})")
    for b in soup.find_all(["strong", "b"]):
        b.replace_with(f"**{b.get_text()}**")
    for h in soup.find_all(["h1", "h2"]):
        h.replace_with(f"\n## {h.get_text(' ', strip=True)}\n")
    main = soup.find(id="main-content") or soup
    return main.get_text("\n")


def conteudo(texto: str) -> str:
    """Trecho do texto a partir do título do conteúdo, para hash estável (ignora menus e banners)."""
    i = texto.find("\n## ", texto.find("Exibindo") if "Exibindo" in texto else 0)
    j = texto.find("*collections*", i)
    return texto[i if i >= 0 else 0: j if j > 0 else None].strip()


def sha256(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def data_pagina(texto):
    m = RX_DATA.search(texto)
    mes = MESES.get(m.group(2).lower()) if m else None
    return f"{m.group(3)}-{mes:02d}-{int(m.group(1)):02d}" if mes else None


def paginacao(texto):
    m = RX_PAGINACAO.search(texto)
    return int(m.group(3)) if m else 1


def titulo(texto):
    t = [x.strip() for x in RX_TITULO.findall(texto)]
    return next((x for x in t if not x.startswith("Secretaria")), None)


def zona_do_titulo(tit):
    if not tit:
        return None
    m = re.search(r"Zona\s+(\w+)", tit)
    return m.group(1).capitalize() if m else ("Centro" if "centro" in tit.lower() else None)


def links(texto, padrao):
    rx = re.compile(padrao)
    vistos, out = set(), []
    for rot, url in re.findall(r"\[([^\]]*)\]\((https?://[^)\s]+)\)", texto):
        if rx.search(url) and url not in vistos:
            vistos.add(url); out.append({"url": url, "rotulo": rot.replace("*", "").strip()})
    return out


def total_declarado(texto, padrao):
    m = re.search(padrao, texto, re.I)
    return int(m.group(1)) if m else None


def _limpa(l):
    l = l.translate(INVISIVEIS).strip()
    return re.sub(r"\*\*\s+\*\*", " ", l)


def eh_trecho(texto):
    return "[TRECHO" in texto


def lista_rotulada(texto, prefixo="", regioes=()):
    """Blocos: NOME em negrito + linhas 'Rótulo: valor'. Suporta cabeçalhos de região e vagas noturnas."""
    unidades, atual, regiao = [], None, None
    regioes = {r.upper() for r in regioes}
    for bruta in texto.splitlines():
        l = _limpa(bruta)
        if not l:
            continue
        nu = l.strip("* ").strip()
        if regioes and l.startswith("**") and nu.upper() in regioes:
            regiao, atual = nu.upper(), None
            continue
        if l.startswith("**") and nu.upper().startswith(prefixo.upper()) and ":" not in nu:
            atual = {"nome": re.sub(r"\s+", " ", nu)}
            if regiao:
                atual["regiao"] = regiao
            unidades.append(atual)
            continue
        if atual is None:
            continue
        m = RX_ROTULO.match(l)
        if m:
            v = m.group(2).replace("**", "").strip()
            if ROTULOS[m.group(1).lower()] == "email":
                v = v.strip("<>").strip()
            atual[ROTULOS[m.group(1).lower()]] = re.sub(r"\s+", " ", v)
            continue
        mv = RX_VAGAS.search(l)
        if mv:
            atual["vagas_noturnas"] = int(mv.group(1))
    for u in unidades:
        end = u.get("endereco") or ""
        m = RX_CEP.search(end) or RX_CEP_SOLTO.search(end)
        u["cep"] = m.group(1) if m else None
        u.pop("responsavel", None)     # minimização (LGPD)
    return unidades


def normaliza_nome(n):
    n = unicodedata.normalize("NFKD", n or "").encode("ascii", "ignore").decode().upper()
    n = re.sub(r"[^A-Z0-9 ]", " ", n)
    for a, b in [(r"\bINFANTOJUVENIL\b", "IJ"), (r"\bINFANTO JUVENIL\b", "IJ"), (r"\bJARDIM\b", "JD"),
                 (r"\bFREGUESIA DO O\b", "FO"), (r"\bI\b$", "")]:
        n = re.sub(a, b, n)
    return re.sub(r"\s+", " ", n).strip()


RX_PDF_DATA = re.compile(r"\b(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/(\d{4})\b", re.I)


def data_pdf(texto):
    """Data de referência de relatórios em PDF ("agosto/2026" -> "2026-08")."""
    m = RX_PDF_DATA.search(texto)
    return f"{m.group(2)}-{MESES[m.group(1).lower()]:02d}" if m else None


def pdf_relacao_sms(texto, prefixo="", regioes=()):
    """Relação de estabelecimentos da SMS (PDF CEInfo): 'Subprefeitura: X' seguido de trios
    NOME / ENDEREÇO - BAIRRO / 'CEP: 00000-000 - Fone: ...'."""
    unidades, sub, buf = [], None, []
    for bruta in texto.splitlines():
        l = bruta.translate(INVISIVEIS).strip()
        if not l or l.startswith(("Relação dos Estabelecimentos", "Fonte: MS-CNES", "Powered by", "[TRECHO")):
            continue
        m = re.match(r"Subprefeitura:\s*(.+)$", l)
        if m:
            sub, buf = m.group(1).strip(), []
            continue
        m = re.match(r"CEP:\s*([\d.-]+)\s*-\s*Fone:\s*(.*)$", l)
        if m and sub and len(buf) >= 2:
            end = buf[-1]
            unidades.append({"nome": re.sub(r"\s+", " ", buf[-2]), "endereco": end, "cep": m.group(1),
                             "telefone": m.group(2).strip() or None, "subprefeitura": sub})
            buf = []
            continue
        buf.append(l)
    return unidades
