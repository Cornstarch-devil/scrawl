'use strict';
(() => {
  const S = window.SC, STORE = 'scrawl-public-current-v1', CACHE = STORE + '-ditto-word-restore-v1';
  const SOURCE = '3ca43b7a3ef36b97c7638180225b495ebc0cb8ec8472434df64b71306deea9ad', LIMIT = 1024 * 1024;
  const fields = ['text', 'explanation', 'formation', 'note', 'example', 'translation', 'usage', 'cloze', 'clozeAnswer', 'surface', 'formNote', 'meaning', 'meaningZh', 'pos', 'senses', 'examples', 'original_note', 'protectedOriginal', 'originalFields'];
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b), own = (row, key) => Object.prototype.hasOwnProperty.call(row, key);
  const cardKey = row => row.bookId + '|' + String(row.text || '').normalize('NFC').trim();
  const alive = (data, bookId) => {
    const book = data.books.find(row => row.id === bookId);
    return book && !book.deleted && !data.deletedContainers?.[bookId] && (!book.projectId || data.projects.some(row => row.id === book.projectId && !row.deleted) && !data.deletedContainers?.[book.projectId]);
  };
  const scope = data => {
    const ids = Object.values(data.songLibrary || {}).filter(row => String(row.song?.title || '').trim().toLowerCase() === 'ditto').map(row => 'song:' + row.song.id);
    return data.books.filter(book => book.kind === 'grammar' && ids.includes(book.projectId) && alive(data, book.id));
  };
  const readSnapshot = () => {
    try { const snapshot = JSON.parse(localStorage.getItem(CACHE)); return snapshot?.version === 1 && snapshot.source_file_id === SOURCE && snapshot.at === S.data.dittoWordRestore?.at ? snapshot : null; }
    catch { return null; }
  };
  function commit(next) {
    const previous = localStorage.getItem(STORE), value = JSON.stringify(next);
    try {
      localStorage.setItem(STORE, value);
      if (localStorage.getItem(STORE) !== value) throw new Error('存储读回不一致');
    } catch (error) {
      try { if (previous == null) localStorage.removeItem(STORE); else localStorage.setItem(STORE, previous); } catch {}
      throw error;
    }
    S.data = next; S.ui.dataEpoch = (S.ui.dataEpoch || 0) + 1;
  }
  S.canUndoDittoWordRestore = scopeId => {
    const marker = S.data?.dittoWordRestore;
    return !!(marker?.version === 1 && marker.status === 'applied' && (!scopeId || marker.bookIds.includes(scopeId) || marker.projectIds.includes(scopeId)) && readSnapshot());
  };
  S.allowDittoGrammarWrite = (bookId, values = {}, explicit = false) => {
    const marker = S.data?.dittoWordRestore, book = S.data?.books.find(row => row.id === bookId);
    return !(marker?.status === 'applied' && book?.kind === 'grammar' && marker.projectIds.includes(book.projectId)) || !!(explicit || values.manual);
  };
  const addItem = S.addItem;
  S.addItem = (bookId, values, explicit = false) => S.allowDittoGrammarWrite(bookId, values, explicit) ? addItem(bookId, values, explicit) : null;

  S.restoreDittoWord = () => {
    S.ui.dittoWordRestoreBlocked = false;
    const data = S.data, source = window.SCRAWL_ORIGINAL_RESTORE;
    if (!data || data.legacyImportsDisabled || data.dittoWordRestore?.version === 1) return false;
    const books = scope(data); if (!books.length) return false;
    const originals = Object.fromEntries(Object.entries(source?.cards || {}).filter(([, row]) => row.explanation));
    if (source?.source_file_id !== SOURCE || Object.keys(originals).length !== 14) {
      S.ui.dittoWordRestoreBlocked = true; S.toast('Word 来源无法确认，本次不更改卡片。'); return false;
    }
    let wroteSnapshot = false;
    try {
      const bookIds = books.map(book => book.id), next = structuredClone(data), changes = [], parked = [], links = [];
      next.items.forEach((row, position) => {
        if (row.kind !== 'grammar' || !bookIds.includes(row.bookId)) return;
        const original = originals[row.id];
        if (!original || row.source_file_id !== SOURCE) { parked.push({row: structuredClone(row), position}); return; }
        const after = {...original, originalFields: structuredClone(original)}, edits = [];
        for (const key of fields) if (!own(row, key) || !equal(row[key], after[key])) {
          edits.push({key, had: own(row, key), before: structuredClone(row[key]), after: structuredClone(after[key])}); row[key] = structuredClone(after[key]);
        }
        if (edits.length) changes.push({id: row.id, bookId: row.bookId, source_file_id: row.source_file_id, edits});
      });
      const removed = new Set(parked.map(({row}) => row.id));
      for (const row of next.items) if (row.kind === 'sentence') for (const key of ['wordIds', 'grammarIds']) {
        if (!Array.isArray(row[key]) || !row[key].some(id => removed.has(id))) continue;
        const before = structuredClone(row[key]), after = before.filter(id => !removed.has(id));
        links.push({id: row.id, key, before, after}); row[key] = after;
      }
      next.items = next.items.filter(row => !removed.has(row.id));
      const snapshot = {version: 1, at: new Date().toISOString(), source_file_id: SOURCE, changes, parked, links}, raw = JSON.stringify(snapshot);
      if (raw.length * 2 > LIMIT) throw new Error('恢复快照超过 1 MiB');
      localStorage.setItem(CACHE, raw); wroteSnapshot = true;
      if (localStorage.getItem(CACHE) !== raw) throw new Error('恢复快照未能读回');
      next.dittoWordRestore = {version: 1, status: 'applied', at: snapshot.at, source_file_id: SOURCE, bookIds, projectIds: [...new Set(books.map(book => book.projectId))], restored: changes.length, parked: parked.length};
      commit(next);
      S.toast(`已恢复 Ditto Word 语法；${parked.length} 张后续卡片保留在恢复快照中。`, S.undoDittoWordRestore);
      return true;
    } catch (error) {
      if (wroteSnapshot) try { localStorage.removeItem(CACHE); } catch {}
      S.ui.dittoWordRestoreBlocked = true; S.toast(`${error.message}，本次不更改卡片。`); return false;
    }
  };
  S.undoDittoWordRestore = () => {
    const snapshot = readSnapshot();
    if (!S.canUndoDittoWordRestore() || !snapshot) { S.toast('Word 恢复快照不存在或已撤销，本次不更改卡片。'); return false; }
    try {
      const next = structuredClone(S.data), restored = new Set(); let skipped = 0;
      for (const change of snapshot.changes) {
        const row = next.items.find(note => note.id === change.id && note.bookId === change.bookId && note.source_file_id === change.source_file_id);
        if (!row || !alive(next, row.bookId)) { skipped++; continue; }
        for (const edit of change.edits) {
          if (edit.after !== undefined && !own(row, edit.key) || !equal(row[edit.key], edit.after)) { skipped++; continue; }
          if (edit.had) row[edit.key] = structuredClone(edit.before); else delete row[edit.key];
        }
      }
      for (const {row, position} of snapshot.parked) {
        if (!alive(next, row.bookId) || next.deletedCardKeys?.[cardKey(row)] || next.items.some(note => note.id === row.id || cardKey(note) === cardKey(row))) { skipped++; continue; }
        next.items.splice(Math.min(position, next.items.length), 0, structuredClone(row)); restored.add(row.id);
      }
      const parkedIds = new Set(snapshot.parked.map(({row}) => row.id));
      for (const link of snapshot.links) {
        const row = next.items.find(note => note.id === link.id);
        if (!row || !equal(row[link.key], link.after)) { skipped++; continue; }
        row[link.key] = link.before.filter(id => !parkedIds.has(id) || restored.has(id));
      }
      next.dittoWordRestore.status = 'undone'; commit(next); S.persist?.(); S.render?.(); S.refreshSidebar?.();
      S.toast(skipped ? '已撤销 Word 恢复；后续修改和已删除内容保持不变。' : '已撤销 Word 恢复，卡片与学习记录已保留。'); return true;
    } catch (error) { S.toast(`${error.message}，本次不更改卡片。`); return false; }
  };
})();
