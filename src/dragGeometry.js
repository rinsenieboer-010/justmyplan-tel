export function dragTarget(ids, sizes, id, delta, fallback = 80) {
  const from = ids.indexOf(id);
  if (from < 0) return from;
  let to = from;
  let distance = Math.abs(delta);
  const direction = delta < 0 ? -1 : 1;
  while (to + direction >= 0 && to + direction < ids.length) {
    const size = sizes[ids[to + direction]] ?? fallback;
    if (distance < size / 2) break;
    distance -= size;
    to += direction;
  }
  return to;
}

export function rowShift(index, drag) {
  if (!drag || index === drag.from) return 0;
  if (drag.to > drag.from && index > drag.from && index <= drag.to) return -drag.size;
  if (drag.to < drag.from && index >= drag.to && index < drag.from) return drag.size;
  return 0;
}

export function edgeScroll(pointer, origin, viewport, offset, content, elapsed = 16) {
  if (viewport <= 0) return offset;
  const edge = Math.min(64, viewport / 4);
  const position = pointer - origin;
  const speed = position < edge ? -Math.min(1, (edge - position) / edge)
    : position > viewport - edge ? Math.min(1, (position - viewport + edge) / edge) : 0;
  return Math.max(0, Math.min(Math.max(0, content - viewport), offset + speed * 420 * elapsed / 1000));
}
