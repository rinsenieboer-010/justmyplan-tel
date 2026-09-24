const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const React = require('react');
const { create, act } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class Value {
  constructor(value) { this.value = value; }
  setValue(value) { this.value = value; }
  stopAnimation() {}
  interpolate() { return this.value; }
}
const native = {
  Alert: { alert() {} },
  ...Object.fromEntries(['View', 'Text', 'TouchableOpacity', 'Modal', 'TextInput', 'ScrollView', 'FlatList', 'KeyboardAvoidingView'].map(name => [name, name])),
  StyleSheet: { create: styles => styles, absoluteFill: { position: 'absolute' } },
  Platform: { OS: 'ios' },
  Animated: { Value, View: 'AnimatedView', timing: (value, config) => ({ start: cb => { value.setValue(config.toValue); cb?.({ finished: true }); }, stop() {} }) },
  Easing: { out: v => v, quad: 'quad' },
  AppState: { addEventListener: () => ({ remove() {} }) },
  PanResponder: { create: handlers => ({ panHandlers: handlers }) },
};

const cache = new Map();
let dataContext = {};
function load(file, extra = '') {
  if (cache.has(file)) return cache.get(file);
  const source = fs.readFileSync(file, 'utf8') + extra;
  const { code } = babel.transformSync(source, {
    filename: file, configFile: false, babelrc: false,
    plugins: [['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }], '@babel/plugin-transform-modules-commonjs'],
  });
  const module = { exports: {} };
  const localRequire = name => {
    if (name === 'react-native') return native;
    if (name === '@expo/vector-icons') return { Ionicons: 'Icon' };
    if (name.includes('context/DataContext')) return { useData: () => dataContext };
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + (path.extname(name) ? '' : '.js')));
    return require(name);
  };
  new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
  cache.set(file, module.exports);
  return module.exports;
}
const root = path.resolve(__dirname, '..');
const { default: TasksScreen, DatePickerModal, TaskModal, CheckCircle } = load(path.join(root, 'src/screens/TasksScreen.js'), '\nexport { DatePickerModal, TaskModal, CheckCircle };');
const SortableItem = load(path.join(root, 'src/components/SortableItem.js')).default;
const useSortableDrag = load(path.join(root, 'src/components/useSortableDrag.js')).default;
const EditableCalendarEvent = load(path.join(root, 'src/components/EditableCalendarEvent.js')).default;
function button(renderer, label) {
  return renderer.root.findAllByType('TouchableOpacity').find(node => {
    const texts = node.findAllByType('Text');
    return texts.length === 1 && texts[0].children.join('') === label;
  });
}

async function calendarFixture(onSave) {
  const previews = [], locks = [];
  let renderer;
  const props = { event: { id: 'e', title: 'Overleg', startH: 10, startM: 0, endH: 11, endM: 0, note: 'Bewaren' },
    selected: true, pixelsPerHour: 60, fromHour: 8, toHour: 22,
    onSelect() {}, onOpen() {}, onSave, onPreview: e => previews.push(e), onDragging: v => locks.push(v) };
  await act(async () => { renderer = create(React.createElement(EditableCalendarEvent, props)); });
  return { renderer, previews, locks, props };
}

test('calendar resizing previews without saving, then commits once on release', async () => {
  const saves = [];
  const { renderer, previews, locks } = await calendarFixture(e => saves.push(e));
  try {
    const handle = renderer.root.findByProps({ accessibilityLabel: 'Eindtijd aanpassen' });
    await act(async () => handle.props.onPanResponderGrant({ nativeEvent: { pageY: 100 } }));
    await act(async () => handle.props.onPanResponderMove({ nativeEvent: { pageY: 145 } }));
    assert.equal(saves.length, 0);
    assert.equal(previews.at(-1).endM, 45);
    await act(async () => handle.props.onPanResponderRelease());
    await act(async () => handle.props.onPanResponderRelease());
    assert.equal(saves.length, 1);
    assert.equal(saves[0].note, 'Bewaren');
    assert.equal(saves[0].endM, 45);
    assert.deepEqual(locks, [true, false]);
  } finally { await act(async () => renderer.unmount()); }
});

test('cancelled calendar resize restores original preview and never saves', async () => {
  const saves = [];
  const { renderer, previews, locks } = await calendarFixture(e => saves.push(e));
  try {
    const handle = renderer.root.findByProps({ accessibilityLabel: 'Begintijd aanpassen' });
    await act(async () => handle.props.onPanResponderGrant({ nativeEvent: { pageY: 100 } }));
    await act(async () => handle.props.onPanResponderMove({ nativeEvent: { pageY: 70 } }));
    await act(async () => handle.props.onPanResponderTerminate());
    assert.equal(saves.length, 0);
    assert.equal(previews.at(-1).startH, 10);
    assert.deepEqual(locks, [true, false]);
  } finally { await act(async () => renderer.unmount()); }
});

