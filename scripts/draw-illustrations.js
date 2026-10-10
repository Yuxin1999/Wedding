// Original vector artwork for both clients. No remote images or font dependencies.
const fs = require('node:fs');
const path = require('node:path');
const directory = path.join(__dirname, '../miniprogram/assets/illustrations');
fs.mkdirSync(directory, { recursive: true });
const ink = '#686b58';
const cream = '#fffdf8';
const pink = '#e9b7ad';
const sage = '#a6b398';
const yellow = '#edd58e';
const lilac = '#cbc1d9';
const drawings = {
  rings: ['约定', '#f7e7d7', `<ellipse cx="44" cy="67" rx="24" ry="22" fill="${yellow}" transform="rotate(-20 44 67)"/><ellipse cx="44" cy="67" rx="17" ry="15" fill="${cream}" transform="rotate(-20 44 67)"/><ellipse cx="78" cy="65" rx="24" ry="22" fill="${yellow}" transform="rotate(17 78 65)"/><ellipse cx="78" cy="65" rx="17" ry="15" fill="${cream}" transform="rotate(17 78 65)"/><path d="m65 40 5-12 14-2 8 12-12 12Z" fill="${cream}"/><path d="m65 40 27-2m-22-10 10 22 4-24" stroke-width="1.3"/><path d="M35 27v9m-5-5 10 1M97 57l8-4"/>`],
  calendar: ['好日子', '#eee9da', `<path d="M27 30 92 28 95 96 25 98Z" fill="${cream}"/><path d="M27 30 92 28 93 48 26 50Z" fill="${pink}"/><path d="M43 22v15m32-15 1 15" stroke-width="4"/><path d="M59 66c-13-15-29 5 2 22 30-21 11-34-2-22Z" fill="${pink}" stroke="none"/><path d="m31 109 9-3m-14-4 8-1" stroke="${sage}"/>`],
  checklist: ['小事清单', '#e8eddc', `<path d="M30 28 90 30 93 100 29 98Z" fill="${cream}"/><rect x="43" y="20" width="33" height="16" rx="5" fill="${sage}"/><path d="m39 51 4 5 7-9m-10 22 4 4 7-9m-10 22 4 4 7-9"/><path d="m59 52 20 1m-20 18h18m-18 16h14" stroke="${sage}"/><path d="m83 12 1-6m9 12 6-4" stroke="${yellow}"/>`],
  wallet: ['心意预算', '#f7e8d9', `<path d="m27 39 54-18 5 24" fill="${sage}"/><rect x="23" y="39" width="74" height="53" rx="12" fill="${pink}"/><path d="M96 55H76c-15 0-15 24 0 24h20" fill="${cream}"/><circle cx="78" cy="67" r="3" fill="${ink}" stroke="none"/><path d="m36 50 1 25m-1 6v3" stroke="${cream}" stroke-dasharray="3 5"/><circle cx="81" cy="22" r="11" fill="${yellow}"/><path d="m77 17 4 5 4-5m-4 5v7m-5-5h10" stroke-width="1.5"/>`],
  venue: ['场地宴席', '#e8ecdf', `<path d="M29 96V52L62 25l32 27v44" fill="${cream}"/><path d="m19 54 42-37 43 37" fill="${sage}"/><path d="M50 96V76c0-17 22-17 22 0v20" fill="${pink}"/><path d="M60 30v11m-5-5h10"/><path d="M26 97h73"/><rect x="34" y="58" width="9" height="14" rx="4" fill="${yellow}"/><rect x="80" y="58" width="9" height="14" rx="4" fill="${yellow}"/><path d="M14 87V70m-5 9 5-8 6 7m94 12V73m-6 10 6-8 5 7" stroke="${sage}"/>`],
  dress: ['婚纱造型', '#f5e3df', `<path d="M45 25c1 9 8 13 15 13s14-5 16-13l8 9-9 21 25 44c-25 9-55 9-80 0l27-44-10-21Z" fill="${cream}"/><path d="M48 54h27m-20 6-8 37m18-36 6 38" stroke="${pink}"/><path d="M57 24c1-6 10-6 10-12 0-9-13-9-14-1m6 13-24 11m25-11 26 11"/><path d="m45 55 11 5 9-4 11 6" fill="${pink}"/><path d="m98 39 2-7m4 13 6-2" stroke="${yellow}"/>`],
  camera: ['摄影摄像', '#e8e5ef', `<path d="m39 35 7-13 31 1 8 14" fill="${lilac}"/><rect x="19" y="35" width="84" height="55" rx="12" fill="${cream}"/><path d="M20 48h82"/><circle cx="62" cy="63" r="20" fill="${lilac}"/><circle cx="62" cy="63" r="12" fill="${cream}"/><path d="M55 60c0-5 4-7 7-7" stroke="${sage}"/><path d="M29 43h9" stroke-width="4"/><path d="m92 22 3-9m4 14 8-4" stroke="${yellow}"/>`],
  flower: ['仪式花艺', '#f4e6d9', `<path d="M42 43 66 96m16-56L56 97M62 35v65" stroke="${sage}" stroke-width="3"/><path d="M58 67C39 47 31 70 58 75M65 58C92 47 93 68 65 69" fill="${sage}"/><path d="m32 68 30 34 28-37-25 10Z" fill="${cream}"/><path d="m50 93 15-3 9 4-12 8Z" fill="${pink}"/><path d="m60 96-15 15m18-16 9 13" stroke="${pink}" stroke-width="3"/><path d="M31 32c-8-14 9-23 16-10 12-10 22 6 7 14 8 13-9 23-15 10-15 7-22-11-8-14Z" fill="${pink}"/><circle cx="41" cy="33" r="4" fill="${yellow}"/><path d="M72 34c-10-10 1-21 10-12 8-11 21 1 10 11 9 12-5 20-13 9-12 7-18-6-7-8Z" fill="${yellow}"/><circle cx="83" cy="33" r="4" fill="${cream}"/>`],
  gift: ['宾客礼品', '#f3e8d7', `<rect x="30" y="47" width="63" height="52" rx="3" fill="${cream}"/><rect x="25" y="38" width="73" height="18" rx="4" fill="${pink}"/><path d="M56 39h11v60H56Z" fill="${pink}"/><path d="M60 38C25 33 36 6 52 23l9 15c31-40 42-3 0 0Z" fill="${pink}"/><path d="M22 86 13 81m90-18 7-3" stroke="${yellow}"/>`],
  letter: ['邀请与心意', '#e9e7ef', `<path d="m19 43 41-29 44 28-2 49-80 2Z" fill="${lilac}"/><path d="M31 53V27l61 1v27" fill="${cream}"/><path d="m22 46 41 25 39-27m-78 46 30-27m46 26L73 65" fill="${cream}"/><path d="M60 41c-9-11-20 3 1 15 21-14 7-23-1-15Z" fill="${pink}" stroke="none"/><path d="m21 18-4-7m10 5 1-8" stroke="${sage}"/>`],
  cake: ['甜蜜仪式', '#f5e6dc', `<path d="M27 72c0-10 65-10 65 0v24H27Z" fill="${cream}"/><path d="M38 48c0-9 43-9 43 0v26H38Z" fill="${pink}"/><path d="M27 72c6 9 12-3 17 3s12-4 18 0 13-4 18 0 12 3 12-3M38 50c5 8 10-2 16 2s12-3 17 1 10 2 10-4"/><path d="M21 98h78M61 42V29"/><path d="M62 10c-15 18 0 23 3 13 2-4-1-8-3-13Z" fill="${yellow}"/><path d="m100 44 4-7m0 17 8-2" stroke="${sage}"/>`],
  music: ['婚礼音乐', '#e7eade', `<path d="M50 81V32l44-11v48M51 45l43-10" fill="${sage}"/><ellipse cx="37" cy="84" rx="16" ry="11" fill="${pink}" transform="rotate(-20 37 84)"/><ellipse cx="81" cy="72" rx="16" ry="11" fill="${pink}" transform="rotate(-20 81 72)"/><path d="M23 30v16m-8-8h16m70 53 4 5 4-8" stroke="${yellow}"/>`],
  bow: ['小小装饰', '#f3e3e2', `<path d="M57 54C13 12 8 80 55 65L38 101l19-5 8 12 9-43c47 20 45-53-9-10Z" fill="${pink}"/><path d="m31 44 23 12m11 5 26-12m-28 15 4 28"/><rect x="53" y="48" width="18" height="23" rx="6" fill="${cream}"/>`],
  tea: ['休息一下', '#e9ecdf', `<path d="M24 49h58v22c-2 35-51 35-58-1Z" fill="${cream}"/><path d="M83 52c30-6 27 25-1 25M19 98h73M39 36c-9-14 9-13 2-25m18 25c-9-14 9-13 2-25"/><path d="M50 61c-11-12-22 5 1 17 21-15 9-26-1-17Z" fill="${pink}" stroke="none"/>`],
  suit: ['礼服与领结', '#e5e9e2', `<path d="m41 22 18 8 21-8 15 22-7 58H29l-5-59Z" fill="${sage}"/><path d="m42 22 17 42 20-42-20 8Z" fill="${cream}"/><path d="m46 37 13 6 13-6v15l-13-6-13 6Z" fill="${ink}"/><path d="m35 33 5 27 10-6 10 21v27m23-69-5 27-10-6"/><circle cx="68" cy="78" r="2" fill="${ink}"/><circle cx="68" cy="91" r="2" fill="${ink}"/>`],
  heart: ['两个人', '#f5e3e2', `<path d="M60 94C-2 55 23 12 59 42c35-33 69 11 1 52Z" fill="${pink}"/><path d="M28 53c0-11 10-16 17-13" stroke="${cream}" stroke-width="4"/><path d="m88 23 5-7m8 19 7-2m-78 66-4 7" stroke="${yellow}"/>`],
  sparkles: ['灵感碎片', '#f2eddb', `<path d="m60 17 10 31 29 11-29 9-11 32-10-31-31-10 31-10Z" fill="${yellow}"/><path d="m94 15 3 10 11 4-11 3-3 11-4-10-9-4 10-3Z" fill="${pink}"/><circle cx="25" cy="92" r="5" fill="${sage}"/>`],
  plant: ['慢慢生长', '#e6ecdf', `<path d="M42 80h42l-7 26H49Z" fill="${pink}"/><path d="M63 80V31" stroke-width="3"/><path d="M62 57C24 55 27 25 62 43M64 42c0-30 35-31 27-12-4 10-14 15-27 14M62 76c-25-2-38-25-20-24 10 0 17 9 20 16m3-5c28-31 42-3 0 11" fill="${sage}"/><path d="M50 87h26" stroke="${cream}"/>`],
  car: ['出发去幸福', '#e7e9ed', `<path d="m23 61 12-29 45 2 17 29" fill="${sage}"/><path d="m39 39-7 21 23-1V39Zm24 0v21h25L77 40Z" fill="${cream}"/><rect x="19" y="59" width="82" height="32" rx="10" fill="${cream}"/><circle cx="34" cy="91" r="9" fill="${ink}"/><circle cx="85" cy="91" r="9" fill="${ink}"/><path d="M57 66c-10-12-23 4 1 18 24-16 9-29-1-18Z" fill="${pink}" stroke="none"/><path d="M24 72h10m52 0h10" stroke="${yellow}" stroke-width="4"/>`]
};
for (const [name, [title, background, drawing]] of Object.entries(drawings)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><title>${title}</title><path d="M96 24c23 18 24 50 5 73-23 24-62 21-82-3C0 70 10 27 39 15c22-9 40-5 57 9Z" fill="${background}"/><g fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${drawing}</g></svg>`;
  fs.writeFileSync(path.join(directory, `${name}.svg`), svg);
}
const couple = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="340" viewBox="0 0 420 340"><title>花拱门下的两个人</title>
<path d="M68 293V154C65 1 348 1 347 154v139" fill="#eeeedf"/><path d="M90 291V157C90 30 326 29 326 157v134" fill="#fffbf2"/>
<g fill="none" stroke="${ink}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
<path d="M78 290V157C69 3 340 5 337 157v136" stroke="#a1aa8c"/><path d="M37 301c73 7 272 8 344-1" stroke="#ccc5ad"/>
<path d="M85 198c-26-72-34-86-14-127M321 202c40-76 37-105 18-137" stroke="#8e9e7f"/>
<path d="M74 133c-31-2-31-30-16-29 10 0 14 14 16 29m1-22c34-7 28-30 12-21-11 7-13 13-12 21M77 172c-32-9-32-28-18-26 10 2 17 14 18 26m256-25c36-17 45-35 25-33-10 1-19 17-25 33m8-29c-23-3-33-30-16-27 14 3 15 16 16 27m-9 61c31-2 43-21 24-23-10-1-19 9-24 23" fill="#aab79a" stroke="none"/>
<g fill="#e7b8af" stroke="none"><circle cx="66" cy="86" r="9"/><circle cx="77" cy="80" r="9"/><circle cx="83" cy="91" r="9"/><circle cx="72" cy="97" r="9"/><circle cx="344" cy="86" r="8"/><circle cx="354" cy="83" r="8"/><circle cx="360" cy="92" r="8"/><circle cx="349" cy="98" r="8"/></g><circle cx="75" cy="88" r="5" fill="#ebd48e" stroke="none"/><circle cx="351" cy="91" r="4" fill="#ebd48e" stroke="none"/>
<path d="M153 164c-5-29 0-57 23-59 25-3 35 27 26 62" fill="#666652"/><path d="M164 148c-6 15-9 19-5 31l33 2c1-11-6-22-7-32" fill="#f7dcc4"/>
<path d="M144 183c11-17 21-17 29-10 7-7 22-5 30 11l-13 30 38 83c-34 9-72 10-105-1l34-84Z" fill="#fffdf8"/>
<path d="m155 211 35 1m-20 14-15 59m30-58 11 59" stroke="#dbd2bd"/>
<path d="M158 127c0 43 39 39 39 4-17 5-16-21-23-15-6 8-11 9-16 11Z" fill="#fae5d1"/>
<path d="M177 140q4 4 8 0" stroke-width="1.5"/><circle cx="168" cy="134" r="1.4" fill="${ink}" stroke="none"/><circle cx="187" cy="134" r="1.4" fill="${ink}" stroke="none"/><path d="M160 145c-11 16-15 40-31 48 9 5 18 6 27 2" stroke="#fff" stroke-width="3"/>
<path d="M239 158v17h22v-20" fill="#f8dfc5"/><path d="M224 175c14-8 37-8 49 0l13 42-16 12-3 67h-49l-4-70-14-12Z" fill="#a7b298"/><path d="m236 172 13 37 14-37" fill="#fffdf8"/><path d="m241 182 8 5 9-5v12l-9-5-8 5Z" fill="#72795f"/><path d="m227 178 2 27 13-4 8 24v70m18-115-1 24-10-2m-7 53v41"/>
<ellipse cx="249" cy="136" rx="23" ry="27" fill="#fae5d1"/><path d="M226 135c-12-40 44-49 48-10-20 7-19-13-24-9-4 10-10 9-24 19Z" fill="#686852"/><circle cx="240" cy="139" r="1.5" fill="${ink}"/><circle cx="258" cy="139" r="1.5" fill="${ink}"/><path d="M245 149q5 4 10-1" stroke-width="1.5"/>
<path d="M212 214c-6 3-13 5-17 2m-43-28 25 22m95-22-43 30" fill="#f9e3cb"/><path d="m192 230 16-35 17 28" fill="#c0c9a5"/>
<g stroke="none"><circle cx="199" cy="192" r="10" fill="#e4b2a7"/><circle cx="213" cy="191" r="10" fill="#e4b2a7"/><circle cx="224" cy="201" r="9" fill="#eed287"/><circle cx="199" cy="206" r="10" fill="#eed287"/><circle cx="211" cy="204" r="10" fill="#f3c9c1"/></g><path d="m201 223 9 4 8-6m-9 5-5 16m6-15 7 14" stroke="#d5a397"/>
<path d="m206 76 4-9 5 9 9 3-9 4-4 10-4-10-10-3Z" fill="#ebd28d" stroke="none"/><path d="M251 61c-14-15-32 5 1 23 32-22 12-38-1-23Z" fill="#e5b6ae" stroke="none"/>
<path d="m109 266-7-8m203-23 8-4m-194-87-7-4m177-40 7-3" stroke="#d3bd8c"/><path d="M155 301h39m25-3h17m17 0h21" stroke-width="4"/>
</g></svg>`;
fs.writeFileSync(path.join(directory, 'couple.svg'), couple);
fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(Object.entries(drawings).map(([id, [title]]) => ({ id, title })).concat([{ id: 'couple', title: '花拱门下的两个人' }]), null, 2) + '\n');
fs.writeFileSync(path.join(__dirname, '../miniprogram/utils/illustration-catalog.js'), '// Generated by scripts/draw-illustrations.js\nmodule.exports = ' + JSON.stringify(Object.entries(drawings).map(([id, [title]]) => ({ id, title })).concat([{ id: 'couple', title: '花拱门下的两个人' }]), null, 2) + ';\n');
console.log(`Drew ${Object.keys(drawings).length + 1} original wedding illustrations.`);
