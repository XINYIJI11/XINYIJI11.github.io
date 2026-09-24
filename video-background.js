'use strict';
(()=>{
  const key='yixin-video-background-v1',reduced=matchMedia('(prefers-reduced-motion: reduce)');let enabled=true,override=false,blocked=false;
  try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved){enabled=saved.enabled!==false;override=saved.override===true;}}catch{}
  document.body.classList.add('has-video-wallpaper');
  let layer=document.getElementById('wallpaper');if(!layer){layer=document.createElement('div');layer.id='wallpaper';layer.setAttribute('aria-hidden','true');document.body.prepend(layer);}
  const video=document.createElement('video');video.id='wallpaper-video';video.muted=true;video.defaultMuted=true;video.loop=true;video.playsInline=true;video.preload='metadata';video.poster='./assets/night-poster.jpg';video.setAttribute('aria-hidden','true');video.setAttribute('tabindex','-1');video.disablePictureInPicture=true;layer.append(video);
  const button=document.createElement('button');button.id='wallpaper-play-toggle';button.type='button';button.className='button secondary';
  const settings=document.querySelector('#appearance-dialog .appearance-source'),chat=document.querySelector('.header-actions');if(settings){const row=document.createElement('div');row.className='appearance-row';row.append(button);settings.before(row);}else chat?.prepend(button);
  function allowed(){let appearanceOverride=false;try{appearanceOverride=JSON.parse(localStorage.getItem('yixin-appearance-v1')||'{}').motionOverride===true;}catch{}return enabled&&(!reduced.matches||override||appearanceOverride);}
  function label(){button.textContent=video.paused?'播放动态背景':'暂停动态背景';button.setAttribute('aria-pressed',String(!video.paused));button.title=blocked?'浏览器暂停了自动播放，点击继续播放':reduced.matches&&!allowed()?'已遵循系统减少动态效果设置，可点击播放':'侧脸 · 光斑 · 夜晚';}
  function sync(){if(!allowed()||document.hidden){video.pause();label();return;}if(!video.getAttribute('src'))video.src='./assets/night-background.mp4';video.play().then(()=>{blocked=false;label();}).catch(()=>{blocked=true;label();});}
  button.onclick=()=>{if(video.paused){enabled=true;override=true;}else enabled=false;try{localStorage.setItem(key,JSON.stringify({enabled,override}));}catch{}sync();};
  video.addEventListener('play',label);video.addEventListener('pause',label);video.addEventListener('error',()=>{video.hidden=true;button.textContent='视频未加载，点击重试';button.onclick=()=>{video.hidden=false;video.load();sync();};});
  document.addEventListener('visibilitychange',sync);document.addEventListener('change',e=>{if(e.target.id==='motion-override')sync();});reduced.addEventListener('change',sync);window.addEventListener('pagehide',()=>video.pause());window.addEventListener('pageshow',sync);sync();label();
})();