test('failed calendar save restores old preview and re-enables gestures', async () => {
  const alerts = [];
  const original = native.Alert.alert;
  native.Alert.alert = (...args) => alerts.push(args);
  const { renderer, previews, locks } = await calendarFixture(async () => { throw new Error('offline'); });
  try {
    const handle = renderer.root.findByProps({ accessibilityLabel: 'Eindtijd aanpassen' });
    await act(async () => handle.props.onPanResponderGrant({ nativeEvent: { pageY: 100 } }));
    await act(async () => handle.props.onPanResponderMove({ nativeEvent: { pageY: 130 } }));
    await act(async () => handle.props.onPanResponderRelease());
    assert.equal(previews.at(-1).endM, 0);
    assert.equal(alerts[0][0], 'Niet opgeslagen');
    assert.equal(renderer.root.findByType('TouchableOpacity').props.disabled, false);
    assert.deepEqual(locks, [true, false]);
  } finally { native.Alert.alert = original; await act(async () => renderer.unmount()); }
});

test('calendar long press moves the whole block without changing duration', async () => {
  const saves = [];
  const { renderer } = await calendarFixture(e => saves.push(e));
  try {
    const body = renderer.root.findAllByType('View').find(n => n.props.onMoveShouldSetPanResponderCapture);
    assert.equal(Boolean(body.props.onMoveShouldSetPanResponderCapture()), false);
    await act(async () => renderer.root.findByType('TouchableOpacity').props.onLongPress({ nativeEvent: { pageY: 100 } }));
    await act(async () => body.props.onPanResponderMove({ nativeEvent: { pageY: 160 } }));
    await act(async () => body.props.onPanResponderRelease());
    assert.equal(saves[0].startH, 11);
    assert.equal(saves[0].endH, 12);
  } finally { await act(async () => renderer.unmount()); }
});

