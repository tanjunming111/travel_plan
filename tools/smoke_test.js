/**
 * 冒烟测试：文字/Word 往返一致性、重叠校验、排序、改期整体平移
 * 运行：NODE_PATH=<workspace>/node_modules node tools/smoke_test.js
 */
'use strict';

// ---- localStorage 模拟 ----
var __store = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(__store, k) ? __store[k] : null; },
  setItem: function (k, v) { __store[k] = String(v); },
  removeItem: function (k) { delete __store[k]; }
};

var Storage = require('../js/storage.js');
var Format = require('../js/format.js');
var Word = require('../js/word.js');
var JSZip = require('jszip');

var D = Storage.DateUtils, V = Storage.Validation, Store = Storage.Store, Money = Storage.Money;

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
}

function buildSampleTrip() {
  var trip = Store.createTrip('北京五日游', '2026-08-10', '2026-08-14');
  trip.notes = [Store.newNote('证件', '身份证、学生证'), Store.newNote('天气提醒', '8 月多雨，请带雨伞')];
  var a = Store.newItem('09:00', '10:30', '参观故宫博物院', '北京市东城区景山前街 4 号');
  a.intro = '明清两朝皇宫，世界文化遗产'; a.remark = '建议提前 3 天网上预约门票';
  trip.days['2026-08-10'].push(a);
  trip.days['2026-08-10'].push(Store.newItem('11:00', '12:00', '午餐·四季民福烤鸭店', '王府井大街'));
  var c = Store.newItem('14:00', '17:00', '恭王府', '');
  c.intro = '清代规模最大的王府';
  trip.days['2026-08-10'].push(c);
  var b = Store.newItem('09:30', '11:30', '颐和园', '北京市海淀区新建宫门路 19 号');
  b.remark = '乘地铁 4 号线北宫门站';
  trip.days['2026-08-11'].push(b);
  trip.days['2026-08-11'].push(Store.newItem('13:00', '15:00', '圆明园遗址公园', '北京市海淀区清华西路 28 号'));
  trip.days['2026-08-13'].push(Store.newItem('10:00', '11:00', '国家博物馆', ''));
  var e = Store.newItem('09:00', '10:00', '收拾行李退房', '');
  e.remark = '12 点前退房，行李可寄存前台';
  trip.days['2026-08-14'].push(e);
  return trip;
}

/** 比较两个计划（忽略 id/createdAt） */
function tripsEqual(a, b) {
  if (a.name !== b.name || a.startDate !== b.startDate || a.endDate !== b.endDate) return false;
  if ((a.notes || []).length !== (b.notes || []).length) return false;
  for (var i = 0; i < (a.notes || []).length; i++) {
    if (a.notes[i].title !== b.notes[i].title || a.notes[i].body !== b.notes[i].body) return false;
  }
  var dates = D.dateList(a.startDate, a.endDate);
  for (var j = 0; j < dates.length; j++) {
    var ai = V.sortItems(a.days[dates[j]] || []);
    var bi = V.sortItems(b.days[dates[j]] || []);
    if (ai.length !== bi.length) return false;
    for (var k = 0; k < ai.length; k++) {
      var x = ai[k], y = bi[k];
      if (x.start !== y.start || x.end !== y.end || x.title !== y.title ||
          x.location !== y.location || x.intro !== y.intro || x.remark !== y.remark) return false;
    }
  }
  return true;
}

