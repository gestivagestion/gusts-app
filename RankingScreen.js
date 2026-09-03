import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { supabase } from './supabaseClient';

const COLORS = {
  primary: '#003D7A',
  secondary: '#00BCD4',
  accent: '#FF9500',
  light: '#f5f9fc',
  subtitle: '#666',
};

const CATEGORIAS = [
  { id: 'mejor_salto', label: 'Salto más alto', icono: 'arrow-up-bold', unidad: 'm', color: '#FF9500' },
  { id: 'mejor_velocidad', label: 'Velocidad', icono: 'speedometer', unidad: 'kt', color: '#FF3B30' },
  { id: 'mejor_distancia', label: 'Sesión más larga', icono: 'map-marker-distance', unidad: 'km', color: '#00BCD4' },
  { id: 'km_totales', label: 'Km acumulados', icono: 'earth', unidad: 'km', color: '#34C759' },
  { id: 'horas_totales', label: 'Horas en el agua', icono: 'clock-outline', unidad: 'h', color: '#7B5BD6' },
  { id: 'saltos_totales', label: 'Saltos', icono: 'chart-timeline-variant', unidad: '', color: '#E91E63' },
];

const MEDALLAS = ['🥇', '🥈', '🥉'];

export default function RankingScreen() {
  const [categoria, setCategoria] = useState('mejor_salto');
  const [filas, setFilas] = useState([]);
  const [yo, setYo] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cat = CATEGORIAS.find((c) => c.id === categoria);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: auth } = await supabase.auth.getUser();
    setYo(auth?.user?.id || null);

    const { data, error } = await supabase
      .from('ranking')
      .select('usuario, nombre, nivel, sesiones, ' + categoria)
      .order(categoria, { ascending: false, nullsFirst: false })
      .limit(50);

    if (!error) setFilas((data || []).filter((f) => Number(f[categoria]) > 0));
    setCargando(false);
  }, [categoria]);

  useEffect(() => {
    cargar();
  }, [categoria]);

  const valor = (f) => {
    const v = Number(f[categoria]) || 0;
    if (categoria === 'saltos_totales') return String(Math.round(v));
    return v.toFixed(1);
  };

  const miPosicion = filas.findIndex((f) => f.usuario === yo);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.light }}>
      <View style={styles.chipsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {CATEGORIAS.map((c) => {
            const on = c.id === categoria;
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.chip, on && { backgroundColor: c.color, borderColor: c.color }]}
                onPress={() => setCategoria(c.id)}
              >
                <MaterialCommunityIcons name={c.icono} size={14} color={on ? '#fff' : c.color} />
                <Text style={[styles.chipText, on && { color: '#fff' }]}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={COLORS.primary} />}
      >
        {cargando && !filas.length && (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
        )}

        {!cargando && filas.length === 0 && (
          <View style={styles.vacio}>
            <MaterialCommunityIcons name="trophy-outline" size={52} color="#c9d6e2" />
            <Text style={styles.vacioTitulo}>Ranking vacío</Text>
            <Text style={styles.vacioTexto}>
              Todavía nadie registró una sesión con esta marca. Grabá una en la pestaña del kite
              y aparecés acá.
            </Text>
          </View>
        )}

        {filas.map((f, i) => {
          const soyYo = f.usuario === yo;
          const podio = i < 3;
          return (
            <View
              key={f.usuario}
              style={[
                styles.fila,
                podio && { borderLeftWidth: 4, borderLeftColor: cat.color },
                soyYo && styles.filaMia,
              ]}
            >
              <View style={styles.puesto}>
                {podio ? (
                  <Text style={styles.medalla}>{MEDALLAS[i]}</Text>
                ) : (
                  <Text style={styles.puestoNum}>{i + 1}</Text>
                )}
              </View>

              <View style={[styles.avatar, podio && { backgroundColor: cat.color }]}>
                <Text style={styles.avatarText}>{(f.nombre || 'R').charAt(0).toUpperCase()}</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.nombre}>
                  {f.nombre || 'Rider'}
                  {soyYo ? ' · vos' : ''}
                </Text>
                <Text style={styles.meta}>
                  {f.sesiones} {f.sesiones === 1 ? 'sesión' : 'sesiones'}
                  {f.nivel ? ` · ${f.nivel}` : ''}
                </Text>
              </View>

              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.valor, { color: cat.color }]}>{valor(f)}</Text>
                <Text style={styles.unidad}>{cat.unidad}</Text>
              </View>
            </View>
          );
        })}

        {filas.length > 0 && miPosicion === -1 && (
          <Text style={styles.sinPuesto}>
            Todavía no estás en esta tabla. Registrá una sesión y entrás.
          </Text>
        )}

        {filas.length > 0 && (
          <Text style={styles.nota}>
            Las marcas salen de las sesiones grabadas con el teléfono, así que dependen de dónde
            lo lleves puesto. Tomalo como una comparación entre amigos, no como un récord oficial.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  chipsWrap: { backgroundColor: '#fff', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e8eef4' },
  chips: { paddingHorizontal: 12, gap: 7 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 18, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e3edf6',
  },
  chipText: { fontSize: 12, fontWeight: 'bold', color: '#1a1a1a' },

  vacio: { alignItems: 'center', paddingVertical: 50, paddingHorizontal: 30 },
  vacioTitulo: { fontSize: 15, fontWeight: 'bold', color: '#1a1a1a', marginTop: 12 },
  vacioTexto: { fontSize: 12.5, color: COLORS.subtitle, textAlign: 'center', marginTop: 6, lineHeight: 18 },

  fila: {
    flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#fff',
    borderRadius: 12, padding: 12, marginBottom: 9, elevation: 1,
  },
  filaMia: { backgroundColor: '#eef6fd', borderWidth: 1.5, borderColor: '#bcdcf5' },
  puesto: { width: 26, alignItems: 'center' },
  medalla: { fontSize: 20 },
  puestoNum: { fontSize: 14, fontWeight: 'bold', color: '#b0bcc7' },

  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  nombre: { fontSize: 14.5, fontWeight: 'bold', color: '#1a1a1a' },
  meta: { fontSize: 11, color: COLORS.subtitle, marginTop: 2 },
  valor: { fontSize: 19, fontWeight: 'bold' },
  unidad: { fontSize: 10, color: COLORS.subtitle, marginTop: -2 },

  sinPuesto: { fontSize: 12, color: COLORS.subtitle, textAlign: 'center', marginTop: 10, fontStyle: 'italic' },
  nota: {
    fontSize: 10.5, color: '#8a9aa8', textAlign: 'center', marginTop: 18,
    lineHeight: 15, paddingHorizontal: 16,
  },
});