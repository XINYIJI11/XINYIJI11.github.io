'use strict';
window.ResearchAssistant = (() => {
  let state={id:'research-assistant',version:1,plan:[],result:null}, visible=false, config=null, csrf='', candidates=[], running=false, controller, configRequest=null, configLoading=false, configError='';
  const el=id=>document.getElementById(id), text=value=>esc(value);
  const localDay=()=>new Date().toLocaleDateString('sv-SE');
  const shortDate=value=>{const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleDateString('zh-CN'):'';};
  function dateOf(note){
    const match=note.title.match(/^(20\d{2})(\d{2})(\d{2})(?!\d)/);
    if(match){const iso=`${match[1]}-${match[2]}-${match[3]}`;const d=new Date(iso+'T12:00:00');if(!Number.isNaN(+d)&&d.toLocaleDateString('sv-SE')===iso)return iso;}
    return new Date(note.updated).toLocaleDateString('sv-SE');
  }
  const notes=()=>{const samples=sampleEntries();return entries.filter(n=>n.kind!=='file'&&n.body.trim()&&!n.tags.includes('示例')&&!n.tags.includes('使用指南')&&!n.tags.includes('助手计划')&&!samples.some(s=>s.title===n.title&&s.body===n.body));};
  const sourceNote=ref=>entries.find(n=>n.id===ref.noteId)||entries.find(n=>ref.path&&n.source?.path===ref.path)||entries.find(n=>ref.title&&n.title===ref.title);
  const validSource=ref=>{const n=sourceNote(ref);return n&&typeof ref.quote==='string'&&n.body.includes(ref.quote);};
  const keyOf=task=>task.title.replace(/[\s，。！？、：:·]/g,'').toLowerCase();
  const result=()=>state.result||window.RESEARCH_BRIEF||{summary:'还没有可用的分析。连接模型后，选择日志生成你的研究简报。',tasks:[],themes:[],questions:[],mode:'empty'};
  async function commit(next){await transaction(['settings'],'readwrite',tx=>tx.objectStore('settings').put(next));state=next;render();}
  function evidence(refs){return `<details class="source-details"><summary>${refs.length} 条原文依据</summary>${refs.map(ref=>{const n=sourceNote(ref);return `<div class="source-quote">${n?`<button class="source-link" data-ai-source="${text(n.id)}">${text(n.title)}</button>`:`<span>${text(ref.title||ref.path||'原始日志')}</span>`}<blockquote>${text(ref.quote)}</blockquote>${validSource(ref)?'':'<span class="missing-link">引用已变更或原记录已删除，请更新分析</span>'}</div>`;}).join('')}</details>`;}
  function render(){
    const data=result();
    el('ai-summary').textContent=data.summary;if(!el('ai-web-sources'))el('ai-summary').insertAdjacentHTML('afterend','<div id="ai-web-sources"></div>');el('ai-web-sources').replaceChildren();if(data.webContext)renderWebSources(el('ai-web-sources'),data.webContext);
    el('ai-brief-label').textContent=data.mode==='cloud'?'AI 分析结果':'本次整理的历史简报';
    el('ai-analysis-date').textContent=data.generatedAt?`${data.mode==='cloud'?'分析时间':'简报日期'} · ${shortDate(data.generatedAt)}`:'';
    const total=notes().length;
    el('ai-scope').textContent=data.mode==='cloud'?`基于本次选择的 ${data.noteIds?.length||0} 篇日志片段 · ${data.model||'云端模型'} · 未读取附件内容`:`知识库中 ${total} 篇有效文字记录 · 简报参考截至 2026-09-21 的日志，后续变化请更新分析`;
    const refs=[...(data.tasks||[]),...(data.themes||[])].flatMap(t=>t.sources||[]);
    const stale=refs.some(ref=>!validSource(ref));
    const generated=Date.parse(data.generatedAt||'');
    const newer=notes().some(n=>n.updated>generated);
    el('ai-stale').hidden=!stale&&!newer;
    el('ai-stale').textContent=stale?'部分依据已修改或删除；相应建议需重新核实。请更新 AI 分析。':'知识库有比这份简报更新的记录。更新 AI 分析后再确认优先级。';
    const known=new Set(state.plan.map(keyOf));
    const tasks=(data.tasks||[]).filter(t=>!known.has(keyOf(t)));
    el('ai-suggestions').innerHTML=tasks.length?tasks.map((task,i)=>{const index=data.tasks.indexOf(task),valid=task.sources?.length&&task.sources.every(validSource);return `<article class="suggestion"><div class="suggestion-top"><span class="suggestion-index">${String(i+1).padStart(2,'0')}</span><h3>${text(task.title)}</h3><span class="priority ${text(task.priority)}">${({high:'优先推进',medium:'随后安排',low:'保留线索'})[task.priority]||'待确认'}</span></div><p class="suggestion-reason">${text(task.reason)}</p><div class="next-action"><strong>先做这一小步</strong>${text(task.nextAction)}</div>${task.uncertainty?`<p class="uncertainty">${text(task.uncertainty)}</p>`:''}${evidence(task.sources||[])}<div class="suggestion-actions"><button class="text-button" data-ai-task="deferred" data-index="${index}">暂缓</button><button class="button secondary" data-ai-task="done" data-index="${index}">已经完成</button><button class="button primary" data-ai-task="today" data-index="${index}" ${valid?'':'disabled'}>＋ 加入今日</button></div></article>`;}).join(''):'<div class="ai-disabled-note">这份简报的建议已处理，或尚无可用建议。你可以查看今日计划，或更新 AI 分析。</div>';
    el('ai-themes').innerHTML=(data.themes||[]).map(theme=>`<article class="theme-card"><h3>${text(theme.title)}</h3><p>${text(theme.detail)}</p>${evidence(theme.sources||[])}</article>`).join('');
    el('ai-questions').innerHTML=data.questions?.length?`<section class="questions-card"><h3>还需要你确认</h3><ul>${data.questions.map(q=>`<li>${text(q)}</li>`).join('')}</ul></section>`:'';
    const active=state.plan.filter(t=>t.status==='today'),history=state.plan.filter(t=>t.status!=='today');
    el('ai-plan-count').textContent=`${active.length} 项`;
    el('ai-plan').innerHTML=active.length?active.map(t=>`<div class="plan-item"><div class="plan-item-header"><input type="checkbox" data-ai-complete="${text(t.id)}" aria-label="完成 ${text(t.title)}"><strong>${text(t.title)}</strong></div><p>${text(t.nextAction)}</p>${t.date!==localDay()?`<p>从 ${text(t.date)} 延续，今天仍需确认</p>`:''}<button class="text-button" data-ai-state="deferred" data-plan-id="${text(t.id)}">暂缓这件事</button></div>`).join(''):'<div class="plan-empty">今天不必做完所有事。<br>先从一件值得推进的事开始。</div>';
    el('ai-plan-history').innerHTML=history.length?history.slice().reverse().map(t=>`<div class="plan-item"><strong>${t.status==='done'?'✓ 已完成':'⏸ 暂缓'} · ${text(t.title)}</strong><button class="text-button" data-ai-state="today" data-plan-id="${text(t.id)}">重新安排</button><button class="text-button danger" data-ai-remove="${text(t.id)}">移除记录</button></div>`).join(''):'<p class="panel-caption">还没有处理记录。</p>';
    el('ai-plan-note').disabled=!active.length;
    if(visible){el('breadcrumb-title').textContent='科研助手';document.querySelectorAll('[data-nav]').forEach(b=>b.classList.remove('active'));el('assistant-open').classList.add('active');}
  }
  function show(on){if(on&&window.Literature?.visible)window.Literature.show(false);visible=on;el('assistant-panel').hidden=!on;el('library-main').hidden=on;el('assistant-open').classList.toggle('active',on);el('sidebar').classList.remove('open');if(on){render();window.scrollTo({top:0});}else window.render();}
  function syncConnection(){
    const target=el('ai-send-target');
    target.textContent=configLoading?'正在确认已保存的模型连接…':configError?configError:config?.configured?`将发送到 ${new URL(config.baseUrl).hostname} · 模型 ${config.model}`:'服务器未配置模型连接，请在「模型连接」中查看。';
    el('ai-recheck').hidden=configLoading||(!configError&&!!config?.configured);
    updateSelection();
  }
  async function configStatus(){
    if(configRequest)return configRequest;
    configLoading=true;configError='';syncConnection();
    configRequest=(async()=>{
      try{
        if(!/^https?:$/.test(location.protocol))throw Error('请通过网站地址打开，当前页面无法连接 AI 服务。');
        const response=await fetch('./api/config',{cache:'no-store',signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw Error(response.status===401||response.status===403?'登录状态需要更新，请刷新网站重新登录。':'暂时无法读取模型连接，请点击「重新检查连接」。');
        let data;try{data=await response.json();}catch{throw Error('连接接口未返回有效数据，请刷新登录后重试。');}
        if(typeof data.csrf!=='string'||typeof data.configured!=='boolean')throw Error('连接状态数据不完整，请点击「重新检查连接」。');
        config=data;csrf=data.csrf;
        el('ai-connection-status').textContent=data.configured?(data.managed?'DeepSeek V4.1 Flash · 密钥已在服务端保存':`已配置 · ${data.model}`):'服务器未配置模型连接';
        return true;
      }catch(error){
        config=null;
        configError=['TimeoutError','AbortError'].includes(error.name)?'读取连接状态超时，这不代表密钥未保存。请点击「重新检查连接」。':error instanceof TypeError?'连接状态暂时无法读取，请检查网络后点击「重新检查连接」。':error.message;
        el('ai-connection-status').textContent='模型连接状态暂未确认';return false;
      }finally{configLoading=false;configRequest=null;syncConnection();}
    })();
    return configRequest;
  }
  async function settings(){const available=await configStatus();el('ai-server-help').hidden=available;el('ai-settings-save').disabled=!available;el('ai-settings-message').textContent='';el('ai-settings-form').hidden=!available||!!config?.managed;el('ai-managed-connection').hidden=!config?.managed;el('ai-connection-help').hidden=!!config?.managed;el('ai-key').value='';el('ai-base-url').value=config?.baseUrl||'https://api.openai.com/v1';el('ai-model').value=config?.model||'gpt-5-mini';el('ai-settings').showModal();}
  async function api(path,data,signal){const response=await fetch('./api/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Folio-Token':csrf},body:JSON.stringify(data),signal});let body;try{body=await response.json();}catch{throw Error('AI 服务未正确响应，请刷新网页或稍后重试。');}if(!response.ok)throw Error(body.error||'请求失败，请重试。');return body;}
  function terms(query){const segmenter=new Intl.Segmenter('zh',{granularity:'word'});return [...new Set([...segmenter.segment(query)].filter(t=>t.isWordLike&&t.segment.length>1).map(t=>t.segment.toLowerCase()))];}
  function excerpt(note,queryTerms){
    if(note.body.length<=4000)return note.body;
    const blocks=note.body.split(/\n\s*\n/);let selected=[],size=0;
    const ranked=blocks.map((body,i)=>({body:body.slice(0,2500),i,score:queryTerms.reduce((s,t)=>s+(body.toLowerCase().includes(t)?2:0),0)+(/待办|接下来|下一步|未完成|需要|目标|完成了/.test(body)?1:0)+(i===0?.5:0)})).sort((a,b)=>b.score-a.score);
    for(const block of ranked){if(size+block.body.length>4000)continue;selected.push(block);size+=block.body.length;if(size>3500)break;}
    return selected.sort((a,b)=>a.i-b.i).map(b=>b.body).join('\n\n');
  }
  function retrieve(){
    const query=el('ai-question').value,keys=terms(query),range=el('ai-range').value,now=Date.now();
    const pool=notes().filter(n=>range==='all'||now-Date.parse(dateOf(n)+'T12:00:00')<=Number(range)*86400000);
    candidates=pool.map(n=>{const age=Math.max(0,(now-Date.parse(dateOf(n)+'T12:00:00'))/86400000);const content=(n.title+' '+n.body).toLowerCase();return {id:n.id,title:n.title,date:dateOf(n),body:excerpt(n,keys),originalLength:n.body.length,score:keys.reduce((s,k)=>s+(content.includes(k)?2:0),0)+6/(1+age/7)};}).sort((a,b)=>b.score-a.score).slice(0,20);
    el('ai-source-picker').innerHTML=candidates.map((n,i)=>`<div class="source-option"><div class="source-option-header"><label><input type="checkbox" data-ai-select="${i}" ${i<8?'checked':''}><span>${text(n.title)}</span></label><span>${n.body.length} 字${n.body.length<n.originalLength?' / 节选':''}</span></div><details><summary>查看实际发送的片段 · ${text(n.date)}</summary><pre>${text(n.body)}</pre></details></div>`).join('')||'<p class="panel-caption">这个时间范围内没有文字记录，可选择全部历史。</p>';
    updateSelection();
  }
  function selected(){return [...document.querySelectorAll('[data-ai-select]:checked')].map(b=>candidates[Number(b.dataset.aiSelect)]);}
  function updateSelection(){const chosen=selected(),count=chosen.reduce((s,n)=>s+n.body.length,0);el('ai-review-info').textContent=`已选 ${chosen.length} 篇、${count.toLocaleString()} 字 · 每次最多 12 篇 / 48,000 字，不发送附件`;el('ai-run').disabled=running||configLoading||!config?.configured||!chosen.length||chosen.length>12||count>48000;}
  async function review(){el('ai-review-error').textContent='';el('ai-run-status').textContent='';el('ai-plan-context').textContent=state.plan.length?JSON.stringify(state.plan.map(t=>({title:t.title,status:t.status})),null,2):'没有已记录的任务状态。';retrieve();el('ai-review').showModal();void configStatus();}
  function validateResult(data){
    if(!data||typeof data.summary!=='string'||!Array.isArray(data.tasks)||!Array.isArray(data.themes)||!Array.isArray(data.questions)||data.tasks.length>5)throw Error('分析结果格式不完整。');
    for(const item of [...data.tasks,...data.themes]){
      if(typeof item.title!=='string'||!Array.isArray(item.sources)||!item.sources.length||!item.sources.every(validSource))throw Error('分析依据与当前日志不一致，请重新选择资料。');
      for(const ref of item.sources){const n=sourceNote(ref);ref.title=n.title;ref.path=n.source?.path;}
    }
    if(data.tasks.some(t=>!['high','medium','low'].includes(t.priority)||!['reason','nextAction','uncertainty'].every(k=>typeof t[k]==='string'))||data.themes.some(t=>typeof t.detail!=='string')||data.questions.some(q=>typeof q!=='string'))throw Error('分析结果字段不完整。');
    return data;
  }
  async function runAnalysis(){
    if(running)return;
    const chosen=selected();if(!chosen.length||chosen.length>12)throw Error('请选择 1–12 篇日志。');
    running=true;controller=new AbortController();el('ai-cancel').hidden=false;el('ai-review-error').textContent='';el('ai-run-status').textContent='AI 正在结合日志与计划进行分析…';updateSelection();
    const timeout=setTimeout(()=>controller.abort(),110000);
    try{
      const question=el('ai-question').value.trim();if(!question)throw Error('请写下这次的目标或问题。');if(el('ai-web-search').checked&&!el('ai-search-query').value.trim())throw Error('请填写要发送给文献检索服务的搜索词。');if(!await configStatus())throw Error(configError);if(!config?.configured)throw Error('服务器未配置模型连接，请查看模型连接设置。');
      const answer=await api('analyze',{question,notes:chosen.map(({id,title,date,body})=>({id,title,date,body})),plan:state.plan.map(({title,status})=>({title,status})),webSearch:el('ai-web-search').checked,searchQuery:el('ai-search-query').value.trim()},controller.signal);
      validateResult(answer);await commit({...state,result:answer});el('ai-review').close();toast('AI 分析已更新，原文依据已核对');
    }catch(error){el('ai-review-error').textContent=error.name==='AbortError'?'已停止等待；模型服务可能仍会完成本次请求并计费。原分析已保留。':error.message;}finally{clearTimeout(timeout);running=false;controller=null;el('ai-cancel').hidden=true;el('ai-run-status').textContent='';updateSelection();}
  }
  function normalizeState(value){
    if(!value||value.version!==1||!Array.isArray(value.plan)||value.plan.length>100)throw Error('助手计划备份无效。');
    const plan=value.plan.map(t=>{if(!t||typeof t.id!=='string'||typeof t.title!=='string'||typeof t.nextAction!=='string'||!['today','done','deferred'].includes(t.status)||!Array.isArray(t.sources))throw Error('助手任务格式无效。');return {id:t.id,title:t.title,nextAction:t.nextAction,reason:String(t.reason||''),uncertainty:String(t.uncertainty||''),priority:['high','medium','low'].includes(t.priority)?t.priority:'medium',status:t.status,date:String(t.date||''),sources:t.sources.filter(r=>r&&typeof r.quote==='string').map(r=>({noteId:String(r.noteId||''),title:String(r.title||''),path:typeof r.path==='string'?r.path:undefined,quote:r.quote}))};});
    let restored=null;
    if(value.result){
      const r=value.result;
      if(typeof r.summary!=='string'||!Array.isArray(r.tasks)||r.tasks.length>5||!Array.isArray(r.themes)||r.themes.length>6||!Array.isArray(r.questions)||r.questions.some(q=>typeof q!=='string'))throw Error('助手分析备份无效。');
      function cleanItem(item,isTask){
        if(!item||typeof item.title!=='string'||!Array.isArray(item.sources)||!item.sources.length||item.sources.some(s=>!s||typeof s.quote!=='string'||typeof s.noteId!=='string'))throw Error('助手引用备份无效。');
        const obj={title:item.title,sources:item.sources.map(s=>({noteId:s.noteId,quote:s.quote,title:String(s.title||''),path:typeof s.path==='string'?s.path:undefined}))};
        if(isTask){if(!['reason','nextAction','uncertainty'].every(k=>typeof item[k]==='string')||!['high','medium','low'].includes(item.priority))throw Error('助手建议备份无效。');Object.assign(obj,{reason:item.reason,nextAction:item.nextAction,uncertainty:item.uncertainty,priority:item.priority});}
        else{if(typeof item.detail!=='string')throw Error('助手主线备份无效。');obj.detail=item.detail;}
        return obj;
      }
      restored={summary:r.summary,tasks:r.tasks.map(t=>cleanItem(t,true)),themes:r.themes.map(t=>cleanItem(t,false)),questions:r.questions,mode:r.mode==='cloud'?'cloud':'snapshot',model:String(r.model||''),generatedAt:String(r.generatedAt||''),noteIds:Array.isArray(r.noteIds)?r.noteIds.filter(s=>typeof s==='string'):[]};
    }
    return {id:'research-assistant',version:1,plan,result:restored};
  }
  function mergedBackup(value,entryMap=new Map()){const imported=normalizeState(value),known=new Set(state.plan.map(keyOf));for(const item of [...imported.plan,...(imported.result?.tasks||[]),...(imported.result?.themes||[])])for(const ref of item.sources)if(entryMap.has(ref.noteId))ref.noteId=entryMap.get(ref.noteId);if(imported.result)imported.result.noteIds=imported.result.noteIds.map(id=>entryMap.get(id)||id);const plan=[...state.plan,...imported.plan.filter(t=>!known.has(keyOf(t))).map(t=>({...t,id:uid()}))];if(plan.length>100)throw Error('恢复后任务超过 100 项，请先从已完成 / 暂缓中移除旧记录。未导入任何内容。');return {...state,result:state.result||imported.result,plan};}
  async function init(){
    const stored=(await readAll('settings')).find(s=>s.id==='research-assistant');
    if(stored){try{state=normalizeState(stored);}catch{toast('助手计划格式异常，已保留原数据；请先导出备份。');}}
    el('assistant-open').onclick=()=>show(true);el('ai-show-library').onclick=()=>show(false);
    document.addEventListener('click',handle(async e=>{
      if(e.target.closest('[data-nav]')&&visible)show(false);
      const close=e.target.closest('[data-ai-close]');if(close){if(running&&close.dataset.aiClose==='ai-review')return;el(close.dataset.aiClose).close();}
      const source=e.target.closest('[data-ai-source]');if(source)await openNote(source.dataset.aiSource);
      const action=e.target.closest('[data-ai-task]');
      if(action){if(state.plan.length>=100)throw Error('计划已达 100 项，请先整理现有计划。');const task=result().tasks[Number(action.dataset.index)];if(!task||state.plan.some(t=>keyOf(t)===keyOf(task)))return;await commit({...state,plan:[...state.plan,{...structuredClone(task),id:uid(),status:action.dataset.aiTask,date:localDay()}]});}
      const status=e.target.closest('[data-ai-state]');if(status)await commit({...state,plan:state.plan.map(t=>t.id===status.dataset.planId?{...t,status:status.dataset.aiState,date:localDay()}:t)});
      const remove=e.target.closest('[data-ai-remove]');if(remove&&await ask('移除这条任务记录？','此状态将不再参与后续分析，助手可能再次提出相关建议。'))await commit({...state,plan:state.plan.filter(t=>t.id!==remove.dataset.aiRemove)});
    }));
    document.addEventListener('change',handle(async e=>{if(e.target.matches('[data-ai-complete]')){await commit({...state,plan:state.plan.map(t=>t.id===e.target.dataset.aiComplete?{...t,status:'done',date:localDay()}:t)});}if(e.target.matches('[data-ai-select]'))updateSelection();}));
    el('ai-settings-open').onclick=handle(settings);el('ai-analyze-open').onclick=handle(review);el('ai-retrieve').onclick=retrieve;el('ai-range').onchange=retrieve;el('ai-run').onclick=handle(runAnalysis);
    try{el('ai-web-search').checked=localStorage.getItem('yixin-ai-web-search')==='true';el('ai-search-query').value=localStorage.getItem('yixin-ai-search-query')||'';}catch{}el('ai-search-query').hidden=!el('ai-web-search').checked;el('ai-web-search').onchange=()=>{el('ai-search-query').hidden=!el('ai-web-search').checked;try{localStorage.setItem('yixin-ai-web-search',el('ai-web-search').checked);}catch{}};el('ai-search-query').oninput=()=>{try{localStorage.setItem('yixin-ai-search-query',el('ai-search-query').value);}catch{}};
    el('ai-recheck').onclick=handle(()=>configStatus());el('ai-cancel').onclick=()=>controller?.abort();el('ai-review').addEventListener('cancel',e=>{if(running)e.preventDefault();});
    el('ai-settings-form').onsubmit=async e=>{e.preventDefault();el('ai-settings-save').disabled=true;try{await api('config',{baseUrl:el('ai-base-url').value.trim(),model:el('ai-model').value.trim(),apiKey:el('ai-key').value.trim()});el('ai-key').value='';await configStatus();el('ai-settings').close();toast('本次连接已配置，可选择日志进行分析');}catch(error){el('ai-settings-message').textContent=error.message;}finally{el('ai-settings-save').disabled=false;}};
    el('ai-settings').addEventListener('close',()=>{el('ai-key').value='';});
    el('ai-disconnect').onclick=handle(async()=>{if(config)await api('config',{clear:true});el('ai-key').value='';await configStatus();el('ai-settings-message').textContent='本浏览器的模型连接已清除。';});
    el('ai-plan-note').onclick=handle(async()=>{const active=state.plan.filter(t=>t.status==='today');if(!active.length)return;const body=active.map(t=>`- [ ] ${t.title}\n  下一步：${t.nextAction}\n${t.sources.map(s=>`  依据：${s.title||s.path} — ${s.quote}`).join('\n')}`).join('\n\n');const n=await createNote('note',`${localDay()} · 科研计划`,body);n.tags=['助手计划'];await persist(n);await openNote(n.id);toast('今日计划已保存为可导出的笔记');});
    render();if(location.hash==='#assistant')show(true);void configStatus();
  }
  return {getConnection:async()=>{if(!await configStatus())throw Error(configError);return {...config};},openSettings:settings,init,show,render,onLibraryRender:()=>{if(visible)render();},get visible(){return visible;},backup:()=>structuredClone(state),mergedBackup,reload:async()=>{const stored=(await readAll('settings')).find(s=>s.id==='research-assistant');if(stored){state=stored;render();}},_test:{dateOf,excerpt,validateResult,keyOf}};
})();
