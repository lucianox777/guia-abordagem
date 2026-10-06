# Guia de Abordagem · coletor das páginas oficiais

Job agendado (GitHub Actions) que mantém o assistente de abordagem alinhado às páginas oficiais da Prefeitura.

## Princípios
- **A página oficial é a fonte.** A evidência de cada dado é a própria página, com duas datas: quando a secretaria a atualizou e quando o job a leu.
- **Coleta incremental.** O job pede as páginas com GET condicional (ETag/Last-Modified) e compara o conteúdo com a última leitura (hash interno em `saida/cache.json`). Só reprocessa o que mudou.
- **O Banco Mestre auto-contido é sempre atualizado** com o conteúdo das páginas (`build.py`): `dados/app_base.json` (embutido no HTML) e `saida/Banco_Mestre_Unidades_atualizado.xlsx` (para a equipe do Guia), com colunas de fonte, datas e divergências.
- **O coletor não corrige dados.** Publica como está e devolve as inconformidades à secretaria.
- **Divergência entre duas fontes oficiais** (ex.: página dos CAPS × relação em PDF do CEInfo): prevalece a publicação mais recente, e a divergência fica registrada no app, na planilha e no relatório.
- **Só entram links com uso na aplicação** (`fontes.yaml`); os descartados ficam listados com o motivo.
- **Legislação é monitorada, não interpretada.** Texto alterado gera issue para o Núcleo Técnico revisar as regras.

## Três verificações, três destinatários
| Verificação | Onde | Se falhar |
|---|---|---|
| Regressão do código (`tests/`, páginas congeladas) | `pytest` | Erro do coletor. Nada é publicado. Issue `erro-do-coletor` |
| Conformidade das páginas | `saida/conformidade.md/.csv` | Devolutiva para a secretaria |
| Mudanças desde a última coleta | `saida/mudancas.md` | Monitoramento. Normas alteradas geram issue `norma-alterada` |

Se um serviço perder mais de 30% das unidades de um dia para o outro, a publicação é bloqueada e a página continua com a coleta anterior.

## Fontes
| Serviço | Índice | Filhas | Formato |
|---|---|---|---|
| CRAS (SMADS) | protecao_social_basica/1906 | 5 páginas por zona | HTML |
| CREAS (SMADS) | protecao_social_especial/2003 | 5 páginas por zona | HTML |
| CAPS (SMS) | saude_mental_ad/caps | página "CAPS por território" | HTML |
| Estabelecimentos SMS | informacoes_assistenciais/30566 | PDF "Relação por Subprefeitura" (CEInfo/CNES) | PDF |

## Guia de Ofertas consolidado
`dados/Guia_de_Ofertas_Tratado_para_Validacao_V2_Escopo_Ampliado.xlsx` (aba “Fluxos Tratados”, 114 registros) é convertida por
`ferramentas/guia_v2_para_json.py` em `dados/guia.json`: um núcleo por público (19), normalizado ao Banco Mestre
(Necessidade → Porta de entrada → Serviço de referência → Articulados → Encaminhamentos → Próximo passo → Contrarreferência → Base normativa).
O órgão solicitante fica como metadado (Registro ID, linha, “Fluxo inicial” original). Pendências e status de adequação são exibidos no app.
As páginas e normas citadas como base são monitoradas pelo job.

## Rodar localmente
```
pip install -r requirements.txt
pytest -q
python ferramentas/banco_para_json.py dados/Banco_Mestre.xlsx   # só na primeira vez
python ferramentas/guia_v2_para_json.py dados/Guia_de_Ofertas_Tratado_para_Validacao_V2_Escopo_Ampliado.xlsx
python -m coletor.pipeline --offline tests/fixtures --hoje 2026-09-25
python build.py
```

## Situação do teste (25/09/2026)
- CRAS: 5 de 5 páginas; 54 unidades = total declarado.
- CREAS: 1 de 5 páginas (Sul). As outras 4 foram descobertas pelo índice, mas não puderam ser lidas no ambiente de teste.
- CAPS: 106 entradas, 104 distintas; o índice declara 103.
- PDF da SMS: o teste usa um trecho (Guaianases, Penha, Sé; 95 unidades). O job lê o PDF inteiro (56 páginas).
- Normas: configuradas; não lidas no ambiente de teste.
- `html_para_texto` e a leitura de PDF (pdfplumber) só foram testadas com texto já extraído. Validar na primeira execução online.
