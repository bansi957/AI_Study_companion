const fs = require("fs");
const path = require("path");
const { PDFParse } = require("pdf-parse");

/**
 * PDF Service
 * Low-level PDF extraction wrapper using pdf-parse.
 * Handles extracting page-level text, table representations, embedded images, and metadata.
 */
class PdfService {
  /**
   * Read and parse a PDF file from disk or buffer
   *
   * @param {string|Buffer} source - Absolute file path or Buffer of the PDF
   * @returns {Promise<{
   *   totalPages: number,
   *   pages: Array<{ page: number, text: string }>,
   *   tables: Array<{ page: number, tables: Array<any> }>,
   *   images: Array<{ page: number, images: Array<any> }>,
   *   info: Object
   * }>}
   */
  async parsePdf(source) {
    let fileBuffer;

    if (Buffer.isBuffer(source)) {
      fileBuffer = source;
    } else if (typeof source === "string") {
      try {
        await fs.promises.access(source, fs.constants.R_OK);
      } catch {
        throw new Error(`PDF file not accessible on disk: ${source}`);
      }
      fileBuffer = await fs.promises.readFile(source);
    } else {
      throw new Error("Invalid PDF source: expected file path string or Buffer");
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error("PDF file is empty (0 bytes)");
    }

    const parser = new PDFParse({ data: fileBuffer });

    try {
      // 1. Extract text and page numbers
      const textResult = await parser.getText();
      const rawPages = textResult.pages || [];
      const totalPages = textResult.total || rawPages.length;

      const pages = rawPages.map((p) => ({
        page: p.num,
        text: this.cleanText(p.text || ""),
      }));

      // 2. Extract tables safely
      let tables = [];
      try {
        const tableResult = await parser.getTable();
        if (tableResult && Array.isArray(tableResult.pages)) {
          tables = tableResult.pages.map((p) => ({
            page: p.num,
            tables: Array.isArray(p.tables) ? p.tables : [],
          }));
        }
      } catch (err) {
        // Soft-fail on table extraction so text remains intact
        tables = [];
      }

      // 3. Extract embedded images safely
      let images = [];
      try {
        const imageResult = await parser.getImage();
        if (imageResult && Array.isArray(imageResult.pages)) {
          images = imageResult.pages.map((p) => ({
            page: p.pageNumber || p.num,
            images: Array.isArray(p.images) ? p.images : [],
          }));
        }
      } catch (err) {
        images = [];
      }

      // 4. Extract PDF info/metadata safely
      let info = {};
      try {
        const infoResult = await parser.getInfo();
        if (infoResult && infoResult.info) {
          info = {
            formatVersion: infoResult.info.PDFFormatVersion || "unknown",
            title: infoResult.info.Title || null,
            author: infoResult.info.Author || null,
            creator: infoResult.info.Creator || null,
            producer: infoResult.info.Producer || null,
            creationDate: infoResult.info.CreationDate || null,
          };
        }
      } catch (err) {
        info = {};
      }

      return {
        totalPages,
        pages,
        tables,
        images,
        info,
      };
    } finally {
      await parser.destroy().catch(() => {});
    }
  }

  /**
   * Render a specific page as an image buffer for OCR processing
   *
   * @param {string|Buffer} source - File path or Buffer
   * @param {number} pageNumber - 1-based page number
   * @returns {Promise<{ data: Buffer, width: number, height: number }|null>}
   */
  async renderPageImage(source, pageNumber) {
    let fileBuffer;
    if (Buffer.isBuffer(source)) {
      fileBuffer = source;
    } else {
      fileBuffer = await fs.promises.readFile(source);
    }

    const parser = new PDFParse({ data: fileBuffer });
    try {
      // Use partial: [pageNumber] and scale: 1.5 for crisp OCR rendering
      const screenshotResult = await parser.getScreenshot({
        imageBuffer: true,
        partial: [pageNumber],
        scale: 1.5,
      });

      if (screenshotResult && Array.isArray(screenshotResult.pages) && screenshotResult.pages.length > 0) {
        const pageItem = screenshotResult.pages[0];
        const dataBuffer = Buffer.isBuffer(pageItem.data)
          ? pageItem.data
          : Buffer.from(pageItem.data);

        return {
          data: dataBuffer,
          width: pageItem.width,
          height: pageItem.height,
        };
      }
      return null;
    } finally {
      await parser.destroy().catch(() => {});
    }
  }

  /**
   * Clean and normalize raw extracted text
   *
   * @param {string} text
   * @returns {string}
   */
  cleanText(text) {
    if (!text || typeof text !== "string") return "";

    return text
      // Normalize Unicode characters (e.g. smart quotes, ligatures)
      .normalize("NFKC")
      // Replace non-breaking spaces with standard space
      .replace(/\u00A0/g, " ")
      // Replace carriage returns
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      // Remove null bytes
      .replace(/\0/g, "")
      // Trim surrounding whitespace
      .trim();
  }
}

module.exports = new PdfService();
