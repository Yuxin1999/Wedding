const store = require('../../utils/store');
const domain = require('../../utils/domain');
const ui = require('../../utils/ui');
const { categoryIcon } = require('../../utils/illustrations');

Page({
  data: { loading: true, ready: false, pageVisible: false, errorMessage: '' },
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
    const inspirations = domain.CATEGORIES.map(name => ({ name, illustration: categoryIcon(name), count: state.tasks.filter(task => task.category === name && !task.done).length }));
    const paymentReminders = domain.paymentReminders(state);
    this.setData({ ready: true, profile: state.profile, stats, upcoming, dateLabel, countdownLabel, hasDate: stats.daysLeft !== null, countdown: Math.abs(stats.daysLeft || 0), syncLabel: snapshot.syncLabel, stages, inspirations, paymentReminders: paymentReminders.slice(0, 3), paymentReminderCount: paymentReminders.length });
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
