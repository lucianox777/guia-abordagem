from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_versao_do_banco_nao_e_hardcoded():
    app = (ROOT / "app" / "app.js").read_text(encoding="utf-8")
    assert "arquivo V0.8" not in app
    assert "mas o arquivo é a V0.8" not in app
    assert "Versão declarada no painel do Banco Mestre" in app


def test_build_gera_as_duas_paginas():
    build = (ROOT / "build.py").read_text(encoding="utf-8")
    assert '"publico/index.html", "Abordagem assistida.html"' in build


def test_coleta_versiona_a_pagina_da_raiz():
    workflow = (ROOT / ".github" / "workflows" / "coleta.yml").read_text(encoding="utf-8")
    assert '"Abordagem assistida.html"' in workflow
