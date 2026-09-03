import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { supabase } from './supabaseClient';
import { DenunciaModal, confirmarBloqueo } from './moderacion';

const COLORS = {
  primary: '#003D7A',
  secondary: '#00BCD4',
  light: '#f5f9fc',
  subtitle: '#666',
};

export default function ChatView({ yo, otro, habilitado, volver }) {
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [denunciando, setDenunciando] = useState(null);
  const scroll = useRef(null);

  useEffect(() => {
    let canal;

    const traer = async () => {
      const { data } = await supabase
        .from('mensajes')
        .select('*')
        .or(
          `and(emisor.eq.${yo},receptor.eq.${otro.id}),and(emisor.eq.${otro.id},receptor.eq.${yo})`
        )
        .order('creado_en', { ascending: true })
        .limit(200);
      setMensajes(data || []);
      setCargando(false);

      const pendientes = (data || []).filter((m) => m.receptor === yo && !m.leido).map((m) => m.id);
      if (pendientes.length) {
        await supabase.from('mensajes').update({ leido: true }).in('id', pendientes);
      }
    };

    traer();

    canal = supabase
      .channel(`chat-${yo}-${otro.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensajes', filter: `receptor=eq.${yo}` },
        (payload) => {
          if (payload.new.emisor === otro.id) setMensajes((m) => [...m, payload.new]);
        }
      )
      .subscribe();

    return () => {
      if (canal) supabase.removeChannel(canal);
    };
  }, [yo, otro.id]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    const { data, error } = await supabase
      .from('mensajes')
      .insert({ emisor: yo, receptor: otro.id, texto: t })
      .select()
      .single();
    setEnviando(false);

    if (error) {
      Alert.alert(
        'No se pudo enviar',
        'Para chatear tienen que seguirse los dos. Fijate en la pestaña de Riders.'
      );
      return;
    }
    setMensajes((m) => [...m, data]);
    setTexto('');
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80);
  };

  const hora = (iso) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.light }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={volver} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={COLORS.primary} />
        </TouchableOpacity>

        {otro.avatar_url ? (
          <Image source={{ uri: otro.avatar_url }} style={styles.avatarImg} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(otro.nombre || 'R').charAt(0).toUpperCase()}</Text>
          </View>
        )}

        <View style={{ flex: 1 }}>
          <Text style={styles.headerNombre}>{otro.nombre || 'Rider'}</Text>
          {otro.nivel ? <Text style={styles.headerMeta}>{otro.nivel}</Text> : null}
        </View>

        <TouchableOpacity
          style={{ padding: 6 }}
          onPress={() =>
            Alert.alert(otro.nombre || 'Rider', '¿Qué querés hacer?', [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Denunciar conversación',
                onPress: () =>
                  setDenunciando({
                    usuario: otro.id,
                    descripcion: `Chat con ${otro.nombre || 'un rider'}`,
                  }),
              },
              {
                text: 'Bloquear',
                style: 'destructive',
                onPress: () => confirmarBloqueo(otro, () => volver()),
              },
            ])
          }
        >
          <MaterialCommunityIcons name="dots-vertical" size={21} color={COLORS.subtitle} />
        </TouchableOpacity>
      </View>

      {cargando ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          ref={scroll}
          contentContainerStyle={{ padding: 14, gap: 8 }}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
        >
          {mensajes.length === 0 && (
            <Text style={styles.vacio}>No hay mensajes todavía. Escribí el primero.</Text>
          )}
          {mensajes.map((m) => {
            const mio = m.emisor === yo;
            return (
              <TouchableOpacity
                key={m.id}
                activeOpacity={0.9}
                onLongPress={() =>
                  mio
                    ? null
                    : setDenunciando({
                        usuario: otro.id,
                        mensaje: m.id,
                        descripcion: `Mensaje: "${m.texto.slice(0, 60)}"`,
                      })
                }
                style={[styles.burbuja, mio ? styles.mia : styles.suya]}
              >
                <Text style={[styles.texto, mio && { color: '#fff' }]}>{m.texto}</Text>
                <Text style={[styles.hora, mio && { color: 'rgba(255,255,255,0.7)' }]}>
                  {hora(m.creado_en)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {habilitado ? (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={texto}
            onChangeText={setTexto}
            placeholder="Escribí un mensaje..."
            placeholderTextColor="#aaa"
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[styles.enviar, (!texto.trim() || enviando) && { opacity: 0.5 }]}
            onPress={enviar}
            disabled={!texto.trim() || enviando}
          >
            <MaterialCommunityIcons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.bloqueado}>
          <MaterialCommunityIcons name="lock-outline" size={17} color="#8a5a00" />
          <Text style={styles.bloqueadoText}>Para escribirle tienen que seguirse los dos.</Text>
        </View>
      )}
      <DenunciaModal
        visible={!!denunciando}
        cerrar={() => setDenunciando(null)}
        objetivo={denunciando}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff',
    paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e8eef4',
  },
  avatar: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#e8eef4' },
  avatarText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  headerNombre: { fontSize: 15, fontWeight: 'bold', color: '#1a1a1a' },
  headerMeta: { fontSize: 11, color: COLORS.subtitle },

  vacio: { fontSize: 12.5, color: '#8a9aa8', textAlign: 'center', marginTop: 30, fontStyle: 'italic' },
  burbuja: { maxWidth: '80%', borderRadius: 14, paddingHorizontal: 13, paddingVertical: 9 },
  mia: { alignSelf: 'flex-end', backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  suya: { alignSelf: 'flex-start', backgroundColor: '#fff', borderBottomLeftRadius: 4, elevation: 1 },
  texto: { fontSize: 14.5, color: '#1a1a1a', lineHeight: 20 },
  hora: { fontSize: 9.5, color: '#aaa', alignSelf: 'flex-end', marginTop: 3 },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e8eef4',
  },
  input: {
    flex: 1, backgroundColor: '#f5f7fa', borderRadius: 20, paddingHorizontal: 15,
    paddingVertical: 10, fontSize: 14.5, maxHeight: 110, borderWidth: 1, borderColor: '#e3ebf2',
  },
  enviar: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  bloqueado: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#fff6ec', padding: 14, borderTopWidth: 1, borderTopColor: '#ffdcb8',
  },
  bloqueadoText: { fontSize: 12.5, color: '#8a5a00' },
});