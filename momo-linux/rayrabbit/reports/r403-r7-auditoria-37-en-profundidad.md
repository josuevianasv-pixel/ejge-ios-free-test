# Auditoría de obsolescencia de 37 pruebas — Mo Mo Mummy R40.3 R7

**Fecha:** 19 de octubre de 2026. **Entorno:** Node.js 22 en Linux, copia temporal de laboratorio; sin Windows LTSC, periférico MEI ni dinero real.

**ZIP SHA256:** `e44a2d00ce3b6614260bc85c9bd611248d781120fcaf98e3534e93e859ce6310`

## Resumen

| Resultado | Cantidad | Decisión |
|---|---:|---|
| Aserción obsoleta o incompatible: **actualizar** | 32 | Conservar el propósito, cambiar fixture/contrato o sustitución de coincidencias literales |
| **Investigar** antes de decidir | 2 | No descartar: sesiones de handpay con resultado durable incierto |
| **Defecto confirmado en herramienta QA** | 2 | La reserva es insuficiente después de subir el valor del jackpot forzado |
| **Retirar y reemplazar** prueba histórica | 1 | Solo tras escribir prueba nueva de KIOSKO V11 |

**216 selftests ejecutados: 179 PASS y 37 FAIL.** Las 22 regresiones seleccionadas dieron PASS; esto no invalida ni resuelve los 37 fallos históricos.

La clasificación se basa en el primer error observado, el archivo de prueba y el código/configuración de R7. Las aserciones que siguen a la primera excepción no se han ejecutado. Por eso **ninguna** categoría significa que el test completo esté ya corregido.

## Reproducciones adicionales realizadas

- El operador R7 tiene esquema **v14**. MINI está en modo **FIXED** y los multiplicadores de MINI/MINOR varían con la apuesta; MAXI permanece fijo.
- El aporte al fondo MINI a partir de una liquidación de $123.45 fue **$5.884657469428** usando la configuración de fábrica; la prueba antigua exigía $123.45.
- En un ejemplo con saldo $10, apuesta $0.20 y WIN $0.50, el primer giro deja saldo **$9.80**, **1** giro y WIN pendiente **$0.50**. El siguiente PLAY deja saldo **$10.30** y mantiene **1** giro, sin nueva grilla; es el cobro COLLECT_ONLY, no un defecto de giro.
- WMS usa sondeo con espera de 350 ms y continuación por setTimeout, no el setInterval de 65 ms que simulan pruebas viejas.
- F9 es una tecla fija para servicio/QA y no reasignable; el test anterior exige lo contrario.
- Se aislaron dos fallos de QA: GRAND abrió PICK mostrando ~$1413.72 con reserva ~$1000; MINI abrió PICK a $120 con reserva $105. La función `reserveQaProgressive()` reserva primero y eleva después el valor. Una instrumentación en memoria que ajustó reserva **después** del valor objetivo consiguió que las dos pruebas originales terminaran PASS. El motor de producción **no** fue modificado.
- El test LINKED asumía $1.50 a `coinSize=.03`, pero ese tamaño ya no está permitido en R7: la apuesta aplicada fue $0.20; el error de comparación se debe al fixture.
- En una simulación de respuesta HTTP 200 {ok:true,state:{}} sin historial, el cliente puede iniciar con saldo cero. El servidor real R7 rechaza archivos monetarios existentes corruptos y archivos primarios faltantes con respaldo; esta simulación aislada **no demuestra** pérdida de saldo en producción. Hay que probar además ausencia de archivo con recibos/contabilidad para verificar el cierre seguro de la recuperación.

## Revisión individual por categoría

### Monetario y liquidaciones (8)

