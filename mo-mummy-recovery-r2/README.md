# Mo Mummy — recuperación R2 (LABORATORIO)
Este directorio contiene una capa de recuperación transaccional aislada, NO el motor original de Mo Mummy y NO el Worker publicado.
## Pruebas sin computadora
1. En GitHub cambiá a la rama `lab/mo-mummy-recovery-r2`.
2. Abrí **Actions** y seleccioná **Mo Mummy R2 - recovery lab tests**.
3. Abrí una ejecución (si no aparece, pulsá **Run workflow**, seleccionando esa misma rama).
4. La salida del job **test** presenta los casos y sus resultados.
## Despliegue futuro (no automático)
Este prototipo usa Durable Objects SQLite y `LAB_API_KEY` (un secreto que no debe incluirse en el repositorio). La prueba de GitHub Actions NO despliega Cloudflare ni exige tus credenciales. Para instalarlo en Cloudflare hará falta integrar los recursos del Worker real y configurar el secreto fuera de GitHub.
Endpoints protegidos: `/__ejge_rng_lab/play`, `/status`, `/ack`, todos POST con un identificador por máquina.
## Limitaciones
Los créditos, resultados y premios son **ficticios**. No existe integración CometD/WS, matemática ni paytable real; la persistencia DO todavía no está validada mediante pruebas de ejecución de Cloudflare. No usar con apuestas reales ni reemplazar el Worker actual.
