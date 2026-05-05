import { useState, useRef, useEffect } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView,
  ActivityIndicator, Image, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useData } from '../context/DataContext';
import { pad, MONTHS } from '../utils';

const today = new Date();
const todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');

const SUGGESTIONS = ['Plan mijn taken in', 'Vrije momenten deze week', 'Goede voornemens inplannen'];

const TOOLS = [
  {
    name: 'no_action',
    description: 'Gebruik dit UITSLUITEND voor pure gespreksvragen waarbij niets aangepast hoeft te worden. VERBOD: gebruik no_action NOOIT om te bevestigen dat je taken hebt bijgewerkt — dat is hallucination. Bevestiging mag alleen komen nadat update_task is aangeroepen.',
    input_schema: {
      type: 'object',
      properties: {
        reply: { type: 'string', description: 'Jouw antwoord aan de gebruiker in het Nederlands' },
      },
      required: ['reply'],
    },
  },
  {
    name: 'create_event',
    description: 'Plan een afspraak in de agenda van de gebruiker.',
    input_schema: {
      type: 'object',
      properties: {
        title:   { type: 'string',  description: 'Titel van de afspraak' },
        date:    { type: 'string',  description: 'Datum in YYYY-MM-DD formaat' },
        start_h: { type: 'integer', description: 'Startuur (0-23)' },
        start_m: { type: 'integer', description: 'Startminuten (0 of 30)' },
        end_h:   { type: 'integer', description: 'Einduur (0-23)' },
        end_m:   { type: 'integer', description: 'Eindminuten (0 of 30)' },
        color:   { type: 'string',  enum: ['blue', 'red', 'yellow', 'green', 'purple'] },
      },
      required: ['title', 'date', 'start_h', 'start_m', 'end_h', 'end_m'],
    },
  },
  {
    name: 'create_task',
    description: 'Maak een nieuwe taak aan voor de gebruiker.',
    input_schema: {
      type: 'object',
      properties: {
        title:    { type: 'string', description: 'Titel van de taak' },
        deadline: { type: 'string', description: 'Deadline in YYYY-MM-DD formaat (optioneel)' },
        priority: { type: 'string', enum: ['', 'hoog', 'midden', 'laag'] },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_task',
    description: 'Update één taak. Gebruik dit voor wijzigingen aan een enkele taak.',
    input_schema: {
      type: 'object',
      properties: {
        task_id:  { type: 'string', description: 'ID van de taak' },
        status:   { type: 'string', enum: ['', 'open', 'bezig', 'klaar'] },
        deadline: { type: 'string', description: 'Nieuwe deadline in YYYY-MM-DD' },
        priority: { type: 'string', enum: ['', 'hoog', 'midden', 'laag'] },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'filter_and_update_tasks',
    description: "Zoek taken op basis van een zoekwoord in de taaknaam en pas ze allemaal tegelijk aan. Gebruik dit voor opdrachten zoals 'alle stage-taken op donderdag zetten'.",
    input_schema: {
      type: 'object',
      properties: {
        keyword:  { type: 'string', description: 'Zoekwoord dat in de taaknaam moet voorkomen (hoofdletterongevoelig)' },
        deadline: { type: 'string', description: 'YYYY-MM-DD' },
        status:   { type: 'string', enum: ['', 'open', 'bezig', 'klaar'] },
        priority: { type: 'string', enum: ['', 'hoog', 'midden', 'laag'] },
      },
      required: ['keyword'],
    },
  },
  {
    name: 'update_memory',
    description: 'Sla een werkwijze, voorkeur of concept op voor toekomstige gesprekken. Gebruik dit wanneer de gebruiker iets uitlegt dat ook later relevant is. Schrijf de volledige bijgewerkte inhoud — voeg toe aan het bestaande geheugen, verwijder niets zonder toestemming.',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'De volledige bijgewerkte inhoud van het geheugen.' },
      },
      required: ['content'],
    },
  },
];

export default function AIScreen() {
  const { tasks, events, addTask, addEvent, updateTask } = useData();
  const [memory, setMemory] = useState('');
  const MEMORY_KEY = 'jmp_memory';

  useEffect(() => {
    AsyncStorage.getItem(MEMORY_KEY).then(v => { if (v) setMemory(v); });
  }, []);

  const saveMemory = async (content) => {
    setMemory(content);
    await AsyncStorage.setItem(MEMORY_KEY, content);
  };

  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Goeiedag! Ik ben je planningsassistent.\n\nIk zie je taken en agenda. Ik kan je helpen:\n- Taken inplannen op vrije momenten\n- Goede voornemens slim verdelen\n- Je week overzichtelijker maken\n\nWat wil je aanpakken?' },
  ]);
  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [pendingImage, setPendingImage] = useState(null); // { uri, base64, mediaType }
  const listRef = useRef(null);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Geen toegang', 'Geef toegang tot je fotogalerij in de instellingen.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const mediaType = asset.mimeType || 'image/jpeg';
      setPendingImage({ uri: asset.uri, base64: asset.base64, mediaType });
    }
  };

  const buildApiMessages = (msgs, imageToAdd) => {
    return msgs.map((m, i) => {
      const isLastUser = m.role === 'user' && i === msgs.length - 1 && imageToAdd;
      if (isLastUser) {
        const content = [
          { type: 'image', source: { type: 'base64', media_type: imageToAdd.mediaType, data: imageToAdd.base64 } },
        ];
        if (m.content) content.push({ type: 'text', text: m.content });
        return { role: 'user', content };
      }
      return { role: m.role, content: m.content };
    });
  };

  const executeTool = async (name, input) => {
    if (name === 'update_memory') {
      await saveMemory(input.content);
      return;
    }
    if (name === 'create_task') {
      await addTask({
        title: input.title,
        deadline: input.deadline || null,
        priority: input.priority || '',
        status: '',
        note: '',
        list: 'mine',
      });
    } else if (name === 'create_event') {
      await addEvent({
        title: input.title,
        date: input.date,
        startH: input.start_h,
        startM: input.start_m,
        endH: input.end_h,
        endM: input.end_m,
        color: input.color || 'blue',
        note: '',
      });
    } else if (name === 'update_task') {
      const task = tasks.find(t => String(t.id) === String(input.task_id));
      if (task) {
        await updateTask({
          ...task,
          ...(input.status   !== undefined && { status: input.status }),
          ...(input.deadline !== undefined && { deadline: input.deadline }),
          ...(input.priority !== undefined && { priority: input.priority }),
        });
      }
    } else if (name === 'filter_and_update_tasks') {
      const keyword = (input.keyword || '').toLowerCase();
      const matched = tasks.filter(t => t.title?.toLowerCase().includes(keyword));
      for (const task of matched) {
        await updateTask({
          ...task,
          ...(input.status   !== undefined && { status: input.status }),
          ...(input.deadline !== undefined && { deadline: input.deadline }),
          ...(input.priority !== undefined && { priority: input.priority }),
        });
      }
    }
  };

  const send = async (text) => {
    const msg = (text || input).trim();
    if (!msg && !pendingImage) return;
    if (loading) return;
    setInput('');
    const imageToSend = pendingImage;
    setPendingImage(null);

    const newMsg = { role: 'user', content: msg, image: imageToSend?.uri };
    const newMessages = [...messages, newMsg];
    setMessages(newMessages);
    setLoading(true);

    try {
      const taskList = tasks.map(t =>
        '- task_id="' + t.id + '" | ' + t.title + ' | ' + (t.priority || 'geen prioriteit') + ' | ' + (t.status || 'geen status') + (t.deadline ? ' | deadline: ' + t.deadline : '')
      ).join('\n');
      const eventList = events.map(e =>
        '- ' + e.title + ' op ' + e.date + ' van ' + pad(e.startH) + ':' + pad(e.startM) + ' tot ' + pad(e.endH) + ':' + pad(e.endM)
      ).join('\n');
      const systemPrompt =
        'Je bent een slimme planningsassistent voor justmyplan.\n\n' +
        'Vandaag is het: ' + todayStr + '\n\n' +
        'GEDRAGSREGEL — je gebruikt ALTIJD een tool, zonder uitzondering:\n' +
        '- Gebruiker vraagt een actie (taak/afspraak aanmaken of wijzigen)? gebruik de actie-tool direct\n' +
        '- Gebruiker stelt een vraag of voert gesprek? gebruik no_action met je antwoord\n' +
        '- Meerdere taken wijzigen op basis van een woord? gebruik filter_and_update_tasks met het zoekwoord.\n' +
        '- Eén taak wijzigen? gebruik update_task.\n' +
        'VERBOD: Zeg nooit dat je iets hebt gedaan zonder de bijbehorende tool aan te roepen.\n\n' +
        'WERKWIJZE:\n' + (memory || 'Nog geen werkwijze opgeslagen.') + '\n\n' +
        'TAKEN:\n' + (taskList || 'Geen taken') + '\n\n' +
        'AGENDA:\n' + (eventList || 'Geen afspraken') + '\n\n' +
        'Regels: spreek altijd Nederlands, geef korte concrete antwoorden, gebruik task_id exact zoals hij in de lijst staat. Gebruik update_memory zodra de gebruiker een voorkeur uitlegt.';

      const apiKey = process.env.EXPO_PUBLIC_CLAUDE_API_KEY;
      let apiMessages = buildApiMessages(newMessages, imageToSend);

      // Tool use loop (max 10 iteraties)
      let iterations = 0;
      let actionsExecuted = 0;
      let continueLoop = true;
      while (continueLoop && iterations < 10) {
        iterations++;
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 8192,
            system: systemPrompt,
            tools: TOOLS,
            tool_choice: iterations === 1 ? { type: 'any' } : { type: 'auto' },
            messages: apiMessages,
          }),
        });

        const data = await response.json();

        if (data.stop_reason === 'tool_use') {
          const toolUseBlocks = data.content.filter(b => b.type === 'tool_use');

          // no_action: toon antwoord direct en stop de loop
          const noActionBlock = toolUseBlocks.find(b => b.name === 'no_action');
          if (noActionBlock) {
            setMessages(m => [...m, { role: 'assistant', content: noActionBlock.input.reply }]);
            continueLoop = false;
            break;
          }

          // Toon antwoord alvast als er ook een tekst-block is
          const textBlock = data.content.find(b => b.type === 'text');
          if (textBlock?.text) {
            setMessages(m => [...m, { role: 'assistant', content: textBlock.text }]);
          }

          // Uitvoer-indicator tonen
          setLoadingStatus('Voert ' + toolUseBlocks.length + ' actie' + (toolUseBlocks.length > 1 ? 's' : '') + ' uit...');
          await new Promise(r => setTimeout(r, 50)); // geef React tijd om te renderen

          const toolResults = [];
          for (const toolUse of toolUseBlocks) {
            await executeTool(toolUse.name, toolUse.input);
            actionsExecuted++;
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: 'Actie succesvol uitgevoerd.',
            });
          }
          apiMessages = [
            ...apiMessages,
            { role: 'assistant', content: data.content },
            { role: 'user',      content: toolResults },
          ];
        } else {
          const reply = data.content?.find(b => b.type === 'text')?.text
            || (actionsExecuted > 0 ? `Gedaan. ${actionsExecuted} item${actionsExecuted > 1 ? 's' : ''} bijgewerkt.` : 'Sorry, er ging iets mis.');
          setMessages(m => [...m, { role: 'assistant', content: reply }]);
          continueLoop = false;
        }
      }
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Er is een verbindingsfout opgetreden.' }]);
    }
    setLoading(false);
    setLoadingStatus('');
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={88}>
      {/* Stats bar */}
      <View style={s.statsBar}>
        <Text style={s.statsText}>{tasks.length} taken · {events.length} afspraken</Text>
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={loading ? [...messages, { role: 'loading', content: '' }] : messages}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={s.messageList}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          if (item.role === 'loading') {
            return (
              <View style={s.bubbleRow}>
                <View style={[s.bubble, s.bubbleAssistant, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                  <ActivityIndicator size="small" color="#2563EB" />
                  {loadingStatus ? <Text style={{ fontSize: 12, color: '#6b7280' }}>{loadingStatus}</Text> : null}
                </View>
              </View>
            );
          }
          const isUser = item.role === 'user';
          return (
            <View style={[s.bubbleRow, isUser && s.bubbleRowUser]}>
              <View style={{ maxWidth: '85%', alignItems: isUser ? 'flex-end' : 'flex-start', gap: 4 }}>
                {item.image && (
                  <Image source={{ uri: item.image }} style={s.imagePreview} resizeMode="cover" />
                )}
                {item.content ? (
                  <View style={[s.bubble, isUser ? s.bubbleUser : s.bubbleAssistant]}>
                    <Text style={[s.bubbleText, isUser && s.bubbleTextUser]}>{item.content}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        }}
      />

      {/* Suggestions */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.suggestionsRow} contentContainerStyle={s.suggestions}>
        {SUGGESTIONS.map(q => (
          <TouchableOpacity key={q} style={s.suggestionChip} onPress={() => send(q)}>
            <Text style={s.suggestionText}>{q}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Pending image preview */}
      {pendingImage && (
        <View style={s.pendingImageRow}>
          <Image source={{ uri: pendingImage.uri }} style={s.pendingThumb} resizeMode="cover" />
          <TouchableOpacity style={s.removeImage} onPress={() => setPendingImage(null)}>
            <Ionicons name="close" size={12} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Input bar */}
      <View style={s.inputBar}>
        <TouchableOpacity style={s.attachBtn} onPress={pickImage}>
          <Ionicons name="image-outline" size={20} color="#6b7280" />
        </TouchableOpacity>
        <TextInput
          style={s.input}
          placeholder="Vraag iets aan je assistent..."
          placeholderTextColor="#9ca3af"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => send()}
          returnKeyType="send"
          multiline={false}
        />
        <TouchableOpacity
          style={[s.sendBtn, ((!input.trim() && !pendingImage) || loading) && s.sendBtnDisabled]}
          onPress={() => send()}
          disabled={(!input.trim() && !pendingImage) || loading}
        >
          <Ionicons name="arrow-up" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#fafafa' },
  statsBar:         { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#fff' },
  statsText:        { fontSize: 12, color: '#9ca3af' },
  messageList:      { padding: 14, gap: 10, paddingBottom: 4 },
  bubbleRow:        { flexDirection: 'row', justifyContent: 'flex-start' },
  bubbleRowUser:    { justifyContent: 'flex-end' },
  bubble:           { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 16 },
  bubbleAssistant:  { backgroundColor: '#fff', borderTopLeftRadius: 4, borderWidth: 1, borderColor: '#e5e7eb' },
  bubbleUser:       { backgroundColor: '#2563EB', borderTopRightRadius: 4 },
  bubbleText:       { fontSize: 14, color: '#111827', lineHeight: 20 },
  bubbleTextUser:   { color: '#fff' },
  imagePreview:     { width: 180, height: 180, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  suggestionsRow:   { maxHeight: 42, borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#fff' },
  suggestions:      { paddingHorizontal: 12, paddingVertical: 7, gap: 8, flexDirection: 'row' },
  suggestionChip:   { backgroundColor: '#f3f4f6', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: '#e5e7eb' },
  suggestionText:   { fontSize: 12, color: '#374151' },
  pendingImageRow:  { flexDirection: 'row', padding: 8, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#fff' },
  pendingThumb:     { width: 52, height: 52, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  removeImage:      { position: 'absolute', top: 4, left: 58, width: 18, height: 18, borderRadius: 9, backgroundColor: '#374151', justifyContent: 'center', alignItems: 'center' },
  inputBar:         { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 8, borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#fff' },
  attachBtn:        { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  input:            { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 9, fontSize: 14, color: '#111827' },
  sendBtn:          { width: 38, height: 38, borderRadius: 19, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled:  { backgroundColor: '#d1d5db' },
});
