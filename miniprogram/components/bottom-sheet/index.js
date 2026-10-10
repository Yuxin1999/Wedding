Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { visible: Boolean, title: String },
  methods: {
    close() { this.triggerEvent('close'); },
    noop() {}
  }
});
