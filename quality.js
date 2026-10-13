'use strict';
(() => {
  const S = window.SC, clean = text => String(text || '').normalize('NFC').replace(/^[.,!?“”"']+|[.,!?“”"']+$/g, '');
  const knownForms = {
    지나: {text: '지나다', pos: 'verb', meaning: 'pass', formNote: '지나 来自 지나다＋-아，重复的 아 合并；本句没有明确过去时词尾，也不是 -아/어지다。'},
    말해줘: {text: '말하다', pos: 'verb', meaning: 'say; tell', formNote: '말해줘＝말하다 的 말해＋주다 的 줘；-아/어 주다 表示为对方做，句中是“告诉我”的请求。'},
    아침은: {text: '아침', pos: 'noun', meaning: 'morning', formNote: '아침은＝아침＋话题助词 은；单词原型是 아침。'},
    멀어: {text: '멀다', pos: 'adjective', meaning: 'be far', formNote: '멀어＝멀다 的词干 멀-＋-어，非敬语口语陈述形；不是副词 멀리。'},
    '알-': {text: '알다', pos: 'verb', meaning: 'know', formNote: '아는 来自 알다＋定语词尾 -는，ㄹ 在 ㄴ 前脱落；这里表示“知道的”，不表示正在进行。'}
  };
  // Explicit surfaces, not suffix stripping. Original Word fields are never changed by this index.
  const lyricSurfaces = {
    주다: ['말해줘'], 바라다: ['바라던'], 싶다: ['싶어'], 아침: ['아침은'], 멀다: ['멀어'],
    크다: ['커버렸어'], 길다: ['길었던'], 함께: ['함께한'], 기억: ['기억처럼'], 마음: ['마음은'],
    심장: ['심장'], 기다리다: ['기다렸지'], 널: ['널', '너를'], 난: ['난'], 말하다: ['말해줘'],
    지나다: ['지나'], 웃다: ['웃었지만'], 울리다: ['울린'], 상상하다: ['상상했지'], 닿다: ['닿아있던'],
    나: ['난', '날'], 너: ['널', '너를'], 보다: ['보는', '보고'], 알다: ['아는']
  };
  const grammarSurfaces = [
    ['-고', ['보고']], ['-지만', ['웃었지만']], ['-다고', ['좋아한다고']], ['-어도', ['아니어도']],
    ['过去定语词尾', ['함께한', '길었던', '바라던', '닿아있던']], ['现在时定语词尾', ['보는', '아는']],
    ['처럼', ['기억처럼']], ['대로', ['대로']], ['그대로', ['그대로']],
    ['辅助动词不能单独用', ['말해줘']], ['있다 本意', ['닿아있던']], ['词干以 ㄹ', ['아는']]
  ];
  S.lyricTokenMatches = (note, token, context) => {
    token = clean(token);
    if (token === clean(note.text) || token === clean(context?.surface) || token === clean(context?.token)) return true;
    if (note.kind === 'word' && lyricSurfaces[note.text]?.includes(token)) return context?.original?.split(/\s+/).some(part => clean(part) === token);
    return token === '기억처럼' && (['기억', '처럼'].includes(note.text) || note.kind === 'grammar' && note.text.includes('처럼') && context?.surface === '처럼') && context?.original?.split(/\s+/).some(part => clean(part) === token);
  };
  const lineIndexes = new Map();
  S.lyricLineIndex = (song = S.song, data = S.data) => {
    const bookIds = new Set(data.books.filter(book => book.projectId === 'song:' + song.id).map(book => book.id));
    const notes = data.items.filter(note => bookIds.has(note.bookId));
    const signature = JSON.stringify([song.lines.map(line => line.text), notes.map(note => [note.id, note.text, note.kind, note.surface, note.contexts])]);
    const cached = lineIndexes.get(song.id); if (cached?.signature === signature) return cached.lines;
    const lines = song.lines.map((line, lineIndex) => {
      const tokens = new Map(line.text.split(/\s+/).map(token => [clean(token), []])), entries = [];
      for (const note of notes) {
        const contexts = (note.contexts || []).filter(context => context.songId === song.id && context.original === line.text && Number(context.lineIndex) === lineIndex && context.surface && line.text.includes(context.surface));
        const matched = [...tokens.keys()].filter(token => contexts.some(context => S.lyricTokenMatches(note, token, context)) || note.kind === 'word' && (token === clean(note.text) || lyricSurfaces[note.text]?.includes(token)) || note.kind === 'grammar' && grammarSurfaces.some(([point, forms]) => note.text.includes(point) && forms.includes(token)));
        if (!contexts.length && !matched.length && !(note.kind === 'sentence' && note.text === line.text)) continue;
        const context = contexts[0] || {songId: song.id, lineIndex, original: line.text, surface: matched[0] || note.text, token: matched[0] || note.text};
        entries.push({note, context});
        for (const token of matched) tokens.get(token).push({note, context: {...context, token}});
      }
      return {entries, tokens};
    });
    lineIndexes.set(song.id, {signature, lines}); return lines;
  };
  S.lyricTokenCards = (song, lineIndex, token) => S.lyricLineIndex(song)[lineIndex]?.tokens.get(clean(token)) || [];
  const generated = note => !note.protectedOriginal && !note.manual && !note.original_note && /AI|生成/.test(note.verification || '');
  S.repairDerivedForms = note => {
    if (note.protectedOriginal || note.manual || note.kind !== 'word') return;
    const before = {formNote: note.formNote, contexts: (note.contexts || []).map(context => ({songId: context.songId, lineIndex: context.lineIndex, surface: context.surface, formNote: context.formNote})), needs_review: note.needs_review, review_note: note.review_note};
    let changed = false;
    for (const [input, form] of Object.entries(knownForms)) {
      if (note.text !== form.text) continue;
      const surface = input === '알-' ? '아는' : input;
      if (note.surface === surface && note.formNote !== form.formNote) { note.formNote = form.formNote; changed = true; }
      for (const context of note.contexts || []) if (context.surface === surface && context.original?.includes(surface) && context.formNote !== form.formNote) { context.formNote = form.formNote; changed = true; }
    }
    if (note.text === '닿다' && (note.contexts || []).some(context => context.surface === '닿아있던' && context.original?.includes('닿아있던')) && /现在时|现在.*定语/.test([note.formNote, ...(note.contexts || []).filter(context => context.surface === '닿아있던').map(context => context.formNote)].join(' '))) {
      const concern = '닿아있던 中有 -던，不能标为单纯现在时；本句需结合 -던 的过去状态与修饰范围理解。';
      if (/现在时|现在.*定语/.test(note.formNote || '')) note.formNote = concern;
      for (const context of note.contexts || []) if (context.surface === '닿아있던') context.formNote = concern;
      changed = true;
    }
    if (changed) (note.qualityCorrections ||= []).push({before, note: '仅修订自动生成的词形说明；原笔记、释义及人工正文保留。'});
  };
  function revise(note) {
    const originals = (note.contexts || []).map(context => context.original || '');
    const old = {text: note.text, meaning: note.meaning, pos: note.pos, formNote: note.formNote, explanation: note.explanation, formation: note.formation, review_note: note.review_note};
    let correction = '';
    if (note.kind === 'word') {
      const form = knownForms[note.text];
      if (form && (note.surface === note.text || note.text === '알-' && note.surface === '아는')) { Object.assign(note, form); correction = form.formNote; }
      if (note.surface === '난' && originals.includes('처음 느낌 그대로 난')) {
        Object.assign(note, {text: '나', meaning: 'I', pos: 'pronoun', formNote: '난＝나＋话题助词 는 的缩约；这里是“我”，不是 나다 的定语形。'}); correction = note.formNote;
      }
      if (note.text === '항상' && note.pos !== 'adverb') { note.pos = 'adverb'; correction = '항상 是副词。'; }
      if (note.text === '그대로' && note.pos !== 'adverb') { note.pos = 'adverb'; correction = '本句 그대로 是副词，表示保持原来状态。'; }
      if (note.text === '싶다' && note.pos !== 'auxiliary adjective') { note.pos = 'auxiliary adjective'; correction = '싶다 在韩国语基础词典中列为辅助形容词。'; }
      if (note.text === '좋아하다' && note.surface === '좋아한다고' && /\(으\)ㄴ다고/.test(note.formNote || '')) { note.formNote = '좋아한다고＝좋아하다＋间接引用的陈述词尾 -ㄴ다고；这里转述“喜欢你”。'; correction = note.formNote; }
    }
    if (correction) {
      note.qualityCorrection = {before: old, note: correction};
      for (const context of note.contexts || []) { context.formNote = note.formNote; if (note.kind === 'word') context.meaning = note.meaning; }
    }
  }
  function mergeCard(data, incoming, target) {
    for (const key of ['contexts', 'original_notes']) target[key] = [...(target[key] || []), ...(incoming[key] || [])].filter((row, index, all) => all.findIndex(other => JSON.stringify(row) === JSON.stringify(other)) === index);
    target.progress ||= incoming.progress || {events: []};
    target.progress.events = [...(target.progress.events || []), ...(incoming.progress?.events || [])].filter((row, index, all) => all.findIndex(other => JSON.stringify(row) === JSON.stringify(other)) === index);
    target.extraPractice ||= incoming.extraPractice;
    target.qualityCorrections = [...(target.qualityCorrections || []), ...(incoming.qualityCorrection ? [incoming.qualityCorrection] : [])];
    S.repairDerivedForms(target);
    data.cardIdAliases ||= {}; data.cardIdAliases[incoming.id] = target.id;
    for (const [alias, id] of Object.entries(data.cardIdAliases)) if (id === incoming.id) data.cardIdAliases[alias] = target.id;
    for (const item of data.items) {
      for (const key of ['wordIds', 'grammarIds']) if (item[key]) item[key] = [...new Set(item[key].map(id => id === incoming.id ? target.id : id))];
      for (const event of item.progress?.events || []) if (event.sourceIds) event.sourceIds = [...new Set(event.sourceIds.map(id => id === incoming.id ? target.id : id))];
    }
    for (const cache of Object.values(data.composeCache || {})) for (const question of cache.questions || []) {
      question.source_ids = [...new Set((question.source_ids || []).map(id => id === incoming.id ? target.id : id))];
      for (const token of question.tokens || []) if (token.card_id === incoming.id) token.card_id = target.id;
    }
    data.items = data.items.filter(item => item !== incoming);
  }
  S.repairKnownSongContext = (song, data = S.data) => {
    const bookIds = new Set(data.books.filter(book => book.projectId === 'song:' + song.id).map(book => book.id));
    for (const note of data.items.filter(note => bookIds.has(note.bookId) && (note.kind === 'word' && note.text === '기억' || note.kind === 'grammar' && note.text.includes('처럼')))) {
      song.lines.forEach((line, lineIndex) => {
        if (!line.text.split(/\s+/).some(token => clean(token) === '기억처럼')) return;
        note.contexts ||= [];
        if (!note.contexts.some(context => context.songId === song.id && context.lineIndex === lineIndex && context.original === line.text)) note.contexts.push({songId: song.id, lineIndex, original: line.text, surface: note.kind === 'word' ? '기억처럼' : '처럼', meaning: note.meaning || '', formNote: note.kind === 'word' ? '기억처럼＝기억＋比较助词 처럼；单词原型是 기억。' : '', source: song.title});
      });
    }
  };
  S.migrateQuality = () => {
    if (S.data?.legacyImportsDisabled) return;
    S.restoreDittoWord?.();
    if (S.ui?.dittoWordRestoreBlocked) return;
    S.restoreOriginalNotes();
    if (!S.data || S.data.qualityVersion === 2) return;
    try { const key = 'scrawl-public-current-v1-before-quality-v2'; if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(S.data)); }
    catch { S.toast('未能保存纠错前的副本，本次未更改原卡片。'); return; }
    for (const note of [...S.data.items]) {
      if (generated(note)) {
        revise(note);
        const duplicate = S.data.items.find(other => other !== note && other.bookId === note.bookId && other.text === note.text);
        if (duplicate) mergeCard(S.data, note, duplicate);
      } else if (!note.protectedOriginal && !note.manual && note.original_note && note.text === '싶다' && /词性.*争|分类需谨慎/.test(note.review_note || '')) {
        note.pos = 'auxiliary adjective';
      }
      S.repairDerivedForms(note);
    }
    for (const {song} of Object.values(S.data.songLibrary || {})) if (song?.lines) S.repairKnownSongContext(song);
    S.data.qualityVersion = 2;
  };
  S.restoreOriginalNotes = () => {
    const restore = window.SCRAWL_ORIGINAL_RESTORE, data = S.data;
    if (data?.legacyImportsDisabled || data?.dittoWordRestore?.version === 1) return;
    if (!restore || !data || data.originalRestoreVersion >= restore.version) return;
    const notes = data.items.filter(note => restore.cards[note.id] && note.source_file_id === restore.source_file_id);
    if (!notes.length) return;
    try { const key = 'scrawl-public-current-v1-before-original-restore-v' + restore.version; if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }
    catch { S.toast('无法保存原笔记恢复前的副本，本次没有更改卡片。'); return; }
    for (const note of notes) {
      const fields = structuredClone(restore.cards[note.id]); delete fields.needs_review; delete fields.review_note;
      Object.assign(note, fields);
      note.originalFields = structuredClone(restore.cards[note.id]);
    }
    delete data.composeCache;
    data.originalRestoreVersion = restore.version;
  };
})();
