'use strict';
(() => {
  const S = window.SC, e = S.esc;
  const clean = value => String(value || '').normalize('NFKC').toLocaleLowerCase();
  const progress = () => ({streak: 0, due: '', events: []});
  S.isSentenceSummary = note => note?.kind === 'sentence' && note.contentType === 'sentence-summary' && Array.isArray(note.sections);
  const entries = parent => (parent.sections || []).flatMap(section => (section.entries || []).map(entry => ({parent, section, entry})));
  const virtual = ({parent, section, entry}) => {
    const row = {...entry, id: parent.id + '::' + entry.id, unitId: entry.id, parentId: parent.id, sectionId: section.id, sectionTitle: section.title, sectionNote: section.note || '', bookId: parent.bookId, kind: 'sentence', needs_review: !!parent.needs_review || !!entry.needs_review, studyEpoch: S.ui.dataEpoch || 0};
    Object.defineProperty(row, 'progress', {enumerable: true, get: () => entry.progress, set: value => entry.progress = value});
    Object.defineProperty(row, 'extraPractice', {enumerable: true, get: () => entry.extraPractice, set: value => entry.extraPractice = value});
    return row;
  };
  const find = id => {
    for (const parent of S.data.items.filter(S.isSentenceSummary)) {
      const found = entries(parent).find(row => parent.id + '::' + row.entry.id === id);
      if (found) return found;
    }
    return null;
  };
  S.studyItems = (rows = S.data.items) => rows.flatMap(note => S.isSentenceSummary(note) ? entries(note).map(virtual) : [note]);
  S.resolveStudyItem = id => { const saved = S.data.items.find(note => note.id === id); if (saved) return saved; const source = find(id); return source ? virtual(source) : null; };
  S.isCurrentStudyItem = row => !row.parentId || row.studyEpoch === (S.ui.dataEpoch || 0) && !!find(row.id);
  S.summaryUnitCount = note => S.isSentenceSummary(note) ? entries(note).length : 0;
  S.studyEventCount = note => (note.progress?.events?.length || 0) + (S.isSentenceSummary(note) ? entries(note).reduce((sum, {entry}) => sum + (entry.progress?.events?.length || 0), 0) : 0);
  const entrySearchText = entry => JSON.stringify([entry.text, entry.meaning, entry.meaningZh, entry.subsection, entry.situation, entry.listenerLevel, entry.subjectHonorific, entry.expressionGroup, entry.note, entry.words, entry.grammar, entry.qa, entry.auxiliary]);
  S.summarySearchText = note => S.isSentenceSummary(note) ? JSON.stringify([note.text, note.note, entries(note).map(({section, entry}) => [section.title, entrySearchText(entry)])]) : note.parentId ? JSON.stringify([note.sectionTitle, entrySearchText(note)]) : '';
  const changed = done => { S.ui.dataEpoch = (S.ui.dataEpoch || 0) + 1; S.persist(); (done || S.render)(); };
  S.editSummaryParent = (parent, done) => {
    if (!S.isSentenceSummary(parent)) return false;
    S.editFields('修改总卡', [{key: 'text', label: '总卡标题', value: parent.text, required: true}, {key: 'note', label: '中文说明', value: parent.note || '', type: 'textarea'}], values => {
      if (!S.data.items.includes(parent)) { S.toast('总卡已删除，本次修改未保存。'); return; }
      Object.assign(parent, values, {text: values.text.trim(), manual: true}); changed(done); S.toast('总卡说明已保存，内部学习记录保留。');
    });
    return true;
  };
  S.editSummaryUnit = (note, done) => {
    const source = find(note.id); if (!source) return false;
    const row = source.entry;
    const fields = [
      {key: 'text', label: '韩语句子', value: row.text, required: true}, {key: 'meaning', label: '英文意思', value: row.meaning || ''}, {key: 'meaningZh', label: '中文意思', value: row.meaningZh || ''},
      {key: 'situation', label: '使用情境', value: row.situation || ''}, {key: 'listenerLevel', label: '听者礼貌程度', value: row.listenerLevel || ''}, {key: 'subjectHonorific', label: '主体尊敬说明', value: row.subjectHonorific || ''},
      {key: 'expressionGroup', label: '同义表达分组', value: row.expressionGroup || ''}, {key: 'note', label: '中文注释', value: row.note || '', type: 'textarea'}
    ];
    const nested = [['words', '词汇', ['text', '韩语'], ['meaning', '英文意思'], ['note', '中文说明']], ['grammar', '语法', ['text', '语法点'], ['explanation', '中文解释']], ['qa', '问答', ['question', '韩语问句'], ['questionMeaning', '问句英文意思'], ['answer', '韩语答句'], ['answerMeaning', '答句英文意思']], ['auxiliary', '补充词', ['text', '韩语'], ['meaning_en', '英文意思'], ['explanation_zh', '中文解释']]];
    for (const [group, label, ...parts] of nested) (row[group] || []).forEach((item, index) => parts.forEach(([key, text]) => fields.push({key: `${group}-${index}-${key}`, label: `${label} ${index + 1} · ${text}`, value: item[key] || '', type: key === 'explanation' || key === 'explanation_zh' || key === 'note' ? 'textarea' : 'text'})));
    const keys = ['text', 'meaning', 'meaningZh', 'situation', 'listenerLevel', 'subjectHonorific', 'expressionGroup', 'note'];
    S.editFields('修改内部句子', fields, values => {
      if (find(note.id)?.entry !== row) { S.toast('这句已删除，本次修改未保存。'); return; }
      for (const key of keys) if (key in values) row[key] = values[key];
      for (const [group] of nested) if (Array.isArray(row[group])) row[group] = structuredClone(row[group]);
      for (const [group, , ...parts] of nested) (row[group] || []).forEach((item, index) => parts.forEach(([key]) => { const field = `${group}-${index}-${key}`; if (field in values) item[key] = values[field]; }));
      Object.assign(row, {text: row.text.trim(), manual: true}); changed(done); S.toast('句子已保存，原有学习记录保留。');
    });
    return true;
  };
  S.beginSummaryBatch = (id, action, done) => {
    const source = find(id), parent = source?.parent || S.data.items.find(row => row.id === id && S.isSentenceSummary(row)); if (!parent) return;
    S.clearManagement?.(); S.ui.summaryBatch = {parentId: parent.id, action, selected: new Set(source ? [id] : entries(parent).map(({entry}) => parent.id + '::' + entry.id))};
    (done || S.render)();
  };
  S.beginSummaryDelete = (id, done) => S.beginSummaryBatch(id, 'delete', done);
  S.deleteSummaryUnits = (ids, done) => {
    const idSet = new Set(ids), selected = [...idSet].map(find).filter(Boolean);
    if (!selected.length) return false;
    const direct = S.data.items.flatMap((row, position) => idSet.has(row.id) ? [{row, position}] : []);
    const rows = selected.filter(row => !idSet.has(row.parent.id)).map(row => ({...row, position: row.section.entries.indexOf(row.entry)}));
    const units = rows.length + direct.reduce((sum, {row}) => sum + S.summaryUnitCount(row), 0);
    const records = rows.reduce((sum, row) => sum + (row.entry.progress?.events?.length || 0), 0) + direct.reduce((sum, {row}) => sum + S.studyEventCount(row), 0);
    S.confirmDelete({title: direct.length ? '删除所选内容' : '删除内部句子', message: `将删除 ${units} 个内部句子${direct.length ? `、${direct.length} 张卡片` : ''}及 ${records} 条学习记录。${direct.some(({row}) => S.isSentenceSummary(row)) ? '所选总卡一并删除，其他内容保留。' : '总卡及其他句子保留。'}`, onCancel: done || S.render, onConfirm: () => {
      const removed = rows.filter(row => find(row.parent.id + '::' + row.entry.id)?.entry === row.entry);
      const removedCards = direct.filter(({row}) => S.data.items.includes(row));
      const removedIds = removedCards.map(({row}) => row.id), links = S.unlinkRemovedCards?.(removedIds) || [], cardMarkers = {...S.data.deletedCardKeys}, sourceMarkers = {...S.data.deletedSourceCards};
      S.data.deletedCardKeys ||= {};
      for (const {row} of removedCards) S.data.deletedCardKeys[row.bookId + '|' + String(row.text || '').normalize('NFC').trim()] = true;
      for (const {row} of removedCards) if (row.source_file_id) (S.data.deletedSourceCards ||= {})[row.source_file_id + '|' + row.id] = true;
      const markers = new Map(removed.map(row => [row.parent, [...(row.parent.deletedUnitIds || [])]]));
      for (const row of removed) { row.section.entries = row.section.entries.filter(entry => entry !== row.entry); row.parent.deletedUnitIds = [...new Set([...(row.parent.deletedUnitIds || []), row.entry.id])]; }
      S.data.items = S.data.items.filter(row => !removedIds.includes(row.id));
      S.clearManagement?.(); changed(done);
      S.toast(`已删除 ${removed.length} 个内部句子${removedCards.length ? `、${removedCards.length} 张卡片` : ''}。`, () => {
        for (const {row, position} of removedCards) if (!S.data.items.some(item => item.id === row.id)) S.data.items.splice(Math.min(position, S.data.items.length), 0, row);
        for (const row of [...removed].sort((a, b) => a.position - b.position)) if (S.data.items.includes(row.parent) && row.parent.sections.includes(row.section) && !row.section.entries.some(entry => entry.id === row.entry.id)) row.section.entries.splice(Math.min(row.position, row.section.entries.length), 0, row.entry);
        for (const [parent, before] of markers) if (S.data.items.includes(parent)) parent.deletedUnitIds = before;
        S.data.deletedCardKeys = cardMarkers; S.data.deletedSourceCards = sourceMarkers; S.restoreCardLinks?.(links);
        changed(done);
      });
    }});
    return true;
  };
  const auxiliaryHTML = row => {
    const words = (row.auxiliary || []).filter((word, index, all) => all.findIndex(other => clean(other.text) === clean(word.text) && clean(other.meaning_en) === clean(word.meaning_en)) === index && !(row.words || []).some(other => clean(other.text) === clean(word.text) && clean(other.meaning) === clean(word.meaning_en)));
    return words.length ? `<dl class="summary-qa-words">${words.map(word => `<dt lang="ko">${e(word.text)}</dt><dd lang="en">${e(word.meaning_en)}</dd>`).join('')}</dl>` : '';
  };
  const detailHTML = row => `<div class="summary-explanations">${(row.words || []).length ? `<div><h4>词汇</h4><dl>${row.words.map(word => `<dt lang="ko">${e(word.text)}</dt><dd><span lang="en">${e(word.meaning)}</span>${word.note ? `<small>${e(word.note)}</small>` : ''}</dd>`).join('')}</dl></div>` : ''}${(row.grammar || []).length ? `<div><h4>语法</h4><dl>${row.grammar.map(point => `<dt>${e(point.text)}</dt><dd>${e(point.explanation)}</dd>`).join('')}</dl></div>` : ''}</div>${row.note ? `<p class="summary-note">${e(row.note)}</p>` : ''}${(row.qa || []).length || (row.auxiliary || []).length ? `<div class="summary-dialogue"><h4>常用问答</h4>${(row.qa || []).map(pair => `<div><p><span>问</span><button type="button" class="plain-button ko" data-summary-speak="${e(pair.question)}">${e(pair.question)}</button><small lang="en">${e(pair.questionMeaning)}</small></p><p><span>答</span><button type="button" class="plain-button ko" data-summary-speak="${e(pair.answer)}">${e(pair.answer)}</button><small lang="en">${e(pair.answerMeaning)}</small></p></div>`).join('')}${auxiliaryHTML(row)}</div>` : ''}`;
  const metaHTML = row => `<dl class="summary-meta">${[['使用情境', row.situation], ['听者礼貌', row.listenerLevel], ['主体尊敬', row.subjectHonorific]].filter(([, value]) => value).map(([label, value]) => `<dt>${label}</dt><dd>${e(value)}</dd>`).join('')}</dl>`;
  const sectionNoteHTML = row => row.sectionNote ? `<p class="summary-note">${e(row.sectionNote)}</p>` : '';
  S.summaryStudyDetails = (row, full = false) => row.parentId && full ? `<section class="summary-study-details sentence-reading-details" data-study-id="${e(row.id)}">${sectionNoteHTML(row)}${metaHTML(row)}${detailHTML(row)}</section>` : '';
  S.sentenceReadingDetails = row => {
    const linked = [...(row.wordIds || []), ...(row.grammarIds || [])].map(id => S.resolveStudyItem(id)).filter(Boolean);
    const words = [...(row.words || []), ...linked.filter(item => item.kind === 'word').map(item => ({text: item.text, meaning: S.studyMeaning?.(item) || item.meaning || item.meaningZh, note: item.note}))];
    const grammar = [...(row.grammar || []), ...linked.filter(item => item.kind === 'grammar').map(item => ({text: item.text, explanation: item.explanation}))];
    return `<section class="summary-study-details sentence-reading-details" data-study-id="${e(row.id)}">${row.sectionTitle || row.subsection ? `<p class="sentence-reading-scope">${e([row.sectionTitle, row.subsection].filter(Boolean).join(' · '))}</p>` : ''}${sectionNoteHTML(row)}${metaHTML(row)}${detailHTML({...row, words, grammar})}</section>`;
  };
  S.wireSummarySpeech = container => container.querySelectorAll('[data-summary-speak],.summary-explanations [lang="en"],.summary-dialogue [lang="en"]').forEach(element => {
    const text = element.dataset.summarySpeak || element.textContent.trim(), lang = element.dataset.summarySpeak ? 'ko' : /[\u3400-\u9fff]/.test(text) ? 'zh' : 'en';
    if (!text) return;
    const speak = () => S.toggleSpeech([{text, lang, sentence: !!element.dataset.summarySpeak}], 'summary-dialogue:' + lang + ':' + text);
    element.setAttribute('role', 'button'); element.tabIndex = 0; element.setAttribute('aria-label', `朗读${lang === 'ko' ? '句子' : '释义'}：${text}`);
    element.onclick = event => { event.stopPropagation(); speak(); };
    element.onkeydown = event => {
      if (event.target !== element || event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || document.querySelector('dialog[open]') || !S.$('#contextMenu').hidden) return;
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); speak(); }
    };
    S.manage?.(element, () => {
      const owner = element.closest('[data-study-id],[data-summary-unit]'), note = S.resolveStudyItem(owner?.dataset.studyId || owner?.dataset.summaryUnit);
      return [{label: lang === 'ko' ? '朗读句子' : '朗读释义', fn: speak}, ...(note ? [{label: '编辑句子卡', fn: () => S.editItem(note, () => S.renderBook(note.bookId, false))}] : [])];
    });
  });
  S.renderSentenceSummary = (parent, {query = '', selectHTML = ''} = {}) => {
    const target = clean(query), whole = !target || clean(parent.text).includes(target);
    const batch = S.ui.summaryBatch?.parentId === parent.id ? S.ui.summaryBatch : null;
    const available = new Set(entries(parent).map(({entry}) => parent.id + '::' + entry.id));
    if (batch) batch.selected = new Set([...batch.selected].filter(id => available.has(id)));
    const visible = [];
    const sections = parent.sections.map(section => {
      const units = (section.entries || []).filter(entry => whole || clean(section.title).includes(target) || clean(section.note).includes(target) || clean(entrySearchText(entry)).includes(target));
      return units.length ? `<section class="summary-section" data-summary-section="${e(section.id)}"><h3>${e(section.title)}</h3>${sectionNoteHTML({sectionNote: section.note})}${units.map(entry => { const row = virtual({parent, section, entry}); visible.push(row.id); return `${entry.subsection ? `<h4 class="summary-subsection">${e(entry.subsection)}</h4>` : ''}<div class="summary-entry" data-summary-unit="${e(row.id)}" data-study-id="${e(row.id)}" tabindex="0" aria-label="${e(row.text)}，单击朗读，F2 修改，右键管理">${batch ? `<label class="note-select"><input type="checkbox" data-summary-select="${e(row.id)}" ${batch.selected.has(row.id) ? 'checked' : ''} aria-label="选择${e(row.text)}"></label>` : ''}<h4 class="summary-term" lang="ko">${e(row.text)}</h4><p class="meaning" lang="${row.meaning ? 'en' : 'zh'}">${e(row.meaning || row.meaningZh || '暂无释义')}</p>${metaHTML(row)}<details class="summary-details"><summary>词汇、语法与问答</summary>${detailHTML(row)}</details></div>`; }).join('')}</section>` : '';
    }).join('');
    const action = batch?.action || 'delete', label = action === 'extra-add' ? '加入再记一遍' : action === 'extra-remove' ? '移出再记一遍' : '删除所选句子';
    const toolbar = batch ? S.batchToolbar({action, label, count: batch.selected.size, all: !!visible.length && visible.every(id => batch.selected.has(id)), partial: visible.some(id => batch.selected.has(id)) && !visible.every(id => batch.selected.has(id)), prefix: 'summaryUnits'}) : '';
    return `<article class="note-card sentence-summary" data-note="${e(parent.id)}" data-masonry-wide tabindex="0" aria-label="${e(parent.text)}，右键管理总卡"><div class="note-card-head">${selectHTML}<h2>${e(parent.text)}</h2></div><p class="small muted">1 张总卡 · ${S.summaryUnitCount(parent)} 个内部句子</p>${parent.note ? `<p>${e(parent.note)}</p>` : ''}${toolbar}${sections}${parent.original_note ? `<details class="original-note"><summary>原始内容</summary><p>${e(parent.original_note)}</p></details>` : ''}${(parent.sources || []).length ? `<details class="summary-sources"><summary>用法核对来源</summary>${parent.sources.map(source => `<p>${/^https?:\/\//.test(source.url || '') ? `<a href="${e(source.url)}" target="_blank" rel="noopener noreferrer">${e(source.title)}</a>` : e(source.title)}</p>`).join('')}</details>` : ''}</article>`;
  };
  S.wireSentenceSummary = (container, parent, done) => {
    const card = [...container.querySelectorAll('[data-note]')].find(element => element.dataset.note === parent.id);
    const keyReady = event => !event.defaultPrevented && !event.repeat && !event.isComposing && event.keyCode !== 229 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && !document.querySelector('dialog[open]') && S.$('#contextMenu').hidden && !event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
    card?.addEventListener('keydown', event => { if (event.target === card && event.key === 'F2' && keyReady(event)) { event.preventDefault(); event.stopPropagation(); S.editSummaryParent(parent, done); } });
    const batch = S.ui.summaryBatch?.parentId === parent.id ? S.ui.summaryBatch : null;
    if (batch && card) {
      const visible = [...card.querySelectorAll('[data-summary-select]')].map(input => input.dataset.summarySelect);
      card.querySelectorAll('[data-summary-select]').forEach(input => { input.onclick = event => event.stopPropagation(); input.onchange = event => { event.stopPropagation(); input.checked ? batch.selected.add(input.dataset.summarySelect) : batch.selected.delete(input.dataset.summarySelect); (done || S.render)(); }; });
      const all = card.querySelector('#summaryUnits-All'); all.indeterminate = all.dataset.partial === 'true'; all.onclick = event => event.stopPropagation(); all.onchange = event => { visible.forEach(id => event.target.checked ? batch.selected.add(id) : batch.selected.delete(id)); (done || S.render)(); };
      card.querySelector('#summaryUnits-Cancel').onclick = event => { event.stopPropagation(); S.ui.summaryBatch = null; (done || S.render)(); };
      card.querySelector('#summaryUnits-Execute').onclick = event => { event.stopPropagation(); if (!batch.action || batch.action === 'delete') S.deleteSummaryUnits([...batch.selected], done); else S.markExtra([...batch.selected], batch.action === 'extra-add', () => { S.ui.summaryBatch = null; (done || S.render)(); }); };
    }
    container.querySelectorAll('[data-summary-unit]').forEach(element => {
      const note = S.resolveStudyItem(element.dataset.summaryUnit); if (!note || note.parentId !== parent.id) return;
      const edit = () => S.editSummaryUnit(note, done), remove = () => S.deleteSummaryUnits([note.id], done);
      const speak = () => { S.rememberStudy?.(note); S.toggleSpeech([{text: note.text, lang: 'ko', sentence: true}], 'summary-unit:' + note.id); };
      S.manage(element, [{label: '修改这句', fn: edit}, ...((note.meaning || note.meaningZh || '').trim() ? [{label:'朗读释义',fn:()=>S.toggleSpeech([{text:note.meaning||note.meaningZh,lang:note.meaning?'en':'zh'}],'summary-meaning:'+note.id)}] : []), {label: note.extraPractice ? '移出再记一遍' : '加入再记一遍', fn: () => S.beginSummaryBatch(note.id, note.extraPractice ? 'extra-remove' : 'extra-add', done)}, {label: '将整张总卡加入再记一遍', fn: () => S.beginSummaryBatch(parent.id, 'extra-add', done)}, {label: '删除这句', fn: () => S.beginSummaryDelete(note.id, done)}], remove);
      let timer;
      element.addEventListener('click', event => { if (!event.target.closest('button,input,textarea,select,[contenteditable],label,summary,a')) { clearTimeout(timer); const epoch = S.ui.playbackStopEpoch || 0; timer = setTimeout(() => { if (element.isConnected && S.isCurrentStudyItem(note) && epoch === (S.ui.playbackStopEpoch || 0)) speak(); }, 230); } });
      element.addEventListener('dblclick', event => { if (!event.target.closest('button,input,textarea,select,[contenteditable],label,summary,a')) { clearTimeout(timer); event.stopPropagation(); edit(); } });
      element.addEventListener('keydown', event => { if (event.target !== element || !keyReady(event)) return; if (event.key === 'F2') { event.preventDefault(); event.stopPropagation(); edit(); } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); speak(); } });
    });
    S.wireSummarySpeech(container);
  };
  S.importSceneSentenceNotes = () => {
    const source = window.SCENE_SENTENCE_NOTES; if (!source || !S.data || S.data.legacyImportsDisabled || !Array.isArray(source.sections) || !source.sections.length || !['id', 'notebookId', 'bookId', 'title'].every(key => typeof source[key] === 'string' && source[key].trim())) return false;
    S.data.sceneSummaryImports ||= {};
    if (S.data.sceneSummaryImports[source.id]) return false;
    const key = source.bookId + '|' + String(source.title).normalize('NFC').trim();
    if (S.data.items.some(note => note.id === source.id) || S.data.deletedContainers?.[source.notebookId] || S.data.deletedContainers?.[source.bookId] || S.data.deletedCardKeys?.[key]) { S.data.sceneSummaryImports[source.id] = true; S.persist(); return false; }
    const sections = structuredClone(source.sections), ids = new Set(), sectionIds = new Set();
    for (const section of sections) {
      if (!section || typeof section.id !== 'string' || !section.id.trim() || sectionIds.has(section.id) || !Array.isArray(section.entries) || !section.entries.length) return false;
      sectionIds.add(section.id);
      section.entries = section.entries.map(entry => structuredClone(entry));
      for (const entry of section.entries) { if (!entry || typeof entry.id !== 'string' || !entry.id.trim() || ids.has(entry.id) || typeof entry.text !== 'string' || !/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(entry.text) || typeof entry.meaning !== 'string' || !/[A-Za-z]/.test(entry.meaning)) return false; ids.add(entry.id); entry.progress ||= progress(); }
    }
    if (!S.data.projects.some(project => project.id === source.notebookId)) S.data.projects.push({id: source.notebookId, name: '日常情境', groupId: null, expanded: true, modules: []});
    if (!S.data.books.some(book => book.id === source.bookId)) S.data.books.push({id: source.bookId, name: '句子卡', kind: 'sentence', projectId: source.notebookId, groupId: null});
    const saved = S.addItem(source.bookId, {id: source.id, text: source.title, contentType: 'sentence-summary', sections, sources: structuredClone(source.sources || []), original_note: source.original_note || '', protectedOriginal: true, note: '按情境阅读；学习与测试逐句进行。词汇和语法说明只保存在总卡内部。'});
    if (!saved) return false;
    S.data.sceneSummaryImports[source.id] = true; S.persist(); return true;
  };
  document.addEventListener('DOMContentLoaded', () => { if (S.importSceneSentenceNotes()) { S.refreshSidebar(); S.render(); } });
})();
