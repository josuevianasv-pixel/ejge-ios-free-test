# MME5 R40.3 — RayRabbit-inspired QA en repositorio PUBLICO

Este directorio contiene **exclusivamente infraestructura de pruebas** para Mo Mo Mummy. Se adapta la metodologia SDD/TDD y las compuertas de CI de [RayRabbit AI Engineering](https://github.com/rayrabbit-ai/ai-engineering) (MIT); **no es la instalacion completa del template original**.

**NO publicar** aqui el ZIP del juego, scripts originales del servidor, graficos, licencias, llaves, tokens, logs monetarios o datos de operadores. No modificar las maquinas reales ni el KIOSKO V11.

## Estado y alcance

- `public-policy`: valida reglas de cambios y su selftest. Si sale verde, **NO significa que el juego haya pasado pruebas**.
- `private-source`: solo al ejecutar manualmente el flujo, usa temporalmente una Release **privada** en `josuevianasv-pixel/game-capture-agent` y ejecuta sobre sus fuentes **22 regresiones dirigidas** con Node 22, ademas de revisar `runtime-integrity.json` y `CRITICAL_SHA256.txt`. Ante cualquier archivo ausente, FAIL o TIMEOUT, retorna fallo.
- La bateria historica puede contener tests antiguos; se etiqueta como exploratoria y no equivale a certificacion.
- No se suben fuentes, capturas ni reportes internos como artifacts publicos.

## Activar pruebas sobre fuente original

1. Guardar en una **Release PRIVADA** de `josuevianasv-pixel/game-capture-agent` un ZIP de laboratorio R40.3 R7, sin datos de dinero real, por ejemplo `MME5_R403_R7_RAYRABBIT_LAB_COMPLETO.zip`, con tag `mme5-rayrabbit-r403-r7`.
2. En el repo publico configurar el secreto Actions `MOMO_SOURCE_TOKEN` con un token **fine-grained Contents: Read**, acceso solo al repo privado. Si ya existe, reutilizarlo.
3. Una vez incorporado el workflow a `main`, abrir Actions > **MME5 | RayRabbit Inspired QA** > Run workflow y elegir la Release privada. GitHub solo publicara resultado resumido.

Si se ejecuta sin ZIP accesible o sin secreto, **fallara** con `SOURCE_REQUIRED`; nunca se anuncia un PASS falso.

## Especificacion de invariantes

Ver `contracts.md` y `AGENTS.md`. Una correccion monetaria debe ir con nueva prueba y especificacion. El CI no reemplaza revisión humana, prueba de hardware MEI, Windows LTSC, pruebas de 24/7 ni auditoria regulatoria.

**Nota R7:** una copia R7 anterior tenia un hash desactualizado de `www/engine-local.js` en `CRITICAL_SHA256.txt`; una prueba de integridad correcta lo marcara como FAIL hasta revisar y alinear el manifiesto del laboratorio. No modificar codigo ni hashes a ciegas.
