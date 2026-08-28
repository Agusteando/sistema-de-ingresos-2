export type ControlEscolarReportFieldGroupKey = 'identity' | 'academic' | 'husky' | 'family' | 'health' | 'administrative'

export type ControlEscolarReportField = {
  key: string
  label: string
  width: number
  group: ControlEscolarReportFieldGroupKey
  default?: boolean
  sensitive?: boolean
}

export const CONTROL_ESCOLAR_REPORT_GROUPS: Array<{ key: ControlEscolarReportFieldGroupKey; label: string }> = [
  { key: 'identity', label: 'Alumno' },
  { key: 'academic', label: 'Escolar' },
  { key: 'husky', label: 'Husky Pass' },
  { key: 'family', label: 'Familia' },
  { key: 'health', label: 'Salud' },
  { key: 'administrative', label: 'Administrativo' },
]

export const CONTROL_ESCOLAR_REPORT_FIELDS: ControlEscolarReportField[] = [
  { key: 'fullName', label: 'Alumno', width: 34, group: 'identity', default: true },
  { key: 'matricula', label: 'Matrícula', width: 16, group: 'identity', default: true },
  { key: 'curp', label: 'CURP', width: 20, group: 'identity' },
  { key: 'fechaNacimiento', label: 'Fecha de nacimiento', width: 18, group: 'identity' },
  { key: 'sexo', label: 'Sexo', width: 11, group: 'identity' },

  { key: 'plantel', label: 'Plantel', width: 13, group: 'academic' },
  { key: 'cicloEscolar', label: 'Ciclo escolar', width: 16, group: 'academic' },
  { key: 'nivel', label: 'Nivel', width: 17, group: 'academic', default: true },
  { key: 'grado', label: 'Grado', width: 13, group: 'academic', default: true },
  { key: 'group', label: 'Grupo', width: 11, group: 'academic', default: true },
  { key: 'tipoIngreso', label: 'Tipo de ingreso', width: 16, group: 'academic' },
  { key: 'enrollmentState', label: 'Estado de inscripción', width: 19, group: 'academic' },
  { key: 'servicio', label: 'Servicio', width: 24, group: 'academic' },

  { key: 'huskyPassUsername', label: 'Usuario Husky Pass', width: 22, group: 'husky', default: true, sensitive: true },
  { key: 'huskyPassPlaintext', label: 'Contraseña Husky Pass', width: 22, group: 'husky', default: true, sensitive: true },
  { key: 'huskyPassEmail', label: 'Correo Husky Pass', width: 28, group: 'husky', sensitive: true },

  { key: 'fatherName', label: 'Padre / tutor', width: 30, group: 'family' },
  { key: 'telefonoPadre', label: 'Teléfono padre', width: 18, group: 'family' },
  { key: 'emailPadre', label: 'Correo padre', width: 28, group: 'family' },
  { key: 'motherName', label: 'Madre / tutora', width: 30, group: 'family' },
  { key: 'telefonoMadre', label: 'Teléfono madre', width: 18, group: 'family' },
  { key: 'emailMadre', label: 'Correo madre', width: 28, group: 'family' },
  { key: 'address', label: 'Domicilio', width: 36, group: 'family' },

  { key: 'tipoSangre', label: 'Tipo de sangre', width: 15, group: 'health' },
  { key: 'alergias', label: 'Alergias', width: 32, group: 'health' },
  { key: 'talla', label: 'Talla', width: 11, group: 'health' },
  { key: 'peso', label: 'Peso', width: 11, group: 'health' },

  { key: 'status', label: 'Estado', width: 14, group: 'administrative' },
  { key: 'baja', label: 'Baja', width: 10, group: 'administrative' },
  { key: 'motivoBaja', label: 'Motivo de baja', width: 34, group: 'administrative' },
  { key: 'categoriaBaja', label: 'Categoría de baja', width: 20, group: 'administrative' },
  { key: 'updatedAt', label: 'Última actualización', width: 22, group: 'administrative' },
]

export const CONTROL_ESCOLAR_REPORT_DEFAULT_FIELDS = CONTROL_ESCOLAR_REPORT_FIELDS
  .filter((field) => field.default)
  .map((field) => field.key)

export const CONTROL_ESCOLAR_REPORT_FIELD_KEYS = new Set(CONTROL_ESCOLAR_REPORT_FIELDS.map((field) => field.key))
