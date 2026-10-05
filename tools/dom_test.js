/**
 * DOM 级测试：双页面架构（index.html 首页 / plan.html 计划详情 / plan.html?preview=1 预览）
 * 运行：NODE_PATH=<workspace>/node_modules node tools/dom_test.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var JSDOM = require('jsdom').JSDOM;

var root = path.resolve(__dirname, '..');
var SCRIPTS = ['vendor/jszip.min.js', 'js/storage.js', 'js/format.js', 'js/word.js', 'js/app.js'];

function makeDom(page, url) {
  var bodyHtml = '<div id="' + (page === 'plan' ? 'plan-app' : 'app') + '"></div>' +
    '<footer class="site-footer">作者：Jimmy · <a href="author.html">联系作者</a></footer>' +
    '<div id="modal-root"></div>';
  var dom = new JSDOM('<!DOCTYPE html><html><body>' + bodyHtml + '</body></html>',
    { url: url, runScripts: 'outside-only', pretendToBeVisual: true });
  SCRIPTS.forEach(function (f) { dom.window.eval(fs.readFileSync(path.join(root, f), 'utf8')); });
  return dom;
}

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
}
function click(win, el) { el.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); }
function btnByText(win, modal, text) {
  var btns = modal.querySelectorAll('.modal-foot .btn');
  for (var i = 0; i < btns.length; i++) if (btns[i].textContent.trim() === text) return btns[i];
  return null;
}

/* ================= A. 首页（index.html） ================= */
console.log('== A. 首页 ==');
var domA = makeDom('index', 'http://localhost/index.html');
var winA = domA.window, docA = winA.document;
var app = docA.getElementById('app');

ok(app.innerHTML.indexOf('新增计划') > -1, '首页渲染（含新增计划）');
ok(app.innerHTML.indexOf('data-action="clear-all"') > -1, '首页含「一键清空」');
ok(app.innerHTML.indexOf('data-action="open-import"') > -1, '首页含「导入」按钮');
ok(app.innerHTML.indexOf('导入计划') > -1, '首页导入按钮文案为「导入计划」');
ok(app.innerHTML.indexOf('data-action="clear-all"') < app.innerHTML.indexOf('data-action="open-import"')
   && app.innerHTML.indexOf('data-action="open-import"') < app.innerHTML.indexOf('data-action="create-trip"'),
   '按钮顺序：一键清空 | 导入 | 新增计划');
var fLink = docA.querySelector('.site-footer a');
ok(!!fLink && fLink.getAttribute('href') === 'author.html' && fLink.textContent.trim() === '联系作者', '页脚链接指向 author.html');

// 新增计划
click(winA, app.querySelector('[data-action="create-trip"]'));
var modal = docA.getElementById('modal-root').querySelector('.modal');
ok(!!modal && !!modal.querySelector('#f-start') && !!modal.querySelector('#f-end') && !!modal.querySelector('#f-dest'),
   '新增计划弹窗含 起止日期+旅游地点');
modal.querySelector('#f-dest').value = '北京';
modal.querySelector('#f-start').value = '2026-08-20';
modal.querySelector('#f-end').value = '2026-08-22';
click(winA, btnByText(winA, modal, '创建'));
var saved = JSON.parse(winA.localStorage.getItem('travel-planner:v1')).trips;
ok(saved.length === 1 && saved[0].name === '北京之旅', '创建成功且已保存（跳转计划页）');
var tripId = saved[0].id;

// 首页导入按钮可打开导入弹窗
click(winA, app.querySelector('[data-action="open-import"]'));
modal = docA.getElementById('modal-root').querySelector('.modal');
ok(!!modal && modal.querySelectorAll('.import-tab').length === 2 && !!modal.querySelector('[data-pane="file"]'),
   '首页导入弹窗含 文字/Word 两个面板');
var impBtns = modal.querySelectorAll('.modal-foot .btn');
ok(impBtns.length === 2 && impBtns[0].textContent.trim() === '关闭' && impBtns[1].textContent.trim() === '导入',
   '导入弹窗底部「关闭 | 导入」横向排列');
click(winA, modal.querySelector('.modal-close'));

