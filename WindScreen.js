import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { SPOTS, COUNTRIES, WATER_LABEL, WATER_COLOR } from './spots';
import { getVientoActual, getPronostico, calidadSesion, kiteParaViento } from './weather';
import { getPeso } from './peso';

const COLORS = {
  primary: '#003D7A',
  secondary: '#00BCD4',
  accent: '#FF9500',
  light: '#f5f9fc',
  subtitle: '#666',
};

// Cuántos spots consultamos por país (una sola llamada a la API)
const MAX_SPOTS = 8;

export default function WindScreen() {
  const [pais, setPais] = useState('Argentina');
  const [viento, setViento] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [abierto, setAbierto] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [actualizado, setActualizado] = useState(null);
  const [peso, setPeso] = useState(null);

  const spots = SPOTS.filter((s) => s.country === pais).slice(0, MAX_SPOTS);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const data = await getVientoActual(spots);
      setViento(data);
      setActualizado(new Date());
    } catch (e) {
      setViento({});
      setError(
        /503|502|504/.test(e.message || '')
          ? 'El servicio de viento está caído en este momento. Probá en unos minutos.'
          : e.message || 'No se pudo actualizar el viento.'
      );
    } finally {
      setCargando(false);
    }
  }, [pais]);

  useEffect(() => {
    cargar();
    setAbierto(null);
    setDetalle(null);
  }, [pais]);

  useEffect(() => {
    getPeso().then(setPeso);
  }, []);

  const abrirDetalle = async (spot) => {
    if (abierto === spot.id) {
      setAbierto(null);
      setDetalle(null);
      return;
    }
    setAbierto(spot.id);
    setDetalle(null);
    setCargandoDetalle(true);
    try {
      const p = await getPronostico(spot);
      setDetalle(p);
    } catch (e) {
      setDetalle(null);
    } finally {
      setCargandoDetalle(false);
    }
  };

  // Ordena: primero los que están navegables
  const ordenados = [...spots].sort((a, b) => {
    const va = viento[a.id]?.viento ?? -1;
    const vb = viento[b.id]?.viento ?? -1;
    const na = va >= a.windMin && va <= a.windMax ? 1 : 0;
    const nb = vb >= b.windMin && vb <= b.windMax ? 1 : 0;
    if (na !== nb) return nb - na;
    return vb - va;
  });

  const horaCorta = (iso) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}h`;
  };
  const diaCorto = (iso) => {
    const d = new Date(iso);
    return ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][d.getDay()];
  };

  return (
    <View style={styles.container}>
      {/* Filtro por país */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          {COUNTRIES.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.chip, pais === c && styles.chipActive]}
              onPress={() => setPais(c)}
            >
              <Text style={[styles.chipText, pais === c && styles.chipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={COLORS.primary} />}
      >
        {actualizado && (
          <Text style={styles.updated}>
            Actualizado {actualizado.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} · deslizá para refrescar
          </Text>
        )}

        {error && (
          <View style={styles.errorBox}>
            <MaterialCommunityIcons name="wifi-off" size={18} color="#B25000" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {cargando && !Object.keys(viento).length && (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
        )}

        {ordenados.map((spot) => {
          const v = viento[spot.id];
          const cal = calidadSesion(v?.viento, spot);
          const kite = kiteParaViento(v?.viento, peso);
          const estaAbierto = abierto === spot.id;

          return (
            <View key={spot.id} style={[styles.card, { borderLeftColor: cal.color }]}>
              <TouchableOpacity onPress={() => abrirDetalle(spot)} activeOpacity={0.7}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.spotName}>{spot.name}</Text>
                    <Text style={styles.spotRegion}>{spot.region}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.temp}>{v ? `${v.temp}°C` : '—'}</Text>
                    <View style={[styles.qualityBadge, { backgroundColor: cal.color }]}>
                      <Text style={styles.qualityText}>{cal.texto}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.stats}>
                  <View style={styles.stat}>
                    <MaterialCommunityIcons name="weather-windy" size={22} color={COLORS.secondary} />
                    <Text style={styles.statValue}>{v ? `${v.viento}` : '—'}<Text style={styles.statUnit}> kt</Text></Text>
                    <Text style={styles.statLabel}>Viento</Text>
                  </View>
                  <View style={styles.stat}>
                    <MaterialCommunityIcons name="weather-dust" size={22} color={COLORS.accent} />
                    <Text style={styles.statValue}>{v ? `${v.rafagas}` : '—'}<Text style={styles.statUnit}> kt</Text></Text>
                    <Text style={styles.statLabel}>Ráfagas</Text>
                  </View>
                  <View style={styles.stat}>
                    <View style={styles.compass}>
                      <MaterialCommunityIcons
                        name="navigation"
                        size={18}
                        color={COLORS.primary}
                        style={{ transform: [{ rotate: `${(v?.direccion ?? 0) + 180}deg` }] }}
                      />
                    </View>
                    <Text style={styles.statValue}>{v ? v.cardinal : '—'}</Text>
                    <Text style={styles.statLabel}>Dirección</Text>
                  </View>
                </View>

                {kite && v && v.viento >= 8 && (
                  <View style={[styles.kiteHint, { borderColor: kite.color }]}>
                    <MaterialCommunityIcons name="kite-outline" size={15} color={kite.color} />
                    <Text style={styles.kiteHintText}>
                      Llevá {kite.kites}
                      {peso ? ` · para ${peso} kg` : ''}
                    </Text>
                  </View>
                )}

                <View style={styles.expandRow}>
                  <Text style={styles.expandText}>
                    {estaAbierto ? 'Ocultar pronóstico' : 'Ver próximas horas'}
                  </Text>
                  <MaterialCommunityIcons
                    name={estaAbierto ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={COLORS.subtitle}
                  />
                </View>
              </TouchableOpacity>

              {estaAbierto && (
                <View style={styles.forecast}>
                  {cargandoDetalle && <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 12 }} />}

                  {detalle && (
                    <>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
                        {detalle.horas.filter((_, i) => i % 2 === 0).slice(0, 20).map((h, i) => {
                          const c = calidadSesion(h.viento, spot);
                          return (
                            <View key={i} style={[styles.hourCol, { backgroundColor: c.color + '18' }]}>
                              <Text style={styles.hourDay}>{diaCorto(h.hora)}</Text>
                              <Text style={styles.hourTime}>{horaCorta(h.hora)}</Text>
                              <Text style={[styles.hourWind, { color: c.color }]}>{h.viento}</Text>
                              <Text style={styles.hourGust}>{h.rafagas}</Text>
                              <MaterialCommunityIcons
                                name="navigation"
                                size={13}
                                color={COLORS.primary}
                                style={{ transform: [{ rotate: `${h.direccion + 180}deg` }], marginTop: 3 }}
                              />
                              <Text style={styles.hourDir}>{h.cardinal}</Text>
                            </View>
                          );
                        })}
                      </ScrollView>
                      <Text style={styles.legend}>Viento / ráfaga en nudos · cada 2 horas · 48 h</Text>

                    </>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {spots.length === MAX_SPOTS && (
          <Text style={styles.footNote}>
            Mostrando los primeros {MAX_SPOTS} spots de {pais}. Tocá un spot en el mapa para ver su viento puntual.
          </Text>
        )}
        <Text style={styles.source}>Datos: Open-Meteo · modelo global, actualización horaria</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.light },

  filterBar: { backgroundColor: '#fff', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e8eef4' },
  filterContent: { paddingHorizontal: 12, gap: 8 },
  chip: { backgroundColor: '#eef4fa', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18 },
  chipActive: { backgroundColor: COLORS.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.primary },
  chipTextActive: { color: '#fff' },

  updated: { fontSize: 11, color: '#8a9aa8', marginBottom: 10, textAlign: 'center' },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff6ec',
    borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#ffdcb8',
  },
  errorText: { flex: 1, fontSize: 12, color: '#8a4a00' },

  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12,
    borderLeftWidth: 4, elevation: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  spotName: { fontSize: 16, fontWeight: 'bold', color: '#1a1a1a' },
  spotRegion: { fontSize: 11, color: COLORS.subtitle, marginTop: 2 },
  temp: { fontSize: 18, fontWeight: 'bold', color: COLORS.primary },
  qualityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 4 },
  qualityText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  stats: { flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 17, fontWeight: 'bold', marginTop: 4, color: '#1a1a1a' },
  statUnit: { fontSize: 11, fontWeight: '600', color: COLORS.subtitle },
  statLabel: { fontSize: 10, color: '#999', marginTop: 1 },
  compass: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.light,
    alignItems: 'center', justifyContent: 'center',
  },

  kiteHint: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginTop: 12,
  },
  kiteHintText: { fontSize: 12, fontWeight: '600', color: '#1a1a1a' },

  expandRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f0f4f8',
  },
  expandText: { fontSize: 11, color: COLORS.subtitle, fontWeight: '600' },

  forecast: { marginTop: 8 },
  hourCol: { alignItems: 'center', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 8, minWidth: 46 },
  hourDay: { fontSize: 9, color: '#999', fontWeight: '600' },
  hourTime: { fontSize: 10, color: COLORS.subtitle, marginBottom: 3 },
  hourWind: { fontSize: 15, fontWeight: 'bold' },
  hourGust: { fontSize: 10, color: '#999' },
  hourDir: { fontSize: 9, color: COLORS.subtitle, marginTop: 1 },
  legend: { fontSize: 10, color: '#8a9aa8', marginTop: 6, textAlign: 'center' },


  footNote: { fontSize: 11, color: '#8a9aa8', textAlign: 'center', marginTop: 4, lineHeight: 16 },
  source: { fontSize: 10, color: '#b0bcc7', textAlign: 'center', marginTop: 12 },
});