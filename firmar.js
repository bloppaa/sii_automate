const { chromium } = require("playwright");
const fs = require("fs");

const copyDate = "2025-12-18";
const targetDate = "2025-12-21";
const documentListUrl = `https://www1.sii.cl/cgi-bin/Portal001/mipeAdminDocsEmi.cgi?ORDEN=&NUM_PAG=1&recaptcha-response=&RUT_RECP=&FOLIO=&RZN_SOC=&FEC_DESDE=${copyDate}&FEC_HASTA=${copyDate}&TPO_DOC=&ESTADO=`;

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  // Inicio de sesión
  await page.goto(
    "https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?https://www1.sii.cl/cgi-bin/Portal001/mipeSelEmpresa.cgi?DESDE_DONDE_URL=OPCION%3D52%26TIPO%3D4"
  );
  await page.getByRole("textbox", { name: "Ej:" }).fill("8196476-9");
  await page.locator("#clave").fill("CUELLAR2");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();

  // Lista  de documentos
  await page.waitForURL(
    "https://www1.sii.cl/cgi-bin/Portal001/mipeGenFacEx.cgi?PTDC_CODIGO=52"
  );
  await page.goto(documentListUrl);

  // Copiar documento
  await page.goto(
    "https://www1.sii.cl/cgi-bin/Portal001/mipeAdminDocsEmi.cgi?ORDEN=&NUM_PAG=1&recaptcha-response=&RUT_RECP=&FOLIO=&RZN_SOC=&FEC_DESDE=2025-12-18&FEC_HASTA=2025-12-18&TPO_DOC=&ESTADO="
  );
  await page
    .getByRole("row", { name: "13330529-7 JASNA IVONNES" })
    .getByRole("link")
    .click();
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

  // Firmar documento
  await page.getByRole("button", { name: "Validar y visualizar" }).click();
  await page.getByRole("button", { name: "Firmar" }).click();
  await page
    .getByRole("textbox", { name: "Ingrese la clave de su" })
    .fill("ccmpanaderia2409");
  await page.getByRole("button", { name: "Firmar" }).click();

  // Descargar documento
  const [newPage] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("link", { name: "Ver Documento" }).click(),
  ]);
  await newPage.waitForLoadState("networkidle");
  const pdfUrl = newPage.url();
  const response = await newPage.request.get(pdfUrl);
  const buffer = await response.body();
  fs.writeFileSync("documento.pdf", buffer);

  await browser.close();
})();
