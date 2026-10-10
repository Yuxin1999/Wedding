const store = require('./store');
const INTERVAL = 15000;

function clockLabel(value = Date.now()) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function editing(page) {
  const data = page.data;
  return data.editor || data.joinEditor || data.categoryEditor || data.saving || data.connecting || data.loading || page._saving || page._toggling;
}
function stop(page) {
  page._syncVisible = false;
  page._syncGeneration = (page._syncGeneration || 0) + 1;
  if (page._syncTimer) clearTimeout(page._syncTimer);
  page._syncTimer = null;
}
function schedule(page) {
  if (!page._syncVisible || page._syncTimer || store.mode() !== 'cloud') return;
  page._syncTimer = setTimeout(async () => {
    page._syncTimer = null;
    await page.syncSharedPlan();
    schedule(page);
  }, INTERVAL);
}

// All four tabs share one foreground polling policy. No timer runs in local mode
// or on a hidden page, and incoming snapshots never replace an active draft.
function withSync(definition) {
  return Object.assign({}, definition, {
    data: Object.assign({ syncEnabled: false, syncError: '', syncedAt: '' }, definition.data),
    async onShow() {
      this._syncVisible = true;
      this._syncGeneration = (this._syncGeneration || 0) + 1;
      try { if (definition.onShow) await definition.onShow.call(this); }
      finally { schedule(this); }
    },
    onHide() { stop(this); if (definition.onHide) definition.onHide.call(this); },
    onUnload() { stop(this); if (definition.onUnload) definition.onUnload.call(this); },
    render(snapshot) {
      definition.render.call(this, snapshot);
      this.setData({ syncEnabled: snapshot.mode === 'cloud', syncError: '', syncedAt: clockLabel() });
      if (snapshot.mode === 'cloud') schedule(this);
      else if (this._syncTimer) { clearTimeout(this._syncTimer); this._syncTimer = null; }
    },
    async syncSharedPlan() {
      if (!this._syncVisible || this._syncFetching || store.mode() !== 'cloud' || !this.data.ready || editing(this)) return;
      this._syncFetching = true;
      const previous = this._snapshot;
      const generation = this._syncGeneration;
      const canApply = () => this._syncVisible && this._syncGeneration === generation && store.mode() === 'cloud' && this._snapshot === previous && !editing(this);
      try {
        const snapshot = await store.getSnapshot();
        if (!canApply()) return;
        if (!previous || snapshot.revision !== previous.revision) this.render(snapshot);
        this.setData({ syncError: '', syncedAt: clockLabel() });
      } catch (_) {
        if (canApply()) this.setData({ syncError: '暂时未能同步，稍后自动重试' });
      } finally { this._syncFetching = false; }
    }
  });
}

module.exports = { withSync, clockLabel, INTERVAL };
