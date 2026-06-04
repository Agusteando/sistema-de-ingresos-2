Corrige mensajes de error en acción inversa de usuarios

Se ajusta la acción inversa global para construir el directorio completo directamente desde users, sin depender de paginación auxiliar, y se reemplaza el error genérico por diagnósticos específicos cuando no hay seleccionados, no existe directorio, los seleccionados no pertenecen al directorio o ya no queda un grupo inverso. También conserva el comportamiento global: los usuarios seleccionados reciben una acción y todos los demás usuarios institucionales reciben la acción inversa, ignorando filtros activos.
