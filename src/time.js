const DAY_MS = 86_400_000;

function localDate(epochMs = Date.now(), timeZone = 'Asia/Shanghai') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(epochMs));
  const result = {};
  for (const part of parts) if (part.type !== 'literal') result[part.type] = part.value;
  return `${result.year}-${result.month}-${result.day}`;
}

function dateToDayNumber(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date));
  if (!match) throw new Error(`Invalid local date: ${date}`);
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS);
}

function dayNumberToDate(dayNumber) {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
}

function addLocalDays(date, count) {
  return dayNumberToDate(dateToDayNumber(date) + count);
}

function resolveTriggerAt(input, now = Date.now(), timeZone = 'Asia/Shanghai') {
  if (Object.hasOwn(input, 'triggerAt') || Object.hasOwn(input, 'trigger_at')) {
    const raw = Object.hasOwn(input, 'triggerAt') ? input.triggerAt : input.trigger_at;
    if (raw === null || raw === '') return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) throw new Error('triggerAt must be a positive millisecond timestamp or null');
    return Math.floor(value);
  }
  if (Object.hasOwn(input, 'inMinutes') || Object.hasOwn(input, 'in')) {
    const raw = Object.hasOwn(input, 'inMinutes') ? input.inMinutes : input.in;
    const minutes = Number(raw);
    if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('inMinutes must be greater than 0');
    return now + Math.floor(minutes * 60_000);
  }
  if (Object.hasOwn(input, 'at')) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(input.at).trim());
    if (!match) throw new Error('at must use HH:MM');
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) throw new Error('at must be a valid local time');
    const today = localDate(now, timeZone);
    const candidate = epochForLocalDateTime(today, hour, minute, timeZone);
    return candidate <= now
      ? epochForLocalDateTime(addLocalDays(today, 1), hour, minute, timeZone)
      : candidate;
  }
  return undefined;
}

function epochForLocalDateTime(date, hour, minute, timeZone) {
  const [year, month, day] = date.split('-').map(Number);
  let epoch = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 3; i += 1) {
    const rendered = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(epoch));
    const p = {};
    for (const part of rendered) if (part.type !== 'literal') p[part.type] = Number(part.value);
    const observed = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    epoch += Date.UTC(year, month - 1, day, hour, minute) - observed;
  }
  return epoch;
}

module.exports = { addLocalDays, dateToDayNumber, dayNumberToDate, localDate, resolveTriggerAt };
