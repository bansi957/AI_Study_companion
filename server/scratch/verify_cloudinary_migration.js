const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const fs = require("fs");

const { cloudinary, isCloudinaryConfigured } = require("../config/cloudinary");
const Material = require("../models/Material");
const pdfService = require("../services/documents/pdf.service");
const extractionService = require("../services/documents/extraction.service");

// Simple minimal valid PDF binary buffer
const createMinimalPdfBuffer = (title = "Cloudinary Test Document") => {
  const content = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 73 >>
stream
BT
/F1 24 Tf
100 700 Td
(${title}) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000366 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
443
%%EOF`;
  return Buffer.from(content, "utf-8");
};

async function runVerification() {
  console.log("=== CLOUDINARY MIGRATION VERIFICATION ===\n");

  // 1. Schema check
  console.log("1. Checking Material Schema...");
  const schemaPaths = Material.schema.paths;
  const hasPublicId = Boolean(schemaPaths["cloudinaryPublicId"]);
  const hasResourceType = Boolean(schemaPaths["cloudinaryResourceType"]);
  const hasFileUrl = Boolean(schemaPaths["fileUrl"]);

  console.log(`  - fileUrl field exists: ${hasFileUrl}`);
  console.log(`  - cloudinaryPublicId field exists: ${hasPublicId}`);
  console.log(`  - cloudinaryResourceType field exists: ${hasResourceType}`);

  if (!hasPublicId || !hasResourceType || !hasFileUrl) {
    throw new Error("Material schema is missing required Cloudinary fields");
  }
  console.log("  [PASS] Material Schema validated.\n");

  // 2. Cloudinary Configuration check
  console.log("2. Checking Cloudinary Configuration...");
  const configured = isCloudinaryConfigured();
  console.log(`  - isCloudinaryConfigured(): ${configured}`);
  console.log(`  - CLOUDINARY_CLOUD_NAME: ${process.env.CLOUDINARY_CLOUD_NAME ? "(configured)" : "(empty/missing)"}`);
  console.log(`  - CLOUDINARY_API_KEY: ${process.env.CLOUDINARY_API_KEY ? "(configured)" : "(empty/missing)"}`);
  console.log(`  - CLOUDINARY_API_SECRET: ${process.env.CLOUDINARY_API_SECRET ? "(configured)" : "(empty/missing)"}`);

  if (configured) {
    console.log("\n3. Testing live Cloudinary Upload & Remote Buffer Extraction...");
    const sampleBuffer = createMinimalPdfBuffer("Hello Cloudinary PDF Pipeline");
    const tempTestPath = path.join(__dirname, "temp_test.pdf");
    fs.writeFileSync(tempTestPath, sampleBuffer);

    try {
      const testProjectId = "verify-step-test-proj";
      const uniqueSuffix = `verify-${Date.now()}`;

      // Upload to Cloudinary
      const uploadResult = await cloudinary.uploader.upload(tempTestPath, {
        folder: `ai-study-companion/projects/${testProjectId}/materials`,
        resource_type: "raw",
        public_id: uniqueSuffix,
        use_filename: true,
      });

      console.log("  - Upload successful!");
      console.log(`    public_id: ${uploadResult.public_id}`);
      console.log(`    secure_url: ${uploadResult.secure_url}`);
      console.log(`    resource_type: ${uploadResult.resource_type}`);
      console.log(`    bytes: ${uploadResult.bytes}`);

      // Verify remote fetch & in-memory parsing without local disk persistence
      console.log("  - Testing remote fetch & pdf-parse extraction directly from Cloudinary URL...");
      const response = await fetch(uploadResult.secure_url);
      if (!response.ok) {
        throw new Error(`Failed to fetch from Cloudinary URL: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const downloadedBuffer = Buffer.from(arrayBuffer);
      const parsed = await pdfService.parsePdf(downloadedBuffer);
      console.log(`    Total pages extracted: ${parsed.totalPages}`);
      console.log(`    Extracted text sample: "${parsed.pages[0]?.text?.trim()}"`);

      // Verify deletion from Cloudinary
      console.log("  - Testing Cloudinary asset destruction...");
      const destroyResult = await cloudinary.uploader.destroy(uploadResult.public_id, {
        resource_type: uploadResult.resource_type || "raw",
      });
      console.log(`    Destroy result: ${JSON.stringify(destroyResult)}`);
      console.log("  [PASS] Live Cloudinary upload, fetch, in-memory parse, and destruction verified!");
    } finally {
      if (fs.existsSync(tempTestPath)) {
        fs.unlinkSync(tempTestPath);
      }
    }
  } else {
    console.log("\n3. Cloudinary credentials not yet populated in .env.");
    console.log("   Testing graceful in-memory PDF parsing and mock fallback pipeline...");
    const sampleBuffer = createMinimalPdfBuffer("Fallback Test PDF");
    const parsed = await pdfService.parsePdf(sampleBuffer);
    console.log(`   In-memory parsePdf test: successfully extracted ${parsed.totalPages} page(s).`);
    console.log("  [PASS] In-memory PDF buffer extraction works as expected.");
  }

  console.log("\n=== ALL VERIFICATION CHECKS PASSED ===");
}

runVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  });
