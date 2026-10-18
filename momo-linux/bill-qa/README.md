# MME5 | Billetero virtual en GitHub Actions Windows (PUBLICO)

Este subdirectorio contiene solo scripts de pruebas. El juego original, ZIP, graficos, licencias, claves, seriales y estado monetario NO se suben a este repositorio publico.

Workflow: [MME5 | Virtual Bill Windows QA](../../.github/workflows/mme5-virtual-bill-windows.yml).

## Primera configuracion (una vez)

1. En el repositorio PRIVADO josuevianasv-pixel/game-capture-agent, crea una Release privada con etiqueta **mme5-bill-virtual-assets**. Adjunta **MME5_AREA1_BILLETERO_VIRTUAL_DURABILIDAD_LAB_COMPLETO.zip**, nunca una carpeta de produccion con dinero. SHA256 de la referencia preparada: 48c33439888a87157243da6a399e6672326ca5a9a7a7b9c743f84b0124beec02.
2. En este repositorio publico, ve a **Settings > Secrets and variables > Actions**. Configura el secreto **MOMO_SOURCE_TOKEN** con un token de lectura minima de **Contents: Read** para el repositorio privado. Si el flujo anterior de MoMo Linux ya lo tiene configurado, reutiliza ese mismo nombre. No pegues tokens en codigo ni en un chat.
3. Abre [Actions del laboratorio Windows](https://github.com/josuevianasv-pixel/ejge-ios-free-test/actions/workflows/mme5-virtual-bill-windows.yml), pulsa **Run workflow** en main, acepta la etiqueta y el nombre de archivo que vienen por defecto.
4. Revisa la ejecucion y descarga el artifact **mme5-windows-virtual-bill-qa** con el archivo **bill-qa-summary.json**.

## Pruebas con el codigo original (no un emulador reescrito)

- Compilacion del C# nativo VirtualBillAcceptorNative.cs.
- Insercion virtual, ACK y reintento del mismo ID antes y despues del reinicio del controlador.
- Error de guardado: inhibir lector, rechazar ACK y recuperar historial.
- Error de guardado durante ACK.
- Stacker retirado y vuelto a instalar.
- Historial corrupto: fallar cerrado, sin sobrescribir el archivo danado.
- Protocolos virtuales EBDS, ID003 y PULSE.
- Compilacion completa del servidor C# con Windows PowerShell 5.1.
- Arranque del servidor, fallo de disco simulado por HTTP y recuperacion tras reiniciarlo.

## Resultados honestos

Si falta la Release, el token o el ZIP esperado, la ejecucion falla como SOURCE_REQUIRED o INVALID_SOURCE y NO afirma que se probo el juego. Si el servidor C# no compila o no inicia, tambien falla.

Los reportes publicos incluyen solo resultados sinteticos PASS/FAIL; no incluyen ZIP, codigo del juego, tokens, capturas ni estados monetarios. La maquina temporal usa Windows Server 2022 y no altera Windows LTSC de produccion. Los runners estandar publicos de GitHub Actions son gratuitos, sujetos a politicas de uso y limites de almacenamiento.

LIMITES: estas pruebas no certifican MEI SCN6607 fisico, puerto COM, stacker electrico, doble monitor ni Windows LTSC. Nunca habilitar manejo de dinero real basandose solo en los ensayos virtuales. Los 40 fallos historicos de Node.js siguen fuera del alcance de este flujo.
