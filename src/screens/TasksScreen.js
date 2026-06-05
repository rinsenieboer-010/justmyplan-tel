import { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, TextInput, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useData } from '../context/DataContext';
import { formatDeadline, getTodayKey, dateKey, MONTHS, MONTHS_SHORT, DAYS_SHORT, PRIO_COLOR, PRIO_BG, STATUS_COLOR, STATUS_BG, PERSON_COLORS } from '../utils';

// ── DATE PICKER ───────────────────────────────────────────────────────────────
function DatePickerModal({ value, onSelect, onClose }) {
  const initial = value ? new Date(value + 'T12:00:00') : new Date();
  const [viewYear, setViewYear]   = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

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
  clearBtn:          { padding: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  clearText:         { fontSize: 12, color: '#9ca3af', textAlign: 'center' },
});

// ── TASK MODAL ────────────────────────────────────────────────────────────────
function TaskModal({ task, lists, onSave, onDelete, onClose }) {
  const [title,    setTitle]    = useState(task?.title || '');
  const [deadline, setDeadline] = useState(task?.deadline || null);
  const [priority, setPriority] = useState(task?.priority || '');
  const [status,   setStatus]   = useState(task?.status || '');
  const [note,     setNote]     = useState(task?.note || '');
  const [list,     setList]     = useState(task?.list || 'mine');
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const save = () => {
    if (!title.trim()) { Alert.alert('Voer een titel in'); return; }
    onSave({ ...(task || {}), title: title.trim(), deadline, priority, status, note, list });
  };

  const PRIOS   = [['', '—'], ['laag', 'Laag'], ['midden', 'Midden'], ['hoog', 'Hoog']];
  const STATUSES = [['', '—'], ['open', 'Open'], ['bezig', 'Bezig'], ['klaar', 'Klaar']];

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

            {/* Deadline */}
            <Text style={tm.label}>Deadline</Text>
            <TouchableOpacity style={tm.dateBtn} onPress={() => setDatePickerOpen(true)}>
              <Ionicons name="calendar-outline" size={16} color="#6b7280" />
              <Text style={[tm.dateBtnText, !deadline && { color: '#9ca3af' }]}>
                {deadline ? formatDeadline(deadline) + ' (' + deadline + ')' : 'Geen datum'}
              </Text>
            </TouchableOpacity>

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

            {/* Status */}
            <Text style={tm.label}>Status</Text>
            <View style={tm.chipRow}>
              {STATUSES.map(([val, label]) => (
                <TouchableOpacity key={val} style={[tm.chip, status === val && { backgroundColor: STATUS_BG[val], borderColor: STATUS_COLOR[val] }]}
                  onPress={() => setStatus(val)}>
                  <Text style={[tm.chipText, status === val && { color: STATUS_COLOR[val], fontWeight: '700' }]}>{label}</Text>
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
        <DatePickerModal value={deadline} onSelect={setDeadline} onClose={() => setDatePickerOpen(false)} />
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
  const { tasks, lists, personColors, addTask, updateTask, deleteTask, completeTask, addList, deleteList } = useData();
  // Gedeelde lijsten tonen in de kleur van de persoon (zo zie je meteen van wie)
  const listColor = (l) => (l.isShared ? (PERSON_COLORS[personColors[l.ownerEmail]]?.dot || l.color) : l.color);
  const [activeList, setActiveList]     = useState('mine');
  const [modalTask, setModalTask]       = useState(undefined); // undefined = closed, null = new task
  const [showListModal, setShowListModal] = useState(false);

  const activeListObj = lists.find(l => l.id === activeList) || lists[0];
  const isSharedList  = activeListObj?.isShared === true;
  const canEdit       = !isSharedList || activeListObj?.permission === 'edit';
  const canDeleteList = !isSharedList && lists.filter(l => !l.isShared).length > 1;

  const handleAddList = async (label, color) => {
    // Als nog op defaults, sla die eerst op in DB zodat ze niet verdwijnen
    const ownLists = lists.filter(l => !l.isShared);
    const usingDefaults = ownLists.every(l => DEFAULT_IDS.includes(l.id));
    if (usingDefaults) {
      for (const l of ownLists) await addList(l);
    }
    const newList = { id: 'list_' + Date.now(), label, color };
    await addList(newList);
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

  const visibleTasks = tasks
    .filter(t => (t.list || 'mine') === activeList)
    .sort((a, b) => {
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return a.deadline.localeCompare(b.deadline);
    });

  const handleSave = async (taskData) => {
    if (taskData.id) {
      await updateTask(taskData);
    } else {
      const ownerId = isSharedList ? activeListObj.ownerId : null;
      await addTask({ ...taskData, list: activeList }, ownerId);
    }
    setModalTask(undefined);
  };

  const handleComplete = (task) => {
    if (task.isShared && task.permission !== 'edit') return;
    Alert.alert('Taak voltooien', 'Markeer als voltooid?', [
      { text: 'Annuleer', style: 'cancel' },
      { text: 'Voltooien', onPress: () => completeTask(task) },
    ]);
  };

  const renderTask = ({ item }) => {
    const isPast = item.deadline && item.deadline < getTodayKey();
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
              {item.priority && (
                <View style={[s.badge, { backgroundColor: PRIO_BG[item.priority] }]}>
                  <Text style={[s.badgeText, { color: PRIO_COLOR[item.priority] }]}>{item.priority}</Text>
                </View>
              )}
              {item.status && (
                <View style={[s.badge, { backgroundColor: STATUS_BG[item.status] }]}>
                  <Text style={[s.badgeText, { color: STATUS_COLOR[item.status] }]}>{item.status}</Text>
                </View>
              )}
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={s.listTabsContent}>
          {lists.map(l => (
            <TouchableOpacity
              key={l.id}
              style={[s.listTab, activeList === l.id && { borderBottomColor: listColor(l), borderBottomWidth: 2 }]}
              onPress={() => setActiveList(l.id)}
            >
              <View style={[s.listDot, { backgroundColor: listColor(l) }]} />
              <Text style={[s.listTabText, activeList === l.id && { color: '#111827', fontWeight: '700' }]}>{l.label}</Text>
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
        contentContainerStyle={[s.list, visibleTasks.length === 0 && s.listEmpty]}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Ionicons name="checkmark-circle-outline" size={48} color="#d1d5db" />
            <Text style={s.emptyText}>Geen taken in deze lijst</Text>
          </View>
        }
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
  badgeText:       { fontSize: 11, fontWeight: '600' },
  emptyState:      { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingTop: 80 },
  emptyText:       { fontSize: 15, color: '#9ca3af' },
  fab:             { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', shadowColor: '#2563EB', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
});
