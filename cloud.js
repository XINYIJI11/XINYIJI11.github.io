'use strict';
window.Cloud=(()=>{
  let database,enabled=false,busy=false,timer,conflict=null,lastError='';
  const keyOf=(store,id)=>store+'|'+id;
  const get=(store,id)=>new Promise((resolve,reject)=>{const r=database.transaction(store).objectStore(store).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const all=store=>new Promise((resolve,reject)=>{const r=database.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  function local(stores,work){return new Promise((resolve,reject)=>{const tx=database.transaction(stores,'readwrite');try{work(tx);}catch(e){tx.abort();reject(e);return;}tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('本机缓存写入失败。'));});}
  function status(message,error=false){lastError=error?message:'';const el=document.getElementById('cloud-status');if(el)el.textContent=message;const bar=document.getElementById('cloud-bar');if(bar)bar.dataset.error=String(error);}
  async function api(path,options={}){const response=await Account.request('/api/storage/'+path,options);let data;try{data=await response.json();}catch{throw Error('云端返回异常，请稍后重试。');}if(!response.ok&&response.status!==409)throw Error(data.error||'云端保存失败。');return{...data,status:response.status};}
  function capture(tx,store,method,value){
    if(!enabled||!['entries','settings','blobs'].includes(store)||!['put','add','delete'].includes(method))return;
    const id=method==='delete'?value:value.id,key=keyOf(store,id),generation=crypto.randomUUID();
    const metadata=tx.objectStore('syncmeta').get(key);
    metadata.onsuccess=()=>{
      const pending=tx.objectStore('syncoutbox').get(key);
      pending.onsuccess=()=>tx.objectStore('syncoutbox').put({id:key,store,recordId:id,base:pending.result?.base??metadata.result?.revision??0,deleted:method==='delete',value:method==='delete'?null:value,generation});
    };
  }
  function wrap(tx){return{objectStore(name){const store=tx.objectStore(name);return new Proxy(store,{get(target,property){if(['put','add','delete'].includes(property))return value=>{const result=target[property](value);capture(tx,name,property,value);return result;};const value=target[property];return typeof value==='function'?value.bind(target):value;}});}};}
  async function init(db){
    database=db;status('正在读取云端资料…');
    if(navigator.locks){
      await new Promise((resolve,reject)=>navigator.locks.request('yixin-library-editor',{ifAvailable:true},async lock=>{
        if(!lock){reject(Error('此浏览器已有知识库页面正在编辑，请关闭另一页后刷新。'));return;}
        resolve();await new Promise(()=>{});
      }).catch(reject));
    }
    const remote=[];let after=0;do{const page=await api('records?after='+after);remote.push(...page.rows);after=page.next;}while(after!==null);
    const initialized=await get('syncmeta','initialized'),pending=new Map((await all('syncoutbox')).map(x=>[x.id,x]));
    if(!initialized){
      const remoteMap=new Map(remote.map(x=>[keyOf(x.store,x.id),x]));
      for(const store of ['entries','settings','blobs'])for(const value of await all(store)){
        const key=keyOf(store,value.id),row=remoteMap.get(key);
        if(row&&!row.deleted&&JSON.stringify(row.value)===JSON.stringify(value))continue;
        if(!pending.has(key))pending.set(key,{id:key,store,recordId:value.id,base:0,deleted:false,value,generation:crypto.randomUUID()});
      }
    }
    await local(['entries','settings','syncmeta','syncoutbox'],tx=>{
      for(const row of remote){const key=keyOf(row.store,row.id);if(!pending.has(key)){if(row.deleted)tx.objectStore(row.store).delete(row.id);else tx.objectStore(row.store).put(row.value);tx.objectStore('syncmeta').put({id:key,revision:row.revision});}}
      for(const item of pending.values())tx.objectStore('syncoutbox').put(item);
      tx.objectStore('syncmeta').put({id:'initialized',at:Date.now()});
    });
    enabled=true;
    document.getElementById('cloud-status').onclick=()=>conflict?showConflict():flush().then(()=>{if(!confirm('已完成上传。是否刷新页面，读取其他设备的最新内容？'))return;location.reload();}).catch(e=>status(e.message,true));
    window.addEventListener('online',schedule);
    window.addEventListener('beforeunload',event=>{if(busy||lastError){event.preventDefault();event.returnValue='';}});
    status(pending.size?'正在合并本机资料…':'云端已同步 · 点击刷新');schedule();
  }
  async function acknowledge(item,revision){
    await local(['syncoutbox','syncmeta'],tx=>{
      tx.objectStore('syncmeta').put({id:item.id,revision});
      const r=tx.objectStore('syncoutbox').get(item.id);r.onsuccess=()=>{if(r.result?.generation===item.generation)tx.objectStore('syncoutbox').delete(item.id);else if(r.result)tx.objectStore('syncoutbox').put({...r.result,base:revision});};
    });
  }
  async function drain(){
    if(!enabled)return;
    if(conflict)throw Error('发现多设备版本冲突，点击此处选择版本。');
    for(;;){
      const pending=(await all('syncoutbox')).sort((a,b)=>(a.store==='blobs'?0:1)-(b.store==='blobs'?0:1));
      if(!pending.length){status('云端已同步 · 点击刷新');return;}
      status('正在上传 · 剩余 '+pending.length+' 项');
      for(const item of pending){
        let response;
        if(item.store==='blobs'){
          if(item.deleted)response={status:200,revision:1};
          else response=await api('blob?id='+encodeURIComponent(item.recordId),{method:'PUT',headers:{'Content-Type':item.value.blob.type||'application/octet-stream'},body:item.value.blob});
        }else response=await api('record',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({store:item.store,id:item.recordId,base:item.base,deleted:item.deleted,value:item.value})});
        if(response.status===409){
          const same=response.current&&response.current.deleted===item.deleted&&JSON.stringify(response.current.value)===JSON.stringify(item.value);
          if(same){await acknowledge(item,response.current.revision);continue;}
          if(!response.current)throw Error(response.error);
          conflict={item,current:response.current};showConflict();throw Error('发现多设备版本冲突，点击此处选择版本。');
        }
        await acknowledge(item,response.revision||1);
      }
    }
  }
  async function flush(){
    if(busy){await busy;return flush();}
    busy=(navigator.locks?navigator.locks.request('yixin-cloud-upload',drain):drain());
    try{await busy;}catch(e){status((e.message==='Failed to fetch'?'网络暂不可用；修改已保留在本机，联网后会重试。':e.message),true);throw e;}finally{busy=false;}
  }
  function schedule(){if(!enabled)return;if(conflict){status('云端未保存：存在版本冲突 · 点击处理',true);return;}status('修改已保存在本机 · 等待上传');clearTimeout(timer);timer=setTimeout(()=>flush().catch(()=>{if(!conflict)timer=setTimeout(schedule,15000);}),700);}
  async function blob(id){const cached=await get('blobs',id);if(cached)return cached.blob;const response=await Account.request('/api/storage/blob?id='+encodeURIComponent(id));if(!response.ok)throw Error('附件暂时无法下载，请联网后重试。');const value=await response.blob();await local(['blobs'],tx=>tx.objectStore('blobs').put({id,blob:value}));return value;}
  function showConflict(){
    if(!conflict)return;let dialog=document.getElementById('cloud-conflict');if(dialog)dialog.remove();dialog=document.createElement('dialog');dialog.id='cloud-conflict';
    const title=document.createElement('h2');title.textContent='两台设备都修改了这份内容';const text=document.createElement('p');text.textContent=conflict.item.value?.title||({'literature':'文献库与播报','research-assistant':'科研助手计划与设置','config':'文件夹设置'})[conflict.item.recordId]||conflict.item.recordId;
    const info=document.createElement('p');info.textContent='两个版本都会保留备份。选择后继续同步；选择云端版本后刷新页面生效。';dialog.append(title,text,info);
    for(const [label,choice] of [['下载两个版本','download'],['保留本机版本','local'],['使用云端版本','remote'],['稍后处理','later']]){const button=document.createElement('button');button.textContent=label;button.onclick=async()=>{
      if(choice==='later'){dialog.close();return;}
      const {item,current}=conflict;
      if(choice==='download'){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify({local:item.value,cloud:current.value},null,2)],{type:'application/json'}));a.href=url;a.download='一心问道-版本备份.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
      button.disabled=true;
      try{await local(['syncoutbox','syncmeta',item.store],tx=>{
        tx.objectStore('syncmeta').put({id:'conflict-backup-'+Date.now(),recordId:item.recordId,local:item.value,cloud:current.value});
        const r=tx.objectStore('syncoutbox').get(item.id);r.onsuccess=()=>{
          if(choice==='local'&&r.result)tx.objectStore('syncoutbox').put({...r.result,base:current.revision});
          else if(r.result?.generation===item.generation){tx.objectStore('syncoutbox').delete(item.id);tx.objectStore('syncmeta').put({id:item.id,revision:current.revision});if(current.deleted)tx.objectStore(item.store).delete(item.recordId);else tx.objectStore(item.store).put(current.value);}
        };
      });conflict=null;dialog.close();await flush();if(choice==='remote')location.reload();}catch(e){status(e.message,true);}finally{button.disabled=false;}
    };dialog.append(button);}document.body.append(dialog);dialog.showModal();
  }
  return{init,wrap,schedule,flush,blob,get enabled(){return enabled;}};
})();

