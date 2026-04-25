export const GRADOS_NORMALIZADOS = ['primero', 'segundo', 'tercero', 'cuarto', 'quinto', 'sexto']

export const normalizeGrado = (grado: string) => {
  if (!grado) return 'primero'
  const g = String(grado).toLowerCase().trim()
  return GRADOS_NORMALIZADOS.includes(g) ? g : 'primero'
}

export const displayGrado = (grado: string) => {
  const g = normalizeGrado(grado)
  return g.charAt(0).toUpperCase() + g.slice(1)
}

export const calculatePromotedGrado = (gradoBase: string, nivelBase: string, cicloBase: string, selectedCiclo: string) => {
  const normalizedGrado = normalizeGrado(gradoBase)
  const defaultNivel = nivelBase ? (String(nivelBase).charAt(0).toUpperCase() + String(nivelBase).slice(1).toLowerCase()) : 'Primaria'
  
  if (!cicloBase || !selectedCiclo) {
    return { grado: normalizedGrado, nivel: defaultNivel }
  }

  const baseYear = parseInt(String(cicloBase).slice(0, 4), 10)
  const selectedYear = parseInt(String(selectedCiclo).slice(0, 4), 10)
  
  if (isNaN(baseYear) || isNaN(selectedYear)) {
    return { grado: normalizedGrado, nivel: defaultNivel }
  }

  let diff = selectedYear - baseYear
  if (diff === 0) return { grado: normalizedGrado, nivel: defaultNivel }

  const niveles = ['Preescolar', 'Primaria', 'Secundaria', 'Bachillerato']
  const maxGrados: Record<string, number> = {
    'Preescolar': 3,
    'Primaria': 6,
    'Secundaria': 3,
    'Bachillerato': 6
  }

  let nIndex = niveles.indexOf(defaultNivel)
  if (nIndex === -1) return { grado: normalizedGrado, nivel: defaultNivel }

  let gIndex = GRADOS_NORMALIZADOS.indexOf(normalizedGrado)

  if (diff > 0) {
    for (let i = 0; i < diff; i++) {
      gIndex++
      if (gIndex >= (maxGrados[niveles[nIndex]] || 6)) {
        gIndex = 0
        nIndex++
        if (nIndex >= niveles.length) {
          nIndex = niveles.length - 1
          gIndex = maxGrados[niveles[nIndex]] - 1
        }
      }
    }
  } else {
    for (let i = 0; i > diff; i--) {
      gIndex--
      if (gIndex < 0) {
        nIndex--
        if (nIndex < 0) {
          nIndex = 0
          gIndex = 0
        } else {
          gIndex = (maxGrados[niveles[nIndex]] || 6) - 1
        }
      }
    }
  }

  return {
    grado: GRADOS_NORMALIZADOS[gIndex],
    nivel: niveles[nIndex]
  }
}