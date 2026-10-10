const cloud = require('wx-server-sdk');
const { createService } = require('./service');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database({ throwOnNotFound: false });
const store = {
  transaction(fn) {
    return db.runTransaction(async transaction => fn({
      async get(collection, id) {
        const result = await transaction.collection(collection).doc(id).get();
        if (!result.data) return null;
        const { _id, ...data } = result.data;
        return data;
      },
      async set(collection, id, value) {
        await transaction.collection(collection).doc(id).set({ data: value });
      }
    }));
  }
};
const execute = createService(store);

exports.main = async event => {
  try {
    const result = await execute(cloud.getWXContext().OPENID, event);
    return { ok: true, data: result };
  } catch (error) {
    const known = ['VALIDATION', 'UNAUTHENTICATED', 'NO_SPACE', 'FORBIDDEN', 'INVALID_INVITE', 'ALREADY_JOINED', 'SPACE_FULL', 'CONFLICT', 'NOT_FOUND'];
    const safe = known.includes(error.code);
    if (!safe) console.error('Wedding cloud operation failed', error.errCode || error.code || 'UNKNOWN');
    return { ok: false, error: { code: safe ? error.code : 'SERVER_ERROR', message: safe ? error.message : '云服务暂不可用，请检查云函数和数据库是否已部署' } };
  }
};
