function error(error) { wx.showToast({ title: error.message || '操作失败，请重试', icon: 'none', duration: 3500 }); }
function confirm(title, content) {
  return new Promise(resolve => wx.showModal({ title, content, confirmColor: '#344e41', success: result => resolve(result.confirm), fail: () => resolve(false) }));
}
function success(title) { wx.showToast({ title, icon: 'success' }); }
function field(page, event, prefix = 'form') { page.setData({ [`${prefix}.${event.currentTarget.dataset.field}`]: event.detail.value }); }
function navigateTab(url) { wx.switchTab({ url }); }

module.exports = { error, confirm, success, field, navigateTab };
