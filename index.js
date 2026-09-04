import React from 'react';
import { TextInput } from 'react-native';
import { registerRootComponent } from 'expo';
import App from './App';
import ErrorBoundary from './ErrorBoundary';

// Color de texto por defecto para todos los TextInput de la app.
// Sin esto, en modo oscuro Android los pinta blancos sobre fondo claro.
TextInput.defaultProps = TextInput.defaultProps || {};
TextInput.defaultProps.style = [
  { color: '#1a1a1a' },
  TextInput.defaultProps.style,
];
TextInput.defaultProps.placeholderTextColor = '#aaa';

function Root() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

registerRootComponent(Root);
