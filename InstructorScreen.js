import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal,
  TextInput, ActivityIndicator, RefreshControl, Alert, Linking,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { SPOTS } from './spots';
import { supabase } from './supabaseClient';

const COLORS = {
  primary: '#003D7A',
  secondary: '#00BCD4',
  accent: '#FF9500',
  light: '#f5f9fc',
  subtitle: '#666',
};

const ESTADOS = {
  propuesto: { label: 'A confirmar', color: '#FF9500', icono: 'help-circle-outline' },
  confirmado: { label: 'Confirmado', color: '#00BCD4', icono: 'calendar-check' },
  completado: { label: 'Dada', color: '#34C759', icono: 'check-circle' },
  cancelado: { label: 'Cancelado', color: '#c0392b', icono: 'close-circle-outline' },
};

const turnoVacio = {
  alumno_nombre: '', alumno_contacto: '', spot: '',
  dia: '', hora: '', duracion_min: '120', precio: '', notas: '',
};

export default function InstructorScreen({ yo, volver }) {
  const [vista, setVista] = useState('agenda');
  const [turnos, setTurnos] = useState([]);
  const [metricas, setMetricas] = useState(null);
  const [ingresos, setIngresos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(turnoVacio);
  const [buscaSpot, setBuscaSpot] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [{ data: t }, { data: m }, { data: i }] = await Promise.all([
      supabase.from('turnos').select('*').eq('instructor', yo).order('fecha', { ascending: true }),
      supabase.from('metricas_instructor').select('*').eq('instructor', yo).maybeSingle(),
      supabase.from('ingresos_instructor').select('*').eq('instructor', yo).order('mes', { ascending: false }).limit(6),
    ]);
    setTurnos(t || []);
    setMetricas(m || null);
    setIngresos(i || []);
    setCargando(false);
  }, [yo]);

  useEffect(() => {
    cargar();
  }, []);

  // ---------------- acciones ----------------
  const cambiarEstado = async (turno, estado) => {
    const { error } = await supabase.from('turnos').update({ estado }).eq('id', turno.id);
    if (error) {
      Alert.alert('No se pudo actualizar', error.message);
      return;
    }
    cargar();
  };

  const borrar = (turno) => {
    Alert.alert('Borrar turno', `${turno.alumno_nombre || 'Alumno'} · ${fechaCorta(turno.fecha)}`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('turnos').delete().eq('id', turno.id);
          cargar();
        },
      },
    ]);
  };

  const crear = async () => {
    const d = form.dia.split('/');
    const h = (form.hora || '').split(':');
    if (d.length !== 3 || h.length !== 2) {
      Alert.alert('Fecha u hora inválida', 'Día como DD/MM/AAAA y hora como HH:MM.');
      return;
    }
    const fecha = new Date(+d[2], +d[1] - 1, +d[0], +h[0], +h[1]);
    if (isNaN(fecha.getTime())) {
      Alert.alert('Fecha inválida', 'Revisá el día y la hora.');
      return;
    }
    if (!form.alumno_nombre.trim()) {
      Alert.alert('Falta el alumno', 'Poné al menos el nombre.');
      return;
    }

    setGuardando(true);
    const { error } = await supabase.from('turnos').insert({
      instructor: yo,
      alumno_nombre: form.alumno_nombre.trim(),
      alumno_contacto: form.alumno_contacto.trim() || null,
      spot: form.spot || null,
      fecha: fecha.toISOString(),
      duracion_min: parseInt(form.duracion_min, 10) || 120,
      precio: form.precio ? Number(form.precio.replace(/[^\d.]/g, '')) : null,
      notas: form.notas.trim() || null,
      estado: 'confirmado',
    });
    setGuardando(false);

    if (error) {
      Alert.alert('No se pudo guardar', error.message);
      return;
    }
    setForm(turnoVacio);
    setBuscaSpot('');
    setModal(false);
    cargar();
  };

  // ---------------- helpers ----------------
  const fechaCorta = (iso) => {
    const d = new Date(iso);
    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return `${dias[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const nombreMes = (iso) => {
    const d = new Date(iso);
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                   'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${meses[d.getMonth()]} ${d.getFullYear()}`;
  };

  const plata = (n) =>
    '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });

  const ahora = new Date();
  const proximos = turnos.filter((t) => new Date(t.fecha) >= ahora && t.estado !== 'cancelado');
  const pasados = turnos.filter((t) => new Date(t.fecha) < ahora || t.estado === 'cancelado');
  const aConfirmar = turnos.filter((t) => t.estado === 'propuesto');
  const porDar = turnos.filter(
    (t) => t.estado === 'confirmado' && new Date(t.fecha) < ahora
  );

  const mesActual = ingresos.find(
    (i) => new Date(i.mes).getMonth() === ahora.getMonth() && new Date(i.mes).getFullYear() === ahora.getFullYear()
  );
  const totalHistorico = ingresos.reduce((a, i) => a + Number(i.ingresos), 0);

  const sugerencias =
    buscaSpot.length < 2
      ? []
      : SPOTS.filter((s) => (s.name + ' ' + s.region).toLowerCase().includes(buscaSpot.toLowerCase())).slice(0, 6);

  if (cargando && !turnos.length && !metricas) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.light }}>
      <View style={styles.barra}>
        <TouchableOpacity onPress={volver} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="chevron-left" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.barraTitulo}>Panel de instructor</Text>
      </View>

      <View style={styles.selector}>
        {[
          { id: 'agenda', label: 'Agenda', icono: 'calendar-month-outline' },
          { id: 'numeros', label: 'Números', icono: 'chart-line' },
        ].map((v) => (
          <TouchableOpacity
            key={v.id}
            style={[styles.selectorBtn, vista === v.id && styles.selectorOn]}
            onPress={() => setVista(v.id)}
          >
            <MaterialCommunityIcons
              name={v.icono}
              size={16}
              color={vista === v.id ? '#fff' : COLORS.primary}
            />
            <Text style={[styles.selectorText, vista === v.id && { color: '#fff' }]}>{v.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 90 }}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={COLORS.primary} />}
      >
        {vista === 'agenda' ? (
          <>
            {aConfirmar.length > 0 && (
              <View style={styles.avisoPendiente}>
                <MaterialCommunityIcons name="bell-ring-outline" size={17} color="#8a5a00" />
                <Text style={styles.avisoPendienteText}>
                  Tenés {aConfirmar.length} {aConfirmar.length === 1 ? 'pedido' : 'pedidos'} de turno
                  sin responder.
                </Text>
              </View>
            )}

            {porDar.length > 0 && (
              <View style={styles.avisoPendiente}>
                <MaterialCommunityIcons name="clock-alert-outline" size={17} color="#8a5a00" />
                <Text style={styles.avisoPendienteText}>
                  {porDar.length} {porDar.length === 1 ? 'clase ya pasó' : 'clases ya pasaron'} y
                  siguen sin marcar. Marcalas como dadas para que cuenten en tus ingresos.
                </Text>
              </View>
            )}

            <Text style={styles.seccion}>Próximas</Text>
            {proximos.length === 0 ? (
              <Text style={styles.vacio}>No tenés turnos por delante.</Text>
            ) : (
              proximos.map((t) => <Turno key={t.id} t={t} />)
            )}

            {pasados.length > 0 && (
              <>
                <Text style={[styles.seccion, { marginTop: 20 }]}>Anteriores</Text>
                {pasados.slice(0, 20).map((t) => <Turno key={t.id} t={t} />)}
              </>
            )}
          </>
        ) : (
          <>
            <Text style={styles.seccion}>Alcance de tus avisos</Text>
            <View style={styles.grid}>
              <Dato valor={metricas?.avisos || 0} label="Avisos publicados" icono="tag-outline" />
              <Dato valor={metricas?.alcance || 0} label="Personas que los vieron" icono="eye-outline" />
              <Dato valor={metricas?.contactos || 0} label="Te escribieron" icono="whatsapp" destacado />
            </View>

            {!!metricas?.alcance && (
              <Text style={styles.interpreta}>
                De cada 100 que ven tus avisos, te escriben{' '}
                {Math.round((metricas.contactos / metricas.alcance) * 100)}.
                {metricas.contactos / metricas.alcance < 0.05
                  ? ' Probá con fotos reales y un precio claro: es lo que más mueve la aguja.'
                  : ' Buen número, seguí así.'}
              </Text>
            )}

            <Text style={[styles.seccion, { marginTop: 22 }]}>Ingresos</Text>
            <View style={styles.cajaIngresos}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ingresoLabel}>Este mes</Text>
                <Text style={styles.ingresoMonto}>{plata(mesActual?.ingresos)}</Text>
                <Text style={styles.ingresoDetalle}>
                  {mesActual?.clases || 0} {mesActual?.clases === 1 ? 'clase dada' : 'clases dadas'}
                </Text>
              </View>
              <View style={styles.separadorVertical} />
              <View style={{ flex: 1 }}>
                <Text style={styles.ingresoLabel}>Acumulado</Text>
                <Text style={[styles.ingresoMonto, { color: COLORS.primary }]}>{plata(totalHistorico)}</Text>
                <Text style={styles.ingresoDetalle}>últimos 6 meses</Text>
              </View>
            </View>

            {ingresos.map((i) => (
              <View key={i.mes} style={styles.filaMes}>
                <Text style={styles.mesNombre}>{nombreMes(i.mes)}</Text>
                <Text style={styles.mesClases}>{i.clases} clases</Text>
                <Text style={styles.mesMonto}>{plata(i.ingresos)}</Text>
              </View>
            ))}

            <Text style={styles.notaIngresos}>
              Solo cuentan los turnos que marcaste como dados. GUSTS no cobra comisión: la plata
              la arreglás vos con el alumno.
            </Text>
          </>
        )}
      </ScrollView>

      {vista === 'agenda' && (
        <TouchableOpacity style={styles.fab} onPress={() => setModal(true)}>
          <MaterialCommunityIcons name="calendar-plus" size={20} color="#fff" />
          <Text style={styles.fabText}>Cargar turno</Text>
        </TouchableOpacity>
      )}

      {/* ---------------- nuevo turno ---------------- */}
      <Modal animationType="slide" transparent visible={modal} onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cargar turno</Text>
              <TouchableOpacity onPress={() => setModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: 13, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
              <Campo label="Alumno *" valor={form.alumno_nombre} set={(v) => setForm({ ...form, alumno_nombre: v })} ph="Nombre" />
              <Campo label="Teléfono o mail" valor={form.alumno_contacto} set={(v) => setForm({ ...form, alumno_contacto: v })} ph="+54 9 11 5555 5555" />

              <View style={{ gap: 7 }}>
                <Text style={styles.label}>Spot</Text>
                {form.spot ? (
                  <View style={styles.spotElegido}>
                    <MaterialCommunityIcons name="map-marker-check" size={17} color={COLORS.secondary} />
                    <Text style={styles.spotElegidoText}>{form.spot}</Text>
                    <TouchableOpacity onPress={() => { setForm({ ...form, spot: '' }); setBuscaSpot(''); }}>
                      <MaterialCommunityIcons name="close-circle" size={18} color="#aaa" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <TextInput
                      style={styles.input}
                      value={buscaSpot}
                      onChangeText={setBuscaSpot}
                      placeholder="Buscar spot..."
                      placeholderTextColor="#aaa"
                    />
                    {sugerencias.map((s) => (
                      <TouchableOpacity
                        key={s.id}
                        style={styles.sugerencia}
                        onPress={() => { setForm({ ...form, spot: `${s.name} (${s.region})` }); setBuscaSpot(''); }}
                      >
                        <MaterialCommunityIcons name="map-marker-outline" size={15} color={COLORS.subtitle} />
                        <Text style={styles.sugerenciaText}>{s.name} — {s.region}</Text>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1.3 }}>
                  <Campo label="Día *" valor={form.dia} set={(v) => setForm({ ...form, dia: v })} ph="14/06/2026" num />
                </View>
                <View style={{ flex: 1 }}>
                  <Campo label="Hora *" valor={form.hora} set={(v) => setForm({ ...form, hora: v })} ph="10:00" num />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Campo label="Duración (min)" valor={form.duracion_min} set={(v) => setForm({ ...form, duracion_min: v })} ph="120" num />
                </View>
                <View style={{ flex: 1 }}>
                  <Campo label="Precio" valor={form.precio} set={(v) => setForm({ ...form, precio: v })} ph="40000" num />
                </View>
              </View>

              <Campo label="Notas" valor={form.notas} set={(v) => setForm({ ...form, notas: v })} ph="Nivel, equipo que lleva, si ya pagó..." largo />

              <TouchableOpacity style={styles.guardar} onPress={crear} disabled={guardando}>
                {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.guardarText}>Guardar turno</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );

  // ---------------- tarjeta de turno ----------------
  function Turno({ t }) {
    const e = ESTADOS[t.estado];
    return (
      <View style={[styles.turno, { borderLeftColor: e.color }]}>
        <View style={styles.turnoTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.turnoAlumno}>{t.alumno_nombre || 'Alumno de la app'}</Text>
            <Text style={styles.turnoFecha}>{fechaCorta(t.fecha)} · {t.duracion_min} min</Text>
          </View>
          <View style={[styles.estadoChip, { backgroundColor: e.color }]}>
            <MaterialCommunityIcons name={e.icono} size={11} color="#fff" />
            <Text style={styles.estadoText}>{e.label}</Text>
          </View>
        </View>

        {!!t.spot && (
          <View style={styles.turnoMeta}>
            <MaterialCommunityIcons name="map-marker" size={13} color={COLORS.subtitle} />
            <Text style={styles.turnoMetaText}>{t.spot}</Text>
          </View>
        )}
        {!!t.precio && (
          <View style={styles.turnoMeta}>
            <MaterialCommunityIcons name="cash" size={13} color={COLORS.subtitle} />
            <Text style={styles.turnoMetaText}>{plata(t.precio)}</Text>
          </View>
        )}
        {!!t.notas && <Text style={styles.turnoNotas}>{t.notas}</Text>}

        <View style={styles.turnoAcciones}>
          {t.estado === 'propuesto' && (
            <TouchableOpacity style={[styles.accion, { backgroundColor: '#00BCD4' }]} onPress={() => cambiarEstado(t, 'confirmado')}>
              <Text style={styles.accionText}>Confirmar</Text>
            </TouchableOpacity>
          )}
          {t.estado === 'confirmado' && (
            <TouchableOpacity style={[styles.accion, { backgroundColor: '#34C759' }]} onPress={() => cambiarEstado(t, 'completado')}>
              <Text style={styles.accionText}>Marcar dada</Text>
            </TouchableOpacity>
          )}
          {t.estado !== 'cancelado' && t.estado !== 'completado' && (
            <TouchableOpacity style={[styles.accion, styles.accionGris]} onPress={() => cambiarEstado(t, 'cancelado')}>
              <Text style={[styles.accionText, { color: COLORS.subtitle }]}>Cancelar</Text>
            </TouchableOpacity>
          )}
          {!!t.alumno_contacto && (
            <TouchableOpacity
              style={[styles.accion, styles.accionGris, { flex: 0, paddingHorizontal: 12 }]}
              onPress={() => {
                const c = t.alumno_contacto.trim();
                const url = c.includes('@')
                  ? `mailto:${c}`
                  : `https://wa.me/${c.replace(/\D/g, '')}`;
                Linking.openURL(url).catch(() => Alert.alert('Contacto', c));
              }}
            >
              <MaterialCommunityIcons name="phone-outline" size={15} color={COLORS.primary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={{ padding: 7 }} onPress={() => borrar(t)}>
            <MaterialCommunityIcons name="trash-can-outline" size={17} color="#c0392b" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }
}

function Dato({ valor, label, icono, destacado }) {
  return (
    <View style={[styles.dato, destacado && { backgroundColor: '#fff7ec', borderColor: '#ffdcb8' }]}>
      <MaterialCommunityIcons name={icono} size={20} color={destacado ? COLORS.accent : COLORS.secondary} />
      <Text style={styles.datoValor}>{valor}</Text>
      <Text style={styles.datoLabel}>{label}</Text>
    </View>
  );
}

function Campo({ label, valor, set, ph, num, largo }) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, largo && { height: 74, textAlignVertical: 'top' }]}
        value={valor}
        onChangeText={set}
        placeholder={ph}
        placeholderTextColor="#aaa"
        keyboardType={num ? 'numbers-and-punctuation' : 'default'}
        multiline={largo}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.light },

  barra: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.primary,
    paddingHorizontal: 10, paddingVertical: 12,
  },
  barraTitulo: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  selector: { flexDirection: 'row', gap: 8, padding: 10, backgroundColor: '#fff' },
  selectorBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 9, backgroundColor: '#eef4fa',
  },
  selectorOn: { backgroundColor: COLORS.primary },
  selectorText: { fontSize: 13, fontWeight: 'bold', color: COLORS.primary },

  seccion: { fontSize: 15, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 11 },
  vacio: { fontSize: 12.5, color: COLORS.subtitle, fontStyle: 'italic' },

  avisoPendiente: {
    flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#fff6ec',
    borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#ffdcb8',
  },
  avisoPendienteText: { flex: 1, fontSize: 12, color: '#8a5a00', lineHeight: 17 },

  turno: {
    backgroundColor: '#fff', borderRadius: 12, padding: 13, marginBottom: 10,
    borderLeftWidth: 4, elevation: 1,
  },
  turnoTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  turnoAlumno: { fontSize: 14.5, fontWeight: 'bold', color: '#1a1a1a' },
  turnoFecha: { fontSize: 11.5, color: COLORS.primary, fontWeight: '600', marginTop: 2 },
  estadoChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  estadoText: { color: '#fff', fontSize: 9.5, fontWeight: 'bold' },
  turnoMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  turnoMetaText: { fontSize: 11.5, color: COLORS.subtitle },
  turnoNotas: { fontSize: 12, color: '#444', marginTop: 7, lineHeight: 17 },
  turnoAcciones: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 11 },
  accion: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  accionGris: { backgroundColor: '#eef4fa', borderWidth: 1, borderColor: '#d5e3f0' },
  accionText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

  grid: { flexDirection: 'row', gap: 9 },
  dato: {
    flex: 1, backgroundColor: '#fff', borderRadius: 11, paddingVertical: 14,
    alignItems: 'center', borderWidth: 1, borderColor: '#e8eef4',
  },
  datoValor: { fontSize: 21, fontWeight: 'bold', color: '#1a1a1a', marginTop: 6 },
  datoLabel: { fontSize: 9.5, color: '#999', marginTop: 3, textAlign: 'center', paddingHorizontal: 5 },
  interpreta: { fontSize: 12, color: COLORS.subtitle, lineHeight: 18, marginTop: 11, fontStyle: 'italic' },

  cajaIngresos: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#e8eef4', marginBottom: 12,
  },
  separadorVertical: { width: 1, backgroundColor: '#eef2f6', marginHorizontal: 14 },
  ingresoLabel: { fontSize: 11, color: COLORS.subtitle },
  ingresoMonto: { fontSize: 23, fontWeight: 'bold', color: '#0a7d33', marginTop: 3 },
  ingresoDetalle: { fontSize: 10.5, color: '#999', marginTop: 2 },

  filaMes: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 9, padding: 12, marginBottom: 7,
  },
  mesNombre: { flex: 1, fontSize: 13, fontWeight: '600', color: '#1a1a1a', textTransform: 'capitalize' },
  mesClases: { fontSize: 11.5, color: COLORS.subtitle, marginRight: 12 },
  mesMonto: { fontSize: 14, fontWeight: 'bold', color: '#0a7d33' },
  notaIngresos: { fontSize: 10.5, color: '#8a9aa8', lineHeight: 15, marginTop: 12, fontStyle: 'italic' },

  fab: {
    position: 'absolute', right: 16, bottom: 18, flexDirection: 'row', alignItems: 'center',
    gap: 7, paddingHorizontal: 18, paddingVertical: 13, borderRadius: 26,
    backgroundColor: COLORS.primary, elevation: 5,
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
  guardar: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 9, alignItems: 'center', marginTop: 6 },
  guardarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
