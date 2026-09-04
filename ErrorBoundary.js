import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ error, info });
  }

  render() {
    const { error, info } = this.state;

    if (!error) return this.props.children;

    return (
      <View style={styles.cont}>
        <Text style={styles.titulo}>Se produjo un error</Text>
        <Text style={styles.sub}>
          Copiá este texto y pasalo para diagnosticar el problema.
        </Text>

        <ScrollView style={styles.caja} contentContainerStyle={{ padding: 12 }}>
          <Text style={styles.label}>MENSAJE</Text>
          <Text selectable style={styles.texto}>
            {String(error?.message || error)}
          </Text>

          <Text style={styles.label}>STACK</Text>
          <Text selectable style={styles.texto}>
            {String(error?.stack || 'sin stack')}
          </Text>

          {info?.componentStack ? (
            <>
              <Text style={styles.label}>COMPONENTE</Text>
              <Text selectable style={styles.texto}>
                {String(info.componentStack)}
              </Text>
            </>
          ) : null}
        </ScrollView>

        <TouchableOpacity
          style={styles.boton}
          onPress={() => this.setState({ error: null, info: null })}
        >
          <Text style={styles.botonTexto}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  cont: { flex: 1, backgroundColor: '#0e1a26', paddingTop: 60, paddingHorizontal: 16, paddingBottom: 30 },
  titulo: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  sub: { color: '#9fb3c8', fontSize: 12.5, marginBottom: 14, lineHeight: 18 },
  caja: { flex: 1, backgroundColor: '#0a1219', borderRadius: 10, borderWidth: 1, borderColor: '#1e3448' },
  label: { color: '#4fc3d7', fontSize: 10, fontWeight: 'bold', marginTop: 10, marginBottom: 4, letterSpacing: 1 },
  texto: { color: '#e6edf3', fontSize: 11, lineHeight: 16, fontFamily: 'monospace' },
  boton: { backgroundColor: '#00789e', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
  botonTexto: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
});
