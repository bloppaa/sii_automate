const { chromium } = require("playwright");
const fs = require("fs");
require("dotenv").config();

const LOGIN_URL =
  "https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?https://www1.sii.cl/cgi-bin/Portal001/mipeSelEmpresa.cgi?DESDE_DONDE_URL=OPCION%3D52%26TIPO%3D4";
const HOME_URL =
  "https://www1.sii.cl/cgi-bin/Portal001/mipeGenFacEx.cgi?PTDC_CODIGO=52";
const DOCUMENT_LIST_URL = `https://www1.sii.cl/cgi-bin/Portal001/mipeAdminDocsEmi.cgi?ORDEN=&NUM_PAG=1&recaptcha-response=&RUT_RECP=&FOLIO=&RZN_SOC=&TPO_DOC=&ESTADO=`;

async function login(page) {
  await page.goto(LOGIN_URL);
  await page.getByRole("textbox", { name: "Ej:" }).fill(process.env.RUT);
  await page.locator("#clave").fill(process.env.CLAVE);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
}

async function listDocuments(page, copyDate) {
  await page.waitForURL(HOME_URL);
  await page.goto(
    DOCUMENT_LIST_URL + `&FEC_DESDE=${copyDate}&FEC_HASTA=${copyDate}`
  );
  const rows = await page.locator("#tablaDatos td.sorting_1 a").all();
  const targets = rows.map((row) => row.());
}

async function copyDocument(page, targetDate) {
  await page.getByRole("link", { name: "Copiar Documento" }).click();
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
}

async function signDocument(page) {
  await page.getByRole("button", { name: "Validar y visualizar" }).click();
  await page.getByRole("button", { name: "Firmar" }).click();
  await page
    .getByRole("textbox", { name: "Ingrese la clave de su" })
    .fill(process.env.FIRMA);
  await page.getByRole("button", { name: "Firmar" }).click();
}

async function downloadDocument(page) {
  const [newPage] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("link", { name: "Ver Documento" }).click(),
  ]);
  await newPage.waitForLoadState("networkidle");
  const pdfUrl = newPage.url();
  const response = await newPage.request.get(pdfUrl);
  const buffer = await response.body();
  fs.writeFileSync("documento.pdf", buffer);
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  await login(page);
  await listDocuments(page, "2025-12-18");
  await copyDocument(page, "2025-12-21");
  // await signDocument(page);
  // await downloadDocument(page);

  await page.pause();
  await browser.close();
})();