async function main() {
  var trip = buildSampleTrip();
  console.log('== 1. 文字导出/导入往返 ==');
  var text = Format.exportTripToText(trip);
  ok(text.indexOf('【起止日期】2026-08-10 ~ 2026-08-14\n【注意事项】') === 0
     || text.indexOf('【起止日期】2026-08-10 ~ 2026-08-14\n【注意事项】') > -1,
     '导出文本中【起止日期】与【注意事项】之间无空行');
  var parsed = Format.parseTripFromText(text);
  ok(parsed.ok && parsed.errors.length === 0, '文字解析无错误');
  ok(tripsEqual(trip, parsed.trip), '文字往返内容一致');

  // 空注意事项计划
  var trip2 = Store.createTrip('空计划', '2026-08-01', '2026-08-03');
  trip2.days['2026-08-02'].push(Store.newItem('08:00', '09:00', '晨跑', ''));
  var p2 = Format.parseTripFromText(Format.exportTripToText(trip2));
  ok(p2.ok && tripsEqual(trip2, p2.trip), '无注意事项计划往返一致');

  // 含未知行的容错
  var p3 = Format.parseTripFromText('【旅游计划】测试\n【起止日期】2026-08-01 ~ 2026-08-01\n乱七八糟的一行\n【第1天 08月01日】\n09:00-10:00 事项A\n');
  ok(p3.errors.length === 1 && p3.trip.days['2026-08-01'].length === 1, '未知行报错且其余内容保留');

  console.log('== 2. 重叠校验 / 排序 ==');
  var items = [Store.newItem('09:00', '10:30', 'A', '')];
  ok(V.findConflict(items, '10:00', '11:00') !== null, '10:00-11:00 与 09:00-10:30 冲突');
  ok(V.findConflict(items, '10:30', '11:00') === null, '10:30-11:00 首尾相接不冲突');
  ok(V.findConflict(items, '08:00', '09:00') === null, '08:00-09:00 首尾相接不冲突');
  ok(V.findConflict(items, '09:00', '10:30') !== null, '完全相同时间段冲突');
  ok(!V.isTimeRangeValid('10:00', '09:00'), '结束早于开始非法');
  ok(!V.isTimeRangeValid('25:00', '26:00'), '非 HH:mm 非法');
  var sorted = V.sortItems([{ id: 'b', start: '11:00', createdAt: 2 }, { id: 'a', start: '09:00', createdAt: 1 }, { id: 'c', start: '09:00', createdAt: 0 }]);
  ok(sorted[0].id === 'c' && sorted[1].id === 'a' && sorted[2].id === 'b', '按起始时间升序、同时按创建先后');

  console.log('== 3. 改期整体平移 ==');
  var s1 = Store.shiftDates(trip, '2026-08-12', '2026-08-16');
  ok(s1.removedDays.length === 0, '同天数改期不移除内容');
  ok(s1.trip.days['2026-08-12'].length === trip.days['2026-08-10'].length, '第1天内容平移至新开始日期');
  ok(s1.trip.days['2026-08-12'][0].title === '参观故宫博物院', '平移后事项标题正确');
  ok(s1.trip.days['2026-08-16'].length === trip.days['2026-08-14'].length, '第5天内容平移至新结束日期');
  var s2 = Store.shiftDates(trip, '2026-08-12', '2026-08-13');
  ok(s2.removedDays.length === 3, '范围缩短移除末尾3天');
  ok(s2.trip.days['2026-08-12'].length === 3 && s2.trip.days['2026-08-13'].length === 2, '缩短后保留前2天内容');

  console.log('== 3b. 改期不平移（事项内容跟随原日期） ==');
  var keepSrc = Store.createTrip('不平移测试', '2026-08-10', '2026-08-14');
  keepSrc.days['2026-08-10'] = [Store.newItem('09:00', '10:00', '第一天', '')];
  keepSrc.days['2026-08-12'] = [Store.newItem('09:00', '10:00', '第三天', '')];
  keepSrc.expenses = [
    Store.newExpense('2026-08-10', '第1天花销', 1000, keepSrc.days['2026-08-10'][0].id),
    Store.newExpense('2026-08-12', '第3天独立花销', 2000)
  ];
  var k1 = Store.shiftDates(keepSrc, '2026-08-11', '2026-08-14', 'keep');
  ok(k1.removedDays.length === 1 && k1.removedDays[0] === '2026-08-10', '不平移：起始日后移，旧第1天被移除');
  ok(k1.trip.days['2026-08-12'].length === 1 && k1.trip.days['2026-08-12'][0].title === '第三天', '不平移：事项停留在原日期（第3天仍在第3天）');
  ok(k1.trip.days['2026-08-11'].length === 0, '不平移：新范围内原本无内容的日期为空');
  ok(k1.trip.expenses.length === 1 && k1.trip.expenses[0].day === '2026-08-12', '不平移：范围外日期花销删除，范围内保留');
  var k2 = Store.shiftDates(keepSrc, '2026-08-08', '2026-08-16', 'keep');
  ok(k2.removedDays.length === 0 && k2.trip.expenses.length === 2, '不平移：范围扩展不删除任何内容');
  ok(k2.trip.days['2026-08-10'].length === 1 && k2.trip.days['2026-08-16'].length === 0, '不平移：扩展后新增日期为空');
  var k3 = Store.shiftDates(keepSrc, '2026-08-12', '2026-08-16', 'keep');
  ok(k3.removedDays.length === 2 && k3.trip.days['2026-08-12'].length === 1, '不平移：整体后移，第3天内容仍在原日期');
  var kd = Store.shiftDates(keepSrc, '2026-08-11', '2026-08-14');
  ok(kd.trip.days['2026-08-11'].length === 1 && kd.trip.days['2026-08-11'][0].title === '第一天', '不传 mode 时默认仍为整体平移（向后兼容）');

  console.log('== 4. Word 导出/导入往返 ==');
  var buf = await Word.exportFile(JSZip, trip);
  ok(buf && buf.length > 5000, 'Word 导出生成数据（' + buf.length + ' bytes）');
  var wp = await Word.parseFile(JSZip, buf);
  ok(wp.errors.length === 0, 'Word 解析无错误');
  ok(tripsEqual(trip, wp.trip), 'Word 往返内容一致');
  var docXml = await JSZip.loadAsync(buf).then(function (z) { return z.file('word/document.xml').async('string'); });
  ok(docXml.indexOf('<w:tblW w:w="5000" w:type="pct"/>') > -1, '表格宽度为 100%（pct 值 5000）');
  ok(docXml.indexOf('<w:tblLayout w:type="fixed"/>') > -1, '表格使用固定布局（宽度顶到两侧）');
  ok(docXml.indexOf('<w:ind w:left="240"/>') > -1, '事项栏段落含左缩进 240 twips');

  console.log('== 5. localStorage 持久化 ==');
  var trips = [trip];
  Store.save(trips);
  var loaded = Store.load();
  ok(loaded.length === 1 && loaded[0].name === '北京五日游', 'localStorage 保存/读取');

  console.log('== 6. 花销金额工具（Money） ==');
  ok(Money.parseAmountToCents('12.5') === 1250, '12.5 → 1250 分');
  ok(Money.parseAmountToCents('0') === 0, '0 → 0 分');
  ok(Money.parseAmountToCents('12.55') === 1255, '12.55 → 1255 分');
  ok(Money.parseAmountToCents('12') === 1200, '12 → 1200 分');
  ok(Money.parseAmountToCents('abc') === null, '非数字非法');
  ok(Money.parseAmountToCents('-5') === null, '负数非法');
  ok(Money.parseAmountToCents('1.234') === null, '超过两位小数非法');
  ok(Money.parseAmountToCents('') === null, '空字符串非法');
  ok(Money.parseAmountToCents('12.') === null, '"12." 非法');
  ok(Money.parseAmountToCents('999999.99') === 99999999, '上限 999999.99 合法');
  ok(Money.parseAmountToCents('1000000') === null, '超上限非法');
  ok(Money.formatCents(1250) === '12.5', '1250 分 → 12.5');
  ok(Money.formatCents(1200) === '12', '1200 分 → 12');
  ok(Money.formatCents(1255) === '12.55', '1255 分 → 12.55');
  ok(Money.formatCents(0) === '0', '0 分 → 0');
  ok(Money.formatCents(1005) === '10.05', '1005 分 → 10.05');
  ok(Money.sumCents([{ amount: 1250 }, { amount: 300 }, { amount: 5 }]) === 1555, '求和（分整数运算，无浮点误差）');
  ok(Money.yuanText(1555) === '15.55元', 'yuanText 文案');

  console.log('== 7. 花销数据模型与改期联动 ==');
  var tx = Store.createTrip('花销测试', '2026-08-01', '2026-08-03');
  ok(Array.isArray(tx.expenses) && tx.expenses.length === 0, '新计划默认 expenses 空数组');
  __store['travel-planner:v1'] = JSON.stringify({ version: 1, trips: [{
    id: 'old', name: '旧计划', startDate: '2026-08-01', endDate: '2026-08-02',
    notes: [], days: { '2026-08-01': [] }, createdAt: 1, updatedAt: 1
  }] });
  var loadedOld = Store.load();
  ok(Array.isArray(loadedOld[0].expenses) && loadedOld[0].expenses.length === 0, '旧数据加载自动补 expenses: []');
  var ex1 = Store.newExpense('2026-08-01', '门票', 1250, 'item_x');
  ok(ex1.itemId === 'item_x' && ex1.amount === 1250 && ex1.remark === '', 'newExpense 字段正确（itemId/分/备注空）');
  var tShift = Store.createTrip('平移测试', '2026-08-01', '2026-08-03');
  tShift.expenses.push(Store.newExpense('2026-08-01', '随事项花销', 1000, 'e_id_1'));
  tShift.expenses.push(Store.newExpense('2026-08-02', '独立花销', 2000));
  var r1 = Store.shiftDates(tShift, '2026-08-05', '2026-08-07');
  ok(r1.removedDays.length === 0 && r1.trip.expenses.length === 2, '同天数改期花销保留');
  var m1 = r1.trip.expenses.filter(function (x) { return x.itemId === 'e_id_1'; })[0];
  ok(m1.day === '2026-08-05', '带 itemId 花销随事项平移（旧第1天 → 新第1天）');
  var m2 = r1.trip.expenses.filter(function (x) { return !x.itemId; })[0];
  ok(m2.day === '2026-08-02', '独立花销留在原日期');
  var r2 = Store.shiftDates(tShift, '2026-08-05', '2026-08-05');
  ok(r2.removedDays.length === 2 && r2.trip.expenses.length === 1 && r2.removedExpenses.length === 1,
     '范围压缩：第1天随事项花销保留平移，被移除天（独立花销）删除');
  ok(r2.trip.expenses[0].day === '2026-08-05' && r2.trip.expenses[0].itemId === 'e_id_1', '保留项平移到新第1天');
  ok(r2.removedExpenses[0].day === '2026-08-02' && !r2.removedExpenses[0].itemId, '删除的是被移除天的独立花销');

  console.log('== 8. 花销时间 + 文字导入导出含花销 ==');
  ok(/^\d{2}:\d{2}$/.test(D.fmtTime(Date.now())), 'fmtTime 输出 HH:mm');
  var se = V.sortExpenses([
    { id: 'a', time: '15:00', createdAt: 2 },
    { id: 'b', time: '09:00', createdAt: 2 },
    { id: 'c', time: '09:00', createdAt: 1 }
  ]);
  ok(se[0].id === 'c' && se[1].id === 'b' && se[2].id === 'a', '花销按时间升序、同时间按创建先后');
  var nowTs = Date.now();
  __store['travel-planner:v1'] = JSON.stringify({ version: 1, trips: [{
    id: 't_old', name: '旧', startDate: '2026-08-01', endDate: '2026-08-02',
    notes: [], createdAt: 1, updatedAt: 1,
    days: { '2026-08-01': [{ id: 'e_x', start: '10:30', end: '11:30', title: 'A', location: '', intro: '', remark: '', createdAt: 1 }] },
    expenses: [
      { id: 'x1', day: '2026-08-01', title: '事项花销', amount: 1000, remark: '', itemId: 'e_x', createdAt: 1 },
      { id: 'x2', day: '2026-08-02', title: '独立花销', amount: 2000, remark: '', itemId: '', createdAt: nowTs }
    ]
  }] });
  var loadedOld2 = Store.load();
  ok(loadedOld2[0].expenses[0].time === '10:30', '旧数据事项来源花销补时间=事项开始时间');
  ok(loadedOld2[0].expenses[1].time === D.fmtTime(nowTs), '旧数据独立花销补时间=创建时刻');
  // 导出含花销：仅事项关联花销导出，新格式「金额元（标题）」；无标题不加括号；备注不导出
  var tx2 = Store.createTrip('花销导出测试', '2026-08-01', '2026-08-02');
  var itX = Store.newItem('09:00', '10:00', '早餐', '');
  tx2.days['2026-08-01'].push(itX);
  tx2.expenses.push(Store.newExpense('2026-08-01', '早餐', 1500, itX.id, '', '09:00'));
  var itY = Store.newItem('11:00', '12:00', '高铁', '');
  tx2.days['2026-08-01'].push(itY);
  tx2.expenses.push(Store.newExpense('2026-08-01', '高铁', 3800, itY.id, '商务座', '11:00'));
  tx2.expenses.push(Store.newExpense('2026-08-01', '', 800, itY.id, '', '11:30')); // 无标题花销
  tx2.expenses.push(Store.newExpense('2026-08-01', '独立花销', 3000, '', '备注', '12:00'));
  var txt2 = Format.exportTripToText(tx2);
  ok(txt2.indexOf('花销：15元（早餐）') > -1, '有标题花销导出「花销：金额元（标题）」');
  ok(txt2.indexOf('花销：38元（高铁）+8元 = 46元') > -1, '多花销导出（无标题项不加括号）「A元（标题1）+B元 = 总和」');
  ok(txt2.indexOf('独立花销') === -1, '无事项绑定的独立花销不导出到计划文字');
  ok(txt2.indexOf('商务座') === -1, '备注不再导出到计划文字');
  // 导入还原：多条花销关联对应事项，标题=括号内容（无括号为空）、金额正确、备注空、time=HH:mm
  var ptx = Format.parseTripFromText(txt2);
  ok(ptx.ok && ptx.errors.length === 0, '花销导出文字可无错导入');
  ok(ptx.trip.expenses.length === 3, '导入还原 3 条事项关联花销');
  var exA = ptx.trip.expenses.filter(function (e) { return e.title === '早餐'; })[0];
  ok(!!exA && exA.amount === 1500 && exA.remark === '' && exA.itemId === ptx.trip.days['2026-08-01'][0].id && /^\d{2}:\d{2}$/.test(exA.time),
     '导入有标题花销：关联事项、标题=括号内容、金额、备注空、time=HH:mm');
  var exB = ptx.trip.expenses.filter(function (e) { return e.title === '高铁'; })[0];
  var exC = ptx.trip.expenses.filter(function (e) { return e.amount === 800; })[0];
  var itY2 = ptx.trip.days['2026-08-01'][1];
  ok(!!exB && !!exC && exB.amount === 3800 && exC.title === '' && exB.itemId === itY2.id && exC.itemId === itY2.id,
     '导入多花销：有标题/无标题（标题空）都关联同一事项、金额正确');
  // 无标题单花销行导入（纯「花销：150元」）
  var ptx3 = Format.parseTripFromText('【旅游计划】T\n【起止日期】2026-08-01 ~ 2026-08-01\n【第1天 08月01日】\n09:00-10:00 事项A\n花销：150元\n');
  var exD = ptx3.trip.expenses[0];
  ok(!!exD && exD.amount === 15000 && exD.title === '' && exD.itemId === ptx3.trip.days['2026-08-01'][0].id, '导入无括号花销行：标题为空、关联事项');
  // 非法花销行报错
  var ptx2 = Format.parseTripFromText('【旅游计划】T\n【起止日期】2026-08-01 ~ 2026-08-01\n【第1天 08月01日】\n09:00-10:00 事项A\n花销：abc元（门票）\n');
  ok(ptx2.errors.length === 1 && ptx2.errors[0].message.indexOf('金额') > -1, '花销金额非法报错');

  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
}

main().catch(function (e) { console.error(e); process.exit(1); });
