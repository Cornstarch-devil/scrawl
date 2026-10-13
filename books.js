(function () {
  'use strict';
  const S = window.SC;
  const e = S.esc;
  const icon = name => S.icon(name);
  const norm = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/[.!?。！？，,]/g, '').replace(/\s+/g, ' ');
  const shuffle = values => values.map(value => ({value, order: Math.random()})).sort((a, b) => a.order - b.order).map(row => row.value);
  const itemsFor = book => S.itemsFor(book);
  const studyItems = rows => S.studyItems?.(rows) || rows;
  const meaning = item => S.studyMeaning?.(item) ?? (item.meaning || item.meaningZh || '');
  const meaningLang = item => /[\u3400-\u9fff]/.test(meaning(item)) ? 'zh' : 'en';
  const meaningReadMenu = item => ['word','sentence'].includes(item.kind) && meaning(item).trim() ? [{label:'朗读释义',fn:()=>S.toggleSpeech([{text:meaning(item),lang:meaningLang(item)}],`meaning:${item.id}`)}] : [];
  const cardLabel = kind => S.cardLabel?.(kind) || (kind === 'sentence' ? '句子卡' : kind === 'word' ? '单词卡' : '语法卡');
  const koTitle = text => /[\u3400-\u9fff]/.test(text || '') ? '' : ' lang="ko"';
  const readyForPractice = item => !!String(item.kind === 'grammar' ? item.explanation || '' : meaning(item)).trim();
  const promptText = (question, item) => question.direction === 'grammar' ? question.sentence : question.direction === 'korean' ? meaning(item) : item.text;
  const promptLang = (question, item) => question.direction === 'grammar' ? question.usage ? 'zh' : 'ko' : question.direction === 'korean' ? meaningLang(item) : 'ko';
  const answerText = (question, item) => question.direction === 'grammar' ? question.answer : question.direction === 'korean' ? item.text : meaning(item);
  const answerLang = (question, item) => question.direction === 'grammar' ? /[\u3400-\u9fff]/.test(question.answer) ? 'zh' : 'ko' : question.direction === 'korean' ? 'ko' : meaningLang(item);
  const button = (action, name, label, extra = '') => `<button type="button" class="icon-button" data-action="${action}" aria-label="${e(label)}" title="${e(label)}" ${extra}>${icon(name)}</button>`;
  const sourceNote = item => `${item.original_note ? `<details class="original-note"><summary>原笔记</summary><p>${e(item.original_note)}</p></details>` : ''}`;
  const prepare = parts => S.prepareSpeech?.(parts.filter(part => (part.lang || 'ko') === 'ko'))?.catch(() => {});
  const announceSpeech = (text, lang, source, sentence = false) => ['ko','en'].includes(lang) ? S.speak(text, lang, source, sentence) : S.stopSpeech();
  const announceQuestionSpeech = (question, item, text, lang, source) => ['ko','en'].includes(promptLang(question, item)) ? announceSpeech(text, lang, source, item.kind === 'sentence' || question.direction === 'grammar' && text === question.sentence) : S.stopSpeech();
  let fitActiveCard;
  const cardResizeObserver = new ResizeObserver(() => fitActiveCard?.());
  const tableResizeObserver = new ResizeObserver(() => redrawTables?.());
  let redrawTables;

  function stateFor(book) {
    S.ui.books ||= {};
    return S.ui.books[book.id] ||= {mode: book.special || book.kind === 'sentence' && !book.ephemeral ? 'cards' : 'list', selected: [], query: '', cards: {index: 0, back: false}};
  }

  const matchesSearch = (item, query) => norm([item.text, meaning(item), item.explanation, item.formation, item.situation, item.expressionGroup, S.summarySearchText?.(item)].join(' ')).includes(norm(query));
  S.restoreBookBatch = (book, state = stateFor(book)) => {
    const before = state.batchReturn;
    state.selected = []; state.batchAction = null; S.ui.summaryBatch = null;
    if (!before) return false;
    state.mode = before.mode; state.query = before.query || ''; Object.assign(state.cards, before.cards); state.test = before.test;
    state.preservePractice = true; state.batchReturn = null;
    return true;
  };
  S.beginBookBatch = (bookId, action, ids = []) => {
    const book = S.combinedBook?.id === bookId ? S.combinedBook : S.data.books.find(row => row.id === bookId); if (!book) return;
    const state = stateFor(book);
    if (state.mode !== 'list') state.batchReturn ||= {mode: state.mode, query:state.query, cards: {...state.cards}, test: state.test};
    S.ui.navigationEpoch = (S.ui.navigationEpoch || 0) + 1;
    state.mode = 'list'; state.batchAction = action; state.selected = [...new Set(ids)]; S.ui.summaryBatch = null;
    S.renderBook(book.id, false);
  };
  S.beginSentenceBookBatch = S.beginBookBatch;

  function record(item, type, result) {
    if (item.parentId) { if (!S.isCurrentStudyItem?.(item)) return; item = S.resolveStudyItem(item.id); if (!item) return; }
    item.progress ||= {streak: 0, due: '', events: []};
    item.progress.events ||= [];
    item.progress.events.push({type, ...result, at: new Date().toISOString()});
    S.rememberStudy?.(item);
    S.persist();
  }

  function accepts(item, answer) {
    const saved = meaning(item);
    const values = [saved, ...(item.kind === 'sentence' ? [item.meaningZh || ''] : []), ...saved.split(/\s*[;；|/]\s*/)].map(norm).filter(Boolean);
    const simple = value => value.replace(/^(to|a|an|the) /, '');
    return !!norm(answer) && values.some(value => value === norm(answer) || simple(value) === simple(norm(answer)));
  }

  function choiceOptions(item, list, value, excluded) {
    const answer = value(item), seen = new Set([norm(answer).replace(/^(to|a|an|the) /, '')]), options = [answer], selected = [item];
    const localIds = new Set(list.map(row => row.id));
    const groups = [list, studyItems(S.data.items).filter(row => !localIds.has(row.id))];
    for (const group of groups) for (const row of shuffle(group)) {
      const text = value(row);
      const key = norm(text).replace(/^(to|a|an|the) /, '');
      if (row.kind !== item.kind || !readyForPractice(row) || !key || seen.has(key) || excluded(row, text) || item.kind !== 'grammar' && selected.some(prior => accepts(prior, meaning(row)) || accepts(row, meaning(prior)))) continue;
      seen.add(key); options.push(text); selected.push(row);
      if (options.length === 4) return shuffle(options);
    }
    return options.length >= 2 ? shuffle(options) : null;
  }

  function wordQuestion(item, list, direction = 'meaning') {
    const sameWord = list.filter(row => row.kind === item.kind && norm(row.text) === norm(item.text));
    const ambiguous = sameWord.some(row => norm(meaning(row)) !== norm(meaning(item)));
    const accepted = sameWord.filter(row => !ambiguous || row.example === item.example);
    const context = ambiguous ? (direction === 'korean' ? item.translation || '' : item.example || '') : '';
    const value = row => direction === 'korean' ? row.text : meaning(row);
    const options = choiceOptions(item, list, value, (row, text) => norm(row.text) === norm(item.text) || accepted.some(reference => direction === 'korean' ? accepts(reference, meaning(row)) || accepts(row, meaning(reference)) : accepts(reference, text) || accepts(row, meaning(reference))));
    return options ? {id: item.id, direction, context, acceptedIds: accepted.map(row => row.id), stage: 'choice', options} : null;
  }

  function sentenceQuestion(item, list, direction) {
    const equivalent = row => row.id === item.id || !!item.expressionGroup && row.expressionGroup === item.expressionGroup && (!item.parentId || row.parentId === item.parentId) && ['situation', 'listenerLevel', 'subjectHonorific'].every(key => norm(row[key]) === norm(item[key]));
    const accepted = list.filter(equivalent);
    const value = row => direction === 'korean' ? row.text : meaning(row);
    const options = choiceOptions(item, list, value, (row, text) => equivalent(row) || norm(row.text) === norm(item.text) || accepted.some(reference => direction === 'korean' ? accepts(reference, meaning(row)) || accepts(row, meaning(reference)) : accepts(reference, text) || accepts(row, meaning(reference))));
    return options ? {id: item.id, direction, context: '', acceptedIds: accepted.map(row => row.id), stage: 'choice', options} : null;
  }

  const makeQuestion = (item, list, index = 0, direction = 'meaning') => {
    if (item.kind === 'grammar') { const question = grammarQuestion(item, list); return question ? {id: item.id, direction: 'grammar', ...question} : null; }
    return item.kind === 'sentence' ? sentenceQuestion(item, list, index % 2 ? 'korean' : 'meaning') : wordQuestion(item, list, direction);
  };

  function questionAccepts(question, item, answer, list) {
    if (question.direction === 'grammar') return !!norm(answer) && norm(answer) === norm(question.answer);
    return (question.acceptedIds || [item.id]).some(id => { const reference = list.find(row => row.id === id); return reference && (question.direction === 'korean' ? !!norm(answer) && norm(reference.text) === norm(answer) : accepts(reference, answer)); });
  }

  function practiceKey(event, input) {
    if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || document.querySelector('dialog[open]') || !S.$('#contextMenu').hidden || event.target.closest('#globalComposer')) return false;
    if (Object.values(S.ui.books || {}).some(state => state.batchAction) || S.ui.sidebarSelection || S.ui.summaryBatch) return false;
    const field = event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
    if (event.key === 'Enter' && event.target.closest('button,a')) return false;
    return !field || field === input || field.type === 'radio';
  }

  function focusPractice(mount, input) {
    const focused = document.activeElement;
    if (!document.querySelector('dialog[open]') && !focused?.closest('#globalComposer') && (S.root.contains(focused) || focused === document.body)) (input || mount).focus({preventScroll: true});
  }

  function markExtra(book, ids, enabled, state) {
    const done = () => { if (book.special) S.stopSpeech(); S.restoreBookBatch(book,state); state.selected = []; state.batchAction = null; S.renderBook(book.id,false); };
    if (book.special && enabled === false) S.removeExtra(ids,done); else S.markExtra(ids,enabled,done);
  }

  function remove(book, ids, state) {
    if (book.special) { markExtra(book, ids, false, state); return; }
    S.deleteCards(ids, () => {
      state.selected = [];
      state.batchAction = null;
      if (!S.restoreBookBatch(book,state) && !book.ephemeral) state.mode = book.kind === 'sentence' ? 'cards' : 'list';
      S.renderBook(book.id, false);
    });
  }

  function wirePracticeManagement(book, state, element, item) {
    if (!element || !item) return;
    element.dataset.studyId = item.id;
    S.manage(element, () => [
      {label:'编辑' + cardLabel(item.kind),icon:'pencil',fn:()=>S.editItem(item,()=>S.renderBook(book.id,false))},
      ...meaningReadMenu(item),
      {label:item.extraPractice ? '移出再记一遍' : '加入再记一遍',icon:'reviewRepeat',fn:()=>S.beginBookBatch(book.id,item.extraPractice ? 'extra-remove' : 'extra-add',[item.id])},
      ...(!book.special ? [{label:'删除' + cardLabel(item.kind),icon:'deleteOne',fn:()=>S.beginBookBatch(book.id,'delete',[item.id])}] : [])
    ],()=>remove(book,[item.id],state));
  }

  function wireNotes(mount, list, afterEdit) {
    let clickTimer;
    mount.querySelectorAll('[data-note]').forEach(card => {
      const item = list.find(row => row.id === card.dataset.note);
      if (!item) return;
      if (S.isSentenceSummary?.(item)) return;
      const speak = () => { S.rememberStudy?.(item); if (item.kind === 'grammar') S.stopSpeech(); else S.toggleSpeech([{text: item.text, lang: 'ko', sentence: item.kind === 'sentence'}], `note:${item.id}`); };
      card.addEventListener('click', event => {
        if (event.target.closest('button,input,label,select,a,summary')) return;
        if (item.kind === 'grammar' && event.target.closest('.grammar-explanation,.grammar-note-text')) { S.rememberStudy?.(item); S.stopSpeech(); return; }
        clearTimeout(clickTimer);
        const part = event.target.closest('.example-ko,.translation,.meaning');
        if (item.kind === 'grammar' && part && !part.matches('.example-ko')) { S.stopSpeech(); return; }
        const epoch = S.ui.playbackStopEpoch || 0;
        clickTimer = setTimeout(() => { if (!card.isConnected || epoch !== (S.ui.playbackStopEpoch || 0)) return; if (part) { S.rememberStudy?.(item); S.toggleSpeech([{text: part.textContent.trim(), lang: part.matches('.example-ko') ? 'ko' : part.matches('.meaning') ? meaningLang(item) : 'en', sentence: part.matches('.example-ko')}], `note:${item.id}:${part.matches('.example-ko') ? 'example' : part.matches('.meaning') ? 'meaning' : 'translation'}`); } else speak(); }, 230);
      });
      card.addEventListener('dblclick', event => {
        if (event.target.closest('button,input,label,select,a,summary')) return;
        clearTimeout(clickTimer);
        S.stopSpeech();
        if (item.kind === 'grammar' && event.target.closest('[data-grammar-title]')) { S.startGrammarPractice(item.bookId,[item.id]); return; }
        S.editItem(item, afterEdit);
      });
      card.addEventListener('keydown', event => {
        if (event.target !== card || !practiceKey(event)) return;
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); speak(); }
        if (event.key === 'F2') { event.preventDefault(); S.stopSpeech(); S.editItem(item, afterEdit); }
      });
      card.querySelector('[data-grammar-title]')?.addEventListener('keydown',event=>{
        if (!practiceKey(event)) return;
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); S.startGrammarPractice(item.bookId,[item.id]); }
        if (event.key === 'F2') { event.preventDefault(); event.stopPropagation(); S.editItem(item,afterEdit); }
      });
    });
  }

  function wordTablesHTML(rows, selected = new Set(), columns = 3, selecting = false) {
    const size = Math.ceil(rows.length / columns);
    return Array.from({length: columns}, (_, index) => rows.slice(index * size, (index + 1) * size)).map((part, index) => `<section class="word-table-card"><table aria-label="单词表 ${index + 1}"><thead><tr><th scope="col">韩语</th><th scope="col">英文</th></tr></thead><tbody>${part.map(item => `<tr class="word-note word-table-row" data-note="${e(item.id)}" tabindex="0" aria-label="${e(item.text)}，单击朗读，双击或 F2 编辑，右键管理"><td>${selecting ? `<label class="note-select"><input type="checkbox" data-select="${e(item.id)}" ${selected.has(item.id) ? 'checked' : ''} aria-label="选择${e(item.text)}"></label>` : ''}<strong class="word-title" lang="ko">${e(item.text)}</strong></td><td class="meaning" lang="${meaningLang(item)}">${e(meaning(item) || '暂无释义')}</td></tr>`).join('')}</tbody></table></section>`).join('');
  }

  function renderList(book, state, mount, list, announce = true) {
    if (book.kind === 'sentence') list = studyItems(list);
    const filtered = () => list.filter(item => matchesSearch(item, state.query));
    mount.innerHTML = `<div class="book-toolbar"><label class="search-field">${icon('search')}<input id="book-search" aria-label="查找${cardLabel(book.kind)}" placeholder="查找" value="${e(state.query)}"></label><div class="book-actions" id="book-actions"></div></div><div id="notebook-list" class="${book.kind === 'word' ? 'word-tables' : book.kind === 'sentence' ? 'sentence-grid' : 'grammar-notes-page'}"></div>`;
    const grid = mount.querySelector('#notebook-list');
    const begin = (action, id) => { S.ui.summaryBatch = null; S.ui.grammarSourceBatch = null; state.batchAction = action; state.selected = id ? [id] : []; draw(); };
    const cancel = () => { if (S.restoreBookBatch(book, state)) S.renderBook(book.id, false); else draw(); };
    const add = () => { S.stopSpeech(); S.$('#chatInput')?.focus(); S.toast(`在下方输入学习材料，可整理并保存到${cardLabel(book.kind)}。`); };
    const restoreMenu = () => [...(book.kind === 'grammar' && S.canUndoDittoWordRestore?.(book.id) ? [{label: '撤销 Word 恢复', icon: 'undo', fn: () => S.undoDittoWordRestore(book.id)}] : []), ...(S.workbookUndoEntries?.(book.id) || [])];
    const draw = () => {
      const rows = filtered();
      const selected = new Set(state.selected);
      const selectBox = item => state.batchAction ? `<label class="note-select"><input type="checkbox" data-select="${e(item.id)}" ${selected.has(item.id) ? 'checked' : ''} aria-label="选择${e(item.text)}"></label>` : '';
      let lastGroup = null;
      const ordered = book.kind === 'sentence' ? rows.flatMap((item, index) => rows.findIndex(row => (row.expressionGroup || row.id) === (item.expressionGroup || item.id)) === index ? rows.filter(row => (row.expressionGroup || row.id) === (item.expressionGroup || item.id)) : []) : rows;
      const width = grid.clientWidth || 780, columns = width >= 780 ? 3 : width >= 520 ? 2 : 1;
      grid.style.setProperty('--word-table-columns', columns);
      grid.innerHTML = book.kind === 'grammar' && S.renderGrammarNotes ? S.renderGrammarNotes(ordered, {book, selectHTML: selectBox, query: state.query}) : ordered.length ? book.kind === 'word' ? wordTablesHTML(ordered, selected, columns, !!state.batchAction) : ordered.map(item => {
        if (book.kind === 'mixed') return `<article class="note-card" data-note="${e(item.id)}" tabindex="0"><div class="note-card-head">${selectBox(item)}<h2>${e(item.text)}</h2></div><p class="meaning">${e(item.kind === 'grammar' ? item.explanation : meaning(item))}</p></article>`;
        if (S.isSentenceSummary?.(item)) return S.renderSentenceSummary(item, {query: state.query, selectHTML: selectBox(item)});
        if (item.kind === 'sentence') {
          const group = item.expressionGroup || item.id;
          const groupHead = lastGroup !== group && item.expressionGroup ? `<div class="sentence-group-label">${e(item.expressionGroup)}</div>` : '';
          lastGroup = group;
          return `${groupHead}<article class="note-card sentence-note" data-note="${e(item.id)}" role="button" tabindex="0" aria-label="${e(item.text)}，单击朗读，双击编辑，右键管理"><div class="note-card-head">${selectBox(item)}<h2 lang="ko">${e(item.text)}</h2></div><p class="meaning">${e(meaning(item) || '暂无释义')}</p>${item.meaning && item.meaningZh ? `<p class="sentence-meaning-zh">${e(item.meaningZh)}</p>` : ''}${S.sentenceReadingDetails?.(item) || ''}</article>`;
        }
        return `<article class="note-card grammar-note" data-note="${e(item.id)}" role="button" tabindex="0" aria-label="${e(item.text)}，展开例句可朗读，双击编辑，右键管理"><div class="note-card-head">${selectBox(item)}<h2${koTitle(item.text)}>${e(item.text)}</h2></div><p class="grammar-explanation">${e(item.explanation || '')}${item.formation ? `<span class="grammar-formation">${e(item.formation)}</span>` : ''}</p>${sourceNote(item)}${item.example || item.translation || item.note ? `<details class="grammar-details"><summary>例句 ${icon('down')}</summary><p class="example-ko" lang="ko">${e(item.example || '')}</p><p class="translation">${e(item.translation || '')}</p>${item.note ? `<p class="grammar-note-text">${e(item.note)}</p>` : ''}</details>` : ''}<button type="button" class="text-button" data-action="practice-one" data-id="${e(item.id)}" ${readyForPractice(item) && grammarQuestion(item) ? '' : 'disabled'}>练一题 ${icon('right')}</button></article>`;
      }).join('') : `<div class="empty-state">${list.length ? '没有匹配的笔记' : '本子还是空的，请右键添加学习内容。'}</div>`;
      grid.querySelectorAll('[data-open-linked]').forEach(control => control.onclick = () => { const linked = S.data.items.find(row => row.id === control.dataset.openLinked); if (linked) S.go(linked.kind === 'word' ? 'words' : 'grammar', linked.bookId); });
      wireNotes(grid, list, () => S.renderBook(book.id, false));
      S.wireSummarySpeech?.(grid);
      grid.querySelectorAll('[data-note]').forEach(card => {
        const item = list.find(row => row.id === card.dataset.note);
        S.manage(card, () => [
          {label: '编辑' + cardLabel(item.kind), icon: 'pencil', fn: () => S.editItem(item, () => S.renderBook(book.id, false))},
          ...meaningReadMenu(item),
          ...(!book.special ? [{label: '添加学习内容', icon: 'plus', fn: add}] : []),
          ...(['word','grammar','sentence'].includes(item.kind) ? [{label: item.extraPractice ? '移出再记一遍' : '加入再记一遍', icon: 'reviewRepeat', fn: () => begin(item.extraPractice ? 'extra-remove' : 'extra-add', item.id)}] : []),
          ...(item.kind === 'grammar' && !book.special ? [{label:'练本语法',fn:()=>S.startGrammarPractice(item.bookId,[item.id])}] : []),
          ...(!book.special ? [{separator: true}, {label: '删除' + cardLabel(item.kind), icon: 'deleteOne', fn: () => begin('delete', item.id)}] : []),
          ...restoreMenu(),
          ...(book.kind === 'word' && S.studyOrderStatus?.(book) && !S.studyOrderStatus(book).startsWith('正在') ? [{label: '重试词汇整理', icon: 'refresh', fn: () => S.retryStudyOrder?.(book)}] : [])
        ], () => remove(book, [item.id], state));
      });
      rows.filter(item => S.isSentenceSummary?.(item)).forEach(parent => S.wireSentenceSummary(grid, parent, () => S.renderBook(book.id, false)));
      grid.querySelectorAll('.grammar-details').forEach(details => details.addEventListener('toggle', () => { if (details.open) { const text = details.querySelector('.example-ko')?.textContent.trim(); if (text) prepare([{text, lang: 'ko'}]); } }));
      grid.querySelectorAll('[data-select]').forEach(input => input.addEventListener('change', () => {
        const next = new Set(state.selected);
        input.checked ? next.add(input.dataset.select) : next.delete(input.dataset.select);
        state.selected = [...next];
        counts();
      }));
      counts();
      S.wireGrammarSourceView?.(grid, book);
    };
    const counts = () => {
      const selected = new Set(state.selected);
      const rows = filtered();
      const count = rows.filter(item => selected.has(item.id)).length;
      const label = state.batchAction === 'extra-add' ? '加入再记一遍' : state.batchAction === 'extra-remove' ? '移出再记一遍' : '删除';
      mount.querySelector('#book-actions').innerHTML = state.batchAction ? S.batchToolbar({action: state.batchAction, label, count: state.selected.length, all: !!rows.length && count === rows.length, partial: count > 0 && count < rows.length, prefix: 'book'}) : `<span class="muted">${list.length} 条</span>${book.kind === 'grammar' ? `<button type="button" id="grammar-all" class="plain-button" ${list.some(readyForPractice) ? '' : 'disabled'}>全部练习</button>` : ''}`;
      const grammarAll = mount.querySelector('#grammar-all'); if (grammarAll) grammarAll.onclick = () => S.startGrammarPractice(book.id);
      const all = mount.querySelector('#book-All');
      if (all) {
        all.indeterminate = count > 0 && count < rows.length;
        all.onchange = event => { const next = new Set(state.selected); filtered().forEach(item => event.target.checked ? next.add(item.id) : next.delete(item.id)); state.selected = [...next]; draw(); };
        mount.querySelector('#book-Cancel').onclick = cancel;
        mount.querySelector('#book-Execute').onclick = () => { if (state.batchAction === 'delete') remove(book, [...state.selected], state); else markExtra(book, [...state.selected], state.batchAction === 'extra-add', state); };
      }
    };
    mount.querySelector('#book-search').addEventListener('input', event => { state.query = event.target.value; draw(); });
    mount.onkeydown = event => { if (event.key === 'Escape' && state.batchAction) { event.preventDefault(); cancel(); } };
    mount.addEventListener('click', event => {
      const control = event.target.closest('[data-action]');
      if (!control) return;
      const item = list.find(row => row.id === control.dataset.id);
      const action = control.dataset.action;
      if (action === 'practice-one' && item) { state.mode = 'practice'; state.grammarIds = [item.id]; state.grammarIndex = 0; state.grammarAnswered = null; state.grammarSelected = null; S.renderBook(book.id); }
    });
    S.manage(grid, () => [{label: '添加学习内容', icon: 'plus', fn: add}, ...(book.kind === 'sentence' ? [{label: '选择全部句子', fn: () => { state.batchAction = 'extra-add'; state.selected = filtered().map(row => row.id); draw(); }}] : []), {label: book.special ? '移出再记一遍' : '删除卡片', icon: 'deleteSelected', fn: () => begin(book.special ? 'extra-remove' : 'delete')}, ...restoreMenu(), ...(book.kind === 'word' ? [{label: '重试词汇整理', icon: 'refresh', fn: () => S.retryStudyOrder?.(book)}] : [])]);
    draw();
    if (book.kind === 'word') { redrawTables = () => { const columns = grid.clientWidth >= 780 ? 3 : grid.clientWidth >= 520 ? 2 : 1; if (columns !== Number(grid.style.getPropertyValue('--word-table-columns'))) draw(); }; tableResizeObserver.observe(grid); }
    if (!announce) return;
    const spoken = studyItems(list);
    if (spoken.length) S.rememberStudy?.(spoken[0]);
    if (spoken.length && book.kind !== 'grammar') {
      prepare(spoken.slice(0, 2).map(item => ({text: item.text, lang: 'ko'})));
      S.speakSequence([{text: spoken[0].text, lang: 'ko', sentence: spoken[0].kind === 'sentence'}], `note:${spoken[0].id}`);
    } else S.stopSpeech();
  }

  function renderCards(book, state, mount, list, focusCard, announce = true) {
    const cards = state.cards;
    const reading = book.kind === 'sentence' && !book.ephemeral && state.mode === 'cards';
    let queue = reading ? list.filter(item => matchesSearch(item, state.query)) : list;
    if (book.kind === 'word' && !book.ephemeral) {
      cards.itemIds ||= list.map(item => item.id);
      const byId = new Map(list.map(item => [item.id, item]));
      queue = cards.itemIds.map(id => byId.get(id)).filter(Boolean);
      if (cards.currentId) {
        const index = queue.findIndex(item => item.id === cards.currentId);
        if (index >= 0) cards.index = index;
        else cards.back = false;
      }
    }
    const searchHTML = reading ? `<div class="book-toolbar"><label class="search-field">${icon('search')}<input id="book-search" aria-label="查找句子卡" placeholder="查找" value="${e(state.query)}"></label><span class="muted">${queue.length}${state.query ? ` / ${list.length}` : ''} 句</span></div>` : '';
    const wireSearch = () => { const field = mount.querySelector('#book-search'); if (field) field.oninput = event => { state.query = event.target.value; cards.index = 0; cards.back = false; const selection = [field.selectionStart, field.selectionEnd]; S.renderBook(book.id, false); const next = S.root.querySelector('#book-search'); next?.focus({preventScroll: true}); next?.setSelectionRange(...selection); }; };
    cards.index = Math.max(0, Math.min(cards.index, queue.length - 1));
    const item = queue[cards.index];
    if (!item) { if (reading) { mount.innerHTML = searchHTML + '<div class="empty-state">没有匹配的句子</div>'; wireSearch(); S.stopSpeech(); return; } state.mode = 'list'; S.renderBook(book.id, announce); return; }
    cards.currentId = item.id;
    const reverse = item.kind === 'word' && S.data.preferences?.front === 'meaning';
    const cardMeaning = item.kind === 'grammar' ? item.explanation : meaning(item);
    if (announce) {
      S.rememberStudy?.(item);
      prepare([item, queue[(cards.index + 1) % queue.length]].filter(note=>note.kind!=='grammar'||!/[\u3400-\u9fff]/.test(note.text)).map(note=>({text:note.text,lang:'ko'})));
    }
    const text = cards.back === reverse ? item.text : cardMeaning;
    const lang = item.kind === 'grammar' ? cards.back || /[\u3400-\u9fff]/.test(text) ? 'zh' : 'ko' : cards.back === reverse ? 'ko' : meaningLang(item);
    mount.innerHTML = `${searchHTML}<div class="practice-topline"><span>${cards.index + 1} / ${queue.length}</span></div><div class="flashcard-shell"><button type="button" class="flashcard" id="flip-card" data-card-id="${e(item.id)}" aria-label="${cards.back ? '返回正面' : '翻到背面'}"><span class="flashcard-term${item.kind === 'grammar' ? ' grammar-term' : item.kind === 'sentence' ? ' sentence-term' : ''}" lang="${lang}">${e(text)}</span>${cards.back && item.kind === 'grammar' ? `<span class="flashcard-example" lang="ko">${e(item.example || '')}</span><span class="translation">${e(item.translation || '')}</span>` : ''}</button></div><div class="card-controls">${button('previous', 'left', '上一张')}${button('next', 'right', '下一张')}</div>${reading ? S.sentenceReadingDetails?.(item) || '' : ''}`;
    wireSearch();
    S.wireSummarySpeech?.(mount);
    const draw = () => S.renderBook(book.id);
    mount.querySelector('#flip-card').onclick = () => { cards.back = !cards.back; draw(); };
    const move = offset => { cards.index = (cards.index + offset + queue.length) % queue.length; cards.currentId = queue[cards.index].id; cards.back = false; draw(); };
    mount.querySelector('[data-action="previous"]').onclick = () => move(-1);
    mount.querySelector('[data-action="next"]').onclick = () => move(1);
    const card = mount.querySelector('#flip-card');
    const beginManagement = action => S.beginBookBatch(book.id,action,[item.id]);
    S.manage(card, () => [
      {label: '编辑' + cardLabel(item.kind), icon: 'pencil', fn: () => S.editItem(item, () => S.renderBook(book.id, false))},
      ...meaningReadMenu(item),
      ...(['word','grammar','sentence'].includes(item.kind) ? [{label: item.extraPractice ? '移出再记一遍' : '加入再记一遍', icon: 'reviewRepeat', fn: () => beginManagement(item.extraPractice ? 'extra-remove' : 'extra-add')}] : []),
      ...(item.parentId && !book.special ? [{label: '选择全部内部句子加入再记一遍', fn: () => S.beginBookBatch(book.id, 'extra-add', studyItems([S.resolveStudyItem(item.parentId)]).map(row => row.id))}] : []),
      ...(!book.special ? [{label: item.parentId ? '删除这句' : '删除' + cardLabel(item.kind), icon: 'deleteOne', fn: () => beginManagement('delete')}] : [])
    ], () => remove(book, [item.id], state));
    card.onkeydown = event => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || document.querySelector('dialog[open]') || !S.$('#contextMenu').hidden) return;
      if (event.target.closest('input,select,textarea,[contenteditable=""],[contenteditable="true"]')) return;
      if (event.key === 'F2') { event.preventDefault(); event.stopPropagation(); S.editItem(item, () => S.renderBook(book.id, false)); return; }
      if (![' ', 'Enter', 'ArrowRight', 'ArrowLeft'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Enter' || event.key === 'ArrowRight') move(1);
      else if (event.key === 'ArrowLeft') move(-1);
      else { cards.back = !cards.back; draw(); }
    };
    const term = card.querySelector('.flashcard-term');
    const example = card.querySelector('.flashcard-example');
    const fit = () => {
      if (!card.isConnected) { cardResizeObserver.disconnect(); fitActiveCard = null; return; }
      card.classList.remove('card-condensed');
      term.style.fontSize = '';
      term.style.removeProperty('--card-term-lines');
      if (example) example.style.fontSize = '';
      const style = getComputedStyle(card);
      const gap = parseFloat(style.rowGap) || 0;
      const available = card.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0);
      if (available <= 0) return;
      const height = () => [...card.children].reduce((total, child) => total + Math.max(child.scrollHeight, child.getBoundingClientRect().height), 0) + gap * (card.children.length - 1);
      let font = parseFloat(getComputedStyle(term).fontSize);
      let exampleFont = example ? parseFloat(getComputedStyle(example).fontSize) : 13;
      while (height() > available + 1 && (font > 20 || exampleFont > 13)) {
        font = Math.max(20, font - 2);
        term.style.fontSize = `${font}px`;
        if (example) { exampleFont = Math.max(13, exampleFont - 1); example.style.fontSize = `${exampleFont}px`; }
      }
      const overflow = height() > available + 1;
      let detail = mount.querySelector('[data-card-detail]');
      if (overflow) {
        const lines = Math.max(1, Math.floor(available / parseFloat(getComputedStyle(term).lineHeight)));
        term.style.setProperty('--card-term-lines', lines);
        card.classList.add('card-condensed');
        if (!detail) {
          mount.querySelector('[data-action="next"]').insertAdjacentHTML('beforebegin', button('card-detail', 'more', '查看完整卡片', 'data-card-detail'));
          detail = mount.querySelector('[data-card-detail]');
          detail.onclick = () => S.info('完整卡片', `<div class="card-detail"><p${item.kind === 'grammar' ? ' class="grammar-term"' : item.kind === 'sentence' ? ' class="sentence-term"' : ''} lang="${lang}">${e(text)}</p>${cards.back && item.kind === 'grammar' ? `<p class="example-ko" lang="ko">${e(item.example || '')}</p><p class="translation">${e(item.translation || '')}</p>` : ''}</div>`);
        }
      } else detail?.remove();
    };
    fitActiveCard = fit;
    cardResizeObserver.observe(card);
    fit();
    document.fonts?.ready.then(() => { if (fitActiveCard === fit) fit(); });
    if (focusCard) card.focus({preventScroll: true});
    if (announce) announceSpeech(text, lang, `card:${book.id}:${item.id}:${cards.back}`, item.kind === 'sentence');
  }

  function renderLearn(book, state, mount, list, announce = true) {
    if (!state.learn) state.learn = {queue: list.slice(0, book.count || list.length).flatMap((item, index) => item.kind === 'sentence' && !book.ephemeral ? [sentenceQuestion(item, list, 'meaning'), sentenceQuestion(item, list, 'korean')] : [makeQuestion(item, list, index)]).filter(Boolean), done: 0, correct: 0, answer: null};
    const round = state.learn;
    if (!round.queue.length && !round.done) { mount.innerHTML = '<div class="empty-state">当前没有至少两个有效选项，暂时不能开始选择题。</div>'; S.stopSpeech(); return; }
    if (!round.queue.length) {
      mount.innerHTML = `<div class="round-complete"><span class="completion-mark">${icon('check')}</span><h2>这一轮完成了</h2><p>${round.correct} 次答对 · ${round.done} 次练习</p><button type="button" class="soft-button" id="learn-again">再来一轮</button></div>`;
      mount.querySelector('#learn-again').onclick = () => { state.learn = null; S.renderBook(book.id); };
      mount.onkeydown = event => { if (event.key === 'Enter' && practiceKey(event)) { event.preventDefault(); mount.querySelector('#learn-again').click(); } };
      focusPractice(mount);
      S.stopSpeech();
      return;
    }
    const question = round.queue[0];
    const item = list.find(row => row.id === question.id);
    if (!item) { round.queue.shift(); renderLearn(book, state, mount, list, announce); return; }
    if (announce) {
      S.rememberStudy?.(item);
      prepare(round.queue.slice(0, 2).flatMap(q => { const note = list.find(row => row.id === q.id); return note ? [{text: promptText(q, note), lang: promptLang(q, note)}, {text: answerText(q, note), lang: answerLang(q, note)}] : []; }));
    }
    const answered = round.answer !== null;
    const prompt = promptText(question, item), reference = answerText(question, item);
    mount.innerHTML = `<div class="practice-topline"><span>剩余 ${round.queue.length}</span></div><div class="practice-area"><h2 class="practice-term" lang="${promptLang(question, item)}" id="learn-term" tabindex="0">${e(prompt)}</h2>${question.context ? `<p class="practice-context"${item.kind === 'sentence' ? '' : ' lang="ko"'}>${e(question.context)}</p>` : ''}<div class="choices">${question.options.map((option, index) => `<button type="button" class="choice ${answered && option === round.answer ? 'is-selected' : ''} ${answered && questionAccepts(question, item, option, list) ? 'answer-correct' : ''} ${answered && option === round.answer && !round.result ? 'answer-wrong' : ''}" data-option="${index}" aria-pressed="${answered && option === round.answer}" ${answered ? 'disabled' : ''}>${e(option)}${answered && option === round.answer ? `<span class="choice-paw" aria-hidden="true">${icon('paw')}</span>` : ''}</button>`).join('')}</div><div class="answer-feedback" id="learn-feedback" aria-live="polite">${answered ? `${item.kind === 'sentence' ? '' : `<p class="example-ko" lang="ko">${e(item.example || '')}</p><p class="translation">${e(item.translation || '')}</p>`}<button type="button" id="learn-next" class="soft-button">下一题 ${icon('right')}</button>` : ''}</div></div>`;
    const details = item.kind === 'sentence' ? '' : S.summaryStudyDetails?.(item, answered);
    if (details) { mount.querySelector('.choices').insertAdjacentHTML('beforebegin', details); S.wireSummarySpeech?.(mount); }
    const submit = answer => {
      if (round.answer !== null || item.parentId && !S.isCurrentStudyItem?.(item)) return;
      const correct = questionAccepts(question, item, answer, list);
      round.answer = answer;
      round.result = correct;
      round.skipped = !String(answer).trim();
      round.pending = false;
      round.done++;
      if (correct) round.correct++;
      if (!correct) round.queue.push({...question});
      record(item, 'recognition', {correct, answer, direction: question.direction || 'meaning', skipped: round.skipped, revealed: round.skipped, pending: false});
      renderLearn(book, state, mount, list, false);
      S.feedback(correct, mount.querySelector(correct ? '#learn-feedback' : '.answer-wrong, .reference-answer') || mount);
      announceQuestionSpeech(question, item, correct && question.direction === 'korean' ? answer : reference, answerLang(question, item), `learn:${item.id}:answer`);
    };
    const select = index => {
      if (round.answer !== null || !question.options[index]) return;
      round.selected = question.options[index];
      submit(round.selected);
    };
    mount.querySelectorAll('[data-option]').forEach(control => control.onclick = () => select(Number(control.dataset.option)));
    const next = mount.querySelector('#learn-next');
    if (next) next.onclick = () => { round.queue.shift(); round.answer = null; round.result = null; round.selected = null; round.skipped = false; round.pending = false; renderLearn(book, state, mount, list); };
    const term = mount.querySelector('#learn-term');
    term.onclick = () => S.toggleSpeech([{text: prompt, lang: promptLang(question, item), sentence: item.kind === 'sentence' || question.direction === 'grammar'}], `learn:${item.id}:term`);
    mount.querySelector('.example-ko')?.addEventListener('click', () => S.toggleSpeech([{text: item.example, lang: 'ko', sentence: true}], `learn:${item.id}:example`));
    mount.querySelector('.translation')?.addEventListener('click', () => S.toggleSpeech([{text: item.translation, lang: 'en'}], `learn:${item.id}:translation`));
    mount.onkeydown = event => {
      const allowed = practiceKey(event);
      if (!allowed) return;
      if (event.key === 'Enter') event.preventDefault();
      if (/^[1-4]$/.test(event.key) && !answered) { event.preventDefault(); select(Number(event.key) - 1); }
      else if (event.key === 'Enter' && answered) next.click();
    };
    focusPractice(mount);
    if (announce) announceQuestionSpeech(question, item, answered ? round.result && question.direction === 'korean' ? round.answer : reference : prompt, answered ? answerLang(question, item) : promptLang(question, item), `learn:${item.id}:${answered ? 'answer' : 'term'}`);
  }

  function createTest(book, state, list, count) {
    const directionOffset = state.testDirection || 0;
    state.testDirection = directionOffset ? 0 : 1;
    const wordRound = state.wordTestRound || 0, direction = wordRound % 2 ? 'korean' : 'meaning';
    if (book.kind === 'word' || book.kind === 'mixed') state.wordTestRound = wordRound + 1;
    return {questions: shuffle(list).map((item, index) => makeQuestion(item, list, index + directionOffset, direction) || (item.kind === 'grammar' && S.prepareGrammarQuiz ? {id:item.id,direction:'grammar',pendingGrammar:true} : null)).filter(Boolean).slice(0, count), answers: {}, revealed: {}, results: {}, active: 0, submitted: false};
  }

  function renderTest(book, state, mount, list, announce = true) {
    if (!state.test && book.ephemeral && book.roundMode === 'test') state.test = createTest(book, state, list, book.count || list.length);
    if (!state.test) {
      mount.innerHTML = `<div class="test-setup"><h2>看看记住了多少</h2><label class="test-count">题量 <input id="test-count" type="number" min="1" value="${Math.min(10, list.length)}" aria-label="测试题量"></label><button type="button" class="soft-button" id="test-start">开始测试 ${icon('right')}</button></div>`;
      mount.querySelector('#test-start').onclick = () => {
        const count = Math.max(1, Math.floor(Number(mount.querySelector('#test-count').value) || 1));
        state.test = createTest(book, state, list, count);
        renderTest(book, state, mount, list);
      };
      mount.onkeydown = event => { if (event.key === 'Enter' && practiceKey(event, mount.querySelector('#test-count'))) { event.preventDefault(); mount.querySelector('#test-start').click(); } };
      focusPractice(mount, mount.querySelector('#test-count'));
      S.stopSpeech();
      return;
    }
    const test = state.test;
    if (!test.questions.length) { mount.innerHTML = '<div class="empty-state">当前没有至少两个有效选项，暂时不能开始选择题。</div>'; S.stopSpeech(); return; }
    test.revealed ||= {};
    const rows = test.questions.map(question => ({question, item: list.find(item => item.id === question.id)})).filter(row => row.item);
    if (test.submitted) {
      const correct = rows.filter(({question, item}) => !test.revealed[question.id] && questionAccepts(question, item, test.answers[question.id] || '', list)).length;
      mount.innerHTML = `<div class="score-summary"><h2>${correct}<span> / ${rows.length}</span></h2><button type="button" id="test-again" class="soft-button">再测一次 ${icon('refresh')}</button></div><div class="question-stack">${rows.map(({question, item}, index) => {
        const answer = test.answers[question.id] || '';
        const isCorrect = !test.revealed[question.id] && questionAccepts(question, item, answer, list);
        return `<article class="question-card test-result ${isCorrect ? 'is-correct' : 'is-wrong'}"><div class="question-heading"><span>${String(index + 1).padStart(2, '0')}</span><strong lang="${promptLang(question, item)}">${e(promptText(question, item))}</strong><span>${icon(isCorrect ? 'check' : 'close')}</span></div>${!isCorrect ? `<p class="submitted-answer">${e(test.revealed[question.id] ? '不会 · 已揭晓' : answer || '未作答')}</p>` : ''}<button type="button" class="reference-answer speak-answer" lang="${answerLang(question, item)}" data-speak-answer="${e(item.id)}">${e(answerText(question, item))} ${icon('sound')}</button></article>`;
      }).join('')}</div>`;
      mount.querySelector('#test-again').onclick = () => { state.test = null; renderTest(book, state, mount, list); };
      mount.querySelectorAll('[data-speak-answer]').forEach(control => control.onclick = () => { const row = rows.find(row => row.item.id === control.dataset.speakAnswer); S.toggleSpeech([{text: answerText(row.question, row.item), lang: answerLang(row.question, row.item), sentence: row.item.kind === 'sentence'}], `test:${row.item.id}:answer`); });
      mount.querySelectorAll('.test-result').forEach((element,index)=>wirePracticeManagement(book,state,element,rows[index]?.item));
      mount.onkeydown = event => { if (event.key === 'Enter' && practiceKey(event)) { event.preventDefault(); mount.querySelector('#test-again').click(); } };
      focusPractice(mount);
      if (announce) {
        S.stopSpeech();
        if (rows[0]) announceQuestionSpeech(rows[0].question, rows[0].item, answerText(rows[0].question, rows[0].item), answerLang(rows[0].question, rows[0].item), `test:${rows[0].item.id}:answer`);
      }
      return;
    }
    test.results ||= {};
    test.active = Math.max(0, Math.min(rows.length - 1, test.active || 0));
    const row = rows[test.active];
    if (!row) { test.submitted = true; renderTest(book, state, mount, list, announce); return; }
    const {question, item} = row;
    if (question.pendingGrammar) {
      const generated = S.grammarQuizQuestion(item,'global');
      if (generated) { Object.assign(question,generated); delete question.pendingGrammar; renderTest(book,state,mount,list,announce); return; }
      waitForGrammar(book,state,mount,item,'global',()=>renderTest(book,state,mount,list,false),()=>{test.questions=test.questions.filter(value=>value!==question);test.active=Math.min(test.active,Math.max(0,test.questions.length-1));renderTest(book,state,mount,list,false);});
      return;
    }
    const upcoming = rows[test.active + 1]?.item;
    if (upcoming?.kind === 'grammar') S.prepareGrammarQuiz?.(upcoming,'global');
    if (announce) {
      S.rememberStudy?.(item);
      prepare(rows.slice(test.active, test.active + 2).flatMap(({question, item}) => [{text: promptText(question, item), lang: promptLang(question, item)}, {text: answerText(question, item), lang: answerLang(question, item)}]));
    }
    const answered = Object.hasOwn(test.results, question.id);
    const answer = test.answers[question.id] || '';
    const correct = test.results[question.id]?.correct === true;
    const reference = answerText(question, item);
    mount.innerHTML = `<div class="practice-topline"><span>${test.active + 1} / ${rows.length}</span></div><article class="question-card current-question" data-test-index="${test.active}"><div class="question-heading"><button type="button" class="test-term" lang="${promptLang(question, item)}" data-test-speak="${e(item.id)}">${e(promptText(question, item))}</button></div>${question.context ? `<p class="practice-context"${item.kind === 'sentence' ? '' : ` lang="${promptLang(question, item)}"`}>${e(question.context)}</p>` : ''}<div class="choices test-choices">${question.options.map((option, n) => `<button type="button" class="choice ${answered && option === answer ? 'is-selected' : ''} ${answered && questionAccepts(question, item, option, list) ? 'answer-correct' : ''} ${answered && option === answer && !correct ? 'answer-wrong' : ''}" lang="${answerLang(question, item)}" data-test-option="${n}" aria-pressed="${answered && option === answer}" ${answered ? 'disabled' : ''}>${e(option)}${answered && option === answer ? `<span class="choice-paw" aria-hidden="true">${icon('paw')}</span>` : ''}</button>`).join('')}</div><div class="answer-feedback" id="test-feedback" aria-live="polite">${answered ? `${item.kind === 'grammar' ? `<p class="grammar-explanation">${e(question.explanation || '')}</p>` : ''}<button type="button" class="soft-button" id="test-next">下一题 ${icon('right')}</button>` : ''}</div></article>`;
    wirePracticeManagement(book,state,mount.querySelector('.current-question'),item);
    if (question.qid) mount.querySelector('.choices').insertAdjacentHTML('beforebegin',S.grammarQuizAuxiliary(question));
    const details = item.kind === 'sentence' ? '' : S.summaryStudyDetails?.(item, answered);
    if (details) { mount.querySelector('.choices').insertAdjacentHTML('beforebegin', details); S.wireSummarySpeech?.(mount); }
    const submit = value => {
      if (Object.hasOwn(test.results, question.id) || item.parentId && !S.isCurrentStudyItem?.(item)) return;
      if (question.qid && !S.isGrammarQuizCurrent(question,item)) { question.pendingGrammar=true; renderTest(book,state,mount,list,false); return; }
      const revealed = !String(value).trim();
      const isCorrect = !revealed && questionAccepts(question, item, value, list);
      test.answers[question.id] = value;
      test.revealed[question.id] = revealed;
      test.results[question.id] = {correct: isCorrect, pending: false};
      record(item, 'test', {correct: isCorrect, answer: value, direction: question.direction || 'meaning', skipped: revealed, revealed, pending: false,...(question.qid ? {question_id:question.qid,entry:'global'} : {})});
      renderTest(book, state, mount, list, false);
      S.feedback(isCorrect, mount.querySelector(isCorrect ? '#test-feedback' : '.answer-wrong, .reference-answer') || mount);
      announceQuestionSpeech(question, item, isCorrect && question.direction === 'korean' ? value : reference, answerLang(question, item), `test:${item.id}:answer`);
    };
    const select = index => { if (question.options[index]) submit(question.options[index]); };
    mount.querySelectorAll('[data-test-option]').forEach(control => control.onclick = () => select(Number(control.dataset.testOption)));
    const next = mount.querySelector('#test-next');
    if (next) next.onclick = () => {
      if (test.active < rows.length - 1) test.active++;
      else test.submitted = true;
      renderTest(book, state, mount, list);
    };
    mount.querySelector('[data-test-speak]').onclick = () => S.toggleSpeech([{text: promptText(question, item), lang: promptLang(question, item), sentence: item.kind === 'sentence' || question.direction === 'grammar'}], `test:${item.id}:term`);
    mount.onkeydown = event => {
      const allowed = practiceKey(event);
      if (!allowed) return;
      if (event.key === 'Enter') event.preventDefault();
      if (/^[1-4]$/.test(event.key) && !answered) { event.preventDefault(); select(Number(event.key) - 1); }
      else if (event.key === 'Enter' && answered) next.click();
    };
    focusPractice(mount);
    if (announce) announceQuestionSpeech(question, item, answered ? correct && question.direction === 'korean' ? answer : reference : promptText(question, item), answered ? answerLang(question, item) : promptLang(question, item), `test:${item.id}:${answered ? 'answer' : 'term'}`);
  }

  function grammarQuestion(item, list = [], entry = 'global') {
    return S.grammarQuizQuestion?.(item, entry) || null;
  }

  function waitForGrammar(book,state,mount,item,entry,redraw,skip) {
    const found=S.grammarQuizState(item,entry), loading=found.pending || !found.attempted;
    mount.innerHTML=`<div class="empty-state" data-study-id="${e(item.id)}" tabindex="0"><p>${loading ? '正在准备情境题…' : '这个语法点暂时没有可用情境题。'}</p><p class="grammar-quiz-notice" role="status">${e(found.message || '仅准备当前及下一语法点，已生成的题目会复用。')}</p><div class="grammar-quiz-actions">${!loading ? '<button type="button" class="plain-button" id="grammar-retry">重试</button>' : ''}${skip ? '<button type="button" class="plain-button" id="grammar-skip">先练其他内容</button>' : ''}</div></div>`;
    wirePracticeManagement(book,state,mount.querySelector('.empty-state'),item); S.stopSpeech();
    const retry=mount.querySelector('#grammar-retry'); if(retry)retry.onclick=()=>{S.prepareGrammarQuiz(item,entry,{retry:true,force:found.blocked}).then(()=>{if(mount.isConnected)redraw();});redraw();};
    const skipButton=mount.querySelector('#grammar-skip'); if(skipButton)skipButton.onclick=skip;
    if(loading) S.prepareGrammarQuiz(item,entry).then(()=>{if(mount.isConnected)redraw();});
  }

  S.startGrammarPractice = (bookId, ids = null) => {
    const book=S.data.books.find(row=>row.id===bookId); if(!book || book.kind!=='grammar')return;
    const rows=(S.grammarStudyOrder?.(book,itemsFor(book)) || itemsFor(book)).filter(readyForPractice);
    const queue=ids ? rows.filter(row=>ids.includes(row.id)) : rows;
    if(!queue.length){S.toast('请先补齐这个语法点的内容。');return;}
    if(S.bookId!==book.id || S.route!=='grammar')S.go('grammar',book.id);
    S.ui.navigationEpoch=(S.ui.navigationEpoch||0)+1;
    const state=stateFor(book);S.restoreBookBatch(book,state);
    state.mode='practice';state.grammarEntry=ids ? 'single':'global';state.grammarIds=queue.map(row=>row.id);state.grammarIndex=0;state.grammarAnswered=null;state.grammarSelected=null;state.grammarQuestion=null;
    S.renderBook(book.id);
  };

  function renderGeneratedGrammarPractice(book,state,mount,list,announce) {
    state.grammarIds ||= list.slice(0,book.count || list.length).map(item=>item.id);
    state.grammarIndex ||= 0;
    const available=state.grammarIds.map(id=>list.find(item=>item.id===id)).filter(item=>item && readyForPractice(item));
    if(!available.length){mount.innerHTML='<div class="empty-state">请先补齐语法卡。</div>';S.stopSpeech();return;}
    if(book.ephemeral && state.grammarIndex>=available.length){
      mount.innerHTML=`<div class="round-complete"><span class="completion-mark">${icon('check')}</span><h2>这一轮完成了</h2><p>${available.length} 道练习</p><button type="button" class="soft-button" id="grammar-again">再来一轮</button></div>`;
      mount.querySelector('#grammar-again').onclick=()=>{state.grammarIndex=0;state.grammarAnswered=null;state.grammarQuestion=null;S.renderBook(book.id);};
      mount.onkeydown=event=>{if(event.key==='Enter'&&practiceKey(event)){event.preventDefault();mount.querySelector('#grammar-again').click();}};
      S.stopSpeech();focusPractice(mount);return;
    }
    const entry=state.grammarEntry || 'global',index=state.grammarIndex % available.length,item=available[index];
    const redraw=()=>S.renderBook(book.id,false),advance=()=>{state.grammarIndex++;state.grammarAnswered=null;state.grammarSelected=null;state.grammarQuestion=null;S.renderBook(book.id);};
    const nextItem=available[(index+1)%available.length];if(nextItem!==item)S.prepareGrammarQuiz(nextItem,entry);
    const found=S.grammarQuizState(item,entry);
    if(found.cached && found.cached.questions.length<2 && !found.attempted && !found.pending) S.prepareGrammarQuiz(item,entry).then(()=>{if(mount.isConnected)redraw();});
    const question=!found.blocked && state.grammarQuestion?.id===item.id && state.grammarQuestion.entry===entry && S.isGrammarQuizCurrent(state.grammarQuestion,item) ? state.grammarQuestion : state.grammarQuestion=S.grammarQuizQuestion(item,entry);
    if(!question){waitForGrammar(book,state,mount,item,entry,redraw,available.length>1 ? advance:null);return;}
    const answered=state.grammarAnswered!=null;
    mount.innerHTML=`<div class="practice-topline"><span>${entry==='single' ? '单点练习':'全部练习'}</span><span>${index+1} / ${available.length}</span><button type="button" class="quiet-button" id="grammar-change">换一组</button></div><article class="practice-area grammar-practice" tabindex="0"><h2 class="grammar-question" lang="ko">${e(question.sentence)}</h2>${question.context ? `<p class="practice-context">${e(question.context)}</p>`:''}${S.grammarQuizAuxiliary(question)}${found.message ? `<p class="grammar-quiz-notice">${e(found.message)} <button type="button" class="plain-button" id="grammar-supplement">重试补足</button></p>`:''}<div class="choices">${question.options.map((option,n)=>`<button type="button" class="choice ${answered&&option===state.grammarAnswered?'is-selected':''} ${answered&&option===question.answer?'answer-correct':''} ${answered&&option===state.grammarAnswered&&!state.grammarCorrect?'answer-wrong':''}" data-grammar-option="${n}" ${answered?'disabled':''}>${e(option)}</button>`).join('')}</div><div class="answer-feedback" aria-live="polite">${answered ? `<p class="grammar-explanation">${e(question.explanation)}</p><button type="button" class="soft-button" id="grammar-next">下一题 ${icon('right')}</button>`:''}</div></article>`;
    wirePracticeManagement(book,state,mount.querySelector('.grammar-practice'),item);
    const change=force=>{const navigation=S.ui.navigationEpoch||0;state.grammarQuestion=null;state.grammarAnswered=null;S.prepareGrammarQuiz(item,entry,{force,retry:true}).then(()=>{if(navigation===(S.ui.navigationEpoch||0))redraw();});redraw();};
    mount.querySelector('#grammar-change').onclick=()=>change(true);
    mount.querySelector('#grammar-supplement')?.addEventListener('click',()=>change(false));
    const submit=answer=>{
      if(state.grammarAnswered!=null)return;
      if(!S.isGrammarQuizCurrent(question,item)){state.grammarQuestion=null;redraw();return;}
      state.grammarAnswered=answer;state.grammarCorrect=norm(answer)===norm(question.answer);
      record(item,'grammar-choice',{correct:state.grammarCorrect,answer,question_id:question.qid,entry});
      renderGeneratedGrammarPractice(book,state,mount,list,false);S.feedback(state.grammarCorrect,mount.querySelector(state.grammarCorrect?'.answer-feedback':'.answer-wrong')||mount);
      S.speak(question.sentence.replace('___',question.answer),'ko',`grammar:${question.qid}:answer`,true);
    };
    const select=n=>{if(question.options[n])submit(question.options[n]);};
    mount.querySelectorAll('[data-grammar-option]').forEach(control=>control.onclick=()=>select(Number(control.dataset.grammarOption)));
    const next=mount.querySelector('#grammar-next');if(next)next.onclick=advance;
    const spoken=answered ? question.sentence.replace('___',question.answer):question.sentence.replace('___',' ');
    mount.querySelector('.grammar-question').onclick=()=>S.toggleSpeech([{text:spoken,lang:'ko',sentence:true}],`grammar:${question.qid}`);
    mount.onkeydown=event=>{if(!practiceKey(event))return;if(/^[1-4]$/.test(event.key)&&!answered){event.preventDefault();select(Number(event.key)-1);}else if(event.key==='Enter'&&answered){event.preventDefault();next.click();}};
    focusPractice(mount);if(announce){S.rememberStudy?.(item);S.speak(spoken,'ko',`grammar:${question.qid}`,true);}
  }

  function renderGrammarPractice(book, state, mount, list, announce = true) {
    return renderGeneratedGrammarPractice(book,state,mount,list,announce);
  }

  S.startCombinedBookRound = function (kind, list, options = {}) {
    const ids = [...new Set(studyItems(list).filter(item => (kind === 'mixed' ? ['word', 'sentence', 'grammar'].includes(item.kind) : item.kind === kind) && readyForPractice(item) && (S.resolveStudyItem?.(item.id) || S.data.items.some(saved => saved.id === item.id))).map(item => item.id))];
    const count = Number.isFinite(Number(options.count)) ? Math.max(1, Math.floor(Number(options.count))) : ids.length;
    if (!ids.length) { S.toast('所选笔记本还没有对应卡片。'); return false; }
    S.stopSpeech();
    S.ui.navigationEpoch=(S.ui.navigationEpoch||0)+1;
    const mode = ['cards', 'test'].includes(options.mode) ? options.mode : kind === 'grammar' ? 'practice' : 'learn';
    S.combinedBook = {id: 'combined:' + kind, name: '综合练习', kind, itemIds: ids, count, roundMode: mode, ephemeral: true};
    S.ui.books ||= {};S.ui.books[S.combinedBook.id] = {mode, selected: [], query: '', cards: {index: 0, back: false}, grammarIndex: 0};
    S.route = 'combined';S.bookId = S.combinedBook.id;S.render(true);return true;
  };
  S.endCombinedBookRound = function () { S.ui.navigationEpoch=(S.ui.navigationEpoch||0)+1;S.stopSpeech();S.combinedBook = null;S.render(); };
  S.returnToBookList = function (bookId) { const book = S.data.books.find(row => row.id === bookId); if (book) { S.ui.navigationEpoch=(S.ui.navigationEpoch||0)+1;const state=stateFor(book);state.mode = book.special || book.kind === 'sentence' ? 'cards' : 'list';state.batchReturn=null;S.renderBook(bookId); } };
  S.studyOrderBatchReady = book => {
    if(S.bookId!==book.id||stateFor(book).mode!=='list'||!S.root.querySelector('#book-body'))return;
    const active=document.activeElement,search=active?.id==='book-search'&&[active.selectionStart,active.selectionEnd],focusId=active?.id,noteId=active?.dataset.note,scroll=S.root.scrollTop;
    S.renderBook(book.id,false);
    const focus=focusId?S.root.querySelector('#'+CSS.escape(focusId)):noteId?S.root.querySelector('[data-note="'+CSS.escape(noteId)+'"]'):null;
    focus?.focus({preventScroll:true});if(search)focus?.setSelectionRange(...search);S.root.scrollTop=scroll;
  };

  S.renderBook = function (bookId, announce = true) {
    cardResizeObserver.disconnect();
    tableResizeObserver.disconnect();
    redrawTables = null;
    fitActiveCard = null;
    const book = S.combinedBook?.id === bookId ? S.combinedBook : S.data.books.find(row => row.id === bookId);
    if (!book) { S.root.innerHTML = '<div class="empty-state">没有找到这个本子</div>'; return; }
    const state = stateFor(book);
    if (book.kind === 'word' && !book.ephemeral && state.mode === 'learn') state.mode = 'cards';
    if(book.special && !state.batchAction)state.mode='cards';
    const list = book.kind === 'word' ? S.studyOrder?.(book, itemsFor(book)) || itemsFor(book) : book.kind === 'grammar' && !book.ephemeral ? S.grammarStudyOrder?.(book, itemsFor(book)) || itemsFor(book) : itemsFor(book);
    if (book.kind === 'word' && !book.ephemeral) S.prepareStudyOrder?.(book);
    state.selected = state.selected.filter(id => (book.kind === 'sentence' ? studyItems(list) : list).some(item => item.id === id));
    if (!list.length) state.mode = 'list';
    const focused = document.activeElement;
    const focusCard = !focused?.closest('input,select,textarea,[contenteditable=""],[contenteditable="true"]') && !document.querySelector('dialog[open]') && (S.root.contains(focused) || focused === document.body);
    const studyList = studyItems(list);
    const readable = studyList.filter(item => !!String(item.kind === 'grammar' ? item.explanation || '' : meaning(item)).trim());
    const cardList = book.kind === 'sentence' && !book.ephemeral && state.mode === 'cards' ? studyList.filter(item=>String(item.text||'').trim()) : book.ephemeral ? readable.slice(0, book.count || readable.length) : readable;
    const practiceList = studyList.filter(item => readyForPractice(item));
    const practiceIds = JSON.stringify([practiceList.map(item => item.id).sort(), studyItems(S.data.items).filter(item => (book.kind === 'mixed' || item.kind === book.kind) && readyForPractice(item)).map(item => [item.id, item.text, meaning(item), item.meaningZh, item.explanation, item.formation, item.note, item.example, item.translation, item.cloze, item.clozeAnswer, item.expressionGroup, item.situation, item.listenerLevel, item.subjectHonorific, item.words, item.grammar, item.qa, item.auxiliary])]);
    if (state.practiceIds != null && state.practiceIds !== practiceIds && !state.batchReturn && !state.preservePractice) {
      state.learn = null;
      state.test = null;
      state.grammarIds = null;
      state.grammarIndex = 0;
      state.grammarAnswered = null;
      state.grammarSelected = null;
      state.grammarCorrect = null;
      state.grammarSkipped = false;
      state.grammarQuestion = null;
    }
    state.practiceIds = practiceIds;
    state.preservePractice = false;
    const modes = book.kind === 'word' ? [['cards', '学习'], ['test', '测试']] : book.kind === 'sentence' ? [['learn', '学习'], ['test', '测试']] : [];
    const flipMode = state.mode === 'cards' || book.kind === 'sentence' && state.mode === 'learn';
    S.root.innerHTML = `<section class="book-page${book.kind==='grammar'?' grammar-book-page':''}${flipMode ? ' cards-mode' + (book.kind === 'sentence' && state.mode === 'cards' ? ' sentence-reading-mode summary-cards-mode' : '') : ''}">${book.ephemeral || book.special || !modes.length ? '' : `<header class="book-head"><nav class="book-modes" aria-label="学习方式">${modes.map(([mode, label]) => `<button type="button" data-mode="${mode}" class="${state.mode === mode ? 'active' : ''}" ${!(mode === 'cards' || mode==='learn'&&book.kind==='sentence' ? readable.length : practiceList.length) ? 'disabled' : ''}>${label}</button>`).join('')}</nav></header>`}<div class="book-body" id="book-body" tabindex="-1"></div></section>`;
    S.root.querySelectorAll('[data-mode]').forEach(control => control.onclick = () => {
      S.ui.navigationEpoch=(S.ui.navigationEpoch||0)+1;
      const mode = control.dataset.mode;
      S.ui.summaryBatch = null;
      state.selected = [];
      state.batchAction = null;
      state.batchReturn = null;
      if (state.mode === mode) state.mode = book.kind === 'sentence' ? 'cards' : 'list';
      else {
        state.mode = mode;
        if (mode === 'learn') state.learn = null;
        if (mode === 'test') state.test = null;
        if (mode === 'practice') { state.grammarIds = list.map(item => item.id); state.grammarIndex = 0; state.grammarAnswered = null; state.grammarSelected = null; state.grammarQuestion = null; }
      }
      if (book.kind === 'word') { delete state.cards.itemIds; delete state.cards.currentId; }
      S.renderBook(book.id);
    });
    const mount = S.root.querySelector('#book-body');
    if (state.mode !== 'list' && !(flipMode ? cardList.length : practiceList.length)) { mount.innerHTML = '<div class="empty-state">请先补齐卡片必要内容再开始练习。</div>'; S.stopSpeech(); }
    else if (state.mode === 'cards') renderCards(book, state, mount, cardList, focusCard, announce);
    else if (state.mode === 'learn') { if (book.kind === 'sentence') renderCards(book, state, mount, cardList, focusCard, announce); else renderLearn(book, state, mount, practiceList, announce); }
    else if (state.mode === 'test') renderTest(book, state, mount, practiceList, announce);
    else if (state.mode === 'practice') renderGrammarPractice(book, state, mount, practiceList, announce);
    else renderList(book, state, mount, list, announce);
  };
  S.bookFixtures = {wordQuestion, sentenceQuestion, questionAccepts, grammarQuestion, makeQuestion, createTest, wordTablesHTML, renderList, renderCards, renderLearn, renderTest, renderGrammarPractice};
})();