// 一键清空（验证码）
click(winA, app.querySelector('[data-action="clear-all"]'));
modal = docA.getElementById('modal-root').querySelector('.modal');
var code = modal.querySelector('.clear-code b').textContent.trim();
ok(/^[1-9]\d{5}$/.test(code), '验证码 6 位且首位非 0');
modal.querySelector('#f-code').value = '000000';
click(winA, btnByText(winA, modal, '确认清空'));
ok(docA.getElementById('modal-root').querySelector('.clear-error').style.display === 'block', '错误验证码提示错误');
ok(JSON.parse(winA.localStorage.getItem('travel-planner:v1')).trips.length === 1, '错误验证码不清空');
modal.querySelector('#f-code').value = code;
click(winA, btnByText(winA, modal, '确认清空'));
ok(JSON.parse(winA.localStorage.getItem('travel-planner:v1')).trips.length === 0, '正确验证码清空全部');

/* ================= B. 计划详情页（plan.html） ================= */
console.log('== B. 计划详情页 ==');
var tripB = JSON.parse(winA.localStorage.getItem('travel-planner:v1')); // 已被清空，重建一个
tripB.trips = [{
  id: 'trip_demo', name: '广东中山之旅', startDate: '2026-08-01', endDate: '2026-08-02',
  notes: [{ id: 'n1', title: '证件', body: '身份证', createdAt: 1 }],
  days: { '2026-08-01': [{ id: 'e1', start: '09:00', end: '10:30', title: '孙文故里', location: '中山', intro: '', remark: '', createdAt: 1 }] },
  createdAt: 1, updatedAt: 1
}];
// 方案：先设置 localStorage，再加载脚本
var domB2 = new JSDOM('<!DOCTYPE html><html><body><div id="plan-app"></div>' +
  '<footer class="site-footer">作者：Jimmy · <a href="author.html">联系作者</a></footer>' +
  '<div id="modal-root"></div></body></html>',
  { url: 'http://localhost/plan.html?id=trip_demo&preview=0', runScripts: 'outside-only', pretendToBeVisual: true });
domB2.window.localStorage.setItem('travel-planner:v1', JSON.stringify(tripB));
SCRIPTS.forEach(function (f) { domB2.window.eval(fs.readFileSync(path.join(root, f), 'utf8')); });
var winB = domB2.window;
app = domB2.window.document.getElementById('plan-app');

ok(app.innerHTML.indexOf('广东中山之旅') > -1, '计划页渲染计划名');
ok(app.innerHTML.indexOf('data-action="open-import"') === -1, '计划详情页已删除「导入」按钮');
ok(app.innerHTML.indexOf('data-action="export-text"') > -1, '计划页保留导出按钮');
ok(app.innerHTML.indexOf('data-action="add-item"') > -1, '计划页可新增事项（非预览）');
ok(app.innerHTML.indexOf('孙文故里') > -1, '事项展示');
var cssText = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
ok(cssText.indexOf('#app, #plan-app') > -1, 'plan.html 与首页共用居中限宽布局（#app/#plan-app 同规则）');
var planHtmlText = fs.readFileSync(path.join(root, 'plan.html'), 'utf8');
ok(planHtmlText.indexOf('id="plan-app"') > -1, 'plan.html 包含 plan-app 容器');

// 新增事项
click(winB, app.querySelector('[data-action="add-item"]'));
modal = domB2.window.document.getElementById('modal-root').querySelector('.modal');
ok(modal.querySelectorAll('.chip').length === 0, '已移除快捷时间片');
ok(!!modal.querySelector('#f-start-h') && !!modal.querySelector('#f-start-m') &&
   !!modal.querySelector('#f-end-h') && !!modal.querySelector('#f-end-m'),
   '时间输入为「时:分」两个文本框（AA:BB）');
