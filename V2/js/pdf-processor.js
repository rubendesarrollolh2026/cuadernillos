/**
 * Procesador de PDF Híbrido: pdf-lib (Generación) + pdf.js (Lectura Robusta y Recuperación)
 */
const PDFProcessor = {
    currentBuffer: null,
    pdfjsDoc: null,

    async loadPDF(arrayBuffer) {
        this.currentBuffer = arrayBuffer;
        try {
            // Intento de carga inicial con pdf-lib (para comprobar validez básica y cifrado real)
            const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

            // Carga paralela con pdf.js para motor de previsualización y recuperación
            // pdf.js es mucho más tolerante con errores de estructura como los de Locke
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            this.pdfjsDoc = await loadingTask.promise;

            return pdfDoc;
        } catch (error) {
            console.error("Error en carga inicial del documento:", error);
            if (error.message.includes('encrypted')) {
                throw new Error("El PDF está protegido por contraseña. Por razones de seguridad, no podemos procesar documentos cifrados.");
            }
            throw error;
        }
    },

    /**
     * Crea un cuadernillo aplicando la estrategia de recuperación automática página a página
     */
    async createBooklet(sourceDoc, startIndex, endIndex, signatureSize, flipMode = 'short') {
        const bookletDoc = await PDFLib.PDFDocument.create();
        const layout = ImpositionEngine.calculateImposition(signatureSize);
        const rotateReverse = (flipMode === 'long');

        let recoveredPagesCount = 0;

        for (const leaf of layout) {
            // Creamos hoja física A4 Landscape [841.89, 595.28]
            const newPage = bookletDoc.addPage([841.89, 595.28]);
            const { width, height } = newPage.getSize();
            const halfWidth = width / 2;

            // Índices absolutos en el documento original
            const leftIdx = startIndex + (leaf.left - 1);
            const rightIdx = startIndex + (leaf.right - 1);
            const isReverseSide = (leaf.side === 'reverso');

            // Procesar lado izquierdo
            const leftResult = await this.drawPageSideWithFallback(
                bookletDoc, sourceDoc, leftIdx, newPage,
                0, 0, halfWidth, height,
                rotateReverse && isReverseSide
            );
            if (leftResult.recovered) recoveredPagesCount++;

            // Procesar lado derecho
            const rightResult = await this.drawPageSideWithFallback(
                bookletDoc, sourceDoc, rightIdx, newPage,
                halfWidth, 0, halfWidth, height,
                rotateReverse && isReverseSide
            );
            if (rightResult.recovered) recoveredPagesCount++;
        }

        if (recoveredPagesCount > 0) {
            console.log(`Cuadernillo generado: ${recoveredPagesCount} páginas recuperadas mediante renderizado.`);
        }

        return bookletDoc;
    },

    /**
     * Estrategia de dibujo:
     * 1. Validación forzada: obliga a pdf-lib a leer el contenido real.
     * 2. Flujo A (Vectorial) si es válida.
     * 3. Flujo B (Rasterizado) si la validación falla (Locke case).
     */
    async drawPageSideWithFallback(targetDoc, sourceDoc, absoluteIdx, targetPage, x, y, width, height, shouldRotate) {
        const totalPages = sourceDoc.getPageCount();
        if (absoluteIdx < 0 || absoluteIdx >= totalPages) return { recovered: false };

        let vectorialValid = false;
        try {
            // PROBETA DE VALIDACIÓN:
            // Creamos un documento minúsculo e intentamos guardarlo con esta página.
            // Esto obliga a pdf-lib a ejecutar el descompresor Flate inmediatamente.
            const probeDoc = await PDFLib.PDFDocument.create();
            const [copiedPage] = await probeDoc.copyPages(sourceDoc, [absoluteIdx]);
            probeDoc.addPage(copiedPage);
            await probeDoc.save();
            vectorialValid = true;
        } catch (e) {
            // Si llega aquí, es que save() ha fallado por compresión/cifrado (ej. Locke)
            console.warn(`Página ${absoluteIdx + 1}: Error de estructura detectado preventivamente. Activando recuperación.`);
        }

        if (vectorialValid) {
            try {
                // --- FLUJO A: Intento Vectorial (Confirmado como seguro ahora) ---
                const [embeddedPage] = await targetDoc.embedPdf(sourceDoc, [absoluteIdx]);

                const scale = Math.min(width / embeddedPage.width, height / embeddedPage.height);
                const drawWidth = embeddedPage.width * scale;
                const drawHeight = embeddedPage.height * scale;
                const centeredX = x + (width - drawWidth) / 2;
                const centeredY = y + (height - drawHeight) / 2;

                targetPage.drawPage(embeddedPage, {
                    x: shouldRotate ? centeredX + drawWidth : centeredX,
                    y: shouldRotate ? centeredY + drawHeight : centeredY,
                    width: drawWidth,
                    height: drawHeight,
                    rotate: shouldRotate ? PDFLib.degrees(180) : PDFLib.degrees(0)
                });
                return { recovered: false };
            } catch (err) {
                // Fallback de seguridad adicional
                await this.drawPageRaster(targetDoc, absoluteIdx, targetPage, x, y, width, height, shouldRotate);
                return { recovered: true };
            }
        } else {
            // --- FLUJO B: Recuperación por Renderizado (Fallo preventivo detectado) ---
            await this.drawPageRaster(targetDoc, absoluteIdx, targetPage, x, y, width, height, shouldRotate);
            return { recovered: true };
        }
    },

    /**
     * Renderizado de alta fidelidad para impresión
     * Resolución: 3.0x (~216 DPI) - Equilibrio entre nitidez de texto y consumo de memoria
     */
    async drawPageRaster(targetDoc, absoluteIdx, targetPage, x, y, width, height, shouldRotate) {
        if (!this.pdfjsDoc) return;

        try {
            const page = await this.pdfjsDoc.getPage(absoluteIdx + 1);

            // Resolución 3.0x es excelente para lectura y suficiente para impresión láser/inkjet
            // Dimensiones aproximadas para A5: ~1260 x 1780 px
            const viewport = page.getViewport({ scale: 3.0 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d', { alpha: false });
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            // Fondo blanco obligatorio (pdf.js renderiza transparente si el PDF no define fondo)
            context.fillStyle = "white";
            context.fillRect(0, 0, canvas.width, canvas.height);

            // Renderizado real
            await page.render({ canvasContext: context, viewport: viewport }).promise;

            // JPEG 0.90: Alta calidad visual, mucho menor peso que PNG
            const imageData = canvas.toDataURL('image/jpeg', 0.90);
            const image = await targetDoc.embedJpg(imageData);

            const scale = Math.min(width / image.width, height / image.height);
            const drawWidth = image.width * scale;
            const drawHeight = image.height * scale;
            const centeredX = x + (width - drawWidth) / 2;
            const centeredY = y + (height - drawHeight) / 2;

            targetPage.drawImage(image, {
                x: shouldRotate ? centeredX + drawWidth : centeredX,
                y: shouldRotate ? centeredY + drawHeight : centeredY,
                width: drawWidth,
                height: drawHeight,
                rotate: shouldRotate ? PDFLib.degrees(180) : PDFLib.degrees(0)
            });

            // Liberación inmediata de memoria de imagen
            canvas.width = 0;
            canvas.height = 0;
        } catch (err) {
            console.error("Fallo crítico irrecuperable en página " + (absoluteIdx + 1), err);
        }
    },

    async generateBlob(pdfDoc) {
        const pdfBytes = await pdfDoc.save();
        return new Blob([pdfBytes], { type: 'application/pdf' });
    }
};
