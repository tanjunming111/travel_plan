/**
 * storage.js — 数据层：localStorage 读写、日期工具、重叠校验、排序、改期整体平移
 * 浏览器环境暴露全局 TP.Storage；Node 环境 module.exports
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.TP = root.TP || {}; root.TP.Storage = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KEY = 'travel-planner:v1';
  var WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  var DateUtils = {
    /** Date → 'YYYY-MM-DD' */
    toDateStr: function (d) {
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    },
    /** 'YYYY-MM-DD' → 本地 Date（避免 UTC 偏移） */
    parseDate: function (s) {
      var p = String(s).split('-');
      return new Date(+p[0], +p[1] - 1, +p[2]);
    },
    addDays: function (dateStr, n) {
      var d = DateUtils.parseDate(dateStr);
      d.setDate(d.getDate() + n);
      return DateUtils.toDateStr(d);
    },
    /** [start, end] 逐日日期列表 */
    dateList: function (start, end) {
      var out = [], cur = start;
      while (cur <= end) { out.push(cur); cur = DateUtils.addDays(cur, 1); }
      return out;
    },
    fmtMD: function (dateStr) { var p = dateStr.split('-'); return p[1] + '月' + p[2] + '日'; },
    fmtShort: function (dateStr) { var p = dateStr.split('-'); return p[1] + '-' + p[2]; },
    weekday: function (dateStr) { return '星期' + WEEKDAYS[DateUtils.parseDate(dateStr).getDay()]; },
    today: function () { return DateUtils.toDateStr(new Date()); },
    daysBetween: function (start, end) { return DateUtils.dateList(start, end).length; },
    /** Date / 时间戳 → 'HH:mm' */
    fmtTime: function (d) {
      if (typeof d === 'number') d = new Date(d);
      return pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
  };

  var Validation = {
    TIME_RE: /^([01]\d|2[0-3]):[0-5]\d$/,
    isTime: function (t) { return Validation.TIME_RE.test(t || ''); },
    /** 时间段合法：均为 HH:mm 且 结束 > 开始 */
    isTimeRangeValid: function (start, end) {
      return Validation.isTime(start) && Validation.isTime(end) && end > start;
    },
    /** 开区间重叠：新开始 < 旧结束 且 新结束 > 旧开始；首尾相接视为不重叠 */
    overlaps: function (ns, ne, os, oe) { return ns < oe && ne > os; },
    /** 与 items 中（排除 excludeId）任一项重叠则返回该项，否则 null */
    findConflict: function (items, start, end, excludeId) {
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (excludeId && it.id === excludeId) continue;
        if (Validation.overlaps(start, end, it.start, it.end)) return it;
      }
      return null;
    },
    /** 按起始时间升序；起止相同按创建先后 */
    sortItems: function (items) {
      return items.slice().sort(function (a, b) {
        if (a.start !== b.start) return a.start < b.start ? -1 : 1;
        var ac = a.createdAt || 0, bc = b.createdAt || 0;
        if (ac !== bc) return ac - bc;
        return a.id < b.id ? -1 : 1;
      });
    },
    /** 花销项按时间（HH:mm）升序；同时间按创建先后 */
    sortExpenses: function (list) {
      return (list || []).slice().sort(function (a, b) {
        if ((a.time || '') !== (b.time || '')) return (a.time || '') < (b.time || '') ? -1 : 1;
        var ac = a.createdAt || 0, bc = b.createdAt || 0;
        if (ac !== bc) return ac - bc;
        return a.id < b.id ? -1 : 1;
      });
    }
  };

  /**
   * Money — 花销金额工具。
   * 内部一律用「分」（整数）存储与求和，避免 JS 浮点精度问题（0.1+0.2≠0.3）。
   * 显示时 formatCents 转回元并去掉多余的 0（12.50 → 12.5）。
   */
  var Money = {
    MAX_CENTS: 99999999, // 上限 999999.99 元
    /**
     * 解析金额字符串为分；非法/为空/超上限返回 null。
     * 允许：非负整数或最多两位小数，如 '12.5' '0' '199.90'（'12.'、'.5'、'-1'、'1.234' 非法）
     */
    parseAmountToCents: function (v) {
      var s = String(v == null ? '' : v).trim();
      if (!s) return null;
      if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
      var p = s.split('.');
      var yuan = parseInt(p[0], 10);
      var cents = yuan * 100 + (p[1] ? parseInt(p[1] + '0'.slice(0, 2 - p[1].length), 10) : 0);
      if (cents > Money.MAX_CENTS) return null;
      return cents;
    },
    /** 分 → 元字符串，去掉多余 0：1250→'12.5' 1200→'12' 1255→'12.55' 0→'0' 1005→'10.05' */
    formatCents: function (c) {
      c = Math.round(Number(c) || 0);
      var y = Math.floor(c / 100), f = c % 100;
      if (f === 0) return String(y);
      if (f % 10 === 0) return y + '.' + (f / 10);
      return y + '.' + (f < 10 ? '0' + f : '' + f);
    },
    /** 分 → 「X元」文案 */
    yuanText: function (c) { return Money.formatCents(c) + '元'; },
    /** 分数组求和（整数运算，无浮点误差） */
    sumCents: function (list) {
      var s = 0;
      (list || []).forEach(function (e) { s += (e && e.amount) || 0; });
      return s;
    }
  };

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  var Store = {
    KEY: KEY,
    load: function () {
      try {
        var raw = localStorage.getItem(KEY);
        if (!raw) return [];
        var data = JSON.parse(raw);
        var trips = null;
        if (data && Array.isArray(data.trips)) trips = data.trips;
        else if (Array.isArray(data)) trips = data; // 兼容裸数组旧数据
        if (trips) {
          // 旧数据兼容：缺 expenses 字段的计划补空数组；花销项缺 time 时补齐
          // （事项来源取事项开始时间，独立项取创建时刻）
          trips.forEach(function (t) {
            if (!Array.isArray(t.expenses)) { t.expenses = []; return; }
            t.expenses.forEach(function (e) {
              if (e.time) return;
              if (e.itemId) {
                var found = '';
                Object.keys(t.days || {}).forEach(function (d) {
                  (t.days[d] || []).forEach(function (it) {
                    if (it.id === e.itemId && !found) found = it.start;
                  });
                });
                e.time = found || '00:00';
              } else {
                e.time = DateUtils.fmtTime(e.createdAt || Date.now());
              }
            });
          });
          return trips;
        }
      } catch (e) { /* 数据损坏则视为空 */ }
      return [];
    },
    save: function (trips) {
      try { localStorage.setItem(KEY, JSON.stringify({ version: 1, trips: trips })); }
      catch (e) { /* 存储满等异常忽略 */ }
    },
    uid: uid,
    getTrip: function (trips, id) {
      for (var i = 0; i < trips.length; i++) if (trips[i].id === id) return trips[i];
      return null;
    },
    createTrip: function (name, startDate, endDate) {
      var now = Date.now();
      var days = {};
      DateUtils.dateList(startDate, endDate).forEach(function (d) { days[d] = []; });
      return {
        id: uid('trip'), name: name || '', startDate: startDate, endDate: endDate,
        notes: [], days: days, expenses: [], createdAt: now, updatedAt: now
      };
    },
    newNote: function (title, body) {
      return { id: uid('n'), title: title || '', body: body || '', createdAt: Date.now() };
    },
    newItem: function (start, end, title, location) {
      return {
        id: uid('e'), start: start, end: end, title: title || '',
        location: location || '', intro: '', remark: '', createdAt: Date.now()
      };
    },
    /**
     * 新建花销项。amount 单位为「分」（整数）。
     * itemId 可选：来自某个事项时记录（用于联动删除/清空），spend 页独立添加时省略。
     * remark 可选：仅 spend 页独立/编辑花销时使用（事项来源的花销不继承事项备注）。
     * time 为 HH:mm：事项来源=事项开始时间；独立添加=添加时刻；导入=导入时刻。
     */
    newExpense: function (day, title, amountCents, itemId, remark, time) {
      return {
        id: uid('x'), day: day, title: title || '', amount: amountCents || 0,
        remark: remark || '', itemId: itemId || '', time: time || '', createdAt: Date.now()
      };
    },
    /** 按 id 查找计划内花销项 */
    findExpense: function (trip, id) {
      if (!trip || !trip.expenses) return null;
      for (var i = 0; i < trip.expenses.length; i++) if (trip.expenses[i].id === id) return trip.expenses[i];
      return null;
    },
    defaultName: function (startDate, endDate) {
      return startDate + ' 至 ' + endDate + ' 旅行';
    },
    /**
     * 修改起止日期：事项内容整体平移（第 N 天跟随新日期）。
     * 花销联动：带 itemId 的花销项按日索引随事项平移；独立花销项（无 itemId）留在原日期；
     * 原日期被移除（尾部压缩）的所有花销项删除。
     * 返回 { trip: 新计划对象, removedDays: 被移除的天, removedExpenses: 被删除的花销项 }
     */
    shiftDates: function (trip, newStart, newEnd) {
      var oldList = DateUtils.dateList(trip.startDate, trip.endDate);
      var newList = DateUtils.dateList(newStart, newEnd);
      var newDays = {};
      newList.forEach(function (d, i) {
        newDays[d] = i < oldList.length ? (trip.days[oldList[i]] || []).slice() : [];
      });
      var removedDays = oldList.slice(newList.length);
      var removedMap = {};
      removedDays.forEach(function (d) { removedMap[d] = true; });
      var dayIndex = {};
      oldList.forEach(function (d, i) { dayIndex[d] = i; });
      var oldExp = trip.expenses || [];
      var newExp = [], removedExpenses = [];
      oldExp.forEach(function (e) {
        if (removedMap[e.day]) { removedExpenses.push(e); return; } // 日期被压缩掉 → 花销删除
        if (e.itemId) {
          var idx = dayIndex[e.day];
          if (idx != null && idx < newList.length) {
            newExp.push(Object.assign({}, e, { day: newList[idx] })); // 随事项平移
          } else {
            removedExpenses.push(e); // 保险：找不到映射则删除
          }
        } else {
          newExp.push(Object.assign({}, e)); // 独立花销项留在原日期
        }
      });
      return {
        trip: Object.assign({}, trip, {
          startDate: newStart, endDate: newEnd, days: newDays, expenses: newExp, updatedAt: Date.now()
        }),
        removedDays: removedDays,
        removedExpenses: removedExpenses
      };
    }
  };

  return { DateUtils: DateUtils, Validation: Validation, Money: Money, Store: Store };
});
