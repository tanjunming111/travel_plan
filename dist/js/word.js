/**
 * word.js — Word 文档导出与导入解析（PRD 第 5 节）
 * 导出：exportFile(JSZipLib, trip) → Promise<Uint8Array>（自建 OOXML + JSZip 打包，无需 docx 库）
 * 导入：parseFile(JSZipLib, arrayBuffer) → Promise<{trip, errors}>
 * 依赖注入设计，浏览器与 Node 测试复用同一份代码
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.TP = root.TP || {}; root.TP.Word = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function toDateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDate(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(dateStr, n) { var d = parseDate(dateStr); d.setDate(d.getDate() + n); return toDateStr(d); }
  function dateList(start, end) {
    var out = [], cur = start;
    while (cur <= end) { out.push(cur); cur = addDays(cur, 1); }
    return out;
  }
  function fmtMD(dateStr) { var p = dateStr.split('-'); return p[1] + '月' + p[2] + '日'; }
  function weekdayOf(dateStr) { return '星期' + WEEKDAYS[parseDate(dateStr).getDay()]; }
  function sortItems(items) {
    return (items || []).slice().sort(function (a, b) {
      if (a.start !== b.start) return a.start < b.start ? -1 : 1;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }

  /* ============================== 导出（自建 OOXML） ============================== */

  function escXml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  /** 文本运行：rPr（加粗/字号/颜色/中文字体）+ 文本 */
  function run(text, opts) {
    opts = opts || {};
    var rpr = '';
    rpr += '<w:rFonts w:ascii="微软雅黑" w:eastAsia="微软雅黑" w:hAnsi="微软雅黑"/>';
    if (opts.bold) rpr += '<w:b/><w:bCs/>';
    if (opts.size) rpr += '<w:sz w:val="' + opts.size + '"/><w:szCs w:val="' + opts.size + '"/>';
    if (opts.color) rpr += '<w:color w:val="' + opts.color + '"/>';
    return '<w:r><w:rPr>' + rpr + '</w:rPr><w:t xml:space="preserve">' + escXml(text) + '</w:t></w:r>';
  }

  /** 段落：pPr（对齐/间距/缩进）+ 运行 */
  function para(childrenXml, opts) {
    opts = opts || {};
    var ppr = '';
    if (opts.align) ppr += '<w:jc w:val="' + opts.align + '"/>';
    var spacing = (opts.before || opts.after)
      ? '<w:spacing w:before="' + (opts.before || 0) + '" w:after="' + (opts.after || 0) + '"/>'
      : '';
    if (opts.indent) ppr += '<w:ind w:left="' + opts.indent + '"/>';
    return '<w:p>' + (ppr || spacing ? '<w:pPr>' + ppr + spacing + '</w:pPr>' : '') + childrenXml + '</w:p>';
  }

  /** 单元格：tcPr（宽度/底纹/垂直对齐/边距） */
  function cell(contentXml, opts) {
    opts = opts || {};
    var tcpr = '<w:tcW w:w="' + (opts.width || 20) + '" w:type="' + (opts.widthType || 'pct') + '"/>';
    if (opts.fill) tcpr += '<w:shd w:val="clear" w:color="auto" w:fill="' + opts.fill + '"/>';
    if (opts.vAlign) tcpr += '<w:vAlign w:val="' + opts.vAlign + '"/>';
    tcpr += '<w:tcMar><w:top w:w="80" w:type="dxa"/><w:start w:w="100" w:type="dxa"/>' +
            '<w:bottom w:w="80" w:type="dxa"/><w:end w:w="100" w:type="dxa"/></w:tcMar>';
    return '<w:tc><w:tcPr>' + tcpr + '</w:tcPr>' + contentXml + '</w:tc>';
  }

  /** 两列表格（暖橙边框）——由 buildDocumentXml 内联使用 */
  function buildDocumentXml(trip) {
    var days = dateList(trip.startDate, trip.endDate).map(function (d, i) {
      return { no: i + 1, date: d, items: sortItems(trip.days[d]) };
    });

    var body = [];

    // 文档标题（24pt 大号加粗，暖橙）
    body.push(para(run(trip.name || '旅行计划', { bold: true, size: 48, color: 'D9651C' }),
      { align: 'center', after: 80 }));
    // 副标题
    body.push(para(run(trip.startDate + ' 至 ' + trip.endDate + ' · 共 ' + days.length + ' 天',
      { size: 22, color: '666666' }), { align: 'center', after: 300 }));

    // 注意事项
    if (trip.notes && trip.notes.length) {
      body.push(para(run('注意事项', { bold: true, size: 28, color: 'D9651C' }), { before: 120, after: 100 }));
      trip.notes.forEach(function (n) {
        body.push(para(run('• ' + (n.title || '') + '：' + (n.body || ''), { size: 21 }),
          { indent: 200, after: 40 }));
      });
    }

    // 逐天章节（每两天之间空一行）
    days.forEach(function (day) {
      body.push(para(run('第 ' + day.no + ' 天 · ' + fmtMD(day.date) + ' · ' + weekdayOf(day.date),
        { bold: true, size: 26, color: '333333' }), { before: 280, after: 100 }));

      if (day.items.length === 0) {
        body.push(para(run('（无事项安排）', { size: 20, color: '999999' }), { after: 80 }));
      } else {
        // 表头行：时间段 | 旅游事项
        var headerTime = cell(para(run('时间段', { bold: true, size: 20, color: 'B4550F' }),
          { align: 'center' }), { width: 1750, widthType: 'dxa', fill: 'FDEBD8', vAlign: 'center' });
        var headerItem = cell(para(run('旅游事项', { bold: true, size: 20, color: 'B4550F' }),
          { align: 'center' }), { width: 7276, widthType: 'dxa', fill: 'FDEBD8', vAlign: 'center' });

        // 数据行
        var rows = day.items.map(function (it) {
          var timeTd = cell(para(run(it.start + '-' + it.end, { size: 20 }), { align: 'center' }),
            { width: 1750, widthType: 'dxa', vAlign: 'center' });
          var detailParas = [para(run(it.title || '', { bold: true, size: 21, color: '333333' }), { after: 30, indent: 240 })];
          [['地点', it.location], ['介绍', it.intro], ['备注', it.remark]].forEach(function (pair) {
            if (pair[1] && String(pair[1]).trim()) {
              detailParas.push(para(run(pair[0] + '：' + pair[1], { size: 20, color: '555555' }), { after: 30, indent: 240 }));
            }
          });
          var itemTd = cell(detailParas.join(''), { width: 7276, widthType: 'dxa' });
          return '<w:tr>' + timeTd + itemTd + '</w:tr>';
        });

        body.push('<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>' +
          '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (side) {
            return '<w:' + side + ' w:val="single" w:sz="4" w:space="0" w:color="EAC291"/>';
          }).join('') + '</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr>' +
          '<w:tr>' + headerTime + headerItem + '</w:tr>' + rows.join('') + '</w:tbl>');
      }
      if (day.no < days.length) {
        body.push('<w:p/>');
      }
    });

    var documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' + body.join('') +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>' +
      '</w:sectPr></w:body></w:document>';
    return documentXml;
  }

  /**
   * 生成 .docx 文件数据（Uint8Array，浏览器 new Blob([u8]) 下载；Node 直接解析）
   * @param {Object} JSZipLib JSZip 库（window.JSZip 或 require('jszip')）
   * @param {Object} trip 计划对象
   * @returns {Promise<Uint8Array>}
   */
  function exportFile(JSZipLib, trip) {
    var docXml = buildDocumentXml(trip);
    var now = new Date().toISOString();
    var zip = new JSZipLib();

    zip.file('[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>');

    zip.file('_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      '</Relationships>');

    zip.file('word/_rels/document.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');

    zip.file('word/document.xml', docXml);

    zip.file('docProps/core.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + escXml(trip.name || '旅行计划') + '</dc:title>' +
      '<dc:creator>与友行</dc:creator>' +
      '<cp:lastModifiedBy>与友行</cp:lastModifiedBy>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created>' +
      '<dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified>' +
      '</cp:coreProperties>');

    zip.file('docProps/app.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
      'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
      '<Application>与友行</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop>' +
      '<Company>Travel Plan</Company><Lines>1</Lines><Paragraphs>1</Paragraphs><Version>16</Version>' +
      '</Properties>');

    return zip.generateAsync({
      type: 'uint8array',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
  }

  /* ============================== 导入（解析本网站导出结构） ============================== */

  function decodeEntities(s) {
    return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'");
  }

  function texts(xmlFragment) {
    var out = '', re = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g, m;
    while ((m = re.exec(xmlFragment))) out += m[1];
    return decodeEntities(out);
  }

  function topLevelBlocks(bodyXml) {
    var blocks = [], re = /<w:(p|tbl)[ >][\s\S]*?<\/w:\1>/g, m;
    while ((m = re.exec(bodyXml))) blocks.push({ type: m[1], xml: m[0] });
    return blocks;
  }

  function tableRows(tblXml) {
    var rows = [], re = /<w:tr[ >][\s\S]*?<\/w:tr>/g, m;
    while ((m = re.exec(tblXml))) {
      var rowXml = m[0], cells = [], cre = /<w:tc[ >][\s\S]*?<\/w:tc>/g, cm;
      while ((cm = cre.exec(rowXml))) {
        var paras = [], pre = /<w:p[ >][\s\S]*?<\/w:p>/g, pm;
        while ((pm = pre.exec(cm[0]))) paras.push(texts(pm[0]).trim());
        cells.push(paras);
      }
      rows.push(cells);
    }
    return rows;
  }

  var DAY_HEAD_RE = /第\s*(\d+)\s*天\s*·\s*(\d{2})月(\d{2})日\s*·\s*星期[日一二三四五六]/;
  var SUB_RE = /^(地点|介绍|备注)：(.*)$/;

  function parseFile(JSZipLib, arrayBuffer) {
    return JSZipLib.loadAsync(arrayBuffer).then(function (zip) {
      return zip.file('word/document.xml').async('string');
    }).then(function (xml) {
      var trip = { name: '', startDate: '', endDate: '', notes: [], days: {} };
      var errors = [];
      function err(msg) { errors.push({ line: -1, message: msg }); }

      var bodyMatch = xml.match(/<w:body[ >][\s\S]*?<\/w:body>/);
      if (!bodyMatch) { err('无法解析 Word 文档结构'); return { trip: trip, errors: errors, ok: false }; }
      var blocks = topLevelBlocks(bodyMatch[0]);

      var notesMode = false;
      var currentDay = null;
      var title = null, subtitle = null;

      for (var i = 0; i < blocks.length; i++) {
        if (blocks[i].type === 'p') {
          if (title === null) { title = texts(blocks[i].xml).trim(); }
          else if (subtitle === null) { subtitle = texts(blocks[i].xml).trim(); }
          else break;
        } else break;
      }
      if (title !== null) trip.name = title;
      var dm = (subtitle || '').match(/(\d{4}-\d{2}-\d{2})\s*至\s*(\d{4}-\d{2}-\d{2})/);
      if (dm) { trip.startDate = dm[1]; trip.endDate = dm[2]; }
      else err('未找到起止日期（副标题）');

      function parseDayBlock(t) {
        var m = t.match(DAY_HEAD_RE);
        if (!m) return null;
        var dayNo = parseInt(m[1], 10);
        var expected = addDays(trip.startDate, dayNo - 1);
        if (fmtMD(expected) !== (m[2] + '月' + m[3] + '日')) {
          err('第' + dayNo + '天日期应为 ' + fmtMD(expected) + '（年份取计划开始日期）');
        }
        return expected;
      }

      for (var j = 0; j < blocks.length; j++) {
        var b = blocks[j];
        if (b.type === 'p') {
          var t = texts(b.xml).trim();
          if (!t) continue;
          if (t === '注意事项') { notesMode = true; continue; }
          if (notesMode) {
            if (t.indexOf('• ') === 0) {
              var nb = t.slice(2);
              var idx = nb.indexOf('：');
              trip.notes.push(idx >= 0
                ? { title: nb.slice(0, idx).trim(), body: nb.slice(idx + 1).trim() }
                : { title: nb, body: '' });
              continue;
            }
            if (DAY_HEAD_RE.test(t) || t === '（无事项安排）') { notesMode = false; }
            else continue;
          }
          var day = parseDayBlock(t);
          if (day) { currentDay = day; if (!trip.days[currentDay]) trip.days[currentDay] = []; continue; }
          continue;
        }
        var rows = tableRows(b.xml);
        for (var r = 0; r < rows.length; r++) {
          var cells = rows[r];
          var timeText = (cells[0] && cells[0][0] || '').trim();
          if (timeText === '时间段') continue;
          var itemParas = cells[1] || [];
          if (!currentDay) { err('表格前缺少天区块标题'); continue; }
          var timeM = timeText.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
          if (!timeM) { err('无法识别的时间段：' + timeText); continue; }
          var item = { start: timeM[1], end: timeM[2], title: '', location: '', intro: '', remark: '' };
          itemParas.forEach(function (p, pi) {
            var mm = p.match(SUB_RE);
            if (mm) {
              if (mm[1] === '地点') item.location = mm[2].trim();
              else if (mm[1] === '介绍') item.intro = mm[2].trim();
              else item.remark = mm[2].trim();
            } else if (pi === 0 && !item.title) {
              item.title = p;
            }
          });
          trip.days[currentDay].push(item);
        }
      }

      if (!trip.startDate || !trip.endDate) return { trip: trip, errors: errors, ok: false };
      dateList(trip.startDate, trip.endDate).forEach(function (d) {
        if (!trip.days[d]) trip.days[d] = [];
      });
      return { trip: trip, errors: errors, ok: errors.length === 0 };
    });
  }

  return {
    exportFile: exportFile,
    buildDocumentXml: buildDocumentXml,
    parseFile: parseFile
  };
});
