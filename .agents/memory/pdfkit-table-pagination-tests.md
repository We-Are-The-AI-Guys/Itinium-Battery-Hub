---
name: PDFKit table pagination tests
description: Constraints for safely rendering and testing variable-height table rows in branded PDFKit documents.
---

Size variable-height table content from the actual remaining space after the branded header and repeated table header. Split oversized content at word boundaries with a character-level fallback for unbroken values, and repeat the table header on continuation pages.

**Why:** Fixed height caps silently truncate valid notes, while page-sized estimates that ignore the live document position can overlap the branded footer. PDF text extraction also interleaves separately drawn table columns, so contiguous row-sentence assertions are unreliable.

**How to apply:** For PDF tables with user-entered text, calculate available height from the current `doc.y` and footer boundary on every page. In content tests, assert complete distinctive tokens and test state mapping separately rather than assuming extracted columns remain contiguous.