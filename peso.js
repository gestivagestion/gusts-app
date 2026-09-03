// ============================================================
// GUSTS - Peso del rider (para ajustar los tamaños de kite)
// Se guarda en el perfil de la cuenta y se cachea en el teléfono
// para no consultar la base cada vez que abrís una pantalla.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';

const KEY = 'gusts:peso:v1';

export async function getPeso() {
  try {
    const cache = await AsyncStorage.getItem(KEY);
    if (cache) return Number(cache) || null;
  } catch (e) {}

  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user?.id) return null;
    const { data } = await supabase
      .from('datos_privados')
      .select('peso')
      .eq('usuario', auth.user.id)
      .maybeSingle();
    if (data?.peso) {
      await AsyncStorage.setItem(KEY, String(data.peso));
      return data.peso;
    }
  } catch (e) {}
  return null;
}

export async function setPesoCache(peso) {
  try {
    if (peso) await AsyncStorage.setItem(KEY, String(peso));
    else await AsyncStorage.removeItem(KEY);
  } catch (e) {}
}