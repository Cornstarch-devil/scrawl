'use strict';
(() => {
  const S = window.SC, STORE = 'scrawl-public-current-v1', CACHE = STORE + '-korean-workbook-undo-v1';
  const norm = value => String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const own = (row, key) => Object.prototype.hasOwnProperty.call(row, key);
  const progress = () => ({streak: 0, due: '', events: []});
  const source = () => window.SCRAWL_KOREAN_WORKBOOK;
  const alive = (data, id) => !data.deletedContainers?.[id];
  const deletedCard = (data, card) => !!data.deletedSourceCards?.[source().source_file_id + '|' + card.id];
  function validate(workbook) {
    if (workbook?.version !== 1 || !workbook.source_file_id || workbook.projects?.length !== 2 || !workbook.sentences?.sections) throw new Error('Word 导入资料不完整。');
    const ids = new Set();
    for (const project of workbook.projects) {
      if (ids.has(project.id) || !project.lessons?.length) throw new Error('项目标识不正确。');
      ids.add(project.id);
      for (const lesson of project.lessons) {
        if (ids.has(lesson.id) || !Array.isArray(lesson.words) || !Array.isArray(lesson.grammar)) throw new Error('课次资料不完整。');
        ids.add(lesson.id);
        for (const kind of ['words', 'grammar']) for (const card of lesson[kind]) {
          if (!card.id || ids.has(card.id) || !norm(card.text) || !card.original_note || !card.source_locations?.length) throw new Error('卡片原文或来源标识不正确。');
          ids.add(card.id);
        }
        if (lesson.grammar.some(card => !card.positions?.length || card.positions.some(position => !lesson.grammarSource.blocks.some(block => block.position === position)))) throw new Error('语法点与原段落不匹配。');
      }
    }
    for (const section of workbook.sentences.sections) for (const entry of section.entries) {
      if (!entry.id || ids.has(entry.id) || !/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(entry.text)) throw new Error('句子标识或原文不正确。');
      ids.add(entry.id);
    }
  }
  function restoreStorage(key, before) { if (before == null) localStorage.removeItem(key); else localStorage.setItem(key, before); }
  function commit(next, undo) {
    const previous = localStorage.getItem(STORE), previousUndo = localStorage.getItem(CACHE), value = JSON.stringify(next);
    try {
      if (undo) { const raw = JSON.stringify(undo); localStorage.setItem(CACHE, raw); if (localStorage.getItem(CACHE) !== raw) throw new Error('撤销资料未能保存。'); }
      localStorage.setItem(STORE, value);
      if (localStorage.getItem(STORE) !== value) throw new Error('导入资料未能完整保存。');
    } catch (error) {
      try { restoreStorage(CACHE, previousUndo); restoreStorage(STORE, previous); } catch {}
      throw error;
    }
    S.data = next; S.ui.dataEpoch = (S.ui.dataEpoch || 0) + 1; S.ui.navigationEpoch = (S.ui.navigationEpoch || 0) + 1;
    S.clearManagement?.();
  }
  function readUndo() {
    try { const saved = JSON.parse(localStorage.getItem(CACHE)); return saved?.at === S.data.koreanWorkbookImport?.at && saved.source_file_id === S.data.koreanWorkbookImport?.source_file_id ? saved : null; } catch { return null; }
  }
  S.canUndoKoreanWorkbook = scopeId => {
    const marker = S.data?.koreanWorkbookImport;
    return marker?.status === 'applied' && (!scopeId || [...(marker.groups || []), ...(marker.notebooks || []), ...Object.values(marker.books || {})].includes(scopeId)) && !!readUndo();
  };
  S.koreanGrammarSourceForBook = book => {
    const workbook = source(), marker = S.data?.koreanWorkbookImport;
    if (!workbook || !marker || marker.source_file_id !== workbook.source_file_id || !book || book.kind !== 'grammar' || !alive(S.data, book.id)) return null;
    for (const project of workbook.projects) for (const lesson of project.lessons) if ((marker.books?.[lesson.grammarBookId] || lesson.grammarBookId) === book.id) return lesson.grammarSource;
    return null;
  };
  S.importKoreanWorkbook = () => {
    const workbook = source(), data = S.data;
    if (!workbook || !data || data.legacyImportsDisabled || data.koreanWorkbookImport?.version === 1) return false;
    try {
      validate(workbook);
      const next = structuredClone(data), undo = {at: new Date().toISOString(), source_file_id: workbook.source_file_id, created: {groups: [], projects: [], books: [], items: []}, changes: [], removed: []}, books = {};
      next.groups ||= []; next.projects ||= []; next.books ||= []; next.items ||= [];
      const add = (kind, value) => {
        const existing = next[kind].find(row => row.id === value.id);
        if (existing) return existing;
        next[kind].push(value); undo.created[kind].push(structuredClone(value)); return value;
      };
      const change = (kind, row, key, after) => {
        if (equal(row[key], after)) return;
        undo.changes.push({kind, id: row.id, key, had: own(row, key), before: structuredClone(row[key]), after: structuredClone(after)}); row[key] = after;
      };
      const makeBook = (id, kind, notebookId) => {
        if (!alive(next, id)) return null;
        const existing = next.books.find(row => row.id === id);
        if (existing && (existing.kind !== kind || existing.special || existing.projectId !== notebookId)) throw new Error('导入集合标识已被其他内容占用。');
        const book = add('books', {id, name: S.cardLabel?.(kind) || ({word: '单词卡', grammar: '语法卡', sentence: '句子卡'})[kind], kind, projectId: notebookId, groupId: null});
        books[id] = book.id; return book;
      };
      const makeCard = (card, kind, book) => {
        if (!book || deletedCard(next, card)) return;
        const existing = next.items.find(row => row.id === card.id);
        if (existing) return; // Stable source IDs never overwrite human edits or history.
        add('items', {...structuredClone(card), bookId: book.id, kind, source_file_id: workbook.source_file_id, protectedOriginal: true, originalFields: structuredClone(card), progress: progress()});
      };
      for (const project of workbook.projects) {
        if (!alive(next, project.id)) continue;
        add('groups', {id: project.id, name: project.name, expanded: true});
        for (const lesson of project.lessons) {
          if (!alive(next, lesson.id)) continue;
          const existing = next.projects.find(row => row.id === lesson.id);
          if (existing && existing.groupId !== project.id) throw new Error('导入课次标识已被其他内容占用。');
          add('projects', {id: lesson.id, name: lesson.name, groupId: project.id, expanded: true, modules: []});
          const wordBook = makeBook(lesson.wordBookId, 'word', lesson.id), grammarBook = makeBook(lesson.grammarBookId, 'grammar', lesson.id);
          for (const card of lesson.words) makeCard(card, 'word', wordBook);
          for (const card of lesson.grammar) makeCard(card, 'grammar', grammarBook);
        }
      }
      const daily = workbook.daily, notebook = next.projects.find(row => row.id === daily.targetNotebookId), parent = next.items.find(row => row.id === daily.parentId);
      if (notebook && alive(next, notebook.id)) {
        const originalBook = next.books.find(row => row.id === (parent?.bookId || daily.bookId));
        const reusable = originalBook && !originalBook.special && originalBook.kind === 'sentence' && alive(next, originalBook.id) && (!originalBook.projectId || alive(next, originalBook.projectId)) && alive(next, daily.notebookId) && !next.items.some(row => row.bookId === originalBook.id && row.id !== parent?.id);
        const targetBookId = daily.targetNotebookId + ':sentence';
        let target;
        if (reusable) {
          target = originalBook;
          change('books', target, 'projectId', notebook.id); change('books', target, 'groupId', null); books[targetBookId] = target.id;
        } else target = makeBook(targetBookId, 'sentence', notebook.id);
        if (parent && target && alive(next, parent.bookId) && alive(next, daily.notebookId)) {
          change('items', parent, 'bookId', target.id);
          const original = daily.blocks.map(block => block.text).join('\n');
          const note = {file_id: workbook.source_file_id, original_note: original, locations: daily.blocks.map(block => '段落 ' + block.paragraph)};
          if (!(parent.original_notes || []).some(row => row.file_id === note.file_id && row.original_note === original)) change('items', parent, 'original_notes', [...(parent.original_notes || []), note]);
        }
        // Remove only the now-empty notebook created by the old built-in import.
        const old = next.projects.find(row => row.id === daily.notebookId);
        if (old?.name === '日常情境' && !old.modules?.length && !next.books.some(book => book.projectId === old.id)) {
          undo.removed.push({kind: 'projects', row: structuredClone(old), position: next.projects.indexOf(old)}); next.projects = next.projects.filter(row => row !== old);
          if (next.lastProject === old.id) change('data', next, 'lastProject', notebook.id);
          if (S.projectId === old.id) undo.scope = {before: {projectId: S.projectId, groupId: S.groupId}, after: {projectId: notebook.id, groupId: null}};
        }
      }
      // The legacy 34-unit import is consumed even when its card was manually deleted.
      if (!next.sceneSummaryImports?.[daily.parentId]) {
        const before = next.sceneSummaryImports; next.sceneSummaryImports = {...before, [daily.parentId]: true};
        undo.changes.push({kind: 'data', key: 'sceneSummaryImports', had: own(data, 'sceneSummaryImports'), before: structuredClone(before), after: structuredClone(next.sceneSummaryImports)});
      }
      const sentences = workbook.sentences;
      if (next.projects.some(row => row.id === sentences.notebookId) && alive(next, sentences.notebookId)) {
        const book = makeBook(sentences.bookId, 'sentence', sentences.notebookId);
        if (book && !next.items.some(row => row.id === sentences.parentId) && !deletedCard(next, {id: sentences.parentId})) {
          const sections = structuredClone(sentences.sections);
          const existing = S.studyItems ? S.studyItems(data.items) : data.items;
          for (const section of sections) for (const entry of section.entries) {
            if (!entry.meaning && !entry.meaningZh) {
              const exact = existing.find(row => row.kind === 'sentence' && norm(row.text) === norm(entry.text) && (norm(row.meaning) || norm(row.meaningZh)));
              if (exact) { entry.meaning = exact.meaning || ''; entry.meaningZh = exact.meaningZh || ''; entry.meaningSourceId = exact.id; }
            }
            entry.progress = progress();
          }
          add('items', {id: sentences.parentId, text: sentences.title, kind: 'sentence', bookId: book.id, contentType: 'sentence-summary', sections, original_note: sections.map(section => section.original_note).join('\n'), source_file_id: workbook.source_file_id, protectedOriginal: true, source_locations: ['原文段落 478–502'], progress: progress()});
        }
      }
      next.koreanWorkbookImport = {version: 1, status: 'applied', at: undo.at, source_file_id: workbook.source_file_id, books, groups: workbook.projects.map(project => project.id), notebooks: workbook.projects.flatMap(project => project.lessons.map(lesson => lesson.id)), counts: {words: undo.created.items.filter(row => row.kind === 'word').length, grammar: undo.created.items.filter(row => row.kind === 'grammar').length, sentences: undo.created.items.filter(row => row.contentType === 'sentence-summary').reduce((sum, row) => sum + row.sections.reduce((n, section) => n + section.entries.length, 0), 0)}};
      commit(next, undo); if (undo.scope) Object.assign(S, undo.scope.after);
      S.refreshSidebar?.(); S.render?.(); S.toast('Word 笔记已按课次导入，旧句子与学习记录已保留。', S.undoKoreanWorkbook); return true;
    } catch (error) { S.toast(`${error.message || '浏览器空间不足'}，本次未导入，请释放空间后重试。`); return false; }
  };
  S.undoKoreanWorkbook = () => {
    const undo = readUndo(); if (!S.canUndoKoreanWorkbook() || !undo) return false;
    try {
      const next = structuredClone(S.data);
      for (const removed of undo.removed) if (!next[removed.kind].some(row => row.id === removed.row.id) && alive(next, removed.row.id) && undo.changes.some(change => change.kind === 'books' && change.key === 'projectId' && change.before === removed.row.id && next.books.some(book => book.id === change.id && alive(next, book.id)))) next[removed.kind].splice(Math.min(removed.position, next[removed.kind].length), 0, structuredClone(removed.row));
      for (const change of [...undo.changes].reverse()) {
        const row = change.kind === 'data' ? next : next[change.kind].find(row => row.id === change.id);
        if (!row || !equal(row[change.key], change.after) || change.key === 'bookId' && !next.books.some(book => book.id === change.before) || change.kind === 'books' && change.key === 'projectId' && change.before && !next.projects.some(project => project.id === change.before)) continue;
        if (change.had) row[change.key] = structuredClone(change.before); else delete row[change.key];
      }
      const safe = (row, original, kind) => {
        if (kind === 'items') return equal(row, original);
        const clean = value => Object.fromEntries(Object.entries(value).filter(([key]) => !['lastUsed', 'expanded'].includes(key)));
        return equal(clean(row), clean(original));
      };
      for (const kind of ['items', 'books', 'projects', 'groups']) {
        next[kind] = next[kind].filter(row => {
          const original = undo.created[kind].find(value => value.id === row.id); if (!original || !safe(row, original, kind)) return true;
          const needed = kind === 'items' ? next.items.some(other => other.id !== row.id && [other, ...(other.sections || []).flatMap(section => section.entries || [])].some(unit => [...(unit.wordIds || []), ...(unit.grammarIds || [])].includes(row.id))) : kind === 'books' ? next.items.some(item => item.bookId === row.id) : kind === 'projects' ? next.books.some(book => book.projectId === row.id) : next.projects.some(project => project.groupId === row.id) || next.books.some(book => book.groupId === row.id);
          if (needed) return true; return false;
        });
      }
      next.koreanWorkbookImport.status = 'undone';
      // Keep the consumed legacy marker: undo must not resurrect deleted source units.
      next.sceneSummaryImports = {...next.sceneSummaryImports, [source().daily.parentId]: true};
      commit(next);
      if (undo.scope && S.projectId === undo.scope.after.projectId && S.groupId === undo.scope.after.groupId && next.projects.some(project => project.id === undo.scope.before.projectId)) Object.assign(S, undo.scope.before);
      S.refreshSidebar?.(); S.render?.(); S.toast('已撤销导入；后续修改、学习记录和已删除内容保持不变。'); return true;
    } catch (error) { S.toast(`${error.message}，撤销未完成，现有内容保持不变。`); return false; }
  };
  S.koreanImportFixtures = {norm, validate};
  document.addEventListener('DOMContentLoaded', () => S.importKoreanWorkbook());
})();
