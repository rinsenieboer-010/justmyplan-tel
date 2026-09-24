import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, PanResponder, Text, TouchableOpacity, View } from 'react-native';
import { adjustEventTime, eventTimeLabel } from '../calendarGesture';

export default function EditableCalendarEvent({ event, selected, onSelect, onOpen, onSave, onDragging, onPreview,
  pixelsPerHour, fromHour, toHour, backgroundColor, borderColor, textColor }) {
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const gesture = useRef(null);
  const savingRef = useRef(false);
  const mounted = useRef(true);
  const latest = useRef();
  latest.current = { event, onSelect, onSave, onDragging, onPreview, pixelsPerHour, fromHour, toHour };
  const begin = (mode, e) => {
    if (savingRef.current || gesture.current) return;
    const p = latest.current;
    gesture.current = { mode, y: e.nativeEvent.pageY, original: p.event, draft: p.event };
    setDraft(p.event);
    p.onSelect(p.event.id);
    p.onPreview(p.event);
    p.onDragging(true);
  };
  const move = e => {
    const g = gesture.current;
    if (!g) return;
    const p = latest.current;
    g.draft = adjustEventTime(g.original, g.mode, e.nativeEvent.pageY - g.y, p.pixelsPerHour, p.fromHour, p.toHour);
    setDraft(g.draft);
    p.onPreview(g.draft);
  };
  const finish = async (cancel = false) => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    const p = latest.current;
    p.onDragging(false);
    const current = p.event;
    const changedExternally = ['date', 'startH', 'startM', 'endH', 'endM'].some(key => current[key] !== g.original[key]);
    if (cancel || changedExternally || eventTimeLabel(g.draft) === eventTimeLabel(g.original)) {
      setDraft(null);
      p.onPreview(current);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await p.onSave({ ...current, startH: g.draft.startH, startM: g.draft.startM, endH: g.draft.endH, endM: g.draft.endM });
    } catch {
      p.onPreview(current);
      Alert.alert('Niet opgeslagen', 'De nieuwe tijd kon niet worden opgeslagen. Probeer het opnieuw.');
    } finally {
      savingRef.current = false;
      if (mounted.current) { setDraft(null); setSaving(false); }
    }
  };
  const actions = useRef();
  actions.current = { begin, move, finish };
  const bodyResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: () => gesture.current?.mode === 'move',
    onPanResponderMove: e => actions.current.move(e),
    onPanResponderRelease: () => actions.current.finish(),
    onPanResponderTerminate: () => actions.current.finish(true),
    onPanResponderTerminationRequest: () => false,
  })).current;
  const handles = useRef(Object.fromEntries(['start', 'end'].map(mode => [mode, PanResponder.create({
    onStartShouldSetPanResponder: () => !savingRef.current,
    onMoveShouldSetPanResponder: () => !savingRef.current,
    onPanResponderGrant: e => actions.current.begin(mode, e),
    onPanResponderMove: e => actions.current.move(e),
    onPanResponderRelease: () => actions.current.finish(),
    onPanResponderTerminate: () => actions.current.finish(true),
    onPanResponderTerminationRequest: () => false,
  })]))).current;
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') actions.current.finish(true);
    });
    return () => {
      mounted.current = false;
      subscription.remove();
      if (gesture.current) latest.current.onDragging(false);
    };
  }, []);
  const shown = draft || event;
  const top = Math.max(0, (shown.startH - fromHour + shown.startM / 60) * pixelsPerHour);
  const height = Math.max(18, (shown.endH - fromHour + shown.endM / 60) * pixelsPerHour - top);
  return (
    <View {...bodyResponder.panHandlers} pointerEvents="box-none"
      onTouchEnd={() => { if (gesture.current?.mode === 'move') actions.current.finish(); }}
      style={{ position: 'absolute', top: top - 12, height: height + 24, left: 1, right: 1, zIndex: selected ? 10 : 2 }}>
      <TouchableOpacity disabled={saving} onPress={() => onOpen(event)}
        delayLongPress={500} onLongPress={e => begin('move', e)}
        accessibilityLabel={`${event.title}, ${eventTimeLabel(shown)}`}
        accessibilityHint="Houd vast om te verplaatsen. Sleep daarna een rand om de duur te wijzigen."
        style={{ flex: 1, marginVertical: 12, borderRadius: 4, borderLeftWidth: 2, borderWidth: selected ? 1 : 0,
          borderColor, backgroundColor, paddingHorizontal: 3, paddingVertical: 2, overflow: 'hidden', opacity: saving ? 0.6 : 1 }}>
        <Text style={{ fontSize: 10, fontWeight: '600', color: textColor }} numberOfLines={height > 30 ? 2 : 1}>{event.title}</Text>
      </TouchableOpacity>
      {selected && ['start', 'end'].map(mode => (
        <View key={mode} {...handles[mode].panHandlers} accessible accessibilityRole="adjustable"
          accessibilityLabel={mode === 'start' ? 'Begintijd aanpassen' : 'Eindtijd aanpassen'}
          accessibilityActions={[{ name: 'increment', label: '15 minuten later' }, { name: 'decrement', label: '15 minuten eerder' }]}
          onAccessibilityAction={({ nativeEvent }) => {
            begin(mode, { nativeEvent: { pageY: 0 } });
            if (!gesture.current) return;
            move({ nativeEvent: { pageY: (nativeEvent.actionName === 'increment' ? 1 : -1) * pixelsPerHour / 4 } });
            finish();
          }}
          style={{ position: 'absolute', [mode === 'start' ? 'top' : 'bottom']: 0,
            left: mode === 'start' ? 0 : '45%', right: mode === 'start' ? '45%' : 0,
            height: 24, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 18, height: 6, borderRadius: 3, backgroundColor: borderColor, borderWidth: 1, borderColor: '#fff' }} />
        </View>
      ))}
    </View>
  );
}
