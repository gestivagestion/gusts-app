import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal,
  TextInput, Image, Alert, Share, Linking, ActivityIndicator, RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';

import { supabase, mensajeDeError } from './supabaseClient';

import { SPOTS } from './spots';
import { SALE_BASE64 } from './logo';
import { COBRO, DESTACADOS, textoPago } from './precios';
import { DenunciaModal, confirmarBloqueo, getBloqueados } from './moderacion';

const COLORS = {
  primary: '#003D7A',
  secondary: '#00BCD4',
  accent: '#FF9500',
  light: '#f5f9fc',
  subtitle: '#666',
};

// ------------------------------------------------------------
// Categorías del mercado
// ------------------------------------------------------------
const TIPOS = [
  { id: 'equipo', label: 'Equipo', icon: 'tag-outline', color: '#FF9500',
    titulo: 'Compra y venta', sub: 'Equipo usado entre riders' },
  { id: 'alojamiento', label: 'Alojamiento', icon: 'home-outline', color: '#00BCD4',
    titulo: 'Alojamiento', sub: 'Casas, deptos y cuartos cerca del agua' },
  { id: 'viaje', label: 'Viajes', icon: 'car-outline', color: '#34C759',
    titulo: 'Compartir viaje', sub: 'Sumate a un auto y compartan la nafta' },
  { id: 'instructor', label: 'Clases', icon: 'school-outline', color: '#7B5BD6',
    titulo: 'Instructores', sub: 'Clases y acompañamiento en el agua' },
  { id: 'perdido', label: 'Perdidos', icon: 'archive-search-outline', color: '#E91E63',
    titulo: 'Perdidos y encontrados', sub: 'Equipo que se voló, se olvidó o apareció' },
];

// ------------------------------------------------------------
// Campos del formulario según la categoría
// tipo: 'texto' | 'numero' | 'opciones' | 'spot' | 'largo'
// ------------------------------------------------------------
const CAMPOS = {
  equipo: [
    { k: 'titulo', label: '¿Qué vendés?', ph: 'Cometa Cabrinha 12m 2023', req: true },
    { k: 'precio', label: 'Precio', ph: '$450.000 o USD 700', req: true },
    { k: 'estado', label: 'Estado', tipo: 'opciones',
      opciones: ['Nuevo', 'Como nuevo', 'Usado', 'Para reparar'] },
    { k: 'zona', label: 'Zona / ciudad', ph: 'San Isidro, Buenos Aires', req: true },
    { k: 'detalle', label: 'Detalle', tipo: 'largo',
      ph: 'Año, cantidad de uso, si incluye barra, reparaciones...' },
  ],
  alojamiento: [
    { k: 'titulo', label: 'Título', ph: 'Depto 2 amb a 200m del lanzamiento', req: true },
    { k: 'precio', label: 'Precio por noche', ph: '$35.000 la noche', req: true },
    { k: 'spot', label: 'Spot más cercano', tipo: 'spot', req: true },
    { k: 'capacidad', label: 'Capacidad', tipo: 'opciones',
      opciones: ['1-2 personas', '3-4 personas', '5-6 personas', '7 o más'] },
    { k: 'estado', label: 'Tipo', tipo: 'opciones',
      opciones: ['Casa', 'Departamento', 'Cuarto', 'Camping / motorhome'] },
    { k: 'detalle', label: 'Detalle', tipo: 'largo',
      ph: 'Guardado para el equipo, ducha exterior, cochera, mínimo de noches...' },
  ],
  viaje: [
    { k: 'titulo', label: 'Desde dónde salís', ph: 'Salgo de Ezeiza', req: true },
    { k: 'spot', label: 'A qué spot vas', tipo: 'spot', req: true },
    { k: 'fecha', label: 'Cuándo', ph: 'Sáb 14/06, salgo 6:30 am', req: true },
    { k: 'capacidad', label: 'Lugares libres', tipo: 'opciones',
      opciones: ['1 lugar', '2 lugares', '3 lugares', '4 o más'] },
    { k: 'precio', label: 'Aporte por persona', ph: 'Nafta y peaje a dividir' },
    { k: 'detalle', label: 'Detalle', tipo: 'largo',
      ph: 'Cuánto equipo entra, si volvés el mismo día, portaequipaje...' },
  ],
  perdido: [
    { k: 'estado', label: '¿Qué pasó?', tipo: 'opciones',
      opciones: ['Lo perdí', 'Lo encontré'] },
    { k: 'titulo', label: '¿Qué es?', ph: 'Cometa Duotone 9m roja con barra', req: true },
    { k: 'spot', label: '¿En qué spot?', tipo: 'spot', req: true },
    { k: 'fecha', label: '¿Cuándo?', ph: 'Sábado 14/06 a la tarde', req: true },
    { k: 'detalle', label: 'Detalle', tipo: 'largo',
      ph: 'Marca, color, señas particulares, si tiene el nombre escrito, dónde exactamente...' },
  ],
  instructor: [
    { k: 'titulo', label: 'Tu nombre o escuela', ph: 'Leandro — Clases de kite', req: true },
    { k: 'spot', label: 'Dónde das clases', tipo: 'spot', req: true },
    { k: 'precio', label: 'Precio', ph: '$40.000 la hora / $150.000 el curso', req: true },
    { k: 'estado', label: 'Certificación', tipo: 'opciones',
      opciones: ['IKO', 'VDWS', 'Otra', 'Sin certificación'] },
    { k: 'capacidad', label: 'Nivel que enseñás', tipo: 'opciones',
      opciones: ['Desde cero', 'Principiante', 'Intermedio', 'Todos los niveles'] },
    { k: 'detalle', label: 'Detalle', tipo: 'largo',
      ph: 'Años de experiencia, si incluís el equipo, seguro, idiomas...' },
  ],
};

