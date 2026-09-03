import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform, Alert, Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { supabase, mensajeDeError } from './supabaseClient';
import EventsScreen from './EventsScreen';
import ChatView from './ChatView';
import { DenunciaModal, confirmarBloqueo, getBloqueados } from './moderacion';

const COLORS = {
  primary: '#003D7A',
  secondary: '#00BCD4',
  accent: '#FF9500',
  light: '#f5f9fc',
  subtitle: '#666',
};

function Avatar({ perfil, color, size = 44 }) {
  const estilo = { width: size, height: size, borderRadius: size / 2 };
  if (perfil?.avatar_url) {
    return <Image source={{ uri: perfil.avatar_url }} style={[estilo, { backgroundColor: '#e8eef4' }]} />;
  }
  return (
    <View style={[styles.avatar, estilo, color && { backgroundColor: color }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>
        {(perfil?.nombre || 'R').charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export default function SocialScreen() {
  const [yo, setYo] = useState(null);
  const [vista, setVista] = useState('chats'); // 'chats' | 'riders' | 'eventos'
  const [conversando, setConversando] = useState(null); // perfil del otro

  const [siguiendo, setSiguiendo] = useState([]); // ids que sigo
  const [seguidores, setSeguidores] = useState([]); // ids que me siguen
  const [perfiles, setPerfiles] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [conversaciones, setConversaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [bloqueados, setBloqueados] = useState([]);
  const [denunciando, setDenunciando] = useState(null);

  const mutuo = (id) => siguiendo.includes(id) && seguidores.includes(id);

  // ---------------- carga inicial ----------------
  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    setYo(uid);
    if (!uid) {
      setCargando(false);
      return;
    }

    const [sigo, meSiguen, msgs] = await Promise.all([
      supabase.from('follows').select('seguido').eq('seguidor', uid),
      supabase.from('follows').select('seguidor').eq('seguido', uid),
      supabase
        .from('mensajes')
        .select('*')
        .or(`emisor.eq.${uid},receptor.eq.${uid}`)
        .order('creado_en', { ascending: false })
        .limit(400),
    ]);

    setBloqueados(await getBloqueados());
    const idsSigo = (sigo.data || []).map((f) => f.seguido);
    const idsSiguen = (meSiguen.data || []).map((f) => f.seguidor);
    setSiguiendo(idsSigo);
    setSeguidores(idsSiguen);

    // agrupamos los mensajes por interlocutor
    const porPersona = {};
    (msgs.data || []).forEach((m) => {
      const otro = m.emisor === uid ? m.receptor : m.emisor;
      if (!porPersona[otro]) {
        porPersona[otro] = { otro, ultimo: m, sinLeer: 0 };
      }
      if (m.receptor === uid && !m.leido) porPersona[otro].sinLeer += 1;
    });

    // traemos los nombres de todos los involucrados
    const ids = [...new Set([...idsSigo, ...idsSiguen, ...Object.keys(porPersona)])];
    let mapa = {};
    if (ids.length) {
      const { data: perf } = await supabase.from('profiles').select('*').in('id', ids);
      (perf || []).forEach((p) => (mapa[p.id] = p));
      setPerfiles(perf || []);
    } else {
      setPerfiles([]);
    }

    setConversaciones(
      Object.values(porPersona)
        .map((c) => ({ ...c, perfil: mapa[c.otro] || { id: c.otro, nombre: 'Rider' } }))
        .sort((a, b) => new Date(b.ultimo.creado_en) - new Date(a.ultimo.creado_en))
    );

    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, []);

  // ---------------- buscar riders ----------------
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (!yo) return;
    let cancelado = false;
    const t = setTimeout(async () => {
      setBuscando(true);
      let q = supabase.from('profiles').select('*').neq('id', yo).limit(25);
      if (busqueda.trim().length >= 2) q = q.ilike('nombre', `%${busqueda.trim()}%`);
      const { data } = await q;
      if (!cancelado) {
        setResultados((data || []).filter((p) => !bloqueados.includes(p.id)));
        setBuscando(false);
      }
    }, 350);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [busqueda, yo, vista, bloqueados]);

  const seguir = async (id) => {
    setSiguiendo((s) => [...s, id]);
    const { error } = await supabase.from('follows').insert({ seguidor: yo, seguido: id });
    if (error) {
      setSiguiendo((s) => s.filter((x) => x !== id));
      Alert.alert('No se pudo seguir', mensajeDeError(error));
    }
  };

  const dejarDeSeguir = async (id) => {
    setSiguiendo((s) => s.filter((x) => x !== id));
    const { error } = await supabase.from('follows').delete().eq('seguidor', yo).eq('seguido', id);
    if (error) {
      setSiguiendo((s) => [...s, id]);
      Alert.alert('No se pudo dejar de seguir', mensajeDeError(error));
    }
  };

  if (conversando) {
    return (
      <ChatView
        yo={yo}
        otro={conversando}
        habilitado={mutuo(conversando.id) && !bloqueados.includes(conversando.id)}
        volver={() => {
          setConversando(null);
          cargar();
        }}
      />
    );
  }

  if (cargando) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.light }}>
      <View style={styles.switch}>
        <TouchableOpacity
          style={[styles.switchBtn, vista === 'chats' && styles.switchOn]}
          onPress={() => setVista('chats')}
        >
          <MaterialCommunityIcons
            name="message-text-outline"
            size={16}
            color={vista === 'chats' ? '#fff' : COLORS.primary}
          />
          <Text style={[styles.switchText, vista === 'chats' && { color: '#fff' }]}>Chats</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.switchBtn, vista === 'riders' && styles.switchOn]}
          onPress={() => setVista('riders')}
        >
          <MaterialCommunityIcons
            name="account-search-outline"
            size={16}
            color={vista === 'riders' ? '#fff' : COLORS.primary}
          />
          <Text style={[styles.switchText, vista === 'riders' && { color: '#fff' }]}>Riders</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.switchBtn, vista === 'eventos' && styles.switchOn]}
          onPress={() => setVista('eventos')}
        >
          <MaterialCommunityIcons
            name="calendar-star"
            size={16}
            color={vista === 'eventos' ? '#fff' : COLORS.primary}
          />
          <Text style={[styles.switchText, vista === 'eventos' && { color: '#fff' }]}>Eventos</Text>
        </TouchableOpacity>
      </View>

      {vista === 'eventos' && <EventsScreen yo={yo} />}

      {vista !== 'eventos' && (
      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={COLORS.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        {vista === 'chats' ? (
          <>
            {conversaciones.length === 0 ? (
              <View style={styles.vacio}>
                <MaterialCommunityIcons name="message-outline" size={52} color="#c9d6e2" />
                <Text style={styles.vacioTitulo}>Todavía no hablaste con nadie</Text>
                <Text style={styles.vacioTexto}>
                  Para chatear con alguien tienen que seguirse los dos. Buscá riders en la otra
                  pestaña y empezá por ahí.
                </Text>
              </View>
            ) : (
              conversaciones.filter((c) => !bloqueados.includes(c.otro)).map((c) => (
                <TouchableOpacity key={c.otro} style={styles.chatCard} onPress={() => setConversando(c.perfil)}>
                  <Avatar perfil={c.perfil} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.chatNombre}>{c.perfil.nombre || 'Rider'}</Text>
                    <Text style={styles.chatUltimo} numberOfLines={1}>
                      {c.ultimo.emisor === yo ? 'Vos: ' : ''}
                      {c.ultimo.texto}
                    </Text>
                  </View>
                  {c.sinLeer > 0 && (
                    <View style={styles.sinLeer}>
                      <Text style={styles.sinLeerText}>{c.sinLeer}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))
            )}

            {siguiendo.length > 0 && (
              <View style={{ marginTop: 22 }}>
                <Text style={styles.seccion}>Podés escribirle a</Text>
                {perfiles
                  .filter((p) => mutuo(p.id) && !conversaciones.find((c) => c.otro === p.id))
                  .map((p) => (
                    <TouchableOpacity key={p.id} style={styles.chatCard} onPress={() => setConversando(p)}>
                      <Avatar perfil={p} color={COLORS.secondary} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.chatNombre}>{p.nombre || 'Rider'}</Text>
                        <Text style={styles.chatUltimo}>Se siguen · tocá para escribir</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={20} color="#c9d6e2" />
                    </TouchableOpacity>
                  ))}
              </View>
            )}
          </>
        ) : (
          <>
            <View style={styles.buscador}>
              <MaterialCommunityIcons name="magnify" size={19} color={COLORS.subtitle} />
              <TextInput
                style={styles.buscadorInput}
                value={busqueda}
                onChangeText={setBusqueda}
                placeholder="Buscar por nombre..."
                placeholderTextColor="#aaa"
                autoCapitalize="none"
              />
              {buscando && <ActivityIndicator size="small" color={COLORS.primary} />}
            </View>

            <Text style={styles.ayudaBusqueda}>
              Para poder chatear tienen que seguirse los dos.
            </Text>

            {resultados.length === 0 && !buscando && (
              <View style={styles.vacio}>
                <MaterialCommunityIcons name="account-search-outline" size={48} color="#c9d6e2" />
                <Text style={styles.vacioTitulo}>Sin riders todavía</Text>
                <Text style={styles.vacioTexto}>
                  A medida que se registre gente vas a verla acá.
                </Text>
              </View>
            )}

            {resultados.map((p) => {
              const loSigo = siguiendo.includes(p.id);
              const meSigue = seguidores.includes(p.id);
              const esMutuo = loSigo && meSigue;
              return (
                <View key={p.id} style={styles.riderCard}>
                  <Avatar perfil={p} color={esMutuo ? '#34C759' : null} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.chatNombre}>{p.nombre || 'Rider'}</Text>
                    <Text style={styles.riderMeta}>
                      {p.nivel || 'Nivel sin definir'}
                      {esMutuo ? ' · se siguen' : meSigue ? ' · te sigue' : ''}
                    </Text>
                  </View>

                  {esMutuo && (
                    <TouchableOpacity style={styles.btnChat} onPress={() => setConversando(p)}>
                      <MaterialCommunityIcons name="message-text" size={17} color="#fff" />
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.btnSeguir, loSigo && styles.btnSiguiendo]}
                    onPress={() => (loSigo ? dejarDeSeguir(p.id) : seguir(p.id))}
                  >
                    <Text style={[styles.btnSeguirText, loSigo && { color: COLORS.primary }]}>
                      {loSigo ? 'Siguiendo' : 'Seguir'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.btnMenu}
                    onPress={() =>
                      Alert.alert(p.nombre || 'Rider', '¿Qué querés hacer?', [
                        { text: 'Cancelar', style: 'cancel' },
                        {
                          text: 'Denunciar',
                          onPress: () =>
                            setDenunciando({
                              usuario: p.id,
                              descripcion: `Perfil de ${p.nombre || 'un rider'}`,
                            }),
                        },
                        {
                          text: 'Bloquear',
                          style: 'destructive',
                          onPress: () => confirmarBloqueo(p, setBloqueados),
                        },
                      ])
                    }
                  >
                    <MaterialCommunityIcons name="dots-vertical" size={19} color="#b6c3ce" />
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
      )}

      <DenunciaModal
        visible={!!denunciando}
        cerrar={() => setDenunciando(null)}
        objetivo={denunciando}
      />
    </View>
  );
}

// ============================================================
// CONVERSACIÓN
// ============================================================

const styles = StyleSheet.create({
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.light },

  switch: {
    flexDirection: 'row', backgroundColor: '#fff', padding: 8, gap: 8,
    borderBottomWidth: 1, borderBottomColor: '#e8eef4',
  },
  switchBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 10, borderRadius: 9, backgroundColor: '#eef4fa',
  },
  switchOn: { backgroundColor: COLORS.primary },
  switchText: { fontSize: 12, fontWeight: 'bold', color: COLORS.primary },

  vacio: { alignItems: 'center', paddingVertical: 46, paddingHorizontal: 26 },
  vacioTitulo: { fontSize: 15, fontWeight: 'bold', color: '#1a1a1a', marginTop: 12 },
  vacioTexto: { fontSize: 12.5, color: COLORS.subtitle, textAlign: 'center', marginTop: 6, lineHeight: 18 },

  seccion: { fontSize: 14, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 10 },

  chatCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff',
    borderRadius: 12, padding: 12, marginBottom: 9, elevation: 1,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  chatNombre: { fontSize: 14.5, fontWeight: 'bold', color: '#1a1a1a' },
  chatUltimo: { fontSize: 12, color: COLORS.subtitle, marginTop: 2 },
  sinLeer: {
    backgroundColor: '#34C759', minWidth: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  sinLeerText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  buscador: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4, elevation: 1,
  },
  buscadorInput: { flex: 1, paddingVertical: 10, fontSize: 14 },
  ayudaBusqueda: { fontSize: 11, color: '#8a9aa8', marginTop: 8, marginBottom: 14, fontStyle: 'italic' },

  riderCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff',
    borderRadius: 12, padding: 12, marginBottom: 9, elevation: 1,
  },
  riderMeta: { fontSize: 11.5, color: COLORS.subtitle, marginTop: 2 },
  btnChat: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#34C759',
    alignItems: 'center', justifyContent: 'center',
  },
  btnSeguir: { backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18 },
  btnSiguiendo: { backgroundColor: '#eef4fa', borderWidth: 1, borderColor: '#d5e3f0' },
  btnSeguirText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  btnMenu: { padding: 3 },


});
