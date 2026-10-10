/* A dependency-free local demo. All user-controlled text is escaped before rendering. */
(() => {
  'use strict';
  const d = window.WeddingDomain;
  const KEY = 'wedding:web:v1';
  const main = document.getElementById('main');
  const editor = document.getElementById('editor');
  const confirmation = document.getElementById('confirmation');
  const categories = [
    { name: '场地宴席', icon: 'venue', color: '#a6b398' }, { name: '婚纱造型', icon: 'dress', color: '#e1ada3' },
    { name: '摄影摄像', icon: 'camera', color: '#c5bad5' }, { name: '仪式布置', icon: 'flower', color: '#e8cd8b' },
    { name: '宾客礼品', icon: 'gift', color: '#b9c4b9' }, { name: '其他', icon: 'rings', color: '#d7b99d' }
  ];
  const filters = { status: 'pending', category: '全部', owner: 'all', query: '' };
  let budgetCategory = '全部';
  let budgetTask = '';
  let storageError = '';
  let snapshot = load();
  let editing = null;
  let toastTimer;
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const art = (name, className = '', alt = '') => `<img class="art ${className}" src="/assets/illustrations/${name === 'couple' ? 'wedding-hero.webp' : name + '.svg'}" alt="${esc(alt)}" draggable="false">`;
  const arrow = '<span aria-hidden="true">↗</span>';
  const option = (value, label, selected) => `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`;
  const currentPage = () => ['home', 'tasks', 'budget', 'together'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!Number.isSafeInteger(parsed.revision) || parsed.revision < 0) throw new Error('版本信息损坏');
        return { workspace: d.validateWorkspace(parsed.workspace), revision: parsed.revision };
      }
      const initial = { workspace: d.createWorkspace(), revision: 0 };
      localStorage.setItem(KEY, JSON.stringify(initial));
      return initial;
    } catch (_) {
      storageError = '暂时无法读取本机记录。原记录没有被覆盖，可在“我们的小日子”中导出原始记录或重置。';
      return { workspace: d.createWorkspace(), revision: 0 };
    }
  }
  function commit(type, payload, expectedRevision = snapshot.revision) {
    if (storageError) throw new Error('请先在“我们的小日子”中处理本机存储问题，再保存修改。');
    const latest = load();
    if (storageError) throw new Error(storageError);
    if (latest.revision !== expectedRevision) {
      snapshot = latest; render();
      const error = new Error('另一个标签页更新了计划，已刷新。请核对你的输入后再次保存。'); error.code = 'CONFLICT'; throw error;
    }
    const id = window.crypto.randomUUID ? window.crypto.randomUUID() : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const next = { workspace: d.applyCommand(latest.workspace, { type, payload }, id), revision: latest.revision + 1 };
    try { localStorage.setItem(KEY, JSON.stringify(next)); }
    catch (_) { throw new Error('浏览器未能保存这次修改，请检查存储空间或隐私模式。'); }
    snapshot = next; render();
  }
  function toast(message) {
    const el = document.getElementById('toast');
    el.textContent = message; el.classList.add('visible'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('visible'), 3200);
  }
  function go(page) { if (currentPage() === page) render(); else location.hash = page; }
  function heading(eyebrow, title, subtitle, action = '') {
    return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
  }
  function taskRow(task, compact = false) {
    return `<div class="task-row ${task.done ? 'is-done' : ''} ${compact ? 'compact' : ''}">
      <button class="task-toggle" role="checkbox" aria-checked="${task.done}" aria-label="${task.done ? '重新打开' : '完成'}：${esc(task.title)}" data-action="toggle" data-id="${esc(task.id)}"><span aria-hidden="true">${task.done ? '✓' : ''}</span></button>
      <div class="task-copy"><button class="task-description" data-action="edit-task" data-id="${esc(task.id)}" aria-label="编辑：${esc(task.title)}"><span class="task-name">${esc(task.title)}</span>${!compact && task.note ? `<span class="task-note">${esc(task.note)}</span>` : ''}<span class="task-details"><span class="category-tag">${esc(task.category)}</span><span class="${task.overdue ? 'overdue' : ''}">${esc(task.dueLabel)}</span></span></button>
      ${!compact ? `<button class="linked-action" data-action="task-budget" data-id="${esc(task.id)}" aria-label="关联预算：${esc(task.title)}">${task.budget.count ? `${task.budget.count} 笔预算 · 预计 ¥ ${task.budget.plannedText} · 已付 ¥ ${task.budget.paidText}` : '＋ 关联预算 / 开支'} ↗</button>` : ''}</div>
      <span class="owner-tag ${task.assignee}">${esc(task.owner)}</span><button class="row-edit" data-action="edit-task" data-id="${esc(task.id)}" aria-label="查看安排：${esc(task.title)}">↗</button>
    </div>`;
  }
  function blank(icon, title, description, action = '') {
    return `<div class="empty-state">${art(icon)}<h3>${title}</h3><p>${description}</p>${action}</div>`;
  }

  function paymentPanel(items) {
    if (!items.length) return '';
    return `<section class="card payment-reminders" aria-label="付款提醒"><div class="section-heading"><h2>付款提醒 · ${items.length} 笔待付</h2><span class="muted">按付款日期排列</span></div>${items.slice(0, 3).map(item => `<button class="payment-reminder" data-action="edit-expense" data-id="${esc(item.id)}"><span><strong>${esc(item.title)}</strong><small>${esc(item.taskTitle || '未关联安排')}</small></span><span class="${item.paymentOverdue ? 'overdue' : ''}">${esc(item.paymentDueDate)} · ${esc(item.paymentLabel)}<small>待付 ¥ ${item.outstandingText} ↗</small></span></button>`).join('')}<p class="field-hint">显示最近 3 笔；其他付款日期可在预算记录中查看。应用内提醒，付清后自动移出，不发送微信消息。</p></section>`;
  }

  function home() {
    const state = snapshot.workspace, profile = state.profile, stats = d.summary(state);
    const upcoming = d.taskViews(state).filter(task => !task.done).slice(0, 3);
    const date = profile.weddingDate ? profile.weddingDate.replace(/-/g, ' . ') : '好日子，值得一起慢慢挑选';
    return `${heading('OUR LITTLE WEDDING', '我们的备婚手账', '把小小的期待，慢慢准备成大大的幸福。', `<button class="button secondary" data-action="profile">${art('letter')}编辑我们的约定</button>`)}
    <section class="overview-grid" aria-label="婚礼概览">
      <div class="countdown-card">
        <div class="hero-copy"><span class="hand-note">to our happily ever after</span><div class="couple-label">${esc(profile.name1)} <i>&</i> ${esc(profile.name2)}</div>
        ${stats.daysLeft === null ? '<h2>把好日子，<br>写进我们的日历。</h2><p>不用急，先一起想象这一天。</p>' : `<p class="countdown-caption">${stats.daysLeft < 0 ? '我们的婚礼已经过去' : stats.daysLeft === 0 ? '今天，一起说我愿意' : '距离我们的婚礼还有'}</p><div class="countdown-number">${Math.abs(stats.daysLeft)}<span>天</span></div>`}
        <button class="hero-date" data-action="profile">${esc(date)} <span>↗</span></button></div>
        ${art('couple', 'hero-illustration', '两个人站在花朵拱门下，一起迎接婚礼')}<span class="hero-spark spark-one">✧</span><span class="hero-spark spark-two">✧</span>
      </div>
      <div class="overview-stats">
        <button class="stat-card progress-card" data-action="go-tasks"><div class="stat-text"><span class="small-label">一点点，准备好了</span><strong>${stats.progress}<small>%</small></strong><p>已完成 <b>${stats.done}</b> / ${stats.total} 件小事</p></div><div class="progress-circle" style="--progress:${stats.progress * 3.6}deg">${art('checklist')}</div><span class="stat-arrow">↗</span></button>
        <button class="stat-card money-card" data-action="go-budget"><div class="stat-text"><span class="small-label">给每一份心意留位置</span><strong class="budget-value">${profile.totalBudget ? '<small>¥</small>' + stats.budgetText : '预算待商量'}</strong><p>已支付 <b>¥ ${stats.paidText}</b>${stats.overBudget ? ' · 预计超预算' : ''}</p></div>${art('wallet', 'stat-art')}<span class="stat-arrow">↗</span></button>
      </div>
    </section>
    ${paymentPanel(d.paymentReminders(state))}
    <section class="category-section"><div class="section-heading"><div><h2>把期待，放进小小的抽屉</h2><p>属于你们的婚礼，每个细节都可爱。</p></div><span class="section-caption">A LITTLE BIT OF EVERYTHING</span></div>
      <div class="category-grid">${categories.map(item => `<button class="category-card" data-action="category" data-category="${item.name}">${art(item.icon)}<strong>${item.name}</strong><span>${state.tasks.filter(task => task.category === item.name && !task.done).length} 件待准备 <i>↗</i></span></button>`).join('')}</div>
    </section>
    <section class="home-bottom"><div class="card upcoming-card"><div class="section-heading"><div><h2>接下来，一起做</h2><p>今天往前一点点，就很好。</p></div><button class="text-button" data-action="go-tasks">查看全部 ${arrow}</button></div>
      <div>${upcoming.length ? upcoming.map(task => taskRow(task, true)).join('') : blank('tea', '准备好的，都是幸福', '今天可以放下清单，给彼此一个拥抱。', '<button class="text-button" data-action="add-task">再记一件小事 ＋</button>')}</div>
      ${!profile.weddingDate ? '<div class="soft-note">小提醒：设置婚期后，默认清单会自动安排准备日期。</div>' : ''}
    </div><aside class="little-note">${art('flower', 'note-flower')}<span class="hand-note">a note for us</span><h3>婚礼是一天，<br>我们是每一天。</h3><p>一起做决定，一起期待。<br>最好的准备，是身边有你。</p><button class="text-button" data-action="go-together">写下我们的约定 ${arrow}</button></aside></section>`;
  }

  function filteredTasks() {
    return d.taskViews(snapshot.workspace).filter(task => (filters.status === 'all' || task.done === (filters.status === 'done')) && (filters.category === '全部' || filters.category === task.category) && (filters.owner === 'all' || filters.owner === task.assignee) && (!filters.query.trim() || task.title.toLowerCase().includes(filters.query.trim().toLowerCase())));
  }
  function taskList() {
    const items = filteredTasks();
    return items.length ? items.map(task => taskRow(task)).join('') : blank('tea', '这里暂时没有小事', '换个筛选看看，或记下新的计划。', '<button class="button secondary" data-action="add-task">＋ 记一件小事</button>');
  }
  function tasks() {
    const profile = snapshot.workspace.profile, stats = d.summary(snapshot.workspace);
    return `${heading('LITTLE THINGS, BIG DAY', '一件件，慢慢来', '不必一口气完成所有事，我们一起分担。', `<button class="button primary" data-action="add-task">＋ 记一件小事</button>`)}
    <section class="task-banner">${art('checklist')}<div><h2>已经完成 ${stats.done} 件小事啦</h2><p>${stats.pending ? `还有 ${stats.pending} 个期待，等着我们一起实现。` : '所有小事都安排好了，给彼此一个拥抱吧。'}</p></div><div class="banner-progress"><span>${stats.progress}%</span><div class="progress-track"><div style="width:${stats.progress}%"></div></div></div>${art('bow', 'banner-bow')}</section>
    <section class="card task-list-card"><div class="task-toolbar"><div class="tab-buttons" aria-label="完成状态">${[['pending', '待完成'], ['all', '全部'], ['done', '已完成']].map(([key, name]) => `<button data-action="filter-status" data-value="${key}" class="${filters.status === key ? 'active' : ''}" aria-pressed="${filters.status === key}">${name}</button>`).join('')}</div><div class="task-search"><span aria-hidden="true">⌕</span><input id="task-search" aria-label="搜索任务" placeholder="找一件小事…" value="${esc(filters.query)}" maxlength="60"></div><select id="owner-filter" aria-label="按负责人筛选">${option('all', '所有人', filters.owner)}${option('both', '一起', filters.owner)}${option('p1', profile.name1, filters.owner)}${option('p2', profile.name2, filters.owner)}</select></div>
    <div class="category-filters" aria-label="按分类筛选">${['全部', ...d.CATEGORIES].map(name => `<button class="chip ${filters.category === name ? 'active' : ''}" data-action="filter-category" data-category="${name}" aria-pressed="${filters.category === name}">${name}</button>`).join('')}</div><div id="task-list">${taskList()}</div></section>
    <div class="page-tip">${art('calendar')}<p>默认清单的日期会随婚期调整。手动指定的日期，会好好留在你选的那一天。</p></div>`;
  }

  function budget() {
    const state = snapshot.workspace, stats = d.summary(state), total = state.profile.totalBudget;
    const groups = categories.map(cat => ({ ...cat, amount: state.expenses.filter(item => item.category === cat.name).reduce((sum, item) => sum + item.planned, 0) }));
    if (budgetTask && !state.tasks.some(task => task.id === budgetTask)) budgetTask = '';
    const items = d.expenseViews(state).filter(item => (budgetCategory === '全部' || item.category === budgetCategory) && (!budgetTask || item.taskId === budgetTask)).reverse();
    const linkedBudget = d.taskBudget(state, budgetTask);
    return `${heading('ROOM FOR EVERY WISH', '心意，也有计划', '用喜欢的方式，准备喜欢的婚礼。', '<button class="button primary" data-action="add-expense">＋ 记一笔心意</button>')}
    <section class="budget-overview"><div class="budget-main-card"><div class="section-heading"><span class="small-label">婚礼总预算</span><button class="text-button" data-action="profile">一起调整 ↗</button></div><div class="budget-big">${total ? '<span>¥</span> ' + stats.budgetText : '一起定个小目标'}</div><div class="budget-meter"><div style="width:${stats.budgetPercent}%"></div></div><p>${total ? `${stats.overBudget ? '预计开支已超出总预算，和对方一起商量一下吧。' : `预计开支占预算的 ${stats.budgetPercent}%，每份心意都心中有数。`}` : '预算暂未设置，可以先记下每一笔期待。'}</p>${art('wallet', 'budget-hero-art')}</div><div class="mini-stat">${art('letter')}<span>预计开支</span><strong>¥ ${stats.plannedText}</strong><small>${state.expenses.length} 笔心意，慢慢安排</small></div><div class="mini-stat">${art('gift')}<span>已经支付</span><strong>¥ ${stats.paidText}</strong><small>${total ? `${stats.remaining < 0 ? '已付超预算' : '按已付计算尚余'} ¥ ${stats.remainingText}` : '包含定金与后续付款'}</small></div></section>
    ${paymentPanel(d.paymentReminders(state).filter(item => !budgetTask || item.taskId === budgetTask))}
    <div class="budget-columns"><section class="card expense-list-card"><div class="section-heading"><h2>每一笔心意</h2><select id="expense-category" aria-label="筛选开支分类">${['全部', ...d.CATEGORIES].map(name => option(name, name, budgetCategory)).join('')}</select></div>
    <label class="budget-task-filter">按关联安排查看<select id="expense-task-filter">${option('', '全部安排', budgetTask)}${state.tasks.map(task => option(task.id, task.title, budgetTask)).join('')}</select></label>
    ${budgetTask ? `<div class="soft-note linked-budget-summary">这件安排共 ${linkedBudget.count} 笔 · 预计 ¥ ${linkedBudget.plannedText} · 已付 ¥ ${linkedBudget.paidText}<button class="text-button" data-action="clear-budget-task">查看全部安排 ↗</button></div>` : ''}
    ${items.length ? items.map(item => `<article class="expense-entry"><button class="expense-row" data-action="edit-expense" data-id="${esc(item.id)}">${art(categories.find(cat => cat.name === item.category).icon)}<span class="expense-info"><strong>${esc(item.title)}</strong><small>${esc(item.category)}${item.note ? ' · ' + esc(item.note) : ''}</small></span><span class="expense-money"><strong>¥ ${d.formatMoney(item.planned)}</strong><small class="${item.paid > item.planned ? 'overdue' : ''}">已付 ¥ ${d.formatMoney(item.paid)}${item.paid > item.planned ? ' · 超预计' : ''}</small></span><span class="muted">↗</span></button>${item.taskId ? `<button class="linked-action" data-action="edit-task" data-id="${esc(item.taskId)}">关联安排 · ${esc(item.taskTitle)} ↗</button>` : '<p class="expense-detail">未关联安排 · 编辑可绑定</p>'}${item.paymentDueDate ? `<p class="expense-detail ${item.paymentOverdue ? 'overdue' : ''}">${esc(item.paymentDueDate)} · ${esc(item.paymentLabel)}${item.outstanding ? ' · 待付 ¥ ' + item.outstandingText : ''}</p>` : ''}</article>`).join('') : blank('gift', budgetTask ? '给这件安排记一笔预算' : '第一笔心意，从这里开始', budgetTask ? '新增开支会自动关联当前安排。' : '一束花、一件礼服，或一个喜欢的场地。', '<button class="button secondary" data-action="add-expense">＋ 添加一笔开支</button>')}
    </section><aside class="card breakdown-card"><div class="section-heading"><h2>花在哪里</h2><small>按预计开支</small></div><div class="stacked-budget">${groups.map(group => `<span style="width:${stats.planned ? group.amount / stats.planned * 100 : 100 / 6}%;background:${group.color}"></span>`).join('')}</div>${groups.map(group => `<div class="breakdown-row"><span><i style="background:${group.color}"></i>${group.name}</span><b>¥ ${d.formatMoney(group.amount)}</b></div>`).join('')}<div class="budget-note">${art('tea')}<p>不需要最贵的，<br>选你们最喜欢的。</p></div></aside></div>`;
  }

  function together() {
    const profile = snapshot.workspace.profile;
    return `${heading('TWO PEOPLE, ONE LITTLE WORLD', '我们的小日子', '成为一家人的路上，每一步都算数。', '<button class="button secondary" data-action="profile">编辑我们的约定 ↗</button>')}
    <section class="together-layout"><div class="couple-poster">${art('couple')}<span class="hand-note">better, together</span><h2>${esc(profile.name1)} <i>&</i> ${esc(profile.name2)}</h2><p>${profile.weddingDate ? esc(profile.weddingDate.replace(/-/g, ' . ')) : '好日子，慢慢定。'}${profile.location ? '<br>' + esc(profile.location) : ''}</p></div>
    <div class="together-right"><section class="card agreement-card"><div class="section-heading"><h2>我们的约定</h2>${art('letter')}</div>${[['婚礼日期', profile.weddingDate || '选一个好日子'], ['婚礼城市 / 场地', profile.location || '还在期待中'], ['婚礼总预算', profile.totalBudget ? '¥ ' + d.formatMoney(profile.totalBudget) : '一起商量']].map(([label, value]) => `<button class="agreement-row" data-action="profile"><span>${label}</span><strong>${esc(value)}</strong><span>↗</span></button>`).join('')}</section>
    <section class="shared-space"><div>${art('heart')}<h3>两个人，一起准备</h3></div><p>这里是本机 Web 体验版，计划保存在当前浏览器。微信小程序开通共同空间后，就能用邀请码邀请伴侣，一起更新。</p><button class="text-button" data-action="about">了解我们的数据 ↗</button></section></div></section>
    <section class="keepsakes"><button class="card keepsake" data-action="summary">${art('letter')}<span><strong>复制备婚摘要</strong><small>亲手分享给另一个主角</small></span><b>↗</b></button><button class="card keepsake" data-action="export">${art('gift')}<span><strong>${storageError ? '导出原始记录' : '收好一份备份'}</strong><small>把这些小事，留作纪念</small></span><b>↗</b></button><button class="card keepsake" data-action="gallery">${art('sparkles')}<span><strong>翻翻插画小册</strong><small>20 个温柔的婚礼小图案</small></span><b>↗</b></button></section>
    <div class="data-actions"><button class="text-button" data-action="import">导入之前的备份</button><span>·</span><button class="text-button reset-link" data-action="reset">重新开始本机计划</button><input type="file" id="import-file" accept="application/json,.json" hidden></div>`;
  }

  function render() {
    const page = currentPage();
    document.querySelectorAll('[data-nav]').forEach(el => { const active = el.dataset.nav === page; el.classList.toggle('active', active); if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
    const titles = { home: '我们的婚礼手账', tasks: '备婚小清单', budget: '心意与预算', together: '我们的小日子' };
    document.getElementById('breadcrumb').textContent = titles[page];
    document.getElementById('nav-count').textContent = d.summary(snapshot.workspace).pending;
    document.title = `${titles[page]} · 一起备婚`;
    main.innerHTML = (storageError ? `<div class="error-banner" role="alert">${esc(storageError)}</div>` : '') + ({ home, tasks, budget, together }[page])();
    document.querySelector('.save-status').innerHTML = `<span class="status-dot"></span>${storageError ? '本机保存待处理' : '已在本机安放'}`;
  }
  function field(name, label, value = '', extra = '') { return `<label class="form-field"><span>${label}</span><input name="${name}" value="${esc(value)}" ${extra}></label>`; }
  function categoryField(selected) { return `<label class="form-field"><span>收进哪个小抽屉</span><select name="category">${d.CATEGORIES.map(cat => option(cat, cat, selected)).join('')}</select></label>`; }
  function openForm(kind, id = '') {
    const state = snapshot.workspace;
    const item = kind === 'task' ? state.tasks.find(task => task.id === id) : state.expenses.find(expense => expense.id === id);
    if (id && !item) { toast('这条记录已经不在了，请刷新后再试。'); return; }
    editing = { kind, id, revision: snapshot.revision, original: item || null };
    let title, icon, fields;
    if (kind === 'profile') {
      const p = state.profile; title = '写下我们的约定'; icon = 'letter';
      fields = `<div class="form-grid">${field('name1', '你的称呼', p.name1, 'required maxlength="16" autocomplete="off"')}${field('name2', '伴侣的称呼', p.name2, 'required maxlength="16" autocomplete="off"')}</div>${field('weddingDate', '选一个好日子 · 也可以先留空', p.weddingDate, 'type="date" min="2000-01-01" max="2100-12-31"')}<p class="field-hint">婚期改变，默认清单的准备日期也会一起调整。</p>${field('location', '婚礼城市 / 场地', p.location, 'maxlength="60" placeholder="你们想在哪里说“我愿意”"')}${field('budgetInput', '婚礼总预算（元）', d.editMoney(p.totalBudget), 'inputmode="decimal" maxlength="12" placeholder="还没决定，可以先留空"')}`;
    } else if (kind === 'task') {
      const t = item || { title: '', category: '其他', assignee: 'both', dueDate: '', daysBefore: null, note: '' }; title = id ? '这件小事的安排' : '记一件小事'; icon = 'checklist';
      fields = `${field('title', '想做什么', t.title, 'required maxlength="60" placeholder="比如：周末一起去看场地"')}${categoryField(t.category)}<fieldset class="form-field"><legend>交给谁来准备</legend><div class="assignee-choices">${[['both', '一起'], ['p1', state.profile.name1], ['p2', state.profile.name2]].map(([key, name]) => `<label><input type="radio" name="assignee" value="${key}" ${t.assignee === key ? 'checked' : ''}><span>${esc(name)}</span></label>`).join('')}</div></fieldset>${field('dueDate', '计划完成日期 · 可选', t.dueDate, 'type="date" min="2000-01-01" max="2100-12-31"')}${t.daysBefore !== null ? `<p class="field-hint">不指定日期时，会安排在婚前 ${t.daysBefore} 天，随婚期一起调整。</p>` : ''}<label class="form-field"><span>想补充的话</span><textarea name="note" maxlength="300" rows="3" placeholder="灵感、要留意的细节，或想和对方说的话…">${esc(t.note)}</textarea></label>`;
    } else {
      const selectedTask = state.tasks.find(task => task.id === budgetTask);
      const e = item || { title: '', category: selectedTask ? selectedTask.category : '其他', taskId: budgetTask, paymentDueDate: '', planned: 0, paid: 0, note: '' }; title = id ? '这笔心意的详情' : '记一笔心意'; icon = 'wallet';
      fields = `${field('title', '这笔开支叫什么', e.title, 'required maxlength="60" placeholder="比如：婚礼摄影团队"')}${categoryField(e.category)}<label class="form-field"><span>关联安排</span><select name="taskId">${option('', '暂不关联安排', e.taskId || '')}${state.tasks.map(task => option(task.id, task.title, e.taskId)).join('')}</select></label><p class="field-hint">一件安排可以关联多笔开支；选择“暂不关联安排”可解除绑定。</p><div class="form-grid">${field('plannedInput', '预计总金额（元）', d.editMoney(e.planned), 'inputmode="decimal" maxlength="12" placeholder="0.00"')}${field('paidInput', '已付金额（元）', d.editMoney(e.paid), 'inputmode="decimal" maxlength="12" placeholder="0.00"')}</div><label class="form-field"><span>留个小备注</span><textarea name="note" maxlength="300" rows="3" placeholder="套餐内容、尾款时间，或其他需要记住的事…">${esc(e.note)}</textarea></label>${field('paymentDueDate', '付款日期（可选）', e.paymentDueDate, 'type="date" min="2000-01-01" max="2100-12-31"')}<p class="field-hint">未付清时在首页和预算页提醒，不发送微信消息。分期付款可拆成定金、尾款两笔，分别填写各期金额和日期。这里只记账，不会发起支付。</p>`;
    }
    document.getElementById('dialog-content').innerHTML = `<div class="dialog-heading">${art(icon)}<div><span class="eyebrow">A LITTLE PLAN FOR US</span><h2 id="dialog-title">${title}</h2></div><button class="close-button" data-action="close-dialog" aria-label="关闭弹窗">×</button></div><form id="edit-form" data-kind="${kind}"><div class="form-body">${fields}<p id="form-error" class="form-error" role="alert" hidden></p></div><div class="dialog-footer">${id ? '<button type="button" class="text-button danger-text" data-action="delete-record">删除这条记录</button>' : '<span class="form-footer-note">慢慢来，好好准备。</span>'}<button type="submit" class="button primary">保存这份安排</button></div></form>`;
    editor.showModal();
  }
  function info(title, content, icon = 'letter') {
    editing = null;
    document.getElementById('dialog-content').innerHTML = `<div class="dialog-heading">${art(icon)}<h2 id="dialog-title">${title}</h2><button class="close-button" data-action="close-dialog" aria-label="关闭弹窗">×</button></div><div class="info-body">${content}</div><div class="dialog-footer"><span></span><button class="button primary" data-action="close-dialog">好好收下</button></div>`;
    editor.showModal();
  }
  function confirm(title, message, button = '确定') {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-copy').textContent = message;
    document.getElementById('confirm-ok').textContent = button;
    confirmation.showModal();
    return new Promise(resolve => {
      let settled = false;
      const finish = value => { if (settled) return; settled = true; confirmation.close(); resolve(value); };
      document.getElementById('confirm-cancel').onclick = () => finish(false);
      document.getElementById('confirm-ok').onclick = () => finish(true);
      confirmation.oncancel = event => { event.preventDefault(); finish(false); };
    });
  }
  async function summary() {
    const state = snapshot.workspace, p = state.profile, stats = d.summary(state);
    const text = [`${p.name1} & ${p.name2} · 一起备婚`, `婚期：${p.weddingDate || '待定'}${p.location ? ' / ' + p.location : ''}`, `进度：${stats.done}/${stats.total}，总预算：${p.totalBudget ? '¥ ' + stats.budgetText : '待定'}`, `预计开支：¥ ${stats.plannedText}，已付：¥ ${stats.paidText}`, '', '备婚清单', ...d.taskViews(state).map(task => `${task.done ? '✓' : '○'} ${task.title} · ${task.owner} · ${task.due || task.dueLabel}`), '', '每一笔心意', ...d.expenseViews(state).map(e => `${e.title}：预计 ¥ ${e.plannedText} / 已付 ¥ ${e.paidText}${e.taskTitle ? ' · 安排：' + e.taskTitle : ''}${e.paymentDueDate ? ' · ' + e.paymentDueDate + ' ' + e.paymentLabel : ''}`)].join('\n');
    try { await navigator.clipboard.writeText(text); toast('备婚摘要已复制，亲手分享给对方吧。'); }
    catch (_) { info('收好你们的备婚摘要', `<p>浏览器未允许自动复制，可以在下面选中后复制。</p><textarea class="summary-text" readonly aria-label="备婚摘要">${esc(text)}</textarea>`); }
  }
  function download() {
    let content;
    try { content = storageError ? localStorage.getItem(KEY) || '{}' : JSON.stringify({ app: 'wedding-together', exportedAt: new Date().toISOString(), workspace: snapshot.workspace }, null, 2); }
    catch (_) { toast('浏览器禁止读取存储，暂时无法导出。'); return; }
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `一起备婚-${d.todayString()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('已导出记录，请把它好好收起来。');
  }
  async function replaceWorkspace(workspace) {
    const next = { workspace: d.validateWorkspace(workspace), revision: snapshot.revision + 1 };
    localStorage.setItem(KEY, JSON.stringify(next)); snapshot = next; storageError = ''; render();
  }

  document.addEventListener('submit', event => {
    if (event.target.id !== 'edit-form') return;
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target));
    try {
      let type, payload;
      if (editing.kind === 'profile') { type = 'updateProfile'; payload = { name1: form.name1, name2: form.name2, weddingDate: form.weddingDate, location: form.location, totalBudget: d.parseMoney(form.budgetInput) }; }
      else if (editing.kind === 'task') { type = editing.id ? 'updateTask' : 'addTask'; payload = { title: form.title, category: form.category, assignee: form.assignee, dueDate: form.dueDate, daysBefore: editing.original ? editing.original.daysBefore : null, done: editing.original ? editing.original.done : false, note: form.note }; }
      else { type = editing.id ? 'updateExpense' : 'addExpense'; payload = { title: form.title, category: form.category, taskId: form.taskId, paymentDueDate: form.paymentDueDate, planned: d.parseMoney(form.plannedInput), paid: d.parseMoney(form.paidInput), note: form.note }; }
      if (editing.id) payload.id = editing.id;
      commit(type, payload, editing.revision); editor.close(); toast('已记下这份安排。');
    } catch (error) {
      const target = document.getElementById('form-error'); target.hidden = false; target.textContent = error.message;
      if (error.code === 'CONFLICT') editing.revision = snapshot.revision;
    }
  });
  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-action]'); if (!target) return;
    const action = target.dataset.action;
    try {
      if (action === 'profile') openForm('profile');
      else if (action === 'add-task') openForm('task');
      else if (action === 'edit-task') openForm('task', target.dataset.id);
      else if (action === 'task-budget') { budgetTask = target.dataset.id; budgetCategory = '全部'; go('budget'); }
      else if (action === 'clear-budget-task') { budgetTask = ''; budgetCategory = '全部'; render(); }
      else if (action === 'add-expense') openForm('expense');
      else if (action === 'edit-expense') openForm('expense', target.dataset.id);
      else if (action === 'close-dialog') editor.close();
      else if (action.startsWith('go-')) go(action.slice(3));
      else if (action === 'toggle') { const task = snapshot.workspace.tasks.find(item => item.id === target.dataset.id); if (task) { commit('updateTask', { id: task.id, done: !task.done }); toast(task.done ? '已放回待办清单。' : '又完成一件小事，真好。'); } }
      else if (action === 'filter-status') { filters.status = target.dataset.value; render(); }
      else if (action === 'filter-category') { filters.category = target.dataset.category; render(); }
      else if (action === 'category') { filters.category = target.dataset.category; filters.status = 'pending'; filters.query = ''; filters.owner = 'all'; go('tasks'); }
      else if (action === 'delete-record') {
        if (editing && await confirm('要和这条记录说再见吗？', editing.kind === 'task' ? '删除后无法撤销。关联开支会保留在预算中，只解除与这件安排的关联。' : '删除后无法撤销，预算会重新计算。', '确认删除')) { commit(editing.kind === 'task' ? 'deleteTask' : 'deleteExpense', { id: editing.id }, editing.revision); editor.close(); toast('记录已删除。'); }
      }
      else if (action === 'summary') await summary();
      else if (action === 'export') download();
      else if (action === 'import') document.getElementById('import-file').click();
      else if (action === 'reset') { if (await confirm('重新开始本机计划？', '这会清空当前浏览器的称呼、婚期、任务和预算，恢复初始清单。建议先导出一份备份。', '确认重新开始')) { await replaceWorkspace(d.createWorkspace()); toast('新的手账，已经准备好。'); } }
      else if (action === 'about') info('你们的计划，妥善安放', '<p>这个 Web demo 使用当前浏览器的本地存储，不需要注册或登录，也不会把计划上传到服务器。</p><p>刷新页面后记录还在；清理浏览器数据、无痕模式或换一台设备时，记录可能不会保留。可以在“我们的小日子”中导出和导入备份。</p><p>Web 与微信小程序的本机记录各自保存。双人同步需要在微信小程序中开通云开发并绑定伴侣；这里不会显示虚假的同步成功。</p>', 'heart');
      else if (action === 'gallery') {
        const response = await fetch('/assets/illustrations/manifest.json'); if (!response.ok) throw new Error('插画小册暂时打不开，请稍后重试。');
        const icons = await response.json();
        info('20 个婚礼小小的可爱', `<p>柔和色块、细细线条。把婚礼里的每一份心意，都画成小小的图案。</p><div class="illustration-gallery">${icons.map(item => `<div>${art(item.id)}<span>${esc(item.title)}</span></div>`).join('')}</div>`, 'sparkles');
      }
    } catch (error) { toast(error.message || '这次操作没有完成，请再试一次。'); }
  });
  document.addEventListener('input', event => { if (event.target.id === 'task-search') { filters.query = event.target.value; document.getElementById('task-list').innerHTML = taskList(); } });
  document.addEventListener('change', async event => {
    if (event.target.id === 'owner-filter') { filters.owner = event.target.value; document.getElementById('task-list').innerHTML = taskList(); }
    else if (event.target.id === 'expense-task-filter') { budgetTask = event.target.value; budgetCategory = '全部'; render(); }
    else if (event.target.id === 'expense-category') { budgetCategory = event.target.value; render(); }
    else if (event.target.id === 'import-file') {
      const file = event.target.files[0]; if (!file) return;
      try {
        if (file.size > 2 * 1024 * 1024) throw new Error('备份文件过大，请选择 2 MB 以内的 JSON 文件。');
        const parsed = JSON.parse(await file.text());
        const state = d.validateWorkspace(parsed.workspace);
        if (await confirm('打开这份备婚记录？', '导入会替换当前浏览器的计划，不会影响微信小程序。建议先导出当前记录。', '确认导入')) { await replaceWorkspace(state); toast('你们的计划，已经好好放回来了。'); }
      } catch (error) { toast(error instanceof SyntaxError ? '这不是有效的 JSON 备份文件。' : error.message); }
      finally { event.target.value = ''; }
    }
  });
  editor.addEventListener('click', event => { if (event.target === editor) { const rect = editor.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) editor.close(); } });
  window.addEventListener('hashchange', () => { render(); window.scrollTo({ top: 0, behavior: 'instant' }); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { snapshot = load(); render(); } });
  window.addEventListener('storage', event => { if (event.key === KEY) { snapshot = load(); render(); toast('另一个页面的更新，已经收到。'); } });
  document.getElementById('today').textContent = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  render();
})();
