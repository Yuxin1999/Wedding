const store = require('../../utils/store');
const domain = require('../../utils/domain');
const ui = require('../../utils/ui');
const { withSync } = require('../../utils/collaboration');
const { categoryIcon } = require('../../utils/illustrations');

Page(withSync({
  data: {
    loading: true, ready: false, pageVisible: false, errorMessage: '', filter: 'pending', category: '全部', ownerIndex: 0, query: '',
    filters: [{ key: 'pending', label: '待完成' }, { key: 'all', label: '全部' }, { key: 'done', label: '已完成' }],
    categories: domain.CATEGORIES, categoryFilters: ['全部'].concat(domain.CATEGORIES), ownerFilters: ['所有人', '一起', '我', 'TA'],
    editor: false, saving: false, form: {}, tasks: []
  },
  onHide() { this.setData({ pageVisible: false }); },
  async onShow() {
    this.setData({ pageVisible: true });
    const category = wx.getStorageSync('wedding:task-category');
    await this.refresh();
    if (this.data.categories.includes(category)) { this.setData({ category, filter: 'pending', ownerIndex: 0, query: '' }); this.filterTasks(); }
    if (category) wx.setStorageSync('wedding:task-category', '');
    const owner = wx.getStorageSync('wedding:task-owner');
    if (domain.ASSIGNEES.includes(owner)) {
      wx.setStorageSync('wedding:task-owner', '');
      this.setData({ category: '全部', filter: 'pending', ownerIndex: ['', 'both', 'p1', 'p2'].indexOf(owner), query: '' }); this.filterTasks();
    }
    const taskId = wx.getStorageSync('wedding:open-task');
    if (taskId && this._snapshot) {
      wx.setStorageSync('wedding:open-task', '');
      const item = this._snapshot.workspace.tasks.find(task => task.id === taskId);
      if (item) {
        this.setData({ category: '全部', filter: 'all', ownerIndex: 0, query: '' }); this.filterTasks();
        this.openEdit({ currentTarget: { dataset: { id: taskId } } });
      } else ui.error(new Error('这件安排已被删除'));
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
    const categories = domain.getCategories(state).map(item => item.name);
    this.setData({ ready: true, categories, categoryFilters: ['全部'].concat(categories), category: categories.includes(this.data.category) ? this.data.category : '全部', profile: state.profile, stats: domain.summary(state), ownerFilters: ['所有人', '一起', state.profile.name1, state.profile.name2] });
    this.filterTasks();
  },
  filterTasks() {
    if (!this._snapshot) return;
    const { filter, category, ownerIndex, query } = this.data;
    const selectedOwner = ['', 'both', 'p1', 'p2'][ownerIndex];
    const tasks = domain.taskViews(this._snapshot.workspace).filter(item =>
      (filter === 'all' || item.done === (filter === 'done')) &&
      (category === '全部' || item.category === category) &&
      (!selectedOwner || item.assignee === selectedOwner) &&
      (!query.trim() || item.title.toLowerCase().includes(query.trim().toLowerCase()))
    );
    this.setData({ tasks: tasks.map(item => Object.assign({}, item, { illustration: categoryIcon(item.category, this._snapshot.workspace) })) });
  },
  setFilter(event) { this.setData({ filter: event.currentTarget.dataset.key }); this.filterTasks(); },
  setCategory(event) { this.setData({ category: event.currentTarget.dataset.category }); this.filterTasks(); },
  setOwner(event) { this.setData({ ownerIndex: Number(event.detail.value) }); this.filterTasks(); },
  search(event) { this.setData({ query: event.detail.value }); this.filterTasks(); },
  openAdd() {
    this._editorRevision = this._snapshot.revision;
    const category = this.data.category === '全部' ? this.data.categories[0] : this.data.category;
    this.setData({ editor: true, editingId: '', form: { title: '', category, assignee: 'both', dueDate: '', daysBefore: null, done: false, note: '' }, formCategoryIndex: this.data.categories.indexOf(category) });
  },
  openBudget(event) {
    wx.setStorageSync('wedding:budget-task', event.currentTarget.dataset.id);
    ui.navigateTab('/pages/budget/index');
  },
  openEdit(event) {
    const item = this._snapshot.workspace.tasks.find(task => task.id === event.currentTarget.dataset.id);
    if (!item) return;
    this._editorRevision = this._snapshot.revision;
    this.setData({ editor: true, editingId: item.id, form: Object.assign({}, item), linkedBudget: domain.taskBudget(this._snapshot.workspace, item.id), formCategoryIndex: this.data.categories.indexOf(item.category) });
  },
  closeEditor() { if (!this.data.saving) this.setData({ editor: false }); },
  field(event) { ui.field(this, event); },
  chooseCategory(event) { const index = Number(event.detail.value); this.setData({ formCategoryIndex: index, 'form.category': this.data.categories[index] }); },
  chooseAssignee(event) { this.setData({ 'form.assignee': event.currentTarget.dataset.owner }); },
  chooseDate(event) { this.setData({ 'form.dueDate': event.detail.value }); },
  clearDate() { this.setData({ 'form.dueDate': '' }); },
  async save() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      const payload = Object.assign({}, this.data.form);
      if (this.data.editingId) payload.id = this.data.editingId;
      this.render(await store.mutate({ type: this.data.editingId ? 'updateTask' : 'addTask', payload }, this._editorRevision));
      this.setData({ editor: false });
      ui.success('已记下这件小事');
    } catch (error) { ui.error(error); if (error.code === 'CONFLICT') { await this.refresh(); this._editorRevision = this._snapshot.revision; } }
    finally { this.setData({ saving: false }); }
  },
  async toggle(event) {
    if (this._toggling) return;
    const item = this._snapshot.workspace.tasks.find(task => task.id === event.currentTarget.dataset.id);
    if (!item) return;
    this._toggling = true;
    try {
      this.render(await store.mutate({ type: 'updateTask', payload: { id: item.id, done: !item.done } }, this._snapshot.revision));
      wx.vibrateShort({ type: 'light' });
    } catch (error) { ui.error(error); if (error.code === 'CONFLICT') await this.refresh(); }
    finally { this._toggling = false; }
  },
  async remove() {
    if (this.data.saving || !await ui.confirm('删除这项任务？', '删除后无法撤销。关联开支会保留在预算中，只解除与这件安排的关联。')) return;
    this.setData({ saving: true });
    try {
      this.render(await store.mutate({ type: 'deleteTask', payload: { id: this.data.editingId } }, this._editorRevision));
      this.setData({ editor: false });
      ui.success('已删除');
    } catch (error) { ui.error(error); if (error.code === 'CONFLICT') { await this.refresh(); this._editorRevision = this._snapshot.revision; } }
    finally { this.setData({ saving: false }); }
  }
}));
