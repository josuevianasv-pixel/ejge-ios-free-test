# MME5 R40.3 R7 — Modernización de QA (19 octubre 2026)

**Ejecución real en laboratorio; no es una certificación del juego ni una ejecución del ZIP R7 en GitHub.**

| Control | Antes | Después del parche QA |
|---|---:|---:|
| 216 pruebas históricas — PASS | 179 | 181 |
| 216 pruebas históricas — FAIL | 37 | **35** |
| 22 regresiones dirigidas | 22/22 | **22/22** |
| Hashes de integridad QA | 142/142 | **142/142** |
| Pruebas de jackpot forzado que antes fallaban | 0/2 | **2/2** |
| Comprobaciones modernizadas de contratos | — | **10/10** |
| Handpay con confirmación, respuesta perdida y HTTP 500 | — | **3/3** |
| Dos verificaciones estáticas antiguas adaptadas | — | **2/2** |

## Qué se corrigió
- Solo en la **copia privada de laboratorio**, el método QA `reserveQaProgressive()` prepara el monto visible forzado antes de ajustar la reserva ficticia. Se mantiene la barrera que bloquea un pago cuando no hay fondos.
- Se renovaron dos pruebas puntuales de versiones anteriores: el nombre actual `hasBaseSpin` y el esquema de configuración v14.
- Se creó prueba nueva de handpay contra `handpay-runtime.js`, con servidor simulado y tres escenarios. HTTP 500 conserva el saldo y el pago bloqueado; una respuesta perdida requiere verificación duradera.
- El paquete privado de parche QA tiene SHA256 `d209b5d0c1075c269cbc68a5fcd942740ec6f4c4ba880d842f0fcd4c011d2893`. **No publicarlo** en este repositorio.

## Qué sigue realmente pendiente
- **35 pruebas históricas todavía fallan** y deben permanecer visibles.
- No cambiar una expectativa antigua para forzar PASS sin comprobar el contrato actualizado.
- El test de operaciones presenta una discrepancia de huella histórica de `main.bundle.js`; no sustituir la huella silenciosamente.
- La distribución R7 contiene scripts antiguos con Shell Launcher; conservar el arranque simple KIOSKO V11 probado y crear su prueba sustitutiva en Windows.
- Las dos pruebas históricas de handpay no quedan reemplazadas automáticamente por los tres escenarios nuevos: todavía necesitan validación de sesiones largas y respuesta de servidor real.

## Seguridad
No se subió el juego, gráficos, estado monetario, licencias ni claves al repositorio público. Ningún cambio se instaló en equipos Windows. Una ejecución de las pruebas de política en GitHub **no valida el motor ni el periférico físico**.

Consulta el inventario resumido: [JSON de resultados](./r403-r7-modernization-2026-10-19.json).
