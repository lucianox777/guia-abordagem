const D = JSON.parse(document.getElementById('data').textContent);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const OFE = D.ofe, NEC = D.nec, FLU = D.flu, G = D.guia || {nucleos:[], orgaos:[]};
const NUC = Object.fromEntries(G.nucleos.map(n=>[n.publico, n]));
const ORG = Object.fromEntries(G.orgaos.map(o=>[o.id, o.nome]));
const C = D.coleta || {servicos:{}, paginas:{}, normas:{}, unidades:{}, novos:[]};
const U = D.units.filter(a => a[11] !== 'NÃO CONSTA NA FONTE OFICIAL').map(a => ({id:a[0],of:a[1],nome:a[2],sub:a[3],dist:a[4],end:a[5],num:a[6],tel:a[7],telN:a[8],email:a[9],hor:a[10],status:a[11],site:a[12],subDer:a[13]}));
/* camada coletada das páginas oficiais: prevalece sobre o Banco Mestre, publicada como está */
U.forEach(u => { const c = C.unidades[u.id]; if (c) { u.cep = c.cep; u.col = c; } });
const fdata = iso => !iso ? null : iso.length===7 ? iso.split('-').reverse().join('/') : iso.split('-').reverse().join('/');
const byOf = {}; U.forEach(u => (byOf[u.of] ||= []).push(u));

/* ---------- Tabela de graduação de riscos (protocolo, p. 3) ---------- */
const RISCO = {
  trabalho:      {l:'Trabalho infantil', cat:'Negligência', g:'Moderado', p:1, a:'3 orientações'},
  recusa_pais:   {l:'Recusa dos pais em sair da rua', cat:'Negligência', g:'Moderado', p:2, a:'3 ofertas em modalidades diferentes'},
  viol_psico:    {l:'Violência psicológica', cat:'Violência', g:'Moderado', p:2, a:'2 orientações'},
  fora_escola:   {l:'Fora da escola', cat:'Negligência', g:'Alto', p:2, a:'3 orientações'},
  sem_doc:       {l:'Sem documento', cat:'Negligência', g:'Alto', p:2, a:'3 orientações'},
  sem_vacina:    {l:'Sem protocolo de vacinação', cat:'Negligência', g:'Alto', p:2, a:'3 orientações'},
  pais_spa:      {l:'Pais com uso de substâncias psicoativas', cat:'Negligência', g:'Alto', p:3, a:'3 orientações: medida protetiva'},
  hist_acolh:    {l:'Histórico de acolhimento prévio', cat:'Negligência', g:'Alto', p:3, a:'Intervenção imediata', im:1},
  viol_fis_p:    {l:'Violência física pontual', cat:'Violência', g:'Alto', p:3, a:'1 orientação'},
  adol_desac:    {l:'Adolescente desacompanhado de adulto responsável', cat:'Negligência', g:'Alto', p:3, a:'2 orientações', der:1},
  spa_crianca:   {l:'Uso de substâncias psicoativas pela criança/adolescente', cat:'Negligência', g:'Alto', p:3, a:'Intervenção imediata', im:1},
  crianca_sem_vig:{l:'Criança sem vigilância de responsável', cat:'Negligência', g:'Muito alto', p:null, a:'Intervenção imediata', im:1, der:1},
  viol_fis_s:    {l:'Sinais de violência física sistemática', cat:'Violência', g:'Muito alto', p:null, a:'Intervenção imediata', im:1},
  viol_sexual:   {l:'Violência sexual', cat:'Violência', g:'Muito alto', p:null, a:'Intervenção imediata', im:1},
  explor_sexual: {l:'Exploração sexual', cat:'Violência', g:'Muito alto', p:null, a:'Intervenção imediata', im:1},
  enfermidade:   {l:'Com enfermidade', cat:'Negligência', g:'Muito alto', p:null, a:'Intervenção imediata. Recusa: notifica a VIJ', im:1},
};
const NAO_PONTUADAS = {
  ameaca: 'Ameaça de morte',
  ato: 'Ato infracional',
};
const ATEN = {
  pais_doc: {l:'Pais com documentação da criança', x:'sem_doc'},
  vacina_ok:{l:'Vacinação em dia', x:'sem_vacina'},
  educ:     {l:'Inserção na educação', x:'fora_escola'},
  pais_cap: {l:'Pais com capacidade protetiva'},
  amamenta: {l:'Mães que amamentam'},
};
const OUTRAS = {
  mental:  {l:'Sinais de sofrimento mental', n:'N03'},
  gravidez:{l:'Gravidez', n:'N24'},
  defic:   {l:'Deficiência', n:'N13'},
  fome:    {l:'Insegurança alimentar', n:'N17'},
  moradia: {l:'Família sem moradia', n:'N18'},
  emprego: {l:'Interesse em profissionalização / primeiro emprego', n:'N14', adol:1},
  mse:     {l:'Cumpre medida socioeducativa', n:'N10', adol:1},
  imigr:   {l:'Família imigrante ou refugiada', n:'N15', crianca:1},
  violen:  {l:'Violência ou ameaça', n:'N06', adulto:1},
  drogas:  {l:'Uso de álcool e outras drogas', n:'N23', adulto:1},
  saude:   {l:'Problema de saúde', n:'N02', adulto:1},
  doc:     {l:'Sem documentos', n:'N15', adulto:1},
  jurid:   {l:'Precisa de orientação jurídica', n:'N16', adulto:1},
};
const PERFIL = {
  mulher:  'Mulher',
  comcria: 'Está com criança(s)',
  gestante:'Gestante',
  puerpera:'Puérpera ou lactante',
  idosa:   'Pessoa idosa (60 anos ou mais)',
  lgbt:    'Pessoa LGBTQIA+',
  pcd:     'Pessoa com deficiência',
  imigr:   'Imigrante ou refugiada',
};
const ehCrianca = () => S.idade === 'crianca' || S.idade === 'adolescente';
const ehAdulto = () => S.idade === 'adulto';
const PROTO = ['SEAS','eCR','GCM'];
const protocolo = () => PROTO.includes(S.agente) && ehCrianca();
const quemAtende = () => PROTO.includes(S.agente) ? S.agente : (ORG[S.orgao] || 'Órgão não informado');

/* ---------- Público do Guia de Ofertas, derivado das respostas ---------- */
function publicos(){
  const out = [], add = (p, por) => { if (NUC[p] && !out.some(x=>x.p===p)) out.push({p, por}); };
  const rua = S.rua === 'sim', pf = S.perfil;
  if (ehCrianca()){
    if (S.idade==='adolescente' && S.outras.has('gravidez')) add('Adolescente/mãe jovem', 'adolescente com gravidez');
    if (S.acomp==='sim' && rua) add('Família com crianças em situação de rua', 'acompanhada por adulto e em situação de rua');
    if (S.outras.has('moradia')) add('Família com crianças sem moradia', 'família sem moradia');
    if (S.outras.has('imigr')) add('Família imigrante com crianças', 'família imigrante ou refugiada');
    if (S.acomp==='sim'){
      if (pf.has('mulher')) add('Mulher com criança(s)', 'adulta que acompanha é mulher');
      if (rua && pf.has('gestante')) add('Gestante em situação de rua', 'adulta que acompanha está gestante e em situação de rua');
      if (rua && pf.has('puerpera')) add('Puérpera/lactante em situação de rua', 'adulta que acompanha é puérpera ou lactante, em situação de rua');
      if (rua && pf.has('pcd')) add('Pessoa com deficiência em situação de rua', 'adulto que acompanha tem deficiência');
      if (pf.has('idosa')) add(rua ? 'Pessoa idosa em situação de rua' : 'Pessoa idosa', 'adulto que acompanha é idoso');
      if (pf.has('lgbt')) add('Pessoa LGBTQIA+ adulta', 'adulto que acompanha é LGBTQIA+');
      if (pf.has('imigr')) add('Imigrante/refugiado', 'adulto que acompanha é imigrante ou refugiado');
    }
    if (S.desap==='sim') add('Pessoa desaparecida', 'desaparecimento');
    // Sem público específico e sem situação marcada: fluxo padrão (FL20). Com situação marcada, vale o fluxo da situação.
    if (!out.length && !(S.sit.size || S.outras.size)) add(S.acomp==='sim' ? 'Criança/adolescente e família' : 'Criança/adolescente', S.acomp==='sim' ? 'nenhuma situação específica foi marcada (fluxo padrão)' : 'nenhuma situação específica foi marcada (fluxo padrão)');
  } else if (ehAdulto()){
    if (rua && pf.has('gestante')) add('Gestante em situação de rua', 'gestante em situação de rua');
    if (rua && pf.has('puerpera')) add('Puérpera/lactante em situação de rua', 'puérpera ou lactante em situação de rua');
    if (rua && pf.has('pcd')) add('Pessoa com deficiência em situação de rua', 'pessoa com deficiência em situação de rua');
    if (pf.has('idosa')) add(rua ? 'Pessoa idosa em situação de rua' : 'Pessoa idosa', rua ? 'pessoa idosa em situação de rua' : 'pessoa idosa');
    if (pf.has('mulher') && rua) add('Mulher em situação de rua', 'mulher em situação de rua');
    if (pf.has('mulher') && pf.has('comcria')) add('Mulher com criança(s)', 'mulher com criança(s)');
    if (pf.has('lgbt')) add('Pessoa LGBTQIA+ adulta', 'pessoa LGBTQIA+');
    if (pf.has('imigr')) add('Imigrante/refugiado', 'imigrante ou refugiada');
    if (S.desap==='sim') add('Pessoa desaparecida', 'desaparecimento');
    if (!out.length) add(rua ? 'Pessoa em situação de rua' : 'Pessoa adulta', rua ? 'pessoa em situação de rua' : 'pessoa adulta');
  }
  return out;
}
const GRUPOS = [
  ['Violência', ['viol_psico','viol_fis_p','viol_fis_s','viol_sexual','explor_sexual','ameaca']],
  ['Álcool e outras drogas', ['spa_crianca','pais_spa']],
  ['Saúde', ['enfermidade']],
  ['Direitos básicos', ['fora_escola','sem_doc','sem_vacina']],
  ['Família e trajetória', ['trabalho','recusa_pais','hist_acolh']],
  ['Conflito com a lei', ['ato']],
];

