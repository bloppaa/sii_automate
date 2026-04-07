const fs = require("fs");

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    const obj = {};
    headers.forEach((h, i) => (obj[h] = values[i]));
    return obj;
  });
}

function getDaysInMonth(month, year) {
  return new Date(year, month, 0).getDate();
}

function getDayName(date) {
  const dias = [
    "domingo",
    "lunes",
    "martes",
    "miercoles",
    "jueves",
    "viernes",
    "sabado",
  ];
  return dias[date.getDay()];
}

function generate(month, year, inputPath, outputPath) {
  const raw = fs.readFileSync(inputPath, "utf8");
  const clients = parseCSV(raw);
  const daysInMonth = getDaysInMonth(month, year);

  let output = "alias,rut,precio,cantidad,fecha\n";

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dayName = getDayName(date);

    if (dayName === "domingo") continue;

    clients.forEach((client) => {
      const qty = Number(client[dayName] || 0);
      if (qty <= 0) return;

      const dateStr = new Date(year, month - 1, d).toISOString().slice(0, 10);
      output += `${client.alias},${client.rut},${client.precio},${qty},${dateStr}\n`;
    });
  }

  fs.writeFileSync(outputPath, output);
}

const [, , monthArg, yearArg] = process.argv;

if (!monthArg || !yearArg) {
  console.log("Uso: node generate.js <mes> <año>");
  console.log("Ejemplo: node generate.js 4 2026");
  process.exit(1);
}

const month = Number(monthArg);
const year = Number(yearArg);

if (!Number.isInteger(month) || month < 1 || month > 12) {
  console.error("Error: el mes debe ser un número entre 1 y 12.");
  process.exit(1);
}

if (!Number.isInteger(year) || year < 1) {
  console.error("Error: el año debe ser un número válido.");
  process.exit(1);
}

generate(month, year, "clients.csv", "output.csv");
