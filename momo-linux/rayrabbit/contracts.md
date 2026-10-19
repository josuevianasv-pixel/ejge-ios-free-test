# Contratos MME5 R40.3 R7 — especificacion QA, NO certificacion

Escenarios que las pruebas deben cubrir antes de modificar el juego:

- **Billete duplicado:** Given un ID de aceptacion ya procesado, When el dispositivo repite el mismo evento, Then credito y Bill-In se aplican una sola vez.
- **ACK durable:** Given fallo de persistencia, When llega una aceptacion, Then no se emite un ACK exitoso ni se incrementa dinero como confirmado.
- **Reinicio:** Given aceptacion pendiente, When se reinicia servidor o dispositivo, Then la reconciliacion conserva historial sin duplicar credito.
- **Estado corrupto:** Given archivo monetario existente e ilegible, When arranca el juego, Then se bloquean movimientos; nunca se reconstruye silenciosamente como cero.
- **Doble PLAY:** Given dos PLAY solapados, When se intenta una apuesta, Then como maximo hay un debito y una ronda por identificador de giro.
- **WIN pendiente:** Given una ronda ganadora, When termina la animacion, Then WIN no se incorpora dos veces; se liquida segun la transicion confirmada.
- **Handpay/cashout:** Given confirmacion anterior repetida, When vuelve un request de cobro, Then no se paga por segunda vez.
- **Jackpots:** Given un premio en curso, When reinicia servidor, Then no se duplica ni desaparece el valor.
- **Kiosko:** Given arranque Windows 10 LTSC, When inicia sesion MME5, Then el escritorio + tarea ejecuta RUN.bat sin Shell Launcher y mantiene foco en juego inferior.
- **Corte de energia:** Given un giro pagado sin commit durable, When cae el sistema, Then no libera un resultado no persistido.

No considerar estos contratos validados por leer este documento. Requieren casos automatizados y ensayos fisicos.
