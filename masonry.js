(function () {
  'use strict';
  const S = window.SC, selector = '.notebook-grid,.grammar-grid,.sentence-grid,.form-grid,.song-notes-candidates,.chat-candidate-grid';
  const grids = new Map(), pending = new Set(), gap = 12;
  let frame = 0;
  function queue(grid) {
    if (grid) pending.add(grid);
    if (!frame) frame = requestAnimationFrame(() => { frame = 0;for (const el of pending) layout(el);pending.clear(); });
  }
  const resize = new ResizeObserver(entries => entries.forEach(entry => queue(entry.target.closest(selector))));
  function style(el, key, value) { if (el.style[key] !== value) el.style[key] = value; }
  function layout(grid) {
    const width = grid.clientWidth;
    if (!grid.isConnected || !width) return;
    const words = grid.classList.contains('notebook-grid'), candidates = grid.matches('.song-notes-candidates,.chat-candidate-grid');
    const children = [...grid.children].filter(child => getComputedStyle(child).display !== 'none'), count = children.filter(child => !child.matches('.sentence-group-label,.empty-state,[data-masonry-wide]')).length;
    const columns = Math.max(1, Math.min(words ? 3 : 2, count, Math.floor((width + gap) / ((words || candidates ? 260 : 320) + gap))));
    const columnWidth = (width - gap * (columns - 1)) / columns, heights = Array(columns).fill(0);
    let bottom = 0;
    grid.dataset.masonryColumns = String(columns);
    for (const child of children) {
      const wide = child.matches('.sentence-group-label,.empty-state,[data-masonry-wide]');
      const column = wide ? 0 : heights.indexOf(Math.min(...heights)), top = wide ? Math.max(...heights) : heights[column];
      style(child, 'width', `${wide ? width : columnWidth}px`);
      style(child, 'left', `${wide ? 0 : column * (columnWidth + gap)}px`);
      style(child, 'top', `${top}px`);
      const height = child.getBoundingClientRect().height;
      bottom = Math.max(bottom, top + height);
      if (wide) heights.fill(top + height + gap);else heights[column] = top + height + gap;
    }
    style(grid, 'height', `${bottom}px`);
  }
  function refresh() {
    for (const [grid, children] of grids) {
      if (grid.isConnected) continue;
      resize.unobserve(grid);children.forEach(child => resize.unobserve(child));grids.delete(grid);pending.delete(grid);
    }
    for (const grid of document.querySelectorAll(selector)) {
      if (!grids.has(grid)) { grids.set(grid, new Set());grid.classList.add('masonry-layout');resize.observe(grid); }
      const children = grids.get(grid), current = new Set(grid.children);
      for (const child of children) if (!current.has(child)) { resize.unobserve(child);children.delete(child); }
      for (const child of current) if (!children.has(child)) { children.add(child);resize.observe(child); }
      queue(grid);
    }
  }
  S.layoutMasonry = refresh;
  refresh();
  new MutationObserver(refresh).observe(document.body, {subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','open']});
  document.fonts.ready.then(refresh);
  document.fonts.addEventListener('loadingdone', refresh);
})();
