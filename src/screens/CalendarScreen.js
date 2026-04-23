import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, TextInput, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useData } from '../context/DataContext';
import { dateKey, getTodayKey, getWeekDates, DAYS_SHORT, MONTHS, MONTHS_SHORT, pad } from '../utils';

const EVENT_BG     = { blue: '#DBEAFE', red: '#FEE2E2', yellow: '#FFF176', green: '#DCFCE7', purple: '#F3E8FF' };
const EVENT_BORDER = { blue: '#2563EB', red: '#DC2626', yellow: '#E6B400', green: '#16a34a', purple: '#9333ea' };
const EVENT_TEXT   = { blue: '#1d4ed8', red: '#b91c1c', yellow: '#92400e', green: '#15803d', purple: '#7e22ce' };

const PRIO_BG    = { '': '#f3f4f6', hoog: '#FEE2E2', midden: '#FFF176', laag: '#DBEAFE' };
const PRIO_COLOR = { '': '#9ca3af', hoog: '#DC2626', midden: '#92400e', laag: '#1d4ed8' };

const SLOT_H    = 60;   // pixels per uur
const HOUR_FROM = 7;
const HOUR_TO   = 22;
const HOURS     = Array.from({ length: HOUR_TO - HOUR_FROM }, (_, i) => i + HOUR_FROM);
const TIME_COL  = 44;   // breedte van tijdlabel-kolom

