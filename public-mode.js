'use strict';

(() => {
  window.SC_PUBLIC = true;
  const notice = '此功能在本地 Scrawl 中使用。';
  const hiddenModes = new Set(['expressions', 'forms', 'sentence']);
  const nativeFetch = window.fetch.bind(window);
  window.SC_PUBLIC_URL = value => {
    const raw = String(value || '');
    if (!raw) return '';
    const mapped = window.SC_PUBLIC_MEDIA?.[raw];
    if (mapped) {
      const url = new URL(mapped, document.baseURI);
      return url.origin === location.origin && !/\/api(?:\/|$)/.test(url.pathname) ? url.href : '';
    }
    if (raw.startsWith('blob:') || raw.startsWith('data:audio/')) return raw;
    let url; try { url = new URL(raw, document.baseURI); } catch { return ''; }
    if (url.origin !== location.origin || /\/api(?:\/|$)/.test(url.pathname)) return '';
    const relative = url.pathname.slice(new URL('.', document.baseURI).pathname.length);
    return /^(?:assets|media)\//.test(relative) ? url.href : '';
  };
  window.fetch = (input, init) => {
    const raw = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const method = String(init?.method || input?.method || 'GET').toUpperCase();
    const mapped = window.SC_PUBLIC_MEDIA?.[raw];
    const url = new URL(mapped || raw, document.baseURI);
    if (!['GET', 'HEAD'].includes(method) || url.origin !== location.origin || /\/api(?:\/|$)/.test(url.pathname)) {
      return Promise.reject(new Error(notice));
    }
    return nativeFetch(mapped ? url.href : input, init);
  };

  document.addEventListener('DOMContentLoaded', () => {
    const S = window.SC;
    const unavailable = () => { S.toast(notice); return false; };
    const unavailableAsync = () => { S.toast(notice); return Promise.resolve(false); };
    const disable = element => {
      if (!element) return;
      element.disabled = true;
      element.setAttribute('aria-disabled', 'true');
      element.title = notice;
    };
    const applyControls = () => {
      for (const selector of ['#chatInput', '#sendMessage', '#apiButton', '#fileInput', '#songQuery', '#songSearch button', '#songAudioInput', '#importSongNotes', '#grammar-retry', '#retryTranscription', '#cancelTranscription', '#reviewTranscription', '#reviewLyricsTiming', '#retryMusicImport']) {
        document.querySelectorAll(selector).forEach(disable);
      }
      document.querySelectorAll('[data-combined-mode],[data-scope-route],[data-route]').forEach(element => {
        if (hiddenModes.has(element.dataset.combinedMode || element.dataset.scopeRoute || element.dataset.route)) { element.hidden = true; element.style.display = 'none'; }
      });
      document.querySelectorAll('.settings-tabs button').forEach(element => {
        if (['API', '备份与维护'].includes(element.textContent.trim())) disable(element);
      });
    };
    const originalRender = S.render;
    S.render = (...args) => { const result = originalRender(...args); applyControls(); return result; };
    const originalGo = S.go;
    S.go = (route, ...args) => hiddenModes.has(route) ? false : originalGo(route, ...args);
    const originalManage = S.manage;
    S.manage = (element, entries) => originalManage(element, (x, y) => {
      const rows = typeof entries === 'function' ? entries(x, y) : entries;
      return (rows || []).filter(row => /^(?:朗读|停止|加入再记一遍|移出再记一遍|选择全部内部句子加入再记一遍|将整张总卡加入再记一遍)/.test(row.label || ''));
    }, null);
    const originalBookBatch = S.beginBookBatch;
    S.beginBookBatch = (book, action, ...args) => action === 'delete' ? unavailable() : originalBookBatch(book, action, ...args);
    const originalSummaryBatch = S.beginSummaryBatch;
    S.beginSummaryBatch = (id, action, ...args) => action === 'delete' ? unavailable() : originalSummaryBatch(id, action, ...args);
    for (const key of ['editFields', 'editItem', 'editSummaryParent', 'editSummaryUnit', 'beginSummaryDelete', 'deleteSummaryUnits', 'deleteCards', 'deleteContainers', 'beginContainerDelete', 'undoContainerDeletion', 'undoKoreanWorkbook', 'undoDittoWordRestore', 'openSongNotes', 'confirmSongTranscription', 'recreateSongBooks']) {
      if (typeof S[key] === 'function') S[key] = unavailable;
    }
    for (const key of ['searchSongs', 'loadSongFile', 'fetchSongLyrics', 'analyzeSong', 'retrySongTranslations', 'refreshSongAudio', 'startSongTranscription', 'retryMusicImport']) {
      if (typeof S[key] === 'function') S[key] = unavailableAsync;
    }
    S.prepareSongTranslations = () => Promise.resolve(false);
    S.importKoreanWorkbook = () => false;
    S.startSongService = () => {};
    S.prepareWorkspaceStudyOrder = S.prepareStudyOrder = S.retryStudyOrder = () => Promise.resolve(false);
    S.prepareGrammarQuiz = () => Promise.resolve(false);
    const originalGrammarState = S.grammarQuizState;
    S.grammarQuizState = (...args) => {
      const state = originalGrammarState(...args);
      return {...state, attempted: true, pending: false, message: state.cached?.questions?.length ? state.message : notice};
    };
    S.apiPanel = panel => { panel.innerHTML = '<p class="dialog-note">' + S.esc(notice) + '</p>'; };
    S.renderBackupSettings = panel => { panel.innerHTML = '<p class="dialog-note">' + S.esc(notice) + '</p>'; };
    const originalRestoreSong = S.restoreSavedSong;
    S.restoreSavedSong = projectId => {
      const song = S.data.songLibrary?.[String(projectId || '').replace(/^song:/, '')]?.song;
      if (song) song.audioUrl = window.SC_PUBLIC_URL(song.audioUrl);
      return originalRestoreSong(projectId);
    };
    new MutationObserver(applyControls).observe(document.body, {childList: true, subtree: true});
    applyControls();
  }, {capture: true, once: true});

  document.addEventListener('keydown', event => {
    if (event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    if (event.key === 'F2' || event.key === 'Delete') { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('contextmenu', event => {
    if (event.target.closest('#sidebarNav')) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('pointerdown', event => {
    if (event.target.closest('#sidebarNav [draggable="true"]')) event.stopImmediatePropagation();
  }, true);
  document.addEventListener('dragstart', event => {
    if (event.target.closest('#sidebarNav')) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('submit', event => {
    if (event.target.id === 'songSearch') { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
})();
