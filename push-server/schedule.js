// All scheduling uses the office clock, regardless of the server's timezone.
export function reminderAt(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}`;
  if (time === '08:00') return { key: `${day}-in`, type: 'in', title: 'Jangan lupa absensi masuk', body: 'Saatnya melakukan absensi masuk.' };
  if (time === '17:01') return { key: `${day}-out`, type: 'out', title: 'Jangan lupa absensi pulang', body: 'Saatnya melakukan absensi pulang.' };
  return null;
}
