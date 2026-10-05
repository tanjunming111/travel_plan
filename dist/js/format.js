/**
 * format.js — 文字导入导出（PRD 第 4 节规范）
 * 导出：exportTripToText；导入：parseTripFromText（忽略空行、收集错误）
 * 浏览器暴露全局 TP.Format；Node 环境 module.exports
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(require('./storage.js')); }
  else { root.TP = root.TP || {}; root.TP.Format = factory(root.TP.Storage); }
})(typeof self !== 'undefined' ? self : this, function (Storage) {
  'use strict';

  var D = Storage.DateUtils;
  var V = Storage.Validation;
  var M = Storage.Money;
  var Store = Storage.Store;

  /** 花销项 → 「金额元（标题）」片段；无标题则不加括号（备注不导出） */
  function expensePiece(e) {
    var t = (e.title || '').trim();
    return M.yuanText(e.amount) + (t ? '（' + t + '）' : '');
  }

  /** 导出计划 → 规范文字（含花销：仅事项关联花销，顶格行）；opts.includeExpenses=false 时不导出花销 */
  function exportTripToText(trip, opts) {
    opts = opts || {};
    var includeExpenses = opts.includeExpenses !== false; // 默认导出花销
    var lines = [];
    lines.push('【旅游计划】' + (trip.name || Store.defaultName(trip.startDate, trip.endDate)));
    lines.push('【起止日期】' + trip.startDate + ' ~ ' + trip.endDate);

    if (trip.notes && trip.notes.length) {
      lines.push('【注意事项】');
      trip.notes.forEach(function (n) {
        lines.push('- ' + (n.title || '') + '：' + (n.body || ''));
      });
    }

    var exps = trip.expenses || [];
    var dates = D.dateList(trip.startDate, trip.endDate);
    dates.forEach(function (date, i) {
      lines.push('');
      lines.push('【第' + (i + 1) + '天 ' + D.fmtMD(date) + '】');
      var items = V.sortItems(trip.days[date] || []);
      if (!items.length) {
        lines.push('（无事项）');
      } else {
        items.forEach(function (it, j) {
          if (j > 0) lines.push('');
          lines.push(it.start + '-' + it.end + ' ' + (it.title || ''));
          if (it.location) lines.push('地点：' + it.location);
          if (it.intro) lines.push('介绍：' + it.intro);
          if (it.remark) lines.push('备注：' + it.remark);
          // 事项关联花销（顶格行；无事项绑定的独立花销不导出，仅 spend 页导出）
          if (includeExpenses) {
            var itemExps = V.sortExpenses(exps.filter(function (e) { return e.itemId === it.id; }));
            if (itemExps.length) {
              var pieces = itemExps.map(expensePiece);
              lines.push(pieces.length === 1
                ? '花销：' + pieces[0]
                : '花销：' + pieces.join('+') + ' = ' + M.yuanText(M.sumCents(itemExps)));
            }
          }
        });
      }
    });
    return lines.join('\n');
  }

  var DAY_HEAD_RE = /^【第(\d+)天\s+(\d{2})月(\d{2})日】$/;
  var ITEM_RE = /^(\d{2}:\d{2})-(\d{2}:\d{2})\s+(.+)$/;

  function decodeEntities(s) {
    return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }

  /**
   * 导入文字 → 计划
   * 返回 { trip: {name,startDate,endDate,notes,days}, errors: [{line,message}] }
   * 解析失败的行进入 errors，UI 提供「忽略继续 / 取消」
   */
  function parseTripFromText(text) {
    var trip = { name: '', startDate: '', endDate: '', notes: [], days: {}, expenses: [] };
    var errors = [];
    var lines = String(text).split('\n');
    var notesMode = false;
    var currentDay = null;
    var lastItem = null;
    var sawHeader = false, sawDates = false;

    function addError(lineNo, message) { errors.push({ line: lineNo, message: message }); }

    for (var i = 0; i < lines.length; i++) {
      var lineNo = i + 1;
      var raw = lines[i];
      var line = raw.trim();
      if (!line) continue;

      // 计划名称
      if (line.indexOf('【旅游计划】') === 0) {
        if (sawHeader) { addError(lineNo, '重复的【旅游计划】行'); continue; }
        sawHeader = true;
        trip.name = decodeEntities(line.slice('【旅游计划】'.length).trim());
        notesMode = false;
        continue;
      }
      // 起止日期
      if (line.indexOf('【起止日期】') === 0) {
        if (sawDates) { addError(lineNo, '重复的【起止日期】行'); continue; }
        var m = line.match(/【起止日期】\s*(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
        if (!m) { addError(lineNo, '【起止日期】格式应为 YYYY-MM-DD ~ YYYY-MM-DD'); continue; }
        if (m[2] < m[1]) { addError(lineNo, '结束日期不能早于开始日期'); continue; }
        sawDates = true;
        trip.startDate = m[1];
        trip.endDate = m[2];
        notesMode = false;
        continue;
      }
      // 注意事项区块
      if (line === '【注意事项】') {
        notesMode = true;
        continue;
      }
      // 天区块
      var dh = line.match(DAY_HEAD_RE);
      if (dh) {
        notesMode = false;
        var dayNo = parseInt(dh[1], 10);
        if (!trip.startDate) { addError(lineNo, '缺少【起止日期】，无法解析天区块'); continue; }
        var expected = D.addDays(trip.startDate, dayNo - 1);
        var expectedMD = D.fmtMD(expected);
        if (expectedMD !== (dh[2] + '月' + dh[3] + '日')) {
          addError(lineNo, '第' + dayNo + '天日期应为 ' + expectedMD + '（年份取计划开始日期）');
        }
        currentDay = expected;
        if (!trip.days[currentDay]) trip.days[currentDay] = [];
        lastItem = null;
        continue;
      }
      // 注意事项条目
      if (notesMode) {
        if (line.indexOf('- ') === 0 || line === '-') {
          var noteBody = line.slice(1).trim();
          var idx = noteBody.indexOf('：');
          var note = idx >= 0
            ? { title: noteBody.slice(0, idx).trim(), body: noteBody.slice(idx + 1).trim() }
            : { title: noteBody, body: '' };
          trip.notes.push(note);
          continue;
        }
        addError(lineNo, '注意事项条目应以「- 标题：正文」开头');
        continue;
      }
      // 无事项占位
      if (/^（无事项/.test(line)) continue;
      // 事项行
      var im = line.match(ITEM_RE);
      if (im) {
        var start = im[1], end = im[2];
        if (!V.isTimeRangeValid(start, end)) {
          addError(lineNo, '时间段非法（结束须晚于开始，HH:mm 格式）');
        }
        if (!currentDay) { addError(lineNo, '事项行前缺少天区块标题'); continue; }
        lastItem = { id: Store.uid('e'), start: start, end: end, title: decodeEntities(im[3].trim()), location: '', intro: '', remark: '' };
        trip.days[currentDay].push(lastItem);
        continue;
      }
      // 事项附属行
      if (line.indexOf('地点：') === 0 || line.indexOf('介绍：') === 0 || line.indexOf('备注：') === 0) {
        if (!lastItem) { addError(lineNo, '「' + line.slice(0, 3) + '」前缺少对应事项'); continue; }
        var val = decodeEntities(line.slice(3).trim());
        if (line.indexOf('地点：') === 0) lastItem.location = val;
        else if (line.indexOf('介绍：') === 0) lastItem.intro = val;
        else lastItem.remark = val;
        continue;
      }
      // 花销行（关联当前事项）：单条「花销：150元（门票）或 花销：150元（无标题）」或多条「花销：A元（标题1）+B元 = 总和」
      if (line.indexOf('花销：') === 0) {
        if (!lastItem || !lastItem.id) { addError(lineNo, '花销行前缺少对应事项'); continue; }
        var rawExp = decodeEntities(line.slice('花销：'.length).trim());
        var eqIdx = rawExp.indexOf('=');
        if (eqIdx >= 0) rawExp = rawExp.slice(0, eqIdx).trim(); // 切除「= 总和」部分，避免被当作花销项
        var segRe = /(\d+(?:\.\d{1,2})?)元（([^（）]*)）|(\d+(?:\.\d{1,2})?)元/g;
        var segMatch, segs = [], segBad = false;
        while ((segMatch = segRe.exec(rawExp)) !== null) {
          var segCents = M.parseAmountToCents(segMatch[1] || segMatch[3]);
          if (segCents === null) { segBad = true; break; }
          segs.push({ title: segMatch[2] != null ? segMatch[2].trim() : '', cents: segCents });
        }
        if (!segs.length) { addError(lineNo, '花销行格式应为「花销：金额元（标题）」（多条用 + 连接）'); continue; }
        if (segBad) { addError(lineNo, '花销金额格式不正确（非负数字，最多两位小数）'); continue; }
        segs.forEach(function (seg) {
          trip.expenses.push({
            day: currentDay, title: seg.title, amount: seg.cents,
            remark: '', itemId: lastItem.id, time: D.fmtTime(new Date()), createdAt: Date.now()
          });
        });
        continue;
      }
      addError(lineNo, '无法识别的行：' + line);
    }

    // 完整性校验
    if (!sawHeader) addError(1, '缺少【旅游计划】标题行');
    if (!sawDates) addError(1, '缺少【起止日期】行');
    if (!trip.startDate || !trip.endDate) {
      // 起止日期缺失时无法继续
      return { trip: trip, errors: errors, ok: false };
    }
    // 补齐范围内所有天的空数组
    D.dateList(trip.startDate, trip.endDate).forEach(function (d) {
      if (!trip.days[d]) trip.days[d] = [];
    });
    var hasFatal = errors.some(function (e) {
      return e.message.indexOf('缺少【起止日期】') === 0 || e.message.indexOf('缺少【旅游计划】') === 0;
    });
    return { trip: trip, errors: errors, ok: !hasFatal };
  }

  return {
    exportTripToText: exportTripToText,
    parseTripFromText: parseTripFromText
  };
});
