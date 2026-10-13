'use strict';
(() => {
  const S = window.SC, e = S.esc;
  const noteText = value => e(String(value ?? '')).replace(/\be\.g\.?|[()（）]/gi, marker => `<span class="grammar-${/e/i.test(marker) ? 'eg' : 'bracket'}">${marker}</span>`);
  const labels = ['基础接续与词干变化', '助词及修饰', '定语与时态', '连接关系', '辅助结构与转述', '其他知识点'];
  const savedCategory = row => {
    const tags = [/^(基础接续词干变化|基础接续词干|基础接续|词干)$/, /^(助词修饰|助词|修饰)$/, /^(定语时态|定语|时态)$/, /^(连接关系|连接表达|连接)$/, /^(辅助结构转述|辅助转述|辅助|转述)$/, /^(其他知识点|其他笔记|其他)$/];
    for (const value of [row.grammar_category,row.category]) {const saved=String(value||'').replace(/[与及、\s]/g,''),found=tags.findIndex(tag=>tag.test(saved));if(found>=0)return found;}
    return -1;
  };
  const category = row => {
    const explicit = savedCategory(row);
    if (explicit >= 0) return explicit;
    const text = String(row.text || '').replace(/^\s*\d+[.、)．]\s*/, '');
    if (/辅助|转述|引用|다고|싶다|주다|있다/.test(text)) return 4;
    if (/定语|时态|过去|现在|未来/.test(text)) return 2;
    if (/连接|转折|让步|지만|어도|아도|^[-\s]*고(?:\s|$)|아\/어서/.test(text)) return 3;
    if (/词干|接续|变化规则|词性|动词\/形容词助词|아\/어|아\/어요|아요|어요|脱落/.test(text)) return 0;
    if (/助词|처럼|대로|그대로|修饰|状语|按照|은\/는|을\/를|이\/가|^[-\s]*(?:은|는|을|를|이|가|에|에서|의)\s*$/.test(text)) return 1;
    return 5;
  };
  const sourceOutline = (source,book) => {
    const positions = new Map(), counts = []; let point = {category:5,position:0,number:0};
    for (const block of source.blocks) {
      if (block.annotation) { positions.set(block.position,{category:5,position:block.position,number:0}); continue; }
      if (block.heading) {
        const end=source.blocks.find(next=>next.heading&&next.position>block.position)?.position??Infinity;
        const assigned=source.cards.filter(card=>card.positions[0]>=block.position&&card.positions[0]<end).map(card=>S.data.items.find(row=>row.id===card.id&&row.bookId===book.id&&row.source_file_id===source.source_file_id)).filter(Boolean).map(savedCategory).find(group=>group>=0);
        const group=assigned??category({text:block.text});point={category:group,position:block.position,number:(counts[group]||0)+1};counts[group]=point.number;
      }
      positions.set(block.position,point);
    }
    return positions;
  };
  S.grammarStudyOrder = (book, rows) => {
    const source = S.grammarSourceForBook(book);
    if (source) { const outline=sourceOutline(source,book), positions=new Map(source.cards.map(card=>[card.id,card.positions[0]])), group=row=>outline.get(positions.get(row.id))?.category??category(row);return rows.map((row,index)=>({row,index})).sort((a,b)=>(source.preserveOrder?0:group(a.row)-group(b.row))||(positions.get(a.row.id)??Infinity)-(positions.get(b.row.id)??Infinity)||a.index-b.index).map(({row})=>row); }
    return rows.map((row, index) => ({row, index})).sort((a, b) => category(a.row) - category(b.row) || a.index - b.index).map(({row}) => row);
  };
  S.renderGrammarNotes = (rows, {selectHTML = () => '', book, query = ''} = {}) => {
    if (S.grammarSourceForBook(book)) return renderSource(book, query, selectHTML);
    const ordered = S.grammarStudyOrder(null, rows);
    return labels.map((label, index) => {
      const notes = ordered.filter(row => category(row) === index);
      if (!notes.length) return '';
      return `<section class="grammar-notes-section" data-grammar-category="${index}"><h2>${label}</h2>${notes.map((row,pointIndex) => {
        const source = row.explanation || row.original_note || '', lines = source.split('\n');
        if (lines[0]?.trim() === String(row.text || '').trim()) lines.shift();
        const content = lines.join('\n'), numberedLines = /(?:^|\n)\s*\d+[.、]/.test(content), usage = String(row.usage || '');
        const body = `${content.trim() ? `<div class="grammar-note-content${numberedLines ? ' numbered-note' : ''}">${numberedLines?content.split('\n').map(text=>paragraphHTML({text})).join(''):noteText(content)}</div>` : ''}${row.formation ? `<section class="grammar-note-part"><h4>接续</h4><p>${noteText(row.formation)}</p></section>` : ''}${usage.trim() && usage.trim() !== source.trim() ? `<section class="grammar-note-part"><h4>用法</h4><p>${noteText(usage)}</p></section>` : ''}${row.note ? `<section class="grammar-note-part"><h4>说明</h4><p>${noteText(row.note)}</p></section>` : ''}${row.original_note && row.original_note !== source ? `<section class="grammar-note-part"><h4>原笔记</h4><p>${noteText(row.original_note)}</p></section>` : ''}`;
        return `<article class="grammar-note" data-note="${e(row.id)}" tabindex="0" aria-label="${e(row.text)}，双击标题或标题 Enter 练习，F2 编辑，右键管理"><div class="note-card-head">${selectHTML(row)}<h3 class="grammar-note-title" data-source-number="${pointIndex+1}" tabindex="0" role="button" data-grammar-title="${e(row.id)}" aria-label="练习 ${e(row.text)}">${noteText(String(row.text||'').replace(/^\s*\d+[.、)．]\s*/,''))}</h3></div><div class="grammar-note-core">${body}</div>${row.example || row.translation ? `<section class="grammar-examples"><h4>例句</h4>${row.example ? `<p class="example-ko" lang="ko">${e(row.example)}</p>` : ''}${row.translation ? `<p class="translation">${e(row.translation)}</p>` : ''}</section>` : ''}</article>`;
      }).join('')}</section>`;
    }).join('');
  };

  const sourceId = (source, block) => block.id || source.source_file_id + (block.paragraph ? ':p:' + block.paragraph : ':table:' + block.position);
  const metadata = (book, id) => S.data.grammarSourceEdits?.[book.id]?.[id] || {};
  const sourceText = block => block.cells ? block.cells.map(row=>row.join(' ')).join('\n') : block.text;
  const sourceWordDeleted = (book, source, block) => {
    const word = source.words?.find(word=>word.positions.includes(block.position)); if (!word) return false;
    if (S.data.deletedSourceCards?.[source.source_file_id+'|'+word.id]) return true;
    const scopes = S.data.books.filter(row=>row.kind==='word' && (S.sameBookScope?S.sameBookScope(row,book):row.projectId===book.projectId&&(row.groupId||null)===(book.groupId||null)));
    return scopes.some(scope=>S.data.deletedCardKeys?.[scope.id+'|'+word.text.normalize('NFC').trim()]);
  };
  S.grammarSourceForBook = book => {
    if (book?.kind !== 'grammar' || book.ephemeral || book.special || S.data.deletedContainers?.[book.id]) return null;
    const workbookSource = S.koreanGrammarSourceForBook?.(book);
    const dittoSource = window.SCRAWL_GRAMMAR_SOURCE;
    const source = workbookSource || (dittoSource && (S.data.dittoWordRestore?.bookIds?.includes(book.id) || S.data.items.some(row=>row.bookId===book.id && row.source_file_id===dittoSource.source_file_id && dittoSource.cards.some(card=>card.id===row.id))) ? dittoSource : null);
    const blocks = [...(source?.blocks || [])], ids = new Set(blocks.map(block=>sourceId(source,block))), sameText = text=>String(text||'').normalize('NFC').replace(/\s+/g,' ').trim();
    const existing = new Set(blocks.map(sourceText).map(sameText));
    for (const card of source?.cards || []) existing.add(sameText(blocks.filter(block=>card.positions.includes(block.position)).map(sourceText).join('\n')));
    let position = Math.max(0,...blocks.map(block=>block.position));
    for (const annotation of book.noteAnnotations || []) {
      if (!annotation.id || ids.has(annotation.id)) continue;
      const block = {id:annotation.id,position:position+1,text:String(annotation.original_note||''),...(annotation.cells?{cells:annotation.cells}:{}),annotation:true};
      const text = sameText(sourceText(block));
      if (!text || (!annotation.file_id || annotation.file_id===source?.source_file_id) && existing.has(text)) continue;
      blocks.push(block); ids.add(block.id); existing.add(text); position++;
    }
    if (blocks.length===(source?.blocks.length||0)) return source;
    return source ? {...source,blocks} : {source_file_id:book.id+':annotations',start:-1,cards:[],blocks};
  };
  function sourceNodes(book, query = '') {
    const source = S.grammarSourceForBook(book); if (!source) return [];
    const mapping = new Map(); for (const card of source.cards) for (const position of card.positions) mapping.set(position,card);
    const search = query.trim().toLocaleLowerCase(), nodes = [], outline=sourceOutline(source,book);
    for (const block of source.blocks) {
      if (block.position===source.start) continue;
      const point=outline.get(block.position), section=point.position;
      const mapped = mapping.get(block.position);
      if (mapped) {
        if (mapped.positions[0] !== block.position) continue;
        const row = S.data.items.find(row=>row.id===mapped.id && row.bookId===book.id && row.kind==='grammar' && row.source_file_id===source.source_file_id);
        // A deleted mapped card must never fall back to an unassigned source paragraph.
        if (!row) continue;
        const blocks = source.blocks.filter(value=>mapped.positions.includes(value.position));
        const original = blocks.map(value=>value.text).join('\n'), saved = window.SCRAWL_ORIGINAL_RESTORE?.cards?.[row.id];
        const unchanged = (row.explanation || row.original_note || '') === original && row.text === (saved ? saved.text : block.text);
        const text = [unchanged ? original : [row.text,row.explanation || row.original_note].join('\n'),row.formation,row.usage,row.note,row.example,row.translation].filter(Boolean).join('\n');
        if (!search || text.toLocaleLowerCase().includes(search)) nodes.push({id:row.id,row,block,blocks,section,category:point.category,number:point.number,original,unchanged});
      } else {
        if (sourceWordDeleted(book,source,block)) continue;
        const id = sourceId(source,block), edit = metadata(book,id);
        if (edit.deleted || edit.hidden && !S.ui.grammarSourceShowHidden?.[book.id]) continue;
        const value = {...block,...edit};
        if (!sourceText(value).trim() || search && !sourceText(value).toLocaleLowerCase().includes(search)) continue;
        nodes.push({id,block:value,section,category:point.category,number:point.number,hidden:!!edit.hidden});
      }
    }
    return nodes;
  }
  const paragraphHTML = block => {
    const prefix = String(block.text || '').match(/^\s*(\d+)[.、]\s*/), number = block.number || (prefix ? Number(prefix[1]) : 0);
    return `<p class="grammar-source-body${number ? ' grammar-source-subpoint' : ''}"${number ? ` data-source-number="${number}"` : ''}>${noteText(prefix ? block.text.slice(prefix[0].length) : block.text)}</p>`;
  };
  const tableHTML = cells => `<div class="grammar-source-table"><table><thead><tr>${cells[0].map(cell=>`<th scope="col">${noteText(cell)}</th>`).join('')}</tr></thead><tbody>${cells.slice(1).map(row=>`<tr>${row.map(cell=>`<td>${noteText(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  function sourceOnlyHTML(node, batch) {
    const {id,block,hidden} = node, box = batch ? `<label class="select-note"><input type="checkbox" data-grammar-source-select="${e(id)}" ${batch.selected.includes(id)?'checked':''} aria-label="选择 ${e(sourceText(block).slice(0,60))}"></label>` : '';
    const body = block.cells ? tableHTML(block.cells) : block.heading ? `<h3 class="grammar-source-heading" data-source-number="${node.number}">${noteText(block.text)}</h3>` : paragraphHTML(block);
    return `<div class="grammar-source-row${hidden?' grammar-source-hidden':''}" data-grammar-source="${e(id)}" data-id="${e(id)}" tabindex="0" aria-label="${e(sourceText(block).slice(0,100))}，F2 编辑，右键管理">${box}${hidden?'<span class="grammar-source-hidden-label">已隐藏</span>':''}${body}</div>`;
  }
  function mappedHTML(node, selectHTML) {
    const {row,block,blocks,unchanged} = node;
    const title = unchanged ? block.text : row.text, tag = block.heading ? 'h3' : 'h4';
    let body;
    if (unchanged) body = blocks.slice(1).map(paragraphHTML).join('');
    else {
      const lines = String(row.explanation || row.original_note || '').split('\n');
      if ([String(row.text || '').trim(),block.text.trim()].includes(lines[0]?.trim())) lines.shift();
      body = lines.join('\n').trim() ? `<div class="grammar-source-body">${noteText(lines.join('\n'))}</div>` : '';
    }
    const source = row.explanation || row.original_note || '';
    body += `${row.formation?`<div class="grammar-note-part"><h4>接续</h4><p>${noteText(row.formation)}</p></div>`:''}${row.usage?.trim() && row.usage.trim()!==source.trim()?`<div class="grammar-note-part"><h4>用法</h4><p>${noteText(row.usage)}</p></div>`:''}${row.note?`<div class="grammar-note-part"><h4>说明</h4><p>${noteText(row.note)}</p></div>`:''}`;
    return `<article class="grammar-note grammar-source-point" data-note="${e(row.id)}" tabindex="0" aria-label="${e(row.text)}，双击标题或标题 Enter 练习，F2 编辑，右键管理"><div class="note-card-head">${selectHTML(row)}<${tag} class="grammar-note-title has-source-number ${block.heading?'grammar-source-heading':'grammar-source-card-title'}"${block.heading?` data-source-number="${node.number}"`:''} tabindex="0" role="button" data-grammar-title="${e(row.id)}">${noteText(title)}</${tag}></div>${body}${row.example || row.translation?`<section class="grammar-source-supplement grammar-examples"><h4>例句</h4>${row.example?`<p class="example-ko" lang="ko">${e(row.example)}</p>`:''}${row.translation?`<p class="translation">${e(row.translation)}</p>`:''}</section>`:''}</article>`;
  }
  function renderSource(book, query, selectHTML) {
    const nodes = sourceNodes(book,query), batch = S.ui.grammarSourceBatch?.bookId===book.id ? S.ui.grammarSourceBatch : null;
    const selectable = nodes.filter(node=>!node.row), selected = selectable.filter(node=>batch?.selected.includes(node.id));
    const toolbar = S.batchToolbar({action:batch?.action,label:({edit:'编辑所选段落',hide:'隐藏所选段落',delete:'删除所选段落'})[batch?.action],count:batch?.selected.length||0,all:!!selectable.length&&selected.length===selectable.length,partial:!!selected.length&&selected.length!==selectable.length,prefix:'grammar-source'});
    const source = S.grammarSourceForBook(book), mapped = new Set(source.cards.map(card=>card.id));
    const other = S.grammarStudyOrder(book,S.data.items.filter(row=>row.bookId===book.id&&row.kind==='grammar'&&!mapped.has(row.id)&&(!query.trim()||[row.text,row.explanation,row.formation,row.usage,row.note,row.example,row.translation].filter(Boolean).join('\n').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))));
    const groups = [];
    if (source.preserveOrder) {
      for (const node of nodes) { if (groups.at(-1)?.index !== node.category) groups.push({index:node.category,nodes:[],extras:[]}); groups.at(-1).nodes.push(node); }
      for (const row of other) { let group = groups.findLast(value=>value.index===category(row)); if (!group) { group={index:category(row),nodes:[],extras:[]}; groups.push(group); } group.extras.push(row); }
    } else labels.forEach((_,index)=>groups.push({index,nodes:nodes.filter(node=>node.category===index),extras:other.filter(row=>category(row)===index)}));
    const sections=groups.map(({index,nodes:grouped,extras})=>{
      const label=labels[index];
      if(!grouped.length&&!extras.length)return '';
      const points=[...new Set(grouped.map(node=>node.section))].map(section=>`<section class="grammar-source-section">${grouped.filter(node=>node.section===section).map(node=>node.row?mappedHTML(node,selectHTML):sourceOnlyHTML(node,batch)).join('')}</section>`).join('');
      return `<section class="grammar-notes-section" data-grammar-category="${index}"><h2>${label}</h2>${points}${extras.map((row,pointIndex)=>{const block={text:row.text,heading:true};return mappedHTML({row,block,blocks:[block],number:(grouped.at(-1)?.number||0)+pointIndex+1,unchanged:false},selectHTML);}).join('')}</section>`;
    }).join('');
    return `<div class="grammar-source-page" data-grammar-source-book="${e(book.id)}"><div class="grammar-source-toolbar">${toolbar}</div>${sections || '<div class="empty-state">没有匹配的原笔记内容。</div>'}</div>`;
  }
  const drawSource = book => S.renderBook(book.id,false);
  function beginSourceBatch(book, action, ids = []) {
    for (const state of Object.values(S.ui.books || {})) { state.batchAction = null; state.selected = []; }
    S.ui.grammarSourceBatch = {bookId:book.id,action,selected:[...new Set(ids)]}; drawSource(book);
  }
  function storeChanges(book, changes, message) {
    if (!S.data.books.some(row=>row.id===book.id) || !S.grammarSourceForBook(book)) return;
    const edits = S.data.grammarSourceEdits ||= {}, target = edits[book.id] ||= {};
    const entries = changes.map(({id,after})=>({id,before:target[id]===undefined?null:structuredClone(target[id]),after:structuredClone(after)}));
    for (const {id,after} of entries) target[id] = after;
    (S.data.grammarSourceUndo ||= {})[book.id] = {entries};
    S.ui.grammarSourceBatch = null; S.persist(); drawSource(book); S.toast(message,()=>S.undoGrammarSource(book.id));
  }
  S.canUndoGrammarSource = bookId => !!S.data.grammarSourceUndo?.[bookId]?.entries?.length;
  S.undoGrammarSource = bookId => {
    const undo = S.data.grammarSourceUndo?.[bookId], book = S.data.books.find(book=>book.id===bookId);
    if (!undo || !book || S.data.deletedContainers?.[bookId]) return false;
    const target = S.data.grammarSourceEdits?.[bookId] || {};
    for (const entry of undo.entries) if (JSON.stringify(target[entry.id])===JSON.stringify(entry.after)) { if (entry.before===null) delete target[entry.id]; else target[entry.id]=structuredClone(entry.before); }
    delete S.data.grammarSourceUndo[bookId]; S.ui.grammarSourceBatch=null; S.persist(); drawSource(book); return true;
  };
  function editSource(book, ids) {
    const source = S.grammarSourceForBook(book), fields = [], mapped = new Set(source.cards.flatMap(card=>card.positions));
    const chosen = source.blocks.map(block=>({block,id:sourceId(source,block)})).filter(({block,id})=>ids.includes(id)&&!mapped.has(block.position));
    chosen.forEach(({block,id},index)=>{
      const value = {...block,...metadata(book,id)};
      if (block.cells) value.cells.forEach((row,r)=>row.forEach((cell,c)=>fields.push({key:`cell-${index}-${r}-${c}`,label:`发音表 ${r+1}行 ${c+1}列`,value:cell,type:'textarea'})));
      else fields.push({key:'text-'+index,label:block.text || '原笔记段落',value:value.text,type:'textarea'});
    });
    if (!fields.length) return;
    S.editFields(chosen.length===1?'修改原笔记段落':'修改所选原笔记段落',fields,values=>storeChanges(book,chosen.map(({block,id},index)=>({id,after:{...metadata(book,id),manual:true,...(block.cells?{cells:block.cells.map((row,r)=>row.map((_,c)=>values[`cell-${index}-${r}-${c}`]))}:{text:values['text-'+index]})}})),'原笔记视图已修改，原文件与卡片不变。'));
  }
  function removeSource(book, ids, action = 'delete') {
    const source = S.grammarSourceForBook(book), mapped = new Set(source.cards.flatMap(card=>card.positions));
    const chosen = source.blocks.filter(block=>ids.includes(sourceId(source,block))&&!mapped.has(block.position));
    if (!chosen.length) return;
    S.confirmDelete({title:action==='hide'?'隐藏原笔记段落':'删除原笔记段落',message:`将${action==='hide'?'隐藏':'从视图删除'} ${chosen.length} 个原笔记段落或表格。原始文件、学习卡片及学习记录保持不变；整批可撤销。`,onConfirm:()=>storeChanges(book,chosen.map(block=>{const id=sourceId(source,block);return {id,after:{...metadata(book,id),[action==='hide'?'hidden':'deleted']:true}};}),'原笔记视图已更新，可撤销。')});
    if (action==='hide') S.$('#confirmDelete').textContent='确认隐藏';
  }
  S.wireGrammarSourceView = (mount, book) => {
    const page = mount.querySelector('[data-grammar-source-book]'); if (!page) return;
    const state = S.ui.books[book.id], nodes = sourceNodes(book,state.query), sourceOnly = nodes.filter(node=>!node.row);
    const menu = node => [
      {label:'编辑原笔记段落',icon:'pencil',fn:()=>editSource(book,[node.id])},
      ...['edit','hide','delete'].map(action=>({label:({edit:'多选编辑原笔记段落…',hide:'隐藏原笔记段落…',delete:'删除原笔记段落…'})[action],icon:action==='edit'?'pencil':'delete',fn:()=>beginSourceBatch(book,action,[node.id])})),
      ...(node.hidden?[{label:'取消隐藏',icon:'undo',fn:()=>storeChanges(book,[{id:node.id,after:{...metadata(book,node.id),hidden:false}}],'已显示原笔记段落。')}]:[]),
      ...(S.canUndoGrammarSource(book.id)?[{label:'撤销原笔记视图修改',icon:'undo',fn:()=>S.undoGrammarSource(book.id)}]:[]),
      ...(typeof mount._scManagement?.entries==='function'?mount._scManagement.entries():mount._scManagement?.entries||[])
    ];
    for (const element of page.querySelectorAll('[data-grammar-source]')) {
      const node = sourceOnly.find(node=>node.id===element.dataset.grammarSource); if (!node) continue;
      S.manage(element,()=>menu(node),()=>removeSource(book,[node.id]));
      element.onkeydown = event => {
        if (event.key!=='F2' || event.repeat || event.isComposing || event.keyCode===229 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.target.closest('input,textarea,select,button,a,[contenteditable="true"],dialog,#contextMenu') || S.$('#dialog').open || !S.$('#contextMenu').hidden) return;
        event.preventDefault(); event.stopPropagation(); editSource(book,[node.id]);
      };
    }
    S.manage(page,()=>[
      ...['edit','hide','delete'].map(action=>({label:({edit:'多选编辑原笔记段落…',hide:'多选隐藏原笔记段落…',delete:'多选删除原笔记段落…'})[action],icon:action==='edit'?'pencil':'delete',fn:()=>beginSourceBatch(book,action)})),
      {label:S.ui.grammarSourceShowHidden?.[book.id]?'不显示隐藏段落':'显示隐藏段落',icon:'book',fn:()=>{(S.ui.grammarSourceShowHidden ||= {})[book.id]=!S.ui.grammarSourceShowHidden[book.id];drawSource(book);}},
      ...(S.canUndoGrammarSource(book.id)?[{label:'撤销原笔记视图修改',icon:'undo',fn:()=>S.undoGrammarSource(book.id)}]:[]),
      ...(typeof mount._scManagement?.entries==='function'?mount._scManagement.entries():mount._scManagement?.entries||[])
    ]);
    page.querySelectorAll('[data-grammar-source-select]').forEach(box=>box.onchange=()=>{const batch=S.ui.grammarSourceBatch;if(!batch)return;batch.selected=box.checked?[...new Set([...batch.selected,box.dataset.grammarSourceSelect])]:batch.selected.filter(id=>id!==box.dataset.grammarSourceSelect);drawSource(book);});
    const batch = S.ui.grammarSourceBatch?.bookId===book.id ? S.ui.grammarSourceBatch : null;
    if (batch) {
      S.$('#grammar-source-All').onchange = event => {const visible=sourceOnly.map(node=>node.id);batch.selected=event.target.checked?[...new Set([...batch.selected,...visible])]:batch.selected.filter(id=>!visible.includes(id));drawSource(book);};
      S.$('#grammar-source-Execute').onclick = () => batch.action==='edit'?editSource(book,batch.selected):removeSource(book,batch.selected,batch.action);
      S.$('#grammar-source-Cancel').onclick = () => {S.ui.grammarSourceBatch=null;drawSource(book);};
    }
  };
  document.addEventListener('keydown',event=>{
    if (event.key==='Escape' && S.ui.grammarSourceBatch && !S.$('#dialog').open) {const book=S.data.books.find(book=>book.id===S.ui.grammarSourceBatch.bookId);S.ui.grammarSourceBatch=null;if(book)drawSource(book);}
  });
  S.grammarSourceFixtures = {sourceId,sourceNodes,paragraphHTML,sourceWordDeleted,beginSourceBatch,editSource,removeSource};
})();
