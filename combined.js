'use strict';

(() => {
  const SC = window.SC, e = SC.esc;
  const modes = [['learn', '学习'], ['test', '测试'], ['expressions', '常用表达'], ['forms', '词形变化'], ['sentence', '拼句']];
  const normalBooks = () => {
    const books = SC.data.books.filter(book => !book.special), scopes = new Map();
    for (const book of books) {
      const scope = book.projectId ? 'project:' + book.projectId : 'group:' + (book.groupId || '');
      if (!scopes.has(scope)) scopes.set(scope, []);
      scopes.get(scope).push(book);
    }
    return [...scopes.values()].flatMap(rows => SC.orderedBooks?.(rows) || rows);
  };
  const meaningful = card => !!String(card.kind === 'grammar' ? card.explanation || '' : SC.studyMeaning(card)).trim();
  const readCount = value => value === '' || !Number.isFinite(Number(value)) ? 10 : Math.max(1, Math.floor(Number(value)));
  function interleave(cards) {
    const pools = new Map();
    for (const card of cards) {
      const book = SC.data.books.find(row => row.id === card.bookId), key = book?.projectId || book?.groupId || card.bookId;
      if (!pools.has(key)) pools.set(key, []);
      pools.get(key).push(card);
    }
    const rows = [], queues = [...pools.values()];
    for (let index = 0; queues.some(queue => index < queue.length); index++) for (const queue of queues) if (queue[index]) rows.push(queue[index]);
    return rows;
  }
  function selectedCards(ids, kind) {
    const selected = new Set(ids);
    const saved = SC.data.items.filter(card => selected.has(card.bookId) && (!kind || card.kind === kind));
    const cards = kind === 'sentence' ? SC.studyItems?.(saved) || saved : saved;
    return interleave([...new Map(cards.map(card => [card.id, card])).values()]);
  }
  function orderedScopeCards(ids) {
    const selected = new Set(ids), rows = [];
    for (const book of normalBooks().filter(book => selected.has(book.id))) {
      let cards = SC.data.items.filter(card => card.bookId === book.id);
      if (book.kind === 'word') cards = SC.studyOrder?.(book, cards) || cards;
      else if (book.kind === 'grammar') cards = SC.grammarStudyOrder?.(book, cards) || cards;
      rows.push(...(SC.studyItems?.(cards) || cards));
    }
    return [...new Map(rows.filter(meaningful).map(card => [card.id, card])).values()];
  }
  function modeCards(ids, mode) {
    const cards = orderedScopeCards(ids);
    if (mode === 'expressions') return cards.filter(card => card.kind === 'word');
    if (mode === 'forms') return cards.filter(card => card.kind === 'word' && SC.practiceFixtures.canConjugate(card));
    if (mode === 'sentence') return cards.filter(card => ['word', 'grammar'].includes(card.kind));
    return cards;
  }
  function canTest(card, cards) {
    const fixtures = SC.bookFixtures;
    if (card.kind === 'grammar') return meaningful(card);
    if (card.kind === 'sentence') return !!fixtures.sentenceQuestion(card, cards, 'meaning');
    return !!fixtures.wordQuestion(card, cards);
  }
  function availability(ids, mode, count) {
    const cards = modeCards(ids, mode), available = mode === 'test' ? cards.filter(card => canTest(card, cards)).length : cards.length;
    const empty = !ids.length ? '请先选择练习范围。' : mode === 'forms' ? '所选范围没有带释义的动词或形容词。' : mode === 'expressions' ? '所选范围没有带释义的单词。' : mode === 'sentence' ? '所选范围没有可用于拼句的单词或语法。' : mode === 'test' && cards.length ? '所选内容暂时没有至少两个有效选项，不能开始测试。' : '所选范围还没有可学习的卡片。';
    const unit = ['expressions', 'forms'].includes(mode) ? '个单词' : mode === 'learn' ? '个学习项' : '题';
    return {cards, available, message: available ? mode === 'sentence' ? `${available} 项可用素材 · 本轮最多 ${count} 题（以成功组题为准）` : `${ids.length} 组卡片 · ${available} 个可用学习项 · 本轮最多 ${Math.min(count, available)} ${unit}` : empty};
  }
  function openScopePicker(state) {
    const books = normalBooks(), draft = new Set(state.bookIds), dialog = SC.$('#dialog');
    SC.info('选择练习范围', '<div class="combined-scope-picker"><input id="combinedScopeSearch" class="collection-search" type="search" placeholder="搜索项目、笔记本或卡片" aria-label="搜索练习范围"><div class="combined-scope-head"><label class="small"><input type="checkbox" id="combinedSelectAll"> 全选搜索结果</label><span id="combinedDraftCount" class="small muted"></span></div><div id="combinedScopeTree" class="collection-results combined-scope-tree"></div></div>');
    SC.$('#dialogActions').innerHTML = '<button type="button" class="plain-button" id="combinedScopeCancel">取消</button><button type="button" class="plain-button primary" id="combinedScopeConfirm">确认范围</button>';
    const groups = SC.data.groups || [], projects = SC.data.projects || [], groupIds = new Set(groups.map(group => group.id));
    const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase();
    const booksOf = input => input.dataset.combinedGroup ? books.filter(book => book.groupId === input.dataset.combinedGroup || projects.some(project => project.id === book.projectId && project.groupId === input.dataset.combinedGroup)) : books.filter(book => book.projectId === input.dataset.combinedNotebook);
    const tree = SC.$('#combinedScopeTree');
    function drawTree() {
      const query = normalize(SC.$('#combinedScopeSearch').value), matches = value => !query || normalize(value).includes(query);
      const bookRows = (rows, whole = false) => rows.filter(book => whole || matches(book.name + ' ' + SC.cardLabel(book.kind))).map(book => `<label class="combined-book"><input type="checkbox" data-combined-book="${e(book.id)}"><span>${SC.icon(SC.cardIcon(book.kind))}${e(book.name)}</span><small>${SC.cardLabel(book.kind)}</small></label>`).join('');
      const notebookRows = (rows, whole = false) => rows.map(project => {
        const contents = bookRows(books.filter(book => book.projectId === project.id), whole || matches(project.name));
        return contents ? `<section class="combined-notebook"><label class="combined-parent"><input type="checkbox" data-combined-notebook="${e(project.id)}"><span>${SC.icon('notebook')}${e(project.name)}</span></label><div class="combined-books">${contents}</div></section>` : '';
      }).join('');
      tree.innerHTML = groups.map(group => {
        const whole = matches(group.name), contents = bookRows(books.filter(book => !book.projectId && book.groupId === group.id), whole) + notebookRows(projects.filter(project => project.groupId === group.id), whole);
        return contents ? `<section class="combined-group"><label class="combined-parent combined-group-name"><input type="checkbox" data-combined-group="${e(group.id)}"><span>${SC.icon('folder')}${e(group.name)}</span></label>${contents}</section>` : '';
      }).join('') + notebookRows(projects.filter(project => !groupIds.has(project.groupId))) + bookRows(books.filter(book => !book.projectId && !groupIds.has(book.groupId)));
      if (!tree.children.length) tree.innerHTML = '<p class="muted">没有匹配的卡片集合。</p>';
      tree.querySelectorAll('[data-combined-book]').forEach(input => input.onchange = () => { input.checked ? draft.add(input.dataset.combinedBook) : draft.delete(input.dataset.combinedBook); sync(); });
      tree.querySelectorAll('[data-combined-group],[data-combined-notebook]').forEach(input => input.onchange = () => { booksOf(input).forEach(book => input.checked ? draft.add(book.id) : draft.delete(book.id)); sync(); });
      sync();
    }
    function sync() {
      const visible = [...tree.querySelectorAll('[data-combined-book]')].map(input => input.dataset.combinedBook);
      tree.querySelectorAll('[data-combined-book]').forEach(input => input.checked = draft.has(input.dataset.combinedBook));
      tree.querySelectorAll('[data-combined-group],[data-combined-notebook]').forEach(input => {
        const rows = booksOf(input), count = rows.filter(book => draft.has(book.id)).length;
        input.checked = rows.length > 0 && count === rows.length; input.indeterminate = count > 0 && count < rows.length; input.disabled = !rows.length;
      });
      const all = SC.$('#combinedSelectAll'), count = visible.filter(id => draft.has(id)).length;
      all.checked = !!visible.length && count === visible.length; all.indeterminate = count > 0 && count < visible.length; all.disabled = !visible.length;
      SC.$('#combinedDraftCount').textContent = `已选 ${draft.size} 组卡片`;
    }
    SC.$('#combinedScopeSearch').oninput = drawTree;
    SC.$('#combinedSelectAll').onchange = event => { tree.querySelectorAll('[data-combined-book]').forEach(input => event.target.checked ? draft.add(input.dataset.combinedBook) : draft.delete(input.dataset.combinedBook)); sync(); };
    SC.$('#combinedScopeCancel').onclick = () => dialog.close();
    SC.$('#combinedScopeConfirm').onclick = () => { state.bookIds = books.filter(book => draft.has(book.id) && SC.data.books.includes(book)).map(book => book.id); state.active = false; dialog.close(); SC.stopSpeech(); SC.render(); SC.$('#combinedScopeAdd')?.focus({preventScroll: true}); };
    const cancelOnEscape = event => {
      if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229 || !event.target.closest('.combined-scope-picker')) return;
      event.preventDefault(); event.stopPropagation(); dialog.close();
    };
    dialog.addEventListener('keydown', cancelOnEscape);
    dialog.addEventListener('close', () => { dialog.removeEventListener('keydown', cancelOnEscape); SC.$('#combinedScopeAdd')?.focus({preventScroll: true}); }, {once: true});
    drawTree(); SC.$('#combinedScopeSearch').focus();
  }
  SC.combinedRender = SC.renderCombined = (view, announce = false) => {
    const books = normalBooks();
    const state = SC.ui.combined ||= {bookIds: books.filter(book => SC.bookInScope(book)).map(book => book.id), mode: 'learn', count: 10, active: false};
    state.bookIds = state.bookIds.filter(id => books.some(book => book.id === id));
    if (!modes.some(([mode]) => mode === state.mode)) state.mode = 'learn';
    state.count = readCount(state.count);
    view.dataset.combinedView = state.active ? state.mode : 'setup';
    const info = availability(state.bookIds, state.mode, state.count), scopeKey = 'combined:' + [...state.bookIds].sort().join(',');
    const label = modes.find(([mode]) => mode === state.mode)[1], names = books.filter(book => state.bookIds.includes(book.id)).map(book => {
      const project = SC.data.projects.find(project => project.id === book.projectId), group = SC.data.groups?.find(group => group.id === (project?.groupId || book.groupId));
      return [group?.name, project?.name, book.name].filter(Boolean).join(' / ');
    });
    if (state.active && ['expressions', 'forms', 'sentence'].includes(state.mode)) {
      view.innerHTML = `<div class="combined-session"><div class="combined-session-head"><p>${e(label)} · ${state.bookIds.length} 组卡片 · ${state.count} ${state.mode === 'sentence' ? '题' : '个单词'}</p><button type="button" class="plain-button" id="combinedChangeSetup">调整设置</button></div><div id="combinedPractice"></div></div>`;
      view.querySelector('#combinedChangeSetup').onclick = () => { SC.clearManagement?.(); state.active = false; SC.stopSpeech(); SC.render(); };
      if (!info.available) { view.querySelector('#combinedPractice').innerHTML = `<p class="empty-state">${e(info.message)}</p>`; return; }
      const mount = view.querySelector('#combinedPractice');
      if (state.mode === 'sentence') SC.renderSentencePractice(mount, {cards: info.cards, scopeKey, count: state.count});
      else SC.renderStudyExpansion(mount, {mode: state.mode, cards: info.cards, scopeKey: scopeKey + ':' + state.mode, count: state.count}, announce);
      return;
    }
    state.active = false;
    const countLabel = state.mode === 'learn' ? '学习数量' : ['expressions', 'forms'].includes(state.mode) ? '单词数量' : '题量';
    view.innerHTML = `<div class="combined-layout combined-setup"><div class="combined-settings-stack"><section class="combined-setting-card combined-scope-card"><span class="combined-setting-label">01</span><div class="combined-scope-head"><h2>范围</h2><button type="button" class="plain-button combined-scope-add" id="combinedScopeAdd" aria-label="选择练习范围" aria-haspopup="dialog">${SC.icon('plus')}</button></div><div class="combined-scope-summary">${names.map(name => `<span>${e(name)}</span>`).join('') || '<span class="muted">尚未选择范围</span>'}</div><p class="combined-selection-count small muted">已选 ${state.bookIds.length} 组卡片</p></section><section class="combined-setting-card combined-mode-card"><span class="combined-setting-label">02</span><h2>模式</h2><div class="combined-modes" role="group" aria-label="练习模式">${modes.map(([mode, name]) => `<button type="button" class="quiet-button ${state.mode === mode ? 'active' : ''}" data-combined-mode="${mode}" aria-pressed="${state.mode === mode}">${name}</button>`).join('')}</div></section><section class="combined-setting-card combined-count-card"><span class="combined-setting-label">03</span><h2>数量</h2><div class="combined-count-actions combined-controls"><label class="combined-amount"><span>${countLabel}</span><input id="combinedCount" type="number" min="1" step="1" value="${state.count}" aria-label="${countLabel}"></label><button type="button" class="soft-button" id="combinedStart" ${info.available ? '' : 'disabled'}>开始 ${SC.icon('right')}</button></div><p class="combined-available small muted" id="combinedAvailable" role="status">${e(info.message)}</p></section></div></div>`;
    view.querySelector('#combinedScopeAdd').onclick = () => openScopePicker(state);
    view.querySelectorAll('[data-combined-mode]').forEach(button => button.onclick = () => { state.mode = button.dataset.combinedMode; SC.stopSpeech(); SC.render(); });
    const count = view.querySelector('#combinedCount');
    count.onchange = () => {
      state.count = readCount(count.value); count.value = state.count;
      const ready = availability(state.bookIds, state.mode, state.count);
      view.querySelector('#combinedAvailable').textContent = ready.message;
      view.querySelector('#combinedStart').disabled = !ready.available;
    };
    const start = () => {
      state.count = readCount(count.value);
      const ready = availability(state.bookIds, state.mode, state.count);
      if (!ready.available) { SC.toast(ready.message); return; }
      SC.clearManagement?.(); state.active = true; SC.stopSpeech();
      view.dataset.combinedView = state.mode;
      if (['learn', 'test'].includes(state.mode)) {
        if (SC.startCombinedBookRound('mixed', ready.cards, {mode: state.mode === 'learn' ? 'cards' : 'test', count: state.count})) SC.root.querySelector(state.mode === 'learn' ? '#flip-card' : '#book-body')?.focus({preventScroll: true});
      }
      else SC.render(true);
    };
    view.querySelector('#combinedStart').onclick = start;
    view.querySelector('.combined-settings-stack').onkeydown = event => {
      if (event.key !== 'Enter' || event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || document.querySelector('dialog[open]') || !SC.$('#contextMenu').hidden || event.target !== count) return;
      event.preventDefault(); start();
    };
  };
  SC.combinedFixtures = {interleave, selectedCards, orderedScopeCards, modeCards, availability, openScopePicker};
})();