/* ---------- Estado ---------- */
const now = new Date();
const pad = n => String(n).padStart(2,'0');
const S = {
  emerg:null, agente:null, sub:'Sé', dist:'', dt:`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`,
  orgao:null, idade:null, acomp:null, rua:null, desap:null, evasao:null, flag:null, perfil:new Set(),
  sit:new Set(), outras:new Set(), prot:new Set(),
  deseja:null, necessita:null, risco:null,
};
let step = 0;

function horarioComercial(){
  const d = new Date(S.dt); if (isNaN(d)) return null;
  const wd = d.getDay(), h = d.getHours();
  return wd >= 1 && wd <= 5 && h >= 8 && h < 18;
}
function itensRisco(){
  const s = new Set([...S.sit].filter(k => RISCO[k]));
  if (S.acomp === 'nao' && S.idade === 'crianca') s.add('crianca_sem_vig');
  if (S.acomp === 'nao' && S.idade === 'adolescente') s.add('adol_desac');
  return [...s];
}
function calcRisco(){
  const it = itensRisco();
  const pts = it.reduce((a,k)=>a+(RISCO[k].p||0),0);
  const imed = it.filter(k=>RISCO[k].im);
  const atenValid = [...S.prot].filter(k=>!(ATEN[k].x && S.sit.has(ATEN[k].x)));
  const atenAplic = imed.length ? 0 : atenValid.length;
  const final = Math.max(0, pts - atenAplic);
  let nivel = 'Sem pontuação', cls='n0';
  if (imed.length || final >= 6){ nivel='Muito alto'; cls='n3'; }
  else if (final >= 3){ nivel='Alto'; cls='n2'; }
  else if (final >= 1){ nivel='Moderado'; cls='n1'; }
  return {it, pts, imed, atenValid, atenAplic, final, nivel, cls};
}

/* ---------- Contatos ---------- */
const CONTATOS = {
  '156':  {t:'Central 156', tel:'156', nota:'Canal indicado pelo protocolo para acionar SEAS/CPAS.', fonte:'Protocolo integrado (fluxogramas) e Banco Mestre OF069'},
  'SAMU': {t:'SAMU', tel:'192', nota:'Número nacional de emergência. O SAMU consta no Banco Mestre (OF052) sem telefone cadastrado.', fonte:'Número nacional — não consta no Banco Mestre', ext:1},
  'SEAS': {t:'SEAS Criança e Adolescente', of:['OF012']},
  'CT':   {t:'Conselho Tutelar', of:['OF022']},
  'CREAS':{t:'CREAS', of:['OF002']},
  'CPAS': {t:'CPAS', of:['OF042'], nota:'No Banco Mestre, a oferta OF042 se chama "CPAS – Central de vagas e proteção social". O protocolo orienta acionar o CPAS via 156.'},
  'CV':   {t:'Central de Vagas', na:1, nota:'Não existe oferta própria no Banco Mestre. O protocolo cita "Central de Vagas" separada do CPAS, mas o Banco Mestre trata os dois como uma coisa só (OF042). É preciso confirmar se são o mesmo canal.'},
  'MP':   {t:'Ministério Público', of:['OF033']},
  'VIJ':  {t:'Vara / Juízo da Infância e Juventude', of:['OF034']},
  'DEF':  {t:'Defensoria Pública', of:['OF032']},
  'PPCAAM':{t:'PPCAAM', of:['OF035']},
  'UBS':  {t:'UBS do território', of:['OF016']},
  'ECR':  {t:'Consultório na Rua (eCR)', of:['OF049']},
  'CAPS': {t:'CAPSij e CAPS AD', of:['OF015','OF048']},
  'POL':  {t:'Autoridade policial', of:['OF030','OF031'], tel:'190', nota:'O 190 é o número nacional da Polícia Militar e não consta no Banco Mestre. Não há delegacias cadastradas.', ext:1},
  'POP':  {t:'Centro POP', of:['OF041']},
};

/* ---------- Construtores de passos ---------- */
const A = (txt,c=[]) => ({k:'a',txt,c});
const SIM = (txt,c=[]) => ({k:'sim',txt,c});
const GAP = txt => ({k:'gap',txt});
const PRIO = (txt,c=[]) => ({k:'prio',txt,c});
const WHO = txt => ({k:'who',txt});
const CTMP = (extra) => ({k:'fim',txt:'Informar o Conselho Tutelar e/ou o Ministério Público' + (extra||''),c:['CT','MP']});
const REL  = (sim) => ({k: sim?'sim':'fim', txt:'Emitir relatório detalhado para o CREAS de referência e o Juízo da Infância e Juventude', c:['CREAS','VIJ']});
function br(v, cond, yes, no){
  if (v === 'sim') return [{k:'n',txt:cond+' Sim.'}, ...yes];
  if (v === 'nao') return [{k:'n',txt:cond+' Não.'}, ...no];
  return [{k:'if',cond,yes,no}];
}

/* ---------- Fluxos do protocolo ---------- */
function fluxoGeral(){
  const ag = S.agente, st = [];
  const acomp = S.acomp === 'sim';
  if (acomp){
    if (ag === 'SEAS'){
      st.push(A('Apresentar a importância do acesso ao acolhimento e aos demais serviços'));
      st.push(...br(S.deseja,'Deseja acolhimento?',
        [A('Articular vaga e direcionar para o acolhimento',['CPAS','CV']), CTMP()],
        br(S.risco,'Existe risco ou prejuízo ao desenvolvimento?',
          [A('Realizar os procedimentos de Medida de Acolhimento de emergência',['156','CPAS']), REL(true)],
          [A('Produzir relatório de intervenções'), CTMP()])));
    } else if (ag === 'eCR'){
      st.push(A('Apresentar os serviços da rede'));
      st.push(A('Acionar o SEAS e aguardar',['156','SEAS']));
      st.push({k:'if',cond:'O SEAS está impossibilitado, ou é impossível aguardar no local?',
        yes:[A('Acionar e encaminhar ao CREAS',['CREAS']), A('Ações do CREAS/Centro POP',['CREAS','POP'])],
        no:[A('Seguir o procedimento do SEAS',['SEAS'])]});
    } else {
      st.push(A('Acionar o SEAS e aguardar sua chegada',['156','SEAS']));
      st.push(GAP('Para a GCM com criança/adolescente acompanhado, o protocolo termina em "acionar o SEAS e aguardar". Não há orientação sobre o que fazer se o SEAS não vier.'));
    }
  } else {
    if (ag === 'SEAS'){
      st.push(...br(S.desap,'É desaparecimento?',
        [A('Acionar e encaminhar ao CREAS para avaliação de outras violações',['CREAS']), CTMP()],
        br(S.evasao,'É evasão de SAICA?',
          [A('Contatar a Central de Vagas para retorno ao SAICA de origem',['CV','CPAS']), CTMP()],
          br(S.deseja,'Deseja acolhimento?',
            [A('Contatar a Central de Vagas',['CV','CPAS']), A('Realizar os procedimentos de Acolhimento Emergencial',['156','CPAS']), CTMP()],
            br(S.risco,'Existe risco?',
              [A('Realizar os procedimentos de Acolhimento Emergencial',['156','CPAS']), SIM('Contatar a Central de Vagas',['CV']), REL(true), CTMP()],
              [GAP('O protocolo não define o desfecho para o SEAS quando a criança/adolescente está desacompanhado, não deseja acolhimento e não há risco. O protótipo sugere o desfecho comum aos demais ramos.'), CTMP()])))));
    } else if (ag === 'eCR'){
      st.push(...br(S.desap,'É desaparecimento?',
        [A('Contatar o SEAS e/ou encaminhar ao CREAS para avaliação de outras violações',['SEAS','156','CREAS']), CTMP()],
        [A('Informar sobre a importância do acolhimento e apresentar a rede'),
         ...br(S.deseja,'Deseja acolhimento?',
          [A('Contatar o SEAS e a Central de Vagas',['156','SEAS','CV']), A('Procedimentos SEAS/CPAS',['CPAS'])],
          br(S.risco,'Existe risco?',
            [A('Acionar o SEAS para acolhimento emergencial',['156','SEAS']), A('Procedimentos SEAS/CPAS',['CPAS'])],
            [A('Produzir relatório'), CTMP()]))]));
    } else {
      const hc = horarioComercial();
      st.push(...br(S.desap,'É desaparecimento?',
        [A('Contatar o SEAS e/ou encaminhar ao CREAS para avaliação de outras violações',['SEAS','156','CREAS']), CTMP()],
        br(hc===null?null:(hc?'sim':'nao'),'Está em horário comercial?',
          [A('Acionar o SEAS e/ou encaminhar ao CREAS',['156','SEAS','CREAS'])],
          [A('Contatar o CPAS e aguardar a chegada',['156','CPAS']), A('Procedimentos SEAS/CPAS')])));
    }
  }
  return {id:'geral', t: acomp ? 'Fluxo geral · acompanhado(a)' : 'Fluxo geral · desacompanhado(a)', pag:'p. 5', st};
}

