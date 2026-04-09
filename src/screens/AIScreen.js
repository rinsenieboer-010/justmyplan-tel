import { useState, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView,
  ActivityIndicator, Image, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useData } from '../context/DataContext';
import { pad, MONTHS } from '../utils';

const today = new Date();
const todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');

const SUGGESTIONS = ['Plan mijn taken in', 'Vrije momenten deze week', 'Goede voornemens inplannen'];

export default function AIScreen() {
  const { tasks, events } = useData();
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Goeiedag! Ik ben je planningsassistent.\n\nIk zie je taken en agenda. Ik kan je helpen:\n- Taken inplannen op vrije momenten\n- Goede voornemens slim verdelen\n- Je week overzichtelijker maken\n\nWat wil je aanpakken?' },
  ]);
  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
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
        '- [ID:' + t.id + '] ' + t.title + ' (' + (t.priority || 'geen prioriteit') + ', ' + (t.status || 'geen status') + (t.deadline ? ', deadline: ' + t.deadline : '') + ')'
      ).join('\n');
      const eventList = events.map(e =>
        '- ' + e.title + ' op ' + e.date + ' van ' + pad(e.startH) + ':' + pad(e.startM) + ' tot ' + pad(e.endH) + ':' + pad(e.endM)
      ).join('\n');
      const systemPrompt =
        'Je bent een slimme, proactieve planningsassistent voor justmyplan.\n\n' +
        'Vandaag is het: ' + todayStr + '\n\n' +
        'TAKEN:\n' + (taskList || 'Geen taken') + '\n\n' +
        'AGENDA:\n' + (eventList || 'Geen afspraken') + '\n\n' +
        'Geef concrete, praktische adviezen. Hou antwoorden kort en duidelijk. Spreek Nederlands.';

      const apiKey = process.env.EXPO_PUBLIC_CLAUDE_API_KEY;
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
          max_tokens: 1024,
          system: systemPrompt,
          messages: buildApiMessages(newMessages, imageToSend),
        }),
      });
      const data = await response.json();
      const reply = data.content?.[0]?.text || 'Sorry, er ging iets mis.';
      setMessages(m => [...m, { role: 'assistant', content: reply }]);
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Er is een verbindingsfout opgetreden.' }]);
    }
    setLoading(false);
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
                <View style={[s.bubble, s.bubbleAssistant]}>
                  <ActivityIndicator size="small" color="#2563EB" />
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
