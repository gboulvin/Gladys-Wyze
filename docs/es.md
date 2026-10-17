# Wyze

Controle sus dispositivos [Wyze](https://www.wyze.com) desde Gladys
Assistant: bombillas, tiras LED, enchufes, cámaras y sensores Wyze Sense, con
disparadores y acciones de escena y dos widgets para el panel.

## Dispositivos compatibles

| Dispositivo Wyze                                      | En Gladys                                                                  |
| ----------------------------------------------------- | -------------------------------------------------------------------------- |
| Bombilla blanca (WLPA19, HL_HWB2)                     | Encendido/apagado, brillo, temperatura de color                            |
| Bombilla de color (WLPA19C, BR30) y tira LED (HL_LSL) | Encendido/apagado, brillo, temperatura de color, color — **control local** |
| Enchufe y enchufe exterior (WLPP1, WLPP1CFH, WLPPO)   | Encendido/apagado (un dispositivo por toma)                                |
| Cámaras (Cam v2/v3/v4, Pan, Outdoor, Doorbell...)     | Última imagen, movimiento, encendido, sirena, detección de movimiento      |
| Floodlight Pro, Battery Cam Pro, Cam OG, Pan v4       | Última imagen y movimiento (sus controles usan otra API de Wyze)           |
| Sensor de apertura Wyze Sense (DWS3U, DWS2U)          | Abierto/cerrado, batería baja                                              |
| Sensor de movimiento Wyze Sense (PIR3U, PIR2U)        | Movimiento, batería baja                                                   |

Los demás dispositivos Wyze (cerraduras, termostato, aspiradora, básculas...)
se ignoran.

## Antes de empezar: crear una clave de API de Wyze

Wyze solo permite que las aplicaciones de terceros inicien sesión con una
clave de API personal, además de su correo y su contraseña. La clave también
le ahorra el código de verificación en dos pasos.

1. Abra la [consola de desarrolladores de Wyze](https://developer-api-console.wyze.com/#/apikey/view)
   e inicie sesión con su cuenta Wyze.
2. Cree una clave de API. Copie el **KEY ID** y la **API KEY**: la API KEY
   solo se muestra una vez.
3. Guárdelos para la configuración siguiente. Puede revocar la clave desde la
   misma consola en cualquier momento.

## Configuración

1. Abra la pestaña **Configuración** de la integración.
2. Introduzca su **correo** de Wyze, su **contraseña**, el **ID de la clave de
   API** y la **clave de API**.
3. Si lo desea, cambie el **intervalo de actualización** (60 segundos por
   defecto, 30 como mínimo): la frecuencia de lectura de los estados y de los
   eventos de cámara.
4. Guarde y pulse **Probar la conexión**: la integración inicia sesión e
   indica cuántos dispositivos compatibles ha encontrado.
5. Abra la pestaña **Descubrimiento** y añada a Gladys los dispositivos que
   desee.

Solo se leen en cada actualización los dispositivos añadidos, lo que alivia
la nube de Wyze. **Sincronizar ahora** fuerza una actualización.

## Control local

Wyze es un servicio en la nube, con una excepción: las bombillas de color y
las tiras LED aceptan órdenes en su red local. Cuando **Preferir la conexión
local** está activado (por defecto), sus órdenes van directamente a la
bombilla; los estados se siguen leyendo en la nube.

La insignia de cada dispositivo indica el canal usado: _local_, _nube_ o
_inaccesible_ cuando Wyze indica que el dispositivo está desconectado. Un
punto naranja significa que una orden local falló y la bombilla pasó por la
nube; Gladys vuelve a intentar la red local a los 5 minutos. Gladys debe
poder alcanzar la bombilla en el puerto TCP 88 (misma red, sin aislamiento de
clientes en el Wi-Fi).

## Cámaras

La nube de Wyze no ofrece vídeo en directo: la imagen de la cámara en Gladys
es la última miniatura que guarda Wyze, normalmente la del último evento. Se
actualiza con cada nuevo evento. Gladys solo acepta imágenes de hasta 150 KB;
una miniatura más grande se omite (vea los registros).

La función **Movimiento** de una cámara pasa a 1 durante unos 30 segundos
cuando la cámara registra un evento de movimiento, y luego vuelve a 0. La
detección depende de los ajustes de la cámara en la aplicación Wyze (zonas de
detección, sensibilidad, notificaciones). Los objetos (persona, vehículo,
mascota, paquete) requieren una suscripción Cam Plus.

## Escenas

La integración añade sus propias tarjetas al editor de escenas (Gladys 5.1 o
posterior).

Disparadores:

- **Evento de cámara Wyze** — una cámara registró un evento. Filtre por
  cámara, evento (movimiento, sonido, alarma de humo, alarma de CO, timbre,
  cara, otro) y objeto reconocido (persona, vehículo, mascota, paquete, nada).
  Un filtro vacío lo acepta todo. Las acciones siguientes pueden leer
  `{{triggerEvent.data.event}}` y `{{triggerEvent.data.object}}`.
- **Dispositivo Wyze conectado/desconectado** — un dispositivo perdió su
  conexión con la nube, o la recuperó. Variable:
  `{{triggerEvent.data.status}}` (`offline` / `online`).

Acciones:

- **Sirena de cámara Wyze** — activa o detiene la sirena de una cámara.
- **Detección de movimiento Wyze** — activa o desactiva la detección de
  movimiento de una cámara (por ejemplo, cuando la alarma está armada).
- **Imagen de cámara Wyze** — publica la última imagen de una cámara, para
  enviarla después con la acción de Gladys «enviar una imagen de cámara».
- **Actualizar dispositivos Wyze** — lee los dispositivos de inmediato;
  devuelve el número de dispositivos y de dispositivos en línea.

Una cámara que no puede ejecutar una acción (Floodlight Pro...) devuelve
`false` en lugar de fallar, para que las acciones siguientes dependan de ello.

## Panel

En el editor del panel hay dos widgets disponibles:

- **Resumen Wyze** — dispositivos, en línea y sin conexión, puertas y
  ventanas abiertas, estado de la nube, última actualización, último evento de
  cámara y un botón **Sincronizar**.
- **Cámara Wyze** — elija una cámara en los ajustes del widget: última
  imagen, movimiento en directo, conexión, último evento y botones de sirena
  (la sirena pide confirmación).

## Solución de problemas

- **«Wyze rechazó el inicio de sesión»** — revise el correo, la contraseña y
  que el ID y la clave de API pertenezcan a la misma clave. Tras un rechazo,
  Gladys espera 15 minutos antes de reintentar (Wyze bloquea las cuentas que
  inician sesión demasiado a menudo); guardar la configuración reintenta de
  inmediato.
- **Un dispositivo no se actualiza** — compruebe en la aplicación Wyze que
  está en línea; los estados se leen en cada intervalo de actualización.
- **Una bombilla de color se queda en la nube** — compruebe que Gladys
  alcanza la bombilla en el puerto TCP 88, o desactive **Preferir la conexión
  local**.
- **Registros** — abra los registros de la integración desde Gladys (o
  `docker logs`), con `LOG_LEVEL=debug` para más detalle. Las contraseñas y
  los tokens nunca se registran.

## Privacidad

Gladys guarda sus credenciales en su configuración. La sesión de Wyze
(tokens de acceso y de actualización) se conserva en el volumen privado de la
integración, para que un reinicio no vuelva a iniciar sesión. La integración
solo habla con la nube de Wyze y con sus bombillas de color en la red local.

Esta integración no está afiliada a Wyze Labs. Usa la misma API en la nube
que la aplicación Wyze, que Wyze puede cambiar sin previo aviso.
