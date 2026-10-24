import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { BoundedZip } from '../drivers/converters/bounded-zip.js';
import { parseBoundedXml } from '../drivers/converters/bounded-xml.js';
import { DecoderBudget } from '../drivers/converters/decoder-budget.js';
function crc32(bytes: Buffer): number {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc ^= byte;
		for (let i = 0; i < 8; i++)
			crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
	}
	return (crc ^ 0xffffffff) >>> 0;
}
interface Entry {
	name: string;
	data: Buffer;
	expanded?: number;
}
function archive(entries: Entry[]): Buffer {
	const locals: Buffer[] = [], directory: Buffer[] = [];
	let offset = 0;
	for (const entry of entries) {
		const name = Buffer.from(entry.name), data = deflateRawSync(entry.data), crc = crc32(entry.data), local = Buffer.alloc(30), central = Buffer.alloc(46), expanded = entry.expanded ?? entry.data.length;
		local.writeUInt32LE(0x04034b50);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(8, 8);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(data.length, 18);
		local.writeUInt32LE(expanded, 22);
		local.writeUInt16LE(name.length, 26);
		central.writeUInt32LE(0x02014b50);
		central.writeUInt16LE(20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(8, 10);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(data.length, 20);
		central.writeUInt32LE(expanded, 24);
		central.writeUInt16LE(name.length, 28);
		central.writeUInt32LE(offset, 42);
		locals.push(local, name, data);
		directory.push(central, name);
		offset += local.length + name.length + data.length;
	}
	const cd = Buffer.concat(directory), end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(cd.length, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...locals, cd, end]);
}
async function fixture(use: (dir: string) => Promise<void>): Promise<void> {
	const dir = await mkdtemp(join(tmpdir(), 'cm-xlsx-'));
	try {
		await use(dir);
	}
	finally {
		await rm(dir, { recursive: true, force: true });
	}
}
test('CM-S1-S: XLSX ZIP entry count declared totals ZIP64 and forged expansion reject before retaining over-limit output', async () => {
	await fixture(async (dir) => {
		const path = join(dir, 'bad.xlsx');
		const tooMany = archive([]);
		tooMany.writeUInt16LE(1025, 8);
		tooMany.writeUInt16LE(1025, 10);
		for (const data of [tooMany, archive([{ name: 'sheet.xml', data: Buffer.from('x'), expanded: 8 * 1024 * 1024 + 1 }]), archive(Array.from({ length: 9 }, (_, i) => ({ name: `sheet${i}.xml`, data: Buffer.from('x'), expanded: 8 * 1024 * 1024 }))), archive([{ name: 'sheet.xml', data: Buffer.from('x'), expanded: 0xffffffff }])]) {
			await writeFile(path, data);
			const budget = new DecoderBudget(128 * 1024 * 1024);
			await assert.rejects(BoundedZip.open(path, budget), /resource-limit|unsupported-temporary/);
			assert.equal(budget.snapshot().retained, 0);
			assert.ok(budget.snapshot().peak < 1024 * 1024);
		}
		await writeFile(path, archive([{ name: 'sheet.xml', data: Buffer.alloc(8 * 1024 * 1024 + 1), expanded: 16 }]));
		const budget = new DecoderBudget(128 * 1024 * 1024), zip = await BoundedZip.open(path, budget);
		try {
			await assert.rejects(zip.read('sheet.xml'), /resource-limit/);
			assert.ok(budget.snapshot().peak < 512 * 1024, 'accounts for bounded native chunks and workspace even for forged tiny declarations');
		}
		finally {
			await zip.close();
		}
		assert.equal(budget.snapshot().retained, 0);
	});
});
test('CM-S1-S: XML text attributes comments CDATA cell accumulation encoding and entities have bounded admission', () => {
	for (const xml of [`<root>${'x'.repeat(65537)}</root>`, `<root value="${'>'.repeat(65537)}"/>`, `<root><!--${'<'.repeat(65537)}--></root>`, `<root><![CDATA[${'x'.repeat(65537)}]]></root>`, `<root><c><t>${'x'.repeat(40000)}</t><t>${'y'.repeat(40000)}</t></c></root>`, `<!DOCTYPE root [<!ENTITY x "large">]><root>&x;</root>`, `<?xml version="1.0" encoding="UTF-16"?><root/>`]) {
		const budget = new DecoderBudget(16 * 1024 * 1024);
		assert.throws(() => parseBoundedXml(Buffer.from(xml), budget, {}), /resource-limit|unsupported-temporary/);
		assert.equal(budget.snapshot().retained, 0);
	}
	const budget = new DecoderBudget(64 * 1024);
	assert.throws(() => parseBoundedXml(Buffer.from('<root/>'), budget, {}), /resource-limit/);
	assert.equal(budget.snapshot().retained, 0);
});
test('CM-S1-S: valid ExcelJS archives parse incrementally and parser callback failures release every reservation', async () => {
	await fixture(async (dir) => {
		const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Fixture');
		sheet.addRow(['label']);
		sheet.addRow(['shared value']);
		const path = join(dir, 'valid.xlsx');
		await book.xlsx.writeFile(path);
		const budget = new DecoderBudget(64 * 1024 * 1024), zip = await BoundedZip.open(path, budget);
		let text = '';
		try {
			for (const entry of zip.entries.filter(e => /\.xml$/.test(e.name))) {
				const data = await zip.read(entry.name);
				try {
					parseBoundedXml(data.bytes, budget, { text: value => {
							text += value;
						} });
				}
				finally {
					data.release();
				}
			}
			assert.match(text, /shared value/);
			const data = await zip.read('xl/sharedStrings.xml');
			try {
				assert.throws(() => parseBoundedXml(data.bytes, budget, { open: () => {
						throw new Error('stop');
					} }), /stop/);
			}
			finally {
				data.release();
			}
		}
		finally {
			await zip.close();
		}
		assert.equal(budget.snapshot().retained, 0);
	});
});
export { archive };

test('CM-S1-S: archive close releases abandoned entry buffers idempotently',async()=>{
 await fixture(async dir=>{
  const path=join(dir,'one.xlsx');await writeFile(path,archive([{name:'one.xml',data:Buffer.from('<root/>')}]));
  const budget=new DecoderBudget(1024*1024),zip=await BoundedZip.open(path,budget),data=await zip.read('one.xml');
  assert.ok(budget.snapshot().retained>0);await zip.close();assert.equal(budget.snapshot().retained,0);
  data.release();await zip.close();assert.equal(budget.snapshot().retained,0);await assert.rejects(zip.read('one.xml'),/closed/);
 });
});
