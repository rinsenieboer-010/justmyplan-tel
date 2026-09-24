export function adjustEventTime(event, mode, deltaPixels, pixelsPerHour, fromHour, toHour) {
  const start = event.startH * 60 + event.startM;
  const end = event.endH * 60 + event.endM;
  const delta = Math.round(deltaPixels / pixelsPerHour * 60 / 15) * 15;
  const lower = Math.min(fromHour * 60, start);
  const upper = Math.max(toHour * 60, end);
  let nextStart = start, nextEnd = end;
  if (mode === 'start') nextStart = Math.max(lower, Math.min(end - 15, start + delta));
  else if (mode === 'end') nextEnd = Math.max(start + 15, Math.min(upper, end + delta));
  else if (mode === 'move') {
    nextStart = Math.max(lower, Math.min(upper - (end - start), start + delta));
    nextEnd = nextStart + end - start;
  }
  return { ...event, startH: Math.floor(nextStart / 60), startM: nextStart % 60,
    endH: Math.floor(nextEnd / 60), endM: nextEnd % 60 };
}

export function eventTimeLabel(event) {
  const pad = n => String(n).padStart(2, '0');
  const duration = (event.endH - event.startH) * 60 + event.endM - event.startM;
  return `${pad(event.startH)}:${pad(event.startM)} - ${pad(event.endH)}:${pad(event.endM)} (${duration} min)`;
}
