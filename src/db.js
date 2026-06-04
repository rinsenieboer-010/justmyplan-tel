import { supabase } from './supabase';

// ── TASKS ─────────────────────────────────────────────────────────────────────

export async function loadTasks(userId) {
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  return (data || []).map(dbToTask);
}

export async function addTaskDB(userId, task) {
  const { data } = await supabase
    .from('tasks')
    .insert({ ...taskToDB(task), user_id: userId })
    .select()
    .single();
  return data ? dbToTask(data) : task;
}

export async function updateTaskDB(task) {
  await supabase.from('tasks').update(taskToDB(task)).eq('id', task.id);
}

export async function deleteTaskDB(id) {
  await supabase.from('tasks').delete().eq('id', id);
}

function taskToDB(t) {
  return {
    id:       typeof t.id === 'number' ? undefined : t.id,
    title:    t.title,
    deadline: t.deadline || null,
    priority: t.priority || null,
    status:   t.status || null,
    list_id:  t.list || 'mine',
    note:     t.note || null,
  };
}

function dbToTask(r) {
  return {
    id:       r.id,
    title:    r.title,
    deadline: r.deadline || null,
    priority: r.priority || '',
    status:   r.status || '',
    list:     r.list_id || 'mine',
    note:     r.note || '',
  };
}

// ── EVENTS ────────────────────────────────────────────────────────────────────

export async function loadEvents(userId) {
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  return (data || []).map(dbToEvent);
}

export async function addEventDB(userId, event) {
  const { data } = await supabase
    .from('events')
    .insert({ ...eventToDB(event), user_id: userId })
    .select()
    .single();
  return data ? dbToEvent(data) : event;
}

export async function updateEventDB(event) {
  await supabase.from('events').update(eventToDB(event)).eq('id', event.id);
}

export async function deleteEventDB(id) {
  await supabase.from('events').delete().eq('id', id);
}

function eventToDB(e) {
  return {
    id:      typeof e.id === 'number' ? undefined : e.id,
    title:   e.title,
    date:    e.date,
    start_h: e.startH,
    start_m: e.startM,
    end_h:   e.endH,
    end_m:   e.endM,
    color:   e.color,
    note:    e.note || null,
  };
}

function dbToEvent(r) {
  return {
    id:     r.id,
    title:  r.title,
    date:   r.date,
    startH: r.start_h,
    startM: r.start_m,
    endH:   r.end_h,
    endM:   r.end_m,
    color:  r.color,
    note:   r.note || '',
  };
}

// ── LISTS ─────────────────────────────────────────────────────────────────────

export async function loadLists(userId) {
  const { data } = await supabase
    .from('lists')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  return data && data.length > 0 ? data.map(dbToList) : null;
}

export async function addListDB(userId, list) {
  const { data } = await supabase
    .from('lists')
    .insert({ id: list.id, user_id: userId, label: list.label, color: list.color })
    .select()
    .single();
  return data ? dbToList(data) : list;
}

export async function updateListDB(list) {
  await supabase.from('lists').update({ label: list.label, color: list.color }).eq('id', list.id);
}

export async function deleteListDB(id) {
  await supabase.from('lists').delete().eq('id', id);
}

function dbToList(r) {
  return { id: r.id, label: r.label, color: r.color };
}
