import importlib.util
import io
import pathlib
import unittest

path = pathlib.Path(__file__).parent.parent/'scripts/read-audit-binlog.py'
spec = importlib.util.spec_from_file_location('audit_binlog', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

TEXT = """# at 500848402
#261014 19:59:53 server id 1 end_log_pos 500849094 CRC32 0x18a63e07 Update_rows: table id 10733
SET @@SESSION.GTID_NEXT= 'ANONYMOUS'/*!*/;
### UPDATE `casitaiedis`.`matricula`
### WHERE
###   @1=8079028 /* INT */
###   @2='PM1626' /* VARSTRING(255) */
###   @12='ANTARTIDA' /* VARSTRING(255) */
### SET
###   @1=8079028 /* INT */
###   @2='PM1626' /* VARSTRING(255) */
###   @12='AMERICA' /* VARSTRING(255) */
# at 500849094
#261014 19:59:53 server id 1 end_log_pos 500849125 CRC32 0x96a70a58 Xid = 50484068
COMMIT/*!*/;
"""
class ReaderTests(unittest.TestCase):
    def parse(self,text=TEXT,**extra):
        options=dict(student='PM1626',schema='casitaiedis',field='grupo',identity_ordinal=2,field_ordinal=12,binlog='mysql-bin.000335',mysql_version='8.4.11')
        options.update(extra)
        return module.parse_rows(io.StringIO(text),**options)

    def test_committed_row_has_actual_images_and_source_anchors(self):
        records,pending=self.parse()
        self.assertEqual(pending,0)
        self.assertEqual(len(records),1)
        row=records[0]
        self.assertEqual(row['recordedAt'],'2026-10-14 13:59:53')
        self.assertEqual(row['beforeSql'],"'ANTARTIDA'")
        self.assertEqual(row['afterSql'],"'AMERICA'")
        self.assertEqual(row['evidence']['xid'],'50484068')
        self.assertEqual(row['evidence']['position'],'500848402')
        self.assertTrue(row['evidence']['checksumVerified'])

    def test_other_students_unchanged_fields_and_rollbacks_never_appear(self):
        for text in [TEXT.replace('PM1626','PM9999'),TEXT.replace('AMERICA','ANTARTIDA'),TEXT.replace('COMMIT/*!*/;','ROLLBACK/*!*/;')]:
            self.assertEqual(self.parse(text)[0],[])

    def test_window_without_commit_stays_pending_even_with_mysqlbinlog_cleanup(self):
        text=TEXT.replace('COMMIT/*!*/;','ROLLBACK /* added by mysqlbinlog */;')
        records,pending=self.parse(text)
        self.assertEqual(records,[])
        self.assertEqual(pending,1)

    def test_student_and_field_are_parameters(self):
        records,_=self.parse(TEXT.replace('PM1626','PT0123'),student='PT0123',field='grado')
        self.assertEqual(records[0]['matricula'],'PT0123')
        self.assertEqual(records[0]['field'],'grado')

if __name__=='__main__':
    unittest.main()