function fluxoDrogas(){
  const st=[];
  if (S.agente==='GCM'){ st.push(A('Acionar SEAS/CPAS via 156 e aguardar a chegada',['156','SEAS','CPAS'])); st.push(WHO('Depois da chegada, o SEAS segue os passos abaixo.')); }
  st.push(A('Analisar o contexto individual para possíveis encaminhamentos à rede municipal'));
  st.push(...br(S.necessita,'Necessita de acolhimento?',
    [A('Contatar e seguir o procedimento SEAS/CPAS de acolhimento',['156','CPAS']), CTMP()],
    [A('Acionar os demais equipamentos do caso e traçar estratégias, em especial CAPS, eCR e SEAS',['CAPS','ECR','SEAS']), CTMP()]));
  return {id:'drogas', t:'Álcool e outras drogas', pag:'p. 6', st};
}
function fluxoSexual(){
  const st=[];
  if (S.agente==='GCM'){
    st.push(A('Acionar SEAS/CPAS via 156 e aguardar a chegada',['156','SEAS','CPAS']));
    st.push(SIM('Adotar medidas legais em relação ao(à) autor(a)/suspeito(a) da violência, se houver',['POL']));
    st.push(WHO('Depois da chegada, o SEAS segue os passos abaixo.'));
  }
  if (S.agente==='eCR') st.push(A('Efetuar atendimento de saúde, caso necessário'));
  st.push(A('Analisar o contexto para possíveis encaminhamentos à rede municipal'));
  const ac = [A('Contato e procedimentos SEAS/CPAS de acolhimento',['156','CPAS'])];
  if (S.acomp==='sim') ac.push(SIM('Se o adulto que acompanha for o(a) autor(a)/suspeito(a) da violência, ele(a) será acolhido(a) separadamente'));
  const fim = CTMP('. Se houver inserção no PPCAAM, informar também a Defensoria Pública e a Vara da Infância e Juventude');
  fim.c = ['CT','MP','PPCAAM','DEF','VIJ'];
  st.push(...br(S.necessita,'Necessita de acolhimento?',[...ac, fim],[fim]));
  return {id:'sexual', t:'Violência e exploração sexual', pag:'p. 7', st};
}
function fluxoSaude(){
  const st=[];
  if (S.emerg==='sim') st.push(PRIO('Caso de urgência: chamar o SAMU e aguardar',['SAMU']));
  if (S.agente!=='eCR'){
    st.push(A('Acionar a eCR ou a UBS do território',['ECR','UBS']));
    if (S.agente==='SEAS') st.push(SIM('Analisar o contexto para possíveis encaminhamentos à rede municipal (em paralelo)'));
    st.push(WHO('Os próximos passos de atendimento são da eCR/UBS.'));
  }
  st.push(A('Promover o atendimento conforme os procedimentos adequados'));
  st.push(A('Notificar o Conselho Tutelar, enviando relatório sobre as condições de saúde e o atendimento',['CT']));
  st.push(A('Analisar o contexto para possíveis encaminhamentos à rede municipal'));
  st.push(...br(S.necessita,'Necessita de acolhimento?',
    [A('Contatar SEAS/CPAS e aguardar a chegada',['156','SEAS','CPAS']), A('Procedimentos SEAS/CPAS'), REL()],
    [REL()]));
  if (S.sit.has('enfermidade')) st.push({k:'n',txt:'Tabela de riscos: se houver recusa de atendimento em caso de enfermidade, notificar a VIJ.',c:['VIJ']});
  return {id:'saude', t:'Comprometimento de saúde', pag:'p. 8', st};
}
function fluxoAto(){
  const st=[];
  const seas = [A('Analisar o contexto individual para possíveis encaminhamentos à rede municipal'),
    ...br(S.necessita,'Necessita de acolhimento?',
      [A('Procedimento SEAS/CPAS de acolhimento',['156','CPAS']), REL()],
      [REL()])];
  if (S.agente==='GCM'){
    st.push(A('Adotar as medidas legais pertinentes',['POL']));
    if (S.idade==='crianca'){ st.push({k:'n',txt:'É criança.'}); st.push(A('Acionar o SEAS',['156','SEAS'])); st.push(WHO('Depois da chegada, o SEAS segue os passos abaixo.')); st.push(...seas); }
    else if (S.idade==='adolescente'){ st.push({k:'n',txt:'É adolescente.'}); st.push(A('Acionar a autoridade policial e informar a situação de rua do(a) adolescente e as ofertas de políticas públicas disponíveis, como o acolhimento socioassistencial',['POL'])); }
  } else if (S.agente==='eCR'){
    st.push(GAP('O fluxograma de ato infracional não prevê nenhuma ação para a eCR. O protótipo sugere acionar o SEAS, mas isso precisa ser validado.'));
    st.push(A('Acionar o SEAS',['156','SEAS']));
  } else st.push(...seas);
  return {id:'ato', t:'Ato infracional', pag:'p. 9', st};
}
function fluxoAmeaca(){
  const st=[];
  if (S.agente!=='SEAS'){
    st.push(A('Acionar SEAS/CPAS via 156 e aguardar a chegada',['156','SEAS','CPAS']));
    if (S.agente==='GCM') st.push(SIM('Caso necessário ou solicitado, permanecer e acompanhar o atendimento para garantir a segurança'));
    st.push(WHO('Depois da chegada, o SEAS segue os passos abaixo.'));
  }
  st.push(A('Analisar o contexto individual, avaliando riscos e alternativas'));
  const fim = CTMP('. Se houver inserção no PPCAAM, informar também a Defensoria Pública e a Vara da Infância e Juventude');
  fim.c=['CT','MP','PPCAAM','DEF','VIJ'];
  st.push(...br(S.necessita,'Necessita de acolhimento?',
    [A('Procedimento SEAS/CPAS de acolhimento',['156','CPAS']), SIM('Se necessário, acionar o PPCAAM (Programa de Proteção a Crianças e Adolescentes Ameaçados de Morte)',['PPCAAM']), fim],
    [fim]));
  return {id:'ameaca', t:'Ameaça de morte', pag:'p. 10', st};
}

/* Fluxo geral sem as etapas de acolhimento e risco, que ficam no fluxo único */
function geralSemAcolhimento(){
  const ag=S.agente, st=[], acomp=S.acomp==='sim';
  const ref = {k:'n',txt:'Acolhimento e avaliação de risco: seguir o fluxo único acima.'};
  if (acomp){
    if (ag==='SEAS') st.push(A('Apresentar a importância do acesso ao acolhimento e aos demais serviços'), ref);
    else if (ag==='eCR'){
      st.push(A('Apresentar os serviços da rede'), A('Acionar o SEAS e aguardar',['156','SEAS']));
      st.push({k:'if',cond:'O SEAS está impossibilitado, ou é impossível aguardar no local?',
        yes:[A('Acionar e encaminhar ao CREAS',['CREAS']), A('Ações do CREAS/Centro POP',['CREAS','POP'])], no:[A('Seguir o procedimento SEAS',['SEAS'])]});
    } else st.push(A('Acionar o SEAS e aguardar sua chegada',['156','SEAS']));
  } else if (ag==='SEAS'){
    st.push(...br(S.desap,'É desaparecimento?',[A('Acionar e encaminhar ao CREAS para avaliação de outras violações',['CREAS']), CTMP()],
      br(S.evasao,'É evasão de SAICA?',[A('Contatar a Central de Vagas para retorno ao SAICA de origem',['CV','CPAS']), CTMP()],[ref])));
  } else if (ag==='eCR'){
    st.push(...br(S.desap,'É desaparecimento?',[A('Contatar o SEAS e/ou encaminhar ao CREAS para avaliação de outras violações',['SEAS','156','CREAS']), CTMP()],
      [A('Informar sobre a importância do acolhimento e apresentar a rede'), ref]));
  } else {
    const hc = horarioComercial();
    st.push(...br(S.desap,'É desaparecimento?',[A('Contatar o SEAS e/ou encaminhar ao CREAS para avaliação de outras violações',['SEAS','156','CREAS']), CTMP()],
      br(hc===null?null:(hc?'sim':'nao'),'Está em horário comercial?',
        [A('Acionar o SEAS e/ou encaminhar ao CREAS',['156','SEAS','CREAS'])],
        [A('Contatar o CPAS e aguardar a chegada',['156','CPAS']), A('Procedimentos SEAS/CPAS')])));
  }
  return {id:'geral', t: acomp?'Fluxo geral · acompanhado(a)':'Fluxo geral · desacompanhado(a)', pag:'p. 5', st, par:true};
}
/* Passos próprios de cada fluxo específico (o que não é comum aos demais) */
function especifico(id){
  const st=[], ag=S.agente;
  if (id==='saude'){
    if (ag!=='eCR'){ st.push(A('Acionar a eCR ou a UBS do território',['ECR','UBS'])); st.push(WHO('Os próximos passos de atendimento são da eCR/UBS.')); }
    st.push(A('Promover o atendimento conforme os procedimentos adequados'));
    st.push(A('Notificar o Conselho Tutelar, enviando relatório sobre as condições de saúde e o atendimento',['CT']));
    if (S.sit.has('enfermidade')) st.push({k:'n',txt:'Tabela de riscos: se houver recusa de atendimento em caso de enfermidade, notificar a VIJ.',c:['VIJ']});
    return {id, t:'Comprometimento de saúde', pag:'p. 8', st, par:true};
  }
  if (id==='sexual'){
    if (ag==='GCM') st.push(SIM('Adotar medidas legais em relação ao(à) autor(a)/suspeito(a) da violência, se houver',['POL']));
    if (ag==='eCR') st.push(A('Efetuar atendimento de saúde, caso necessário'));
    if (S.acomp==='sim') st.push(SIM('Se o adulto que acompanha for o(a) autor(a)/suspeito(a) da violência, ele(a) será acolhido(a) separadamente'));
    if (!st.length) st.push({k:'n',txt:'Sem passos próprios além do fluxo único.'});
    return {id, t:'Violência e exploração sexual', pag:'p. 7', st, par:true};
  }
  if (id==='ameaca'){
    if (ag==='GCM') st.push(SIM('Caso necessário ou solicitado, permanecer e acompanhar o atendimento para garantir a segurança'));
    st.push(SIM('Se houver acolhimento e for necessário, acionar o PPCAAM (Programa de Proteção a Crianças e Adolescentes Ameaçados de Morte)',['PPCAAM']));
    return {id, t:'Ameaça de morte', pag:'p. 10', st, par:true};
  }
  if (id==='drogas'){
    st.push(A('Se não houver acolhimento: acionar os demais equipamentos do caso e traçar estratégias, em especial CAPS, eCR e SEAS',['CAPS','ECR','SEAS']));
    return {id, t:'Álcool e outras drogas', pag:'p. 6', st, par:true};
  }
  if (id==='ato'){
    if (ag==='GCM'){
      st.push(A('Adotar as medidas legais pertinentes',['POL']));
      if (S.idade==='adolescente') st.push({k:'n',txt:'É adolescente.'}, A('Acionar a autoridade policial e informar a situação de rua do(a) adolescente e as ofertas de políticas públicas disponíveis, como o acolhimento socioassistencial',['POL']));
      else st.push({k:'n',txt:'É criança.'});
    } else if (ag==='eCR') st.push(GAP('O fluxograma de ato infracional não prevê nenhuma ação para a eCR. O protótipo sugere acionar o SEAS, mas isso precisa ser validado.'));
    else st.push({k:'n',txt:'Sem passos próprios além do fluxo único.'});
    return {id, t:'Ato infracional', pag:'p. 9', st, par:true};
  }
}
/* Fluxo único: etapas que se repetem nos fluxogramas (acionar SEAS, avaliação do abordador, acolhimento, notificações) */
function fluxoUnico(ids){
  const st=[], ag=S.agente, has=x=>ids.includes(x);
  if (S.emerg==='sim') st.push(PRIO('Caso de urgência: chamar o SAMU e aguardar',['SAMU']));
  const precisaSEAS = ag!=='SEAS' && (has('sexual')||has('ameaca')||(has('drogas')&&ag==='GCM')||(has('ato')&&(ag==='eCR'||(ag==='GCM'&&S.idade==='crianca'))));
  if (precisaSEAS){ st.push(A('Acionar SEAS/CPAS via 156 e aguardar a chegada',['156','SEAS','CPAS'])); st.push(WHO('Depois da chegada, o SEAS segue os passos abaixo.')); }
  st.push(A('Avaliação do abordador: analisar o contexto individual, avaliando riscos e alternativas, para possíveis encaminhamentos à rede municipal'));
  st.push(...br(S.necessita,'Necessita de acolhimento?',
    [A('Contatar e seguir o procedimento SEAS/CPAS de acolhimento',['156','CPAS'])],
    [{k:'n',txt:'Sem acolhimento: seguir os fluxos específicos abaixo.'}]));
  const fim = CTMP(has('sexual')||has('ameaca') ? '. Se houver inserção no PPCAAM, informar também a Defensoria Pública e a Vara da Infância e Juventude' : '');
  if (has('sexual')||has('ameaca')) fim.c=['CT','MP','PPCAAM','DEF','VIJ'];
  st.push(fim);
  if (has('saude')||has('ato')) st.push(REL());
  return {id:'unico', t:'Fluxo único · etapas em comum', pag:'p. 5–10', st};
}

