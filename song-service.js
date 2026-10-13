'use strict';
(() => {
  const runs = new Map(), translationRuns = new Map(), resolving = new Map(), lyricFetches = new Map(), pollTimers = new Map(), projectsPending = new Map(), transcriptionStarts = new Set();
  let settingsPromise, importTimer;
  const normal = text => String(text || '').normalize('NFKC').toLowerCase().replace(/[’'＋+·—–-]/g, ' ').replace(/\s+/g, ' ').trim();
  const musicPath = musicId => `/api/music/${Number(musicId)}`;
  const isCurrent = song => SC.song.id === song.id;
  const songDeleted = song => !!SC.data.deletedContainers?.[`song:${song.id}`];
  const currentNotices = values => [...new Set((values || []).filter(value => typeof value === 'string' && value.trim() && !/韩国语基础词典|한국어기초사전|KRdict|没有可直接复用的完整词义或语法来源|未编写新的解释|不使用模型编造资料/i.test(value)))];
  function record(song) {
    const row = (SC.data.songLibrary ||= {})[song.id] ||= {song: structuredClone(song), analysisDone: []};
    if (row.analysisNotices) for (const key of Object.keys(row.analysisNotices)) row.analysisNotices[key] = currentNotices(row.analysisNotices[key]);
    if (row.analysisWarnings) row.analysisWarnings = currentNotices(row.analysisWarnings);
    if (row.analysisError && !currentNotices([row.analysisError]).length) { delete row.analysisError; row.analysisStatus = 'completed'; }
    return row;
  }
  function timeParts(value) {
    if (!Number.isFinite(value)) return ['', ''];
    const hundredths = Math.round(Math.max(0, value) * 100), seconds = (hundredths % 6000) / 100;
    return [String(Math.floor(hundredths / 6000)), seconds.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1').padStart(2, '0')];
  }
  function timeFields(name, value, label, disabled = false) {
    const [minutes, seconds] = timeParts(value);
    return `<span class="minute-second-field"><input name="${name}Minutes" type="number" min="0" step="1" value="${minutes}" aria-label="${label}分钟"${disabled ? ' disabled' : ''}><span aria-hidden="true">′</span><input name="${name}Seconds" type="number" min="0" max="59.99" step="0.01" value="${seconds}" aria-label="${label}秒"${disabled ? ' disabled' : ''}><span aria-hidden="true">″</span></span>`;
  }
  function setTime(form, name, value) {
    const [minutes, seconds] = timeParts(value);
    form.elements[`${name}Minutes`].value = minutes; form.elements[`${name}Seconds`].value = seconds;
  }
  function readTime(form, name, optional = false) {
    const minutes = form.elements[`${name}Minutes`].value.trim(), seconds = form.elements[`${name}Seconds`].value.trim();
    if (optional && !minutes && !seconds) return null;
    const m = Number(minutes), s = Number(seconds);
    return minutes && seconds && Number.isInteger(m) && m >= 0 && Number.isFinite(s) && s >= 0 && s < 60 ? Math.round((m * 60 + s) * 100) / 100 : NaN;
  }
  function disableTime(form, name, disabled) { form.elements[`${name}Minutes`].disabled = form.elements[`${name}Seconds`].disabled = disabled; }
  const refresh = song => {
    if (isCurrent(song) && SC.route === 'songs') {
      const scroll = SC.$('#lyricsScroll')?.scrollTop || 0;
      const query = SC.$('#songQuery'), focused = document.activeElement === query;
      const selection = focused ? [query.selectionStart, query.selectionEnd] : null;
      SC.songRender(SC.root);
      const lyrics = SC.$('#lyricsScroll'); if (lyrics) lyrics.scrollTop = scroll;
      if (focused) { const next = SC.$('#songQuery'); next.focus(); next.setSelectionRange(...selection); }
    }
  };
  function saveSong(song) {
    record(song).song = structuredClone(song);
    if (isCurrent(song)) SC.data.currentSong = song.id;
    return SC.persist();
  }
  async function request(path, body, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(path, {method, headers: body instanceof FormData || body === undefined ? {} : {'Content-Type': 'application/json'}, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body), ...(path === '/api/settings' ? {signal: AbortSignal.timeout(10000)} : path === '/api/lyrics/analyze' && body?.fill_missing ? {signal: AbortSignal.timeout(135000)} : {})});
    let data; try { data = await response.json(); } catch { throw new Error('歌曲服务暂不可用，请检查本机服务是否启动。'); }
    if (!response.ok) throw new Error(data.error || data.detail || `请求失败 (${response.status})`);
    return data;
  }
  SC.songRequest = request;
  async function settings(force = false) {
    if (!settingsPromise || force) settingsPromise = request('/api/settings').then(cfg => {
      SC.apiConfigured = !!(cfg.api_key_set && cfg.text_model && !cfg.demo); SC.observeAPIConfig?.(cfg);
      return cfg;
    }).catch(error => { settingsPromise = null; SC.apiConfigured = false; throw error; });
    return settingsPromise;
  }
  SC.apiSettings = settings;
  function savedSong(title, artist) {
    if (normal(SC.song.title) === normal(title) && normal(SC.song.artist) === normal(artist)) return SC.song;
    return Object.values(SC.data.songLibrary || {}).map(row => row.song).find(song => normal(song?.title) === normal(title) && normal(song?.artist) === normal(artist));
  }
  SC.ensureBackendProject = async (container, kind = 'input') => {
    const p = container || (SC.data.homeBackendProject ||= {id: 'home:input', name: '主页'});
    if (p.deleted || SC.data.deletedContainers?.[p.id]) throw new Error('保存位置已删除，本次操作未执行。');
    if (!Number.isInteger(p.backendProjectId)) {
      const epoch = SC.ui.dataEpoch || 0;
      if (!projectsPending.has(p.id)) projectsPending.set(p.id, request('/api/projects', {name: p.name, kind}).then(result => { if (p.deleted || SC.data.deletedContainers?.[p.id] || epoch !== (SC.ui.dataEpoch || 0)) throw new Error('保存位置已删除，旧结果未采用。'); p.backendProjectId = result.id; SC.persist(); return result.id; }).finally(() => projectsPending.delete(p.id)));
      await projectsPending.get(p.id);
    }
    return p.backendProjectId;
  };
  async function project(song) {
    if (songDeleted(song)) throw new Error('歌曲项目已删除，本次操作未执行。');
    const books = isCurrent(song) ? SC.ensureSongBooks() : null;
    const p = books?.project || SC.data.projects.find(row => row.id === `song:${song.id}`);
    if (!p) throw new Error('歌曲项目已删除，请重新打开歌曲。');
    return SC.ensureBackendProject(p, 'song');
  }
  function fromPayload(payload, previous, key) {
    const draft = !payload.lines?.length && payload.transcription?.status === 'completed' && payload.transcription.source !== 'alignment';
    const lines = draft ? payload.transcription.segments : payload.lines;
    return {...previous, id: key, title: payload.title || previous.title, artist: payload.artist || previous.artist,
      lines: (lines || []).map(line => ({t: line.time, end: line.end, text: line.text, translation: line.translation_en || '', ...(line.translation_zh ? {translationZh:line.translation_zh,translationZhOrigin:line.translation_zh_origin || 'source'} : {}), matched: line.matched, score: line.score})),
      audioUrl: payload.audio_status === 'unavailable' ? '' : payload.url || '', audioStatus: payload.audio_status,
      lyricSource: payload.lyrics_source_url || payload.source_url || (payload.file_id ? '' : payload.media === 'netease' ? `https://music.163.com/#/song?id=${payload.song_id}` : payload.song_id ? `https://y.qq.com/n/ryqq/songDetail/${payload.song_id}` : ''),
      lyricsOrigin: draft ? 'asr' : payload.lyrics_source, lyricsSourceId: payload.lyrics_source_id, lyricsHash: payload.lyrics_text_hash,
      provider: payload.provider, duration: payload.duration || previous.duration || 0, timingStatus: draft ? 'draft' : payload.timing_status,
      lyricsConfirmed: !draft && payload.lyrics_confirmed !== false, transcription: payload.transcription};
  }
  function syncLyrics(song, payload) {
    if (songDeleted(song)) return;
    const next = fromPayload(payload, song, song.id), old = song.lines;
    let edits = SC.data.songEditsBySong?.[song.id] || {};
    if (next.lyricsSourceId && next.lyricsHash !== song.lyricsHash && Object.keys(edits).length) {
      record(song).previousDraft = {lines: structuredClone(old), edits: structuredClone(edits)};
      edits = {}; delete SC.data.songEditsBySong[song.id];
    }
    next.lines.forEach((line, i) => {
      if (old[i]?.text === line.text) {
        if (!line.translation) line.translation = old[i].translation || '';
        for (const field of ['note', 'translationOrigin', 'noteOrigin', 'translationZh', 'translationZhOrigin']) if (old[i][field] != null) line[field] = old[i][field];
      }
      if (edits[i]) Object.assign(line, edits[i]);
    });
    if (isCurrent(song) && JSON.stringify(old.map(line => line.text)) !== JSON.stringify(next.lines.map(line => line.text))) { SC.ui.songSelection = null; SC.ui.songNote = null; }
    Object.assign(song, {lines: next.lines, timingStatus: next.timingStatus, lyricsConfirmed: next.lyricsConfirmed, transcription: next.transcription,
      lyricSource: next.lyricSource, lyricsOrigin: next.lyricsOrigin, lyricsSourceId: next.lyricsSourceId, lyricsHash: next.lyricsHash});
    record(song).transcription = next.transcription; saveSong(song); refresh(song);
  }
  async function applyTranscription(song) {
    if (songDeleted(song)) return;
    const r = record(song), job = r.transcription;
    if (job?.status !== 'completed') return;
    if (job.source !== 'alignment') {
      if (!song.lines.length) syncLyrics(song, {lines: [], transcription: job, lyrics_confirmed: false});
      return;
    }
    const snapshot = JSON.stringify(song.lines.map(({t, end, text}) => ({t, end, text})));
    const result = await request(musicPath(r.musicId));
    if (songDeleted(song)) return;
    if (snapshot !== JSON.stringify(song.lines.map(({t, end, text}) => ({t, end, text})))) return;
    syncLyrics(song, result.payload);
    song.lines.forEach((line, i) => { if (job.segments?.[i]?.text === line.text) Object.assign(line, {matched: job.segments[i].matched, score: job.segments[i].score}); });
    saveSong(song); refresh(song);
  }
  SC.songLineEnd = index => {
    const line = SC.song.lines[index];
    if (!line || !Number.isFinite(line.t)) return null;
    if (Number.isFinite(line.end) && line.end > line.t) return Math.min(line.end, SC.song.duration);
    return SC.song.lines.slice(index + 1).find(row => Number.isFinite(row.t) && row.t > line.t)?.t || SC.song.duration;
  };
  async function probeAudio(url) {
    const probe = new Audio(); probe.preload = 'metadata';
    return new Promise((resolve, reject) => {
      const finish = (value, error) => { clearTimeout(timer); probe.onloadedmetadata = probe.onerror = null; probe.removeAttribute('src'); probe.load(); error ? reject(error) : resolve(value); };
      const timer = setTimeout(() => finish(null, new Error('音频读取超时，原有音源保持不变。')), 12000);
      probe.onloadedmetadata = () => Number.isFinite(probe.duration) && probe.duration > 0 ? finish(probe.duration) : finish(null, new Error('音频时长无法读取。'));
      probe.onerror = () => finish(null, new Error('浏览器无法解码这个音频，原有音源保持不变。'));
      probe.src = url;
    });
  }
  async function attachAudio(song, url, sourceName, knownDuration, preserveSpeech = false) {
    if (SC.song !== song || songDeleted(song)) return;
    const player = SC.player, epoch = ++player.loadEpoch, dataEpoch = SC.ui.dataEpoch || 0;
    const current = () => SC.song === song && epoch === player.loadEpoch && dataEpoch === (SC.ui.dataEpoch || 0) && !songDeleted(song);
    if (!current()) return;
    const duration = knownDuration || await probeAudio(url);
    if (!current()) return;
    if (!preserveSpeech && SC.route === 'songs') SC.stopSpeech();
    player.audio.pause(); player.clip = null; player.available = true; player.sourceName = sourceName;
    player.sourceDuration = duration; song.duration = duration;
    if (player.objectUrl) URL.revokeObjectURL(player.objectUrl);
    player.objectUrl = null;
    player.ready = new Promise((resolve, reject) => {
      const done = () => { player.audio.removeEventListener('loadedmetadata', done); player.audio.removeEventListener('error', fail); resolve(); };
      const fail = () => { player.audio.removeEventListener('loadedmetadata', done); player.audio.removeEventListener('error', fail); reject(new Error('音源暂不可播放，请更换音频或刷新音源。')); };
      player.audio.addEventListener('loadedmetadata', done); player.audio.addEventListener('error', fail);
    });
    player.audio.src = url;
    await player.ready;
    if (!current()) return;
    saveSong(song); SC.updatePlayer(); refresh(song);
  }
  SC.restoreSavedSong = projectId => {
    const key = String(projectId || '').replace(/^song:/, ''), saved = SC.data.songLibrary?.[key];
    if (!SC.data.projects.some(row => row.id === 'song:' + key) || SC.data.deletedContainers?.['song:' + key] || !saved?.song || saved.song.id !== key) {
      SC.toast('这首歌曲的保存内容已删除或不存在。'); return false;
    }
    SC.ui.savedSongNavigation = key;
    SC.ui.songSearchEpoch = (SC.ui.songSearchEpoch || 0) + 1;
    const next = structuredClone(saved.song);
    Object.entries(SC.data.songEditsBySong?.[key] || {}).forEach(([index, values]) => { if (next.lines[index]) Object.assign(next.lines[index], values); });
    const player = SC.player, audio = player.audio, sameSong = SC.song.id === key;
    const bound = audio.getAttribute?.('src') || audio.src || '';
    if (sameSong && SC.song.audioUrl === next.audioUrl && bound === (next.audioUrl || '') && !audio.error && player.available === !!next.audioUrl) {
      SC.song = next; SC.data.currentSong = key; return true;
    }
    const position = sameSong ? audio.currentTime : 0, loop = sameSong ? {loopMode:player.loopMode, lineIndex:player.lineIndex, section:player.section.slice(), clip:player.clip, audioLoop:audio.loop} : null;
    const epoch = ++player.loadEpoch;
    audio.pause(); clearTimeout(player.boundaryTimer);
    player.available = false; player.clip = null; player.loopMode = null; player.activeLine = -1; player.lineIndex = 0; player.section = [0, 1]; audio.loop = false;
    if (player.objectUrl) URL.revokeObjectURL(player.objectUrl);
    player.objectUrl = null; audio.removeAttribute('src'); audio.load();
    SC.song = next;
    SC.ui.songSelection = null; SC.ui.songNote = null;
    SC.data.currentSong = key; player.sourceName = saved.sourceName || SC.song.provider || '保存的原唱'; player.sourceDuration = Number(SC.song.duration) || 0;
    player.ready = Promise.resolve();
    if (SC.song.audioUrl) {
      player.available = true;
      player.ready = new Promise(resolve => {
        const done = () => {
          audio.removeEventListener('loadedmetadata', done); audio.removeEventListener('error', done);
          if (epoch === player.loadEpoch && SC.song.id === key) {
            const exists = SC.data.projects.some(row => row.id === 'song:' + key) && !SC.data.deletedContainers?.['song:' + key];
            player.available = exists && !audio.error;
            if (player.available && sameSong) {
              if (Number.isFinite(position)) audio.currentTime = Math.min(Math.max(0, position), Number.isFinite(audio.duration) ? audio.duration : position);
              Object.assign(player, {loopMode:loop.loopMode, lineIndex:loop.lineIndex, section:loop.section, clip:loop.clip}); audio.loop = loop.audioLoop;
            }
            if (exists) { SC.updatePlayer(); refresh(SC.song); }
          }
          resolve();
        };
        audio.addEventListener('loadedmetadata', done); audio.addEventListener('error', done); audio.src = SC.song.audioUrl; audio.load();
      });
    }
    SC.persist(); return true;
  };
  SC.syncSavedSongState = () => {
    const key = SC.data.currentSong;
    if (key && SC.data.songLibrary?.[key]?.song && !songDeleted({id:key}) && SC.data.projects.some(row => row.id === 'song:' + key)) return SC.restoreSavedSong('song:' + key);
    const player = SC.player;
    if (player) {
      player.loadEpoch++; player.audio.pause(); clearTimeout(player.boundaryTimer);
      player.audio.removeAttribute('src'); player.audio.load(); player.available = false; player.clip = null; player.loopMode = null; player.audio.loop = false;
    }
    SC.song = {id:'', title:'', artist:'', duration:0, lines:[]}; delete SC.data.currentSong;
    return false;
  };
  async function adopt(result, key, fallback, sourceName) {
    if (SC.data.deletedContainers?.[`song:${key}`]) return;
    const newlyImported = !SC.data.songLibrary?.[key] && SC.song.id !== key;
    const route = SC.route;
    SC.ui.savedSongNavigation = null;
    const active = runs.get(key)?.song || (SC.song.id === key ? SC.song : SC.data.songLibrary?.[key]?.song);
    const incoming = fromPayload(result.payload, active || fallback, key);
    if (incoming.lyricsSourceId && incoming.lyricsHash !== active?.lyricsHash && Object.keys(SC.data.songEditsBySong?.[key] || {}).length) {
      const stored = SC.data.songLibrary[key];
      if (stored) stored.previousDraft = {lines: structuredClone(active?.lines || stored.song.lines), edits: structuredClone(SC.data.songEditsBySong[key])};
      delete SC.data.songEditsBySong[key];
    }
    incoming.lines.forEach((line, i) => {
      if (active?.lines[i]?.text !== line.text) return;
      if (!line.translation) line.translation = active.lines[i].translation;
      for (const field of ['note', 'translationOrigin', 'noteOrigin', 'translationZh', 'translationZhOrigin']) if (active.lines[i][field] != null) line[field] = active.lines[i][field];
    });
    const song = active ? Object.assign(active, incoming) : incoming;
    // User-corrected text belongs to the browser notebook and wins over fetched lyrics.
    const edits = SC.data.songEditsBySong?.[key] || {};
    for (const [index, value] of Object.entries(edits)) if (song.lines[index]) Object.assign(song.lines[index], value);
    if (route === 'songs') SC.stopSpeech(); SC.player.audio.pause(); SC.player.available = false; SC.player.clip = null;
    SC.song = song; const books = SC.ensureSongBooks(); if (books.project.deleted) return; books.project.backendProjectId = result.project_id;
    const r = record(song); if (newlyImported) r.analysisPolicy = 'ai-missing-v1';
    r.musicId = result.id; r.backendProjectId = result.project_id; r.metadataTried = true; r.transcription = result.payload.transcription;
    if (sourceName) r.sourceName = sourceName;
    saveSong(song); SC.ui.songNote = null; SC.ui.songSelection = null;
    if (song.audioUrl) {
      try { await attachAudio(song, song.audioUrl, sourceName || (result.payload.file_id ? result.payload.file_name || '本地原唱' : result.payload.provider || '在线原唱'), undefined, route !== 'songs'); }
      catch (error) { r.audioError = error.message; }
    }
    if (SC.route === 'songs') SC.go('songs');
    prepareSong(song);
    if (r.transcription?.status === 'running') pollTranscription(song);
    return song;
  }
  SC.rebuildSongContexts = (song = SC.song) => {
    if (songDeleted(song)) return;
    const signature = JSON.stringify(song.lines.map(line => line.text)), r = record(song);
    if (r.contextSignature === signature) return;
    const prepared = window.SCRAWL_PREPARED_STUDIES?.[song.lyricsSourceId];
    for (const note of SC.data.items) {
      const previous = (note.contexts || []).filter(context => context.songId === song.id);
      if (!previous.length) continue;
      const known = prepared && prepared.lyrics_hash === song.lyricsHash ? [...prepared.words, ...prepared.grammar].find(row => row.text === note.text) : null;
      const rebuilt = [];
      for (const context of previous) {
        const surface = context.surface || note.surface || known?.surface || (note.kind === 'sentence' ? note.text : '');
        if (!surface || !context.original.includes(surface)) continue;
        song.lines.forEach((line, lineIndex) => {
          if (line.text === context.original && !rebuilt.some(row => row.lineIndex === lineIndex && row.meaning === context.meaning)) rebuilt.push({...context, lineIndex, surface});
        });
      }
      note.contexts = [...(note.contexts || []).filter(context => context.songId !== song.id), ...rebuilt];
    }
    SC.repairKnownSongContext?.(song);
    r.contextSignature = signature; SC.persist();
  };
  function mergeNotes(song, books, result, start, input, captionsAllowed = true) {
    const saved = [];
    if (songDeleted(song) || books.project?.deleted) return saved;
    input.forEach((text, offset) => {
      const line = song.lines[start + offset];
      const edit = SC.data.songEditsBySong?.[song.id]?.[start + offset];
      const generated = result.lines?.[offset];
      if (!line || line.text !== text || !generated || generated.text && generated.text !== text) return;
      for (const [field, incoming] of [['translation', generated.translation_en], ['note', generated.note_zh]]) {
        if (!String(line[field] || '').trim() && !Object.hasOwn(edit || {}, field) && typeof incoming === 'string' && incoming.trim()) {
          line[field] = incoming; line[field + 'Origin'] = generated.origin || 'source';
        }
      }
    });
    if (captionsAllowed) adoptTranslations(song, input.map((text, offset) => ({index:start + offset,text})), result);
    for (const [kind, rows, book] of [['word', result.words || [], books.words], ['grammar', result.grammar || [], books.grammar]]) {
      if (book.deleted || SC.data.deletedContainers?.[book.id] || !SC.data.books.some(row => row.id === book.id)) continue;
      if (kind === 'grammar' && SC.allowDittoGrammarWrite && !SC.allowDittoGrammarWrite(book.id)) continue;
      for (const row of rows) {
        const surface = row.surface || (kind === 'word' ? row.text : row.source_ko || row.example_ko);
        const matching = input.map((text, offset) => ({text, offset, lineIndex: start + offset})).filter(line => {
          if (!surface || !line.text.includes(surface) || row.source_ko && !line.text.includes(row.source_ko)) return false;
          return Array.isArray(row.line_indices) ? row.line_indices.includes(line.offset) : Number.isInteger(row.line_index) ? line.lineIndex === row.line_index : true;
        });
        const sources = result.verification === 'Codex 基于来源整理' && matching.length ? song.lines.map((line, lineIndex) => ({text: line.text, lineIndex})).filter(line => matching.some(match => match.text === line.text)) : matching;
        const original = matching[0]?.text;
        const authored = result.verification === 'Codex 基于来源整理';
        const fields = {text: row.text, meaning: row.meaning_en || '', pos: row.pos || '', surface: row.surface || '', formNote: row.form_note_zh || (row.surface && row.surface !== row.text ? row.note_zh || '' : ''),
          explanation: row.explanation_zh || '', formation: row.formation || '', usage: row.usage_zh || '',
          example: kind === 'word' && original && !authored ? original : row.example_ko || original || '', translation: kind === 'word' && original && !authored ? song.lines[matching[0].lineIndex].translation : row.example_en || '',
          cloze: row.cloze || '', clozeAnswer: row.cloze_answer || '', note: authored && kind === 'word' && original ? `歌词原句：${original}\n${row.note_zh || ''}` : row.note_zh || '', source_ko: row.source_ko || '', needs_review: !!row.needs_review, review_note: row.review_note || '', verification: result.verification || 'AI 生成', origin: row.origin || (authored ? 'source' : undefined), ...(row.evidence ? {evidence: structuredClone(row.evidence)} : {})};
        const note = SC.addItem(book.id, fields); if (!note) continue;
        if (kind === 'word') saved.push(note);
        note.contexts ||= [];
        for (const line of sources) {
          const context = {songId: song.id, lineIndex: line.lineIndex, original: line.text, surface: surface || '', formNote: fields.formNote, meaning: row.meaning_en || '', translation: song.lines[line.lineIndex]?.translation || '', source: song.title};
          if (!note.contexts.some(old => old.songId === context.songId && old.lineIndex === context.lineIndex && old.meaning === context.meaning && old.original === context.original)) note.contexts.push(context);
        }
        SC.repairDerivedForms?.(note);
      }
    }
    return saved;
  }
  function lyricSources(song, books, input) {
    const ids = new Set([books.words.id, books.grammar.id, books.sentences?.id]);
    const units = (SC.practiceSourceUnits?.(SC.data.items.filter(item => ids.has(item.bookId))) || []).filter(unit => input.includes(unit.text));
    song.lines.forEach((line, index) => {
      const edit = SC.data.songEditsBySong?.[song.id]?.[index];
      if (!input.includes(line.text) || !edit || !Object.hasOwn(edit, 'translation') || !String(edit.translation || '').trim() || edit.text !== line.text) return;
      if (!units.some(unit => unit.text === line.text && (unit.meaning || unit.meaningZh))) units.push({id: `${song.id}:line:${index}`, text: line.text, meaning: edit.translation, meaningZh: '', note: '', original_note: line.text, source_file_id: '', words: [], grammar: []});
    });
    return units;
  }
  const lyricsSnapshot = song => JSON.stringify(song.lines.map(line => line.text));
  function translationState(song) {
    const r = record(song), snapshot = lyricsSnapshot(song);
    if (r.translationZhState?.policy !== 'zh-v1' || r.translationZhState.snapshot !== snapshot) r.translationZhState = {policy:'zh-v1',snapshot,attempts:{}};
    return r.translationZhState;
  }
  const translationLocked = (song, index) => Object.hasOwn(SC.data.songEditsBySong?.[song.id]?.[index] || {}, 'translationZh');
  SC.songLineTranslation = (line, index, song = SC.song) => translationLocked(song,index) && !line?.translationZh ? '' : line?.translationZh || line?.translation || '';
  const missingTranslations = song => song.lines.flatMap((line, index) => !String(line.translationZh || '').trim() && !translationLocked(song,index) ? [{index,text:line.text}] : []);
  SC.songHasMissingTranslations = song => !!song?.lines?.length && missingTranslations(song).length > 0;
  function lyricBatches(rows) {
    const batches = []; let current = [], size = 0;
    for (const row of rows) {
      const length = JSON.stringify(row).length + 96;
      if (current.length && size + length > 6000) { batches.push(current); current = []; size = 0; }
      current.push(row); size += length;
    }
    if (current.length) batches.push(current);
    return batches;
  }
  function adoptTranslations(song, rows, result) {
    if (!Array.isArray(result.lines) || !result.lines.some(line=>Object.hasOwn(line || {},'translation_zh'))) {
      const state = record(song).translationZhState;
      if (state?.snapshot === lyricsSnapshot(song)) for (const row of rows) if (state.attempts[row.index]?.status === 'pending') state.attempts[row.index].status = 'failed';
      return [];
    }
    const state = translationState(song), seen = new Set(), failures = [];
    for (const [position, incoming] of (Array.isArray(result.lines) ? result.lines : []).entries()) {
      if (!Object.hasOwn(incoming || {}, 'translation_zh')) continue;
      const offset = incoming.index ?? position, row = Number.isInteger(offset) && rows[offset], line = row && song.lines[row.index];
      if (!row || seen.has(offset) || incoming.text !== row.text || line?.text !== row.text || typeof incoming.translation_zh !== 'string') { failures.push('部分译文未对应原句，未采用。'); continue; }
      seen.add(offset);
      if (incoming.translation_zh.trim() && !String(line.translationZh || '').trim() && !translationLocked(song,row.index)) Object.assign(line,{translationZh:incoming.translation_zh.trim(),translationZhOrigin:incoming.translation_zh_origin || 'ai'});
    }
    for (const row of rows) if (state.attempts[row.index]) state.attempts[row.index].status = String(song.lines[row.index]?.translationZh || '').trim() || translationLocked(song,row.index) ? 'done' : 'failed';
    return failures;
  }
  function updateSongTranslations(song) {
    if (!isCurrent(song) || SC.route !== 'songs') return;
    SC.$('#lyricsScroll')?.querySelectorAll('[data-line]').forEach(element => {
      const index = Number(element.dataset.line), line = song.lines[index], text = SC.songLineTranslation(line,index,song);
      let caption = element.querySelector('.lyric-translation');
      if (!text) { caption?.remove(); return; }
      if (!caption) { caption = document.createElement('p'); caption.className = 'lyric-translation'; element.querySelector('p.ko')?.after(caption); }
      caption.textContent = text;
      caption.onclick = event => event.stopPropagation(); caption.ondblclick = event => event.stopPropagation();
    });
  }
  SC.prepareSongTranslations = (song = SC.song, {force = false} = {}) => {
    if (translationRuns.has(song.id)) return translationRuns.get(song.id);
    if (!song.id || songDeleted(song) || !isCurrent(song) || SC.route !== 'songs' || song.lyricsConfirmed === false || !song.lines.length) return Promise.resolve(false);
    const r = record(song);
    if (runs.has(song.id)) return runs.get(song.id).promise.then(() => SC.prepareSongTranslations(song,{force}));
    if (r.analysisPolicy === 'ai-missing-v1' && !r.analysisStatus && SC.ui.savedSongNavigation !== song.id) return Promise.resolve(false);
    const epoch = SC.ui.dataEpoch || 0, navigation = SC.ui.navigationEpoch || 0, snapshot = lyricsSnapshot(song);
    let state;
    const current = () => SC.song === song && SC.route === 'songs' && navigation === (SC.ui.navigationEpoch || 0) && epoch === (SC.ui.dataEpoch || 0) && !songDeleted(song) && lyricsSnapshot(song) === snapshot;
    const task = Promise.resolve().then(async () => {
      const config = await settings(); if (!current() || !config.api_key_set || !config.text_model || config.demo) return false;
      state = translationState(song); const targets = missingTranslations(song).filter(row => force || !state.attempts[row.index]);
      if (!targets.length) return false;
      r.translationZhStatus = 'running'; delete r.translationZhError;
      for (const rows of lyricBatches(targets)) {
        if (!current()) return false;
        for (const row of rows) state.attempts[row.index] = {text:row.text,status:'pending'};
        record(song).song = structuredClone(song); if (SC.persist() === false) throw new Error('中文译文准备状态未能保存，请释放浏览器空间后重试。');
        try {
          const result = await request('/api/lyrics/analyze',{lines:rows.map(row=>row.text),fill_missing:true,translation_language:'zh',translations_only:true,force,existing_notes:{lines:rows.map(row=>({translation_en:song.lines[row.index].translation || '',translation_zh:''}))}});
          if (!current()) return false;
          const errors = adoptTranslations(song,rows,result);
          errors.push(...(result.errors || []).map(error=>error.message || '').filter(Boolean));
          if (rows.some(row=>state.attempts[row.index].status === 'failed')) errors.push('部分中文译文尚未准备好，可右键重试。');
          if (errors.length) r.translationZhError = [...new Set(errors)].join('；');
          if (saveSong(song) === false) throw Object.assign(new Error('中文译文暂留本轮，未能保存；请先导出当前内容。'),{storage:true}); updateSongTranslations(song);
        } catch (error) {
          if (error.storage) throw error;
          if (!current()) return false;
          rows.forEach(row=>state.attempts[row.index].status = 'failed'); r.translationZhError = error.message; saveSong(song);
        }
      }
      r.translationZhStatus = missingTranslations(song).length ? 'partial' : 'completed'; saveSong(song); return true;
    }).catch(error => { if (current()) { r.translationZhStatus = 'failed'; r.translationZhError = error.message; saveSong(song); } return false; }).finally(() => {
      if (state && SC.data.songLibrary?.[song.id] === r && r.translationZhState === state) {
        let interrupted = false;
        for (const attempt of Object.values(state.attempts)) if (attempt.status === 'pending') { attempt.status = 'interrupted'; interrupted = true; }
        if (interrupted) { r.translationZhStatus = 'interrupted'; SC.persist(); }
      }
      translationRuns.delete(song.id);
    });
    translationRuns.set(song.id,task); return task;
  };
  SC.retrySongTranslations = song => SC.prepareSongTranslations(song || SC.song,{force:true});
  SC.analyzeSong = (song = SC.song, {force = false} = {}) => {
    if (!song.id || songDeleted(song)) return Promise.resolve();
    if (runs.has(song.id)) return runs.get(song.id).promise;
    const epoch = SC.ui.dataEpoch || 0, navigation = SC.ui.navigationEpoch || 0;
    let captionState;
    const promise = Promise.resolve().then(async () => {
      const r = record(song);
      if (!song.lines.length || song.lyricsConfirmed === false) return;
      if (r.analysisPolicy === 'ai-missing-v1' && ['failed', 'partial'].includes(r.analysisStatus) && !force) return;
      const books = isCurrent(song) ? SC.ensureSongBooks() : null; if (!books || books.project.deleted || books.words.deleted && books.grammar.deleted) return;
      SC.rebuildSongContexts(song);
      try {
        const prepared = window.SCRAWL_PREPARED_STUDIES?.[song.lyricsSourceId];
        const usePrepared = prepared && prepared.lyrics_hash === song.lyricsHash;
        if (usePrepared) for (const row of prepared.words) {
          const note = SC.data.items.find(item => item.bookId === books.words.id && item.text === row.text), original = song.lines[row.line_index]?.text;
          if (note && !note.protectedOriginal && !note.manual && note.verification === prepared.verification && note.example === original && !note.translation) Object.assign(note, {example: row.example_ko, translation: row.example_en, note: `歌词原句：${original}\n${row.note_zh || ''}`});
        }
        const fillMissing = !usePrepared && r.analysisPolicy === 'ai-missing-v1';
        r.analysisOrigin = usePrepared ? 'codex' : fillMissing ? 'ai' : 'sources';
        r.analysisDone ||= []; r.analysisAttempted ||= []; r.analysisNotices ||= {}; r.analysisWarnings = []; r.analysisStatus = 'running'; r.analysisStarted = Date.now(); delete r.analysisError;
        const rows = song.lines.map((line,index)=>({index,text:line.text}));
        const batches = fillMissing ? lyricBatches(rows) : Array.from({length:Math.ceil(rows.length/6)},(_,index)=>rows.slice(index*6,index*6+6));
        for (const [batchIndex, batch] of batches.entries()) {
          const start = batch[0].index;
          if (songDeleted(song) || epoch !== (SC.ui.dataEpoch || 0)) return;
          const input = batch.map(row=>row.text), sources = usePrepared ? [] : lyricSources(song, books, input), sourceHash = JSON.stringify(sources), key = JSON.stringify(usePrepared ? [start, input, prepared.revision || 1] : fillMissing ? [start, input, 'line-associations-v5-ai-zh'] : [start, input, 'line-associations-v3-source', sources]);
          r.analysisBatch = batchIndex + 1; r.analysisTotal = batches.length;
          if (r.analysisDone.includes(key) || fillMissing && r.analysisAttempted.includes(key) && !force) { r.analysisWarnings = currentNotices([...r.analysisWarnings, ...(r.analysisNotices[key] || [])]); continue; }
          refresh(song);
          r.analysisActiveKey = key;
          if (fillMissing) {
            if (!r.analysisAttempted.includes(key)) r.analysisAttempted.push(key);
            r.analysisNotices[key] = ['上次整理未完成，可手动继续。'];
            const state = captionState = translationState(song);
            batch.filter(row=>!String(song.lines[row.index].translationZh || '').trim()&&!translationLocked(song,row.index)).forEach(row=>state.attempts[row.index]={text:row.text,status:'pending'});
            if (saveSong(song) === false) throw new Error('浏览器未能保存准备状态，请先导出当前内容。');
          }
          const existingNotes = {words: SC.data.items.filter(item => item.bookId === books.words.id && item.meaning?.trim()).map(item => item.text), grammar: SC.data.items.filter(item => item.bookId === books.grammar.id && item.explanation?.trim()).map(item => item.text), lines: song.lines.slice(start, start + input.length).map((line,offset) => ({translation_en: line.translation || '', note_zh: line.note || '',translation_zh:line.translationZh || '',translation_zh_locked:translationLocked(song,start+offset)}))};
          const result = usePrepared ? {verification: prepared.verification,
            words: prepared.words.filter(row => row.line_index >= start && row.line_index < start + input.length),
            grammar: prepared.grammar.filter(row => row.line_index >= start && row.line_index < start + input.length)} : await request('/api/lyrics/analyze', {lines: input, source_units: sources, ...(fillMissing ? {fill_missing: true, translation_language:'zh',force, existing_notes: existingNotes} : {})});
          const current = song.lines.slice(start, start + input.length);
          if (songDeleted(song) || epoch !== (SC.ui.dataEpoch || 0)) return;
          if (song.lyricsConfirmed === false || current.length !== input.length || current.some((line, i) => line.text !== input[i])) throw new Error('歌词已修改，旧解析未入库；请重新整理。');
          if (!usePrepared && sourceHash !== JSON.stringify(lyricSources(song, books, input))) throw new Error('歌词来源已修改，旧解析未入库；请重新整理。');
          mergeNotes(song, books, result, start, input, SC.song === song && SC.route === 'songs' && navigation === (SC.ui.navigationEpoch || 0));
          r.analysisNotices[key] = currentNotices([...(result.errors || []).map(error => error.message), ...(result.source_status || []).map(status => status.message)]);
          r.analysisWarnings = currentNotices([...r.analysisWarnings, ...r.analysisNotices[key]]);
          if (!fillMissing || !r.analysisNotices[key].length) r.analysisDone.push(key);
          saveSong(song); refresh(song);
        }
        r.analysisStatus = r.analysisWarnings.length ? 'partial' : 'completed'; r.analysisElapsed = (Date.now() - r.analysisStarted) / 1000; saveSong(song); refresh(song);
      } catch (error) { if (!songDeleted(song) && epoch === (SC.ui.dataEpoch || 0)) { r.analysisStatus = 'failed'; r.analysisError = error.message; if (r.analysisPolicy === 'ai-missing-v1' && r.analysisActiveKey) r.analysisNotices[r.analysisActiveKey] = currentNotices([error.message]); for (const attempt of Object.values(r.translationZhState?.attempts || {})) if (attempt.status === 'pending') attempt.status = 'failed'; saveSong(song); refresh(song); } }
    }).finally(() => {
      runs.delete(song.id);
      const r = SC.data.songLibrary?.[song.id];
      if (captionState && r?.translationZhState === captionState && epoch === (SC.ui.dataEpoch || 0)) {
        let interrupted = false;
        for (const attempt of Object.values(captionState.attempts)) if (attempt.status === 'pending') { attempt.status = 'interrupted'; interrupted = true; }
        if (interrupted) { r.translationZhStatus = 'interrupted'; SC.persist(); }
      }
      if (r?.analysisStatus === 'running' && (songDeleted(song) || epoch !== (SC.ui.dataEpoch || 0))) { r.analysisStatus = 'failed'; r.analysisError = '卡片范围已删除或改变，旧整理结果未保存。'; SC.persist(); refresh(song); }
    });
    runs.set(song.id, {song, promise}); return promise;
  };
  SC.songAnalysisMessage = () => {
    const r = record(SC.song);
    return r.analysisStatus === 'running' ? '正在整理…' : '';
  };
  SC.openSongDetails = () => {
    const r = record(SC.song), source = SC.song.lyricSource || SC.song.source;
    const prepared = window.SCRAWL_PREPARED_STUDIES?.[SC.song.lyricsSourceId];
    const references = prepared && prepared.lyrics_hash === SC.song.lyricsHash ? prepared.references : [];
    const annotations = SC.ensureSongBooks().project.noteAnnotations || [];
    const captionOrigins = new Set(SC.song.lines.filter(line=>line.translationZh).map(line=>['manual','human'].includes(line.translationZhOrigin) ? '人工修改' : line.translationZhOrigin === 'source' ? '原文资料' : 'AI 补充'));
    const captions = captionOrigins.size ? `<p>中文译文：${[...captionOrigins].join('、')}</p>` : '';
    const captionStatus = r.translationZhStatus === 'running' ? '<p>正在补充中文译文…</p>' : ['partial','failed','interrupted'].includes(r.translationZhStatus) ? '<p>部分译文未完成，可右键重试中文译文。</p>' : '';
    const link = (url, label) => /^https?:\/\//.test(url || '') ? `<a href="${SC.esc(url)}" target="_blank" rel="noopener">${SC.esc(label)}</a>` : SC.esc(label);
    SC.info('资料详情', `<p>歌词：${SC.esc(SC.song.lyricsConfirmed === false ? '识别草稿，待确认' : SC.song.lines.length ? '已取得' : '未取得')}${source ? ' · ' + link(source, '查看来源') : ''}</p><p>音频：${SC.esc(SC.player.available ? '已取得' : '未取得')}</p><p>卡片：${SC.esc(r.analysisStatus === 'completed' ? '已整理' : SC.songAnalysisMessage())}</p><p>时间：${SC.esc(SC.song.timingStatus === 'confirmed' ? '已校对' : '待校对')}</p>${captions}${captionStatus}${references.length ? '<details><summary>参考资料</summary>' + references.map(row => '<p>' + link(row.url, row.title) + '</p>').join('') + '</details>' : ''}${annotations.length ? '<details><summary>笔记附注</summary>' + annotations.map(row => `<small>${SC.esc(row.name || '')}</small><p>${SC.esc(row.original_note)}</p>`).join('') + '</details>' : ''}`);
  };
  SC.songStatusHTML = () => {
    const r = record(SC.song), job = r.transcription || SC.song.transcription;
    let transcription = '';
    const phase = {loading_model: '准备同步', recognizing: '识别音频', matching: '同步歌词', aligning: '同步歌词'}[job?.phase] || '处理音频';
    if (job?.status === 'running') transcription = `<span>${phase}</span><button class="quiet-button" id="cancelTranscription">取消</button>`;
    else if (SC.song.lines.length && SC.song.lyricsConfirmed === false) transcription = '<button class="quiet-button" id="reviewTranscription">确认文字</button>';
    else if (['failed', 'interrupted', 'cancelled'].includes(job?.status)) transcription = '<span>音频处理未完成</span><button class="quiet-button" id="retryTranscription">重试</button>';
    const task = SC.data.musicImportJob;
    const progress = task ? `<span class="song-import-progress">${task.status === 'running' ? '正在取得音轨…' : '音轨获取未完成'}</span>${task.status === 'running' ? '<button class="quiet-button" id="cancelMusicImport">取消</button>' : '<button class="quiet-button" id="retryMusicImport">重试</button>'}` : '';
    const content = `${r.lyricsFetching ? '<span>正在取得歌词…</span>' : ''}${transcription}${progress}`;
    return content ? `<div class="song-status" aria-live="polite">${content}</div>` : '';
  };
  SC.fetchSongLyrics = (song = SC.song) => {
    if (songDeleted(song)) return Promise.resolve();
    if (lyricFetches.has(song.id)) return lyricFetches.get(song.id);
    const r = record(song); if (!r.musicId) return Promise.resolve();
    const task = Promise.resolve().then(async () => {
      r.lyricsFetching = true; delete r.lyricsError; refresh(song);
      try {
        const epoch = SC.ui.dataEpoch || 0;
        const snapshot = JSON.stringify(song.lines.map(({text}) => text));
        const result = await request(musicPath(r.musicId) + '/lyrics/fetch', {});
        if (songDeleted(song) || epoch !== (SC.ui.dataEpoch || 0)) return;
        if (snapshot !== JSON.stringify(song.lines.map(({text}) => text))) throw new Error('歌词已修改，获取结果未覆盖当前修改。');
        syncLyrics(song, result.payload); r.analysisStatus = ''; await SC.analyzeSong(song);
      } catch (error) { r.lyricsError = error.message; saveSong(song); }
      finally { r.lyricsFetching = false; refresh(song); }
    }).finally(() => lyricFetches.delete(song.id));
    lyricFetches.set(song.id, task); return task;
  };
  async function prepareSong(song) {
    if (songDeleted(song)) return;
    const r = record(song);
    if (r.musicId && (!song.lines.length || song.lyricsConfirmed === false || song.lyricsOrigin === 'asr')) await SC.fetchSongLyrics(song);
    await SC.analyzeSong(song);
    SC.prepareSongTranslations(song);
    if (needsKnownAlignment(song, r)) SC.startSongTranscription(song);
    else if (song.audioUrl && !song.lines.length && !r.transcription) SC.startSongTranscription(song);
  }
  function songTimingPending(song) { return song.lines.length && song.lyricsConfirmed !== false && song.timingStatus !== 'confirmed'; }
  function needsKnownAlignment(song, r = record(song)) {
    return song.audioUrl && r.musicId && !r.lyricsError && songTimingPending(song) && !transcriptionStarts.has(song.id) && !['running', 'failed', 'interrupted', 'cancelled'].includes(r.transcription?.status) && r.transcription?.algorithm !== 'known-text-v1';
  }
  SC.searchSongs = async query => {
    const epoch = SC.ui.songSearchEpoch = (SC.ui.songSearchEpoch || 0) + 1;
    SC.ui.songQuery = query; SC.ui.songSearchRows = []; SC.ui.songSearchResult = '正在搜索…'; refresh(SC.song);
    try {
      if (/https?:\/\//i.test(query)) {
        const link = query.match(/https?:\/\/[^\s]+/i)?.[0];
        const url = new URL(link);
        if (!['b23.tv', 'bilibili.com', 'www.bilibili.com', 'm.bilibili.com'].includes(url.hostname.toLowerCase())) throw new Error('链接入口支持 B站视频；其他歌曲可按歌名和歌手搜索。');
        const inspected = await request('/api/music/bilibili/inspect', {link});
        if (epoch !== SC.ui.songSearchEpoch) return;
        SC.ui.songSearchResult = ''; showMediaImport({...inspected, sourceKind: 'bilibili', link}); refresh(SC.song); return;
      }
      const rows = await request('/api/music/search?q=' + encodeURIComponent(query));
      if (epoch !== SC.ui.songSearchEpoch) return;
      SC.ui.songSearchRows = rows.filter(row => !/(?:\blive\b|\bcover\b|instrumental|伴奏|纯音乐|现场|翻唱|piano|钢琴|remix)/i.test(row.title));
      SC.ui.songSearchResult = SC.ui.songSearchRows.length ? '' : '没有找到歌曲，请换个名称搜索。';
    } catch (error) { if (epoch !== SC.ui.songSearchEpoch) return; SC.ui.songSearchRows = []; SC.ui.songSearchResult = error.message; }
    refresh(SC.song);
  };
  SC.chooseSong = async row => {
    await SC.syncDeletionStartup;
    if (SC.ui.deletionSyncBlocked) return;
    const keyForRow = row.media === 'tencent' ? row.song_id : `${row.media}:${row.song_id}`;
    const savedKey = SC.data.songAliases?.[keyForRow] || keyForRow;
    if (SC.data.songLibrary?.[savedKey]?.song && SC.data.projects.some(project => project.id === 'song:' + savedKey) && !songDeleted({id:savedKey})) {
      SC.restoreSavedSong('song:' + savedKey); SC.ui.songSearchRows = []; SC.ui.songSearchResult = ''; SC.go('songs'); return;
    }
    const epoch = SC.ui.dataEpoch || 0, searchEpoch = SC.ui.songSearchEpoch = (SC.ui.songSearchEpoch || 0) + 1;
    const key = row.media === 'tencent' ? row.song_id : `${row.media}:${row.song_id}`, stored = SC.data.songLibrary?.[key];
    const current = () => epoch === (SC.ui.dataEpoch || 0) && searchEpoch === SC.ui.songSearchEpoch && !SC.data.deletedContainers?.[`song:${key}`] && (!stored || SC.data.projects.some(project => project.id === `song:${key}`));
    SC.ui.songSearchResult = '正在取得歌曲与歌词…'; refresh(SC.song);
    try {
      const result = stored?.musicId ? await request(musicPath(stored.musicId) + '/refresh', {}) : await request('/api/music/resolve', {song_id: row.song_id, media: row.media});
      if (!current()) return;
      if (normal(result.payload.title) !== normal(row.title) || normal(result.payload.artist) !== normal(row.artist)) throw new Error('音源曲目与搜索结果不一致，没有替换当前歌曲。');
      await adopt(result, key, {id: key, title: row.title, artist: row.artist, duration: 0, lines: []});
      if (!current()) return;
      SC.ui.songSearchRows = []; SC.ui.songSearchResult = '';
    } catch (error) { if (!current()) return; SC.ui.songSearchResult = error.message; }
    refresh(SC.song);
  };
  function showMediaImport(media) {
    const dialog = SC.$('#dialog'), parts = media.parts?.length ? media.parts : [{part_id: 1, title: media.title || media.name, duration: media.duration}];
    const fallbackName = String(media.title || media.name || '').replace(/\.[^.]+$/, '');
    const current = SC.song;
    const existing = media.sourceKind === 'local' ? current : null;
    const selectedPart = Number(media.selected_part || parts[0].part_id);
    SC.$('#dialogTitle').textContent = media.sourceKind === 'bilibili' ? '导入 B站音轨' : '导入视频音轨';
    SC.$('#dialogBody').innerHTML = `<p class="dialog-note">${SC.esc(media.title || media.name)} · ${formatTime(media.duration)}</p><div class="song-import-options"><label><input type="radio" name="mediaMode" value="single" checked>完整导入当前分P</label><label><input type="radio" name="mediaMode" value="collection">截取一段</label></div><div class="song-import-fields"><label class="field">歌曲名称<input name="mediaTitle" value="${SC.esc(existing?.title || fallbackName)}" required></label><label class="field">歌手<input name="mediaArtist" value="${SC.esc(existing?.artist || '')}" required></label><label class="field"${parts.length === 1 ? ' style="display:none"' : ''}>分P<select name="mediaPart">${parts.map(part => `<option value="${Number(part.part_id)}">${SC.esc(part.title)} · ${formatTime(part.duration)}</option>`).join('')}</select></label><div class="song-import-range" hidden>${media.chapters?.length ? `<label class="field">章节<select name="mediaChapter"><option value="">自选范围</option>${media.chapters.map((chapter, i) => `<option value="${i}">${SC.esc(chapter.title)} · ${formatTime(chapter.start)}</option>`).join('')}</select></label>` : ''}<label class="field">开始${timeFields('mediaStart', 0, '开始', true)}</label><label class="field">结束${timeFields('mediaEnd', Number(parts[0].duration) || Number(media.duration) || null, '结束', true)}</label></div></div><audio class="song-import-preview" controls preload="none" aria-label="试听待导入音轨"></audio><p class="small muted" id="mediaImportError" role="status"></p>`;
    SC.$('#dialogActions').innerHTML = '<button type="button" class="plain-button" id="cancelMediaImport">取消</button><button class="plain-button primary" type="submit">取得音轨</button>';
    const form = SC.$('#dialogForm'), preview = form.querySelector('audio');
    const stop = document.createElement('button'); stop.type = 'button'; stop.id = 'stopMediaPreview'; stop.className = 'plain-button'; stop.textContent = '停止全部播放'; stop.onclick = SC.stopAllAudio; preview.after(stop);
    form.elements.mediaPart.value = selectedPart;
    setTime(form, 'mediaEnd', parts.find(part => Number(part.part_id) === selectedPart)?.duration || null);
    const previewURL = () => media.sourceKind === 'bilibili' ? `/api/music/bilibili/preview/${encodeURIComponent(media.probe_id)}?part_id=${Number(form.elements.mediaPart.value)}` : media.audio_url || '/api/files/' + media.file_id;
    preview.src = previewURL();
    preview.onplay = () => { SC.stopSpeech(); SC.player.audio.pause(); };
    const stopPreview = () => { preview.pause(); preview.removeAttribute('src'); preview.load(); };
    dialog.addEventListener('close', stopPreview, {once: true});
    form.elements.mediaPart.onchange = () => {
      preview.pause(); preview.src = previewURL(); setTime(form, 'mediaStart', 0); setTime(form, 'mediaEnd', form.elements.mediaMode.value === 'single' ? parts.find(part => Number(part.part_id) === Number(form.elements.mediaPart.value))?.duration || null : null);
      if (form.elements.mediaChapter) { form.elements.mediaChapter.value = ''; form.elements.mediaChapter.disabled = Number(form.elements.mediaPart.value) !== selectedPart; }
    };
    form.querySelectorAll('[name=mediaMode]').forEach(radio => radio.onchange = () => {
      const collection = form.elements.mediaMode.value === 'collection'; disableTime(form, 'mediaStart', !collection); disableTime(form, 'mediaEnd', !collection);
      form.querySelector('.song-import-range').hidden = !collection;
      if (!collection) { setTime(form, 'mediaStart', 0); setTime(form, 'mediaEnd', parts.find(part => Number(part.part_id) === Number(form.elements.mediaPart.value))?.duration || null); }
    });
    if (form.elements.mediaChapter) form.elements.mediaChapter.onchange = () => {
      const chapter = media.chapters[Number(form.elements.mediaChapter.value)]; if (!chapter || form.elements.mediaChapter.value === '') return;
      form.elements.mediaMode.value = 'collection'; form.querySelector('.song-import-range').hidden = false; disableTime(form, 'mediaStart', false); disableTime(form, 'mediaEnd', false); setTime(form, 'mediaStart', chapter.start); setTime(form, 'mediaEnd', chapter.end); preview.currentTime = chapter.start;
    };
    preview.onloadedmetadata = () => {
      if (Number.isFinite(preview.duration)) {
        const part = parts.find(part => Number(part.part_id) === Number(form.elements.mediaPart.value));
        if (part && !Number(part.duration)) part.duration = preview.duration;
        if (form.elements.mediaMode.value === 'single' && !Number.isFinite(readTime(form, 'mediaEnd'))) setTime(form, 'mediaEnd', preview.duration);
      }
    };
    preview.onerror = () => { SC.$('#mediaImportError').textContent = '试听暂不可用，仍可填写范围后尝试获取；或上传本地文件。'; };
    SC.$('#cancelMediaImport').onclick = () => dialog.close();
    form.onsubmit = async event => {
      const epoch = SC.ui.dataEpoch || 0;
      event.preventDefault(); const title = form.elements.mediaTitle.value.trim(), artist = form.elements.mediaArtist.value.trim();
      const duration = Number(parts.find(part => Number(part.part_id) === Number(form.elements.mediaPart.value))?.duration || preview.duration);
      const full = form.elements.mediaMode.value === 'single', from = full ? 0 : readTime(form, 'mediaStart'), to = full ? duration : readTime(form, 'mediaEnd');
      if (!title || !artist || !Number.isFinite(duration) || !Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from || to > duration + .5) { SC.$('#mediaImportError').textContent = '请核对歌名、歌手和起止时间，范围须在音频内。'; return; }
      const button = form.querySelector('[type=submit]'); button.disabled = true;
      try {
        const matched = savedSong(title, artist);
        const pid = matched ? await project(matched) : (await request('/api/projects', {name: title, kind: 'song'})).id;
        const body = {project_id: pid, title, artist, ...(full ? {} : {start: from, end: to}), ...(matched && record(matched).musicId ? {id: record(matched).musicId} : {})};
        if (media.sourceKind === 'bilibili') {
          body.probe_id = media.probe_id; body.part_id = Number(form.elements.mediaPart.value);
          const result = await request('/api/music/bilibili/import', body);
          if (epoch !== (SC.ui.dataEpoch || 0) || songDeleted(current)) return;
          SC.data.musicImportJob = {...result, body, duration: to - from, link: media.link, songKey: matched?.id || null, originSongId: current.id}; SC.persist(); pollImport();
        } else {
          const result = await request('/api/music/local', {...body, file_id: media.file_id, source_file_id: media.source_file_id});
          if (epoch !== (SC.ui.dataEpoch || 0) || songDeleted(current)) return;
          await adopt(result, matched?.id || `local:${result.id}`, matched || {id: `local:${result.id}`, title, artist, duration: to - from, lines: []});
        }
        dialog.close(); refresh(SC.song);
      } catch (error) { SC.$('#mediaImportError').textContent = error.message; button.disabled = false; }
    };
    dialog.showModal();
  }
  function formatTime(time) { const seconds = Math.max(0, Math.floor(Number(time) || 0)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
  async function pollImport() {
    clearTimeout(importTimer); const pending = SC.data.musicImportJob;
    if (!pending || pending.status !== 'running' || SC.data.deletedContainers?.[`song:${pending.songKey || pending.originSongId}`]) return;
    const epoch = SC.ui.dataEpoch || 0;
    try {
      const task = await request(`/api/music/bilibili/import/${encodeURIComponent(pending.task_id)}`);
      if (SC.data.musicImportJob !== pending || epoch !== (SC.ui.dataEpoch || 0) || SC.data.deletedContainers?.[`song:${pending.songKey || pending.originSongId}`]) return;
      Object.assign(pending, task); SC.persist(); refresh(SC.song);
      if (task.status === 'completed' && task.result) {
        delete SC.data.musicImportJob; SC.persist();
        const key = pending.songKey || `bilibili:${task.result.id}`;
        await adopt(task.result, key, {id: key, title: pending.body.title, artist: pending.body.artist, duration: pending.duration || pending.body.end - pending.body.start, lines: []});
        SC.toast(SC.route === 'songs' ? '音轨已保存到本机。' : '歌曲已就绪，可在歌曲学习中打开。');
      } else if (task.status === 'running') importTimer = setTimeout(pollImport, 1200);
    } catch (error) { pending.status = 'interrupted'; pending.error = error.message; SC.persist(); refresh(SC.song); }
  }
  SC.cancelMusicImport = async () => {
    const pending = SC.data.musicImportJob; if (!pending) return;
    try { Object.assign(pending, await request(`/api/music/bilibili/import/${encodeURIComponent(pending.task_id)}`, undefined, 'DELETE')); SC.persist(); refresh(SC.song); if (pending.status === 'completed') { pending.status = 'running'; pollImport(); } }
    catch (error) { SC.toast(error.message); }
  };
  SC.retryMusicImport = async () => {
    const pending = SC.data.musicImportJob; if (!pending || pending.status === 'running') return;
    try {
      if (pending.link) pending.body.probe_id = (await request('/api/music/bilibili/inspect', {link: pending.link})).probe_id;
      Object.assign(pending, await request('/api/music/bilibili/import', pending.body)); delete pending.error; SC.persist(); refresh(SC.song); pollImport();
    }
    catch (error) { pending.error = error.message; SC.persist(); refresh(SC.song); }
  };
  function notesSong(title, artist) {
    const existing = savedSong(title, artist); if (existing) return existing;
    const song = {id: `notes:${normal(title)}:${normal(artist)}`, title, artist, duration: 0, lines: []};
    record(song); return song;
  }
  function noteBatches(units) {
    const blocks = [], batches = [], skipped = []; let block = [], batch = [], size = 0, numbered = false;
    const flushBlock = () => { if (block.length) blocks.push(block); block = []; numbered = false; };
    for (const unit of units) {
      if (typeof unit?.text !== 'string') continue;
      if (!numbered) flushBlock();
      if (!unit.text.trim()) continue;
      // Keep an extracted paragraph/table or explicit knowledge point intact.
      if (/^\s*\d+[、.．]\s*\S/.test(unit.text)) { flushBlock(); numbered = true; }
      block.push(unit);
    }
    flushBlock();
    for (const rows of blocks) {
      const length = rows.map(unit => unit.text).join('\n').length;
      if (length > 6000) { skipped.push({units: rows, reason: '这个完整知识点超过 6000 字符，原文已保留；请先明确分点后手动整理。'}); continue; }
      if (batch.length && size + length + 1 > 500) { batches.push(batch); batch = []; size = 0; }
      batch.push(...rows); size += length + 1;
      if (size > 500) { batches.push(batch); batch = []; size = 0; }
    }
    if (batch.length) batches.push(batch);
    batches.skipped = skipped; return batches;
  }
  SC.sourceNoteBatches = noteBatches;
  function sourceLocations(original, units, indices) {
    const joined = units.map(unit => unit.text).join('\n'), source = joined.trim(), lines = source.split('\n'); let start = joined.indexOf(original), offset = 0;
    if (Array.isArray(indices)) {
      const selected = indices.map(i => lines[i]).join('\n'), local = selected.indexOf(original);
      start = local < 0 ? -1 : joined.indexOf(source) + lines.slice(0, indices[0]).reduce((size, line) => size + line.length + 1, 0) + local;
    }
    return units.filter(unit => { const match = start >= 0 && offset < start + original.length && offset + unit.text.length > start; offset += unit.text.length + 1; return match; }).map(unit => unit.location);
  }
  SC.sourceLocations = sourceLocations;
  function importedRows(draft) {
    return (draft.results || []).flatMap((result, batch) => ['words', 'grammar'].flatMap(kind => (result?.[kind] || []).map((row, index) => ({row, kind, key: `${batch}:${kind}:${index}`})).filter(({row}) => !row.deleted)));
  }
  SC.parseSongNotes = async () => {
    const draft = SC.data.songNoteImport; if (!draft || draft.status === 'running') return;
    const epoch = SC.ui.dataEpoch || 0, valid = () => SC.data.songNoteImport === draft && epoch === (SC.ui.dataEpoch || 0) && !SC.data.deletedContainers?.[`song:${draft.songId}`];
    if (!valid()) return;
    try {
      if (!draft.title.trim() || !draft.artist.trim()) throw new Error('请填写歌曲名称与歌手。');
      await settings(true);
      if (!valid()) return;
      if (!SC.apiConfigured) throw new Error('文件与提取文字已保留，请先在 API 中填写 Agnes 配置，再继续整理。');
      draft.status = 'running'; draft.error = ''; draft.results ||= []; SC.persist(); if (SC.$('#dialog').open && SC.$('#dialogTitle').textContent === '导入歌曲笔记') SC.openSongNotes();
      for (let i = 0; i < draft.batches.length; i++) {
        draft.batch = i + 1; if (draft.results[i]) continue;
        SC.persist(); if (SC.$('#dialog').open && SC.$('#dialogTitle').textContent === '导入歌曲笔记') SC.openSongNotes();
        const result = await request('/api/analyze', {text: draft.batches[i].map(unit => unit.text).join('\n'), mode: 'notes', context: `歌曲：${draft.title}；歌手：${draft.artist}；文件：${draft.name}`});
        if (!valid()) return;
        draft.results[i] = result;
        SC.persist();
      }
      draft.status = 'completed';
      if (draft.skipped?.length) draft.error = `${draft.skipped.length} 个完整知识点未发送，原文已保留：${draft.skipped.map(row => row.reason).join('；')}`;
    } catch (error) { if (!valid()) return; draft.status = 'failed'; draft.error = error.message; }
    finally { if (SC.data.songNoteImport === draft && draft.status === 'running' && !valid()) { draft.status = 'failed'; draft.error = '保存范围已删除或改变，旧整理结果未保存。'; SC.persist(); } }
    SC.persist(); if (SC.$('#dialog').open && SC.$('#dialogTitle').textContent === '导入歌曲笔记') SC.openSongNotes();
  };
  SC.saveSongNotes = (keys = null) => {
    const draft = SC.data.songNoteImport; if (!draft) return;
    if (!draft.title.trim() || !draft.artist.trim()) { SC.toast('请填写歌曲名称与歌手。'); return; }
    const song = notesSong(draft.title, draft.artist), currentBooks = SC.ensureSongBooks(false, song), books = currentBooks.project.deleted || currentBooks.words.deleted || currentBooks.grammar.deleted ? SC.recreateSongBooks(song) : currentBooks, rows = importedRows(draft).filter(entry => !keys || keys.includes(entry.key));
    if (books.project.deleted || rows.some(entry => (entry.kind === 'words' ? books.words : books.grammar).deleted)) { SC.toast('保存位置已删除，本次未保存。'); return; }
    let count = 0;
    for (const {row, kind, key} of rows) {
      const raw = value => typeof value === 'string' && (row.manual || row.original_note.includes(value)) ? value : '';
      const fields = {text: raw(row.text) || row.original_note.split('\n')[0], meaning: raw(row.meaning_en), meaningZh: raw(row.meaning_zh), pos: raw(row.pos), surface: raw(row.surface), formNote: raw(row.form_note_zh), explanation: kind === 'grammar' ? row.manual ? row.explanation_zh : row.original_note : '', formation: '', usage: '', example: raw(row.example_ko), translation: raw(row.example_en), cloze: '', clozeAnswer: '', note: raw(row.note_zh), original_note: row.original_note, protectedOriginal: true, needs_review: false, review_note: '', source_file_id: draft.file_id, source_locations: sourceLocations(row.original_note, draft.batches[Number(key.split(':')[0])], row.source_indices), verification: '原笔记', ...(row.manual ? {manual: true} : {})};
      const existing = SC.data.items.find(note => note.bookId === (kind === 'words' ? books.words : books.grammar).id && note.text.normalize('NFC').trim() === fields.text.normalize('NFC').trim());
      fields.originalFields = structuredClone(fields);
      const note = SC.addItem((kind === 'words' ? books.words : books.grammar).id, fields, true); if (!note) continue;
      note.original_notes ||= [];
      const source = note.original_notes.find(source => source.file_id === draft.file_id && source.original_note === row.original_note);
      if (source) source.locations = [...new Set([...(source.locations || []), ...fields.source_locations])];
      else note.original_notes.push({file_id: draft.file_id, original_note: row.original_note, locations: fields.source_locations, needs_review: false, review_note: ''});
      if (note.source_file_id === draft.file_id && note.original_note === row.original_note) note.source_locations = [...new Set([...(note.source_locations || []), ...fields.source_locations])];
      if (!existing) { note.needs_review = false; note.review_note = ''; }
      note.contexts ||= [];
      song.lines.forEach((line, lineIndex) => { if (line.text === row.example_ko && row.original_note.includes(line.text) && !note.contexts.some(context => context.songId === song.id && context.lineIndex === lineIndex && context.original === line.text)) note.contexts.push({songId: song.id, lineIndex, original: line.text, surface: row.surface || row.text, meaning: row.meaning_en || '', source: draft.name}); });
      row.saved = true; count++;
    }
    books.project.noteAnnotations ||= [];
    for (const [batch, result] of (draft.results || []).entries()) for (const annotation of result?.annotations || []) {
      const locations = sourceLocations(annotation.original_note, draft.batches[batch], annotation.source_indices), existing = books.project.noteAnnotations.find(row => row.file_id === draft.file_id && row.original_note === annotation.original_note);
      if (existing) existing.locations = [...new Set([...(existing.locations || []), ...locations])];
      else books.project.noteAnnotations.push({...annotation, file_id: draft.file_id, name: draft.name, locations});
    }
    if (count || books.project.noteAnnotations.length) record(song).analysisPolicy = 'sources';
    SC.ui.songNoteBatch = null; SC.persist(); SC.openSongNotes(); SC.render(); SC.toast(`已保存 ${count} 张卡片${books.project.noteAnnotations.length ? '，附注已保留。' : '。'}`);
  };
  SC.openSongNotes = () => {
    const dialog = SC.$('#dialog'), draft = SC.data.songNoteImport, busy = draft?.status === 'running', rows = draft ? importedRows(draft) : [];
    const batch = SC.ui.songNoteBatch?.fileId === draft?.file_id ? SC.ui.songNoteBatch : null, selected = new Set(batch?.selected || []);
    if (!dialog.dataset.songNotesCancel) {
      dialog.dataset.songNotesCancel = 'true';
      dialog.addEventListener('cancel', event => { if (SC.$('#dialogTitle').textContent === '导入歌曲笔记' && SC.ui.songNoteBatch) { event.preventDefault(); SC.ui.songNoteBatch = null; SC.openSongNotes(); } }, {capture: true});
    }
    SC.$('#dialogTitle').textContent = '导入歌曲笔记';
    SC.$('#dialogBody').innerHTML = `<div class="song-import-fields"><label class="field">歌曲名称<input name="notesTitle" value="${SC.esc(draft?.title || SC.song.title)}"${busy ? ' disabled' : ''}></label><label class="field">歌手<input name="notesArtist" value="${SC.esc(draft?.artist || SC.song.artist)}"${busy ? ' disabled' : ''}></label></div><input id="songNotesFile" type="file" accept=".docx" hidden${busy ? ' disabled' : ''}><p class="small muted">右键选择或更换 Word 笔记。${draft ? '' : '也可在播放器或歌词上右键导入。'}</p>${draft ? `<p class="small muted" role="status">${SC.esc(draft.name)}${busy ? ` · 正在整理 ${draft.batch || 1} / ${draft.batches.length}` : draft.error ? ' · ' + SC.esc(draft.error) : rows.length ? ` · ${rows.length} 张候选卡片` : ' · 文字已提取'}</p><details class="song-notes-original"><summary>查看原笔记</summary>${draft.units.map(unit => `<small>${SC.esc(unit.location)}</small><p>${SC.esc(unit.text)}</p>`).join('')}</details>` : ''}${rows.length ? (batch ? SC.batchToolbar({action: batch.action, label: batch.action === 'save' ? '保存所选候选' : '删除所选候选', count: selected.size, all: rows.every(entry => selected.has(entry.key)), partial: rows.some(entry => selected.has(entry.key)), prefix: 'songNotes'}) : '') + `<div class="song-notes-candidates">${rows.map(({row, kind, key}) => `<section class="song-notes-candidate" data-import-note="${key}" tabindex="0">${batch ? `<label><input type="checkbox" data-notes-selected="${key}"${selected.has(key) ? ' checked' : ''}${busy ? ' disabled' : ''} aria-label="选择${SC.esc(row.text)}"></label>` : ''}<span class="small muted">${SC.cardLabel(kind === 'words' ? 'word' : 'grammar')}${row.saved ? ' · 已保存' : ''}</span><h3>${SC.esc(row.text)}</h3><p>${SC.esc(kind === 'words' ? row.meaning_en || row.meaning_zh || '' : row.explanation_zh)}</p><details><summary>原笔记</summary><p>${SC.esc(row.original_note)}</p></details></section>`).join('')}</div>` : ''}${draft?.results?.some(result => result?.annotations?.length) ? `<details class="song-notes-annotations"><summary>发音与其他附注</summary>${draft.results.flatMap(result => result?.annotations || []).map(row => `<p>${SC.esc(row.original_note)}</p>`).join('')}</details>` : ''}`;
    SC.$('#dialogActions').innerHTML = '<button type="button" class="plain-button" id="closeSongNotes">关闭</button>' + (draft && draft.status !== 'completed' ? `<button type="button" class="plain-button primary" id="parseSongNotes"${busy ? ' disabled' : ''}>整理卡片</button>` : '');
    SC.$('#dialogForm').onsubmit = event => event.preventDefault(); SC.$('#closeSongNotes').onclick = () => dialog.close();
    if (draft) for (const name of ['notesTitle', 'notesArtist']) SC.$('#dialogForm').elements[name].onchange = event => { draft[name === 'notesTitle' ? 'title' : 'artist'] = event.target.value.trim(); SC.persist(); };
    SC.$('#parseSongNotes')?.addEventListener('click', () => SC.parseSongNotes());
    const startBatch = (action, key) => { if (busy) return; SC.ui.songNoteBatch = {fileId: draft.file_id, action, selected: [key]}; SC.openSongNotes(); };
    const remove = keys => {
      const removed = rows.filter(entry => keys.includes(entry.key)); if (!removed.length || busy) return;
      SC.confirmDelete({title: '删除所选候选', message: `删除这 ${removed.length} 张候选？原文件、原笔记与已保存的卡片保留。`, onConfirm: () => {
        removed.forEach(({row}) => row.deleted = true); SC.ui.songNoteBatch = null; SC.persist(); SC.openSongNotes();
        SC.toast(`已删除 ${removed.length} 张候选。`, () => { removed.forEach(({row}) => delete row.deleted); SC.persist(); SC.openSongNotes(); });
      }});
      SC.$('#cancelDelete').onclick = () => SC.openSongNotes();
    };
    const selectAll = SC.$('#songNotes-All');
    if (selectAll) { selectAll.indeterminate = selected.size > 0 && selected.size < rows.length; selectAll.onchange = () => { batch.selected = selectAll.checked ? rows.map(entry => entry.key) : []; SC.openSongNotes(); }; }
    SC.$('#songNotes-Execute')?.addEventListener('click', () => batch.action === 'save' ? SC.saveSongNotes(batch.selected) : remove(batch.selected));
    SC.$('#songNotes-Cancel')?.addEventListener('click', () => { SC.ui.songNoteBatch = null; SC.openSongNotes(); });
    SC.manage?.(SC.$('#dialogBody'), () => [{label: draft ? '更换 Word 笔记' : '选择 Word 笔记', fn: () => { if (!busy) SC.$('#songNotesFile').click(); }}, ...(draft?.results?.some(result => result?.annotations?.length) ? [{label: '保存附注', fn: () => { if (!busy) SC.saveSongNotes([]); }}] : [])]);
    SC.$('#dialogBody').querySelectorAll('[data-import-note]').forEach(section => {
      const row = rows.find(entry => entry.key === section.dataset.importNote).row;
      const input = section.querySelector('[data-notes-selected]');
      if (input) { input.onclick = event => event.stopPropagation(); input.onchange = () => { input.checked ? selected.add(input.dataset.notesSelected) : selected.delete(input.dataset.notesSelected); batch.selected = [...selected]; SC.openSongNotes(); }; }
      const edit = () => { if (busy) return; const entry = rows.find(entry => entry.row === row), meaningKey = row.meaning_en ? 'meaning_en' : 'meaning_zh'; SC.editFields('修改候选卡片', [{key: 'text', label: '卡片标题', value: row.text}, {key: entry.kind === 'words' ? meaningKey : 'explanation_zh', label: entry.kind === 'words' ? '意思' : '语法讲解', value: entry.kind === 'words' ? row[meaningKey] : row.explanation_zh, type: entry.kind === 'grammar' ? 'textarea' : 'text'}], values => { Object.assign(row, values, {manual: true}); SC.persist(); setTimeout(SC.openSongNotes, 0); }); };
      SC.manage?.(section, [{label: '编辑候选卡片', fn: edit}, {label: '保存候选卡片', fn: () => startBatch('save', section.dataset.importNote)}, {label: '删除候选卡片', fn: () => startBatch('delete', section.dataset.importNote)}], () => remove([section.dataset.importNote]));
      section.addEventListener('keydown', event => { if (event.key === 'F2' && !event.repeat && !event.isComposing && !event.target.closest('input,textarea,select')) { event.preventDefault(); edit(); } });
    });
    SC.$('#songNotesFile').onchange = async event => {
      const file = event.target.files[0]; if (!file) return;
      const form = SC.$('#dialogForm'), title = form.elements.notesTitle.value.trim(), artist = form.elements.notesArtist.value.trim();
      if (!title || !artist) { SC.toast('请先填写歌曲名称与歌手。'); return; }
      if (!/\.docx$/i.test(file.name) || !file.size || file.size > 50 * 1024 * 1024) { SC.toast('请选择不超过 50 MB 的 .docx 文件。'); return; }
      event.target.disabled = true;
      try {
        const epoch = SC.ui.dataEpoch || 0, song = notesSong(title, artist); SC.ensureSongBooks(false, song); const pid = await project(song), data = new FormData(); data.append('file', file); data.append('project_id', pid);
        const uploaded = await request('/api/upload', data), units = uploaded.units.filter(unit => typeof unit.text === 'string' && unit.text.trim());
        if (songDeleted(song) || epoch !== (SC.ui.dataEpoch || 0)) return;
        if (!units.length) throw new Error('原文件已保留，未取得可整理的文字；图片笔记需要先识别。');
        const batches = noteBatches(units);
        SC.ui.songNoteBatch = null; SC.data.songNoteImport = {file_id: uploaded.file_id, name: uploaded.name, title, artist, songId: song.id, units, batches, skipped: batches.skipped, results: [], status: 'extracted'}; SC.persist(); if (dialog.open && SC.$('#dialogTitle').textContent === '导入歌曲笔记') SC.openSongNotes(); await SC.parseSongNotes();
      } catch (error) { SC.toast(error.message); if (event.target.isConnected) event.target.disabled = false; }
    };
    if (!dialog.open) dialog.showModal();
  };
  SC.wireSongNotes = () => { SC.$('#importSongNotes')?.addEventListener('click', SC.openSongNotes); };
  SC.loadSongFile = async file => {
    if (!file) return false;
    if (/\.(mgg|mflac|qmc\w*)$/i.test(file.name)) { SC.toast('这是 QQ 音乐加密文件，浏览器不能播放。请提供普通 MP3、M4A、WAV 或 FLAC；改后缀无效。'); return false; }
    if (!/\.(mp3|m4a|wav|flac|ogg|aac|webm|mp4|mov|mkv)$/i.test(file.name)) { SC.toast('音频支持 MP3、M4A、WAV、FLAC、OGG、AAC、WebM；视频支持 MP4、MOV、MKV、WebM。'); return false; }
    const video = /\.(mp4|mov|mkv)$/i.test(file.name) || file.type.startsWith('video/');
    const limit = (video ? 500 : 50) * 1024 * 1024;
    if (!file.size || file.size > limit) { SC.toast(video ? '视频不能为空，最大 500 MB。' : '音频不能为空，最大 50 MB。'); return false; }
    const song = SC.song, r = record(song), epoch = ++SC.player.loadEpoch, dataEpoch = SC.ui.dataEpoch || 0, playbackEpoch = SC.ui.playbackStopEpoch || 0, temp = video ? null : URL.createObjectURL(file);
    const current = () => epoch === SC.player.loadEpoch && dataEpoch === (SC.ui.dataEpoch || 0) && isCurrent(song) && !songDeleted(song);
    try {
      SC.ui.songUpload = true; refresh(song);
      if (temp) await probeAudio(temp);
      if (!current()) return false;
      const pid = await project(song), data = new FormData(); data.append('file', file); data.append('project_id', pid);
      const uploaded = await request('/api/upload', data);
      if (!current()) return false;
      await probeAudio(uploaded.audio_url || '/api/files/' + uploaded.file_id);
      if (!current()) return false;
      if (uploaded.source_file_id) { showMediaImport({...uploaded, sourceKind: 'local', title: file.name}); return true; }
      const result = await request('/api/music/local', {file_id: uploaded.file_id, project_id: pid, title: song.title, artist: song.artist, id: r.musicId,
        lyrics: r.musicId ? undefined : song.lines.map(line => line.text).join('\n')});
      if (!current()) return false;
      r.sourceName = file.name; delete r.audioError;
      await adopt(result, song.id, song, file.name);
      SC.toast('音频已保存到本机。');
      if (playbackEpoch === (SC.ui.playbackStopEpoch || 0)) SC.playSong();
      return true;
    } catch (error) { SC.toast(error.message); return false; }
    finally { if (temp) URL.revokeObjectURL(temp); SC.ui.songUpload = false; refresh(song); }
  };
  SC.refreshSongAudio = async () => {
    const song = SC.song, r = record(song);
    if (songDeleted(song)) return;
    const epoch = SC.ui.dataEpoch || 0;
    try {
      const result = await request(musicPath(r.musicId) + '/refresh', {});
      if (songDeleted(song) || epoch !== (SC.ui.dataEpoch || 0)) return;
      song.audioStatus = result.payload.audio_status;
      if (!result.payload.url || result.payload.audio_status === 'unavailable') throw new Error('暂时无法播放这首歌。');
      await attachAudio(song, result.payload.url, result.payload.provider || '在线原唱');
      song.audioUrl = result.payload.url; delete r.audioError; saveSong(song);
    } catch (error) { r.audioError = error.message; }
    refresh(song);
  };
  SC.startSongTranscription = async (song = SC.song, retry = false) => {
    if (songDeleted(song)) return;
    const r = record(song); if (!r.musicId || transcriptionStarts.has(song.id) || (song.lines.length && song.lyricsConfirmed !== false && !songTimingPending(song))) return;
    const epoch = SC.ui.dataEpoch || 0;
    transcriptionStarts.add(song.id);
    try {
      const result = await request(musicPath(r.musicId) + '/transcription', song.lines.length && song.lyricsConfirmed !== false ? {align: true, ...(retry ? {retry: true} : {})} : {});
      if (songDeleted(song) || epoch !== (SC.ui.dataEpoch || 0)) return;
      r.transcription = result; saveSong(song); await applyTranscription(song); refresh(song);
      pollTranscription(song);
    } catch (error) { r.transcription = {status: 'failed', error: error.message}; saveSong(song); refresh(song); }
    finally { transcriptionStarts.delete(song.id); }
  };
  async function pollTranscription(song) {
    const r = record(song); clearTimeout(pollTimers.get(song.id));
    if (songDeleted(song) || r.transcription?.status !== 'running') { pollTimers.delete(song.id); return; }
    const epoch = SC.ui.dataEpoch || 0;
    pollTimers.set(song.id, setTimeout(async () => {
      if (songDeleted(song) || epoch !== (SC.ui.dataEpoch || 0)) return;
      try { const result = await request(musicPath(r.musicId) + '/transcription'); if (songDeleted(song) || epoch !== (SC.ui.dataEpoch || 0)) return; r.transcription = result; saveSong(song); await applyTranscription(song); refresh(song); pollTranscription(song); }
      catch (error) { r.transcription = {status: 'interrupted', error: error.message}; saveSong(song); refresh(song); }
    }, 1600));
  }
  SC.cancelSongTranscription = async () => {
    const song = SC.song, r = record(song);
    try { r.transcription = await request(musicPath(r.musicId) + '/transcription', undefined, 'DELETE'); saveSong(song); refresh(song); }
    catch (error) { SC.toast(error.message); }
  };
  SC.confirmSongTranscription = (timing = false, all = false) => {
    const song = SC.song, r = record(song), segments = song.lines.length ? song.lines.map(line => ({time: line.t, end: line.end, text: line.text, matched: line.matched, score: line.score})) : r.transcription?.segments || [];
    if (songDeleted(song)) { SC.toast('歌曲项目已删除，本次未修改。'); return; }
    if (!segments.length) { SC.toast('没有识别出歌词，可换一个原唱文件重试。'); return; }
    const rows = segments.map((line, i) => ({...line, i})).filter(line => !timing || all || !Number.isFinite(line.time) || !Number.isFinite(line.end) || line.matched === false || line.score < .8);
    const dialog = SC.$('#dialog'); SC.stopSpeech(); SC.$('#dialogTitle').textContent = timing ? '校对时间' : '确认歌词文字';
    SC.$('#dialogBody').innerHTML = `<p class="dialog-note">${timing ? '先显示缺失或存疑的行；时间可留空，不影响学习。' : '先校对文字即可学习，时间会在后台匹配。'}</p>` + (timing ? '<div class="song-transcription-grid"><span>开始</span><span>结束</span><span>歌词</span>' + rows.map(line => `${timeFields(`time-${line.i}`, line.time, `第${line.i + 1}句开始`)}${timeFields(`end-${line.i}`, line.end, `第${line.i + 1}句结束`)}<input name="text-${line.i}" value="${SC.esc(line.text)}" aria-label="第${line.i + 1}句歌词">`).join('') + '</div>' + (!rows.length ? '<p class="small muted">没有缺失或存疑的时间，可展开全部位置试听核对。</p>' : '') : rows.map(line => `<label class="field">${line.i + 1}<input name="text-${line.i}" value="${SC.esc(line.text)}" aria-label="第${line.i + 1}句歌词"></label>`).join(''));
    SC.$('#dialogActions').innerHTML = `${timing && !all ? '<button type="button" class="plain-button" id="allLyricsTiming">全部时间</button>' : ''}<button type="button" class="plain-button" id="cancelLyricsReview">稍后</button>${rows.length ? `<button class="plain-button primary" type="submit">${timing ? '保存时间' : '确认并整理'}</button>` : ''}`;
    SC.$('#allLyricsTiming')?.addEventListener('click', () => SC.confirmSongTranscription(true, true));
    SC.$('#cancelLyricsReview').onclick = () => dialog.close();
    SC.$('#dialogForm').onsubmit = async event => {
      const epoch = SC.ui.dataEpoch || 0;
      if (songDeleted(song)) return;
      event.preventDefault(); const form = event.currentTarget;
      const lines = segments.map((line, i) => {
        if (!form.elements[`text-${i}`]) return {time: line.time ?? null, end: line.end ?? null, text: line.text};
        const text = form.elements[`text-${i}`].value.trim();
        return {time: timing ? readTime(form, `time-${i}`, true) : text === line.text ? line.time ?? null : null, end: timing ? readTime(form, `end-${i}`, true) : text === line.text ? line.end ?? null : null, text};
      });
      let previous = -1;
      if (lines.some(line => {
        if (!line.text || (line.time === null) !== (line.end === null)) return true;
        if (line.time === null) return false;
        if (!Number.isFinite(line.time) || !Number.isFinite(line.end) || line.time < previous || line.time < 0 || line.end <= line.time || line.end > song.duration + 1) return true;
        previous = line.time; return false;
      })) { SC.toast('请填写歌词；时间可一对留空，否则开始须递增、结束须晚于开始且在音频内。'); return; }
      const submit = event.currentTarget.querySelector('[type=submit]'); if (submit) submit.disabled = true;
      try {
        const timingStatus = timing && all && lines.every(line => Number.isFinite(line.time)) ? 'confirmed' : 'draft';
        const saved = await request(musicPath(r.musicId) + '/lyrics', {lines, source: timing ? 'manual' : 'asr', confirmed: true, timing_status: timingStatus}, 'PATCH');
        if (songDeleted(song) || epoch !== (SC.ui.dataEpoch || 0)) return;
        song.lyricsHash = saved.payload.lyrics_text_hash; song.lyricsOrigin = timing ? 'manual' : 'asr';
        const old = song.lines;
        song.lines = lines.map((line, index) => ({t: line.time, end: line.end, text: line.text, translation: old[index]?.text === line.text ? old[index].translation || '' : '', ...(old[index]?.text === line.text && Object.hasOwn(old[index],'translationZh') ? {translationZh:old[index].translationZh,translationZhOrigin:old[index].translationZhOrigin} : {})})); song.lyricsConfirmed = true; song.timingStatus = timingStatus;
        const edits = (SC.data.songEditsBySong ||= {}), beforeEdits = edits[song.id] || {}; edits[song.id] = Object.fromEntries(song.lines.map((line, index) => [index, {text: line.text, translation: line.translation, ...(beforeEdits[index]?.text === line.text && Object.hasOwn(beforeEdits[index],'translationZh') ? {translationZh:beforeEdits[index].translationZh,translationZhOrigin:beforeEdits[index].translationZhOrigin} : {})}]));
        if (r.transcription) r.transcription.confirmed = true; r.analysisStatus = ''; saveSong(song); dialog.close(); refresh(song); SC.analyzeSong(song);
        if (!timing && song.audioUrl) SC.startSongTranscription(song);
      } catch (error) { SC.toast(error.message); if (submit) submit.disabled = false; }
    };
    dialog.showModal();
  };
  SC.saveSongLyric = async (index, values) => {
    const song = SC.song, r = record(song), before = structuredClone(song.lines[index]), beforeTiming = song.timingStatus;
    if (songDeleted(song)) { SC.toast('歌曲项目已删除，本次未修改。'); return; }
    const epoch = SC.ui.dataEpoch || 0;
    if (!String(values.text || '').trim()) { SC.toast('歌词不能为空。'); return; }
    values = {...values};
    const captionChanged = Object.hasOwn(values,'translationZh') && String(values.translationZh || '') !== String(before.translationZh || '');
    if (captionChanged) values.translationZhOrigin = 'manual';
    else { delete values.translationZh; delete values.translationZhOrigin; }
    Object.assign(song.lines[index], values);
    const textChanged = before.text !== values.text;
    if (textChanged) { song.lines[index].t = song.lines[index].end = null; song.timingStatus = 'partial'; if (!captionChanged && before.translationZhOrigin === 'ai') { delete song.lines[index].translationZh; delete song.lines[index].translationZhOrigin; } }
    try {
      if (textChanged && r.musicId && song.lyricsConfirmed !== false) {
        const saved = await request(musicPath(r.musicId) + '/lyrics', {lines: song.lines.map(line => ({time: line.t, ...(Number.isFinite(line.end) ? {end: line.end} : {}), text: line.text})), source: 'manual', confirmed: true, timing_status: song.timingStatus}, 'PATCH');
        if (songDeleted(song) || epoch !== (SC.ui.dataEpoch || 0)) return;
        song.lyricsHash = saved.payload.lyrics_text_hash; song.lyricsOrigin = 'manual';
      }
      const edits = ((SC.data.songEditsBySong ||= {})[song.id] ||= {}), previousEdit = edits[index];
      edits[index] = {...(!textChanged && previousEdit ? previousEdit : {}),...values, ...(song.lyricsConfirmed === false && textChanged ? {t: null, end: null} : {})};
      if (textChanged && !captionChanged && before.translationZhOrigin === 'manual') Object.assign(edits[index],{translationZh:before.translationZh,translationZhOrigin:'manual'});
      saveSong(song); refresh(song); await runs.get(song.id)?.promise;
      if (textChanged) SC.analyzeSong(song); else SC.prepareSongTranslations(song);
      if (textChanged && song.lyricsConfirmed !== false && song.audioUrl) SC.startSongTranscription(song);
    } catch (error) { song.lines[index] = before; song.timingStatus = beforeTiming; SC.toast(error.message); }
  };
  SC.wireSongService = view => {
    view.querySelector('#songDetails')?.addEventListener('click', SC.openSongDetails);
    view.querySelector('#previousLyricsDraft')?.addEventListener('click', () => { const draft = record(SC.song).previousDraft; SC.info('保留的旧草稿', draft.lines.map((line, index) => `<p>${SC.esc(draft.edits[index]?.text || line.text)}</p>`).join('')); });
    view.querySelector('#retryTranscription')?.addEventListener('click', () => SC.startSongTranscription(SC.song, true));
    view.querySelector('#cancelTranscription')?.addEventListener('click', SC.cancelSongTranscription);
    view.querySelector('#reviewTranscription')?.addEventListener('click', () => SC.confirmSongTranscription());
    view.querySelector('#reviewLyricsTiming')?.addEventListener('click', () => SC.confirmSongTranscription(true));
    view.querySelector('#cancelMusicImport')?.addEventListener('click', SC.cancelMusicImport);
    view.querySelector('#retryMusicImport')?.addEventListener('click', SC.retryMusicImport);
    view.querySelectorAll('[data-song-result]').forEach(button => button.onclick = () => SC.chooseSong(SC.ui.songSearchRows[Number(button.dataset.songResult)]));
  };
  SC.startSongService = song => {
    if (SC.ui.deletionSyncPending || SC.ui.deletionSyncBlocked || SC.ui.dittoRecoveryPending || /(?:^\?|&)maintenance=1(?:&|$)/.test(window.location?.search || '')) return;
    if (!song.id || songDeleted(song)) return;
    SC.prepareSongTranslations(song);
    if (SC.ui.savedSongNavigation === song.id) return;
    const r = record(song);
    if ((!r.analysisStatus || needsKnownAlignment(song, r)) && !r.lyricsFetching && !r.lyricsError) prepareSong(song);
    if (resolving.has(song.id) || r.metadataTried || r.musicId || song.id.includes(':')) return;
    const task = (async () => {
      const epoch = SC.player.loadEpoch, dataEpoch = SC.ui.dataEpoch || 0;
      r.metadataTried = true;
      try {
        const pid = await project(song), result = await request('/api/music/resolve', {project_id: pid, song_id: song.id, media: 'tencent'});
        if (epoch !== SC.player.loadEpoch || dataEpoch !== (SC.ui.dataEpoch || 0) || songDeleted(song) || r.musicId || song.audioUrl?.startsWith('/api/files/')) return;
        r.musicId = result.id; r.backendProjectId = result.project_id; song.audioStatus = result.payload.audio_status;
        if (result.payload.url && result.payload.audio_status !== 'unavailable' && !song.audioUrl) { song.audioUrl = result.payload.url; await attachAudio(song, song.audioUrl, '在线原唱'); }
        syncLyrics(song, result.payload); prepareSong(song); saveSong(song); refresh(song);
      } catch (error) { if (epoch !== SC.player.loadEpoch || dataEpoch !== (SC.ui.dataEpoch || 0) || songDeleted(song) || r.musicId || song.audioUrl?.startsWith('/api/files/')) return; r.audioError = error.message; saveSong(song); refresh(song); }
    })().finally(() => resolving.delete(song.id));
    resolving.set(song.id, task);
  };
  window.addEventListener('scrawl-api-configured', async () => { const song = SC.song; settingsPromise = null; await runs.get(song.id)?.promise; SC.analyzeSong(song); SC.prepareSongTranslations(song); });
  document.addEventListener('DOMContentLoaded', async () => {
    if(window.SC_PUBLIC){SC.syncSavedSongState();return;}
    await SC.syncDeletionStartup;
    await SC.syncDittoRecovery;
    if (SC.ui.deletionSyncBlocked) return;
    const draft = SC.data.songNoteImport;
    if (draft) {
      if (draft.status === 'running') { draft.status = 'extracted'; draft.error = '上次整理已中断，已完成的部分保留，可继续整理。'; }
      if (!draft.results?.some(Boolean)) { draft.batches = noteBatches(draft.units || []); draft.skipped = draft.batches.skipped; draft.batch = 0; }
      SC.persist();
    }
    if (SC.data.musicImportJob?.status === 'running') pollImport();
    const saved = SC.data.songLibrary?.[SC.data.currentSong];
    if (saved?.song) SC.syncSavedSongState();
    const song = SC.song, epoch = SC.player.loadEpoch, dataEpoch = SC.ui.dataEpoch || 0;
    if (!song.id || songDeleted(song) || !SC.data.projects.some(project => project.id === `song:${song.id}`)) return;
    const current = () => SC.song === song && epoch === SC.player.loadEpoch && dataEpoch === (SC.ui.dataEpoch || 0) && !songDeleted(song) && (!saved?.song || SC.data.projects.some(project => project.id === `song:${song.id}`));
    if (!current()) return;
    try { if (song.audioUrl) await SC.player.ready; }
    catch (error) { if (!current()) return; record(song).audioError = error.message; if (saved?.musicId && !song.audioUrl.startsWith('/api/files/')) await SC.refreshSongAudio(); }
    if (!current()) return;
    if (saved?.musicId) {
      try { const result = await request(musicPath(saved.musicId)); if (!current()) return; syncLyrics(song, result.payload); if (saved.transcription?.status === 'running') pollTranscription(song); }
      catch (error) { if (!current()) return; saved.audioError = error.message; }
    }
  });
  SC.songServiceFixtures = {normal, fromPayload, mergeNotes, showMediaImport, timeParts, timeFields, setTime, readTime, noteBatches, sourceLocations, needsKnownAlignment, adopt, syncLyrics, notesSong, attachAudio,lyricBatches,translationState,adoptTranslations,updateSongTranslations};
})();
