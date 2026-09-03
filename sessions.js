// ============================================================
// GUSTS - Sesiones de navegación
// Se guardan en la nube (tabla sesiones) para que te sigan a
// cualquier teléfono y alimenten el ranking.
// Si estás sin señal en la playa quedan en cola en el teléfono
// y se suben solas la próxima vez que abras la app con internet.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { SPOTS } from './spots';
import { supabase } from './supabaseClient';

const COLA = 'gusts:sesiones:pendientes:v1';

// ---------- geometría ----------
export function distanciaKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Spot más cercano dentro de 20 km
export function spotMasCercano(punto) {
  let mejor = null;
  let min = Infinity;
  SPOTS.forEach((s) => {
    const d = distanciaKm(punto, { lat: s.lat, lng: s.lng });
    if (d < min) {
      min = d;
      mejor = s;
    }
  });
  return min <= 20 ? { spot: mejor, km: min } : null;
}

// ---------- formato ----------
export function formatoDuracion(seg) {
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export function formatoFecha(iso) {
  const d = new Date(iso);
  const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  return `${dias[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const msANudos = (ms) => (ms || 0) * 1.94384;

// ---------- conversión entre la base y la app ----------
const filaASesion = (f) => ({
  id: 's-' + f.id,
  filaId: f.id,
  fecha: f.fecha,
  duracionSeg: f.duracion_seg,
  distanciaKm: Number(f.distancia_km) || 0,
  velMaxKt: Number(f.vel_max_kt) || 0,
  velPromKt: Number(f.vel_prom_kt) || 0,
  spotNombre: f.spot_nombre,
  spotRegion: f.spot_region,
  viento: f.viento_kt ? { viento: f.viento_kt, cardinal: f.viento_dir } : null,
  cantSaltos: f.cant_saltos || 0,
  alturaMaxM: Number(f.altura_max_m) || 0,
  airtimeMax: Number(f.airtime_max) || 0,
  sincronizada: true,
});

const sesionAFila = (s, usuario) => ({
  usuario,
  fecha: s.fecha,
  duracion_seg: s.duracionSeg,
  distancia_km: s.distanciaKm,
  vel_max_kt: s.velMaxKt,
  vel_prom_kt: s.velPromKt,
  spot_nombre: s.spotNombre,
  spot_region: s.spotRegion,
  viento_kt: s.viento?.viento ?? null,
  viento_dir: s.viento?.cardinal ?? null,
  cant_saltos: s.cantSaltos || 0,
  altura_max_m: s.alturaMaxM || 0,
  airtime_max: s.airtimeMax || 0,
  lat: s.punto?.lat ?? null,
  lng: s.punto?.lng ?? null,
});

// ---------- cola local (cuando no hay señal) ----------
async function getCola() {
  try {
    const raw = await AsyncStorage.getItem(COLA);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

async function setCola(lista) {
  try {
    await AsyncStorage.setItem(COLA, JSON.stringify(lista));
  } catch (e) {}
}

// Sube lo que haya quedado pendiente
export async function sincronizar() {
  const cola = await getCola();
  if (!cola.length) return 0;

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return 0;

  const quedan = [];
  let subidas = 0;
  for (const s of cola) {
    const { error } = await supabase.from('sesiones').insert(sesionAFila(s, uid));
    if (error) quedan.push(s);
    else subidas += 1;
  }
  await setCola(quedan);
  return subidas;
}

// ---------- API ----------
export async function getSesiones() {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;

  const pendientes = (await getCola()).map((s) => ({ ...s, sincronizada: false }));
  if (!uid) return pendientes;

  const { data, error } = await supabase
    .from('sesiones')
    .select('*')
    .eq('usuario', uid)
    .order('fecha', { ascending: false })
    .limit(300);

  if (error) return pendientes;
  return [...pendientes, ...(data || []).map(filaASesion)].sort(
    (a, b) => new Date(b.fecha) - new Date(a.fecha)
  );
}

export async function guardarSesion(sesion) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;

  if (uid) {
    const { error } = await supabase.from('sesiones').insert(sesionAFila(sesion, uid));
    if (!error) return getSesiones();
  }

  // sin conexión: queda en cola y se sube después
  const cola = await getCola();
  await setCola([sesion, ...cola]);
  return getSesiones();
}

export async function borrarSesion(id) {
  const lista = await getSesiones();
  const s = lista.find((x) => x.id === id);
  if (s?.filaId) {
    await supabase.from('sesiones').delete().eq('id', s.filaId);
  } else {
    const cola = await getCola();
    await setCola(cola.filter((x) => x.id !== id));
  }
  return getSesiones();
}

// ---------- estadísticas ----------
export function estadisticas(sesiones) {
  if (!sesiones.length) {
    return {
      total: 0, horas: 0, km: 0, velMax: 0, spots: 0, vientoMax: 0,
      alturaMax: 0, saltos: 0, airtimeMax: 0, mejorSesion: null,
    };
  }
  const segs = sesiones.reduce((a, s) => a + s.duracionSeg, 0);
  const km = sesiones.reduce((a, s) => a + s.distanciaKm, 0);
  const velMax = Math.max(...sesiones.map((s) => s.velMaxKt || 0));
  const vientoMax = Math.max(...sesiones.map((s) => s.viento?.viento || 0));
  const spots = new Set(sesiones.map((s) => s.spotNombre).filter(Boolean)).size;
  const alturaMax = Math.max(...sesiones.map((s) => s.alturaMaxM || 0));
  const airtimeMax = Math.max(...sesiones.map((s) => s.airtimeMax || 0));
  const saltos = sesiones.reduce((a, s) => a + (s.cantSaltos || 0), 0);
  const mejorSesion = [...sesiones].sort((a, b) => b.distanciaKm - a.distanciaKm)[0];
  return {
    total: sesiones.length, horas: segs / 3600, km, velMax, spots,
    vientoMax, alturaMax, airtimeMax, saltos, mejorSesion,
  };
}