import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal,
  TextInput, Platform, ActivityIndicator, Alert, Share, Linking, Image,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PIN_BASE64 } from './pinIcon';
import { supabase, mensajeDeError } from './supabaseClient';

import {
  SPOTS, LATAM_REGION, COUNTRIES,
  WATER_LABEL, WATER_COLOR, LEVEL_COLOR, kitesForSpot,
} from './spots';
import { getVientoActual, calidadSesion, kiteParaViento, kitesParaSpot } from './weather';
import { getPeso } from './peso';
import { getFavoritos, toggleFavorito } from './favorites';

// 👇 PONÉ ACÁ TU MAIL: es donde te llegan los spots que envían los usuarios
const CONTACT_EMAIL = 'gestivagestion@gmail.com';

// Convierte una fila de spots_propuestos al formato que usa el mapa
const filaASpot = (f, yo) => ({
  id: 'db-' + f.id,
  filaId: f.id,
  name: f.nombre,
  region: f.region || '',
  country: f.pais || '',
  flag: '📍',
  lat: f.lat,
  lng: f.lng,
  water: f.water || 'plana',
  waterDesc: f.water_desc || '',
  wind: f.wind || '—',
  windMin: f.wind_min || 0,
  windMax: f.wind_max || 0,
  level: f.level || 'Todos',
  caution: f.caution || null,
  estado: f.estado,
  userAdded: f.autor === yo,
});

const COLORS = {
  primary: '#003D7A',
  secondary: '#00BCD4',
  accent: '#FF9500',
  light: '#f5f9fc',
  white: '#fff',
  subtitle: '#666',
};

