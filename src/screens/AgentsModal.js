import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, TextInput,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { HARDCODED_AGENTS, MODEL_BADGE_COLOR, AGENT_RUN_URL } from '../agents';

export default function AgentsModal({ visible, onClose }) {
  const [selected, setSelected] = useState(null);
  const [input, setInput]       = useState('');
  const [running, setRunning]   = useState(false);
  const [reply, setReply]       = useState(null);

  const back = () => { setSelected(null); setInput(''); setReply(null); setRunning(false); };
  const close = () => { back(); onClose(); };

  const trigger = async () => {
    if (!selected || !input.trim()) return;
    setRunning(true); setReply(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(AGENT_RUN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ agent_id: selected.id, message: input.trim() }),
      });
      const data = await res.json();
      setReply(data.reply || data.error || 'Geen response');
    } catch (err) {
      setReply('Fout: ' + err.message);
    }
    setRunning(false);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          {selected ? (
            <TouchableOpacity onPress={back} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-back" size={24} color="#f9fafb" />
            </TouchableOpacity>
          ) : <View style={{ width: 24 }} />}
          <Text style={s.headerTitle}>{selected ? selected.name : '⚡ Agent Management'}</Text>
          <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={24} color="#9ca3af" />
          </TouchableOpacity>
        </View>

        {!selected ? (
          /* ── Agentlijst ── */
          <ScrollView style={{ flex: 1 }}>
            {HARDCODED_AGENTS.map(agent => (
              <TouchableOpacity key={agent.id} style={s.agentRow} onPress={() => { setSelected(agent); setReply(null); setInput(''); }}>
                <Text style={s.agentEmoji}>{agent.emoji}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.agentName} numberOfLines={1}>{agent.name}</Text>
                  <Text style={s.agentRole} numberOfLines={1}>{agent.role}</Text>
                </View>
                <View style={[s.modelBadge, { backgroundColor: MODEL_BADGE_COLOR[agent.model] || '#374151' }]}>
                  <Text style={s.modelBadgeText}>{agent.model.toUpperCase()}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          /* ── Agent-detail + chat ── */
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={20}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              <View style={s.agentHead}>
                <Text style={{ fontSize: 30 }}>{selected.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.agentHeadName}>{selected.name}</Text>
                  <Text style={s.agentHeadRole}>{selected.role}</Text>
                </View>
                <View style={[s.modelBadge, { backgroundColor: MODEL_BADGE_COLOR[selected.model] || '#374151' }]}>
                  <Text style={s.modelBadgeText}>{selected.model.toUpperCase()}</Text>
                </View>
              </View>

              {running && (
                <View style={s.runningRow}>
                  <ActivityIndicator color="#2563EB" size="small" />
                  <Text style={s.runningText}>{selected.name} denkt na...</Text>
                </View>
              )}

              {reply && (
                <View style={s.replyBox}>
                  <Text style={s.replyLabel}>Antwoord</Text>
                  <Text style={s.replyText}>{reply}</Text>
                </View>
              )}
            </ScrollView>

            <View style={s.inputBar}>
              <TextInput
                style={s.input}
                placeholder={`Bericht aan ${selected.name}...`}
                placeholderTextColor="#6b7280"
                value={input}
                onChangeText={setInput}
                multiline
              />
              <TouchableOpacity onPress={trigger} disabled={running || !input.trim()}
                style={[s.sendBtn, (running || !input.trim()) && { backgroundColor: '#27272a' }]}>
                <Ionicons name="send" size={18} color={(running || !input.trim()) ? '#6b7280' : '#fff'} />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#18181b' },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#27272a' },
  headerTitle:    { color: '#f9fafb', fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
  agentRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#27272a' },
  agentEmoji:     { fontSize: 20 },
  agentName:      { color: '#f9fafb', fontSize: 15, fontWeight: '600' },
  agentRole:      { color: '#9ca3af', fontSize: 12, marginTop: 1 },
  modelBadge:     { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  modelBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  agentHead:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  agentHeadName:  { color: '#f9fafb', fontSize: 18, fontWeight: '700' },
  agentHeadRole:  { color: '#9ca3af', fontSize: 13, marginTop: 2 },
  runningRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  runningText:    { color: '#9ca3af', fontSize: 13 },
  replyBox:       { backgroundColor: '#0f1f14', borderWidth: 1, borderColor: '#166534', borderRadius: 8, padding: 14 },
  replyLabel:     { color: '#4ade80', fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  replyText:      { color: '#dcfce7', fontSize: 14, lineHeight: 21 },
  inputBar:       { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: '#27272a', backgroundColor: '#18181b' },
  input:          { flex: 1, maxHeight: 120, backgroundColor: '#27272a', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#f9fafb' },
  sendBtn:        { width: 42, height: 42, borderRadius: 21, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center' },
});
