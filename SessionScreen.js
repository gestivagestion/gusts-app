import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, Image, ActivityIndicator, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';

import { ICON_BASE64 } from './logo';
import { getVientoActual, kiteParaViento } from './weather';
import { getPeso } from './peso';
import {
  distanciaKm, spotMasCercano, formatoDuracion, formatoFecha,
  msANudos, guardarSesion, getSesiones, sincronizar,
} from './sessions';
import RankingScreen from './RankingScreen';

// ============================================================
// DETECCIÓN DE SALTOS
// En el aire la aceleración cae cerca de cero (caída libre).
// Medimos cuánto dura y la altura sale de h = g·t²/8.
// Estos tres valores se pueden ajustar si detecta de más o de menos:
const UMBRAL_AIRE = 0.45;    // por debajo de esto consideramos que está en el aire (en g)
const UMBRAL_PISO = 0.85;    // por encima de esto consideramos que aterrizó
const AIRTIME_MIN = 0.6;     // segundos: menos que esto es ruido, no un salto
const AIRTIME_MAX = 8;       // segundos: más que esto es un error de lectura

const alturaDeAirtime = (seg) => (9.81 * seg * seg) / 8;

const COLORS = {
  primary: '#003D7A',
  secondary: '#00BCD4',
  accent: '#FF9500',
  light: '#f5f9fc',
  subtitle: '#666',
};

