import { supabase } from './supabase';

// ── TASKS ─────────────────────────────────────────────────────────────────────

export async function loadTasks(userId) {
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
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

// Zachte verwijdering: zet deleted_at zodat de taak naar de prullenbak gaat
// (zelfde gedrag als de web-app — taak blijft bestaan en is terug te halen)
export async function trashTaskDB(id) {
  await supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', id);
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
    recurrence: t.recurrence || null,
    last_completed_at: t.lastCompletedAt || null,
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
    recurrence: r.recurrence || null,
    lastCompletedAt: r.last_completed_at || null,
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
    id:          typeof e.id === 'number' ? undefined : e.id,
    title:       e.title,
    date:        e.date,
    start_h:     e.startH,
    start_m:     e.startM,
    end_h:       e.endH,
    end_m:       e.endM,
    color:       e.color,
    note:        e.note || null,
    shared:      e.shared || false,
    shared_with: e.sharedWith || [],
  };
}

function dbToEvent(r) {
  return {
    id:         r.id,
    title:      r.title,
    date:       r.date,
    startH:     r.start_h,
    startM:     r.start_m,
    endH:       r.end_h,
    endM:       r.end_m,
    color:      r.color,
    note:       r.note || '',
    shared:     r.shared || false,
    sharedWith: r.shared_with || [],
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

// Aanmaken óf bijwerken (per gebruiker uniek op user_id+id) — gebruikt voor
// het persisteren van lijsten en hernoemen, ook van de standaardlijsten.
export async function upsertListDB(userId, list) {
  await supabase
    .from('lists')
    .upsert({ id: list.id, user_id: userId, label: list.label, color: list.color }, { onConflict: 'user_id,id' });
}

export async function updateListDB(list) {
  await supabase.from('lists').update({ label: list.label, color: list.color }).eq('id', list.id);
}

export async function deleteListDB(userId, id) {
  await supabase.from('lists').delete().eq('user_id', userId).eq('id', id);
}

function dbToList(r) {
  return { id: r.id, label: r.label, color: r.color };
}

// ── SHARE LISTS (granulair delen: welke lijsten een share omvat) ───────────────

export async function loadShareLists(shareId) {
  const { data } = await supabase
    .from('share_lists')
    .select('*')
    .eq('share_id', shareId);
  return (data || []).map(r => ({ listId: r.list_id, label: r.label, color: r.color }));
}

// Vervang de gedeelde lijsten van een share door de meegegeven set
export async function setShareLists(shareId, lists) {
  await supabase.from('share_lists').delete().eq('share_id', shareId);
  if (lists.length === 0) return;
  await supabase.from('share_lists').insert(
    lists.map(l => ({ share_id: shareId, list_id: l.id, label: l.label, color: l.color }))
  );
}

// ── PERSON COLORS (kleur per persoon, lokaal voor de kijker) ───────────────────

export async function loadPersonColors(userId) {
  const { data } = await supabase
    .from('person_colors')
    .select('*')
    .eq('user_id', userId);
  return (data || []).map(r => ({ email: r.person_email, color: r.color }));
}

export async function setPersonColorDB(userId, email, color) {
  await supabase
    .from('person_colors')
    .upsert({ user_id: userId, person_email: email, color }, { onConflict: 'user_id,person_email' });
}

export async function removePersonColorDB(userId, email) {
  await supabase.from('person_colors').delete().eq('user_id', userId).eq('person_email', email);
}

// ── AGENTS (per gebruiker) ─────────────────────────────────────────────────────

export async function loadAgents(userId) {
  const { data } = await supabase
    .from('agents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  return data || [];
}

export async function addAgentDB(userId, a) {
  const { data } = await supabase
    .from('agents')
    .insert({ user_id: userId, name: a.name, role: a.role || null, emoji: a.emoji || null, model: a.model || 'sonnet', system_prompt: a.system_prompt || null })
    .select()
    .single();
  return data;
}

export async function updateAgentDB(a) {
  await supabase.from('agents')
    .update({ name: a.name, role: a.role || null, emoji: a.emoji || null, model: a.model || 'sonnet', system_prompt: a.system_prompt || null })
    .eq('id', a.id);
}

export async function deleteAgentDB(id) {
  await supabase.from('agents').delete().eq('id', id);
}

// ── TERMINAL-BRIDGE (praat met de echte agents op je laptop) ────────────────────

// Zet een verzoek in de wachtrij. De bridge op de laptop pikt 'pending' op.
export async function createAgentRequest(userId, agentKey, agentName, message) {
  const { data, error } = await supabase
    .from('agent_requests')
    .insert({ user_id: userId, agent_key: agentKey, agent_name: agentName, message, status: 'pending' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Haal de huidige status/antwoord van een verzoek op (voor polling).
export async function getAgentRequest(id) {
  const { data } = await supabase
    .from('agent_requests')
    .select('status,reply')
    .eq('id', id)
    .single();
  return data;
}
