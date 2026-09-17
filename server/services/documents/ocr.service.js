const Tesseract = require("tesseract.js");

/**
 * OCR Service
 * Handles optical character recognition for scanned/image-only PDF pages.
 * Integrates Tesseract.js (pure JS/Wasm engine, no native external dependencies required).
 */
class OcrService {
  constructor() {
    // Minimum character/word threshold to consider a page as having meaningful text
    this.minTextLength = 25;
    this.minWordCount = 4;
  }

  /**
   * Determine if a page requires OCR
   * Returns true if normal PDF text extraction yielded little or no meaningful text.
   *
   * @param {string} pageText - Text returned from normal PDF extraction
   * @returns {boolean}
   */
  isScannedPage(pageText) {
    if (!pageText || typeof pageText !== "string") {
      return true;
    }

    const trimmed = pageText.trim();
    if (trimmed.length < this.minTextLength) {
      return true;
    }

    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length < this.minWordCount) {
      return true;
    }

    return false;
  }

  /**
   * Run OCR on a page image buffer
   *
   * @param {Buffer|Uint8Array} imageBuffer - Raw image buffer (PNG, JPEG, or Uint8Array)
   * @param {number} pageNumber - Page number for logging
   * @returns {Promise<{ text: string, confidence: number }>}
   */
  async ocrPage(imageBuffer, pageNumber) {
    if (!imageBuffer || imageBuffer.length === 0) {
      return { text: "", confidence: 0 };
    }

    try {
      const buffer = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer);
      const result = await Tesseract.recognize(buffer, "eng", {
        logger: () => {}, // Suppress progress spam in server logs
      });

      const text = (result?.data?.text || "").trim();
      const confidence = result?.data?.confidence || 0;

      return {
        text,
        confidence,
      };
    } catch (err) {
      throw new Error(`OCR processing failed for page ${pageNumber}: ${err.message}`);
    }
  }
}

module.exports = new OcrService();
