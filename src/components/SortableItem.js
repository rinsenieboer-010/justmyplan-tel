import { cloneElement, useLayoutEffect, useRef } from 'react';
import { Animated, PanResponder } from 'react-native';
import { rowShift } from '../dragGeometry';

export default function SortableItem({ id, ids, sizes, horizontal = false, disabled, label, onMove, drag, children }) {
  const offset = useRef(new Animated.Value(0)).current;
  const latest = useRef();
  latest.current = { drag, id };
  const active = drag.preview?.id === id;
  const shift = active ? drag.preview.delta : rowShift(ids.indexOf(id), drag.preview);
  useLayoutEffect(() => {
    if (active || !drag.preview) { offset.stopAnimation(); offset.setValue(shift); return; }
    const animation = Animated.timing(offset, { toValue: shift, duration: 180, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [active, shift, offset, Boolean(drag.preview)]);
  const responder = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: () => latest.current.drag.isActive(latest.current.id),
    onPanResponderMove: event => latest.current.drag.move(event),
    onPanResponderRelease: () => latest.current.drag.finish(),
    onPanResponderTerminate: () => latest.current.drag.finish(true),
    onPanResponderTerminationRequest: () => false,
  })).current;
  return (
    <Animated.View {...responder.panHandlers}
      onTouchEnd={() => { if (drag.isActive(id)) drag.finish(); }}
      onLayout={e => { sizes[id] = (horizontal ? e.nativeEvent.layout.width : e.nativeEvent.layout.height) + (horizontal ? 0 : 8); }}
      style={{ zIndex: active ? 20 : 0,
        transform: [{ [horizontal ? 'translateX' : 'translateY']: offset }, { scale: active ? 1.025 : 1 }],
        shadowColor: '#000', shadowOpacity: active ? 0.2 : 0, shadowRadius: 12,
        shadowOffset: { width: 0, height: 5 }, elevation: active ? 8 : 0 }}>
      {cloneElement(children, {
        delayLongPress: 2000,
        onLongPress: disabled ? undefined : event => drag.start(id, event),
        accessibilityLabel: children.props.accessibilityLabel || label,
        accessibilityHint: disabled ? undefined : 'Houd twee seconden ingedrukt om te verplaatsen',
        accessibilityActions: disabled ? undefined : [{ name: 'decrement', label: 'Eerder' }, { name: 'increment', label: 'Later' }],
        onAccessibilityAction: disabled ? undefined : ({ nativeEvent }) => {
          const to = ids.indexOf(id) + (nativeEvent.actionName === 'increment' ? 1 : -1);
          if (to >= 0 && to < ids.length) onMove(id, to);
        },
      })}
    </Animated.View>
  );
}
