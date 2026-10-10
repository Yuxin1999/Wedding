const store = require('../../utils/store');
const domain = require('../../utils/domain');
const ui = require('../../utils/ui');
const { categoryIcon } = require('../../utils/illustrations');
const COLORS = ['#6d8059', '#b4b991', '#d2bd8c', '#9aada0', '#c8a493', '#b6bcb2'];

Page({
  data: { loading: true, ready: false, pageVisible: false, errorMessage: '', categories: domain.CATEGORIES, category: '全部', taskFilter: '', taskFilterIndex: 0, editor: false, saving: false, form: {}, taskOptions: [] },
  onHide() { this.setData({ pageVisible: false }); },
  async onShow() {
    this.setData({ pageVisible: true }); await this.refresh();
    const taskId = wx.getStorageSync('wedding:budget-task');
    if (taskId && this._snapshot) {
      wx.setStorageSync('wedding:budget-task', '');
      if (this._snapshot.workspace.tasks.some(task => task.id === taskId)) {
        this.setData({ taskFilter: taskId, category: '全部' }); this.filterExpenses();
      } else ui.error(new Error('这件安排已被删除'));
    }
    const expenseId = wx.getStorageSync('wedding:open-expense');
    if (expenseId && this._snapshot) {
      wx.setStorageSync('wedding:open-expense', '');
      this.setData({ taskFilter: '', category: '全部' }); this.filterExpenses();
      this.openEdit({ currentTarget: { dataset: { id: expenseId } } });
    }
  },
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
    const categories = domain.getCategories(state).map(item => item.name);
    const breakdown = categories.map((name, index) => {
      const items = state.expenses.filter(item => item.category === name);
      const planned = items.reduce((sum, item) => sum + item.planned, 0);
      return { name, amount: domain.formatMoney(planned), percent: stats.planned ? planned / stats.planned * 100 : 0, color: COLORS[index % COLORS.length], count: items.length };
    }).filter(item => item.count);
    const taskOptions = [{ id: '', title: '暂不关联安排' }].concat(state.tasks.map(task => ({ id: task.id, title: task.title })));
    const taskFilterOptions = [{ id: '', title: '全部安排' }].concat(taskOptions.slice(1));
    const taskFilter = state.tasks.some(task => task.id === this.data.taskFilter) ? this.data.taskFilter : '';
    this.setData({ ready: true, categories, category: categories.includes(this.data.category) ? this.data.category : '全部', profile: state.profile, stats, breakdown, taskOptions, taskFilterOptions, taskFilter, paidOverBudget: state.profile.totalBudget > 0 && stats.remaining < 0 });
    this.filterExpenses();
  },
  filterExpenses() {
    const state = this._snapshot.workspace;
    const items = domain.expenseViews(state).filter(item => (this.data.category === '全部' || item.category === this.data.category) && (!this.data.taskFilter || item.taskId === this.data.taskFilter));
    const taskFilterIndex = Math.max(0, this.data.taskFilterOptions.findIndex(item => item.id === this.data.taskFilter));
    const reminders = domain.paymentReminders(state).filter(item => !this.data.taskFilter || item.taskId === this.data.taskFilter);
    this.setData({ taskFilterIndex, reminders: reminders.slice(0, 3), reminderCount: reminders.length, selectedBudget: domain.taskBudget(state, this.data.taskFilter), expenses: items.map(item => Object.assign({}, item, { exceeded: item.paid > item.planned, color: COLORS[this.data.categories.indexOf(item.category) % COLORS.length], illustration: categoryIcon(item.category, state) })).reverse() });
  },
  setTaskFilter(event) { const item = this.data.taskFilterOptions[Number(event.detail.value)]; if (item) { this.setData({ taskFilter: item.id, category: '全部' }); this.filterExpenses(); } },
  clearTaskFilter() { this.setData({ taskFilter: '', category: '全部' }); this.filterExpenses(); },
  openTask(event) { wx.setStorageSync('wedding:open-task', event.currentTarget.dataset.id); ui.navigateTab('/pages/tasks/index'); },
  setCategory(event) { this.setData({ category: event.currentTarget.dataset.category }); this.filterExpenses(); },
  openAdd() {
    this._editorRevision = this._snapshot.revision;
    const task = this._snapshot.workspace.tasks.find(item => item.id === this.data.taskFilter);
    const category = task ? task.category : this.data.category === '全部' ? this.data.categories[0] : this.data.category;
    this.setData({ editor: true, editingId: '', form: { title: '', category, taskId: task ? task.id : '', paymentDueDate: '', plannedInput: '', paidInput: '', note: '' }, categoryIndex: this.data.categories.indexOf(category), taskIndex: Math.max(0, this.data.taskOptions.findIndex(item => task && item.id === task.id)) });
  },
  openEdit(event) {
    const item = this._snapshot.workspace.expenses.find(expense => expense.id === event.currentTarget.dataset.id);
    if (!item) return;
    this._editorRevision = this._snapshot.revision;
    this.setData({ editor: true, editingId: item.id, categoryIndex: this.data.categories.indexOf(item.category), taskIndex: Math.max(0, this.data.taskOptions.findIndex(task => task.id === item.taskId)), form: Object.assign({}, item, { plannedInput: domain.editMoney(item.planned), paidInput: domain.editMoney(item.paid) }) });
  },
  closeEditor() { if (!this.data.saving) this.setData({ editor: false }); },
  field(event) { ui.field(this, event); },
  chooseCategory(event) { const index = Number(event.detail.value); this.setData({ categoryIndex: index, 'form.category': this.data.categories[index] }); },
  chooseTask(event) { const index = Number(event.detail.value); const item = this.data.taskOptions[index]; if (item) this.setData({ taskIndex: index, 'form.taskId': item.id }); },
  choosePaymentDate(event) { this.setData({ 'form.paymentDueDate': event.detail.value }); },
  clearPaymentDate() { this.setData({ 'form.paymentDueDate': '' }); },
  async save() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      const form = this.data.form;
      const payload = { title: form.title, category: form.category, taskId: form.taskId || '', paymentDueDate: form.paymentDueDate || '', planned: domain.parseMoney(form.plannedInput), paid: domain.parseMoney(form.paidInput), note: form.note };
      if (this.data.editingId) payload.id = this.data.editingId;
      this.render(await store.mutate({ type: this.data.editingId ? 'updateExpense' : 'addExpense', payload }, this._editorRevision));
      this.setData({ editor: false });
      ui.success('已记入预算');
    } catch (error) { ui.error(error); if (error.code === 'CONFLICT') { await this.refresh(); this._editorRevision = this._snapshot.revision; } }
    finally { this.setData({ saving: false }); }
  },
  async remove() {
    if (this.data.saving || !await ui.confirm('删除这笔开支？', '删除后，总预计开支和已付金额会重新计算。')) return;
    this.setData({ saving: true });
    try {
      this.render(await store.mutate({ type: 'deleteExpense', payload: { id: this.data.editingId } }, this._editorRevision));
      this.setData({ editor: false });
      ui.success('已删除');
    } catch (error) { ui.error(error); if (error.code === 'CONFLICT') { await this.refresh(); this._editorRevision = this._snapshot.revision; } }
    finally { this.setData({ saving: false }); }
  },
  setBudget() { ui.navigateTab('/pages/together/index'); }
});
