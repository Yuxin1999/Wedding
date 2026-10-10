const domain = require('./domain');
const crypto = require('crypto');

const COLLECTIONS = ['wedding_users', 'wedding_spaces', 'wedding_invites'];
const INVITE_TTL = 7 * 24 * 60 * 60 * 1000;
function reject(code, message) { const error = new Error(message); error.code = code; throw error; }
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function id() { return crypto.randomBytes(16).toString('hex'); }
function inviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(12), byte => alphabet[byte % alphabet.length]).join('');
}

function createService(store, { now = Date.now, makeId = id, makeCode = inviteCode } = {}) {
  async function membership(tx, openid) {
    const user = await tx.get('wedding_users', hash(openid));
    if (!user) reject('NO_SPACE', '请先创建或加入共同空间');
    const space = await tx.get('wedding_spaces', user.spaceId);
    if (!space || !space.members.includes(openid)) reject('FORBIDDEN', '无法访问这个共同空间');
    return { user, space };
  }
  function snapshot(space, openid) {
    return { workspace: space.workspace, revision: space.revision, role: space.members.indexOf(openid) === 0 ? 'p1' : 'p2', memberCount: space.members.length, lastChange: space.lastChange || null };
  }

  return async function execute(openid, event) {
    if (!openid) reject('UNAUTHENTICATED', '请在微信小程序中使用此功能');
    if (!event || typeof event.action !== 'string') reject('VALIDATION', '请求格式不正确');
    return store.transaction(async tx => {
      if (event.action === 'status') {
        const user = await tx.get('wedding_users', hash(openid));
        if (!user) return { connected: false };
        const { space } = await membership(tx, openid);
        return Object.assign({ connected: true }, snapshot(space, openid));
      }
      if (event.action === 'create') {
        const existing = await tx.get('wedding_users', hash(openid));
        if (existing) {
          const { space } = await membership(tx, openid);
          return snapshot(space, openid);
        }
        const workspace = domain.validateWorkspace(event.workspace);
        const spaceId = makeId();
        const space = { workspace, members: [openid], revision: 1, createdAt: now(), updatedAt: now(), inviteHash: '', lastChange: { actor: 'p1', text: '创建了共同空间', at: now() } };
        await tx.set('wedding_spaces', spaceId, space);
        await tx.set('wedding_users', hash(openid), { spaceId });
        return snapshot(space, openid);
      }
      if (event.action === 'join') {
        const code = String(event.code || '').replace(/\s/g, '').toUpperCase();
        if (!/^[A-Z2-9]{12}$/.test(code)) reject('INVALID_INVITE', '邀请码应为 12 位字母和数字');
        const tokenHash = hash(code);
        const invite = await tx.get('wedding_invites', tokenHash);
        if (!invite) reject('INVALID_INVITE', '邀请码无效或已过期，请让伴侣重新生成');
        const space = await tx.get('wedding_spaces', invite.spaceId);
        if (!space) reject('INVALID_INVITE', '邀请码已失效，请让伴侣重新生成');
        const existing = await tx.get('wedding_users', hash(openid));
        if (existing) {
          if (existing.spaceId === invite.spaceId && space.members.includes(openid)) return snapshot(space, openid);
          reject('ALREADY_JOINED', '你已经有共同空间，不能加入另一个');
        }
        // Retrying a successful join after a lost response is safe for that member.
        // Everyone else must still present the current, unexpired invitation.
        if (invite.expiresAt <= now()) reject('INVALID_INVITE', '邀请码无效或已过期，请让伴侣重新生成');
        if (space.inviteHash !== tokenHash) reject('INVALID_INVITE', '邀请码已失效，请让伴侣重新生成');
        if (space.members.length >= 2) reject('SPACE_FULL', '这个空间已有两位成员');
        space.members.push(openid);
        space.revision += 1;
        space.updatedAt = now();
        space.lastChange = { actor: 'p2', text: '加入了共同空间', at: now() };
        // Consumed invitations are revoked, including for future guesses.
        space.inviteHash = '';
        await tx.set('wedding_spaces', invite.spaceId, space);
        await tx.set('wedding_users', hash(openid), { spaceId: invite.spaceId });
        return snapshot(space, openid);
      }
      const { user, space } = await membership(tx, openid);
      if (event.action === 'invite') {
        if (space.members.length >= 2) reject('SPACE_FULL', '你们已经绑定，无需再邀请');
        const code = makeCode();
        const tokenHash = hash(code);
        const expiresAt = now() + INVITE_TTL;
        await tx.set('wedding_invites', tokenHash, { spaceId: user.spaceId, expiresAt });
        space.inviteHash = tokenHash;
        await tx.set('wedding_spaces', user.spaceId, space);
        return { code, expiresAt };
      }
      if (event.action === 'command') {
        if (!Number.isSafeInteger(event.revision) || event.revision !== space.revision) reject('CONFLICT', '伴侣刚刚更新了计划，已为你刷新，请再试一次');
        space.workspace = domain.applyCommand(space.workspace, event.command, makeId());
        space.revision += 1;
        space.updatedAt = now();
        const type = event.command.type;
        const text = type === 'updateProfile' ? '更新了我们的约定' : type.endsWith('Task') ? '更新了备婚清单' : type.endsWith('Expense') ? '更新了预算' : '更新了分类';
        space.lastChange = { actor: space.members.indexOf(openid) === 0 ? 'p1' : 'p2', text, at: now() };
        await tx.set('wedding_spaces', user.spaceId, space);
        return snapshot(space, openid);
      }
      reject('VALIDATION', '不支持的请求');
    });
  };
}

module.exports = { createService, COLLECTIONS, INVITE_TTL };
