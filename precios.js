// ============================================================
// GUSTS - Precios y datos de cobro
// Todo junto acá para cambiarlo en un solo lugar.
// ============================================================

// 👇 PONÉ TUS DATOS REALES DE COBRO
export const COBRO = {
  alias: 'gestiva.gusts',                 // alias de Mercado Pago o CBU
  titular: 'Leandro Nuñez',               // a nombre de quién figura
  mail: 'gestivagestion@gmail.com',       // adónde mandan el comprobante
};

// Apoyo voluntario (en dólares, se cobra el equivalente en pesos)
export const APOYOS = [
  { monto: 2, label: 'Un café', desc: 'Ayuda a pagar el servidor del mes' },
  { monto: 5, label: 'Una mano', desc: 'Cubre el pronóstico de varios días' },
  { monto: 10, label: 'Un empujón', desc: 'Banca el desarrollo de lo que viene' },
];

// Destacar una publicación
export const DESTACADOS = [
  { dias: 7, monto: 3, label: '1 semana' },
  { dias: 15, monto: 5, label: '15 días' },
  { dias: 30, monto: 8, label: '1 mes' },
];

// Verificación de instructor o escuela
export const INSTRUCTOR = {
  monto: 6,
  dias: 30,
  // Los primeros dos meses son gratis: sin usuarios todavía,
  // cobrar de entrada no tiene sentido para nadie.
  prueba: true,
  diasPrueba: 60,
  beneficios: [
    'Insignia de verificado en tu perfil y tus avisos',
    'Aparecés primero en la sección de Clases',
    'Podés publicar sin límite de avisos activos',
    'Tus alumnos ven tus calificaciones acumuladas',
    'Panel con agenda de turnos, alcance de tus avisos e ingresos',
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