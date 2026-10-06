"""Regressão do CÓDIGO: se algo aqui falhar, o erro é do coletor, não da secretaria.
Cada fixture é o texto de uma página oficial congelado numa data. Casos esquisitos das páginas
viram testes para o parser aprender, em vez de gerar cobrança indevida."""
import os
from datetime import date
from coletor import parsers, validar

FX = os.path.join(os.path.dirname(__file__), "fixtures")
ler = lambda n: open(os.path.join(FX, n), encoding="utf-8").read()
PAG = lambda z=None: {"servico": "t", "secretaria": "X", "url": "u", "titulo": "t", "zona": z, "data_pagina": "2026-07-23"}
codigos = lambda A: {(a["unidade"], a["codigo"]) for a in A}


def test_cras_todas_as_zonas_somam_o_total_declarado():
    arquivos = ["cras_sul_330929.txt", "cras_leste_330930.txt", "cras_oeste_330931.txt", "cras_norte_330928.txt", "cras_centro_330925.txt"]
    total = sum(len(parsers.lista_rotulada(ler(f), "CRAS")) for f in arquivos)
    assert total == parsers.total_declarado(ler("cras_indice_1906.txt"), r"há\s+\**\s*(\d+)\s+unidades de CRAS") == 54


def test_campos_e_minimizacao():
    us = parsers.lista_rotulada(ler("cras_sul_330929.txt"), "CRAS")
    assert all(u.get(k) for u in us for k in ("endereco", "telefone", "horario", "email"))
    assert all("responsavel" not in u for u in us)


def test_nome_partido_em_dois_negritos_e_rotulo_colado():
    ns = {u["nome"]: u for u in parsers.lista_rotulada(ler("cras_norte_330928.txt"), "CRAS")}
    assert "CRAS PIRITUBA" in ns
    assert ns["CRAS CACHOEIRINHA"]["endereco"].startswith("Av. Imirim")       # "**Endereço:**Av."
    assert ns["CRAS VILA MARIA"]["endereco"].startswith("Praça Santo Eduardo")  # "**Endereço:**: Praça"


def test_cep_como_publicado_e_cep_sem_rotulo():
    sul = {u["nome"]: u for u in parsers.lista_rotulada(ler("cras_sul_330929.txt"), "CRAS")}
    assert sul["CRAS JARDIM ÂNGELA"]["cep"] == "05822015"                    # não corrige
    creas = {u["nome"]: u for u in parsers.lista_rotulada(ler("creas_sul_330935.txt"), "CREAS")}
    assert creas["CREAS Cidade Ademar"]["cep"] == "04385-020"                # CEP publicado sem a palavra "CEP"


def test_caracteres_invisiveis_removidos():
    creas = {u["nome"]: u for u in parsers.lista_rotulada(ler("creas_sul_330935.txt"), "CREAS")}
    assert creas["CREAS Vila Mariana"]["cep"] == "04011-080"


def test_caps_formato_da_saude():
    us = parsers.lista_rotulada(ler("caps_territorio_saude.txt"), "CAPS", ["CENTRO", "LESTE", "NORTE", "OESTE", "SUDESTE", "SUL"])
    assert len(us) == 106
    ns = {u["nome"]: u for u in us}
    assert ns["CAPS AD IV REDENÇÃO"]["vagas_noturnas"] == 20 and ns["CAPS AD IV REDENÇÃO"]["regiao"] == "CENTRO"
    assert ns["CAPS AD III BORACÉA"]["email"] == "capsadboracea@afne.org.br"   # remove < >
    assert ns["CAPS IJ III VILA MARIA / VILA GUILHERME"]["telefone"].startswith("(11) 3478")
    assert ns["CAPS AD III CENTRO"]["telefone"] == "(11) 5237-9969 e (11) 5239-0135"   # rótulo "Telefones"


def test_indices_descobrem_paginas_filhas():
    f = parsers.links(ler("creas_indice_2003.txt"), r"/protecao_social_especial/\d+$")
    assert len(f) == 5 and {x["rotulo"] for x in f} >= {"CENTRO", "ZONA SUL"}
    assert parsers.total_declarado(ler("creas_indice_2003.txt"), r"há\s+\**\s*(\d+)\s+unidades de CREAS") == 32
    assert parsers.total_declarado(ler("caps_indice_saude_mental_ad_caps.txt"), r"conta atualmente com\s+(\d+)\s+CAPS") == 103


def test_validacao_casos_reais():
    leste = parsers.lista_rotulada(ler("cras_leste_330930.txt"), "CRAS")
    c = codigos(validar.validar_pagina(PAG("Leste"), leste, ["endereco"], date(2026, 9, 25)))
    assert ("CRAS ITAIM PAULISTA II", "CEP_FORMATO") in c
    assert ("CRAS VILA CURUÇÁ", "CEP_REGIAO_DIVERGENTE") in c
    assert ("CRAS PENHA", "ENDERECO_DUPLICADO") in c
    norte = parsers.lista_rotulada(ler("cras_norte_330928.txt"), "CRAS")
    assert not any(k == "CEP_REGIAO_DIVERGENTE" for _, k in codigos(validar.validar_pagina(PAG("Norte"), norte, [], date(2026, 9, 25))))


