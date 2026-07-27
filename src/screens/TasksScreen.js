import { useState, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, TextInput, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useData } from '../context/DataContext';
import { formatDeadline, getTodayKey, dateKey, MONTHS, MONTHS_SHORT, DAYS_SHORT, PRIO_COLOR, PRIO_BG, STATUS_COLOR, STATUS_BG, PERSON_COLORS } from '../utils';

// ── DATE PICKER ───────────────────────────────────────────────────────────────
function recurrenceLabel(recurrence) {
  if (recurrence === 'daily') return 'Dagelijks';
  if (recurrence === 'weekly') return 'Wekelijks';
  if (recurrence === 'biweekly') return 'Elke 2 weken';
  if (recurrence === 'monthly') return 'Maandelijks';
  if (recurrence?.startsWith('custom:')) {
    const [, interval, unit] = recurrence.split(':');
    const labels = { days: 'dagen', weeks: 'weken', months: 'maanden' };
    return `Elke ${interval} ${labels[unit] || unit}`;
  }
  return null;
}

function DatePickerModal({ value, recurrence, onSelect, onRecurrenceSelect, onClose }) {
  const initial = value ? new Date(value + 'T12:00:00') : new Date();
  const [viewYear, setViewYear]   = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const customMatch = recurrence?.match(/^custom:(\d+):(days|weeks|months)$/);
  const [customOpen, setCustomOpen] = useState(recurrence === 'biweekly' || Boolean(customMatch));
  const [customInterval, setCustomInterval] = useState(customMatch ? Number(customMatch[1]) : 2);
  const [customUnit, setCustomUnit] = useState(customMatch?.[2] || 'weeks');

  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const firstDay    = (y, m) => { const d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1; };

  const prevMonth = () => viewMonth === 0 ? (setViewMonth(11), setViewYear(y => y - 1)) : setViewMonth(m => m - 1);
  const nextMonth = () => viewMonth === 11 ? (setViewMonth(0), setViewYear(y => y + 1)) : setViewMonth(m => m + 1);

  const days   = daysInMonth(viewYear, viewMonth);
  const offset = firstDay(viewYear, viewMonth);
  const cells  = Array(offset).fill(null).concat(Array.from({ length: days }, (_, i) => i + 1));
  while (cells.length % 7 !== 0) cells.push(null);

  const todayK = getTodayKey();

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={dp.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={dp.picker} activeOpacity={1}>
          {/* Header */}
          <View style={dp.header}>
            <TouchableOpacity onPress={prevMonth} style={dp.navBtn}>
              <Text style={dp.navArrow}>‹</Text>
            </TouchableOpacity>
            <Text style={dp.monthLabel}>{MONTHS[viewMonth]} {viewYear}</Text>
            <TouchableOpacity onPress={nextMonth} style={dp.navBtn}>
              <Text style={dp.navArrow}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Day headers */}
          <View style={dp.dayHeaderRow}>
            {DAYS_SHORT.map(d => <Text key={d} style={dp.dayHeader}>{d}</Text>)}
          </View>

          {/* Day grid */}
          <View style={dp.grid}>
            {cells.map((day, i) => {
              if (!day) return <View key={i} style={dp.cell} />;
              const key = viewYear + '-' + String(viewMonth + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
              const isSelected = key === value;
              const isToday    = key === todayK;
              return (
                <TouchableOpacity key={i} style={[dp.cell, isSelected && dp.cellSelected, isToday && !isSelected && dp.cellToday]}
                  onPress={() => { onSelect(key); onClose(); }}>
                  <Text style={[dp.cellText, isSelected && dp.cellTextSelected, isToday && !isSelected && dp.cellTextToday]}>{day}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={dp.repeatSection}>
            <Text style={dp.repeatLabel}>HERHALEN</Text>
            <View style={dp.repeatGrid}>
              {[
                ['daily', 'Dagelijks'],
                ['weekly', 'Wekelijks'],
                ['monthly', 'Maandelijks'],
              ].map(([key, label]) => (
                <TouchableOpacity key={key}
                  style={[dp.repeatBtn, !customOpen && recurrence === key && dp.repeatBtnActive]}
                  onPress={() => { onRecurrenceSelect(key); onClose(); }}>
                  <Text style={[dp.repeatBtnText, !customOpen && recurrence === key && dp.repeatBtnTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[dp.repeatBtn, customOpen && dp.repeatBtnActive]} onPress={() => setCustomOpen(true)}>
                <Text style={[dp.repeatBtnText, customOpen && dp.repeatBtnTextActive]}>Aangepast</Text>
              </TouchableOpacity>
            </View>

            {customOpen && (
              <View style={dp.customBox}>
                <Text style={dp.customPrefix}>Elke</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={dp.intervalScroll}>
                  <View style={dp.intervalRow}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                      <TouchableOpacity key={n} style={[dp.intervalBtn, customInterval === n && dp.intervalBtnActive]} onPress={() => setCustomInterval(n)}>
                        <Text style={[dp.intervalText, customInterval === n && dp.intervalTextActive]}>{n}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
                <View style={dp.unitRow}>
                  {[['days', 'dagen'], ['weeks', 'weken'], ['months', 'maanden']].map(([key, label]) => (
                    <TouchableOpacity key={key} style={[dp.unitBtn, customUnit === key && dp.unitBtnActive]} onPress={() => setCustomUnit(key)}>
                      <Text style={[dp.unitText, customUnit === key && dp.unitTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={dp.customSaveBtn}
                  onPress={() => { onRecurrenceSelect(`custom:${customInterval}:${customUnit}`); onClose(); }}>
                  <Text style={dp.customSaveText}>Opslaan</Text>
                </TouchableOpacity>
              </View>
            )}

            {recurrence && (
              <TouchableOpacity onPress={() => { onRecurrenceSelect(null); onClose(); }}>
                <Text style={dp.noRepeatText}>Geen herhaling</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Clear */}
          <TouchableOpacity style={dp.clearBtn} onPress={() => { onSelect(null); onClose(); }}>
            <Text style={dp.clearText}>Datum wissen</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const dp = StyleSheet.create({
  overlay:           { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  picker:            { backgroundColor: '#fff', borderRadius: 12, width: 280, overflow: 'hidden' },
  header:            { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  navBtn:            { padding: 4, width: 32, alignItems: 'center' },
  navArrow:          { fontSize: 20, color: '#374151' },
  monthLabel:        { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '700', color: '#111827' },
  dayHeaderRow:      { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 6 },
  dayHeader:         { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#9ca3af' },
  grid:              { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingBottom: 8 },
  cell:              { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 4 },
  cellSelected:      { backgroundColor: '#2563EB' },
  cellToday:         { backgroundColor: '#DBEAFE' },
  cellText:          { fontSize: 13, color: '#111827' },
  cellTextSelected:  { color: '#fff', fontWeight: '700' },
  cellTextToday:     { color: '#2563EB', fontWeight: '700' },
  repeatSection:     { borderTopWidth: 1, borderTopColor: '#f3f4f6', padding: 10 },
  repeatLabel:       { fontSize: 10, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.8, marginBottom: 6 },
  repeatGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  repeatBtn:         { width: '49%', backgroundColor: '#f3f4f6', borderRadius: 5, paddingVertical: 7, alignItems: 'center' },
  repeatBtnActive:   { backgroundColor: '#DBEAFE' },
  repeatBtnText:     { fontSize: 11, fontWeight: '700', color: '#6b7280' },
  repeatBtnTextActive:{ color: '#2563EB' },
  customBox:         { marginTop: 8 },
  customPrefix:      { fontSize: 11, color: '#6b7280', marginBottom: 5 },
  intervalScroll:    { marginBottom: 6 },
  intervalRow:       { flexDirection: 'row', gap: 4 },
  intervalBtn:       { width: 28, height: 28, borderRadius: 5, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  intervalBtnActive: { backgroundColor: '#DBEAFE' },
  intervalText:      { fontSize: 11, color: '#6b7280', fontWeight: '600' },
  intervalTextActive:{ color: '#2563EB' },
  unitRow:           { flexDirection: 'row', gap: 5 },
  unitBtn:           { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 5, paddingVertical: 6, alignItems: 'center' },
  unitBtnActive:     { backgroundColor: '#DBEAFE' },
  unitText:          { fontSize: 11, color: '#6b7280', fontWeight: '600' },
  unitTextActive:    { color: '#2563EB' },
  customSaveBtn:     { alignSelf: 'flex-start', marginTop: 8, backgroundColor: '#2563EB', borderRadius: 4, paddingHorizontal: 12, paddingVertical: 6 },
  customSaveText:    { color: '#fff', fontSize: 11, fontWeight: '700' },
  noRepeatText:      { marginTop: 7, fontSize: 11, color: '#9ca3af' },
  clearBtn:          { padding: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  clearText:         { fontSize: 12, color: '#9ca3af', textAlign: 'center' },
});

// ── REMINDER TIME PICKER (uur/minuut, minuten in stappen van 5) ───────────────
function ReminderTimeRow({ value, onChange }) {
  const parsed = /^(\d{1,2}):(\d{2})$/.exec(value || '');
  const h = parsed ? Number(parsed[1]) : null;
  const m = parsed ? Number(parsed[2]) : null;
  const set = (nh, nm) => onChange(String(nh).padStart(2, '0') + ':' + String(nm).padStart(2, '0'));

  if (h === null) {
    return (
      <TouchableOpacity style={tm.dateBtn} onPress={() => set(9, 0)}>
        <Ionicons name="alarm-outline" size={16} color="#6b7280" />
        <Text style={[tm.dateBtnText, { color: '#9ca3af' }]}>Geen herinnering</Text>
      </TouchableOpacity>
    );
  }
  return (
    <View style={[tm.dateBtn, { justifyContent: 'space-between' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="alarm-outline" size={16} color="#2563EB" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <TouchableOpacity style={tm.timeBtn} onPress={() => set((h + 23) % 24, m)}><Text style={tm.timeBtnText}>−</Text></TouchableOpacity>
          <Text style={tm.timeValue}>{String(h).padStart(2, '0')}</Text>
          <TouchableOpacity style={tm.timeBtn} onPress={() => set((h + 1) % 24, m)}><Text style={tm.timeBtnText}>+</Text></TouchableOpacity>
          <Text style={tm.timeValue}>:</Text>
          <TouchableOpacity style={tm.timeBtn} onPress={() => set(h, (m + 55) % 60)}><Text style={tm.timeBtnText}>−</Text></TouchableOpacity>
          <Text style={tm.timeValue}>{String(m).padStart(2, '0')}</Text>
          <TouchableOpacity style={tm.timeBtn} onPress={() => set(h, (m + 5) % 60)}><Text style={tm.timeBtnText}>+</Text></TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity onPress={() => onChange(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close-circle" size={18} color="#9ca3af" />
      </TouchableOpacity>
    </View>
  );
}

// ── TASK MODAL ────────────────────────────────────────────────────────────────
function TaskModal({ task, lists, onSave, onDelete, onClose }) {
  const [title,    setTitle]    = useState(task?.title || '');
  const [deadline, setDeadline] = useState(task?.deadline || null);
  const [reminderTime, setReminderTime] = useState(task?.reminderTime || null);
  const [recurrence, setRecurrence] = useState(task?.recurrence || null);
  const [priority, setPriority] = useState(task?.priority || '');
  const [note,     setNote]     = useState(task?.note || '');
  const [list,     setList]     = useState(task?.list || 'mine');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const status = task?.status || ''; // status-veld blijft bestaan maar wordt niet meer getoond

  const save = () => {
    if (!title.trim()) { Alert.alert('Voer een titel in'); return; }
    onSave({ ...(task || {}), title: title.trim(), deadline, reminderTime, recurrence, priority, status, note, list });
  };

  const PRIOS   = [['', '—'], ['laag', 'Laag'], ['midden', 'Midden'], ['hoog', 'Hoog']];

  return (
    <Modal animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={tm.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={tm.sheet}>
          <View style={tm.handle} />
          <Text style={tm.sheetTitle}>{task ? 'Taak bewerken' : 'Taak toevoegen'}</Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            <TextInput
              style={tm.titleInput}
              placeholder="Taaknaam..."
              placeholderTextColor="#9ca3af"
              value={title}
              onChangeText={setTitle}
              autoFocus={!task}
            />

            {/* List */}
            <Text style={tm.label}>Lijst</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {lists.map(l => (
                  <TouchableOpacity key={l.id} style={[tm.chip, list === l.id && { backgroundColor: l.color, borderColor: l.color }]}
                    onPress={() => setList(l.id)}>
                    <Text style={[tm.chipText, list === l.id && { color: '#fff' }]}>{l.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Date */}
            <Text style={tm.label}>Datum</Text>
            <TouchableOpacity style={tm.dateBtn} onPress={() => setDatePickerOpen(true)}>
              <Ionicons name="calendar-outline" size={16} color="#6b7280" />
              <View style={{ flex: 1 }}>
                <Text style={[tm.dateBtnText, !deadline && { color: '#9ca3af' }]}>
                  {deadline ? formatDeadline(deadline) + ' (' + deadline + ')' : 'Geen datum'}
                </Text>
                {recurrence && <Text style={tm.recurrenceText}>{recurrenceLabel(recurrence)}</Text>}
              </View>
            </TouchableOpacity>

            {/* Reminder time — melding op dit tijdstip, taak verschijnt ook in agenda */}
            <Text style={tm.label}>Herinnering</Text>
            <ReminderTimeRow value={reminderTime} onChange={setReminderTime} />

            {/* Priority */}
            <Text style={tm.label}>Prioriteit</Text>
            <View style={tm.chipRow}>
              {PRIOS.map(([val, label]) => (
                <TouchableOpacity key={val} style={[tm.chip, priority === val && { backgroundColor: PRIO_BG[val], borderColor: PRIO_COLOR[val] }]}
                  onPress={() => setPriority(val)}>
                  <Text style={[tm.chipText, priority === val && { color: PRIO_COLOR[val], fontWeight: '700' }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Note */}
            <Text style={tm.label}>Notitie</Text>
            <TextInput
              style={tm.noteInput}
              placeholder="Voeg een notitie toe..."
              placeholderTextColor="#9ca3af"
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
            />

            {/* Buttons */}
            <TouchableOpacity style={tm.saveBtn} onPress={save}>
              <Text style={tm.saveBtnText}>{task ? 'Opslaan' : 'Toevoegen'}</Text>
            </TouchableOpacity>
            {task && (
              <TouchableOpacity style={tm.deleteBtn} onPress={() => { onDelete(task.id); onClose(); }}>
                <Text style={tm.deleteBtnText}>Verwijderen</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      {datePickerOpen && (
        <DatePickerModal
          value={deadline}
          recurrence={recurrence}
          onSelect={setDeadline}
          onRecurrenceSelect={setRecurrence}
          onClose={() => setDatePickerOpen(false)}
        />
      )}
    </Modal>
  );
}

const tm = StyleSheet.create({
  overlay:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:      { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 24, maxHeight: '85%' },
  handle:     { width: 36, height: 4, backgroundColor: '#d1d5db', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 16 },
  titleInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12, fontSize: 16, color: '#111827', marginBottom: 16 },
  label:      { fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  chipRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip:       { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  chipText:   { fontSize: 13, color: '#374151' },
  dateBtn:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, marginBottom: 14 },
  dateBtnText:{ fontSize: 14, color: '#374151' },
  recurrenceText:{ fontSize: 11, color: '#2563EB', fontWeight: '600', marginTop: 2 },
  timeBtn:    { width: 26, height: 26, borderRadius: 5, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  timeBtnText:{ fontSize: 15, color: '#374151', fontWeight: '700' },
  timeValue:  { fontSize: 15, fontWeight: '700', color: '#111827', minWidth: 24, textAlign: 'center' },
  noteInput:  { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, fontSize: 14, color: '#111827', marginBottom: 16, minHeight: 80, textAlignVertical: 'top' },
  saveBtn:    { backgroundColor: '#2563EB', borderRadius: 8, paddingVertical: 13, alignItems: 'center', marginBottom: 10 },
  saveBtnText:{ color: '#fff', fontSize: 15, fontWeight: '700' },
  deleteBtn:  { backgroundColor: '#FEE2E2', borderRadius: 8, paddingVertical: 13, alignItems: 'center' },
  deleteBtnText: { color: '#DC2626', fontSize: 15, fontWeight: '600' },
});

// ── LIST MODAL ────────────────────────────────────────────────────────────────
const LIST_COLORS = ['#2563EB', '#DC2626', '#E6B400', '#16a34a', '#9333ea', '#f97316'];
const DEFAULT_IDS = ['mine', 'school', 'huishouden', 'werk'];

function ListModal({ onSave, onClose }) {
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('#2563EB');

  return (
    <Modal animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={lm.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={lm.sheet}>
          <View style={lm.handle} />
          <Text style={lm.title}>Nieuwe lijst</Text>
          <TextInput
            style={lm.input}
            placeholder="Lijstnaam..."
            placeholderTextColor="#9ca3af"
            value={label}
            onChangeText={setLabel}
            autoFocus
          />
          <Text style={lm.label}>Kleur</Text>
          <View style={lm.colorRow}>
            {LIST_COLORS.map(c => (
              <TouchableOpacity key={c} onPress={() => setColor(c)}
                style={[lm.colorDot, { backgroundColor: c }, color === c && lm.colorDotActive]} />
            ))}
          </View>
          <TouchableOpacity style={lm.saveBtn} onPress={() => { if (label.trim()) onSave(label.trim(), color); }}>
            <Text style={lm.saveBtnText}>Toevoegen</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const lm = StyleSheet.create({
  overlay:        { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:          { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  handle:         { width: 36, height: 4, backgroundColor: '#d1d5db', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title:          { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 16 },
  input:          { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12, fontSize: 16, color: '#111827', marginBottom: 16 },
  label:          { fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  colorRow:       { flexDirection: 'row', gap: 12, marginBottom: 20 },
  colorDot:       { width: 28, height: 28, borderRadius: 14 },
  colorDotActive: { borderWidth: 3, borderColor: '#111827' },
  saveBtn:        { backgroundColor: '#2563EB', borderRadius: 8, paddingVertical: 13, alignItems: 'center' },
  saveBtnText:    { color: '#fff', fontSize: 15, fontWeight: '700' },
});

// ── TASKS SCREEN ──────────────────────────────────────────────────────────────
export default function TasksScreen() {
  const { tasks, lists, personColors, addTask, updateTask, deleteTask, completeTask, addList, updateList, deleteList, setPagerEnabled } = useData();
  // Gedeelde lijsten tonen in de kleur van de persoon (zo zie je meteen van wie)
  const listColor = (l) => (l.isShared ? (PERSON_COLORS[personColors[l.ownerEmail]]?.dot || l.color) : l.color);
  const [activeList, setActiveList]     = useState('mine');
  const [modalTask, setModalTask]       = useState(undefined); // undefined = closed, null = new task
  const [showListModal, setShowListModal] = useState(false);
  const [editingListId, setEditingListId] = useState(null);
  const [editLabel, setEditLabel]         = useState('');

  // Tik op een eigen, al-actieve lijst → naam bewerken; anders gewoon wisselen
  const onTabPress = (l) => {
    if (l.id === activeList && !l.isShared) { setEditingListId(l.id); setEditLabel(l.label); }
    else setActiveList(l.id);
  };
  const commitRename = (l) => {
    const label = editLabel.trim();
    setEditingListId(null);
    if (label && label !== l.label) updateList({ ...l, label });
  };
  const [addingInline, setAddingInline] = useState(false);
  const [newTitle, setNewTitle]         = useState('');

  // Prioriteit via tikken (zoals web): override = wat je ziet, frozen = sorteer-positie
  // die vastblijft terwijl je doorklikt, en pas na 2s naar de nieuwe plek schuift.
  const [prioOverride, setPrioOverride] = useState({});
  const [frozenPrio, setFrozenPrio]     = useState({});
  const prioTimers = useRef({});
  const PRIO_NEXT = { '': 'hoog', hoog: 'midden', midden: 'laag', laag: '' };
  const PRIO_RANK = { hoog: 0, midden: 1, laag: 2, '': 3 };

  const cyclePrio = (task) => {
    if (task.isShared) return; // prioriteit beheer je op je eigen taken
    const id = task.id;
    const cur = prioOverride[id] ?? task.priority ?? '';
    const next = PRIO_NEXT[cur] ?? 'hoog';
    setPrioOverride(o => ({ ...o, [id]: next }));
    setFrozenPrio(f => (f[id] !== undefined ? f : { ...f, [id]: task.priority || '' }));
    updateTask({ ...task, priority: next });
    if (prioTimers.current[id]) clearTimeout(prioTimers.current[id]);
    prioTimers.current[id] = setTimeout(() => {
      setFrozenPrio(f => { const n = { ...f }; delete n[id]; return n; });
      setPrioOverride(o => { const n = { ...o }; delete n[id]; return n; });
      delete prioTimers.current[id];
    }, 2000);
  };

  const activeListObj = lists.find(l => l.id === activeList) || lists[0];
  const isSharedList  = activeListObj?.isShared === true;
  const canEdit       = !isSharedList || activeListObj?.permission === 'edit';
  const canDeleteList = !isSharedList && lists.filter(l => !l.isShared).length > 1;

  const handleAddList = async (label, color) => {
    const newList = { id: 'list_' + Date.now(), label, color };
    await addList(newList); // seedt meteen álle eigen lijsten in de DB
    setActiveList(newList.id);
    setShowListModal(false);
  };

  const handleDeleteList = () => {
    Alert.alert('Lijst verwijderen', `"${activeListObj?.label}" verwijderen? Taken in deze lijst blijven bestaan.`, [
      { text: 'Annuleer', style: 'cancel' },
      { text: 'Verwijderen', style: 'destructive', onPress: async () => {
        await deleteList(activeList);
        setActiveList(lists.find(l => l.id !== activeList && !l.isShared)?.id || 'mine');
      }},
    ]);
  };

  // Eerst op datum (vroegste boven, geen datum onderaan), dan binnen dezelfde
  // datumgroep op prioriteit (hoog → midden → laag → geen).
  const visibleTasks = tasks
    .filter(t => (t.list || 'mine') === activeList)
    .sort((a, b) => {
      if (a.deadline && b.deadline) { if (a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1; }
      else if (a.deadline && !b.deadline) return -1;
      else if (!a.deadline && b.deadline) return 1;
      const pa = frozenPrio[a.id] !== undefined ? frozenPrio[a.id] : (a.priority || '');
      const pb = frozenPrio[b.id] !== undefined ? frozenPrio[b.id] : (b.priority || '');
      return (PRIO_RANK[pa] ?? 3) - (PRIO_RANK[pb] ?? 3);
    });

  const submitInline = async () => {
    const title = newTitle.trim();
    if (!title) { setAddingInline(false); return; }
    const ownerId = isSharedList ? activeListObj.ownerId : null;
    setNewTitle('');
    await addTask({ title, priority: '', status: '', deadline: null, list: activeList }, ownerId);
  };

  const handleSave = async (taskData) => {
    if (taskData.id) {
      await updateTask(taskData);
    } else {
      const ownerId = isSharedList ? activeListObj.ownerId : null;
      await addTask({ ...taskData, list: activeList }, ownerId);
    }
    setModalTask(undefined);
  };

  // Eén tik op het bolletje voltooit de taak meteen (geen bevestiging). De taak
  // gaat naar de prullenbak (soft-delete) en is dus terug te halen.
  const handleComplete = (task) => {
    if (task.isShared && task.permission !== 'edit') return;
    completeTask(task);
  };

  const renderTask = ({ item }) => {
    const isPast = item.deadline && item.deadline < getTodayKey();
    const canPrio = !item.isShared;
    const dispPrio = prioOverride[item.id] ?? item.priority ?? '';
    return (
      <TouchableOpacity style={s.taskCard} onPress={() => (!item.isShared || item.permission === 'edit') ? setModalTask(item) : null} onLongPress={() => handleComplete(item)}>
        <View style={s.taskLeft}>
          <TouchableOpacity onPress={() => handleComplete(item)} style={s.checkCircle}>
            <Ionicons name="ellipse-outline" size={22} color="#d1d5db" />
          </TouchableOpacity>
          <View style={s.taskInfo}>
            <Text style={s.taskTitle} numberOfLines={1}>{item.title}</Text>
            <View style={s.taskBadges}>
              {item.deadline && (
                <View style={[s.badge, { backgroundColor: isPast ? '#FEE2E2' : '#f3f4f6' }]}>
                  <Text style={[s.badgeText, { color: isPast ? '#DC2626' : '#6b7280' }]}>{formatDeadline(item.deadline)}</Text>
                </View>
              )}
              {item.reminderTime && (
                <View style={[s.badge, { backgroundColor: '#DBEAFE', flexDirection: 'row', alignItems: 'center', gap: 3 }]}>
                  <Ionicons name="alarm-outline" size={10} color="#1d4ed8" />
                  <Text style={[s.badgeText, { color: '#1d4ed8' }]}>{item.reminderTime}</Text>
                </View>
              )}
              {/* Prioriteit — tik om te wisselen. Leeg = onzichtbaar maar nog
                  aantikbaar (leeg → hoog → midden → laag → leeg) */}
              {dispPrio ? (
                <TouchableOpacity disabled={!canPrio} onPress={() => cyclePrio(item)}
                  style={[s.badge, { backgroundColor: PRIO_BG[dispPrio] }]}>
                  <Text style={[s.badgeText, { color: PRIO_COLOR[dispPrio] }]}>{dispPrio}</Text>
                </TouchableOpacity>
              ) : (canPrio && (
                <TouchableOpacity onPress={() => cyclePrio(item)} style={s.prioEmptyTap} />
              ))}
            </View>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.container}>
      {/* List tabs */}
      <View style={{ flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', alignItems: 'center' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={s.listTabsContent}
          onTouchStart={() => setPagerEnabled(false)}
          onTouchEnd={() => setPagerEnabled(true)}
          onTouchCancel={() => setPagerEnabled(true)}
          onScrollEndDrag={() => setPagerEnabled(true)}
          onMomentumScrollEnd={() => setPagerEnabled(true)}>
          {lists.map(l => (
            <TouchableOpacity
              key={l.id}
              style={[s.listTab, activeList === l.id && { borderBottomColor: listColor(l), borderBottomWidth: 2 }]}
              onPress={() => onTabPress(l)}
            >
              <View style={[s.listDot, { backgroundColor: listColor(l) }]} />
              {editingListId === l.id ? (
                <TextInput
                  style={[s.listTabText, { color: '#111827', fontWeight: '700', minWidth: 60, padding: 0 }]}
                  value={editLabel}
                  onChangeText={setEditLabel}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => commitRename(l)}
                  onBlur={() => commitRename(l)}
                />
              ) : (
                <Text style={[s.listTabText, activeList === l.id && { color: '#111827', fontWeight: '700' }]}>{l.label}</Text>
              )}
              {l.isShared && <Ionicons name="person-outline" size={11} color="#9ca3af" />}
            </TouchableOpacity>
          ))}
        </ScrollView>
        {canDeleteList && (
          <TouchableOpacity onPress={handleDeleteList} style={s.tabIconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={18} color="#9ca3af" />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => setShowListModal(true)} style={s.tabIconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="add" size={22} color="#9ca3af" />
        </TouchableOpacity>
      </View>

      {/* Tasks */}
      <FlatList
        data={visibleTasks}
        keyExtractor={item => String(item.id)}
        renderItem={renderTask}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={true}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Ionicons name="checkmark-circle-outline" size={40} color="#e5e7eb" />
            <Text style={s.emptyText}>Nog geen taken</Text>
          </View>
        }
        ListFooterComponent={canEdit ? (
          addingInline ? (
            <View style={s.inlineAddRow}>
              <Ionicons name="add" size={18} color="#2563EB" />
              <TextInput
                style={s.inlineInput}
                placeholder="Taaknaam..."
                placeholderTextColor="#9ca3af"
                value={newTitle}
                onChangeText={setNewTitle}
                autoFocus
                returnKeyType="done"
                blurOnSubmit={false}
                onSubmitEditing={submitInline}
                onBlur={() => { if (!newTitle.trim()) setAddingInline(false); }}
              />
            </View>
          ) : (
            <TouchableOpacity style={s.inlineAddBtn} onPress={() => setAddingInline(true)}>
              <Ionicons name="add" size={18} color="#9ca3af" />
              <Text style={s.inlineAddText}>Taak toevoegen</Text>
            </TouchableOpacity>
          )
        ) : null}
      />

      {/* FAB */}
      {canEdit && (
        <TouchableOpacity style={s.fab} onPress={() => setModalTask(null)}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Task modal */}
      {modalTask !== undefined && (
        <TaskModal
          task={modalTask}
          lists={lists}
          onSave={handleSave}
          onDelete={async (id) => { await deleteTask(id); setModalTask(undefined); }}
          onClose={() => setModalTask(undefined)}
        />
      )}

      {/* List modal */}
      {showListModal && (
        <ListModal onSave={handleAddList} onClose={() => setShowListModal(false)} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f9fafb' },
  listTabsContent: { paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' },
  tabIconBtn:      { paddingHorizontal: 10, paddingVertical: 13 },
  listTab:         { paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  listDot:         { width: 7, height: 7, borderRadius: 4 },
  listTabText:     { fontSize: 13, color: '#9ca3af', fontWeight: '500' },
  list:            { padding: 12, gap: 8 },
  listEmpty:       { flex: 1, justifyContent: 'center' },
  taskCard:        { backgroundColor: '#fff', borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  taskLeft:        { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkCircle:     { padding: 2 },
  taskInfo:        { flex: 1 },
  taskTitle:       { fontSize: 15, color: '#111827', fontWeight: '500', marginBottom: 4 },
  taskBadges:      { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge:           { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  prioEmptyTap:    { minWidth: 30, minHeight: 18 },
  badgeText:       { fontSize: 11, fontWeight: '600' },
  inlineAddBtn:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 6, marginTop: 2 },
  inlineAddText:   { fontSize: 14, color: '#9ca3af', fontWeight: '600' },
  inlineAddRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, marginTop: 2, borderWidth: 1, borderColor: '#2563EB' },
  inlineInput:     { flex: 1, fontSize: 15, color: '#111827', paddingVertical: 6 },
  emptyState:      { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingTop: 80 },
  emptyText:       { fontSize: 15, color: '#9ca3af' },
  fab:             { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', shadowColor: '#2563EB', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
});
