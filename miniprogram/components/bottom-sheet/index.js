Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    visible: { type: Boolean, value: false, observer: 'syncVisibility' },
    title: String,
    busy: Boolean
  },
  data: { mounted: false, closing: false },
  lifetimes: {
    attached() { this._detached = false; this.syncVisibility(this.properties.visible); },
    detached() { this._detached = true; clearTimeout(this._closeTimer); }
  },
  methods: {
    syncVisibility(visible) {
      if (this._detached) return;
      clearTimeout(this._closeTimer);
      if (visible) {
        this.setData({ mounted: true, closing: false });
      } else if (this.data.mounted) {
        this.setData({ closing: true });
        // Keep the slot mounted until the 220 ms exit animation finishes.
        this._closeTimer = setTimeout(() => {
          if (!this._detached && !this.properties.visible) this.setData({ mounted: false, closing: false });
        }, 220);
      }
    },
    close() { if (this.properties.visible && !this.properties.busy && !this.data.closing) this.triggerEvent('close'); },
    noop() {}
  }
});
