'use strict';
window.renderWebSources=(container,context)=>{
  const details=document.createElement('details'),summary=document.createElement('summary');details.className='web-sources';summary.textContent=`联网来源 · ${context.provider||'公开文献'} · ${context.sources?.length||0} 条`;details.append(summary);
  const info=document.createElement('p');info.textContent=`搜索词：${context.query||''} · ${context.retrievedAt?new Date(context.retrievedAt).toLocaleString('zh-CN'):''}。仅题录与可用摘要，未读取全文。`;details.append(info);
  for(const source of (context.sources||[]).slice(0,10)){let url;try{url=new URL(source.url);if(url.protocol!=='https:'||url.username||url.password)continue;}catch{continue;}const row=document.createElement('p'),a=document.createElement('a');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=`[${source.id}] ${source.title}`;row.append(a,document.createTextNode(' · '+(source.year||'年份未知')+' · '+(source.scope||'题录')));details.append(row);}
  if(!context.sources?.length){const empty=document.createElement('p');empty.textContent='未找到匹配文献，可以改用英文关键词。';details.append(empty);}container.append(details);
};