function montarFluxos(){
  const gaps=[];
  const esp = [];
  if (S.emerg==='sim' || S.sit.has('enfermidade')) esp.push('saude');
  if (S.sit.has('viol_sexual') || S.sit.has('explor_sexual')) esp.push('sexual');
  if (S.sit.has('ameaca')) esp.push('ameaca');
  if (S.sit.has('spa_crianca')) esp.push('drogas');
  if (S.sit.has('ato')) esp.push('ato');
  const semFluxo = ['viol_fis_p','viol_fis_s','viol_psico','trabalho'].filter(k=>S.sit.has(k));
  let geral = S.flag!=='sim';
  if (S.flag==='sim' && !esp.length){
    gaps.push('Há flagrante, mas as situações marcadas não têm fluxograma específico no protocolo. Por isso, o protótipo aplicou o fluxo geral.');
    geral = true;
  }
  let F;
  if (!esp.length) F = [fluxoGeral()];                                   // nenhum fluxo específico: fluxo padrão
  else if (esp.length===1 && !geral) F = [{saude:fluxoSaude,sexual:fluxoSexual,ameaca:fluxoAmeaca,drogas:fluxoDrogas,ato:fluxoAto}[esp[0]]()];
  else {                                                                  // vários fluxos: etapas em comum num só e o restante em paralelo
    F = [fluxoUnico(esp), ...esp.map(especifico)];
    if (geral) F.push(geralSemAcolhimento());
    gaps.push('Fluxo único montado pelo protótipo: as etapas que se repetem nos fluxogramas do protocolo (acionar SEAS/CPAS, avaliação do abordador, acolhimento e notificações) foram reunidas num só bloco. Essa unificação não está no protocolo e precisa ser validada.');
  }
  if (semFluxo.length) gaps.push(`O protocolo não tem fluxograma específico para: ${semFluxo.map(k=>RISCO[k].l.toLowerCase()).join(', ')}. Elas entram na pontuação de risco e nas ofertas do Guia (FL04/FL09).`);
  return {F, gaps};
}

/* ---------- Necessidades (camada Guia de Ofertas) ---------- */
function necessidades(){
  const n = new Map();
  const add = (id, why) => { if (!NEC[id]) return; (n.get(id) || n.set(id, new Set()).get(id)).add(why); };
  if (S.rua==='sim' || (protocolo() && S.rua!=='nao')) add('N08', ehAdulto() ? 'Pessoa em situação de rua' : 'Criança/adolescente em situação de rua');
  const map = {fora_escola:'N01', sem_doc:'N15', sem_vacina:'N02', trabalho:'N09', recusa_pais:'N05', pais_spa:'N05', hist_acolh:'N05',
    viol_psico:'N06', viol_fis_p:'N06', viol_fis_s:'N06', viol_sexual:'N06', explor_sexual:'N06', spa_crianca:'N23', enfermidade:'N02', ato:'N27', ameaca:'N21'};
  S.sit.forEach(k => map[k] && add(map[k], RISCO[k]?.l || NAO_PONTUADAS[k]));
  if (S.sit.has('ato')) add('N10','Ato infracional');
  if (ehCrianca() && S.acomp==='nao') add('N05', S.idade==='crianca' ? 'Criança sem vigilância' : 'Adolescente desacompanhado');
  if (S.desap==='sim') add('N22','Desaparecimento');
  if (S.emerg==='sim') add('N02','Urgência de saúde');
  if (S.deseja==='sim' || S.necessita==='sim' || S.evasao==='sim') add('N07','Acolhimento');
  S.outras.forEach(k => OUTRAS[k] && add(OUTRAS[k].n, OUTRAS[k].l));
  if (ehAdulto()){ if (S.perfil.has('pcd')) add('N13','Pessoa com deficiência'); if (S.perfil.has('gestante')) add('N24','Gestação'); if (S.perfil.has('imigr')) add('N15','Imigrante ou refugiada'); }
  return n;
}
function fluxosGuia(nec){
  const ids = new Set();
  nec.forEach((_,id) => (NEC[id].fluxos||[]).forEach(f => {
    if (f==='FL01' && S.idade==='adolescente') return;
    if (f==='FL02' && S.idade==='crianca') return;
    if (f==='FL18' && !(nec.has('N03') && nec.has('N01'))) return;
    ids.add(f);
  }));
  if (nec.size >= 4) ids.add('FL20');
  return [...ids].filter(f=>FLU[f]);
}

/* ---------- Unidades por território ---------- */
function unidades(of){
  const all = byOf[of] || [];
  const noDist = S.dist ? all.filter(u=>u.dist===S.dist) : [];
  const noSub = all.filter(u=>u.sub===S.sub && !(S.dist && u.dist===S.dist));
  const semTerr = all.filter(u=>!u.sub);
  return {all, noDist, noSub, semTerr};
}
const NA = t => `<span class="na">${esc(t)} não disponível</span>`;
function telHTML(u){
  if (!u.tel || /^n[ãa]o possui/i.test(u.tel)) return NA('Telefone');
  const nums = u.tel.split(/\s*\/\s*|\s+cel\.?:?\s*/i).filter(Boolean);
  let h = nums.map(x=>{const d=x.replace(/[^\d]/g,''); return d.length>=3?`<a href="tel:${d}">${esc(x.trim())}</a>`:esc(x);}).join(' · ');
  const flags=[];
  if (u.telN >= 10) flags.push(`Este mesmo número aparece em ${u.telN} unidades. Provavelmente é uma central, não a linha da unidade.`);
  if (/\(\s*\)/.test(u.tel)) flags.push('O número está sem DDD.');
  return h + flags.map(f=>`<span class="warn">${esc(f)}</span>`).join('');
}
function unitHTML(u){
  const end = u.end ? esc(u.end)+(u.col?'':(u.num?', '+esc(u.num):', '+'<span class="na">nº não disponível</span>')) : NA('Endereço');
  const terr = [u.dist||'<span class="na">distrito não disponível</span>', u.sub ? esc(u.sub)+(u.subDer?' <span class="warn-i">(inferida pelo distrito)</span>':'') : '<span class="na">subprefeitura não disponível</span>'].join(' / ');
  return `<li class="unit">
    <div class="u-nome">${esc(u.nome)}</div>
    <div class="u-row"><span class="k">Endereço</span><span>${end}</span></div>
    <div class="u-row"><span class="k">CEP</span><span>${u.cep?esc(u.cep):NA('CEP')}</span></div>
    <div class="u-row"><span class="k">Território</span><span>${terr}</span></div>
    <div class="u-row"><span class="k">Telefone</span><span>${telHTML(u)}</span></div>
    <div class="u-row"><span class="k">Horário</span><span>${u.hor?esc(u.hor):NA('Horário')}</span></div>
    <div class="u-row"><span class="k">E-mail</span><span>${u.email?`<a href="mailto:${esc(u.email)}">${esc(u.email)}</a>`:NA('E-mail')}</span></div>
    ${fonteHTML(u)}
    <div class="u-foot"><span class="st ${u.status==='NÃO CONFIRMADO'?'st-bad':''}">${esc(u.status||'Status não informado')}</span>${u.site?` <a class="src" href="${esc(u.site)}" target="_blank" rel="noopener">fonte oficial</a>`:''} <span class="uid">${esc(u.id)}</span></div>
  </li>`;
}
function fonteHTML(u){
  if (!u.col) return `<div class="u-src">Fonte: Banco Mestre V0.8 (planilha). Não encontrada nas páginas oficiais lidas.</div>`;
  const c = u.col;
  const extra = [c.gestao?`Gestão: ${esc(c.gestao)}`:'', c.vagas_noturnas?`${c.vagas_noturnas} vagas de acolhimento noturno`:''].filter(Boolean).join(' · ');
  const fontes = c.fontes.map(f=>`<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.secretaria||'')} · ${esc(f.titulo||'página oficial')}</a> (atualizada pela secretaria em ${fdata(f.data_pagina)||'data não informada'}; lida em ${fdata(f.data_aquisicao)})`).join('<br>');
  const conf = (c.conflitos||[]).map(k=>`<span class="warn">Fontes oficiais divergem no ${esc(k.campo.toLowerCase())}: ${k.valores.map(v=>`<b>${esc(v.valor)}</b> (${esc(v.fonte)}, ${fdata(v.data)||'s/ data'})`).join(' × ')}. O app mostra o da publicação mais recente.</span>`).join('');
  const al = (c.alertas||[]).map(a=>`<span class="warn">Como publicado: ${esc(a)}</span>`).join('');
  return `${extra?`<div class="u-row"><span class="k">Informações</span><span>${extra}</span></div>`:''}<div class="u-src ok">Fonte: ${fontes}</div>${conf}${al}`;
}
function unidadesHTML(ofs, limit=4){
  let h='';
  ofs.forEach(of=>{
    const r = unidades(of), nome = OFE[of]?.nome || of;
    if (!r.all.length){ h+=`<div class="gapbox"><b>${esc(nome)}</b>: nenhuma unidade cadastrada no Banco Mestre.</div>`; return; }
    const loc = [...r.noDist, ...r.noSub];
    if (ofs.length>1) h+=`<h5>${esc(nome)}</h5>`;
    if (!loc.length){
      h+=`<div class="gapbox">Nenhuma unidade de ${esc(nome)} está cadastrada em ${esc(S.dist||S.sub)}. Há ${r.all.length} na cidade, e ${r.semTerr.length} delas estão sem território cadastrado.</div>`;
      if (r.semTerr.length) h+=`<details class="more"><summary>Ver ${r.semTerr.length} unidades sem território (uma delas pode atender a região)</summary><ul class="units">${r.semTerr.map(unitHTML).join('')}</ul></details>`;
      return;
    }
    const note = [];
    if (S.dist) note.push(`${r.noDist.length} no distrito ${esc(S.dist)}`);
    note.push(`${r.noSub.length} ${S.dist?'em outros distritos da':'na'} subprefeitura ${esc(S.sub)}`);
    if (r.semTerr.length) note.push(`<span class="na-i">${r.semTerr.length} na cidade sem território cadastrado</span>`);
    h+=`<p class="cnt">${note.join(' · ')}</p><ul class="units">${loc.slice(0,limit).map(unitHTML).join('')}</ul>`;
    if (loc.length>limit) h+=`<details class="more"><summary>Ver mais ${loc.length-limit}</summary><ul class="units">${loc.slice(limit).map(unitHTML).join('')}</ul></details>`;
  });
  return h;
}
function contatoHTML(key){
  const c = CONTATOS[key];
  let h = `<section class="contact" id="ct-${key}"><h4>${esc(c.t)}</h4>`;
  if (c.tel) h += `<p class="bigtel"><a href="tel:${c.tel}">${c.tel}</a>${c.ext?' <span class="warn-i">fora do Banco Mestre</span>':''}</p>`;
  if (c.nota) h += `<p class="cnote">${esc(c.nota)}</p>`;
  if (c.na) h += `<div class="gapbox">Telefone, endereço e horário não disponíveis.</div>`;
  if (c.of) h += unidadesHTML(c.of, key==='UBS'?3:4);
  if (c.fonte) h += `<p class="src-l">Fonte: ${esc(c.fonte)}</p>`;
  return h + '</section>';
}

