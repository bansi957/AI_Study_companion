const fs = require("fs");
const path = require("path");
const { PDFParse } = require("pdf-parse");

const uploadDir = path.join(__dirname, "../../uploads");

/**
 * Content & Structure Extraction Service
 * Reads the stored PDF from disk, extracts text per page preserving exact page provenance,
 * and compiles document statistics.
 */
class ExtractionService {
  /**
   * Extract content from a material's PDF file
   * @param {Object} material - The Material mongoose document
   * @returns {Promise<{ pages: Array<{ page: number, text: string }>, totalPages: number, totalCharacters: number, hasImages: boolean, ocrNeeded: boolean }>}
   */
  async extract(material) {
    if (!material || !material.filename) {
      throw new Error("Material or filename not specified for extraction");
    }

    const filePath = path.join(uploadDir, material.filename);

    // Verify physical file exists
    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
    } catch {
      throw new Error(`PDF file not found on disk: ${material.filename}`);
    }

    const fileBuffer = await fs.promises.readFile(filePath);

    // Parse PDF
    const parser = new PDFParse({ data: fileBuffer });
    try {
      const textResult = await parser.getText();
      const pages = (textResult.pages || []).map((p) => ({
        page: p.num,
        text: (p.text || "").trim(),
      }));

      const totalCharacters = pages.reduce((acc, curr) => acc + curr.text.length, 0);
      const totalPages = textResult.total || pages.length;

      // Detect if document might need OCR (e.g. pages exist but 0 text characters found)
      const ocrNeeded = totalPages > 0 && totalCharacters === 0;

      return {
        pages,
        totalPages,
        totalCharacters,
        hasImages: false, // Ready for future OCR/image extraction modules
        ocrNeeded,
      };
    } finally {
      await parser.destroy().catch(() => {});
    }
  }
}

module.exports = new ExtractionService();
