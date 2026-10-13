(function () {
  'use strict';
  const bars = new Map();
  function update(el, bar) {
    const rect = el.getBoundingClientRect(), max = el.scrollHeight - el.clientHeight;
    if (!el.isConnected || max <= 1 || rect.height === 0) { bar.node.remove();clearTimeout(bar.timer);bars.delete(el);return false; }
    let top = Math.max(0, rect.top + el.clientTop), bottom = Math.min(innerHeight, top + el.clientHeight);
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) continue;
      const clip = parent.getBoundingClientRect();top = Math.max(top, clip.top);bottom = Math.min(bottom, clip.bottom);
    }
    const track = Math.max(0, bottom - top - 8), size = Math.min(track, Math.max(24, track * el.clientHeight / el.scrollHeight));
    bar.track = track;bar.size = size;bar.top = top + 4;
    Object.assign(bar.node.style, {left: `${rect.right - el.clientLeft - 9}px`,top: `${bar.top + (track - size) * el.scrollTop / max}px`,height: `${size}px`});
    bar.node.setAttribute('aria-valuemax',String(Math.round(max)));bar.node.setAttribute('aria-valuenow',String(Math.round(el.scrollTop)));
    return true;
  }
  function show(el) {
    if (!(el instanceof HTMLElement) || el.scrollHeight <= el.clientHeight + 1 || !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) return;
    let bar = bars.get(el);
    if (!bar) {
      const node = document.createElement('div');node.className = 'overlay-scrollbar';node.setAttribute('role','scrollbar');node.setAttribute('aria-orientation','vertical');node.setAttribute('aria-valuemin','0');node.setAttribute('aria-label',el.getAttribute('aria-label') || '滚动内容');
      if (!el.id) el.id = 'scroll-' + crypto.randomUUID();node.setAttribute('aria-controls',el.id);
      (el.closest('dialog') || document.body).append(node);bar = {node};bars.set(el,bar);
      node.onpointerdown = event => {
        if(event.button !== 0)return;event.preventDefault();event.stopPropagation();node.setPointerCapture(event.pointerId);bar.dragging = true;clearTimeout(bar.timer);
        const y = event.clientY, start = el.scrollTop;
        node.onpointermove = move => {if(!bar.dragging)return;el.scrollTop = start + (move.clientY-y) * (el.scrollHeight-el.clientHeight) / Math.max(1,bar.track-bar.size);update(el,bar);};
        node.onpointerup = node.onpointercancel = () => {bar.dragging = false;node.onpointermove=null;show(el);};
      };
      node.onkeydown = event => {
        const steps = {ArrowDown:40,ArrowUp:-40,PageDown:el.clientHeight*.9,PageUp:-el.clientHeight*.9,Home:-el.scrollHeight,End:el.scrollHeight};
        if(!(event.key in steps))return;event.preventDefault();event.stopPropagation();el.scrollTop += steps[event.key];show(el);
      };
    }
    if (!update(el,bar))return;bar.node.classList.add('visible');bar.node.tabIndex=0;clearTimeout(bar.timer);
    if (!bar.dragging)bar.timer=setTimeout(()=>{bar.node.classList.remove('visible');bar.node.tabIndex=-1;},650);
  }
  document.addEventListener('scroll',event => {show(event.target);for(const [el,bar] of bars)update(el,bar);},true);
  window.addEventListener('resize',()=>{for(const [el,bar] of bars)update(el,bar);});
  new MutationObserver(()=>{for(const [el,bar] of bars)if(!el.isConnected){clearTimeout(bar.timer);bar.node.remove();bars.delete(el);}}).observe(document.body,{childList:true,subtree:true});
})();