/* ---------- Render de passos ---------- */
const CHIP = c => c.map(k=>`<a class="chip" href="#ct-${k}">${esc(CONTATOS[k].t)}</a>`).join('');
let SEEN=new Set();
function passosHTML(st){
  return '<ol class="steps">' + st.map(p=>{
    if (p.k==='if') return `<li class="s-if"><div class="ifq">${esc(p.cond)}</div>
      <div class="branches"><div class="br"><span class="bl">Se sim</span>${passosHTML(p.yes)}</div><div class="br"><span class="bl">Se não</span>${passosHTML(p.no)}</div></div></li>`;
    const dup = p.k==='a' && SEEN.has(p.txt); if (p.k==='a') SEEN.add(p.txt);
    const lab = {a:'Ação', sim:'Ao mesmo tempo', gap:'Lacuna do protocolo', prio:'Prioridade', n:'Norteador', fim:'Desfecho', who:'Responsável'}[p.k];
    return `<li class="s-${p.k}${dup?' dup':''}"><span class="sl">${lab}${dup?' · já indicada em outro fluxo':''}</span><span class="stx">${esc(p.txt)}</span>${p.c&&p.c.length?`<span class="chips">${CHIP(p.c)}</span>`:''}</li>`;
  }).join('') + '</ol>';
}

/* ---------- Telas do assistente ---------- */
const opt = (k,v,l,sub='') => `<button type="button" class="opt ${S[k]===v?'on':''}" data-k="${k}" data-v="${v}"><span>${l}</span>${sub?`<small>${sub}</small>`:''}</button>`;
const chk = (set,k,l,sub='',dis=false) => `<label class="chk ${dis?'dis':''}"><input type="checkbox" data-set="${set}" value="${k}" ${S[set].has(k)?'checked':''} ${dis?'disabled':''}><span><b>${l}</b>${sub?`<small>${sub}</small>`:''}</span></label>`;

const SCREENS = [
 {t:'Há risco à vida ou urgência de saúde agora?', ok:()=>S.emerg, r:()=>`
   <div class="opts two">${opt('emerg','sim','Sim','Sangramento, inconsciência, crise, ferimento grave')}${opt('emerg','nao','Não')}</div>
   ${S.emerg==='sim'?`<div class="samu"><p>Ligue para o SAMU agora e aguarde.</p><a href="tel:192">192</a><small>O número é nacional. O SAMU consta no Banco Mestre (OF052), mas sem telefone cadastrado.</small></div>`:''}`},
 {t:'Quem está atendendo?', ok:()=>S.agente && (S.agente!=='OUTRO' || S.orgao), r:()=>`<div class="opts">
   ${opt('agente','SEAS','SEAS','Serviço Especializado de Abordagem Social · SMADS')}
   ${opt('agente','eCR','eCR','Equipe de Consultório na Rua · SMS')}
   ${opt('agente','GCM','GCM','Guarda Civil Metropolitana · SMSU')}
   ${opt('agente','OUTRO','Outro órgão ou serviço','Conselho Tutelar, Vara da Infância, Judiciário, MP, Defensoria, Escola, UBS ou procura espontânea')}</div>
   ${S.agente==='OUTRO'?`<label class="fld">Qual?<select id="orgao"><option value="">Escolha o órgão ou serviço</option>${G.orgaos.map(o=>`<option value="${o.id}" ${S.orgao===o.id?'selected':''}>${esc(o.nome==='Munícipe'?'Munícipe (procura espontânea)':o.nome)}</option>`).join('')}</select></label>
   <p class="hint">Para esses órgãos, a orientação vem do Guia de Ofertas consolidado. Os fluxogramas do Protocolo Integrado são das equipes de abordagem (SEAS, eCR e GCM).</p>`:''}`},
 {t:'Onde e quando?', ok:()=>S.sub, r:()=>{
   const subs = Object.keys(D.terr);
   const hc = horarioComercial();
   return `<label class="fld">Subprefeitura<select id="sub">${subs.map(s=>`<option ${s===S.sub?'selected':''}>${esc(s)}</option>`).join('')}</select></label>
   <label class="fld">Distrito<select id="dist"><option value="">Não sei o distrito</option>${D.terr[S.sub].map(d=>`<option ${d===S.dist?'selected':''}>${esc(d)}</option>`).join('')}</select></label>
   <label class="fld">Data e hora<input type="datetime-local" id="dt" value="${S.dt}"></label>
   <p class="hint">${hc===null?'Informe a data e a hora.':hc?'Está em horário comercial.':'Está fora do horário comercial.'} O protótipo considera horário comercial de segunda a sexta, das 8h às 18h. O protocolo não define esse horário.</p>
   ${S.sub!=='Sé'?`<p class="hint warnline">O território-piloto é a Sé. As outras subprefeituras estão marcadas como "Expansão" no Banco Mestre, com cobertura parcial.</p>`:''}`}},
 {t:'Quem está sendo atendido?', ok:()=>S.idade && S.rua && S.desap && (ehAdulto() || (S.acomp && S.evasao)), r:()=>`
   <h3 class="q">Idade</h3><div class="opts three">${opt('idade','crianca','Criança','Até 11 anos')}${opt('idade','adolescente','Adolescente','De 12 a 17 anos')}${opt('idade','adulto','Adulto(a)','18 anos ou mais')}</div>
   <p class="hint">O corte segue o ECA, art. 2º. ${ehAdulto()?'O Protocolo Integrado e a graduação de risco são para crianças e adolescentes. Para adultos, vale o Guia de Ofertas consolidado (escopo ampliado).':''}</p>
   ${ehCrianca()?`<h3 class="q">Está com um adulto responsável?</h3><div class="opts two">${opt('acomp','sim','Acompanhado(a)')}${opt('acomp','nao','Desacompanhado(a)')}</div>`:''}
   ${ehCrianca()&&S.acomp==='sim'?`<h3 class="q">Perfil do adulto que acompanha</h3><p class="hint">Marque o que se aplica. Define se entra também o fluxo de mulher com criança, gestante, pessoa com deficiência etc.</p>${Object.entries(PERFIL).filter(([k])=>k!=='comcria').map(([k,l])=>chk('perfil',k,l)).join('')}`:''}
   ${ehAdulto()?`<h3 class="q">Perfil</h3><p class="hint">Marque o que se aplica. Define qual fluxo do Guia de Ofertas vale.</p>${Object.entries(PERFIL).map(([k,l])=>chk('perfil',k,l)).join('')}`:''}
   ${S.idade?`<h3 class="q">Está em situação de rua (usa a rua como moradia)?</h3><div class="opts three">${opt('rua','sim','Sim')}${opt('rua','nao','Não')}${opt('rua','nsei','Não sei')}</div>
   <h3 class="q">É desaparecimento?</h3><div class="opts three">${opt('desap','sim','Sim')}${opt('desap','nao','Não')}${opt('desap','nsei','Não sei')}</div>`:''}
   ${ehCrianca()?`<h3 class="q">Evadiu de um SAICA?</h3><div class="opts three">${opt('evasao','sim','Sim')}${opt('evasao','nao','Não')}${opt('evasao','nsei','Não sei')}</div>`:''}`},
 {t:'Você está presenciando agora violência, abuso, perigo ou uso de álcool e drogas?', show:()=>protocolo(), ok:()=>S.flag, r:()=>`
   <div class="opts two">${opt('flag','sim','Sim, é flagrante')}${opt('flag','nao','Não é flagrante')}</div>
   <p class="hint">No protocolo, quando há flagrante, valem os fluxos específicos. Quando não há, vale o fluxo geral de acompanhado/desacompanhado.</p>`},
 {t:'O que você está identificando?', ok:()=>true, r:()=>
   (ehCrianca() ? GRUPOS.map(([g,ks])=>`<fieldset class="grp"><legend>${g}</legend>${ks.map(k=>{
     const r=RISCO[k]; const sub = r ? `${r.g}${r.p?` · ${r.p} ponto${r.p>1?'s':''}`:' · intervenção imediata'}` : 'Não pontua na tabela de riscos; aciona fluxo específico';
     return chk('sit',k,r?r.l:NAO_PONTUADAS[k],sub);}).join('')}</fieldset>`).join('') : '')
   + `<fieldset class="grp"><legend>${ehCrianca()?'Outras necessidades do Guia de Ofertas':'Necessidades identificadas'}</legend>${ehCrianca()?'<p class="hint">Não pontuam no risco. Servem para indicar o fluxo e a rede do território.</p>':''}${Object.entries(OUTRAS).filter(([k,o])=>ehAdulto() ? (o.adulto || ['mental','fome'].includes(k)) : (!o.adulto && (!o.adol||S.idade!=='crianca'))).map(([k,o])=>chk('outras',k,o.l)).join('')}</fieldset>`
   + `<p class="hint">${ehCrianca()&&S.acomp==='nao'?(S.idade==='crianca'?'Como a criança está desacompanhada, entra automaticamente o item "Criança sem vigilância de responsável" (intervenção imediata).':'Como o adolescente está desacompanhado, entra automaticamente o item "Adolescente desacompanhado" (3 pontos).'):''}</p>`},
 {t:'Há fatores de proteção?', show:()=>ehCrianca(), ok:()=>true, r:()=>{
   const k = calcRisco();
   return `<p class="hint">Cada fator reduz 1 ponto. O protótipo não aplica redução quando há item de intervenção imediata. Isso é uma premissa a validar.</p>
   ${Object.entries(ATEN).map(([id,a])=>chk('prot',id,a.l, a.x&&S.sit.has(a.x)?`Contradiz "${RISCO[a.x].l}"`:'−1 ponto', a.x&&S.sit.has(a.x))).join('')}
   <div class="live ${k.cls}">Risco calculado agora: <b>${k.nivel}</b> (${k.final} pontos${k.imed.length?', com intervenção imediata':''})</div>`}},
 {t:'Avaliação da equipe', show:()=>protocolo(), ok:()=>S.deseja&&S.necessita&&S.risco, r:()=>{
   const k = calcRisco(); const sug = k.cls==='n2'||k.cls==='n3';
   return `<h3 class="q">A criança ou o adolescente deseja acolhimento?</h3><div class="opts three">${opt('deseja','sim','Deseja')}${opt('deseja','nao','Não deseja')}${opt('deseja','nsei','Não foi possível saber')}</div>
   <h3 class="q">Na avaliação técnica, necessita de acolhimento?</h3><div class="opts three">${opt('necessita','sim','Necessita')}${opt('necessita','nao','Não necessita')}${opt('necessita','avaliar','Ainda avaliando')}</div>
   <h3 class="q">Existe risco ou prejuízo ao desenvolvimento?</h3><div class="opts two">${opt('risco','sim','Sim')}${opt('risco','nao','Não')}</div>
   <p class="hint">O risco calculado pela tabela é <b>${k.nivel}</b>. ${sug?'Esse nível sugere "Sim".':'Esse nível não obriga "Sim".'} A decisão é da equipe. O protocolo não liga a pontuação a esta pergunta.</p>
   <p class="hint">O art. 19 do ECA diz que o acolhimento institucional é excepcional e breve.</p>`}},
];
const telas = () => SCREENS.filter(x => !x.show || x.show());

