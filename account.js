'use strict';
window.Account=(()=>{
  const nativeFetch=window.fetch.bind(window),base=window.YIXIN_BACKEND||location.origin;
  let token=sessionStorage.getItem('yixin-session')||'',resolveReady;
  const ready=new Promise(resolve=>resolveReady=resolve);
  async function request(path,options={}){
    const headers=new Headers(options.headers);if(token)headers.set('Authorization','Bearer '+token);
    // The private hosting gateway also needs its own same-origin login cookie.
    // Cross-origin Pages requests use our bearer token, never third-party cookies.
    const response=await nativeFetch(base+path,{...options,headers,credentials:new URL(base).origin===location.origin?'same-origin':'omit',redirect:'manual'});
    if(response.type==='opaqueredirect'||response.status===0||response.status>=300&&response.status<400)throw Error('网站外层登录已过期，请刷新页面并完成网站登录，再使用 ZS 登录。');
    if(path.startsWith('/api/')&&!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))throw Error('登录网关或服务器返回了网页，未能连接 API。请刷新并完成外层登录后重试；这不代表密码错误。');
    if(response.status===401&&!path.startsWith('/api/auth/'))showLogin('登录已过期，请重新登录；未同步的内容仍保留在本机。');
    return response;
  }
  window.fetch=(input,options)=>{
    const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);
    const prefix=new URL('./api/',location.href).pathname;
    if([location.origin,base].includes(url.origin)&&url.pathname.startsWith(prefix))return request('/api/'+url.pathname.slice(prefix.length)+url.search,options);
    if(url.origin===base&&url.pathname.startsWith('/api/'))return request(url.pathname+url.search,options);
    return nativeFetch(input,options);
  };
  function showLogin(message=''){
    document.body.classList.remove('account-ready');document.getElementById('account-gate').hidden=false;
    document.getElementById('account-error').textContent=message;
  }
  function accept(){document.body.classList.add('account-ready');document.getElementById('account-gate').hidden=true;resolveReady();}
  async function loadScript(name){
    const response=await request('/'+name);if(!response.ok)throw Error('旧资料暂时无法读取，请稍后刷新。');
    const blob=URL.createObjectURL(new Blob([await response.text()],{type:'text/javascript'}));
    try{await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=blob;script.onload=()=>{script.remove();resolve();};script.onerror=()=>{script.remove();reject(Error('资料加载失败。'));};document.head.append(script);});}finally{URL.revokeObjectURL(blob);}
  }
  async function setup(){
    const gate=document.createElement('section');gate.id='account-gate';gate.innerHTML='<form><h1>一心问道</h1><p>登录你的私人科研空间。日志、附件与对话在云端保存。</p><label>用户名<input name="username" autocomplete="username" value="ZS" required maxlength="100"></label><label>密码<input name="password" type="password" autocomplete="current-password" required maxlength="256"></label><p id="account-error" role="status"></p><button type="submit">进入我的空间</button><p>会话最长 12 小时。无需登录 ChatGPT。</p></form>';document.body.append(gate);
    const bar=document.createElement('div');bar.id='cloud-bar';bar.innerHTML='<button id="cloud-status" title="查看云端同步状态">云端空间 · ZS</button><button id="account-logout">退出登录</button>';document.body.append(bar);
    document.getElementById('account-logout').onclick=async()=>{
      if(window.Cloud){try{await window.Cloud.flush();}catch{if(!confirm('还有内容未同步，退出后将保留在此浏览器，是否退出？'))return;}}
      try{const response=await request('/api/auth/logout',{method:'POST'});if(!response.ok)throw Error();}catch{alert('退出请求未完成，请联网后重试。');return;}
      token='';sessionStorage.removeItem('yixin-session');location.reload();
    };
    gate.querySelector('form').onsubmit=async event=>{
      event.preventDefault();const form=event.target,button=form.querySelector('button'),error=document.getElementById('account-error');button.disabled=true;error.textContent='正在验证…';
      try{const response=await request('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:form.username.value,password:form.password.value})});const data=await response.json();if(!response.ok)throw Error(data.error||'登录失败。');if(typeof data.token!=='string'||!/^([a-f0-9]{64})$/.test(data.token))throw Error('登录接口未返回有效会话，请稍后重试。');token=data.token;sessionStorage.setItem('yixin-session',token);form.password.value='';accept();window.Cloud?.schedule();}
      catch(e){error.textContent=e.message==='Failed to fetch'?'无法连接后端，请检查网络后重试。':e.message;}finally{button.disabled=false;}
    };
    if(token){try{const response=await request('/api/auth/me');if(response.ok){const data=await response.json();if(typeof data.username!=='string')throw Error('会话校验响应异常，请稍后重试。');accept();return;}if(response.status!==401)throw Error('会话校验暂不可用，请稍后重试。');}catch(e){showLogin(e.message==='Failed to fetch'?'连接暂时失败，请检查网络后登录。':e.message);return;}token='';sessionStorage.removeItem('yixin-session');}
    showLogin();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
  return{ready,request,loadScript,async loadSeeds(){for(const name of ['research-manifest.js','assistant-brief.js','literature-seed.js','zotero-library.js'])await loadScript(name);}};
})();
