/*
 * Finds user-visible Spanish left in the frontend.
 *
 * Run: node scripts/scan-spanish.cjs   (from frontend/)
 * Exits non-zero if anything is found, so it can gate a commit or CI.
 *
 * This exists because the first sweep missed about thirty strings. That scanner
 * keyed on accented characters plus a short word list and examined one line at a
 * time, so unaccented JSX text sitting alone on its own line - "Ver detalle",
 * "Editar", "Mover a" - slipped straight through. Two changes fix that: a much
 * wider lexicon requiring TWO hits before flagging (one alone is too noisy,
 * since English shares "no", "la", "un"), and treating a line with no code
 * punctuation as a JSX text node in its own right.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "src");

/** Only the legacy redirect paths in App.tsx are expected to stay Spanish. */
const ALLOWED = [/\/(tareas|resumen|registro|recuperar-clave)/];

const WORDS = [
  "el","la","los","las","un","una","unos","unas","del","al","de","en","con","por","para",
  "que","como","pero","sin","sobre","entre","hasta","desde","cuando","donde","porque",
  "este","esta","estos","estas","ese","esa","eso","aqui","aca","alla","ahi",
  "se","su","sus","le","les","lo","mi","mis","tu","tus","vos","te","nos","ya","muy","mas",
  "ver","detalle","detalles","editar","eliminar","borrar","crear","guardar","cancelar",
  "cerrar","abrir","mover","fijar","fijada","fijado","quitar","agregar","enviar","buscar",
  "elegir","volver","entrar","salir","cargar","cargando","actualizar","cambiar","aprobar",
  "rechazar","aceptar","estado","estados","tarea","tareas","empleado","empleados",
  "usuario","nombre","correo","contrasena","clave","mensaje","mensajes","comentario",
  "comentarios","participante","participantes","integrante","integrantes","equipo",
  "pizarra","tablero","historial","resumen","reporte","reportes","periodo","fecha",
  "inicio","fin","duracion","acciones","solicitud","solicitudes","pendiente","pendientes",
  "terminada","terminado","curso","archiva","archivada","archivado","cuenta","cuentas",
  "rol","roles","jornada","actividad","conectado","desconectado","disponible","trabajando",
  "descanso","almuerzo","reunion","ausente","nueva","nuevo","todos","todas","ninguna",
  "ninguno","solo","puede","pueden","tiene","tienen","hay","son","estan","fue","sera",
  "debe","necesita","hace","todavia","legajo",
];
const LEXICON = new Set(WORDS);

function looksSpanish(text) {
  if (ALLOWED.some((rx) => rx.test(text))) return false;
  if (/[¿¡]/.test(text)) return true;
  // Lower-case only: an ALL-CAPS token is an enum value ("ADMIN", "SUPERVISOR"),
  // not prose.
  const words = text.match(/\b[a-záéíóúñ]{2,}\b/g) || [];
  let hits = 0;
  for (const w of words) if (LEXICON.has(w)) hits += 1;
  return hits >= 2 || /[áéíóúñ]/.test(text);
}

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.tsx?$/.test(entry.name)) files.push(full);
  }
})(ROOT);

let total = 0;
for (const file of files) {
  // The catalogue is the one place Spanish belongs.
  if (file.includes(`${path.sep}i18n${path.sep}`)) continue;

  const lines = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").split("\n");
  const hits = [];

  lines.forEach((line, index) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;

    const candidates = [
      ...(line.match(/"([^"]{4,})"/g) || []),
      ...(line.match(/'([^']{4,})'/g) || []),
      ...(line.match(/`([^`]{4,})`/g) || []),
    ].map((s) => s.slice(1, -1));

    // A JSX text node usually sits alone on its line, bracketed by tags on the
    // lines above and below. Anything with code punctuation is not text.
    const bare = line.trim();
    if (bare && !/[=(){};<>[\]./]/.test(bare) && /[a-zA-Z]/.test(bare)) {
      candidates.push(bare);
    }

    const bad = [...new Set(candidates.filter(looksSpanish))];
    if (bad.length) hits.push(`  ${index + 1}: ${bad.join(" | ")}`);
  });

  if (hits.length) {
    total += hits.length;
    console.log(`\n${path.relative(ROOT, file).replace(/\\/g, "/")}`);
    console.log(hits.join("\n"));
  }
}

console.log(total ? `\n${total} line(s) with Spanish left` : "\nno Spanish found");
process.exit(total ? 1 : 0);