def test_validacao_caps():
    us = parsers.lista_rotulada(ler("caps_territorio_saude.txt"), "CAPS", ["CENTRO", "LESTE", "NORTE", "OESTE", "SUDESTE", "SUL"])
    c = codigos(validar.validar_pagina(PAG(), us, ["endereco", "telefone", "email"], date(2026, 9, 25)))
    assert ("CAPS ADULTO II GUAIANASES", "CEP_FORA_MUNICIPIO") in c
    assert ("CAPS IJ II IPIRANGA", "UNIDADE_DUPLICADA") in c
    assert ("CAPS AD II GUAIANASES", "EMAIL_DOMINIO_SUSPEITO") in c
    assert ("CAPS AD II GUAIANASES", "TELEFONE_COMPARTILHADO") in c
    assert not any(k.endswith("_AUSENTE") for _, k in c)



def test_monitoramento_detecta_mudancas():
    from coletor.pipeline import mudancas
    antes = {"unidades": [{"servico": "s", "nome": "CRAS X", "telefone": "(11) 1111-1111"}, {"servico": "s", "nome": "CRAS Y"}]}
    depois = {"unidades": [{"servico": "s", "nome": "CRAS X", "telefone": "(11) 2222-2222"}, {"servico": "s", "nome": "CRAS Z"}]}
    tipos = {(m["tipo"], m["nome"]) for m in mudancas(antes, depois)}
    assert tipos == {("alterada", "CRAS X"), ("removida", "CRAS Y"), ("nova", "CRAS Z")}


def test_hash_ignora_menus():
    t = ler("cras_oeste_330931.txt")
    assert parsers.sha256(parsers.conteudo("MENU A\n" + t)) == parsers.sha256(parsers.conteudo("MENU B diferente\n" + t))


def test_pdf_sms_por_subprefeitura():
    t = ler("sms_relacao_sub_agosto2026.txt")
    us = parsers.pdf_relacao_sms(t)
    assert len(us) == 95 and parsers.data_pdf(t) == "2026-08" and parsers.eh_trecho(t)
    ns = {u["nome"]: u for u in us}
    assert ns["CAPS ADULTO II GUAIANASES - ARTUR BISPO DO ROSÁRIO"]["cep"] == "08410-165"
    assert ns["CAPS ADULTO II GUAIANASES - ARTUR BISPO DO ROSÁRIO"]["subprefeitura"] == "Guaianases"
    assert ns["ESTAÇÃO PREVENÇÃO JORGE BELOQUI"]["telefone"] is None       # "Fone:" vazio
    idx = parsers.links(ler("sms_estabelecimentos_30566.txt"), "unid_munic_saude_sub_")
    assert [x["url"].split("/")[-1] for x in idx] == ["unid_munic_saude_sub_agosto2026"]


def test_pdf_sem_ddd_nao_e_erro_da_secretaria():
    us = parsers.pdf_relacao_sms(ler("sms_relacao_sub_agosto2026.txt"))
    c = codigos(validar.validar_pagina(PAG(), us, ["endereco"], date(2026, 9, 25), opcoes={"ddd_implicito": "11", "endereco_compartilhado_ok": True}))
    assert [n for n, k in c if k == "TELEFONE_FORMATO"] == ["AMA 12H BORACEA - DR. LUIZ BACCALA"]   # "52379-885"


def test_coleta_incremental_reaproveita(tmp_path, monkeypatch):
    import shutil, subprocess, sys
    raiz = os.path.dirname(os.path.dirname(__file__))
    for f in ("fontes.yaml",):
        shutil.copy(os.path.join(raiz, f), tmp_path)
    shutil.copytree(os.path.join(raiz, "dados"), tmp_path / "dados", ignore=shutil.ignore_patterns("*.xlsx"))
    env = dict(os.environ, PYTHONPATH=raiz)
    run = lambda d: subprocess.run([sys.executable, "-m", "coletor.pipeline", "--offline", FX, "--hoje", d], cwd=tmp_path, env=env, capture_output=True, text=True).stdout
    assert "0 páginas sem mudança" in run("2026-09-25")
    assert "0 páginas sem mudança" not in run("2026-09-26")



def test_guia_consolidado_um_nucleo_por_publico(tmp_path, monkeypatch):
    import importlib.util, json
    raiz = os.path.dirname(os.path.dirname(__file__))
    spec = importlib.util.spec_from_file_location("conv", os.path.join(raiz, "ferramentas", "guia_v2_para_json.py"))
    conv = importlib.util.module_from_spec(spec); spec.loader.exec_module(conv)
    monkeypatch.chdir(tmp_path)
    g = conv.main(os.path.join(raiz, "dados", "Guia_de_Ofertas_Tratado_para_Validacao_V2_Escopo_Ampliado.xlsx"))
    assert g["registros"] == 114 and len(g["nucleos"]) == 19
    n = {x["publico"]: x for x in g["nucleos"]}
    assert n["Família com crianças sem moradia"]["status"] == "ADEQUADO" and n["Família com crianças sem moradia"]["fluxos"] == ["FL17"]
    gest = n["Gestante em situação de rua"]
    assert [s["tag"] for s in gest["campos"]["porta"]] == ["FL03", "FL11"]
    assert "CT" not in gest["por_orgao"]                                   # lacuna real da planilha: CT sem fluxo para gestante
    assert len(n["Criança/adolescente"]["por_orgao"]) == 8
    assert conv.segmentos("FL03: a | FL11: b") == [{"tag": "FL03", "texto": "a"}, {"tag": "FL11", "texto": "b"}]
