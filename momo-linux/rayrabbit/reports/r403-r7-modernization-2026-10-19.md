# MME5 R40.3 R7 — Modernización de QA (19 octubre 2026)

**Resultados reales obtenidos localmente en Linux/Node 22; no son pruebas de producción ni significan que el ZIP R7 se haya ejecutado dentro de GitHub.**

| Comprobación | Antes | Después |
|---|---:|---:|
| Suite histórica, pruebas aprobadas | 179/216 | **189/216** |
| Suite histórica, pruebas fallidas | 37 | **27** |
| Regresiones seleccionadas | 22/22 | **22/22** |
| Integridad de archivos QA | 142/142 | **142/142** |
| Pruebas de jackpots forzados | 0/2 | **2/2** |
| Tests históricos modernizados por completo | 0 | **8** |
| Smoke tests de contratos actuales | — | **10/10** |
| Handpay: OK, respuesta perdida, error HTTP 500 | — | **3/3** |

## Cambios implementados solo en la copia privada de laboratorio

Se corrigió la ruta QA `reserveQaProgressive()`: el monto visible se calcula **antes** de asignar la reserva sintética, sin eliminar la barrera de fondos de `progressiveAward()`. Esto permite que `qa-center-selftest.js` y `qa-progressive-force-h25-selftest.js` finalicen correctamente.

Se actualizaron **ocho pruebas históricas**, con el resto de sus comprobaciones conservadas:

- `h96-r14-bet-play-selftest.js`: guarda actual `hasBaseSpin`.
- `h96-r25-stable-borderless-selftest.js` y `r32-gt210-r28-current-selftest.js`: runtime gráfico actual.
- `h96-r7-paytable-visible-selftest.js`: apertura nativa actual sin recursión.
- `layout-director-selftest.js`: preservación de buffer condicional.
- `r37-audit-regression-selftest.js`: normalización de financiación y versión v14.
- `r37s3-video-longrun-selftest.js`: marca actual de controlador gráfico.
- `touch-layout-selftest.js`: transformación de HUD mediante variable sin perder la matriz geométrica.

Nuevas pruebas adicionales: 10 contratos de juego y tres situaciones de handpay usando el runtime original con servidor ficticio. Las **dos pruebas antiguas de handpay** siguen fallando; los nuevos casos todavía no sustituyen por completo esas sesiones largas.

## Fallos históricos pendientes: 27

| Área | Pendientes |
|---|---:|
| Monetario y liquidaciones | 7 |
| Jackpot y progresivos | 10 |
| Motor y protocolo de giros | 3 |
| Pantallas, WMS y kiosko | 6 |
| Diagnóstico y operación | 1 |

**No descartar** todavía la antigua prueba de kiosko: el ZIP contiene scripts Shell Launcher y requiere un sustituto de V11 probado en Windows. El `main.bundle.js` actual difiere de la referencia histórica usada por la prueba de operaciones; no se cambió su hash para hacerla pasar.

El paquete privado de parche QA fue preparado localmente (SHA-256: `0740e7f8136e697f9795a93b7f5412b358440facb97b06f7fa36bc94c9b85607`). No publicar su contenido —incluye el runtime del juego— en GitHub público ni instalarlo en `C:\MME5`.

**Estado de liberación:** bloqueado. No probado Windows LTSC físico, MEI/CPI RS-232 ni operación con dinero. Resultados estructurados en [JSON](./r403-r7-modernization-2026-10-19.json).
