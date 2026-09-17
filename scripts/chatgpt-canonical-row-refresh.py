from pathlib import Path
import re

path = Path('server/utils/control-escolar-external-view.ts')
text = path.read_text()
pattern = re.compile(r"export const refreshExternalControlEscolarStudentViewRow = async \(input: any, student: any\) => \{[\s\S]*?\n\}\n\nexport const readExternalControlEscolarStudents")
replacement = """export const refreshExternalControlEscolarStudentViewRow = async (input: any, student: any) => {
  const matricula = normalizeText(student?.matricula || student?.studentId || input?.matricula, 64)
  if (!matricula) {
    throw createError({ statusCode: 400, statusMessage: 'MATRICULA_REQUIRED', message: 'La matrícula es obligatoria.' })
  }

  // A canonical snapshot is an indivisible plantel/ciclo projection. Updating
  // one supplied row would let a caller bypass enrollment-scope and group
  // canonicalization, so a punctual refresh always regenerates the full scope.
  const refreshed = await warmExternalControlEscolarStudentScope(input)
  return {
    success: true,
    matricula,
    refreshedSnapshot: true,
    ...refreshed
  }
}

export const readExternalControlEscolarStudents"""
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'refreshExternalControlEscolarStudentViewRow: expected 1 match, got {count}')
path.write_text(text)

verify_path = Path('scripts/verify-academic-source.mjs')
verify = verify_path.read_text()
marker = "expect(refresh.includes('EXTERNAL_CONTROL_ESCOLAR_VIEW_VERSION') && !refresh.includes(\"const VIEW_VERSION = 'control-escolar-student-view-v1'\"), 'El refresh no puede fijar una versión vieja del snapshot.')"
if verify.count(marker) != 1:
    raise SystemExit('academic verifier marker drifted')
verify = verify.replace(marker, marker + "\nexpect(externalView.includes('const refreshed = await warmExternalControlEscolarStudentScope(input)') && !externalView.includes('const payload = sanitizeExternalStudentPayload(student)'), 'El refresh puntual debe regenerar el scope canónico completo; no puede inyectar una fila.')", 1)
verify_path.write_text(verify)
