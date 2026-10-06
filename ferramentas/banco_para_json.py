"""Converte o Banco Mestre (.xlsx) em dados/app_base.json (app) e dados/base_unidades.json (conciliação).
Uso: python ferramentas/banco_para_json.py caminho/Banco_Mestre.xlsx"""
import pandas as pd, json, re, collections, sys
f=sys.argv[1]
R=lambda s: pd.read_excel(f,s)
t,u,c,o,n,fl,nm,pn=R('Territórios'),R('Unidades'),R('Contatos'),R('Ofertas'),R('Necessidades'),R('Fluxos'),R('Normas'),R('Painel')
def s(v): return None if pd.isna(v) else str(v).strip()
terr=collections.OrderedDict()
d2s={}
for _,r in t.sort_values(['Subprefeitura','Distrito']).iterrows():
    terr.setdefault(r['Subprefeitura'],[]).append(r['Distrito']); d2s[r['Distrito']]=r['Subprefeitura']
fix={'Freguesia do Ó/Brasilândia':'Freguesia/Brasilândia','Perus':'Perus/Anhanguera','São Miguel Paulista':'São Miguel'}
def expand(txt):
    out=[]
    if not isinstance(txt,str): return out
    for p in re.split(r',\s*',txt):
        m=re.match(r'OF(\d+)\s*[–-]\s*OF(\d+)',p)
        if m: out+= [f'OF{i:03d}' for i in range(int(m[1]),int(m[2])+1)]
        elif re.match(r'OF\d+',p): out.append(p.strip())
    return out
nec={}
for _,r in n.iterrows():
    nec[r['ID']]=dict(nome=s(r['Necessidade']),porta=s(r['Principal porta de entrada']),rede=s(r['Rede/serviços responsáveis']),ofertas=expand(r['Ofertas relacionadas (IDs)']),ofertasTxt=s(r['Ofertas relacionadas (IDs)']),fluxos=[x.strip() for x in str(r['Fluxo relacionado']).split(',')] if pd.notna(r['Fluxo relacionado']) else [],status=s(r['Status']))
ofe={}
for _,r in o.iterrows():
    ofe[r['ID']]=dict(nome=s(r['Serviço/Oferta']),orgao=s(r['Órgão gestor']),uso=s(r['Necessidades/uso']),publico=s(r['Público']),porta=s(r['Porta de entrada']),quem=s(r['Quem pode encaminhar']),acesso=s(r['Acesso/observação']),encaminha=s(r['Encaminha para']),naoUsar=s(r['Quando não utilizar']),norma=s(r['Base normativa']),fonte=s(r['Fonte oficial']),status=s(r['Status']))
flu={}
for _,r in fl.iterrows():
    if pd.isna(r['ID']): continue
    flu[r['ID']]={k:s(r[c]) for k,c in [('situacao','Situação prioritária'),('fluxo','Fluxo inicial'),('risco','Risco imediato'),('porta','Primeira porta de entrada'),('articulados','Serviços articulados'),('referencia','Serviço de referência'),('proximo','Próximo passo'),('contra','Contrarreferência'),('base','Protocolo/base normativa'),('status','Status')]}
nor={r['ID']:dict(nome=s(r['Norma/Referência']),tema=s(r['Tema']),aplic=s(r['Aplicação no Guia']),status=s(r['Status'])) for _,r in nm.iterrows()}
cc=c.set_index('ID Unidade')
tel_count=u['Telefone'].dropna().astype(str).str.strip().value_counts().to_dict()
import os
guia_ofs=set(re.findall(r'OF\d{3}', open('dados/guia.json',encoding='utf-8').read())) if os.path.exists('dados/guia.json') else set()
keep=guia_ofs|set(x for v in nec.values() for x in v['ofertas'])|{'OF003','OF009','OF006','OF010','OF106','OF112','OF113','OF012','OF013','OF014','OF022','OF042','OF049','OF052','OF015','OF047','OF048','OF016','OF018','OF002','OF009','OF041','OF044','OF043','OF006','OF050','OF051','OF035','OF031','OF030','OF032','OF033','OF034','OF026','OF001','OF107','OF113','OF112','OF083','OF078'}
units=[]; stats=collections.Counter()
for _,r in u.iterrows():
    of=r['ID Oferta']
    if of not in keep: continue
    sub=s(r['Subprefeitura']); sub=fix.get(sub,sub); dist=s(r['Distrito'])
    subDer=False
    if not sub and dist in d2s: sub=d2s[dist]; subDer=True
    tel=s(r['Telefone'])
    email=s(r['E-mail']); site=None
    if r['ID Unidade'] in cc.index:
        x=cc.loc[r['ID Unidade']]; email=email or s(x['E-mail institucional']); site=s(x['Website oficial'])
    num=s(r['Número']); num=num[:-2] if num and num.endswith('.0') else num
    units.append([r['ID Unidade'],of,s(r['Nome da unidade']),sub,dist,s(r['Endereço']),num,tel,tel_count.get(tel,0) if tel else 0,email,s(r['Horário']),s(r['Status']),site,1 if subDer else 0])
    stats['total']+=1; stats['semSub']+= sub is None; stats['semDist']+= dist is None; stats['semTel']+= tel is None; stats['semHor']+= r['Horário'] is None or pd.isna(r['Horário']); stats['naoConf']+= r['Status']=='NÃO CONFIRMADO'
data=dict(terr=terr,nec=nec,ofe=ofe,flu=flu,nor=nor,units=units,stats=dict(stats),statsAll=dict(total=len(u),semSub=int(u['Subprefeitura'].isna().sum()),semDist=int(u['Distrito'].isna().sum()),semTel=int(u['Telefone'].isna().sum()),comHor=int(u['Horário'].notna().sum()),naoConf=int((u['Status']=='NÃO CONFIRMADO').sum()),emVal=int((u['Status']=='EM VALIDAÇÃO').sum()),tel2696=int(tel_count.get('(11) 2696-3200',0))),versao=s(pn.iloc[0,1]))
js=json.dumps(data,ensure_ascii=False,separators=(',',':'))
open('dados/app_base.json','w').write(js); print(len(js)/1e6,'MB',stats)
base=[dict(id=r['ID Unidade'],oferta=r['ID Oferta'],nome=s(r['Nome da unidade']),endereco=s(r['Endereço']),numero=s(r['Número']),telefone=s(r['Telefone']),horario=s(r['Horário']),email=s(r['E-mail'])) for _,r in u.iterrows()]
json.dump(base,open('dados/base_unidades.json','w'),ensure_ascii=False)
