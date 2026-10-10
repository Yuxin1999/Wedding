const KEY = 'wedding:pending-invite';
let lastCaptured = '';
function normalize(value) { return typeof value === 'string' ? value.replace(/\s/g, '').toUpperCase() : ''; }
function capture(options) {
  const code = normalize(options && options.query && options.query.invite);
  if (/^[A-Z2-9]{12}$/.test(code) && code !== lastCaptured) { wx.setStorageSync(KEY, code); lastCaptured = code; }
}
function take() {
  const code = wx.getStorageSync(KEY) || '';
  if (code) wx.setStorageSync(KEY, '');
  return code;
}
module.exports = { capture, take };