function render(){
  document.documentElement.dataset.agent = S.agente || '';
  const T = telas();
  if (step >= T.length) return renderResult();
  const sc = T[step];
  $('#app').innerHTML = `<div class="prog">${T.map((_,i)=>`<span class="${i<step?'done':i===step?'cur':''}"></span>`).join('')}</div>
    <h2 class="qt">${esc(sc.t)}</h2><div class="body">${sc.r()}</div>
    <div class="nav">${step?'<button class="ghost" id="back">Voltar</button>':'<span></span>'}<button id="next" ${sc.ok()?'':'disabled'}>${step===T.length-1?'Ver procedimento':'Continuar'}</button></div>`;
  bind();
  window.scrollTo({top:0,behavior:'instant'});
}
function bind(){
  document.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{S[b.dataset.k]=b.dataset.v; if(b.dataset.k==='agente' && b.dataset.v!=='OUTRO') S.orgao=null; render();});
  const og=$('#orgao'); if(og) og.onchange=()=>{S.orgao=og.value||null; render();};
  document.querySelectorAll('[data-set]').forEach(c=>c.onchange=()=>{const s=S[c.dataset.set]; c.checked?s.add(c.value):s.delete(c.value); const y=window.scrollY; render(); window.scrollTo({top:y,behavior:'instant'});});
  const sub=$('#sub'); if(sub) sub.onchange=()=>{S.sub=sub.value; S.dist=''; render();};
  const di=$('#dist'); if(di) di.onchange=()=>{S.dist=di.value; render();};
  const dt=$('#dt'); if(dt) dt.onchange=()=>{S.dt=dt.value; render();};
  const n=$('#next'); if(n) n.onclick=()=>{step++; render();};
  const b=$('#back'); if(b) b.onclick=()=>{step--; render();};
}

/* ---------- Guia de Ofertas consolidado: cartão por público ---------- */
const CAMPOS_G = [['risco','Risco imediato'],['porta','Porta de entrada'],['referencia','Serviço de referência'],['articulados','Serviços articulados'],
  ['encaminhamentos','Encaminhamentos'],['proximo','Próximo passo'],['contra','Contrarreferência'],['base','Base normativa']];
const ORGAO_OFS = ['OF022','OF032','OF033','OF034'];                 // ofertas que são o próprio órgão solicitante
function nomeTag(t){ return t?.startsWith('FL') ? (FLU[t]?.situacao||'') : t?.startsWith('OF') ? (OFE[t]?.nome||'') : t?.startsWith('N') ? (NEC[t]?.nome||'') : ''; }
function segsDo(n, campo){
  if (!['encaminhamentos','porta'].includes(campo)) return n.campos[campo];
  const po = n.por_orgao;
  if (S.orgao && po[S.orgao]) return po[S.orgao][campo];
  const listas = Object.values(po).map(x=>x[campo].map(g=>JSON.stringify(g)));
  return listas.length ? listas[0].filter(g=>listas.every(l=>l.includes(g))).map(g=>JSON.parse(g)) : n.campos[campo];
}
function segHTML(g){
  const pend = /^(PENDENTE|A VALIDAR)/.test(g.texto) || /PENDENTE —|A VALIDAR —/.test(g.texto);
  return `<li>${g.tag?`<span class="tag" title="${esc(nomeTag(g.tag))}">${esc(g.tag)}</span> `:''}${pend?`<span class="na">${esc(g.texto)}</span>`:esc(g.texto)}</li>`;
}
function nucleoHTML({p, por}){
  const n = NUC[p], st = (n.status||'').toLowerCase().replace(/\s/g,'-');
  const po = S.orgao ? n.por_orgao[S.orgao] : null;
  const ofsUnid = n.ofertas.filter(o=>!ORGAO_OFS.includes(o) && (byOf[o]||[]).length);
  const ofsSem = n.ofertas.filter(o=>!ORGAO_OFS.includes(o) && !(byOf[o]||[]).length);
  return `<article class="gcard">
    <header><h4>${esc(p)}</h4><span class="badge st-${st}">${esc(n.status)}</span></header>
    <p class="why">Fluxo escolhido porque: ${esc(por)}.</p>
    <div class="u-row"><span class="k">Necessidade</span><span>${n.necessidades.map(x=>`<span class="tag" title="${esc(nomeTag(x))}">${x}</span> ${esc(NEC[x]?.nome||'')}`).join(' · ') || esc(n.necessidade_txt||'')}</span></div>
    <div class="u-row"><span class="k">Fluxo</span><span>${n.fluxos.length?n.fluxos.map(f=>`<span class="tag">${f}</span> ${esc(FLU[f]?.situacao||'')}`).join(' · '):'<span class="na">Sem fluxo específico no Banco Mestre</span>'}</span></div>
    ${S.agente==='OUTRO' ? `<div class="g-ini"><h5>Orientação inicial para ${esc(ORG[S.orgao]||'')}</h5>${po&&po.fluxo_inicial?`<p>${esc(po.fluxo_inicial)}</p><p class="src-l">Texto original da planilha, registro ${esc(po.registro)} (aba ${esc(po.orgao)}, linha ${esc(po.linha)}).</p>`:`<div class="gapbox">A planilha não tem fluxo para ${esc(ORG[S.orgao]||'este órgão')} neste público. O restante do fluxo abaixo é o mesmo para todos os órgãos.</div>`}</div>` : ''}
    <h5 class="passos-t">Passo a passo</h5>
    <ol class="steps">${CAMPOS_G.filter(([c])=>c!=='base').map(([c,l])=>{const gs=segsDo(n,c); return `<li class="s-a"><b>${l}</b>${gs.length?`<ul>${gs.map(segHTML).join('')}</ul>`:`<div>${NA(l)}</div>`}</li>`}).join('')}</ol>
    ${(()=>{const gs=segsDo(n,'base'); return `<div class="g-campo"><h5>Base normativa</h5>${gs.length?`<ul>${gs.map(segHTML).join('')}</ul>`:NA('Base normativa')}</div>`})()}
    ${n.nao_mapeados.length?`<div class="gapbox">Citados na planilha original, sem oferta equivalente no Banco Mestre: <b>${esc(n.nao_mapeados.join(', '))}</b>. Endereço e telefone não disponíveis.</div>`:''}
    ${ofsUnid.length?`<details class="more" open><summary>Unidades no território</summary>${unidadesHTML(ofsUnid,3)}</details>`:''}
    ${ofsSem.length?`<p class="hint">Sem unidade cadastrada no Banco Mestre: ${ofsSem.map(o=>esc(OFE[o]?.nome||o)).join(', ')}.</p>`:''}
    <details class="more"><summary>Pendências de validação deste fluxo (${n.pendencias.length})</summary><ul>${n.pendencias.map(x=>`<li><b>${esc(x.tipo)}</b>: ${esc(x.descricao)} <i>Ação: ${esc(x.acao)}</i></li>`).join('')}</ul>${n.justificativa?`<p class="src-l">Justificativa da adequação: ${esc(n.justificativa)}</p>`:''}</details>
    <details class="more"><summary>Texto original da planilha</summary>${Object.entries(n.original).map(([k,v])=>`<div class="u-row"><span class="k">${esc(k)}</span><span>${v?linkify(v):NA(k)}</span></div>`).join('')}</details>
  </article>`;
}
function linkify(t){ return esc(t).replace(/https?:\/\/[^\s|]+/g, u=>`<a href="${u}" target="_blank" rel="noopener">${u.replace(/^https?:\/\//,'').slice(0,60)}…</a>`).replace(/ \| /g,'<br>'); }
function fluxoSitHTML(f){
  const x=FLU[f];
  const campos=[['Fluxo inicial',x.fluxo],['Risco imediato',x.risco],['Primeira porta',x.porta],['Serviço de referência',x.referencia],['Próximo passo',x.proximo],['Contrarreferência',x.contra]];
  return `<article class="gcard par"><header><h4><span class="tag">${f}</span> ${esc(x.situacao)}</h4><span class="badge st-${(x.status||'').toLowerCase().replace(/\s/g,'-')}">${esc(x.status||'')}</span></header>
    <ol class="steps">${campos.map(([a,b])=>`<li class="s-a"><b>${a}</b><div>${b?esc(b):NA(a)}</div></li>`).join('')}</ol>
    <div class="g-campo"><h5>Base normativa</h5><p>${x.base?esc(x.base):NA('Base normativa')}</p></div></article>`;
}

