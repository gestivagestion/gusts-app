import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Alert, RefreshControl, Modal, Linking, ActivityIndicator, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { SPOTS } from './spots';
import { getFavoritos } from './favorites';
import { supabase } from './supabaseClient';
import { setPesoCache } from './peso';
import { COBRO, APOYOS, INSTRUCTOR, textoPago } from './precios';
import { PIN_BASE64 } from './pinIcon';
import InstructorScreen from './InstructorScreen';
import { getBloqueados, desbloquear } from './moderacion';
import {
  getSesiones, borrarSesion, estadisticas, formatoDuracion, formatoFecha,
} from './sessions';

const COLORS = {
  primary: '#003D7A',
  secondary: '#00BCD4',
  accent: '#FF9500',
  light: '#f5f9fc',
  subtitle: '#666',
};

const NIVELES = ['Aprendiendo', 'Principiante', 'Intermedio', 'Avanzado', 'Instructor'];

// ------------------------------------------------------------
// Descargo de responsabilidad para instructores.
// Si se cambia el texto hay que subir la versión: los que ya lo
// aceptaron van a tener que aceptarlo de nuevo.
// ------------------------------------------------------------
const DESCARGO_VERSION = '2026-09';
const DESCARGO_PUNTOS = [
  'GUSTS es solo un lugar donde alumnos e instructores se encuentran. No organizamos, supervisamos ni participamos de las clases.',
  'Sos el único responsable de tu habilitación, tu seguro, tu equipo y la seguridad de tus alumnos durante la clase.',
  'El precio y el pago se acuerdan directamente con el alumno. GUSTS no cobra, no retiene ni garantiza ningún pago.',
  'GUSTS no responde por accidentes, lesiones, daños al equipo, ni por incumplimientos de ninguna de las partes.',
  'Declarás que la información que publicás sobre tu certificación y experiencia es verdadera. Si no lo es, damos de baja la verificación.',
];

