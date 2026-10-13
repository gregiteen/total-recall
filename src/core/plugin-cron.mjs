/** Pure cron parsing shared by plugin authoring and scheduling. */
const FIELD_RANGES = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6]   // day of week (0 = Sunday; 7 accepted as Sunday)
];

function parseField(field, [min, max], isDow) {
  const values = new Set();
  for (const part of field.split(',')) {
    const [rangePart, stepPart] = part.split('/');
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step < 1) throw new Error(`Invalid step in '${field}'`);
    let lo;
    let hi;
    if (rangePart === '*') {
      lo = min;
      hi = max;
    } else if (rangePart.includes('-')) {
      [lo, hi] = rangePart.split('-').map(Number);
    } else {
      lo = Number(rangePart);
      hi = stepPart === undefined ? lo : max;
    }
    const upper = isDow ? 7 : max;
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > upper || lo > hi) {
      throw new Error(`Value out of range in '${field}'`);
    }
    for (let v = lo; v <= hi; v += step) values.add(isDow && v === 7 ? 0 : v);
  }
  return values;
}

/** Parse a 5-field cron expression into matcher sets. Throws on invalid input. */
export function parseCron(expr) {
  const fields = String(expr || '').trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`Expected 5 cron fields, got ${fields.length}`);
  const [minute, hour, dom, month, dow] = fields.map((f, i) => parseField(f, FIELD_RANGES[i], i === 4));
  return { minute, hour, dom, month, dow, domStar: fields[2] === '*', dowStar: fields[4] === '*' };
}

/** Standard cron semantics: when both day fields are restricted, either may match. */
export function cronMatches(cron, date) {
  if (!cron.minute.has(date.getMinutes()) || !cron.hour.has(date.getHours()) || !cron.month.has(date.getMonth() + 1)) {
    return false;
  }
  const domOk = cron.dom.has(date.getDate());
  const dowOk = cron.dow.has(date.getDay());
  if (cron.domStar && cron.dowStar) return true;
  if (cron.domStar) return dowOk;
  if (cron.dowStar) return domOk;
  return domOk || dowOk;
}