| Prueba | Decisión | Prioridad | Causa observada y nueva comprobación |
|---|---|---|---|
| `h79-user-request-selftest.js` | **ACTUALIZAR** | P1 | Exige que $123.45 de beneficio aporte exactamente $123.45 al MINI. R7 utiliza reparto configurado y reserva por beneficio máximo histórico; en el perfil de fábrica el aporte observado fue $5.884657469428. **Próxima prueba:** Sustituir aserción 1:1 por la fórmula configurada de reparto, alta de beneficio y prevención de liquidación duplicada. Mantener barrera de crédito y de WIN. |
| `linked-engine-h35-selftest.js` | **ACTUALIZAR** | P1 | El test llama coinSize=.03, denominación no permitida en R7; el motor usa apuesta válida $0.20, pero el test exige débito $1.50. También presupone espejo local de STANDALONE. **Próxima prueba:** Recrear reintento LINKED con identificador fijo y servidor simulado; comparar balance+wager+pendingWin antes/después; comprobar idempotencia y almacenamiento autoritativo sin espejo local. |
| `r30-cashout-powerloss-durable-selftest.js` | **ACTUALIZAR** | P0 | La prueba requiere FAST CLEAR aun cuando su mock confirma error de guardado. Ese criterio antiguo puede marcar como correcto un cobro sin confirmación durable. **Próxima prueba:** Invertir la expectativa: mantener pendiente/inhibido si falla commit; solo CLEARED cuando el servidor reconoce de forma atómica la transacción y el asiento queda persistido; repetir tras reinicio. |
| `r35-handpay-long-session-durable-selftest.js` | **INVESTIGAR** | P0 | Mock incompleto/antiguo del commit atómico: simula respuesta de contabilidad bloqueada y espera CLEARED sin confirmar el endpoint definitivo. **Próxima prueba:** Actualizar mock de /__local/handpay/commit-clear y cashout-status; probar (a) commit correcto, (b) timeout con estado desconocido, (c) reintento idempotente. Conservar la prueba de sesión larga. |
| `r36-1-handpay-atomic-error-fallback-selftest.js` | **INVESTIGAR** | P0 | Simula HTTP 500 en commit-clear y espera liberar/cerrar usando un fallback no demostrado durable; R7 prefiere fallar cerrado. **Próxima prueba:** Exigir no finalizar ni vaciar saldo hasta prueba positiva de transacción; comprobar reconciliación con falla 500, recuperación de servidor y doble confirmación. |
| `r36-fixed-profit-selftest.js` | **ACTUALIZAR** | P1 | Usa esquema antiguo v13 y asume asignación 100% del beneficio de cada ronda. R7 v14 usa profitHighWater, budgetRtp/profitShare, idempotencia de rondas y fondo independiente. **Próxima prueba:** Validar cálculo con presupuesto configurado (no exigir 5->5), prueba de pérdidas y recuperación del high-water, RTP, no sobrefinanciar y no pagar premios sin reserva suficiente. |
| `r37-audit-regression-selftest.js` | **ACTUALIZAR** | P2 | Comprueba cadenas literales como profitFunding:(()=> y DEFAULT_OPERATOR version:13; R7 cambió expresiones, conservando campos de financiación y esquema v14. **Próxima prueba:** Usar asserts funcionales de normalización y persistencia de profitFunding en lugar de coincidencias exactas. |
| `win-settlement-h84-selftest.js` | **ACTUALIZAR** | P0 | Graba/lee EJGE_RUNTIME_STATE_V1 en localStorage como autoridad; R7 usa estado durable del servidor y bloqueo MONETARY_NOT_READY. **Próxima prueba:** Reescribir con servidor HTTP simulado de lectura/escritura y ACK durable; comprobar WIN pendiente, reinicio, una sola liquidación y rechazo del estado corrupto. |

**Referencias de fuente verificadas:**
- `h79-user-request-selftest.js` → `www/engine-local.js:282-301; config/operator-config.json`
- `linked-engine-h35-selftest.js` → `www/engine-local.js:232-236,501-502,686-725,302-304`
- `r30-cashout-powerloss-durable-selftest.js` → `www/handpay-runtime.js; server-local.ps1:1850-2060`
- `r35-handpay-long-session-durable-selftest.js` → `www/handpay-runtime.js; server-local.ps1:1850-2060`
- `r36-1-handpay-atomic-error-fallback-selftest.js` → `www/handpay-runtime.js; server-local.ps1:1850-2060`
- `r36-fixed-profit-selftest.js` → `www/engine-local.js:282-301; config/operator-config.json`
- `r37-audit-regression-selftest.js` → `www/linked-math.js; www/qa-lab.js; www/engine-local.js:345-361`
- `win-settlement-h84-selftest.js` → `www/engine-local.js:210-236; server-local.ps1:750-764`

### Jackpot y progresivos (12)

| Prueba | Decisión | Prioridad | Causa observada y nueva comprobación |
|---|---|---|---|
| `jackpot-wild-gate-h70-selftest.js` | **ACTUALIZAR** | P1 | Fabrica un jackpot vencido pero sin la reserva de beneficio R7. WILD solo no basta para habilitar un premio sin fondos. **Próxima prueba:** Preparar fondo efectivamente reservado y verificar WILD, monto congelado y premio único; añadir rama sin fondo que permanezca bloqueada. |
| `progressive-durability-h25-selftest.js` | **ACTUALIZAR** | P1 | Presupone jackpot sin fondo y persistencia localStorage de progresivos; R7 conserva autoridad de estado del servidor y reserva. **Próxima prueba:** Reemplazar espejo local por prueba con revisiones del servidor, rechazo de revisión vieja, recuperación tras corte y premio respaldado por reserva. |
| `progressive-local-selftest.js` | **ACTUALIZAR** | P1 | Config v1 exige disparo de jackpot solo por target+WILD, sin beneficio reservado. **Próxima prueba:** Migrar fixture a esquema v14 con fondos suficientes; probar WILD, cobro de una sola vez, saldo y reinicio. |
| `progressive-startup-h28-selftest.js` | **ACTUALIZAR** | P1 | Espera guardar/restaurar progresivos con EJGE_PROGRESSIVE_STATE_V2 en localStorage; desde R40 la función limpia ese espejo en el primario. **Próxima prueba:** Verificar arranque desde GET de servidor, no sobreescritura por estado anterior, archivo corrupto fail-closed y compatibilidad entre reinicios. |
| `progressive-window-h25-selftest.js` | **ACTUALIZAR** | P2 | Muestrea MINI como progresivo con ventana 110..150, pero el MINI de fábrica en R7 es FIXED y depende de apuesta. **Próxima prueba:** Mover la distribución a MAJOR/GRAND con sus ventanas actuales; para MINI/MINOR verificar cantidad fija proporcional a la apuesta y cero incremento. |
| `qa-center-selftest.js` | **DEFECTO QA CONFIRMADO** | P1 | DEFECTO CONFIRMADO de FORCE QA: reserveQaProgressive calcula reserva sobre el valor actual y DESPUÉS eleva current al target. Se abrió PICK GRAND $1413.72 con fondo $1000.00; pago bloqueado por falta de reserva. **Próxima prueba:** Separar QA visual sin pago real de premio simulado con reserva válida; revisar estado de PICK después de cada paso y prohibir la generación de dinero por un test. |
| `qa-progressive-force-h25-selftest.js` | **DEFECTO QA CONFIRMADO** | P1 | DEFECTO CONFIRMADO de FORCE QA: el monto visible termina $120, pero reserva $105; al finalizar PICK retorna PROGRESSIVE_AWARD_FUNDING_UNAVAILABLE. Corrigiendo en memoria el orden de la reserva, esta prueba pasa. **Próxima prueba:** Instrumentar estado fundingStatus/reserva/roundId y proveer saldo ficticio y financiación suficiente; verificar no duplicidad y payout congelado en QA. |
| `r29-progressive-award-snapshot-selftest.js` | **ACTUALIZAR** | P0 | Deshabilita progresivos mientras PICK está abierto y luego exige pagar la cifra congelada sin demostrar reserva durable; R7 bloquea pago sin fondos para no reconocer un jackpot no respaldado. **Próxima prueba:** Repetir con reserva suficiente y cambio de configuración durante PICK; comprobar congelación de monto y una sola salida; si falta reserva, mantener PICK pendiente sin duplicar. |
| `r29-progressive-config-spin-selftest.js` | **ACTUALIZAR** | P1 | Supone que cada llamada a spin equivale a nueva apuesta; en R7 una llamada con WIN pendiente es COLLECT_ONLY y no aporta a progresivos. **Próxima prueba:** Contar giros efectivos/spins y liquidaciones por separado y calcular aportación contra coin-in realmente debitado. |
| `r37s4-final-install-validator-selftest.js` | **ACTUALIZAR** | P2 | Exige incrementos fijos históricos en MINI/MINOR/MAXI y cadenas viejas de instalador aunque la fábrica R7 establece esos niveles FIXED con incremento cero. **Próxima prueba:** Actualizar esquema v14, modo FIXED/proporcional, valores MAJOR/GRAND y verificar rutas de instalador presentes. No modificar el operador por un string test. |
| `total-bet-h74-deep-selftest.js` | **ACTUALIZAR** | P1 | Después de una jugada con premio espera que el siguiente SPIN inicie otra ronda y dispare WILD, sin distinguir el paso COLLECT_ONLY ni barrera de reserva. **Próxima prueba:** Separar cobro pendiente de segundo giro real y fondear la reserva; reproducir WILD a apuestas extremas y comprobar contadores/spins efectivos. |
| `total-bet-h74-selftest.js` | **ACTUALIZAR** | P2 | Asume MINI progresivo constante para todas las apuestas, pero R7 fija MINI/MINOR con multiplicadores por apuesta explícitos. **Próxima prueba:** Verificar MINI=TOTAL_BET*20, MINOR=TOTAL_BET*60 según ajustes, MAXI=100 y MAJOR/GRAND como pools no escalados. |

**Referencias de fuente verificadas:**
- `jackpot-wild-gate-h70-selftest.js` → `www/engine-local.js:298-301,370-374; tests/qa36-r6-jackpot-funding-pending-selftest.js`
- `progressive-durability-h25-selftest.js` → `www/engine-local.js:302-304,363-374; server-local.ps1`
- `progressive-local-selftest.js` → `www/engine-local.js:298-301,370-374`
- `progressive-startup-h28-selftest.js` → `www/engine-local.js:302-304,363; server-local.ps1:2440-2451`
- `progressive-window-h25-selftest.js` → `config/operator-config.json; www/engine-local.js:374-377`
- `qa-center-selftest.js` → `www/engine-local.js:373-374,617-625`
- `qa-progressive-force-h25-selftest.js` → `www/engine-local.js:373-374,619-625`
- `r29-progressive-award-snapshot-selftest.js` → `www/engine-local.js:374,619-625; tests/qa36-r6-jackpot-funding-pending-selftest.js`
- `r29-progressive-config-spin-selftest.js` → `www/engine-local.js:232-236,501-502`
- `r37s4-final-install-validator-selftest.js` → `config/operator-config.json; server-local.ps1`
- `total-bet-h74-deep-selftest.js` → `www/engine-local.js:501-502,298-301`
- `total-bet-h74-selftest.js` → `config/operator-config.json; www/engine-local.js:374-377`

### Motor y protocolo de giros (4)

| Prueba | Decisión | Prioridad | Causa observada y nueva comprobación |
|---|---|---|---|
| `h96-r14-bet-play-selftest.js` | **ACTUALIZAR** | P2 | Busca literalmente hasSpin(m), pero el guard actual se llama hasBaseSpin y transforma eventos de forma recursiva. **Próxima prueba:** Cambiar string test por mensajes WebSocket simulados y asserts del valor final enviado al motor y no doble débito. |
| `preflight-order-h65-selftest.js` | **ACTUALIZAR** | P1 | El test usa motor primario sin activar autoridad monetaria; respondió MONETARY_NOT_READY, no INVALID_GAME_STATE. Adicionalmente R7 remapea el SPIN legado a continuación de feature. **Próxima prueba:** Probar que la remap solo ocurre cuando hay feature válido; no se debita otro giro base y no se consulta billetero innecesariamente; probar otros estados inválidos estrictamente. |
| `spin-protocol-fuzz-h60-selftest.js` | **ACTUALIZAR** | P1 | Exige GameSlotResultInfo en toda respuesta SPIN sin error. Con WIN pendiente R7 devuelve SPIN/COLLECT_ONLY sin nueva grilla ni débito. **Próxima prueba:** Modificar el fuzzer para separar REQUEST SPIN, SPIN efectivo y COLLECT_ONLY; mantener esquema y validación de todas las transiciones/contadores. |
| `stability-protocol-h65-selftest.js` | **ACTUALIZAR** | P1 | Espera rechazo 409 de spin durante FREE; el motor aplica remap legado intencional y el test no continúa a sus aserciones de idempotencia. **Próxima prueba:** Actualizar precondición al contrato de PLAY heredado y reejecutar idempotencia sobre mensajes correlacionados, con backend durable; comprobar respuesta 409 para conflicto de fingerprint. |

**Referencias de fuente verificadas:**
- `h96-r14-bet-play-selftest.js` → `www/local-shim.js:663-695`
- `preflight-order-h65-selftest.js` → `www/engine-local.js:648-667,677-684`
- `spin-protocol-fuzz-h60-selftest.js` → `www/engine-local.js:232-236,501-502; tests/qa37-r7-profit-ledger-longrun-selftest.js`
- `stability-protocol-h65-selftest.js` → `www/engine-local.js:648-667,229-230,764-768`

### Pantallas, WMS y kiosko (12)

| Prueba | Decisión | Prioridad | Causa observada y nueva comprobación |
|---|---|---|---|
| `direct-qa-h34-selftest.js` | **ACTUALIZAR** | P2 | Exige que F9 sea configurable/no reservada; R7 fija F9 al acceso técnico con PIN por seguridad. **Próxima prueba:** Exigir F9 fijo protegido, QA_MENU autorizado, que otras teclas reconfigurables no secuestren F9 y prueba de acceso BASE. |
| `h96-hud-native-controls-selftest.js` | **ACTUALIZAR** | P2 | Anclado a version MME5H96-R11 y expresiones de render específicas; HUD actual anuncia R27-ZERO-CREDIT-CONTROLS. **Próxima prueba:** Verificar DOM/controladores y estado monetario READY/NO_READY sin buscar literalmente el código antiguo; test de BET/WIN con máquina de estados. |
| `h96-physical-bet-lock-selftest.js` | **ACTUALIZAR** | P1 | El mock solo reconoce setInterval(...,65); se comprobó en código R7 que el WMS usa long-poll de 350 ms con setTimeout. Es una incompatibilidad de fixture, no evidencia de fallo WMS. **Próxima prueba:** Crear reloj falso compatible con setTimeout + AbortController; comprobar bloqueo durante giro, entrega en idle y que no se pierde/duplica evento WMS. |
| `h96-r25-stable-borderless-selftest.js` | **ACTUALIZAR** | P2 | Versiones incrustadas de graphics R37S3 no coinciden con R20.6-PERF1; el resto del test GT210 necesita verificarse por comportamiento. **Próxima prueba:** Mantener pruebas de coordenadas y ventana, actualizar lectura de versión y ejecutar la colocación de monitores en Windows real. |
| `h96-r6-hud-render-toggle-selftest.js` | **ACTUALIZAR** | P1 | Esperaba CREDIT=1000 sin marcar autoridad monetaria lista; el HUD R27 muestra ---- mientras NO_READY para no presentar saldo no verificado. **Próxima prueba:** Rehacer fixture READY/NO_READY; comprobar que no se muestra saldo ficticio durante caída del servidor, y BET/WIN al recuperar autoridad. |
| `h96-r7-paytable-visible-selftest.js` | **ACTUALIZAR** | P2 | Falla en primer chequeo de version R7..R13; HUD actual R27. Eso impide comprobar el contenido real de paytable. **Próxima prueba:** Eliminar limitación de nombre de versión, comprobar que carga contenido y toggle INFO/Paytable en Edge, y fallar si la tabla queda vacía. |
| `layout-director-selftest.js` | **ACTUALIZAR** | P2 | Exige preserveDrawingBuffer:true literal. En R7 se desactiva en la vía GPU para reducir carga y queda habilitado solo en fallback compatible. **Próxima prueba:** Verificar selección condicional de buffer según compositor y que doble monitor/táctil mantengan posición y repaint. |
| `r25-kiosk-hardening-selftest.js` | **RETIRAR Y REEMPLAZAR** | P2 | Busca ../INSTALAR.ps1 fuera de la raíz del paquete, archivo ausente; además valida una arquitectura de kiosko sustituida por el arranque simple V11. **Próxima prueba:** Retirar esta prueba del gate V11 *tras* crear un reemplazo que verifique Explorer + tarea RUN.bat + foco inferior + persistencia del arranque; no volver a Shell Launcher. |
| `r32-gt210-r28-current-selftest.js` | **ACTUALIZAR** | P2 | Se detiene en cadena literal de graphics R37S3 ya reemplazada aunque comprueba rutas GT210 vigentes. **Próxima prueba:** Separar tests de gráficos del marcador de versión; verificar lanzamiento --app, crop y posicionamiento idempotente en Windows con GT210. |
| `r32-wms-routing-current-selftest.js` | **ACTUALIZAR** | P1 | Mock captura solo setInterval de 65 ms; WMS real usa long-poll y setTimeout, por eso no observa PLAY. **Próxima prueba:** Reescribir con temporizador virtual y servidor /__local/wms-buttons/events; probar cursor, eventos duplicados, desconexión y reconexión. |
| `r37s3-video-longrun-selftest.js` | **ACTUALIZAR** | P2 | La aserción inicial de cadena de versión R37S3 no corresponde a R20.6-PERF1; bloquea pruebas de watchdog y cancelación de frame. **Próxima prueba:** Eliminar aserción de versión y medir cancelación de callbacks, vigilancia del stream, rotación de logs y recuperación cuando se detiene la imagen. |
| `touch-layout-selftest.js` | **ACTUALIZAR** | P2 | El test busca setProperty(transform, plantilla literal); R7 construye transform como variable y lo aplica por otra ruta. **Próxima prueba:** Comprobar resultado geométrico en DOM simulado y click targets sobre el canvas, con escalas X/Y independientes. |

**Referencias de fuente verificadas:**
- `direct-qa-h34-selftest.js` → `www/qa-lab.js:344-368; www/local-shim.js:602-612`
- `h96-hud-native-controls-selftest.js` → `www/hud-runtime.js`
- `h96-physical-bet-lock-selftest.js` → `www/local-shim.js:1302-1339`
- `h96-r25-stable-borderless-selftest.js` → `www/graphics-runtime.js; span.ps1`
- `h96-r6-hud-render-toggle-selftest.js` → `www/hud-runtime.js`
- `h96-r7-paytable-visible-selftest.js` → `www/hud-runtime.js; www/static-assets/paytables/`
- `layout-director-selftest.js` → `www/local-shim.js`
- `r25-kiosk-hardening-selftest.js` → `tests/r25-kiosk-hardening-selftest.js:9; RUN.bat; scripts de kiosko V11`
- `r32-gt210-r28-current-selftest.js` → `www/graphics-runtime.js; span.ps1`
- `r32-wms-routing-current-selftest.js` → `www/local-shim.js:1302-1339`
- `r37s3-video-longrun-selftest.js` → `www/graphics-runtime.js; span.ps1`
- `touch-layout-selftest.js` → `www/local-shim.js:~2000-2250`

### Diagnóstico y operación (1)

| Prueba | Decisión | Prioridad | Causa observada y nueva comprobación |
|---|---|---|---|
| `r35-r6-operations-center-selftest.js` | **ACTUALIZAR** | P2 | Exige evento de auditoría OPERATOR_CONFIG antiguo; servidor R7 escribe OPERATOR_CONFIG_FULL_PERSISTENT, preservando /__local/ops/audit. **Próxima prueba:** Actualizar a evento actual, provocar modificación operator-config ficticia y verificar rastro de auditoría inmutable en el simulador. |

**Referencias de fuente verificadas:**
- `r35-r6-operations-center-selftest.js` → `server-local.ps1:560-564,1090-1094,1200-1215`

## Cómo aplicar la limpieza sin ocultar fallos

1. No borrar scripts históricos todavía. Etiquetar las aserciones obsoletas como **legacy** fuera del gate de liberación **únicamente** cuando ya exista su sustituto y éste falle frente a un fallo inyectado; se mantienen como evidencia de migración.
2. Para los 2 casos, mantener estado **BLOQUEADO / PENDIENTE**, sin declararlos corregidos. Reproducir usando simuladores del servidor con ACK durable, y separar request PLAY de SPIN efectivo.
3. Crear nuevas pruebas para cambios más recientes: idempotencia de transacciones, high-water de beneficio, guard de jackpot sin fondos, spin de cobro únicamente, persistencia de WIN y reinicio con estado corrupto.
4. Solo entonces establecer un gate actual **PASS**, que informe también cobertura de contratos y los tests de hardware pendientes; no medir calidad con un porcentaje obtenido quitando fallos.
5. Reejecutar las 216 pruebas (marcando históricas frente a sustitutas), las 22 dirigidas, y posteriormente Windows PowerShell/C# y RS-232 real antes de producción.

## Seguridad y alcance

No se modificó `www/engine-local.js`, el servidor, el hardware, los progresivos, las licencias, la contabilidad ni el kiosko. Ninguno de los 37 fallos se puede marcar definitivamente resuelto hasta ejecutar su test sustitutivo. El ZIP no se ha publicado.