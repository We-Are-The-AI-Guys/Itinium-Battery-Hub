import * as fs from "fs";
import * as path from "path";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow,
  TableCell, WidthType, AlignmentType, BorderStyle,
} from "docx";
import PDFDocument from "pdfkit";

const TITLE = "Itinium Battery Collections Portal — QA Test Plan";
const SUBTITLE = "Prepared July 2026 · All test accounts use the shared password below";
const PASSWORD_NOTE = "Password for all accounts: password123";

const credentials: string[][] = [
  ["Role", "Email", "Name"],
  ["Head Office Admin", "admin@itinium.co.uk", "Sarah Mitchell"],
  ["Accounts", "accounts@itinium.co.uk", "Rachel Adams"],
  ["Accounts (2nd)", "l.chen@itinium.co.uk", "Lisa Chen"],
  ["Team Leader (Linde)", "team@itinium.co.uk", "Sarah Cooper"],
  ["Depot User (Linde South East)", "depot@itinium.co.uk", "Dave Mitchell"],
];

interface Section {
  heading: string;
  groups: { sub?: string; items: string[] }[];
}

const sections: Section[] = [
  {
    heading: "1. Authentication (all roles)",
    groups: [{
      items: [
        "Log in with each account; confirm each lands on the correct home page (depot user → depot dashboard, others → admin dashboard)",
        "Attempt login with a wrong password — should be rejected",
        "Use \"Forgot password\" to request a reset and complete the reset flow",
        "Log out and confirm you're returned to the login page",
        "Try to open a restricted URL directly (e.g. /schedule as a depot user) — should be blocked/redirected",
      ],
    }],
  },
  {
    heading: "2. Depot User (depot@itinium.co.uk)",
    groups: [
      {
        sub: "Dashboard",
        items: [
          "See welcome message and \"New Collection\" quick action",
          "Saved drafts appear; resume a draft and delete a draft",
        ],
      },
      {
        sub: "Collection Form (main feature)",
        items: [
          "Create a new collection: add battery rows with pallet no., asset no., serial, manufacturer, cell type/cell model, voltage",
          "Confirm the serial box is a plain optional field — no \"Serial unknown or damaged?\" flag appears (recent change)",
          "Confirm there is no Safe Load box on the form (recent change) but the CURRENT LOAD total bar still updates as rows are added",
          "Type an unknown manufacturer — expect an amber suggestion/flag with option to accept or confirm",
          "Select voltage \"Other\" and enter a custom voltage",
          "Loose cells: tick loose cells, enter Cell Type + Cell Qty; try submitting without them — expect a clear error",
          "Clone a battery row; delete a row",
          "Attach a row photo; remove it (photo should be optional)",
          "CSV import: download the template, fill rows, import. Check:",
          "    Manufacturer names auto-match (e.g. lowercase still matches)",
          "    Voltages like \"24\", \"24v\", \"24 V\" become 24V; odd values (e.g. 72) import as Other + custom (recent change)",
          "    Rows with missing serial/asset are flagged in the review dialog",
          "Save as draft mid-way, leave, and resume it",
          "Submit below minimum tonnage — expect a block; add rows until above minimum and submit successfully",
        ],
      },
      {
        sub: "Stillages / Settings / Help",
        items: [
          "Log a stillage movement (Collected / Dropped Off) and check stock levels update",
          "Update profile and notification preferences in Settings",
          "Read the User Guide (check the table of contents scrolls to sections) and submit a support ticket with a screenshot",
        ],
      },
    ],
  },
  {
    heading: "3. Team Leader (team@itinium.co.uk)",
    groups: [{
      items: [
        "Dashboard shows stats and recent jobs for their client only (Linde)",
        "View jobs list; open a job detail — confirm read-only depot info and flagged rows show correctly",
        "See depot users' saved drafts",
        "Locations: add/edit a location for their client",
        "Users: create a new depot user for Linde; confirm they cannot see/manage other clients' users",
        "Submit a collection themselves via the collection form",
        "Stillages, Settings, Help/support ticket",
      ],
    }],
  },
  {
    heading: "4. Accounts (accounts@itinium.co.uk)",
    groups: [{
      items: [
        "Dashboard financial stats (tonnage, GP)",
        "Jobs list with status/payment filters; search jobs",
        "Job detail: enter/edit admin financials (CBL LME, transport cost), check GP calculates, generate an invoice",
        "KPI Reporting: charts render; filter; export to PDF/print — check nothing overlaps the footer",
        "LME Pricing: update LME lead price and FX rate; confirm battery values recalculate; generate summary invoice",
        "Confirm no access to Clients, Schedule, or User management",
      ],
    }],
  },
  {
    heading: "5. Head Office Admin (admin@itinium.co.uk)",
    groups: [{
      items: [
        "Everything Accounts can do, plus:",
        "Clients: create, edit, and deactivate a client",
        "Users: create users of every role; edit and deactivate a user",
        "Schedule: calendar/Gantt view; drag-and-drop a job to reschedule; check the reschedule audit log records it",
        "Correction Audit: verify AI-suggested corrections from depot form entries appear with accepted/rejected status",
        "Job detail: resolve flagged battery rows (edit flagged serial/manufacturer/voltage values inline)",
        "Global search in the header finds jobs/clients",
      ],
    }],
  },
  {
    heading: "6. Cross-cutting checks",
    groups: [{
      items: [
        "Notifications bell shows alerts after relevant events (e.g. job submission)",
        "Emails: password reset and any invoice/notification emails arrive",
        "Browser refresh keeps you logged in; session expires cleanly on logout",
        "Test on a mobile/narrow window — forms and tables remain usable",
      ],
    }],
  },
];

