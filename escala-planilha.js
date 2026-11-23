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

  const SENHAS_VALIDAS=['amoservir','acolitos2026'];
  let isCoord=sessionStorage.getItem('coord_auth')==='1';

  function verificarOuPedirSenhaCoord(motivo){
    if(isCoord)return true;
    const pass=prompt((motivo?motivo+'\n\n':'')+'🔐 Esta ação requer autorização da Coordenação.\nDigite a senha do Coordenador:');
    if(!pass)return false;
    if(SENHAS_VALIDAS.includes(pass.trim().toLowerCase())){
      isCoord=true;
      sessionStorage.setItem('coord_auth','1');
      if($('coordPanel'))$('coordPanel').hidden=false;
      say('Acesso de Coordenador liberado!',true);
      return true;
    }
    alert('❌ Senha incorreta! Somente a coordenação tem permissão para esta ação.');
    return false;
  }
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
  function formatName(n){
    if(!n)return '';
    return n.trim().split(/\s+/).map(w=>{
      const l=w.toLowerCase();
      if(['de','da','do','dos','das','e'].includes(l))return l;
      return l.charAt(0).toUpperCase()+l.slice(1);
    }).join(' ');
  }
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
      let totalDayServers=0;
      const rosterList=node('div','roster-list');
      for(const s of group){
        const inList=selected(s),b=node('button','slot');b.disabled=locked||(inList&&!swaps);b.dataset.slot=s.key;
        b.setAttribute('aria-pressed',String(inList));b.setAttribute('aria-label',s.day+', '+s.date+' às '+s.time+(inList?', marcada':''));
        b.append(node('span','',(inList?'✓ ':'')+s.time),node('small','',s.label||(inList?'Marcada':'Marcar')));
        b.onclick=()=>change([s],!inList);grid.append(b);
        const rawNames=(records.get(s.key)?.names||[]).filter(Boolean);
        totalDayServers+=rawNames.length;
        const row=node('div','roster-row');
        const rHead=node('div','roster-row-head');
        const leftHead=node('div','roster-head-left');
        leftHead.append(node('span','roster-time-badge','🕒 '+s.time));
        if(s.label)leftHead.append(node('span','roster-label-tag',s.label));
        leftHead.append(node('span','roster-count-badge',rawNames.length?(rawNames.length===1?'1 escalado':rawNames.length+' escalados'):'Vagas abertas'));
        rHead.append(leftHead);
        if(swaps&&rawNames.length>0){
          const actionsWrap=node('div','roster-actions-wrap');
          const btnSub=node('button','roster-action-btn','🔄 Substituir');
          btnSub.type='button';btnSub.title='Substituir alguém neste horário';
          btnSub.onclick=(e)=>{e.stopPropagation();abrirModalSubstituir(s,rawNames);};
          const btnClear=node('button','roster-action-btn danger','🗑️ Tirar todos');
          btnClear.type='button';btnClear.title='Tirar todos deste horário';
          btnClear.onclick=(e)=>{e.stopPropagation();tirarTodosDoHorario(s,rawNames);};
          actionsWrap.append(btnSub,btnClear);
          rHead.append(actionsWrap);
        }
        row.append(rHead);
        const namesWrap=node('div','roster-names-wrap');
        if(rawNames.length){
          for(const n of rawNames){
            const isMe=!!user&&(n.toLowerCase().trim()===user.toLowerCase().trim());
            const tag=node('span','roster-name-tag'+(isMe?' is-me':''));
            tag.append(node('span','',(isMe?'⭐ ':'👤 ')+formatName(n)));
            if(swaps){
              const btnRemove=node('button','roster-btn-remove','×');
              btnRemove.type='button';btnRemove.title='Tirar '+formatName(n)+' deste horário';
              btnRemove.onclick=(e)=>{e.stopPropagation();removerNome(s,n);};
              tag.append(btnRemove);
            }
            namesWrap.append(tag);
          }
        }else{
          namesWrap.append(node('span','roster-empty-tag','⚪ Ninguém escalado ainda'));
        }
        row.append(namesWrap);
        rosterList.append(row);
      }
      const roster=node('details','roster');
      const sumText=totalDayServers?`👥 Ver quem vai servir (${totalDayServers} escalado${totalDayServers===1?'':'s'})`:'👥 Ver quem vai servir (Nenhum ainda)';
      roster.append(node('summary','roster-summary',sumText),rosterList);
      card.append(roster);$('days').append(card);
    }
    if(ready&&!$('days').childElementCount)$('days').append(node('p','muted','Não há horários futuros nesta seleção.'));
    $('summaryCount').textContent=!ready?'Aguardando a planilha.':!user?'Escolha seu nome para ver suas missas.':mine.length+' '+(mine.length===1?'missa marcada':'missas marcadas')+' neste mês';
    $('summaryList').replaceChildren();
    for(const s of mine){
      const li=node('li','my-schedule-item');
      const info=node('div','my-schedule-info');
      info.append(node('span','my-schedule-title','✓ '+s.day+', '+s.date.slice(0,5)+' às '+s.time));
      if(s.label)info.append(node('span','roster-label-tag',s.label));
      li.append(info);
      if(swaps){
        const acts=node('div','my-schedule-actions');
        const bTrocar=node('button','btn-trocar-meu','🔄 Trocar Horário');
        bTrocar.type='button';bTrocar.title='Trocar para outro horário neste mês';
        bTrocar.onclick=()=>trocarMeuHorario(s);
        const bDesistir=node('button','btn-desistir-meu','❌ Desistir');
        bDesistir.type='button';bDesistir.title='Desistir desta missa';
        bDesistir.onclick=()=>{
          if(confirm('Deseja desistir da missa de '+s.day+', '+s.date+' às '+s.time+'?'))change([s],false);
        };
        acts.append(bTrocar,bDesistir);
        li.append(acts);
      }
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
      autoLimparAntigas();
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
  async function removerNome(s,name){
    if(busy)return;
    const isMe=!!user&&(name.toLowerCase().trim()===user.toLowerCase().trim());
    if(!isMe&&!isCoord){
      if(!verificarOuPedirSenhaCoord('Você está tentando tirar '+formatName(name)+' deste horário.'))return;
    }
    if(!confirm('Deseja tirar '+formatName(name)+' da missa de '+s.day+', '+s.date+' às '+s.time+'?'))return;
    busy=true;render();
    try{
      say('Tirando '+formatName(name)+' da planilha…',true);
      const r=records.get(s.key);
      const rows=await call('desistir',[r?.date||s.date,r?.time||s.time,name]);
      readRows(rows);
      say(formatName(name)+' foi retirado(a) da missa.',true);
    }catch(e){
      say('Não foi possível retirar da planilha. Atualize a escala.',true,true);
    }finally{busy=false;render();}
  }
  async function tirarTodosDoHorario(s,namesList){
    if(busy||!namesList.length)return;
    if(!verificarOuPedirSenhaCoord('⚠️ ATENÇÃO: Você solicitou TIRAR TODO MUNDO ('+namesList.length+' acólitos) da missa de '+s.day+', '+s.date+' às '+s.time+'.'))return;
    if(!confirm('Tem certeza absoluta que deseja TIRAR TODO MUNDO ('+namesList.length+' pessoas) da missa de '+s.day+', '+s.date+' às '+s.time+'?'))return;
    busy=true;render();
    try{
      say('Tirando todos da missa de '+s.time+'…',true);
      const r=records.get(s.key);
      for(const n of namesList){
        const rows=await call('desistir',[r?.date||s.date,r?.time||s.time,n]);
        readRows(rows);
      }
      say('Todos foram retirados da missa de '+s.time+'.',true);
    }catch(e){
      say('Erro ao tirar da planilha. Atualize a escala.',true,true);
    }finally{busy=false;render();}
  }
  async function abrirModalSubstituir(s,namesList){
    if(busy||!namesList.length)return;
    let saindo=namesList[0];
    if(namesList.length>1){
      const msg='Escolha o NÚMERO de quem vai SAIR da missa das '+s.time+':\n\n'+namesList.map((n,i)=>(i+1)+' - '+formatName(n)).join('\n');
      const resp=prompt(msg,'1');
      if(!resp)return;
      const idx=parseInt(resp,10)-1;
      if(idx>=0&&idx<namesList.length)saindo=namesList[idx];
      else{alert('Opção inválida.');return;}
    }
    const msgEntra='Quem vai ENTRAR no lugar de '+formatName(saindo)+'?\n\nNomes cadastrados:\n'+names.map(n=>'• '+formatName(n)).join('\n')+'\n\nDigite o nome de quem vai entrar:';
    const digitado=prompt(msgEntra,user&&user.toLowerCase()!==saindo.toLowerCase()?formatName(user):'');
    if(!digitado||!digitado.trim())return;
    const entrando=names.find(x=>x.toLowerCase()===digitado.trim().toLowerCase())||digitado.trim();
    if(entrando.toLowerCase()===saindo.toLowerCase()){alert('O substituto não pode ser a mesma pessoa.');return;}
    if(!confirm('Confirmar substituição?\n\n❌ SAI: '+formatName(saindo)+'\n✅ ENTRA: '+formatName(entrando)+'\n\nData: '+s.day+', '+s.date+' às '+s.time))return;
    busy=true;render();
    try{
      say('Substituindo '+formatName(saindo)+' por '+formatName(entrando)+'…',true);
      const r=records.get(s.key);
      await call('desistir',[r?.date||s.date,r?.time||s.time,saindo]);
      const rows=await call('salvarRegistroRapido',[r?.date||s.date,r?.time||s.time,entrando]);
      readRows(rows);
      say('Substituição realizada com sucesso na planilha!',true);
    }catch(e){
      say('Erro ao realizar substituição. Atualize a escala.',true,true);
    }finally{busy=false;render();}
  }

  function isMaisDeUmaSemanaPassada(dateStr){
    if(!dateStr)return false;
    const parts=dateStr.split('/');
    if(parts.length!==3)return false;
    const itemDate=new Date(parseInt(parts[2],10),parseInt(parts[1],10)-1,parseInt(parts[0],10),23,59,59);
    const now=new Date();
    return (now-itemDate)>(7*24*60*60*1000);
  }

  let autoCleanDone=false;
  function autoLimparAntigas(){
    if(autoCleanDone||busy)return;
    const antigas=[];
    for(const [k,r] of records){
      if(isMaisDeUmaSemanaPassada(r.date)){
        for(const n of r.names) antigas.push({date:r.date, time:r.time, name:n});
      }
    }
    if(!antigas.length)return;
    autoCleanDone=true;
    setTimeout(async()=>{
      try{
        for(const item of antigas){
          await call('desistir',[item.date,item.time,item.name]);
        }
      }catch(e){}
    },2000);
  }

  async function trocarMeuHorario(sAntigo){
    if(busy||!user)return;
    const futuros=slots.filter(s=>s.key>=localNow()&&s.key!==sAntigo.key&&!selected(s));
    if(!futuros.length){
      alert('Não há outros horários futuros disponíveis para troca neste mês.');
      return;
    }
    const opcoes=futuros.map((s,i)=>`${i+1} - ${s.day}, ${s.date} às ${s.time}${s.label?' ('+s.label+')':''}`);
    const resp=prompt(`Você está marcado(a) em:\n📌 ${sAntigo.day}, ${sAntigo.date} às ${sAntigo.time}\n\nEscolha o NÚMERO do novo horário para onde deseja trocar:\n\n`+opcoes.join('\n'));
    if(!resp)return;
    const idx=parseInt(resp,10)-1;
    if(isNaN(idx)||idx<0||idx>=futuros.length){alert('Opção inválida.');return;}
    const sNovo=futuros[idx];
    if(!confirm(`Confirmar troca de horário?\n\n❌ SAIR DE: ${sAntigo.day}, ${sAntigo.date} às ${sAntigo.time}\n✅ IR PARA: ${sNovo.day}, ${sNovo.date} às ${sNovo.time}`))return;

    busy=true;render();
    try{
      say(`Trocando horário para ${sNovo.date} às ${sNovo.time}…`,true);
      const rAntigo=records.get(sAntigo.key);
      await call('desistir',[rAntigo?.date||sAntigo.date,rAntigo?.time||sAntigo.time,user]);
      const rows=await call('salvarRegistroRapido',[sNovo.date,sNovo.time,user]);
      readRows(rows);
      say(`Troca confirmada na planilha para ${sNovo.day} às ${sNovo.time}!`,true);
    }catch(e){
      say('Erro ao trocar horário. Atualize a escala.',true,true);
    }finally{busy=false;render();}
  }

  async function apagarEscalasAntigas(){
    if(busy)return;
    const antigas=[];
    for(const [k,r] of records){
      if(isMaisDeUmaSemanaPassada(r.date)){
        for(const n of r.names) antigas.push({date:r.date, time:r.time, name:n});
      }
    }
    if(!antigas.length){
      alert('Nenhuma marcação antiga (com mais de 7 dias) encontrada na planilha. A escala já está limpa!');
      return;
    }
    if(!confirm(`Foram encontradas ${antigas.length} presenças em missas antigas (+7 dias atrás).\n\nDeseja apagar todas da planilha agora?`)) return;
    busy=true;render();
    try{
      say(`Apagando ${antigas.length} presenças antigas da planilha…`,true);
      for(const item of antigas){
        const rows=await call('desistir',[item.date,item.time,item.name]);
        readRows(rows);
      }
      say(`Limpeza concluída! ${antigas.length} presenças antigas foram apagadas da planilha.`,true);
    }catch(e){
      say('Erro ao apagar escalas antigas. Atualize a página.',true,true);
    }finally{busy=false;render();}
  }

  async function zerarMesAtual(){
    if(busy)return;
    const doMes=[];
    const mesNum=pad(month.getMonth()+1);
    const anoNum=String(month.getFullYear());
    for(const [k,r] of records){
      const parts=(r.date||'').split('/');
      if(parts.length===3&&parts[1]===mesNum&&parts[2]===anoNum){
        for(const n of r.names) doMes.push({date:r.date, time:r.time, name:n});
      }
    }
    if(!doMes.length){
      alert('Nenhuma marcação encontrada neste mês.');
      return;
    }
    if(!confirm(`⚠️ ATENÇÃO COORDENADOR!\n\nDeseja ZERAR toda a escala do mês de ${$('monthLabel').textContent}?\n\nIsso vai remover ${doMes.length} presenças marcadas!`)) return;
    if(!confirm('Confirmação final: Tem certeza absoluta?')) return;
    busy=true;render();
    try{
      say(`Limpando ${doMes.length} presenças do mês…`,true);
      for(const item of doMes){
        const rows=await call('desistir',[item.date,item.time,item.name]);
        readRows(rows);
      }
      say('Escala do mês zerada com sucesso na planilha!',true);
    }catch(e){
      say('Erro ao zerar mês. Atualize a escala.',true,true);
    }finally{busy=false;render();}
  }

  function setupCoord(){
    const p=$('coordPanel'), b=$('btnCoord');
    if(!p||!b)return;
    p.hidden=!isCoord;
    b.onclick=()=>{
      if(isCoord){p.hidden=!p.hidden;return;}
      if(verificarOuPedirSenhaCoord('Painel da Coordenação (Luiggi Barudi / Bruno Serra)')){
        p.hidden=false;
      }
    };
    if($('btnLimparAntigas'))$('btnLimparAntigas').onclick=apagarEscalasAntigas;
    if($('btnZerarMes'))$('btnZerarMes').onclick=zerarMesAtual;
    if($('btnSairCoord'))$('btnSairCoord').onclick=()=>{
      isCoord=false;sessionStorage.removeItem('coord_auth');
      p.hidden=true;say('Você saiu do modo coordenador.',true);
    };
  }

  $('refresh').onclick=refresh;
  $('userSelect').onchange=()=>{user=$('userSelect').value;say(user?'Escolha os horários abaixo.':'Escolha seu nome na lista.');render();};
  for(const [id,offset] of [['prevMonth',-1],['nextMonth',1]])$(id).onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()+offset,1,12);render();};
  $('allDays').onchange=render;
  for(const b of document.querySelectorAll('[data-bulk]'))b.onclick=()=>change(slots.filter(s=>matches(s,b.dataset.bulk)),true);
  $('clearAll').onclick=()=>{const mine=slots.filter(selected);if(mine.length!==1||confirm('Desmarcar sua missa deste mês?'))change(mine,false);};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!busy)refresh();});
  setupCoord();
  refresh();
})();
