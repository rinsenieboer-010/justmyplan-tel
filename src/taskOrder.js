export function taskRows(tasks, sections = [], frozenPrio = {}, today = new Date()) {
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const key = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  const group = t => !t.deadline ? 1 : t.recurrence && t.deadline > key ? 2 : 0;
  const rank = { hoog: 0, midden: 1, laag: 2, '': 3 };
  const sorted = [...tasks].sort((a, b) => {
    if (group(a) !== group(b)) return group(a) - group(b);
    if (a.deadline && b.deadline && a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1;
    return (rank[frozenPrio[a.id] ?? a.priority] ?? 3) - (rank[frozenPrio[b.id] ?? b.priority] ?? 3);
  });
  const row = task => ({ kind: 'task', id: task.id, task });
  if (!sections.length && !tasks.some(t => t.sortOrder != null)) return sorted.map(row);
  return [
    ...sorted.filter(t => t.sortOrder == null).map(row),
    ...[
      ...tasks.filter(t => t.sortOrder != null).map(t => ({ ...row(t), key: t.sortOrder })),
      ...sections.map(section => ({ kind: 'section', id: section.id, section, key: section.sortOrder ?? 0 })),
    ].sort((a, b) => a.key - b.key),
  ];
}

export function moveItem(items, id, to) {
  const from = items.findIndex(item => item.id === id);
  if (from < 0) return items;
  const result = [...items];
  const [item] = result.splice(from, 1);
  result.splice(Math.max(0, Math.min(result.length, to)), 0, item);
  return result;
}

export function orderChanges(rows) {
  return {
    tasks: rows.flatMap((row, sortOrder) => row.kind === 'task' ? [{ id: row.id, sortOrder }] : []),
    sections: rows.flatMap((row, sortOrder) => row.kind === 'section' ? [{ ...row.section, sortOrder }] : []),
  };
}

export function dropIndex(ids, sizes, id, delta, fallback = 80) {
  const from = ids.indexOf(id);
  if (from < 0) return -1;
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