const outDir = path.resolve(process.cwd(), "..", "exports");
fs.mkdirSync(outDir, { recursive: true });

// ---------- DOCX ----------
async function buildDocx() {
  const children: (Paragraph | Table)[] = [];
  children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(TITLE)] }));
  children.push(new Paragraph({ children: [new TextRun({ text: SUBTITLE, italics: true, color: "666666" })], spacing: { after: 200 } }));

  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Login Credentials")] }));
  children.push(new Paragraph({ children: [new TextRun({ text: PASSWORD_NOTE, bold: true })], spacing: { after: 120 } }));

  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: credentials.map((row, i) => new TableRow({
      children: row.map((cell) => new TableCell({
        shading: i === 0 ? { fill: "0F2744" } : undefined,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({
          children: [new TextRun({ text: cell, bold: i === 0, color: i === 0 ? "FFFFFF" : "000000" })],
        })],
      })),
    })),
  }));
  children.push(new Paragraph({ text: "", spacing: { after: 200 } }));

  for (const section of sections) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(section.heading)], spacing: { before: 240 } }));
    for (const group of section.groups) {
      if (group.sub) {
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(group.sub)] }));
      }
      for (const item of group.items) {
        const nested = item.startsWith("    ");
        children.push(new Paragraph({
          children: [new TextRun(`${nested ? "◦ " : "☐ "}${item.trim()}`)],
          indent: { left: nested ? 900 : 360 },
          spacing: { after: 60 },
        }));
      }
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } },
        title: { run: { size: 40, bold: true, color: "0F2744" } },
        heading1: { run: { size: 28, bold: true, color: "0F2744" } },
        heading2: { run: { size: 24, bold: true, color: "334155" } },
      },
    },
    sections: [{ children }],
  });
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join(outDir, "QA_Test_Plan.docx"), buf);
  console.log("Wrote QA_Test_Plan.docx");
}

// ---------- PDF ----------
function buildPdf(): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 54, size: "A4" });
    const stream = fs.createWriteStream(path.join(outDir, "QA_Test_Plan.pdf"));
    doc.pipe(stream);

    const NAVY = "#0f2744";
    const SLATE = "#334155";

    doc.font("Helvetica-Bold").fontSize(19).fillColor(NAVY).text(TITLE);
    doc.moveDown(0.3);
    doc.font("Helvetica-Oblique").fontSize(10).fillColor("#666666").text(SUBTITLE);
    doc.moveDown(1);

    doc.font("Helvetica-Bold").fontSize(14).fillColor(NAVY).text("Login Credentials");
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor("#000000").text(PASSWORD_NOTE);
    doc.moveDown(0.5);

    const colW = [150, 190, 130];
    const startX = doc.x;
    credentials.forEach((row, i) => {
      const y = doc.y;
      const rowH = 20;
      if (y + rowH > doc.page.height - 60) doc.addPage();
      const yy = doc.y;
      if (i === 0) {
        doc.rect(startX, yy, colW[0] + colW[1] + colW[2], rowH).fill(NAVY);
      } else if (i % 2 === 0) {
        doc.rect(startX, yy, colW[0] + colW[1] + colW[2], rowH).fill("#f1f5f9");
      }
      doc.fillColor(i === 0 ? "#ffffff" : "#000000")
        .font(i === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(9.5);
      let x = startX;
      row.forEach((cell, c) => {
        doc.text(cell, x + 6, yy + 5, { width: colW[c] - 12, lineBreak: false });
        x += colW[c];
      });
      doc.y = yy + rowH;
      doc.x = startX;
    });
    doc.moveDown(1);

    for (const section of sections) {
      if (doc.y > doc.page.height - 130) doc.addPage();
      doc.x = 54;
      doc.font("Helvetica-Bold").fontSize(13.5).fillColor(NAVY).text(section.heading);
      doc.moveDown(0.35);
      for (const group of section.groups) {
        if (group.sub) {
          if (doc.y > doc.page.height - 100) doc.addPage();
          doc.x = 54;
          doc.font("Helvetica-Bold").fontSize(11).fillColor(SLATE).text(group.sub);
          doc.moveDown(0.2);
        }
        for (const item of group.items) {
          const nested = item.startsWith("    ");
          if (doc.y > doc.page.height - 80) doc.addPage();
          doc.font("Helvetica").fontSize(10).fillColor("#000000");
          doc.text(`${nested ? "◦" : "☐"}  ${item.trim()}`, nested ? 96 : 68, doc.y, {
            width: doc.page.width - (nested ? 96 : 68) - 54,
          });
          doc.moveDown(0.22);
        }
        doc.moveDown(0.3);
      }
      doc.moveDown(0.4);
    }

    doc.end();
    stream.on("finish", () => { console.log("Wrote QA_Test_Plan.pdf"); resolve(); });
    stream.on("error", reject);
  });
}

(async () => {
  await buildDocx();
  await buildPdf();
})();