ok(!!modal.querySelector('#f-intro-on') && !!modal.querySelector('#f-remark-on'), '新增事项含「添加介绍/备注」开关');
modal.querySelector('#f-start-h').value = '8';
modal.querySelector('#f-end-h').value = '9';
modal.querySelector('#f-title').value = '午餐';
modal.querySelector('#f-intro-on').checked = true;
modal.querySelector('#f-intro-on').dispatchEvent(new winB.Event('change'));
ok(modal.querySelector('#f-intro-wrap').style.display !== 'none', '勾选「添加介绍」后显示介绍输入框');
modal.querySelector('#f-intro').value = '很好吃的烤鸭';
click(winB, btnByText(winB, modal, '保存'));
app = domB2.window.document.getElementById('plan-app');
ok(app.innerHTML.indexOf('08:00–09:00') > -1, '分钟留空默认 00（8: → 08:00）');
ok(app.innerHTML.indexOf('午餐') > -1, '事项创建成功');
ok(app.innerHTML.indexOf('很好吃的烤鸭') > -1, '介绍内容已保存并展示');

// 编辑事项：预填介绍开关与内容
var cards = app.querySelectorAll('.item-card');
var lunchCard = Array.prototype.find.call(cards, function (c) { return c.textContent.indexOf('午餐') > -1; });
click(winB, lunchCard.querySelector('[data-action="edit-item"]'));
modal = domB2.window.document.getElementById('modal-root').querySelector('.modal');
ok(modal.querySelector('#f-intro-on').checked === true && modal.querySelector('#f-intro').value === '很好吃的烤鸭',
   '编辑事项预填「添加介绍」开关与内容');
click(winB, domB2.window.document.getElementById('modal-root').querySelector('.modal-close'));

// 重叠拦截
click(winB, app.querySelector('[data-action="add-item"]'));
modal = domB2.window.document.getElementById('modal-root').querySelector('.modal');
modal.querySelector('#f-start-h').value = '10';
modal.querySelector('#f-start-m').value = '00';
modal.querySelector('#f-end-h').value = '11';
modal.querySelector('#f-end-m').value = '00';
modal.querySelector('#f-title').value = '冲突事项';
click(winB, btnByText(winB, modal, '保存'));
ok(domB2.window.document.getElementById('plan-app').innerHTML.indexOf('冲突事项') === -1, '重叠时间段被拦截');

// 注意事项（先关闭校验失败后仍打开的弹窗）
click(winB, domB2.window.document.getElementById('modal-root').querySelector('.modal-close'));
click(winB, app.querySelector('[data-action="add-note"]'));
modal = domB2.window.document.getElementById('modal-root').querySelector('.modal');
ok(!!modal && !!modal.querySelector('#f-title') && !!modal.querySelector('#f-body'), '注意事项弹窗含标题/正文');

