export const numeroALetras = (num: number): string => {
  if (num === 0) return 'CERO'
  
  const unidades = ['', 'UN ', 'DOS ', 'TRES ', 'CUATRO ', 'CINCO ', 'SEIS ', 'SIETE ', 'OCHO ', 'NUEVE ']
  const decenas = ['DIEZ ', 'ONCE ', 'DOCE ', 'TRECE ', 'CATORCE ', 'QUINCE ', 'DIECISEIS ', 'DIECISIETE ', 'DIECIOCHO ', 'DIECINUEVE ', 'VEINTE ', 'TREINTA ', 'CUARENTA ', 'CINCUENTA ', 'SESENTA ', 'SETENTA ', 'OCHENTA ', 'NOVENTA ']
  const centenas = ['', 'CIENTO ', 'DOSCIENTOS ', 'TRESCIENTOS ', 'CUATROCIENTOS ', 'QUINIENTOS ', 'SEISCIENTOS ', 'SETECIENTOS ', 'OCHOCIENTOS ', 'NOVECIENTOS ']
  
  const getCentenas = (n: number) => {
      if (n === 100) return 'CIEN '
      return centenas[Math.floor(n / 100)] + getDecenas(n % 100)
  }
  
  const getDecenas = (n: number) => {
      if (n < 10) return unidades[n]
      if (n < 20) return decenas[n - 10]
      if (n === 20) return 'VEINTE '
      if (n < 30) return 'VEINTI' + unidades[n - 20]
      return decenas[Math.floor(n / 10) + 8] + (n % 10 > 0 ? 'Y ' + unidades[n % 10] : '')
  }
  
  const getMiles = (n: number) => {
      if (n === 0) return ''
      if (n === 1) return 'MIL '
      return getCentenas(n) + 'MIL '
  }
  
  const miles = Math.floor(num / 1000)
  const resto = num % 1000
  
  let result = getMiles(miles) + getCentenas(resto)
  const finalStr = result.trim() + (Math.floor(num) === 1 ? ' PESO' : ' PESOS')
  return finalStr.replace(/\s+/g, ' ')
}