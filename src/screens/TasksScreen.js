import { useState, useRef, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, TextInput, ScrollView, Alert, KeyboardAvoidingView, Platform,
  Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useData } from '../context/DataContext';
import SortableItem from '../components/SortableItem';
import useSortableDrag from '../components/useSortableDrag';
import NoteEditor from '../components/NoteEditor';
import { taskRows, moveItem, orderChanges } from '../taskOrder';
import { formatDeadline, getTodayKey, dateKey, MONTHS, MONTHS_SHORT, DAYS_SHORT, PRIO_COLOR, PRIO_BG, STATUS_COLOR, STATUS_BG, PERSON_COLORS } from '../utils';

// ── CHECK CIRCLE ──────────────────────────────────────────────────────────────
// Het bolletje kleurt bij een tik eerst blauw in en pas daarna verdwijnt de
// taak. Zonder die korte animatie zie je niet of je hem echt hebt geraakt.
function CheckCircle({ onComplete, disabled }) {
  const fill = useRef(new Animated.Value(0)).current;
  const [pressed, setPressed] = useState(false);

  const handlePress = () => {
    if (disabled || pressed) return;
    setPressed(true);
    Animated.timing(fill, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => { if (finished) onComplete(); });
  };

  return (
    <TouchableOpacity onPress={handlePress} style={tc.wrap} activeOpacity={0.7} disabled={disabled}>
      <Ionicons name="ellipse-outline" size={30} color={pressed ? '#2563EB' : '#a1a1a6'} />
      <Animated.View style={[tc.fill, {
        opacity: fill,
        transform: [{ scale: fill.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
      }]}>
        <Ionicons name="checkmark-circle" size={30} color="#2563EB" />
      </Animated.View>
    </TouchableOpacity>
  );
}

const tc = StyleSheet.create({
  wrap: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  fill: { position: 'absolute', top: 9, left: 9 },
});

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
  const initial = new Date();
  const [viewYear, setViewYear]   = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const customMatch = recurrence?.match(/^custom:(\d+):(days|weeks|months)$/);
  const [customOpen, setCustomOpen] = useState(recurrence === 'biweekly' || Boolean(customMatch));
  const [customInterval, setCustomInterval] = useState(customMatch ? Number(customMatch[1]) : 2);
  const [customUnit, setCustomUnit] = useState(customMatch?.[2] || 'weeks');
  const [draftDate, setDraftDate] = useState(value);
  const [draftRecurrence, setDraftRecurrence] = useState(recurrence);

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
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
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
              const isSelected = key === draftDate;
              const isToday    = key === todayK;
              return (
                <TouchableOpacity key={i} style={dp.cell}
                  onPress={() => setDraftDate(key)}>
                  <View style={[dp.daySquare, isSelected && dp.cellSelected, isToday && !isSelected && dp.cellToday]}>
                    <Text style={[dp.cellText, isSelected && dp.cellTextSelected, isToday && !isSelected && dp.cellTextToday]}>{day}</Text>
                  </View>
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
                  style={[dp.repeatBtn, !customOpen && draftRecurrence === key && dp.repeatBtnActive]}
                  onPress={() => { setDraftRecurrence(key); setCustomOpen(false); }}>
                  <Text style={[dp.repeatBtnText, !customOpen && draftRecurrence === key && dp.repeatBtnTextActive]}>{label}</Text>
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
              </View>
            )}

            {(draftRecurrence || customOpen) && (
              <TouchableOpacity onPress={() => { setDraftRecurrence(null); setCustomOpen(false); }}>
                <Text style={dp.noRepeatText}>Geen herhaling</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Clear */}
          <TouchableOpacity style={dp.clearBtn} onPress={() => setDraftDate(null)}>
            <Text style={dp.clearText}>Datum wissen</Text>
          </TouchableOpacity>
          <TouchableOpacity style={dp.customSaveBtn} onPress={() => {
            onSelect(draftDate);
            onRecurrenceSelect(customOpen ? `custom:${customInterval}:${customUnit}` : draftRecurrence);
            onClose();
          }}>
            <Text style={dp.customSaveText}>Opslaan</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );
}

