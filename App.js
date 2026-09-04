import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image,
  Modal, ActivityIndicator, RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { LOGO_BASE64, ICON_BASE64, SALE_BASE64 } from './logo';
import MapScreen from './MapScreen';
import WindScreen from './WindScreen';
import MarketScreen from './MarketScreen';
import SessionScreen from './SessionScreen';
import ProfileScreen from './ProfileScreen';
import { SPOTS } from './spots';
import { getVientoActual, calidadSesion, kiteParaViento } from './weather';
import { getFavoritos } from './favorites';
import { getPeso } from './peso';
import { supabase } from './supabaseClient';
import AuthScreen from './AuthScreen';
import SocialScreen from './SocialScreen';

const colors = {
  primary: '#003D7A',
  secondary: '#00BCD4',
  accent: '#FF9500',
  light: '#f5f9fc',
  white: '#fff',
  text: '#1a1a1a',
  subtitle: '#666',
};

export default function App() {
  const [tab, setTab] = useState(5);

  // ---------- sesión ----------
  const [sesion, setSesion] = useState(null);
  const [verificando, setVerificando] = useState(true);

  useEffect(() => {
    let vivo = true;

    supabase.auth.getSession()
      .then(({ data }) => {
        if (vivo) setSesion(data?.session ?? null);
      })
      .catch((e) => {
        console.log('Error al recuperar la sesión:', e);
        if (vivo) setSesion(null);
      })
      .finally(() => {
        if (vivo) setVerificando(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => {
      if (vivo) setSesion(s);
    });

    return () => {
      vivo = false;
      try {
        sub?.subscription?.unsubscribe();
      } catch (e) {
        console.log('No se pudo desuscribir del auth:', e);
      }
    };
  }, []);

  // ---------- alertas de viento de los spots favoritos ----------
  const [alertas, setAlertas] = useState(false);
  const [favs, setFavs] = useState([]);
  const [vientoFavs, setVientoFavs] = useState({});
  const [cargandoFavs, setCargandoFavs] = useState(false);
  const [peso, setPeso] = useState(null);

  const cargarAlertas = useCallback(async () => {
    setCargandoFavs(true);
    try {
      const ids = await getFavoritos();
      const spots = SPOTS.filter((s) => ids.includes(s.id));
      setFavs(spots);
      if (spots.length) setVientoFavs(await getVientoActual(spots));
      else setVientoFavs({});
    } catch (e) {
      console.log('No se pudieron cargar las alertas:', e);
    } finally {
      setCargandoFavs(false);
    }
  }, []);

  useEffect(() => {
    cargarAlertas().catch((e) => console.log('Fallo cargarAlertas:', e));
    getPeso()
      .then(setPeso)
      .catch((e) => console.log('No se pudo leer el peso:', e));
  }, []);

  // cuando volvés al mapa puede haber favoritos nuevos
  useEffect(() => {
    if (tab === 0) return;
    cargarAlertas().catch((e) => console.log('Fallo cargarAlertas:', e));
  }, [tab]);

  const navegables = favs.filter((s) => {
    const v = vientoFavs[s.id];
    return v && v.viento >= s.windMin && v.viento <= s.windMax;
  });

  const renderScreen = () => {
    switch (tab) {
      case 0: return <MapScreen />;
      case 1: return <WindScreen />;
      case 2: return <SessionScreen />;
      case 3: return <SocialScreen />;
      case 4: return <MarketScreen />;
      case 5: return <ProfileScreen />;
      default: return null;
    }
  };

  if (verificando) {
    return (
      <View style={[styles.container, { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  if (!sesion) return <AuthScreen />;

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}>
      {/* HEADER CON LOGO */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <View style={styles.logoCard}>
          <Image source={{ uri: LOGO_BASE64 }} style={styles.logo} resizeMode="contain" />
        </View>
        <Text style={styles.headerSubtitle}>Find wind • Connect • Trade</Text>
        <TouchableOpacity style={styles.notificationIcon} onPress={() => { setAlertas(true); cargarAlertas(); }}>
          <MaterialCommunityIcons name="bell" size={24} color="#fff" />
          {navegables.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{navegables.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* CONTENIDO */}
      <View style={{ flex: 1 }}>{renderScreen()}</View>

      {/* TABS */}
      <View style={[styles.tabBar, { backgroundColor: colors.white, borderTopColor: colors.light }]}>
        {['🗺️', '💨', 'ICON', '👥', 'SALE', '👤'].map((emoji, idx) => (
          <TouchableOpacity
            key={idx}
            style={[styles.tab, tab === idx && [styles.tabActive, { borderBottomColor: colors.primary }]]}
            onPress={() => setTab(idx)}
          >
            {emoji === 'ICON' || emoji === 'SALE' ? (
              <Image
                source={{ uri: emoji === 'ICON' ? ICON_BASE64 : SALE_BASE64 }}
                style={[styles.tabIcon, tab === idx && styles.tabIconActive]}
                resizeMode="contain"
              />
            ) : (
              <Text style={[styles.tabEmoji, tab === idx && styles.tabEmojiActive]}>{emoji}</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* ALERTAS DE VIENTO */}
      <Modal animationType="slide" transparent visible={alertas} onRequestClose={() => setAlertas(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Alertas de viento</Text>
                <Text style={styles.sheetSub}>
                  {favs.length
                    ? `${navegables.length} de ${favs.length} favoritos navegables ahora`
                    : 'Todavía no marcaste favoritos'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setAlertas(false)}>
                <MaterialCommunityIcons name="close" size={24} color={colors.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={{ paddingBottom: 20, gap: 10 }}
              refreshControl={
                <RefreshControl refreshing={cargandoFavs} onRefresh={cargarAlertas} tintColor={colors.primary} />
              }
            >
              {cargandoFavs && !favs.length && (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: 30 }} />
              )}

              {!cargandoFavs && !favs.length && (
                <View style={styles.emptyAlert}>
                  <MaterialCommunityIcons name="star-outline" size={48} color="#c9d6e2" />
                  <Text style={styles.emptyAlertTitle}>Sin spots favoritos</Text>
                  <Text style={styles.emptyAlertText}>
                    Abrí un spot en el mapa y tocá la estrella. Acá vas a ver si hay viento
                    en los lugares donde navegás.
                  </Text>
                </View>
              )}

              {favs.map((s) => {
                const v = vientoFavs[s.id];
                const cal = calidadSesion(v?.viento, s);
                const kite = kiteParaViento(v?.viento, peso);
                return (
                  <View key={s.id} style={[styles.alertCard, { borderLeftColor: cal.color }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.alertName}>{s.name}</Text>
                      <Text style={styles.alertRegion}>{s.region}</Text>
                      {v && kite && v.viento >= 8 && (
                        <Text style={styles.alertKite}>Kite: {kite.kites}</Text>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.alertWind}>{v ? `${v.viento} kt` : '—'}</Text>
                      <Text style={styles.alertDir}>{v ? `${v.cardinal} · ${v.temp}°C` : ''}</Text>
                      <View style={[styles.alertBadge, { backgroundColor: cal.color }]}>
                        <Text style={styles.alertBadgeText}>{cal.texto}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}

              {!!favs.length && (
                <Text style={styles.alertNota}>
                  Deslizá para actualizar. Los datos son del modelo global de Open-Meteo y se
                  actualizan cada hora: siempre miralos contra el agua antes de armar.
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 24, paddingBottom: 14, paddingHorizontal: 16, alignItems: 'center' },
  logoCard: {
    backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8,
    marginBottom: 8, elevation: 3, shadowColor: '#000', shadowOpacity: 0.15,
    shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  logo: { width: 210, height: 62 },
  headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.9)', marginBottom: 4 },
  notificationIcon: { position: 'absolute', top: 28, right: 16 },
  badge: {
    position: 'absolute', top: -5, right: -6, backgroundColor: '#34C759',
    minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4, borderWidth: 1.5, borderColor: '#003D7A',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 18, paddingHorizontal: 16, paddingBottom: 26, maxHeight: '80%',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  sheetTitle: { fontSize: 19, fontWeight: 'bold', color: '#003D7A' },
  sheetSub: { fontSize: 12, color: '#666', marginTop: 2 },

  emptyAlert: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  emptyAlertTitle: { fontSize: 15, fontWeight: 'bold', color: '#1a1a1a', marginTop: 12 },
  emptyAlertText: { fontSize: 12.5, color: '#666', textAlign: 'center', marginTop: 6, lineHeight: 18 },

  alertCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#f7fafc',
    borderRadius: 12, padding: 13, borderLeftWidth: 4,
  },
  alertName: { fontSize: 15, fontWeight: 'bold', color: '#1a1a1a' },
  alertRegion: { fontSize: 11, color: '#666', marginTop: 1 },
  alertKite: { fontSize: 11, color: '#00789e', marginTop: 4 },
  alertWind: { fontSize: 18, fontWeight: 'bold', color: '#003D7A' },
  alertDir: { fontSize: 10.5, color: '#666', marginTop: 1 },
  alertBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 5 },
  alertBadgeText: { color: '#fff', fontSize: 9.5, fontWeight: 'bold' },
  alertNota: { fontSize: 10.5, color: '#8a9aa8', lineHeight: 15, marginTop: 6, fontStyle: 'italic' },

  // TABS
  tabBar: { flexDirection: 'row', borderTopWidth: 1, paddingVertical: 8, paddingBottom: 20 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  tabActive: { borderBottomWidth: 3 },
  tabEmoji: { fontSize: 22, opacity: 0.5 },
  tabIcon: { width: 24, height: 24, opacity: 0.5 },
  tabIconActive: { width: 29, height: 29, opacity: 1 },
  tabEmojiActive: { fontSize: 26, opacity: 1 },
});
