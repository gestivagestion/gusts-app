import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Image,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert, Linking,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { LOGO_BASE64 } from './logo';
import { supabase, mensajeDeError } from './supabaseClient';

const COLORS = {
  primary: '#003D7A',
  secondary: '#00BCD4',
  accent: '#FF9500',
  light: '#f5f9fc',
  subtitle: '#666',
};

export default function AuthScreen() {
  const [modo, setModo] = useState('login'); // 'login' | 'registro'
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [verPass, setVerPass] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const esRegistro = modo === 'registro';

  const enviar = async () => {
    setError('');
    if (!email.trim() || !pass) {
      setError('Completá mail y contraseña.');
      return;
    }
    if (esRegistro && !nombre.trim()) {
      setError('Poné tu nombre para que te reconozcan en el agua.');
      return;
    }
    if (pass.length < 6) {
      setError('La contraseña tiene que tener al menos 6 caracteres.');
      return;
    }

    setCargando(true);
    try {
      if (esRegistro) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: pass,
          options: { data: { nombre: nombre.trim() } },
        });
        if (error) throw error;
        if (data.session === null) {
          Alert.alert(
            'Revisá tu mail',
            'Te mandamos un correo para confirmar la cuenta. Después volvé e iniciá sesión.'
          );
          setModo('login');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: pass,
        });
        if (error) throw error;
      }
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setCargando(false);
    }
  };

  const recuperar = async () => {
    if (!email.trim()) {
      setError('Escribí tu mail arriba y volvé a tocar acá.');
      return;
    }
    setCargando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setCargando(false);
    if (error) setError(mensajeDeError(error));
    else Alert.alert('Listo', 'Te mandamos un mail para reestablecer la contraseña.');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.primary }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoCard}>
          <Image source={{ uri: LOGO_BASE64 }} style={styles.logo} resizeMode="contain" />
        </View>
        <Text style={styles.tagline}>Find wind • Connect • Trade</Text>

        <View style={styles.card}>
          <View style={styles.switch}>
            <TouchableOpacity
              style={[styles.switchBtn, !esRegistro && styles.switchBtnOn]}
              onPress={() => { setModo('login'); setError(''); }}
            >
              <Text style={[styles.switchText, !esRegistro && styles.switchTextOn]}>Entrar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.switchBtn, esRegistro && styles.switchBtnOn]}
              onPress={() => { setModo('registro'); setError(''); }}
            >
              <Text style={[styles.switchText, esRegistro && styles.switchTextOn]}>Crear cuenta</Text>
            </TouchableOpacity>
          </View>

          {esRegistro && (
            <View style={styles.campo}>
              <Text style={styles.label}>Nombre</Text>
              <TextInput
                style={styles.input}
                value={nombre}
                onChangeText={setNombre}
                placeholder="Cómo te van a ver los demás"
                placeholderTextColor="#aaa"
              />
            </View>
          )}

          <View style={styles.campo}>
            <Text style={styles.label}>Mail</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="tumail@gmail.com"
              placeholderTextColor="#aaa"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          </View>

          <View style={styles.campo}>
            <Text style={styles.label}>Contraseña</Text>
            <View style={styles.passRow}>
              <TextInput
                style={[styles.input, { flex: 1, borderRightWidth: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0 }]}
                value={pass}
                onChangeText={setPass}
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor="#aaa"
                secureTextEntry={!verPass}
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.ojo} onPress={() => setVerPass(!verPass)}>
                <MaterialCommunityIcons
                  name={verPass ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={COLORS.subtitle}
                />
              </TouchableOpacity>
            </View>
          </View>

          {!!error && (
            <View style={styles.errorBox}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#c0392b" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity style={styles.boton} onPress={enviar} disabled={cargando}>
            {cargando ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.botonText}>{esRegistro ? 'Crear cuenta' : 'Entrar'}</Text>
            )}
          </TouchableOpacity>

          {!esRegistro && (
            <TouchableOpacity onPress={recuperar} disabled={cargando}>
              <Text style={styles.olvide}>Olvidé mi contraseña</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.pie}>
          Necesitás una cuenta para publicar, anotarte a eventos y hablar con otros riders.
        </Text>

        <TouchableOpacity
          style={styles.credito}
          onPress={() => Linking.openURL('mailto:gestivagestion@gmail.com?subject=GUSTS')}
        >
          <Text style={styles.creditoText}>Diseñado y creado por Gestiva</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 22, paddingVertical: 40 },

  logoCard: {
    backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 18, paddingVertical: 12,
    alignSelf: 'center', elevation: 4,
  },
  logo: { width: 230, height: 68 },
  tagline: { color: 'rgba(255,255,255,0.85)', fontSize: 12, textAlign: 'center', marginTop: 10, marginBottom: 26 },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },

  switch: { flexDirection: 'row', backgroundColor: '#eef4fa', borderRadius: 10, padding: 4, marginBottom: 20 },
  switchBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  switchBtnOn: { backgroundColor: COLORS.primary },
  switchText: { fontSize: 13.5, fontWeight: 'bold', color: COLORS.primary },
  switchTextOn: { color: '#fff' },

  campo: { marginBottom: 14, gap: 7 },
  label: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
  input: {
    backgroundColor: '#f7f9fb', borderRadius: 9, paddingHorizontal: 13, paddingVertical: 12,
    borderWidth: 1, borderColor: '#dde6ee', fontSize: 15,
  },
  passRow: { flexDirection: 'row', alignItems: 'stretch' },
  ojo: {
    justifyContent: 'center', paddingHorizontal: 13, backgroundColor: '#f7f9fb',
    borderWidth: 1, borderLeftWidth: 0, borderColor: '#dde6ee',
    borderTopRightRadius: 9, borderBottomRightRadius: 9,
  },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#fdf0ee',
    borderRadius: 9, padding: 11, marginBottom: 14, borderWidth: 1, borderColor: '#f5c6c0',
  },
  errorText: { flex: 1, fontSize: 12.5, color: '#c0392b', lineHeight: 17 },

  boton: {
    backgroundColor: COLORS.primary, paddingVertical: 15, borderRadius: 10,
    alignItems: 'center', marginTop: 4,
  },
  botonText: { color: '#fff', fontWeight: 'bold', fontSize: 15.5 },
  olvide: { fontSize: 12.5, color: COLORS.subtitle, textAlign: 'center', marginTop: 16 },

  pie: {
    color: 'rgba(255,255,255,0.7)', fontSize: 11.5, textAlign: 'center',
    marginTop: 24, lineHeight: 17, paddingHorizontal: 10,
  },
  credito: { marginTop: 22, alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 10 },
  creditoText: {
    color: 'rgba(255,255,255,0.45)', fontSize: 10.5, letterSpacing: 0.6, textAlign: 'center',
  },
});