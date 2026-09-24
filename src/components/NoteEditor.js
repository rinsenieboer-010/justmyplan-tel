import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function NoteEditor({ value, onChange, onClose }) {
  return (
    <KeyboardAvoidingView style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} accessibilityViewIsModal>
      <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
        padding: 16, height: 320, maxHeight: '90%', flexShrink: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ flex: 1, fontSize: 17, fontWeight: '600', color: '#1d1d1f' }}>Notitie</Text>
          <TouchableOpacity onPress={onClose} style={{ padding: 10 }} accessibilityRole="button">
            <Text style={{ color: '#2563EB', fontSize: 16, fontWeight: '600' }}>Gereed</Text>
          </TouchableOpacity>
        </View>
        <TextInput autoFocus multiline scrollEnabled value={value} onChangeText={onChange}
          accessibilityLabel="Notitie bewerken" placeholder="Voeg een notitie toe..."
          style={{ flex: 1, minHeight: 80, fontSize: 16, lineHeight: 23, textAlignVertical: 'top',
            color: '#1d1d1f', borderWidth: 1, borderColor: '#e5e5ea', borderRadius: 10, padding: 12 }} />
      </View>
    </KeyboardAvoidingView>
  );
}