const vacio = {
  titulo: '', precio: '', estado: '', zona: '', spot: '',
  capacidad: '', fecha: '', detalle: '', autor: '', contacto: '',
};

export default function MarketScreen() {
  const [tipo, setTipo] = useState('equipo');
  const [items, setItems] = useState([]);
  const [yo, setYo] = useState(null);
  const [soyInstructor, setSoyInstructor] = useState(false);
  const [nombres, setNombres] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [reputacion, setReputacion] = useState({});
  const [contactadas, setContactadas] = useState([]);
  const [calificadas, setCalificadas] = useState([]);
  const [calificando, setCalificando] = useState(null);
  const [puntaje, setPuntaje] = useState(0);
  const [comentario, setComentario] = useState('');
  const [fotos, setFotos] = useState([]);
  const [subiendo, setSubiendo] = useState(false);
  const [destacando, setDestacando] = useState(null);
  const [verificados, setVerificados] = useState([]);
  const [bloqueados, setBloqueados] = useState([]);
  const [denunciando, setDenunciando] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(vacio);
  const [buscaSpot, setBuscaSpot] = useState('');

  const cat = TIPOS.find((t) => t.id === tipo);
  const campos = CAMPOS[tipo];
  const visibles = items.filter((i) => i.tipo === tipo && !bloqueados.includes(i.autor));

  const cargar = async () => {
    setCargando(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    setYo(uid);

    // ¿este usuario está habilitado para publicar clases?
    if (uid) {
      const { data: miPerfil } = await supabase
        .from('profiles')
        .select('es_instructor')
        .eq('id', uid)
        .maybeSingle();
      setSoyInstructor(!!miPerfil?.es_instructor);
    }

    const bloq = await getBloqueados();
    setBloqueados(bloq);

    const { data, error } = await supabase
      .from('publicaciones')
      .select('*')
      .eq('activa', true)
      .order('destacada_hasta', { ascending: false, nullsFirst: false })
      .order('creado_en', { ascending: false })
      .limit(200);

    if (!error && data) {
      setItems(data);
      const autores = [...new Set(data.map((d) => d.autor))];
      if (autores.length) {
        const { data: perf } = await supabase
          .from('profiles')
          .select('id, nombre, verificado, verificado_hasta')
          .in('id', autores);
        const mapa = {};
        const verif = [];
        (perf || []).forEach((p) => {
          mapa[p.id] = p.nombre || 'Rider';
          if (p.verificado && (!p.verificado_hasta || new Date(p.verificado_hasta) > new Date())) {
            verif.push(p.id);
          }
        });
        setNombres(mapa);
        setVerificados(verif);

        const { data: rep } = await supabase.from('reputacion').select('*').in('usuario', autores);
        const mapaRep = {};
        (rep || []).forEach((r) => (mapaRep[r.usuario] = r));
        setReputacion(mapaRep);
      }

      // registramos una vista por persona y aviso (para el alcance del instructor)
      if (uid) {
        const ajenos = data.filter((d) => d.autor !== uid).map((d) => ({
          publicacion_id: d.id,
          usuario: uid,
        }));
        if (ajenos.length) {
          supabase.from('vistas').upsert(ajenos, { onConflict: 'publicacion_id,usuario', ignoreDuplicates: true })
            .then(() => {})
            .catch(() => {});
        }
      }

      if (uid) {
        const [{ data: cont }, { data: cal }] = await Promise.all([
          supabase.from('contactos').select('publicacion_id').eq('usuario', uid),
          supabase.from('calificaciones').select('publicacion_id').eq('autor', uid),
        ]);
        setContactadas((cont || []).map((c) => c.publicacion_id));
        setCalificadas((cal || []).map((c) => c.publicacion_id));
      }
    }
    setCargando(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  const MAX_FOTOS = 3;

  const agregarFoto = async () => {
    if (fotos.length >= MAX_FOTOS) {
      Alert.alert('Máximo alcanzado', `Podés subir hasta ${MAX_FOTOS} fotos.`);
      return;
    }
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert('Sin permiso', 'Necesitamos acceso a tus fotos.');
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });
    if (r.canceled || !r.assets?.[0]?.uri) return;

    setSubiendo(true);
    try {
      // 900px de ancho alcanza para verse bien y pesa poco
      const chica = await ImageManipulator.manipulateAsync(
        r.assets[0].uri,
        [{ resize: { width: 900 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      const ruta = `${yo}/${Date.now()}_${fotos.length}.jpg`;
      const { error } = await supabase.storage
        .from('publicaciones')
        .upload(ruta, decode(chica.base64), { contentType: 'image/jpeg' });
      if (error) throw error;

      const { data: pub } = supabase.storage.from('publicaciones').getPublicUrl(ruta);
      setFotos((f) => [...f, pub.publicUrl]);
    } catch (e) {
      Alert.alert('No se pudo subir la foto', e.message || 'Probá de nuevo.');
    } finally {
      setSubiendo(false);
    }
  };

  const quitarFoto = (url) => setFotos((f) => f.filter((x) => x !== url));

  // ------------------------------------------------------------
  // Control de instructor
  // ------------------------------------------------------------
  const avisoInstructor = () => {
    Alert.alert(
      'Solo para instructores verificados',
      'Para publicar clases necesitás estar verificado como instructor.\n\n' +
        'Escribinos a hola@gustskite.com contándonos dónde das clases, tu certificación y ' +
        'años de experiencia. Revisamos el pedido y te habilitamos la categoría.',
      [
        { text: 'Ahora no', style: 'cancel' },
        {
          text: 'Escribir',
          onPress: () =>
            Linking.openURL(
              'mailto:hola@gustskite.com?subject=' +
                encodeURIComponent('Quiero publicar clases en GUSTS')
            ).catch(() => {}),
        },
      ]
    );
  };

  const abrirFormulario = () => {
    if (tipo === 'instructor' && !soyInstructor) {
      avisoInstructor();
      return;
    }
    setModal(true);
  };

  const publicar = async () => {
    if (tipo === 'instructor' && !soyInstructor) {
      avisoInstructor();
      return;
    }
    const faltan = campos.filter((c) => c.req && !form[c.k].trim());
    if (faltan.length) {
      Alert.alert('Faltan datos', `Completá: ${faltan.map((f) => f.label).join(', ')}`);
      return;
    }
    if (!form.contacto.trim()) {
      Alert.alert('Falta el contacto', 'Poné un WhatsApp o un mail para que te puedan escribir.');
      return;
    }
    setGuardando(true);
    const { data: nueva, error } = await supabase
      .from('publicaciones')
      .insert({
        autor: yo,
        tipo,
        titulo: form.titulo.trim(),
        precio: form.precio.trim() || null,
        zona: form.zona.trim() || null,
        spot: form.spot || null,
        fecha: form.fecha.trim() || null,
        capacidad: form.capacidad || null,
        estado: form.estado || null,
        detalle: form.detalle.trim() || null,
        fotos,
      })
      .select()
      .single();
    setGuardando(false);

    if (error) {
      // el CHECK de la base también frena esto; mostramos algo entendible
      const msg = String(error.message || '');
      if (msg.includes('solo_instructores') || msg.includes('puede_publicar_clases')) {
        setModal(false);
        avisoInstructor();
        return;
      }
      Alert.alert('No se pudo publicar', mensajeDeError(error));
      return;
    }

    // el teléfono va aparte: no se puede leer sin tocar "Contactar"
    await supabase
      .from('contactos_privados')
      .insert({ publicacion_id: nueva.id, contacto: form.contacto.trim() });
    setForm(vacio);
    setFotos([]);
    setBuscaSpot('');
    setModal(false);
    cargar();
  };

  const borrar = (item) => {
    Alert.alert('Borrar publicación', `¿Eliminar "${item.titulo}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('publicaciones').delete().eq('id', item.id);
          if (error) Alert.alert('No se pudo borrar', mensajeDeError(error));
          else cargar();
        },
      },
    ]);
  };

  const diasRestantes = (item) => {
    if (!item.vence_el) return null;
    return Math.ceil((new Date(item.vence_el) - new Date()) / 86400000);
  };

  const renovar = async (item) => {
    const { error } = await supabase.rpc('renovar_publicacion', { pid: item.id });
    if (error) {
      Alert.alert('No se pudo renovar', mensajeDeError(error));
      return;
    }
    Alert.alert('Renovada', `Tu publicación vuelve a estar activa por ${tipo === 'alojamiento' ? 60 : 30} días.`);
    cargar();
  };

  const estaDestacada = (item) =>
    item.destacada_hasta && new Date(item.destacada_hasta) > new Date();

  const pedirDestacar = async (opcion) => {
    const { error } = await supabase.from('solicitudes').insert({
      usuario: yo,
      tipo: 'destacar',
      publicacion_id: destacando.id,
      monto: opcion.monto,
      dias: opcion.dias,
    });
    if (error) {
      Alert.alert('No se pudo registrar', mensajeDeError(error));
      return;
    }
    const cuerpo = encodeURIComponent(
      textoPago(`destacar mi aviso "${destacando.titulo}" por ${opcion.label}`, opcion.monto)
    );
    setDestacando(null);
    Alert.alert(
      'Pedido registrado',
      `Transferí USD ${opcion.monto} a ${COBRO.alias} y mandanos el comprobante. Lo activamos apenas lo veamos.`,
      [
        { text: 'Después', style: 'cancel' },
        {
          text: 'Mandar comprobante',
          onPress: () =>
            Linking.openURL(
              `mailto:${COBRO.mail}?subject=${encodeURIComponent('Destacar aviso en GUSTS')}&body=${cuerpo}`
            ).catch(() => {}),
        },
      ]
    );
  };

  const enviarCalificacion = async () => {
    if (!puntaje) {
      Alert.alert('Falta la puntuación', 'Elegí de 1 a 5 estrellas.');
      return;
    }
    setGuardando(true);
    const { error } = await supabase.from('calificaciones').insert({
      publicacion_id: calificando.id,
      autor: yo,
      calificado: calificando.autor,
      puntaje,
      comentario: comentario.trim() || null,
    });
    setGuardando(false);

    if (error) {
      Alert.alert(
        'No se pudo calificar',
        error.message.includes('duplicate')
          ? 'Ya calificaste esta publicación.'
          : 'Solo podés calificar si contactaste al que publicó.'
      );
      return;
    }
    setCalificadas((c) => [...c, calificando.id]);
    setCalificando(null);
    setPuntaje(0);
    setComentario('');
    cargar();
  };

  const textoItem = (item) => {
    const c = TIPOS.find((t) => t.id === item.tipo);
    let t =
      item.tipo === 'perdido'
        ? `${item.estado === 'Lo encontré' ? '🔎 APARECIÓ' : '⚠️ SE PERDIÓ'} · ${item.titulo}\n`
        : `${c.label.toUpperCase()} · ${item.titulo}\n`;
    if (item.precio) t += `💵 ${item.precio}\n`;
    if (item.spot) t += `📍 ${item.spot}\n`;
    if (item.fecha) t += `🗓 ${item.fecha}\n`;
    if (item.zona) t += `📍 ${item.zona}\n`;
    if (item.capacidad) t += `👥 ${item.capacidad}\n`;
    if (item.estado) t += `🏷 ${item.estado}\n`;
    if (item.detalle) t += `\n${item.detalle}\n`;
    if (item.autor) t += `\nPublica: ${nombres[item.autor] || 'Un rider'}`;
    return t + `\n\nVisto en GUSTS · Kitesurf App`;
  };

  const compartir = async (item) => {
    try {
      await Share.share({ message: textoItem(item) });
    } catch (e) {
      console.log(e);
    }
  };

  const contactar = async (item) => {
    // la función devuelve el contacto y deja registrado el pedido
    const { data, error } = await supabase.rpc('ver_contacto', { pid: item.id });
    if (error || !data) {
      Alert.alert('No se pudo obtener el contacto', error?.message || 'Probá de nuevo.');
      return;
    }
    if (item.autor !== yo && !contactadas.includes(item.id)) {
      setContactadas((c) => [...c, item.id]);
    }

    const c = String(data).trim();
    if (c.includes('@')) {
      Linking.openURL(`mailto:${c}?subject=${encodeURIComponent('Consulta por: ' + item.titulo)}`)
        .catch(() => Alert.alert('Sin app de mail', 'No se pudo abrir el correo.'));
      return;
    }
    const num = c.replace(/\D/g, '');
    if (num.length < 8) {
      Alert.alert('Contacto', c);
      return;
    }
    const msg = encodeURIComponent(`Hola! Te escribo por "${item.titulo}" que vi en GUSTS.`);
    Linking.openURL(`https://wa.me/${num}?text=${msg}`)
      .catch(() => Alert.alert('Contacto', c));
  };

  // sugerencias de spots para el campo tipo 'spot'
  const sugerencias = buscaSpot.length < 2 ? [] :
    SPOTS.filter((s) =>
      (s.name + ' ' + s.region).toLowerCase().includes(buscaSpot.toLowerCase())
    ).slice(0, 6);

  if (cargando) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.light }}>
      {/* Selector de categoría */}
      <View style={styles.tabsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContent}>
          {TIPOS.map((t) => {
            const activa = t.id === tipo;
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.catChip, activa && { backgroundColor: t.color, borderColor: t.color }]}
                onPress={() => setTipo(t.id)}
              >
                <MaterialCommunityIcons name={t.icon} size={16} color={activa ? '#fff' : t.color} />
                <Text style={[styles.catText, activa && { color: '#fff' }]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 90 }}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={COLORS.primary} />}
      >
        {/* Encabezado */}
        <View style={[styles.header, { backgroundColor: cat.id === 'equipo' ? COLORS.primary : cat.color }]}>
          {cat.id === 'equipo' ? (
            <Image source={{ uri: SALE_BASE64 }} style={styles.headerIcon} resizeMode="contain" />
          ) : (
            <View style={styles.headerIconBox}>
              <MaterialCommunityIcons name={cat.icon} size={26} color="#fff" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{cat.titulo}</Text>
            <Text style={styles.headerSub}>{cat.sub}</Text>
          </View>
        </View>

        {tipo === 'instructor' && !soyInstructor && (
          <View style={styles.avisoInstructor}>
            <MaterialCommunityIcons name="school-outline" size={16} color="#4a3a8a" />
            <Text style={styles.avisoInstructorText}>
              Esta categoría es solo para instructores verificados: revisamos a mano quién
              enseña para que nadie dé clases sin respaldo. ¿Sos instructor? Escribinos a
              hola@gustskite.com y te habilitamos.
            </Text>
          </View>
        )}

        {tipo === 'instructor' && soyInstructor && (
          <View style={styles.avisoInstructorOk}>
            <MaterialCommunityIcons name="check-decagram" size={16} color="#0a7d33" />
            <Text style={styles.avisoInstructorOkText}>
              Estás habilitado para publicar clases. Recordá que GUSTS solo conecta: el
              acuerdo y el pago son entre vos y el alumno.
            </Text>
          </View>
        )}

        {tipo === 'perdido' && (
          <View style={styles.avisoPerdidos}>
            <MaterialCommunityIcons name="information-outline" size={16} color="#8a2a52" />
            <Text style={styles.avisoPerdidosText}>
              Si encontraste algo, no publiques todas las señas: guardate un detalle para
              confirmar que quien reclama es el dueño.
            </Text>
          </View>
        )}

        {visibles.length === 0 && (
          <View style={styles.vacio}>
            <MaterialCommunityIcons name={cat.icon} size={54} color="#c9d6e2" />
            <Text style={styles.vacioTitulo}>Todavía no hay publicaciones</Text>
            <Text style={styles.vacioTexto}>
              {tipo === 'instructor' && !soyInstructor
                ? 'Cuando haya instructores verificados los vas a ver acá.'
                : 'Tocá el botón de abajo para publicar la primera.'}
            </Text>
          </View>
        )}

        {visibles.map((item) => (
          <View key={item.id} style={[styles.card, { borderLeftColor: cat.color }]}>
            {estaDestacada(item) && (
              <View style={styles.cintaDestacado}>
                <MaterialCommunityIcons name="star-four-points" size={12} color="#8a5a00" />
                <Text style={styles.cintaTexto}>DESTACADO</Text>
              </View>
            )}

            <View style={styles.cardTop}>
              <Text style={styles.cardTitle}>{item.titulo}</Text>
              {item.autor === yo ? (
                <TouchableOpacity onPress={() => borrar(item)} style={{ padding: 4 }}>
                  <MaterialCommunityIcons name="trash-can-outline" size={19} color="#c0392b" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={{ padding: 4 }}
                  onPress={() =>
                    Alert.alert(item.titulo, '¿Qué querés hacer?', [
                      { text: 'Cancelar', style: 'cancel' },
                      {
                        text: 'Denunciar aviso',
                        onPress: () =>
                          setDenunciando({
                            usuario: item.autor,
                            publicacion: item.id,
                            descripcion: item.titulo,
                          }),
                      },
                      {
                        text: 'Bloquear a quien publica',
                        style: 'destructive',
                        onPress: () =>
                          confirmarBloqueo(
                            { id: item.autor, nombre: nombres[item.autor] },
                            setBloqueados
                          ),
                      },
                    ])
                  }
                >
                  <MaterialCommunityIcons name="dots-vertical" size={19} color="#b6c3ce" />
                </TouchableOpacity>
              )}
            </View>

            {!!item.fotos?.length && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 7, marginTop: 9 }}
              >
                {item.fotos.map((u, i) => (
                  <Image key={i} source={{ uri: u }} style={styles.fotoAviso} />
                ))}
              </ScrollView>
            )}

            {item.tipo === 'perdido' && !!item.estado && (
              <View
                style={[
                  styles.perdidoBadge,
                  { backgroundColor: item.estado === 'Lo encontré' ? '#34C759' : '#E91E63' },
                ]}
              >
                <MaterialCommunityIcons
                  name={item.estado === 'Lo encontré' ? 'hand-heart-outline' : 'alert-outline'}
                  size={12}
                  color="#fff"
                />
                <Text style={styles.perdidoBadgeText}>
                  {item.estado === 'Lo encontré' ? 'APARECIÓ' : 'SE PERDIÓ'}
                </Text>
              </View>
            )}

            {!!item.precio && <Text style={[styles.precio, { color: cat.color }]}>{item.precio}</Text>}

            <View style={styles.metaRow}>
              {!!item.spot && <Meta icon="map-marker" text={item.spot} />}
              {!!item.zona && <Meta icon="map-marker" text={item.zona} />}
              {!!item.fecha && <Meta icon="calendar" text={item.fecha} />}
              {!!item.capacidad && <Meta icon="account-group" text={item.capacidad} />}
              {!!item.estado && item.tipo !== 'perdido' && <Meta icon="tag" text={item.estado} />}
            </View>

            {!!item.detalle && <Text style={styles.detalle}>{item.detalle}</Text>}

            {item.tipo === 'instructor' && (
              <Text style={styles.notaClases}>
                Las clases se acuerdan y se pagan directamente con el instructor. GUSTS no
                participa del pago ni responde por lo que ocurra durante la clase.
              </Text>
            )}

            <View style={styles.autorFila}>
              <Text style={styles.autorLinea}>
                {item.autor === yo ? 'Publicaste vos' : `Publica ${nombres[item.autor] || 'un rider'}`}
              </Text>
              {verificados.includes(item.autor) && (
                <View style={styles.verifChip}>
                  <MaterialCommunityIcons name="check-decagram" size={12} color="#0a7d33" />
                  <Text style={styles.verifTexto}>Verificado</Text>
                </View>
              )}
              {reputacion[item.autor] ? (
                <View style={styles.repChip}>
                  <MaterialCommunityIcons name="star" size={12} color="#FFB300" />
                  <Text style={styles.repTexto}>
                    {reputacion[item.autor].promedio} ({reputacion[item.autor].total})
                  </Text>
                </View>
              ) : (
                item.autor !== yo && <Text style={styles.sinRep}>sin calificaciones</Text>
              )}
            </View>

            <View style={styles.acciones}>
              <TouchableOpacity style={[styles.btn, { backgroundColor: cat.color }]} onPress={() => contactar(item)}>
                <MaterialCommunityIcons name="message-text-outline" size={17} color="#fff" />
                <Text style={styles.btnText}>Contactar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnGhost} onPress={() => compartir(item)}>
                <MaterialCommunityIcons name="share-variant" size={17} color={COLORS.primary} />
                <Text style={styles.btnGhostText}>Compartir</Text>
              </TouchableOpacity>
            </View>

            {(() => {
              const d = diasRestantes(item);
              if (d === null) return null;
              if (item.autor === yo) {
                return (
                  <View style={styles.vencRow}>
                    <Text style={[styles.vencText, d <= 0 && { color: '#c0392b' }, d > 0 && d <= 7 && { color: '#8a5a00' }]}>
                      {d <= 0 ? 'Venció' : d === 1 ? 'Vence mañana' : `Vence en ${d} días`}
                    </Text>
                    {!estaDestacada(item) && (
                      <TouchableOpacity style={styles.btnDestacar} onPress={() => setDestacando(item)}>
                        <MaterialCommunityIcons name="star-four-points-outline" size={13} color="#8a5a00" />
                        <Text style={styles.btnDestacarText}>Destacar</Text>
                      </TouchableOpacity>
                    )}
                    {d <= 7 && (
                      <TouchableOpacity style={styles.btnRenovar} onPress={() => renovar(item)}>
                        <MaterialCommunityIcons name="refresh" size={14} color="#fff" />
                        <Text style={styles.btnRenovarText}>Renovar</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              }
              return d <= 7 && d > 0 ? (
                <Text style={styles.vencAjeno}>Se da de baja en {d} {d === 1 ? 'día' : 'días'}</Text>
              ) : null;
            })()}

            {item.autor !== yo && contactadas.includes(item.id) && (
              calificadas.includes(item.id) ? (
                <View style={styles.yaCalificado}>
                  <MaterialCommunityIcons name="check-circle-outline" size={15} color="#0a7d33" />
                  <Text style={styles.yaCalificadoText}>Ya calificaste a este rider</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.btnCalificar}
                  onPress={() => { setCalificando(item); setPuntaje(0); setComentario(''); }}
                >
                  <MaterialCommunityIcons name="star-outline" size={16} color="#8a5a00" />
                  <Text style={styles.btnCalificarText}>
                    ¿Se concretó? Calificá a {nombres[item.autor] || 'este rider'}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </View>
        ))}
      </ScrollView>

      {/* Botón publicar */}
      <TouchableOpacity
        style={[
          styles.fab,
          { backgroundColor: cat.color },
          tipo === 'instructor' && !soyInstructor && { opacity: 0.55 },
        ]}
        onPress={abrirFormulario}
      >
        <MaterialCommunityIcons
          name={tipo === 'instructor' && !soyInstructor ? 'lock-outline' : 'plus'}
          size={22}
          color="#fff"
        />
        <Text style={styles.fabText}>Publicar</Text>
      </TouchableOpacity>

      <DenunciaModal
        visible={!!denunciando}
        cerrar={() => setDenunciando(null)}
        objetivo={denunciando}
      />

      {/* Destacar */}
      <Modal
        animationType="slide"
        transparent
        visible={!!destacando}
        onRequestClose={() => setDestacando(null)}
      >
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: '#8a5a00' }]}>Destacar aviso</Text>
              <TouchableOpacity onPress={() => setDestacando(null)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.calSub} numberOfLines={2}>{destacando?.titulo}</Text>

            <Text style={styles.destExplica}>
              Tu aviso aparece primero en su categoría, con una cinta amarilla. Elegí por
              cuánto tiempo:
            </Text>

            {DESTACADOS.map((o) => (
              <TouchableOpacity key={o.dias} style={styles.opcionPago} onPress={() => pedirDestacar(o)}>
                <MaterialCommunityIcons name="star-four-points" size={20} color="#FFB300" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.opcionPagoTitulo}>{o.label}</Text>
                  <Text style={styles.opcionPagoDesc}>Aparece arriba durante {o.dias} días</Text>
                </View>
                <Text style={styles.opcionPagoMonto}>USD {o.monto}</Text>
              </TouchableOpacity>
            ))}

            <Text style={styles.pagoNota}>
              Se paga por transferencia a {COBRO.alias}. Nos mandás el comprobante y lo activamos
              a mano, normalmente el mismo día.
            </Text>
          </View>
        </View>
      </Modal>

      {/* Calificar */}
      <Modal
        animationType="slide"
        transparent
        visible={!!calificando}
        onRequestClose={() => setCalificando(null)}
      >
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: COLORS.accent }]}>
                Calificar a {calificando ? nombres[calificando.autor] || 'este rider' : ''}
              </Text>
              <TouchableOpacity onPress={() => setCalificando(null)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.calSub} numberOfLines={2}>
              {calificando?.titulo}
            </Text>

            <View style={styles.estrellas}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity key={n} onPress={() => setPuntaje(n)} style={{ padding: 4 }}>
                  <MaterialCommunityIcons
                    name={n <= puntaje ? 'star' : 'star-outline'}
                    size={38}
                    color={n <= puntaje ? '#FFB300' : '#d5dee6'}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.calAyuda}>
              {puntaje === 0 ? 'Tocá las estrellas' :
               puntaje <= 2 ? 'Mala experiencia' :
               puntaje === 3 ? 'Estuvo bien' :
               puntaje === 4 ? 'Muy buena' : 'Excelente'}
            </Text>

            <TextInput
              style={[styles.input, { height: 90, textAlignVertical: 'top', marginTop: 14 }]}
              value={comentario}
              onChangeText={setComentario}
              placeholder="Contá cómo fue: si el equipo estaba como decía, si fue puntual..."
              placeholderTextColor="#aaa"
              multiline
              maxLength={500}
            />

            <Text style={styles.calNota}>
              La reseña es pública y no se puede borrar después. Escribí lo que le sirva al próximo.
            </Text>

            <TouchableOpacity
              style={[styles.publicar, { backgroundColor: COLORS.accent }]}
              onPress={enviarCalificacion}
              disabled={guardando}
            >
              {guardando ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.publicarTexto}>Enviar calificación</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Formulario */}
      <Modal animationType="slide" transparent visible={modal} onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: cat.color }]}>{cat.titulo}</Text>
              <TouchableOpacity onPress={() => { setModal(false); setFotos([]); }}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
              {tipo === 'instructor' && (
                <View style={styles.avisoInstructorOk}>
                  <MaterialCommunityIcons name="shield-alert-outline" size={16} color="#0a7d33" />
                  <Text style={styles.avisoInstructorOkText}>
                    Al publicar confirmás que estás en condiciones de dar clases. GUSTS solo
                    conecta: no responde por accidentes, lesiones ni por el pago del alumno.
                  </Text>
                </View>
              )}

              {campos.map((c) => {
                if (c.tipo === 'opciones') {
                  return (
                    <View key={c.k} style={{ gap: 7 }}>
                      <Text style={styles.label}>{c.label}</Text>
                      <View style={styles.opciones}>
                        {c.opciones.map((o) => (
                          <TouchableOpacity
                            key={o}
                            style={[styles.opcion, form[c.k] === o && { backgroundColor: cat.color, borderColor: cat.color }]}
                            onPress={() => setForm({ ...form, [c.k]: form[c.k] === o ? '' : o })}
                          >
                            <Text style={form[c.k] === o ? styles.opcionTextoOn : styles.opcionTexto}>{o}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  );
                }

                if (c.tipo === 'spot') {
                  return (
                    <View key={c.k} style={{ gap: 7 }}>
                      <Text style={styles.label}>{c.label} {c.req && '*'}</Text>
                      {form.spot ? (
                        <View style={styles.spotElegido}>
                          <MaterialCommunityIcons name="map-marker-check" size={17} color={cat.color} />
                          <Text style={styles.spotElegidoTexto}>{form.spot}</Text>
                          <TouchableOpacity onPress={() => { setForm({ ...form, spot: '' }); setBuscaSpot(''); }}>
                            <MaterialCommunityIcons name="close-circle" size={18} color="#aaa" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <>
                          <TextInput
                            style={styles.input}
                            value={buscaSpot}
                            onChangeText={setBuscaSpot}
                            placeholder="Escribí para buscar el spot..."
                            placeholderTextColor="#aaa"
                          />
                          {sugerencias.map((s) => (
                            <TouchableOpacity
                              key={s.id}
                              style={styles.sugerencia}
                              onPress={() => { setForm({ ...form, spot: `${s.name} (${s.region})` }); setBuscaSpot(''); }}
                            >
                              <MaterialCommunityIcons name="map-marker-outline" size={15} color={COLORS.subtitle} />
                              <Text style={styles.sugerenciaTexto}>{s.name} — {s.region}</Text>
                            </TouchableOpacity>
                          ))}
                        </>
                      )}
                    </View>
                  );
                }

                return (
                  <View key={c.k} style={{ gap: 7 }}>
                    <Text style={styles.label}>{c.label} {c.req && '*'}</Text>
                    <TextInput
                      style={[styles.input, c.tipo === 'largo' && { height: 80, textAlignVertical: 'top' }]}
                      value={form[c.k]}
                      onChangeText={(v) => setForm({ ...form, [c.k]: v })}
                      placeholder={c.ph}
                      placeholderTextColor="#aaa"
                      multiline={c.tipo === 'largo'}
                    />
                  </View>
                );
              })}

              <View style={{ gap: 8 }}>
                <Text style={styles.label}>Fotos (hasta {MAX_FOTOS})</Text>
                <View style={styles.fotosFila}>
                  {fotos.map((u) => (
                    <View key={u}>
                      <Image source={{ uri: u }} style={styles.fotoMini} />
                      <TouchableOpacity style={styles.quitarFoto} onPress={() => quitarFoto(u)}>
                        <MaterialCommunityIcons name="close" size={13} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {fotos.length < MAX_FOTOS && (
                    <TouchableOpacity style={styles.agregarFoto} onPress={agregarFoto} disabled={subiendo}>
                      {subiendo ? (
                        <ActivityIndicator color={cat.color} />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="camera-plus-outline" size={22} color={cat.color} />
                          <Text style={[styles.agregarFotoText, { color: cat.color }]}>Agregar</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.ayuda}>
                  Una foto real vende mucho más que la descripción.
                </Text>
              </View>

              <View style={styles.separador} />

              <View style={{ gap: 7 }}>
                <Text style={styles.label}>Tu nombre</Text>
                <TextInput
                  style={styles.input}
                  value={form.autor}
                  onChangeText={(v) => setForm({ ...form, autor: v })}
                  placeholder="Cómo te van a ver"
                  placeholderTextColor="#aaa"
                />
              </View>

              <View style={{ gap: 7 }}>
                <Text style={styles.label}>WhatsApp o mail *</Text>
                <TextInput
                  style={styles.input}
                  value={form.contacto}
                  onChangeText={(v) => setForm({ ...form, contacto: v })}
                  placeholder="+54 9 11 5555 5555 o tumail@gmail.com"
                  placeholderTextColor="#aaa"
                  autoCapitalize="none"
                />
                <Text style={styles.ayuda}>
                  Con el código de país. No se muestra en el aviso: solo lo ve quien toca
                  "Contactar".
                </Text>
              </View>

              <Text style={styles.duracionNota}>
                La publicación queda activa {tipo === 'alojamiento' ? '60' : '30'} días. Antes de
                vencer te avisamos y podés renovarla con un toque.
              </Text>

              <TouchableOpacity
                style={[styles.publicar, { backgroundColor: cat.color }]}
                onPress={publicar}
                disabled={guardando}
              >
                {guardando ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.publicarTexto}>Publicar</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Meta({ icon, text }) {
  return (
    <View style={styles.meta}>
      <MaterialCommunityIcons name={icon} size={13} color={COLORS.subtitle} />
      <Text style={styles.metaText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.light },

  tabsWrap: { backgroundColor: '#fff', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e8eef4' },
  tabsContent: { paddingHorizontal: 12, gap: 8 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 8,
    borderRadius: 20, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e3edf6',
  },
  catText: { fontSize: 12, fontWeight: 'bold', color: '#1a1a1a' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14, marginBottom: 12 },
  headerIcon: { width: 44, height: 44 },
  headerIconBox: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', letterSpacing: 0.5 },
  headerSub: { color: 'rgba(255,255,255,0.9)', fontSize: 11, marginTop: 2 },

  avisoPerdidos: {
    flexDirection: 'row', gap: 8, backgroundColor: '#fdeef4', borderRadius: 10, padding: 10,
    marginBottom: 14, borderWidth: 1, borderColor: '#f7c9dc',
  },
  avisoPerdidosText: { flex: 1, fontSize: 11, color: '#8a2a52', lineHeight: 16 },

  avisoInstructor: {
    flexDirection: 'row', gap: 8, backgroundColor: '#f0edfa', borderRadius: 10, padding: 10,
    marginBottom: 14, borderWidth: 1, borderColor: '#d4cbf0',
  },
  avisoInstructorText: { flex: 1, fontSize: 11, color: '#4a3a8a', lineHeight: 16 },
  avisoInstructorOk: {
    flexDirection: 'row', gap: 8, backgroundColor: '#e9f7ee', borderRadius: 10, padding: 10,
    marginBottom: 14, borderWidth: 1, borderColor: '#b8e2c6',
  },
  avisoInstructorOkText: { flex: 1, fontSize: 11, color: '#0a5c26', lineHeight: 16 },
  notaClases: {
    fontSize: 10.5, color: '#8a9aa8', lineHeight: 15, fontStyle: 'italic', marginTop: 9,
  },

  perdidoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6, marginTop: 7,
  },
  perdidoBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold', letterSpacing: 0.5 },

  cintaDestacado: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    backgroundColor: '#fff3cd', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 5, marginBottom: 8, borderWidth: 1, borderColor: '#ffe0a3',
  },
  cintaTexto: { fontSize: 9.5, fontWeight: 'bold', color: '#8a5a00', letterSpacing: 0.6 },
  verifChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#e9f7ee',
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
    borderWidth: 1, borderColor: '#b8e2c6',
  },
  verifTexto: { fontSize: 10, fontWeight: 'bold', color: '#0a7d33' },
  btnDestacar: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff3cd',
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14,
    borderWidth: 1, borderColor: '#ffe0a3',
  },
  btnDestacarText: { color: '#8a5a00', fontSize: 11, fontWeight: 'bold' },

  destExplica: { fontSize: 12.5, color: COLORS.subtitle, lineHeight: 18, marginBottom: 14 },
  opcionPago: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff',
    borderRadius: 11, padding: 14, marginBottom: 9,
    borderWidth: 1.5, borderColor: '#ffe0a3',
  },
  opcionPagoTitulo: { fontSize: 14.5, fontWeight: 'bold', color: '#1a1a1a' },
  opcionPagoDesc: { fontSize: 11.5, color: COLORS.subtitle, marginTop: 2 },
  opcionPagoMonto: { fontSize: 16, fontWeight: 'bold', color: '#8a5a00' },
  pagoNota: { fontSize: 10.5, color: '#8a9aa8', lineHeight: 15, fontStyle: 'italic', marginTop: 6 },

  fotoAviso: { width: 130, height: 98, borderRadius: 9, backgroundColor: '#e8eef4' },
  fotosFila: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  fotoMini: { width: 76, height: 76, borderRadius: 9, backgroundColor: '#e8eef4' },
  quitarFoto: {
    position: 'absolute', top: -5, right: -5, backgroundColor: '#c0392b',
    width: 21, height: 21, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#fff',
  },
  agregarFoto: {
    width: 76, height: 76, borderRadius: 9, borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: '#c9d6e2', alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  agregarFotoText: { fontSize: 10.5, fontWeight: '600' },

  vencRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 10 },
  vencText: { flex: 1, fontSize: 11, color: '#8a9aa8', fontWeight: '600' },
  vencAjeno: { fontSize: 10.5, color: '#8a5a00', marginTop: 8, fontStyle: 'italic' },
  btnRenovar: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primary,
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14,
  },
  btnRenovarText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  duracionNota: { fontSize: 10.5, color: '#8a9aa8', lineHeight: 15, fontStyle: 'italic' },

  autorFila: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  autorLinea: { fontSize: 10.5, color: '#8a9aa8', fontStyle: 'italic' },
  repChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#fff8e6',
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
    borderWidth: 1, borderColor: '#ffe0a3',
  },
  repTexto: { fontSize: 11, fontWeight: 'bold', color: '#8a5a00' },
  sinRep: { fontSize: 10, color: '#c0cad3', fontStyle: 'italic' },

  btnCalificar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#fff8e6', borderRadius: 9, paddingVertical: 10, marginTop: 8,
    borderWidth: 1, borderColor: '#ffe0a3',
  },
  btnCalificarText: { fontSize: 12, fontWeight: 'bold', color: '#8a5a00' },
  yaCalificado: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 9,
  },
  yaCalificadoText: { fontSize: 11, color: '#0a7d33', fontWeight: '600' },

  calSub: { fontSize: 13, color: COLORS.subtitle, marginBottom: 4 },
  estrellas: { flexDirection: 'row', justifyContent: 'center', marginTop: 12 },
  calAyuda: { fontSize: 13, fontWeight: '600', color: '#1a1a1a', textAlign: 'center', marginTop: 4 },
  calNota: { fontSize: 10.5, color: '#8a9aa8', marginTop: 10, lineHeight: 15, fontStyle: 'italic' },

  vacio: { alignItems: 'center', paddingVertical: 50 },
  vacioTitulo: { fontSize: 15, fontWeight: 'bold', color: '#1a1a1a', marginTop: 12 },
  vacioTexto: { fontSize: 12, color: COLORS.subtitle, marginTop: 4, textAlign: 'center', paddingHorizontal: 30 },

  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, borderLeftWidth: 4, elevation: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: 'bold', color: '#1a1a1a' },
  precio: { fontSize: 16, fontWeight: 'bold', marginTop: 4 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, color: COLORS.subtitle },
  detalle: { fontSize: 12.5, color: '#333', lineHeight: 18, marginTop: 9 },

  acciones: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 9,
  },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 12.5 },
  btnGhost: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 9, backgroundColor: '#eef4fa',
    borderWidth: 1, borderColor: '#d5e3f0',
  },
  btnGhostText: { color: COLORS.primary, fontWeight: 'bold', fontSize: 12.5 },

  fab: {
    position: 'absolute', right: 16, bottom: 18, flexDirection: 'row', alignItems: 'center',
    gap: 6, paddingHorizontal: 18, paddingVertical: 13, borderRadius: 26, elevation: 5,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 5, shadowOffset: { width: 0, height: 3 },
  },
  fabText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 18, paddingHorizontal: 16, paddingBottom: 26, maxHeight: '90%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 19, fontWeight: 'bold' },

  label: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
  input: {
    backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#dde6ee', fontSize: 14, color: '#000',
  },
  ayuda: { fontSize: 10.5, color: '#8a9aa8', fontStyle: 'italic' },
  opciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  opcion: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0',
  },
  opcionTexto: { fontSize: 12, fontWeight: '600', color: COLORS.subtitle },
  opcionTextoOn: { fontSize: 12, fontWeight: '600', color: '#fff' },

  sugerencia: {
    flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 9,
    paddingHorizontal: 10, backgroundColor: '#f5f9fc', borderRadius: 8,
  },
  sugerenciaTexto: { fontSize: 12.5, color: '#1a1a1a' },
  spotElegido: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f0f7fc',
    borderRadius: 8, padding: 11, borderWidth: 1, borderColor: '#d5e3f0',
  },
  spotElegidoTexto: { flex: 1, fontSize: 13, fontWeight: '600', color: '#1a1a1a' },

  separador: { height: 1, backgroundColor: '#eef2f6', marginVertical: 4 },
  publicar: { paddingVertical: 14, borderRadius: 9, alignItems: 'center', marginTop: 8 },
  publicarTexto: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
