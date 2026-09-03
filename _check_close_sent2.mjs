import { query } from './src/config/database.js';
const r = await query(`
  SELECT m1.conversacion_id, m1.mensaje_id AS id1, m2.mensaje_id AS id2,
         LEFT(m1.contenido,60) AS c1, LEFT(m2.contenido,60) AS c2,
         m1.fecha_hora AS t1, m2.fecha_hora AS t2,
         EXTRACT(EPOCH FROM (m2.fecha_hora - m1.fecha_hora)) AS diff_seconds
  FROM mensajes m1
  JOIN mensajes m2 ON m1.conversacion_id = m2.conversacion_id
    AND m2.mensaje_id > m1.mensaje_id
    AND m1.direccion = 'saliente' AND m2.direccion = 'saliente'
    AND m2.fecha_hora - m1.fecha_hora < INTERVAL '3 minutes'
  ORDER BY m1.fecha_hora DESC
  LIMIT 20
`);
console.log('count:', r.rows.length);
console.log(JSON.stringify(r.rows, null, 2));
process.exit(0);
