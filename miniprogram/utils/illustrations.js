const domain = require('./domain');
function categoryIcon(category, state = {}) { return `/assets/illustrations/${domain.categoryIconId(state, category)}.png`; }
module.exports = { categoryIcon };
