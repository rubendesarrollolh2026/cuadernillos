/**
 * Motor de Imposición para Cuadernillos
 */
const ImpositionEngine = {
    /**
     * Calcula la secuencia de páginas para una firma (booklet)
     * @param {number} p - Tamaño de la firma (múltiplo de 4)
     * @returns {Array} Lista de objetos con la estructura de cada hoja
     */
    calculateImposition(p) {
        if (p % 4 !== 0) throw new Error("El tamaño de la firma debe ser múltiplo de 4");

        const sheetsCount = p / 4;
        const layout = [];

        for (let i = 1; i <= sheetsCount; i++) {
            // Anverso (Front)
            layout.push({
                sheet: i,
                side: 'anverso',
                left: p - 2 * (i - 1), // 1-based
                right: 2 * i - 1       // 1-based
            });

            // Reverso (Back)
            layout.push({
                sheet: i,
                side: 'reverso',
                left: 2 * i,           // 1-based
                right: p - 2 * i + 1   // 1-based
            });
        }

        return layout;
    }
};
