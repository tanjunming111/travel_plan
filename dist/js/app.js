/**
 * app.js — 界面与交互（依赖 storage.js / format.js / word.js）
 */
(function () {
  'use strict';

  var Storage = TP.Storage, Format = TP.Format, Word = TP.Word;
  var D = Storage.DateUtils, V = Storage.Validation, Store = Storage.Store, Money = Storage.Money;

  var state = { trips: [], tripId: null, date: null, spendDate: null, preview: false };
  var isPlanPage = !!document.getElementById('plan-app');
  var isSpendPage = !!document.getElementById('spend-app');
  var modalStack = [];

  /* ============================ 工具 ============================ */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    // 多个顶层节点时返回 DocumentFragment（否则 appendChild 会丢失其余节点）
    if (t.content.children.length === 1) return t.content.firstChild;
    return t.content;
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function toast(msg) {
    var t = el('<div class="toast"></div>');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }

  /** 时间归一化：'9:0' → '09:00'；非法返回空串 */
  function normTime(v) {
    var m = String(v || '').trim().match(/^(\d{1,2}):(\d{1,2})$/);
    if (!m) return '';
    var h = +m[1], min = +m[2];
    if (h > 23 || min > 59) return '';
    return (h < 10 ? '0' + h : '' + h) + ':' + (min < 10 ? '0' + min : '' + min);
  }
  /** 时间输入控件：时:分 两个数字文本框（AA:BB），用户只需输入数字 */
  function timePartsHtml(prefix, val, hourPh) {
    var h = '', m = '';
    if (val) { var p = String(val).split(':'); h = p[0]; m = p[1]; }
    return '<div class="time-parts">' +
      '<input type="text" class="input time-part" id="' + prefix + '-h" inputmode="numeric" maxlength="2" placeholder="' + (hourPh || '09') + '" value="' + esc(h) + '">' +
      '<span class="time-colon">:</span>' +
      '<input type="text" class="input time-part" id="' + prefix + '-m" inputmode="numeric" maxlength="2" placeholder="00" value="' + esc(m) + '">' +
    '</div>';
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; });
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return Promise.resolve(ok);
  }

  function downloadBlob(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ============================ 弹窗 ============================ */
  function openModal(opts) {
    var overlay = el(
      '<div class="modal-overlay"><div class="modal' + (opts.wide ? ' wide' : '') + '">' +
        '<div class="modal-head"><h3></h3><button class="modal-close" type="button">×</button></div>' +
        '<div class="modal-body"></div>' +
        '<div class="modal-foot"></div>' +
      '</div></div>'
    );
    $('.modal-head h3', overlay).textContent = opts.title || '';
    var bodyEl = $('.modal-body', overlay);
    if (typeof opts.body === 'string') bodyEl.innerHTML = opts.body;
    else if (opts.body) bodyEl.appendChild(opts.body);
    var footEl = $('.modal-foot', overlay);
    (opts.actions || []).forEach(function (act) {
      var b = el('<button class="btn" type="button"></button>');
      b.textContent = act.text || '';
      if (act.cls) b.className = 'btn ' + act.cls;
      b.addEventListener('click', function () { act.onClick && act.onClick(b); });
      footEl.appendChild(b);
    });
    if (opts.noClose !== true) {
      $('.modal-close', overlay).addEventListener('click', function () { closeModal(overlay); });
      overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) closeModal(overlay); });
    } else {
      $('.modal-close', overlay).style.display = 'none';
    }
    $('#modal-root').appendChild(overlay);
    modalStack.push(overlay);
    var first = $('input, textarea, select', overlay);
    if (first) setTimeout(function () { first.focus(); }, 30);
    return overlay;
  }

  function closeModal(overlay) {
    if (overlay) { overlay.remove(); modalStack = modalStack.filter(function (o) { return o !== overlay; }); }
    else { var o = modalStack.pop(); if (o) o.remove(); }
  }

  function confirmDialog(title, messageHTML, confirmText, danger) {
    return new Promise(function (resolve) {
      var modal = openModal({
        title: title,
        body: '<div class="confirm-text">' + messageHTML + '</div>',
        actions: [
          { text: '取消', cls: 'btn-ghost', onClick: function () { closeModal(modal); resolve(false); } },
          { text: confirmText || '确认', cls: danger ? 'btn-danger' : 'btn-primary', onClick: function () { closeModal(modal); resolve(true); } }
        ]
      });
    });
  }

  /* ============================ 数据持久化 ============================ */
  function save() { Store.save(state.trips); }
  function currentTrip() { return Store.getTrip(state.trips, state.tripId); }

  /* ============================ 渲染 ============================ */
  function containerEl() {
    if (isSpendPage) return $('#spend-app');
    return isPlanPage ? $('#plan-app') : $('#app');
  }

  function render() {
    if (isSpendPage) {
      var sp = currentTrip();
      if (!sp) { location.href = 'index.html'; return; }
      renderSpend(sp);
    } else if (isPlanPage) {
      var trip = currentTrip();
      if (!trip) { location.href = 'index.html'; return; }
      renderDetail(trip);
    } else {
      renderList();
    }
  }

  /** 计划内花销项（全部），缺省为空数组 */
  function tripExpenses(trip) { return (trip && trip.expenses) || []; }

  /**
   * 花销项在 spend 页的显示标题：
   * 关联事项（有 itemId）：标题非空 →「事项标题 - 花销标题」；标题空 →「事项标题」；
   * 独立花销（无 itemId）：自身标题（可空）。
   */
  function spendDisplayTitle(trip, e) {
    if (!e.itemId) return (e.title || '').trim() || '（无标题）';
    var itTitle = '';
    var items = (trip && trip.days && trip.days[e.day]) || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === e.itemId) { itTitle = items[i].title || ''; break; }
    }
    var t = (e.title || '').trim();
    if (itTitle && t) return itTitle + ' - ' + t;
    return itTitle || t || '（无标题）';
  }

  function defaultTripName(trip) { return trip.name || Store.defaultName(trip.startDate, trip.endDate); }

  /* ---------- 列表页 ---------- */
  function renderList() {
    var trips = state.trips.slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
    var html = '';
    html += '<div class="page-head"><div class="page-title">与友行 · 旅行规划<span class="sub">和好友结伴，规划好每一次出发</span></div>' +
            '<div class="head-actions">' +
              '<button class="btn btn-danger" data-action="clear-all">一键清空</button>' +
              '<button class="btn btn-soft" data-action="open-import">导入计划</button>' +
              '<button class="btn btn-primary" data-action="create-trip">＋ 新增计划</button>' +
            '</div></div>';
    if (!trips.length) {
      html += '<div class="empty-state"><h3>还没有任何旅游计划</h3>' +
              '<p>选择起始日期和终止日期，创建你的第一个旅行计划吧</p>' +
              '<button class="btn btn-primary btn-lg" data-action="create-trip">＋ 新增计划</button></div>';
    } else {
      html += '<div class="trip-list">';
      trips.forEach(function (t) {
        var n = D.daysBetween(t.startDate, t.endDate);
        var up = new Date(t.updatedAt || t.createdAt);
        html += '<div class="trip-card" data-action="open-trip" data-id="' + esc(t.id) + '">' +
          '<div class="trip-main">' +
            '<div class="trip-name">' + esc(defaultTripName(t)) + '</div>' +
            '<div class="trip-meta">' +
              '<span>' + esc(t.startDate) + ' ~ ' + esc(t.endDate) + '</span>' +
              '<span class="badge-days">共 ' + n + ' 天</span>' +
              '<span>更新于 ' + esc(up.toLocaleString('zh-CN')) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="trip-actions">' +
            '<button class="btn btn-ghost btn-sm" data-action="preview-trip" data-id="' + esc(t.id) + '">预览</button>' +
            '<button class="btn btn-soft btn-sm" data-action="del-trip" data-id="' + esc(t.id) + '">删除</button>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
    }
    containerEl().innerHTML = html;
  }

  /* 默认选中日期：计划覆盖今天则今天，否则第一天 */
  function defaultDay(dates) {
    var t = D.today();
    return dates.indexOf(t) >= 0 ? t : dates[0];
  }

  /* ---------- 详情页 ---------- */
  function renderDetail(trip) {
    var dates = D.dateList(trip.startDate, trip.endDate);
    if (!state.date || dates.indexOf(state.date) < 0) state.date = defaultDay(dates);
    var idx = dates.indexOf(state.date);
    var isPreview = !!state.preview;

    var html = '';
    html += '<div class="back-bar"><button class="btn btn-ghost btn-sm" data-action="back">← 返回计划列表</button></div>';
    // 头部
    var totalCents = Money.sumCents(tripExpenses(trip));
    html += '<div class="detail-header">' +
      '<div class="name-row">' +
        '<span class="name">' + esc(defaultTripName(trip)) + '</span>' +
        (isPreview ? '' : '<span class="edit-hint" data-action="rename-trip">重命名</span>') +
      '</div>' +
      '<div class="dates' + (isPreview ? '' : '" data-action="edit-dates') + '">' + esc(trip.startDate) + ' ~ ' + esc(trip.endDate) +
        ' · 共 ' + dates.length + ' 天' + (isPreview ? '' : '（点击修改）') + '</div>' +
      '<div class="spend-summary">总花销：<b>' + Money.yuanText(totalCents) + '</b>' +
        '<span class="spend-link" data-action="open-spend">（查看详情）</span></div>' +
      '<div class="actions">' +
        '<button class="btn btn-soft" data-action="export-text">导出文字</button>' +
        '<button class="btn btn-soft" data-action="export-word">导出 Word</button>' +
        (isPreview ? '' : '<button class="btn btn-danger" data-action="delete-trip">删除计划</button>') +
      '</div>' +
    '</div>';

    // 注意事项
    html += '<div class="notes-panel" id="notes-panel">' +
      '<div class="panel-head" data-action="toggle-notes">' +
        '<h3>注意事项<span class="arrow">▼</span></h3>' +
        (isPreview ? '' : '<button class="btn btn-primary btn-sm" data-action="add-note">＋ 添加</button>') +
      '</div>' +
      '<div class="notes-body">';
    if (trip.notes && trip.notes.length) {
      html += '<div class="notes-list">';
      trip.notes.forEach(function (n) {
        html += '<div class="note-item">' +
          '<div class="note-main">' +
            '<div class="note-title">' + esc(n.title || '（无标题）') + '</div>' +
            (n.body ? '<div class="note-body">' + esc(n.body) + '</div>' : '') +
          '</div>' +
          (isPreview ? '' :
            '<div class="note-actions">' +
              '<button class="btn btn-ghost btn-sm" data-action="edit-note" data-id="' + esc(n.id) + '">编辑</button>' +
              '<button class="btn btn-danger btn-sm" data-action="del-note" data-id="' + esc(n.id) + '">删除</button>' +
            '</div>') +
        '</div>';
      });
      html += '</div>';
    } else {
      html += '<div class="notes-empty">还没有注意事项，可添加需带物品、天气提醒等</div>';
    }
    html += '</div></div>';

    // 天数导航
    html += '<div class="day-tabs">';
    dates.forEach(function (d, i) {
      html += '<div class="day-tab' + (d === state.date ? ' active' : '') + '" data-action="select-day" data-date="' + esc(d) + '">' +
        '<span class="d-no">第' + (i + 1) + '天</span><span class="d-date">' + D.fmtShort(d) + '</span></div>';
    });
    html += '</div>';

    // 当天事项
    var items = V.sortItems(trip.days[state.date] || []);
    var dayExpenses = tripExpenses(trip).filter(function (e) { return e.day === state.date; });
    var dayTotal = Money.sumCents(dayExpenses);
    html += '<div class="day-panel">' +
      '<div class="day-panel-head"><h3>' + D.fmtMD(state.date) + ' ' + D.weekday(state.date) +
        '<span class="week">' + items.length + ' 个事项' +
        (dayTotal > 0 ? ' · 今日花销：' + Money.yuanText(dayTotal) : '') + '</span></h3>' +
        (isPreview ? '' :
          '<div class="day-actions">' +
            '<button class="btn btn-danger btn-sm" data-action="clear-day">一键删除</button>' +
            '<button class="btn btn-primary btn-sm" data-action="add-item">＋ 新增事项</button>' +
          '</div>') +
      '</div>';
    if (!items.length) {
      html += '<div class="day-empty">这一天还没有安排，点击「新增事项」开始规划</div>';
    } else {
      html += '<div class="timeline">';
      items.forEach(function (it) {
        var hasDetail = it.intro || it.remark;
        var itemExps = tripExpenses(trip).filter(function (e) { return e.itemId === it.id; });
        var itemExpTotal = Money.sumCents(itemExps);
        html += '<div class="item-card">' +
          '<div class="item-top">' +
            '<div class="item-time">' + esc(it.start) + '–' + esc(it.end) + '</div>' +
            '<div class="item-body">' +
              '<div class="item-title">' + esc(it.title || '（未命名事项）') + '</div>' +
              (it.location ? '<div class="item-location">' + esc(it.location) + '</div>' : '') +
              (itemExps.length ? '<div class="item-spend">花销：' + Money.yuanText(itemExpTotal) + '</div>' : '') +
            '</div>' +
            (isPreview ? '' :
              '<div class="item-actions">' +
                '<button class="btn btn-soft btn-sm" data-action="add-after" data-id="' + esc(it.id) + '">在其后添加</button>' +
                '<button class="btn btn-ghost btn-sm" data-action="edit-item" data-id="' + esc(it.id) + '">编辑</button>' +
                '<button class="btn btn-danger btn-sm" data-action="del-item" data-id="' + esc(it.id) + '">删除</button>' +
              '</div>') +
          '</div>' +
          (hasDetail
            ? '<details class="item-detail"><summary style="cursor:pointer;font-size:12.5px;color:var(--text-3)">详情</summary>' +
                (it.intro ? '<div class="dl"><b>介绍：</b>' + esc(it.intro) + '</div>' : '') +
                (it.remark ? '<div class="dl"><b>备注：</b>' + esc(it.remark) + '</div>' : '') +
              '</details>'
            : '') +
        '</div>';
      });
      html += '</div>';
    }
    html += '</div>';

    containerEl().innerHTML = html;
    var panel = $('#notes-panel');
    if (panel && localStorage.getItem('notes-collapsed:' + trip.id) === '1') panel.classList.add('collapsed');
  }

  /* ============================ 事件委托 ============================ */
  document.addEventListener('click', function (e) {
    var target = e.target.closest('[data-action]');
    if (!target) return;
    var action = target.getAttribute('data-action');
    var id = target.getAttribute('data-id');
    var date = target.getAttribute('data-date');
    switch (action) {
      case 'create-trip': openCreateTripModal(); break;
      case 'clear-all': openClearAllModal(); break;
      case 'open-trip': location.href = 'plan.html?id=' + encodeURIComponent(id); break;
      case 'preview-trip': location.href = 'plan.html?id=' + encodeURIComponent(id) + '&preview=1'; break;
      case 'del-trip': onDeleteTrip(id); break;
      case 'back': location.href = 'index.html'; break;
      case 'open-spend': location.href = 'spend.html?id=' + encodeURIComponent(state.tripId) + (state.preview ? '&preview=1' : ''); break;
      case 'spend-back': location.href = 'plan.html?id=' + encodeURIComponent(state.tripId) + (state.preview ? '&preview=1' : ''); break;
      case 'spend-add': openExpenseModal(); break;
      case 'spend-edit': openExpenseModal(id); break;
      case 'spend-del': onDeleteExpense(id); break;
      case 'export-spend': onExportSpendText(); break;
      case 'rename-trip': openRenameModal(); break;
      case 'edit-dates': openEditDatesModal(); break;
      case 'export-text': onExportText(); break;
      case 'export-word': onExportWord(); break;
      case 'open-import': openImportModal(); break;
      case 'delete-trip': onDeleteTrip(state.tripId); break;
      case 'toggle-notes': {
        var p = $('#notes-panel');
        var trip = currentTrip();
        if (p) {
          p.classList.toggle('collapsed');
          if (trip) localStorage.setItem('notes-collapsed:' + trip.id, p.classList.contains('collapsed') ? '1' : '0');
        }
        break;
      }
      case 'add-note': openNoteModal(); break;
      case 'edit-note': openNoteModal(id); break;
      case 'del-note': onDeleteNote(id); break;
      case 'select-day': state.date = date; render(); break;
      case 'add-item': openItemModal('free'); break;
      case 'clear-day': onClearDay(); break;
      case 'add-after': openItemModal('after', id); break;
      case 'edit-item': openItemModal('edit', id); break;
      case 'del-item': onDeleteItem(id); break;
    }
  });

  /* ============================ 计划操作 ============================ */
  function openCreateTripModal() {
    var today = D.today();
    var body = el(
      '<div class="form-row"><label>旅游地点（选填）</label><input type="text" class="input" id="f-dest" placeholder="如：北京。填写后计划默认名称将设为「{地点}之旅」"></div>' +
      '<div class="form-row"><label>起始日期</label><input type="date" class="input" id="f-start" value="' + today + '"></div>' +
      '<div class="form-row"><label>终止日期</label><input type="date" class="input" id="f-end" value="' + today + '"></div>' +
      '<div class="hint">允许选择过去的日期（可补录过往行程）；结束日期不能早于开始日期</div>'
    );
    var modal = openModal({
      title: '新增旅游计划',
      body: body,
      actions: [
        { text: '取消', cls: 'btn-ghost', onClick: function () { closeModal(modal); } },
        { text: '创建', cls: 'btn-primary', onClick: function () {
          var s = $('#f-start', modal).value, e = $('#f-end', modal).value;
          if (!s || !e) { toast('请选择起止日期'); return; }
          if (e < s) { toast('终止日期不能早于起始日期'); return; }
          var dest = $('#f-dest', modal).value.trim();
          var name = dest ? dest + '之旅' : Store.defaultName(s, e);
          var trip = Store.createTrip(name, s, e);
          state.trips.push(trip);
          save();
          closeModal(modal);
          location.href = 'plan.html?id=' + encodeURIComponent(trip.id);
        } }
      ]
    });
  }

  function openRenameModal() {
    var trip = currentTrip(); if (!trip) return;
    var body = el('<div class="form-row"><label>计划名称</label><input type="text" class="input" id="f-name" value="' + esc(trip.name) + '" placeholder="留空则使用默认名称"></div>');
    var modal = openModal({
      title: '重命名计划',
      body: body,
      actions: [
        { text: '取消', cls: 'btn-ghost', onClick: function () { closeModal(modal); } },
        { text: '保存', cls: 'btn-primary', onClick: function () {
          var name = $('#f-name', modal).value.trim();
          trip.name = name;
          trip.updatedAt = Date.now();
          save(); closeModal(modal); render();
        } }
      ]
    });
  }

  function openEditDatesModal() {
    var trip = currentTrip(); if (!trip) return;
    var body = el(
      '<div class="form-row"><label>起始日期</label><input type="date" class="input" id="f-start" value="' + esc(trip.startDate) + '"></div>' +
      '<div class="form-row"><label>终止日期</label><input type="date" class="input" id="f-end" value="' + esc(trip.endDate) + '"></div>' +
      '<div class="hint">修改日期后，事项内容将整体平移：第 N 天的安排跟随新日期；若新范围天数变少，末尾多出的天数内容将被删除</div>'
    );
    var modal = openModal({
      title: '修改起止日期',
      body: body,
      actions: [
        { text: '取消', cls: 'btn-ghost', onClick: function () { closeModal(modal); } },
        { text: '保存', cls: 'btn-primary', onClick: function () {
          var s = $('#f-start', modal).value, e = $('#f-end', modal).value;
          if (!s || !e) { toast('请选择起止日期'); return; }
          if (e < s) { toast('终止日期不能早于起始日期'); return; }
          var result = Store.shiftDates(trip, s, e);
          if (result.removedDays.length) {
            var removedExpByDay = {};
            (result.removedExpenses || []).forEach(function (ex) { removedExpByDay[ex.day] = (removedExpByDay[ex.day] || 0) + 1; });
            var list = result.removedDays.map(function (d) {
              var expN = removedExpByDay[d] || 0;
              return '· ' + d + '（' + ((trip.days[d] || []).length) + ' 个事项' + (expN ? '、' + expN + ' 项花销' : '') + '将被删除）';
            }).join('<br>');
            confirmDialog('天数减少，将删除以下内容', list + '<div class="hint">确认后这些天的安排将被删除，不可恢复。</div>', '确认删除', true).then(function (ok) {
              if (!ok) return;
              applyShift(result.trip);
              closeModal(modal);
            });
          } else {
            applyShift(result.trip);
            closeModal(modal);
          }
        } }
      ]
    });
  }

  function applyShift(newTrip) {
    for (var i = 0; i < state.trips.length; i++) {
      if (state.trips[i].id === newTrip.id) { state.trips[i] = newTrip; break; }
    }
    save();
    state.date = newTrip.startDate;
    render();
    toast('日期已更新');
  }

  function onDeleteTrip(id) {
    var trip = Store.getTrip(state.trips, id); if (!trip) return;
    var name = defaultTripName(trip);
    confirmDialog('删除旅游计划', '确定删除「' + esc(name) + '」吗？<br><b>该计划及其全部事项、注意事项等都将被删除，此操作不可恢复。</b>', '确认删除', true).then(function (ok) {
      if (!ok) return;
      var wasCurrent = state.tripId === id;
      state.trips = state.trips.filter(function (t) { return t.id !== id; });
      save();
      if (wasCurrent) { location.href = 'index.html'; return; }
      render();
      toast('计划已删除');
    });
  }

  /* ============================ 一键清空 ============================ */
  function openClearAllModal() {
    if (!state.trips.length) { toast('当前没有任何计划可清空'); return; }
    // 随机 6 位验证码，首位不为 0（100000 ~ 999999）
    var code = String(Math.floor(Math.random() * 900000) + 100000);
    var body = el(
      '<div class="confirm-text">此操作将<strong>永久删除全部 ' + state.trips.length + ' 个旅游计划</strong>（含所有事项与注意事项），<b>不可恢复</b>。</div>' +
      '<div class="clear-code">请输入验证码 <b>' + code + '</b> 以确认清空：</div>' +
      '<input type="text" class="input" id="f-code" maxlength="6" inputmode="numeric" autocomplete="off" placeholder="输入上方 6 位数字">' +
      '<div class="clear-error" id="code-error" style="display:none">验证码不正确，请重新输入</div>'
    );
    var modal = openModal({
      title: '一键清空所有计划',
      body: body,
      actions: [
        { text: '取消', cls: 'btn-ghost', onClick: function () { closeModal(modal); } },
        { text: '确认清空', cls: 'btn-danger', onClick: confirmClear }
      ]
    });
    var input = $('#f-code', modal);
    input.addEventListener('input', function () { $('#code-error', modal).style.display = 'none'; });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') confirmClear(); });
    function confirmClear() {
      if (input.value.trim() !== code) {
        $('#code-error', modal).style.display = 'block';
        return;
      }
      state.trips = []; state.tripId = null; state.date = null; state.preview = false;
      save(); closeModal(modal); render();
      toast('已清空全部计划');
    }
  }

  /* ============================ 注意事项 ============================ */
  function openNoteModal(noteId) {
    var trip = currentTrip(); if (!trip) return;
    var note = null;
    if (noteId) {
      for (var i = 0; i < trip.notes.length; i++) if (trip.notes[i].id === noteId) { note = trip.notes[i]; break; }
    }
    var body = el(
      '<div class="form-row"><label>标题 <span class="req">*</span></label><input type="text" class="input" id="f-title" value="' + esc(note ? note.title : '') + '" placeholder="如：需带物品 / 天气提醒"></div>' +
      '<div class="form-row"><label>正文</label><textarea class="textarea" id="f-body" placeholder="填写具体内容">' + esc(note ? note.body : '') + '</textarea></div>'
    );
    var modal = openModal({
      title: note ? '编辑注意事项' : '添加注意事项',
      body: body,
      actions: [
        { text: '取消', cls: 'btn-ghost', onClick: function () { closeModal(modal); } },
        { text: '保存', cls: 'btn-primary', onClick: function () {
          var title = $('#f-title', modal).value.trim();
          var bodyText = $('#f-body', modal).value.trim();
          if (!title) { toast('请填写标题'); return; }
          if (note) { note.title = title; note.body = bodyText; }
          else trip.notes.push(Store.newNote(title, bodyText));
          trip.updatedAt = Date.now();
          save(); closeModal(modal); render();
        } }
      ]
    });
  }

  function onDeleteNote(noteId) {
    var trip = currentTrip(); if (!trip) return;
    confirmDialog('删除注意事项', '确定删除这条注意事项吗？', '确认删除', true).then(function (ok) {
      if (!ok) return;
      trip.notes = trip.notes.filter(function (n) { return n.id !== noteId; });
      trip.updatedAt = Date.now();
      save(); render();
    });
  }

  /* ============================ 事项 ============================ */
  /**
   * mode: 'free' 选择时间段添加 / 'after' 在某事项后添加 / 'edit' 编辑
   */
  function openItemModal(mode, itemId) {
    var trip = currentTrip(); if (!trip) return;
    var items = trip.days[state.date] || [];
    var item = null, prefill = { start: '', end: '', title: '', location: '' };
    if (mode === 'edit') {
      for (var i = 0; i < items.length; i++) if (items[i].id === itemId) { item = items[i]; break; }
      if (!item) return;
      prefill = { start: item.start, end: item.end, title: item.title, location: item.location };
    } else if (mode === 'after') {
      var prev = null;
      for (var j = 0; j < items.length; j++) if (items[j].id === itemId) { prev = items[j]; break; }
      if (!prev) return;
      prefill.start = prev.end; // 起始默认=前一事项结束时间，结束留空必填
    }
    // 弹窗内花销管理（一对多）：pendingExps 为 [{key, id?, titleStr, amountStr}]；id 存在=已有花销，null=新增
    var pendingExps = [];
    var expSeq = 0;
    if (item) {
      tripExpenses(trip).forEach(function (e) {
        if (e.itemId === item.id) pendingExps.push({ key: 'ek' + (++expSeq), id: e.id, titleStr: e.title, amountStr: Money.formatCents(e.amount) });
      });
    }
    var tip = mode === 'after'
      ? '<div class="hint">起始时间已默认为前一事项的结束时间，结束时间请填写（必填）</div>'
      : (mode === 'edit' ? '<div class="hint">修改时间段后将重新校验重叠</div>'
        : '<div class="hint">时间留空则使用默认时间 9:00 - 10:00</div>');
    var timeReq = mode === 'free' ? '' : '<span class="req">*</span>';
    var body = el(
      '<div class="form-row-inline">' +
        '<div><label>开始时间 ' + timeReq + '</label>' + timePartsHtml('f-start', prefill.start) + '</div>' +
        '<div><label>结束时间 ' + timeReq + '</label>' + timePartsHtml('f-end', prefill.end, mode === 'free' ? '10' : '09') + '</div>' +
      '</div>' +
      '<div class="form-row"><label>标题 <span class="req">*</span></label><input type="text" class="input" id="f-title" value="' + esc(prefill.title) + '" placeholder="如：参观故宫博物院"></div>' +
      '<div class="form-row"><label>地点（选填，可后补）</label><input type="text" class="input" id="f-loc" value="' + esc(prefill.location) + '" placeholder="如：北京市东城区景山前街 4 号"></div>' +
      '<div class="form-row toggle-row">' +
        '<label class="toggle-item"><input type="checkbox" id="f-intro-on"' + (item && item.intro ? ' checked' : '') + '> 添加介绍</label>' +
        '<label class="toggle-item"><input type="checkbox" id="f-remark-on"' + (item && item.remark ? ' checked' : '') + '> 添加备注</label>' +
      '</div>' +
      '<div class="form-row" id="f-intro-wrap" style="display:none"><label>介绍</label><textarea class="textarea" id="f-intro" placeholder="如：历史背景、特色介绍">' + esc(item ? item.intro : '') + '</textarea></div>' +
      '<div class="form-row" id="f-remark-wrap" style="display:none"><label>备注</label><textarea class="textarea" id="f-remark" placeholder="如：预约提醒、交通提示">' + esc(item ? item.remark : '') + '</textarea></div>' +
      '<div class="form-row"><label>花销（标题选填，留空用事项标题；可添加多个）</label>' +
        '<div class="exp-rows" id="exp-rows"></div>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-act="exp-add">＋ 添加花销</button>' +
        '<div class="hint">金额：非负数字，最多两位小数，上限 999999.99 元</div>' +
      '</div>' +
      tip
    );
    var modal = openModal({
      title: mode === 'edit' ? '编辑事项' : '新增事项',
      body: body,
      actions: [
        { text: '取消', cls: 'btn-ghost', onClick: function () { closeModal(modal); } },
        { text: '保存', cls: 'btn-primary', onClick: function () {
          var startH = $('#f-start-h', modal).value.trim();
          var startM = $('#f-start-m', modal).value.trim();
          var endH = $('#f-end-h', modal).value.trim();
          var endM = $('#f-end-m', modal).value.trim();
          var start = normTime(startH + ':' + (startM || '00'));
          var end = normTime(endH + ':' + (endM || '00'));
          // 新增事项（free 模式）：时间留空用默认 9:00-10:00；填写了但非法仍报错
          if (mode === 'free') {
            if (startH === '' && startM === '') start = '09:00';
            if (endH === '' && endM === '') end = '10:00';
          }
          var title = $('#f-title', modal).value.trim();
          var loc = $('#f-loc', modal).value.trim();
          var intro = $('#f-intro-on', modal).checked ? $('#f-intro', modal).value.trim() : '';
          var remark = $('#f-remark-on', modal).checked ? $('#f-remark', modal).value.trim() : '';
          // 花销校验（多花销：非空行必须为合法金额）
          var expErr = null;
          pendingExps.forEach(function (p) {
            if (expErr) return;
            var s = String(p.amountStr || '').trim();
            if (!s) return; // 空行忽略（不创建）
            if (Money.parseAmountToCents(s) === null) expErr = '花销金额格式不正确（非负数字，最多两位小数，上限 999999.99 元）';
          });
          if (expErr) { toast(expErr); return; }
          if (!start || !end) { toast('请填写开始和结束时间（格式 HH:mm）'); return; }
          if (!V.isTimeRangeValid(start, end)) { toast('时间段非法：结束时间须晚于开始时间（分钟级）'); return; }
          if (!title) { toast('请填写事项标题'); return; }
          var conflict = V.findConflict(items, start, end, item ? item.id : null);
          if (conflict) {
            toast('与「' + conflict.title + '」（' + conflict.start + '–' + conflict.end + '）时间重叠，请调整时间段');
            return;
          }
          function expCentsOf(p) {
            var s = String(p.amountStr || '').trim();
            return s ? Money.parseAmountToCents(s) : null;
          }
          function expTitleOf(p) {
            return String(p.titleStr || '').trim(); // 标题可留空（空标题）
          }
          if (item) {
            item.start = start; item.end = end; item.title = title; item.location = loc;
            item.intro = intro; item.remark = remark;
            // 花销同步（一对多）：删除被移除的行、更新已有金额/标题、新增行（时间=事项开始时间）
            var keep = {};
            pendingExps.forEach(function (p) { if (p.id) keep[p.id] = true; });
            trip.expenses = tripExpenses(trip).filter(function (x) { return !(x.itemId === item.id && !keep[x.id]); });
            pendingExps.forEach(function (p) {
              var cents = expCentsOf(p);
              if (cents === null) return;
              if (p.id) {
                var ex = Store.findExpense(trip, p.id);
                if (ex) { ex.amount = cents; ex.title = expTitleOf(p); }
              } else {
                trip.expenses.push(Store.newExpense(state.date, expTitleOf(p), cents, item.id, '', start));
              }
            });
          } else {
            var newItem = Store.newItem(start, end, title, loc);
            newItem.intro = intro; newItem.remark = remark;
            if (!trip.days[state.date]) trip.days[state.date] = [];
            trip.days[state.date].push(newItem);
            // 新增事项的花销
            pendingExps.forEach(function (p) {
              var cents = expCentsOf(p);
              if (cents === null) return;
              trip.expenses.push(Store.newExpense(state.date, expTitleOf(p), cents, newItem.id, '', start));
            });
          }
          trip.updatedAt = Date.now();
          save(); closeModal(modal); render();
          toast('已保存');
        } }
      ]
    });

    // 时/分两个输入框：小时填满 2 位后自动跳到分钟框；分钟留空失焦时补 00
    ['f-start', 'f-end'].forEach(function (pfx) {
      var hInp = $('#' + pfx + '-h', modal), mInp = $('#' + pfx + '-m', modal);
      if (hInp && mInp) {
        hInp.addEventListener('input', function () {
          if (hInp.value.replace(/\D/g, '').length >= 2) mInp.focus();
        });
        mInp.addEventListener('blur', function () {
          if (hInp.value.trim() !== '' && mInp.value.trim() === '') mInp.value = '00';
        });
      }
    });

    // 「添加介绍/备注」开关：勾选后显示对应输入框
    function bindToggle(cbId, wrapId) {
      var cb = $('#' + cbId, modal), wrap = $('#' + wrapId, modal);
      if (!cb || !wrap) return;
      function sync() { wrap.style.display = cb.checked ? '' : 'none'; }
      cb.addEventListener('change', sync);
      sync();
    }
    bindToggle('f-intro-on', 'f-intro-wrap');
    bindToggle('f-remark-on', 'f-remark-wrap');

    // 花销多行管理：渲染 + 添加/删除/标题与金额输入（弹窗内直接操作，保存时统一同步）
    var expRowsBox = $('#exp-rows', modal);
    function renderExpRows() {
      expRowsBox.innerHTML = pendingExps.map(function (p) {
        return '<div class="exp-row" data-key="' + esc(p.key) + '">' +
          '<input type="text" class="input exp-amount" inputmode="decimal" data-key="' + esc(p.key) + '" value="' + esc(p.amountStr) + '" placeholder="金额（元）">' +
          '<input type="text" class="input exp-title" data-key="' + esc(p.key) + '" value="' + esc(p.titleStr || '') + '" placeholder="标题（可留空）">' +
          '<button class="btn btn-danger btn-sm" type="button" data-act="exp-del" data-key="' + esc(p.key) + '">删除</button>' +
        '</div>';
      }).join('');
    }
    renderExpRows();
    modal.addEventListener('click', function (ev) {
      var addBtn = ev.target.closest('[data-act="exp-add"]');
      if (addBtn) { pendingExps.push({ key: 'ek' + (++expSeq), id: null, titleStr: '', amountStr: '' }); renderExpRows(); return; }
      var delBtn = ev.target.closest('[data-act="exp-del"]');
      if (delBtn) {
        var k = delBtn.getAttribute('data-key');
        pendingExps = pendingExps.filter(function (p) { return p.key !== k; });
        renderExpRows();
      }
    });
    modal.addEventListener('input', function (ev) {
      var inp = ev.target.closest('.exp-title, .exp-amount');
      if (!inp) return;
      var k = inp.getAttribute('data-key');
      var isTitle = inp.classList.contains('exp-title');
      for (var i = 0; i < pendingExps.length; i++) {
        if (pendingExps[i].key === k) {
          if (isTitle) pendingExps[i].titleStr = inp.value;
          else pendingExps[i].amountStr = inp.value;
          break;
        }
      }
    });
  }

  function onDeleteItem(itemId) {
    var trip = currentTrip(); if (!trip) return;
    var items = trip.days[state.date] || [];
    var item = null;
    for (var i = 0; i < items.length; i++) if (items[i].id === itemId) { item = items[i]; break; }
    if (!item) return;
    confirmDialog('删除事项', '确定删除「' + esc(item.title || '未命名事项') + '」（' + esc(item.start) + '–' + esc(item.end) + '）吗？', '确认删除', true).then(function (ok) {
      if (!ok) return;
      trip.days[state.date] = items.filter(function (it) { return it.id !== itemId; });
      // 联动：删除该事项关联的全部花销项（一对多）
      trip.expenses = tripExpenses(trip).filter(function (x) { return x.itemId !== itemId; });
      trip.updatedAt = Date.now();
      save(); render();
    });
  }

  /** 一键删除：确认后清空当天全部事项与当天全部花销（无需验证码） */
  function onClearDay() {
    var trip = currentTrip(); if (!trip) return;
    var items = trip.days[state.date] || [];
    var dayExpCount = tripExpenses(trip).filter(function (e) { return e.day === state.date; }).length;
    if (!items.length && !dayExpCount) { toast('这一天没有事项或花销可删除'); return; }
    confirmDialog('删除当天全部事项',
      '确定删除 ' + esc(D.fmtMD(state.date)) + '（第 ' + (D.dateList(trip.startDate, state.date).length) + ' 天）的<strong>全部 ' + items.length + ' 个事项</strong>' +
      (dayExpCount ? '及 <strong>' + dayExpCount + ' 项花销</strong>' : '') + '吗？此操作不可恢复。',
      '确认删除', true).then(function (ok) {
      if (!ok) return;
      trip.days[state.date] = [];
      trip.expenses = tripExpenses(trip).filter(function (e) { return e.day !== state.date; });
      trip.updatedAt = Date.now();
      save(); render();
      toast('已删除当天全部事项');
    });
  }

  /* ============================ 花销页（spend.html） ============================ */
  function renderSpend(trip) {
    var dates = D.dateList(trip.startDate, trip.endDate);
    if (!state.spendDate || dates.indexOf(state.spendDate) < 0) state.spendDate = defaultDay(dates);
    var isPreview = !!state.preview;
    var exps = tripExpenses(trip);
    var total = Money.sumCents(exps);
    var dayExps = exps.filter(function (e) { return e.day === state.spendDate; });
    var dayTotal = Money.sumCents(dayExps);
    var opts = dates.map(function (d, i) {
      return '<option value="' + esc(d) + '"' + (d === state.spendDate ? ' selected' : '') + '>第' + (i + 1) + '天 · ' + D.fmtMD(d) + ' ' + D.weekday(d) + '</option>';
    }).join('');
    var html = '';
    html += '<div class="back-bar"><button class="btn btn-ghost btn-sm" data-action="spend-back">← 返回计划</button></div>';
    html += '<div class="spend-header">' +
      '<div class="spend-plan-name">' + esc(defaultTripName(trip)) + '</div>' +
      '<div class="spend-total-label">计划总花销</div>' +
      '<div class="spend-total">' + Money.yuanText(total) + '</div>' +
      '<div class="spend-export"><button class="btn btn-soft" data-action="export-spend">导出花销</button></div>' +
    '</div>';
    html += '<div class="spend-toolbar">' +
      '<label class="spend-date-label">选择日期</label>' +
      '<select class="select spend-select" data-action="spend-date">' + opts + '</select>' +
      '<span class="spend-day-total">当日花销：' + Money.yuanText(dayTotal) + '</span>' +
    '</div>';
    if (!dayExps.length) {
      html += '<div class="day-empty">今日暂无花销' + (isPreview ? '' : '，点击「添加花销」记录一笔') + '</div>';
    } else {
      html += '<div class="spend-list">';
      V.sortExpenses(dayExps).forEach(function (e) {
        html += '<div class="spend-item">' +
          '<div class="spend-item-main">' +
            '<div class="spend-item-title"><span class="spend-item-time">' + esc(e.time || '--:--') + '</span>' + esc(spendDisplayTitle(trip, e)) +
              (e.itemId ? '' : '<span class="spend-ind">*</span>') + '</div>' +
            (e.remark ? '<div class="spend-item-remark">' + esc(e.remark) + '</div>' : '') +
          '</div>' +
          '<div class="spend-item-amount">' + Money.yuanText(e.amount) + '</div>' +
          (isPreview ? '' :
            '<div class="spend-item-actions">' +
              '<button class="btn btn-ghost btn-sm" data-action="spend-edit" data-id="' + esc(e.id) + '">编辑</button>' +
              '<button class="btn btn-danger btn-sm" data-action="spend-del" data-id="' + esc(e.id) + '">删除</button>' +
            '</div>') +
        '</div>';
      });
      html += '</div>';
    }
    html += (isPreview ? '' : '<div class="spend-add-bar"><button class="btn btn-primary" data-action="spend-add">＋ 添加花销</button></div>');
    containerEl().innerHTML = html;
  }

  /** 添加/编辑花销项（expenseId 存在时为编辑；新增的项为独立花销，不与事项关联） */
  function openExpenseModal(expenseId) {
    var trip = currentTrip(); if (!trip) return;
    var exp = expenseId ? Store.findExpense(trip, expenseId) : null;
    var body = el(
      '<div class="form-row"><label>标题 <span class="req">*</span></label><input type="text" class="input" id="x-title" value="' + esc(exp ? exp.title : '') + '" placeholder="如：住宿费 / 门票"></div>' +
      '<div class="form-row"><label>花销金额（元） <span class="req">*</span></label><input type="text" class="input" id="x-amount" inputmode="decimal" value="' + esc(exp ? Money.formatCents(exp.amount) : '') + '" placeholder="如：12.5 或 88"><div class="hint">非负数字，最多两位小数，上限 999999.99 元</div></div>' +
      '<div class="form-row"><label>时间</label><div class="exp-time-row">' + timePartsHtml('x-time', exp ? exp.time : '') +
        '<button class="btn btn-ghost btn-sm" type="button" data-act="x-time-now">当前时间</button></div>' +
        '<div class="hint">留空则使用默认时间 09:00</div></div>' +
      '<div class="form-row"><label>备注（选填）</label><textarea class="textarea" id="x-remark" placeholder="如：双人间一晚">' + esc(exp ? exp.remark : '') + '</textarea></div>'
    );
    var modal = openModal({
      title: exp ? '编辑花销' : '添加花销',
      body: body,
      actions: [
        { text: '取消', cls: 'btn-ghost', onClick: function () { closeModal(modal); } },
        { text: '保存', cls: 'btn-primary', onClick: function () {
          var title = $('#x-title', modal).value.trim();
          var amountCents = Money.parseAmountToCents($('#x-amount', modal).value);
          var remark = $('#x-remark', modal).value.trim();
          var timeH = $('#x-time-h', modal).value.trim();
          var timeM = $('#x-time-m', modal).value.trim();
          var timeVal = '';
          if (timeH !== '' || timeM !== '') {
            // 输入了时间则必须合法；全部留空才允许使用默认时间 09:00
            timeVal = normTime(timeH + ':' + (timeM || '00'));
            if (!timeVal) { toast('时间格式不正确（HH:mm）'); return; }
          }
          // 标题必填规则：事项关联花销（exp.itemId）允许空标题；独立花销仍必填
          if (!title && !(exp && exp.itemId)) { toast('请填写花销标题'); return; }
          if (amountCents === null) { toast('花销金额格式不正确（非负数字，最多两位小数）'); return; }
          if (exp) {
            // B. 编辑：金额联动事项花销栏（事项栏直接读取 expense.amount）；标题各自独立
            exp.title = title; exp.amount = amountCents; exp.remark = remark;
            if (timeVal) exp.time = timeVal; // 未修改时间则保持原值
          } else {
            // A. 独立添加：不关联任何事项
            trip.expenses.push(Store.newExpense(state.spendDate, title, amountCents, '', remark, timeVal || '09:00'));
          }
          trip.updatedAt = Date.now();
          save(); closeModal(modal); render();
          toast('已保存');
        } }
      ]
    });
    // 时/分自动跳转（与事项时间一致）
    var hInp = $('#x-time-h', modal), mInp = $('#x-time-m', modal);
    if (hInp && mInp) {
      hInp.addEventListener('input', function () {
        if (hInp.value.replace(/\D/g, '').length >= 2) mInp.focus();
      });
      mInp.addEventListener('blur', function () {
        if (hInp.value.trim() !== '' && mInp.value.trim() === '') mInp.value = '00';
      });
    }
    // 「当前时间」按钮：一键填入当前时刻（已填入时可直接覆盖）
    var nowBtn = $('[data-act="x-time-now"]', modal);
    if (nowBtn) {
      nowBtn.addEventListener('click', function () {
        var now = D.fmtTime(new Date()).split(':');
        hInp.value = now[0];
        mInp.value = now[1];
      });
    }
  }

  /** 删除花销项：二次确认；若来自事项，提示对应事项中的花销项也一并删除 */
  function onDeleteExpense(expenseId) {
    var trip = currentTrip(); if (!trip) return;
    var exp = Store.findExpense(trip, expenseId); if (!exp) return;
    var msg = '确定删除「' + esc(exp.title || '无标题') + '」（' + Money.yuanText(exp.amount) + '）吗？' +
      (exp.itemId ? '<div class="hint">如果删除该花销项，对应事项中的花销项也一并删除。</div>' : '');
    confirmDialog('删除花销', msg, '确认删除', true).then(function (ok) {
      if (!ok) return;
      trip.expenses = tripExpenses(trip).filter(function (x) { return x.id !== expenseId; });
      trip.updatedAt = Date.now();
      save(); render();
      toast('花销已删除');
    });
  }

  /* ============================ 导出 ============================ */
  function onExportText() {
    var trip = currentTrip(); if (!trip) return;
    var ta = el('<textarea class="exp-text" readonly></textarea>');
    var chkWrap = el('<label class="toggle-item exp-toggle"><input type="checkbox" checked> 包含花销</label>');
    var chk = chkWrap.querySelector('input');
    function refresh() { ta.value = Format.exportTripToText(trip, { includeExpenses: chk.checked }); }
    chk.addEventListener('change', refresh);
    refresh();
    var body = el('<div></div>');
    body.appendChild(chkWrap);
    body.appendChild(ta);
    var modal = openModal({
      title: '导出文字（可复制）',
      wide: true,
      body: body,
      actions: [
        { text: '关闭', cls: 'btn-ghost', onClick: function () { closeModal(modal); } },
        { text: '复制全文', cls: 'btn-primary', onClick: function (btn) {
          btn.textContent = '复制中…';
          copyText(ta.value).then(function (ok) {
            btn.textContent = ok ? '已复制' : '复制失败，请手动选择复制';
            toast(ok ? '已复制到剪贴板' : '复制失败');
          });
        } }
      ]
    });
  }

  /** 导出花销总览文字：第一行总花销 → 逐天分段（天间空行）→ 每天首行第D天总花销 → 花销明细行 */
  function onExportSpendText() {
    var trip = currentTrip(); if (!trip) return;
    var exps = tripExpenses(trip);
    if (!exps.length) { toast('当前计划没有花销记录'); return; }
    var parts = ['总花销：' + Money.yuanText(Money.sumCents(exps))];
    var dates = D.dateList(trip.startDate, trip.endDate);
    dates.forEach(function (date, i) {
      var dayExps = V.sortExpenses(exps.filter(function (e) { return e.day === date; }));
      if (!dayExps.length) return; // 只列出有花销的天
      var block = ['第' + (i + 1) + '天总花销：' + Money.yuanText(Money.sumCents(dayExps))];
      dayExps.forEach(function (e) {
        var line = spendDisplayTitle(trip, e) + '：' + Money.yuanText(e.amount);
        if (e.remark) line += '（' + e.remark + '）';
        block.push(line);
      });
      parts.push(block.join('\n'));
    });
    var text = parts.join('\n\n'); // 天之间用空行隔开
    var ta = el('<textarea class="exp-text" readonly></textarea>');
    ta.value = text;
    var modal = openModal({
      title: '导出花销（可复制）',
      wide: true,
      body: ta,
      actions: [
        { text: '关闭', cls: 'btn-ghost', onClick: function () { closeModal(modal); } },
        { text: '复制全文', cls: 'btn-primary', onClick: function (btn) {
          btn.textContent = '复制中…';
          copyText(text).then(function (ok) {
            btn.textContent = ok ? '已复制' : '复制失败，请手动选择复制';
            toast(ok ? '已复制到剪贴板' : '复制失败');
          });
        } }
      ]
    });
  }

  function onExportWord() {
    var trip = currentTrip(); if (!trip) return;
    if (!window.JSZip) { toast('Word 导出组件未加载，请刷新页面'); return; }
    toast('正在生成 Word 文档…');    Word.exportFile(window.JSZip, trip).then(function (u8) {
      var blob = new Blob([u8], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      var name = (trip.name || Store.defaultName(trip.startDate, trip.endDate)).replace(/[\\/:*?"<>|]/g, '_');
      downloadBlob(blob, name + '.docx');
      toast('Word 文档已下载');
    }).catch(function (err) {
      console.error(err);
      toast('Word 导出失败：' + (err && err.message ? err.message : '未知错误'));
    });
  }

  /* ============================ 导入 ============================ */
  function openImportModal() {
    var body = el(
      '<div class="import-tabs">' +
        '<div class="import-tab active" data-tab="text">粘贴文字</div>' +
        '<div class="import-tab" data-tab="file">上传 Word</div>' +
      '</div>' +
      '<div class="import-pane" data-pane="text">' +
        '<textarea class="textarea" id="imp-text" style="min-height:200px" placeholder="粘贴符合规范的导出文字…"></textarea>' +
      '</div>' +
      '<div class="import-pane" data-pane="file" style="display:none">' +
        '<input type="file" id="imp-file" accept=".docx" style="margin-bottom:10px">' +
        '<div class="hint">请选择本网站导出的 .docx 文件</div>' +
      '</div>'
    );
    var modal = openModal({
      title: '导入计划（将新建一个计划，不影响现有计划）',
      wide: true,
      body: body,
      actions: [
        { text: '关闭', cls: 'btn-ghost', onClick: function () { closeModal(modal); } },
        { text: '导入', cls: 'btn-primary', onClick: onImportAction }
      ]
    });
    function onImportAction() {
      var isText = $('[data-tab="text"]', modal).classList.contains('active');
      if (isText) {
        var text = $('#imp-text', modal).value;
        if (!text.trim()) { toast('请粘贴要导入的文字'); return; }
        handleImportResult(Format.parseTripFromText(text), modal);
        return;
      }
      var file = $('#imp-file', modal).files[0];
      if (!file) { toast('请选择 .docx 文件'); return; }
      if (!window.JSZip) { toast('导入组件未加载，请刷新页面'); return; }
      var reader = new FileReader();
      reader.onload = function () {
        Word.parseFile(window.JSZip, reader.result).then(function (result) {
          handleImportResult(result, modal);
        }).catch(function (err) {
          console.error(err);
          toast('Word 解析失败：' + (err && err.message ? err.message : '文件格式无法识别'));
        });
      };
      reader.readAsArrayBuffer(file);
    }
    $$('.import-tab', modal).forEach(function (tab) {
      tab.addEventListener('click', function () {
        $$('.import-tab', modal).forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var which = tab.getAttribute('data-tab');
        $('[data-pane="text"]', modal).style.display = which === 'text' ? '' : 'none';
        $('[data-pane="file"]', modal).style.display = which === 'file' ? '' : 'none';
      });
    });
  }

  /** result: {trip, errors, ok} */
  function handleImportResult(result, parentModal) {
    if (!result || !result.ok) {
      var fatal = result && result.errors && result.errors.length
        ? result.errors.map(function (e) { return '· 第' + e.line + '行：' + esc(e.message); }).join('') + '<div class="hint">存在致命错误，无法导入</div>'
        : '<div class="hint">无法解析</div>';
      var em = openModal({
        title: '导入失败',
        body: '<div class="err-list">' + fatal + '</div>',
        actions: [{ text: '知道了', cls: 'btn-primary', onClick: function () { closeModal(em); } }]
      });
      return;
    }
    if (result.errors && result.errors.length) {
      var list = result.errors.map(function (e) { return '· 第' + e.line + '行：' + esc(e.message); }).join('<br>');
      confirmDialog('部分内容解析失败', '以下内容无法解析，将跳过：<br><div class="err-list">' + list + '</div>', '忽略并导入', true).then(function (ok) {
        if (ok) { commitImport(result.trip, parentModal); }
      });
      return;
    }
    commitImport(result.trip, parentModal);
  }

  function uniqueName(base) {
    var name = base || Store.defaultName(D.today(), D.today());
    var used = {};
    state.trips.forEach(function (t) { used[t.name] = true; });
    if (!used[name]) return name;
    var n = 2;
    while (used[name + ' (' + n + ')']) n++;
    return name + ' (' + n + ')';
  }

  function commitImport(parsed, parentModal) {
    var name = uniqueName(parsed.name || '');
    var trip = Store.createTrip(name, parsed.startDate, parsed.endDate);
    trip.notes = (parsed.notes || []).map(function (n) { return Store.newNote(n.title, n.body); });
    trip.expenses = (parsed.expenses || []).slice(); // 花销并入：还原为独立项（标题+金额，无备注，时间=导入时刻）
    D.dateList(trip.startDate, trip.endDate).forEach(function (d) {
      trip.days[d] = (parsed.days[d] || []).map(function (it) {
        var e = Store.newItem(it.start, it.end, it.title, it.location);
        e.id = it.id || e.id; // 保留解析时的 id，使导入花销的 itemId 关联有效
        e.intro = it.intro || ''; e.remark = it.remark || '';
        return e;
      });
    });
    state.trips.push(trip);
    save();
    if (parentModal) closeModal(parentModal);
    location.href = 'plan.html?id=' + encodeURIComponent(trip.id);
  }

  /* ============================ 启动 ============================ */
  function urlParam(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }

  // spend 页日期下拉选择
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute('data-action') === 'spend-date') {
      state.spendDate = t.value;
      render();
    }
  });

  state.trips = Store.load();
  if (isPlanPage || isSpendPage) {
    var pageId = urlParam('id');
    var preview = urlParam('preview') === '1';
    if (!pageId || !Store.getTrip(state.trips, pageId)) {
      location.href = 'index.html';
    } else {
      state.tripId = pageId;
      state.preview = preview;
      render();
    }
  } else {
    render();
  }
})();
