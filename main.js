const { chromium } = require("playwright");
const PDFMerger = require("pdf-merger-js").default;
const fs = require("fs");
const path = require("path");
const cliProgress = require("cli-progress");
const colors = require("colors");
require("dotenv").config({ quiet: true });

const config = {
  copyDate: "2025-12-23",
  targetDate: "2025-12-30",
  ignoreNames: [],
};

const merger = new PDFMerger();
const documentsDir = path.join(__dirname, "documents");
const outputFile = path.join(__dirname, "merged.pdf");

const LOGIN_URL =
  "https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?https://www1.sii.cl/cgi-bin/Portal001/mipeSelEmpresa.cgi?DESDE_DONDE_URL=OPCION%3D52%26TIPO%3D4";

const DOCUMENT_LIST_URL = `https://www1.sii.cl/cgi-bin/Portal001/mipeAdminDocsEmi.cgi?ORDEN=&NUM_PAG=1&recaptcha-response=&RUT_RECP=&FOLIO=&RZN_SOC=&TPO_DOC=&ESTADO=`;
const DOCUMENT_CODE_REGEX =
  /\/cgi-bin\/Portal001\/mipeGesDocEmi\.cgi\?ALL_PAGE_ANT=2&CODIGO=(\d+)/;
const DOCUMENT_URL =
  "https://www1.sii.cl/cgi-bin/Portal001/mipeGenFacEx.cgi?IGUAL=CODIGO&PTDC_CODIGO=52&VALOR=";

async function login(page) {
  await page.goto(LOGIN_URL);
  await page.getByRole("textbox", { name: "Ej:" }).fill(process.env.RUT);
  await page.locator("#clave").fill(process.env.CLAVE);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
}

async function getDocumentsCodes(page) {
  await page.waitForLoadState();
  await page.goto(
    DOCUMENT_LIST_URL +
      `&FEC_DESDE=${config.copyDate}&FEC_HASTA=${config.copyDate}`
  );
  const rows = await page.locator("#tablaDatos tr:has(td)").all();
  const rowsWithNames = await Promise.all(
    rows.map(async (row) => {
      const name = (await row.locator("td").nth(2).textContent())
        .split(" ")[0]
        .toLowerCase()
        .trim();
      return { row, name };
    })
  );
  const filteredRows = rowsWithNames
    .filter((row) => {
      return !config.ignoreNames.includes(row.name.toLowerCase());
    })
    .map((row) => row.row);
  const urls = await Promise.all(
    filteredRows.map((row) =>
      row.locator("td").first().locator("a").getAttribute("href")
    )
  );
  return urls.map((url) => DOCUMENT_CODE_REGEX.exec(url)[1]);
}

async function copyDocument(page, documentCode) {
  await page.goto(DOCUMENT_URL + documentCode);
  await page.bringToFront();
  await page
    .locator('select[name="cbo_dia_boleta"]')
    .selectOption(config.targetDate.split("-")[2]);
  await page
    .locator('select[name="cbo_mes_boleta"]')
    .selectOption(config.targetDate.split("-")[1]);
  await page
    .locator('select[name="cbo_anio_boleta"]')
    .selectOption(config.targetDate.split("-")[0]);
  await page.locator('input[name="EFXP_CIUDAD_RECEP"]').fill("OVALLE");
}

async function signDocument(page) {
  await page.getByRole("button", { name: "Validar y visualizar" }).click();
  await page.getByRole("button", { name: "Firmar" }).click();
  await page
    .getByRole("textbox", { name: "Ingrese la clave de su" })
    .fill(process.env.FIRMA);
  await page.getByRole("button", { name: "Firmar" }).click();
}

async function downloadDocument(page, context, documentCode) {
  const [newPage] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("link", { name: "Ver Documento" }).click(),
  ]);
  await newPage.waitForLoadState("networkidle");
  const pdfUrl = newPage.url();
  const response = await newPage.request.get(pdfUrl);
  const buffer = await response.body();
  fs.writeFileSync(`${documentsDir}/${documentCode}.pdf`, buffer);
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  await login(page);

  const codes = await getDocumentsCodes(page);
  console.log("Procesando documentos...");
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
    cliProgress.Presets.shades_classic
  );
  progressBar.start(codes.length, 0);

  for (const code of codes) {
    await copyDocument(page, code);
    await signDocument(page);
    await downloadDocument(page, context, code);
    progressBar.increment();
  }
  progressBar.stop();

  await browser.close();

  const files = fs.readdirSync(documentsDir);
  const pdfFiles = files.filter((file) => file.toLowerCase().endsWith(".pdf"));

  for (const file of pdfFiles) {
    const filePath = path.join(documentsDir, file);
    await merger.add(filePath, 1);
  }

  await merger.save(outputFile);

  for (const file of files) {
    const filePath = path.join(documentsDir, file);
    if (fs.lstatSync(filePath).isFile()) {
      fs.unlinkSync(filePath);
    }
  }
})();
