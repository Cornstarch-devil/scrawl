'use strict';
(() => {
  const S = window.SC, pending = new Map(), sequences = new Map();
  const fields = ['id','kind','text','explanation','formation','usage','note','original_note'];
  const snapshot = item => Object.fromEntries(fields.map(key => [key,String(item[key] || '')]));
  const stem = text => String(text || '').normalize('NFKC').replace(/[\s.!?。！？，,]/g,'');
  const keyFor = (item, entry) => entry + ':' + item.id;
  const questionId = (item,entry,question) => keyFor(item,entry) + ':' + question.id + ':' + stem(question.question_ko);
  const fingerprint = (item, references = [], sources = []) => JSON.stringify({version:4,card:snapshot(item),references,sources});
  const current = item => S.data.items.find(row => row.id === item.id && row.kind === 'grammar' && String(row.explanation || '').trim());
  function knownAIConflict(text, explanation) {
    for (const clause of String(explanation || '').split(/[。；;\n]/)) {
      if (/不是|并非|不能说|误称|误写|错误/.test(clause)) continue;
      const claim = text + ' ' + clause;
      if (/(?:해요체|아요|어요|아\/어요)[^。；;\n]{0,40}(?:礼貌非敬语体|非敬语终结|非礼貌体|包含[^。；;\n]{0,20}ㅂ니다)/.test(claim)) return '生成说明混淆 해요체 与正式体；해요체 是非正式礼貌体。';
      if (/(?:아서|어서|아\/어서|아\/어\s*서)[^。；;\n]{0,45}(?:只(?:能)?表示原因|仅表示原因|不表示(?:时间|动作)?顺序|不用于简单顺序)/.test(claim)) return '生成说明错误排除了 -아/어서 的时间先后用法。';
    }
    return '';
  }
  function validate(item, questions, sources, excluded = []) {
    const F = S.practiceFixtures, used = new Set(excluded.map(stem)), ids = new Set(), valid = [], errors = [];
    if (!Array.isArray(questions)) throw new Error('语法题格式不正确。');
    for (let question of questions) try {
      if (!question || typeof question.id !== 'string' || !question.id || ids.has(question.id) || question.card_id !== item.id || question.target_grammar_id !== item.id) throw new Error('题目没有对应当前语法点。');
      ids.add(question.id);
      if (typeof question.question_ko !== 'string' || question.question_ko.split('___').length !== 2 || question.question_ko.replace('___','').includes('_') || typeof question.sentence_ko !== 'string' || !question.sentence_ko.trim()) throw new Error('题干必须只有一个空位。');
      if (typeof question.meaning_en !== 'string' || !question.meaning_en.trim()) throw new Error('题目缺少已保存的整句释义。');
      if (typeof question.scenario_zh !== 'string' || !question.scenario_zh.trim()) throw new Error('题目缺少使用情境。');
      const origin = question.origin || 'source';
      if (!['source','ai'].includes(origin) || origin === 'ai' && question.evidence) throw new Error('题目来源标记不正确。');
      if (origin === 'ai') question = {...question, refs:F.normalizeAITokens(question.refs,sources), options:Array.isArray(question.options) ? question.options.map(option => option && typeof option === 'object' ? {...option,refs:F.normalizeAITokens(option.refs,sources)} : option) : question.options};
      if (origin === 'source') {
        F.validateEvidence(question.evidence,question.sentence_ko,F.sourceUnits([item]));
        if (question.sentence_ko !== question.evidence.quote || ![question.evidence.meaning,question.evidence.meaningZh].includes(question.meaning_en)) throw new Error('语法题没有对应完整原句及释义。');
      }
      const options = question.options;
      if (!Array.isArray(options) || options.length < 2 || options.some(option => !option || typeof option.id !== 'string' || !option.id || typeof option.text !== 'string' || !option.text.trim()) || new Set(options.map(option => option.id)).size !== options.length || new Set(options.map(option => stem(option.text))).size !== options.length) throw new Error('题目选项不足或有重复。');
      const answer = options.find(option => option.id === question.answer), gap = question.gap;
      if (!answer || !gap || gap.grammar_card_id !== item.id || gap.answer_id !== answer.id || String(gap.rule_quote || '').trim().length < 2 || !['explanation','formation','usage','note'].some(key => String(item[key] || '').includes(gap.rule_quote))) throw new Error('填空没有绑定已保存的语法规则。');
      if (!Array.isArray(answer.refs) || !answer.refs.some(ref => ref?.card_id === item.id)) throw new Error('正确选项没有练习目标语法。');
      if (question.question_ko.replace('___',answer.text) !== question.sentence_ko) throw new Error('正确选项不能重建参考句。');
      if (used.has(stem(question.question_ko)) || used.has(stem(question.sentence_ko))) throw new Error('两个练习入口不能使用重复题干。');
      F.validateTokens(question.refs,sources,false);
      if (question.refs[0].attach_left) throw new Error('参考句首词不能向左附着。');
      if (F.tokenText(question.refs) !== question.sentence_ko) throw new Error('引用不能完整重建参考句。');
      const tokens = [...question.refs];
      for (const option of options) { F.validateTokens(option.refs,sources,false); if (F.tokenText(option.refs) !== option.text) throw new Error('选项引用不完整。'); tokens.push(...option.refs); }
      if (origin === 'ai') question = {...question,auxiliary:F.normalizeAIAuxiliary(question.auxiliary,tokens)};
      F.validateAuxiliary(tokens,question.auxiliary);
      if (typeof question.explanation_zh !== 'string' || origin === 'source' && question.explanation_zh && !['explanation','formation','usage','note','original_note'].some(key=>String(item[key]||'').includes(question.explanation_zh))) throw new Error('解析没有对应原语法说明。');
      if (origin === 'ai') {
        const conflict = knownAIConflict(item.text, question.explanation_zh) || question.auxiliary.map(row => knownAIConflict(row.text, row.explanation_zh)).find(Boolean);
        if (conflict) throw new Error(conflict);
      }
      used.add(stem(question.question_ko)); used.add(stem(question.sentence_ko)); valid.push(question);
    } catch (error) { errors.push(error.message); }
    return {questions:valid,errors};
  }
  function state(item, entry = 'global') {
    const key = keyFor(item,entry), saved = S.data.grammarQuizSourceCache?.[key], attempt = S.ui.grammarQuizAttempts?.[key] || S.data.grammarQuizSourceAttempts?.[key];
    let cached = null;
    if (current(item) === item && saved && S.practiceFixtures.sameFingerprint(saved.fingerprint,fingerprint(item,saved.references || [],saved.sources || []))) {
      const F = S.practiceFixtures, context = F.contextCards([item]);
      const sources = new Map([...context.local,...(context.project || []),...context.other,snapshot(item)].map(card => [card.id,card]));
      const changed = new Set((saved.references || []).filter(reference => JSON.stringify(reference) !== JSON.stringify(F.liveReferences([reference])[0])).map(reference => reference.id));
      try { const questions = saved.questions.filter(question => ![...(Array.isArray(question?.refs) ? question.refs : []),...(Array.isArray(question?.options) ? question.options : []).flatMap(option => Array.isArray(option?.refs) ? option.refs : [])].some(ref => changed.has(ref?.card_id))); const checked = validate(item,questions,sources); if (checked.questions.length) cached = {...saved,questions:checked.questions,message:saved.message || (checked.errors.length || questions.length !== saved.questions.length ? '部分题目所用内容已修改或不完整，已保留可用题目。' : '')}; } catch {}
    }
    const message = attempt?.fingerprint === fingerprint(item) ? S.practiceFixtures.generationFailure(attempt.message, attempt.provider) : '';
    return {key,cached,pending:pending.has(key),attempted:attempt?.fingerprint === fingerprint(item),message:message || S.practiceFixtures.generationFailure(cached?.message, cached?.provider, true),blocked:!cached && !!message && attempt?.force === true};
  }
  S.grammarQuizState = state;
  S.grammarQuizQuestion = (item, entry = 'global') => {
    const found = state(item,entry); if (!found.cached || found.blocked) return null;
    const questions = found.cached.questions, seen = new Set((item.progress?.events || []).map(event => event.question_id));
    const id = question => questionId(item,entry,question);
    const last = [...(item.progress?.events || [])].reverse().find(event => event.entry === entry)?.question_id;
    const raw = questions.find(question => !seen.has(id(question))) || questions.find(question => id(question) !== last) || questions[0];
    const answer = raw.options.find(option => option.id === raw.answer);
    return {id:item.id,qid:id(raw),entry,origin:raw.origin || 'source',direction:'grammar',sentence:raw.question_ko,answer:answer.text,options:raw.options.map(option => option.text),explanation:raw.explanation_zh,context:raw.scenario_zh || '',auxiliary:raw.auxiliary,mode:'choice'};
  };
  S.grammarQuizAuxiliary = question => (question.auxiliary || []).length ? `<section class="grammar-quiz-auxiliary" aria-label="题目用词"><dl>${question.auxiliary.map(word => `<dt lang="ko">${S.esc(word.text)}</dt><dd>${S.esc(word.meaning_en || '')}<small>${S.esc(word.explanation_zh || '')}</small></dd>`).join('')}</dl></section>` : '';
  S.isGrammarQuizCurrent = (question,item) => { const found=state(item,question.entry); return !!found.cached && !found.blocked && found.cached.questions.some(raw=>question.qid === questionId(item,question.entry,raw)); };
  S.prepareGrammarQuiz = (item, entry = 'global', {force = false, retry = false} = {}) => {
    if (!current(item) || !['global','single'].includes(entry)) return Promise.resolve();
    const found = state(item,entry), key = found.key;
    if (pending.has(key)) return pending.get(key);
    if (!force && !retry && ((found.cached?.questions.length || 0) >= 2 || found.attempted)) return Promise.resolve();
    const epoch = S.ui.dataEpoch || 0, navigation = S.ui.navigationEpoch || 0, target = fingerprint(item);
    const alive = () => epoch === (S.ui.dataEpoch || 0) && navigation === (S.ui.navigationEpoch || 0) && current(item) === item && fingerprint(item) === target;
    const task = (sequences.get(item.id) || Promise.resolve()).catch(()=>{}).then(async () => {
      if (!alive()) return;
      let provider;
      try {
        const config = await S.apiSettings();
        provider = S.practiceFixtures.providerFor(config); S.ui.practiceProvider = provider;
        if (!alive()) return;
        const known = !force ? state(item,entry).cached : null, count = Math.max(1, 2 - (known?.questions.length || 0));
        const F = S.practiceFixtures, context = F.contextCards([item]), card = snapshot(item), units = F.sourceUnits([item]);
        const excluded = ['global','single'].flatMap(kind => state(item,kind).cached?.questions.flatMap(question => [question.question_ko,question.sentence_ko]) || []);
        (S.data.grammarQuizSourceAttempts ||= {})[key] = {fingerprint:target,message:'本轮准备已开始；如果未取得题目，请手动重试。',force,provider};
        if(S.persist()===false)throw new Error('无法保存准备状态，请释放存储空间后手动重试。');
        const payload = await F.practiceRequest('/api/practice/expand',{mode:'grammar_quiz',entry,cards:[card],count_per_card:count,context_cards:context,source_units:units,exclude_stems:{[item.id]:excluded},force},130000);
        if (!alive()) return;
        if (!Array.isArray(payload.results) || payload.results.length > 1 || payload.results.some(row => row.card_id !== item.id) || payload.errors && (!Array.isArray(payload.errors) || payload.errors.some(row => row.card_id !== item.id))) throw new Error('生成结果没有对应当前语法点。');
        const sources = new Map([card,...context.local,...(context.project || []),...context.other].map(row => [row.id,row]));
        const checked = validate(item,payload.results[0]?.questions || [],sources,excluded);
        const messages = [...(payload.errors || []).map(row => row.message),...checked.errors];
        if (!checked.questions.length) throw new Error(messages.join('；') || '没有可用情境题，请手动重试。');
        const questions = [...(known?.questions || []),...checked.questions];
        const tokens = questions.flatMap(question => [...question.refs,...question.options.flatMap(option => option.refs)]);
        const references = F.referencedCards(tokens,[card],context);
        const sourceUnits = units.filter(unit=>questions.some(question=>question.evidence?.source_id==='saved:'+unit.id)), prepared = fingerprint(item,references,sourceUnits);
        if (prepared !== fingerprint(item,F.liveReferences(references),F.liveSources(sourceUnits))) throw new Error('引用材料或原句已修改，旧题目未采用。');
        const message = messages.join('；') || (questions.length < 2 ? '目前有一题可用，重试可补足题池。' : '');
        (S.data.grammarQuizSourceCache ||= {})[key] = {fingerprint:prepared,references,sources:sourceUnits,questions,message,provider};
        const attempt = {fingerprint:target,message,force:false,provider}; (S.ui.grammarQuizAttempts ||= {})[key] = attempt; S.data.grammarQuizSourceAttempts[key] = attempt; S.persist();
      } catch (error) { if (alive()) { const attempt = {fingerprint:target,message:error.message || '语法题生成失败，请手动重试。',force,provider}; (S.ui.grammarQuizAttempts ||= {})[key] = attempt; (S.data.grammarQuizSourceAttempts ||= {})[key] = attempt; S.persist(); } }
    }).finally(()=>{pending.delete(key);if(sequences.get(item.id) === task) sequences.delete(item.id);});
    pending.set(key,task); sequences.set(item.id,task); return task;
  };
  S.grammarQuizFixtures = {snapshot,fingerprint,validate,stem};
})();
