const store = require('../../utils/store');
const domain = require('../../utils/domain');
const ui = require('../../utils/ui');
const galleryItems = require('../../utils/illustration-catalog');

Page({
  data: { loading: true, ready: false, pageVisible: false, errorMessage: '', editor: false, joinEditor: false, gallery: false, galleryItems, saving: false, connecting: false, form: {}, joinCode: '', inviteCode: '', configured: store.configured(), mode: store.mode() },
  onHide() { this.setData({ pageVisible: false }); },
  onShow() { this.setData({ pageVisible: true }); this.refresh(); },
  async onPullDownRefresh() { await this.refresh(); wx.stopPullDownRefresh(); },
  async refresh() {
    this.setData({ loading: true, errorMessage: '' });
    try { this.render(await store.getSnapshot()); }
    catch (error) { this.setData({ errorMessage: error.message, mode: store.mode() }); }
    finally { this.setData({ loading: false }); }
  },
  render(snapshot) {
    this._snapshot = snapshot;
    const profile = snapshot.workspace.profile;
    this.setData({ ready: true, profile, stats: domain.summary(snapshot.workspace), mode: snapshot.mode, configured: snapshot.configured, memberCount: snapshot.memberCount, role: snapshot.role, initial1: profile.name1.slice(0, 1), initial2: profile.name2.slice(0, 1), errorMessage: '' });
    if (snapshot.memberCount === 2) this.setData({ inviteCode: '' });
  },
  openEditor() {
    if (!this._snapshot) return;
    const profile = this._snapshot.workspace.profile;
    this._editorRevision = this._snapshot.revision;
    this.setData({ editor: true, form: Object.assign({}, profile, { budgetInput: domain.editMoney(profile.totalBudget) }) });
  },
  closeEditor() { if (!this.data.saving) this.setData({ editor: false }); },
  field(event) { ui.field(this, event); },
  chooseDate(event) { this.setData({ 'form.weddingDate': event.detail.value }); },
  clearDate() { this.setData({ 'form.weddingDate': '' }); },
  async save() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      const form = this.data.form;
      const profile = { name1: form.name1, name2: form.name2, weddingDate: form.weddingDate, location: form.location, totalBudget: domain.parseMoney(form.budgetInput) };
      this.render(await store.mutate({ type: 'updateProfile', payload: profile }, this._editorRevision));
      this.setData({ editor: false });
      ui.success('计划已更新');
    } catch (error) { ui.error(error); if (error.code === 'CONFLICT') { await this.refresh(); this._editorRevision = this._snapshot.revision; } }
    finally { this.setData({ saving: false }); }
  },
  async connect() {
    if (this.data.connecting || !this.data.configured) return;
    if (!await ui.confirm('开启你们的共同空间', '首次创建会把本机计划带到云端；如已绑定，则读取原有共同计划。本机记录会保留。')) return;
    this.setData({ connecting: true });
    try { this.render(await store.connect()); ui.success('共同空间已连接'); }
    catch (error) { ui.error(error); }
    finally { this.setData({ connecting: false }); }
  },
  openJoin() { this.setData({ joinEditor: true, joinCode: '' }); },
  closeJoin() { if (!this.data.connecting) this.setData({ joinEditor: false }); },
  codeInput(event) { this.setData({ joinCode: event.detail.value.toUpperCase().replace(/\s/g, '') }); },
  async join() {
    if (this.data.connecting) return;
    if (!/^[A-Z2-9]{12}$/.test(this.data.joinCode)) { ui.error(new Error('请填写完整的 12 位邀请码')); return; }
    this.setData({ connecting: true });
    try { this.render(await store.join(this.data.joinCode)); this.setData({ joinEditor: false }); ui.success('从现在起，一起准备'); }
    catch (error) { ui.error(error); }
    finally { this.setData({ connecting: false }); }
  },
  async invite() {
    if (this.data.connecting) return;
    this.setData({ connecting: true });
    try {
      const result = await store.invite();
      this.setData({ inviteCode: result.code });
    } catch (error) { ui.error(error); if (error.code === 'SPACE_FULL') await this.refresh(); }
    finally { this.setData({ connecting: false }); }
  },
  copyInvite() { wx.setClipboardData({ data: this.data.inviteCode }); },
  openGallery() { this.setData({ gallery: true }); },
  closeGallery() { this.setData({ gallery: false }); },
  async localMode() {
    if (!await ui.confirm('查看本机计划？', '共同空间会保留。本机计划单独保存，不会同步给伴侣；稍后可以重新连接。')) return;
    store.useLocal(); this.setData({ inviteCode: '' }); await this.refresh();
  },
  copySummary() {
    if (!this._snapshot) return;
    const state = this._snapshot.workspace;
    const stats = domain.summary(state);
    const lines = [
      `${state.profile.name1} & ${state.profile.name2} · 一起备婚`,
      `婚期：${state.profile.weddingDate || '待定'}${state.profile.location ? ' / ' + state.profile.location : ''}`,
      `进度：${stats.done}/${stats.total}，总预算：${state.profile.totalBudget ? '¥' + stats.budgetText : '待定'}`,
      `预计开支：¥${stats.plannedText}，已付：¥${stats.paidText}`, '', '备婚清单'
    ];
    domain.taskViews(state).forEach(item => lines.push(`${item.done ? '✓' : '○'} ${item.title} · ${item.owner} · ${item.due || item.dueLabel}`));
    if (state.expenses.length) {
      lines.push('', '预算明细');
      state.expenses.forEach(item => lines.push(`${item.title}：预计 ¥${domain.formatMoney(item.planned)} / 已付 ¥${domain.formatMoney(item.paid)}`));
    }
    wx.setClipboardData({ data: lines.join('\n') });
  },
  privacy() {
    wx.showModal({ title: '你们的计划，妥善安放', content: '本机模式只保存在当前设备，清理微信数据或更换设备可能丢失。云端模式由已绑定的两人共同访问，更新页面或下拉时刷新；邀请码有效期 7 天，只分享给伴侣。无需授权手机号、头像、通讯录或定位。备婚摘要含你们填写的内容，请自行决定分享给谁。', showCancel: false, confirmColor: '#344e41' });
  }
});
