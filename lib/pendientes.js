/**
 * Qué te falta del día que tienes en curso.
 * Vive aparte porque lo usan dos mundos: el navegador (alarma con la app abierta)
 * y el servidor (recordatorio con la app cerrada). Una sola definición, sin copias
 * que se desincronicen.
 */
export function pendientesDe(data) {
  const c = data?.current || {};
  const a = data?.alarm || {};
  const out = [];

  if (a.goals) {
    const faltan = (c.goals || []).filter((g) => !g.done).length;
    if (faltan > 0) out.push(faltan === 1 ? "1 objetivo sin cumplir" : `${faltan} objetivos sin cumplir`);
  }
  if (a.reading) {
    const meta = data?.reading?.plannedMinutes || 0;
    const leido = c.readingMinutes || 0;
    if (meta > 0 && leido < meta) out.push(`Lectura: ${leido}/${meta} min`);
  }
  if (a.german && !c.german?.done) out.push("Alemán sin estudiar");

  return out;
}
