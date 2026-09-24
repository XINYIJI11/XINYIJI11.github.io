(() => {
  'use strict';
  const el=id=>document.getElementById(id),welcome=el('messages').innerHTML;
  let current=null,settings={name:'肉包'},threads=[],csrf='',busy=false,loading=false;
  const status=text=>el('chat-status').textContent=text;
  async function api(path,data){
    if(data!==undefined){const config=await fetch('./api/config',{cache:'no-store'});if(!config.ok)throw Error('登录会话已失效，请刷新页面。');csrf=(await config.json()).csrf;}
    const response=await fetch('./api/chat/'+path,{cache:'no-store',...(data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Folio-Token':csrf},body:JSON.stringify(data)}),signal:AbortSignal.timeout(140000)});
    let result;try{result=await response.json();}catch{throw Error('服务暂不可用，请稍后重试。');}
    if(!response.ok)throw Error(result.error||'保存失败，请稍后重试。');return result;
  }
  function controls(){for(const id of ['send','new-thread','delete-thread','export-thread'])el(id).disabled=busy||loading;el('question').disabled=busy||loading;el('chat-web-search').disabled=busy||loading;el('chat-search-query').disabled=busy||loading;el('retry').disabled=busy||loading;el('delete-thread').disabled=busy||loading||!current;el('export-thread').disabled=busy||loading||!current;}
  function renderList(){el('thread-list').replaceChildren();for(const thread of threads){const button=document.createElement('button');button.textContent=thread.title;button.title=thread.title;button.classList.toggle('active',thread.id===current?.id);button.onclick=()=>openThread(thread.id);el('thread-list').append(button);}}
  function renderContent(container,text){
    const pieces=text.split(/(```[\s\S]*?```)/g);
    for(const piece of pieces){if(piece.startsWith('```')&&piece.endsWith('```')){const pre=document.createElement('pre'),code=document.createElement('code');code.textContent=piece.slice(3,-3).replace(/^[\w+-]*\n/,'');pre.append(code);container.append(pre);}else container.append(document.createTextNode(piece));}
  }
  function render(){
    el('thread-title').textContent=current?.title||'和'+settings.name+'聊聊';
    const area=el('messages');area.replaceChildren();
    if(!current?.messages.length)area.innerHTML=welcome;
    for(const msg of current?.messages||[]){const article=document.createElement('article');article.className='message '+msg.role;const who=document.createElement('div');who.className='who';who.textContent=msg.role==='user'?'我':settings.name;const content=document.createElement('div');content.className='content';renderContent(content,msg.content);article.append(who,content);if(msg.webContext)renderWebSources(article,msg.webContext);if(msg.role==='user'&&msg.webSearch){const tag=document.createElement('small');tag.textContent='联网搜索词：'+msg.searchQuery;article.append(tag);}if(msg.truncated){const note=document.createElement('p');note.className='note';note.textContent='回答达到长度上限，可以继续追问。';article.append(note);}area.append(article);}
    el('retry').hidden=current?.messages.at(-1)?.role!=='user'||busy;
    renderList();controls();area.scrollTop=area.scrollHeight;
  }
  async function refreshList(){const state=await api('state');settings=state.settings;el('chat-web-search').checked=settings.webSearch===true;el('chat-search-query').hidden=!settings.webSearch;threads=state.threads;document.querySelectorAll('.assistant-name').forEach(x=>x.textContent=settings.name);el('connection').textContent=state.configured?'DeepSeek V4.1 Flash · 云端记忆':'DeepSeek 尚未连接';renderList();}
  async function openThread(id){if(busy||loading)return;loading=true;controls();status('正在读取会话…');try{const result=await api('thread?id='+encodeURIComponent(id));current=result;sessionStorage.setItem('roubao-active',id);status(result.busy?'肉包正在回答，稍后点击此会话刷新。':'已从云端读取');render();}catch(e){status(e.message);}finally{loading=false;controls();}}
  async function newThread(){if(busy||loading)return;loading=true;controls();try{current=await api('new',{});sessionStorage.setItem('roubao-active',current.id);await refreshList();render();status('新会话已保存');}catch(e){status(e.message);}finally{loading=false;controls();el('question').focus();}}
  async function send(retry=false){
    if(busy||loading)return;const previous=current?.messages.at(-1),content=retry?previous?.content:el('question').value.trim();if(!content)return;if(!retry&&el('chat-web-search').checked&&!el('chat-search-query').value.trim()){status('请填写联网搜索词；只发送这些词给检索服务。');return;}
    if(!retry&&previous?.role==='user'){status('上一条问题尚未回答，请点击“重试上一条问题”。');return;}
    busy=true;controls();el('retry').hidden=true;status('肉包正在思考，问题会先保存到云端…');
    const requestId=retry?previous.id:crypto.randomUUID(),webSearch=retry?previous.webSearch===true:el('chat-web-search').checked,searchQuery=retry?previous.searchQuery||'':el('chat-search-query').value.trim();
    try{
      if(!current){current=await api('new',{});sessionStorage.setItem('roubao-active',current.id);}
      if(!retry)current.messages.push({id:requestId,role:'user',content,webSearch,searchQuery});render();
      current=await api('send',{id:current.id,content,requestId,webSearch,searchQuery});
      el('question').value='';sessionStorage.removeItem('roubao-draft');status('回答与上下文已保存到云端');
    }catch(e){status(e.name==='TimeoutError'?'等待超时，问题已保留。请重新打开此会话查看，或稍后重试。':e.message);}
    finally{busy=false;render();try{await refreshList();}catch{}controls();}
  }
  el('chat-web-search').onchange=async()=>{const checked=el('chat-web-search').checked;el('chat-search-query').hidden=!checked;el('chat-web-search').disabled=true;try{settings=(await api('settings',{...settings,webSearch:checked})).settings;}catch(e){el('chat-web-search').checked=settings.webSearch===true;el('chat-search-query').hidden=!settings.webSearch;status(e.message);}finally{controls();}};
  el('chat-form').onsubmit=e=>{e.preventDefault();send();};
  el('question').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send();}};
  el('question').value=sessionStorage.getItem('roubao-draft')||'';
  el('question').oninput=()=>sessionStorage.setItem('roubao-draft',el('question').value);
  el('messages').onclick=e=>{const button=e.target.closest('[data-prompt]');if(button&&!busy){el('question').value=button.dataset.prompt;el('question').focus();}};
  el('new-thread').onclick=newThread;el('retry').onclick=()=>send(true);
  el('delete-thread').onclick=async()=>{if(!current||busy||loading||!confirm('删除当前会话及其中的全部聊天记录？此操作无法撤销。'))return;loading=true;controls();try{await api('delete',{id:current.id});current=null;sessionStorage.removeItem('roubao-active');await refreshList();render();status('会话已删除');}catch(e){status(e.message);}finally{loading=false;controls();}};
  el('export-thread').onclick=()=>{if(!current)return;const text='# '+current.title+'\n\n'+current.messages.map(m=>'## '+(m.role==='user'?'我':settings.name)+'\n\n'+m.content).join('\n\n');const url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='肉包科研讨论-'+new Date().toISOString().slice(0,10)+'.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  el('settings-open').onclick=()=>{el('assistant-name').value=settings.name;el('background').value=settings.background||'';el('instructions').value=settings.instructions||'';el('detail').value=settings.detail||'balanced';el('settings-status').textContent='';el('settings').showModal();};el('settings-close').onclick=()=>el('settings').close();
  el('settings-form').onsubmit=async e=>{e.preventDefault();el('settings-save').disabled=true;try{const result=await api('settings',{webSearch:el('chat-web-search').checked,name:el('assistant-name').value,background:el('background').value,instructions:el('instructions').value,detail:el('detail').value});settings=result.settings;document.querySelectorAll('.assistant-name').forEach(x=>x.textContent=settings.name);render();el('settings').close();status('偏好已保存，下次提问起生效');}catch(e){el('settings-status').textContent=e.message;}finally{el('settings-save').disabled=false;}};
  (async()=>{loading=true;controls();try{await Account.ready;await refreshList();loading=false;const id=sessionStorage.getItem('roubao-active');if(id&&threads.some(t=>t.id===id))await openThread(id);else render();status(current?.busy?'肉包正在回答，请稍后重新打开会话。':'');}catch(e){status(e.message);}finally{loading=false;controls();}})();
})();
