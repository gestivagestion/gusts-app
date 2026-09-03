import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Modal, ActivityIndicator, Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { supabase } from './supabaseClient';

const COLORS = {
  primary: '#003D7A',
  rojo: '#c0392b',
  subtitle: '#666',
};

export const MOTIVOS = [
  'Spam o estafa',
  'Contenido ofensivo',
  'Se hace pasar por otro',
  'Información peligrosa',
  'Acoso',
  'Otro',
];

// ------------------------------------------------------------
// Bloqueos
// ------------------------------------------------------------
export async function getBloqueados() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user?.id) return [];
  const { data } = await supabase
    .from('bloqueos')
    .select('bloqueado')
    .eq('bloqueador', auth.user.id);
  return (data || []).map((b) => b.bloqueado);
}

export async function bloquear(id) {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('bloqueos')
    .insert({ bloqueador: auth.user.id, bloqueado: id });
  return error;
}

export async function desbloquear(id) {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('bloqueos')
    .delete()
    .eq('bloqueador', auth.user.id)
    .eq('bloqueado', id);
  return error;
}

// Pregunta y bloquea. onHecho recibe la lista nueva de bloqueados.
export function confirmarBloqueo(perfil, onHecho) {
  Alert.alert(
    `Bloquear a ${perfil.nombre || 'este rider'}`,
    'No van a poder escribirse ni ver lo que publica cada uno. Podés desbloquearlo cuando quieras desde tu perfil.',
    [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Bloquear',
        style: 'destructive',
        onPress: async () => {
          const error = await bloquear(perfil.id);
          if (error && !String(error.message).includes('duplicate')) {
            Alert.alert('No se pudo bloquear', error.message);
            return;
          }
          onHecho && onHecho(await getBloqueados());
        },
      },
    ]
  );
}

// ------------------------------------------------------------
// Modal de denuncia
// ------------------------------------------------------------
export function DenunciaModal({ visible, cerrar, objetivo }) {
  const [motivo, setMotivo] = useState('');
  const [detalle, setDetalle] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    if (!motivo) {
      Alert.alert('Elegí un motivo', 'Contanos qué está mal para poder revisarlo.');
      return;
    }
    setEnviando(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('denuncias').insert({
      denunciante: auth.user.id,
      denunciado: objetivo?.usuario || null,
      publicacion_id: objetivo?.publicacion || null,
      mensaje_id: objetivo?.mensaje || null,
      evento_id: objetivo?.evento || null,
      motivo,
      detalle: detalle.trim() || null,
    });
    setEnviando(false);

    if (error) {
      Alert.alert('No se pudo enviar', error.message);
      return;
    }
    setMotivo('');
    setDetalle('');
    cerrar();
    Alert.alert(
      'Denuncia enviada',
      'La revisamos lo antes posible. Si querés dejar de ver a esta persona, también podés bloquearla.'
    );
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={cerrar}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.titulo}>Denunciar</Text>
            <TouchableOpacity onPress={cerrar}>
              <MaterialCommunityIcons name="close" size={24} color={COLORS.primary} />
            </TouchableOpacity>
          </View>

          {!!objetivo?.descripcion && (
            <Text style={styles.objetivo} numberOfLines={2}>{objetivo.descripcion}</Text>
          )}

          <Text style={styles.label}>¿Qué está pasando?</Text>
          <View style={styles.motivos}>
            {MOTIVOS.map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.motivo, motivo === m && styles.motivoOn]}
                onPress={() => setMotivo(m)}
              >
                <Text style={motivo === m ? styles.motivoTextoOn : styles.motivoTexto}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.input}
            value={detalle}
            onChangeText={setDetalle}
            placeholder="Contanos qué pasó (opcional)"
            placeholderTextColor="#aaa"
            multiline
            maxLength={800}
          />

          <TouchableOpacity style={styles.enviar} onPress={enviar} disabled={enviando}>
            {enviando ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.enviarText}>Enviar denuncia</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.nota}>
            Las denuncias son anónimas para el denunciado. Si hay riesgo para alguien, avisá
            también a las autoridades del lugar.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 18, paddingHorizontal: 16, paddingBottom: 26,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  titulo: { fontSize: 19, fontWeight: 'bold', color: COLORS.rojo },
  objetivo: {
    fontSize: 12.5, color: COLORS.subtitle, backgroundColor: '#f5f7fa',
    padding: 10, borderRadius: 8, marginBottom: 14,
  },
  label: { fontSize: 13, fontWeight: '600', color: '#1a1a1a', marginBottom: 9 },
  motivos: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 },
  motivo: {
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8,
    backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0',
  },
  motivoOn: { backgroundColor: COLORS.rojo, borderColor: COLORS.rojo },
  motivoTexto: { fontSize: 12.5, fontWeight: '600', color: COLORS.subtitle },
  motivoTextoOn: { fontSize: 12.5, fontWeight: '600', color: '#fff' },
  input: {
    backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#dde6ee', fontSize: 14, height: 88, textAlignVertical: 'top',
  },
  enviar: {
    backgroundColor: COLORS.rojo, paddingVertical: 14, borderRadius: 9,
    alignItems: 'center', marginTop: 14,
  },
  enviarText: { color: '#fff', fontWeight: 'bold', fontSize: 15.5 },
  nota: { fontSize: 10.5, color: '#8a9aa8', lineHeight: 15, marginTop: 12, fontStyle: 'italic' },
});
