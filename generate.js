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

  let output = "alias,rut,precio,cantidad,dia,mes,anio\n";

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dayName = getDayName(date);

    if (dayName === "domingo") continue;

    clients.forEach((client) => {
      const qty = Number(client[dayName] || 0);
      if (qty <= 0) return;
      output += `${client.alias},${client.rut},${client.precio},${qty},${d},${month},${year}\n`;
    });
  }

  fs.writeFileSync(outputPath, output);
}

generate(2, 2026, "clients.csv", "output.csv");
