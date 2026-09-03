// ============================================================
// GUSTS - Conexión con Supabase
// ============================================================

import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://iyrqsbssjjdmaneatetb.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5cnFzYnNzampkbWFuZWF0ZXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyOTMzMjIsImV4cCI6MjEwMzg2OTMyMn0.u2cYdAaWdTOwxzBRKAovau78eMYwDL8AFotZclBrpDU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Traduce los errores de Supabase a algo legible
export function mensajeDeError(error) {
  if (!error) return '';
  const m = (error.message || '').toLowerCase();
  if (m.includes('invalid login')) return 'Mail o contraseña incorrectos.';
  if (m.includes('already registered')) return 'Ese mail ya está registrado. Iniciá sesión.';
  if (m.includes('password should be')) return 'La contraseña tiene que tener al menos 6 caracteres.';
  if (m.includes('email not confirmed')) return 'Falta confirmar el mail. Revisá tu casilla.';
  if (m.includes('unable to validate email')) return 'Ese mail no parece válido.';
  if (m.includes('network')) return 'Sin conexión. Revisá internet.';
  return error.message || 'Algo salió mal. Probá de nuevo.';
}
