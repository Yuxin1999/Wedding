const names = { '场地宴席': 'venue', '婚纱造型': 'dress', '摄影摄像': 'camera', '仪式布置': 'flower', '宾客礼品': 'gift', '其他': 'rings' };
function categoryIcon(category) { return `/assets/illustrations/${names[category] || 'rings'}.png`; }
module.exports = { categoryIcon };