export default function MapScreen() {
  const mapRef = useRef(null);
  const timers = useRef([]);

  const [userSpots, setUserSpots] = useState([]);
  const [yo, setYo] = useState(null);
  const [peso, setPeso] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [flying, setFlying] = useState(false);
  const [countryFilter, setCountryFilter] = useState('Todos');
  const [vientoSpot, setVientoSpot] = useState(null);
  const [favoritos, setFavoritos] = useState([]);
  const [filtrosVisible, setFiltrosVisible] = useState(false);
  // Android no dibuja el contenido del marcador si tracksViewChanges arranca en false.
  // Lo dejamos en true un momento para que se pinte y después lo apagamos por rendimiento.
  const [dibujandoPines, setDibujandoPines] = useState(true);
  const [filtros, setFiltros] = useState({ zonas: [], aguas: [], niveles: [], soloFavs: false });
  const [cargandoViento, setCargandoViento] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [pendingCoord, setPendingCoord] = useState(null);
  const [errorForm, setErrorForm] = useState('');
  const [form, setForm] = useState({
    name: '', region: '', country: '', wind: '',
    windMin: '', windMax: '', water: 'plana', level: 'Todos', waterDesc: '',
  });

  const allSpots = [...SPOTS, ...userSpots];

  // La zona es la provincia o el área que figura después de la coma
  const zonaDe = (s) =>
    s.region && s.region.includes(',') ? s.region.split(',').pop().trim() : (s.region || '—');

  const porPais =
    countryFilter === 'Todos'
      ? allSpots
      : allSpots.filter((s) => s.country === countryFilter);

  const zonasDisponibles = [...new Set(porPais.map(zonaDe))].sort();

  const visibleSpots = porPais.filter((s) => {
    if (filtros.soloFavs && !favoritos.includes(s.id)) return false;
    if (filtros.zonas.length && !filtros.zonas.includes(zonaDe(s))) return false;
    if (filtros.aguas.length && !filtros.aguas.includes(s.water)) return false;
    if (filtros.niveles.length && !filtros.niveles.includes(s.level)) return false;
    return true;
  });

  const filtrosActivos =
    filtros.zonas.length + filtros.aguas.length + filtros.niveles.length + (filtros.soloFavs ? 1 : 0);

  const alternar = (campo, valor) =>
    setFiltros((f) => ({
      ...f,
      [campo]: f[campo].includes(valor) ? f[campo].filter((v) => v !== valor) : [...f[campo], valor],
    }));

  const limpiarFiltros = () => setFiltros({ zonas: [], aguas: [], niveles: [], soloFavs: false });

  // ---------- persistencia local ----------
  const cargarSpots = async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    setYo(uid);
    const { data } = await supabase
      .from('spots_propuestos')
      .select('*')
      .order('creado_en', { ascending: false })
      .limit(300);
    setUserSpots((data || []).map((f) => filaASpot(f, uid)));
  };

  useEffect(() => {
    (async () => {
      try {
        await cargarSpots();
        setFavoritos(await getFavoritos());
        setPeso(await getPeso());
      } catch (e) {
        console.log('No se pudieron leer los spots:', e);
      } finally {
        setLoading(false);
      }
    })();
    return () => timers.current.forEach(clearTimeout);
  }, []);

  // ---------- animación "bajando del cielo" ----------
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  // Cada vez que cambian los pines los dejamos redibujar un instante
  useEffect(() => {
    setDibujandoPines(true);
    const t = setTimeout(() => setDibujandoPines(false), 1200);
    return () => clearTimeout(t);
  }, [userSpots.length, favoritos.length, countryFilter, filtros]);

  const flyToSpot = useCallback((spot) => {
    if (!mapRef.current) return;
    clearTimers();
    setSelected(spot);
    setFlying(true);

    const center = { latitude: spot.lat, longitude: spot.lng };

    // 1) Subimos a vista continental sobre el destino
    mapRef.current.animateCamera(
      { center, altitude: 6000000, zoom: 3.5, pitch: 0, heading: 0 },
      { duration: 900 }
    );

    // 2) Descenso intermedio: se ve la costa / la región
    timers.current.push(setTimeout(() => {
      mapRef.current &&
        mapRef.current.animateCamera(
          { center, altitude: 400000, zoom: 9, pitch: 30, heading: 20 },
          { duration: 1400 }
        );
    }, 950));

    // 3) Aterrizaje: cámara inclinada sobre el agua
    timers.current.push(setTimeout(() => {
      mapRef.current &&
        mapRef.current.animateCamera(
          { center, altitude: 2500, zoom: 14.5, pitch: 55, heading: 35 },
          { duration: 1800 }
        );
    }, 2400));

    timers.current.push(setTimeout(() => setFlying(false), 4300));
  }, []);

  const backToLatam = () => {
    clearTimers();
    setSelected(null);
    setFlying(false);
    mapRef.current &&
      mapRef.current.animateCamera(
        {
          center: { latitude: LATAM_REGION.latitude, longitude: LATAM_REGION.longitude },
          altitude: 12000000,
          zoom: 2.6,
          pitch: 0,
          heading: 0,
        },
        { duration: 1400 }
      );
  };

  // ---------- alta de spot ----------
  const onLongPress = (e) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setPendingCoord({ latitude, longitude });
    setAddVisible(true);
  };

  const saveSpot = async () => {
    setErrorForm('');
    const faltan = [];
    if (!form.name.trim()) faltan.push('el nombre');
    if (!form.country.trim()) faltan.push('el país');
    if (faltan.length) {
      setErrorForm('Falta ' + faltan.join(' y ') + '.');
      return;
    }
    if (!pendingCoord) {
      setErrorForm('Cerrá esta ventana y mantené presionado el mapa para marcar la ubicación.');
      return;
    }
    const { data, error } = await supabase
      .from('spots_propuestos')
      .insert({
        autor: yo,
        nombre: form.name.trim(),
        region: form.region.trim() || null,
        pais: form.country.trim(),
        lat: pendingCoord.latitude,
        lng: pendingCoord.longitude,
        water: form.water,
        water_desc: form.waterDesc.trim() || WATER_LABEL[form.water],
        wind: form.wind.trim() || null,
        wind_min: parseInt(form.windMin, 10) || null,
        wind_max: parseInt(form.windMax, 10) || null,
        level: form.level,
        estado: 'pendiente',
      })
      .select()
      .single();

    if (error) {
      setErrorForm(mensajeDeError(error));
      return;
    }

    const nuevo = filaASpot(data, yo);
    setUserSpots((s) => [...s, nuevo]);
    setAddVisible(false);
    setPendingCoord(null);
    setForm({
      name: '', region: '', country: '', wind: '',
      windMin: '', windMax: '', water: 'plana', level: 'Todos', waterDesc: '',
    });
    Alert.alert(
      'Spot enviado',
      'Queda pendiente de revisión. Vos lo vas a ver en tu mapa; el resto cuando lo aprobemos.'
    );
    setTimeout(() => flyToSpot(nuevo), 300);
  };

  const deleteSpot = (spot) => {
    Alert.alert('Borrar spot', `¿Eliminar "${spot.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('spots_propuestos').delete().eq('id', spot.filaId);
          if (error) {
            Alert.alert('No se pudo borrar', mensajeDeError(error));
            return;
          }
          setUserSpots((s) => s.filter((x) => x.id !== spot.id));
          setSelected(null);
        },
      },
    ]);
  };

  // ---------- viento real del spot seleccionado ----------
  useEffect(() => {
    let cancelado = false;
    if (!selected) {
      setVientoSpot(null);
      return;
    }
    setVientoSpot(null);
    setCargandoViento(true);
    getVientoActual([selected])
      .then((d) => {
        if (!cancelado) setVientoSpot(d[selected.id] || null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelado) setCargandoViento(false);
      });
    return () => {
      cancelado = true;
    };
  }, [selected]);

  // ---------- compartir ----------
  const mapsLink = (spot) =>
    `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`;

  const shareSpot = async (spot) => {
    const texto =
      `🪁 ${spot.name}${spot.region ? ' — ' + spot.region : ''}, ${spot.country}\n\n` +
      `💧 ${WATER_LABEL[spot.water]}: ${spot.waterDesc}\n` +
      `💨 Viento: ${spot.wind} (${spot.windMin}–${spot.windMax} nudos)\n` +
      `🎯 Nivel: ${spot.level}\n\n` +
      `📍 Ubicación: ${mapsLink(spot)}\n\n` +
      `Compartido desde GUSTS · Kitesurf App`;
    try {
      await Share.share({ message: texto, title: `Spot de kite: ${spot.name}` });
    } catch (e) {
      console.log('Error al compartir:', e);
    }
  };

  // Texto listo para pegar en spots.js (nos lo manda el usuario)
  const spotComoCodigo = (spot) =>
    `{\n` +
    `  id: '${spot.id}',\n` +
    `  name: '${spot.name}',\n` +
    `  region: '${spot.region}',\n` +
    `  country: '${spot.country}',\n` +
    `  flag: '📍',\n` +
    `  lat: ${spot.lat.toFixed(5)}, lng: ${spot.lng.toFixed(5)},\n` +
    `  water: '${spot.water}',\n` +
    `  waterDesc: '${spot.waterDesc}',\n` +
    `  wind: '${spot.wind}',\n` +
    `  windMin: ${spot.windMin}, windMax: ${spot.windMax},\n` +
    `  level: '${spot.level}',\n` +
    `},`;

  const enviarPorMail = (spot) => {
    const asunto = encodeURIComponent(`Nuevo spot para GUSTS: ${spot.name}`);
    const cuerpo = encodeURIComponent(
      `Hola! Quiero proponer este spot para la app:\n\n` +
        `Nombre: ${spot.name}\n` +
        `Zona: ${spot.region}\n` +
        `País: ${spot.country}\n` +
        `Coordenadas: ${spot.lat.toFixed(5)}, ${spot.lng.toFixed(5)}\n` +
        `Agua: ${WATER_LABEL[spot.water]} — ${spot.waterDesc}\n` +
        `Viento: ${spot.wind} (${spot.windMin}–${spot.windMax} kt)\n` +
        `Nivel: ${spot.level}\n` +
        `Mapa: ${mapsLink(spot)}\n\n` +
        `--- Formato para la base ---\n${spotComoCodigo(spot)}\n`
    );
    Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=${asunto}&body=${cuerpo}`).catch(() =>
      Alert.alert('Sin app de mail', 'No se pudo abrir el correo en este dispositivo.')
    );
  };

  const proponerSpot = (spot) => {
    const esPropio = !!spot.userAdded;
    Alert.alert(
      esPropio ? 'Enviar spot a GUSTS' : 'Sugerir corrección',
      esPropio
        ? 'Te abrimos el mail para que nos lo mandes. Lo revisamos y lo sumamos al mapa de todos.'
        : 'Te abrimos el mail para que nos cuentes qué está mal o qué falta.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Abrir mail', onPress: () => enviarPorMail(spot) },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={LATAM_REGION}
        mapType="hybrid"
        onLongPress={onLongPress}
        onPress={() => setSelected(null)}
        onMapReady={() => {
          // Android ignora los deltas grandes de initialRegion, así que
          // fijamos la cámara a mano cuando el mapa termina de cargar.
          setTimeout(() => {
            mapRef.current &&
              mapRef.current.animateCamera(
                {
                  center: { latitude: LATAM_REGION.latitude, longitude: LATAM_REGION.longitude },
                  altitude: 12000000,
                  zoom: 2.6,
                  pitch: 0,
                  heading: 0,
                },
                { duration: 1 }
              );
          }, 250);
        }}
      >
        {visibleSpots.map((spot) => (
          <Marker
            key={spot.id}
            coordinate={{ latitude: spot.lat, longitude: spot.lng }}
            onPress={() => flyToSpot(spot)}
            tracksViewChanges={dibujandoPines}
          >
            <View style={[styles.pin, { borderColor: WATER_COLOR[spot.water] || COLORS.secondary }]}>
              {favoritos.includes(spot.id) ? (
                <Text style={styles.pinEmoji}>⭐</Text>
              ) : spot.estado === 'pendiente' ? (
                <Text style={styles.pinEmoji}>⏳</Text>
              ) : (
                <Image source={{ uri: PIN_BASE64 }} style={styles.pinIcon} resizeMode="contain" />
              )}
            </View>
          </Marker>
        ))}

        {pendingCoord && (
          <Marker coordinate={pendingCoord} pinColor={COLORS.accent} />
        )}
      </MapView>

      {/* Filtro por país */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          {['Todos', ...COUNTRIES].map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.chip, countryFilter === c && styles.chipActive]}
              onPress={() => {
                setCountryFilter(c);
                setFiltros((f) => ({ ...f, zonas: [] }));
              }}
            >
              <Text style={[styles.chipText, countryFilter === c && styles.chipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Botones flotantes */}
      <View style={styles.fabColumn}>
        <TouchableOpacity style={styles.fab} onPress={backToLatam}>
          <MaterialCommunityIcons name="earth" size={22} color={COLORS.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.fab} onPress={() => setFiltrosVisible(true)}>
          <MaterialCommunityIcons name="tune-variant" size={21} color={COLORS.primary} />
          {filtrosActivos > 0 && (
            <View style={styles.fabBadge}>
              <Text style={styles.fabBadgeText}>{filtrosActivos}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: COLORS.accent }]}
          onPress={() => setAddVisible(true)}
        >
          <MaterialCommunityIcons name="plus" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {flying && (
        <View style={styles.flyingBadge}>
          <MaterialCommunityIcons name="airplane-landing" size={16} color="#fff" />
          <Text style={styles.flyingText}>Bajando a {selected?.name}…</Text>
        </View>
      )}

      {/* Ficha del spot seleccionado */}
      {selected && !flying && (
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>
                {selected.flag} {selected.name}
              </Text>
              <Text style={styles.cardSub}>
                {selected.region ? selected.region + ' · ' : ''}{selected.country}
              </Text>
            </View>
            <TouchableOpacity
              onPress={async () => setFavoritos(await toggleFavorito(selected.id))}
              style={{ padding: 4 }}
            >
              <MaterialCommunityIcons
                name={favoritos.includes(selected.id) ? 'star' : 'star-outline'}
                size={23}
                color={favoritos.includes(selected.id) ? '#FFCC00' : '#b6c3ce'}
              />
            </TouchableOpacity>
            {selected.userAdded && (
              <TouchableOpacity onPress={() => deleteSpot(selected)} style={{ padding: 4 }}>
                <MaterialCommunityIcons name="trash-can-outline" size={22} color="#FF3B30" />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setSelected(null)} style={{ padding: 4 }}>
              <MaterialCommunityIcons name="close" size={22} color={COLORS.subtitle} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: WATER_COLOR[selected.water] }]}>
              <Text style={styles.badgeText}>{WATER_LABEL[selected.water]}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: LEVEL_COLOR[selected.level] || COLORS.secondary }]}>
              <Text style={styles.badgeText}>{selected.level}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: COLORS.primary }]}>
              <Text style={styles.badgeText}>
                {selected.windMin}–{selected.windMax} kt
              </Text>
            </View>
          </View>

          <Text style={styles.cardDesc}>{selected.waterDesc}</Text>
          <View style={styles.windRow}>
            <MaterialCommunityIcons name="weather-windy" size={18} color={COLORS.secondary} />
            <Text style={styles.windText}>Viento dominante: {selected.wind}</Text>
          </View>

          {/* Viento en vivo */}
          <View style={styles.liveBox}>
            {cargandoViento && <ActivityIndicator size="small" color={COLORS.primary} />}
            {!cargandoViento && vientoSpot && (
              <>
                <View style={styles.liveRow}>
                  <MaterialCommunityIcons name="broadcast" size={15} color="#34C759" />
                  <Text style={styles.liveTitle}>Ahora en el spot</Text>
                  <View
                    style={[
                      styles.liveBadge,
                      { backgroundColor: calidadSesion(vientoSpot.viento, selected).color },
                    ]}
                  >
                    <Text style={styles.liveBadgeText}>
                      {calidadSesion(vientoSpot.viento, selected).texto}
                    </Text>
                  </View>
                </View>
                <Text style={styles.liveData}>
                  {vientoSpot.viento} kt · ráfagas {vientoSpot.rafagas} kt · {vientoSpot.cardinal} · {vientoSpot.temp}°C
                </Text>
                {vientoSpot.viento >= 8 && kiteParaViento(vientoSpot.viento, peso) && (
                  <Text style={styles.liveKite}>
                    Kite sugerido ahora: {kiteParaViento(vientoSpot.viento, peso).kites}
                  </Text>
                )}
              </>
            )}
            {!cargandoViento && !vientoSpot && (
              <Text style={styles.liveOff}>Viento en vivo no disponible</Text>
            )}
          </View>

          {selected.estado === 'pendiente' && (
            <View style={styles.pendienteBox}>
              <MaterialCommunityIcons name="clock-outline" size={15} color="#8a5a00" />
              <Text style={styles.pendienteText}>
                {selected.userAdded
                  ? 'Tu propuesta está en revisión. Solo la ves vos por ahora.'
                  : 'Spot pendiente de aprobación.'}
              </Text>
            </View>
          )}

          {selected.caution && (
            <View style={styles.cautionBox}>
              <MaterialCommunityIcons name="alert-outline" size={16} color="#B25000" />
              <Text style={styles.cautionText}>{selected.caution}</Text>
            </View>
          )}

          {/* Tamaños de kite sugeridos según el rango de viento del spot */}
          <View style={styles.kiteBox}>
            <View style={styles.kiteHeader}>
              <MaterialCommunityIcons name="kite-outline" size={16} color={COLORS.primary} />
              <Text style={styles.kiteTitle}>Qué kite llevar</Text>
            </View>

            {kitesParaSpot(kitesForSpot(selected), peso).map((r, i) => (
              <View key={i} style={styles.kiteRow}>
                <View style={[styles.kiteBar, { backgroundColor: r.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.kiteSize}>
                    {r.min}–{r.max === 99 ? '+' : r.max} kt · {r.kites}
                  </Text>
                  <Text style={styles.kiteDesc}>{r.desc}</Text>
                </View>
              </View>
            ))}

            <Text style={styles.kiteNote}>
              {peso
                ? `Ajustado a tus ${peso} kg con twintip.`
                : 'Referencia para 75 kg con twintip. Cargá tu peso en el perfil para afinarlo.'}
            </Text>
          </View>

          </ScrollView>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionPrimary} onPress={() => shareSpot(selected)}>
              <MaterialCommunityIcons name="share-variant" size={18} color="#fff" />
              <Text style={styles.actionPrimaryText}>Compartir</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionGhost}
              onPress={() => Linking.openURL(mapsLink(selected))}
            >
              <MaterialCommunityIcons name="directions" size={18} color={COLORS.primary} />
              <Text style={styles.actionGhostText}>Cómo llegar</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.actionSend} onPress={() => proponerSpot(selected)}>
            <MaterialCommunityIcons name="send-circle-outline" size={18} color="#fff" />
            <Text style={styles.actionPrimaryText}>
              {selected.userAdded ? 'Enviar este spot a GUSTS' : 'Sugerir corrección de este spot'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Carrusel de spots */}
      {!selected && (
        <View style={styles.carousel}>
          <Text style={styles.carouselTitle}>
            {visibleSpots.length} spots{filtrosActivos > 0 ? ' filtrados' : ''} · mantené presionado el mapa para agregar uno
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 10 }}>
            {visibleSpots.map((spot) => (
              <TouchableOpacity key={spot.id} style={styles.spotChip} onPress={() => flyToSpot(spot)}>
                <View style={[styles.spotChipBar, { backgroundColor: WATER_COLOR[spot.water] }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.spotChipName} numberOfLines={1}>
                    {spot.flag} {spot.name}
                  </Text>
                  <Text style={styles.spotChipMeta} numberOfLines={1}>
                    {WATER_LABEL[spot.water]} · {spot.windMin}–{spot.windMax} kt
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Modal: filtros */}
      <Modal animationType="slide" transparent visible={filtrosVisible} onRequestClose={() => setFiltrosVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filtrar spots</Text>
              <TouchableOpacity onPress={() => setFiltrosVisible(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: 18, paddingBottom: 12 }}>
              <TouchableOpacity
                style={[styles.favToggle, filtros.soloFavs && styles.favToggleOn]}
                onPress={() => setFiltros((f) => ({ ...f, soloFavs: !f.soloFavs }))}
              >
                <MaterialCommunityIcons
                  name={filtros.soloFavs ? 'star' : 'star-outline'}
                  size={19}
                  color={filtros.soloFavs ? '#fff' : '#FFCC00'}
                />
                <Text style={[styles.favToggleText, filtros.soloFavs && { color: '#fff' }]}>
                  Solo mis favoritos ({favoritos.length})
                </Text>
              </TouchableOpacity>

              <View style={{ gap: 8 }}>
                <Text style={styles.filtroTitulo}>Tipo de agua</Text>
                <View style={styles.filtroChips}>
                  {Object.keys(WATER_LABEL).map((w) => {
                    const on = filtros.aguas.includes(w);
                    return (
                      <TouchableOpacity
                        key={w}
                        style={[styles.filtroChip, on && { backgroundColor: WATER_COLOR[w], borderColor: WATER_COLOR[w] }]}
                        onPress={() => alternar('aguas', w)}
                      >
                        <Text style={on ? styles.filtroChipOn : styles.filtroChipText}>{WATER_LABEL[w]}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={{ gap: 8 }}>
                <Text style={styles.filtroTitulo}>Nivel</Text>
                <View style={styles.filtroChips}>
                  {Object.keys(LEVEL_COLOR).map((l) => {
                    const on = filtros.niveles.includes(l);
                    return (
                      <TouchableOpacity
                        key={l}
                        style={[styles.filtroChip, on && { backgroundColor: LEVEL_COLOR[l], borderColor: LEVEL_COLOR[l] }]}
                        onPress={() => alternar('niveles', l)}
                      >
                        <Text style={on ? styles.filtroChipOn : styles.filtroChipText}>{l}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={{ gap: 8 }}>
                <Text style={styles.filtroTitulo}>
                  Zona {countryFilter !== 'Todos' ? `· ${countryFilter}` : ''}
                </Text>
                {countryFilter === 'Todos' ? (
                  <Text style={styles.filtroAyuda}>
                    Elegí un país arriba para poder filtrar por provincia o zona.
                  </Text>
                ) : (
                  <View style={styles.filtroChips}>
                    {zonasDisponibles.map((z) => {
                      const on = filtros.zonas.includes(z);
                      return (
                        <TouchableOpacity
                          key={z}
                          style={[styles.filtroChip, on && { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]}
                          onPress={() => alternar('zonas', z)}
                        >
                          <Text style={on ? styles.filtroChipOn : styles.filtroChipText}>{z}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={styles.filtroAcciones}>
              <TouchableOpacity style={styles.filtroLimpiar} onPress={limpiarFiltros}>
                <Text style={styles.filtroLimpiarText}>Limpiar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.filtroVer} onPress={() => setFiltrosVisible(false)}>
                <Text style={styles.filtroVerText}>
                  Ver {visibleSpots.length} {visibleSpots.length === 1 ? 'spot' : 'spots'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: agregar spot */}
      <Modal
        animationType="slide"
        transparent
        visible={addVisible}
        onRequestClose={() => { setAddVisible(false); setErrorForm(''); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Agregar spot</Text>
              <TouchableOpacity onPress={() => { setAddVisible(false); setErrorForm(''); }}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 10 }} keyboardShouldPersistTaps="handled">
              <View style={styles.coordBox}>
                <MaterialCommunityIcons name="map-marker" size={18} color={COLORS.accent} />
                <Text style={styles.coordText}>
                  {pendingCoord
                    ? `${pendingCoord.latitude.toFixed(4)}, ${pendingCoord.longitude.toFixed(4)}`
                    : 'Cerrá y mantené presionado el mapa para marcar la ubicación'}
                </Text>
              </View>

              {!!errorForm && (
                <View style={styles.errorForm}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#c0392b" />
                  <Text style={styles.errorFormText}>{errorForm}</Text>
                </View>
              )}

              <Field label="Nombre del spot *" value={form.name} onChange={(v) => { setErrorForm(''); setForm({ ...form, name: v }); }} placeholder="Ej: Laguna Negra" />
              <Field label="Zona / provincia" value={form.region} onChange={(v) => setForm({ ...form, region: v })} placeholder="Ej: Buenos Aires" />
              <Field label="País *" value={form.country} onChange={(v) => { setErrorForm(''); setForm({ ...form, country: v }); }} placeholder="Ej: Argentina" />
              <Field label="Viento dominante" value={form.wind} onChange={(v) => setForm({ ...form, wind: v })} placeholder="Ej: SE / E" />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Nudos mín." value={form.windMin} onChange={(v) => setForm({ ...form, windMin: v })} placeholder="12" keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Nudos máx." value={form.windMax} onChange={(v) => setForm({ ...form, windMax: v })} placeholder="25" keyboardType="numeric" />
                </View>
              </View>

              <Text style={styles.formLabel}>Tipo de agua</Text>
              <View style={styles.optionRow}>
                {Object.keys(WATER_LABEL).map((w) => (
                  <TouchableOpacity
                    key={w}
                    style={[styles.option, form.water === w && { backgroundColor: WATER_COLOR[w], borderColor: WATER_COLOR[w] }]}
                    onPress={() => setForm({ ...form, water: w })}
                  >
                    <Text style={form.water === w ? styles.optionTextActive : styles.optionText}>{WATER_LABEL[w]}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel}>Nivel</Text>
              <View style={styles.optionRow}>
                {Object.keys(LEVEL_COLOR).map((l) => (
                  <TouchableOpacity
                    key={l}
                    style={[styles.option, form.level === l && { backgroundColor: LEVEL_COLOR[l], borderColor: LEVEL_COLOR[l] }]}
                    onPress={() => setForm({ ...form, level: l })}
                  >
                    <Text style={form.level === l ? styles.optionTextActive : styles.optionText}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Field
                label="Descripción del agua"
                value={form.waterDesc}
                onChange={(v) => setForm({ ...form, waterDesc: v })}
                placeholder="Ej: Laguna plana con marea baja"
                multiline
              />

              <TouchableOpacity style={styles.submitButton} onPress={saveSpot}>
                <Text style={styles.submitText}>Guardar spot</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Field({ label, value, onChange, placeholder, keyboardType, multiline }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && { height: 70, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#aaa"
        keyboardType={keyboardType || 'default'}
        multiline={multiline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.light },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.light },

  pin: {
    backgroundColor: '#fff', borderWidth: 2.5, borderRadius: 19,
    width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3,
  },
  pinEmoji: { fontSize: 17 },
  pinIcon: { width: 24, height: 19 },

  filterBar: { position: 'absolute', top: 10, left: 0, right: 0 },
  filterContent: { paddingHorizontal: 12, gap: 8 },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.94)', paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 18, elevation: 2,
  },
  chipActive: { backgroundColor: COLORS.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.primary },
  chipTextActive: { color: '#fff' },

  fabColumn: { position: 'absolute', right: 14, top: 66, gap: 10 },
  fab: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', elevation: 4,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },

  fabBadge: {
    position: 'absolute', top: -3, right: -3, backgroundColor: COLORS.accent,
    minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4, borderWidth: 1.5, borderColor: '#fff',
  },
  fabBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  favToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#fffbe8',
    borderRadius: 10, padding: 13, borderWidth: 1, borderColor: '#ffe9a8',
  },
  favToggleOn: { backgroundColor: '#003D7A', borderColor: '#003D7A' },
  favToggleText: { fontSize: 13.5, fontWeight: '600', color: '#1a1a1a' },

  filtroTitulo: { fontSize: 13.5, fontWeight: 'bold', color: '#1a1a1a' },
  filtroAyuda: { fontSize: 12, color: '#8a9aa8', fontStyle: 'italic', lineHeight: 17 },
  filtroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  filtroChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0',
  },
  filtroChipText: { fontSize: 12, fontWeight: '600', color: COLORS.subtitle },
  filtroChipOn: { fontSize: 12, fontWeight: '600', color: '#fff' },

  filtroAcciones: { flexDirection: 'row', gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eef2f6' },
  filtroLimpiar: {
    paddingHorizontal: 22, paddingVertical: 13, borderRadius: 9,
    backgroundColor: '#eef4fa', borderWidth: 1, borderColor: '#d5e3f0',
  },
  filtroLimpiarText: { fontSize: 14, fontWeight: 'bold', color: COLORS.primary },
  filtroVer: { flex: 1, paddingVertical: 13, borderRadius: 9, backgroundColor: COLORS.primary, alignItems: 'center' },
  filtroVerText: { fontSize: 14, fontWeight: 'bold', color: '#fff' },

  flyingBadge: {
    position: 'absolute', top: 66, alignSelf: 'center', flexDirection: 'row',
    alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,61,122,0.92)',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  flyingText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  card: {
    position: 'absolute', left: 12, right: 12, bottom: 16, backgroundColor: '#fff',
    borderRadius: 16, padding: 16, elevation: 6, maxHeight: '72%',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },

  liveBox: {
    backgroundColor: '#f0faf3', borderRadius: 10, padding: 10, marginTop: 12,
    borderWidth: 1, borderColor: '#cdebd6', minHeight: 44, justifyContent: 'center',
  },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveTitle: { fontSize: 12, fontWeight: 'bold', color: '#1a6b33', flex: 1 },
  liveBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  liveBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  liveData: { fontSize: 14, fontWeight: 'bold', color: '#1a1a1a', marginTop: 5 },
  liveKite: { fontSize: 11, color: '#4a7a58', marginTop: 3 },
  liveOff: { fontSize: 11, color: '#8a9aa8', fontStyle: 'italic' },

  pendienteBox: {
    flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#fff6ec',
    borderRadius: 9, padding: 9, marginTop: 12, borderWidth: 1, borderColor: '#ffdcb8',
  },
  pendienteText: { flex: 1, fontSize: 11.5, color: '#8a5a00', lineHeight: 16 },

  cautionBox: {
    flexDirection: 'row', gap: 8, backgroundColor: '#fff6ec', borderRadius: 10,
    padding: 10, marginTop: 12, borderWidth: 1, borderColor: '#ffdcb8',
  },
  cautionText: { flex: 1, fontSize: 12, color: '#8a4a00', lineHeight: 17 },

  kiteBox: {
    backgroundColor: '#f5f9fc', borderRadius: 12, padding: 12, marginTop: 12,
    borderWidth: 1, borderColor: '#e3edf6',
  },
  kiteHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  kiteTitle: { fontSize: 13, fontWeight: 'bold', color: COLORS.primary },
  kiteRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  kiteBar: { width: 4, borderRadius: 2 },
  kiteSize: { fontSize: 13, fontWeight: 'bold', color: '#1a1a1a' },
  kiteDesc: { fontSize: 11, color: COLORS.subtitle, marginTop: 2, lineHeight: 15 },
  kiteNote: { fontSize: 10, color: '#8a9aa8', fontStyle: 'italic', marginTop: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 10 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#1a1a1a' },
  cardSub: { fontSize: 12, color: COLORS.subtitle, marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  cardDesc: { fontSize: 13, color: '#333', lineHeight: 19, marginBottom: 10 },
  windRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  windText: { fontSize: 12, color: COLORS.subtitle, fontWeight: '600' },

  actionRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  actionPrimary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: COLORS.primary, paddingVertical: 11, borderRadius: 10,
  },
  actionPrimaryText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  actionGhost: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#eef4fa', paddingVertical: 11, borderRadius: 10,
    borderWidth: 1, borderColor: '#d5e3f0',
  },
  actionGhostText: { color: COLORS.primary, fontWeight: 'bold', fontSize: 13 },
  actionSend: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.accent, paddingVertical: 11, borderRadius: 10, marginTop: 8,
  },

  carousel: { position: 'absolute', left: 0, right: 0, bottom: 14 },
  carouselTitle: {
    fontSize: 11, color: '#fff', fontWeight: '600', marginBottom: 8,
    marginHorizontal: 12, backgroundColor: 'rgba(0,61,122,0.8)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, alignSelf: 'flex-start',
  },
  spotChip: {
    backgroundColor: '#fff', borderRadius: 12, width: 190, padding: 10,
    flexDirection: 'row', alignItems: 'center', gap: 10, elevation: 3,
  },
  spotChipBar: { width: 4, height: 32, borderRadius: 2 },
  spotChipName: { fontSize: 13, fontWeight: 'bold', color: '#1a1a1a' },
  spotChipMeta: { fontSize: 11, color: COLORS.subtitle, marginTop: 2 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 18, paddingHorizontal: 16, paddingBottom: 30, maxHeight: '88%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.primary },
  errorForm: {
    flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#fdf0ee',
    borderRadius: 9, padding: 11, borderWidth: 1, borderColor: '#f5c6c0',
  },
  errorFormText: { flex: 1, fontSize: 12.5, color: '#c0392b', lineHeight: 17 },

  coordBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff7ec',
    borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#ffe0b8',
  },
  coordText: { fontSize: 12, color: '#8a5a00', flex: 1 },
  formLabel: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
  input: {
    backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.secondary, fontSize: 14,
  },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0',
  },
  optionText: { fontSize: 12, fontWeight: '600', color: COLORS.subtitle },
  optionTextActive: { fontSize: 12, fontWeight: '600', color: '#fff' },
  submitButton: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 8, alignItems: 'center', marginTop: 6 },
  submitText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});