export default function ProfileScreen() {
  const [sesiones, setSesiones] = useState([]);
  const [yo, setYo] = useState(null);
  const [favoritos, setFavoritos] = useState([]);
  const [perfil, setPerfil] = useState({ nombre: '', nivel: '', peso: '', desde: '', bio: '', avatar_url: '', apoyo_total: 0 });
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [editar, setEditar] = useState(false);
  const [form, setForm] = useState(perfil);
  const [cargando, setCargando] = useState(false);
  const [verTodo, setVerTodo] = useState(false);
  const [esAdmin, setEsAdmin] = useState(false);
  const [pendientes, setPendientes] = useState([]);
  const [reputacion, setReputacion] = useState(null);
  const [resenas, setResenas] = useState([]);
  const [nombresResenas, setNombresResenas] = useState({});
  const [soyVerificado, setSoyVerificado] = useState(false);
  const [pruebaUsada, setPruebaUsada] = useState(false);
  const [venceVerificacion, setVenceVerificacion] = useState(null);
  const [descargoOk, setDescargoOk] = useState(false);
  const [descargoFecha, setDescargoFecha] = useState(null);
  const [tildado, setTildado] = useState(false);
  const [pedidos, setPedidos] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [denuncias, setDenuncias] = useState([]);
  const [misBloqueados, setMisBloqueados] = useState([]);
  const [modalApoyo, setModalApoyo] = useState(false);
  const [modalInstructor, setModalInstructor] = useState(false);
  const [panelInstructor, setPanelInstructor] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setSesiones(await getSesiones());
    const ids = await getFavoritos();
    setFavoritos(SPOTS.filter((s) => ids.includes(s.id)));
    // perfil desde la base
    const { data: auth } = await supabase.auth.getUser();
    if (auth?.user?.id) {
      setYo(auth.user.id);
      const { data: p } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', auth.user.id)
        .single();

      const { data: priv } = await supabase
        .from('datos_privados')
        .select('peso')
        .eq('usuario', auth.user.id)
        .maybeSingle();

      if (p) {
        setPerfil({
          nombre: p.nombre || '',
          nivel: p.nivel || '',
          peso: priv?.peso ? String(priv.peso) : '',
          desde: p.desde || '',
          bio: p.bio || '',
          avatar_url: p.avatar_url || '',
          apoyo_total: Number(p.apoyo_total) || 0,
        });
      }

      // reputación en el mercado
      const [{ data: rep }, { data: res }] = await Promise.all([
        supabase.from('reputacion').select('*').eq('usuario', auth.user.id).maybeSingle(),
        supabase
          .from('calificaciones')
          .select('*')
          .eq('calificado', auth.user.id)
          .order('creado_en', { ascending: false })
          .limit(20),
      ]);
      setReputacion(rep || null);
      setResenas(res || []);

      if ((res || []).length) {
        const autores = [...new Set(res.map((r) => r.autor))];
        const { data: perf } = await supabase.from('profiles').select('id, nombre').in('id', autores);
        const mapa = {};
        (perf || []).forEach((x) => (mapa[x.id] = x.nombre || 'Rider'));
        setNombresResenas(mapa);
      }

      setSoyVerificado(
        !!p?.verificado && (!p?.verificado_hasta || new Date(p.verificado_hasta) > new Date())
      );
      setPruebaUsada(!!p?.prueba_usada);
      setVenceVerificacion(p?.verificado_hasta || null);

      // descargo: vale solo si aceptó la versión vigente
      const aceptado = !!p?.descargo_aceptado && p?.descargo_version === DESCARGO_VERSION;
      setDescargoOk(aceptado);
      setDescargoFecha(aceptado ? p?.descargo_fecha : null);
      setTildado(aceptado);

      const ids = await getBloqueados();
      if (ids.length) {
        const { data: bl } = await supabase.from('profiles').select('id, nombre').in('id', ids);
        setMisBloqueados(bl || []);
      } else {
        setMisBloqueados([]);
      }

      const { data: mis } = await supabase
        .from('solicitudes')
        .select('*')
        .eq('usuario', auth.user.id)
        .eq('estado', 'pendiente');
      setPedidos(mis || []);

      const admin = !!p?.admin;
      setEsAdmin(admin);
      if (admin) {
        const { data: props } = await supabase
          .from('spots_propuestos')
          .select('*')
          .eq('estado', 'pendiente')
          .order('creado_en', { ascending: true });
        setPendientes(props || []);

        const { data: sol } = await supabase
          .from('solicitudes_detalle')
          .select('*')
          .eq('estado', 'pendiente')
          .order('creado_en', { ascending: true });
        setSolicitudes(sol || []);

        const { data: den } = await supabase
          .from('denuncias_detalle')
          .select('*')
          .eq('estado', 'pendiente')
          .order('creado_en', { ascending: true });
        setDenuncias(den || []);
      }
    }

    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, []);

  const guardarPerfil = async () => {
    if (!yo) return;
    setGuardandoPerfil(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        nombre: form.nombre.trim() || null,
        nivel: form.nivel || null,
        desde: form.desde || null,
        bio: form.bio?.trim() || null,
      })
      .eq('id', yo);

    // el peso va en la tabla privada, no en el perfil público
    await supabase
      .from('datos_privados')
      .upsert({ usuario: yo, peso: form.peso ? Number(form.peso) : null });

    setGuardandoPerfil(false);

    if (error) {
      Alert.alert('No se pudo guardar', error.message);
      return;
    }
    await setPesoCache(form.peso ? Number(form.peso) : null);
    setPerfil(form);
    setEditar(false);
  };

  const cambiarFoto = async () => {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert('Sin permiso', 'Necesitamos acceso a tus fotos para poner el avatar.');
      return;
    }

    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (r.canceled || !r.assets?.[0]?.uri) return;

    setSubiendoFoto(true);
    try {
      // Achicamos a 256px antes de subir: en pantalla se ve a 40px,
      // así que subir la foto original sería tirar datos y transferencia.
      const chica = await ImageManipulator.manipulateAsync(
        r.assets[0].uri,
        [{ resize: { width: 256, height: 256 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      const ruta = `${yo}/avatar_${Date.now()}.jpg`;

      const { error: errSubida } = await supabase.storage
        .from('avatars')
        .upload(ruta, decode(chica.base64), {
          contentType: 'image/jpeg',
          upsert: true,
        });
      if (errSubida) throw errSubida;

      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(ruta);
      const url = pub.publicUrl;

      const { error: errPerfil } = await supabase
        .from('profiles')
        .update({ avatar_url: url })
        .eq('id', yo);
      if (errPerfil) throw errPerfil;

      setPerfil((p) => ({ ...p, avatar_url: url }));
    } catch (e) {
      Alert.alert('No se pudo subir la foto', e.message || 'Probá de nuevo.');
    } finally {
      setSubiendoFoto(false);
    }
  };

  // deja registrado que aceptó el descargo, con fecha y versión
  const registrarDescargo = async () => {
    const { error } = await supabase
      .from('profiles')
      .update({
        descargo_aceptado: true,
        descargo_fecha: new Date().toISOString(),
        descargo_version: DESCARGO_VERSION,
      })
      .eq('id', yo);
    if (error) {
      Alert.alert('No se pudo registrar la aceptación', error.message);
      return false;
    }
    setDescargoOk(true);
    return true;
  };

  const pedir = async (tipo, monto, dias, concepto, esPrueba) => {
    // para instructor primero guardamos la aceptación del descargo
    if (tipo === 'instructor') {
      if (!tildado) {
        Alert.alert(
          'Falta aceptar el descargo',
          'Tenés que leer y aceptar las condiciones antes de verificarte como instructor.'
        );
        return;
      }
      if (!descargoOk) {
        const ok = await registrarDescargo();
        if (!ok) return;
      }
    }

    const { error } = await supabase
      .from('solicitudes')
      .insert({ usuario: yo, tipo, monto: esPrueba ? 0 : monto, dias: dias || null, es_prueba: !!esPrueba });
    if (error) {
      Alert.alert('No se pudo registrar', error.message);
      return;
    }
    setModalApoyo(false);
    setModalInstructor(false);
    cargar();

    if (esPrueba) {
      Alert.alert(
        'Pedido enviado',
        'Revisamos tu certificación y te activamos los 2 meses gratis. No hay nada que pagar.'
      );
      return;
    }
    const cuerpo = encodeURIComponent(textoPago(concepto, monto));
    Alert.alert(
      'Gracias!',
      `Transferí USD ${monto} a ${COBRO.alias} (${COBRO.titular}) y mandanos el comprobante.`,
      [
        { text: 'Después', style: 'cancel' },
        {
          text: 'Mandar comprobante',
          onPress: () =>
            Linking.openURL(
              `mailto:${COBRO.mail}?subject=${encodeURIComponent('GUSTS · ' + concepto)}&body=${cuerpo}`
            ).catch(() => {}),
        },
      ]
    );
  };

  const verDescargo = () => {
    Alert.alert(
      'Condiciones para instructores',
      DESCARGO_PUNTOS.map((p, i) => `${i + 1}. ${p}`).join('\n\n') +
        (descargoFecha
          ? `\n\nAceptado el ${new Date(descargoFecha).toLocaleDateString('es-AR')} (versión ${DESCARGO_VERSION}).`
          : ''),
      [{ text: 'Cerrar' }]
    );
  };

  const resolverDenuncia = (d) => {
    const opciones = [{ text: 'Cerrar', style: 'cancel' }];
    if (d.publicacion_id) {
      opciones.push({
        text: 'Bajar el aviso',
        onPress: () => aplicarDenuncia(d, 'bajar_aviso'),
      });
    }
    if (d.denunciado) {
      opciones.push({
        text: 'Suspender al usuario',
        style: 'destructive',
        onPress: () => aplicarDenuncia(d, 'suspender'),
      });
    }
    opciones.push({ text: 'Descartar', onPress: () => aplicarDenuncia(d, 'descartar') });

    Alert.alert(
      d.motivo,
      (d.detalle || 'Sin detalle') +
        (d.publicacion_titulo ? `\n\nAviso: ${d.publicacion_titulo}` : '') +
        (d.mensaje_texto ? `\n\nMensaje: ${d.mensaje_texto}` : ''),
      opciones
    );
  };

  const aplicarDenuncia = async (d, accion) => {
    const { error } = await supabase.rpc('resolver_denuncia', {
      did: d.id,
      accion,
      nota: null,
    });
    if (error) {
      Alert.alert('No se pudo resolver', error.message);
      return;
    }
    setDenuncias((l) => l.filter((x) => x.id !== d.id));
  };

  const quitarBloqueo = (b) => {
    Alert.alert('Desbloquear', `¿Volver a ver a ${b.nombre || 'este rider'}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desbloquear',
        onPress: async () => {
          await desbloquear(b.id);
          setMisBloqueados((l) => l.filter((x) => x.id !== b.id));
        },
      },
    ]);
  };

  const cancelarPedido = (pedido) => {
    Alert.alert(
      'Cancelar pedido',
      'Se da de baja la solicitud. Si ya transferiste, escribinos antes de cancelar.',
      [
        { text: 'Volver', style: 'cancel' },
        {
          text: 'Cancelar pedido',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('solicitudes').delete().eq('id', pedido.id);
            if (error) Alert.alert('No se pudo cancelar', error.message);
            else cargar();
          },
        },
      ]
    );
  };

  const darDeBaja = () => {
    Alert.alert(
      'Dar de baja la verificación',
      'Perdés la insignia y el panel de instructor. Tus turnos cargados no se borran, y podés volver a verificarte cuando quieras.',
      [
        { text: 'Volver', style: 'cancel' },
        {
          text: 'Dar de baja',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.rpc('cancelar_verificacion');
            if (error) Alert.alert('No se pudo dar de baja', error.message);
            else {
              setPanelInstructor(false);
              cargar();
            }
          },
        },
      ]
    );
  };

  const eliminarCuenta = () => {
    Alert.alert(
      'Eliminar cuenta',
      'Se borra todo: tu perfil, tus publicaciones, tus mensajes, tus sesiones y tus turnos. No se puede deshacer.',
      [
        { text: 'Volver', style: 'cancel' },
        {
          text: 'Continuar',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              '¿Seguro?',
              'Última confirmación. Después de esto no hay vuelta atrás.',
              [
                { text: 'No, volver', style: 'cancel' },
                {
                  text: 'Sí, eliminar',
                  style: 'destructive',
                  onPress: async () => {
                    const { error } = await supabase.rpc('eliminar_mi_cuenta');
                    if (error) {
                      Alert.alert('No se pudo eliminar', error.message);
                      return;
                    }
                    await supabase.auth.signOut();
                  },
                },
              ]
            ),
        },
      ]
    );
  };

  const resolver = async (sol, aprobar) => {
    const { error } = aprobar
      ? await supabase.rpc('aprobar_solicitud', { sid: sol.id })
      : await supabase.rpc('rechazar_solicitud', { sid: sol.id, motivo: null });
    if (error) {
      Alert.alert('No se pudo resolver', error.message);
      return;
    }
    setSolicitudes((l) => l.filter((x) => x.id !== sol.id));
  };

  const moderar = async (prop, decision) => {
    const { error } = await supabase
      .from('spots_propuestos')
      .update({ estado: decision })
      .eq('id', prop.id);
    if (error) {
      Alert.alert('No se pudo actualizar', error.message);
      return;
    }
    setPendientes((p) => p.filter((x) => x.id !== prop.id));
  };

  const eliminar = (s) => {
    Alert.alert('Borrar sesión', `${s.spotNombre || 'Sesión'} · ${s.distanciaKm} km`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => setSesiones(await borrarSesion(s.id)),
      },
    ]);
  };

  const st = estadisticas(sesiones);
  const visibles = verTodo ? sesiones : sesiones.slice(0, 8);

  if (panelInstructor) {
    return <InstructorScreen yo={yo} volver={() => { setPanelInstructor(false); cargar(); }} />;
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.light }}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={COLORS.primary} />}
    >
      {/* Cabecera */}
      <View style={styles.header}>
        <TouchableOpacity onPress={cambiarFoto} disabled={subiendoFoto} activeOpacity={0.8}>
          <View style={styles.avatar}>
            {subiendoFoto ? (
              <ActivityIndicator color="#fff" />
            ) : perfil.avatar_url ? (
              <Image source={{ uri: perfil.avatar_url }} style={styles.avatarImg} />
            ) : (
              <MaterialCommunityIcons name="account" size={52} color="#fff" />
            )}
          </View>
          <View style={styles.camara}>
            <MaterialCommunityIcons name="camera" size={14} color="#fff" />
          </View>
        </TouchableOpacity>
        <Text style={styles.nombre}>{perfil.nombre || 'Tu perfil'}</Text>
        <Text style={styles.subtitulo}>
          {perfil.nivel || 'Nivel sin definir'}
          {perfil.desde ? ` · navega desde ${perfil.desde}` : ''}
        </Text>
        {!!perfil.bio && <Text style={styles.bio}>{perfil.bio}</Text>}
        <TouchableOpacity
          style={styles.editar}
          onPress={() => {
            setForm(perfil);
            setEditar(true);
          }}
        >
          <MaterialCommunityIcons name="pencil" size={14} color="#fff" />
          <Text style={styles.editarText}>Editar</Text>
        </TouchableOpacity>
      </View>

      {/* Estadísticas */}
      <View style={styles.bloque}>
        <Text style={styles.seccion}>Tus números</Text>
        <View style={styles.grid}>
          <Stat valor={st.total} label="Sesiones" icono="kite-outline" />
          <Stat valor={st.horas.toFixed(1)} label="Horas en el agua" icono="clock-outline" />
          <Stat valor={st.km.toFixed(1)} label="Kilómetros" icono="map-marker-distance" />
          <Stat valor={st.velMax.toFixed(1)} label="Velocidad máx. (kt)" icono="rocket-launch-outline" destacado />
          <Stat valor={st.spots} label="Spots navegados" icono="map-outline" />
          <Stat valor={st.vientoMax || '—'} label="Viento más fuerte (kt)" icono="weather-windy" />
          <Stat valor={st.alturaMax.toFixed(1)} label="Salto más alto (m)" icono="arrow-up-bold" destacado />
          <Stat valor={st.saltos} label="Saltos totales" icono="chart-timeline-variant" />
          <Stat valor={st.airtimeMax ? st.airtimeMax.toFixed(1) : '0'} label="Airtime máx. (s)" icono="timer-outline" />
        </View>

        {st.mejorSesion && (
          <View style={styles.record}>
            <MaterialCommunityIcons name="trophy-outline" size={18} color={COLORS.accent} />
            <Text style={styles.recordText}>
              Tu sesión más larga: {st.mejorSesion.distanciaKm} km en{' '}
              {st.mejorSesion.spotNombre || 'un spot sin identificar'}
              {st.alturaMax > 0 ? `. Tu mejor salto: ${st.alturaMax.toFixed(1)} m` : ''}
            </Text>
          </View>
        )}
      </View>

      {/* Moderación (solo admin) */}
      {esAdmin && (
        <View style={styles.bloque}>
          <View style={styles.modHeader}>
            <MaterialCommunityIcons name="shield-check-outline" size={18} color={COLORS.primary} />
            <Text style={styles.seccion}>Spots por aprobar</Text>
            {pendientes.length > 0 && (
              <View style={styles.modBadge}>
                <Text style={styles.modBadgeText}>{pendientes.length}</Text>
              </View>
            )}
          </View>

          {pendientes.length === 0 ? (
            <Text style={styles.vacio}>No hay propuestas pendientes.</Text>
          ) : (
            pendientes.map((p) => (
              <View key={p.id} style={styles.propuesta}>
                <Text style={styles.propNombre}>{p.nombre}</Text>
                <Text style={styles.propMeta}>
                  {[p.region, p.pais].filter(Boolean).join(', ')} · {p.lat?.toFixed(4)}, {p.lng?.toFixed(4)}
                </Text>
                <Text style={styles.propMeta}>
                  {p.water || '—'} · {p.wind || 'sin viento'} · {p.wind_min}-{p.wind_max} kt · {p.level}
                </Text>
                {!!p.water_desc && <Text style={styles.propDesc}>{p.water_desc}</Text>}
                <View style={styles.propAcciones}>
                  <TouchableOpacity
                    style={[styles.propBtn, { backgroundColor: '#34C759' }]}
                    onPress={() => moderar(p, 'aprobado')}
                  >
                    <MaterialCommunityIcons name="check" size={16} color="#fff" />
                    <Text style={styles.propBtnText}>Aprobar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.propBtn, { backgroundColor: '#c0392b' }]}
                    onPress={() =>
                      Alert.alert('Rechazar', `¿Rechazar "${p.nombre}"?`, [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Rechazar', style: 'destructive', onPress: () => moderar(p, 'rechazado') },
                      ])
                    }
                  >
                    <MaterialCommunityIcons name="close" size={16} color="#fff" />
                    <Text style={styles.propBtnText}>Rechazar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* Denuncias (solo admin) */}
      {esAdmin && denuncias.length > 0 && (
        <View style={styles.bloque}>
          <View style={styles.modHeader}>
            <MaterialCommunityIcons name="flag-outline" size={18} color="#c0392b" />
            <Text style={styles.seccion}>Denuncias</Text>
            <View style={[styles.modBadge, { backgroundColor: '#c0392b' }]}>
              <Text style={styles.modBadgeText}>{denuncias.length}</Text>
            </View>
          </View>

          {denuncias.map((d) => (
            <TouchableOpacity
              key={d.id}
              style={[styles.propuesta, { borderLeftColor: '#c0392b' }]}
              onPress={() => resolverDenuncia(d)}
            >
              <Text style={styles.propNombre}>{d.motivo}</Text>
              <Text style={styles.propMeta}>
                {d.denunciante_nombre} denunció a {d.denunciado_nombre || 'un contenido'}
              </Text>
              {!!d.publicacion_titulo && (
                <Text style={styles.propMeta}>Aviso: {d.publicacion_titulo}</Text>
              )}
              {!!d.detalle && <Text style={styles.propDesc}>{d.detalle}</Text>}
              <Text style={styles.tocarPara}>Tocá para resolver</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Solicitudes pendientes (solo admin) */}
      {esAdmin && solicitudes.length > 0 && (
        <View style={styles.bloque}>
          <View style={styles.modHeader}>
            <MaterialCommunityIcons name="cash-multiple" size={18} color={COLORS.primary} />
            <Text style={styles.seccion}>Pagos por confirmar</Text>
            <View style={styles.modBadge}>
              <Text style={styles.modBadgeText}>{solicitudes.length}</Text>
            </View>
          </View>

          {solicitudes.map((s) => (
            <View key={s.id} style={styles.propuesta}>
              <Text style={styles.propNombre}>
                {s.tipo === 'apoyo' ? 'Apoyo' : s.tipo === 'destacar' ? 'Destacar aviso' : 'Verificar instructor'}
                {' · USD '}{s.monto}
              </Text>
              <Text style={styles.propMeta}>{s.nombre} · {s.email}</Text>
              {!!s.publicacion_titulo && (
                <Text style={styles.propMeta}>Aviso: {s.publicacion_titulo}</Text>
              )}
              {!!s.dias && <Text style={styles.propMeta}>{s.dias} días</Text>}
              <View style={styles.propAcciones}>
                <TouchableOpacity
                  style={[styles.propBtn, { backgroundColor: '#34C759' }]}
                  onPress={() => resolver(s, true)}
                >
                  <MaterialCommunityIcons name="check" size={16} color="#fff" />
                  <Text style={styles.propBtnText}>Cobré, activar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.propBtn, { backgroundColor: '#c0392b' }]}
                  onPress={() => resolver(s, false)}
                >
                  <MaterialCommunityIcons name="close" size={16} color="#fff" />
                  <Text style={styles.propBtnText}>Rechazar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Reputación en el mercado */}
      {(reputacion || resenas.length > 0) && (
        <View style={styles.bloque}>
          <Text style={styles.seccion}>Tu reputación en el mercado</Text>

          <View style={styles.repCabecera}>
            <View style={styles.repNumero}>
              <Text style={styles.repPromedio}>{reputacion?.promedio ?? '—'}</Text>
              <View style={{ flexDirection: 'row' }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <MaterialCommunityIcons
                    key={n}
                    name={n <= Math.round(reputacion?.promedio || 0) ? 'star' : 'star-outline'}
                    size={13}
                    color="#FFB300"
                  />
                ))}
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.repDetalle}>
                {reputacion?.total || 0} {reputacion?.total === 1 ? 'calificación' : 'calificaciones'}
              </Text>
              {!!reputacion?.buenas && (
                <Text style={styles.repDetalleChico}>
                  {reputacion.buenas} de {reputacion.total} con 4 estrellas o más
                </Text>
              )}
            </View>
          </View>

          {resenas.map((r) => (
            <View key={r.id} style={styles.resena}>
              <View style={styles.resenaTop}>
                <Text style={styles.resenaAutor}>{nombresResenas[r.autor] || 'Rider'}</Text>
                <View style={{ flexDirection: 'row' }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <MaterialCommunityIcons
                      key={n}
                      name={n <= r.puntaje ? 'star' : 'star-outline'}
                      size={12}
                      color="#FFB300"
                    />
                  ))}
                </View>
              </View>
              {!!r.comentario && <Text style={styles.resenaTexto}>{r.comentario}</Text>}
            </View>
          ))}
        </View>
      )}

      {/* Favoritos */}
      <View style={styles.bloque}>
        <Text style={styles.seccion}>Mis spots favoritos</Text>
        {favoritos.length === 0 ? (
          <Text style={styles.vacio}>
            Todavía no marcaste ninguno. Abrí un spot en el mapa y tocá la estrella.
          </Text>
        ) : (
          <View style={styles.chips}>
            {favoritos.map((s) => (
              <View key={s.id} style={styles.chip}>
                <MaterialCommunityIcons name="star" size={13} color="#FFCC00" />
                <Text style={styles.chipText}>{s.name}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Historial */}
      <View style={styles.bloque}>
        <Text style={styles.seccion}>Historial de sesiones</Text>
        {sesiones.length === 0 ? (
          <Text style={styles.vacio}>
            Todavía no registraste ninguna sesión. Entrá a la pestaña del kite y tocá "Comenzar sesión".
          </Text>
        ) : (
          <>
            {visibles.map((s) => (
              <TouchableOpacity key={s.id} style={styles.sesion} onLongPress={() => eliminar(s)}>
                <View style={styles.sesionTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sesionSpot}>{s.spotNombre || 'Sesión sin spot'}</Text>
                    <Text style={styles.sesionFecha}>{formatoFecha(s.fecha)}</Text>
                  </View>
                  {s.viento && (
                    <View style={styles.vientoTag}>
                      <MaterialCommunityIcons name="weather-windy" size={12} color={COLORS.primary} />
                      <Text style={styles.vientoTagText}>
                        {s.viento.viento} kt {s.viento.cardinal}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.sesionStats}>
                  <SesionDato valor={formatoDuracion(s.duracionSeg)} label="Tiempo" />
                  <SesionDato valor={`${s.distanciaKm} km`} label="Distancia" />
                  <SesionDato valor={`${s.velMaxKt} kt`} label="Máxima" />
                  {!!s.cantSaltos && <SesionDato valor={`${s.alturaMaxM} m`} label={`${s.cantSaltos} saltos`} />}
                </View>
              </TouchableOpacity>
            ))}
            {sesiones.length > 8 && (
              <TouchableOpacity style={styles.verTodo} onPress={() => setVerTodo(!verTodo)}>
                <Text style={styles.verTodoText}>
                  {verTodo ? 'Ver menos' : `Ver las ${sesiones.length} sesiones`}
                </Text>
              </TouchableOpacity>
            )}
            <Text style={styles.ayuda}>Mantené presionada una sesión para borrarla.</Text>
          </>
        )}
      </View>

      {/* Instructor */}
      <View style={styles.bloque}>
        <Text style={styles.seccion}>¿Das clases?</Text>
        {soyVerificado ? (
          <>
            <View style={styles.verifCaja}>
              <MaterialCommunityIcons name="check-decagram" size={22} color="#0a7d33" />
              <Text style={styles.verifTexto}>
                Sos instructor verificado
                {venceVerificacion
                  ? ` hasta el ${new Date(venceVerificacion).toLocaleDateString('es-AR')}`
                  : ''}
                . Tus avisos aparecen primero en Clases.
              </Text>
            </View>
            <TouchableOpacity style={styles.btnPanel} onPress={() => setPanelInstructor(true)}>
              <MaterialCommunityIcons name="view-dashboard-outline" size={19} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={styles.btnPanelTitulo}>Abrir mi panel</Text>
                <Text style={styles.btnPanelDesc}>Agenda de turnos, alcance e ingresos</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.verCondiciones} onPress={verDescargo}>
              <MaterialCommunityIcons name="file-document-outline" size={15} color={COLORS.subtitle} />
              <Text style={styles.verCondicionesText}>
                Ver las condiciones que aceptaste
                {descargoFecha
                  ? ` · ${new Date(descargoFecha).toLocaleDateString('es-AR')}`
                  : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnBaja} onPress={darDeBaja}>
              <Text style={styles.btnBajaText}>Dar de baja la verificación</Text>
            </TouchableOpacity>
          </>
        ) : pedidos.some((p) => p.tipo === 'instructor') ? (
          <>
            <View style={styles.enEspera}>
              <MaterialCommunityIcons name="clock-outline" size={18} color="#8a5a00" />
              <Text style={styles.enEsperaText}>
                Tu verificación está en revisión. Si ya transferiste, la activamos enseguida.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.btnBaja}
              onPress={() => cancelarPedido(pedidos.find((p) => p.tipo === 'instructor'))}
            >
              <Text style={styles.btnBajaText}>Cancelar el pedido</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.cajaInstructor} onPress={() => setModalInstructor(true)}>
            <MaterialCommunityIcons name="school-outline" size={22} color={COLORS.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cajaTitulo}>Verificate como instructor</Text>
              <Text style={styles.cajaDesc}>
                Agenda de turnos, alcance e ingresos
                {!pruebaUsada ? ' · 2 meses gratis' : ''}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#c9d6e2" />
          </TouchableOpacity>
        )}
      </View>

      {/* Apoyo */}
      <View style={styles.bloque}>
        <TouchableOpacity style={styles.cajaApoyo} onPress={() => setModalApoyo(true)}>
          <View style={styles.apoyoIconoCaja}>
            <Image source={{ uri: PIN_BASE64 }} style={styles.apoyoIcono} resizeMode="contain" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cajaTitulo}>Bancá la app</Text>
            <Text style={styles.cajaDesc}>
              GUSTS es gratis y sin publicidad. Si te sirve, dale una mano.
            </Text>
          </View>
        </TouchableOpacity>
        {perfil.apoyo_total > 0 && (
          <Text style={styles.graciasApoyo}>Ya apoyaste con USD {perfil.apoyo_total}. Gracias.</Text>
        )}
      </View>

      {/* Bloqueados */}
      {misBloqueados.length > 0 && (
        <View style={styles.bloque}>
          <Text style={styles.seccion}>Riders bloqueados</Text>
          {misBloqueados.map((b) => (
            <View key={b.id} style={styles.pedidoFila}>
              <MaterialCommunityIcons name="account-cancel-outline" size={19} color="#8a9aa8" />
              <Text style={[styles.pedidoTitulo, { flex: 1, marginLeft: 9 }]}>
                {b.nombre || 'Rider'}
              </Text>
              <TouchableOpacity onPress={() => quitarBloqueo(b)}>
                <Text style={styles.desbloquear}>Desbloquear</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Pedidos pendientes de apoyo o destacado */}
      {pedidos.filter((p) => p.tipo !== 'instructor').length > 0 && (
        <View style={styles.bloque}>
          <Text style={styles.seccion}>Pedidos sin confirmar</Text>
          {pedidos
            .filter((p) => p.tipo !== 'instructor')
            .map((p) => (
              <View key={p.id} style={styles.pedidoFila}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pedidoTitulo}>
                    {p.tipo === 'apoyo' ? 'Apoyo a la app' : 'Destacar aviso'} · USD {p.monto}
                  </Text>
                  <Text style={styles.pedidoDesc}>Esperando que confirmemos la transferencia</Text>
                </View>
                <TouchableOpacity onPress={() => cancelarPedido(p)} style={{ padding: 6 }}>
                  <MaterialCommunityIcons name="close-circle-outline" size={20} color="#c0392b" />
                </TouchableOpacity>
              </View>
            ))}
          <Text style={styles.pedidoNota}>
            Los apoyos son de una sola vez, no hay nada que se cobre todos los meses.
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.salir}
        onPress={() =>
          Alert.alert('Cerrar sesión', '¿Salís de tu cuenta?', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Salir', style: 'destructive', onPress: () => supabase.auth.signOut() },
          ])
        }
      >
        <MaterialCommunityIcons name="logout" size={17} color="#c0392b" />
        <Text style={styles.salirText}>Cerrar sesión</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.eliminar} onPress={eliminarCuenta}>
        <MaterialCommunityIcons name="account-remove-outline" size={16} color="#8a9aa8" />
        <Text style={styles.eliminarText}>Eliminar mi cuenta</Text>
      </TouchableOpacity>

      <Text style={styles.pie}>
        Tus sesiones y favoritos se guardan en este teléfono. Tu perfil viaja con tu cuenta.
      </Text>

      <View style={styles.creditoBox}>
        <Text style={styles.creditoMarca}>GUSTS · Kitesurf App</Text>
        <Text style={styles.creditoText}>Diseñado y creado por Gestiva</Text>
        <TouchableOpacity
          onPress={() =>
            Linking.openURL('mailto:gestivagestion@gmail.com?subject=GUSTS · Contacto')
          }
        >
          <Text style={styles.creditoMail}>gestivagestion@gmail.com</Text>
        </TouchableOpacity>
      </View>

      {/* Apoyo */}
      <Modal animationType="slide" transparent visible={modalApoyo} onRequestClose={() => setModalApoyo(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Bancá la app</Text>
              <TouchableOpacity onPress={() => setModalApoyo(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.apoyoTexto}>
              GUSTS no tiene publicidad ni vende tus datos. Lo que aporten los que la usan paga
              el servidor y el tiempo de desarrollo. Cualquier monto suma.
            </Text>

            {APOYOS.map((a) => (
              <TouchableOpacity
                key={a.monto}
                style={styles.opcionPago}
                onPress={() => pedir('apoyo', a.monto, null, `apoyar la app (${a.label})`)}
              >
                <Text style={styles.apoyoEmojiChico}>{a.monto === 2 ? '☕' : a.monto === 5 ? '🤝' : '🚀'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.opcionPagoTitulo}>{a.label}</Text>
                  <Text style={styles.opcionPagoDesc}>{a.desc}</Text>
                </View>
                <Text style={styles.opcionPagoMonto}>USD {a.monto}</Text>
              </TouchableOpacity>
            ))}

            <Text style={styles.pagoNota}>
              Se transfiere a {COBRO.alias} ({COBRO.titular}). No hay nada que se desbloquee
              pagando: la app funciona igual apoyes o no.
            </Text>
          </View>
        </View>
      </Modal>

      {/* Verificación de instructor */}
      <Modal animationType="slide" transparent visible={modalInstructor} onRequestClose={() => setModalInstructor(false)}>
        <View style={styles.overlay}>
          <View style={[styles.modal, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Instructor verificado</Text>
              <TouchableOpacity onPress={() => setModalInstructor(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
              {INSTRUCTOR.beneficios.map((b, i) => (
                <View key={i} style={styles.beneficio}>
                  <MaterialCommunityIcons name="check-circle" size={17} color="#34C759" />
                  <Text style={styles.beneficioText}>{b}</Text>
                </View>
              ))}

              {/* Descargo de responsabilidad */}
              <View style={styles.descargoCaja}>
                <View style={styles.descargoTop}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={17} color="#8a5a00" />
                  <Text style={styles.descargoTitulo}>Antes de seguir, leé esto</Text>
                </View>
                {DESCARGO_PUNTOS.map((p, i) => (
                  <View key={i} style={styles.descargoFila}>
                    <Text style={styles.descargoBullet}>·</Text>
                    <Text style={styles.descargoTexto}>{p}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.tildaCaja, tildado && styles.tildaCajaOn]}
                onPress={() => setTildado(!tildado)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name={tildado ? 'checkbox-marked' : 'checkbox-blank-outline'}
                  size={22}
                  color={tildado ? '#0a7d33' : '#8a9aa8'}
                />
                <Text style={[styles.tildaTexto, tildado && { color: '#0a5c26' }]}>
                  Leí y acepto estas condiciones. Entiendo que GUSTS solo conecta y no
                  responde por lo que pase en la clase ni por el pago.
                </Text>
              </TouchableOpacity>

              {descargoOk && !!descargoFecha && (
                <Text style={styles.descargoFecha}>
                  Ya aceptaste estas condiciones el{' '}
                  {new Date(descargoFecha).toLocaleDateString('es-AR')}.
                </Text>
              )}

              {INSTRUCTOR.prueba && !pruebaUsada && (
                <TouchableOpacity
                  style={[styles.opcionPrueba, !tildado && styles.bloqueada]}
                  disabled={!tildado}
                  onPress={() =>
                    pedir('instructor', 0, INSTRUCTOR.diasPrueba, 'verificarme como instructor', true)
                  }
                >
                  <MaterialCommunityIcons name="gift-outline" size={24} color="#0a7d33" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.opcionPruebaTitulo}>
                      {INSTRUCTOR.diasPrueba / 30} meses gratis
                    </Text>
                    <Text style={styles.opcionPagoDesc}>
                      Probalo sin pagar nada. Después seguís si te sirve.
                    </Text>
                  </View>
                  <Text style={styles.gratis}>GRATIS</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.opcionPago, { marginTop: 10 }, !tildado && styles.bloqueada]}
                disabled={!tildado}
                onPress={() => pedir('instructor', INSTRUCTOR.monto, INSTRUCTOR.dias, 'verificarme como instructor')}
              >
                <MaterialCommunityIcons name="check-decagram" size={22} color="#0a7d33" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.opcionPagoTitulo}>{INSTRUCTOR.dias} días</Text>
                  <Text style={styles.opcionPagoDesc}>
                    {pruebaUsada ? 'Renovación mensual' : 'Si preferís arrancar pagando'}
                  </Text>
                </View>
                <Text style={styles.opcionPagoMonto}>USD {INSTRUCTOR.monto}</Text>
              </TouchableOpacity>

              {!tildado && (
                <Text style={styles.avisoTilde}>
                  Marcá la casilla de arriba para poder continuar.
                </Text>
              )}

              <Text style={styles.pagoNota}>
                Antes de activarte podemos pedirte tu certificación o alguna referencia. La insignia
                es para que los alumnos sepan a quién le están escribiendo.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Editar perfil */}
      <Modal animationType="slide" transparent visible={editar} onRequestClose={() => setEditar(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar perfil</Text>
              <TouchableOpacity onPress={() => setEditar(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 7 }}>
              <Text style={styles.label}>Nombre</Text>
              <TextInput
                style={styles.input}
                value={form.nombre}
                onChangeText={(v) => setForm({ ...form, nombre: v })}
                placeholder="Cómo te llamás"
                placeholderTextColor="#aaa"
              />
            </View>

            <View style={{ gap: 7, marginTop: 14 }}>
              <Text style={styles.label}>Nivel</Text>
              <View style={styles.opciones}>
                {NIVELES.map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.opcion, form.nivel === n && styles.opcionOn]}
                    onPress={() => setForm({ ...form, nivel: form.nivel === n ? '' : n })}
                  >
                    <Text style={form.nivel === n ? styles.opcionTextoOn : styles.opcionTexto}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <View style={{ flex: 1, gap: 7 }}>
                <Text style={styles.label}>Peso (kg)</Text>
                <TextInput
                  style={styles.input}
                  value={form.peso}
                  onChangeText={(v) => setForm({ ...form, peso: v })}
                  placeholder="75"
                  placeholderTextColor="#aaa"
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1, gap: 7 }}>
                <Text style={styles.label}>Navega desde</Text>
                <TextInput
                  style={styles.input}
                  value={form.desde}
                  onChangeText={(v) => setForm({ ...form, desde: v })}
                  placeholder="2019"
                  placeholderTextColor="#aaa"
                  keyboardType="numeric"
                />
              </View>
            </View>

            <Text style={styles.ayudaPeso}>
              El peso lo usamos para afinar los tamaños de kite que te sugerimos. Solo lo ves vos.
            </Text>

            <View style={{ gap: 7, marginTop: 14 }}>
              <Text style={styles.label}>Sobre vos</Text>
              <TextInput
                style={[styles.input, { height: 72, textAlignVertical: 'top' }]}
                value={form.bio}
                onChangeText={(v) => setForm({ ...form, bio: v })}
                placeholder="Qué navegás, dónde parás, qué equipo usás..."
                placeholderTextColor="#aaa"
                multiline
              />
            </View>

            <TouchableOpacity style={styles.guardar} onPress={guardarPerfil} disabled={guardandoPerfil}>
              {guardandoPerfil ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.guardarText}>Guardar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function Stat({ valor, label, icono, destacado }) {
  return (
    <View style={[styles.stat, destacado && { backgroundColor: '#fff7ec', borderColor: '#ffdcb8' }]}>
      <MaterialCommunityIcons name={icono} size={19} color={destacado ? COLORS.accent : COLORS.secondary} />
      <Text style={styles.statValor}>{valor}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SesionDato({ valor, label }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={styles.sesionValor}>{valor}</Text>
      <Text style={styles.sesionLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: COLORS.primary, alignItems: 'center', paddingVertical: 30 },
  avatar: {
    width: 78, height: 78, borderRadius: 39, backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImg: { width: 78, height: 78, borderRadius: 39 },
  camara: {
    position: 'absolute', right: -2, bottom: -2, backgroundColor: '#FF9500',
    width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#003D7A',
  },
  nombre: { fontSize: 21, fontWeight: 'bold', color: '#fff', marginTop: 12 },
  subtitulo: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 3 },
  bio: {
    fontSize: 12, color: 'rgba(255,255,255,0.8)', textAlign: 'center',
    marginTop: 8, paddingHorizontal: 34, lineHeight: 17,
  },
  editar: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 16,
    paddingHorizontal: 13, paddingVertical: 6,
  },
  editarText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  bloque: { padding: 16 },
  seccion: { fontSize: 16, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 12 },
  // (el título dentro del panel de moderación reusa este estilo)
  vacio: { fontSize: 12.5, color: COLORS.subtitle, lineHeight: 18 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  stat: {
    width: '31.5%', flexGrow: 1, backgroundColor: '#fff', borderRadius: 11,
    paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: '#e8eef4',
  },
  statValor: { fontSize: 19, fontWeight: 'bold', color: '#1a1a1a', marginTop: 5 },
  statLabel: { fontSize: 9.5, color: '#999', marginTop: 2, textAlign: 'center', paddingHorizontal: 4 },

  record: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff7ec',
    borderRadius: 10, padding: 11, marginTop: 12, borderWidth: 1, borderColor: '#ffdcb8',
  },
  recordText: { flex: 1, fontSize: 12, color: '#8a5a00', lineHeight: 17 },

  modHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  modBadge: {
    backgroundColor: '#FF9500', minWidth: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  modBadgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  propuesta: {
    backgroundColor: '#fff', borderRadius: 11, padding: 13, marginBottom: 9,
    borderLeftWidth: 4, borderLeftColor: '#FF9500', elevation: 1,
  },
  propNombre: { fontSize: 14.5, fontWeight: 'bold', color: '#1a1a1a' },
  propMeta: { fontSize: 11, color: COLORS.subtitle, marginTop: 3 },
  propDesc: { fontSize: 12, color: '#333', marginTop: 6, lineHeight: 17 },
  propAcciones: { flexDirection: 'row', gap: 8, marginTop: 11 },
  propBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 9, borderRadius: 8,
  },
  propBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12.5 },

  btnPanel: {
    flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: COLORS.primary,
    borderRadius: 12, padding: 14, marginTop: 9,
  },
  btnPanelTitulo: { fontSize: 14.5, fontWeight: 'bold', color: '#fff' },
  btnPanelDesc: { fontSize: 11.5, color: 'rgba(255,255,255,0.8)', marginTop: 2 },

  btnBaja: {
    alignItems: 'center', paddingVertical: 11, marginTop: 8, borderRadius: 10,
    backgroundColor: '#f5f7fa', borderWidth: 1, borderColor: '#e3ebf2',
  },
  btnBajaText: { fontSize: 12.5, fontWeight: '600', color: COLORS.subtitle },

  verCondiciones: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, marginTop: 6,
  },
  verCondicionesText: { fontSize: 11.5, color: COLORS.subtitle, textDecorationLine: 'underline' },

  descargoCaja: {
    backgroundColor: '#fff8e6', borderRadius: 11, padding: 13, marginTop: 6,
    borderWidth: 1, borderColor: '#ffe0a3',
  },
  descargoTop: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 9 },
  descargoTitulo: { fontSize: 13.5, fontWeight: 'bold', color: '#8a5a00' },
  descargoFila: { flexDirection: 'row', gap: 7, marginBottom: 7 },
  descargoBullet: { fontSize: 13, color: '#8a5a00', lineHeight: 17 },
  descargoTexto: { flex: 1, fontSize: 11.5, color: '#6b4a10', lineHeight: 17 },
  descargoFecha: {
    fontSize: 10.5, color: '#0a7d33', fontStyle: 'italic', marginTop: 8, textAlign: 'center',
  },

  tildaCaja: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#f5f7fa',
    borderRadius: 11, padding: 13, marginTop: 11, marginBottom: 4,
    borderWidth: 1.5, borderColor: '#e3ebf2',
  },
  tildaCajaOn: { backgroundColor: '#e9f7ee', borderColor: '#8fd3a8' },
  tildaTexto: { flex: 1, fontSize: 12, color: '#444', lineHeight: 17 },
  bloqueada: { opacity: 0.4 },
  avisoTilde: {
    fontSize: 11, color: '#c0392b', textAlign: 'center', marginTop: 9, fontWeight: '600',
  },

  pedidoFila: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#ffe0a3',
  },
  pedidoTitulo: { fontSize: 13.5, fontWeight: 'bold', color: '#1a1a1a' },
  pedidoDesc: { fontSize: 11, color: COLORS.subtitle, marginTop: 2 },
  tocarPara: { fontSize: 10.5, color: '#c0392b', fontWeight: '600', marginTop: 8 },
  desbloquear: { fontSize: 12.5, fontWeight: 'bold', color: COLORS.primary },
  pedidoNota: { fontSize: 10.5, color: '#8a9aa8', fontStyle: 'italic', lineHeight: 15 },

  eliminar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginHorizontal: 16, marginBottom: 10, paddingVertical: 11,
  },
  eliminarText: { fontSize: 12.5, color: '#8a9aa8', textDecorationLine: 'underline' },

  cajaInstructor: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff',
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e8eef4',
  },
  cajaApoyo: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff8e6',
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#ffe0a3',
  },
  apoyoIconoCaja: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#ffe0a3',
  },
  apoyoIcono: { width: 27, height: 21 },
  apoyoEmojiChico: { fontSize: 22 },
  cajaTitulo: { fontSize: 14.5, fontWeight: 'bold', color: '#1a1a1a' },
  cajaDesc: { fontSize: 11.5, color: COLORS.subtitle, marginTop: 2, lineHeight: 16 },
  graciasApoyo: { fontSize: 11, color: '#8a5a00', marginTop: 8, textAlign: 'center', fontStyle: 'italic' },
  verifCaja: {
    flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#e9f7ee',
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#b8e2c6',
  },
  verifTexto: { flex: 1, fontSize: 12.5, color: '#0a5c26', lineHeight: 17 },
  enEspera: {
    flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#fff6ec',
    borderRadius: 12, padding: 13, borderWidth: 1, borderColor: '#ffdcb8',
  },
  enEsperaText: { flex: 1, fontSize: 12, color: '#8a5a00', lineHeight: 17 },

  opcionPrueba: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#e9f7ee',
    borderRadius: 11, padding: 14, borderWidth: 1.5, borderColor: '#8fd3a8',
  },
  opcionPruebaTitulo: { fontSize: 15, fontWeight: 'bold', color: '#0a5c26' },
  gratis: { fontSize: 13, fontWeight: 'bold', color: '#0a7d33', letterSpacing: 0.5 },

  apoyoTexto: { fontSize: 13, color: '#444', lineHeight: 19, marginBottom: 14 },
  opcionPago: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff',
    borderRadius: 11, padding: 14, marginBottom: 9, borderWidth: 1.5, borderColor: '#e8eef4',
  },
  opcionPagoTitulo: { fontSize: 14.5, fontWeight: 'bold', color: '#1a1a1a' },
  opcionPagoDesc: { fontSize: 11.5, color: COLORS.subtitle, marginTop: 2 },
  opcionPagoMonto: { fontSize: 16, fontWeight: 'bold', color: COLORS.primary },
  pagoNota: { fontSize: 10.5, color: '#8a9aa8', lineHeight: 15, fontStyle: 'italic', marginTop: 4 },
  beneficio: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginBottom: 9 },
  beneficioText: { flex: 1, fontSize: 13, color: '#333', lineHeight: 18 },

  repCabecera: {
    flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff',
    borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e8eef4',
  },
  repNumero: { alignItems: 'center' },
  repPromedio: { fontSize: 30, fontWeight: 'bold', color: '#8a5a00' },
  repDetalle: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
  repDetalleChico: { fontSize: 11, color: COLORS.subtitle, marginTop: 2 },
  resena: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8,
    borderLeftWidth: 3, borderLeftColor: '#FFB300',
  },
  resenaTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resenaAutor: { fontSize: 13, fontWeight: 'bold', color: '#1a1a1a' },
  resenaTexto: { fontSize: 12.5, color: '#444', marginTop: 5, lineHeight: 17 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff',
    borderRadius: 16, paddingHorizontal: 11, paddingVertical: 7,
    borderWidth: 1, borderColor: '#e8eef4',
  },
  chipText: { fontSize: 12, fontWeight: '600', color: '#1a1a1a' },

  sesion: { backgroundColor: '#fff', borderRadius: 11, padding: 13, marginBottom: 9, elevation: 1 },
  sesionTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  sesionSpot: { fontSize: 14, fontWeight: 'bold', color: '#1a1a1a' },
  sesionFecha: { fontSize: 11, color: COLORS.subtitle, marginTop: 2 },
  vientoTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#eef4fa',
    borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4,
  },
  vientoTagText: { fontSize: 10.5, fontWeight: '600', color: COLORS.primary },
  sesionStats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#f0f4f8', paddingTop: 9 },
  sesionValor: { fontSize: 14, fontWeight: 'bold', color: '#1a1a1a' },
  sesionLabel: { fontSize: 10, color: '#999', marginTop: 1 },

  verTodo: { alignItems: 'center', paddingVertical: 10 },
  verTodoText: { fontSize: 12.5, fontWeight: 'bold', color: COLORS.primary },
  ayuda: { fontSize: 10.5, color: '#8a9aa8', textAlign: 'center', fontStyle: 'italic' },
  salir: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    marginHorizontal: 16, marginBottom: 18, paddingVertical: 13, borderRadius: 10,
    backgroundColor: '#fdf0ee', borderWidth: 1, borderColor: '#f5c6c0',
  },
  salirText: { fontSize: 13.5, fontWeight: 'bold', color: '#c0392b' },
  pie: { fontSize: 11, color: '#8a9aa8', textAlign: 'center', paddingHorizontal: 24, lineHeight: 16 },

  creditoBox: { alignItems: 'center', paddingTop: 24, paddingBottom: 34 },
  creditoMarca: { fontSize: 11, fontWeight: 'bold', color: '#b0bcc7', letterSpacing: 1 },
  creditoText: { fontSize: 10.5, color: '#b0bcc7', marginTop: 5 },
  creditoMail: { fontSize: 10.5, color: '#8fa8bd', marginTop: 3, textDecorationLine: 'underline' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 18, paddingHorizontal: 16, paddingBottom: 28,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 19, fontWeight: 'bold', color: COLORS.primary },
  label: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
  input: {
    backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#dde6ee', fontSize: 14, color: '#000',
  },
  opciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  opcion: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0',
  },
  opcionOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  opcionTexto: { fontSize: 12, fontWeight: '600', color: COLORS.subtitle },
  opcionTextoOn: { fontSize: 12, fontWeight: '600', color: '#fff' },
  ayudaPeso: { fontSize: 10.5, color: '#8a9aa8', fontStyle: 'italic', marginTop: 8 },
  guardar: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 9, alignItems: 'center', marginTop: 18 },
  guardarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
