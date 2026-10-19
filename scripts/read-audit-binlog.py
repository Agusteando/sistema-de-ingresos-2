#!/usr/bin/env python3
"""Read-only binlog evidence extraction. Does not install packages or replay SQL."""
import argparse, contextlib, datetime, hashlib, json, os, pathlib, re
import subprocess, sys, tempfile
from zoneinfo import ZoneInfo

PACKAGE_URL = 'https://repo.mysql.com/apt/ubuntu/pool/mysql-8.4-lts/m/mysql-community/mysql-community-server-core_8.4.11-1ubuntu24.04_amd64.deb'
PACKAGE_SHA256 = 'dafb704d3e602980ef6dcadfbd9ca8b8660736cdbfbcbd1cdd5c0638ab097cfd'

def parse_rows(lines, *, student, schema, field, identity_ordinal, field_ordinal, binlog, mysql_version):
    row = None
    side = None
    pos = None
    header = ''
    gtid = ''
    pending = []
    found = []

    def flush():
        nonlocal row
        if row and row['table'] == schema + '.matricula' and row['operation'] == 'UPDATE':
            before, after = row['before'], row['after']
            identity = "'" + student + "'"
            if before.get(identity_ordinal) == identity and after.get(identity_ordinal) == identity:
                if field_ordinal in before and field_ordinal in after and before[field_ordinal] != after[field_ordinal]:
                    event = re.search(r'^#(\d{6})\s+(\d\d:\d\d:\d\d).*end_log_pos\s+(\d+)\s+CRC32\s+0x([a-fA-F0-9]{8})', row['header'])
                    if not event:
                        raise ValueError('Source event position/time/checksum missing')
                    utc = datetime.datetime.strptime(event[1] + ' ' + event[2], '%y%m%d %H:%M:%S').replace(tzinfo=datetime.timezone.utc)
                    pending.append({
                        'version': 1, 'matricula': student, 'field': field, 'rowId': before.get(1),
                        'recordedAt': utc.astimezone(ZoneInfo('America/Mexico_City')).strftime('%Y-%m-%d %H:%M:%S'),
                        'beforeSql': before[field_ordinal], 'afterSql': after[field_ordinal],
                        'evidence': {
                            'kind': 'mysql-binlog', 'schema': schema, 'table': 'matricula',
                            'file': binlog, 'position': row['position'], 'endPosition': event[3],
                            'crc32': event[4].lower(), 'decodedRowSha256': row['hash'].hexdigest(),
                            'fullImages': True, 'identityOrdinal': identity_ordinal,
                            'fieldOrdinal': field_ordinal, 'mysqlVersion': mysql_version,
                            'gtid': row['gtid']
                        }
                    })
        row = None

    for line in lines:
        if line.startswith('# at '):
            flush()
            pos = line.strip().split()[-1]
        if re.match(r'^#\d{6}\s', line):
            header = line.strip()
        if 'GTID_NEXT=' in line:
            gtid = line.strip()
        match = re.match(r'^### (UPDATE|INSERT INTO|DELETE FROM) ' + chr(96) + r'([^' + chr(96) + r']+)' + chr(96) + r'\.' + chr(96) + r'([^' + chr(96) + r']+)' + chr(96), line)
        if match:
            flush()
            side = 'after' if match[1] == 'INSERT INTO' else 'before'
            row = {'table': match[2] + '.' + match[3], 'operation': match[1],
                   'position': pos, 'header': header, 'gtid': gtid,
                   'before': {}, 'after': {}, 'hash': hashlib.sha256()}
        elif line.startswith('### WHERE'):
            side = 'before'
        elif line.startswith('### SET'):
            side = 'after'
        if row and line.startswith('###'):
            row['hash'].update(line.encode('utf-8'))
            col = re.match(r'^###\s+@(\d+)=(.*)', line)
            if col and int(col[1]) in (1, identity_ordinal, field_ordinal):
                row[side][int(col[1])] = col[2].rsplit(' /* ', 1)[0].strip()
        if line.startswith('COMMIT'):
            flush()
            commit = re.search(r'end_log_pos\s+(\d+).*Xid\s*=\s*(\d+)', header)
            if pending and not commit:
                raise ValueError('Xid/commit position missing; cannot confirm source')
            for item in pending:
                item['evidence'].update(commitPosition=commit[1], xid=commit[2], committed=True, checksumVerified=True)
            found.extend(pending)
            pending = []
        if line.startswith('ROLLBACK') and 'added by mysqlbinlog' not in line:
            flush()
            pending = []
    flush()
    return found, len(pending)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['student', 'schema', 'field', 'binlog', 'from-utc', 'to-utc']:
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--identity-ordinal', type=int, required=True)
    parser.add_argument('--field-ordinal', type=int, required=True)
    parser.add_argument('--reader')
    parser.add_argument('--container', default='database_mysql')
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Z]{1,6}\d{2,8}', args.student):
        parser.error('Invalid student')
    if not re.fullmatch(r'mysql-bin\.\d{6,}', args.binlog):
        parser.error('Invalid binlog basename')
    for name in ['schema', 'field']:
        if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,89}', getattr(args, name)):
            parser.error('Invalid schema/field')
    start = datetime.datetime.strptime(args.from_utc, '%Y-%m-%d %H:%M:%S')
    end = datetime.datetime.strptime(args.to_utc, '%Y-%m-%d %H:%M:%S')
    if not 0 < (end-start).total_seconds() <= 86400:
        parser.error('Choose a positive window of at most one day')
    if min(args.identity_ordinal, args.field_ordinal) < 1 or args.identity_ordinal == args.field_ordinal:
        parser.error('Invalid column map')
    with tempfile.TemporaryDirectory(prefix='audit-binlog-') as temp:
        root = pathlib.Path(temp)
        tool = args.reader
        if not tool:
            if os.uname().machine != 'x86_64':
                parser.error('Supply --reader for this architecture')
            package = root/'tool.deb'
            subprocess.run(['curl','--fail','--location','--silent','--show-error','--max-time','90',PACKAGE_URL,'-o',str(package)],check=True)
            if hashlib.sha256(package.read_bytes()).hexdigest() != PACKAGE_SHA256:
                raise ValueError('PACKAGE_SHA256_MISMATCH')
            subprocess.run(['dpkg-deb','-x',str(package),str(root/'tool')],check=True)
            tool = str(root/'tool/usr/bin/mysqlbinlog')
        version = subprocess.check_output([tool,'--no-defaults','--version'],text=True).strip()
        if not re.search(r'Ver 8\.4\.', version):
            raise ValueError('MySQL 8.4 reader required')
        env = dict(os.environ, TZ='UTC')
        os.nice(10)
        with tempfile.TemporaryFile() as srcerr, tempfile.TemporaryFile() as decerr:
            source = subprocess.Popen(['podman','exec',args.container,'cat','/var/lib/mysql/'+args.binlog],stdout=subprocess.PIPE,stderr=srcerr)
            decoder = subprocess.Popen([tool,'--no-defaults','--verify-binlog-checksum','--base64-output=DECODE-ROWS','-vv','--database='+args.schema,'--start-datetime='+args.from_utc,'--stop-datetime='+args.to_utc,'-'],stdin=source.stdout,stdout=subprocess.PIPE,stderr=decerr,env=env,text=True,encoding='utf-8',errors='backslashreplace')
            source.stdout.close()
            try:
                rows,pending = parse_rows(decoder.stdout,student=args.student,schema=args.schema,field=args.field,identity_ordinal=args.identity_ordinal,field_ordinal=args.field_ordinal,binlog=args.binlog,mysql_version=version)
                code = decoder.wait(timeout=20)
            finally:
                decoder.stdout.close()
                if decoder.poll() is None:
                    decoder.terminate()
                    decoder.wait(timeout=10)
                try:
                    source.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    source.terminate()
                    source.wait(timeout=10)
            if code:
                decerr.seek(0)
                srcerr.seek(0)
                raise RuntimeError(json.dumps({'decoder_exit':code,'decoder_error':decerr.read(2500).decode('utf-8','backslashreplace'),'source_error':srcerr.read(1000).decode('utf-8','backslashreplace')}))
            if pending:
                raise ValueError('Window ended before source transaction commit')
            print(json.dumps({'version':1,'records':rows},ensure_ascii=True,indent=2))

if __name__ == '__main__':
    main()
