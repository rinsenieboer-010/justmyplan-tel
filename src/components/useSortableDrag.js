import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { dragTarget, edgeScroll } from '../dragGeometry';

export default function useSortableDrag({ ids, sizes, scrollRef, viewportRef, horizontal = false, onMove, onDragging }) {
  const [preview, setPreview] = useState(null);
  const active = useRef(null);
  const metrics = useRef({ offset: 0, origin: 0, viewport: 0, content: 0 });
  const timer = useRef(null);
  const latest = useRef();
  latest.current = { ids, sizes, onMove, onDragging };
  const update = () => {
    const d = active.current;
    if (!d) return;
    d.delta = d.pointer - d.startPointer + metrics.current.offset - d.startOffset;
    d.to = dragTarget(d.ids, latest.current.sizes, d.id, d.delta);
    setPreview({ ...d });
  };
  const finish = (cancel = false) => {
    const d = active.current;
    if (!d) return;
    clearInterval(timer.current);
    timer.current = null;
    active.current = null;
    setPreview(null);
    latest.current.onDragging(false);
    if (!cancel && d.to !== d.from && d.ids.join('|') === latest.current.ids.join('|')) latest.current.onMove(d.id, d.to);
  };
  const start = (id, event) => {
    if (active.current) return;
    const pointer = horizontal ? event.nativeEvent.pageX : event.nativeEvent.pageY;
    const currentIds = [...latest.current.ids];
    const from = currentIds.indexOf(id);
    if (from < 0 || !Number.isFinite(pointer)) return;
    const d = { id, ids: currentIds, from, to: from, startPointer: pointer, pointer,
      startOffset: metrics.current.offset, delta: 0, size: latest.current.sizes[id] || 80 };
    active.current = d;
    setPreview({ ...d });
    latest.current.onDragging(true);
    viewportRef.current?.measureInWindow((x, y, width, height) => {
      metrics.current.origin = horizontal ? x : y;
      metrics.current.viewport = horizontal ? width : height;
    });
    timer.current = setInterval(() => {
      if (!active.current) return;
      const m = metrics.current;
      const next = edgeScroll(active.current.pointer, m.origin, m.viewport, m.offset, m.content, 16);
      if (next === m.offset) return;
      if (horizontal) scrollRef.current?.scrollTo({ x: next, animated: false });
      else scrollRef.current?.scrollToOffset({ offset: next, animated: false });
      m.offset = next;
      update();
    }, 16);
  };
  useEffect(() => {
    if (active.current && active.current.ids.join('|') !== ids.join('|')) finish(true);
  }, [ids.join('|')]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') finish(true); });
    return () => {
      subscription.remove();
      clearInterval(timer.current);
      if (active.current) latest.current.onDragging(false);
    };
  }, []);
  return {
    preview, start, finish,
    isActive: id => active.current?.id === id,
    move: event => {
      if (!active.current) return;
      active.current.pointer = horizontal ? event.nativeEvent.pageX : event.nativeEvent.pageY;
      update();
    },
    onScroll: event => {
      const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
      Object.assign(metrics.current, {
        offset: horizontal ? contentOffset.x : contentOffset.y,
        viewport: horizontal ? layoutMeasurement.width : layoutMeasurement.height,
        content: horizontal ? contentSize.width : contentSize.height,
      });
      update();
    },
    onContentSizeChange: (width, height) => { metrics.current.content = horizontal ? width : height; },
  };
}
