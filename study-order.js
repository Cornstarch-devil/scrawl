(function () {
  'use strict';
  const S = window.SC;
  let running = null;
  const fingerprint = card => JSON.stringify([card.text, card.meaning || '', card.meaningZh || '']);
  const eligible = card => card.kind === 'word' && !!String(card.meaning || card.meaningZh || '').trim();
  const snapshot = card => ({id: card.id, kind: 'word', text: card.text, meaning: card.meaning || '', meaningZh: card.meaningZh || ''});
  const matches = (saved, card) => { try { const fields = JSON.parse(saved); return Array.isArray(fields) && [3, 4].includes(fields.length) && JSON.stringify(fields.slice(0, 3)) === fingerprint(card); } catch { return false; } };
  const cacheFor = book => S.data.studyOrderCache?.[book.id]?.version === 1 ? S.data.studyOrderCache[book.id] : {version: 1, groups: [], fingerprints: {}};
  const live = row => !row.deleted && !S.data.deletedContainers?.[row.id];
  const books = () => S.data.books.filter(book => book.kind === 'word' && !book.ephemeral && !book.special && live(book));
  const attemptsFor = book => (S.data.studyOrderAttempts ||= {})[book.id] ||= {};
  const attempted = (book, card) => matches(S.data.studyOrderAttempts?.[book.id]?.[card.id]?.fingerprint, card);
  const targetsFor = book => S.itemsFor(book).filter(card => eligible(card) && !matches(cacheFor(book).fingerprints[card.id], card));

  function workspaceBooks() {
    const groups = (S.data.groups || []).filter(live), projects = (S.data.projects || []).filter(live), visible = S.data.sidebarVisible || {};
    const ordered = (rows, slots = []) => [...slots.map(id => rows.find(row => row.id === id)).filter(Boolean), ...rows.filter(row => !slots.includes(row.id)).sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))];
    const rows = books(), result = [], used = new Set(), append = row => { if (row && !used.has(row.id)) { used.add(row.id); result.push(row); } };
    const current = rows.find(book => book.id === S.bookId && book.projectId === S.projectId);
    append(current);
    rows.filter(book => book.projectId && book.projectId === S.projectId).forEach(append);
    for (const scope of ordered(groups, visible.groups).map(group => group.id).concat('')) {
      for (const project of ordered(projects.filter(row => (groups.some(group => group.id === row.groupId) ? row.groupId : '') === scope), visible.notebooks?.[scope])) rows.filter(book => book.projectId === project.id).forEach(append);
      rows.filter(book => !book.projectId && (book.groupId || '') === scope).forEach(append);
    }
    rows.forEach(append);
    return result;
  }

  function counts() {
    const result = {complete: 0, total: 0, failed: 0, missing: 0};
    for (const book of books()) for (const card of S.itemsFor(book)) {
      if (!eligible(card)) { result.missing++; continue; }
      result.total++;
      if (matches(cacheFor(book).fingerprints[card.id], card)) result.complete++;
      else if (attempted(book, card) && (S.data.studyOrderAttempts[book.id][card.id].status !== 'pending' || !S.ui.studyOrderWorkspace?.busy || S.ui.studyOrderWorkspace.current !== book.id)) result.failed++;
    }
    return result;
  }
  function distance(first, second) {
    const a = [...String(first).normalize('NFD')], b = [...String(second).normalize('NFD')];
    let row = Array.from({length: b.length + 1}, (_, index) => index);
    for (let i = 0; i < a.length; i++) {
      const next = [i + 1];
      for (let j = 0; j < b.length; j++) next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + (a[i] !== b[j])));
      row = next;
    }
    return row[b.length] / Math.max(a.length, b.length, 1);
  }

  S.studyOrder = (book, rows) => {
    const cache = cacheFor(book), indices = new Map(rows.map((card, index) => [card.id, index])), byId = new Map(rows.map(card => [card.id, card])), used = new Set();
    const groups = cache.groups.map(group => group.card_ids.map(id => byId.get(id)).filter(card => card && matches(cache.fingerprints[card.id], card) && !used.has(card.id) && used.add(card.id))).filter(group => group.length);
    rows.filter(card => !used.has(card.id)).forEach(card => groups.push([card]));
    groups.sort((a, b) => Math.min(...a.map(card => indices.get(card.id))) - Math.min(...b.map(card => indices.get(card.id))));
    return groups.flatMap(group => {
      const remaining = [...group].sort((a, b) => indices.get(a.id) - indices.get(b.id)), ordered = [remaining.shift()];
      while (remaining.length) {
        const last = ordered.at(-1);
        remaining.sort((a, b) => distance(last.text, a.text) - distance(last.text, b.text) || indices.get(a.id) - indices.get(b.id));
        ordered.push(remaining.shift());
      }
      return ordered;
    });
  };
  S.studyOrderStatus = book => {
    const state = S.ui.studyOrderWorkspace || {}, tally = counts(), pause = S.data.studyOrderPause;
    const progress = `词汇整理 ${tally.complete}/${tally.total} · 失败 ${tally.failed} · 缺释义 ${tally.missing}`;
    const current = books().find(row => row.id === state.current), project = (S.data.projects || []).find(row => row.id === current?.projectId);
    if (state.busy) return `正在整理：${progress}${current ? ` · 当前 ${project?.name ? project.name + ' / ' : ''}${current.name || '单词卡'}` : ''}`;
    const error = pause?.error || Object.entries(S.data.studyOrderAttempts?.[book.id] || {}).find(([id, row]) => (row.status !== 'pending' || !state.busy) && S.itemsFor(book).some(card => card.id === id && matches(row.fingerprint, card)))?.[1].error;
    return progress + (error ? ` · 已暂停或未完成：${error} 现有顺序保留，可右键重试。` : tally.failed ? ' · 可右键重试未完成内容。' : '');
  };

  function validate(groups, cards) {
    if (!Array.isArray(groups) || !groups.length) throw new Error('分组结果为空。');
    const expected = new Set(cards.map(card => card.id)), seen = new Set(), groupIds = new Set();
    for (const group of groups) {
      if (!group || typeof group.id !== 'string' || !group.id.trim() || groupIds.has(group.id) || !Array.isArray(group.card_ids) || !group.card_ids.length) throw new Error('分组格式不正确。');
      groupIds.add(group.id);
      for (const id of group.card_ids) { if (!expected.has(id) || seen.has(id)) throw new Error('分组包含重复或无效卡片。'); seen.add(id); }
    }
    if (seen.size !== expected.size) throw new Error('分组遗漏了待整理卡片。');
  }

  function deadline(task, controller) {
    let timer;
    return Promise.race([task, new Promise((_, reject) => { timer = setTimeout(() => { controller?.abort(); reject(Object.assign(new Error('词汇整理等待超过 130 秒，请手动继续。'), {pause: true})); }, 130000); })]).finally(() => clearTimeout(timer));
  }
  async function request(body) {
    const controller = new AbortController();
    return deadline((async () => {
      let response;
      try { response = await fetch('/api/study-order', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: controller.signal}); }
      catch { throw Object.assign(new Error('词汇整理连接中断，请检查服务后手动继续。'), {pause: true}); }
      const result = await response.json().catch(() => null);
      const status = Number(result?.upstream_http_status) || response.status;
      if (!response.ok) throw Object.assign(new Error(typeof result?.detail === 'string' ? result.detail : '词汇整理服务未返回可用结果。'), {pause: [401, 403, 429].includes(status) || status >= 500 || ['transport', 'timeout', 'connection', 'configuration'].includes(result?.stage) || ['timeout', 'connection'].includes(result?.transport_code), status});
      return result;
    })(), controller);
  }
  S.prepareWorkspaceStudyOrder = (force = false) => {
    if (running) return running;
    if (force) { S.data.studyOrderAttempts = {}; delete S.data.studyOrderPause; S.persist(); }
    if (S.data.studyOrderPause) return Promise.resolve(false);
    if (!books().some(book => targetsFor(book).some(card => !attempted(book, card)))) return Promise.resolve(false);
    const state = S.ui.studyOrderWorkspace ||= {};
    state.busy = true;
    // Defer work so all callers share one promise, even before settings return.
    running = Promise.resolve().then(async () => {
      let changed = false;
      try {
        const config = await deadline(S.apiSettings());
        if (!config?.api_key_set || !config.text_model || config.demo) throw Object.assign(new Error('请先在 API 中配置模型，再右键继续词汇整理。'), {pause: true});
        while (true) {
          const book = workspaceBooks().find(row => targetsFor(row).some(card => !attempted(row, card)));
          if (!book) break;
          const batch = []; let batchSize = 0;
          for (const card of targetsFor(book).filter(card => !attempted(book, card))) {
            const length = JSON.stringify(snapshot(card)).length + 2;
            if (batch.length && batchSize + length > 30000) break;
            batch.push(card); batchSize += length;
          }
          const epoch = S.ui.dataEpoch || 0, fingerprints = batch.map(fingerprint);
          const active = () => epoch === (S.ui.dataEpoch || 0) && books().includes(book) && batch.every((card, index) => S.itemsFor(book).includes(card) && fingerprint(card) === fingerprints[index]);
          state.current = book.id;
          const attempts = attemptsFor(book);
          batch.forEach((card, index) => { attempts[card.id] = {fingerprint: fingerprints[index], status: 'pending', error: '上次整理未完成，请右键重试。'}; });
          if (S.persist() === false) throw Object.assign(new Error('浏览器未能保存整理进度，请释放存储空间后手动继续。'), {pause: true});
          try {
            const current = cacheFor(book), byId = new Map(S.itemsFor(book).map(card => [card.id, card]));
            const groups = []; let requestSize = JSON.stringify({cards: batch.map(snapshot), groups: []}).length;
            for (const group of current.groups) {
              const row = {id: group.id, cards: group.card_ids.map(id => byId.get(id)).filter(card => card && eligible(card) && matches(current.fingerprints[card.id], card)).slice(0, 3).map(snapshot)};
              const length = JSON.stringify(row).length + 2;
              if (row.cards.length && requestSize + length <= 45000) { groups.push(row); requestSize += length; }
            }
            const result = await request({cards: batch.map(snapshot), groups, ...(force ? {force: true} : {})});
            validate(result?.groups, batch);
            if (!active()) continue;
            const batchIds = new Set(batch.map(card => card.id)), merged = current.groups.map(group => ({id: group.id, card_ids: group.card_ids.filter(id => !batchIds.has(id))})), represented = new Set(groups.map(group => group.id));
            for (const group of result.groups) {
              const existing = merged.find(row => row.id === group.id);
              if (existing && represented.has(group.id)) existing.card_ids.push(...group.card_ids);
              else merged.push({id: existing ? 'group-' + crypto.randomUUID() : group.id, card_ids: [...group.card_ids]});
            }
            (S.data.studyOrderCache ||= {})[book.id] = {version: 1, groups: merged.filter(group => group.card_ids.length), fingerprints: {...current.fingerprints, ...Object.fromEntries(batch.map((card, index) => [card.id, fingerprints[index]]))}};
            batch.forEach(card => { delete attempts[card.id]; });
            changed = true;
            if (S.persist() === false) throw Object.assign(new Error('整理结果暂留本轮，浏览器未能保存，请释放存储空间后手动继续。'), {pause: true});
            S.studyOrderBatchReady?.(book);
          } catch (error) {
            if (active()) {
              batch.forEach((card, index) => { if (!matches(cacheFor(book).fingerprints[card.id], card)) attempts[card.id] = {fingerprint: fingerprints[index], status: 'failed', error: error.message || '词汇整理失败。'}; });
              S.persist();
            }
            if (error.pause) throw error;
          } finally {
            for (const card of batch) {
              const saved = S.data.studyOrderAttempts?.[book.id]?.[card.id];
              if (saved?.status === 'pending' && matches(saved.fingerprint, card)) saved.status = 'failed';
            }
            S.persist();
          }
        }
      } catch (error) { S.data.studyOrderPause = {error: error.message || '词汇整理暂停。', status: error.status || 0}; S.persist(); }
      finally { state.busy = false; state.current = null; running = null; }
      return changed;
    });
    return running;
  };
  S.prepareStudyOrder = (book, force = false) => book.ephemeral || book.kind !== 'word' ? Promise.resolve(false) : S.prepareWorkspaceStudyOrder(force);
  S.retryStudyOrder = book => S.prepareStudyOrder(book, true);
  S.studyOrderFixtures = {distance, fingerprint, matches, validate, workspaceBooks, counts};
  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => queueMicrotask(() => S.prepareWorkspaceStudyOrder()));
})();