export default function SessionScreen() {
  const [permiso, setPermiso] = useState(null);
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [km, setKm] = useState(0);
  const [velActual, setVelActual] = useState(0);
  const [velMax, setVelMax] = useState(0);
  const [spotActual, setSpotActual] = useState(null);
  const [viento, setViento] = useState(null);
  const [saltos, setSaltos] = useState([]);
  const [alturaMax, setAlturaMax] = useState(0);
  const [enAire, setEnAire] = useState(false);
  const [ultimas, setUltimas] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [peso, setPeso] = useState(null);
  const [vista, setVista] = useState('registrar');

  const suscripcion = useRef(null);
  const cronometro = useRef(null);
  const anterior = useRef(null);
  const inicio = useRef(null);
  const acumKm = useRef(0);
  const maxKt = useRef(0);
  const primerPunto = useRef(null);
  const acelerometro = useRef(null);
  const volando = useRef(false);
  const candidato = useRef(null);
  const inicioSalto = useRef(null);
  const listaSaltos = useRef([]);
  const maxAltura = useRef(0);

  useEffect(() => {
    sincronizar().then(() => getSesiones().then((s) => setUltimas(s.slice(0, 3))));
    getPeso().then(setPeso);
    return () => detenerTodo();
  }, []);

  const detenerTodo = () => {
    if (suscripcion.current) {
      suscripcion.current.remove();
      suscripcion.current = null;
    }
    if (cronometro.current) {
      clearInterval(cronometro.current);
      cronometro.current = null;
    }
    if (acelerometro.current) {
      acelerometro.current.remove();
      acelerometro.current = null;
    }
  };

  const comenzar = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setPermiso(status);
    if (status !== 'granted') {
      Alert.alert(
        'Sin permiso de ubicación',
        'GUSTS necesita el GPS para medir tu distancia y velocidad. Podés activarlo en los ajustes del teléfono.'
      );
      return;
    }

    // reiniciar contadores
    acumKm.current = 0;
    maxKt.current = 0;
    listaSaltos.current = [];
    maxAltura.current = 0;
    volando.current = false;
    candidato.current = null;
    setSaltos([]);
    setAlturaMax(0);
    setEnAire(false);
    anterior.current = null;
    primerPunto.current = null;
    inicio.current = new Date();
    setKm(0);
    setVelActual(0);
    setVelMax(0);
    setSegundos(0);
    setViento(null);
    setSpotActual(null);
    setGrabando(true);

    cronometro.current = setInterval(() => {
      setSegundos(Math.floor((Date.now() - inicio.current.getTime()) / 1000));
    }, 1000);

    // Acelerómetro a 50 lecturas por segundo para no perder saltos cortos
    Accelerometer.setUpdateInterval(20);
    acelerometro.current = Accelerometer.addListener(({ x, y, z }) => {
      const fuerza = Math.sqrt(x * x + y * y + z * z); // en g
      const ahora = Date.now();

      if (!volando.current) {
        if (fuerza < UMBRAL_AIRE) {
          // esperamos 150 ms de caída libre sostenida antes de dar por bueno el despegue
          if (!candidato.current) candidato.current = ahora;
          else if (ahora - candidato.current > 150) {
            volando.current = true;
            inicioSalto.current = candidato.current;
            setEnAire(true);
          }
        } else {
          candidato.current = null;
        }
        return;
      }

      // está en el aire: esperamos el golpe del aterrizaje
      if (fuerza > UMBRAL_PISO) {
        const airtime = (ahora - inicioSalto.current) / 1000;
        volando.current = false;
        candidato.current = null;
        setEnAire(false);

        if (airtime >= AIRTIME_MIN && airtime <= AIRTIME_MAX) {
          const altura = alturaDeAirtime(airtime);
          const salto = {
            airtime: Number(airtime.toFixed(2)),
            altura: Number(altura.toFixed(1)),
            hora: new Date().toISOString(),
          };
          listaSaltos.current = [...listaSaltos.current, salto];
          setSaltos(listaSaltos.current);
          if (altura > maxAltura.current) {
            maxAltura.current = altura;
            setAlturaMax(altura);
          }
        }
      }
    });

    suscripcion.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 5 },
      (loc) => {
        const punto = { lat: loc.coords.latitude, lng: loc.coords.longitude };

        if (!primerPunto.current) {
          primerPunto.current = punto;
          const cerca = spotMasCercano(punto);
          if (cerca) setSpotActual(cerca.spot);
          // viento del lugar donde estás navegando
          getVientoActual([{ id: 'sesion', ...punto }])
            .then((d) => setViento(d.sesion || null))
            .catch(() => {});
        }

        if (anterior.current) {
          const d = distanciaKm(anterior.current, punto);
          // descartamos saltos de GPS: más de 200 m entre lecturas es ruido
          if (d < 0.2) {
            acumKm.current += d;
            setKm(acumKm.current);
          }
        }
        anterior.current = punto;

        const kt = msANudos(loc.coords.speed);
        if (kt >= 0) {
          setVelActual(kt);
          if (kt > maxKt.current) {
            maxKt.current = kt;
            setVelMax(kt);
          }
        }
      }
    );
  };

  const terminar = async () => {
    detenerTodo();
    setGrabando(false);

    const dur = Math.floor((Date.now() - inicio.current.getTime()) / 1000);
    if (dur < 60) {
      Alert.alert('Sesión muy corta', 'Duró menos de un minuto, no la guardo.');
      return;
    }

    setGuardando(true);
    const sesion = {
      id: 's-' + Date.now(),
      fecha: inicio.current.toISOString(),
      duracionSeg: dur,
      distanciaKm: Number(acumKm.current.toFixed(2)),
      velMaxKt: Number(maxKt.current.toFixed(1)),
      velPromKt: dur > 0 ? Number(((acumKm.current / 1.852) / (dur / 3600)).toFixed(1)) : 0,
      saltos: listaSaltos.current,
      cantSaltos: listaSaltos.current.length,
      alturaMaxM: Number(maxAltura.current.toFixed(1)),
      airtimeMax: listaSaltos.current.length
        ? Math.max(...listaSaltos.current.map((j) => j.airtime))
        : 0,
      spotNombre: spotActual?.name || null,
      spotRegion: spotActual?.region || null,
      viento,
      punto: primerPunto.current,
    };
    const lista = await guardarSesion(sesion);
    setUltimas(lista.slice(0, 3));
    setGuardando(false);

    Alert.alert(
      'Sesión guardada',
      `${formatoDuracion(dur)} · ${sesion.distanciaKm} km · máx ${sesion.velMaxKt} kt` +
        (sesion.cantSaltos ? `\n${sesion.cantSaltos} saltos · el más alto ${sesion.alturaMaxM} m` : '')
    );
  };

  const confirmarCorte = () => {
    Alert.alert('Terminar sesión', '¿Guardamos lo navegado hasta ahora?', [
      { text: 'Seguir navegando', style: 'cancel' },
      { text: 'Terminar', onPress: terminar },
    ]);
  };

  const kite = viento ? kiteParaViento(viento.viento, peso) : null;

  if (vista === 'ranking' && !grabando) {
    return (
      <View style={{ flex: 1 }}>
        <Selector vista={vista} setVista={setVista} />
        <RankingScreen />
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.light }} contentContainerStyle={{ padding: 16 }}>
      {!grabando && <Selector vista={vista} setVista={setVista} />}
      {!grabando ? (
        <>
          <View style={styles.hero}>
            <Image source={{ uri: ICON_BASE64 }} style={{ width: 88, height: 88 }} resizeMode="contain" />
            <Text style={styles.heroTitle}>Registrá tu sesión</Text>
            <Text style={styles.heroDesc}>
              El GPS mide distancia y velocidad, y guardamos el viento que había en el spot.
            </Text>

            <TouchableOpacity style={styles.botonStart} onPress={comenzar} disabled={guardando}>
              {guardando ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialCommunityIcons name="play" size={22} color="#fff" />
                  <Text style={styles.botonStartText}>Comenzar sesión</Text>
                </>
              )}
            </TouchableOpacity>

            {permiso === 'denied' && (
              <Text style={styles.permisoAviso}>
                Rechazaste el permiso de ubicación. Activalo en los ajustes del teléfono para poder medir.
              </Text>
            )}
          </View>

          <View style={styles.tipBox}>
            <MaterialCommunityIcons name="information-outline" size={16} color="#8a5a00" />
            <Text style={styles.tipText}>
              Llevá el teléfono ajustado al cuerpo (brazalete o cintura), no suelto en el bolsillo:
              los saltos se miden con el acelerómetro y necesita estar firme. Dejá la pantalla
              encendida, porque si se bloquea la medición se corta.
            </Text>
          </View>

          {ultimas.length > 0 && (
            <View style={{ marginTop: 20 }}>
              <Text style={styles.seccion}>Últimas sesiones</Text>
              {ultimas.map((s) => (
                <View key={s.id} style={styles.miniCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.miniSpot}>{s.spotNombre || 'Sesión sin spot'}</Text>
                    <Text style={styles.miniFecha}>{formatoFecha(s.fecha)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.miniKm}>{s.distanciaKm} km</Text>
                    <Text style={styles.miniDur}>{formatoDuracion(s.duracionSeg)}</Text>
                  </View>
                </View>
              ))}
              <Text style={styles.verMas}>El historial completo está en tu perfil 👤</Text>
            </View>
          )}
        </>
      ) : (
        <>
          <View style={styles.enVivo}>
            <View style={styles.vivoRow}>
              <View style={styles.puntoRojo} />
              <Text style={styles.vivoText}>Grabando</Text>
            </View>
            <Text style={styles.crono}>{formatoDuracion(segundos)}</Text>
            {spotActual && <Text style={styles.spotVivo}>📍 {spotActual.name}</Text>}
          </View>

          <View style={styles.grid}>
            <Metrica valor={km.toFixed(2)} unidad="km" label="Distancia" icono="map-marker-distance" />
            <Metrica valor={velActual.toFixed(1)} unidad="kt" label="Velocidad" icono="speedometer" />
            <Metrica valor={velMax.toFixed(1)} unidad="kt" label="Máxima" icono="rocket-launch-outline" destacado />
            <Metrica
              valor={viento ? String(viento.viento) : '—'}
              unidad="kt"
              label={viento ? `Viento ${viento.cardinal}` : 'Viento'}
              icono="weather-windy"
            />
            <Metrica valor={alturaMax.toFixed(1)} unidad="m" label="Salto más alto" icono="arrow-up-bold" destacado />
            <Metrica valor={String(saltos.length)} unidad="" label="Saltos" icono="chart-timeline-variant" />
          </View>

          {enAire && (
            <View style={styles.enAire}>
              <MaterialCommunityIcons name="arrow-up-bold-circle" size={18} color="#fff" />
              <Text style={styles.enAireText}>¡En el aire!</Text>
            </View>
          )}

          {saltos.length > 0 && (
            <View style={styles.saltosBox}>
              <Text style={styles.saltosTitulo}>Últimos saltos</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {[...saltos].reverse().slice(0, 12).map((j, i) => (
                  <View key={i} style={styles.salto}>
                    <Text style={styles.saltoAltura}>{j.altura}<Text style={styles.saltoUnidad}> m</Text></Text>
                    <Text style={styles.saltoAirtime}>{j.airtime}s</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {kite && viento && viento.viento >= 8 && (
            <View style={[styles.kiteBox, { borderColor: kite.color }]}>
              <MaterialCommunityIcons name="kite-outline" size={16} color={kite.color} />
              <Text style={styles.kiteText}>Con este viento: {kite.kites}</Text>
            </View>
          )}

          <TouchableOpacity style={styles.botonStop} onPress={confirmarCorte}>
            <MaterialCommunityIcons name="stop" size={22} color="#fff" />
            <Text style={styles.botonStartText}>Terminar y guardar</Text>
          </TouchableOpacity>

          <Text style={styles.avisoVivo}>
            No bloquees la pantalla ni cambies de app: el GPS deja de registrar.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

function Selector({ vista, setVista }) {
  return (
    <View style={styles.selector}>
      <TouchableOpacity
        style={[styles.selectorBtn, vista === 'registrar' && styles.selectorOn]}
        onPress={() => setVista('registrar')}
      >
        <MaterialCommunityIcons
          name="record-circle-outline"
          size={16}
          color={vista === 'registrar' ? '#fff' : COLORS.primary}
        />
        <Text style={[styles.selectorText, vista === 'registrar' && { color: '#fff' }]}>Registrar</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.selectorBtn, vista === 'ranking' && styles.selectorOn]}
        onPress={() => setVista('ranking')}
      >
        <MaterialCommunityIcons
          name="trophy-outline"
          size={16}
          color={vista === 'ranking' ? '#fff' : COLORS.primary}
        />
        <Text style={[styles.selectorText, vista === 'ranking' && { color: '#fff' }]}>Ranking</Text>
      </TouchableOpacity>
    </View>
  );
}

function Metrica({ valor, unidad, label, icono, destacado }) {
  return (
    <View style={[styles.metrica, destacado && { backgroundColor: '#fff7ec', borderColor: '#ffdcb8' }]}>
      <MaterialCommunityIcons name={icono} size={20} color={destacado ? COLORS.accent : COLORS.secondary} />
      <Text style={styles.metricaValor}>
        {valor}
        <Text style={styles.metricaUnidad}> {unidad}</Text>
      </Text>
      <Text style={styles.metricaLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  selector: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  selectorBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 9, backgroundColor: '#eef4fa',
  },
  selectorOn: { backgroundColor: COLORS.primary },
  selectorText: { fontSize: 13, fontWeight: 'bold', color: COLORS.primary },

  hero: { alignItems: 'center', paddingVertical: 30 },
  heroTitle: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a', marginTop: 14 },
  heroDesc: { fontSize: 13, color: COLORS.subtitle, textAlign: 'center', marginTop: 6, lineHeight: 19, paddingHorizontal: 20 },
  botonStart: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.primary, paddingHorizontal: 26, paddingVertical: 14,
    borderRadius: 28, marginTop: 22, minWidth: 210,
  },
  botonStartText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  permisoAviso: { fontSize: 11.5, color: '#c0392b', textAlign: 'center', marginTop: 14, paddingHorizontal: 20, lineHeight: 17 },

  tipBox: {
    flexDirection: 'row', gap: 8, backgroundColor: '#fff6ec', borderRadius: 10,
    padding: 11, borderWidth: 1, borderColor: '#ffdcb8',
  },
  tipText: { flex: 1, fontSize: 11.5, color: '#8a5a00', lineHeight: 16 },

  seccion: { fontSize: 15, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 10 },
  miniCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 10, padding: 12, marginBottom: 8, elevation: 1,
  },
  miniSpot: { fontSize: 13.5, fontWeight: 'bold', color: '#1a1a1a' },
  miniFecha: { fontSize: 11, color: COLORS.subtitle, marginTop: 2 },
  miniKm: { fontSize: 15, fontWeight: 'bold', color: COLORS.primary },
  miniDur: { fontSize: 11, color: COLORS.subtitle },
  verMas: { fontSize: 11, color: '#8a9aa8', textAlign: 'center', marginTop: 4 },

  enVivo: { alignItems: 'center', paddingVertical: 18 },
  vivoRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  puntoRojo: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#FF3B30' },
  vivoText: { fontSize: 12, fontWeight: 'bold', color: '#FF3B30', letterSpacing: 1 },
  crono: { fontSize: 46, fontWeight: 'bold', color: COLORS.primary, marginTop: 6, letterSpacing: 1 },
  spotVivo: { fontSize: 13, color: COLORS.subtitle, marginTop: 4 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  metrica: {
    width: '47.5%', flexGrow: 1, backgroundColor: '#fff', borderRadius: 12,
    padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#e8eef4',
  },
  metricaValor: { fontSize: 24, fontWeight: 'bold', color: '#1a1a1a', marginTop: 6 },
  metricaUnidad: { fontSize: 12, fontWeight: '600', color: COLORS.subtitle },
  metricaLabel: { fontSize: 11, color: '#999', marginTop: 2 },

  enAire: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: '#FF9500', borderRadius: 20, paddingVertical: 9, marginTop: 12,
  },
  enAireText: { color: '#fff', fontWeight: 'bold', fontSize: 13.5, letterSpacing: 0.5 },

  saltosBox: { marginTop: 14 },
  saltosTitulo: { fontSize: 12.5, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 8 },
  salto: {
    backgroundColor: '#fff', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 13,
    alignItems: 'center', borderWidth: 1, borderColor: '#ffdcb8',
  },
  saltoAltura: { fontSize: 17, fontWeight: 'bold', color: '#FF9500' },
  saltoUnidad: { fontSize: 10, color: COLORS.subtitle },
  saltoAirtime: { fontSize: 10, color: '#999', marginTop: 1 },

  kiteBox: {
    flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'center',
    borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8, marginTop: 14,
  },
  kiteText: { fontSize: 12.5, fontWeight: '600', color: '#1a1a1a' },

  botonStop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FF3B30', paddingVertical: 15, borderRadius: 28, marginTop: 22,
  },
  avisoVivo: { fontSize: 11, color: '#8a9aa8', textAlign: 'center', marginTop: 12, fontStyle: 'italic' },
});