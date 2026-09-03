import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal,
  TextInput, ActivityIndicator, RefreshControl, Alert, Share,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { SPOTS } from './spots';
import { supabase, mensajeDeError } from './supabaseClient';

const COLORS = {
  primary: '#003D7A',
  secondary: '#00BCD4',
  accent: '#FF9500',
  light: '#f5f9fc',
  subtitle: '#666',
};

const vacio = {
  titulo: '', descripcion: '', spot: '', lat: null, lng: null,
  dia: '', hora: '', cupo: '',
};

export default function EventsScreen({ yo }) {
  const [eventos, setEventos] = useState([]);
  const [asistentes, setAsistentes] = useState({});
  const [nombres, setNombres] = useState({});
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(vacio);
  const [buscaSpot, setBuscaSpot] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);

    const desde = new Date();
    desde.setHours(0, 0, 0, 0);

    const { data: evs, error } = await supabase
      .from('eventos')
      .select('*')
      .gte('fecha', desde.toISOString())
      .order('fecha', { ascending: true })
      .limit(80);

    if (error) {
      setCargando(false);
      return;
    }
    setEventos(evs || []);

    const ids = (evs || []).map((e) => e.id);
    if (ids.length) {
      const { data: asis } = await supabase
        .from('evento_asistentes')
        .select('*')
        .in('evento_id', ids);

      const porEvento = {};
      (asis || []).forEach((a) => {
        if (!porEvento[a.evento_id]) porEvento[a.evento_id] = [];
        porEvento[a.evento_id].push(a.usuario);
      });
      setAsistentes(porEvento);

      const personas = [
        ...new Set([...(evs || []).map((e) => e.autor), ...(asis || []).map((a) => a.usuario)]),
      ];
      if (personas.length) {
        const { data: perf } = await supabase.from('profiles').select('id, nombre').in('id', personas);
        const mapa = {};
        (perf || []).forEach((p) => (mapa[p.id] = p.nombre || 'Rider'));
        setNombres(mapa);
      }
    } else {
      setAsistentes({});
    }

    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, []);

  // ---------------- crear ----------------
  const crear = async () => {
    if (!form.titulo.trim()) {
      Alert.alert('Falta el título', 'Poné de qué se trata la convocatoria.');
      return;
    }
    if (!form.spot) {
      Alert.alert('Falta el spot', 'Elegí dónde es.');
      return;
    }
    const partesDia = form.dia.split('/');
    if (partesDia.length !== 3) {
      Alert.alert('Fecha inválida', 'Escribila como DD/MM/AAAA. Ejemplo: 14/06/2026');
      return;
    }
    const partesHora = (form.hora || '').split(':');
    if (partesHora.length !== 2) {
      Alert.alert('Hora inválida', 'Escribila como HH:MM. Ejemplo: 07:30');
      return;
    }
    const fecha = new Date(
      Number(partesDia[2]),
      Number(partesDia[1]) - 1,
      Number(partesDia[0]),
      Number(partesHora[0]),
      Number(partesHora[1])
    );
    if (isNaN(fecha.getTime())) {
      Alert.alert('Fecha inválida', 'Revisá el día y la hora.');
      return;
    }

    setGuardando(true);
    const { error } = await supabase.from('eventos').insert({
      autor: yo,
      titulo: form.titulo.trim(),
      descripcion: form.descripcion.trim() || null,
      spot: form.spot,
      lat: form.lat,
      lng: form.lng,
      fecha: fecha.toISOString(),
      cupo: form.cupo ? Number(form.cupo) : null,
    });
    setGuardando(false);

    if (error) {
      Alert.alert('No se pudo crear', mensajeDeError(error));
      return;
    }
    setForm(vacio);
    setBuscaSpot('');
    setModal(false);
    cargar();
  };

  const anotarse = async (ev) => {
    const yaEstoy = (asistentes[ev.id] || []).includes(yo);
    if (yaEstoy) {
      await supabase.from('evento_asistentes').delete().eq('evento_id', ev.id).eq('usuario', yo);
    } else {
      const cupo = ev.cupo;
      if (cupo && (asistentes[ev.id] || []).length >= cupo) {
        Alert.alert('Sin lugar', 'Este evento llegó al cupo.');
        return;
      }
      const { error } = await supabase.from('evento_asistentes').insert({ evento_id: ev.id, usuario: yo });
      if (error) {
        Alert.alert('No se pudo anotar', mensajeDeError(error));
        return;
      }
    }
    cargar();
  };

  const borrar = (ev) => {
    Alert.alert('Borrar evento', `¿Eliminar "${ev.titulo}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('eventos').delete().eq('id', ev.id);
          cargar();
        },
      },
    ]);
  };

  const compartir = (ev) => {
    Share.share({
      message:
        `🪁 ${ev.titulo}\n\n` +
        `📍 ${ev.spot}\n` +
        `🗓 ${fechaLarga(ev.fecha)}\n` +
        (ev.descripcion ? `\n${ev.descripcion}\n` : '') +
        `\nOrganiza: ${nombres[ev.autor] || 'Un rider'}\n` +
        `\nConvocatoria de GUSTS · Kitesurf App`,
    });
  };

  // ---------------- helpers ----------------
  const fechaLarga = (iso) => {
    const d = new Date(iso);
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const cuandoEs = (iso) => {
    const d = new Date(iso);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const dia = new Date(d);
    dia.setHours(0, 0, 0, 0);
    const dif = Math.round((dia - hoy) / 86400000);
    if (dif === 0) return { texto: 'HOY', color: '#FF3B30' };
    if (dif === 1) return { texto: 'MAÑANA', color: '#FF9500' };
    if (dif <= 7) return { texto: `EN ${dif} DÍAS`, color: COLORS.secondary };
    return { texto: `EN ${dif} DÍAS`, color: '#8a9aa8' };
  };

  const sugerencias =
    buscaSpot.length < 2
      ? []
      : SPOTS.filter((s) =>
          (s.name + ' ' + s.region).toLowerCase().includes(buscaSpot.toLowerCase())
        ).slice(0, 6);

  if (cargando && !eventos.length) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 90 }}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={COLORS.primary} />}
      >
        {eventos.length === 0 ? (
          <View style={styles.vacio}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={52} color="#c9d6e2" />
            <Text style={styles.vacioTitulo}>No hay convocatorias</Text>
            <Text style={styles.vacioTexto}>
              Armá la primera: elegí un spot, poné día y hora, y que se sumen los que quieran.
            </Text>
          </View>
        ) : (
          eventos.map((ev) => {
            const lista = asistentes[ev.id] || [];
            const voy = lista.includes(yo);
            const mio = ev.autor === yo;
            const cuando = cuandoEs(ev.fecha);
            const lleno = ev.cupo && lista.length >= ev.cupo && !voy;

            return (
              <View key={ev.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={[styles.cuando, { backgroundColor: cuando.color }]}>
                    <Text style={styles.cuandoText}>{cuando.texto}</Text>
                  </View>
                  {mio && (
                    <TouchableOpacity onPress={() => borrar(ev)} style={{ padding: 3 }}>
                      <MaterialCommunityIcons name="trash-can-outline" size={18} color="#c0392b" />
                    </TouchableOpacity>
                  )}
                </View>

                <Text style={styles.titulo}>{ev.titulo}</Text>
                <Text style={styles.fecha}>{fechaLarga(ev.fecha)}</Text>

                <View style={styles.metaRow}>
                  <MaterialCommunityIcons name="map-marker" size={14} color={COLORS.subtitle} />
                  <Text style={styles.meta}>{ev.spot}</Text>
                </View>
                <View style={styles.metaRow}>
                  <MaterialCommunityIcons name="account-circle-outline" size={14} color={COLORS.subtitle} />
                  <Text style={styles.meta}>Organiza {mio ? 'vos' : nombres[ev.autor] || 'un rider'}</Text>
                </View>

                {!!ev.descripcion && <Text style={styles.desc}>{ev.descripcion}</Text>}

                <View style={styles.asistentesBox}>
                  <MaterialCommunityIcons name="account-group" size={15} color={COLORS.primary} />
                  <Text style={styles.asistentesText}>
                    {lista.length === 0
                      ? 'Nadie anotado todavía'
                      : lista.length === 1
                      ? '1 anotado'
                      : `${lista.length} anotados`}
                    {ev.cupo ? ` de ${ev.cupo}` : ''}
                    {lista.length > 0 && (
                      <Text style={styles.asistentesNombres}>
                        {' · '}
                        {lista.slice(0, 4).map((u) => (u === yo ? 'vos' : nombres[u] || 'rider')).join(', ')}
                        {lista.length > 4 ? ` y ${lista.length - 4} más` : ''}
                      </Text>
                    )}
                  </Text>
                </View>

                <View style={styles.acciones}>
                  <TouchableOpacity
                    style={[
                      styles.btnVoy,
                      voy && styles.btnVoyOn,
                      lleno && { backgroundColor: '#e8eef4' },
                    ]}
                    onPress={() => anotarse(ev)}
                    disabled={lleno}
                  >
                    <MaterialCommunityIcons
                      name={voy ? 'check-circle' : 'hand-wave-outline'}
                      size={17}
                      color={voy ? '#fff' : lleno ? '#8a9aa8' : COLORS.primary}
                    />
                    <Text style={[styles.btnVoyText, voy && { color: '#fff' }, lleno && { color: '#8a9aa8' }]}>
                      {voy ? 'Voy' : lleno ? 'Cupo lleno' : 'Me sumo'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.btnCompartir} onPress={() => compartir(ev)}>
                    <MaterialCommunityIcons name="share-variant" size={17} color={COLORS.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setModal(true)}>
        <MaterialCommunityIcons name="calendar-plus" size={20} color="#fff" />
        <Text style={styles.fabText}>Convocar</Text>
      </TouchableOpacity>

      {/* ---------------- formulario ---------------- */}
      <Modal animationType="slide" transparent visible={modal} onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nueva convocatoria</Text>
              <TouchableOpacity onPress={() => setModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
              <View style={{ gap: 7 }}>
                <Text style={styles.label}>¿De qué se trata? *</Text>
                <TextInput
                  style={styles.input}
                  value={form.titulo}
                  onChangeText={(v) => setForm({ ...form, titulo: v })}
                  placeholder="Salida del sábado, clínica de saltos, junta..."
                  placeholderTextColor="#aaa"
                />
              </View>

              <View style={{ gap: 7 }}>
                <Text style={styles.label}>Spot *</Text>
                {form.spot ? (
                  <View style={styles.spotElegido}>
                    <MaterialCommunityIcons name="map-marker-check" size={17} color={COLORS.secondary} />
                    <Text style={styles.spotElegidoText}>{form.spot}</Text>
                    <TouchableOpacity onPress={() => { setForm({ ...form, spot: '', lat: null, lng: null }); setBuscaSpot(''); }}>
                      <MaterialCommunityIcons name="close-circle" size={18} color="#aaa" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <TextInput
                      style={styles.input}
                      value={buscaSpot}
                      onChangeText={setBuscaSpot}
                      placeholder="Escribí para buscar el spot..."
                      placeholderTextColor="#aaa"
                    />
                    {sugerencias.map((s) => (
                      <TouchableOpacity
                        key={s.id}
                        style={styles.sugerencia}
                        onPress={() => {
                          setForm({ ...form, spot: `${s.name} (${s.region})`, lat: s.lat, lng: s.lng });
                          setBuscaSpot('');
                        }}
                      >
                        <MaterialCommunityIcons name="map-marker-outline" size={15} color={COLORS.subtitle} />
                        <Text style={styles.sugerenciaText}>{s.name} — {s.region}</Text>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1.3, gap: 7 }}>
                  <Text style={styles.label}>Día *</Text>
                  <TextInput
                    style={styles.input}
                    value={form.dia}
                    onChangeText={(v) => setForm({ ...form, dia: v })}
                    placeholder="14/06/2026"
                    placeholderTextColor="#aaa"
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <View style={{ flex: 1, gap: 7 }}>
                  <Text style={styles.label}>Hora *</Text>
                  <TextInput
                    style={styles.input}
                    value={form.hora}
                    onChangeText={(v) => setForm({ ...form, hora: v })}
                    placeholder="07:30"
                    placeholderTextColor="#aaa"
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>

              <View style={{ gap: 7 }}>
                <Text style={styles.label}>Cupo (opcional)</Text>
                <TextInput
                  style={styles.input}
                  value={form.cupo}
                  onChangeText={(v) => setForm({ ...form, cupo: v.replace(/\D/g, '') })}
                  placeholder="Dejalo vacío si no hay límite"
                  placeholderTextColor="#aaa"
                  keyboardType="numeric"
                />
              </View>

              <View style={{ gap: 7 }}>
                <Text style={styles.label}>Detalle</Text>
                <TextInput
                  style={[styles.input, { height: 84, textAlignVertical: 'top' }]}
                  value={form.descripcion}
                  onChangeText={(v) => setForm({ ...form, descripcion: v })}
                  placeholder="Punto de encuentro, nivel esperado, si hay que llevar algo..."
                  placeholderTextColor="#aaa"
                  multiline
                />
              </View>

              <TouchableOpacity style={styles.publicar} onPress={crear} disabled={guardando}>
                {guardando ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.publicarText}>Publicar convocatoria</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.light },

  vacio: { alignItems: 'center', paddingVertical: 50, paddingHorizontal: 28 },
  vacioTitulo: { fontSize: 15, fontWeight: 'bold', color: '#1a1a1a', marginTop: 12 },
  vacioTexto: { fontSize: 12.5, color: COLORS.subtitle, textAlign: 'center', marginTop: 6, lineHeight: 18 },

  card: { backgroundColor: '#fff', borderRadius: 13, padding: 15, marginBottom: 12, elevation: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  cuando: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6 },
  cuandoText: { color: '#fff', fontSize: 10, fontWeight: 'bold', letterSpacing: 0.6 },
  titulo: { fontSize: 16.5, fontWeight: 'bold', color: '#1a1a1a' },
  fecha: { fontSize: 13, color: COLORS.primary, fontWeight: '600', marginTop: 3, marginBottom: 9 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  meta: { fontSize: 12, color: COLORS.subtitle },
  desc: { fontSize: 12.5, color: '#333', lineHeight: 18, marginTop: 9 },

  asistentesBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: '#f5f9fc',
    borderRadius: 9, padding: 10, marginTop: 12,
  },
  asistentesText: { flex: 1, fontSize: 12, color: COLORS.primary, fontWeight: '600', lineHeight: 17 },
  asistentesNombres: { fontWeight: '400', color: COLORS.subtitle },

  acciones: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btnVoy: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 11, borderRadius: 9, backgroundColor: '#eef4fa',
    borderWidth: 1, borderColor: '#d5e3f0',
  },
  btnVoyOn: { backgroundColor: '#34C759', borderColor: '#34C759' },
  btnVoyText: { fontSize: 13, fontWeight: 'bold', color: COLORS.primary },
  btnCompartir: {
    width: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 9,
    backgroundColor: '#eef4fa', borderWidth: 1, borderColor: '#d5e3f0',
  },

  fab: {
    position: 'absolute', right: 16, bottom: 18, flexDirection: 'row', alignItems: 'center',
    gap: 7, paddingHorizontal: 18, paddingVertical: 13, borderRadius: 26,
    backgroundColor: COLORS.accent, elevation: 5,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 5, shadowOffset: { width: 0, height: 3 },
  },
  fabText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 18, paddingHorizontal: 16, paddingBottom: 26, maxHeight: '90%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 19, fontWeight: 'bold', color: COLORS.primary },
  label: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
  input: {
    backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#dde6ee', fontSize: 14,
  },
  sugerencia: {
    flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 9,
    paddingHorizontal: 10, backgroundColor: '#f5f9fc', borderRadius: 8,
  },
  sugerenciaText: { fontSize: 12.5, color: '#1a1a1a' },
  spotElegido: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f0f7fc',
    borderRadius: 8, padding: 11, borderWidth: 1, borderColor: '#d5e3f0',
  },
  spotElegidoText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#1a1a1a' },

  publicar: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 9, alignItems: 'center', marginTop: 6 },
  publicarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});