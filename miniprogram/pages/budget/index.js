const store = require('../../utils/store');
const domain = require('../../utils/domain');
const ui = require('../../utils/ui');
const { categoryIcon } = require('../../utils/illustrations');
const COLORS = ['#6d8059', '#b4b991', '#d2bd8c', '#9aada0', '#c8a493', '#b6bcb2'];

Page({
  data: { loading: true, ready: false, errorMessage: '', categories: domain.CATEGORIES, category: '全部', editor: false, saving: false, form: {} },
  onShow() { this.refresh(); },
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
    const breakdown = domain.CATEGORIES.map((name, index) => {
      const items = state.expenses.filter(item => item.category === name);
      const planned = items.reduce((sum, item) => sum + item.planned, 0);
      return { name, amount: domain.formatMoney(planned), percent: stats.planned ? planned / stats.planned * 100 : 0, color: COLORS[index], count: items.length };
    }).filter(item => item.count);
    this.setData({ ready: true, profile: state.profile, stats, breakdown, paidOverBudget: state.profile.totalBudget > 0 && stats.remaining < 0 });
    this.filterExpenses();
  },
  filterExpenses() {
    const items = this._snapshot.workspace.expenses.filter(item => this.data.category === '全部' || item.category === this.data.category);
    this.setData({ expenses: items.map(item => Object.assign({}, item, { plannedText: domain.formatMoney(item.planned), paidText: domain.formatMoney(item.paid), exceeded: item.paid > item.planned, color: COLORS[domain.CATEGORIES.indexOf(item.category)], illustration: categoryIcon(item.category) })).reverse() });
  },
  setCategory(event) { this.setData({ category: event.currentTarget.dataset.category }); this.filterExpenses(); },
  openAdd() { this._editorRevision = this._snapshot.revision; this.setData({ editor: true, editingId: '', form: { title: '', category: domain.CATEGORIES[0], plannedInput: '', paidInput: '', note: '' }, categoryIndex: 0 }); },
  openEdit(event) {
    const item = this._snapshot.workspace.expenses.find(expense => expense.id === event.currentTarget.dataset.id);
    if (!item) return;
    this._editorRevision = this._snapshot.revision;
    this.setData({ editor: true, editingId: item.id, categoryIndex: domain.CATEGORIES.indexOf(item.category), form: Object.assign({}, item, { plannedInput: domain.editMoney(item.planned), paidInput: domain.editMoney(item.paid) }) });
  },
  closeEditor() { if (!this.data.saving) this.setData({ editor: false }); },
  field(event) { ui.field(this, event); },
  chooseCategory(event) { const index = Number(event.detail.value); this.setData({ categoryIndex: index, 'form.category': domain.CATEGORIES[index] }); },
  async save() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      const form = this.data.form;
      const payload = { title: form.title, category: form.category, planned: domain.parseMoney(form.plannedInput), paid: domain.parseMoney(form.paidInput), note: form.note };
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
