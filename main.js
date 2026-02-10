const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const cliProgress = require("cli-progress");
const colors = require("colors");
const prompt = require("prompt-sync")();
require("dotenv").config({ quiet: true });
const documentsDir = path.join(__dirname, "documents");

const LOGIN_URL =
  "https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?https://www1.sii.cl/cgi-bin/Portal001/mipeSelEmpresa.cgi?DESDE_DONDE_URL=OPCION%3D52%26TIPO%3D4";

const DOCUMENT_LIST_URL = `https://www1.sii.cl/cgi-bin/Portal001/mipeAdminDocsEmi.cgi?ORDEN=&NUM_PAG=1&recaptcha-response=&RUT_RECP=&FOLIO=&RZN_SOC=&TPO_DOC=52&ESTADO=`;
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

async function getDocumentsCodes(page, copyDate, ignoreNames) {
  await page.waitForLoadState();
  await page.goto(
    DOCUMENT_LIST_URL + `&FEC_DESDE=${copyDate}&FEC_HASTA=${copyDate}`,
  );
  const rows = await page.locator("#tablaDatos tr:has(td)").all();

  const rowsWithNames = [
    ...new Set(
      await Promise.all(
        rows.map(async (row) => {
          const name = (await row.locator("td").nth(2).textContent())
            .toLowerCase()
            .trim()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
          return { row, name };
        }),
      ),
    ),
  ];

  const filteredRows = rowsWithNames
    .filter((row) => {
      return !ignoreNames.some((ignoreName) => row.name.startsWith(ignoreName));
    })
    .map((row) => row.row);

  const urls = await Promise.all(
    filteredRows.map((row) =>
      row.locator("td").first().locator("a").getAttribute("href"),
    ),
  );

  return urls.map((url) => DOCUMENT_CODE_REGEX.exec(url)[1]);
}

async function copyDocument(page, documentCode, targetDate, changeNames) {
  await page.goto(DOCUMENT_URL + documentCode);
  await page.bringToFront();
  await page
    .locator('select[name="cbo_dia_boleta"]')
    .selectOption(targetDate.split("-")[2]);
  await page
    .locator('select[name="cbo_mes_boleta"]')
    .selectOption(targetDate.split("-")[1]);
  await page
    .locator('select[name="cbo_anio_boleta"]')
    .selectOption(targetDate.split("-")[0]);
  await page.locator('input[name="EFXP_CIUDAD_RECEP"]').fill("OVALLE");

  const inputName = await page
    .locator('input[name="EFXP_RZN_SOC_RECEP"]')
    .inputValue();
  const normalizedInputName = inputName
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const match = changeNames.find((item) =>
    normalizedInputName.startsWith(item.name),
  );

  if (match) {
    await page.locator('input[name="EFXP_QTY_01"]').fill(match.kilos);
  }
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

function configValues() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  let tomorrowDate = tomorrow.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  let [dd, mm, yyyy] = tomorrowDate.split("/");
  tomorrowDate = `${dd}-${mm}-${yyyy}`;
  const tomorrowInput = prompt(`Mañana: ${tomorrowDate} (Y/n) `);
  while (true) {
    if (tomorrowInput === "y" || tomorrowInput === "") {
      tomorrowDate = `${yyyy}-${mm}-${dd}`;
      break;
    } else if (tomorrowInput === "n") {
      const customDate = prompt("Otra fecha dd-mm-yyyy: ");
      [dd, mm, yyyy] = customDate.split("-");
      tomorrowDate = `${yyyy}-${mm}-${dd}`;
      break;
    }
  }

  const lastWeek = new Date(tomorrow);
  lastWeek.setDate(lastWeek.getDate() - 7);
  let lastWeekDate = lastWeek.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  [dd, mm, yyyy] = lastWeekDate.split("/");
  lastWeekDate = `${dd}-${mm}-${yyyy}`;
  const lastWeekInput = prompt(`Semana pasada: ${lastWeekDate} (Y/n) `);
  while (true) {
    if (lastWeekInput === "y" || lastWeekInput === "") {
      lastWeekDate = `${yyyy}-${mm}-${dd}`;
      break;
    } else if (lastWeekInput === "n") {
      const customDate = prompt("Otra fecha dd-mm-yyyy: ");
      [dd, mm, yyyy] = customDate.split("-");
      lastWeekDate = `${yyyy}-${mm}-${dd}`;
      break;
    }
  }

  let ignoreNames = [];
  const ignoreInput = prompt("Ignorar? (y/N) ");
  while (true) {
    if (ignoreInput === "n" || ignoreInput === "") {
      break;
    } else if (ignoreInput === "y") {
      const namesInput = prompt("Nombres: ");
      ignoreNames = namesInput
        .split(",")
        .map((name) => name.trim().toLowerCase());
      break;
    }
  }

  let changeNames = [];
  const changeInput = prompt("Cambiar? (y/N) ");
  while (true) {
    if (changeInput === "n" || changeInput === "") {
      break;
    } else if (changeInput === "y") {
      const namesInput = prompt("Nombres y kilos (nombre:kilos): ");
      changeNames = namesInput.split(",").map((pair) => {
        const [name, kilos] = pair
          .split(":")
          .map((str) => str.trim().toLowerCase());
        return { name, kilos };
      });
      break;
    }
  }

  return {
    tomorrowDate,
    lastWeekDate,
    ignoreNames,
    changeNames,
  };
}

(async () => {
  const { default: PDFMerger } = await import("pdf-merger-js");
  const merger = new PDFMerger();

  const { tomorrowDate, lastWeekDate, ignoreNames, changeNames } =
    configValues();

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  await login(page);

  const codes = await getDocumentsCodes(page, lastWeekDate, ignoreNames);

  const input = prompt(
    `Se procesarán ${codes.length} documentos. Continuar? (Y/n) `,
  );
  if (input !== "y" && input !== "") {
    console.log("Proceso cancelado");
    await browser.close();
    return;
  }

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
    cliProgress.Presets.shades_classic,
  );
  progressBar.start(codes.length, 0);

  for (const code of codes) {
    await copyDocument(page, code, tomorrowDate, changeNames);
    await signDocument(page);
    await downloadDocument(page, context, code);
    progressBar.increment();
  }
  progressBar.stop();

  await browser.close();

  const pdfs = fs
    .readdirSync(documentsDir)
    .filter((file) => file.endsWith(".pdf"))
    .map((file) => path.join(documentsDir, file));

  for (const pdf of pdfs) {
    await merger.add(pdf, 1);
  }

  await merger.save("merged.pdf");

  for (const file of fs.readdirSync(documentsDir)) {
    fs.unlinkSync(path.join(documentsDir, file));
  }

  console.log(colors.green("Proceso completado"));
})();
