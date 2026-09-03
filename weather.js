// ============================================================
// GUSTS - Viento real y pronóstico (Open-Meteo)
// API gratuita, sin API key ni registro. https://open-meteo.com
// Devuelve velocidad y ráfagas en NUDOS y temperatura en °C.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { KITE_TABLE } from './spots';

const BASE = 'https://api.open-meteo.com/v1/forecast';

// En modo avión, Android puede dejar la consulta colgada en vez de
// fallar. Cortamos por tiempo, pero sin depender de AbortController,
// que no está en todas las versiones.
const ESPERA_MAX = 25000;

async function consultar(url) {
  const conCorte = (promesa) =>
    Promise.race([
      promesa,
      new Promise((_, rechazar) =>
        setTimeout(() => rechazar(new Error('Sin conexión o tardó demasiado')), ESPERA_MAX)
      ),
    ]);

  let res;
  try {
    res = await conCorte(fetch(url));
  } catch (e) {
    throw new Error(
      String(e.message || '').includes('Sin conexión')
        ? 'Sin conexión o tardó demasiado'
        : 'No se pudo conectar con el servicio de viento'
    );
  }

  if (!res.ok) {
    throw new Error(`El servicio de viento respondió ${res.status}`);
  }
  return res.json();
}

// El servicio a veces devuelve 429 o 503 si le pedimos muy seguido.
// Reintentamos un par de veces esperando cada vez un poco más.
async function consultarConReintentos(url, intentos = 3) {
  let ultimo;
  for (let i = 0; i < intentos; i++) {
    try {
      return await consultar(url);
    } catch (e) {
      ultimo = e;
      const recuperable = /429|503|502|504/.test(e.message || '');
      if (!recuperable || i === intentos - 1) throw e;
      await new Promise((r) => setTimeout(r, 900 * (i + 1)));
    }
  }
  throw ultimo;
}

// ------------------------------------------------------------
// Memoria de los últimos datos.
// El viento se actualiza cada hora, así que guardar 15 minutos
// evita consultas al pedo y nos deja mostrar algo si falla.
// ------------------------------------------------------------
const CACHE = 'gusts:viento:cache:v1';
const VIGENCIA = 15 * 60 * 1000;

async function leerCache(clave) {
  try {
    const raw = await AsyncStorage.getItem(CACHE);
    if (!raw) return null;
    const todo = JSON.parse(raw);
    const item = todo[clave];
    if (!item) return null;
    return { datos: item.datos, viejo: Date.now() - item.hora > VIGENCIA };
  } catch (e) {
    return null;
  }
}

async function guardarCache(clave, datos) {
  try {
    const raw = await AsyncStorage.getItem(CACHE);
    const todo = raw ? JSON.parse(raw) : {};
    todo[clave] = { datos, hora: Date.now() };
    await AsyncStorage.setItem(CACHE, JSON.stringify(todo));
  } catch (e) {}
}

// Convierte grados a punto cardinal
export function gradosACardinal(deg) {
  if (deg == null) return '—';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
  return dirs[Math.round(deg / 22.5) % 16];
}

// ------------------------------------------------------------
// Kite sugerido para una velocidad concreta.
// La tabla base está pensada para un rider de 75 kg.
// Cada 10 kg de diferencia se sube o baja un metro y medio de vela,
// que es la regla que se usa en la práctica.
// ------------------------------------------------------------
const PESO_BASE = 75;

// Devuelve el factor por el que se multiplican los tamaños.
// La potencia que necesitás escala con tu peso, así que el ajuste
// es proporcional y no una cantidad fija de metros.
export function factorPorPeso(peso) {
  const p = Number(peso);
  if (!p || p < 35 || p > 180) return 1;
  return p / PESO_BASE;
}

// Corre los números de una descripción de kite ("9m a 10m") según el peso
function escalarMetros(texto, factor) {
  if (factor === 1) return texto;
  return texto.replace(/(\d+(?:\.\d+)?)m/g, (_, n) => {
    const v = Math.round(Number(n) * factor * 2) / 2; // al medio metro
    const limitado = Math.min(21, Math.max(4, v));
    return `${limitado % 1 === 0 ? limitado : limitado.toFixed(1)}m`;
  });
}

export function kiteParaViento(kt, peso) {
  if (kt == null) return null;

  // Por debajo del primer renglón de la tabla no hay kite que sirva.
  // Sin esto, la búsqueda no encontraba fila y caía al último renglón,
  // que es el de 30 nudos o más: con 10 nudos sugería un 5 metros.
  if (kt < KITE_TABLE[0].min) return null;

  const fila =
    KITE_TABLE.find((r) => kt >= r.min && kt < r.max) || KITE_TABLE[KITE_TABLE.length - 1];
  const f = factorPorPeso(peso);
  if (f === 1) return fila;
  return { ...fila, kites: escalarMetros(fila.kites, f), ajustado: true };
}

