'use strict';
window.MediaPreview=(()=>{
  const cache=new Map();let active=0;const jobs=[];
  function schedule(job){return new Promise(resolve=>{jobs.push({job,resolve});pump();});}
  function pump(){while(active<2&&jobs.length){const {job,resolve}=jobs.shift();active++;Promise.resolve().then(job).catch(()=>null).then(resolve).finally(()=>{active--;pump();});}}
  function snapshot(source,w,h){if(!w||!h)return null;const scale=Math.min(1,640/w,400/h),canvas=document.createElement('canvas');canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/webp',.8);}
  function imageThumb(blob){return new Promise(resolve=>{const image=new Image(),url=URL.createObjectURL(blob);let timer;const done=value=>{clearTimeout(timer);image.onload=image.onerror=null;URL.revokeObjectURL(url);resolve(value);};timer=setTimeout(()=>done(null),7000);image.onload=()=>{try{done(snapshot(image,image.naturalWidth,image.naturalHeight));}catch{done(null);}};image.onerror=()=>done(null);image.src=url;});}
  function videoThumb(blob){return new Promise(resolve=>{const video=document.createElement('video'),url=URL.createObjectURL(blob);let timer,ended=false;const done=value=>{if(ended)return;ended=true;clearTimeout(timer);video.onloadeddata=video.onseeked=video.onerror=null;video.removeAttribute('src');video.load();URL.revokeObjectURL(url);resolve(value);};const capture=()=>{try{done(snapshot(video,video.videoWidth,video.videoHeight));}catch{done(null);}};timer=setTimeout(()=>done(null),8000);video.muted=true;video.playsInline=true;video.preload='auto';video.onloadeddata=()=>{if(Number.isFinite(video.duration)&&video.duration>.2){video.onseeked=capture;video.currentTime=Math.min(.5,video.duration/4);}else capture();};video.onerror=()=>done(null);video.src=url;});}
  async function officeThumb(blob){if(!window.JSZip||blob.size>50*1024*1024)return null;const zip=await JSZip.loadAsync(await blob.arrayBuffer());if(Object.keys(zip.files).length>10000)return null;const entry=Object.values(zip.files).find(f=>/^(docProps\/thumbnail\.(png|jpe?g)|Thumbnails\/thumbnail\.png)$/i.test(f.name));if(!entry||entry._data?.uncompressedSize>3*1024*1024)return null;const bytes=await entry.async('uint8array');if(bytes.length>3*1024*1024)return null;return imageThumb(new Blob([bytes],{type:/png$/i.test(entry.name)?'image/png':'image/jpeg'}));}
  function get(a,blob){if(!blob)return Promise.resolve(null);if(cache.has(a.id))return cache.get(a.id);const kind=fileKind(a.name);const job=schedule(()=>kind==='image'?imageThumb(blob):kind==='video'?videoThumb(blob):/\.(pptx|docx|xlsx|odp|odt|ods)$/i.test(a.name)?officeThumb(blob):null);if(cache.size>250)cache.delete(cache.keys().next().value);cache.set(a.id,job);return job;}
  return {get};
})();
document.addEventListener('paste',event=>{
  if(!db)return;
  const files=[...(event.clipboardData?.files||[])];
  if(!files.length)return;
  if(document.querySelector('dialog[open]')&&!document.querySelector('#editor[open]'))return;
  event.preventDefault();attachMode=!!current;
  handle(()=>uploadFiles(files))();
});
async function pasteMedia(){
  if(!navigator.clipboard?.read){toast('此浏览器无法主动读取文件，请在页面按 Ctrl+V；也可以把文件拖进来。');return;}
  try{const items=await navigator.clipboard.read(),files=[];for(const item of items){const type=item.types.find(t=>t.startsWith('image/'))||item.types.find(t=>/^(video\/|audio\/|application\/(pdf|vnd\.|octet-stream))/.test(t));if(type){const blob=await item.getType(type),ext=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','video/mp4':'mp4','application/pdf':'pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation':'pptx','application/vnd.ms-powerpoint':'ppt'})[type]||'bin';files.push(new File([blob],`粘贴-${new Date().toISOString().replace(/[:.]/g,'-')}.${ext}`,{type}));}}if(files.length){attachMode=!!current;await uploadFiles(files);}else toast('剪贴板未提供可读取的文件。截图可直接 Ctrl+V；若复制的是文件路径，请把原文件拖入页面。');}catch(e){toast(e.name==='NotAllowedError'?'剪贴板权限未开放，请在页面直接按 Ctrl+V，或拖入文件。':e.message);}
}
