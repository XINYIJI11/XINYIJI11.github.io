'use strict';
// Original archives are fetched only through the authenticated backend.
window.importResearchArchive = async function (settings) {
  const manifest = window.RESEARCH_MANIFEST;
  if (!manifest || settings.some(s => s.id === manifest.id)) return;
  $('#result-count').textContent = `正在导入 ${manifest.notes} 篇科研记录与 ${manifest.files} 个附件…`;
  const scripts = [];
  try {
    for (const name of manifest.bundles || [manifest.bundle]) {
    await Account.loadScript(name);
    }
    const bundle = window.RESEARCH_BUNDLE;
    if (!bundle || !Array.isArray(bundle.entries) || !Array.isArray(bundle.files)) throw new Error('科研日志包不完整。');
    validateBackup({ ...bundle, format: 'folio-backup', version: 1 });
    const storedIds = new Set(entries.map(n => n.id));
    const additions = bundle.entries.filter(n => !storedIds.has(n.id));
    const storedBlobs = new Set(await new Promise((resolve, reject) => {
      const request = db.transaction('blobs').objectStore('blobs').getAllKeys();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));
    const blobs = [];
    for (const item of bundle.files) {
      if (storedBlobs.has(item.id)) continue;
      const comma = item.data.indexOf(',');
      const raw = atob(item.data.slice(comma + 1));
      const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
      if (bytes.length > MAX_FILE) throw new Error('科研附件超过当前单文件大小限制。');
      blobs.push({ id: item.id, blob: new Blob([bytes], {type: item.data.slice(5, item.data.indexOf(';'))}) });
      item.data = '';
    }
    const nextFolders = [...new Set([...folders, ...bundle.folders])];
    await transaction(['entries', 'blobs', 'settings'], 'readwrite', tx => {
      additions.forEach(n => tx.objectStore('entries').put(n));
      blobs.forEach(b => tx.objectStore('blobs').put(b));
      tx.objectStore('settings').put({id: 'config', folders: nextFolders});
      tx.objectStore('settings').put({id: manifest.id, importedAt: Date.now(), notes: manifest.notes, files: manifest.files});
    });
    folders = nextFolders;
    entries.push(...additions);
    nav = 'folder:科研日志';
    toast(`已导入 ${manifest.notes} 篇科研记录、${manifest.files} 个附件`);
  } finally {
    delete window.RESEARCH_BUNDLE;
    scripts.forEach(script => script.remove());
  }
};

// A blob may be referenced by several notes and by its standalone library card.
function blobUsedElsewhere(blobId, excludeEntryId) {
  return entries.some(n => n.id !== excludeEntryId && n.attachments.some(a => a.id === blobId));
}

async function previewResearchEmbeds() {
  if (!current || $('#markdown-preview').hidden) return;
  const entryId = current.id;
  const sourceBody = current.body;
  const target = $('#markdown-preview');
  const refs = [...sourceBody.matchAll(/!?\[\[([^\]]+)\]\]/g)];
  for (const match of refs) {
    const raw = match[1];
    const [filePart, alias] = raw.split('|');
    const name = filePart.split('#')[0].replaceAll('\\','/').split('/').pop();
    const attachment = current.attachments.find(a => a.name === name);
    let url;
    if (attachment) {
      const blob = await readBlob(attachment.id);
      if (!blob) continue;
      if (!current || current.id !== entryId || current.body !== sourceBody || target.hidden) return;
      url = URL.createObjectURL(blob);
      editorUrls.push(url);
    }
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    const matches = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.parentElement.closest('pre,code,a') && node.nodeValue.includes(match[0])) matches.push(node);
    }
    for (const node of matches) {
      const chunks = node.nodeValue.split(match[0]);
      const fragment = document.createDocumentFragment();
      chunks.forEach((chunk, i) => {
        if (i) {
          let element;
          const embed = match[0].startsWith('!');
          const kind = attachment ? fileKind(attachment.name) : null;
          if (url && embed && kind === 'image') {
            element = document.createElement('img'); element.src=url; element.alt=alias||name; element.loading='lazy';
          } else if (url && embed && (kind === 'video' || kind === 'audio')) {
            element = document.createElement(kind); element.src=url; element.controls=true; element.preload='metadata';
          } else if (url) {
            element = document.createElement('a'); element.href=url; element.download=attachment.name; element.textContent=alias||name;
          } else {
            const note = entries.find(n => n.kind !== 'file' && (n.source?.path === filePart || n.title === name.replace(/\.md$/i,'')));
            element = document.createElement(note ? 'button' : 'span');
            element.textContent=alias||name;
            if (note) { element.className='wikilink'; element.onclick=handle(()=>openNote(note.id)); }
            else { element.className='missing-link'; element.title='原笔记引用的文件未在笔记库中找到'; }
          }
          fragment.append(element);
        }
        fragment.append(document.createTextNode(chunk));
      });
      node.replaceWith(fragment);
    }
  }
}