/* ---------- Resultado ---------- */
function renderResult(){
  SEEN=new Set();
  const crianca = ehCrianca(), proto = protocolo();
  const k = calcRisco();
  const {F, gaps} = proto ? montarFluxos() : {F:[], gaps:[]};
  const pubs = publicos();
  const nec = necessidades();
  const cobertas = new Set(pubs.flatMap(x=>NUC[x.p].necessidades));
  const flCobertos = new Set(pubs.flatMap(x=>NUC[x.p].fluxos));
  const necRest = [...nec.entries()];
  const flgTodos = fluxosGuia(nec).filter(f=>!flCobertos.has(f));
  const flgPrinc = pubs.length ? [] : flgTodos, flg = pubs.length ? flgTodos : [];
  const used = new Set(proto ? ['156','CT','CREAS','SEAS'] : []);
  const walk = st => st.forEach(p=>{ (p.c||[]).forEach(c=>used.add(c)); if(p.yes){walk(p.yes);walk(p.no);} });
  F.forEach(f=>walk(f.st));
  if (S.emerg==='sim') used.add('SAMU');
  if (crianca && !proto && S.sit.size) { used.add('CT'); used.add('CREAS'); }
  const order = ['SAMU','156','SEAS','CT','CREAS','CPAS','CV','UBS','ECR','CAPS','PPCAAM','POL','MP','VIJ','DEF','POP'];
  const prem = [
    'O público do Guia de Ofertas é definido pelas respostas (idade, adulto responsável, situação de rua, perfil e necessidades). A regra de correspondência é do protótipo e precisa ser validada.',
    'Os campos normalizados da planilha consolidada são iguais para todos os órgãos de um mesmo público. Só “Fluxo inicial”, “Porta de entrada” e “Encaminhamentos” mudam por órgão.',
  ];
  if (crianca) prem.push('A faixa de risco é calculada pela soma de pontos. O grau de cada item na tabela pode divergir da faixa. Exemplo: "Fora da escola" tem grau Alto, mas vale 2 pontos, que é a faixa Moderado.',
    'Qualquer item de intervenção imediata classifica o caso como Muito alto. Nesses casos, os atenuantes não são aplicados.');
  if (proto) prem.push('Horário comercial: segunda a sexta, das 8h às 18h. O protocolo não define esse horário.',
    'Os fluxos específicos do protocolo são aplicados sempre que a situação é marcada, com ou sem flagrante. O fluxo geral é aplicado quando não há flagrante.',
    'Criança desacompanhada foi tratada como "Criança sem vigilância de responsável".');
  const protGaps = [...gaps];
  if (proto){
    if (S.agente==='eCR' && S.acomp==='sim' && S.flag!=='sim') protGaps.push('No fluxo geral (acompanhado), a pergunta "SEAS impossibilitado?" foi atribuída à eCR pela cor do diagrama.');
    if (S.agente==='GCM' && S.acomp==='nao') protGaps.push('No fluxo geral (desacompanhado), a pergunta "É desaparecimento?" é compartilhada entre eCR e GCM no diagrama. O protótipo aplicou a mesma pergunta à GCM.');
    if (F.some(f=>f.id==='sexual'||f.id==='ameaca')) protGaps.push('O protocolo escreve o nome do programa de três formas: PPCAAM, PPCAM e PPCCAM.');
    protGaps.push('O protocolo cita "CPAS" e "Central de Vagas" como canais diferentes. O Banco Mestre trata os dois como uma coisa só (OF042) e não traz telefone direto de nenhum deles.');
  }
  if (ehAdulto() && PROTO.includes(S.agente)) protGaps.push(`O Protocolo Integrado não cobre adultos, e a planilha consolidada não tem orientação de fluxo inicial para ${S.agente}. O resultado segue a porta de entrada do Guia de Ofertas.`);
  if (ehAdulto() && S.perfil.has('gestante') && S.rua!=='sim') protGaps.push('A planilha consolidada só tem fluxo para gestante em situação de rua. Gestante fora da rua caiu no fluxo de pessoa adulta.');

  const head = crianca
    ? `<div class="nivel">Risco ${k.nivel}</div><div class="pts">${k.pts} pontos${k.atenAplic?` − ${k.atenAplic} de atenuantes = ${k.final}`:''}${k.imed.length?' · intervenção imediata':''}</div>`
    : `<div class="nivel">Pessoa adulta</div><div class="pts">Sem graduação de risco: a tabela do protocolo vale para crianças e adolescentes.</div>`;
  $('#app').innerHTML = `
  <div class="res-head ${crianca?k.cls:'n0'}">
    <div class="rh-top"><span class="lane">${esc(PROTO.includes(S.agente)?S.agente:(ORG[S.orgao]||''))}</span><span>${esc(S.dist?S.dist+' · ':'')}${esc(S.sub)}</span><span>${esc(new Date(S.dt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}))}</span></div>
    ${head}
  </div>
  ${proto&&(k.cls==='n3'||k.cls==='n2')&&S.risco==='nao'?`<div class="gapbox"><b>Atenção:</b> a tabela classificou o risco como ${k.nivel}, mas a equipe respondeu que não existe risco. O fluxo seguiu a resposta da equipe. Revise essa resposta antes de agir.</div>`:''}
  ${S.emerg==='sim'?`<div class="samu big"><p>Antes de tudo: chame o SAMU.</p><a href="tel:192">192</a></div>`:''}

  ${used.size?`<section class="blk acionar"><h3>Órgãos a acionar</h3><p class="hint">Reunidos de todos os fluxos abaixo. Os contatos estão mais adiante.</p><div class="chips big">${CHIP(order.filter(x=>used.has(x)))}</div></section>`:''}

  ${proto?`<section class="blk"><h3>Faça agora</h3>
  ${F.map((f,i)=>`${f.par&&!F[i-1]?.par?'<p class="hint par-t">Fluxos paralelos e independentes: podem ser conduzidos ao mesmo tempo, sem depender um do outro.</p>':''}<article class="flow${f.par?' par':''}"><header><h4>${esc(f.t)}</h4><span class="pg">${f.par?'Paralelo · ':''}Protocolo, ${f.pag}</span></header>${passosHTML(f.st)}</article>`).join('')}
  </section>`:''}

  <section class="blk"><h3>${proto?'Depois do primeiro atendimento':'Fluxo a seguir'}</h3>
  <p class="hint">Guia de Ofertas consolidado (${esc(G.fonte||'')}), normalizado ao Banco Mestre. Todos os registros estão marcados como “necessita validação”.</p>
  ${pubs.length?pubs.map(nucleoHTML).join(''):''}
  ${flgPrinc.length?`<p class="why">Fluxos escolhidos pelas situações identificadas, em paralelo e independentes:</p>${flgPrinc.map(fluxoSitHTML).join('')}`:''}
  ${!pubs.length&&!flgPrinc.length?'<div class="gapbox">Nenhum fluxo do Guia de Ofertas corresponde às respostas.</div>':''}
  </section>

  ${crianca?`<section class="blk"><h3>Graduação de risco</h3>
  ${k.it.length||S.sit.has('ameaca')||S.sit.has('ato')?`<table class="rt"><thead><tr><th>Critério</th><th>Grau</th><th>Pontos</th><th>Ação recomendada</th></tr></thead><tbody>
    ${k.it.map(i=>{const r=RISCO[i];return `<tr><td>${esc(r.l)}${r.der?'<small> (derivado das respostas)</small>':''}</td><td>${r.g}</td><td>${r.p??'—'}</td><td>${esc(r.a)}</td></tr>`}).join('')}
    ${['ameaca','ato'].filter(x=>S.sit.has(x)).map(x=>`<tr class="np"><td>${NAO_PONTUADAS[x]}</td><td colspan="3"><span class="na">Não consta na tabela de graduação</span></td></tr>`).join('')}
    ${k.atenValid.map(a=>`<tr class="at"><td>${esc(ATEN[a].l)}</td><td>Atenuante</td><td>${k.imed.length?'<s>−1</s>':'−1'}</td><td>${k.imed.length?'Não aplicado: há intervenção imediata':''}</td></tr>`).join('')}
  </tbody></table>`:'<p class="hint">Nenhum item da tabela foi marcado.</p>'}
  <p class="hint">"Orientação" e "intervenção imediata" não têm definição operacional no protocolo.</p>
  </section>`:''}

  ${used.size?`<section class="blk"><h3>Contatos para acionar</h3>
  <p class="hint">Dados do Banco Mestre, atualizados pelas páginas oficiais quando disponíveis. Quando uma informação falta, isso aparece indicado.</p>
  ${order.filter(x=>used.has(x)).map(contatoHTML).join('')}
  </section>`:''}

  ${necRest.length||flg.length?`<section class="blk"><h3>Em paralelo: necessidades a encaminhar</h3>
  <p class="hint">Cada necessidade abaixo tem porta de entrada e rede próprias e pode ser encaminhada ao mesmo tempo que as demais e que o atendimento acima. Camada do Guia de Ofertas.</p>
  ${necRest.map(([id,why])=>{const N=NEC[id]; return `<details class="need"><summary><b>${esc(N.nome)}</b><small>${esc([...why].join(', '))}${cobertas.has(id)?' · também no fluxo acima':''}</small></summary>
    <div class="u-row"><span class="k">Porta de entrada</span><span>${N.porta?esc(N.porta):NA('Porta de entrada')}</span></div>
    <div class="u-row"><span class="k">Rede responsável</span><span>${N.rede?esc(N.rede):NA('Rede')}</span></div>
    ${!N.ofertas.length?`<div class="gapbox">Ofertas: "${esc(N.ofertasTxt||'')}". Não há uma lista de ofertas definida.</div>`:''}
    ${N.ofertas.map(of=>{const O=OFE[of]; if(!O) return `<div class="gapbox">${esc(of)}: oferta não encontrada no Banco Mestre.</div>`; return `<div class="offer"><h5>${esc(O.nome)} <small>${esc(O.orgao||'')}</small></h5>
      <div class="u-row"><span class="k">Para quê</span><span>${O.uso?esc(O.uso):NA('Descrição')}</span></div>
      <div class="u-row"><span class="k">Quem encaminha</span><span>${O.quem?esc(O.quem):NA('Informação')}</span></div>
      ${O.naoUsar?`<div class="u-row"><span class="k">Não usar quando</span><span>${esc(O.naoUsar)}</span></div>`:''}
      <details class="more"><summary>Unidades no território</summary>${unidadesHTML([of],3)}</details></div>`}).join('')}
  </details>`}).join('')}
  ${flg.map(f=>{const x=FLU[f];return `<details class="need"><summary><b>${f} · ${esc(x.situacao)}</b><small>${esc(x.status||'')}</small></summary>
    ${[['Fluxo inicial',x.fluxo],['Risco imediato',x.risco],['Primeira porta',x.porta],['Serviço de referência',x.referencia],['Próximo passo',x.proximo],['Contrarreferência',x.contra],['Base normativa',x.base]].map(([a,b])=>`<div class="u-row"><span class="k">${a}</span><span>${b?esc(b):NA(a)}</span></div>`).join('')}</details>`}).join('')}
  </section>`:''}

  <section class="blk trans"><h3>Como o protótipo chegou aqui</h3>
    ${protGaps.length?`<h4>Lacunas neste caso</h4><ul>${protGaps.map(g=>`<li>${esc(g)}</li>`).join('')}</ul>`:''}
    <h4>Premissas do protótipo (a validar)</h4><ul>${prem.map(g=>`<li>${esc(g)}</li>`).join('')}</ul>
  </section>

  <div class="nav end"><button class="ghost" id="edit">Revisar respostas</button><button class="ghost" id="copy">Copiar resumo</button><button id="new">Novo atendimento</button></div>`;
  bind();
  $('#edit').onclick=()=>{step=telas().length-1;render();};
  $('#new').onclick=()=>location.reload();
  $('#copy').onclick=()=>{
    const flat = (st,ind='') => st.map(p=>p.k==='if'?`${ind}? ${p.cond}\n${ind}  SE SIM:\n${flat(p.yes,ind+'    ')}\n${ind}  SE NÃO:\n${flat(p.no,ind+'    ')}`:`${ind}- ${p.txt}`).join('\n');
    const guia = pubs.map(({p})=>{const n=NUC[p]; return `GUIA DE OFERTAS · ${p} (${n.status})\n`+CAMPOS_G.map(([c,l])=>`${l}: ${segsDo(n,c).map(g=>(g.tag?g.tag+': ':'')+g.texto).join(' | ')}`).join('\n');}).join('\n\n');
    const txt = `RESUMO DO ATENDIMENTO (protótipo, sem dados pessoais)\nAtendimento: ${quemAtende()} | Local: ${S.dist||'distrito não informado'} / ${S.sub} | ${new Date(S.dt).toLocaleString('pt-BR')}\nPerfil: ${S.idade}${crianca?`, ${S.acomp==='sim'?'acompanhado(a)':'desacompanhado(a)'}`:''} | Situação de rua: ${S.rua}\n${crianca?`Risco: ${k.nivel} (${k.final} pts${k.imed.length?', intervenção imediata':''})\nCritérios: ${k.it.map(i=>RISCO[i].l).join('; ')||'nenhum'}\n`:''}\n${F.map(f=>`${f.t.toUpperCase()}\n${flat(f.st)}`).join('\n\n')}${F.length?'\n\n':''}${guia}`;
    navigator.clipboard?.writeText(txt).then(()=>{$('#copy').textContent='Resumo copiado';},()=>{$('#copy').textContent='Não foi possível copiar';});
  };
  window.scrollTo({top:0,behavior:'instant'});
}

