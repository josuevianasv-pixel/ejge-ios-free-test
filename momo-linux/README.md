# Mo Mo Mummy — Linux R2 en GitHub Actions (repositorio público)

**Este repositorio público contiene solamente herramientas de prueba. No publicar aquí el juego, su ZIP, gráficos, licencias ni datos de las máquinas.** La ejecución usa Ubuntu 24.04 con Chromium sin interfaz y saldo ficticio.

## Primera comprobación: infraestructura
Al subir la rama `momo-linux-public-runner`, GitHub Actions prueba el runner Linux y el navegador. Aunque no haya ZIP disponible, deja el estado **WAITING_PRIVATE_SOURCE**; un workflow verde en esa situación **no significa** que Mo Mo Mummy cargó.

[Ver las ejecuciones](https://github.com/josuevianasv-pixel/ejge-ios-free-test/actions/workflows/momo-linux-public.yml)

## Para probar el juego realmente en GitHub
1. En el repositorio **privado** `josuevianasv-pixel/game-capture-agent`, crea una Release privada con etiqueta `momo-linux-r2-assets` y agrega `MoMoMummy_Linux_HD4600_Visual_R1.zip` (o el ZIP original Windows solo para prueba de motor). Publicar releases en ese repositorio privado no convierte los recursos en públicos.
2. Crea un **token de GitHub de alcance mínimo** (idealmente fine-grained; permiso de contenido de lectura) para ese repositorio privado.
3. En el repositorio público abre **Settings > Secrets and variables > Actions > New repository secret**, nombre `MOMO_SOURCE_TOKEN` y pega el token. Nunca pegues el token en un archivo del repositorio ni en los logs.
4. Abre **Actions > MoMo Linux | Public Runner QA > Run workflow** y selecciona la rama `momo-linux-public-runner`.

El runner descargará de manera temporal el ZIP privado, ejecutará el motor JavaScript del usuario con créditos simulados y, para el paquete Linux Visual R1, intentará cargar el juego con Chromium. Solo se publicarán diagnósticos sanitizados; ninguna captura ni archivo gráfico formará parte de los artifacts públicos.

**LIMITACIONES:** Sin token o release, solo se comprueba el runner. Una captura con canvas tampoco prueba que los giros visuales y el servidor local estén completamente operativos. No se prueban dispositivos físicos, GPUs HD4600 reales, RNG regulado ni dinero real.
