// ============================================================
// GUSTS - Precios y datos de cobro
// Todo junto acá para cambiarlo en un solo lugar.
// ============================================================

// Datos de transferencia. Siguen vigentes mientras las compras
// dentro de la app no estén activas.
export const COBRO = {
  alias: 'gestiva.gusts',                 // alias de Mercado Pago o CBU
  titular: 'Leandro Nuñez',               // a nombre de quién figura
  mail: 'gestivagestion@gmail.com',       // adónde mandan el comprobante
};

// ------------------------------------------------------------
// IDs de producto para Google Play y App Store.
// Tienen que coincidir EXACTAMENTE con los que se creen en cada
// consola. Si cambia uno acá, hay que cambiarlo allá también.
// ------------------------------------------------------------
export const PRODUCTOS = {
  // consumibles (pago único)
  destacar30: 'gusts_destacar_30',
  destacar60: 'gusts_destacar_60',
  destacar90: 'gusts_destacar_90',
  apoyo2: 'gusts_apoyo_2',
  apoyo5: 'gusts_apoyo_5',
  apoyo10: 'gusts_apoyo_10',
  // suscripciones
  instructor: 'gusts_instructor_mensual',
  alojamiento: 'gusts_alojamiento_mensual',
};

// Apoyo voluntario
export const APOYOS = [
  { monto: 2, label: 'Un café', desc: 'Ayuda a pagar el servidor del mes', sku: PRODUCTOS.apoyo2 },
  { monto: 5, label: 'Una mano', desc: 'Cubre el pronóstico de varios días', sku: PRODUCTOS.apoyo5 },
  { monto: 10, label: 'Un empujón', desc: 'Banca el desarrollo de lo que viene', sku: PRODUCTOS.apoyo10 },
];

// Destacar una publicación
export const DESTACADOS = [
  { dias: 30, monto: 2, label: '30 días', sku: PRODUCTOS.destacar30 },
  { dias: 60, monto: 3.5, label: '60 días', sku: PRODUCTOS.destacar60 },
  { dias: 90, monto: 5, label: '90 días', sku: PRODUCTOS.destacar90 },
];

// Verificación de instructor o escuela
export const INSTRUCTOR = {
  monto: 5,
  dias: 30,
  sku: PRODUCTOS.instructor,
  // Los primeros dos meses son gratis: sin usuarios todavía,
  // cobrar de entrada no tiene sentido para nadie.
  prueba: true,
  diasPrueba: 60,
  beneficios: [
    'Insignia de verificado en tu perfil y tus avisos',
    'Podés publicar en la sección de Clases',
    'Aparecés primero en la sección de Clases',
    'Podés publicar sin límite de avisos activos',
    'Tus alumnos ven tus calificaciones acumuladas',
    'Panel con agenda de turnos, alcance de tus avisos e ingresos',
  ],
};

// Alquiler de alojamiento (todavía no está activo)
export const ALOJAMIENTO = {
  monto: 3,
  dias: 30,
  sku: PRODUCTOS.alojamiento,
  activo: false,
  beneficios: [
    'Insignia de anfitrión verificado',
    'Aparecés primero en la sección de Alojamiento',
    'Podés publicar sin límite de propiedades',
  ],
};

// Texto que arma el mensaje del comprobante
export function textoPago(concepto, monto) {
  return (
    `Hola! Quiero ${concepto}.\n\n` +
    `Monto: USD ${monto} (equivalente en pesos)\n` +
    `Transferir a: ${COBRO.alias} (${COBRO.titular})\n\n` +
    `Adjunto el comprobante para que lo activen.`
  );
}
