(function () {
  'use strict';
  const S = window.SC;
  const field = target => target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
  const keyFor = item => item.bookId + '|' + String(item.text).normalize('NFC').trim();
  S.batchToolbar = ({action, label, count, all = false, partial = false, prefix}) => !action ? '' : `<div class="management-toolbar" role="group" aria-label="${S.esc(label)}"><label><input id="${prefix}-All" type="checkbox" ${all ? 'checked' : ''} data-partial="${partial}" aria-label="全选当前结果">全选</label><span>已选 ${count}</span><button type="button" class="plain-button" id="${prefix}-Execute" ${count ? '' : 'disabled'}>${S.esc(label)}</button><button type="button" class="plain-button" id="${prefix}-Cancel">取消</button></div>`;
  S.manage = (element, entries, remove) => {
    if (!element) return;
    element._scManagement = {entries, remove};
    element._scManagementDOM = element.firstChild;
    if (element._scManagementBound) { element.dataset.managed='true';return; }
    element._scManagementBound=true;
    element.dataset.managed = 'true';
    if (!element.hasAttribute('tabindex')) element.tabIndex = 0;
    const own = event => event.target.closest('[data-managed]') === element && (element.id !== 'dialogBody' || element._scManagementDOM === element.firstChild);
    element.addEventListener('click', event => {
      if (!own(event) || field(event.target) || event.target.closest('label')) return;
      let current=element;
      if(!element.isConnected||element.closest('dialog:not([open])'))for(const key of ['study-id','project-home','group-toggle','id','card-id','note']){const value=element.getAttribute('data-'+key);if(value){current=[...document.querySelectorAll(`[data-managed][data-${key}="${CSS.escape(value)}"]`)].find(el=>!el.closest('dialog:not([open])'))||element;break;}}
      const dialog=document.querySelector('dialog[open]');if(dialog&&!dialog.contains(current))return;
      const studyId = current.dataset.studyId || current.dataset.note || current.dataset.cardId;
      S.ui.managementTarget = {element:current, remove: current._scManagement?.remove, dom:current.firstChild, studyId, armed:!!studyId && (!event.target.closest('button,a') || event.target.closest('button,a') === element)};
      if (current !== element || !event.target.closest('button,a') || event.target.closest('button,a') === element) current.focus({preventScroll: true});
    });
    const menu = (x, y) => {
      if (S.ui.sidebarSelection && element.closest('#sidebarNav,.collection-browser')) return;
      S.stopSpeech();
      const current = element._scManagement.entries;
      const rows = typeof current === 'function' ? current(x, y) : current;
      if (rows?.length) openMenu(x, y, rows, element);
    };
    element.oncontextmenu = event => {
      if (!own(event) || field(event.target)) return;
      event.preventDefault(); event.stopPropagation(); menu(event.clientX, event.clientY);
    };
    element.addEventListener('keydown', event => {
      if (!own(event) || field(event.target) || event.repeat || event.isComposing || event.keyCode === 229) return;
      if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) {
        event.preventDefault(); event.stopPropagation(); const box = element.getBoundingClientRect(); menu(box.left, box.bottom);
      }
    });
  };
  S.clearManagement = () => {
    S.$('#sidebarDeletePanel')?.remove();
    S.ui.managementTarget = null; S.ui.sidebarSelection = null; S.ui.attachmentBatch = null;
    S.ui.songCardBatch = null; S.ui.songNoteBatch = null; S.ui.supplementBatch = null; S.ui.summaryBatch = null; S.ui.grammarSourceBatch = null;
    for (const [id,state] of Object.entries(S.ui.books || {})) { S.restoreBookBatch?.({id},state); state.selected = []; state.batchAction = null; }
    for (const draft of S.ui.chatDrafts?.values() || []) { draft.batchAction = null; draft.selected.clear(); }
  };
  const indexed = (rows, ids) => rows.flatMap((row, position) => ids.has(row.id) ? [{row, position}] : []);
  const restore = (rows, saved) => { for (const {row, position} of saved) if (!rows.some(value => value.id === row.id)) rows.splice(Math.min(position, rows.length), 0, row); };
  const DELETE_LOG = 'scrawl-public-current-v1-container-delete-v1';
  const clone = value => structuredClone(value);
  const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])) : value;
  const digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(ordered(value)))))].map(value=>value.toString(16).padStart(2,'0')).join('');
  function deleteLog() { const raw=localStorage.getItem(DELETE_LOG);if(!raw)return {operations:[]};const value=JSON.parse(raw);if(!Array.isArray(value.operations))throw new Error('上次删除记录无法读取，请先备份再处理。');return value; }
  function saveDeleteOperation(op) { const log=deleteLog(),index=log.operations.findIndex(row=>row.operation_id===op.operation_id);if(index<0)log.operations.push(op);else log.operations[index]=op;localStorage.setItem(DELETE_LOG,JSON.stringify(log)); }
  async function archiveRequest(action,op) {
    const body=action==='apply'?{action,operation_id:op.operation_id,targets:op.targets,deleted_container_ids:op.ids,browser_snapshot:op.browser_snapshot,active_file_ids:[],candidate_file_ids:[],file_references_complete:false}:{action,operation_id:op.operation_id};
    const response=await fetch('/api/projects/0/archive',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)}),result=await response.json().catch(()=>({}));
    if(!response.ok||!result.ok)throw new Error(typeof result.detail==='string'?result.detail:'删除同步尚未完成，请稍后重试。');return result;
  }
  async function deletionState() { const response=await fetch('/api/state',{signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('删除状态暂时无法同步，请稍后刷新。');return response.json(); }
  function deletionView(data,op) {
    const currentRow=(key,id)=>{const row=data[key].find(value=>value.id===id);if(!row)return null;return key==='projects'?{...row,groupId:row.groupId||null,modules:row.modules||[]}:key==='books'?{...row,groupId:row.projectId?null:row.groupId||null}:row;};
    return {rows:Object.fromEntries(['groups','projects','books','items'].map(key=>[key,op.saved[key].map(({row})=>currentRow(key,row.id))])),markers:Object.fromEntries(Object.entries(op.markers).map(([key,values])=>[key,Object.fromEntries(Object.keys(values).map(id=>[id,Object.hasOwn(data[key]||{},id)?data[key][id]:null]))])),links:op.links.map(row=>{const value=data.items.find(value=>value.id===row.id);return {id:row.id,wordIds:value?.wordIds||[],grammarIds:value?.grammarIds||[]};}),songs:Object.fromEntries(Object.keys(op.songs).map(key=>[key,data.songLibrary?.[key]||null]))};
  }
  function applyDelete(data,op) { S.applyGlobalContainerDeletes(data,op.ids); }
  function restoreDelete(data,op) {
    for(const key of ['groups','projects','books','items'])restore(data[key],clone(op.saved[key]));
    for(const [key,values]of Object.entries(op.markers)){data[key]||={};for(const [id,before]of Object.entries(values)){if(data[key][id]!==true)continue;if(before.exists)data[key][id]=clone(before.value);else delete data[key][id];}if(!op.markerPresence?.[key]&&!Object.keys(data[key]).length)delete data[key];}
    const removed=new Set(op.saved.items.map(({row})=>row.id));
    for(const row of op.links){const note=data.items.find(value=>value.id===row.id);if(!note)continue;for(const key of ['wordIds','grammarIds']){const before=row[key]||[],after=before.filter(id=>!removed.has(id)),current=note[key]||[];note[key]=JSON.stringify(current)===JSON.stringify(after)?clone(before):[...new Set([...current,...before.filter(id=>removed.has(id))])];}}
    data.songLibrary||={};for(const [key,row]of Object.entries(op.songs))if(!data.songLibrary[key])data.songLibrary[key]=clone(row);
    if(!data.currentSong&&op.currentSong&&data.songLibrary[op.currentSong])data.currentSong=op.currentSong;
    if(op.sidebar){data.sidebarVisible||={groups:[],notebooks:{}};const add=(rows,saved)=>{for(const {id,position}of saved)if(!rows.includes(id))rows.splice(Math.min(position,rows.length),0,id);};add(data.sidebarVisible.groups||=[],op.sidebar.groups);data.sidebarVisible.notebooks||={};for(const [scope,saved]of Object.entries(op.sidebar.notebooks))add(data.sidebarVisible.notebooks[scope]||=[],saved);}
    if(data.globalDeletedContainerIds)data.globalDeletedContainerIds=data.globalDeletedContainerIds.filter(id=>!op.ids.includes(id));
  }
  function containerSnapshot(entries) {
    const groups=new Set(entries.filter(row=>row.kind==='group').map(row=>row.id)),projects=new Set(S.data.projects.filter(row=>groups.has(row.groupId)).map(row=>row.id));
    entries.filter(row=>row.kind==='project').forEach(row=>projects.add(row.id));
    const books=new Set(S.data.books.filter(row=>!row.special&&(groups.has(row.groupId)||projects.has(row.projectId))).map(row=>row.id));
    entries.filter(row=>row.kind==='book'&&!S.data.books.find(book=>book.id===row.id)?.special).forEach(row=>books.add(row.id));
    const cards=new Set(S.data.items.filter(row=>books.has(row.bookId)).map(row=>row.id)),saved=Object.fromEntries([['groups',groups],['projects',projects],['books',books],['items',cards]].map(([key,ids])=>[key,clone(indexed(S.data[key],ids))]));
    const ids=[...saved.groups,...saved.projects,...saved.books].map(({row})=>row.id),songs=Object.fromEntries(Object.entries(S.data.songLibrary||{}).filter(([key])=>projects.has('song:'+key)));
    const links=clone(S.data.items.filter(row=>!cards.has(row.id)&&row.kind==='sentence'&&['wordIds','grammarIds'].some(key=>row[key]?.some(id=>cards.has(id)))).map(({id,wordIds,grammarIds})=>({id,wordIds,grammarIds})));
    const markerKeys={deletedContainers:ids,deletedCardKeys:saved.items.map(({row})=>keyFor(row)),deletedSourceCards:saved.items.filter(({row})=>row.source_file_id).map(({row})=>row.source_file_id+'|'+row.id),deletedBookSlots:saved.books.filter(({row})=>row.projectId?.startsWith('song:')).map(({row})=>row.projectId+':'+row.kind)};
    const markers=Object.fromEntries(Object.entries(markerKeys).map(([key,values])=>[key,Object.fromEntries(values.map(id=>[id,{exists:Object.hasOwn(S.data[key]||{},id),...(Object.hasOwn(S.data[key]||{},id)?{value:clone(S.data[key][id])}:{})}]))]));
    const targets=[...saved.projects.map(({row})=>({table:'projects',id:row.backendProjectId})),...saved.books.map(({row})=>({table:'books',id:row.backendBookId})),...saved.items.map(({row})=>({table:'items',id:row.backendItemId}))].filter(row=>Number.isInteger(row.id)&&row.id>0);
    const positions=(rows,ids)=>(rows||[]).flatMap((id,position)=>ids.has(id)?[{id,position}]:[]),sidebar=S.data.sidebarVisible?{groups:positions(S.data.sidebarVisible.groups,groups),notebooks:Object.fromEntries(Object.entries(S.data.sidebarVisible.notebooks||{}).map(([scope,rows])=>[scope,positions(rows,projects)]))}:null;
    return {operation_id:crypto.randomUUID().replaceAll('-',''),phase:'prepared',at:new Date().toISOString(),saved,ids,links,songs:clone(songs),currentSong:S.data.currentSong,sidebar,markers,markerPresence:Object.fromEntries(Object.keys(markers).map(key=>[key,Object.hasOwn(S.data,key)])),targets:[...new Map(targets.map(row=>[row.table+':'+row.id,row])).values()]};
  }
  function invalidateDeletion() { for(const key of ['dataEpoch','navigationEpoch','chatEpoch','songSearchEpoch'])S.ui[key]=(S.ui[key]||0)+1;S.stopAllAudio?.();if(S.player)S.player.loadEpoch++; }
  const setDeleteBusy=value=>{S.ui.containerDeletionBusy=value;document.querySelector('.app')?.toggleAttribute('inert',value);};
  S.undoContainerDeletion=async operationId=>{
    if(S.ui.containerDeletionBusy||S.ui.staleBrowserState)throw new Error('请先完成上次操作或刷新当前窗口。');const op=deleteLog().operations.find(row=>row.operation_id===operationId);if(!op||op.phase==='rolled_back')return;
    setDeleteBusy(true);invalidateDeletion();
    try{await archiveRequest('rollback',op);const state=await deletionState();restoreDelete(S.data,op);S.deletionState=state;S.data.globalDeletedContainerIds=state.deleted_container_ids||[];if(state.deleted_container_ids?.length)S.applyGlobalContainerDeletes(S.data,state.deleted_container_ids);if(!S.persist()){S.ui.deletionSyncBlocked=true;throw new Error('删除已撤销，但浏览器尚未保存。请保持页面打开并导出当前内容。');}op.phase='rolled_back';saveDeleteOperation(op);S.ui.deletionSyncBlocked=false;S.syncSavedSongState?.();S.render(false);}finally{setDeleteBusy(false);}
  };
  S.deleteContainerTransaction=async entries=>{
    if(S.ui.containerDeletionBusy||S.ui.deletionSyncPending||S.ui.deletionSyncBlocked||S.ui.staleBrowserState)throw new Error('请先完成上次操作或刷新当前窗口。');
    const op=containerSnapshot(entries);if(!op.ids.length)return {ok:true};const after=clone(S.data);applyDelete(after,op);
    op.browser_snapshot={before_version:await digest(deletionView(S.data,op)),after_version:await digest(deletionView(after,op))};saveDeleteOperation(op);setDeleteBusy(true);invalidateDeletion();let submitted=false,written=false;
    try{
      submitted=true;await archiveRequest('apply',op);op.phase='applied';saveDeleteOperation(op);
      if(await digest(deletionView(S.data,op))!==op.browser_snapshot.before_version)throw new Error('所选内容在删除期间已有修改，本次删除未采用。');
      applyDelete(S.data,op);written=true;if(!S.persist())throw new Error('浏览器未能保存删除结果，本次删除将撤销。');
      await archiveRequest('finalize',op);op.phase='finalized';saveDeleteOperation(op);S.clearManagement();S.syncSavedSongState?.();S.go('home');
      S.toast('所选内容已删除。',()=>S.undoContainerDeletion(op.operation_id));return {ok:true,operation_id:op.operation_id};
    }catch(error){
      let rollbackError='';if(submitted){try{await archiveRequest('rollback',op);}catch{rollbackError=' 删除状态尚未确认，请保持页面打开，在备份与维护中继续处理。';S.ui.deletionSyncBlocked=true;}}
      if(written){restoreDelete(S.data,op);if(!S.persist())rollbackError+=' 浏览器回退尚未保存，请先导出当前内容。';}
      if(!rollbackError){op.phase='rolled_back';saveDeleteOperation(op);}throw new Error(error.message+rollbackError);
    }finally{setDeleteBusy(false);}
  };
  S.syncDeletionStartup=new Promise(resolve=>document.addEventListener('DOMContentLoaded',async()=>{
    if(window.SC_PUBLIC){S.ui.deletionSyncPending=false;S.ui.deletionSyncBlocked=false;resolve(null);return;}
    try{
      let state=await deletionState();S.deletionState=state;
      const pending=state.pending_archive_operation;if(pending){const op=deleteLog().operations.find(row=>row.operation_id===pending.operation_id);if(!op)throw new Error('上次删除尚未完成，请在备份与维护中处理。');const current=await digest(deletionView(S.data,op));if(current===pending.browser_snapshot.after_version){await archiveRequest('finalize',op);op.phase='finalized';saveDeleteOperation(op);}else if(current===pending.browser_snapshot.before_version){await archiveRequest('rollback',op);op.phase='rolled_back';saveDeleteOperation(op);}else throw new Error('上次删除后已有内容修改，原内容未覆盖。请先备份并继续处理删除状态。');state=await deletionState();S.deletionState=state;}
      S.data.globalDeletedContainerIds=[...new Set(state.deleted_container_ids||[])];if(state.deleted_container_ids?.length)S.applyGlobalContainerDeletes(S.data,state.deleted_container_ids);if(!S.persist())throw new Error('删除状态尚未保存，请保持页面打开。');S.syncSavedSongState?.();S.render(false);
    }catch(error){S.ui.deletionSyncBlocked=true;S.ui.deletionSyncError=error.message;S.toast(error.message);}
    finally{S.ui.deletionSyncPending=false;resolve(S.deletionState||null);}
  },{once:true}));
  S.renderDeletionRecovery=panel=>{
    let log;try{log=deleteLog();}catch(error){S.ui.deletionSyncBlocked=true;panel.insertAdjacentHTML('afterbegin','<p class="dialog-note">'+S.esc(error.message)+'</p>');return;}
    const op=[...log.operations].reverse().find(row=>row.phase!=='rolled_back');if(!op)return;
    const section=document.createElement('section');section.innerHTML='<h3 class="settings-subtitle">删除与撤销</h3><p class="dialog-note">'+(S.ui.deletionSyncBlocked?'上次删除尚未完成。撤销只恢复该次删除的内容，后来的修改和学习记录保留。':'已保留最近一次删除的原内容，可撤销。')+'</p><button type="button" class="plain-button" id="undoContainerDelete">撤销这次删除</button>';
    panel.prepend(section);section.querySelector('button').onclick=async event=>{event.target.disabled=true;try{await S.undoContainerDeletion(op.operation_id);S.openSettings(3);}catch(error){section.querySelector('p').textContent=error.message;event.target.disabled=false;}};
  };
  S.deleteCards = (ids, onDone = () => S.render()) => {
    if (S.deleteSummaryUnits?.(ids, onDone)) return;
    const idSet = new Set(ids), removed = indexed(S.data.items, idSet);
    if (!removed.length) return;
    const units = removed.reduce((n, {row}) => n + (S.summaryUnitCount?.(row) || 0), 0);
    S.confirmDelete({title: '删除卡片', message: `将删除 ${removed.length} 张卡片${units ? `（包含 ${removed.filter(({row})=>S.isSentenceSummary(row)).length} 张总卡、${units} 个内部句子）` : ''}及 ${removed.reduce((n, {row}) => n + (S.studyEventCount?.(row) ?? row.progress?.events?.length ?? 0), 0)} 条学习记录，并解除相关句子的引用。`, onConfirm: () => {
      S.ui.dataEpoch = (S.ui.dataEpoch || 0) + 1;
      const links = S.unlinkRemovedCards(ids), markers = {...S.data.deletedCardKeys}, sourceMarkers = {...S.data.deletedSourceCards};
      S.data.deletedCardKeys ||= {};
      removed.forEach(({row}) => S.data.deletedCardKeys[keyFor(row)] = true);
      for (const {row} of removed) if (row.source_file_id) (S.data.deletedSourceCards ||= {})[row.source_file_id + '|' + row.id] = true;
      S.data.items = S.data.items.filter(item => !idSet.has(item.id));
      S.ui.managementTarget = null; S.persist(); onDone(); S.refreshSidebar();
      S.toast(`已删除 ${removed.length} 张卡片。`, () => { restore(S.data.items, removed); S.data.deletedCardKeys = markers; S.data.deletedSourceCards = sourceMarkers; S.restoreCardLinks(links); onDone(); });
    }});
  };
  S.markExtra = (ids, enabled, onDone = () => S.render()) => {
    const resolve = id => S.resolveStudyItem?.(id) || S.data.items.find(item => item.id === id);
    const rows = ids.flatMap(id => { const item = resolve(id); return item ? S.isSentenceSummary?.(item) ? S.studyItems([item]) : [item] : []; });
    const before = [...new Map(rows.filter(item => ['word','grammar','sentence'].includes(item.kind)).map(item => [item.id,[item.id,!!item.extraPractice]])).values()];
    if (!before.length) return;
    before.forEach(([id, value]) => { const item = resolve(id); if (item) item.extraPractice = enabled ?? !value; });
    S.persist(); onDone(); S.refreshSidebar();
    S.toast(enabled === false ? '已移出，原卡片和学习记录保留。' : '已加入再记一遍。', () => { before.forEach(([id, value]) => { const item = resolve(id); if (item) item.extraPractice = value; }); onDone(); });
  };
  S.removeExtra = (ids, onDone = () => S.render()) => S.confirmDelete({title:'移出再记一遍',message:`将移出 ${new Set(ids).size} 条内容，原卡片及学习记录不会删除。`,onConfirm:()=>S.markExtra(ids,false,onDone)});
  S.beginContainerDelete = (kind, id) => { if (S.ui.sidebarSelection) return; S.closeMenu(false); S.ui.sidebarSelection = new Set([kind + ':' + id]); S.refreshSidebar(); if (S.$('.collection-browser')) S.wireCollectionManagement(S.ui.collectionContext.kind, S.ui.collectionContext.list); };
  S.deleteContainers = entries => {
    const groups = new Set(entries.filter(e => e.kind === 'group').map(e => e.id));
    const projects = new Set(S.data.projects.filter(p => groups.has(p.groupId)).map(p => p.id));
    entries.filter(e => e.kind === 'project').forEach(e => projects.add(e.id));
    const books = new Set(S.data.books.filter(b => !b.special && (groups.has(b.groupId) || projects.has(b.projectId))).map(b => b.id));
    entries.filter(e => e.kind === 'book' && !S.data.books.find(b => b.id === e.id)?.special).forEach(e => books.add(e.id));
    const saved = {groups: indexed(S.data.groups, groups), projects: indexed(S.data.projects, projects), books: indexed(S.data.books, books)};
    const items = S.data.items.filter(i => books.has(i.bookId)), itemIds = new Set(items.map(i => i.id));
    saved.items = indexed(S.data.items, itemIds);
    const total = saved.groups.length + saved.projects.length + saved.books.length;
    if (!total) return;
    S.$('#sidebarDeletePanel')?.remove();
    const units = items.reduce((n, row) => n + (S.summaryUnitCount?.(row) || 0), 0);
    S.confirmDelete({title: '删除所选内容', message: `将删除 ${saved.groups.length} 个项目、${saved.projects.length} 个笔记本、${saved.books.length} 组卡片、${items.length} 张卡片${units ? `（包含 ${items.filter(row=>S.isSentenceSummary(row)).length} 张总卡、${units} 个内部句子）` : ''}及 ${items.reduce((n, i) => n + (S.studyEventCount?.(i) ?? i.progress?.events?.length ?? 0), 0)} 条学习记录。仅确认独用的托管附件可撤销回收，原文件与共享文件保留。`, onConfirm: () => S.deleteContainerTransaction(entries).catch(error=>S.toast(error.message))});
  };
  function selectionCheck(parent, before, key, visible = true) {
    const selected = S.ui.sidebarSelection;
    if (!selected || !visible) return;
    const label = document.createElement('label'); label.className = 'sidebar-select';
    label.innerHTML = `<input type="checkbox" aria-label="选择 ${S.esc(before.textContent.trim())}" ${selected.has(key) ? 'checked' : ''}>`;
    label.onclick = event => event.stopPropagation();
    label.querySelector('input').onchange = event => { event.target.checked ? selected.add(key) : selected.delete(key); S.refreshSidebar(); };
    parent.insertBefore(label, before); parent.classList.add('management-selecting');
  }
  function positionDeletePanel() {
    const box = S.$('#sidebarDeletePanel'); if (!box) return;
    const anchor = S.$(box.dataset.anchor === 'collection' ? '#dialogTitle' : '#sidebarNav .nav-heading')?.getBoundingClientRect(); if (!anchor) return;
    box.style.left = `clamp(8px, ${anchor.right + 12}px, calc(100vw - ${box.offsetWidth}px - 8px))`;
    box.style.top = `clamp(8px, ${anchor.top}px, calc(100dvh - ${box.offsetHeight}px - 8px))`;
  }
  function containerDeletePanel(keys, prefix) {
    S.$('#sidebarDeletePanel')?.remove();
    const selected = S.ui.sidebarSelection; if (!selected) return;
    const box = document.createElement('section'); box.id = 'sidebarDeletePanel'; box.className = 'sidebar-delete-panel'; box.setAttribute('aria-label','删除所选内容');
    box.dataset.anchor = prefix;
    box.innerHTML = S.batchToolbar({action:'delete',label:'删除所选',count:selected.size,all:!!keys.length&&keys.every(key=>selected.has(key)),prefix});
    (S.$('#dialog').open ? S.$('#dialog') : document.body).append(box); positionDeletePanel();
    box.querySelector('#'+prefix+'-All').indeterminate = keys.some(key=>selected.has(key)) && !keys.every(key=>selected.has(key));
    const refresh = () => { S.refreshSidebar(); if (S.$('.collection-browser')) S.wireCollectionManagement(S.ui.collectionContext.kind,S.ui.collectionContext.list); };
    box.querySelector('#'+prefix+'-All').onchange = event => { keys.forEach(key=>event.target.checked?selected.add(key):selected.delete(key)); refresh(); };
    box.querySelector('#'+prefix+'-Cancel').onclick = () => { S.ui.sidebarSelection = null; refresh(); };
    box.querySelector('#'+prefix+'-Execute').onclick = () => S.deleteContainers([...selected].map(key=>{const i=key.indexOf(':');return {kind:key.slice(0,i),id:key.slice(i+1)};}));
  }
  S.wireSidebarManagement = () => {
    S.$('#sidebarDeletePanel')?.remove();
    const nav = S.$('#sidebarNav'), keys = [];
    for (const [kind, selector, attribute] of [['group','[data-group]','group'],['project','[data-project]','project'],['book','[data-book]','book']]) {
      nav.querySelectorAll(selector).forEach(parent => {
        const id = parent.dataset[attribute], button = parent.querySelector(':scope > .nav-item');
        const special = kind === 'book' && S.data.books.find(b => b.id === id)?.special;
        if (!button) return;
        S.manage(button, (x, y) => { if (kind === 'group') groupMenu(id, x, y); else if (kind === 'project') projectMenu(id, x, y); else bookMenu(id, x, y); }, special ? null : () => S.deleteContainers([{kind, id}]));
        if (!special) { keys.push(kind + ':' + id); selectionCheck(parent, button, kind + ':' + id); }
      });
    }
    nav.querySelectorAll('.nav-heading').forEach((heading, index) => S.manage(heading, () => index === 0 ? [{label:'新建项目',icon:'folder',fn:createGroup}] : [{label:'新建笔记本',icon:'notebook',fn:()=>createProject()}, ...['word','grammar','sentence'].map(kind=>({label:'新建'+S.cardLabel(kind),icon:S.cardIcon(kind),fn:()=>createBook(kind,null)}))]));
    if (S.$('#dialog').open && S.$('.collection-browser')) return;
    containerDeletePanel(keys,'sidebar');
  };
  S.wireCollectionManagement = (kind, list) => {
    S.ui.collectionContext = {kind, list};
    const browser = S.$('.collection-browser'); if (!browser) return;
    const selected = S.ui.sidebarSelection, keys = [];
    browser.querySelectorAll('[data-collection]').forEach(button => {
      const entity = list.find(row=>row.id===button.dataset.collection), type = kind==='group'?'group':entity.kind?'book':'project', key = type + ':' + entity.id;
      button.setAttribute('data-'+(type==='group'?'group-toggle':type==='project'?'project-home':'id'),entity.id);
      if (!button.dataset.managed) S.manage(button, () => entity.special ? [] : [{label:'删除…',icon:'delete',fn:()=>S.beginContainerDelete(type,entity.id)}], entity.special ? null : () => S.deleteContainers([{kind:type,id:entity.id}]));
      if (!selected || entity.special) return;
      let row = button.closest('.collection-row');
      if (!row) { row=document.createElement('div');row.className='collection-row';button.before(row);row.append(button); }
      row.querySelector('.sidebar-select')?.remove(); selectionCheck(row,button,key);
      row.querySelector('input').onchange=event=>{event.target.checked?selected.add(key):selected.delete(key);S.refreshSidebar();S.wireCollectionManagement(kind,list);};
      if (!button.hidden) keys.push(key);
    });
    if (!selected) { S.$('#sidebarDeletePanel')?.remove(); browser.querySelectorAll('.sidebar-select').forEach(el=>el.remove());return; }
    containerDeletePanel(keys,'collection');
    const search=browser.querySelector('.collection-search');const filter=()=>{browser.querySelectorAll('[data-collection]').forEach(button=>{button.hidden=!button.textContent.toLowerCase().includes(search.value.trim().toLowerCase());if(button.closest('.collection-row'))button.closest('.collection-row').hidden=button.hidden;});S.wireCollectionManagement(kind,list);}; search.oninput=filter;
  };
  S.wireCandidateManagement = draft => {
    const body=S.$('#dialogBody');
    const remove = notes => S.confirmDelete({title:'删除候选',message:`删除 ${notes.length} 条候选？已保存的卡片保留。`,onCancel:()=>renderChatOrganizer(draft,true),onConfirm:()=>{
      const before=[...draft.candidates];draft.candidates=draft.candidates.filter(note=>!notes.includes(note));draft.batchAction=null;draft.selected.clear();renderChatOrganizer(draft,true);
      S.toast('候选已移除，已保存的卡片保留。',()=>{draft.candidates=before;renderChatOrganizer(draft,true);});
    }});
    const begin=(note,action)=>{draft.batchAction={kind:note.kind,action};draft.selected=new Set([note.cid]);renderChatOrganizer(draft);};
    body.querySelectorAll('[data-candidate]').forEach(element=>{
      const note=draft.candidates.find(row=>row.cid===element.dataset.candidate);
      S.manage(element,()=>[{label:'修改候选',icon:'pencil',fn:()=>editCandidate(note,draft)},{label:'保存…',icon:'bookmark',fn:()=>begin(note,'save')},{label:'删除…',icon:'delete',fn:()=>begin(note,'delete')}],()=>remove([note]));
      element.addEventListener('keydown',event=>{if(event.key==='F2'&&!event.repeat&&!event.isComposing&&event.keyCode!==229){event.preventDefault();editCandidate(note,draft);}});
    });
    const batch=draft.batchAction;if(!batch)return;
    const group=draft.candidates.filter(note=>note.kind===batch.kind),prefix='candidate-'+batch.kind;
    const all=body.querySelector('#'+prefix+'-All');all.indeterminate=group.some(note=>draft.selected.has(note.cid))&&!group.every(note=>draft.selected.has(note.cid));
    all.onchange=event=>{group.forEach(note=>event.target.checked?draft.selected.add(note.cid):draft.selected.delete(note.cid));renderChatOrganizer(draft);};
    body.querySelector('#'+prefix+'-Cancel').onclick=()=>{draft.batchAction=null;draft.selected.clear();renderChatOrganizer(draft);};
    body.querySelector('#'+prefix+'-Execute').onclick=()=>{const notes=group.filter(note=>draft.selected.has(note.cid));if(batch.action==='delete')remove(notes);else{draft.batchAction=null;saveCandidates(notes,draft);draft.selected.clear();renderChatOrganizer(draft);}};
  };
  S.wireAttachmentManagement = () => {
    const box=S.$('#attachments'),batch=S.ui.attachmentBatch;
    const remove=ids=>{
      const notes=S.attachments.filter(note=>ids.includes(note.id));if(!notes.length)return;
      S.confirmDelete({title:'移除附件',message:`移除 ${notes.length} 个待发送附件？原文件不会删除。`,onConfirm:()=>{
        const before=[...S.attachments];S.attachments=S.attachments.filter(note=>!ids.includes(note.id));S.ui.attachmentBatch=null;renderComposer();
        S.toast('待发送附件已移除，原文件保留。',()=>{S.attachments=before;renderComposer();});
        setTimeout(()=>notes.forEach(note=>{if(!S.attachments.includes(note))URL.revokeObjectURL(note.url);}),9500);
      }});
    };
    S.manage(S.$('#globalComposer'),()=>[{label:'添加图片、PDF、Word 或文字文件',icon:'file',fn:()=>S.$('#fileInput').click()}]);
    box.querySelectorAll('[data-attachment]').forEach(button=>{
      const note=S.attachments.find(note=>note.id===button.dataset.attachment);
      const entries=()=>[{label:'移除…',icon:'delete',fn:()=>{if(S.$('#dialog').open)S.$('#dialog').close();S.ui.attachmentBatch=new Set([note.id]);renderComposer();}}];
      S.manage(button,entries,()=>remove([note.id]));
      const preview=button.onclick;button.onclick=()=>{preview();const body=S.$('#dialogBody');S.manage(body,entries,()=>remove([note.id]));body.focus();S.ui.managementTarget={element:body,remove:()=>remove([note.id]),dom:body.firstChild};};
      if(batch){const label=document.createElement('label');label.className='attachment-select';label.innerHTML=`<input type="checkbox" aria-label="选择 ${S.esc(note.file.name)}" ${batch.has(note.id)?'checked':''}>`;button.before(label);label.querySelector('input').onchange=event=>{event.target.checked?batch.add(note.id):batch.delete(note.id);renderComposer();};}
    });
    if(batch){box.insertAdjacentHTML('afterbegin',S.batchToolbar({action:'delete',label:'移除所选',count:batch.size,all:!!S.attachments.length&&S.attachments.every(note=>batch.has(note.id)),prefix:'attachments'}));box.querySelector('#attachments-All').onchange=event=>{S.attachments.forEach(note=>event.target.checked?batch.add(note.id):batch.delete(note.id));renderComposer();};box.querySelector('#attachments-Cancel').onclick=()=>{S.ui.attachmentBatch=null;renderComposer();};box.querySelector('#attachments-Execute').onclick=()=>remove([...batch]);}
  };
  const addItem = S.addItem;
  S.addItem = (bookId, values, explicit = false) => {
    const key = keyFor({bookId,text:values.text});
    if (S.data.deletedContainers?.[bookId] || S.data.deletedCardKeys?.[key] && !explicit) return null;
    if (explicit && S.data.deletedCardKeys) delete S.data.deletedCardKeys[key];
    return addItem(bookId, values);
  };
  S.ensureSongBooks = (sentences = false, song = S.song) => {
    const projectId = 'song:' + song.id;
    const stub = kind => ({id:'deleted:'+projectId+':'+kind,kind,projectId,deleted:true});
    if (S.data.deletedContainers?.[projectId]) return {project:{id:projectId,name:song.title,deleted:true,modules:[]},words:stub('word'),grammar:stub('grammar'),sentences:stub('sentence')};
    let project=S.data.projects.find(p=>p.id===projectId);
    if(!project){project={id:projectId,name:song.title,expanded:true,modules:[],groupId:null};S.data.projects.push(project);}
    const result={project};
    for(const [key,kind] of [['words','word'],['grammar','grammar'],['sentences','sentence']]){
      let book=S.data.books.find(b=>b.projectId===projectId&&b.kind===kind);
      if(!book&&S.data.deletedBookSlots?.[projectId+':'+kind])book=stub(kind);
      if(!book&&(kind!=='sentence'||sentences)){book={id:id(),name:S.cardLabel(kind),kind,projectId};S.data.books.push(book);}
      result[key]=book;
    }
    return result;
  };
  S.recreateSongBooks = (song = S.song) => {
    S.ui.dataEpoch=(S.ui.dataEpoch||0)+1;
    if(S.data.deletedContainers)delete S.data.deletedContainers['song:'+song.id];
    for(const kind of ['word','grammar','sentence'])if(S.data.deletedBookSlots)delete S.data.deletedBookSlots['song:'+song.id+':'+kind];
    const books=S.ensureSongBooks(false,song);S.persist();S.refreshSidebar();return books;
  };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !document.querySelector('dialog[open]') && S.$('#contextMenu')?.hidden) { S.clearManagement(); S.render(); renderComposer(); return; }
    if (event.repeat || event.isComposing || event.keyCode === 229 || field(event.target) || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || !S.$('#contextMenu')?.hidden) return;
    const target = S.ui.managementTarget;
    if(event.key==='Delete'&&target?.element.id==='dialogBody'&&(target.element._scManagementDOM!==target.element.firstChild||target.dom!==target.element.firstChild))return;
    const dialog = document.querySelector('dialog[open]');
    if (dialog && !dialog.contains(target?.element)) return;
    const selecting = S.ui.sidebarSelection || S.ui.summaryBatch || S.ui.grammarSourceBatch || S.ui.supplementBatch || S.ui.songCardBatch || S.ui.songNoteBatch || Object.values(S.ui.books || {}).some(state => state.batchAction);
    if (event.key === 'Delete' && S.ui.sidebarSelection) return;
    if (event.key === 'Tab' && !dialog && !selecting && target?.armed && target.element.isConnected && (target.element === event.target || target.element.contains(event.target)) && (!event.target.closest('button,a,summary') || event.target.id === 'flip-card')) {
      target.armed = false;
      const item = S.resolveStudyItem?.(target.studyId) || S.data.items.find(item => item.id === target.studyId);
      if (item) { event.preventDefault(); event.stopPropagation(); if (item.extraPractice) S.toast('已在再记一遍中。'); else S.markExtra([item.id],true,()=>{}); }
      return;
    }
    if (event.key === 'Delete' && target?.element.isConnected && target.remove && (target.element === event.target || target.element.contains(event.target))) { event.preventDefault(); event.stopPropagation(); target.remove(); }
    if (event.key === 'Escape' && !dialog) { S.clearManagement(); S.render(); }
  });
  document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('resize',positionDeletePanel);
    document.addEventListener('scroll',positionDeletePanel,true);
    S.$('#dialog').addEventListener('close',()=>{if(S.ui.sidebarSelection&&!S.$('#dialog').open)S.refreshSidebar();});
    S.$('#dialog').addEventListener('cancel',()=>{if(S.ui.sidebarSelection&&S.$('#confirmDelete'))return;S.clearManagement();S.refreshSidebar();renderComposer();});
    const tip = document.createElement('div'); tip.id='houseTooltip'; tip.className='house-tooltip'; tip.role='tooltip'; tip.hidden=true; document.body.append(tip);
    let timer, owner;
    const hide = () => { clearTimeout(timer); tip.hidden=true; if(owner){owner.removeAttribute('aria-describedby');owner=null;} };
    S.hideHouseTooltip = hide;
    const titles = root => { const rows=[...(root.querySelectorAll?.('[title]')||[])]; if(root.hasAttribute?.('title'))rows.push(root); for(const el of rows){const value=el.getAttribute('title'); if(value)el.dataset.tooltip=value; el.removeAttribute('title');} };
    titles(document);
    new MutationObserver(records=>{for(const record of records){if(record.type==='attributes')titles(record.target);else for(const node of record.addedNodes)titles(node);}}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['title']});
    const show = event => { const el=event.target.closest('[data-tooltip]'); if(!el)return; hide(); if(el.closest('.sidebar')&&!S.data.sidebarCollapsed)return; timer=setTimeout(()=>{if(!el.isConnected||!S.$('#contextMenu').hidden||el.closest('.sidebar')&&!S.data.sidebarCollapsed)return;owner=el;tip.textContent=el.dataset.tooltip;(el.closest('dialog[open]')||document.body).append(tip);tip.hidden=false;el.setAttribute('aria-describedby',tip.id);const b=el.getBoundingClientRect();tip.style.left=Math.max(8,Math.min(innerWidth-tip.offsetWidth-8,b.left))+'px';tip.style.top=Math.max(8,Math.min(innerHeight-tip.offsetHeight-8,b.bottom+7))+'px';},250); };
    document.addEventListener('pointerover',show);document.addEventListener('focusin',show);document.addEventListener('pointerout',hide);document.addEventListener('focusout',hide);document.addEventListener('scroll',hide,true);document.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
  });
})();
