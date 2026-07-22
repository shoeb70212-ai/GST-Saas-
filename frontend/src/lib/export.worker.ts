/// <reference lib="webworker" />
/**
 * Web Worker: build XLSX workbook off the main thread (Phase 4).
 */
import * as XLSX from 'xlsx';

type ExcelRequest = {
  type: 'excel';
  rows: Record<string, unknown>[];
  filename: string;
  sheetName?: string;
};

self.onmessage = (ev: MessageEvent<ExcelRequest>) => {
  try {
    const msg = ev.data;
    if (!msg || msg.type !== 'excel') {
      self.postMessage({ ok: false, error: 'unknown_message' });
      return;
    }
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(msg.rows || []);
    XLSX.utils.book_append_sheet(
      workbook,
      sheet,
      msg.sheetName || 'Custom Report',
    );
    const u8 = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'array',
    }) as Uint8Array;
    const buffer = u8.buffer.slice(
      u8.byteOffset,
      u8.byteOffset + u8.byteLength,
    );
    self.postMessage({ ok: true, buffer, filename: msg.filename }, [buffer]);
  } catch (err) {
    self.postMessage({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

export {};
