const domain = require('./domain');
const config = require('../config');
const LOCAL_KEY = 'wedding:local:v1';
const MODE_KEY = 'wedding:mode:v1';
let cloudSnapshot = null;
let busy = false;

function configured() { return Boolean(config.cloudEnv && wx.cloud); }
function mode() { return configured() && wx.getStorageSync(MODE_KEY) === 'cloud' ? 'cloud' : 'local'; }
function local() {
  const saved = wx.getStorageSync(LOCAL_KEY);
  if (saved) return domain.validateWorkspace(saved);
  const state = domain.createWorkspace();
  wx.setStorageSync(LOCAL_KEY, state);
  return state;
}
function decorate(snapshot, source) {
  return Object.assign({}, snapshot, { mode: source, configured: configured(), syncLabel: source === 'cloud' ? '云端共同空间' : '本机保存' });
}
async function call(action, payload = {}) {
  if (!configured()) throw new Error('请先配置微信云开发环境');
  let response;
  try { response = await wx.cloud.callFunction({ name: 'wedding', data: Object.assign({ action }, payload) }); }
  catch (error) { throw new Error('暂时连接不上云端，未确认保存结果，请检查网络后刷新'); }
  const result = response.result;
  if (!result || !result.ok) {
    const error = new Error(result && result.error ? result.error.message : '云服务响应异常');
    error.code = result && result.error && result.error.code;
    throw error;
  }
  return result.data;
}
async function getSnapshot() {
  if (mode() === 'local') return decorate({ workspace: local(), revision: 0, memberCount: 1, role: 'p1' }, 'local');
  const result = await call('status');
  if (!result.connected) throw new Error('尚未建立共同空间，请在“我们”中重新连接');
  // A slow poll must not move the cached revision behind a completed save.
  if (!cloudSnapshot || result.revision >= cloudSnapshot.revision) cloudSnapshot = result;
  return decorate(cloudSnapshot, 'cloud');
}
async function mutate(command, revision) {
  if (busy) throw new Error('正在保存，请稍候');
  busy = true;
  try {
    if (mode() === 'local') {
      const next = domain.applyCommand(local(), command, `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
      wx.setStorageSync(LOCAL_KEY, next);
      return decorate({ workspace: next, revision: 0, memberCount: 1, role: 'p1' }, 'local');
    }
    if (!cloudSnapshot) await getSnapshot();
    try {
      cloudSnapshot = await call('command', { revision: revision === undefined ? cloudSnapshot.revision : revision, command });
      return decorate(cloudSnapshot, 'cloud');
    } catch (error) {
      if (error.code === 'CONFLICT') {
        try { await getSnapshot(); } catch (_) { /* Keep the original conflict error; never replay stale edits. */ }
      }
      throw error;
    }
  } finally { busy = false; }
}
async function connect() {
  let result = await call('status');
  if (!result.connected) result = await call('create', { workspace: local() });
  cloudSnapshot = result;
  wx.setStorageSync(MODE_KEY, 'cloud');
  return decorate(result, 'cloud');
}
async function join(code) {
  const result = await call('join', { code });
  cloudSnapshot = result;
  wx.setStorageSync(MODE_KEY, 'cloud');
  return decorate(result, 'cloud');
}
function useLocal() { wx.setStorageSync(MODE_KEY, 'local'); cloudSnapshot = null; }
function invite() { return call('invite'); }

module.exports = { configured, mode, getSnapshot, mutate, connect, join, invite, useLocal };
