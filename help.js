(function () {
  'use strict';
  const S = window.SC;
  S.maintenanceHandoff = '';
  const sections = [
    ['上手', ['项目可收纳笔记本，也可直接放语法卡、单词卡、句子卡。右键创建或管理，拖动归类。', '取得材料 → 保存卡片 → 练习。综合练习点击范围卡的 ＋ 选择材料，每轮选择学习、测试、常用表达、词形变化或拼句之一，数量按本轮需要设置，不设固定上限。学习按顺序翻卡，测试随机出题。']],
    ['快捷键', ['学习：点击或 Space 翻面，Enter 下一张。常用表达／词形变化：选词按钮或阅读区 Enter 下一词，末尾循环；阅读区点击或 Space 朗读。', '选择题：点击或按 1—4 即判分，答题后 Enter 下一题。拼句：工作区或词块聚焦时 Enter 核对，提交后 Enter 下一题；主按钮执行同一动作。词块通过点击、Space 或拖动移动。', '选中内容后按 Tab 加入再记一遍；一次加入后恢复正常焦点导航。右键可多选管理，F2 编辑，Delete 确认删除；再记一遍内 Delete 仅移出，原内容与记录保留。双击语法标题，或聚焦标题后 Enter／Space，练习该语法点。', '问答：Enter 发送，Shift＋Enter 换行。双击气泡整理卡片；聚焦气泡后 Enter 也可打开。输入、菜单、弹窗和多选操作不触发学习快捷键；Escape 关闭弹窗或退出多选。']],
    ['学习方式', ['句子集合先进入完整阅读，情境与用法在卡片下方；学习只翻句子与释义，测试只显示题目与反馈。每个内部句子独立管理和记录。', '“再记一遍”只提供翻卡学习，引用原单词、语法或句子，记录共用；移出不会删除原内容。', '语法笔记完整展开，搜索栏可进入全部练习。情境题按入口分别保存，需要新题时手动换一组；暂未取得时可手动重试或练习其他语法点。未建卡的原文说明可右键编辑、隐藏或删除，并支持多选与撤销，原 Word 不变。', '韩语自动循环；翻到英文释义或进入英文题干时朗读一次，也可右键主动朗读释义。右上角耳朵停止全部播放。翻卡点击用于翻面，保存的卡片补齐必要释义或讲解后即可用于练习。']],
    ['API', ['<a href="https://platform.agnes-ai.cn/settings/apiKeys" target="_blank" rel="noopener noreferrer">Agnes API Keys ↗</a> → 创建新密钥 → 在 API 设置填写密钥。', '问答和练习优先参考原笔记，社区词汇资料作为辅助，缺失内容可由 AI 补充。AI 内容不会冒充官方资料。成功内容会保存，失败后可手动重试；服务用量及费用以服务商为准。', '已启用的本地朗读无需额外密钥，不改变文本模型。文本 API 密钥仅保存在本机，不显示已保存的密钥。']],
    ['歌曲', ['歌名＋歌手取得歌词；文字可先学习，时间对齐失败时可重试或手动校对。', 'B站链接 → 选择分P → 完整导入；需要时再选“截取一段”。', '可上传普通音频或视频；MGG 不支持。歌曲“导入笔记”可读取 Word，原文和学习记录保留。']]
  ];
  function tabs(container, names, select) {
    container.innerHTML = names.map((name, i) => `<button type="button" role="tab" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${S.esc(name)}</button>`).join('');
    const buttons = [...container.querySelectorAll('button')];
    const activate = i => { buttons.forEach((button, index) => { button.setAttribute('aria-selected', String(i === index)); button.tabIndex = i === index ? 0 : -1; }); select(i); };
    buttons.forEach((button, i) => {
      button.onclick = () => activate(i);
      button.onkeydown = event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
        activate(next); buttons[next].focus();
      };
    });
    activate(0);
  }
  S.openSettings = (initial = 0) => {
    S.info('设置', '<div class="settings-tabs guide-tabs" role="tablist" aria-label="设置分类"></div><section id="settings-panel" role="tabpanel"></section>');
    const actions = S.$('#dialogActions');
    tabs(S.$('.settings-tabs'), ['学习', 'API', '使用说明', '备份与维护'], index => {
      S.$('#dialogForm').onsubmit = event => event.preventDefault();
      actions.innerHTML = '<button type="button" class="plain-button" id="closeSettings">关闭</button>';S.$('#closeSettings').onclick = () => S.$('#dialog').close();
      const old = S.$('#settings-panel'), panel = document.createElement('section');old.querySelectorAll('audio').forEach(media=>media.pause());panel.id = 'settings-panel';panel.setAttribute('role', 'tabpanel');old.replaceWith(panel);
      if (index === 0) {
        const book = S.data.books.find(value => value.id === S.bookId), rows = book ? S.itemsFor(book) : [], chinese = rows.some(note => !note.meaning && note.meaningZh);
        panel.innerHTML = `<h3 class="settings-subtitle">翻卡顺序</h3><div class="front-order">${[['ko','韩语在前'],['meaning',chinese?'中文在前':'英语在前']].map(([value,label]) => `<button type="button" class="plain-button ${S.data.preferences.front === value ? 'active' : ''}" data-front="${value}" aria-pressed="${S.data.preferences.front === value}">${label}</button>`).join('')}</div><label class="field">韩语句子播放速度<input id="koreanSentenceRate" type="range" min="0.5" max="1.5" step="0.1" value="${S.koreanSentenceRate()}"><output id="koreanSentenceRateValue" for="koreanSentenceRate">${S.koreanSentenceRate().toFixed(1)}×</output></label>`;
        panel.querySelector('#koreanSentenceRate').oninput = event => { S.data.preferences.koreanSentenceRate = Number(event.target.value);S.persist();panel.querySelector('#koreanSentenceRateValue').textContent = S.koreanSentenceRate().toFixed(1) + '×'; };
        panel.querySelectorAll('[data-front]').forEach(button => button.onclick = () => { S.data.preferences.front = button.dataset.front;S.persist();panel.querySelectorAll('[data-front]').forEach(choice => {const selected = choice === button;choice.classList.toggle('active',selected);choice.setAttribute('aria-pressed',String(selected));});if(S.ui.books?.[S.bookId]?.mode === 'cards'){S.ui.books[S.bookId].cards.back=false;S.renderBook(S.bookId,false);} });
      } else if (index === 1) S.apiPanel(panel, actions);
      else if (index === 3) S.renderBackupSettings(panel);
      else {
        panel.innerHTML = '<div class="manual-tabs guide-tabs" role="tablist" aria-label="使用说明分类"></div><section id="guide-panel" class="guide-panel" role="tabpanel"></section>';
        tabs(panel.querySelector('.manual-tabs'), sections.map(([name]) => name), i => {
          panel.querySelector('#guide-panel').innerHTML = `<ul>${sections[i][1].map(text => `<li>${text}</li>`).join('')}</ul>`;
        });
      }
    });
    S.$('.settings-tabs').querySelectorAll('button')[initial].click();
    S.$('#dialog').addEventListener('close',()=>{const key=S.$('#dialog').querySelector('[name=api_key]');if(key)key.value='';},{once:true});
  };
  S.openUsageGuide = () => S.openSettings(2);
  S.$('#usageGuide').onclick = () => S.openSettings();
})();
