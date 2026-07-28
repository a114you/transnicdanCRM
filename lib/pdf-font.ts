import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { jsPDF } from "jspdf";

const bundledRegularPath = join(process.cwd(), "public", "fonts", "NotoSans-Regular.ttf");
const bundledBoldPath = join(process.cwd(), "public", "fonts", "NotoSans-Bold.ttf");

const systemRegularPaths = [
  "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
  "/System/Library/Fonts/Supplemental/Arial Unicode MS.ttf",
  "/Library/Fonts/Arial Unicode.ttf",
  "/Library/Fonts/Arial Unicode MS.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
];

const systemBoldPaths = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
];

function firstExisting(paths: string[]) {
  return paths.find((fontPath) => existsSync(fontPath));
}

export function configureUnicodePdfFont(doc: jsPDF, fontName = "PdfUnicode") {
  const regularPath = firstExisting([bundledRegularPath, ...systemRegularPaths]);
  if (!regularPath) {
    doc.setFont("helvetica", "normal");
    return "helvetica";
  }

  const boldPath = firstExisting([bundledBoldPath, ...systemBoldPaths]);
  doc.addFileToVFS(`${fontName}-Regular.ttf`, readFileSync(regularPath).toString("base64"));
  doc.addFont(`${fontName}-Regular.ttf`, fontName, "normal");

  if (boldPath) {
    doc.addFileToVFS(`${fontName}-Bold.ttf`, readFileSync(boldPath).toString("base64"));
    doc.addFont(`${fontName}-Bold.ttf`, fontName, "bold");
  } else {
    doc.addFont(`${fontName}-Regular.ttf`, fontName, "bold");
  }

  doc.setFont(fontName, "normal");
  return fontName;
}
