const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const cliProgress = require("cli-progress");
const colors = require("colors");
require("dotenv").config({ quiet: true });
const documentsDir = path.join(__dirname, "documents");

const LOGIN_URL =
  "https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?https://www1.sii.cl/cgi-bin/Portal001/mipeSelEmpresa.cgi?DESDE_DONDE_URL=OPCION%3D52%26TIPO%3D4";
const DOCUMENT_EDIT_URL =
  "https://www1.sii.cl/cgi-bin/Portal001/mipeGenFacEx.cgi?PTDC_CODIGO=52";

/**
 * Login al sitio del SII usando las credenciales almacenadas en las variables de entorno.
 * @param {*} page
 */
async function login(page) {
  await page.goto(LOGIN_URL);
  await page.getByRole("textbox", { name: "Ej:" }).fill(process.env.RUT);
  await page.locator("#clave").fill(process.env.CLAVE);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
}

/**
 * Función principal que procesa cada documento: llena los datos, firma y descarga el PDF.
 * @param {*} page
 * @param {*} context
 * @param {*} client Cliente con los datos necesarios para llenar el documento.
 */
async function processDocument(page, context, client) {
  await fillDocument(page, client);
  await signDocument(page);
  await downloadDocument(page, context, client);
}

/**
 * Rellena el formulario del documento con los datos del cliente.
 * @param {*} page
 * @param {*} client
 */
async function fillDocument(page, client) {
  await page.waitForLoadState();
  await page.goto(DOCUMENT_EDIT_URL);
  await page.bringToFront();

  await page.locator('input[name="EFXP_RUT_RECEP"]').fill(client.rut);
  const dvInput = page.locator('input[name="EFXP_DV_RECEP"]');
  await dvInput.fill(client.dv);

  // Escuchar la respuesta a la solicitud que se hace al ingresar el RUT del cliente.
  // Una vez que llega la respuesta se reemplazan ciertos datos, por lo que hay que esperar
  // a que llegue antes de continuar con el llenado del formulario.
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("mipeGenFacEx.cgi") && response.status() === 200,
    { timeout: 10000 },
  );

  await dvInput.press("Enter");
  await responsePromise;

  // Una vez que llega la respuesta se reemplazan los datos del cliente
  await page.locator('select[name="cbo_dia_boleta"]').selectOption(client.dia);
  await page.locator('select[name="cbo_mes_boleta"]').selectOption(client.mes);
  await page
    .locator('select[name="cbo_anio_boleta"]')
    .selectOption(client.anio);

  await page.locator('input[name="EFXP_CIUDAD_RECEP"]').fill("OVALLE");

  await page.locator('input[name="EFXP_NMB_01"]').fill("PAN");
  await page.locator('input[name="EFXP_QTY_01"]').fill(client.cantidad);
  await page.locator('input[name="EFXP_UNMD_01"]').fill("KG");
  await page.locator('input[name="EFXP_PRC_01"]').fill(client.precio);
}

/**
 * Firma el documento usando la clave almacenada en las variables de entorno.
 * @param {*} page
 */
async function signDocument(page) {
  await page.getByRole("button", { name: "Validar y visualizar" }).click();
  await page.getByRole("button", { name: "Firmar" }).click();
  await page
    .getByRole("textbox", { name: "Ingrese la clave de su" })
    .fill(process.env.FIRMA);
  await page.getByRole("button", { name: "Firmar" }).click();
}

/**
 * Descarga el documento firmado como archivo PDF.
 * @param {*} page
 * @param {*} context
 * @param {*} client
 */
async function downloadDocument(page, context, client) {
  const [newPage] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("link", { name: "Ver Documento" }).click(),
  ]);
  await newPage.waitForLoadState("networkidle");
  const pdfUrl = newPage.url();
  const response = await newPage.request.get(pdfUrl);
  const buffer = await response.body();
  fs.writeFileSync(`${documentsDir}/${client.rut}.pdf`, buffer);
  await newPage.close();
}

/**
 * Obtiene la fecha de mañana en formato ISO respecto a la zona horaria local.
 * @returns Fecha de mañana en formato "YYYY-MM-DD".
 */
function getTomorrowLocalISO() {
  const today = new Date();
  const tomorrow = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + 1,
  );

  const year = tomorrow.getFullYear();
  const month = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const day = String(tomorrow.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Lee el archivo CSV con los datos de los clientes y filtra solo aquellos que tienen fecha de mañana.
 * @param {*} csvPath
 * @returns Lista de clientes con fecha de mañana y sus datos necesarios para procesar el documento.
 */
function readTomorrow(csvPath) {
  const raw = fs.readFileSync(path.join(__dirname, csvPath), "utf8");
  const lines = raw.trim().split("\n");
  const tomorrow = getTomorrowLocalISO();

  const results = [];

  for (let i = 1; i < lines.length; i++) {
    const [alias, fullRut, precio, cantidad, fecha] = lines[i].split(",");
    const [rut, dv] = fullRut.replace(/\./g, "").split("-");

    if (fecha !== tomorrow) continue;

    const [anio, mes, dia] = fecha.split("-");

    results.push({
      alias: alias.trim(),
      rut: rut.trim(),
      dv: dv.trim(),
      precio: precio.trim(),
      cantidad: cantidad.trim(),
      dia: dia.trim(),
      mes: mes.trim(),
      anio: anio.trim(),
    });
  }

  return results;
}

(async () => {
  const { default: PDFMerger } = await import("pdf-merger-js");
  const merger = new PDFMerger();

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  await login(page);

  // TODO: Implementar fecha personalizada pasada como argumento por consola
  const tomorrowClients = readTomorrow("output.csv");

  const progressBar = new cliProgress.SingleBar(
    {
      format:
        "Progreso [" +
        colors.cyan("{bar}") +
        "] {percentage}% || {value}/{total} Documentos || ETA: {eta_formatted}",
      barCompleteChar: "\u2588",
      barIncompleteChar: "\u2591",
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic,
  );
  progressBar.start(tomorrowClients.length, 0);

  for (const client of tomorrowClients) {
    await processDocument(page, context, client);
    progressBar.increment();
  }
  progressBar.stop();

  await browser.close();

  // Combina todos los PDFs descargados en un solo archivo "merged.pdf"
  // Solo se combina la primera página de cada PDF
  const pdfs = fs
    .readdirSync(documentsDir)
    .filter((file) => file.endsWith(".pdf"))
    .map((file) => path.join(documentsDir, file));

  for (const pdf of pdfs) {
    await merger.add(pdf, 1);
  }

  await merger.save(path.join(__dirname, "merged.pdf"));

  // Elimina los PDFs individuales después de combinarlos
  for (const file of fs.readdirSync(documentsDir)) {
    fs.unlinkSync(path.join(documentsDir, file));
  }

  console.log(colors.green("Proceso completado"));
})();
