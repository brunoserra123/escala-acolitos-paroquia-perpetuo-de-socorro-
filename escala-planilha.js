'use strict';
(() => {
  const endpoint = 'https://script.google.com/macros/s/AKfycbziAJHtJrRarB7rlbxO7JTAPNjm73cuZDcT6mRQYzsxAoALmcQremEnJej1qT-SH3MqtQ/exec';
  const $ = id => document.getElementById(id);
  const weekdays = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  const pad = n => String(n).padStart(2, '0');
  const clock = new Intl.DateTimeFormat('en-GB', {timeZone:'America/Sao_Paulo', day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  function localNow() {
    const p = Object.fromEntries(clock.formatToParts(new Date()).map(x => [x.type,x.value]));
    return p.year+'-'+p.month+'-'+p.day+' '+p.hour+':'+p.minute;
  }
  function dateKey(date,time) {return date.split('/').reverse().join('-')+' '+time;}
  function normalizeDate(v) {
    const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v));
    return m ? pad(m[1])+'/'+pad(m[2])+'/'+m[3] : '';
  }
  function normalizeTime(v) {
    const m=/^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(v));
    return m ? pad(m[1])+':'+m[2] : '';
  }
  const [y,m]=localNow().split(' ')[0].split('-').map(Number);
  let month=new Date(y,m-1,1,12), ready=false,busy=false,user='', names=[],grade={}, swaps=false;
  let records=new Map(),slots=[],toastTimer;
  function say(msg,toast=false,error=false) {
    $('status').textContent=msg;
    clearTimeout(toastTimer);$('feedback').hidden=!toast;
    if(toast){$('feedback').className=error?'error':'';$('feedback').textContent=msg;toastTimer=setTimeout(()=>{$('feedback').hidden=true;},6500);}
  }
  async function call(fn,args=[]) {
    const ctrl=new AbortController(), timer=setTimeout(()=>ctrl.abort(),45000);
    try {
      const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({fn,args}),signal:ctrl.signal,cache:'no-store',credentials:'omit'});
      if(!res.ok)throw Error();
      const d=await res.json();
      if(d.ok!==true){const e=new Error(typeof d.erro==='string'?d.erro:'O Google recusou o pedido.');e.server=true;throw e;}
      return d.r;
    } finally {clearTimeout(timer);}
  }
  function readRows(rows){
    if(!Array.isArray(rows))throw Error('Resposta de escala inválida.');
    const next=new Map();
    for(const r of rows){
      const date=normalizeDate(r.data),time=normalizeTime(r.horario);if(!date||!time)continue;
      const key=dateKey(date,time);
      next.set(key,{date:r.data,time:r.horario,label:String(r.observacao||''),names:String(r.acolitos||'').split(',').map(n=>n.trim()).filter(n=>n&&!/vaga aberta/i.test(n))});
    }
    records=next;
  }
  function daysOfMonth(){
    const now=localNow(),out=[];
    for(let n=1;n<=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();n++){
      const d=new Date(month.getFullYear(),month.getMonth(),n,12),day=weekdays[d.getDay()],date=pad(n)+'/'+pad(d.getMonth()+1)+'/'+d.getFullYear();
      const times=new Map();
      for(const row of grade[day]||[]){const t=normalizeTime(row.horario);if(t)times.set(t,String(row.observacao||''));}
      for(const [k,r] of records)if(normalizeDate(r.date)===date)times.set(k.slice(-5),r.label||times.get(k.slice(-5))||'');
      const slots=[...times.keys()].sort().map(time=>({key:dateKey(date,time),time,date,day,label:times.get(time),weekend:[0,6].includes(d.getDay())})).filter(s=>s.key>=now);
      if(slots.length)out.push(slots);
    }return out;
  }
  function node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=text;return el;}
  const selected=s=>!!user&&(records.get(s.key)?.names||[]).includes(user);
  function render(){
    const groups=ready?daysOfMonth():[];slots=groups.flat();
    $('monthLabel').textContent=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(month);
    $('userSelect').disabled=!ready||busy;$('refresh').disabled=busy;
    for(const id of ['prevMonth','nextMonth','allDays'])$(id).disabled=busy;
    const mine=slots.filter(selected),locked=!user||busy||!ready;
    $('calendarHint').textContent=!ready?'Aguardando a escala da planilha.':!user?'Escolha seu nome acima para liberar os horários.':swaps?'Toque para marcar ou desmarcar.':'Toque para marcar. Para desmarcar, fale com a coordenação.';
    for(const b of document.querySelectorAll('[data-bulk]'))b.disabled=locked||!slots.some(s=>matches(s,b.dataset.bulk)&&!selected(s));
    $('days').replaceChildren();
    for(const group of groups){
      if(!$('allDays').checked&&!group[0].weekend)continue;
      const first=group[0],card=node('article','card day'),head=node('div','day-head'),grid=node('div','slots');
      head.append(node('h3','',first.day),node('time','',first.date.slice(0,5)));card.append(head,grid);
      const roster=node('details','roster');roster.append(node('summary','','Ver quem vai servir'));
      for(const s of group){
        const inList=selected(s),b=node('button','slot');b.disabled=locked||(inList&&!swaps);b.dataset.slot=s.key;
        b.setAttribute('aria-pressed',String(inList));b.setAttribute('aria-label',s.day+', '+s.date+' às '+s.time+(inList?', marcada':''));
        b.append(node('span','',(inList?'✓ ':'')+s.time),node('small','',s.label||(inList?'Marcada':'Marcar')));
        b.onclick=()=>change([s],!inList);grid.append(b);
        roster.append(node('p','',s.time+' · '+((records.get(s.key)?.names||[]).join(', ')||'Sem marcações')));
      }
      card.append(roster);$('days').append(card);
    }
    if(ready&&!$('days').childElementCount)$('days').append(node('p','muted','Não há horários futuros nesta seleção.'));
    $('summaryCount').textContent=!ready?'Aguardando a planilha.':!user?'Escolha seu nome para ver suas missas.':mine.length+' '+(mine.length===1?'missa marcada':'missas marcadas')+' neste mês';
    $('summaryList').replaceChildren();
    for(const s of mine){
      const li=node('li');li.append(node('span','','✓ '+s.date.slice(0,5)+' às '+s.time));
      if(swaps){const b=node('button','remove','×');b.disabled=locked;b.setAttribute('aria-label','Desmarcar '+s.date+' às '+s.time);b.onclick=()=>change([s],false);li.append(b);}
      $('summaryList').append(li);
    }
    $('clearAll').hidden=!swaps;$('clearAll').disabled=locked||!mine.length;
  }
  async function refresh(){
    if(busy)return;busy=true;say('Buscando a escala na planilha…');render();
    try{
      const [rows,n,g,c]=await Promise.all(['obterEscalaParaWeb','obterNomesAcolitos','obterGradeMissas','obterConfigSite'].map(fn=>call(fn)));
      if(!Array.isArray(n)||!g||typeof g!=='object'||!c)throw Error();
      readRows(rows);names=n.filter(x=>typeof x==='string'&&x).sort((a,b)=>a.localeCompare(b,'pt-BR'));grade=g;swaps=c.trocas===true;
      if(!names.includes(user))user='';
      $('userSelect').replaceChildren(new Option('Escolha seu nome…',''),...names.map(n=>new Option(n,n)));$('userSelect').value=user;
      ready=true;say(names.length?(user?'Escala atualizada.':'Escolha seu nome na lista.'):'Nenhum nome disponível na planilha. Fale com a coordenação.');
    }catch{ready=false;say('Não foi possível carregar a planilha. Toque em Atualizar escala.',true,true);}
    finally{busy=false;render();}
  }
  function matches(s,time){return s.time===time&&s.day===(time==='18:00'?'Sábado':'Domingo');}
  async function change(items,adding){
    if(busy||!ready||!names.includes(user)||(!adding&&!swaps))return;
    const todo=items.filter(s=>s.key>=localNow()&&selected(s)!==adding);
    if(!todo.length)return;
    if(todo.length>1&&!confirm((adding?'Marcar ':'Desmarcar ')+todo.length+' missas para '+user+'?'))return;
    busy=true;render();let count=0;
    try{
      for(const s of todo){
        say('Salvando '+s.date+' às '+s.time+'…',true);
        const r=records.get(s.key);
        const rows=await call(adding?'salvarRegistroRapido':'desistir',[r?.date||s.date,r?.time||s.time,user]);
        readRows(rows);
        if(selected(s)!==adding)throw Error();
        count++;render();
      }
      say((count===1?(adding?'Missa marcada':'Missa desmarcada'):count+' alterações confirmadas')+' na planilha.',true);
    }catch(e){
      ready=false;
      say((count?count+' alteração(ões) já confirmada(s). ':'')+(e.server?e.message:'Não foi possível confirmar a última alteração.')+' Atualize a escala antes de tentar novamente.',true,true);
    }finally{busy=false;render();}
  }
  $('refresh').onclick=refresh;
  $('userSelect').onchange=()=>{user=$('userSelect').value;say(user?'Escolha os horários abaixo.':'Escolha seu nome na lista.');render();};
  for(const [id,offset] of [['prevMonth',-1],['nextMonth',1]])$(id).onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()+offset,1,12);render();};
  $('allDays').onchange=render;
  for(const b of document.querySelectorAll('[data-bulk]'))b.onclick=()=>change(slots.filter(s=>matches(s,b.dataset.bulk)),true);
  $('clearAll').onclick=()=>{const mine=slots.filter(selected);if(mine.length!==1||confirm('Desmarcar sua missa deste mês?'))change(mine,false);};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!busy)refresh();});
  refresh();
})();