// ── TIME PICKER ───────────────────────────────────────────────────────────────
function TimeRow({ label, h, m, onChangeH, onChangeM }) {
  return (
    <View style={tp.row}>
      <Text style={tp.label}>{label}</Text>
      <View style={tp.controls}>
        <TouchableOpacity style={tp.btn} onPress={() => onChangeH(Math.max(HOUR_FROM, h - 1))}>
          <Text style={tp.btnText}>−</Text>
        </TouchableOpacity>
        <Text style={tp.timeText}>{pad(h)}</Text>
        <TouchableOpacity style={tp.btn} onPress={() => onChangeH(Math.min(HOUR_TO - 1, h + 1))}>
          <Text style={tp.btnText}>+</Text>
        </TouchableOpacity>
        <Text style={tp.colon}>:</Text>
        <TouchableOpacity style={tp.btn} onPress={() => onChangeM(m === 0 ? 30 : 0)}>
          <Text style={tp.btnText}>−</Text>
        </TouchableOpacity>
        <Text style={tp.timeText}>{pad(m)}</Text>
        <TouchableOpacity style={tp.btn} onPress={() => onChangeM(m === 0 ? 30 : 0)}>
          <Text style={tp.btnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const tp = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  label:    { fontSize: 13, color: '#6b7280', width: 36 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  btn:      { width: 30, height: 30, borderRadius: 6, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  btnText:  { fontSize: 16, color: '#374151', fontWeight: '700' },
  timeText: { fontSize: 16, fontWeight: '700', color: '#111827', width: 30, textAlign: 'center' },
  colon:    { fontSize: 16, fontWeight: '700', color: '#111827', marginHorizontal: 2 },
});

// ── EVENT MODAL ───────────────────────────────────────────────────────────────
function EventModal({ event, selectedDate, onSave, onDelete, onClose }) {
  const isNew = !event?.id;
  const [title,  setTitle]  = useState(event?.title  || '');
  const [startH, setStartH] = useState(event?.startH ?? 9);
  const [startM, setStartM] = useState(event?.startM ?? 0);
  const [endH,   setEndH]   = useState(event?.endH   ?? 10);
  const [endM,   setEndM]   = useState(event?.endM   ?? 0);
  const [color,  setColor]  = useState(event?.color  || 'blue');
  const [note,   setNote]   = useState(event?.note   || '');

  const COLORS = [['blue','#2563EB'],['red','#DC2626'],['yellow','#E6B400'],['green','#16a34a'],['purple','#9333ea']];

  const save = () => {
    if (!title.trim()) { Alert.alert('Voer een titel in'); return; }
    onSave({ ...(isNew ? {} : event), title: title.trim(), date: selectedDate, startH, startM, endH, endM, color, note });
  };

  return (
    <Modal animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={em.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={em.sheet}>
          <View style={em.handle} />
          <Text style={em.sheetTitle}>{isNew ? 'Afspraak toevoegen' : 'Afspraak bewerken'}</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            <TextInput
              style={em.titleInput}
              placeholder="Titel..."
              placeholderTextColor="#9ca3af"
              value={title}
              onChangeText={setTitle}
              autoFocus={isNew}
            />
            <TimeRow label="Van" h={startH} m={startM} onChangeH={setStartH} onChangeM={setStartM} />
            <TimeRow label="Tot" h={endH}   m={endM}   onChangeH={setEndH}   onChangeM={setEndM} />
            <Text style={em.label}>Kleur</Text>
            <View style={em.colorRow}>
              {COLORS.map(([key, hex]) => (
                <TouchableOpacity key={key}
                  style={[em.colorDot, { backgroundColor: hex }, color === key && em.colorDotActive]}
                  onPress={() => setColor(key)} />
              ))}
            </View>
            <Text style={em.label}>Notitie</Text>
            <TextInput
              style={em.noteInput}
              placeholder="Notitie (optioneel)..."
              placeholderTextColor="#9ca3af"
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
            />
            <TouchableOpacity style={em.saveBtn} onPress={save}>
              <Text style={em.saveBtnText}>{isNew ? 'Toevoegen' : 'Opslaan'}</Text>
            </TouchableOpacity>
            {!isNew && (
              <TouchableOpacity style={em.deleteBtn} onPress={() => { onDelete(event.id); onClose(); }}>
                <Text style={em.deleteBtnText}>Verwijderen</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const em = StyleSheet.create({
  overlay:        { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:          { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 24, maxHeight: '85%' },
  handle:         { width: 36, height: 4, backgroundColor: '#d1d5db', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle:     { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 16 },
  titleInput:     { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12, fontSize: 16, color: '#111827', marginBottom: 16 },
  label:          { fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  colorRow:       { flexDirection: 'row', gap: 12, marginBottom: 16 },
  colorDot:       { width: 28, height: 28, borderRadius: 14, borderWidth: 3, borderColor: 'transparent' },
  colorDotActive: { borderColor: '#111827' },
  noteInput:      { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, fontSize: 14, color: '#111827', marginBottom: 16, minHeight: 70, textAlignVertical: 'top' },
  saveBtn:        { backgroundColor: '#2563EB', borderRadius: 8, paddingVertical: 13, alignItems: 'center', marginBottom: 10 },
  saveBtnText:    { color: '#fff', fontSize: 15, fontWeight: '700' },
  deleteBtn:      { backgroundColor: '#FEE2E2', borderRadius: 8, paddingVertical: 13, alignItems: 'center' },
  deleteBtnText:  { color: '#DC2626', fontSize: 15, fontWeight: '600' },
});

// ── CALENDAR SCREEN ───────────────────────────────────────────────────────────
export default function CalendarScreen() {
  const { tasks, events, addEvent, updateEvent, deleteEvent } = useData();
  const [selectedDate, setSelectedDate] = useState(getTodayKey());
  const [weekBase, setWeekBase]         = useState(new Date());
  const [modalEvent, setModalEvent]     = useState(undefined);
  const scrollRef = useRef(null);

  const weekDates = getWeekDates(weekBase);
  const todayKey  = getTodayKey();

  const dayEvents = events
    .filter(e => e.date === selectedDate)
    .sort((a, b) => a.startH * 60 + a.startM - (b.startH * 60 + b.startM));

  const prevWeek = () => { const d = new Date(weekBase); d.setDate(d.getDate() - 7); setWeekBase(d); };
  const nextWeek = () => { const d = new Date(weekBase); d.setDate(d.getDate() + 7); setWeekBase(d); };

  // Scroll naar huidige tijd (of 8:00 als default)
  useEffect(() => {
    const now = new Date();
    const scrollHour = selectedDate === todayKey ? Math.max(HOUR_FROM, now.getHours() - 1) : HOUR_FROM + 1;
    const y = (scrollHour - HOUR_FROM) * SLOT_H;
    setTimeout(() => scrollRef.current?.scrollTo({ y, animated: false }), 100);
  }, [selectedDate]);

  const handleSave = async (eventData) => {
    if (eventData.id) {
      await updateEvent(eventData);
    } else {
      await addEvent(eventData);
    }
    setModalEvent(undefined);
  };

  const openNewEvent = (h, m) => {
    setModalEvent({ startH: h, startM: m, endH: Math.min(h + 1, HOUR_TO - 1), endM: m });
  };

  const selectedD     = new Date(selectedDate + 'T12:00:00');
  const selectedLabel = selectedD.getDate() + ' ' + MONTHS[selectedD.getMonth()];

  return (
    <View style={s.container}>

      {/* Week navigatie */}
      <View style={s.weekNav}>
        <TouchableOpacity onPress={prevWeek} style={s.weekNavBtn}>
          <Ionicons name="chevron-back" size={20} color="#374151" />
        </TouchableOpacity>
        <Text style={s.weekNavLabel}>
          {MONTHS_SHORT[weekDates[0].getMonth()]} – {MONTHS_SHORT[weekDates[6].getMonth()]} {weekDates[6].getFullYear()}
        </Text>
        <TouchableOpacity onPress={nextWeek} style={s.weekNavBtn}>
          <Ionicons name="chevron-forward" size={20} color="#374151" />
        </TouchableOpacity>
      </View>

      {/* Dag-selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.dayRow} contentContainerStyle={s.dayRowContent}>
        {weekDates.map((d, i) => {
          const key        = dateKey(d);
          const isSelected = key === selectedDate;
          const isToday    = key === todayKey;
          const hasEvents  = events.some(e => e.date === key);
          return (
            <TouchableOpacity key={i} style={[s.dayBtn, isSelected && s.dayBtnSelected]} onPress={() => setSelectedDate(key)}>
              <Text style={[s.dayName, isSelected && s.dayNameSelected]}>{DAYS_SHORT[i]}</Text>
              <Text style={[s.dayNum, isSelected && s.dayNumSelected, isToday && !isSelected && s.dayNumToday]}>{d.getDate()}</Text>
              {hasEvents && <View style={[s.eventDot, isSelected && { backgroundColor: '#fff' }]} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Dag-label */}
      <View style={s.dayHeader}>
        <Text style={s.dayHeaderText}>{selectedLabel}</Text>
        <Text style={s.dayHeaderCount}>{dayEvents.length} afspraken</Text>
      </View>

      {/* Taken met deadline op geselecteerde dag */}
      {tasks.filter(t => t.deadline === selectedDate).length > 0 && (
        <View style={s.taskChipsRow}>
          <Text style={s.taskChipsLabel}>taken</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.taskChipsContent}>
            {tasks.filter(t => t.deadline === selectedDate).map(task => (
              <View key={task.id} style={[s.taskChip, { backgroundColor: PRIO_BG[task.priority] || '#f3f4f6', borderLeftColor: PRIO_COLOR[task.priority] || '#9ca3af' }]}>
                <Text style={[s.taskChipText, { color: PRIO_COLOR[task.priority] || '#6b7280' }]} numberOfLines={1}>
                  {task.title}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Tijdraster */}
      <ScrollView ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ height: HOURS.length * SLOT_H + 20, position: 'relative' }}>

          {/* Uur-rijen */}
          {HOURS.map(h => (
            <View key={h} style={{ position: 'absolute', top: (h - HOUR_FROM) * SLOT_H, left: 0, right: 0, height: SLOT_H }}>
              {/* Tijdlabel */}
              <Text style={s.timeLabel}>{pad(h)}:00</Text>
              {/* Hele uur lijn */}
              <View style={s.hourLine} />
              {/* Half uur lijn */}
              <View style={[s.halfLine, { top: SLOT_H / 2 }]} />
              {/* Klikbaar vlak — hele uur */}
              <TouchableOpacity
                style={[s.tapZone, { top: 0, height: SLOT_H / 2 }]}
                onPress={() => openNewEvent(h, 0)}
                activeOpacity={0.3}
              />
              {/* Klikbaar vlak — half uur */}
              <TouchableOpacity
                style={[s.tapZone, { top: SLOT_H / 2, height: SLOT_H / 2 }]}
                onPress={() => openNewEvent(h, 30)}
                activeOpacity={0.3}
              />
            </View>
          ))}

          {/* Afspraken */}
          {dayEvents.map(ev => {
            const top    = (ev.startH - HOUR_FROM + ev.startM / 60) * SLOT_H;
            const height = Math.max(((ev.endH - ev.startH) * 60 + (ev.endM - ev.startM)) / 60 * SLOT_H, 28);
            return (
              <TouchableOpacity
                key={ev.id}
                onPress={() => setModalEvent(ev)}
                style={[s.eventBlock, {
                  top,
                  height,
                  backgroundColor: EVENT_BG[ev.color]  || '#DBEAFE',
                  borderLeftColor: EVENT_BORDER[ev.color] || '#2563EB',
                }]}
              >
                <Text style={[s.eventBlockTitle, { color: EVENT_TEXT[ev.color] || '#1d4ed8' }]} numberOfLines={1}>
                  {ev.title}
                </Text>
                {height > 36 && (
                  <Text style={[s.eventBlockTime, { color: EVENT_TEXT[ev.color] || '#1d4ed8' }]}>
                    {pad(ev.startH)}:{pad(ev.startM)} – {pad(ev.endH)}:{pad(ev.endM)}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}

        </View>
      </ScrollView>

      {/* Modal */}
      {modalEvent !== undefined && (
        <EventModal
          event={modalEvent}
          selectedDate={selectedDate}
          onSave={handleSave}
          onDelete={async (id) => { await deleteEvent(id); setModalEvent(undefined); }}
          onClose={() => setModalEvent(undefined)}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#fff' },
  weekNav:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  weekNavBtn:     { padding: 8 },
  weekNavLabel:   { fontSize: 14, fontWeight: '600', color: '#374151' },
  dayRow:         { maxHeight: 72, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  dayRowContent:  { paddingHorizontal: 8, paddingVertical: 8, gap: 4, flexDirection: 'row' },
  dayBtn:         { alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, minWidth: 42 },
  dayBtnSelected: { backgroundColor: '#2563EB' },
  dayName:        { fontSize: 11, color: '#9ca3af', fontWeight: '600', marginBottom: 2 },
  dayNameSelected:{ color: '#fff' },
  dayNum:         { fontSize: 16, fontWeight: '700', color: '#111827' },
  dayNumSelected: { color: '#fff' },
  dayNumToday:    { color: '#2563EB' },
  eventDot:       { width: 4, height: 4, borderRadius: 2, backgroundColor: '#2563EB', marginTop: 2 },
  dayHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  dayHeaderText:  { fontSize: 14, fontWeight: '700', color: '#111827' },
  dayHeaderCount: { fontSize: 12, color: '#9ca3af' },
  taskChipsRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', minHeight: 32 },
  taskChipsLabel:   { fontSize: 9, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.5, textTransform: 'uppercase', width: TIME_COL - 8, flexShrink: 0 },
  taskChipsContent: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  taskChip:         { borderLeftWidth: 2, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2, maxWidth: 140 },
  taskChipText:     { fontSize: 11, fontWeight: '600' },
  timeLabel:      { position: 'absolute', left: 0, top: -8, width: TIME_COL - 4, fontSize: 10, color: '#9ca3af', textAlign: 'right' },
  hourLine:       { position: 'absolute', left: TIME_COL, right: 0, top: 0, height: 1, backgroundColor: '#e5e7eb' },
  halfLine:       { position: 'absolute', left: TIME_COL, right: 0, height: 1, backgroundColor: '#f3f4f6' },
  tapZone:        { position: 'absolute', left: TIME_COL, right: 0 },
  eventBlock:     { position: 'absolute', left: TIME_COL + 4, right: 6, borderRadius: 6, borderLeftWidth: 3, paddingHorizontal: 6, paddingVertical: 3, zIndex: 1 },
  eventBlockTitle:{ fontSize: 12, fontWeight: '700' },
  eventBlockTime: { fontSize: 10, marginTop: 1 },
});
