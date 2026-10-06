"""Sincroniza o relatório de validação do Guia com os status reais de Fluxos Tratados.

Edita o XLSX como pacote OOXML, sem reconstruir a planilha. Assim preserva estilos,
tabelas, fórmulas e demais abas. A segunda cópia do Guia é mantida idêntica à de dados/.
"""
from __future__ import annotations

from collections import Counter
from pathlib import Path
import re
import shutil
import tempfile
import xml.etree.ElementTree as ET
from zipfile import ZIP_DEFLATED, ZipFile

NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_REL_DOC = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_REL_PKG = "http://schemas.openxmlformats.org/package/2006/relationships"
ET.register_namespace("", NS_MAIN)
ET.register_namespace("r", NS_REL_DOC)

ARQ_DADOS = Path("dados/Guia_de_Ofertas_Tratado_para_Validacao_V2_Escopo_Ampliado.xlsx")
ARQ_RAIZ = Path("Guia_de_Ofertas_Tratado_para_Validacao_V2_Escopo_Ampliado.xlsx")


def _shared_strings(entries: dict[str, bytes]) -> list[str]:
    raw = entries.get("xl/sharedStrings.xml")
    if not raw:
        return []
    root = ET.fromstring(raw)
    return ["".join(t.text or "" for t in si.iter(f"{{{NS_MAIN}}}t")) for si in root]


def _sheet_paths(entries: dict[str, bytes]) -> dict[str, str]:
    wb = ET.fromstring(entries["xl/workbook.xml"])
    rels = ET.fromstring(entries["xl/_rels/workbook.xml.rels"])
    rel_map = {r.attrib["Id"]: r.attrib["Target"] for r in rels.findall(f"{{{NS_REL_PKG}}}Relationship")}
    out = {}
    for s in wb.find(f"{{{NS_MAIN}}}sheets"):
        rid = s.attrib[f"{{{NS_REL_DOC}}}id"]
        target = rel_map[rid].lstrip("/")
        if not target.startswith("xl/"):
            target = "xl/" + target
        out[s.attrib["name"]] = target
    return out


def _cell_text(cell: ET.Element, shared: list[str]) -> str:
    typ = cell.attrib.get("t")
    if typ == "inlineStr":
        return "".join(t.text or "" for t in cell.iter(f"{{{NS_MAIN}}}t"))
    v = cell.find(f"{{{NS_MAIN}}}v")
    if v is None or v.text is None:
        return ""
    if typ == "s":
        return shared[int(v.text)]
    return v.text


def _column(ref: str) -> str:
    m = re.match(r"([A-Z]+)", ref)
    return m.group(1) if m else ""


def _set_inline(root: ET.Element, ref: str, value: str) -> None:
    cell = root.find(f".//{{{NS_MAIN}}}c[@r='{ref}']")
    if cell is None:
        raise RuntimeError(f"Célula {ref} não encontrada")
    for child in list(cell):
        cell.remove(child)
    cell.set("t", "inlineStr")
    is_el = ET.SubElement(cell, f"{{{NS_MAIN}}}is")
    t_el = ET.SubElement(is_el, f"{{{NS_MAIN}}}t")
    t_el.text = value


def sincronizar(path: Path) -> Counter:
    with ZipFile(path, "r") as zin:
        entries = {n: zin.read(n) for n in zin.namelist()}

    shared = _shared_strings(entries)
    sheets = _sheet_paths(entries)

    tratados_path = sheets["Fluxos Tratados"]
    tratados = ET.fromstring(entries[tratados_path])
    header = {}
    for c in tratados.findall(f".//{{{NS_MAIN}}}row[@r='1']/{{{NS_MAIN}}}c"):
        header[_cell_text(c, shared)] = _column(c.attrib["r"])
    status_col = header.get("Status da Adequação")
    if not status_col:
        raise RuntimeError("Coluna 'Status da Adequação' não encontrada")

    counts = Counter()
    for c in tratados.findall(f".//{{{NS_MAIN}}}c"):
        ref = c.attrib.get("r", "")
        if _column(ref) == status_col and ref != f"{status_col}1":
            val = _cell_text(c, shared).strip()
            if val:
                counts[val] += 1

    total = sum(counts.values())
    adequado = counts.get("ADEQUADO", 0)
    validar = counts.get("A VALIDAR", 0)
    pendente = counts.get("PENDENTE", 0)
    nao_mapeado = counts.get("NÃO MAPEADO", 0)
    desconhecidos = set(counts) - {"ADEQUADO", "A VALIDAR", "PENDENTE", "NÃO MAPEADO"}
    if not total or desconhecidos:
        raise RuntimeError(f"Status inesperados em Fluxos Tratados: {dict(counts)}")

    resumo_path = sheets["Resumo Executivo"]
    resumo = ET.fromstring(entries[resumo_path])
    _set_inline(resumo, "B4", str(total))
    _set_inline(resumo, "B5", str(adequado))
    _set_inline(resumo, "B6", str(nao_mapeado))
    _set_inline(resumo, "B7", str(validar))
    _set_inline(resumo, "B8", str(pendente))
    entries[resumo_path] = ET.tostring(resumo, encoding="utf-8", xml_declaration=True)

    rel_path = sheets["Relatório de Validação"]
    rel = ET.fromstring(entries[rel_path])
    _set_inline(rel, "C7", f"{validar} registros A VALIDAR e itens adicionais por recurso/base normativa na aba de pendências.")
    _set_inline(rel, "C8", f"{nao_mapeado} registros NÃO MAPEADO e {pendente} registros PENDENTE. Os 26 casos antes classificados como NÃO MAPEADO foram reclassificados para A VALIDAR após a revisão do escopo ampliado.")
    _set_inline(rel, "D8", "Revisar A VALIDAR/PENDENTE")
    _set_inline(rel, "E8", "As reclassificações permanecem sujeitas à validação técnica quando a equivalência não é definitiva.")
    _set_inline(rel, "B14", f"A estrutura e a rastreabilidade estão adequadas, mas permanecem {validar} registros A VALIDAR, {pendente} PENDENTE e lacunas de base normativa que exigem decisão do departamento e/ou atualização do Banco Mestre.")
    entries[rel_path] = ET.tostring(rel, encoding="utf-8", xml_declaration=True)

    if adequado + validar + pendente + nao_mapeado != total:
        raise RuntimeError(f"Contagens inconsistentes: {dict(counts)}")

    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False, dir=path.parent) as tmp:
        tmp_path = Path(tmp.name)
    try:
        with ZipFile(tmp_path, "w", ZIP_DEFLATED) as zout:
            for name, data in entries.items():
                zout.writestr(name, data)
        tmp_path.replace(path)
    finally:
        tmp_path.unlink(missing_ok=True)
    return counts


def main() -> None:
    counts = sincronizar(ARQ_DADOS)
    shutil.copy2(ARQ_DADOS, ARQ_RAIZ)
    print("Relatório sincronizado:", dict(counts))


if __name__ == "__main__":
    main()
