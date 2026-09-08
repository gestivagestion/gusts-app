import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { supabase } from './supabaseClient';
import EventsScreen from './EventsScreen';

const COLORS = { primary: '#003D7A', light: '#f5f9fc' };

export default function SocialScreen() {
  const [yo, setYo] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setYo(data?.user?.id || null);
      setCargando(false);
    });
  }, []);

  if (cargando) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return <EventsScreen yo={yo} />;
}

const styles = StyleSheet.create({
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.light },
});
