// ============================================================
// GUSTS - Spots favoritos (guardados en el teléfono)
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'gusts:favoritos:v1';

export async function getFavoritos() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export async function setFavoritos(ids) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(ids));
  } catch (e) {
    console.log('No se pudieron guardar los favoritos:', e);
  }
  return ids;
}

export async function toggleFavorito(id) {
  const actuales = await getFavoritos();
  const nuevos = actuales.includes(id)
    ? actuales.filter((x) => x !== id)
    : [...actuales, id];
  await setFavoritos(nuevos);
  return nuevos;
}