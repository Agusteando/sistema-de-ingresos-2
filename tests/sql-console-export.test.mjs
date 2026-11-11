import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { test } from 'node:test'
import { buildFullDumpArgs, createFullSqlSnapshot, mysqlClientCompatibleStream } from '../server/utils/sql-console-export.mjs'

test('dump options include schema, data, routines, triggers and events, without credentials', () => {
  const args = buildFullDumpArgs({ host: 'localhost', port: 3306, user: 'backup' })
  for (const flag of ['--single-transaction', '--quick', '--routines', '--triggers', '--events', '--hex-blob', '--databases', 'ingresos']) {
    assert.ok(args.includes(flag), `missing ${flag}`)
  }
  assert.ok(!args.join(' ').includes('password'))
  assert.throws(() => buildFullDumpArgs({ host: '', port: 0, user: '' }))
})

test('removes MariaDB sandbox header only', async () => {
  const chunks = []
  const sink = new Writable({ write(chunk, _encoding, callback) { chunks.push(chunk); callback() } })
  await pipeline(Readable.from([Buffer.from('/*M!999999\\- enable the sandbox'), Buffer.from(' mode */\nCREATE TABLE a (x BLOB);\n')]), mysqlClientCompatibleStream(), sink)
  assert.equal(Buffer.concat(chunks).toString(), 'CREATE TABLE a (x BLOB);\n')
})

test('writes verified output and removes temporary files after download', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aurora-export-test-'))
  try {
    const executable = join(dir, 'fake-dump')
    await writeFile(executable, '#!/bin/sh\nprintf "/*M!999999\\\\- enable the sandbox mode */\\nCREATE TABLE a (x int);\\n"\n')
    await chmod(executable, 0o700)
    const dump = await createFullSqlSnapshot({ host: 'localhost', port: 3306, user: 'backup', password: 'secret', binary: executable, tempRoot: dir })
    assert.match(await readFile(dump.path, 'utf8'), /CREATE TABLE a/)
    assert.ok(dump.bytes > 10)
    assert.equal((await stat(dump.path)).mode & 0o777, 0o600)
    await dump.cleanup()
    assert.deepEqual((await readdir(dir)).sort(), ['fake-dump'])
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('on dump failure never offers a partial file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aurora-export-test-'))
  try {
    const executable = join(dir, 'bad-dump')
    await writeFile(executable, '#!/bin/sh\necho partial-sql\nexit 2\n')
    await chmod(executable, 0o700)
    await assert.rejects(createFullSqlSnapshot({ host: 'localhost', port: 3306, user: 'backup', password: 'secret', binary: executable, tempRoot: dir }), /SQL_DUMP_PROCESS_FAILED/)
    assert.deepEqual((await readdir(dir)).sort(), ['bad-dump'])
  } finally { await rm(dir, { recursive: true, force: true }) }
})