test('date and custom recurrence stay drafts until one save closes the picker', async () => {
  const calls = [];
  let renderer;
  await act(async () => { renderer = create(React.createElement(DatePickerModal, {
    value: '2026-09-21', recurrence: 'daily',
    onSelect: value => calls.push(['date', value]),
    onRecurrenceSelect: value => calls.push(['repeat', value]),
    onClose: () => calls.push(['close']),
  })); });
  assert.equal(renderer.root.findAllByType('Modal').length, 0, 'uses the existing iOS modal');
  await act(async () => button(renderer, '22').props.onPress());
  await act(async () => button(renderer, 'Aangepast').props.onPress());
  assert.deepEqual(calls, []);
  assert.equal(renderer.root.findAllByType('Text').filter(n => n.children.join('') === 'Opslaan').length, 1);
  await act(async () => button(renderer, 'Opslaan').props.onPress());
  const now = new Date();
  const expectedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-22`;
  assert.deepEqual(calls, [['date', expectedDate], ['repeat', 'custom:2:weeks'], ['close']]);
  await act(async () => renderer.unmount());
});

test('dismissing a date draft does not save changes', async () => {
  const calls = [];
  let renderer;
  await act(async () => { renderer = create(React.createElement(DatePickerModal, {
    value: '2026-09-21', recurrence: null,
    onSelect: () => calls.push('date'), onRecurrenceSelect: () => calls.push('repeat'), onClose: () => calls.push('close'),
  })); });
  await act(async () => button(renderer, 'Datum wissen').props.onPress());
  await act(async () => renderer.root.findAllByType('TouchableOpacity')[0].props.onPress());
  assert.deepEqual(calls, ['close']);
  await act(async () => renderer.unmount());
});

function DragHarness({ moves, locks, scrolls = [], horizontal = false }) {
  const drag = useSortableDrag({ ids: ['a', 'b', 'c'], sizes: { a: 100, b: 100, c: 100 }, horizontal,
    scrollRef: { current: { scrollTo: args => scrolls.push(args), scrollToOffset: args => scrolls.push(args) } },
    viewportRef: { current: { measureInWindow: cb => cb(0, 0, 500, 500) } },
    onMove: (...args) => moves.push(args), onDragging: value => locks.push(value) });
  React.useEffect(() => { drag.onContentSizeChange(2500, 2500); }, []);
  return React.createElement(SortableItem, { id: 'a', ids: ['a', 'b', 'c'], sizes: {}, label: 'A', horizontal, drag,
    onMove: (...args) => moves.push(args) }, React.createElement('TouchableOpacity', { onPress: () => moves.push('tap') }, React.createElement('Text', null, 'A')));
}

test('two-second long press enables dragging without a visible handle', async () => {
  const moves = [], locks = [];
  let renderer;
  await act(async () => { renderer = create(React.createElement(DragHarness, { moves, locks, horizontal: true })); });
  const card = renderer.root.findByType('TouchableOpacity');
  const handle = renderer.root.findByType('AnimatedView');
  assert.equal(card.props.delayLongPress, 2000);
  assert.equal(renderer.root.findAllByType('Icon').length, 0);
  assert.equal(handle.props.onMoveShouldSetPanResponderCapture(), false);
  await act(async () => card.props.onLongPress({ nativeEvent: { pageX: 200, pageY: 200 } }));
  assert.equal(handle.props.onMoveShouldSetPanResponderCapture(), true);
  await act(async () => handle.props.onPanResponderMove({ nativeEvent: { pageX: 310, pageY: 200 } }));
  await act(async () => handle.props.onPanResponderRelease());
  assert.deepEqual(moves, [['a', 1]]);
  assert.deepEqual(locks, [true, false]);
  await act(async () => renderer.unmount());
});

test('cancelled drag unlocks without writing a new order', async () => {
  const moves = [], locks = [];
  let renderer;
  await act(async () => { renderer = create(React.createElement(DragHarness, { moves, locks })); });
  const handle = renderer.root.findByType('AnimatedView');
  await act(async () => renderer.root.findByType('TouchableOpacity').props.onLongPress({ nativeEvent: { pageX: 200, pageY: 200 } }));
  await act(async () => handle.props.onPanResponderTerminate());
  assert.deepEqual(moves, []);
  assert.deepEqual(locks, [true, false]);
  await act(async () => renderer.unmount());
});

test('old deadlines open the current month without changing the stored date', async () => {
  let renderer;
  const calls = [];
  await act(async () => { renderer = create(React.createElement(DatePickerModal, {
    value: '2020-01-01', recurrence: null, onSelect: d => calls.push(d), onRecurrenceSelect() {}, onClose() {},
  })); });
  const now = new Date();
  const month = new Intl.DateTimeFormat('nl', { month: 'long' }).format(now);
  assert.ok(renderer.root.findAllByType('Text').some(n => n.children.join('') === `${month} ${now.getFullYear()}`));
  await act(async () => button(renderer, 'Opslaan').props.onPress());
  assert.deepEqual(calls, ['2020-01-01']);
  await act(async () => renderer.unmount());
});

test('compact list picker saves the chosen destination and notes use a keyboard overlay', async () => {
  let renderer;
  const saved = [];
  await act(async () => { renderer = create(React.createElement(TaskModal, {
    task: { id: 't', title: 'Test', list: 'a', note: 'Bestaande notitie' },
    lists: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], onSave: t => saved.push(t), onClose() {},
  })); });
  assert.equal(button(renderer, 'B'), undefined);
  await act(async () => button(renderer, 'Van lijst wisselen: A').props.onPress());
  await act(async () => button(renderer, 'B').props.onPress());
  assert.equal(button(renderer, 'B'), undefined);
  await act(async () => button(renderer, 'Bestaande notitie').props.onPress());
  const input = renderer.root.findByProps({ accessibilityLabel: 'Notitie bewerken' });
  assert.equal(input.props.autoFocus, true);
  await act(async () => input.props.onChangeText('Gewijzigd'));
  await act(async () => button(renderer, 'Gereed').props.onPress());
  await act(async () => button(renderer, 'Opslaan').props.onPress());
  assert.equal(saved[0].list, 'b');
  assert.equal(saved[0].note, 'Gewijzigd');
  await act(async () => renderer.unmount());
});

test('completion circle has a 48-point target and 30-point icon', async () => {
  let renderer;
  await act(async () => { renderer = create(React.createElement(CheckCircle, { onComplete() {} })); });
  assert.equal(renderer.root.findByType('TouchableOpacity').props.style.width, 48);
  assert.equal(renderer.root.findAllByType('Icon')[0].props.size, 30);
  await act(async () => renderer.unmount());
});

test('holding still at the bottom continues scrolling until released', async () => {
  const moves = [], locks = [], scrolls = [];
  let renderer;
  await act(async () => { renderer = create(React.createElement(DragHarness, { moves, locks, scrolls })); });
  try {
    await act(async () => renderer.root.findByType('TouchableOpacity').props.onLongPress({ nativeEvent: { pageX: 200, pageY: 499 } }));
    await act(async () => new Promise(resolve => setTimeout(resolve, 70)));
    assert.ok(scrolls.length >= 2);
    assert.ok(scrolls.at(-1).offset > scrolls[0].offset);
    await act(async () => renderer.root.findByType('AnimatedView').props.onPanResponderRelease());
    const count = scrolls.length;
    await act(async () => new Promise(resolve => setTimeout(resolve, 40)));
    assert.equal(scrolls.length, count);
    assert.deepEqual(locks, [true, false]);
  } finally { await act(async () => renderer.unmount()); }
});

test('blue plus saves into selected list and scrolls to the returned task ID', async () => {
  const scrolls = [], saves = [];
  dataContext = {
    tasks: [{ id: 'existing', title: 'Eerder', list: 'b', deadline: '2020-01-01' }],
    lists: [{ id: 'mine', label: 'Mijn taken', color: '#2563EB' }, { id: 'b', label: 'Werk', color: '#DC2626' }],
    personColors: {}, isSharedVisible: () => true, setPagerEnabled() {},
    addTask: async task => {
      const saved = { ...task, id: 'saved-task-id' };
      saves.push(saved);
      dataContext = { ...dataContext, tasks: [...dataContext.tasks, saved] };
      return saved;
    },
  };
  let renderer;
  await act(async () => { renderer = create(React.createElement(TasksScreen), { createNodeMock: element => {
    if (element.type === 'FlatList') return { scrollToIndex: args => scrolls.push(args), scrollToOffset() {} };
    return null;
  } }); });
  try {
    const fab = renderer.root.findAllByType('TouchableOpacity').find(n => n.findAllByType('Icon').some(i => i.props.name === 'add' && i.props.size === 28));
    await act(async () => fab.props.onPress());
    const modal = { root: renderer.root.findByType(TaskModal) };
    await act(async () => renderer.root.findByProps({ placeholder: 'Taaknaam...' }).props.onChangeText('Nieuwe taak'));
    await act(async () => button(modal, 'Van lijst wisselen: Mijn taken').props.onPress());
    await act(async () => button(modal, 'Werk').props.onPress());
    await act(async () => button(modal, 'Toevoegen').props.onPress());
    await act(async () => new Promise(resolve => setTimeout(resolve, 300)));
    assert.equal(saves[0].list, 'b');
    assert.equal(renderer.root.findAllByType('Modal').length, 0);
    assert.equal(scrolls.at(-1).index, 1);
    const rows = renderer.root.findByType('FlatList').props.data;
    assert.equal(rows[scrolls.at(-1).index].id, 'saved-task-id');
  } finally { await act(async () => renderer.unmount()); }
});

test('date badges only reserve extra width for recurring tasks', async () => {
  const now = new Date();
  const deadline = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  dataContext = {
    tasks: [{ id: 'once', title: 'Eenmalig', list: 'mine', deadline },
      { id: 'repeat', title: 'Herhaling', list: 'mine', deadline, recurrence: 'daily' }],
    lists: [{ id: 'mine', label: 'Mijn taken', color: '#2563EB' }],
    personColors: {}, isSharedVisible: () => true, setPagerEnabled() {},
  };
  let renderer;
  await act(async () => { renderer = create(React.createElement(TasksScreen)); });
  try {
    const list = renderer.root.findByType('FlatList');
    for (const row of list.props.data) {
      let card;
      await act(async () => { card = create(list.props.renderItem({ item: row }).props.children); });
      try {
        const date = card.root.findAllByType('Text').find(n => n.children.join('') === 'Vandaag');
        const badgeStyle = Object.assign({}, ...date.parent.props.style);
        const textStyle = Object.assign({}, ...date.props.style);
        const recurring = Boolean(row.task.recurrence);
        assert.equal(badgeStyle.minWidth, recurring ? 100 : undefined);
        assert.equal(textStyle.flex, recurring ? 1 : undefined);
        assert.equal(badgeStyle.paddingHorizontal, 6);
        assert.equal(date.parent.findAllByType('Icon').length, recurring ? 1 : 0);
      } finally { await act(async () => card.unmount()); }
    }
  } finally { await act(async () => renderer.unmount()); }
});

test('calendar selection is square with centered text and save is inset and centered', async () => {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-21`;
  let renderer;
  await act(async () => { renderer = create(React.createElement(DatePickerModal, {
    value: date, recurrence: null, onSelect() {}, onRecurrenceSelect() {}, onClose() {},
  })); });
  try {
    const selected = button(renderer, '21');
    const text = selected.findByType('Text');
    const square = Object.assign({}, ...text.parent.props.style);
    const textStyle = Object.assign({}, ...text.props.style);
    assert.equal(square.width, square.height);
    assert.equal(square.justifyContent, 'center');
    assert.equal(square.alignItems, 'center');
    assert.equal(square.backgroundColor, '#2563EB');
    assert.equal(selected.props.style.flexShrink, 0);
    assert.equal(textStyle.lineHeight, 20);
    assert.equal(textStyle.textAlign, 'center');
    const save = button(renderer, 'Opslaan');
    assert.equal(save.props.style.alignSelf, 'center');
    assert.ok(save.props.style.marginBottom >= 16);
  } finally { await act(async () => renderer.unmount()); }
});
