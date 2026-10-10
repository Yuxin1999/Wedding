const store = require('../../utils/store');
const domain = require('../../utils/domain');
const ui = require('../../utils/ui');
const { categoryIcon } = require('../../utils/illustrations');

Page({
  data: { loading: true, ready: false, pageVisible: false, errorMessage: '', categoryEditor: false, categoryMode: 'list', saving: false, categoryForm: {}, categoryError: '', icons: domain.CATEGORY_ICONS.map(item => Object.assign({}, item, { illustration: `/assets/illustrations/${item.id}.png` })) },
  onHide() { this.setData({ pageVisible: false }); },
  onShow() { this.setData({ pageVisible: true }); this.refresh(); },
  async onPullDownRefresh() { await this.refresh(); wx.stopPullDownRefresh(); },
  async refresh() {
    this.setData({ loading: true, errorMessage: '' });
    try { this.render(await store.getSnapshot()); }
    catch (error) { this.setData({ errorMessage: error.message }); }
    finally { this.setData({ loading: false }); }
  },
  render(snapshot) {
    this._snapshot = snapshot;
    const state = snapshot.workspace;
    const stats = domain.summary(state);
    const upcoming = domain.taskViews(state).filter(task => !task.done).slice(0, 3);
    const dateLabel = state.profile.weddingDate ? state.profile.weddingDate.replace(/-/g, ' . ') : '为我们的好日子，留一个位置';
    const countdownLabel = stats.daysLeft === null ? '距离我们的婚礼' : stats.daysLeft < 0 ? '我们的婚礼已过去' : stats.daysLeft === 0 ? '今天，一起说我愿意' : '距离我们的婚礼还有';
    const stages = [
      { title: '一起启程', min: 180, max: 1000 }, { title: '定下心意', min: 90, max: 179 },
      { title: '填满细节', min: 21, max: 89 }, { title: '迎接这一天', min: 0, max: 20 }
    ].map((stage, index) => {
      const tasks = state.tasks.filter(task => task.daysBefore !== null && task.daysBefore >= stage.min && task.daysBefore <= stage.max);
      return { title: stage.title, done: tasks.length > 0 && tasks.every(task => task.done), count: tasks.filter(task => task.done).length, total: tasks.length, illustration: `/assets/illustrations/${['plant', 'rings', 'letter', 'cake'][index]}.png` };
    });
    const inspirations = domain.getCategories(state).map(item => Object.assign({}, item, {
      illustration: categoryIcon(item.name, state), count: state.tasks.filter(task => task.category === item.name && !task.done).length,
      taskCount: state.tasks.filter(task => task.category === item.name).length, expenseCount: state.expenses.filter(expense => expense.category === item.name).length
    }));
    const paymentReminders = domain.paymentReminders(state);
    this.setData({ ready: true, profile: state.profile, stats, upcoming, dateLabel, countdownLabel, hasDate: stats.daysLeft !== null, countdown: Math.abs(stats.daysLeft || 0), syncLabel: snapshot.syncLabel, stages, inspirations, paymentReminders: paymentReminders.slice(0, 3), paymentReminderCount: paymentReminders.length });
  },
  manageCategories() { this.setData({ categoryEditor: true, categoryMode: 'list', categoryError: '' }); },
  addCategory() {
    if (this.data.saving) return;
    this._categoryRevision = this._snapshot.revision;
    this.setData({ categoryEditor: true, categoryMode: 'edit', categoryForm: { name: '', icon: 'rings' }, editingCategoryId: '', categoryError: '', canDeleteCategory: false });
  },
  editCategory(event) {
    if (this.data.saving) return;
    const item = this.data.inspirations.find(item => item.id === event.currentTarget.dataset.id);
    if (!item) return;
    this._categoryRevision = this._snapshot.revision;
    this.setData({ categoryMode: 'edit', editingCategoryId: item.id, categoryForm: { name: item.name, icon: item.icon }, categoryError: '', canDeleteCategory: !item.taskCount && !item.expenseCount && this.data.inspirations.length > 1 });
  },
  categoryName(event) { this.setData({ 'categoryForm.name': event.detail.value }); },
  chooseCategoryIcon(event) { this.setData({ 'categoryForm.icon': event.currentTarget.dataset.icon }); },
  closeCategories() { if (!this.data.saving) this.setData({ categoryEditor: false }); },
  backToCategories() { if (!this.data.saving) this.setData({ categoryMode: 'list', categoryError: '' }); },
  async saveCategory() {
    if (this.data.saving) return;
    this.setData({ saving: true, categoryError: '' });
    try {
      const payload = Object.assign({}, this.data.categoryForm);
      if (this.data.editingCategoryId) payload.id = this.data.editingCategoryId;
      this.render(await store.mutate({ type: payload.id ? 'updateCategory' : 'addCategory', payload }, this._categoryRevision));
      this.setData({ categoryMode: 'list' }); ui.success('分类已保存');
    } catch (error) { this.setData({ categoryError: error.message }); if (error.code === 'CONFLICT') { await this.refresh(); this._categoryRevision = this._snapshot.revision; } }
    finally { this.setData({ saving: false }); }
  },
  async removeCategory() {
    if (this.data.saving || !this.data.canDeleteCategory || !await ui.confirm('删除这个空分类？', '已有事项或开支的分类需要先移走记录才能删除。')) return;
    this.setData({ saving: true, categoryError: '' });
    try {
      this.render(await store.mutate({ type: 'deleteCategory', payload: { id: this.data.editingCategoryId } }, this._categoryRevision));
      this.setData({ categoryMode: 'list' }); ui.success('分类已删除');
    } catch (error) { this.setData({ categoryError: error.message }); if (error.code === 'CONFLICT') { await this.refresh(); this._categoryRevision = this._snapshot.revision; } }
    finally { this.setData({ saving: false }); }
  },
  async toggle(event) {
    if (this._saving) return;
    this._saving = true;
    try {
      this.render(await store.mutate({ type: 'updateTask', payload: { id: event.currentTarget.dataset.id, done: true } }, this._snapshot.revision));
      wx.vibrateShort({ type: 'light' });
    } catch (error) { ui.error(error); if (error.code === 'CONFLICT') await this.refresh(); }
    finally { this._saving = false; }
  },
  openTasks() { ui.navigateTab('/pages/tasks/index'); },
  openCategory(event) { wx.setStorageSync('wedding:task-category', event.currentTarget.dataset.category); this.openTasks(); },
  openBudget() { ui.navigateTab('/pages/budget/index'); },
  openPayment(event) { wx.setStorageSync('wedding:open-expense', event.currentTarget.dataset.id); this.openBudget(); },
  openTogether() { ui.navigateTab('/pages/together/index'); }
});
