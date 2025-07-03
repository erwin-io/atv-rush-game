const fs = require("fs");
const path = require("path");
const { Document, Packer, Paragraph, TextRun } = require("docx");

// Allowed file types
const allowedExtensions = [".js", ".ts", ".html", ".css", ".scss"];

// Get input folder
const folderPath = process.argv[2];
if (!folderPath || !fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
  console.error("❌ Folder not found or not specified.\nUsage: node index.js ../src");
  process.exit(1);
}

// Recursively get matching files
function getCodeFiles(dir) {
  const result = [];
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      result.push(...getCodeFiles(fullPath));
    } else if (allowedExtensions.includes(path.extname(fullPath))) {
      result.push(fullPath);
    }
  }

  return result;
}

const codeFiles = getCodeFiles(path.resolve(folderPath));
if (codeFiles.length === 0) {
  console.warn("⚠️ No supported code files found.");
  process.exit(0);
}

const docContent = [];

for (const filePath of codeFiles) {
  const ext = path.extname(filePath);
  const fileName = path.relative(folderPath, filePath);
  const content = fs.readFileSync(filePath, "utf-8");

  // Add filename as heading
  docContent.push(
    new Paragraph({
      children: [new TextRun({ text: `📄 ${fileName} (${ext})`, bold: true, size: 28 })],
    }),
    new Paragraph({ text: "" })
  );

  // Add code lines
  const codeLines = content.split("\n");
  for (const line of codeLines) {
    docContent.push(
      new Paragraph({
        children: [
          new TextRun({
            text: line.replace(/\t/g, "    "),
            font: "Courier New",
            size: 22,
          }),
        ],
        shading: { fill: "eeeeee" },
      })
    );
  }

  docContent.push(new Paragraph({ text: "" }));
}

// Create Word document
const doc = new Document({
  sections: [
    {
      properties: {},
      children: docContent,
    },
  ],
});

// Output file name
const folderName = path.basename(path.resolve(folderPath));
const outputFile = `${folderName}_code.docx`;
const outputPath = path.join(__dirname, outputFile);

// Save .docx
Packer.toBuffer(doc)
  .then((buffer) => {
    fs.writeFileSync(outputPath, buffer);
    console.log(`✅ Exported ${codeFiles.length} files to ${outputPath}`);
  })
  .catch((err) => {
    console.error("❌ Failed to write DOCX:", err);
  });