// 一键删除当天事项（确认后清空，无需验证码）
click(winB, domB2.window.document.getElementById('modal-root').querySelector('.modal-close'));
ok(app.innerHTML.indexOf('data-action="clear-day"') > -1, '天数面板含「一键删除」按钮');
click(winB, app.querySelector('[data-action="clear-day"]'));
var cm = domB2.window.document.getElementById('modal-root').querySelector('.modal');
ok(!!cm && cm.innerHTML.indexOf('全部') > -1, '一键删除弹出确认框');
click(winB, btnByText(winB, cm, '确认删除'));
setTimeout(function () { // 等待确认回调（Promise 微任务）执行完成
  app = domB2.window.document.getElementById('plan-app');
  ok(app.innerHTML.indexOf('午餐') === -1 && app.innerHTML.indexOf('孙文故里') === -1, '确认后当天事项被清空');

/* ================= B+. 事项花销联动（一对多） ================= */
console.log('== B+. 事项花销 ==');
var modalRootB = domB2.window.document.getElementById('modal-root');
function setInput(win, el, v) { el.value = v; el.dispatchEvent(new win.Event('input', { bubbles: true })); }
// 新增事项 + 多个花销
click(winB, app.querySelector('[data-action="add-item"]'));
modal = modalRootB.querySelector('.modal');
ok(!!modal.querySelector('#exp-rows') && !!modal.querySelector('[data-act="exp-add"]'), '新增事项含花销管理区（可添加多个）');
modal.querySelector('#f-start-h').value = '10'; modal.querySelector('#f-start-m').value = '00';
modal.querySelector('#f-end-h').value = '11'; modal.querySelector('#f-end-m').value = '00';
modal.querySelector('#f-title').value = '门票';
// 添加两行花销并填金额
click(winB, modal.querySelector('[data-act="exp-add"]'));
click(winB, modal.querySelector('[data-act="exp-add"]'));
var rows = modal.querySelectorAll('.exp-row');
ok(rows.length === 2, '「＋ 添加花销」出现两行');
ok(!!rows[0].querySelector('.exp-title') && !!rows[0].querySelector('.exp-amount'), '花销行含标题（选填）与金额输入框');
setInput(winB, rows[0].querySelector('.exp-amount'), '12.5'); // 标题留空 → 默认事项标题
setInput(winB, rows[1].querySelector('.exp-title'), '保险'); // 自定义标题
setInput(winB, rows[1].querySelector('.exp-amount'), '8');
// 非法金额拦截（第三行填 abc）
click(winB, modal.querySelector('[data-act="exp-add"]'));
setInput(winB, modal.querySelectorAll('.exp-row')[2].querySelector('.exp-amount'), 'abc');
click(winB, btnByText(winB, modal, '保存'));
ok(!!domB2.window.document.querySelector('.toast'), '非法金额弹出提示');
ok(JSON.parse(domB2.window.localStorage.getItem('travel-planner:v1')).trips[0].expenses.length === 0, '非法金额不保存');
// 删除非法行、改金额、保存
click(winB, modal.querySelectorAll('.exp-row')[2].querySelector('[data-act="exp-del"]'));
ok(modal.querySelectorAll('.exp-row').length === 2, '弹窗内删除花销行（直接删）');
setInput(winB, modal.querySelectorAll('.exp-row')[0].querySelector('.exp-amount'), '20');
click(winB, btnByText(winB, modal, '保存'));
var stA = JSON.parse(domB2.window.localStorage.getItem('travel-planner:v1')).trips[0];
ok(stA.expenses.length === 2
   && stA.expenses[0].title === '' && stA.expenses[0].amount === 2000
   && stA.expenses[1].title === '保险' && stA.expenses[1].amount === 800
   && stA.expenses.every(function (e) { return e.itemId && e.time === '10:00' && !e.remark; }),
   '保存多花销：标题留空为空、自定义标题生效、金额正确');
app = domB2.window.document.getElementById('plan-app');
ok(app.innerHTML.indexOf('花销：28元') > -1, '事项卡片花销栏显示总和（20+8=28）');
ok(app.innerHTML.indexOf('今日花销：28元') > -1, '每日标题显示今日花销');
var weekEl = app.querySelector('.day-panel-head .week');
ok(!!weekEl && weekEl.textContent.indexOf('1 个事项') === 0 && weekEl.textContent.indexOf('· ') !== 0,
   '天数标题第二行无前缀点（1 个事项 · 今日花销：28元）');
var cssT2 = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
ok(/\.day-panel-head \.week\s*\{[^}]*display:\s*block/.test(cssT2), '天数标题第二行样式为块级（换行到日期下方）');
var noteItemEl = app.querySelector('.note-item');
ok(!!noteItemEl && !!noteItemEl.querySelector('.note-main') && !!noteItemEl.querySelector('.note-actions'),
   '注意事项内容与按钮分离（note-main 包裹）');
ok(/\.note-item\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center/.test(cssT2),
   '注意事项按钮右侧且垂直居中（flex 布局）');
ok(app.innerHTML.indexOf('总花销：<b>28元</b>') > -1 && app.innerHTML.indexOf('data-action="open-spend"') > -1, '头部显示总花销与「查看详情」链接');
// 编辑事项：预填已有花销的标题与金额、删除一行
app = domB2.window.document.getElementById('plan-app');
var ticketCard = Array.prototype.find.call(app.querySelectorAll('.item-card'), function (c) { return c.textContent.indexOf('门票') > -1; });
click(winB, ticketCard.querySelector('[data-action="edit-item"]'));
modal = modalRootB.querySelector('.modal');
var erows = modal.querySelectorAll('.exp-row');
ok(erows.length === 2 && erows[0].querySelector('.exp-title').value === '' && erows[0].querySelector('.exp-amount').value === '20'
   && erows[1].querySelector('.exp-title').value === '保险' && erows[1].querySelector('.exp-amount').value === '8',
   '编辑事项预填已有花销的标题与金额');
click(winB, erows[0].querySelector('[data-act="exp-del"]'));
ok(modal.querySelectorAll('.exp-row').length === 1, '弹窗内删除花销行');
click(winB, btnByText(winB, modal, '保存'));
var stB = JSON.parse(domB2.window.localStorage.getItem('travel-planner:v1')).trips[0];
ok(stB.expenses.length === 1 && stB.expenses[0].amount === 800, '删除后保存生效（剩 1 条）');
// 重新加一个带花销的事项（午餐费 100，供 spend 页测试）
app = domB2.window.document.getElementById('plan-app');
click(winB, app.querySelector('[data-action="add-item"]'));
modal = modalRootB.querySelector('.modal');
modal.querySelector('#f-start-h').value = '12'; modal.querySelector('#f-start-m').value = '00';
modal.querySelector('#f-end-h').value = '13'; modal.querySelector('#f-end-m').value = '00';
modal.querySelector('#f-title').value = '午餐费';
click(winB, modal.querySelector('[data-act="exp-add"]'));
setInput(winB, modal.querySelectorAll('.exp-row')[0].querySelector('.exp-amount'), '100');
click(winB, btnByText(winB, modal, '保存'));

/* ================= D. 花销页（spend.html） ================= */
console.log('== D. 花销页 ==');
var savedSpend = JSON.parse(domB2.window.localStorage.getItem('travel-planner:v1'));
savedSpend.trips[0].expenses.push({ id: 'x_ind', day: '2026-08-02', title: '住宿费', amount: 30000, remark: '双人间一晚', createdAt: 2 });
domB2.window.localStorage.setItem('travel-planner:v1', JSON.stringify(savedSpend));
var domD = new JSDOM('<!DOCTYPE html><html><body><div id="spend-app"></div>' +
  '<footer class="site-footer">作者：Jimmy · <a href="author.html">联系作者</a></footer>' +
  '<div id="modal-root"></div></body></html>',
  { url: 'http://localhost/spend.html?id=trip_demo&preview=0', runScripts: 'outside-only', pretendToBeVisual: true });
domD.window.localStorage.setItem('travel-planner:v1', JSON.stringify(savedSpend));
SCRIPTS.forEach(function (f) { domD.window.eval(fs.readFileSync(path.join(root, f), 'utf8')); });
var appD = domD.window.document.getElementById('spend-app');
ok(appD.innerHTML.indexOf('计划总花销') > -1 && appD.innerHTML.indexOf('408元') > -1, 'spend 页显示计划总花销（门票8+午餐费100+住宿300=408）');
ok(appD.querySelectorAll('[data-action="spend-date"] option').length === 2, '日期下拉含全部天数');
ok(appD.innerHTML.indexOf('当日花销：108元') > -1, '默认选中第1天显示当日花销（门票8+午餐费100）');
ok(appD.innerHTML.indexOf('午餐费') > -1 && appD.innerHTML.indexOf('100元') > -1, '花销项列表显示事项来源花销');
ok(appD.innerHTML.indexOf('门票 - 保险') > -1, 'spend 显示「事项标题 - 花销标题」');
ok(appD.innerHTML.indexOf('spend-item-time') > -1 && appD.innerHTML.indexOf('12:00') > -1, '花销项列表显示时间（事项开始时间）');
ok(appD.innerHTML.indexOf('data-action="spend-back"') > -1, 'spend 页含「返回计划」按钮');
ok(appD.innerHTML.indexOf('data-action="export-spend"') > -1 && appD.innerHTML.indexOf('spend-export') > -1 && appD.innerHTML.indexOf('btn btn-soft') > -1,
   '导出花销按钮位于总花销下方（btn-soft，与 plan 页导出文字同款）');
// 导出花销文字
click(domD.window, appD.querySelector('[data-action="export-spend"]'));
var expModal = domD.window.document.getElementById('modal-root').querySelector('.modal');
var expTa = expModal ? expModal.querySelector('.exp-text') : null;
ok(!!expTa && expTa.value.indexOf('总花销：408元') > -1 && expTa.value.indexOf('第1天总花销：108元') > -1 && expTa.value.indexOf('午餐费：100元') > -1,
   '导出花销弹窗含总花销与第1天总花销（标题:金额）');
click(domD.window, expModal.querySelector('.modal-close'));
// 编辑带 itemId 花销金额+时间 → 事项花销栏同步（B：金额同源）
var lunchItem = Array.prototype.find.call(appD.querySelectorAll('.spend-item'), function (c) { return c.textContent.indexOf('午餐费') > -1; });
click(domD.window, lunchItem.querySelector('[data-action="spend-edit"]'));
var modalD = domD.window.document.getElementById('modal-root').querySelector('.modal');
ok(!!modalD.querySelector('#x-time-h') && !!modalD.querySelector('#x-time-m'), '编辑花销含时间输入框（AA:BB）');
var nowBtnD = modalD.querySelector('[data-act="x-time-now"]');
ok(!!nowBtnD, '编辑花销含「当前时间」按钮');
click(domD.window, nowBtnD);
var nowH = modalD.querySelector('#x-time-h').value, nowM = modalD.querySelector('#x-time-m').value;
ok(/^\d{2}$/.test(nowH) && /^\d{2}$/.test(nowM) && +nowH <= 23 && +nowM <= 59, '「当前时间」按钮填入合法当前时刻');
modalD.querySelector('#x-time-h').value = '12';
modalD.querySelector('#x-time-m').value = '30';
modalD.querySelector('#x-amount').value = '150';
click(domD.window, btnByText(domD.window, modalD, '保存'));
var stD = JSON.parse(domD.window.localStorage.getItem('travel-planner:v1')).trips[0];
var lunchItemDataB = stD.days['2026-08-01'].filter(function (i) { return i.title === '午餐费'; })[0];
var lunchExp = stD.expenses.filter(function (e) { return e.itemId === lunchItemDataB.id; })[0];
ok(lunchExp.amount === 15000 && lunchExp.time === '12:30', '编辑花销：金额与时间同步更新');
// 删除带 itemId 花销 → 确认 → 联动事项花销栏清空（C）
appD = domD.window.document.getElementById('spend-app');
lunchItem = Array.prototype.find.call(appD.querySelectorAll('.spend-item'), function (c) { return c.textContent.indexOf('午餐费') > -1; });
click(domD.window, lunchItem.querySelector('[data-action="spend-del"]'));
var cmD = domD.window.document.getElementById('modal-root').querySelector('.modal');
ok(!!cmD, '删除花销弹出确认框');
ok(cmD.textContent.indexOf('对应事项中的花销项也一并删除') > -1, '删除事项绑定花销的确认框含联动提示');
click(domD.window, btnByText(domD.window, cmD, '确认删除'));
setTimeout(function () { // 等待删除确认回调（Promise 微任务）执行完成
  stD = JSON.parse(domD.window.localStorage.getItem('travel-planner:v1')).trips[0];
  ok(stD.expenses.filter(function (e) { return e.itemId === lunchItemDataB.id; }).length === 0, '确认后花销项删除');
  var lunchItemData = stD.days['2026-08-01'].filter(function (i) { return i.title === '午餐费'; })[0];
  ok(!!lunchItemData, '花销删除后事项本身仍保留');
  // 切换日期 → 独立花销
  appD = domD.window.document.getElementById('spend-app');
  var selD = appD.querySelector('[data-action="spend-date"]');
  selD.value = '2026-08-02';
  selD.dispatchEvent(new domD.window.Event('change', { bubbles: true }));
  appD = domD.window.document.getElementById('spend-app');
  ok(appD.innerHTML.indexOf('当日花销：300元') > -1 && appD.innerHTML.indexOf('住宿费') > -1 && appD.innerHTML.indexOf('双人间一晚') > -1,
     '切换日期显示独立花销及其备注');
  ok(appD.innerHTML.indexOf('spend-ind') > -1 && appD.innerHTML.indexOf('住宿费') > -1, '独立花销标题带 * 标记');
  // 非法时间拦截（添加花销弹窗，输入了但非法 → 提示且不保存）
  click(domD.window, appD.querySelector('[data-action="spend-add"]'));
  modalD = domD.window.document.getElementById('modal-root').querySelector('.modal');
  modalD.querySelector('#x-title').value = '非法时间';
  modalD.querySelector('#x-amount').value = '10';
  modalD.querySelector('#x-time-h').value = '99';
  modalD.querySelector('#x-time-m').value = '00';
  click(domD.window, btnByText(domD.window, modalD, '保存'));
  ok(!!domD.window.document.querySelector('.toast'), '非法时间弹出提示');
  ok(JSON.parse(domD.window.localStorage.getItem('travel-planner:v1')).trips[0].expenses.length === 2, '非法时间不保存');
  click(domD.window, domD.window.document.getElementById('modal-root').querySelector('.modal-close'));
  // 添加独立花销（A：不关联事项）
  click(domD.window, appD.querySelector('[data-action="spend-add"]'));
  modalD = domD.window.document.getElementById('modal-root').querySelector('.modal');
  modalD.querySelector('#x-title').value = '餐饮';
  modalD.querySelector('#x-amount').value = '50';
  modalD.querySelector('#x-remark').value = '晚餐';
  click(domD.window, btnByText(domD.window, modalD, '保存'));
  stD = JSON.parse(domD.window.localStorage.getItem('travel-planner:v1')).trips[0];
  var dinExp = stD.expenses.filter(function (e) { return e.title === '餐饮'; })[0];
  ok(!!dinExp && !dinExp.itemId && dinExp.amount === 5000 && dinExp.remark === '晚餐', 'spend 页添加花销（独立、无 itemId、带备注）');
  appD = domD.window.document.getElementById('spend-app');
  ok(appD.innerHTML.indexOf('餐饮') > -1 && appD.innerHTML.indexOf('50元') > -1 && appD.innerHTML.indexOf('晚餐') > -1, '列表显示新添花销');
  // 预览模式只读
  var domD2 = new JSDOM('<!DOCTYPE html><html><body><div id="spend-app"></div>' +
    '<footer class="site-footer">作者：Jimmy · <a href="author.html">联系作者</a></footer>' +
    '<div id="modal-root"></div></body></html>',
    { url: 'http://localhost/spend.html?id=trip_demo&preview=1', runScripts: 'outside-only', pretendToBeVisual: true });
  domD2.window.localStorage.setItem('travel-planner:v1', JSON.stringify(JSON.parse(domD.window.localStorage.getItem('travel-planner:v1'))));
  SCRIPTS.forEach(function (f) { domD2.window.eval(fs.readFileSync(path.join(root, f), 'utf8')); });
  var appD2 = domD2.window.document.getElementById('spend-app');
  ok(appD2.innerHTML.indexOf('data-action="spend-add"') === -1 && appD2.innerHTML.indexOf('data-action="spend-edit"') === -1 && appD2.innerHTML.indexOf('data-action="spend-del"') === -1,
     'spend 预览模式只读（无添加/编辑/删除）');
  ok(appD2.innerHTML.indexOf('计划总花销') > -1 && appD2.innerHTML.indexOf('358元') > -1 && appD2.innerHTML.indexOf('data-action="spend-back"') > -1,
     'spend 预览仍显示总花销（300+50=350）与返回按钮');

/* ================= C. 预览页（plan.html?preview=1） ================= */
  console.log('== C. 预览页 ==');
  var savedB = JSON.parse(domB2.window.localStorage.getItem('travel-planner:v1'));
  var domC = new JSDOM('<!DOCTYPE html><html><body><div id="plan-app"></div>' +
    '<footer class="site-footer">作者：Jimmy · <a href="author.html">联系作者</a></footer>' +
    '<div id="modal-root"></div></body></html>',
    { url: 'http://localhost/plan.html?id=trip_demo&preview=1', runScripts: 'outside-only', pretendToBeVisual: true });
  domC.window.localStorage.setItem('travel-planner:v1', JSON.stringify(savedB));
  SCRIPTS.forEach(function (f) { domC.window.eval(fs.readFileSync(path.join(root, f), 'utf8')); });
  app = domC.window.document.getElementById('plan-app');

  ok(app.innerHTML.indexOf('预览模式') === -1, '预览模式已无黄色横幅');
  ok(app.innerHTML.indexOf('data-action="exit-preview"') === -1, '预览模式无退出横幅按钮');
  ok(app.innerHTML.indexOf('data-action="add-item"') === -1, '预览无新增事项');
  ok(app.innerHTML.indexOf('data-action="edit-item"') === -1, '预览无编辑事项');
  ok(app.innerHTML.indexOf('data-action="del-item"') === -1, '预览无删除事项');
  ok(app.innerHTML.indexOf('data-action="delete-trip"') === -1, '预览无删除计划');
  ok(app.innerHTML.indexOf('data-action="rename-trip"') === -1, '预览无重命名');
  ok(app.innerHTML.indexOf('data-action="add-note"') === -1, '预览无新增注意事项');
  ok(app.innerHTML.indexOf('data-action="export-text"') > -1, '预览仍可导出');
  ok(app.innerHTML.indexOf('data-action="back"') > -1, '预览可通过返回按钮退出');

/* ================= E. 初始日期逻辑（计划覆盖今天 → 默认今天） ================= */
  console.log('== E. 初始日期逻辑 ==');
  function dayStr(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  var todayE = dayStr(new Date());
  var tomorrowE = dayStr(new Date(Date.now() + 86400000));
  var stE = JSON.parse(domB2.window.localStorage.getItem('travel-planner:v1'));
  var todayDay = {};
  todayDay[todayE] = [{ id: 't1', start: '09:00', end: '10:00', title: '今日事项', location: '', intro: '', remark: '', createdAt: 9 }];
  stE.trips.push({
    id: 'trip_today', name: '覆盖今天之旅', startDate: todayE, endDate: tomorrowE,
    notes: [], days: todayDay, createdAt: 9, updatedAt: 9
  });
  domB2.window.localStorage.setItem('travel-planner:v1', JSON.stringify(stE));
  // plan 页：默认选中今天
  var domE = new JSDOM('<!DOCTYPE html><html><body><div id="plan-app"></div>' +
    '<footer class="site-footer">作者：Jimmy · <a href="author.html">联系作者</a></footer>' +
    '<div id="modal-root"></div></body></html>',
    { url: 'http://localhost/plan.html?id=trip_today&preview=0', runScripts: 'outside-only', pretendToBeVisual: true });
  domE.window.localStorage.setItem('travel-planner:v1', JSON.stringify(stE));
  SCRIPTS.forEach(function (f) { domE.window.eval(fs.readFileSync(path.join(root, f), 'utf8')); });
  var appE = domE.window.document.getElementById('plan-app');
  var activeE = appE.querySelector('.day-tab.active');
  ok(!!activeE && activeE.getAttribute('data-date') === todayE && appE.innerHTML.indexOf('今日事项') > -1,
     '计划覆盖今天：进入计划页默认选中今天');
  // spend 页：日期下拉默认今天
  var domE2 = new JSDOM('<!DOCTYPE html><html><body><div id="spend-app"></div>' +
    '<footer class="site-footer">作者：Jimmy · <a href="author.html">联系作者</a></footer>' +
    '<div id="modal-root"></div></body></html>',
    { url: 'http://localhost/spend.html?id=trip_today&preview=0', runScripts: 'outside-only', pretendToBeVisual: true });
  domE2.window.localStorage.setItem('travel-planner:v1', JSON.stringify(stE));
  SCRIPTS.forEach(function (f) { domE2.window.eval(fs.readFileSync(path.join(root, f), 'utf8')); });
  var appE2 = domE2.window.document.getElementById('spend-app');
  var selE = appE2.querySelector('[data-action="spend-date"]');
  ok(!!selE && selE.value === todayE, '计划覆盖今天：spend 页日期下拉默认今天');
  // 计划不含今天 → 默认第一天（与现状一致）
  var domE3 = new JSDOM('<!DOCTYPE html><html><body><div id="plan-app"></div>' +
    '<footer class="site-footer">作者：Jimmy · <a href="author.html">联系作者</a></footer>' +
    '<div id="modal-root"></div></body></html>',
    { url: 'http://localhost/plan.html?id=trip_demo&preview=0', runScripts: 'outside-only', pretendToBeVisual: true });
  domE3.window.localStorage.setItem('travel-planner:v1', JSON.stringify(stE));
  SCRIPTS.forEach(function (f) { domE3.window.eval(fs.readFileSync(path.join(root, f), 'utf8')); });
  var activeE3 = domE3.window.document.getElementById('plan-app').querySelector('.day-tab.active');
  ok(!!activeE3 && activeE3.getAttribute('data-date') === '2026-08-01', '计划不含今天：默认第一天（与现状一致）');

  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
}, 30);
}, 20);