/* ---------- Painel de qualidade da base ---------- */
(function(){
  const a=D.statsAll, p=x=>Math.round(100*x/a.total)+'%';
  $('#qual').innerHTML = `<h3>Qualidade da base (Banco Mestre, arquivo V0.8)</h3><ul>
   <li><b>${a.total.toLocaleString('pt-BR')}</b> unidades cadastradas. Nenhuma está "VERIFICADA": ${a.emVal.toLocaleString('pt-BR')} estão em validação e ${a.naoConf.toLocaleString('pt-BR')} não foram confirmadas.</li>
   <li>${a.semDist.toLocaleString('pt-BR')} (${p(a.semDist)}) estão sem distrito, e ${a.semSub.toLocaleString('pt-BR')} (${p(a.semSub)}) estão sem subprefeitura.</li>
   <li>Só ${a.comHor} (${p(a.comHor)}) têm horário de funcionamento. ${a.semTel.toLocaleString('pt-BR')} (${p(a.semTel)}) estão sem telefone.</li>
   <li>${a.tel2696.toLocaleString('pt-BR')} unidades compartilham o mesmo telefone, (11) 2696-3200.</li>
   <li>Sem nenhuma unidade cadastrada: CPAS, Central de Vagas, Consultório na Rua, NCA, Casa Temporária, Centro POP, Ministério Público, Defensoria, Vara da Infância, delegacias e PPCAAM.</li>
   <li>O painel da planilha diz "${esc(D.versao||'')}", mas o arquivo é a V0.8.</li></ul>
   <h3>Fontes oficiais lidas pelo job</h3>
   <p>Última coleta: ${fdata(C.data_coleta)||'nenhuma'}${C.modo==='offline'?' (teste com páginas salvas)':''}. A evidência de cada dado é a página oficial, com a data em que a secretaria a atualizou e a data em que o job a leu. Só é reprocessado o que mudou. O job não corrige dados: publica como está e devolve as inconformidades à secretaria.</p>
   <div class="tw"><table class="rt"><thead><tr><th>Serviço</th><th>Total declarado</th><th>Lidas</th><th>Páginas</th></tr></thead><tbody>
   ${Object.entries(C.servicos).map(([id,s])=>{const ps=Object.values(C.paginas).filter(p=>p.servico===id&&p.tipo==='lista');return `<tr><td>${esc(s.secretaria)} · ${esc(id.split('-').slice(1).join(' ').toUpperCase())}<br><small>${esc(s.uso||'')}</small></td><td>${s.total_declarado??'<span class="na">não declarado</span>'}${s.parcial?'<br><small>leitura parcial (teste)</small>':''}</td><td>${s.unidades_distintas??0}</td><td>${ps.map(p=>`<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.titulo||'página')}</a> ${p.status==='ok'?`(${fdata(p.data_pagina)||'sem data'})`:'<span class="na">não lida</span>'}`).join('<br>')}</td></tr>`}).join('')}
   </tbody></table></div>
   ${C.resumo?`<p>Nesta coleta: <b>${C.resumo.atualizadas}</b> unidades atualizadas pela fonte oficial, <b>${C.resumo.novas}</b> novas, <b>${C.resumo.nao_constam}</b> marcadas como “não consta” (só em serviços lidos por inteiro com total conferido), <b>${C.resumo.com_conflito}</b> com divergência entre duas fontes oficiais.</p>`:''}
   <h3>Legislação monitorada</h3><ul>${Object.values(C.normas).map(n=>`<li><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.titulo)}</a>: ${n.status==='ok'?(n.mudou?'<b>texto alterado</b>':'lida'):'<span class="na">não lida neste teste</span>'}${n.data_aquisicao?' em '+fdata(n.data_aquisicao):''}. Responsável: ${esc(n.responsavel)}.</li>`).join('')}</ul>
   <details><summary>Inconformidades encontradas (${(C.achados||[]).length})</summary><ul>${(C.achados||[]).map(a=>`<li><b>${esc(a.nivel)}</b> · ${esc(a.unidade||'(página)')}: ${esc(a.mensagem)}${a.valor_publicado?` Publicado: <code>${esc(a.valor_publicado)}</code>`:''}</li>`).join('')}</ul></details>
   <details><summary>Divergências com o Banco Mestre (${(C.divergencias||[]).length})</summary><ul>${(C.divergencias||[]).map(d=>`<li><b>${esc(d.nome)}</b>: ${Object.entries(d.diferencas).map(([k,v])=>`${esc(k)} era <code>${esc(v.base)}</code>, agora <code>${esc(v.pagina)}</code>`).join('; ')}</li>`).join('')}</ul></details>
`;
})();

render();