const dp = StyleSheet.create({
  overlay:           { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  picker:            { backgroundColor: '#fff', borderRadius: 12, width: 280, overflow: 'hidden' },
  header:            { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#f5f5f7' },
  navBtn:            { padding: 4, width: 32, alignItems: 'center' },
  navArrow:          { fontSize: 20, color: '#424245' },
  monthLabel:        { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '700', color: '#1d1d1f' },
  dayHeaderRow:      { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 6 },
  dayHeader:         { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#86868b' },
  grid:              { flexDirection: 'row', flexWrap: 'wrap', flexShrink: 0, paddingHorizontal: 8, paddingBottom: 8 },
  cell:              { width: '14.28%', height: 40, flexShrink: 0, justifyContent: 'center', alignItems: 'center' },
  daySquare:         { width: 34, height: 34, justifyContent: 'center', alignItems: 'center', borderRadius: 4 },
  cellSelected:      { backgroundColor: '#2563EB' },
  cellToday:         { backgroundColor: '#DBEAFE' },
  cellText:          { fontSize: 13, lineHeight: 20, textAlign: 'center', includeFontPadding: false, color: '#1d1d1f' },
  cellTextSelected:  { color: '#fff', fontWeight: '700' },
  cellTextToday:     { color: '#2563EB', fontWeight: '700' },
  repeatSection:     { borderTopWidth: 1, borderTopColor: '#f5f5f7', padding: 10 },
  repeatLabel:       { fontSize: 10, fontWeight: '700', color: '#86868b', letterSpacing: 0.8, marginBottom: 6 },
  repeatGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  repeatBtn:         { width: '49%', backgroundColor: '#f5f5f7', borderRadius: 5, paddingVertical: 7, alignItems: 'center' },
  repeatBtnActive:   { backgroundColor: '#DBEAFE' },
  repeatBtnText:     { fontSize: 11, fontWeight: '700', color: '#6e6e73' },
  repeatBtnTextActive:{ color: '#2563EB' },
  customBox:         { marginTop: 8 },
  customPrefix:      { fontSize: 11, color: '#6e6e73', marginBottom: 5 },
  intervalScroll:    { marginBottom: 6 },
  intervalRow:       { flexDirection: 'row', gap: 4 },
  intervalBtn:       { width: 28, height: 28, borderRadius: 5, backgroundColor: '#f5f5f7', alignItems: 'center', justifyContent: 'center' },
  intervalBtnActive: { backgroundColor: '#DBEAFE' },
  intervalText:      { fontSize: 11, color: '#6e6e73', fontWeight: '600' },
  intervalTextActive:{ color: '#2563EB' },
  unitRow:           { flexDirection: 'row', gap: 5 },
  unitBtn:           { flex: 1, backgroundColor: '#f5f5f7', borderRadius: 5, paddingVertical: 6, alignItems: 'center' },
  unitBtnActive:     { backgroundColor: '#DBEAFE' },
  unitText:          { fontSize: 11, color: '#6e6e73', fontWeight: '600' },
  unitTextActive:    { color: '#2563EB' },
  customSaveBtn:     { alignSelf: 'center', marginTop: 8, marginBottom: 16, backgroundColor: '#2563EB', borderRadius: 6, paddingHorizontal: 18, paddingVertical: 10 },
  customSaveText:    { color: '#fff', fontSize: 11, fontWeight: '700' },
  noRepeatText:      { marginTop: 7, fontSize: 11, color: '#86868b' },
  clearBtn:          { padding: 12, borderTopWidth: 1, borderTopColor: '#f5f5f7' },
  clearText:         { fontSize: 12, color: '#86868b', textAlign: 'center' },
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
        <Ionicons name="alarm-outline" size={16} color="#6e6e73" />
        <Text style={[tm.dateBtnText, { color: '#86868b' }]}>Geen herinnering</Text>
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
        <Ionicons name="close-circle" size={18} color="#86868b" />
      </TouchableOpacity>
    </View>
  );
}

// ── TASK MODAL ────────────────────────────────────────────────────────────────
function TaskModal({ task, lists, initialList = 'mine', onSave, onDelete, onClose }) {
  const [title,    setTitle]    = useState(task?.title || '');
  const [deadline, setDeadline] = useState(task?.deadline || null);
  const [reminderTime, setReminderTime] = useState(task?.reminderTime || null);
  const [recurrence, setRecurrence] = useState(task?.recurrence || null);
  const [priority, setPriority] = useState(task?.priority || '');
  const [note,     setNote]     = useState(task?.note || '');
  const [list,     setList]     = useState(task?.list || initialList);
  const [listPickerOpen, setListPickerOpen] = useState(false);
  const [noteEditorOpen, setNoteEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const status = task?.status || ''; // status-veld blijft bestaan maar wordt niet meer getoond

  const save = async () => {
    if (saveLock.current) return;
    if (!title.trim()) { Alert.alert('Voer een titel in'); return; }
    saveLock.current = true;
    setSaving(true);
    try {
      await onSave({ ...(task || {}), title: title.trim(), note, deadline, reminderTime, recurrence, priority, status, list });
    } catch { Alert.alert('Niet opgeslagen', 'Opslaan is niet gelukt. Je tekst staat nog in dit venster. Probeer het opnieuw.'); }
    finally { saveLock.current = false; setSaving(false); }
  };

  const PRIOS   = [['', '—'], ['laag', 'Laag'], ['midden', 'Midden'], ['hoog', 'Hoog']];

  return (
    <Modal animationType="slide" transparent onRequestClose={() => {
      if (saving) return;
      if (noteEditorOpen) setNoteEditorOpen(false);
      else if (datePickerOpen) setDatePickerOpen(false);
      else onClose();
    }}>
      <KeyboardAvoidingView style={tm.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => !saving && onClose()} />
        <View style={tm.sheet}>
          <View style={tm.handle} />
          <Text style={tm.sheetTitle}>{task ? 'Taak bewerken' : 'Taak toevoegen'}</Text>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" pointerEvents={saving ? 'none' : 'auto'}>
            <TextInput
              style={tm.titleInput}
              placeholder="Taaknaam..."
              placeholderTextColor="#86868b"
              value={title}
              onChangeText={setTitle}
              autoFocus={!task}
              multiline
              editable={!saving}
            />

            {/* List */}
            <TouchableOpacity disabled={saving} style={tm.dateBtn} onPress={() => setListPickerOpen(open => !open)}
              accessibilityRole="button" accessibilityState={{ expanded: listPickerOpen }}>
              <Text style={[tm.dateBtnText, { flex: 1 }]} numberOfLines={1}>Van lijst wisselen: {lists.find(l => l.id === list)?.label || 'Mijn taken'}</Text>
              <Ionicons name={listPickerOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#6e6e73" />
            </TouchableOpacity>
            {listPickerOpen && <View style={{ borderWidth: 1, borderColor: '#e5e5ea', borderRadius: 8, marginBottom: 14 }}>
              {lists.map(l => <TouchableOpacity key={l.id} disabled={saving} style={{ padding: 12, flexDirection: 'row', gap: 8 }}
                onPress={() => { setList(l.id); setListPickerOpen(false); }}>
                <Text style={{ flex: 1, color: '#1d1d1f' }}>{l.label}</Text>
                {l.id === list && <Ionicons name="checkmark" size={18} color="#2563EB" />}
              </TouchableOpacity>)}
            </View>}

            {/* Date */}
            <Text style={tm.label}>Datum</Text>
            <TouchableOpacity style={tm.dateBtn} onPress={() => setDatePickerOpen(true)}>
              <Ionicons name="calendar-outline" size={16} color="#6e6e73" />
              <View style={{ flex: 1 }}>
                <Text style={[tm.dateBtnText, !deadline && { color: '#86868b' }]}>
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
            <TouchableOpacity disabled={saving} style={tm.noteInput} onPress={() => setNoteEditorOpen(true)}>
              <Text style={{ color: note ? '#1d1d1f' : '#86868b', fontSize: 14 }} numberOfLines={3}>{note || 'Voeg een notitie toe...'}</Text>
            </TouchableOpacity>

            {/* Buttons */}
            <TouchableOpacity style={tm.saveBtn} disabled={saving} onPress={save}>
              <Text style={tm.saveBtnText}>{saving ? 'Opslaan...' : task ? 'Opslaan' : 'Toevoegen'}</Text>
            </TouchableOpacity>
            {task && (
              <TouchableOpacity disabled={saving} style={tm.deleteBtn} onPress={() => { onDelete(task.id); onClose(); }}>
                <Text style={tm.deleteBtnText}>Verwijderen</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      {noteEditorOpen && <NoteEditor value={note} onChange={setNote} onClose={() => setNoteEditorOpen(false)} />}
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
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#1d1d1f', marginBottom: 16 },
  titleInput: { borderWidth: 1, borderColor: '#e5e5ea', borderRadius: 8, padding: 12, fontSize: 16, color: '#1d1d1f', marginBottom: 16 },
  label:      { fontSize: 12, fontWeight: '600', color: '#6e6e73', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  chipRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip:       { borderWidth: 1, borderColor: '#e5e5ea', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  chipText:   { fontSize: 13, color: '#424245' },
  dateBtn:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#e5e5ea', borderRadius: 8, padding: 10, marginBottom: 14 },
  dateBtnText:{ fontSize: 14, color: '#424245' },
  recurrenceText:{ fontSize: 11, color: '#2563EB', fontWeight: '600', marginTop: 2 },
  timeBtn:    { width: 26, height: 26, borderRadius: 5, backgroundColor: '#f5f5f7', justifyContent: 'center', alignItems: 'center' },
  timeBtnText:{ fontSize: 15, color: '#424245', fontWeight: '700' },
  timeValue:  { fontSize: 15, fontWeight: '700', color: '#1d1d1f', minWidth: 24, textAlign: 'center' },
  noteInput:  { borderWidth: 1, borderColor: '#e5e5ea', borderRadius: 8, padding: 10, fontSize: 14, color: '#1d1d1f', marginBottom: 16, minHeight: 80, textAlignVertical: 'top' },
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
            placeholderTextColor="#86868b"
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
  title:          { fontSize: 18, fontWeight: '700', color: '#1d1d1f', marginBottom: 16 },
  input:          { borderWidth: 1, borderColor: '#e5e5ea', borderRadius: 8, padding: 12, fontSize: 16, color: '#1d1d1f', marginBottom: 16 },
  label:          { fontSize: 12, fontWeight: '600', color: '#6e6e73', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  colorRow:       { flexDirection: 'row', gap: 12, marginBottom: 20 },
  colorDot:       { width: 28, height: 28, borderRadius: 14 },
  colorDotActive: { borderWidth: 3, borderColor: '#1d1d1f' },
  saveBtn:        { backgroundColor: '#2563EB', borderRadius: 8, paddingVertical: 13, alignItems: 'center' },
  saveBtnText:    { color: '#fff', fontSize: 15, fontWeight: '700' },
});

// ── TRASH / VOLTOOID MODAL ────────────────────────────────────────────────────
function TrashModal({ onClose }) {
  const { loadDeleted, restoreTask, purgeTask } = useData();
  const [items, setItems] = useState(null); // null = nog aan het laden

  useEffect(() => { loadDeleted().then(setItems).catch(() => setItems([])); }, []);

  const handleRestore = async (id) => {
    setItems(list => list.filter(t => t.id !== id));
    await restoreTask(id);
  };
  const handlePurge = (task) => {
    Alert.alert('Definitief verwijderen', `"${task.title}" permanent verwijderen? Dit kan niet ongedaan worden gemaakt.`, [
      { text: 'Annuleer', style: 'cancel' },
      { text: 'Verwijderen', style: 'destructive', onPress: async () => {
        setItems(list => list.filter(t => t.id !== task.id));
        await purgeTask(task.id);
      }},
    ]);
  };

  const fmtWhen = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  };

  return (
    <Modal animationType="slide" transparent onRequestClose={onClose}>
      <View style={tr.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={tr.sheet}>
          <View style={tr.handle} />
          <View style={tr.headerRow}>
            <Text style={tr.title}>Voltooid & verwijderd</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color="#86868b" />
            </TouchableOpacity>
          </View>

          {items === null ? (
            <View style={tr.empty}><Text style={tr.emptyText}>Laden...</Text></View>
          ) : items.length === 0 ? (
            <View style={tr.empty}>
              <Ionicons name="checkmark-done-outline" size={36} color="#e5e5ea" />
              <Text style={tr.emptyText}>Niets in de prullenbak</Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {items.map(task => (
                <View key={task.id} style={tr.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={tr.rowTitle} numberOfLines={1}>{task.title}</Text>
                    {task.deletedAt ? <Text style={tr.rowMeta}>Verwijderd {fmtWhen(task.deletedAt)}</Text> : null}
                  </View>
                  <TouchableOpacity style={tr.restoreBtn} onPress={() => handleRestore(task.id)}>
                    <Ionicons name="arrow-undo-outline" size={15} color="#2563EB" />
                    <Text style={tr.restoreText}>Herstel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={tr.purgeBtn} onPress={() => handlePurge(task)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Ionicons name="trash-outline" size={16} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const tr = StyleSheet.create({
  overlay:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:      { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 24, maxHeight: '85%' },
  handle:     { width: 36, height: 4, backgroundColor: '#d1d5db', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  headerRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title:      { fontSize: 18, fontWeight: '700', color: '#1d1d1f' },
  empty:      { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 48 },
  emptyText:  { fontSize: 14, color: '#86868b' },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f5f5f7' },
  rowTitle:   { fontSize: 15, color: '#424245', fontWeight: '500' },
  rowMeta:    { fontSize: 11, color: '#86868b', marginTop: 2 },
  restoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#DBEAFE', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  restoreText:{ fontSize: 12, color: '#2563EB', fontWeight: '700' },
  purgeBtn:   { padding: 6 },
});

// ── TASKS SCREEN ──────────────────────────────────────────────────────────────
function SortableCell({ children, style, item, onLayout, onFocusCapture }) {
  return <View onLayout={onLayout} onFocusCapture={onFocusCapture}
    style={[style, { zIndex: item.dragging ? 20 : 0 }]}>{children}</View>;
}

export default function TasksScreen() {
  const { tasks, lists, personColors, addTask, updateTask, deleteTask, completeTask, addList, updateList, deleteList, setPagerEnabled, isSharedVisible, reorderLists, saveTaskOrder, ordering } = useData();
  const [dragging, setDragging] = useState(false);
  const taskListRef = useRef(null);
  const taskViewportRef = useRef(null);
  const tabsRef = useRef(null);
  const tabsViewportRef = useRef(null);
  const [focusTaskId, setFocusTaskId] = useState(null);
  const focusTarget = useRef(null);
  const focusTimer = useRef(null);
  const rowSizes = useRef({});
  const tabSizes = useRef({});
  const [sectionDraft, setSectionDraft] = useState(null);
  const [sectionSaving, setSectionSaving] = useState(false);
  const onDragging = (value) => { setDragging(value); setPagerEnabled(!value); };
  const reportOrderError = () => Alert.alert('Niet volledig opgeslagen', 'De indeling kon niet volledig worden opgeslagen. Controleer je verbinding en probeer het opnieuw.');
  // Gedeelde lijsten die de ontvanger heeft verborgen niet als tab tonen
  const visibleLists = lists.filter(l => !l.isShared || isSharedVisible(l.id));
  // Gedeelde lijsten tonen in de kleur van de persoon (zo zie je meteen van wie)
  const listColor = (l) => (l.isShared ? (PERSON_COLORS[personColors[l.ownerEmail]]?.dot || l.color) : l.color);
  const [activeList, setActiveList]     = useState('mine');
  const [modalTask, setModalTask]       = useState(undefined); // undefined = closed, null = new task
  const [showListModal, setShowListModal] = useState(false);
  const [showTrash, setShowTrash]         = useState(false);
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
    if (label && label !== l.label) updateList({ ...l, label }).catch(reportOrderError);
  };
  const [addingInline, setAddingInline] = useState(false);
  const [newTitle, setNewTitle]         = useState('');

  // Prioriteit via tikken (zoals web): override = wat je ziet, frozen = sorteer-positie
  // die vastblijft terwijl je doorklikt, en pas na 2s naar de nieuwe plek schuift.
  const [prioOverride, setPrioOverride] = useState({});
  const [frozenPrio, setFrozenPrio]     = useState({});
  const prioTimers = useRef({});
  const PRIO_NEXT = { '': 'hoog', hoog: 'midden', midden: 'laag', laag: '' };

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

  // Staat de actieve lijst op een verborgen gedeelde lijst? Val terug op 'mine'.
  useEffect(() => {
    if (!visibleLists.some(l => l.id === activeList)) setActiveList('mine');
  }, [visibleLists, activeList]);

  const activeListObj = lists.find(l => l.id === activeList) || lists[0];
  const isSharedList  = activeListObj?.isShared === true;
  const canEdit       = !isSharedList || activeListObj?.permission === 'edit';
  const canDeleteList = !isSharedList && activeList !== 'mine' && lists.filter(l => !l.isShared).length > 1;

  const handleAddList = async (label, color) => {
    const newList = { id: 'list_' + Date.now(), label, color };
    try {
      await addList(newList);
      setActiveList(newList.id);
      setShowListModal(false);
    } catch { reportOrderError(); }
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

  const visibleTasks = tasks.filter(t => (t.list || 'mine') === activeList);
  const sections = isSharedList ? [] : activeListObj?.sections || [];
  const rows = taskRows(isSharedList ? visibleTasks.map(t => ({ ...t, sortOrder: null })) : visibleTasks, sections, frozenPrio);
  const rowIds = rows.map(r => r.id);
  const ownLists = visibleLists.filter(l => !l.isShared);
  const moveRow = (id, to) => saveTaskOrder(activeList, orderChanges(moveItem(rows, id, to))).catch(reportOrderError);
  const moveTab = (id, to) => reorderLists(moveItem(ownLists, id, to)).catch(reportOrderError);
  const rowDrag = useSortableDrag({ ids: rowIds, sizes: rowSizes.current, scrollRef: taskListRef,
    viewportRef: taskViewportRef, onMove: moveRow, onDragging });
  const tabDrag = useSortableDrag({ ids: ownLists.map(l => l.id), sizes: tabSizes.current, scrollRef: tabsRef,
    viewportRef: tabsViewportRef, horizontal: true, onMove: moveTab, onDragging });
  useEffect(() => {
    if (!focusTaskId) return;
    const index = rows.findIndex(row => row.id === focusTaskId);
    if (index < 0) return;
    focusTarget.current = { index, attempts: 0 };
    clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => taskListRef.current?.scrollToIndex({ index, viewPosition: 0.4, animated: true }), 250);
    setFocusTaskId(null);
  }, [focusTaskId, activeList, tasks]);
  useEffect(() => () => clearTimeout(focusTimer.current), []);
  const saveSection = async (remove = false) => {
    if (sectionSaving || (!remove && !sectionDraft.title.trim())) return;
    setSectionSaving(true);
    const section = { ...sectionDraft, title: sectionDraft.title.trim() };
    let next = rows.filter(r => !remove || r.id !== section.id);
    if (!remove) next = next.some(r => r.id === section.id)
      ? next.map(r => r.id === section.id ? { ...r, section } : r)
      : [...next, { kind: 'section', id: section.id, section }];
    try {
      await saveTaskOrder(activeList, orderChanges(next));
      setSectionDraft(null);
    } catch { reportOrderError(); } finally { setSectionSaving(false); }
  };

  const submitInline = async () => {
    const title = newTitle.trim();
    if (!title) { setAddingInline(false); return; }
    const ownerId = isSharedList ? activeListObj.ownerId : null;
    setNewTitle('');
    await addTask({ title, priority: '', status: '', deadline: null, list: activeList }, ownerId);
  };

  const handleSave = async (taskData) => {
    const destination = lists.find(l => l.id === taskData.list);
    let saved;
    if (taskData.id) {
      await updateTask(taskData);
      saved = taskData;
    } else {
      saved = await addTask(taskData, destination?.isShared ? destination.ownerId : null);
    }
    setModalTask(undefined);
    setActiveList(taskData.list);
    setFocusTaskId(saved.id);
  };

  // Eén tik op het bolletje voltooit de taak meteen (geen bevestiging). De taak
  // gaat naar de prullenbak (soft-delete) en is dus terug te halen.
  const handleComplete = (task) => {
    if (task.isShared && task.permission !== 'edit') return;
    completeTask(task);
  };

  const renderTask = ({ item }) => {
    const isPast  = item.deadline && item.deadline < getTodayKey();
    const isToday = item.deadline === getTodayKey();
    const canPrio = !item.isShared;
    const dispPrio = prioOverride[item.id] ?? item.priority ?? '';
    return (
      <TouchableOpacity style={s.taskCard} onPress={() => (!item.isShared || item.permission === 'edit') ? setModalTask(item) : null}>
        <View style={s.taskLeft}>
          <CheckCircle
            key={`${item.id}:${item.lastCompletedAt || ''}`}
            onComplete={() => handleComplete(item)}
            disabled={item.isShared && item.permission !== 'edit'}
          />
          <View style={s.taskInfo}>
            <Text style={s.taskTitle} numberOfLines={1}>{item.title}</Text>
            <View style={s.taskBadges}>
              {item.deadline && (
                <View style={[s.badge, { minWidth: item.recurrence ? 100 : undefined, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: isPast ? '#FEE2E2' : isToday ? '#DBEAFE' : '#f5f5f7' }]}>
                  <Text style={[s.badgeText, { flex: item.recurrence ? 1 : undefined, color: isPast ? '#DC2626' : isToday ? '#1d4ed8' : '#6e6e73' }]}>{formatDeadline(item.deadline)}</Text>
                  {item.recurrence && <Ionicons name="repeat-outline" size={13} color="#6e6e73" accessibilityLabel="Herhalende taak" />}
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
      <View style={{ flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e5ea', alignItems: 'center' }}>
        <View ref={tabsViewportRef} collapsable={false} style={{ flex: 1 }}>
        <ScrollView ref={tabsRef} horizontal scrollEnabled={!dragging} showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.listTabsContent}
          onScroll={tabDrag.onScroll} onContentSizeChange={tabDrag.onContentSizeChange} scrollEventThrottle={16}
          onTouchStart={() => setPagerEnabled(false)}
          onTouchEnd={() => setPagerEnabled(true)}
          onTouchCancel={() => setPagerEnabled(true)}
          onScrollEndDrag={() => setPagerEnabled(true)}
          onMomentumScrollEnd={() => setPagerEnabled(true)}>
          {visibleLists.map(l => (
            <SortableItem key={l.id} id={l.id} ids={ownLists.map(x => x.id)} sizes={tabSizes.current}
              horizontal disabled={l.isShared || ordering || editingListId === l.id} label={l.label} onMove={moveTab} drag={tabDrag}>
            <TouchableOpacity
              key={l.id}
              style={[s.listTab, activeList === l.id && { borderBottomColor: listColor(l), borderBottomWidth: 2 }]}
              onPress={() => onTabPress(l)}
            >
              <View style={[s.listDot, { backgroundColor: listColor(l) }]} />
              {editingListId === l.id ? (
                <TextInput
                  style={[s.listTabText, { color: '#1d1d1f', fontWeight: '700', minWidth: 60, padding: 0 }]}
                  value={editLabel}
                  onChangeText={setEditLabel}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => commitRename(l)}
                  onBlur={() => commitRename(l)}
                />
              ) : (
                <Text style={[s.listTabText, activeList === l.id && { color: '#1d1d1f', fontWeight: '700' }]}>{l.label}</Text>
              )}
              {l.isShared && <Ionicons name="person-outline" size={11} color="#86868b" />}
            </TouchableOpacity>
            </SortableItem>
          ))}
        </ScrollView>
        </View>
        {canDeleteList && (
          <TouchableOpacity onPress={handleDeleteList} style={s.tabIconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={18} color="#86868b" />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => setShowTrash(true)} style={s.tabIconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="archive-outline" size={17} color="#86868b" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowListModal(true)} style={s.tabIconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="add" size={22} color="#86868b" />
        </TouchableOpacity>
      </View>

      {/* Tasks */}
      <View ref={taskViewportRef} collapsable={false} style={{ flex: 1 }}>
      <FlatList ref={taskListRef}
        data={rows.map(row => ({ ...row, dragging: row.id === rowDrag.preview?.id }))}
        CellRendererComponent={SortableCell}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <SortableItem id={item.id} ids={rowIds} sizes={rowSizes.current}
            disabled={isSharedList || ordering} label={item.kind === 'section' ? item.section.title : item.task.title}
            onMove={moveRow} drag={rowDrag}>
            {item.kind === 'task' ? renderTask({ item: item.task }) : (
              <TouchableOpacity onPress={() => setSectionDraft({ ...item.section })}
                disabled={ordering} accessibilityLabel={`Sectie ${item.section.title} bewerken`}
                style={{ backgroundColor: item.section.color || '#2563EB', borderRadius: 10, padding: 14 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: item.section.color === '#E6B400' ? '#1d1d1f' : '#fff' }}>{item.section.title}</Text>
              </TouchableOpacity>
            )}
          </SortableItem>
        )}
        scrollEnabled={!dragging}
        windowSize={rowDrag.preview ? Math.max(21, rows.length * 2) : 21}
        maxToRenderPerBatch={rowDrag.preview ? Math.max(10, rows.length) : 10}
        onScroll={rowDrag.onScroll}
        onContentSizeChange={rowDrag.onContentSizeChange}
        scrollEventThrottle={16}
        onScrollToIndexFailed={({ averageItemLength, index }) => {
          const target = focusTarget.current;
          if (!target || target.index !== index || target.attempts++ >= 8) return;
          taskListRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: false });
          clearTimeout(focusTimer.current);
          focusTimer.current = setTimeout(() => taskListRef.current?.scrollToIndex({ index, viewPosition: 0.4, animated: true }), 200);
        }}
        removeClippedSubviews={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={true}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Ionicons name="checkmark-circle-outline" size={40} color="#e5e5ea" />
            <Text style={s.emptyText}>Nog geen taken</Text>
          </View>
        }
        ListFooterComponent={canEdit ? (<View>
          {!isSharedList && <TouchableOpacity disabled={ordering} style={s.inlineAddBtn}
            onPress={() => setSectionDraft({ id: 'sec_' + Date.now(), title: '', color: '#2563EB' })}>
            <Ionicons name="add-outline" size={18} color="#86868b" />
            <Text style={s.inlineAddText}>Sectie toevoegen</Text>
          </TouchableOpacity>}
          {(
          addingInline ? (
            <View style={s.inlineAddRow}>
              <Ionicons name="add" size={18} color="#2563EB" />
              <TextInput
                style={s.inlineInput}
                placeholder="Taaknaam..."
                placeholderTextColor="#86868b"
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
              <Ionicons name="add" size={18} color="#86868b" />
              <Text style={s.inlineAddText}>Taak toevoegen</Text>
            </TouchableOpacity>
          )
          )}
        </View>) : null}
      />
      </View>

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
          initialList={activeList}
          lists={lists.filter(l => {
            const source = modalTask ? lists.find(x => x.id === modalTask.list) : activeListObj;
            return source?.isShared ? l.isShared && l.ownerId === source.ownerId && l.permission === 'edit' : !l.isShared;
          })}
          onSave={handleSave}
          onDelete={async (id) => { await deleteTask(id); setModalTask(undefined); }}
          onClose={() => setModalTask(undefined)}
        />
      )}

      {/* List modal */}
      {sectionDraft && <Modal transparent animationType="fade" onRequestClose={() => !sectionSaving && setSectionDraft(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={lm.overlay}>
          <View style={lm.sheet}>
            <Text style={lm.title}>Sectie bewerken</Text>
            <TextInput style={lm.input} value={sectionDraft.title} placeholder="Naam van de sectie" autoFocus
              editable={!sectionSaving} onChangeText={title => setSectionDraft(s => ({ ...s, title }))} />
            <View style={{ flexDirection: 'row', gap: 14, marginBottom: 20 }}>
              {['#2563EB', '#DC2626', '#E6B400'].map((color, i) => <TouchableOpacity key={color}
                disabled={sectionSaving} accessibilityLabel={['Blauw', 'Rood', 'Geel'][i]} accessibilityRole="button"
                accessibilityState={{ selected: sectionDraft.color === color }}
                onPress={() => setSectionDraft(s => ({ ...s, color }))}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: color, borderWidth: sectionDraft.color === color ? 3 : 0, borderColor: '#1d1d1f' }} />)}
            </View>
            <TouchableOpacity style={lm.saveBtn} disabled={sectionSaving || !sectionDraft.title.trim()} onPress={() => saveSection()}>
              <Text style={lm.saveBtnText}>{sectionSaving ? 'Opslaan...' : 'Opslaan'}</Text>
            </TouchableOpacity>
            {sections.some(s => s.id === sectionDraft.id) && <TouchableOpacity disabled={sectionSaving} style={{ padding: 12 }} onPress={() => saveSection(true)}>
              <Text style={{ color: '#DC2626', textAlign: 'center' }}>Sectie verwijderen (taken blijven staan)</Text>
            </TouchableOpacity>}
            <TouchableOpacity disabled={sectionSaving} style={{ padding: 12 }} onPress={() => setSectionDraft(null)}>
              <Text style={{ color: '#6e6e73', textAlign: 'center' }}>Annuleren</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>}
      {showListModal && (
        <ListModal onSave={handleAddList} onClose={() => setShowListModal(false)} />
      )}

      {/* Prullenbak / voltooid */}
      {showTrash && <TrashModal onClose={() => setShowTrash(false)} />}
    </View>
  );
}

const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f5f5f7' },
  listTabsContent: { paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' },
  tabIconBtn:      { paddingHorizontal: 10, paddingVertical: 13 },
  listTab:         { paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  listDot:         { width: 7, height: 7, borderRadius: 4 },
  listTabText:     { fontSize: 15, color: '#86868b', fontWeight: '600', letterSpacing: -0.15 },
  list:            { padding: 12, gap: 8 },
  listEmpty:       { flex: 1, justifyContent: 'center' },
  taskCard:        { backgroundColor: '#fff', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  taskLeft:        { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  taskInfo:        { flex: 1 },
  taskTitle:       { fontSize: 16, color: '#1d1d1f', fontWeight: '500', letterSpacing: -0.16, marginBottom: 4 },
  taskBadges:      { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge:           { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  prioEmptyTap:    { minWidth: 30, minHeight: 18 },
  badgeText:       { fontSize: 11, fontWeight: '600' },
  inlineAddBtn:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 6, marginTop: 2 },
  inlineAddText:   { fontSize: 14, color: '#86868b', fontWeight: '600' },
  inlineAddRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, marginTop: 2, borderWidth: 1, borderColor: '#2563EB' },
  inlineInput:     { flex: 1, fontSize: 15, color: '#1d1d1f', paddingVertical: 6 },
  emptyState:      { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingTop: 80 },
  emptyText:       { fontSize: 15, color: '#86868b' },
  fab:             { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', shadowColor: '#2563EB', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
});
