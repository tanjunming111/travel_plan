/**
 * 预览样例：事项栏每行前面留出一小段空白（缩进 240 twips）
 * 仅用于评审；正式逻辑（js/word.js）待用户批准后修改
 * 运行：NODE_PATH=<workspace>/node_modules node tools/gen_sample_indent.js
 */
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ShadingType, VerticalAlign,
} = require("docx");
const fs = require("fs");
const path = require("path");

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const TRIP = {
  name: "北京五日游",
  startDate: "2026-08-10",
  endDate: "2026-08-14",
  notes: [
    { title: "证件", body: "身份证、学生证" },
    { title: "天气提醒", body: "8 月多雨，请带雨伞" },
    { title: "交通", body: "建议提前下载地铁乘车码" },
  ],
  days: {
    "2026-08-10": [
      { start: "09:00", end: "10:30", title: "参观故宫博物院", location: "北京市东城区景山前街 4 号", intro: "明清两朝皇宫，世界文化遗产", remark: "建议提前 3 天网上预约门票" },
      { start: "11:00", end: "12:00", title: "午餐·四季民福烤鸭店", location: "王府井大街", intro: "", remark: "" },
      { start: "14:00", end: "17:00", title: "恭王府", location: "", intro: "清代规模最大的王府", remark: "" },
    ],
    "2026-08-11": [
      { start: "09:30", end: "11:30", title: "颐和园", location: "北京市海淀区新建宫门路 19 号", intro: "", remark: "乘地铁 4 号线北宫门站" },
      { start: "13:00", end: "15:00", title: "圆明园遗址公园", location: "北京市海淀区清华西路 28 号", intro: "", remark: "" },
    ],
    "2026-08-12": [],
    "2026-08-13": [
      { start: "10:00", end: "11:00", title: "国家博物馆", location: "", intro: "免费开放，需提前预约", remark: "" },
    ],
    "2026-08-14": [
      { start: "09:00", end: "10:00", title: "收拾行李退房", location: "", intro: "", remark: "12 点前退房，行李可寄存前台" },
    ],
  },
};

function dateList(start, end) {
  const out = [];
  const d = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  while (d <= last) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${dd}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}
function fmtMD(s) { const p = s.split("-"); return p[1] + "月" + p[2] + "日"; }
function weekdayOf(s) { return "星期" + WEEKDAYS[new Date(s + "T00:00:00").getDay()]; }
function sortItems(items) { return items.slice().sort((a, b) => (a.start !== b.start ? (a.start < b.start ? -1 : 1) : a.createdAt - b.createdAt)); }

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "EAC291" };
const TABLE_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideHorizontal: BORDER, insideVertical: BORDER };
const CELL_MARGINS = { top: 80, bottom: 80, left: 100, right: 100 };

function cell(text, opts = {}) {
  return new TableCell({
    width: { size: opts.width || 20, type: opts.widthType || WidthType.PERCENTAGE },
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill } : undefined,
    margins: CELL_MARGINS,
    verticalAlign: opts.verticalCenter ? VerticalAlign.CENTER : VerticalAlign.TOP,
    children: [new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      spacing: { after: 0 },
      children: [new TextRun({ text: text || "", size: 20, bold: !!opts.bold, color: opts.color || "333333" })],
    })],
  });
}

// ★ 变化点：事项栏每行内容整体左缩进 240 twips（标题与地点/介绍/备注一致）
const ITEM_INDENT = 240;

function itemTable(items) {
  const header = new TableRow({
    children: [
      cell("时间段", { fill: "FDEBD8", bold: true, align: AlignmentType.CENTER, color: "B4550F", width: 1750, widthType: WidthType.DXA }),
      cell("旅游事项", { fill: "FDEBD8", bold: true, align: AlignmentType.CENTER, color: "B4550F", width: 7276, widthType: WidthType.DXA }),
    ],
  });
  const rows = items.map((it) => {
    const detailParas = [
      new Paragraph({
        spacing: { after: 30 },
        indent: { left: ITEM_INDENT },
        children: [new TextRun({ text: it.title || "", bold: true, size: 21, color: "333333" })],
      }),
    ];
    [["地点", it.location], ["介绍", it.intro], ["备注", it.remark]].forEach((pair) => {
      if (pair[1] && String(pair[1]).trim()) {
        detailParas.push(new Paragraph({
          spacing: { after: 30 },
          indent: { left: ITEM_INDENT },
          children: [new TextRun({ text: pair[0] + "：" + pair[1], size: 20, color: "555555" })],
        }));
      }
    });
    return new TableRow({
      children: [
        cell(it.start + "-" + it.end, { width: 1750, widthType: WidthType.DXA, align: AlignmentType.CENTER, verticalCenter: true }),
        new TableCell({
          width: { size: 7276, type: WidthType.DXA },
          margins: CELL_MARGINS,
          children: detailParas,
        }),
      ],
    });
  });
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS, rows: [header, ...rows] });
}

async function main() {
  const days = dateList(TRIP.startDate, TRIP.endDate).map((d, i) => ({ no: i + 1, date: d, items: sortItems(TRIP.days[d] || []) }));
  const children = [];

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text: TRIP.name, bold: true, size: 48, color: "D9651C" })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    children: [new TextRun({ text: `${TRIP.startDate} 至 ${TRIP.endDate} · 共 ${days.length} 天`, size: 22, color: "666666" })],
  }));
  if (TRIP.notes.length) {
    children.push(new Paragraph({ spacing: { before: 120, after: 100 }, children: [new TextRun({ text: "注意事项", bold: true, size: 28, color: "D9651C" })] }));
    TRIP.notes.forEach((n) => children.push(new Paragraph({ indent: { left: 200 }, spacing: { after: 40 }, children: [new TextRun({ text: `• ${n.title}：${n.body}`, size: 21 })] })));
  }
  days.forEach((day) => {
    children.push(new Paragraph({ spacing: { before: 280, after: 100 }, children: [new TextRun({ text: `第 ${day.no} 天 · ${fmtMD(day.date)} · ${weekdayOf(day.date)}`, bold: true, size: 26, color: "333333" })] }));
    if (day.items.length === 0) {
      children.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: "（无事项安排）", size: 20, color: "999999" })] }));
    } else {
      children.push(itemTable(day.items));
    }
    if (day.no < days.length) children.push(new Paragraph({ children: [] }));
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: "微软雅黑", size: 21 } } } },
    sections: [{ children }],
  });
  const buf = await Packer.toBuffer(doc);
  const out = path.resolve(__dirname, "..", "样例_事项缩进预览.docx");
  fs.writeFileSync(out, buf);
  console.log("sample generated:", out, buf.length, "bytes");
}

main().catch((e) => { console.error(e); process.exit(1); });