// Igual que kitesForSpot pero escalando los tamaños según el peso
export function kitesParaSpot(filas, peso) {
  const f = factorPorPeso(peso);
  if (f === 1) return filas;
  return filas.map((r) => ({ ...r, kites: escalarMetros(r.kites, f), ajustado: true }));
}

// Calidad de la sesión según el rango habitual del spot
export function calidadSesion(kt, spot) {
  if (kt == null) return { texto: 'Sin datos', color: '#999' };
  if (kt < 8) return { texto: 'Sin viento', color: '#999' };
  if (kt < spot.windMin) return { texto: 'Flojo para este spot', color: '#FF9500' };
  if (kt <= spot.windMax) return { texto: 'Navegable', color: '#34C759' };
  return { texto: 'Sobrado, cuidado', color: '#FF3B30' };
}

// ------------------------------------------------------------
// Viento actual + próximas horas para UN spot
// ------------------------------------------------------------
export async function getPronostico(spot) {
  const params = new URLSearchParams({
    latitude: spot.lat,
    longitude: spot.lng,
    current: 'temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    hourly: 'temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    wind_speed_unit: 'kn',
    timezone: 'auto',
    forecast_days: '3',
  });

  const data = await consultarConReintentos(`${BASE}?${params}`);

  const ahora = {
    viento: Math.round(data.current.wind_speed_10m),
    rafagas: Math.round(data.current.wind_gusts_10m),
    direccion: data.current.wind_direction_10m,
    cardinal: gradosACardinal(data.current.wind_direction_10m),
    temp: Math.round(data.current.temperature_2m),
    hora: data.current.time,
  };

  // Próximas 48 h desde la hora actual
  const idxAhora = data.hourly.time.findIndex((t) => t >= data.current.time);
  const desde = idxAhora === -1 ? 0 : idxAhora;
  const horas = data.hourly.time.slice(desde, desde + 48).map((t, i) => ({
    hora: t,
    viento: Math.round(data.hourly.wind_speed_10m[desde + i]),
    rafagas: Math.round(data.hourly.wind_gusts_10m[desde + i]),
    direccion: data.hourly.wind_direction_10m[desde + i],
    cardinal: gradosACardinal(data.hourly.wind_direction_10m[desde + i]),
    temp: Math.round(data.hourly.temperature_2m[desde + i]),
  }));

  return { ahora, horas };
}

// ------------------------------------------------------------
// Viento actual para VARIOS spots.
// Primero probamos pedirlos todos juntos, que es una sola consulta.
// Si eso falla, los pedimos de a uno: más lento pero más seguro.
// ------------------------------------------------------------
function armarDato(current) {
  return {
    viento: Math.round(current.wind_speed_10m),
    rafagas: Math.round(current.wind_gusts_10m),
    direccion: current.wind_direction_10m,
    cardinal: gradosACardinal(current.wind_direction_10m),
    temp: Math.round(current.temperature_2m),
    hora: current.time,
  };
}

async function unoPorUno(spots) {
  const salida = {};
  const resultados = await Promise.all(
    spots.map(async (s) => {
      try {
        const params = new URLSearchParams({
          latitude: s.lat,
          longitude: s.lng,
          current: 'temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
          wind_speed_unit: 'kn',
          timezone: 'auto',
        });
        const d = await consultarConReintentos(`${BASE}?${params}`);
        return [s.id, d.current ? armarDato(d.current) : null];
      } catch (e) {
        return [s.id, null];
      }
    })
  );
  resultados.forEach(([id, dato]) => {
    if (dato) salida[id] = dato;
  });
  if (!Object.keys(salida).length) {
    throw new Error('No se pudo obtener el viento de ningún spot');
  }
  return salida;
}

export async function getVientoActual(spots) {
  if (!spots.length) return {};

  const clave = spots.map((s) => s.id).join('|');
  const guardado = await leerCache(clave);
  if (guardado && !guardado.viejo) return guardado.datos;

  try {
    const params = new URLSearchParams({
      latitude: spots.map((s) => s.lat).join(','),
      longitude: spots.map((s) => s.lng).join(','),
      current: 'temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      wind_speed_unit: 'kn',
      timezone: 'auto',
    });

    const data = await consultarConReintentos(`${BASE}?${params}`);

    // con una coordenada devuelve un objeto, con varias un array
    const lista = Array.isArray(data) ? data : [data];
    const salida = {};
    lista.forEach((d, i) => {
      const spot = spots[i];
      if (spot && d && d.current) salida[spot.id] = armarDato(d.current);
    });

    if (!Object.keys(salida).length) throw new Error('Respuesta vacía');
    await guardarCache(clave, salida);
    return salida;
  } catch (e) {
    try {
      // plan B: uno por uno
      const salida = await unoPorUno(spots);
      await guardarCache(clave, salida);
      return salida;
    } catch (e2) {
      // plan C: lo último que teníamos guardado, aunque esté viejo
      if (guardado) return guardado.datos;
      throw e2;
    }
  }
}