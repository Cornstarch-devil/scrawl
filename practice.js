'use strict';

(() => {
  const SC = window.SC;
  const exercises = [
    {id: 'rice', words: [['밥', /^(?:cooked )?rice$/i], ['먹다', /^(?:to )?eat(?: food)?$/i]], goal: 'I eat rice.', pieces: [['저', null], ['는', 'particle'], ['밥', '밥'], ['을', 'particle'], ['먹어요', '먹다']], extras: [['를', 'particle'], ['에', 'particle'], ['먹었어요', '먹다']], answers: [[0, 1, 2, 3, 4], [2, 3, 0, 1, 4]], note: '는标记话题，을标记宾语。먹어요是日常礼貌体，먹었어요是过去式，与本题目标不同。'},
    {id: 'meal', words: [['밥', /^(?:a |the )?meal$/i], ['먹다', /^(?:to )?eat(?: food)?$/i]], goal: 'I eat a meal.', pieces: [['저', null], ['는', 'particle'], ['밥', '밥'], ['을', 'particle'], ['먹어요', '먹다']], extras: [['를', 'particle'], ['에', 'particle'], ['먹었어요', '먹다']], answers: [[0, 1, 2, 3, 4], [2, 3, 0, 1, 4]], note: '这张밥卡的语境义是meal。名词有收音接을；本题用日常礼貌体的现在表达。'},
    {id: 'school', words: [['학교', /^(?:a |the )?school$/i], ['가다', /^(?:to )?go$/i]], goal: 'I go to school.', pieces: [['저', null], ['는', 'particle'], ['학교', '학교'], ['에', 'particle'], ['가요', '가다']], extras: [['에서', 'particle'], ['을', 'particle'], ['갔어요', '가다']], answers: [[0, 1, 2, 3, 4], [2, 3, 0, 1, 4]], note: '학교에的에表示移动目的地；에서通常表示动作发生地点。가요是日常礼貌体，갔어요表示过去。'},
    {id: 'wish', words: [['밥', /^(?:cooked )?rice$/i], ['먹다', /^(?:to )?eat(?: food)?$/i]], grammar: '-고싶다', goal: 'I want to eat rice.', pieces: [['저', null], ['는', 'particle'], ['밥', '밥'], ['을', 'particle'], ['먹고', '먹다'], ['싶어요', null]], extras: [['를', 'particle'], ['먹어요', '먹다'], ['먹었어요', '먹다']], answers: [[0, 1, 2, 3, 4, 5], [2, 3, 0, 1, 4, 5]], note: '动词词干接고 싶다表达愿望。먹고 싶어요是日常礼貌体；吃与想吃的意思不同。'},
    {id: 'promise', words: [['약속', /^(?:a |the )?promise$/i], ['기억하다', /^(?:to )?remember$/i]], goal: 'I remember the promise.', pieces: [['저', null], ['는', 'particle'], ['약속', '약속'], ['을', 'particle'], ['기억해요', '기억하다']], extras: [['를', 'particle'], ['에', 'particle'], ['기억했어요', '기억하다']], answers: [[0, 1, 2, 3, 4], [2, 3, 0, 1, 4]], note: '약속在这里是承诺。기억해요表示记得；기억했어요是过去表达。本题练习日常礼貌体。'},
    {id: 'starlight', words: [['별빛', /^starlight$/i], ['반짝이다', /^(?:to )?(?:sparkle|shine)$/i]], goal: 'The starlight sparkles.', pieces: [['별빛', '별빛'], ['이', 'particle'], ['반짝여요', '반짝이다']], extras: [['가', 'particle'], ['을', 'particle'], ['반짝였어요', '반짝이다']], answers: [[0, 1, 2]], note: '별빛有收音，用이标记主语。반짝여요来自반짝이다的日常礼貌活用；반짝였어요表示过去。'}
  ];

  function projectWords() {
    const ids = new Set(SC.data.books.filter(book => SC.bookInScope(book) && book.kind === 'word').map(book => book.id));
    return SC.data.items.filter(item => ids.has(item.bookId) && item.kind === 'word' && learned(item));
  }
  function expansionItems(mode, options) {
    const items = (options?.cards || projectWords()).filter(item => SC.data.items.includes(item) && item.kind === 'word' && learned(item) && (mode !== 'forms' || canConjugate(item)));
    return options ? items.slice(0, Math.max(1, Math.floor(Number(options.count) || 10))) : items;
  }
  const learned = item => (item.kind === 'word' ? !!String(SC.studyMeaning(item) || '').trim() : item.kind === 'grammar' && !!String(item.explanation || '').trim());
  function chooseWord(items, key) {
    const old = SC.ui[key];
    const item = items.find(entry => entry.id === old) || items[0];
    if (item) SC.ui[key] = item.id;
    return item;
  }
  function selector(items, item, id) {
    return `<select id="${id}" class="quiet-select" aria-label="选择单词">${items.map(entry => `<option value="${SC.esc(entry.id)}"${entry.id === item.id ? ' selected' : ''}>${SC.esc(entry.text)}</option>`).join('')}</select>`;
  }
  function renderExpansionFocused(view, selectorId, target, announce = false) {
    const stage = target?.closest('[data-stage]')?.dataset.stage, form = target?.closest('[data-form]')?.dataset.form, root = target?.closest('.form-root'), pending = target?.closest('.empty-state');
    SC.render(announce); SC.houseSelects?.();
    if (!target || !view || document.querySelector('dialog[open]') || !SC.$('#contextMenu').hidden) return;
    if (SC.route === 'combined') view = SC.root.querySelector('#combinedPractice');
    if (!view) return;
    const control = view.querySelector('#' + selectorId)?.nextElementSibling;
    const reading = stage !== undefined ? view.querySelector(`[data-stage="${stage}"] .expression-content`) : form !== undefined ? view.querySelector(`[data-form="${form}"]`) || view.querySelector('.form-row') : root ? view.querySelector('.form-root') : pending ? view.querySelector('.empty-state,.expression-content,.form-root') : null;
    (reading || ((stage !== undefined || form !== undefined || root || pending) && view.querySelector('.empty-state')) || control)?.focus({preventScroll: true});
  }
  function empty(view) {
    view.innerHTML = '<div class="empty-state"><span class="empty-mark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9c0-3 14-3 14 0 0 3-4 8-7 8S5 12 5 9ZM12 17v4m-4-1c2 2 6 2 8 0"/></svg></span><p>先在这个项目里保存几个有释义的单词。</p><button class="quiet-button" id="practiceHome">回到对话</button></div>';
    view.querySelector('#practiceHome').onclick = () => SC.go('home', SC.projectId);
  }
  function keyAllowed(event, fieldException) {
    if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || document.querySelector('dialog[open]') || !SC.$('#contextMenu').hidden) return false;
    const field = event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
    return !field || field === fieldException;
  }
  function clickableContent(element, speak, edit, advance) {
    let clickTimer;
    const route = SC.route, projectId = SC.projectId;
    const stillCurrent = () => element.isConnected && SC.route === route && SC.projectId === projectId;
    element.addEventListener('click', event => { if (event.target.closest('input,label,button')) return; const epoch = SC.ui.playbackStopEpoch || 0; clearTimeout(clickTimer); clickTimer = setTimeout(() => { if (stillCurrent() && epoch === (SC.ui.playbackStopEpoch || 0)) speak(); }, 220); });
    element.addEventListener('dblclick', () => { clearTimeout(clickTimer); SC.stopSpeech(); edit(); });
    element.addEventListener('keydown', event => {
      if (!keyAllowed(event) || event.target.closest('button,a,summary') || advance && SC.ui.supplementBatch) return;
      if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); advance ? advance(element) : speak(); }
      if (event.key === ' ' && advance) { event.preventDefault(); event.stopPropagation(); speak(); }
      if (event.key === 'F2') { event.preventDefault(); edit(); }
    });
  }
  const expansions = new Map();
  const expansionSequences = {expressions: Promise.resolve(), forms: Promise.resolve()};
  function finiteWait(operation, milliseconds, message) {
    const controller = new AbortController(); let timer;
    return Promise.race([operation(controller.signal), new Promise((resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error(message)); }, milliseconds); })]).catch(error => { if (['AbortError', 'TimeoutError'].includes(error.name)) throw new Error(message); throw error; }).finally(() => clearTimeout(timer));
  }
  const providerFor = config => SC.apiProvider?.(config) || JSON.stringify([String(config.base_url || '').replace(/\/+$/, ''), String(config.text_model || ''), ...(SC.data.apiConfigRevision ? [SC.data.apiConfigRevision] : [])]);
  const practiceSettings = () => finiteWait(() => SC.apiSettings(), 10000, '读取 API 设置超时，请手动重试。').then(config => { SC.ui.practiceProvider = providerFor(config); return config; });
  const disabledDictionaryFailure = message => /(?:韩国语基础词典|krdict|词典)/i.test(message) && /(?:密钥|认证|限额|尚未连接|未配置|未连接|请求失败|请求超时|无法连接|无法解析|等待预算)/.test(message);
  const visibleGenerationMessage = message => String(message || '').split(/[；;\n]|(?<=[。！？])\s*/).filter(part => part.trim() && !disabledDictionaryFailure(part)).join('；');
  const generationFailure = (message, provider, historical = false) => {
    message = visibleGenerationMessage(message);
    return !message ? '' : provider === 'sources-v1' ? (historical ? '历史来源说明：' : '') + message : provider && SC.ui.practiceProvider && provider !== SC.ui.practiceProvider ? '历史失败：这是之前 API 配置的失败，当前配置已改变；请手动重试。原原因：' + message : historical ? '历史失败，需手动重试。原原因：' + message : message;
  };
  function sourceMessages(payload, targets) {
    const ids = new Set(targets.map(card => card.id)), texts = new Set(targets.map(card => card.text));
    return [...new Set((Array.isArray(payload.source_status) ? payload.source_status : []).filter(row => row && row.status !== 'saved_source' && (row.card_id ? ids.has(row.card_id) : row.text ? texts.has(row.text) : true) && typeof row.message === 'string' && row.message.trim()).map(row => visibleGenerationMessage(row.message)).filter(Boolean))];
  }
  const practiceRequest = (path, body, milliseconds) => finiteWait(async signal => {
    const response = await fetch(path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), signal});
    const payload = await response.json(); if (!response.ok) { const reason = payload.stage === 'upstream_http' ? '上游失败：' : payload.finish_reason === 'length' ? '输出截断，未采用：' : ['validation', 'json', 'response_format'].includes(payload.stage) ? '内容结构未采用：' : ''; throw Object.assign(new Error(reason + (payload.detail || '准备失败，请手动重试。')), {stage: payload.stage, upstream_http_status: payload.upstream_http_status, finish_reason: payload.finish_reason}); }
    return payload;
  }, milliseconds, '准备等待超时，已有内容保留，请手动重试。');
  function sameFingerprint(first, second) {
    try { const a = JSON.parse(first), b = JSON.parse(second); delete a.version; delete b.version; a.references ||= []; b.references ||= []; a.sources ||= []; b.sources ||= []; return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
  }
  function expansionCard(item) {
    return {id: item.id, kind: 'word', text: item.text, meaning: item.meaning ? SC.studyMeaning(item) : '', meaningZh: item.meaning ? '' : SC.studyMeaning(item), pos: item.pos || '', example: item.example || '', translation: item.translation || '', note: item.note || '', original_note: item.original_note || ''};
  }
  function contextCards(targets) {
    const ids = new Set(targets.map(item => item.id)), bookIds = new Set(targets.map(item => item.bookId));
    const notebooks = new Set(SC.data.books.filter(book => bookIds.has(book.id) && book.projectId).map(book => book.projectId));
    const localBooks = new Set(SC.data.books.filter(book => bookIds.has(book.id) || notebooks.has(book.projectId)).map(book => book.id));
    const groups = new Set(SC.data.books.filter(book => bookIds.has(book.id)).map(book => SC.data.projects?.find(row => row.id === book.projectId)?.groupId || book.groupId).filter(Boolean));
    const projectBooks = new Set(SC.data.books.filter(book => !localBooks.has(book.id) && groups.has(SC.data.projects?.find(row => row.id === book.projectId)?.groupId || book.groupId)).map(book => book.id));
    const cards = SC.data.items.filter(item => !ids.has(item.id) && learned(item));
    return {local: composeCards(cards.filter(item => localBooks.has(item.bookId))), project: composeCards(cards.filter(item => projectBooks.has(item.bookId))), other: composeCards(cards.filter(item => !localBooks.has(item.bookId) && !projectBooks.has(item.bookId)))};
  }
  const requestContext = context => Object.fromEntries(['local', 'project', 'other'].map(scope => [scope, (context[scope] || []).map(card => Object.fromEntries(['id', 'kind', 'text', 'meaning', 'meaningZh', 'pos', 'explanation', 'formation', 'original_note'].map(key => [key, card[key] || ''])))]));
  const targetSize = cards => JSON.stringify({cards, context_cards: {local: [], project: [], other: []}}, null, 1).length;
  const generationAttempted = (key, fingerprint) => SC.data.practiceGenerationAttempts?.[key] === fingerprint;
  const repairFingerprint = fingerprint => 'request-ai-fill-20261012:' + fingerprint;
  const repairAttempted = (key, fingerprint) => SC.data.practiceRepairAttempts?.[key] === repairFingerprint(fingerprint);
  const markRepairAttempt = (key, fingerprint) => { (SC.data.practiceRepairAttempts ||= {})[key] = repairFingerprint(fingerprint); };
  function markGenerationAttempt(key, fingerprint) {
    (SC.data.practiceGenerationAttempts ||= {})[key] = fingerprint;
    markRepairAttempt(key, fingerprint);
    if (SC.persist() === false) throw new Error('浏览器未能保存自动准备状态，请释放存储空间后手动重试。');
  }
  function strategyVersion(fingerprint) { try { return JSON.parse(fingerprint).version; } catch { return 0; } }
  function referencedCards(tokens, targets, context) {
    const targetIds = new Set(targets.map(item => item.id)), ids = new Set(tokens.map(token => token.card_id).filter(id => id && !targetIds.has(id)));
    return [...context.local, ...(context.project || []), ...context.other].filter(card => ids.has(card.id)).sort((a, b) => a.id.localeCompare(b.id));
  }
  function liveReferences(references = []) {
    return references.map(reference => { const item = SC.data.items.find(item => item.id === reference.id && learned(item)); return item ? composeCards([item])[0] : null; });
  }
  function sourceUnits(targets = [], ids = null) {
    const books = new Set(targets.map(item => item.bookId)), notebooks = new Set(SC.data.books.filter(book => books.has(book.id)).map(book => book.projectId).filter(Boolean));
    const local = new Set(SC.data.books.filter(book => books.has(book.id) || notebooks.has(book.projectId)).map(book => book.id));
    const bookGroups = new Map(SC.data.books.map(book => [book.id, SC.data.projects?.find(row => row.id === book.projectId)?.groupId || book.groupId]));
    const groups = new Set([...books].map(id => bookGroups.get(id)).filter(Boolean));
    const rank = row => local.has(row.bookId) ? 0 : groups.has(bookGroups.get(row.bookId)) ? 1 : 2;
    const rows = (SC.studyItems?.(SC.data.items) || SC.data.items).filter(row => {
      if (ids && !ids.has(row.id)) return false;
      const parent = row.parentId ? SC.data.items.find(item => item.id === row.parentId) : row;
      return row.kind === 'sentence' && row.text?.trim() && (row.manual || parent?.manual || row.protectedOriginal || parent?.protectedOriginal || row.source_file_id || parent?.source_file_id) && !((['model','generated','ai','assistant'].includes(row.source_kind) || row.verification === 'AI 生成') && !row.manual);
    }).sort((a, b) => rank(a) - rank(b));
    const examples = SC.data.items.filter(row => row.example?.trim() && (row.manual || row.protectedOriginal || row.source_file_id) && !(['model','generated','ai','assistant'].includes(row.source_kind) && !row.manual) && (!ids || ids.has(row.id + ':example'))).map(row => ({...row,id:row.id + ':example',kind:'sentence',text:row.example,meaning:row.translation || '',meaningZh:'',original_note:row.original_note || row.example}));
    const units = []; let size = 0;
    for (const row of [...rows,...examples].sort((a, b) => rank(a) - rank(b))) {
      const parent = row.parentId ? SC.data.items.find(item => item.id === row.parentId) : row;
      const unit = {id: row.id, text: row.text, meaning: row.meaning || '', meaningZh: row.meaningZh || '', note: row.note || '', original_note: row.original_note || row.text, source_file_id: row.source_file_id || parent?.source_file_id || '', source_locations: row.source_locations || parent?.source_locations || [], words: (row.words || []).map(part => ({text: part.text || '', meaning: part.meaning || '', note: part.note || ''})), grammar: (row.grammar || []).map(part => ({text: part.text || '', explanation: part.explanation || ''}))};
      const length = JSON.stringify(unit).length;
      if (length > 45000 - size || unit.text.length > 6000 || unit.original_note.length > 6000) continue;
      units.push(unit); size += length;
    }
    return units;
  }
  const sourceSnapshot = unit => JSON.stringify([unit.id, unit.text, unit.meaning || '', unit.meaningZh || '', unit.note || '', unit.original_note || '', unit.source_file_id || '', unit.words || [], unit.grammar || []]);
  function originalFormUnits(item) {
    const note = item.original_note || '', values = [];
    if (note.includes(item.text)) values.push([item.text, '']);
    const literal = item.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), pattern = new RegExp('^\\s*' + literal + '(?:[\\sA-Za-z,;()／/.-]*)(?:→|⇒|->)\\s*([가-힣]+)(.*)$');
    for (const line of note.split('\n')) {
      const match = line.match(pattern); if (!match) continue;
      values.push([match[1], line]); for (const next of match[2].matchAll(/(?:→|⇒|->)\s*([가-힣]+)/g)) values.push([next[1], line]);
    }
    return values.map(([text, description], index) => ({id: item.id + ':original-form:' + index, text, meaning: '', meaningZh: '', note: description, original_note: note, source_file_id: '', words: [], grammar: []}));
  }
  const liveSources = sources => {
    const units = [...sourceUnits([],new Set((sources||[]).map(source=>source.id))), ...SC.data.items.filter(item=>item.kind==='word').flatMap(originalFormUnits)];
    return (sources || []).map(source => units.find(unit => unit.id === source.id) || null);
  };
  function validateEvidence(evidence, text, units) {
    if (!evidence || !['saved', 'dictionary'].includes(evidence.kind) || typeof evidence.quote !== 'string' || !evidence.quote.trim() || typeof evidence.snapshot !== 'string' || !evidence.snapshot || !cleanSentence(evidence.quote).includes(cleanSentence(text))) throw new Error('内容没有对应的完整原句或词典来源。');
    if (evidence.kind === 'saved') {
      const unit = units.find(unit => 'saved:' + unit.id === evidence.source_id) || sourceUnits([],new Set([String(evidence.source_id).replace(/^saved:/,'')]))[0];
      if (!unit || sourceSnapshot(unit) !== evidence.snapshot || evidence.quote !== unit.text) throw new Error('原句来源已删除、修改或不匹配。');
      return unit;
    }
    if (!String(evidence.source_id).startsWith('krdict:') || !/^https:\/\/krdict\.korean\.go\.kr\//.test(evidence.url || '')) throw new Error('词典来源不正确。');
    return null;
  }
  SC.practiceSourceUnits = sourceUnits;
  const expansionFingerprint = (item, references = [], sources = []) => JSON.stringify({version: 8, card: expansionCard(item), references, sources});
  function tokenText(tokens) { return tokens.reduce((text, token) => text + (text && !token.attach_left ? ' ' : '') + token.text, ''); }
  function validateAuxiliary(tokens, auxiliary) {
    const required = new Set(tokens.filter(token => token.card_id === null).map(token => token.text));
    if (!Array.isArray(auxiliary) || new Set(auxiliary.map(row => row.text)).size !== required.size || auxiliary.length !== required.size || auxiliary.some(row => !required.has(row.text) || !String(row.meaning_en || row.explanation_zh || '').trim() || tokens.some(token => token.card_id === null && token.text === row.text && token.kind === 'word') && (!/[A-Za-z]/.test(row.meaning_en || '') || !/[\u4e00-\u9fff]/.test(row.explanation_zh || '')))) throw new Error('补充词或助词说明不完整。');
  }
  function normalizeAITokens(tokens, sources) {
    if (!Array.isArray(tokens)) return tokens;
    const rows = tokens.map(token => {
      if (!token || typeof token !== 'object') return token;
      if (token.attach_left !== undefined && typeof token.attach_left !== 'boolean') throw new Error('词块格式不正确。');
      return {...token, attach_left: token.kind === 'particle'};
    });
    const literal = text => String(text || '').normalize('NFKC').trim();
    return rows.map((token,index) => {
      const source = sources?.get(token?.card_id), next = rows[index + 1];
      if (token?.kind === 'word' && source?.kind === 'word' && next?.kind === 'particle' && (/noun|名词|명사|^n\.?$/i.test(source.pos || '') || !source.pos && !literal(source.text).endsWith('다')) && literal(token.text) === literal(source.text) + literal(next.text)) return {...token,text:source.text};
      return token;
    });
  }
  function normalizeAIAuxiliary(auxiliary, tokens) {
    if (!Array.isArray(auxiliary)) return auxiliary;
    const known = new Set(tokens.filter(token => token.card_id !== null).map(token => token.text)), unknown = new Set(tokens.filter(token => token.card_id === null).map(token => token.text));
    return auxiliary.filter(row => !row || typeof row.text !== 'string' || !row.text.trim() || typeof row.meaning_en !== 'string' && row.meaning_en !== undefined || typeof row.explanation_zh !== 'string' && row.explanation_zh !== undefined || !String(row.meaning_en || row.explanation_zh || '').trim() || !known.has(row.text) || unknown.has(row.text));
  }
  function validateTokens(tokens, sources, strictWords = true) {
    if (!Array.isArray(tokens) || !tokens.length || tokens.some(token => {
      if (!token || typeof token.text !== 'string' || !token.text.trim() || !['word', 'particle'].includes(token.kind) || token.attach_left !== (token.kind === 'particle')) return true;
      const surface = text => String(text || '').normalize('NFKC').trim().replace(/[.!?。！？]+$/, '');
      const card = sources.get(token.card_id), compatible = source => token.kind === 'word' ? source.kind === 'word' : source.kind === 'grammar' || source.kind === 'word' && surface(source.text) === surface(token.text);
      if (token.card_id === null) return [...sources.values()].some(source => compatible(source) && (surface(source.text) === surface(token.text) || strictWords && token.kind === 'word' && learnedSurface(source, surface(token.text))));
      if (!card || !compatible(card)) return true;
      if (!strictWords) return token.kind === 'word' && surface(card.text) !== surface(token.text) && (/\s/.test(surface(token.text)) || /noun|adverb|pronoun|numeral|determiner|interjection|名词|副词|代词|数词|冠词|感叹词|명사|부사|수사|관형사|감탄사|^(?:n|adv|pron|num|det|int)\.?$/i.test(card.pos || '') || !surface(card.text).endsWith('다'));
      if (token.kind !== 'word' || surface(card.text) === surface(token.text)) return false;
      return !learnedSurface(card, token.text);
    })) throw new Error('词块格式不正确。');
  }
  function learnedSurface(item, text) {
    const surface = value => String(value || '').normalize('NFKC').trim().replace(/[.!?。！？]+$/, ''), word = surface(item.text);
    text = surface(text);
    if (text === word) return true;
    if (originalFormUnits(item).some(unit => surface(unit.text) === text)) return true;
    if (/noun|adverb|pronoun|numeral|determiner|interjection|名词|副词|代词|数词|冠词|感叹词|명사|부사|수사|관형사|감탄사|^(?:n|adv|pron|num|det|int)\.?$/i.test(item.pos || '') || !/^[가-힣]+다$/.test(word)) return false;
    const stem = word.slice(0, -1), code = stem.charCodeAt(stem.length - 1) - 44032, vowel = Math.floor(code / 28) % 21, final = code % 28;
    const forms = new Set(['고', '고요', '지', '지요', '지만', '게', '아', '어', '아요', '어요', '았어요', '었어요'].map(ending => stem + ending));
    const bare = final === 8 ? stem.slice(0, -1) + String.fromCharCode(stem.charCodeAt(stem.length - 1) - final) : stem;
    [bare + '는', bare + '세요', bare + '셨어요', stem + (final && final !== 8 ? '으면' : '면'), stem + (final && final !== 8 ? '으면서' : '면서')].forEach(form => forms.add(form));
    (!final || final === 8 ? [bare.slice(0, -1) + String.fromCharCode(bare.charCodeAt(bare.length - 1) + 17) + '니다', bare.slice(0, -1) + String.fromCharCode(bare.charCodeAt(bare.length - 1) + 4), final === 8 ? stem : stem.slice(0, -1) + String.fromCharCode(stem.charCodeAt(stem.length - 1) + 8)] : ['습니다', '은', '을', '으세요', '으셨어요'].map(ending => stem + ending)).forEach(form => forms.add(form));
    const bases = new Set([stem + '아', stem + '어']);
    // shortcut: finite common forms mirror the backend; this is not complete morphology.
    if (!final) {
      if ([0, 1, 4, 5, 6].includes(vowel)) bases.add(stem);
      ({8: [9], 13: [14], 20: [6], 11: [10], 18: [0, 4]}[vowel] || []).forEach(next => bases.add(stem.slice(0, -1) + String.fromCharCode(44032 + code - code % 588 + next * 28)));
    }
    if (stem.endsWith('하')) bases.add(stem.slice(0, -1) + '해');
    const irregular = {듣다: '들어', 걷다: '걸어', 묻다: '물어', 싣다: '실어', 돕다: '도와', 곱다: '고와', 고맙다: '고마워', 춥다: '추워', 덥다: '더워', 어렵다: '어려워', 쉽다: '쉬워', 아름답다: '아름다워', 무겁다: '무거워', 가볍다: '가벼워', 낫다: '나아', 짓다: '지어', 붓다: '부어', 잇다: '이어', 모르다: '몰라', 부르다: '불러', 빠르다: '빨라', 다르다: '달라', 자르다: '잘라', 고르다: '골라', 흐르다: '흘러', 오르다: '올라', 푸다: '퍼', 그렇다: '그래', 이렇다: '이래', 저렇다: '저래', 어떻다: '어때', 파랗다: '파래', 하얗다: '하얘', 빨갛다: '빨개', 노랗다: '노래'};
    if (irregular[word]) bases.add(irregular[word]);
    let prospective = final === 8 ? stem : final ? stem + '을' : stem.slice(0, -1) + String.fromCharCode(stem.charCodeAt(stem.length - 1) + 8);
    if (irregular[word]) {
      if (final === 17) { const plain = stem.slice(0, -1) + String.fromCharCode(stem.charCodeAt(stem.length - 1) - 17); forms.add(plain + '운'); prospective = plain + '울'; }
      else if (final === 7) { const plain = irregular[word].slice(0, -1); forms.add(plain + '은'); prospective = plain + '을'; }
      else if (final === 19) { const plain = stem.slice(0, -1) + String.fromCharCode(stem.charCodeAt(stem.length - 1) - 19); forms.add(plain + '은'); prospective = plain + '을'; }
      else if (final === 27) { const plain = stem.slice(0, -1) + String.fromCharCode(stem.charCodeAt(stem.length - 1) - 27); forms.add(plain.slice(0, -1) + String.fromCharCode(plain.charCodeAt(plain.length - 1) + 4)); prospective = plain.slice(0, -1) + String.fromCharCode(plain.charCodeAt(plain.length - 1) + 8); }
    }
    forms.add(prospective); forms.add(stem + '겠습니다'); forms.add(prospective + '까요');
    if (!/adjective|形容词|형용사|^(?:adj)\.?$/i.test(item.pos || '')) forms.add(prospective + '게요');
    for (const base of bases) {
      ['', '요', '서', '도', '야'].forEach(ending => forms.add(base + ending));
      if (base.charCodeAt(base.length - 1) >= 44032 && base.charCodeAt(base.length - 1) <= 55203 && (base.charCodeAt(base.length - 1) - 44032) % 28 === 0) {
        const past = base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + 20);
        ['다', '어요', '고', '는데', '으면', '을'].forEach(ending => forms.add(past + ending));
      }
    }
    return forms.has(text);
  }
  function adoptExpansion(item, mode, content, context, targets = [item], units = sourceUnits(targets)) {
    if (mode === 'forms') units = [...units, ...originalFormUnits(item)];
    context = {local: [...composeCards(targets.filter(card => card.id !== item.id)), ...context.local], project: context.project || [], other: context.other};
    if (!content || typeof content !== 'object') throw new Error('整理内容格式不正确。');
    const sources = new Map([expansionCard(item), ...context.local, ...(context.project || []), ...context.other].map(card => [card.id, card]));
    const tokens = [], used = new Map(), errors = [];
    const adopted = mode === 'expressions' ? {phrase: '', phraseMeaning: '', sentence: '', sentenceMeaning: '', note: '', refs: {}, evidence: {}, origin: {}, auxiliary: []} : {intro: '', forms: [], refs: [], evidence: [], origin: [], complete: false, auxiliary: []};
    const rows = mode === 'expressions' ? ['phrase', 'sentence'].filter(part => content[part]).map(part => ({part, text: content[part], refs: content.refs?.[part], evidence: content.evidence?.[part], origin: content.origin?.[part] || 'source'})) : (content.forms || []).map((row, index) => ({part: 'form', index, text: row?.[0], row, refs: content.refs?.[index], evidence: content.evidence?.[index], origin: content.origin?.[index] || 'source'}));
    for (const entry of rows) try {
      const {text, evidence, origin, part, index, row} = entry;
      let refs = entry.refs;
      if (typeof text !== 'string' || !text.trim() || mode === 'forms' && (!Array.isArray(row) || row.length !== 3 || row.some(value => typeof value !== 'string'))) throw new Error('整理内容格式不正确。');
      if (!['source','ai'].includes(origin) || origin === 'ai' && evidence) throw new Error('内容来源标记不正确。');
      const unit = origin === 'source' ? validateEvidence(evidence, text, units) : null;
      if (refs === null && mode === 'forms') {
        if (/\s/.test(text.trim())) throw new Error('完整活用结构需要逐词引用及补充说明。');
        if (origin !== 'source' || (evidence.kind === 'dictionary' ? evidence.target_text !== item.text || !['word','conjugation','abbreviation'].includes(evidence.field) : !unit?.id.startsWith(item.id + ':original-form:'))) throw new Error('活用来源没有绑定当前词典形。');
      }
      else {
        if (origin === 'ai') refs = normalizeAITokens(refs, sources);
        validateTokens(refs, sources, false);
        if (cleanSentence(tokenText(refs)) !== cleanSentence(text) || !refs.some(token => token.card_id === item.id)) throw new Error('表达引用没有完整对应所选单词。');
        const auxiliary = (content.auxiliary || []).filter(word => refs.some(token => token.card_id === null && token.text === word.text));
        validateAuxiliary(refs, auxiliary);
      }
      if (mode === 'expressions') {
        const meaning = content[part + 'Meaning'];
        if (typeof meaning !== 'string' || origin === 'source' && meaning && (cleanSentence(text) !== cleanSentence(evidence.quote) || meaning !== evidence.meaning && meaning !== evidence.meaningZh)) throw new Error('译文没有对应来源。');
        adopted[part] = text; adopted[part + 'Meaning'] = meaning; adopted.refs[part] = refs; adopted.evidence[part] = evidence || null; adopted.origin[part] = origin;
      } else { adopted.forms.push([text, row[1], origin === 'ai' || row[2] && evidence.note?.includes(row[2]) ? row[2] : '']); adopted.refs.push(refs); adopted.evidence.push(evidence || null); adopted.origin.push(origin); }
      if (unit) used.set(unit.id, unit);
      if (refs) tokens.push(...refs);
    } catch (error) { errors.push({part: entry.part, ...(entry.index === undefined ? {} : {index: entry.index}), message: error.message}); }
    adopted.auxiliary = (content.auxiliary || []).filter(word => tokens.some(token => token.card_id === null && token.text === word.text));
    if (mode === 'forms') {
      adopted.complete = content.complete === true || adopted.forms.filter(row => cleanSentence(row[0]) !== cleanSentence(item.text)).length >= 2;
      if (adopted.origin.includes('ai') && typeof content.intro === 'string') adopted.intro = content.intro;
    }
    if (typeof content.note === 'string' && Object.values(adopted.origin).includes('ai')) adopted.note = content.note;
    return {content: adopted, references: referencedCards(tokens, [item], context), sources: [...used.values()], errors};
  }
  function validateExpansion(item, mode, content, context, targets = [item], units = sourceUnits(targets)) {
    const result = adoptExpansion(item, mode, content, context, targets, units);
    if (result.errors.length) throw new Error(result.errors.map(error => error.message).join('；'));
    if (!hasExpansion(result.content, mode)) throw new Error('没有可采用的来源内容。');
    return result.references;
  }
  function hasExpansion(content, mode) { return mode === 'expressions' ? !!(content?.phrase || content?.sentence) : !!content?.forms?.length; }
  function completeExpansion(content, mode) { return mode === 'expressions' ? !!(content?.phrase && content?.sentence) : content?.complete === true; }
  function missingExpansion(content, mode) { return mode === 'expressions' ? ['phrase','sentence'].filter(part => !content?.[part]) : completeExpansion(content,mode) ? [] : ['forms']; }
  function mergeExpansion(before, next, mode) {
    if (!before) return next;
    if (mode === 'expressions') {
      const result = {...next, refs: {...next.refs}, evidence: {...next.evidence}, origin: {...next.origin}};
      for (const part of ['phrase', 'sentence']) if (before[part]) { result[part] = before[part]; result[part + 'Meaning'] = before[part + 'Meaning']; result.refs[part] = before.refs?.[part]; result.evidence[part] = before.evidence?.[part]; result.origin[part] = before.origin?.[part] || 'source'; }
      if (before.note) result.note = before.note;
      result.auxiliary = [...new Map([...(before.auxiliary || []), ...(next.auxiliary || [])].map(word => [word.text, word])).values()]; return result;
    }
    const result = structuredClone(before);
    result.origin ||= result.forms.map(() => 'source'); result.refs ||= []; result.evidence ||= [];
    (next.forms || []).forEach((row, index) => { if (!result.forms.some(saved => saved[0] === row[0])) { result.forms.push(row); result.refs.push(next.refs[index]); result.evidence.push(next.evidence[index]); result.origin.push(next.origin?.[index] || 'source'); } });
    result.complete = before.complete === true || next.complete === true;
    result.auxiliary = [...new Map([...(before.auxiliary || []), ...(next.auxiliary || [])].map(word => [word.text, word])).values()]; return result;
  }
  SC.repairExpansionCache = () => {
    for (const key of Object.keys({...SC.data.expansionCache, ...SC.data.expansionSourceCache})) {
      const colon = key.indexOf(':'), mode = key.slice(0, colon), item = SC.data.items.find(row => row.id === key.slice(colon + 1));
      if (item && ['expressions', 'forms'].includes(mode)) expansionState(item, mode);
    }
  };
  function expansionState(item, mode) {
    const key = mode + ':' + item.id, fingerprint = expansionFingerprint(item), saved = SC.data.expansionSourceCache?.[key] || SC.data.expansionCache?.[key];
    const content = mode === 'expressions' ? item.expression : item.forms, error = SC.ui.expansionErrors?.[key]; let cached = null, invalid = '';
    if (saved && !content && !sameFingerprint(SC.data.expansionSuppressed?.[key], fingerprint)) {
      if (saved.error && sameFingerprint(saved.fingerprint, fingerprint)) invalid = generationFailure(saved.error, saved.provider, !sameFingerprint(error?.fingerprint, fingerprint));
      else if (saved.content) try {
        const old = JSON.parse(saved.fingerprint);
        if (JSON.stringify(old.card) !== JSON.stringify(expansionCard(item)) || JSON.stringify(saved.references || []) !== JSON.stringify(liveReferences(saved.references))) throw new Error('引用或原卡内容已改变。');
        const adopted = adoptExpansion(item, mode, saved.content, contextCards([item]));
        if (!hasExpansion(adopted.content, mode)) throw new Error(adopted.errors.map(error => error.message).join('；') || '缺少原句来源。');
        cached = {...saved, content: adopted.content, references: adopted.references, sources: adopted.sources};
        invalid = [...(saved.errors || []), ...adopted.errors].map(error => visibleGenerationMessage(error.message)).filter(Boolean).join('；');
      } catch (failure) { invalid = '已有内容暂不可用，请手动重试。原因：' + failure.message; }
    }
    return {key, fingerprint, content, cached, failedThisStrategy: !!saved?.error && strategyVersion(saved.fingerprint) === 8 && sameFingerprint(saved.fingerprint, fingerprint), error: invalid || (sameFingerprint(SC.data.expansionSuppressed?.[key], fingerprint) ? '整理内容已移除，批量重试不会恢复。' : typeof error === 'string' ? generationFailure(error) : sameFingerprint(error?.fingerprint, fingerprint) ? generationFailure(error.message, error.provider) : '') || ''};
  }
  function canConjugate(item) {
    return item.forms || /^(?:(?:auxiliary\s+)?(?:verb|adjective)|v\.?|adj\.?|动词|形容词|辅助动词|辅助形容词|동사|형용사)$/i.test((item.pos || '').trim()) || !item.pos && item.text.endsWith('다');
  }
  async function prepareExpansions(items, mode, force = false, recover = SC.route === mode || SC.route === 'combined' && SC.ui.combined?.active && SC.ui.combined.mode === mode) {
    const epoch = SC.ui.dataEpoch || 0;
    const eligible = items.filter(item => item.kind === 'word' && learned(item) && (mode !== 'forms' || canConjugate(item)));
    const waiting = eligible.map(item => ({item, state: expansionState(item, mode)})).filter(({state}) => !state.content && missingExpansion(state.cached?.content, mode).length && !sameFingerprint(SC.data.expansionSuppressed?.[state.key], state.fingerprint) && (force || !repairAttempted(state.key, state.fingerprint) && (recover || !state.error && !generationAttempted(state.key, state.fingerprint))) && !expansions.has(state.key));
    let configPromise;
    const groups = new Map(), batches = [];
    for (const row of waiting) {
      const book = SC.data.books.find(book => book.id === row.item.bookId), scope = book?.projectId || row.item.bookId;
      if (!groups.has(scope)) groups.set(scope, []);
      groups.get(scope).push(row);
    }
    for (const group of groups.values()) {
      let batch = [];
      for (const row of group) {
        if (batch.length && targetSize([...batch, row].map(({item}) => expansionCard(item))) > 35000) { batches.push(batch); batch = []; }
        batch.push(row);
      }
      if (batch.length) batches.push(batch);
    }
    for (const batch of batches) {
      let provider;
      const fail = (state, message) => { markRepairAttempt(state.key, state.fingerprint); (SC.ui.expansionErrors ||= {})[state.key] = {fingerprint: state.fingerprint, message, provider}; (SC.data.expansionSourceCache ||= {})[state.key] = state.cached ? {...state.cached, errors: [{message}], provider} : {fingerprint: state.fingerprint, references: [], error: message, provider}; };
      const stale = () => { for (const {item, state} of batch) if (SC.data.items.includes(item) && expansionFingerprint(item) === state.fingerprint) fail(state, '资料范围已改变，旧结果未采用，请手动重试。'); };
      const task = expansionSequences[mode].then(async () => {
        try {
          provider = providerFor(await (configPromise ||= practiceSettings()));
          if (epoch !== (SC.ui.dataEpoch || 0)) { stale(); return; }
          if (batch.every(({item, state}) => !SC.data.items.includes(item) || expansionFingerprint(item) !== state.fingerprint)) return;
          const context = contextCards(batch.map(({item}) => item)), targets = batch.map(({item}) => expansionCard(item)), units = sourceUnits(batch.map(({item}) => item));
          if (targetSize(targets) > 35000) throw new Error('所选单词卡内容过长，请缩小范围后手动重试。');
          batch.forEach(({state}) => { (SC.data.practiceGenerationAttempts ||= {})[state.key] = state.fingerprint; markRepairAttempt(state.key, state.fingerprint); });
          if (SC.persist() === false) throw new Error('浏览器未能保存自动准备状态，请释放存储空间后手动重试。');
          const missing_parts = Object.fromEntries(batch.map(({item,state}) => [item.id,missingExpansion(state.cached?.content,mode)])), existing_forms = mode === 'forms' ? Object.fromEntries(batch.map(({item,state}) => [item.id,(state.cached?.content.forms || []).map(row => row[0])])) : undefined;
          const payload = await practiceRequest('/api/practice/expand', {cards: targets, context_cards: requestContext(context), source_units: units, mode, missing_parts, ...(existing_forms ? {existing_forms} : {}), ...(force ? {force: true} : {})}, 100000);
          if (epoch !== (SC.ui.dataEpoch || 0)) { stale(); return; }
          if (!Array.isArray(payload?.results) || payload.errors !== undefined && !Array.isArray(payload.errors)) throw new Error('整理结果的列表格式不正确。');
          for (const {item, state} of batch) {
            if (!SC.data.items.includes(item) || expansionFingerprint(item) !== state.fingerprint) continue;
            try {
              const matches = payload.results.filter(row => row?.card_id === item.id);
              if (matches.length > 1) throw new Error('这张卡返回了重复结果，请手动重试。');
              const content = matches[0]?.[mode === 'expressions' ? 'expression' : 'forms'];
              const sourceErrors = sourceMessages(payload, [item]).map(message => ({part: 'source', message}));
              if (!content) throw new Error([...sourceErrors, ...(payload.errors || []).filter(row => row?.card_id === item.id)].map(row => row.message).filter(Boolean).join('；') || payload.reason || '没有可直接采用的来源内容，请手动重试。');
              const adopted = adoptExpansion(item, mode, content, context, targets, sourceUnits(batch.map(({item}) => item)));
              const merged = mergeExpansion(state.cached?.content, adopted.content, mode), checked = adoptExpansion(item, mode, merged, context, targets);
              if (!hasExpansion(checked.content, mode)) throw new Error([...adopted.errors, ...sourceErrors, ...(payload.errors || []).filter(row => row?.card_id === item.id)].map(row => row.message).join('；') || '没有可采用的来源内容。');
              const {references, sources} = checked, fingerprint = expansionFingerprint(item, references, sources);
              if (fingerprint !== expansionFingerprint(item, liveReferences(references), liveSources(sources))) throw new Error('引用卡片或原句已修改，请批量重试。');
              const errors = [...adopted.errors, ...(!completeExpansion(checked.content,mode) ? sourceErrors : []), ...(payload.errors || []).filter(row => row?.card_id === item.id)];
              (SC.data.expansionSourceCache ||= {})[state.key] = {fingerprint, references, sources, content: checked.content, errors, provider}; delete SC.ui.expansionErrors?.[state.key];
            } catch (error) { fail(state, error.message || '这张卡整理失败。'); }
          }
          SC.persist();
        } catch (error) { for (const {item, state} of batch) if (epoch === (SC.ui.dataEpoch || 0) && SC.data.items.includes(item) && expansionFingerprint(item) === state.fingerprint) fail(state, error.message || '整理暂时失败。'); }
        finally {
          batch.forEach(({state}) => expansions.delete(state.key));
          SC.persist();
          if (SC.route === mode || SC.route === 'combined' && SC.ui.combined?.active && SC.ui.combined.mode === mode) {
            const active = document.activeElement, selectorId = mode === 'forms' ? 'formWord' : 'expressionWord';
            const target = SC.root?.contains(active) && active.matches('.house-select,.expression-content,.form-root,.form-row,.empty-state') ? active : null;
            renderExpansionFocused(SC.root, selectorId, target);
          }
        }
      });
      batch.forEach(({state}) => expansions.set(state.key, task)); expansionSequences[mode] = task.catch(() => {});
    }
    return Promise.all(eligible.map(item => expansions.get(expansionState(item, mode).key)).filter(Boolean));
  }
  const expansionQueues = new Map();
  SC.prepareStudyExtensions = items => {
    const words = items.filter(item => item.kind === 'word' && learned(item));
    const signature = JSON.stringify(words.map(expansionCard));
    if (expansionQueues.has(signature)) return expansionQueues.get(signature);
    const task = Promise.all(['expressions', 'forms'].map(mode => prepareExpansions(mode === 'forms' ? words.filter(canConjugate) : words, mode, false, false))).finally(() => expansionQueues.delete(signature));
    expansionQueues.set(signature, task); return task;
  };
  const prepareExpansion = (item, mode, force = false) => prepareExpansions([item], mode, force);
  function expansionToolbar(items, item, selectorId, mode) {
    const failed = items.map(row => ({item: row, state: expansionState(row, mode)})).filter(({state}) => state.error && !state.content);
    return `<div class="practice-toolbar">${selector(items, item, selectorId)}</div>${failed.length ? `<section class="expansion-failures" role="status" tabindex="0" aria-label="整理失败，右键批量重试"><p>本批 ${failed.length} 张卡片仍有缺失；可用内容已保留。右键可重试缺失部分。</p><ul>${failed.map(({item, state}) => `<li><span class="ko">${SC.esc(item.text)}</span> — ${SC.esc(state.error)}</li>`).join('')}</ul></section>` : ''}`;
  }
  function practiceExtraEntries(view, items, item, target, mode) {
    if (!items.length) return [];
    const begin = action => {
      const stage = target?.closest('[data-stage]')?.dataset.stage, form = target?.dataset.form;
      const focusSelector = stage !== undefined ? `[data-stage="${stage}"] .expression-content` : form !== undefined ? `[data-form="${form}"]` : target?.dataset.token ? `[data-token="${CSS.escape(target.dataset.token)}"]` : target?.matches('.form-root') ? '.form-root' : target?.matches('.sentence-workspace') ? '.sentence-workspace' : '.empty-state';
      const batch = SC.ui.supplementBatch = {action, mode, frame: view.dataset.practiceFrame, selected: [item?.id || items[0].id], target, focusSelector};
      drawPracticeExtra(view, items, batch);
      view.querySelector('[data-practice-extra]')?.focus({preventScroll: true});
    };
    return item ? [{label: item.extraPractice ? '移出再记一遍' : '加入再记一遍', icon: 'reviewRepeat', fn: () => begin(item.extraPractice ? 'extra-remove' : 'extra-add')}] : [{label: '选择本题源卡加入再记一遍', icon: 'reviewRepeat', fn: () => begin('extra-add')}, {label: '选择本题源卡移出再记一遍', icon: 'reviewRepeat', fn: () => begin('extra-remove')}];
  }
  function drawPracticeExtra(view, items, batch) {
    view.querySelector('.practice-extra-batch')?.remove();
    if (batch.frame !== view.dataset.practiceFrame) { if (SC.ui.supplementBatch === batch) SC.ui.supplementBatch = null; return; }
    const rows = [...new Map(items.filter(item => SC.data.items.includes(item) && ['word', 'grammar'].includes(item.kind)).map(item => [item.id, item])).values()];
    batch.selected = batch.selected.filter(id => rows.some(item => item.id === id));
    const panel = document.createElement('section'); panel.className = 'practice-extra-batch';
    (view.querySelector('.practice-toolbar,.practice-topline') || view.firstElementChild)?.insertAdjacentElement('afterend', panel);
    const done = () => {
      if (SC.ui.supplementBatch === batch) SC.ui.supplementBatch = null;
      panel.remove(); (batch.target?.isConnected ? batch.target : view.querySelector(batch.focusSelector))?.focus({preventScroll: true});
    };
    batch.cancel = done;
    const draw = () => {
      const label = batch.action === 'extra-add' ? '加入再记一遍' : '移出再记一遍';
      panel.innerHTML = SC.batchToolbar({action: batch.action, label, count: batch.selected.length, all: !!rows.length && rows.every(item => batch.selected.includes(item.id)), partial: !!batch.selected.length && batch.selected.length < rows.length, prefix: 'practiceExtra'}) + `<div class="collection-results">${rows.map(item => `<label class="field"><input type="checkbox" data-practice-extra="${SC.esc(item.id)}"${batch.selected.includes(item.id) ? ' checked' : ''}>${SC.esc(item.text)} · ${SC.esc(item.kind === 'grammar' ? '语法卡' : '单词卡')}</label>`).join('')}</div>`;
      panel.querySelector('#practiceExtra-All').onchange = event => { batch.selected = event.target.checked ? rows.map(item => item.id) : []; draw(); };
      panel.querySelector('#practiceExtra-Cancel').onclick = done;
      panel.querySelector('#practiceExtra-Execute').onclick = () => {
        if (SC.ui.supplementBatch !== batch) return;
        const ids = batch.selected.filter(id => SC.data.items.some(item => item.id === id));
        if (batch.action === 'extra-add') SC.markExtra(ids, true, done);
        else { SC.removeExtra(ids, done); SC.$('#dialog').addEventListener('close', () => { if (panel.isConnected) done(); }, {once: true}); }
      };
      panel.querySelectorAll('[data-practice-extra]').forEach(input => { input.onchange = () => { const ids = new Set(batch.selected); input.checked ? ids.add(input.dataset.practiceExtra) : ids.delete(input.dataset.practiceExtra); batch.selected = [...ids]; draw(); panel.querySelector(`[data-practice-extra="${CSS.escape(input.dataset.practiceExtra)}"]`)?.focus({preventScroll: true}); }; });
    };
    draw();
  }
  document.addEventListener('keydown', event => {
    const batch = SC.ui.supplementBatch;
    if (event.key === 'Escape' && batch?.action?.startsWith('extra-') && !document.querySelector('dialog[open]') && SC.$('#contextMenu').hidden) { event.preventDefault(); event.stopImmediatePropagation(); batch.cancel?.(); }
  }, true);
  function wireExpansion(view, items, selectorId, mode, options) {
    const select = view.querySelector('#' + selectorId), toolbar = select.closest('.practice-toolbar'), route = SC.route, projectId = SC.projectId;
    view.dataset.practiceFrame = (view.dataset.expansionScope || route + ':' + projectId) + ':' + mode + ':' + select.value;
    const renderFocused = target => renderExpansionFocused(view, selectorId, target || select, true);
    const nextWord = target => {
      if (!select.isConnected || SC.route !== route || SC.projectId !== projectId || SC.ui.supplementBatch) return;
      const queue = expansionItems(mode, options);
      if (queue.length < 2) return;
      const index = Math.max(0, queue.findIndex(item => item.id === select.value));
      SC.stopSpeech(); SC.ui[selectorId] = queue[(index + 1) % queue.length].id; renderFocused(target);
    };
    select.onchange = event => { if (SC.ui.supplementBatch?.action?.startsWith('extra-')) SC.ui.supplementBatch.cancel?.(); SC.ui[selectorId] = event.target.value; renderFocused(); };
    SC.houseSelects?.();
    toolbar.onkeydown = event => {
      if (event.key !== 'Enter') return;
      const button = event.target.closest('.house-select');
      if (event.target !== toolbar && event.target !== select && button?.previousElementSibling !== select) return;
      if (!keyAllowed(event, select) || SC.ui.supplementBatch) { if (button && !event.defaultPrevented) event.preventDefault(); return; }
      event.preventDefault(); event.stopPropagation(); nextWord();
    };
    const retry = () => { for (const item of items) delete SC.ui.expansionErrors?.[mode + ':' + item.id]; prepareExpansions(items, mode, true); SC.render(); };
    const current = items.find(item => item.id === select.value);
    [view.querySelector('.practice-toolbar'), view.querySelector('.expansion-failures'), view.querySelector('.empty-state')].filter(Boolean).forEach(element => { if (element.matches('.empty-state')) element.dataset.studyId = current.id; SC.manage?.(element, () => [{label: '批量重试缺失内容', fn: retry}, ...practiceExtraEntries(view, items, current, element, mode)]); });
    const batch = SC.ui.supplementBatch, item = items.find(item => item.id === batch?.itemId);
    if (batch?.mode === mode && batch.action?.startsWith('extra-')) drawPracticeExtra(view, items, batch);
    else if (item && batch.mode === mode) {
      const content = expansionState(item, mode), count = !batch.original && mode === 'forms' ? (content.content || content.cached?.content)?.forms.length || 0 : 1;
      view.querySelector('.practice-toolbar').insertAdjacentHTML('afterend', SC.batchToolbar({action: 'delete', label: batch.original ? '删除所选单词卡' : '删除所选整理内容', count: batch.selected.length, all: batch.selected.length === count, partial: batch.selected.length > 0 && batch.selected.length < count, prefix: 'supplements'}));
      view.querySelector('#supplements-All').onchange = event => { batch.selected = event.target.checked ? Array.from({length: count}, (_, index) => index) : []; SC.render(); };
      view.querySelector('#supplements-Cancel').onclick = () => { SC.ui.supplementBatch = null; SC.render(); };
      view.querySelector('#supplements-Execute').onclick = () => batch.original ? SC.deleteCards([item.id], () => { SC.ui.supplementBatch = null; SC.render(); }) : removeSupplement(item, mode, batch.selected);
      view.querySelectorAll('[data-supplement-select]').forEach(input => {
        input.onclick = event => event.stopPropagation();
        input.onchange = () => { const ids = new Set(batch.selected), index = Number(input.dataset.supplementSelect); input.checked ? ids.add(index) : ids.delete(index); batch.selected = [...ids]; SC.render(); };
      });
    }
    return nextWord;
  }
  function beginSupplementDelete(item, mode, index = 0, original = false) { SC.ui.supplementBatch = {itemId: item.id, mode, original, selected: [index]}; SC.render(); }
  function supplementSelect(item, mode, index, original = false) {
    const batch = SC.ui.supplementBatch;
    return !batch?.action && batch?.itemId === item.id && batch.mode === mode && !!batch.original === original ? `<label class="note-select"><input type="checkbox" data-supplement-select="${index}"${batch.selected.includes(index) ? ' checked' : ''} aria-label="选择${original ? '这个单词' : mode === 'forms' ? '这条活用' : '这组表达'}"></label>` : '';
  }
  function removeSupplement(item, mode, index) {
    const key = mode === 'forms' ? 'forms' : 'expression', state = expansionState(item, mode), content = state.content || state.cached?.content;
    if (!content || !SC.data.items.includes(item)) return;
    SC.confirmDelete({title: mode === 'forms' ? '删除活用内容' : '删除表达内容', message: '只删除这部分整理内容，原单词和学习记录保留。', onConfirm: () => {
      SC.ui.dataEpoch = (SC.ui.dataEpoch || 0) + 1;
      const before = {manual: item[key], cache: SC.data.expansionSourceCache?.[state.key], error: SC.ui.expansionErrors?.[state.key], suppressed: SC.data.expansionSuppressed?.[state.key]};
      const indices = Array.isArray(index) ? index : Number.isInteger(index) ? [index] : [];
      if (mode === 'forms' && indices.length && indices.length < content.forms.length) {
        const record = structuredClone(content); record.forms = record.forms.filter((_, i) => !indices.includes(i)); if (record.refs) record.refs = record.refs.filter((_, i) => !indices.includes(i)); if (record.evidence) record.evidence = record.evidence.filter((_, i) => !indices.includes(i)); if (record.origin) record.origin = record.origin.filter((_, i) => !indices.includes(i)); item.forms = record;
      } else {
        delete item[key]; delete SC.data.expansionSourceCache?.[state.key];
        (SC.data.expansionSuppressed ||= {})[state.key] = state.fingerprint;
        (SC.ui.expansionErrors ||= {})[state.key] = {fingerprint: state.fingerprint, message: '整理内容已删除，右键可重新整理。'};
      }
      SC.ui.supplementBatch = null; SC.persist(); SC.render(); SC.toast('整理内容已删除，原卡片保留。', () => {
        if (!SC.data.items.includes(item)) return;
        before.manual === undefined ? delete item[key] : item[key] = before.manual;
        if (before.cache) (SC.data.expansionSourceCache ||= {})[state.key] = before.cache;
        before.error === undefined ? delete SC.ui.expansionErrors?.[state.key] : (SC.ui.expansionErrors ||= {})[state.key] = before.error;
        before.suppressed === undefined ? delete SC.data.expansionSuppressed?.[state.key] : (SC.data.expansionSuppressed ||= {})[state.key] = before.suppressed;
        SC.persist(); SC.render();
      });
    }});
  }
  const auxiliaryHTML = (auxiliary, className = 'practice-auxiliary') => auxiliary?.length ? `<div class="${className}"><span class="small muted">补充词与助词</span>${auxiliary.map(row => `<p><span class="ko">${SC.esc(row.text)}</span> — ${SC.esc(row.meaning_en || row.explanation_zh)}${row.meaning_en && row.explanation_zh ? ' · ' + SC.esc(row.explanation_zh) : ''}</p>`).join('')}</div>` : '';
  const evidenceHTML = (content, showQuote = true) => {
    const rows = Array.isArray(content?.evidence) ? content.evidence : Object.values(content?.evidence || {});
    const sources = [...new Map(rows.filter(Boolean).map(row => [row.source_id, row])).values()];
    const ai = Object.values(typeof content?.origin === 'string' ? {unit:content.origin} : content?.origin || {}).includes('ai');
    return sources.length || ai ? `<div class="practice-sources small muted">${sources.map(row => `<p>${row.kind === 'dictionary' ? `<a href="${SC.esc(row.url)}" target="_blank" rel="noopener noreferrer">${SC.esc(row.title || '韩国语基础词典')}</a>${row.license ? ' · ' + SC.esc(row.license) : ''}` : '来源：已保存原句'}${showQuote ? `<span class="ko"> · ${SC.esc(row.quote)}</span>` : ''}</p>`).join('')}${ai ? '<p>AI 生成</p>' : ''}</div>` : '';
  };
  function pendingExpansion(view, items, item, selectorId, mode, options) {
    const state = expansionState(item, mode), message = state.error || '正在整理' + (mode === 'expressions' ? '表达…' : '活用…');
    view.innerHTML = expansionToolbar(items, item, selectorId, mode) + `<div class="empty-state"><p class="ko">${SC.esc(item.text)}</p><p role="status">${SC.esc(message)}</p></div>`;
    const nextWord = wireExpansion(view, items, selectorId, mode, options);
    clickableContent(view.querySelector('.empty-state'), () => SC.toggleSpeech([{text: item.text, lang: 'ko'}], `${mode}:${item.id}:word`), () => SC.editItem(item), nextWord);
  }
  function expressionPage(view, options, announce = true) {
    const items = expansionItems('expressions', options);
    if (!items.length) return empty(view);
    prepareExpansions(items, 'expressions');
    const item = chooseWord(items, 'expressionWord');
    const state = expansionState(item, 'expressions'), content = state.content || state.cached?.content;
    if (!content) return pendingExpansion(view, items, item, 'expressionWord', 'expressions', options);
    const stages = [{text: item.text, meaning: SC.studyMeaning(item), label: '单词'}, {text: content.phrase, meaning: content.phraseMeaning, label: '搭配'}, {text: content.sentence, meaning: content.sentenceMeaning, label: '短句', sentence: true}].filter(stage => stage.text);
    view.innerHTML = expansionToolbar(items, item, 'expressionWord', 'expressions') + `<div class="expression-layout"><section class="expression-main">${supplementSelect(item, 'expressions', 0)}${supplementSelect(item, 'expressions', 0, true)}<div class="expression-chain">${stages.map((stage, index) => `<section class="expression-stage" data-stage="${index}"><span class="expression-stage-label">${stage.label}</span><div class="expression-content" tabindex="0" role="button" aria-label="点击或 Space 朗读${stage.label}；Enter 下一词；双击修改"><p class="ko">${SC.esc(stage.text)}</p>${stage.meaning ? `<p class="meaning">${SC.esc(stage.meaning)}</p>` : ''}</div></section>`).join('')}</div></section>${content.note || content.auxiliary?.length || content.evidence ? `<aside class="practice-note">${content.note ? `<p>${SC.esc(content.note)}</p>` : ''}${auxiliaryHTML(content.auxiliary)}${evidenceHTML(content)}</aside>` : ''}</div>`;
    const nextWord = wireExpansion(view, items, 'expressionWord', 'expressions', options);
    const edit = () => SC.editFields('修改表达', [
      {key: 'phrase', label: '韩语搭配', value: content.phrase}, {key: 'phraseMeaning', label: '英文意思', value: content.phraseMeaning},
      {key: 'sentence', label: '韩语短句', value: content.sentence}, {key: 'sentenceMeaning', label: '英文译文', value: content.sentenceMeaning},
      {key: 'note', label: '中文注释', value: content.note, type: 'textarea'}
    ], values => { item.expression = {...content, ...values}; SC.persist(); SC.render(); });
    view.querySelectorAll('.expression-content').forEach((element, index) => {
      element.dataset.studyId = item.id;
      const editContent = index === 0 ? () => SC.editItem(item) : edit, remove = index === 0 ? () => SC.deleteCards([item.id], () => SC.render()) : () => removeSupplement(item, 'expressions');
      clickableContent(element, () => SC.toggleSpeech([{text: stages[index].text, lang: 'ko', sentence: stages[index].sentence === true}], `expression:${item.id}:${index}`), editContent, nextWord);
      SC.manage?.(element, () => [...(stages[index].meaning ? [{label: '朗读释义', fn: () => SC.toggleSpeech([{text: stages[index].meaning, lang: /[\u4e00-\u9fff]/.test(stages[index].meaning) ? 'zh' : 'en'}], `expression:${item.id}:${index}:meaning`)}] : []), {label: index ? '修改表达' : '编辑单词卡', fn: editContent}, ...practiceExtraEntries(view, items, item, element, 'expressions'), {label: index ? '删除表达内容' : '删除单词卡', fn: () => beginSupplementDelete(item, 'expressions', 0, index === 0)}], remove);
    });
    if (announce) SC.speakSequence([{text: stages[0].text, lang: 'ko'}], `expression:${item.id}:0`);
  }
  function formsPage(view, options, announce = true) {
    const items = expansionItems('forms', options);
    if (!items.length) {
      view.innerHTML = '<div class="empty-state"><p>这个项目还没有带释义的动词或形容词。</p><p class="muted">保存相关词汇后，会自动汇总到这里。</p></div>';
      return;
    }
    prepareExpansions(items, 'forms');
    const item = chooseWord(items, 'formWord');
    const state = expansionState(item, 'forms'), record = state.content || state.cached?.content;
    if (!record) return pendingExpansion(view, items, item, 'formWord', 'forms', options);
    view.innerHTML = expansionToolbar(items, item, 'formWord', 'forms') + `<div class="form-map"><div class="form-root">${supplementSelect(item, 'forms', 0, true)}<h2 class="ko">${SC.esc(item.text)}</h2><p class="meaning">${SC.esc(SC.studyMeaning(item))}</p>${record.intro ? `<p class="form-intro">${SC.esc(record.intro)}</p>` : ''}</div><div class="form-branches">${record.forms.map((row, index) => `<section class="form-row" data-form="${index}" tabindex="0" role="button" aria-label="点击或 Space 朗读 ${SC.esc(row[0])}；Enter 下一词；双击修改">${supplementSelect(item, 'forms', index)}${row[1] ? `<span class="form-label">${SC.esc(row[1])}</span>` : ''}<h2 class="ko">${SC.esc(row[0])}</h2>${row[2] ? `<p>${SC.esc(row[2])}</p>` : ''}</section>`).join('')}</div></div>${auxiliaryHTML(record.auxiliary)}${evidenceHTML(record)}`;
    const nextWord = wireExpansion(view, items, 'formWord', 'forms', options);
    const root = view.querySelector('.form-root'); root.dataset.studyId = item.id;
    SC.manage?.(root, () => [...(SC.studyMeaning(item) ? [{label:'朗读释义',fn:()=>SC.toggleSpeech([{text:SC.studyMeaning(item),lang:/[\u3400-\u9fff]/.test(SC.studyMeaning(item))?'zh':'en'}],`form:${item.id}:meaning`)}] : []), {label: '编辑单词卡', fn: () => SC.editItem(item)}, ...practiceExtraEntries(view, items, item, root, 'forms'), {label: '删除单词卡', fn: () => beginSupplementDelete(item, 'forms', 0, true)}], () => SC.deleteCards([item.id], () => SC.render()));
    clickableContent(view.querySelector('.form-root'), () => SC.toggleSpeech([{text: item.text, lang: 'ko'}], `form:${item.id}:word`), () => SC.editItem(item), nextWord);
    if (!record) return;
    view.querySelectorAll('[data-form]').forEach(element => {
      element.dataset.studyId = item.id;
      const index = Number(element.dataset.form);
      const row = record.forms[index];
      const edit = () => SC.editFields('修改活用', [{key: 'text', label: '韩语形式', value: row[0]}, {key: 'label', label: '情况', value: row[1]}, {key: 'note', label: '中文注释', value: row[2], type: 'textarea'}], values => {
        record.forms[index] = [values.text, values.label, values.note]; item.forms = record; SC.persist(); SC.render();
      });
      clickableContent(element, () => SC.toggleSpeech([{text: row[0], lang: 'ko'}], `form:${item.id}:${index}`), edit, nextWord);
      SC.manage?.(element, () => [{label: '修改活用', fn: edit}, ...practiceExtraEntries(view, items, item, element, 'forms'), {label: '删除活用内容', fn: () => beginSupplementDelete(item, 'forms', index)}], () => removeSupplement(item, 'forms', index));
    });
    if (announce) SC.speak(record.forms[0][0], 'ko', `form:${item.id}:0`);
  }

  function cleanSentence(text) { return String(text || '').normalize('NFKC').replace(/[.!?。！？]/g, '').replace(/\s+/g, ' ').trim(); }
  const composeFields = ['id', 'kind', 'text', 'meaning', 'meaningZh', 'pos', 'example', 'translation', 'explanation', 'formation', 'note', 'original_note'];
  function composeCards(cards) { return cards.map(item => Object.fromEntries(composeFields.map(key => [key, String(item.kind === 'word' && key === 'meaning' ? item.meaning ? SC.studyMeaning(item) : '' : item.kind === 'word' && key === 'meaningZh' ? item.meaning ? '' : SC.studyMeaning(item) : item[key] || '')]))); }
  const composeFingerprint = (cards, references = [], sources = []) => JSON.stringify({version: 7, cards: composeCards(cards), references, sources});
  function sentenceText(question, ids) {
    const lookup = new Map(question.tokens.map(token => [token.id, token]));
    return ids.reduce((text, id) => { const token = lookup.get(id); return token ? text + (text && !token.attach_left ? ' ' : '') + token.text : text; }, '');
  }
  function checkSentence(question, answer) {
    return question.answers.some(ids => cleanSentence(sentenceText(question, ids)) === cleanSentence(answer));
  }
  function offlineQuestions(cards, context = {local: [], other: []}) {
    const words = cards.filter(card => card.kind === 'word'), available = [...cards, ...context.local, ...(context.project || []), ...context.other];
    const grammar = available.filter(card => card.kind === 'grammar');
    const questions = [];
    for (const preset of exercises) {
      const matches = preset.words.map(([text, meaning]) => words.filter(card => card.text === text && meaning.test(String(card.meaning || '').trim().replace(/[.!]$/, ''))));
      const point = preset.grammar ? grammar.find(card => String(card.text).replace(/\s/g, '').includes(preset.grammar)) : null;
      if (matches.some(rows => !rows.length) || preset.grammar && !point) continue;
      for (const first of matches[0]) {
        const selected = [first, ...matches.slice(1).map(rows => rows.find(card => card.bookId === first.bookId) || rows[0])];
        const pronoun = available.find(card => card.kind === 'word' && card.text === '저' && /\bI\b|\bme\b/i.test(card.meaning || ''));
        const tokenRows = [...preset.pieces, ...preset.extras];
        const tokens = tokenRows.map(([text, source], index) => ({id: String(index), text, kind: source === 'particle' ? 'particle' : 'word', attach_left: source === 'particle', card_id: source === 'particle' ? grammar.find(card => String(card.text).replace(/^[nva]\s*[+＋]\s*/i, '').replace(/^-/, '').replace(/\s/g, '').split('/').includes(text))?.id || null : selected.find(card => card.text === source)?.id || (text === '저' ? pronoun?.id || null : null)}));
        const sources = [...new Set([...tokens.map(token => token.card_id).filter(Boolean), ...(point ? [point.id] : [])])];
        const particles = {은: '接在有收音名词后的话题助词。', 는: '接在无收音名词后的话题助词。', 을: '接在有收音名词后的宾格助词。', 를: '接在无收音名词后的宾格助词。', 에: '表示移动目的地。', 에서: '表示动作发生地点。', 이: '接在有收音名词后的主格助词。', 가: '接在无收音名词后的主格助词。'};
        const auxiliary = [...new Map(tokens.filter(token => token.card_id === null).map(token => [token.text, token.kind === 'particle' ? {text: token.text, explanation_zh: particles[token.text]} : {text: token.text, meaning_en: token.text === '싶어요' ? 'want (polite)' : 'I (polite)', explanation_zh: token.text === '싶어요' ? '表达想做某事，日常礼貌体。' : '礼貌表达中的“我”。'}])).values()];
        questions.push({id: 'offline:' + preset.id + ':' + sources.join(':'), target_en: preset.goal, tokens, answers: preset.answers.map(ids => ids.map(String)), explanation_zh: preset.note, auxiliary, source_ids: sources, verification: '内置练习'});
      }
    }
    const pools = new Map();
    for (const question of questions) {
      const card = cards.find(item => item.id === question.source_ids[0]);
      const book = SC.data.books.find(row => row.id === card?.bookId);
      const scope = book?.projectId || card?.bookId;
      if (!pools.has(scope)) pools.set(scope, []);
      pools.get(scope).push(question);
    }
    const mixed = [], queues = [...pools.values()];
    for (let index = 0; queues.some(queue => index < queue.length); index++) for (const queue of queues) if (queue[index]) mixed.push(queue[index]);
    return mixed;
  }
  function validateQuestions(questions, cards, context = {local: [], other: []}, units = sourceUnits(cards)) {
    const sources = new Map([...cards, ...context.local, ...(context.project || []), ...context.other].map(card => [card.id, card])), sourceIds = new Set(sources.keys()), targetIds = new Set(cards.map(card => card.id));
    if (!Array.isArray(questions)) throw new Error('组题结果格式不正确。');
    questions = questions.map(question => {
      if (question?.origin !== 'ai') return question;
      const seen = new Set(), answers = Array.isArray(question.answers) ? question.answers.filter(answer => {
        if (!Array.isArray(answer)) return true;
        const key = JSON.stringify(answer); if (seen.has(key)) return false;
        seen.add(key); return true;
      }) : question.answers;
      const tokens = normalizeAITokens(question.tokens, sources);
      return {...question, tokens, answers, auxiliary:Array.isArray(tokens) && tokens.every(token => token && typeof token === 'object') ? normalizeAIAuxiliary(question.auxiliary,tokens) : question.auxiliary};
    });
    for (const question of questions) {
      if (!question || !question.id || typeof question.target_en !== 'string' || !question.target_en.trim() || !Array.isArray(question.tokens) || question.tokens.length < 2 || !Array.isArray(question.answers) || !question.answers.length || !Array.isArray(question.source_ids) || !question.source_ids.length || question.source_ids.some(id => !sourceIds.has(id)) || !Array.isArray(question.auxiliary)) throw new Error('组题结果不属于所选卡片或格式不正确。');
      validateTokens(question.tokens, sources, false);
      const ids = new Set(question.tokens.map(token => token.id));
      if (ids.size !== question.tokens.length || question.tokens.some(token => typeof token.id !== 'string' || !token.id.trim())) throw new Error('词块格式不正确。');
      if (question.answers.some(answer => !Array.isArray(answer) || answer.length < 2 || new Set(answer).size !== answer.length || answer.some(id => !ids.has(id)) || question.tokens.find(token => token.id === answer[0]).attach_left || new Set(answer.map(id => cleanSentence(question.tokens.find(token => token.id === id).text))).size < 2)) throw new Error('答案词块不完整。');
      const origin = question.origin || 'source';
      if (!['source','ai'].includes(origin) || origin === 'ai' && question.evidence) throw new Error('题目来源标记不正确。');
      if (origin === 'source') {
        validateEvidence(question.evidence, sentenceText(question, question.answers[0]), units);
        if (cleanSentence(sentenceText(question, question.answers[0])) !== cleanSentence(question.evidence.quote)) throw new Error('答案不能还原完整来源原句。');
        if (question.target_en && question.target_en !== question.evidence.meaning && question.target_en !== question.evidence.meaningZh) throw new Error('题干译文没有对应来源。');
      } else if (typeof question.sentence_ko !== 'string' || !question.sentence_ko.trim() || cleanSentence(sentenceText(question,question.answers[0])) !== cleanSentence(question.sentence_ko)) throw new Error('答案不能还原参考句。');
      if (!question.answers[0].some(id => targetIds.has(question.tokens.find(token => token.id === id).card_id))) throw new Error('题目没有练习所选卡片。');
      if (question.answers.some(answer => answer.some(id => { const ref = question.tokens.find(token => token.id === id).card_id; return ref !== null && !question.source_ids.includes(ref); }))) throw new Error('题目来源缺少参考答案所用卡片。');
      validateAuxiliary(question.tokens, question.auxiliary);
    }
    return questions;
  }
  function checkedQuestions(rows, cards, context) {
    const questions = [], errors = [], ids = new Set();
    if (!Array.isArray(rows)) return {questions, errors: ['组题结果格式不正确。']};
    for (const question of rows) try {
      if (ids.has(question?.id)) throw new Error('题目标识重复。');
      const checked = validateQuestions([question], cards, context)[0]; ids.add(checked.id); questions.push(checked);
    } catch (error) { errors.push(error.message); }
    return {questions, errors};
  }
  function mergeQuestions(first, second, count = Infinity) {
    const questions = [], ids = new Set(), seen = new Set();
    for (const question of [...first, ...second]) {
      const key = (question.evidence?.source_id || cleanSentence(question.target_en)) + ':' + cleanSentence(sentenceText(question, question.answers[0]));
      if (!seen.has(key) && !ids.has(question.id)) { questions.push(question); seen.add(key); ids.add(question.id); }
    }
    return questions.slice(0, count);
  }
  function sentenceSeed(cards, count, scopeKey) {
    const context = contextCards(cards), cached = SC.data.composeSourceCache?.[scopeKey] || SC.data.composeCache?.[scopeKey];
    const attemptKey = 'compose:' + scopeKey + ':' + count, repairing = SC.route === 'sentence' || SC.route === 'combined' && SC.ui.combined?.active && SC.ui.combined.mode === 'sentence';
    let checked = {questions: [], errors: []}, message = '', attempted = repairAttempted(attemptKey, composeFingerprint(cards)) || !repairing && generationAttempted(attemptKey, composeFingerprint(cards)), matches = false;
    if (cached) {
      matches = sameFingerprint(cached.fingerprint, composeFingerprint(cards, liveReferences(cached.references), liveSources(cached.sources)));
      attempted ||= matches && cached.count === count && strategyVersion(cached.fingerprint) === 7 && cached.attempted === true;
      if (matches) checked = checkedQuestions(cached.questions, cards, context);
      else checked.errors.push('原卡或引用内容已改变。');
      message = [...new Set([cached.message, ...checked.errors].map(visibleGenerationMessage).filter(Boolean))].join('；');
      if (checked.errors.length) message = '已有题目暂不可用。原因：' + message;
    }
    const questions = mergeQuestions(checked.questions, [], count), references = referencedCards(questions.flatMap(question => [...question.tokens, ...question.source_ids.map(card_id => ({card_id}))]), cards, context), sources = questionSources(questions, sourceUnits(cards)), fingerprint = composeFingerprint(cards, references, sources);
    return {questions, references, sources, fingerprint, message: cached?.message && matches ? generationFailure(message, cached.provider, true) : message, attempted, provider: cached?.provider};
  }
  const questionSources = (questions, units) => units.filter(unit => questions.some(question => question.evidence?.source_id === 'saved:' + unit.id));
  function composeTargets(cards) {
    const shuffled = [...cards], selected = [];
    for (let index = shuffled.length - 1; index > 0; index--) { const next = Math.floor(Math.random() * (index + 1)); [shuffled[index], shuffled[next]] = [shuffled[next], shuffled[index]]; }
    for (const card of shuffled) {
      if (targetSize(composeCards([...selected, card])) <= 35000) selected.push(card);
    }
    return selected;
  }
  const composeRequests = new Map();
  async function buildSentenceRound(cards, count, scopeKey, fingerprint, options = {}) {
    const request = {}; composeRequests.set(scopeKey, request);
    try {
      const epoch = SC.ui.dataEpoch || 0;
      const context = contextCards(cards), snapshots = composeCards(cards), seed = sentenceSeed(cards, count, scopeKey), units = sourceUnits(cards);
      const known = mergeQuestions(options.questions || [], seed.questions, count), errors = []; let provider;
      if (known.length >= count) return {...seed, questions: known};
      if (!options.force && seed.attempted) return {...seed, questions: known};
      try {
        provider = providerFor(await practiceSettings());
        const targets = composeTargets(cards), ids = new Set(targets.map(card => card.id));
        if (!targets.length) throw new Error('所选卡片内容过长，请缩小范围后手动重试。');
        const requestCards = composeCards(targets), requestSources = {local: [...composeCards(cards.filter(card => !ids.has(card.id))), ...context.local], project: context.project || [], other: context.other};
        if (epoch !== (SC.ui.dataEpoch || 0) || cards.some(card => !SC.data.items.includes(card)) || JSON.stringify(snapshots) !== JSON.stringify(composeCards(cards))) return {questions: [], message: '所选卡片已删除或修改，旧题目未采用。', stale: true};
        markGenerationAttempt('compose:' + scopeKey + ':' + count, composeFingerprint(cards));
        const payload = await practiceRequest('/api/practice/compose', {cards: requestCards, context_cards: requestContext(requestSources), source_units: units, count: count - known.length, ...(options.force ? {force: true} : {})}, 130000);
        const checked = checkedQuestions(payload.questions, cards, context); errors.push(...checked.errors);
        if (checked.questions.length < count - known.length) errors.push(...sourceMessages(payload, cards));
        if (payload.errors !== undefined && !Array.isArray(payload.errors)) errors.push('组题错误状态格式不正确。');
        else errors.push(...(payload.errors || []).map(error => error?.message || '这道题未采用。'));
        if (payload.reason) errors.push(payload.reason);
        known.splice(0, known.length, ...mergeQuestions(known, checked.questions.map(question => ({...question, verification: question.origin === 'ai' ? 'AI 生成' : '来源原句'}))));
      } catch (error) { errors.push(error.message || '组题暂时失败'); }
      const questions = known.slice(0, count);
      const references = referencedCards(known.flatMap(question => [...question.tokens, ...question.source_ids.map(card_id => ({card_id}))]), cards, context);
      const sources = questionSources(known, units), preparedFingerprint = composeFingerprint(snapshots, references, sources);
      if (composeRequests.get(scopeKey) !== request) return {questions: [], message: '练习范围或题量已改变，旧题目未采用。', stale: true};
      if (epoch !== (SC.ui.dataEpoch || 0) || cards.some(card => !SC.data.items.includes(card)) || JSON.stringify(snapshots) !== JSON.stringify(composeCards(cards))) return {questions: [], message: '所选卡片已删除或修改，旧题目未采用。', stale: true};
      if (preparedFingerprint !== composeFingerprint(cards, liveReferences(references), liveSources(sources))) return {questions: [], message: '引用卡片或原句已修改，请重新准备题目。', stale: true};
      const message = [...new Set(errors)].join('；') || (questions.length < count ? '本轮仅取得 ' + questions.length + ' 道可用题目，可手动补充。' : '');
      const result = {questions, message, fingerprint: preparedFingerprint, references, sources, attempted: true, provider};
      markRepairAttempt('compose:' + scopeKey + ':' + count, composeFingerprint(cards));
      (SC.data.composeSourceCache ||= {})[scopeKey] = {...result, questions: known, count}; SC.persist();
      return result;
    } finally { if (composeRequests.get(scopeKey) === request) composeRequests.delete(scopeKey); }
  }
  SC.renderSentencePractice = (view, options) => {
    const cards = [...new Map(options.cards.filter(learned).map(card => [card.id, card])).values()];
    const count = Math.max(1, Math.floor(Number(options.count) || 10));
    const key = options.scopeKey || 'project:' + SC.projectId;
    SC.ui.sentenceRounds ||= {};
    let round = SC.ui.sentenceRounds[key];
    if (round && round.attempted === undefined && !round.pending) round.attempted = true;
    const references = round?.references || SC.data.composeSourceCache?.[key]?.references || [], sources = round?.sources || SC.data.composeSourceCache?.[key]?.sources || [], fingerprint = composeFingerprint(cards, liveReferences(references), liveSources(sources));
    if (!round || round.fingerprint !== fingerprint || round.count !== count) round = SC.ui.sentenceRounds[key] = {...sentenceSeed(cards, count, key), count, index: 0, pending: false, finished: false};
    view.innerHTML = '<div class="sentence-round"></div>';
    const mount = view.querySelector('.sentence-round');
    const refresh = () => { if (mount.isConnected && SC.ui.sentenceRounds[key] === round) { if (round.practice && round.questions.length && mount.querySelector('.sentence-workspace')) updateSentenceStatus(mount, round); else drawSentenceRound(mount, round, cards, key); } };
    const prepare = force => {
      if (round.pending) return round.promise;
      round.pending = true; round.attempted = true;
      round.promise = buildSentenceRound(cards, count, key, round.fingerprint, {questions: round.questions, force}).then(result => {
        if (SC.ui.sentenceRounds[key] !== round) return;
        if (result.stale) { round.message = result.message; if (cards.some(card => !SC.data.items.includes(card)) || round.fingerprint !== composeFingerprint(cards, liveReferences(round.references), liveSources(round.sources))) { round.questions = []; round.practice = null; } }
        else Object.assign(round, result);
      }).catch(error => { round.message = error.message || '组题失败，请手动重试。'; }).finally(() => { round.pending = false; refresh(); });
      refresh(); return round.promise;
    };
    round.retry = () => prepare(true);
    drawSentenceRound(mount, round, cards, key);
    if (!round.attempted && round.questions.length < count) prepare(false);
    else if (round.pending) round.promise.then(refresh);
  };
  function updateSentenceStatus(mount, round) {
    const status = mount.querySelector('.compose-notice'); if (!status) return;
    const spans = mount.querySelectorAll('.practice-topline > span'), exercise = round.questions[round.index];
    if (spans[0]) spans[0].textContent = (round.index + 1) + ' / ' + round.questions.length;
    if (spans[1] && exercise) spans[1].textContent = exercise.verification + (round.questions.length < round.count ? ' · 当前可用 ' + round.questions.length + ' 题' : '');
    status.hidden = !round.pending && !round.message && round.questions.length >= round.count;
    status.innerHTML = round.pending ? '正在补充题目，已有题目可以继续练习…' : `${SC.esc(round.message)}${round.questions.length < round.count ? ' <button type="button" id="composeSupplement" class="quiet-button">重试缺失题目</button>' : ''}`;
    status.querySelector('#composeSupplement')?.addEventListener('click', round.retry);
  }
  function drawSentenceRound(mount, round, cards, key) {
    if (!round.questions.length) {
      if (round.pending) { mount.innerHTML = '<p class="muted" role="status">正在准备所选内容的题目…</p>'; return; }
      mount.innerHTML = `<div class="empty-state"><p>所选内容还没有适用的题目。</p><p class="muted">${SC.esc(round.message || '请调整练习范围，或配置 API 后组题。')}</p><button type="button" class="quiet-button" id="composeRetry">重试</button></div>`;
      mount.querySelector('#composeRetry').onclick = round.retry;
      return;
    }
    if (round.finished) {
      mount.innerHTML = `<div class="empty-state" tabindex="0" id="sentenceComplete"><p>这一轮完成了。</p><p class="muted">${round.questions.length} 道实际可用题目</p><button type="button" class="quiet-button" id="sentenceRestart">再练一轮</button></div>`;
      const restart = () => { round.finished = false; round.index = 0; round.practice = null; SC.ui.sentenceIndex = 0; drawSentenceRound(mount, round, cards, key); };
      mount.querySelector('#sentenceRestart').onclick = restart;
      mount.querySelector('#sentenceComplete').onkeydown = event => { if (event.key === 'Enter' && keyAllowed(event) && !event.target.closest('button,a,summary')) { event.preventDefault(); event.stopPropagation(); restart(); } };
      mount.querySelector('#sentenceComplete').focus({preventScroll: true});
      return;
    }
    const index = round.index, exercise = round.questions[index];
    mount.dataset.practiceFrame = key + ':' + exercise.id;
    let practice = round.practice;
    if (!practice || practice.questionId !== exercise.id) {
      const order = exercise.tokens.map(token => token.id);
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      if (order.length > 1 && order.every((id, index) => id === exercise.answers[0][index])) [order[0], order[1]] = [order[1], order[0]];
      practice = round.practice = {index, questionId: exercise.id, answer: [], order, submitted: false, correct: false};
    }
    SC.ui.sentence = practice; SC.ui.sentenceIndex = index;
    const reference = sentenceText(exercise, exercise.answers[0]);
    const lookup = new Map(exercise.tokens.map(token => [token.id, token]));
    mount.innerHTML = `<div class="practice-topline"><span>${index + 1} / ${round.questions.length}</span><span class="small muted">${SC.esc(exercise.verification)}${round.questions.length < round.count ? ' · 当前可用 ' + round.questions.length + ' 题' : ''}</span><button id="nextSentence" class="icon-button" aria-label="下一题">${SC.icon('right')}</button></div><p class="small muted compose-notice" role="status"></p><div class="sentence-workspace" tabindex="0"><h2 class="sentence-goal">${SC.esc(exercise.target_en)}</h2>${evidenceHTML({evidence: [exercise.evidence]}, false)}${auxiliaryHTML(exercise.auxiliary, 'sentence-auxiliary')}<div class="sentence-line" id="sentenceLine" aria-label="拖入词块还原原句"></div><div class="sentence-feedback" id="sentenceFeedback" aria-live="polite"></div><div class="word-pool" id="wordPool" aria-label="韩语词块"></div><div class="sentence-actions"><button id="sentenceSubmit" class="icon-button" aria-label="确认句子">${SC.icon('up')}</button></div></div>`;
    updateSentenceStatus(mount, round);
    const workspace = mount.querySelector('.sentence-workspace'), line = mount.querySelector('#sentenceLine'), pool = mount.querySelector('#wordPool'), feedback = mount.querySelector('#sentenceFeedback');
    const sources = [...new Set([...exercise.source_ids, ...exercise.tokens.map(token => token.card_id).filter(Boolean)])].map(id => SC.data.items.find(item => item.id === id && ['word', 'grammar'].includes(item.kind))).filter(Boolean);
    const selectSource = item => {
      if (item) workspace.dataset.studyId = item.id; else delete workspace.dataset.studyId;
      SC.ui.managementTarget = {element: workspace, studyId: item?.id, armed: !!item, dom: workspace.firstChild};
    };
    SC.manage?.(workspace, () => practiceExtraEntries(mount, sources, sources.find(item => item.id === workspace.dataset.studyId), workspace, 'sentence'));
    if (SC.ui.supplementBatch?.mode === 'sentence' && SC.ui.supplementBatch.action?.startsWith('extra-')) drawPracticeExtra(mount, sources, SC.ui.supplementBatch);
    let dragged = null;
    const token = (id, placed) => `<button class="sentence-token${placed ? ' placed' : ''}${lookup.get(id).attach_left ? ' particle-token' : ''}" draggable="true" data-token="${SC.esc(id)}" data-placed="${placed}" aria-label="${SC.esc(lookup.get(id).text)}${placed ? '，移回词块区' : '，加入句子'}">${SC.esc(lookup.get(id).text)}</button>`;
    const changed = () => { practice.submitted = false; practice.correct = false; SC.stopSpeech(); };
    function draw() {
      line.innerHTML = practice.answer.length ? practice.answer.map(id => token(id, true)).join('') : '<span class="line-placeholder">&nbsp;</span>';
      pool.innerHTML = practice.order.filter(id => !practice.answer.includes(id)).map(id => token(id, false)).join('');
      feedback.innerHTML = practice.submitted && !practice.correct ? `<p class="small muted">${practice.skipped ? "先看原句，再继续练习。" : "尚未还原原句；本题不判断其他表达的语法正确性。"}</p><p class="sentence-reference ko">${SC.esc(reference)}</p>` : '';
      feedback.setAttribute('aria-label', practice.submitted ? practice.correct ? '已还原原句' : '尚未还原原句' : '');
      const primary = mount.querySelector('#sentenceSubmit');
      primary.setAttribute('aria-label', practice.submitted ? '下一题' : '确认句子');
      primary.innerHTML = SC.icon(practice.submitted ? 'right' : 'up');
      feedback.querySelector('.sentence-reference')?.addEventListener('click', () => SC.toggleSpeech([{text: reference, lang: 'ko', sentence: true}], `sentence:${exercise.id}:answer`));
      workspace.querySelectorAll('[data-token]').forEach(button => {
        const id = button.dataset.token;
        const source = sources.find(item => item.id === lookup.get(id).card_id);
        SC.manage?.(button, () => practiceExtraEntries(mount, sources, source, button, 'sentence'));
        button.addEventListener('click', () => selectSource(source));
        button.ondragstart = event => { dragged = id; SC.stopSpeech(); event.dataTransfer.setData('application/scrawl-token', id); event.dataTransfer.effectAllowed = 'move'; button.classList.add('dragging'); };
        button.ondragend = () => { dragged = null; button.classList.remove('dragging'); workspace.querySelectorAll('.drop-before').forEach(element => element.classList.remove('drop-before')); };
        button.onclick = () => { changed(); practice.answer = practice.answer.includes(id) ? practice.answer.filter(entry => entry !== id) : [...practice.answer, id]; draw(); workspace.focus({preventScroll: true}); };
        button.onkeydown = event => {
          if (!practice.answer.includes(id) || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat) return;
          if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
            event.preventDefault(); changed(); const at = practice.answer.indexOf(id), next = Math.max(0, Math.min(practice.answer.length - 1, at + (event.key === 'ArrowLeft' ? -1 : 1)));
            [practice.answer[at], practice.answer[next]] = [practice.answer[next], practice.answer[at]]; draw(); workspace.querySelector(`[data-token="${CSS.escape(id)}"]`)?.focus();
          } else if (['Backspace', 'Delete'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); changed(); practice.answer = practice.answer.filter(entry => entry !== id); draw(); workspace.focus({preventScroll: true}); }
        };
      });
    }
    const dragId = event => { const id = event.dataTransfer.getData('application/scrawl-token') || dragged; return lookup.has(id) ? id : null; };
    line.ondragover = event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; workspace.querySelectorAll('.drop-before').forEach(element => element.classList.remove('drop-before')); event.target.closest('[data-token]')?.classList.add('drop-before'); };
    line.ondrop = event => {
      event.preventDefault(); const id = dragId(event); if (id === null) return;
      const target = event.target.closest('[data-token]'), targetId = target?.dataset.token;
      if (targetId === id) return;
      changed(); practice.answer = practice.answer.filter(entry => entry !== id);
      let at = targetId ? practice.answer.indexOf(targetId) : practice.answer.length;
      if (target && event.clientX > target.getBoundingClientRect().left + target.getBoundingClientRect().width / 2) at++;
      practice.answer.splice(Math.max(0, at), 0, id); dragged = null; draw(); workspace.focus({preventScroll: true});
    };
    pool.ondragover = event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; };
    pool.ondrop = event => { event.preventDefault(); const id = dragId(event); if (id === null) return; changed(); practice.answer = practice.answer.filter(entry => entry !== id); dragged = null; draw(); workspace.focus({preventScroll: true}); };
    function submit() {
      if (practice.submitted) return;
      const answer = sentenceText(exercise, practice.answer);
      practice.skipped = !practice.answer.length;
      practice.correct = checkSentence(exercise, answer); practice.submitted = true; draw();
      SC.feedback(practice.correct, line);
      const event = {mode: 'sentence', questionId: exercise.id, answer, correct: practice.skipped ? null : practice.correct, status: practice.skipped ? 'skipped' : practice.correct ? 'matched' : 'unmatched', revealed: practice.skipped, sourceIds: exercise.source_ids, at: new Date().toISOString()};
      for (const item of SC.data.items.filter(card => exercise.source_ids.includes(card.id))) { item.progress ||= {streak: 0, due: null, events: []}; item.progress.events ||= []; item.progress.events.push({...event}); }
      SC.persist(); SC.speak(practice.correct ? answer : reference, 'ko', `sentence:${exercise.id}:answer`, true);
    }
    const next = () => { if (SC.ui.supplementBatch?.mode === 'sentence' && SC.ui.supplementBatch.action?.startsWith('extra-')) SC.ui.supplementBatch = null; SC.stopSpeech(); round.index++; round.practice = null; if (round.index >= round.questions.length) round.finished = true; drawSentenceRound(mount, round, cards, key); };
    const primary = mount.querySelector('#sentenceSubmit'), act = () => practice.submitted ? next() : submit();
    workspace.onkeydown = event => {
      if (event.key !== 'Enter' || !workspace.isConnected) return;
      const button = event.target.closest('button,a,summary');
      const controlled = button === primary || button?.matches('[data-token]');
      if (button && !controlled) return;
      if (!keyAllowed(event) || SC.ui.supplementBatch) { if (controlled && !event.defaultPrevented) event.preventDefault(); return; }
      event.preventDefault(); event.stopPropagation(); act();
    };
    primary.onclick = act;
    mount.querySelector('#nextSentence').onclick = next;
    if (exercise.target_en) mount.querySelector('.sentence-goal').onclick = () => SC.toggleSpeech([{text: exercise.target_en, lang: /[\u4e00-\u9fff]/.test(exercise.target_en) ? 'zh' : 'en'}], `sentence:${exercise.id}:goal`);
    line.onclick = event => { if (practice.submitted && !event.target.closest('button')) SC.toggleSpeech([{text: practice.correct ? sentenceText(exercise, practice.answer) : reference, lang: 'ko', sentence: true}], `sentence:${exercise.id}:answer`); };
    draw(); workspace.focus({preventScroll: true});
    if (!practice.goalAnnounced) {
      practice.goalAnnounced = true;
      if (!practice.submitted && exercise.target_en && !/[\u4e00-\u9fff]/.test(exercise.target_en)) SC.speak(exercise.target_en, 'en', `sentence:${exercise.id}:goal`);
    }
  }
  function sentencePage(view) {
    const ids = new Set(SC.data.books.filter(book => SC.bookInScope(book) && !book.special).map(book => book.id));
    const cards = SC.data.items.filter(card => ids.has(card.bookId) && learned(card));
    SC.renderSentencePractice(view, {cards, scopeKey: 'project:' + SC.projectId, count: 10});
  }

  function songItems(books) { return SC.data.items.filter(item => [books.words.id, books.grammar.id, books.sentences?.id].includes(item.bookId)); }
  SC.saveLyricSentence = lineIndex => {
    const song = SC.song, original = song.lines[lineIndex]?.text || '';
    if (!original) return;
    SC.editFields('保存句子', [{key: 'meaning', label: '英文意思', value: song.lines[lineIndex].translation || ''}, {key: 'meaningZh', label: '中文意思（可选）', value: ''}], values => {
      if (!values.meaning.trim() && !values.meaningZh.trim()) { SC.toast('请补充这句的意思。'); return; }
      const books = SC.ensureSongBooks(true, song);
      if (books.project.deleted || books.sentences.deleted || song.lines[lineIndex]?.text !== original) { SC.toast('保存位置已删除或歌词已修改，本次未保存。'); return; }
      const related = SC.lyricLineIndex?.(song)[lineIndex]?.entries?.map(entry => entry.note) || [];
      const note = SC.addItem(books.sentences.id, {text: original, meaning: values.meaning.trim(), meaningZh: values.meaningZh.trim(), manual: true, situation: '歌词表达', listenerLevel: '', subjectHonorific: '', expressionGroup: '', sourceType: 'lyric', wordIds: related.filter(item => item.kind === 'word').map(item => item.id), grammarIds: related.filter(item => item.kind === 'grammar').map(item => item.id)}, true);
      if (!note) return;
      note.contexts ||= [];
      if (!note.contexts.some(context => context.songId === song.id && context.lineIndex === lineIndex && context.original === original)) note.contexts.push({songId: song.id, lineIndex, original, surface: original, translation: values.meaning.trim(), source: song.title});
      SC.ui.songNote = note.id; SC.persist(); SC.render();
    });
  };
  function lyricIndex(time) {
    let index = -1;
    SC.song.lines.forEach((line, i) => { if (Number.isFinite(line.t) && time >= line.t) index = i; });
    return index;
  }
  function renderSongNote(container, books) {
    const items = songItems(books);
    const selection = SC.ui.songSelection?.songId === SC.song.id ? SC.ui.songSelection : null;
    const lineIndex = selection?.lineIndex ?? Math.max(0, lyricIndex(SC.player.audio.currentTime || 0));
    const original = SC.song.lines[lineIndex]?.text || '';
    const indexed = SC.lyricLineIndex?.(SC.song)[lineIndex]?.entries || [];
    const contexts = item => indexed.filter(entry => entry.note.id === item.id).map(entry => entry.context);
    const local = items.filter(item => contexts(item).length || item.kind === 'sentence' && item.text === original);
    const tokenMatch = item => contexts(item).some(context => SC.lyricTokenMatches?.(item, selection?.text, context));
    const selected = (selection?.kind === 'word' ? local.find(item => item.kind === 'word' && tokenMatch(item)) : null) || local.find(item => item.id === SC.ui.songNote) || local[0];
    const visible = ['word', 'grammar', 'sentence'].flatMap(kind => local.filter(item => item.kind === kind).sort((a, b) => Number(b.id === selected?.id) - Number(a.id === selected?.id)));
    const label = type => SC.cardLabel?.(type) || ({word: '单词卡', grammar: '语法卡', sentence: '句子卡'}[type]);
    const batch = SC.ui.songCardBatch?.songId === SC.song.id ? SC.ui.songCardBatch : null;
    const selectedIds = new Set(batch?.selected || []);
    const footer = `<div class="song-note-footer">${[['word', books.words], ['grammar', books.grammar], ...(books.sentences ? [['sentence', books.sentences]] : [])].filter(([, book]) => !book.deleted).map(([kind, book]) => `<button class="quiet-button" data-open-song-book="${kind}">${SC.icon(SC.cardIcon?.(kind) || 'book')} ${SC.esc(book.name || label(kind))}</button>`).join('')}</div>`;
    const startBatch = (action, note) => { SC.ui.songCardBatch = {songId: SC.song.id, action, selected: [note.id]}; renderSongNote(container, books); };
    function wireCommon() {
      container.querySelectorAll('[data-open-song-book]').forEach(button => button.onclick = () => { const kind = button.dataset.openSongBook, book = {word: books.words, grammar: books.grammar, sentence: books.sentences}[kind]; SC.go({word: 'words', grammar: 'grammar', sentence: 'sentences'}[kind], book.id); });
      const done = () => { SC.ui.songCardBatch = null; SC.persist(); renderSongNote(container, books); SC.refreshSidebar?.(); };
      const all = container.querySelector('#songCards-All');
      if (all) all.onchange = event => { batch.selected = event.target.checked ? [...new Set([...batch.selected, ...visible.map(note => note.id)])] : batch.selected.filter(id => !visible.some(note => note.id === id)); renderSongNote(container, books); };
      container.querySelector('#songCards-Cancel')?.addEventListener('click', done);
      container.querySelector('#songCards-Execute')?.addEventListener('click', () => batch.action === 'delete' ? SC.deleteCards(batch.selected, done) : SC.markExtra(batch.selected, batch.action === 'extra-add', done));
      container.querySelectorAll('[data-song-select]').forEach(input => {
        input.onclick = event => event.stopPropagation();
        input.onchange = () => { const ids = new Set(batch.selected); input.checked ? ids.add(input.dataset.songSelect) : ids.delete(input.dataset.songSelect); batch.selected = [...ids]; renderSongNote(container, books); };
      });
    }
    const missingToken = selection?.kind === 'word' && !local.some(item => item.kind === 'word' && tokenMatch(item)) ? `<p class="small muted song-token-missing">${SC.esc(selection.text)} · 当前词尚未收录</p>` : '';
    if (!selected) {
      container.innerHTML = `<div class="song-note-empty">${missingToken || '<p class="muted">这句还没有关联的卡片。</p>'}</div>` + footer;
      wireCommon(); return;
    }
    SC.ui.songNote = selected.id;
    container.innerHTML = missingToken + (batch ? SC.batchToolbar({action: batch.action, label: batch.action === 'delete' ? '删除所选卡片' : batch.action === 'extra-add' ? '加入再记一遍' : '移出再记一遍', count: selectedIds.size, all: visible.length > 0 && visible.every(note => selectedIds.has(note.id)), partial: visible.some(note => selectedIds.has(note.id)), prefix: 'songCards'}) : '') + '<div class="song-line-cards">' + visible.map((note, index) => {
      const context = contexts(note)[0], meaning = SC.studyMeaning(note, original);
      const body = note.kind === 'word' ? `<p class="song-word-meaning">${SC.esc(meaning || '释义待补充')}</p>${SC.wordFormHTML?.({...note, surface: context?.surface || note.surface, formNote: note.protectedOriginal || note.manual ? note.formNote : context?.formNote || note.formNote}, original) || ''}` : note.kind === 'sentence' ? `<p>${SC.esc(meaning)}</p>` : `<p>${SC.esc(note.explanation)}</p>${note.formation && !note.explanation.includes(note.formation) ? `<p>${SC.esc(note.formation)}</p>` : ''}`;
      const extra = note.kind === 'sentence' ? `<details class="sentence-analysis"><summary>单词与语法</summary>${local.filter(item => item.kind !== 'sentence' && [...(note.wordIds || []), ...(note.grammarIds || [])].includes(item.id)).map(item => `<p><strong${item.kind === 'word' ? ' class="ko"' : ''}>${SC.esc(item.text)}</strong> — ${SC.esc(item.kind === 'word' ? SC.studyMeaning(item, original) : item.explanation)}</p>`).join('')}</details>` : note.example || note.note ? `<details class="song-note-detail"><summary>例句与说明</summary>${note.example ? `<p class="note-example ko" data-example>${SC.esc(note.example)}</p><p>${SC.esc(note.translation || '')}</p>` : ''}${note.note ? `<p class="note">${SC.esc(note.note)}</p>` : ''}</details>` : '';
      const group = index === 0 || visible[index - 1].kind !== note.kind ? `<h3 class="song-note-group-title">${label(note.kind)}</h3>` : '';
      return group + `<section class="song-note-card${note.id === selected.id ? ' selected' : ''}" data-song-card="${SC.esc(note.id)}" tabindex="0">${batch ? `<label class="note-select"><input type="checkbox" data-song-select="${SC.esc(note.id)}"${selectedIds.has(note.id) ? ' checked' : ''} aria-label="选择${SC.esc(note.text)}"></label>` : ''}<div class="song-note-body" tabindex="0" role="button" aria-label="${note.kind === 'grammar' ? '选择；双击修改' : '朗读；双击修改'}"><h2${note.kind !== 'grammar' ? ' class="ko"' : ''}>${SC.esc(note.text)}</h2>${body}</div>${extra}</section>`;
    }).join('') + '</div>' + footer;
    wireCommon();
    container.querySelectorAll('[data-song-card]').forEach(element => {
      const note = visible.find(row => row.id === element.dataset.songCard), meaning = SC.studyMeaning(note, original);
      const edit = () => SC.editItem(note, () => { SC.persist(); renderSongNote(container, books); });
      SC.manage?.(element, [{label: '编辑' + label(note.kind), fn: edit}, {label: note.extraPractice ? '移出再记一遍' : '加入再记一遍', fn: () => startBatch(note.extraPractice ? 'extra-remove' : 'extra-add', note)}, {label: '删除' + label(note.kind), fn: () => startBatch('delete', note)}], () => SC.deleteCards([note.id], () => renderSongNote(container, books)));
      clickableContent(element.querySelector('.song-note-body'), () => { SC.ui.songNote = note.id; if (note.kind !== 'grammar') SC.toggleSpeech([{text: note.text, lang: note.kind === 'word' ? 'ko' : lyricLanguage(note.text), sentence: note.kind === 'sentence'}], `song-note:${SC.song.id}:${note.id}`); }, edit);
      element.querySelector('[data-example]')?.addEventListener('click', () => SC.toggleSpeech([{text: note.example, lang: 'ko', sentence: true}], `song-note:${SC.song.id}:${note.id}:example`));
    });
  }
  SC.practiceRender = (view, announce = false) => {
    if (SC.route === 'expressions') expressionPage(view, undefined, announce);
    else if (SC.route === 'forms') formsPage(view, undefined, announce);
    else sentencePage(view);
  };
  SC.renderStudyExpansion = (view, options, announce = false) => {
    view.dataset.expansionScope = options.scopeKey;
    if (options.mode === 'expressions') expressionPage(view, options, announce);
    else if (options.mode === 'forms') formsPage(view, options, announce);
  };
  function lyricLanguage(text) { return /[가-힣]/.test(text) ? 'ko' : 'en'; }
  function songTime(time) { const seconds = Math.max(0, Math.floor(Number(time) || 0)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
  SC.songRender = view => {
    if (!SC.song.id) {
      view.innerHTML = `<div class="song-heading"><h1 class="song-title">KPOP</h1><form id="songSearch" class="song-search"><input id="songQuery" aria-label="歌名、歌手或 B站链接" placeholder="歌名 + 歌手，或 B站链接" value="${SC.esc(SC.ui.songQuery || '')}"><button class="icon-button" type="submit" aria-label="搜索歌曲">${SC.icon('search')}</button></form></div><div id="songSearchResult" class="song-search-result" aria-live="polite">${SC.esc(SC.ui.songSearchResult || '')}${(SC.ui.songSearchRows || []).map((row, i) => `<button class="song-search-option" data-song-result="${i}"><strong>${SC.esc(row.title)}</strong><span>${SC.esc(row.artist)}</span></button>`).join('')}</div>`;
      view.querySelector('#songQuery').oninput = event => { SC.ui.songQuery = event.target.value; };
      view.querySelector('#songSearch').onsubmit = event => { event.preventDefault(); const query = view.querySelector('#songQuery').value.trim(); if (query) SC.searchSongs(query); };
      SC.wireSongService?.(view); return;
    }
    const books = SC.ensureSongBooks();
    SC.ui.songBooks = {projectId: books.project.id, wordBookId: books.words.id, grammarBookId: books.grammar.id};
    SC.rebuildSongContexts?.();
    SC.persist();
    Object.entries(SC.data.songEditsBySong?.[SC.song.id] || {}).forEach(([index, values]) => {
      if (SC.song.lines[index]) Object.assign(SC.song.lines[index], values);
    });
    const songId = SC.song.id;
    const available = !!SC.player.available;
    const time = SC.player.audio.currentTime || 0;
    const active = lyricIndex(time);
    const selectedLine = SC.ui.songSelection?.songId === songId ? SC.ui.songSelection.lineIndex : -1;
    const captions = SC.song.lines.map((line, index) => SC.songLineTranslation?.(line, index, SC.song) ?? (line.translationZh || line.translation || ''));
view.innerHTML = `<div class="song-heading"><div><h1 class="song-title">${SC.esc(SC.song.title)}</h1><p class="song-artist">${SC.esc(SC.song.artist)}</p></div><form id="songSearch" class="song-search"><input id="songQuery" aria-label="歌名、歌手或 B站链接" placeholder="歌名 + 歌手，或 B站链接" value="${SC.esc(SC.ui.songQuery || '')}"><button class="icon-button" type="submit" aria-label="搜索歌曲">${SC.icon('search')}</button></form></div><div id="songSearchResult" class="song-search-result" aria-live="polite">${SC.esc(SC.ui.songSearchResult || '')}${(SC.ui.songSearchRows || []).map((row, i) => `<button class="song-search-option" data-song-result="${i}"><strong>${SC.esc(row.title)}</strong><span>${SC.esc(row.artist)}</span></button>`).join('')}</div>${SC.songStatusHTML?.() || ''}<div class="song-layout"><section class="lyrics-column"><div class="lyrics-scroll" id="lyricsScroll">${SC.song.lines.map((line, index) => `<div class="lyric-line${index === active ? ' current' : ''}${index === selectedLine ? ' selected' : ''}" data-line="${index}" tabindex="0" role="group" aria-label="第 ${index + 1} 行；Enter 朗读，双击修改"><p class="ko">${line.text.split(/(\s+)/).map(token => /\S/.test(token) ? `<button class="lyric-token" data-token="${SC.esc(token)}" aria-label="朗读 ${SC.esc(token)}">${SC.esc(token)}</button>` : token).join('')}</p>${captions[index] ? `<p class="lyric-translation">${SC.esc(captions[index])}</p>` : ''}<div class="lyric-actions"><button class="icon-button lyric-original" data-original="${index}" aria-label="播放第 ${index + 1} 行原音片段" title="${available ? '播放这一句原音' : '载入音频后播放这一句原音'}"${available && Number.isFinite(line.t) ? '' : ' disabled'}>${SC.icon('play')}</button><button class="icon-button lyric-tts" data-line-speech="${index}" aria-label="朗读第 ${index + 1} 行完整歌词" title="朗读完整歌词">${SC.icon('sound')}</button></div></div>`).join('')}</div><div class="lyrics-tools"><button class="icon-button${SC.player.loopMode === 'line' ? ' active' : ''}" id="songLineLoop" aria-label="单句循环" title="单句循环"${available ? '' : ' disabled'}>${SC.icon('loop')}</button><label class="section-select"><span>选段</span><select id="sectionStart" aria-label="起始行">${SC.song.lines.map((line, index) => `<option value="${index}"${index === (SC.player.section?.[0] || 0) ? ' selected' : ''}>${index + 1}</option>`).join('')}</select><span>—</span><select id="sectionEnd" aria-label="结束行">${SC.song.lines.map((line, index) => `<option value="${index}"${index === (SC.player.section?.[1] ?? 1) ? ' selected' : ''}>${index + 1}</option>`).join('')}</select></label><button class="quiet-button" id="songSectionLoop"${available ? '' : ' disabled'}>循环选段</button><button class="quiet-button${SC.player.loopMode === 'all' ? ' active' : ''}" id="songAllLoop"${available ? '' : ' disabled'}>整曲</button></div><section class="song-player" aria-label="歌曲播放器；右键导入笔记或更换音频" tabindex="0"><div class="song-audio-state"><input id="songAudioInput" type="file" accept=".mp3,.m4a,.wav,.flac,.ogg,.aac,.webm,.mp4,.mov,.mkv,.mgg,.mflac" hidden><span class="small muted">${SC.ui.songUpload ? '正在处理音频…' : ''}</span></div><div class="song-player-controls"><button id="previousLine" class="icon-button" aria-label="上一句" title="上一句"${available ? '' : ' disabled'}>${SC.icon('left')}</button><button id="playSong" class="icon-button player-play" aria-label="播放歌曲" title="播放歌曲"${available ? '' : ' disabled'}>${SC.icon(SC.player.audio.paused ? 'play' : 'pause')}</button><button id="nextLine" class="icon-button" aria-label="下一句" title="下一句"${available ? '' : ' disabled'}>${SC.icon('right')}</button><span id="elapsed" class="time">${songTime(time)}</span><input id="songSeek" type="range" min="0" max="${Number(SC.song.duration) || 0}" step="0.05" value="${time}" aria-label="歌曲进度"${available ? '' : ' disabled'}><span id="duration" class="time">${songTime(SC.song.duration)}</span><button id="loopSong" class="icon-button${SC.player.loopMode ? ' active' : ''}" aria-label="循环模式" title="循环模式"${available ? '' : ' disabled'}>${SC.icon('loop')}</button><button id="volumeButton" class="icon-button" aria-label="静音歌曲" title="静音歌曲"${available ? '' : ' disabled'}>${SC.icon('sound')}</button></div></section></section><aside class="song-note-column"><section class="song-note" id="songNote"></section><span class="song-player-poem"><svg class="dog-mark ear-mark" viewBox="0 0 36 36" aria-hidden="true"><path d="M10 28c-5-2-7-9-4-15l6-8c2-2 5 0 5 3v12c0 5-3 8-7 8Z"/><path d="M19 10c5-4 12 0 12 6 0 4-3 7-7 7"/></svg>stick with you</span></aside></div>`;
    renderSongNote(view.querySelector('#songNote'), books);
    view.querySelector('#songQuery').oninput = event => { SC.ui.songQuery = event.target.value; };
    view.querySelector('#songSearch').onsubmit = event => {
      event.preventDefault();
      const query = view.querySelector('#songQuery').value.trim();
      if (query) SC.searchSongs(query);
    };
    SC.wireSongService?.(view);
    const songManagement = () => {
      const saved = SC.data.songLibrary?.[songId];
      return [{label: available ? '更换音频或视频' : '添加音频或视频', fn: () => view.querySelector('#songAudioInput').click()}, {label: '导入歌曲笔记', fn: () => SC.openSongNotes()}, ...(saved?.lyricsError ? [{label: '重试获取歌词', fn: () => SC.fetchSongLyrics()}] : []), ...(SC.retrySongTranslations && (SC.songHasMissingTranslations?.(SC.song) ?? SC.song.lines.some(line => line.text.trim() && !line.translationZh?.trim())) ? [{label: '重试中文译文', fn: () => SC.retrySongTranslations(SC.song)}] : []), ...(['failed', 'partial'].includes(saved?.analysisStatus) ? [{label: '重试整理', fn: () => SC.analyzeSong(SC.song, {force: true})}] : []), ...(saved?.musicId && !available && !SC.song.audioUrl?.startsWith('/api/files/') ? [{label: '重试音频', fn: () => SC.refreshSongAudio()}] : []), ...(SC.song.lines.length && SC.song.lyricsConfirmed !== false ? [{label: '校对歌词时间', fn: () => SC.confirmSongTranscription(true)}] : []), ...(books.project.deleted || books.words.deleted || books.grammar.deleted || books.sentences?.deleted ? [{label: '重新创建歌曲卡片集合', fn: () => { SC.recreateSongBooks(SC.song); SC.render(); }}] : [])];
    };
    SC.manage?.(view.querySelector('.song-player'), songManagement);
    view.querySelectorAll('[data-line]').forEach(element => {
      const index = Number(element.dataset.line);
      let clickTimer;
      const stillCurrent = () => element.isConnected && SC.route === 'songs' && SC.song.id === songId;
      function select(text, kind) {
        SC.ui.songSelection = {songId, lineIndex: index, text, kind};
        view.querySelectorAll('[data-line]').forEach(row => row.classList.toggle('selected', Number(row.dataset.line) === index));
      }
      function speakLine() {
        if (!stillCurrent()) return;
        select(SC.song.lines[index].text, 'line');
        SC.ui.songNote = null;
        renderSongNote(view.querySelector('#songNote'), books);
        SC.toggleSpeech([{text: SC.song.lines[index].text, lang: lyricLanguage(SC.song.lines[index].text), sentence: true}], `song-line:${songId}:${index}`);
      }
      const edit = () => SC.editFields('修改歌词', [{key: 'text', label: '歌词原文', value: SC.song.lines[index].text}, {key: 'translationZh', label: '中文译文', value: SC.song.lines[index].translationZh}, {key: 'translation', label: '英文译文', value: SC.song.lines[index].translation}], values => {
        SC.saveSongLyric(index, values);
      });
      SC.manage?.(element, () => [{label: '修改歌词', fn: edit}, {label: '保存到句子卡', fn: () => SC.saveLyricSentence(index)}, ...songManagement()]);
      element.addEventListener('click', event => {
        if (event.target.closest('[data-token],.lyric-actions,.lyric-translation')) return;
        const epoch = SC.ui.playbackStopEpoch || 0; clearTimeout(clickTimer); clickTimer = setTimeout(() => { if (epoch === (SC.ui.playbackStopEpoch || 0)) speakLine(); }, 220);
      });
      element.addEventListener('dblclick', event => { if (event.target.closest('[data-token],.lyric-actions,.lyric-translation')) return; clearTimeout(clickTimer); edit(); });
      element.addEventListener('keydown', event => {
        if (event.target !== element || event.defaultPrevented || event.isComposing) return;
        if (event.key === 'Enter') { event.preventDefault(); speakLine(); }
        if (event.key === 'F2') { event.preventDefault(); edit(); }
      });
      element.querySelector('[data-original]').onclick = event => {
        event.stopPropagation(); clearTimeout(clickTimer);
        if (!stillCurrent()) return;
        select(SC.song.lines[index].text, 'line');
        SC.ui.songNote = null; renderSongNote(view.querySelector('#songNote'), books);
        SC.playLine(index);
      };
      element.querySelector('[data-line-speech]').onclick = event => { event.stopPropagation(); clearTimeout(clickTimer); speakLine(); };
      element.querySelectorAll('.lyric-actions button').forEach(button => button.ondblclick = event => { event.stopPropagation(); event.preventDefault(); });
      element.querySelectorAll('[data-token]').forEach(button => {
        let wordTimer;
        const lookup = () => (SC.lyricTokenCards?.(SC.song, index, button.dataset.token) || []).find(entry => entry.note.kind === 'word')?.note;
        const wordClick = () => {
          if (!stillCurrent() || !button.isConnected) return;
          select(button.dataset.token, 'word');
          const item = lookup();
          SC.ui.songNote = item?.id || null;
          SC.ui.songNoteKind = item?.kind || 'word';
          renderSongNote(view.querySelector('#songNote'), books);
          SC.toggleSpeech([{text: button.dataset.token, lang: lyricLanguage(button.dataset.token)}], `song-token:${songId}:${index}:${button.dataset.token}`);
        };
        button.addEventListener('click', event => { event.stopPropagation(); const epoch = SC.ui.playbackStopEpoch || 0; clearTimeout(wordTimer); wordTimer = setTimeout(() => { if (epoch === (SC.ui.playbackStopEpoch || 0)) wordClick(); }, 220); });
        button.addEventListener('dblclick', event => {
          event.stopPropagation(); clearTimeout(wordTimer);
          const item = lookup();
          if (item) SC.editItem(item, () => { SC.persist(); renderSongNote(view.querySelector('#songNote'), books); });
          else edit();
        });
      });
    });
    view.querySelector('#songLineLoop').onclick = () => {
      const index = SC.ui.songSelection?.songId === songId ? SC.ui.songSelection.lineIndex : Math.max(0, SC.player.activeLine);
      if (!Number.isFinite(SC.song.lines[index]?.t)) { SC.toast('这一句的时间尚未校对。'); return; }
      SC.setLoop(SC.player.loopMode === 'line' ? null : 'line', index); SC.songRender(view);
    };
    view.querySelector('#songSectionLoop').onclick = () => {
      const start = Number(view.querySelector('#sectionStart').value), end = Number(view.querySelector('#sectionEnd').value);
      if (end < start) { SC.toast('结束行需要在起始行之后。'); return; }
      if (!Number.isFinite(SC.song.lines[start]?.t) || !Number.isFinite(SC.song.lines[end]?.t)) { SC.toast('选段起止行的时间尚未校对。'); return; }
      SC.player.section = [start, end]; SC.setLoop('section', [start, end]); SC.playSong(); SC.songRender(view);
    };
    view.querySelector('#songAllLoop').onclick = () => { SC.setLoop(SC.player.loopMode === 'all' ? null : 'all'); SC.songRender(view); };
    SC.wireSongControls();
    SC.wireSongNotes?.(view);
    SC.songTimeUpdate(time);
    SC.startSongService?.(SC.song);
  };
  SC.songTimeUpdate = time => {
    const index = lyricIndex(time);
    SC.player.activeLine = index;
    if (SC.route !== 'songs') return;
    if (!SC.player.audio.paused && index >= 0 && (SC.ui.songSelection?.songId !== SC.song.id || SC.ui.songSelection?.lineIndex !== index)) {
      SC.ui.songSelection = {songId: SC.song.id, lineIndex: index, text: SC.song.lines[index].text, kind: 'line'};
      SC.ui.songNote = null;
      const panel = SC.root.querySelector('#songNote'); if (panel) renderSongNote(panel, SC.ensureSongBooks());
    }
    const nodes = SC.root.querySelectorAll('[data-line]');
    nodes.forEach(element => {
      const current = Number(element.dataset.line) === index;
      const was = element.classList.contains('current');
      element.classList.toggle('current', current);
      if (current && !was && !document.hidden) element.scrollIntoView({block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
    });
  };
  window.addEventListener('scrawl-api-configured', () => {
    for (const [key, round] of Object.entries(SC.ui.sentenceRounds || {})) if (!round.pending && round.attempted && round.message) round.message = generationFailure(SC.data.composeSourceCache?.[key]?.message || round.message, round.provider, true);
    if (['sentence', 'expressions', 'forms'].includes(SC.route) || SC.route === 'combined' && SC.ui.combined?.active) Promise.resolve().then(() => SC.render());
  });
SC.practiceFixtures = {exercises, cleanSentence, checkSentence, sentenceText, offlineQuestions, validateQuestions, composeCards, composeTargets, lyricIndex, renderSongNote, songItems, expansionCard, expansionState, prepareExpansion, prepareExpansions, canConjugate, contextCards, requestContext, targetSize, validateExpansion, adoptExpansion, expansionFingerprint, composeFingerprint, buildSentenceRound, learned, learnedSurface, finiteWait, practiceSettings, practiceRequest, sentenceSeed, checkedQuestions, auxiliaryHTML, validateTokens, normalizeAITokens, normalizeAIAuxiliary, validateAuxiliary, tokenText, liveReferences, referencedCards, sourceUnits, sourceSnapshot, originalFormUnits, liveSources, validateEvidence, mergeExpansion, providerFor, generationFailure, sourceMessages, sameFingerprint, missingExpansion, completeExpansion};
})();
